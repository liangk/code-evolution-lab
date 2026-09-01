/**
 * DOM manipulation rules — derived from Study 08 (dom-manipulation-detector.ts)
 *
 * Detects 3 anti-patterns using Babel AST traversal:
 *   dom/manipulation-in-loop  — appendChild/innerHTML/etc inside a loop triggers repeated reflow
 *   dom/innerhtml-user-input  — innerHTML assigned from user input is an XSS risk
 *   dom/document-write        — document.write() blocks parsing
 */

import traverse from '@babel/traverse';
import type { RuleDefinition, DiagnosticIssue } from '../types';

const JS_PATTERNS = ['*.js', '*.jsx', '*.ts', '*.tsx', '*.mjs'];
const LOOP_TYPES = new Set(['ForStatement', 'ForOfStatement', 'ForInStatement', 'WhileStatement']);
const EXPENSIVE_DOM_OPS = new Set(['appendChild', 'insertBefore', 'removeChild', 'replaceChild', 'insertAdjacentElement', 'insertAdjacentHTML']);
const USER_INPUT_INDICATORS = new Set(['req', 'request', 'body', 'query', 'params', 'input', 'data', 'user', 'value']);

function snippetAt(code: string, line: number): string {
  return (code.split('\n')[line - 1] ?? '').trim().slice(0, 120);
}

function looksLikeUserInput(node: any): boolean {
  if (!node) return false;
  if (node.type === 'Identifier' && USER_INPUT_INDICATORS.has(node.name)) return true;
  if (node.type === 'MemberExpression') {
    const objName = node.object?.name;
    const propName = node.property?.name;
    if (USER_INPUT_INDICATORS.has(objName) || ['body', 'query', 'params', 'value'].includes(propName)) return true;
    return looksLikeUserInput(node.object);
  }
  if (node.type === 'TemplateLiteral') {
    return (node.expressions || []).some((expr: any) => looksLikeUserInput(expr));
  }
  return false;
}

function detectDomIssues(filePath: string, content: string, ast: any): DiagnosticIssue[] {
  if (!ast) return [];
  const issues: DiagnosticIssue[] = [];

  try {
    traverse(ast, {
      noScope: true,

      enter(path: any) {
        if (!LOOP_TYPES.has(path.node.type)) return;
        const loc = path.node.loc?.start;
        if (!loc) return;

        const operations: string[] = [];
        let hasInnerHTML = false;
        traverse(path.node, {
          noScope: true,
          CallExpression(inner: any) {
            const method = inner.node.callee?.property?.name;
            if (method && EXPENSIVE_DOM_OPS.has(method)) operations.push(method);
          },
          AssignmentExpression(inner: any) {
            const prop = inner.node.left?.property?.name;
            if (prop === 'innerHTML' || prop === 'outerHTML') { hasInnerHTML = true; operations.push(prop); }
          },
        });

        if (operations.length > 0 || hasInnerHTML) {
          const severity: DiagnosticIssue['severity'] = (operations.length > 2 || hasInnerHTML) ? 'high' : 'medium';
          issues.push({
            id: '', rule: 'dom/manipulation-in-loop', category: 'dom', severity,
            file: filePath, line: loc.line, column: loc.column,
            title: 'DOM manipulation in loop',
            description: `DOM manipulation inside a loop (${[...new Set(operations)].join(', ')}). Each iteration triggers reflow/repaint.`,
            snippet: snippetAt(content, loc.line),
            recommendation: 'Use a DocumentFragment or batch DOM updates outside the loop.',
            studyReference: 'Study 08',
            confidence: 0.75,
          });
        }
      },

      AssignmentExpression(path: any) {
        const node = path.node;
        const prop = node.left?.property?.name;
        const loc = node.loc?.start;
        if (!loc || (prop !== 'innerHTML' && prop !== 'outerHTML')) return;

        if (looksLikeUserInput(node.right)) {
          issues.push({
            id: '', rule: 'dom/innerhtml-user-input', category: 'dom', severity: 'critical',
            file: filePath, line: loc.line, column: loc.column,
            title: 'innerHTML set from user input (XSS risk)',
            description: 'Setting innerHTML with unsanitized user input is an XSS vulnerability.',
            snippet: snippetAt(content, loc.line),
            recommendation: 'Use textContent for plain text, createElement for elements, or sanitize with DOMPurify.',
            studyReference: 'Study 08',
            confidence: 0.7,
          });
        }
      },

      CallExpression(path: any) {
        const node = path.node;
        const callee = node.callee;
        const loc = node.loc?.start;
        if (!loc) return;

        if (callee?.object?.name === 'document' && ['write', 'writeln'].includes(callee?.property?.name)) {
          issues.push({
            id: '', rule: 'dom/document-write', category: 'dom', severity: 'high',
            file: filePath, line: loc.line, column: loc.column,
            title: 'document.write() usage',
            description: 'document.write() blocks HTML parsing and is a well-known performance anti-pattern.',
            snippet: snippetAt(content, loc.line),
            recommendation: 'Use DOM methods (createElement/appendChild) or innerHTML instead.',
            studyReference: 'Study 08',
            confidence: 0.9,
          });
        }
      },
    });
  } catch {
    // AST traversal failed — skip
  }

  return issues;
}

export const domRules: RuleDefinition[] = [
  {
    id: 'dom/manipulation-in-loop', name: 'DOM Manipulation in Loop', category: 'dom', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectDomIssues,
  },
  {
    id: 'dom/innerhtml-user-input', name: 'innerHTML with User Input', category: 'dom', severity: 'critical',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectDomIssues,
  },
  {
    id: 'dom/document-write', name: 'document.write() Usage', category: 'dom', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectDomIssues,
  },
];
