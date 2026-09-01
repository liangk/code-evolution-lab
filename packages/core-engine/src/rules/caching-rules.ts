/**
 * Caching rules — derived from Study 11 (missing-caching-detector.ts)
 *
 * Detects 2 anti-patterns using Babel AST traversal:
 *   caching/repeated-expensive-call — the same expensive call repeated in one function
 *   caching/api-without-cache       — fetch/axios/DB call in a frequently-invoked context with no cache indicator nearby
 */

import traverse from '@babel/traverse';
import type { RuleDefinition, DiagnosticIssue } from '../types';

const JS_PATTERNS = ['*.js', '*.ts', '*.jsx', '*.tsx', '*.mjs'];
const EXPENSIVE_OPS = new Set(['fetch', 'axios', 'request', 'query', 'findAll', 'findMany', 'find', 'aggregate']);
const CACHE_INDICATORS = ['cache', 'cached', 'memoize', 'memo', 'redis', 'localstorage', 'sessionstorage'];

function snippetAt(code: string, line: number): string {
  return (code.split('\n')[line - 1] ?? '').trim().slice(0, 120);
}

function callSignature(node: any): string {
  const callee = node.callee;
  const method = callee?.property?.name || callee?.name || '';
  const args = (node.arguments || []).map((a: any) => a.value ?? a.name ?? 'expr').join(',');
  return `${method}(${args})`;
}

function isFrequentContext(path: any): boolean {
  let p = path;
  while (p?.node) {
    const name = p.node.id?.name || p.node.key?.name || '';
    if (['render', 'componentDidUpdate', 'useEffect'].includes(name)) return true;
    if (name.startsWith('handle') || name.startsWith('on') || name.startsWith('render')) return true;
    p = p.parentPath;
  }
  return false;
}

function detectCachingIssues(filePath: string, content: string, ast: any): DiagnosticIssue[] {
  if (!ast) return [];
  const issues: DiagnosticIssue[] = [];
  const reportedSignatures = new Set<string>();

  try {
    traverse(ast, {
      noScope: true,

      CallExpression(path: any) {
        const node = path.node;
        const methodName = node.callee?.property?.name || node.callee?.name;
        const loc = node.loc?.start;
        if (!methodName || !loc || !EXPENSIVE_OPS.has(methodName)) return;

        const fnScope = path.getFunctionParent?.();
        if (fnScope) {
          const sig = callSignature(node);
          const sigKey = `${filePath}:${fnScope.node.start}:${sig}`;
          let count = 0;
          try {
            traverse(fnScope.node, {
              noScope: true,
              CallExpression(inner: any) {
                if (callSignature(inner.node) === sig) count++;
              },
            });
          } catch {
            // ignore
          }

          if (count > 1 && !reportedSignatures.has(sigKey)) {
            reportedSignatures.add(sigKey);
            issues.push({
              id: '', rule: 'caching/repeated-expensive-call', category: 'caching', severity: 'medium',
              file: filePath, line: loc.line, column: loc.column,
              title: `Repeated expensive call: ${methodName}`,
              description: `Identical call to '${methodName}' appears ${count} times in the same function. Cache the result in a variable.`,
              snippet: snippetAt(content, loc.line),
              recommendation: 'Store the result in a local variable and reuse it instead of calling again.',
              studyReference: 'Study 11',
              confidence: 0.6,
            });
          }
        }

        if (!fnScope) return;
        let hasCacheIndicator = false;
        try {
          traverse(fnScope.node, {
            noScope: true,
            Identifier(inner: any) {
              const lower = inner.node.name?.toLowerCase() ?? '';
              if (CACHE_INDICATORS.some(c => lower.includes(c))) hasCacheIndicator = true;
            },
          });
        } catch {
          // ignore
        }

        if (!hasCacheIndicator && isFrequentContext(path)) {
          issues.push({
            id: '', rule: 'caching/api-without-cache', category: 'caching', severity: 'medium',
            file: filePath, line: loc.line, column: loc.column,
            title: `${methodName} without apparent caching`,
            description: `'${methodName}' is called in a frequently-invoked context (render/handler/effect) with no cache indicator nearby.`,
            snippet: snippetAt(content, loc.line),
            recommendation: 'Add a caching layer (in-memory cache, Redis, or HTTP cache headers) or memoize with useMemo/useCallback.',
            studyReference: 'Study 11',
            confidence: 0.5,
          });
        }
      },
    });
  } catch {
    // AST traversal failed — skip
  }

  return issues;
}

export const cachingRules: RuleDefinition[] = [
  {
    id: 'caching/repeated-expensive-call', name: 'Repeated Expensive Call', category: 'caching', severity: 'medium',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectCachingIssues,
  },
  {
    id: 'caching/api-without-cache', name: 'API Call Without Cache', category: 'caching', severity: 'medium',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectCachingIssues,
  },
];
