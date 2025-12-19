import traverse from '@babel/traverse';
import { BaseDetector } from './base-detector';
import { AnalysisContext, DetectorResult } from '../types';

export class MemoryLeakDetector extends BaseDetector {
  name = 'Memory Leak Detector';

  async detect(ast: any, context: AnalysisContext): Promise<DetectorResult> {
    this.reset();

    traverse(ast, {
      CallExpression: (path: any) => {
        this.checkEventListenerLeak(path, context);
        this.checkTimerLeak(path, context);
        this.checkGlobalVariableLeak(path, context);
      },

      VariableDeclarator: (path: any) => {
        this.checkClosureLeak(path, context);
      },
    });

    return {
      issues: this.issues,
      detectorName: this.name,
    };
  }

  private checkEventListenerLeak(path: any, context: AnalysisContext): void {
    const node = path.node;
    
    if (node.callee?.property?.name === 'addEventListener') {
      const functionScope = path.getFunctionParent();
      let hasRemoveListener = false;

      if (functionScope) {
        traverse(functionScope.node, {
          CallExpression: (innerPath: any) => {
            if (innerPath.node.callee?.property?.name === 'removeEventListener') {
              hasRemoveListener = true;
            }
          },
        }, functionScope.scope);
      }

      if (!hasRemoveListener) {
        const lineNumber = node.loc?.start.line || 0;
        const code = this.getCode(node, context.sourceCode);

        const issue = this.createIssue(
          'event_listener_leak',
          'high',
          context,
          lineNumber,
          'Potential Event Listener Memory Leak',
          'addEventListener without corresponding removeEventListener can cause memory leaks. Ensure listeners are removed when components unmount.',
          code,
          undefined,
          {
            risk: 'Memory leak in long-running applications',
            solution: 'Add removeEventListener in cleanup/unmount',
          }
        );

        this.issues.push(issue);
      }
    }
  }

  private checkTimerLeak(path: any, context: AnalysisContext): void {
    const node = path.node;
    const timerMethods = ['setTimeout', 'setInterval'];
    
    if (timerMethods.includes(node.callee?.name)) {
      const functionScope = path.getFunctionParent();
      let hasClearTimer = false;

      if (functionScope) {
        traverse(functionScope.node, {
          CallExpression: (innerPath: any) => {
            if (['clearTimeout', 'clearInterval'].includes(innerPath.node.callee?.name)) {
              hasClearTimer = true;
            }
          },
        }, functionScope.scope);
      }

      if (!hasClearTimer && node.callee?.name === 'setInterval') {
        const lineNumber = node.loc?.start.line || 0;
        const code = this.getCode(node, context.sourceCode);

        const issue = this.createIssue(
          'timer_leak',
          'critical',
          context,
          lineNumber,
          'Uncleaned setInterval Detected',
          'setInterval without clearInterval causes memory leaks and continues running indefinitely. Always clear intervals in cleanup.',
          code,
          undefined,
          {
            risk: 'Continuous memory growth and CPU usage',
            solution: 'Store interval ID and call clearInterval in cleanup',
          }
        );

        this.issues.push(issue);
      }
    }
  }

  private checkGlobalVariableLeak(path: any, context: AnalysisContext): void {
    const node = path.node;
    
    if (node.callee?.object?.name === 'window' || node.callee?.object?.name === 'global') {
      const lineNumber = node.loc?.start.line || 0;
      const code = this.getCode(node, context.sourceCode);

      const issue = this.createIssue(
        'global_variable_leak',
        'medium',
        context,
        lineNumber,
        'Global Variable Assignment',
        'Assigning to global variables can cause memory leaks and namespace pollution. Use module scope or proper cleanup.',
        code,
        undefined,
        {
          risk: 'Memory leaks and namespace pollution',
          solution: 'Use module scope or clean up global references',
        }
      );

      this.issues.push(issue);
    }
  }

  private checkClosureLeak(path: any, context: AnalysisContext): void {
    const node = path.node;
    
    if (node.init?.type === 'ArrowFunctionExpression' || 
        node.init?.type === 'FunctionExpression') {
      
      let capturesLargeData = false;
      const parentScope = path.scope.parent;

      if (parentScope) {
        const bindings = parentScope.bindings;
        for (const name in bindings) {
          const binding = bindings[name];
          if (binding.path.node.init?.type === 'ArrayExpression' &&
              binding.path.node.init.elements.length > 100) {
            capturesLargeData = true;
            break;
          }
        }
      }

      if (capturesLargeData) {
        const lineNumber = node.loc?.start.line || 0;
        const code = this.getCode(node, context.sourceCode);

        const issue = this.createIssue(
          'closure_memory_leak',
          'medium',
          context,
          lineNumber,
          'Closure Capturing Large Data',
          'Closure captures large data structures from outer scope, preventing garbage collection. Consider limiting scope or using WeakMap.',
          code,
          undefined,
          {
            risk: 'Prevents garbage collection of large objects',
            solution: 'Limit closure scope or use WeakMap for large data',
          }
        );

        this.issues.push(issue);
      }
    }
  }

  private getCode(node: any, sourceCode: string): string {
    if (!node.start || !node.end) {
      return '';
    }
    return sourceCode.substring(node.start, node.end);
  }
}
