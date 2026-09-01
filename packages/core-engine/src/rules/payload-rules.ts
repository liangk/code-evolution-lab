/**
 * Large payload rules — derived from Study 09 (large-payload-detector.ts)
 *
 * Detects 2 anti-patterns using Babel AST traversal:
 *   payload/unbounded-query — findAll/findMany without field selection or a row limit
 *   payload/large-return    — returning unbounded query results directly from a function
 */

import traverse from '@babel/traverse';
import type { RuleDefinition, DiagnosticIssue } from '../types';

const JS_PATTERNS = ['*.js', '*.ts', '*.jsx', '*.tsx', '*.mjs'];
const DB_METHODS = new Set(['findAll', 'findMany', 'find']);

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

function detectPayloadIssues(filePath: string, content: string, ast: any): DiagnosticIssue[] {
  if (!ast) return [];
  const issues: DiagnosticIssue[] = [];

  try {
    traverse(ast, {
      noScope: true,

      CallExpression(path: any) {
        const node = path.node;
        const methodName = node.callee?.property?.name;
        const loc = node.loc?.start;
        if (!loc || !methodName || !DB_METHODS.has(methodName)) return;

        // A ReturnStatement wrapping this call is handled by the ReturnStatement
        // visitor below (more specific "returning unbounded results" framing).
        if (path.parent?.type === 'ReturnStatement') return;

        const { hasSelect, hasLimit } = optionsHaveSelectAndLimit(node.arguments?.[0]);
        if (hasSelect && hasLimit) return;

        const missing = [!hasSelect ? 'field selection' : null, !hasLimit ? 'a row limit' : null].filter(Boolean).join(' and ');
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
        const argument = node.argument;
        if (!loc || argument?.type !== 'CallExpression') return;

        const methodName = argument.callee?.property?.name;
        if (!methodName || !DB_METHODS.has(methodName)) return;

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
