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
      },

      ForOfStatement: (path: any) => {
        this.checkArrayPushInLoop(path, context);
        this.checkDOMManipulationInLoop(path, context);
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
        this.createImpact(5, '~50% faster for large arrays with single iteration', 80, {
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
          this.createImpact(7, 'O(n²) complexity causes exponential slowdown', 75, {
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
        this.createImpact(3, 'Minor performance impact, better patterns available', 60, {
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
        this.createImpact(8, 'Multiple browser reflows cause severe UI jank', 90, {
          impact: 'Causes multiple browser reflows',
          solution: 'Use DocumentFragment or batch DOM updates',
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
