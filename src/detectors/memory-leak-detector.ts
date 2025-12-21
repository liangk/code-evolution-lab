import traverse from '@babel/traverse';
import { BaseDetector } from './base-detector';
import { AnalysisContext, DetectorResult } from '../types';

interface FrameworkContext {
  framework: 'react' | 'vue' | 'angular' | 'none';
  hasCleanupMethod: boolean;
  cleanupMethodName?: string;
}

export class MemoryLeakDetector extends BaseDetector {
  name = 'Memory Leak Detector';

  async detect(ast: any, context: AnalysisContext): Promise<DetectorResult> {
    this.reset();

    const frameworkContext = this.detectFramework(ast);

    traverse(ast, {
      CallExpression: (path: any) => {
        this.checkEventListenerLeakWithLifecycle(path, context, frameworkContext);
        this.checkTimerLeakWithLifecycle(path, context, frameworkContext);
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

  private detectFramework(ast: any): FrameworkContext {
    let framework: 'react' | 'vue' | 'angular' | 'none' = 'none';
    let hasCleanupMethod = false;
    let cleanupMethodName: string | undefined;

    traverse(ast, {
      ImportDeclaration: (path: any) => {
        const source = path.node.source.value;
        if (source === 'react' || source.startsWith('react/')) {
          framework = 'react';
        } else if (source === 'vue' || source.startsWith('@vue/')) {
          framework = 'vue';
        } else if (source.startsWith('@angular/')) {
          framework = 'angular';
        }
      },
      CallExpression: (path: any) => {
        const callee = path.node.callee;
        if (callee?.name === 'useEffect') {
          framework = 'react';
          const callback = path.node.arguments?.[0];
          if (callback?.body?.type === 'BlockStatement') {
            traverse(callback.body, {
              ReturnStatement: (innerPath: any) => {
                if (innerPath.node.argument?.type === 'ArrowFunctionExpression' ||
                    innerPath.node.argument?.type === 'FunctionExpression') {
                  hasCleanupMethod = true;
                  cleanupMethodName = 'useEffect cleanup';
                }
              },
            }, path.scope);
          }
        }
      },
      ClassMethod: (path: any) => {
        const methodName = path.node.key?.name;
        if (methodName === 'componentWillUnmount') {
          framework = 'react';
          hasCleanupMethod = true;
          cleanupMethodName = 'componentWillUnmount';
        } else if (methodName === 'ngOnDestroy') {
          framework = 'angular';
          hasCleanupMethod = true;
          cleanupMethodName = 'ngOnDestroy';
        } else if (methodName === 'unmounted' || methodName === 'beforeUnmount') {
          framework = 'vue';
          hasCleanupMethod = true;
          cleanupMethodName = methodName;
        }
      },
    });

    return { framework, hasCleanupMethod, cleanupMethodName };
  }

  private checkEventListenerLeakWithLifecycle(
    path: any,
    context: AnalysisContext,
    frameworkContext: FrameworkContext
  ): void {
    const node = path.node;
    
    if (node.callee?.property?.name === 'addEventListener') {
      const functionScope = path.getFunctionParent();
      let hasRemoveListener = false;
      let hasCleanupInLifecycle = false;

      if (functionScope) {
        traverse(functionScope.node, {
          CallExpression: (innerPath: any) => {
            if (innerPath.node.callee?.property?.name === 'removeEventListener') {
              hasRemoveListener = true;
            }
          },
        }, functionScope.scope);

        if (frameworkContext.framework !== 'none' && frameworkContext.hasCleanupMethod) {
          const classScope = path.scope.getFunctionParent()?.parent;
          if (classScope) {
            traverse(classScope.block, {
              ClassMethod: (methodPath: any) => {
                if (methodPath.node.key?.name === frameworkContext.cleanupMethodName ||
                    (frameworkContext.framework === 'angular' && methodPath.node.key?.name === 'ngOnDestroy') ||
                    (frameworkContext.framework === 'vue' && ['unmounted', 'beforeUnmount'].includes(methodPath.node.key?.name))) {
                  traverse(methodPath.node, {
                    CallExpression: (cleanupPath: any) => {
                      if (cleanupPath.node.callee?.property?.name === 'removeEventListener') {
                        hasCleanupInLifecycle = true;
                      }
                    },
                  }, methodPath.scope);
                }
              },
              ReturnStatement: (returnPath: any) => {
                if (frameworkContext.framework === 'react' &&
                    (returnPath.node.argument?.type === 'ArrowFunctionExpression' ||
                     returnPath.node.argument?.type === 'FunctionExpression')) {
                  traverse(returnPath.node.argument, {
                    CallExpression: (cleanupPath: any) => {
                      if (cleanupPath.node.callee?.property?.name === 'removeEventListener') {
                        hasCleanupInLifecycle = true;
                      }
                    },
                  }, returnPath.scope);
                }
              },
            }, classScope);
          }
        }
      }

      if (!hasRemoveListener && !hasCleanupInLifecycle) {
        const lineNumber = node.loc?.start.line || 0;
        const code = this.getCode(node, context.sourceCode);
        const severity = frameworkContext.framework !== 'none' ? 'high' : 'medium';
        const confidenceScore = frameworkContext.framework !== 'none' ? 85 : 70;

        let solution = 'Add removeEventListener in cleanup';
        if (frameworkContext.framework === 'react') {
          solution = 'Add removeEventListener in useEffect cleanup or componentWillUnmount';
        } else if (frameworkContext.framework === 'angular') {
          solution = 'Add removeEventListener in ngOnDestroy lifecycle hook';
        } else if (frameworkContext.framework === 'vue') {
          solution = 'Add removeEventListener in unmounted or beforeUnmount hook';
        }

        const issue = this.createIssue(
          'event_listener_leak',
          severity,
          context,
          lineNumber,
          'Event Listener Memory Leak',
          `addEventListener without corresponding removeEventListener causes memory leaks. ${solution}.`,
          code,
          undefined,
          this.createImpact(7, 'Memory leak in long-running applications', confidenceScore, 'memory', 'easy', {
            framework: frameworkContext.framework,
            risk: 'Memory leak in long-running applications',
            solution,
          })
        );

        this.issues.push(issue);
      }
    }
  }

  private checkTimerLeakWithLifecycle(
    path: any,
    context: AnalysisContext,
    frameworkContext: FrameworkContext
  ): void {
    const node = path.node;
    const timerMethods = ['setTimeout', 'setInterval'];
    
    if (timerMethods.includes(node.callee?.name)) {
      const functionScope = path.getFunctionParent();
      let hasClearTimer = false;
      let hasCleanupInLifecycle = false;
      let timerIdStored = false;

      if (functionScope) {
        traverse(functionScope.node, {
          CallExpression: (innerPath: any) => {
            if (['clearTimeout', 'clearInterval'].includes(innerPath.node.callee?.name)) {
              hasClearTimer = true;
            }
          },
          VariableDeclarator: (varPath: any) => {
            if (varPath.node.init === node) {
              timerIdStored = true;
            }
          },
          AssignmentExpression: (assignPath: any) => {
            if (assignPath.node.right === node) {
              timerIdStored = true;
            }
          },
        }, functionScope.scope);

        if (frameworkContext.framework !== 'none' && frameworkContext.hasCleanupMethod) {
          const classScope = path.scope.getFunctionParent()?.parent;
          if (classScope) {
            traverse(classScope.block, {
              ClassMethod: (methodPath: any) => {
                if (methodPath.node.key?.name === frameworkContext.cleanupMethodName ||
                    (frameworkContext.framework === 'angular' && methodPath.node.key?.name === 'ngOnDestroy') ||
                    (frameworkContext.framework === 'vue' && ['unmounted', 'beforeUnmount'].includes(methodPath.node.key?.name))) {
                  traverse(methodPath.node, {
                    CallExpression: (cleanupPath: any) => {
                      if (['clearTimeout', 'clearInterval'].includes(cleanupPath.node.callee?.name)) {
                        hasCleanupInLifecycle = true;
                      }
                    },
                  }, methodPath.scope);
                }
              },
              ReturnStatement: (returnPath: any) => {
                if (frameworkContext.framework === 'react' &&
                    (returnPath.node.argument?.type === 'ArrowFunctionExpression' ||
                     returnPath.node.argument?.type === 'FunctionExpression')) {
                  traverse(returnPath.node.argument, {
                    CallExpression: (cleanupPath: any) => {
                      if (['clearTimeout', 'clearInterval'].includes(cleanupPath.node.callee?.name)) {
                        hasCleanupInLifecycle = true;
                      }
                    },
                  }, returnPath.scope);
                }
              },
            }, classScope);
          }
        }
      }

      if (!hasClearTimer && !hasCleanupInLifecycle && node.callee?.name === 'setInterval') {
        const lineNumber = node.loc?.start.line || 0;
        const code = this.getCode(node, context.sourceCode);
        const severity = frameworkContext.framework !== 'none' ? 'critical' : 'high';
        const confidenceScore = frameworkContext.framework !== 'none' && timerIdStored ? 90 : 85;

        let solution = 'Store interval ID and call clearInterval in cleanup';
        if (frameworkContext.framework === 'react') {
          solution = 'Store interval ID and call clearInterval in useEffect cleanup or componentWillUnmount';
        } else if (frameworkContext.framework === 'angular') {
          solution = 'Store interval ID and call clearInterval in ngOnDestroy lifecycle hook';
        } else if (frameworkContext.framework === 'vue') {
          solution = 'Store interval ID and call clearInterval in unmounted or beforeUnmount hook';
        }

        const issue = this.createIssue(
          'timer_leak',
          severity,
          context,
          lineNumber,
          'Uncleaned setInterval Detected',
          `setInterval without clearInterval causes memory leaks and continues running indefinitely. ${solution}.`,
          code,
          undefined,
          this.createImpact(9, 'Continuous memory growth and CPU usage', confidenceScore, 'memory', 'easy', {
            framework: frameworkContext.framework,
            timerIdStored,
            risk: 'Continuous memory growth and CPU usage',
            solution,
          })
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
        this.createImpact(5, 'Memory leaks and namespace pollution', 65, 'memory', 'moderate', {
          risk: 'Memory leaks and namespace pollution',
          solution: 'Use module scope or clean up global references',
        })
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
          this.createImpact(6, 'Prevents garbage collection of large objects', 55, 'memory', 'moderate', {
            risk: 'Prevents garbage collection of large objects',
            solution: 'Limit closure scope or use WeakMap for large data',
          })
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
