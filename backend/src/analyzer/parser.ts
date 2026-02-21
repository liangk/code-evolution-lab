import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import { ParsedFunction, SourceLocation } from '../types';

export class CodeParser {
  parse(sourceCode: string, options: parser.ParserOptions = {}): any {
    try {
      return parser.parse(sourceCode, {
        sourceType: 'module',
        plugins: [
          'typescript',
          'jsx',
          'decorators-legacy',
          'classProperties',
          'asyncGenerators',
          'dynamicImport',
          'optionalChaining',
          'nullishCoalescingOperator',
        ],
        ...options,
      });
    } catch (error) {
      const err = error as Error;
      console.error('Parse error:', err.message);
      throw new Error(`Failed to parse code: ${err.message}`);
    }
  }

  traverse(ast: any, visitors: any): void {
    traverse(ast, visitors);
  }

  extractFunctions(ast: any): ParsedFunction[] {
    const functions: ParsedFunction[] = [];

    this.traverse(ast, {
      FunctionDeclaration(path: any) {
        functions.push({
          type: 'function',
          name: path.node.id?.name,
          location: path.node.loc as SourceLocation,
          async: path.node.async,
        });
      },

      ArrowFunctionExpression(path: any) {
        functions.push({
          type: 'arrow',
          location: path.node.loc as SourceLocation,
          async: path.node.async,
        });
      },

      ClassMethod(path: any) {
        functions.push({
          type: 'method',
          name: (path.node.key as any).name,
          location: path.node.loc as SourceLocation,
          async: path.node.async,
        });
      },
    });

    return functions;
  }

  getSourceCode(node: any, sourceCode: string): string {
    if (!node.start || !node.end) {
      return '';
    }
    return sourceCode.substring(node.start, node.end);
  }
}

export default new CodeParser();
