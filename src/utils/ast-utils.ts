import { parse } from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';

/**
 * AST Utility Module
 * Provides functions for parsing, traversing, and generating code using Babel
 */

export interface ParseOptions {
  sourceType?: 'module' | 'script' | 'unambiguous';
  plugins?: any[];
}

/**
 * Parse code string into AST
 */
export function parseCode(code: string, options: ParseOptions = {}): t.File {
  const defaultOptions: any = {
    sourceType: 'module',
    plugins: [
      'typescript',
      'jsx',
      'decorators-legacy',
      'classProperties',
      'objectRestSpread',
      'asyncGenerators',
      'dynamicImport',
      'optionalChaining',
      'nullishCoalescingOperator'
    ]
  };

  try {
    return parse(code, { ...defaultOptions, ...options });
  } catch (error) {
    throw new Error(`Failed to parse code: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generate code from AST
 */
export function generateCode(ast: t.Node): string {
  try {
    const result = generate(ast, {
      retainLines: false,
      compact: false,
      concise: false,
      comments: true
    });
    return result.code;
  } catch (error) {
    throw new Error(`Failed to generate code: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate that code is syntactically correct
 */
export function validateCode(code: string): { valid: boolean; error?: string } {
  try {
    parseCode(code);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Quick syntax validation (returns boolean)
 */
export function isValidSyntax(code: string): boolean {
  return validateCode(code).valid;
}

/**
 * Get all variable declarations in the code
 */
export function getVariableDeclarations(ast: t.File): Array<{ name: string; path: NodePath }> {
  const declarations: Array<{ name: string; path: NodePath }> = [];

  traverse(ast, {
    VariableDeclarator(path) {
      if (t.isIdentifier(path.node.id)) {
        declarations.push({
          name: path.node.id.name,
          path: path as any
        });
      }
    },
    FunctionDeclaration(path) {
      if (path.node.id && t.isIdentifier(path.node.id)) {
        declarations.push({
          name: path.node.id.name,
          path: path as any
        });
      }
    }
  });

  return declarations;
}

/**
 * Get all function calls in the code
 */
export function getFunctionCalls(ast: t.File): Array<{ name: string; path: NodePath; args: t.Node[] }> {
  const calls: Array<{ name: string; path: NodePath; args: t.Node[] }> = [];

  traverse(ast, {
    CallExpression(path) {
      let name = '';
      
      if (t.isIdentifier(path.node.callee)) {
        name = path.node.callee.name;
      } else if (t.isMemberExpression(path.node.callee)) {
        if (t.isIdentifier(path.node.callee.property)) {
          name = path.node.callee.property.name;
        }
      }

      if (name) {
        calls.push({
          name,
          path: path as any,
          args: path.node.arguments as t.Node[]
        });
      }
    }
  });

  return calls;
}

/**
 * Find all identifiers with a specific name
 */
export function findIdentifiers(ast: t.File, name: string): NodePath[] {
  const identifiers: NodePath[] = [];

  traverse(ast, {
    Identifier(path) {
      if (path.node.name === name) {
        identifiers.push(path as any);
      }
    }
  });

  return identifiers;
}

/**
 * Rename all occurrences of a variable
 */
export function renameVariable(ast: t.File, oldName: string, newName: string): t.File {
  const clonedAst = t.cloneNode(ast, true, true) as t.File;

  traverse(clonedAst, {
    Identifier(path) {
      if (path.node.name === oldName) {
        // Only rename if it's not a property key
        if (!t.isMemberExpression(path.parent) || path.parent.object === path.node) {
          path.node.name = newName;
        }
      }
    }
  });

  return clonedAst;
}

/**
 * Get all statements from the AST body
 */
export function getStatements(ast: t.File): t.Statement[] {
  return ast.program.body;
}

/**
 * Clone an AST node deeply
 */
export function cloneAST<T extends t.Node>(node: T): T {
  return t.cloneNode(node, true, true) as T;
}

/**
 * Check if code contains async/await patterns
 */
export function hasAsyncAwait(ast: t.File): boolean {
  let hasAsync = false;

  traverse(ast, {
    AwaitExpression() {
      hasAsync = true;
    },
    ArrowFunctionExpression(path) {
      if (path.node.async) {
        hasAsync = true;
      }
    },
    FunctionDeclaration(path) {
      if (path.node.async) {
        hasAsync = true;
      }
    },
    FunctionExpression(path) {
      if (path.node.async) {
        hasAsync = true;
      }
    }
  });

  return hasAsync;
}

/**
 * Extract object properties from an object expression
 */
export function getObjectProperties(node: t.ObjectExpression): Array<{ key: string; value: t.Node }> {
  const properties: Array<{ key: string; value: t.Node }> = [];

  for (const prop of node.properties) {
    if (t.isObjectProperty(prop)) {
      let key = '';
      if (t.isIdentifier(prop.key)) {
        key = prop.key.name;
      } else if (t.isStringLiteral(prop.key)) {
        key = prop.key.value;
      }
      
      if (key) {
        properties.push({ key, value: prop.value });
      }
    }
  }

  return properties;
}

/**
 * Find database query calls (Prisma, Sequelize, Mongoose)
 */
export function findDatabaseQueries(ast: t.File): Array<{ type: string; method: string; path: NodePath }> {
  const queries: Array<{ type: string; method: string; path: NodePath }> = [];

  traverse(ast, {
    CallExpression(path) {
      if (t.isMemberExpression(path.node.callee)) {
        const prop = path.node.callee.property;

        if (t.isIdentifier(prop)) {
          const method = prop.name;
          
          // Prisma patterns
          if (method.match(/^(findMany|findUnique|findFirst|create|update|delete|upsert)$/)) {
            queries.push({ type: 'prisma', method, path: path as any });
          }
          
          // Sequelize patterns
          if (method.match(/^(findAll|findOne|findByPk|create|update|destroy)$/)) {
            queries.push({ type: 'sequelize', method, path: path as any });
          }
          
          // Mongoose patterns
          if (method.match(/^(find|findOne|findById|create|updateOne|deleteOne)$/)) {
            queries.push({ type: 'mongoose', method, path: path as any });
          }
        }
      }
    }
  });

  return queries;
}

/**
 * Check if a node is inside a loop
 */
export function isInsideLoop(path: NodePath): boolean {
  let current = path.parentPath;
  
  while (current) {
    if (
      current.isForStatement() ||
      current.isWhileStatement() ||
      current.isDoWhileStatement() ||
      current.isForInStatement() ||
      current.isForOfStatement()
    ) {
      return true;
    }
    current = current.parentPath;
  }
  
  return false;
}

/**
 * Get the scope bindings for a path
 */
export function getScopeBindings(path: NodePath): Map<string, any> {
  const bindings = new Map();
  const scope = path.scope;
  
  for (const name in scope.bindings) {
    bindings.set(name, scope.bindings[name]);
  }
  
  return bindings;
}
