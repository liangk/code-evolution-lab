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
 * Seven rounds of fixes against that corpus produced the structure below:
 *
 *   1. Method names are split into DISTINCTIVE (evidence on their own; no
 *      Map, Set, Array or Promise has them) and AMBIGUOUS (only reported when
 *      something else corroborates: an ORM import, a query-builder chain, a
 *      known database handle, or a data-access receiver).
 *   2. A query in a nested loop belongs to the innermost loop that contains
 *      it, so one N+1 is not reported once per enclosing loop.
 *   3. Retry and polling loops are skipped — their iterations are attempts at
 *      one operation, not items in a collection.
 *   4. Pagination loops are skipped — one query per page of rows is the fix,
 *      not the bug.
 *   5. Loops over pre-chunked batches are skipped, and so is a query whose
 *      filter consumes the whole iterated item (`where: { id: { in: batch } }`).
 *   6. Bulk flushes (a write whose payload is a buffered array) are skipped.
 *   7. Drivers that stage writes and commit once (Firestore, DynamoDB) are
 *      skipped for transaction/batch receivers.
 *
 * Changing any list or veto here changes published study results. The reduced
 * corpus cases live in the study repository; keep them in sync.
 */

import traverse from '@babel/traverse';
import type { RuleDefinition, DiagnosticIssue, Severity } from '../types';

const JS_PATTERNS = ['*.js', '*.ts', '*.jsx', '*.tsx', '*.mjs'];

/**
 * Method names specific enough to ORMs that seeing one is strong evidence on
 * its own. None of these exist on Map, Set, Array, or Promise.
 */
const DISTINCTIVE_DB_METHODS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findMany', 'findFirst', 'findFirstOrThrow',
  'findOne',
  'findByPk', 'findAll', 'findAndCountAll', 'findOrCreate',
  'findById', 'findByIdAndUpdate', 'findByIdAndDelete',
  'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
  'executeTakeFirst', 'executeTakeFirstOrThrow',
  'createMany', 'updateMany', 'deleteMany', 'bulkCreate',
  'upsert', 'aggregate', 'groupBy',
]);

/**
 * Method names ORMs use that collide constantly with ordinary JavaScript. A
 * match on one of these is only reported when something else confirms it.
 */
const AMBIGUOUS_DB_METHODS = new Set([
  'find', 'get', 'all', 'run', 'query', 'execute', 'exec', 'raw',
  'create', 'update', 'delete', 'destroy', 'save', 'insert', 'count',
]);

/** Array/iterable methods whose first argument is a callback. */
const CALLBACK_FIRST_METHODS = new Set([
  'find', 'findIndex', 'findLast', 'findLastIndex', 'filter', 'some', 'every',
  'map', 'forEach', 'flatMap', 'reduce', 'sort',
]);

/** Receivers that are never a database handle. */
const NON_DB_RECEIVERS = new Set([
  'Promise', 'Object', 'JSON', 'Math', 'Array', 'Number', 'String', 'Boolean',
  'Reflect', 'Symbol', 'Date', 'RegExp', 'Set', 'Map', 'WeakMap', 'WeakSet',
  'console', 'process', 'crypto', 'localStorage', 'sessionStorage',
  'res', 'req', 'request', 'response', 'headers', 'searchParams', 'params',
  'cookies', 'logger', 'log', 'config', 'env', 'i18n', 'router',
  'redis', 'cache', 'memcached', 'kv', 'socket', 'socketio', 'io', 'emitter',
]);

/** Receiver names that identify a database handle or ORM client. */
const DB_HANDLE_NAMES = new Map<string, string>([
  ['prisma', 'Prisma'],
  ['prismaClient', 'Prisma'],
  ['knex', 'Knex'],
  ['sequelize', 'Sequelize'],
  ['mongoose', 'Mongoose'],
  ['kysely', 'SQL Builder'],
  ['db', 'Database'],
  ['database', 'Database'],
  ['orm', 'Database'],
  ['tx', 'Database'],
  ['trx', 'Database'],
  ['transaction', 'Database'],
  ['pg', 'Raw SQL'],
  ['sql', 'Raw SQL'],
  ['datasource', 'Database'],
  ['dataSource', 'Database'],
  ['em', 'TypeORM'],
  ['entityManager', 'TypeORM'],
  ['queryRunner', 'TypeORM'],
  ['models', 'Database'],
]);

/** Receiver names that identify a data-access layer wrapping the database. */
const DATA_ACCESS_RECEIVER = /(repository|repositories|repo|dao|store|model)s?$/i;

/** Variable names that almost always hold an in-memory collection. */
const COLLECTION_NAME_HINT = /(map|set|cache|registry|lookup|index|dict|counts|byId|byKey|byName|byType)$/i;

/** Query-builder methods that mark a chain as SQL, not a plain method call. */
const SQL_BUILDER_METHODS = new Set([
  'selectFrom', 'insertInto', 'updateTable', 'deleteFrom', 'selectAll',
  'createQueryBuilder', 'getMany', 'getOne', 'getRawMany', 'getRawOne',
  'innerJoin', 'leftJoin', 'returningAll', 'from', 'into',
]);

/** Helpers that split a collection into fixed-size batches. */
const BATCH_PRODUCERS = /^(chunk|chunked|chunks|batch|batched|batches|partition|paginate|splitIntoChunks|toChunks)$/i;

const SQL_KEYWORD =
  /\b(select|insert\s+into|update\s+\w|delete\s+from|with\s+\w+\s+as|truncate|(drop|create|alter)\s+(table|index|publication|schema|database|view|subscription))\b/i;

/** Packages whose imported bindings identify an ORM. */
const ORM_PACKAGES: Array<[RegExp, string]> = [
  [/^@prisma\/client$|^\.prisma\//, 'Prisma'],
  [/^sequelize($|\/)/, 'Sequelize'],
  [/^mongoose$/, 'Mongoose'],
  [/^typeorm($|\/)/, 'TypeORM'],
  [/^knex$/, 'Knex'],
  [/^kysely($|\/)/, 'SQL Builder'],
  [/^(pg|mysql|mysql2|postgres|better-sqlite3|sqlite3)$/, 'Raw SQL'],
];

const STAGED_WRITE_DRIVER =
  /(firebase|firestore|@google-cloud\/firestore|dynamodb|@aws-sdk\/lib-dynamodb)/i;

type LoopKind = 'for-of' | 'for' | 'for-in' | 'while' | 'forEach';

interface LoopInfo {
  kind: LoopKind;
  node: any;
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

interface FileFacts {
  collectionVars: Set<string>;
  batchVars: Set<string>;
  ormBindings: Map<string, string>;
  detectedORMs: Set<string>;
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

/** `foo.bar.baz()` -> "foo"; `this.userRepo.get()` -> "userRepo". */
function rootIdentifierName(node: any): string | null {
  let current = node;
  let depth = 0;
  while (current && depth < 12) {
    depth++;
    if (current.type === 'Identifier') return current.name;
    if (current.type === 'ThisExpression') return null;
    if (current.type === 'MemberExpression') {
      if (current.object?.type === 'ThisExpression') {
        return current.property?.type === 'Identifier' ? current.property.name : null;
      }
      current = current.object;
    } else if (current.type === 'CallExpression') {
      current = current.callee;
    } else if (current.type === 'TSNonNullExpression' || current.type === 'TSAsExpression') {
      current = current.expression;
    } else {
      return null;
    }
  }
  return null;
}

/** The immediate receiver name: `this.userRepository.get()` -> "userRepository". */
function receiverName(node: any): string | null {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'TSNonNullExpression' || node.type === 'TSAsExpression') {
    return receiverName(node.expression);
  }
  if (node.type === 'MemberExpression' && node.property?.type === 'Identifier') {
    return node.property.name;
  }
  return null;
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

/** The literal text of a string expression, including templates and `'a' + b`. */
function flattenStringLiteral(node: any, depth = 0): string {
  if (!node || depth > 8) return '';
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral') {
    return node.quasis.map((q: any) => q.value?.raw ?? '').join(' ');
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    return flattenStringLiteral(node.left, depth + 1) + ' ' + flattenStringLiteral(node.right, depth + 1);
  }
  return '';
}

// ---------------------------------------------------------------------------
// Pass A — file-level facts
// ---------------------------------------------------------------------------

function collectFileFacts(ast: any): FileFacts {
  const collectionVars = new Set<string>();
  const batchVars = new Set<string>();
  const ormBindings = new Map<string, string>();
  const detectedORMs = new Set<string>();
  let hasStagedWriteDriver = false;

  const arrayProducing = new Set([
    'map', 'filter', 'slice', 'concat', 'split', 'flat', 'flatMap',
    'sort', 'reverse', 'keys', 'values', 'entries', 'from', 'chunk',
  ]);
  const collectionConstructors = new Set(['Map', 'Set', 'WeakMap', 'WeakSet']);

  const isCollectionInit = (init: any): boolean => {
    if (!init) return false;
    if (init.type === 'NewExpression') {
      return init.callee?.type === 'Identifier' && collectionConstructors.has(init.callee.name);
    }
    if (init.type === 'ArrayExpression') return true;
    if (init.type === 'CallExpression') {
      const method = init.callee?.property?.name;
      if (method && arrayProducing.has(method)) return true;
      const objectName = init.callee?.object?.name;
      if ((objectName === 'Object' || objectName === 'Array') && method) return true;
    }
    if (init.type === 'TSAsExpression' || init.type === 'TSNonNullExpression') {
      return isCollectionInit(init.expression);
    }
    return false;
  };

  const ormFor = (source: string): string | null => {
    for (const [pattern, label] of ORM_PACKAGES) {
      if (pattern.test(source)) return label;
    }
    return null;
  };

  traverse(ast, {
    noScope: true,

    ImportDeclaration(path: any) {
      const source = path.node.source?.value ?? '';
      if (STAGED_WRITE_DRIVER.test(source)) hasStagedWriteDriver = true;
      const label = ormFor(source);
      if (!label) return;
      detectedORMs.add(label);
      for (const spec of path.node.specifiers ?? []) {
        if (spec.local?.type === 'Identifier') ormBindings.set(spec.local.name, label);
      }
    },

    VariableDeclarator(path: any) {
      const id = path.node.id;
      let init = path.node.init;

      if (id?.type === 'Identifier' && isCollectionInit(init)) {
        collectionVars.add(id.name);
      }

      if (init?.type === 'AwaitExpression') init = init.argument;
      if (init?.type === 'CallExpression') {
        const fn = init.callee?.name || init.callee?.property?.name;
        if (id?.type === 'Identifier' && fn && BATCH_PRODUCERS.test(fn)) {
          batchVars.add(id.name);
        }
        // const prisma = new PrismaClient() / require('mongoose')
        if (init.callee?.name === 'require') {
          const arg = init.arguments?.[0];
          if (arg?.type === 'StringLiteral') {
            if (STAGED_WRITE_DRIVER.test(arg.value)) hasStagedWriteDriver = true;
            const label = ormFor(arg.value);
            if (label) {
              detectedORMs.add(label);
              if (id?.type === 'Identifier') ormBindings.set(id.name, label);
            }
          }
        }
      }
    },

    ClassProperty(path: any) {
      if (path.node.key?.type === 'Identifier' && isCollectionInit(path.node.value)) {
        collectionVars.add(path.node.key.name);
      }
    },

    AssignmentExpression(path: any) {
      const left = path.node.left;
      if (
        left?.type === 'MemberExpression' &&
        left.object?.type === 'ThisExpression' &&
        left.property?.type === 'Identifier' &&
        isCollectionInit(path.node.right)
      ) {
        collectionVars.add(left.property.name);
      }
    },
  });

  return { collectionVars, batchVars, ormBindings, detectedORMs, hasStagedWriteDriver };
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

  if (kind === 'while' || kind === 'for') {
    if (containsPaginationArguments(node)) return true;
  }

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
      node,
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
// Vetoes and classification
// ---------------------------------------------------------------------------

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
 * Hard vetoes — calls that look like queries by name but demonstrably are
 * not. In the study corpus these accounted for most of the false positives.
 */
function isNotADatabaseCall(callExpr: any, method: string, facts: FileFacts): boolean {
  const receiver = callExpr.callee.object;

  // Promise.all(...), Object.keys(...), res.get(...) etc.
  const rootName = rootIdentifierName(receiver);
  if (rootName && NON_DB_RECEIVERS.has(rootName)) return true;

  // Array.prototype.find(cb) / .some(cb): an ORM finder never takes a
  // callback as its first argument — it takes a filter object or an id.
  if (CALLBACK_FIRST_METHODS.has(method)) {
    const firstArg = callExpr.arguments?.[0];
    if (firstArg && (firstArg.type === 'ArrowFunctionExpression' || firstArg.type === 'FunctionExpression')) {
      return true;
    }
  }

  // The receiver is a variable this file initialised with new Map()/[]/.map().
  const recvName = receiverName(receiver);
  if (recvName && facts.collectionVars.has(recvName)) return true;

  // someMap.get(k) / countsByKey.set(k, v) — name-shaped in-memory lookups.
  if (recvName && COLLECTION_NAME_HINT.test(recvName)) {
    if (['get', 'set', 'has', 'delete', 'keys', 'values', 'find'].includes(method)) return true;
  }

  // A write whose payload is a whole buffered array is a bulk flush.
  if (isBulkOperation(callExpr, facts.collectionVars)) return true;

  return false;
}

/** True for chains like `tx.deleteFrom('x').where(...).execute()`. */
function isQueryBuilderChain(callExpr: any): boolean {
  let current: any = callExpr.callee;
  let depth = 0;
  while (current && depth < 12) {
    depth++;
    if (current.type === 'MemberExpression') {
      const method = current.property?.name;
      if (method && SQL_BUILDER_METHODS.has(method)) return true;
      current = current.object;
    } else if (current.type === 'CallExpression') {
      const method = current.callee?.property?.name;
      if (method && SQL_BUILDER_METHODS.has(method)) return true;
      current = current.callee;
    } else {
      break;
    }
  }
  return false;
}

function ormByMethodName(method: string): string {
  if (['findOne', 'findAll', 'findByPk', 'findAndCountAll', 'findOrCreate', 'bulkCreate'].includes(method)) {
    return 'Sequelize';
  }
  if (['findUnique', 'findUniqueOrThrow', 'findMany', 'findFirst', 'findFirstOrThrow',
       'createMany', 'updateMany', 'deleteMany', 'upsert', 'groupBy'].includes(method)) {
    return 'Prisma';
  }
  if (['find', 'findById', 'findByIdAndUpdate', 'findByIdAndDelete',
       'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace'].includes(method)) {
    return 'Mongoose';
  }
  if (['executeTakeFirst', 'executeTakeFirstOrThrow'].includes(method)) return 'SQL Builder';
  if (['query', 'execute', 'exec', 'raw'].includes(method)) return 'Raw SQL';
  return 'Database';
}

/**
 * Positive identification. Returns the ORM/driver label, or null when there
 * is not enough evidence that this call reaches a database. Staying quiet
 * beats another false positive.
 */
function classifyDatabaseCall(call: CandidateCall, facts: FileFacts): string | null {
  const { node: callExpr, method } = call;

  // 1. The receiver traces back to an imported ORM binding.
  const rootName = rootIdentifierName(callExpr.callee.object);
  if (rootName && facts.ormBindings.has(rootName)) {
    return facts.ormBindings.get(rootName)!;
  }

  // 2. A SQL query-builder chain: tx.deleteFrom(...).where(...).execute()
  if (isQueryBuilderChain(callExpr)) return 'SQL Builder';

  // 3. A raw SQL string passed to query()/raw()/execute().
  if (['query', 'raw', 'execute', 'exec'].includes(method)) {
    const firstArg = callExpr.arguments?.[0];
    if (firstArg && SQL_KEYWORD.test(flattenStringLiteral(firstArg))) return 'Raw SQL';
  }

  // 4. The receiver is a recognised database handle: prisma.*, db.*, tx.*
  if (rootName && DB_HANDLE_NAMES.has(rootName)) {
    // Firestore and friends stage writes on a transaction/batch object and
    // commit once, so `transaction.delete(ref)` is not a round trip per item.
    const isStagedWrite = rootName === 'transaction' || rootName === 'tx' || rootName === 'batch';
    if (!(facts.hasStagedWriteDriver && isStagedWrite)) {
      return DB_HANDLE_NAMES.get(rootName)!;
    }
  }

  // 5. The receiver is a data-access object: userRepository.get(id). Only
  // when the result is awaited or returned — a plain Map that happens to be
  // called `repositories` is not a data-access layer.
  const recvName = receiverName(callExpr.callee.object);
  if (recvName && DATA_ACCESS_RECEIVER.test(recvName)) {
    if (DISTINCTIVE_DB_METHODS.has(method) || call.promiseContext) return 'Repository';
  }

  // 6. A method name that only ORMs use is evidence by itself.
  if (DISTINCTIVE_DB_METHODS.has(method)) return ormByMethodName(method);

  // 7. An ambiguous method name, but this file imports the matching ORM.
  if (facts.detectedORMs.size > 0) {
    const fallback = ormByMethodName(method);
    if (facts.detectedORMs.has(fallback)) return fallback;
  }

  return null;
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
      if (isNotADatabaseCall(call.node, call.method, facts)) continue;
      if (queryConsumesWholeItem(call.node, owner.itemName)) continue;

      const orm = classifyDatabaseCall(call, facts);
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
