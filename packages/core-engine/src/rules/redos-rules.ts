/**
 * ReDoS rules — derived from Study 10 (redos-detector.ts)
 *
 * Detects 2 anti-patterns using pattern text analysis (no AST needed for the
 * regex itself, only to locate RegExpLiteral/RegExp() nodes and call sites):
 *   redos/dangerous-pattern  — nested quantifiers or high complexity score (catastrophic backtracking risk)
 *   redos/regex-user-input   — regex method applied to a value that looks like user input
 */

import traverse from '@babel/traverse';
import type { RuleDefinition, DiagnosticIssue } from '../types';

const JS_PATTERNS = ['*.js', '*.ts', '*.jsx', '*.tsx', '*.mjs'];
const USER_INPUT_INDICATORS = new Set(['req', 'request', 'body', 'query', 'params', 'input', 'data', 'user']);

const DANGEROUS_PATTERNS = [
  /\(\.\*\)\+/, /\(\.\+\)\+/, /\([^)]*\+\)\+/, /\([^)]*\*\)\+/,
  /\([^)]*\+\)\*/, /\([^)]*\*\)\*/, /\(\[.*?\]\+\)\+/, /\(\[.*?\]\*\)\+/,
  /\(\.\*\?\)\+/, /\(\.\+\?\)\+/,
];

function snippetAt(code: string, line: number): string {
  return (code.split('\n')[line - 1] ?? '').trim().slice(0, 120);
}

function complexityScore(pattern: string): number {
  let score = 0;
  score += ((pattern.match(/[+*?]|\{\d+,?\d*\}/g) || []).length) * 2;
  score += ((pattern.match(/\(/g) || []).length) * 2;
  score += ((pattern.match(/\|/g) || []).length) * 3;
  if (/\([^)]*[+*][^)]*\)[+*]/.test(pattern)) score += 10;
  if (/[+*].*[+*]/.test(pattern)) score += 5;
  return score;
}

function analyzeRegex(pattern: string, flags: string, loc: any, content: string, filePath: string, issues: DiagnosticIssue[]): void {
  const isDangerous = DANGEROUS_PATTERNS.some(p => p.test(pattern));
  const score = complexityScore(pattern);

  if (!isDangerous && score <= 10) return;

  const severity: DiagnosticIssue['severity'] = isDangerous ? 'critical' : score > 20 ? 'high' : 'medium';
  issues.push({
    id: '', rule: 'redos/dangerous-pattern', category: 'redos', severity,
    file: filePath, line: loc.line, column: loc.column,
    title: 'Potential ReDoS vulnerability',
    description: `Regex /${pattern}/${flags} ${isDangerous ? 'contains a nested-quantifier pattern known to cause catastrophic backtracking' : `has a high complexity score (${score})`}.`,
    snippet: snippetAt(content, loc.line),
    recommendation: 'Avoid nested quantifiers like (a+)+ or (.*)+; replace .* with a specific character class; consider a regex timeout or input length limit.',
    studyReference: 'Study 10',
    confidence: isDangerous ? 0.85 : 0.6,
  });
}

function looksLikeUserInput(node: any): boolean {
  if (!node) return false;
  if (node.type === 'Identifier' && USER_INPUT_INDICATORS.has(node.name)) return true;
  if (node.type === 'MemberExpression') {
    const objName = node.object?.name;
    const propName = node.property?.name;
    if (USER_INPUT_INDICATORS.has(objName)) return true;
    if (['body', 'query', 'params', 'input'].includes(propName)) return true;
    return looksLikeUserInput(node.object);
  }
  return false;
}

function detectRedosIssues(filePath: string, content: string, ast: any): DiagnosticIssue[] {
  if (!ast) return [];
  const issues: DiagnosticIssue[] = [];

  try {
    traverse(ast, {
      noScope: true,

      RegExpLiteral(path: any) {
        const loc = path.node.loc?.start;
        if (!loc) return;
        analyzeRegex(path.node.pattern, path.node.flags, loc, content, filePath, issues);
      },

      NewExpression(path: any) {
        if (path.node.callee?.name !== 'RegExp') return;
        const loc = path.node.loc?.start;
        if (!loc) return;
        const patternArg = path.node.arguments?.[0];
        const flagsArg = path.node.arguments?.[1];
        const pattern = patternArg?.type === 'StringLiteral' ? patternArg.value : '';
        const flags = flagsArg?.type === 'StringLiteral' ? flagsArg.value : '';
        if (pattern) analyzeRegex(pattern, flags, loc, content, filePath, issues);
      },

      CallExpression(path: any) {
        const node = path.node;
        const methodName = node.callee?.property?.name;
        const loc = node.loc?.start;
        if (!loc || !['match', 'test', 'exec', 'replace', 'replaceAll', 'search', 'split'].includes(methodName)) return;

        const target = methodName === 'test' || methodName === 'exec' ? node.arguments?.[0] : node.callee?.object;
        if (looksLikeUserInput(target)) {
          issues.push({
            id: '', rule: 'redos/regex-user-input', category: 'redos', severity: 'high',
            file: filePath, line: loc.line, column: loc.column,
            title: 'Regex applied to user input',
            description: `'${methodName}()' applies a regex to what looks like untrusted user input. Malicious input could trigger catastrophic backtracking.`,
            snippet: snippetAt(content, loc.line),
            recommendation: 'Validate and cap input length before running regex operations on user-supplied data.',
            studyReference: 'Study 10',
            confidence: 0.55,
          });
        }
      },
    });
  } catch {
    // AST traversal failed — skip
  }

  return issues;
}

export const redosRules: RuleDefinition[] = [
  {
    id: 'redos/dangerous-pattern', name: 'Dangerous Regex Pattern', category: 'redos', severity: 'critical',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectRedosIssues,
  },
  {
    id: 'redos/regex-user-input', name: 'Regex on User Input', category: 'redos', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectRedosIssues,
  },
];
