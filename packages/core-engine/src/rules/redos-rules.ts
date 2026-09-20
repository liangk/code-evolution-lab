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

/**
 * Catastrophic backtracking needs *ambiguity* — two ways for the engine to
 * match the same input, multiplied by a quantifier. Three structures produce
 * it, and nothing else in a regex's surface text does:
 *
 *   1. A nested quantifier: `(a+)+`, `(a*)*`. The classic case.
 *   2. Two unbounded quantifiers over the same character class next to each
 *      other: `.*.*`, `\w+\w+`. The engine has to try every split point.
 *   3. A quantified group containing alternation: `(a|ab)+`. Alternatives that
 *      can match the same text give the engine a choice to backtrack through.
 *
 * The previous version scored regex *complexity* instead: two points per
 * quantifier, two per group, three per alternation branch, report above ten.
 * That measures length, not backtracking. A flat anchored alternation like
 * `/^(chunk|chunked|batch|batches|partition)$/` scored 17 and was reported as
 * a ReDoS vulnerability despite matching in linear time — this package's own
 * constants produced 28 such findings, every one of them wrong.
 *
 * Length is not risk. Only these three structures are reported now.
 */
const NESTED_QUANTIFIER = [
  /\(\.\*\)\+/, /\(\.\+\)\+/, /\([^)]*\+\)\+/, /\([^)]*\*\)\+/,
  /\([^)]*\+\)\*/, /\([^)]*\*\)\*/, /\(\[.*?\]\+\)\+/, /\(\[.*?\]\*\)\+/,
  /\(\.\*\?\)\+/, /\(\.\+\?\)\+/,
];

/** `.*.*`, `\w+\w+`, `[a-z]+[a-z]*` — same class, both unbounded. */
const REPEATED_SAME_CLASS = /(\.|\\w|\\d|\\s|\\S|\\D|\\W|\[[^\]]+\])\s*[+*]\s*\1\s*[+*]/;

/** `(a|ab)+` — alternation inside something quantified. */
const QUANTIFIED_ALTERNATION = /\([^()]*\|[^()]*\)\s*(?:[+*]|\{\d+,\})/;

function snippetAt(code: string, line: number): string {
  return (code.split('\n')[line - 1] ?? '').trim().slice(0, 120);
}

type RiskKind = 'nested-quantifier' | 'repeated-class' | 'quantified-alternation';

function backtrackingRisk(pattern: string): RiskKind | null {
  if (NESTED_QUANTIFIER.some(p => p.test(pattern))) return 'nested-quantifier';
  if (REPEATED_SAME_CLASS.test(pattern)) return 'repeated-class';
  if (QUANTIFIED_ALTERNATION.test(pattern)) return 'quantified-alternation';
  return null;
}

const RISK_DETAIL: Record<RiskKind, { severity: DiagnosticIssue['severity']; confidence: number; why: string }> = {
  'nested-quantifier': {
    severity: 'critical',
    confidence: 0.85,
    why: 'contains a nested quantifier, the classic catastrophic-backtracking shape',
  },
  'repeated-class': {
    severity: 'high',
    confidence: 0.7,
    why: 'repeats the same character class with two unbounded quantifiers, so the engine must try every split point',
  },
  'quantified-alternation': {
    severity: 'medium',
    confidence: 0.5,
    why: 'quantifies a group containing alternation; if the branches can match the same text the engine can backtrack through every combination',
  },
};

function analyzeRegex(pattern: string, flags: string, loc: any, content: string, filePath: string, issues: DiagnosticIssue[]): void {
  const kind = backtrackingRisk(pattern);
  if (!kind) return;

  const { severity, confidence, why } = RISK_DETAIL[kind];
  issues.push({
    id: '', rule: 'redos/dangerous-pattern', category: 'redos', severity,
    file: filePath, line: loc.line, column: loc.column,
    title: 'Potential ReDoS vulnerability',
    description: `Regex /${pattern}/${flags} ${why}.`,
    snippet: snippetAt(content, loc.line),
    recommendation: 'Avoid nested quantifiers like (a+)+; make alternation branches mutually exclusive; replace .* with a specific character class; cap input length before matching.',
    studyReference: 'Study 10',
    confidence,
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

        // `str.split(',')` and `str.replace('a', 'b')` take strings, not
        // regexes, and cannot backtrack at all.
        if (['replace', 'replaceAll', 'split'].includes(methodName)) {
          const first = node.arguments?.[0];
          if (!first || first.type === 'StringLiteral' || first.type === 'TemplateLiteral') return;
        }

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
