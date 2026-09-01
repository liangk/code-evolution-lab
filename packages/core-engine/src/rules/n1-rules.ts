/**
 * N+1 query rule — derived from Study 01 (n1-query-detector.ts)
 *
 * Detects 1 anti-pattern using Babel AST traversal:
 *   n1/query-in-loop — ORM/DB call made once per loop iteration instead of a batched query
 */

import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { RuleDefinition, DiagnosticIssue } from '../types';

const JS_PATTERNS = ['*.js', '*.ts', '*.jsx', '*.tsx', '*.mjs'];
const LOOP_TYPES = new Set(['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement']);
const LOOP_METHODS = new Set(['forEach', 'map']);

const DB_METHODS = new Set([
  'findOne', 'findAll', 'findByPk', 'findAndCountAll',
  'findUnique', 'findMany', 'findFirst',
  'find', 'findById', 'findByIdAndUpdate',
  'query', 'execute',
]);

function snippetAt(code: string, line: number): string {
  return (code.split('\n')[line - 1] ?? '').trim().slice(0, 120);
}

function isLoopNode(node: any): boolean {
  if (!node) return false;
  if (LOOP_TYPES.has(node.type)) return true;
  if (node.type === 'CallExpression' && t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
    return LOOP_METHODS.has(node.callee.property.name);
  }
  return false;
}

function detectN1Issues(filePath: string, content: string, ast: any): DiagnosticIssue[] {
  if (!ast) return [];
  const issues: DiagnosticIssue[] = [];

  try {
    traverse(ast, {
      noScope: true,

      enter(path: any) {
        if (!isLoopNode(path.node)) return;
        const loopLoc = path.node.loc?.start;
        if (!loopLoc) return;

        const dbCalls: string[] = [];
        traverse(path.node, {
          noScope: true,
          CallExpression(inner: any) {
            // Don't descend into a nested loop — that loop reports its own finding.
            if (inner.node !== path.node && isLoopNode(inner.node)) {
              inner.skip();
              return;
            }
            const callee = inner.node.callee;
            if (!t.isMemberExpression(callee) || !t.isIdentifier(callee.property)) return;
            if (DB_METHODS.has(callee.property.name)) {
              dbCalls.push(callee.property.name);
            }
          },
        });

        if (dbCalls.length === 0) return;

        const severity: DiagnosticIssue['severity'] = dbCalls.length >= 3 ? 'critical' : dbCalls.length >= 2 ? 'high' : 'medium';
        const queriesAt100 = dbCalls.length * 100 + 1;

        issues.push({
          id: '', rule: 'n1/query-in-loop', category: 'n1', severity,
          file: filePath, line: loopLoc.line, column: loopLoc.column,
          title: 'N+1 query in loop',
          description: `Found ${dbCalls.length} database ${dbCalls.length === 1 ? 'call' : 'calls'} (${[...new Set(dbCalls)].join(', ')}) inside a loop. This makes ${queriesAt100} queries for 100 items instead of 1 batched query.`,
          snippet: snippetAt(content, loopLoc.line),
          recommendation: 'Batch the lookup before the loop (e.g. findMany/findAll with an `in` filter) or use eager loading / includes.',
          studyReference: 'Study 01',
          empiricalSpeedup: '10\u2013100\u00d7 slower at 100K rows',
          confidence: 0.8,
        });
      },
    });
  } catch {
    // AST traversal failed — skip
  }

  return issues;
}

export const n1Rules: RuleDefinition[] = [
  {
    id: 'n1/query-in-loop', name: 'N+1 Query in Loop', category: 'n1', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectN1Issues,
  },
];
