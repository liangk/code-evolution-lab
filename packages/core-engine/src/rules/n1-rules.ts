/**
 * N+1 query rule — ported from the study detector in
 * `backend/src/detectors/n1-query-detector.ts`.
 *
 * Detects 1 anti-pattern using Babel AST traversal:
 *   n1/query-in-loop — ORM/DB call made once per loop iteration instead of a batched query
 *
 * The naive version of this rule (any method name from a flat list, called
 * inside any loop) produced a 60.3% false-positive rate on three real
 * codebases and 88.6% across twenty more: `Map.get()`, `Array.find(cb)` and
 * `Promise.all()` were all being reported as database queries, while every
 * write-side N+1 — one `update`/`upsert`/`create` per item — was invisible
 * because the method list held only readers.
 *
 * Seven rounds of fixes against that corpus produced the structure below. The
 * half that answers "is this a database call at all" now lives in
 * `db-call-heuristics.ts`, shared with any other rule that needs it. What is
 * left here is the half about loops:
 *
 *   - A query in a nested loop belongs to the innermost loop that contains it,
 *     so one N+1 is not reported once per enclosing loop.
 *   - Retry and polling loops are skipped — their iterations are attempts at
 *     one operation, not items in a collection.
 *   - Pagination loops are skipped — one query per page of rows is the fix,
 *     not the bug.
 *   - Loops over pre-chunked batches are skipped, and so is a query whose
 *     filter consumes the whole iterated item (`where: { id: { in: batch } }`).
 *   - Bulk flushes (a write whose payload is a buffered array) are skipped.
 *   - Fallback chains that return on the first success are skipped.
 *   - Drivers that stage writes and commit once (Firestore, DynamoDB) are
 *     skipped for transaction/batch receivers.
 *
 * Changing any list or veto here — or in the shared module — changes published
 * study results. The reduced corpus cases are in
 * `__tests__/n1-rules.test.ts`; keep them in sync with the study repository.
 */

import traverse from '@babel/traverse';
import type { RuleDefinition, DiagnosticIssue, Severity } from '../types';
import {
  AMBIGUOUS_DB_METHODS,
  DISTINCTIVE_DB_METHODS,
  classifyDatabaseCall,
  collectDbContext,
  isDefinitelyNotADatabaseCall,
  rootIdentifierName,
  type DbContext,
} from './db-call-heuristics';

const JS_PATTERNS = ['*.js', '*.ts', '*.jsx', '*.tsx', '*.mjs'];

/** Helpers that split a collection into fixed-size batches. */
const BATCH_PRODUCERS = /^(chunk|chunked|chunks|batch|batched|batches|partition|paginate|splitIntoChunks|toChunks)$/i;

const STAGED_WRITE_DRIVER =
  /(firebase|firestore|@google-cloud\/firestore|dynamodb|@aws-sdk\/lib-dynamodb)/i;

type LoopKind = 'for-of' | 'for' | 'for-in' | 'while' | 'forEach';

interface LoopInfo {
  kind: LoopKind;
  start: number;
  end: number;
  line: number;
  column: number;
  /** Ranges that actually run once per iteration. */
  scanRanges: Array<[number, number]>;
  itemName: string | null;
  isBatch: boolean;
}

interface CandidateCall {
  node: any;
  method: string;
  start: number;
  end: number;
  promiseContext: boolean;
  fallbackChainExit: boolean;
}

interface FileFacts extends DbContext {
  /** Names holding pre-chunked batches, from chunk()/batched()/... */
  batchVars: Set<string>;
  /** True when the file uses a driver that stages writes and commits once. */
  hasStagedWriteDriver: boolean;
}

// ---------------------------------------------------------------------------
// Small AST helpers
// ---------------------------------------------------------------------------

function snippetAt(code: string, line: number): string {
  return (code.split('\n')[line - 1] ?? '').trim().slice(0, 120);
}

function hasRange(node: any): boolean {
  return typeof node?.start === 'number' && typeof node?.end === 'number';
}

/** True when any identifier inside `node` matches `pattern`. */
function mentionsIdentifier(node: any, pattern: RegExp): boolean {
  if (!node) return false;
  let found = false;
  const walk = (current: any, depth: number): void => {
    if (!current || typeof current !== 'object' || found || depth > 8) return;
    if (current.type === 'Identifier' && pattern.test(current.name)) { found = true; return; }
    for (const key of Object.keys(current)) {
      if (key === 'loc' || key.endsWith('Comments')) continue;
      const value = current[key];
      if (Array.isArray(value)) value.forEach(v => walk(v, depth + 1));
      else if (value && typeof value.type === 'string') walk(value, depth + 1);
    }
  };
  walk(node, 0);
  return found;
}

function containsPaginationArguments(node: any): boolean {
  const pagingKeys = new Set(['skip', 'take', 'offset', 'limit', 'cursor', 'lastId', 'after']);
  let found = false;
  const walk = (current: any, depth: number): void => {
    if (!current || typeof current !== 'object' || found || depth > 14) return;
    if (current.type === 'ObjectProperty' && current.key?.type === 'Identifier' && pagingKeys.has(current.key.name)) {
      found = true;
      return;
    }
    for (const key of Object.keys(current)) {
      if (key === 'loc' || key.endsWith('Comments')) continue;
      const value = current[key];
      if (Array.isArray(value)) value.forEach(v => walk(v, depth + 1));
      else if (value && typeof value.type === 'string') walk(value, depth + 1);
    }
  };
  walk(node, 0);
  return found;
}

// ---------------------------------------------------------------------------
// Pass A — file-level facts
// ---------------------------------------------------------------------------

function collectFileFacts(ast: any): FileFacts {
  const batchVars = new Set<string>();
  let hasStagedWriteDriver = false;

  traverse(ast, {
    noScope: true,

    ImportDeclaration(path: any) {
      if (STAGED_WRITE_DRIVER.test(path.node.source?.value ?? '')) hasStagedWriteDriver = true;
    },

    VariableDeclarator(path: any) {
      const id = path.node.id;
      let init = path.node.init;
      if (init?.type === 'AwaitExpression') init = init.argument;
      if (init?.type !== 'CallExpression') return;

      const fn = init.callee?.name || init.callee?.property?.name;
      if (id?.type === 'Identifier' && fn && BATCH_PRODUCERS.test(fn)) {
        batchVars.add(id.name);
      }

      if (init.callee?.name === 'require') {
        const arg = init.arguments?.[0];
        if (arg?.type === 'StringLiteral' && STAGED_WRITE_DRIVER.test(arg.value)) {
          hasStagedWriteDriver = true;
        }
      }
    },
  });

  return { ...collectDbContext(ast), batchVars, hasStagedWriteDriver };
}

// ---------------------------------------------------------------------------
// Pass B — loops
// ---------------------------------------------------------------------------

function iterationVariable(node: any, kind: LoopKind): string | null {
  if (kind === 'forEach') {
    const callback = (node.arguments ?? []).find(
      (a: any) => a?.type === 'ArrowFunctionExpression' || a?.type === 'FunctionExpression'
    );
    const first = callback?.params?.[0];
    return first?.type === 'Identifier' ? first.name : null;
  }
  const left = node.left;
  if (left?.type === 'VariableDeclaration') {
    const id = left.declarations?.[0]?.id;
    return id?.type === 'Identifier' ? id.name : null;
  }
  if (left?.type === 'Identifier') return left.name;
  return null;
}

/**
 * The parts of a loop that run once per iteration. Deliberately excludes the
 * expression being iterated: in `(await Model.findAll()).map(...)` the query
 * produces the collection, it does not run per item.
 */
function scanNodesOf(node: any, kind: LoopKind): any[] {
  if (kind === 'forEach') {
    return (node.arguments ?? []).filter(
      (arg: any) => arg?.type === 'ArrowFunctionExpression' || arg?.type === 'FunctionExpression'
    );
  }
  return node.body ? [node.body] : [];
}

/**
 * Loops that walk pre-chunked batches, paginate, retry, or poll are the cure
 * for N+1 rather than a case of it. Reporting them would mean telling people
 * to undo the optimisation they already made.
 */
function isBatchLoop(node: any, kind: LoopKind, batchVars: Set<string>): boolean {
  const iterable = kind === 'forEach' ? node.callee?.object : node.right;

  if (iterable) {
    if (iterable.type === 'Identifier' && batchVars.has(iterable.name)) return true;
    if (iterable.type === 'CallExpression') {
      const fnName = iterable.callee?.name || iterable.callee?.property?.name;
      if (fnName && BATCH_PRODUCERS.test(fnName)) return true;
    }
  }

  if ((kind === 'while' || kind === 'for') && containsPaginationArguments(node)) return true;

  // for (let i = 0; i < ids.length; i += PAGE_SIZE) — fixed-size windows.
  if (kind === 'for' && node.update?.type === 'AssignmentExpression' && node.update.operator === '+=') {
    const step = node.update.right;
    const isSingleStep = step?.type === 'NumericLiteral' && step.value === 1;
    if (!isSingleStep) return true;
  }

  // for (;;) / while (true): retry or polling, no collection being walked.
  if (kind === 'for' && !node.init && !node.test) return true;
  if (kind === 'while' && node.test?.type === 'BooleanLiteral' && node.test.value === true) return true;

  // Bounded retry loops — iterations are attempts at one operation.
  if (kind === 'while' || kind === 'for') {
    const RETRY_NAME = /retr(y|ies)|attempt/i;
    if (mentionsIdentifier(node.test, RETRY_NAME)) return true;
    if (mentionsIdentifier(node.init, RETRY_NAME)) return true;
  }

  // Flag-driven batch loops — `while (hasMore) { ...deleteMany... }`.
  if (kind === 'while' && mentionsIdentifier(node.test, /^(hasMore|hasNext|more|remaining|keepGoing|shouldContinue)$/i)) {
    return true;
  }

  return false;
}

function collectLoops(ast: any, batchVars: Set<string>): LoopInfo[] {
  const loops: LoopInfo[] = [];

  const push = (node: any, kind: LoopKind): void => {
    if (!hasRange(node)) return;
    const loc = node.loc?.start;
    if (!loc) return;
    loops.push({
      kind,
      start: node.start,
      end: node.end,
      line: loc.line,
      column: loc.column,
      scanRanges: scanNodesOf(node, kind)
        .filter(hasRange)
        .map((n: any) => [n.start, n.end] as [number, number]),
      itemName: iterationVariable(node, kind),
      isBatch: isBatchLoop(node, kind, batchVars),
    });
  };

  traverse(ast, {
    noScope: true,
    ForOfStatement: (path: any) => push(path.node, 'for-of'),
    ForStatement: (path: any) => push(path.node, 'for'),
    ForInStatement: (path: any) => push(path.node, 'for-in'),
    WhileStatement: (path: any) => push(path.node, 'while'),
    CallExpression: (path: any) => {
      const prop = path.node.callee?.property?.name;
      if (prop === 'forEach' || prop === 'map') push(path.node, 'forEach');
    },
  });

  return loops;
}

// ---------------------------------------------------------------------------
// Pass C — candidate calls
// ---------------------------------------------------------------------------

/** Parent node types that mean "this call's result is used as a promise". */
const PROMISE_CONTEXT = new Set([
  'AwaitExpression', 'ReturnStatement', 'ArrowFunctionExpression',
  'ArrayExpression', 'CallExpression', 'YieldExpression',
]);

/**
 * True when the query's result is thrown away and the loop returns straight
 * afterwards in the same block — a fallback chain, where iterations are
 * alternatives to try rather than items to process:
 *
 *     for (const candidate of candidates) {
 *       try {
 *         await client.connect()
 *         await client.query(`CREATE DATABASE ...`)
 *         return                       // first success wins
 *       } catch { lastError = error }
 *     }
 *
 * At most one iteration does any work, the iteration count is a fixed list of
 * alternatives rather than a data collection, and there is no batched form to
 * rewrite it into. Round 3 already skipped loops whose counters are named
 * `retry` or `attempt`; this catches the same shape when it is named after
 * what it iterates instead.
 *
 * Deliberately narrow: a query whose result is assigned is not covered, so an
 * early guard like `if (!user) return` inside a real N+1 still reports.
 */
function isFallbackChainExit(path: any): boolean {
  let p = path.parentPath;
  while (p?.node && ['AwaitExpression', 'TSNonNullExpression', 'TSAsExpression'].includes(p.node.type)) {
    p = p.parentPath;
  }
  if (p?.node?.type !== 'ExpressionStatement') return false;

  const block = p.parentPath?.node;
  if (!block || !Array.isArray(block.body)) return false;

  const index = block.body.indexOf(p.node);
  if (index < 0) return false;

  return block.body.slice(index + 1).some((s: any) => s?.type === 'ReturnStatement');
}

function collectCandidateCalls(ast: any): CandidateCall[] {
  const calls: CandidateCall[] = [];

  traverse(ast, {
    noScope: true,
    CallExpression(path: any) {
      const node = path.node;
      const method = node.callee?.property?.name;
      if (typeof method !== 'string') return;
      if (!DISTINCTIVE_DB_METHODS.has(method) && !AMBIGUOUS_DB_METHODS.has(method)) return;
      if (!hasRange(node)) return;
      calls.push({
        node,
        method,
        start: node.start,
        end: node.end,
        promiseContext: PROMISE_CONTEXT.has(path.parent?.type ?? ''),
        fallbackChainExit: isFallbackChainExit(path),
      });
    },
  });

  return calls;
}

// ---------------------------------------------------------------------------
// Loop-specific vetoes
// ---------------------------------------------------------------------------

/** `insertInto(t).values(buffer).execute()` or `createMany({ data: rows })`. */
function isBulkOperation(callExpr: any, collectionVars: Set<string>): boolean {
  const isCollectionArg = (arg: any): boolean => {
    if (!arg) return false;
    if (arg.type === 'Identifier') return collectionVars.has(arg.name);
    if (arg.type === 'ArrayExpression') return true;
    if (arg.type === 'SpreadElement') return true;
    if (arg.type === 'ObjectExpression') {
      return arg.properties.some(
        (prop: any) => prop.type === 'ObjectProperty' && prop.key?.name === 'data' && isCollectionArg(prop.value)
      );
    }
    return false;
  };

  if ((callExpr.arguments ?? []).some(isCollectionArg)) return true;

  let current: any = callExpr.callee;
  let depth = 0;
  while (current && depth < 12) {
    depth++;
    if (current.type === 'CallExpression') {
      const method = current.callee?.property?.name;
      if (method && ['values', 'insert', 'addValues', 'createMany'].includes(method)) {
        if ((current.arguments ?? []).some(isCollectionArg)) return true;
      }
      current = current.callee;
    } else if (current.type === 'MemberExpression') {
      current = current.object;
    } else {
      break;
    }
  }

  return false;
}

/**
 * True when the query consumes the whole iterated item as a set, as in
 * `where: { id: { in: batch } }` — one query per batch of rows, which is the
 * batching we would recommend rather than a query per row.
 */
function queryConsumesWholeItem(callExpr: any, itemName: string | null): boolean {
  if (!itemName) return false;
  let found = false;

  const isItem = (node: any): boolean => node?.type === 'Identifier' && node.name === itemName;

  const referencesItem = (node: any, depth: number): boolean => {
    if (!node || typeof node !== 'object' || depth > 4) return false;
    if (isItem(node)) return true;
    if (node.type === 'SpreadElement') return referencesItem(node.argument, depth + 1);
    if (node.type === 'ArrayExpression') return node.elements.some((e: any) => referencesItem(e, depth + 1));
    if (node.type === 'CallExpression') {
      return node.callee?.type === 'MemberExpression' && isItem(node.callee.object);
    }
    return false;
  };

  const walk = (node: any, depth: number): void => {
    if (!node || typeof node !== 'object' || found || depth > 12) return;
    if (
      node.type === 'ObjectProperty' &&
      node.key?.type === 'Identifier' &&
      (node.key.name === 'in' || node.key.name === 'notIn' || node.key.name === 'hasSome') &&
      referencesItem(node.value, 0)
    ) {
      found = true;
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key.endsWith('Comments')) continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(v => walk(v, depth + 1));
      else if (value && typeof value.type === 'string') walk(value, depth + 1);
    }
  };

  (callExpr.arguments ?? []).forEach((arg: any) => walk(arg, 0));
  return found;
}

/**
 * Firestore and friends stage writes on a transaction/batch object and commit
 * once, so `transaction.delete(ref)` is not a round trip per item. The
 * receiver name alone is therefore not evidence for those files.
 */
function classifyForLoop(call: CandidateCall, facts: FileFacts): string | null {
  const rootName = rootIdentifierName(call.node.callee?.object);
  const isStagedWrite = rootName === 'transaction' || rootName === 'tx' || rootName === 'batch';
  const allowDbHandle = !(facts.hasStagedWriteDriver && isStagedWrite);
  return classifyDatabaseCall(call.node, call.method, facts, call.promiseContext, allowDbHandle);
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

function severityFor(queryCount: number): Severity {
  if (queryCount >= 3) return 'critical';
  if (queryCount >= 2) return 'high';
  return 'medium';
}

function detectN1Issues(filePath: string, content: string, ast: any): DiagnosticIssue[] {
  if (!ast) return [];

  try {
    const facts = collectFileFacts(ast);
    const loops = collectLoops(ast, facts.batchVars);
    if (loops.length === 0) return [];

    const candidates = collectCandidateCalls(ast);
    const byLoop = new Map<LoopInfo, string[]>();

    for (const call of candidates) {
      // Attribute the call to the innermost loop whose per-iteration body
      // contains it. Without this, one N+1 is reported once per enclosing
      // loop. Skipped batch loops still own their calls, so a query inside a
      // pagination loop is not pushed up to the loop around it.
      let owner: LoopInfo | null = null;
      for (const loop of loops) {
        const inside = loop.scanRanges.some(([s, e]) => call.start >= s && call.end <= e);
        if (!inside) continue;
        if (!owner || loop.start > owner.start) owner = loop;
      }
      if (!owner || owner.isBatch) continue;

      if (call.fallbackChainExit) continue;
      if (isDefinitelyNotADatabaseCall(call.node, call.method, facts)) continue;
      if (isBulkOperation(call.node, facts.collectionVars)) continue;
      if (queryConsumesWholeItem(call.node, owner.itemName)) continue;

      const orm = classifyForLoop(call, facts);
      if (!orm) continue;

      const list = byLoop.get(owner);
      if (list) list.push(`${orm}.${call.method}()`);
      else byLoop.set(owner, [`${orm}.${call.method}()`]);
    }

    const issues: DiagnosticIssue[] = [];
    for (const [loop, queries] of byLoop) {
      const severity = severityFor(queries.length);
      const queriesIfN100 = queries.length * 100 + 1;
      issues.push({
        id: '', rule: 'n1/query-in-loop', category: 'n1', severity,
        file: filePath, line: loop.line, column: loop.column,
        title: 'N+1 query in loop',
        description:
          `Found ${queries.length} database ${queries.length === 1 ? 'query' : 'queries'} ` +
          `(${queries.join(', ')}) inside a ${loop.kind} loop. This creates an N+1 query problem ` +
          `where each iteration makes a separate database call. This makes ${queriesIfN100} queries ` +
          `for 100 items instead of 1 batched query.`,
        snippet: snippetAt(content, loop.line),
        // The whole loop, so a solution generator can preserve its structure
        // and variable names when rewriting it as a batched query.
        codeBefore: content.slice(loop.start, loop.end),
        recommendation:
          'Batch the lookup before the loop (e.g. findMany/findAll with an `in` filter) or use eager loading / includes.',
        studyReference: 'Study 01',
        empiricalSpeedup: '98\u00d7 at 1,000 items on a 5ms round trip',
        confidence: 0.85,
      });
    }

    return issues;
  } catch {
    // AST traversal failed — skip
    return [];
  }
}

export const n1Rules: RuleDefinition[] = [
  {
    id: 'n1/query-in-loop', name: 'N+1 Query in Loop', category: 'n1', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectN1Issues,
  },
];
