/**
 * Memory leak rules — derived from Study 03 (react/vue/angular detectors)
 *
 * Detects 6 anti-patterns using Babel AST traversal:
 *   memory/missing-effect-cleanup     — useEffect without cleanup return
 *   memory/missing-event-removal      — addEventListener without removeEventListener
 *   memory/missing-timer-cleanup      — setInterval/setTimeout without clear
 *   memory/missing-subscription       — .subscribe() without unsubscribe
 *   memory/missing-observer-disconnect — Observer API without disconnect
 *   memory/missing-lifecycle-cleanup   — Vue/Angular lifecycle missing cleanup
 */

import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { RuleDefinition, DiagnosticIssue } from '../types';

const JS_PATTERNS = ['*.js', '*.ts', '*.jsx', '*.tsx', '*.mjs'];

const EFFECT_SETUP_INDICATORS = [
  'addEventListener', 'setInterval', 'setTimeout', 'subscribe',
  '.on(', 'IntersectionObserver', 'MutationObserver', 'ResizeObserver',
  'requestAnimationFrame',
];

const TIMER_SETUP = new Set(['setInterval', 'setTimeout']);
const TIMER_CLEANUP: Record<string, string> = { setInterval: 'clearInterval', setTimeout: 'clearTimeout' };
const OBSERVER_APIS = new Set(['IntersectionObserver', 'MutationObserver', 'ResizeObserver']);

function snippetAt(code: string, line: number): string {
  return (code.split('\n')[line - 1] ?? '').trim().slice(0, 120);
}

function getCallName(node: t.CallExpression): string | null {
  if (t.isIdentifier(node.callee)) return node.callee.name;
  if (t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) return node.callee.property.name;
  return null;
}

function bodyContainsIndicator(code: string, node: any): string | null {
  if (!node.start || !node.end) return null;
  const body = code.slice(node.start, node.end);
  for (const ind of EFFECT_SETUP_INDICATORS) {
    if (body.includes(ind)) return ind;
  }
  return null;
}

function hasReturnInCallback(node: any): boolean {
  let found = false;
  try {
    traverse(node, {
      noScope: true,
      ReturnStatement() { found = true; },
      ArrowFunctionExpression() { /* skip nested */ },
      FunctionExpression() { /* skip nested */ },
    });
  } catch { /* ignore */ }
  return found;
}

function fileContains(content: string, ...terms: string[]): boolean {
  return terms.some(t => content.includes(t));
}

function detectMemoryIssues(filePath: string, content: string, ast: any): DiagnosticIssue[] {
  if (!ast) return [];
  const issues: DiagnosticIssue[] = [];

  // Quick check — skip files that clearly don't use React/Vue/Angular patterns
  const hasReact = fileContains(content, 'useEffect', 'useState', 'React');
  const hasVue = fileContains(content, 'onMounted', 'onUnmounted', 'watch(', 'watchEffect');
  const hasAngular = fileContains(content, 'ngOnInit', 'ngOnDestroy', '@Component');
  const hasListeners = fileContains(content, 'addEventListener', 'subscribe', 'setInterval', 'setTimeout');

  if (!hasReact && !hasVue && !hasAngular && !hasListeners) return [];

  const fileCode = content;

  try {
    traverse(ast, {
      noScope: true,

      CallExpression(path: any) {
        const node = path.node;
        const callName = getCallName(node);
        if (!callName) return;
        const loc = node.loc?.start;
        if (!loc) return;

        // ---- useEffect without cleanup ----
        if (callName === 'useEffect' && node.arguments?.length >= 1) {
          const callback = node.arguments[0];
          if (callback && (callback.type === 'ArrowFunctionExpression' || callback.type === 'FunctionExpression')) {
            const indicator = bodyContainsIndicator(fileCode, callback);
            if (indicator && !hasReturnInCallback(callback)) {
              issues.push({
                id: '', rule: 'memory/missing-effect-cleanup', category: 'memory', severity: 'critical',
                file: filePath, line: loc.line, column: loc.column,
                title: `useEffect sets up ${indicator} without cleanup return`,
                description: `Effect body uses ${indicator} but never returns a cleanup function. This causes a memory leak when the component unmounts.`,
                snippet: snippetAt(fileCode, loc.line),
                recommendation: `Return a cleanup function from useEffect that calls the corresponding teardown API.`,
                studyReference: 'Study 03',
                confidence: 0.9,
              });
            }
          }
        }

        // ---- addEventListener without removeEventListener ----
        if (callName === 'addEventListener') {
          // Heuristic: check if the enclosing function/block also contains removeEventListener
          const parentFunc = path.findParent((p: any) =>
            p.isFunctionDeclaration() || p.isFunctionExpression() || p.isArrowFunctionExpression() || p.isProgram()
          );
          if (parentFunc) {
            let hasRemove = false;
            try {
              const parentCode = fileCode.slice(parentFunc.node.start ?? 0, parentFunc.node.end ?? fileCode.length);
              hasRemove = parentCode.includes('removeEventListener');
            } catch { /* skip */ }
            if (!hasRemove) {
              issues.push({
                id: '', rule: 'memory/missing-event-removal', category: 'memory', severity: 'high',
                file: filePath, line: loc.line, column: loc.column,
                title: 'addEventListener without removeEventListener',
                description: 'Event listener added but no corresponding removeEventListener found in scope.',
                snippet: snippetAt(fileCode, loc.line),
                recommendation: 'Store the handler reference and call removeEventListener in cleanup.',
                studyReference: 'Study 03',
                confidence: 0.75,
              });
            }
          }
        }

        // ---- Timer without cleanup ----
        if (TIMER_SETUP.has(callName)) {
          const parentFunc = path.findParent((p: any) =>
            p.isFunctionDeclaration() || p.isFunctionExpression() || p.isArrowFunctionExpression() || p.isProgram()
          );
          if (parentFunc) {
            let hasCleanup = false;
            try {
              const parentCode = fileCode.slice(parentFunc.node.start ?? 0, parentFunc.node.end ?? fileCode.length);
              hasCleanup = parentCode.includes(TIMER_CLEANUP[callName]);
            } catch { /* skip */ }
            if (!hasCleanup) {
              issues.push({
                id: '', rule: 'memory/missing-timer-cleanup', category: 'memory', severity: 'high',
                file: filePath, line: loc.line, column: loc.column,
                title: `${callName}() without ${TIMER_CLEANUP[callName]}()`,
                description: `Timer started but never cleared in scope. Will keep firing after component unmounts.`,
                snippet: snippetAt(fileCode, loc.line),
                recommendation: `Store the timer ID and call ${TIMER_CLEANUP[callName]}() in cleanup.`,
                studyReference: 'Study 03',
                confidence: 0.8,
              });
            }
          }
        }

        // ---- .subscribe() without unsubscribe ----
        if (callName === 'subscribe') {
          const parentFunc = path.findParent((p: any) =>
            p.isFunctionDeclaration() || p.isFunctionExpression() || p.isArrowFunctionExpression() || p.isProgram()
          );
          if (parentFunc) {
            let hasUnsub = false;
            try {
              const parentCode = fileCode.slice(parentFunc.node.start ?? 0, parentFunc.node.end ?? fileCode.length);
              hasUnsub = parentCode.includes('unsubscribe') || parentCode.includes('takeUntil');
            } catch { /* skip */ }
            if (!hasUnsub) {
              issues.push({
                id: '', rule: 'memory/missing-subscription', category: 'memory', severity: 'high',
                file: filePath, line: loc.line, column: loc.column,
                title: '.subscribe() without unsubscribe',
                description: 'Observable subscription created but no unsubscribe/takeUntil found in scope.',
                snippet: snippetAt(fileCode, loc.line),
                recommendation: 'Store the subscription and call .unsubscribe() in cleanup, or use takeUntil with a destroy$ subject.',
                studyReference: 'Study 03',
                confidence: 0.75,
              });
            }
          }
        }

        // ---- Vue onMounted without onUnmounted ----
        if (callName === 'onMounted' && hasVue) {
          const parentFunc = path.findParent((p: any) =>
            p.isFunctionDeclaration() || p.isFunctionExpression() || p.isArrowFunctionExpression() || p.isProgram()
          );
          if (parentFunc) {
            let hasUnmounted = false;
            try {
              const parentCode = fileCode.slice(parentFunc.node.start ?? 0, parentFunc.node.end ?? fileCode.length);
              hasUnmounted = parentCode.includes('onUnmounted') || parentCode.includes('onBeforeUnmount');
            } catch { /* skip */ }
            if (!hasUnmounted) {
              issues.push({
                id: '', rule: 'memory/missing-lifecycle-cleanup', category: 'memory', severity: 'high',
                file: filePath, line: loc.line, column: loc.column,
                title: 'Vue onMounted without onUnmounted/onBeforeUnmount',
                description: 'Resources set up in onMounted are never cleaned up. Add onUnmounted or onBeforeUnmount.',
                snippet: snippetAt(fileCode, loc.line),
                recommendation: 'Add an onUnmounted() call with cleanup logic.',
                studyReference: 'Study 03',
                confidence: 0.7,
              });
            }
          }
        }
      },

      // ---- Observer without disconnect ----
      NewExpression(path: any) {
        if (!t.isIdentifier(path.node.callee)) return;
        if (!OBSERVER_APIS.has(path.node.callee.name)) return;
        const loc = path.node.loc?.start;
        if (!loc) return;

        const parentFunc = path.findParent((p: any) =>
          p.isFunctionDeclaration() || p.isFunctionExpression() || p.isArrowFunctionExpression() || p.isProgram()
        );
        if (parentFunc) {
          let hasDisconnect = false;
          try {
            const parentCode = fileCode.slice(parentFunc.node.start ?? 0, parentFunc.node.end ?? fileCode.length);
            hasDisconnect = parentCode.includes('.disconnect()');
          } catch { /* skip */ }
          if (!hasDisconnect) {
            issues.push({
              id: '', rule: 'memory/missing-observer-disconnect', category: 'memory', severity: 'medium',
              file: filePath, line: loc.line, column: loc.column,
              title: `${path.node.callee.name} without .disconnect()`,
              description: `Observer created but never disconnected. Will keep observing after component unmounts.`,
              snippet: snippetAt(fileCode, loc.line),
              recommendation: `Call .disconnect() on the observer in the cleanup function.`,
              studyReference: 'Study 03',
              confidence: 0.75,
            });
          }
        }
      },
    });
  } catch {
    // AST traversal failed
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Rule exports
// ---------------------------------------------------------------------------

export const memoryRules: RuleDefinition[] = [
  {
    id: 'memory/missing-effect-cleanup', name: 'Missing useEffect Cleanup', category: 'memory', severity: 'critical',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectMemoryIssues,
  },
  {
    id: 'memory/missing-event-removal', name: 'Missing Event Listener Removal', category: 'memory', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectMemoryIssues,
  },
  {
    id: 'memory/missing-timer-cleanup', name: 'Missing Timer Cleanup', category: 'memory', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectMemoryIssues,
  },
  {
    id: 'memory/missing-subscription', name: 'Missing Subscription Cleanup', category: 'memory', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectMemoryIssues,
  },
  {
    id: 'memory/missing-observer-disconnect', name: 'Missing Observer Disconnect', category: 'memory', severity: 'medium',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectMemoryIssues,
  },
  {
    id: 'memory/missing-lifecycle-cleanup', name: 'Missing Lifecycle Cleanup', category: 'memory', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectMemoryIssues,
  },
];
