/**
 * Large payload rules — derived from Study 09 (large-payload-detector.ts)
 *
 * Detects 2 anti-patterns using Babel AST traversal:
 *   payload/unbounded-query — findAll/findMany without field selection or a row limit
 *   payload/large-return    — returning unbounded query results directly from a function
 *
 * The first version of these rules matched on the method name alone, with
 * `find` in the list and nothing to corroborate it. That is the same mistake
 * the N+1 rule made in its first round: `Array.prototype.find(cb)`,
 * `Map.get()` and a plain object named `store` all match. Scanning this very
 * package reported `find() without field selection and a row limit` against an
 * in-memory array lookup.
 *
 * Both rules now go through the shared heuristics in `db-call-heuristics.ts`:
 * distinctive ORM method names are evidence on their own, ambiguous ones need
 * an ORM import, a query-builder chain, a database handle or a data-access
 * receiver before anything is reported.
 */

import traverse from '@babel/traverse';
import type { RuleDefinition, DiagnosticIssue } from '../types';
import {
  AMBIGUOUS_DB_METHODS,
  DISTINCTIVE_DB_METHODS,
  classifyDatabaseCall,
  collectDbContext,
  isDefinitelyNotADatabaseCall,
  type DbContext,
} from './db-call-heuristics';

const JS_PATTERNS = ['*.js', '*.ts', '*.jsx', '*.tsx', '*.mjs'];

/**
 * Finders that return a collection. A payload rule is about rows coming back,
 * so `findUnique` and friends are irrelevant here even though they are
 * database calls.
 */
const COLLECTION_FINDERS = new Set(['findAll', 'findMany', 'find', 'getMany', 'findAndCountAll']);

function snippetAt(code: string, line: number): string {
  return (code.split('\n')[line - 1] ?? '').trim().slice(0, 120);
}

function optionsHaveSelectAndLimit(optionsNode: any): { hasSelect: boolean; hasLimit: boolean } {
  let hasSelect = false;
  let hasLimit = false;
  if (!optionsNode) return { hasSelect, hasLimit };

  try {
    traverse(optionsNode, {
      noScope: true,
      ObjectProperty(inner: any) {
        const key = inner.node.key?.name;
        if (key === 'attributes' || key === 'select') hasSelect = true;
        if (key === 'limit' || key === 'take' || key === 'perPage') hasLimit = true;
      },
    });
  } catch {
    // ignore
  }
  return { hasSelect, hasLimit };
}

/**
 * True when this call is a database query returning a collection. Returns
 * false for anything that only looks like one by name.
 */
function isCollectionQuery(callExpr: any, method: string, ctx: DbContext, resultIsAwaited: boolean): boolean {
  if (!COLLECTION_FINDERS.has(method)) return false;
  if (!DISTINCTIVE_DB_METHODS.has(method) && !AMBIGUOUS_DB_METHODS.has(method)) return false;
  if (isDefinitelyNotADatabaseCall(callExpr, method, ctx)) return false;
  return classifyDatabaseCall(callExpr, method, ctx, resultIsAwaited) !== null;
}

const PROMISE_CONTEXT = new Set([
  'AwaitExpression', 'ReturnStatement', 'ArrowFunctionExpression',
  'ArrayExpression', 'CallExpression', 'YieldExpression',
]);

function detectPayloadIssues(filePath: string, content: string, ast: any): DiagnosticIssue[] {
  if (!ast) return [];
  const issues: DiagnosticIssue[] = [];

  try {
    const ctx = collectDbContext(ast);

    traverse(ast, {
      noScope: true,

      CallExpression(path: any) {
        const node = path.node;
        const methodName = node.callee?.property?.name;
        const loc = node.loc?.start;
        if (!loc || !methodName) return;

        // A ReturnStatement wrapping this call is handled by the ReturnStatement
        // visitor below (more specific "returning unbounded results" framing).
        if (path.parent?.type === 'ReturnStatement') return;

        const awaited = PROMISE_CONTEXT.has(path.parent?.type ?? '');
        if (!isCollectionQuery(node, methodName, ctx, awaited)) return;

        const { hasSelect, hasLimit } = optionsHaveSelectAndLimit(node.arguments?.[0]);
        if (hasSelect && hasLimit) return;

        const missing = [!hasSelect ? 'field selection' : null, !hasLimit ? 'a row limit' : null]
          .filter(Boolean)
          .join(' and ');

        issues.push({
          id: '', rule: 'payload/unbounded-query', category: 'payload', severity: 'medium',
          file: filePath, line: loc.line, column: loc.column,
          title: `${methodName}() without ${missing}`,
          description: `Database query selects all fields and/or rows without ${missing}. This can load unnecessary data and impact performance.`,
          snippet: snippetAt(content, loc.line),
          recommendation: 'Specify the required fields (select/attributes) and add pagination (limit/take).',
          studyReference: 'Study 09',
          confidence: 0.6,
        });
      },

      ReturnStatement(path: any) {
        const node = path.node;
        const loc = node.loc?.start;
        let argument = node.argument;
        if (argument?.type === 'AwaitExpression') argument = argument.argument;
        if (!loc || argument?.type !== 'CallExpression') return;

        const methodName = argument.callee?.property?.name;
        if (!methodName) return;
        if (!isCollectionQuery(argument, methodName, ctx, true)) return;

        const { hasLimit } = optionsHaveSelectAndLimit(argument.arguments?.[0]);
        if (hasLimit) return;

        issues.push({
          id: '', rule: 'payload/large-return', category: 'payload', severity: 'high',
          file: filePath, line: loc.line, column: loc.column,
          title: 'Returning unbounded database results',
          description: `Function returns '${methodName}()' results directly without pagination, which can cause large response payloads and memory pressure.`,
          snippet: snippetAt(content, loc.line),
          recommendation: 'Add pagination (limit/offset or cursor-based) before returning results.',
          studyReference: 'Study 09',
          confidence: 0.65,
        });
      },
    });
  } catch {
    // AST traversal failed — skip
  }

  return issues;
}

export const payloadRules: RuleDefinition[] = [
  {
    id: 'payload/unbounded-query', name: 'Unbounded Query', category: 'payload', severity: 'medium',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectPayloadIssues,
  },
  {
    id: 'payload/large-return', name: 'Large Return Payload', category: 'payload', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectPayloadIssues,
  },
];
