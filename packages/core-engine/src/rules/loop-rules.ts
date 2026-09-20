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

// ---------------------------------------------------------------------------
// Nested-loop analysis
//
// A loop inside a loop is not by itself a problem. Walking a tree or a
// matrix — `for (const child of node.children)` inside `for (const node of
// nodes)` — is linear in the total number of elements, not quadratic, and it
// is how most recursive data structures get traversed. Reporting every such
// loop as a HIGH O(n²) risk is what made this rule fire 86 times on one
// dependency tree.
//
// What is actually quadratic is a *cross product*: an inner loop whose
// iteration source owes nothing to the outer loop variable, so it replays the
// whole inner collection once per outer element. That is the case a Map or Set
// lookup collapses to O(n), and it is the only case this rule now reports.
// ---------------------------------------------------------------------------

const LOOP_STATEMENT_TYPES = ['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement'];

function collectPatternNames(node: any, out: Set<string>): void {
  if (!node) return;
  if (t.isIdentifier(node)) { out.add(node.name); return; }
  if (t.isObjectPattern(node)) {
    for (const prop of node.properties) {
      collectPatternNames(t.isObjectProperty(prop) ? prop.value : (prop as any).argument, out);
    }
    return;
  }
  if (t.isArrayPattern(node)) {
    for (const el of node.elements) collectPatternNames(el, out);
    return;
  }
  if (t.isRestElement(node)) { collectPatternNames(node.argument, out); return; }
  if (t.isAssignmentPattern(node)) { collectPatternNames(node.left, out); return; }
}

function loopBindingNames(node: any, out: Set<string>): void {
  if (t.isForOfStatement(node) || t.isForInStatement(node)) {
    const left = node.left;
    if (t.isVariableDeclaration(left)) {
      for (const decl of left.declarations) collectPatternNames(decl.id, out);
    } else {
      collectPatternNames(left, out);
    }
    return;
  }
  if (t.isForStatement(node) && t.isVariableDeclaration(node.init)) {
    for (const decl of node.init.declarations) collectPatternNames(decl.id, out);
  }
}

/** Names bound by every loop enclosing this one, including array-method callback params. */
function enclosingLoopBindings(path: any): Set<string> {
  const names = new Set<string>();
  let p = path.parentPath;
  while (p?.node) {
    const type = p.node.type ?? '';
    if (LOOP_STATEMENT_TYPES.includes(type)) loopBindingNames(p.node, names);
    if (type === 'CallExpression') {
      const callee = p.node.callee;
      if (t.isMemberExpression(callee) && t.isIdentifier(callee.property) && ARRAY_METHODS.has(callee.property.name)) {
        for (const arg of p.node.arguments) {
          if (t.isArrowFunctionExpression(arg) || t.isFunctionExpression(arg)) {
            for (const param of arg.params) collectPatternNames(param, names);
          }
        }
      }
    }
    p = p.parentPath;
  }
  return names;
}

/** Every identifier name appearing anywhere in an AST subtree. */
function identifiersIn(node: any): Set<string> {
  const out = new Set<string>();
  const seen = new Set<any>();
  function visit(n: any): void {
    if (!n || typeof n !== 'object' || seen.has(n)) return;
    seen.add(n);
    if (Array.isArray(n)) { for (const item of n) visit(item); return; }
    if (n.type === 'Identifier' && typeof n.name === 'string') out.add(n.name);
    for (const key of Object.keys(n)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key.endsWith('Comments')) continue;
      visit(n[key]);
    }
  }
  visit(node);
  return out;
}

/**
 * The expression that decides how many times this loop runs: the iterable for
 * for-of/for-in, the test condition for a counted for-loop.
 */
function iterationSourceOf(node: any): any {
  if (t.isForOfStatement(node) || t.isForInStatement(node)) return node.right;
  if (t.isForStatement(node)) return node.test;
  return null;
}

function nestedLoopIssue(path: any, content: string, filePath: string, label: string): DiagnosticIssue | null {
  const depth = countLoopDepth(path);
  if (depth < 1) return null;

  const loc = path.node.loc?.start;
  if (!loc) return null;

  // Derived from an enclosing loop variable → nested data, not a cross product.
  const bindings = enclosingLoopBindings(path);
  const source = iterationSourceOf(path.node);
  if (!source) return null;
  for (const name of identifiersIn(source)) {
    if (bindings.has(name)) return null;
  }

  const level = depth + 1;
  return {
    id: '', rule: 'loop/nested-loops', category: 'loop',
    severity: level >= 3 ? 'high' : 'medium',
    file: filePath, line: loc.line, column: loc.column,
    title: `Nested ${label} at depth ${level} over an independent collection`,
    description:
      `The inner collection does not derive from the outer loop variable, so it is ` +
      `re-scanned once per outer element — O(n^${level}). Build a Map or Set from it ` +
      `before the outer loop and look up instead of scanning.`,
    snippet: snippetAt(content, loc.line),
    recommendation: 'Index the inner collection into a Map or Set before the outer loop, then look up by key.',
    studyReference: 'Study 04, BM-04',
    empiricalSpeedup: '64× at n=10,000',
    confidence: level >= 3 ? 0.7 : 0.6,
  };
}

/**
 * A regex literal in a loop is not recompiled. Since ES5 each evaluation
 * produces a new RegExp *object*, but V8 caches the compiled pattern per
 * literal site, so the only per-iteration cost is the allocation — which is
 * why Study 04 measured 1.03× in V8 rather than anything dramatic.
 *
 * `new RegExp(dynamicString)` is different: the pattern text changes between
 * iterations, so it genuinely recompiles each time and cannot simply be
 * hoisted. That is the case worth reporting.
 */
function isStaticPattern(arg: any): boolean {
  if (!arg) return true;
  if (t.isStringLiteral(arg)) return true;
  if (t.isTemplateLiteral(arg)) return arg.expressions.length === 0;
  return false;
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
          id: '', rule: 'loop/regex-in-loop', category: 'loop', severity: 'low',
          file: filePath, line: loc.line, column: loc.column,
          title: 'Regex literal inside loop',
          description:
            'A new RegExp object is allocated on each iteration, but V8 caches the compiled ' +
            'pattern for this literal, so it is not recompiled. Hoisting it removes the ' +
            'allocation only — Study 04 measured 1.03× in V8. Worth doing in a hot loop, ' +
            'not worth restructuring code for.',
          snippet: snippetAt(content, loc.line),
          recommendation: 'Move the regex to a constant outside the loop if this is a hot path.',
          studyReference: 'Study 04, BM-01',
          empiricalSpeedup: '1.03× in V8',
          confidence: 0.5,
        });
      },

      NewExpression(path: any) {
        if (!t.isIdentifier(path.node.callee, { name: 'RegExp' })) return;
        if (!isInsideLoop(path)) return;
        const loc = path.node.loc?.start;
        if (!loc) return;

        const staticPattern = isStaticPattern(path.node.arguments?.[0]);
        issues.push({
          id: '', rule: 'loop/regex-in-loop', category: 'loop',
          severity: staticPattern ? 'low' : 'medium',
          file: filePath, line: loc.line, column: loc.column,
          title: staticPattern
            ? 'new RegExp() with a fixed pattern inside loop'
            : 'new RegExp() with a computed pattern inside loop',
          description: staticPattern
            ? 'The pattern is constant, so V8 serves it from the regexp compilation cache. ' +
              'Hoisting removes the allocation only.'
            : 'The pattern string is built from loop data, so a new regex is compiled on every ' +
              'iteration — this one cannot be served from the compilation cache. Compilation is ' +
              'far more expensive than matching.',
          snippet: snippetAt(content, loc.line),
          recommendation: staticPattern
            ? 'Move `new RegExp(...)` to a constant outside the loop if this is a hot path.'
            : 'Build the pattern before the loop, or memoise compiled RegExp objects keyed by pattern string.',
          studyReference: 'Study 04, BM-01',
          empiricalSpeedup: staticPattern ? '1.03× in V8' : 'Compilation cost per iteration',
          confidence: staticPattern ? 0.5 : 0.75,
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
        const issue = nestedLoopIssue(path, content, filePath, 'for-loop');
        if (issue) issues.push(issue);
      },

      ForOfStatement(path: any) {
        const issue = nestedLoopIssue(path, content, filePath, 'for-of');
        if (issue) issues.push(issue);
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
    id: 'loop/regex-in-loop', name: 'Regex in Loop', category: 'loop', severity: 'medium',
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
    id: 'loop/nested-loops', name: 'Nested Loops', category: 'loop', severity: 'medium',
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
