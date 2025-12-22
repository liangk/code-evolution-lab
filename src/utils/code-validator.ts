import { parseCode, validateCode as astValidate } from './ast-utils';
import * as t from '@babel/types';

/**
 * Code Validation Utility
 * Validates generated code for syntax correctness and basic semantic checks
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Comprehensive code validation
 */
export function validateGeneratedCode(code: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Syntax validation
  const syntaxCheck = astValidate(code);
  if (!syntaxCheck.valid) {
    errors.push(`Syntax error: ${syntaxCheck.error}`);
    return { valid: false, errors, warnings };
  }

  try {
    const ast = parseCode(code);

    // 2. Check for undefined variables (basic check)
    const undefinedVars = checkUndefinedVariables(ast);
    if (undefinedVars.length > 0) {
      warnings.push(`Potentially undefined variables: ${undefinedVars.join(', ')}`);
    }

    // 3. Check for unreachable code
    const unreachable = checkUnreachableCode(ast);
    if (unreachable) {
      warnings.push('Contains unreachable code');
    }

    // 4. Check for empty blocks
    const emptyBlocks = checkEmptyBlocks(ast);
    if (emptyBlocks > 0) {
      warnings.push(`Contains ${emptyBlocks} empty block(s)`);
    }

  } catch (error) {
    errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
    return { valid: false, errors, warnings };
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Check for potentially undefined variables (simplified)
 */
function checkUndefinedVariables(ast: t.File): string[] {
  const declared = new Set<string>();
  const used = new Set<string>();
  const undefined: string[] = [];

  // Collect declared variables
  const collectDeclarations = (node: t.Node) => {
    if (t.isVariableDeclarator(node) && t.isIdentifier(node.id)) {
      declared.add(node.id.name);
    }
    if (t.isFunctionDeclaration(node) && node.id) {
      declared.add(node.id.name);
    }
    if (t.isImportSpecifier(node) && t.isIdentifier(node.local)) {
      declared.add(node.local.name);
    }
  };

  // Collect used variables
  const collectUsages = (node: t.Node) => {
    if (t.isIdentifier(node)) {
      used.add(node.name);
    }
  };

  // Traverse AST
  const traverse = (node: any) => {
    if (!node || typeof node !== 'object') return;
    
    collectDeclarations(node);
    collectUsages(node);

    for (const key in node) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(traverse);
      } else if (child && typeof child === 'object') {
        traverse(child);
      }
    }
  };

  traverse(ast);

  // Find undefined (used but not declared)
  // Exclude common globals
  const globals = new Set(['console', 'window', 'document', 'process', 'require', 'module', 'exports', 'db', 'prisma']);
  
  for (const name of used) {
    if (!declared.has(name) && !globals.has(name)) {
      undefined.push(name);
    }
  }

  return undefined;
}

/**
 * Check for unreachable code after return statements
 */
function checkUnreachableCode(ast: t.File): boolean {
  let hasUnreachable = false;

  const checkBlock = (statements: t.Statement[]) => {
    let foundReturn = false;
    for (const stmt of statements) {
      if (foundReturn && !t.isFunctionDeclaration(stmt)) {
        hasUnreachable = true;
        return;
      }
      if (t.isReturnStatement(stmt) || t.isThrowStatement(stmt)) {
        foundReturn = true;
      }
    }
  };

  const traverse = (node: any) => {
    if (!node || typeof node !== 'object') return;

    if (t.isBlockStatement(node)) {
      checkBlock(node.body);
    }

    for (const key in node) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(traverse);
      } else if (child && typeof child === 'object') {
        traverse(child);
      }
    }
  };

  traverse(ast);
  return hasUnreachable;
}

/**
 * Check for empty blocks
 */
function checkEmptyBlocks(ast: t.File): number {
  let count = 0;

  const traverse = (node: any) => {
    if (!node || typeof node !== 'object') return;

    if (t.isBlockStatement(node) && node.body.length === 0) {
      count++;
    }

    for (const key in node) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(traverse);
      } else if (child && typeof child === 'object') {
        traverse(child);
      }
    }
  };

  traverse(ast);
  return count;
}

/**
 * Quick syntax-only validation
 */
export function isValidSyntax(code: string): boolean {
  return astValidate(code).valid;
}

/**
 * Validate that code compiles to valid JavaScript
 */
export function canCompile(code: string): boolean {
  try {
    parseCode(code);
    return true;
  } catch {
    return false;
  }
}
