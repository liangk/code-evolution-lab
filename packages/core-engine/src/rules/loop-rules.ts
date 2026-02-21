/**
 * Loop performance rules — derived from Study 04 (js-loop-detector.ts)
 *
 * Detects 6 anti-patterns using Babel AST traversal:
 *   loop/regex-in-loop         — regex compiled inside loop body
 *   loop/json-parse-in-loop    — JSON.parse repeated in loop
 *   loop/sequential-await      — await inside loop instead of Promise.all
 *   loop/nested-loops          — O(n²) nested loops
 *   loop/nested-array-methods  — nested forEach/map at depth ≥ 2
 *   loop/chained-array-methods — filter().map() two-pass chain
 */

import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { RuleDefinition, DiagnosticIssue } from '../types';

const ARRAY_METHODS = new Set(['forEach', 'map', 'filter', 'reduce', 'find', 'findIndex', 'some', 'every', 'flatMap']);
const CHAINING_SOURCE = new Set(['filter', 'map']);
const CHAINING_TARGET = new Set(['map', 'filter', 'reduce', 'forEach']);
const JS_PATTERNS = ['*.js', '*.ts', '*.jsx', '*.tsx', '*.mjs'];

function snippetAt(code: string, line: number): string {
  return (code.split('\n')[line - 1] ?? '').trim().slice(0, 120);
}

function isInsideLoop(path: any): boolean {
  let p = path.parentPath;
  while (p?.node) {
    const type = p.node.type ?? '';
    if (['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement'].includes(type)) return true;
    if (type === 'CallExpression') {
      const callee = p.node.callee;
      if (t.isMemberExpression(callee) && t.isIdentifier(callee.property) && ARRAY_METHODS.has(callee.property.name)) return true;
    }
    p = p.parentPath;
  }
  return false;
}

function countLoopDepth(path: any): number {
  let depth = 0;
  let p = path.parentPath;
  while (p?.node) {
    const type = p.node.type ?? '';
    if (['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement'].includes(type)) depth++;
    if (type === 'CallExpression') {
      const callee = p.node.callee;
      if (t.isMemberExpression(callee) && t.isIdentifier(callee.property) && ARRAY_METHODS.has(callee.property.name)) depth++;
    }
    p = p.parentPath;
  }
  return depth;
}

function detectLoopIssues(filePath: string, content: string, ast: any): DiagnosticIssue[] {
  if (!ast) return [];
  const issues: DiagnosticIssue[] = [];

  try {
    traverse(ast, {
      noScope: true,

      RegExpLiteral(path: any) {
        if (!isInsideLoop(path)) return;
        const loc = path.node.loc?.start;
        if (!loc) return;
        issues.push({
          id: '', rule: 'loop/regex-in-loop', category: 'loop', severity: 'high',
          file: filePath, line: loc.line, column: loc.column,
          title: 'Regex literal inside loop',
          description: 'Regex is recompiled on every iteration. Hoist outside the loop.',
          snippet: snippetAt(content, loc.line),
          recommendation: 'Move the regex to a constant outside the loop.',
          studyReference: 'Study 04, BM-01',
          empiricalSpeedup: '1.03× in V8, 2× in CPython',
          confidence: 0.85,
        });
      },

      NewExpression(path: any) {
        if (!t.isIdentifier(path.node.callee, { name: 'RegExp' })) return;
        if (!isInsideLoop(path)) return;
        const loc = path.node.loc?.start;
        if (!loc) return;
        issues.push({
          id: '', rule: 'loop/regex-in-loop', category: 'loop', severity: 'high',
          file: filePath, line: loc.line, column: loc.column,
          title: 'new RegExp() inside loop',
          description: 'RegExp constructor called on every iteration. Hoist outside the loop.',
          snippet: snippetAt(content, loc.line),
          recommendation: 'Move `new RegExp(...)` to a constant outside the loop.',
          studyReference: 'Study 04, BM-01',
          empiricalSpeedup: '1.03× in V8, 2× in CPython',
          confidence: 0.85,
        });
      },

      CallExpression(path: any) {
        const { node } = path;
        const loc = node.loc?.start;
        if (!loc) return;

        if (t.isMemberExpression(node.callee)) {
          const prop = node.callee.property;

          // JSON.parse in loop
          if (t.isIdentifier(prop, { name: 'parse' })) {
            const obj = node.callee.object;
            if (t.isIdentifier(obj, { name: 'JSON' }) && isInsideLoop(path)) {
              issues.push({
                id: '', rule: 'loop/json-parse-in-loop', category: 'loop', severity: 'high',
                file: filePath, line: loc.line, column: loc.column,
                title: 'JSON.parse() inside loop',
                description: 'Same JSON parsed on every iteration. Parse once before the loop.',
                snippet: snippetAt(content, loc.line),
                recommendation: 'Move `JSON.parse(...)` before the loop and store the result.',
                studyReference: 'Study 04, BM-02',
                empiricalSpeedup: '46× at n=100,000',
                confidence: 0.9,
              });
            }
          }

          // Nested array methods
          if (t.isIdentifier(prop) && ARRAY_METHODS.has(prop.name)) {
            const depth = countLoopDepth(path);
            if (depth >= 2) {
              issues.push({
                id: '', rule: 'loop/nested-array-methods', category: 'loop', severity: 'medium',
                file: filePath, line: loc.line, column: loc.column,
                title: `Nested .${prop.name}() at loop depth ${depth}`,
                description: `Array method at depth ${depth} — consider flattening to a single-pass loop.`,
                snippet: snippetAt(content, loc.line),
                recommendation: 'Flatten nested array methods into a single explicit for-loop.',
                studyReference: 'Study 04, BM-05',
                empiricalSpeedup: '6× at large n',
                confidence: 0.7,
              });
            }

            // Chained array methods: .filter().map()
            if (
              t.isMemberExpression(node.callee.object) &&
              t.isCallExpression(node.callee.object) &&
              t.isMemberExpression((node.callee.object as t.CallExpression).callee)
            ) {
              const innerCallee = (node.callee.object as t.CallExpression).callee as t.MemberExpression;
              if (
                t.isIdentifier(innerCallee.property) &&
                CHAINING_SOURCE.has(innerCallee.property.name) &&
                CHAINING_TARGET.has(prop.name)
              ) {
                issues.push({
                  id: '', rule: 'loop/chained-array-methods', category: 'loop', severity: 'medium',
                  file: filePath, line: loc.line, column: loc.column,
                  title: `Chained .${innerCallee.property.name}().${prop.name}()`,
                  description: `Two-pass chain creates intermediate array. Fuse into single .reduce() or for-loop.`,
                  snippet: snippetAt(content, loc.line),
                  recommendation: 'Fuse chained .filter().map() into a single .reduce() or for-loop.',
                  studyReference: 'Study 04, BM-06',
                  empiricalSpeedup: '1.5–2× at large n',
                  confidence: 0.65,
                });
              }
            }
          }
        }

        // Sequential await in loop
        if (t.isAwaitExpression(path.parent) && isInsideLoop(path)) {
          issues.push({
            id: '', rule: 'loop/sequential-await', category: 'loop', severity: 'high',
            file: filePath, line: loc.line, column: loc.column,
            title: 'await inside loop — sequential async I/O',
            description: 'Each iteration waits for the previous request. Use Promise.all() for parallelism.',
            snippet: snippetAt(content, loc.line),
            recommendation: 'Collect promises in an array and use `await Promise.all(promises)`.',
            studyReference: 'Study 04, BM-03',
            empiricalSpeedup: 'Speedup proportional to n (linear)',
            confidence: 0.9,
          });
        }
      },

      ForStatement(path: any) {
        const depth = countLoopDepth(path);
        if (depth >= 2) {
          const loc = path.node.loc?.start;
          if (!loc) return;
          issues.push({
            id: '', rule: 'loop/nested-loops', category: 'loop', severity: 'high',
            file: filePath, line: loc.line, column: loc.column,
            title: `Nested for-loop at depth ${depth + 1}`,
            description: `Potential O(n²) — consider Map/Set lookup for O(n).`,
            snippet: snippetAt(content, loc.line),
            recommendation: 'Replace inner loop scan with a Map or Set lookup.',
            studyReference: 'Study 04, BM-04',
            empiricalSpeedup: '64× at n=10,000',
            confidence: 0.8,
          });
        }
      },

      ForOfStatement(path: any) {
        const depth = countLoopDepth(path);
        if (depth >= 2) {
          const loc = path.node.loc?.start;
          if (!loc) return;
          issues.push({
            id: '', rule: 'loop/nested-loops', category: 'loop', severity: 'high',
            file: filePath, line: loc.line, column: loc.column,
            title: `Nested for-of at depth ${depth + 1}`,
            description: `Potential O(n²) — consider Map/Set lookup for O(n).`,
            snippet: snippetAt(content, loc.line),
            recommendation: 'Replace inner loop scan with a Map or Set lookup.',
            studyReference: 'Study 04, BM-04',
            empiricalSpeedup: '64× at n=10,000',
            confidence: 0.8,
          });
        }
      },
    });
  } catch {
    // AST traversal failed — skip
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Rule exports
// ---------------------------------------------------------------------------

export const loopRules: RuleDefinition[] = [
  {
    id: 'loop/regex-in-loop', name: 'Regex in Loop', category: 'loop', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectLoopIssues,
  },
  {
    id: 'loop/json-parse-in-loop', name: 'JSON.parse in Loop', category: 'loop', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectLoopIssues,
  },
  {
    id: 'loop/sequential-await', name: 'Sequential Await in Loop', category: 'loop', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectLoopIssues,
  },
  {
    id: 'loop/nested-loops', name: 'Nested Loops', category: 'loop', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectLoopIssues,
  },
  {
    id: 'loop/nested-array-methods', name: 'Nested Array Methods', category: 'loop', severity: 'medium',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectLoopIssues,
  },
  {
    id: 'loop/chained-array-methods', name: 'Chained Array Methods', category: 'loop', severity: 'medium',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectLoopIssues,
  },
];
