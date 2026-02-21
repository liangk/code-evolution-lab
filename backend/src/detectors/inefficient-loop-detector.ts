import traverse from '@babel/traverse';
import { BaseDetector } from './base-detector';
import { AnalysisContext, DetectorResult } from '../types';

export class InefficientLoopDetector extends BaseDetector {
  name = 'Inefficient Loop Detector';

  async detect(ast: any, context: AnalysisContext): Promise<DetectorResult> {
    this.reset();

    traverse(ast, {
      CallExpression: (path: any) => {
        this.checkArrayMethodChaining(path, context);
        this.checkNestedArrayMethods(path, context);
      },

      ForStatement: (path: any) => {
        this.checkArrayPushInLoop(path, context);
        this.checkDOMManipulationInLoop(path, context);
        this.checkAwaitInLoop(path, context);
        this.checkStringConcatInLoop(path, context);
        this.checkRegexInLoop(path, context);
        this.checkJSONOperationsInLoop(path, context);
        this.checkSyncFileIOInLoop(path, context);
        this.checkIncludesIndexOfInLoop(path, context);
        this.checkNestedForLoops(path, context);
      },

      ForOfStatement: (path: any) => {
        this.checkArrayPushInLoop(path, context);
        this.checkDOMManipulationInLoop(path, context);
        this.checkAwaitInLoop(path, context);
        this.checkStringConcatInLoop(path, context);
        this.checkRegexInLoop(path, context);
        this.checkJSONOperationsInLoop(path, context);
        this.checkSyncFileIOInLoop(path, context);
        this.checkIncludesIndexOfInLoop(path, context);
        this.checkNestedForLoops(path, context);
        this.checkObjectKeysWithLookups(path, context);
      },

      WhileStatement: (path: any) => {
        this.checkAwaitInLoop(path, context);
        this.checkStringConcatInLoop(path, context);
        this.checkRegexInLoop(path, context);
        this.checkJSONOperationsInLoop(path, context);
        this.checkSyncFileIOInLoop(path, context);
      },
    });

    return {
      issues: this.issues,
      detectorName: this.name,
    };
  }

  private checkArrayMethodChaining(path: any, context: AnalysisContext): void {
    const node = path.node;
    
    if (node.callee?.property?.name === 'filter' && path.parent?.callee?.property?.name === 'map') {
      const lineNumber = node.loc?.start.line || 0;
      const code = this.getCode(node, context.sourceCode);

      const issue = this.createIssue(
        'inefficient_array_chaining',
        'medium',
        context,
        lineNumber,
        'Inefficient Array Method Chaining',
        'Multiple array iterations detected. Using .filter().map() iterates the array twice. Consider using .reduce() or a single loop for better performance.',
        code,
        undefined,
        this.createImpact(5, '~50% faster for large arrays with single iteration', 80, 'performance', 'easy', {
          currentIterations: 2,
          optimalIterations: 1,
          performanceGain: '~50% faster',
        })
      );

      this.issues.push(issue);
    }
  }

  private checkNestedArrayMethods(path: any, context: AnalysisContext): void {
    const node = path.node;
    
    if (['map', 'filter', 'forEach'].includes(node.callee?.property?.name)) {
      let hasNestedArrayMethod = false;

      traverse(node, {
        CallExpression: (innerPath: any) => {
          if (innerPath.node !== node && 
              ['map', 'filter', 'forEach', 'find', 'some', 'every'].includes(
                innerPath.node.callee?.property?.name
              )) {
            hasNestedArrayMethod = true;
          }
        },
      }, path.scope);

      if (hasNestedArrayMethod) {
        const lineNumber = node.loc?.start.line || 0;
        const code = this.getCode(node, context.sourceCode);

        const issue = this.createIssue(
          'nested_array_methods',
          'high',
          context,
          lineNumber,
          'Nested Array Methods Detected',
          'Nested array methods create O(n²) or worse complexity. Consider flattening the logic or using more efficient data structures.',
          code,
          undefined,
          this.createImpact(7, 'O(n²) complexity causes exponential slowdown', 75, 'complexity', 'moderate', {
            complexity: 'O(n²) or worse',
            recommendation: 'Use Map/Set for lookups, or flatten the logic',
          })
        );

        this.issues.push(issue);
      }
    }
  }

  private checkArrayPushInLoop(path: any, context: AnalysisContext): void {
    let hasPush = false;

    traverse(path.node, {
      CallExpression: (innerPath: any) => {
        if (innerPath.node.callee?.property?.name === 'push') {
          hasPush = true;
        }
      },
    }, path.scope);

    if (hasPush) {
      const lineNumber = path.node.loc?.start.line || 0;
      const code = this.getCode(path.node, context.sourceCode);

      const issue = this.createIssue(
        'array_push_in_loop',
        'low',
        context,
        lineNumber,
        'Array.push() in Loop',
        'Using array.push() in a loop is less efficient than using array methods like .map() or pre-allocating the array size.',
        code,
        undefined,
        this.createImpact(3, 'Minor performance impact, better patterns available', 60, 'performance', 'easy', {
          suggestion: 'Consider using .map(), .filter(), or pre-allocate array size',
        })
      );

      this.issues.push(issue);
    }
  }

  private checkDOMManipulationInLoop(path: any, context: AnalysisContext): void {
    let hasDOMManipulation = false;

    traverse(path.node, {
      CallExpression: (innerPath: any) => {
        const methodName = innerPath.node.callee?.property?.name;
        if (['appendChild', 'insertBefore', 'removeChild', 'innerHTML'].includes(methodName)) {
          hasDOMManipulation = true;
        }
      },
      MemberExpression: (innerPath: any) => {
        if (innerPath.node.property?.name === 'innerHTML') {
          hasDOMManipulation = true;
        }
      },
    }, path.scope);

    if (hasDOMManipulation) {
      const lineNumber = path.node.loc?.start.line || 0;
      const code = this.getCode(path.node, context.sourceCode);

      const issue = this.createIssue(
        'dom_manipulation_in_loop',
        'high',
        context,
        lineNumber,
        'DOM Manipulation in Loop',
        'DOM manipulation in loops causes multiple reflows/repaints. Use DocumentFragment or build HTML string first.',
        code,
        undefined,
        this.createImpact(8, 'Multiple browser reflows cause severe UI jank', 90, 'performance', 'moderate', {
          impact: 'Causes multiple browser reflows',
          solution: 'Use DocumentFragment or batch DOM updates',
        })
      );

      this.issues.push(issue);
    }
  }

  private checkAwaitInLoop(path: any, context: AnalysisContext): void {
    let awaitCount = 0;

    traverse(path.node, {
      AwaitExpression: () => {
        awaitCount++;
      },
    }, path.scope);

    if (awaitCount > 0) {
      const lineNumber = path.node.loc?.start.line || 0;
      const code = this.getCode(path.node, context.sourceCode);

      const issue = this.createIssue(
        'await_in_loop',
        'high',
        context,
        lineNumber,
        'Await Inside Loop',
        `Found ${awaitCount} await expression(s) inside loop. This executes promises sequentially instead of in parallel. Use Promise.all() or Promise.allSettled() to run promises concurrently.`,
        code,
        undefined,
        this.createImpact(8, 'Sequential execution causes unnecessary delays', 90, 'performance', 'easy', {
          awaitCount,
          impact: 'Sequential execution instead of parallel',
          solution: 'Use Promise.all() to run promises concurrently',
        })
      );

      this.issues.push(issue);
    }
  }

  private checkStringConcatInLoop(path: any, context: AnalysisContext): void {
    let hasConcatenation = false;

    traverse(path.node, {
      BinaryExpression: (innerPath: any) => {
        if (innerPath.node.operator === '+' && 
            (innerPath.node.left.type === 'StringLiteral' || innerPath.node.right.type === 'StringLiteral')) {
          hasConcatenation = true;
        }
      },
      AssignmentExpression: (innerPath: any) => {
        if (innerPath.node.operator === '+=' && innerPath.node.left.type === 'Identifier') {
          hasConcatenation = true;
        }
      },
    }, path.scope);

    if (hasConcatenation) {
      const lineNumber = path.node.loc?.start.line || 0;
      const code = this.getCode(path.node, context.sourceCode);

      const issue = this.createIssue(
        'string_concat_in_loop',
        'medium',
        context,
        lineNumber,
        'String Concatenation in Loop',
        'String concatenation in loops creates new string objects on each iteration. Use array.push() and join() for better performance.',
        code,
        undefined,
        this.createImpact(5, 'Repeated string allocation causes memory churn', 70, 'performance', 'easy', {
          impact: 'Creates new string objects on each iteration',
          solution: 'Use array.push() and array.join() instead',
        })
      );

      this.issues.push(issue);
    }
  }

  private checkRegexInLoop(path: any, context: AnalysisContext): void {
    let hasRegexCreation = false;

    traverse(path.node, {
      NewExpression: (innerPath: any) => {
        if (innerPath.node.callee?.name === 'RegExp') {
          hasRegexCreation = true;
        }
      },
      CallExpression: (innerPath: any) => {
        const methodName = innerPath.node.callee?.property?.name;
        if (['match', 'test', 'exec', 'search', 'replace'].includes(methodName)) {
          const arg = innerPath.node.arguments?.[0];
          if (arg?.type === 'RegExpLiteral') {
            hasRegexCreation = true;
          }
        }
      },
    }, path.scope);

    if (hasRegexCreation) {
      const lineNumber = path.node.loc?.start.line || 0;
      const code = this.getCode(path.node, context.sourceCode);

      const issue = this.createIssue(
        'regex_compilation_in_loop',
        'medium',
        context,
        lineNumber,
        'Regex Compilation in Loop',
        'Compiling regex patterns inside loops is inefficient. Move regex creation outside the loop and reuse the compiled pattern.',
        code,
        undefined,
        this.createImpact(5, 'Repeated regex compilation overhead', 75, 'performance', 'trivial', {
          impact: 'Regex compiled on every iteration',
          solution: 'Move regex declaration outside loop',
        })
      );

      this.issues.push(issue);
    }
  }

  private checkJSONOperationsInLoop(path: any, context: AnalysisContext): void {
    let hasJSONOps = false;

    traverse(path.node, {
      CallExpression: (innerPath: any) => {
        const callee = innerPath.node.callee;
        if (callee?.object?.name === 'JSON' && 
            ['parse', 'stringify'].includes(callee.property?.name)) {
          hasJSONOps = true;
        }
      },
    }, path.scope);

    if (hasJSONOps) {
      const lineNumber = path.node.loc?.start.line || 0;
      const code = this.getCode(path.node, context.sourceCode);

      const issue = this.createIssue(
        'json_operations_in_loop',
        'high',
        context,
        lineNumber,
        'JSON Operations in Loop',
        'JSON.parse() and JSON.stringify() are expensive operations. Avoid calling them repeatedly in loops, especially for large objects.',
        code,
        undefined,
        this.createImpact(7, 'Expensive serialization/deserialization overhead', 85, 'performance', 'easy', {
          impact: 'CPU-intensive JSON operations on every iteration',
          solution: 'Move JSON operations outside loop or batch process',
        })
      );

      this.issues.push(issue);
    }
  }

  private checkIncludesIndexOfInLoop(path: any, context: AnalysisContext): void {
    let lookupCount = 0;
    const lookupMethods = ['includes', 'indexOf', 'lastIndexOf', 'find', 'findIndex'];

    traverse(path.node, {
      CallExpression: (innerPath: any) => {
        const methodName = innerPath.node.callee?.property?.name;
        if (lookupMethods.includes(methodName)) {
          lookupCount++;
        }
      },
    }, path.scope);

    if (lookupCount > 0) {
      const lineNumber = path.node.loc?.start.line || 0;
      const code = this.getCode(path.node, context.sourceCode);

      const issue = this.createIssue(
        'array_lookup_in_loop',
        'high',
        context,
        lineNumber,
        'Array Lookup Methods in Loop',
        `Found ${lookupCount} array lookup operation(s) (includes/indexOf/find) inside loop. This creates O(n²) complexity. Use Set or Map for O(1) lookups instead.`,
        code,
        undefined,
        this.createImpact(7, 'O(n²) complexity from nested array searches', 85, 'complexity', 'easy', {
          lookupCount,
          complexity: 'O(n²)',
          currentApproach: 'Array linear search',
          recommendation: 'Use Set for membership checks or Map for key-value lookups',
        })
      );

      this.issues.push(issue);
    }
  }

  private checkNestedForLoops(path: any, context: AnalysisContext): void {
    let nestedLoopDepth = 0;

    const countNestedLoops = (node: any, depth: number): number => {
      let maxDepth = depth;
      traverse(node, {
        ForStatement: (innerPath: any) => {
          if (innerPath.node !== node) {
            const innerDepth = countNestedLoops(innerPath.node, depth + 1);
            maxDepth = Math.max(maxDepth, innerDepth);
            innerPath.skip();
          }
        },
        ForOfStatement: (innerPath: any) => {
          if (innerPath.node !== node) {
            const innerDepth = countNestedLoops(innerPath.node, depth + 1);
            maxDepth = Math.max(maxDepth, innerDepth);
            innerPath.skip();
          }
        },
        ForInStatement: (innerPath: any) => {
          if (innerPath.node !== node) {
            const innerDepth = countNestedLoops(innerPath.node, depth + 1);
            maxDepth = Math.max(maxDepth, innerDepth);
            innerPath.skip();
          }
        },
        WhileStatement: (innerPath: any) => {
          if (innerPath.node !== node) {
            const innerDepth = countNestedLoops(innerPath.node, depth + 1);
            maxDepth = Math.max(maxDepth, innerDepth);
            innerPath.skip();
          }
        },
      }, path.scope);
      return maxDepth;
    };

    nestedLoopDepth = countNestedLoops(path.node, 1);

    if (nestedLoopDepth >= 2) {
      const lineNumber = path.node.loc?.start.line || 0;
      const code = this.getCode(path.node, context.sourceCode);
      const complexity = nestedLoopDepth === 2 ? 'O(n²)' : nestedLoopDepth === 3 ? 'O(n³)' : `O(n^${nestedLoopDepth})`;
      const severity = nestedLoopDepth >= 3 ? 'critical' : 'high';

      const issue = this.createIssue(
        'nested_loops',
        severity,
        context,
        lineNumber,
        `Nested Loops Detected (${nestedLoopDepth} levels)`,
        `Found ${nestedLoopDepth} levels of nested loops creating ${complexity} complexity. Consider algorithmic improvements like using hash maps, memoization, or restructuring the data.`,
        code,
        undefined,
        this.createImpact(
          nestedLoopDepth >= 3 ? 9 : 7,
          `${complexity} complexity causes exponential performance degradation`,
          90,
          'complexity',
          nestedLoopDepth >= 3 ? 'complex' : 'moderate',
          {
            nestedDepth: nestedLoopDepth,
            complexity,
            impact: 'Exponential time complexity',
            recommendation: 'Use hash maps, memoization, or restructure algorithm',
          }
        )
      );

      this.issues.push(issue);
    }
  }

  private checkObjectKeysWithLookups(path: any, context: AnalysisContext): void {
    let hasObjectKeysWithLookup = false;

    traverse(path.node, {
      CallExpression: (outerPath: any) => {
        if (outerPath.node.callee?.object?.name === 'Object' &&
            outerPath.node.callee?.property?.name === 'keys') {
          traverse(outerPath.parent, {
            CallExpression: (innerPath: any) => {
              const methodName = innerPath.node.callee?.property?.name;
              if (['includes', 'indexOf', 'find'].includes(methodName)) {
                hasObjectKeysWithLookup = true;
              }
            },
          }, path.scope);
        }
      },
    }, path.scope);

    if (hasObjectKeysWithLookup) {
      const lineNumber = path.node.loc?.start.line || 0;
      const code = this.getCode(path.node, context.sourceCode);

      const issue = this.createIssue(
        'object_keys_with_lookup',
        'high',
        context,
        lineNumber,
        'Object.keys() with Array Lookups',
        'Using Object.keys() followed by array lookups creates O(n²) complexity. Use direct object property access or Map for better performance.',
        code,
        undefined,
        this.createImpact(7, 'O(n²) from Object.keys + array search', 80, 'complexity', 'easy', {
          complexity: 'O(n²)',
          recommendation: 'Use direct object property access or Map',
        })
      );

      this.issues.push(issue);
    }
  }

  private checkSyncFileIOInLoop(path: any, context: AnalysisContext): void {
    let hasSyncIO = false;
    const syncMethods = ['readFileSync', 'writeFileSync', 'appendFileSync', 'existsSync', 'statSync'];

    traverse(path.node, {
      CallExpression: (innerPath: any) => {
        const callee = innerPath.node.callee;
        if (syncMethods.includes(callee?.property?.name) || syncMethods.includes(callee?.name)) {
          hasSyncIO = true;
        }
      },
    }, path.scope);

    if (hasSyncIO) {
      const lineNumber = path.node.loc?.start.line || 0;
      const code = this.getCode(path.node, context.sourceCode);

      const issue = this.createIssue(
        'sync_file_io_in_loop',
        'critical',
        context,
        lineNumber,
        'Synchronous File I/O in Loop',
        'Synchronous file operations block the event loop. Use async file operations with Promise.all() to process files concurrently.',
        code,
        undefined,
        this.createImpact(9, 'Blocks event loop causing severe performance degradation', 95, 'performance', 'moderate', {
          impact: 'Blocks event loop on every iteration',
          solution: 'Use async file operations with Promise.all()',
        })
      );

      this.issues.push(issue);
    }
  }

  private getCode(node: any, sourceCode: string): string {
    if (!node.start || !node.end) {
      return '';
    }
    return sourceCode.substring(node.start, node.end);
  }
}
