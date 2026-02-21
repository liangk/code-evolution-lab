import { parseCode, validateCode as astValidate, generateCode } from './ast-utils';
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
 * Text-based pre-fix for duplicate declarations (handles unparseable code)
 */
function textBasedDuplicateFix(code: string): { code: string; fixed: boolean } {
  const lines = code.split('\n');
  const declarations = new Map<string, number>();
  let fixed = false;
  let globalCounter = 0;
  
  const fixedLines = lines.map(line => {
    // Match variable declarations: const/let/var identifier =
    // This regex handles whitespace and ensures word boundaries
    const matches = Array.from(line.matchAll(/\b(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g));
    
    if (matches.length === 0) {
      return line;
    }
    
    let modifiedLine = line;
    // Process matches in reverse order to maintain correct positions
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      const keyword = match[1];
      const varName = match[2];
      const matchIndex = match.index!;
      
      const count = declarations.get(varName) || 0;
      
      if (count > 0) {
        // Rename duplicate
        const newName = `${varName}_${globalCounter++}`;
        declarations.set(newName, 1);
        fixed = true;
        
        // Replace this specific occurrence
        const before = modifiedLine.substring(0, matchIndex);
        const after = modifiedLine.substring(matchIndex + match[0].length);
        modifiedLine = before + `${keyword} ${newName} =` + after;
      } else {
        declarations.set(varName, count + 1);
      }
    }
    
    return modifiedLine;
  });
  
  return { code: fixedLines.join('\n'), fixed };
}

/**
 * Comprehensive code validation
 * Auto-fixes duplicate declarations before validation
 */
export function validateGeneratedCode(code: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 0. Pre-fix duplicates before parsing (handles unparseable code)
  const fixResult = textBasedDuplicateFix(code);
  const codeToValidate = fixResult.code;
  
  if (fixResult.fixed) {
    warnings.push('Auto-fixed duplicate variable declarations');
  }

  // 1. Syntax validation
  const syntaxCheck = astValidate(codeToValidate);
  if (!syntaxCheck.valid) {
    errors.push(`Syntax error: ${syntaxCheck.error}`);
    return { valid: false, errors, warnings };
  }

  try {
    const ast = parseCode(codeToValidate);

    // 2. Check for duplicate declarations (should be fixed by now, but double-check)
    const duplicates = checkDuplicateDeclarations(ast);
    if (duplicates.length > 0) {
      errors.push(`Duplicate declarations: ${duplicates.join(', ')}`);
    }

    // 3. Check for undefined variables (basic check)
    const undefinedVars = checkUndefinedVariables(ast);
    if (undefinedVars.length > 0) {
      warnings.push(`Potentially undefined variables: ${undefinedVars.join(', ')}`);
    }

    // 4. Check for unreachable code
    const unreachable = checkUnreachableCode(ast);
    if (unreachable) {
      warnings.push('Contains unreachable code');
    }

    // 5. Check for empty blocks
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
 * Check for duplicate variable declarations in the same scope
 */
function checkDuplicateDeclarations(ast: t.File): string[] {
  const duplicates: string[] = [];
  
  const traverse = (node: any, scopeDeclarations: Set<string>) => {
    if (!node || typeof node !== 'object') return;

    // Track declarations in current scope
    const currentScopeDeclarations = new Set(scopeDeclarations);
    let isNewScope = false;

    // Check if this creates a new scope
    if (t.isFunctionDeclaration(node) || t.isFunctionExpression(node) || 
        t.isArrowFunctionExpression(node) || t.isBlockStatement(node)) {
      isNewScope = true;
      // For new scopes, start fresh (but inherit from parent for lookups)
      currentScopeDeclarations.clear();
    }

    // Check variable declarations
    if (t.isVariableDeclaration(node)) {
      for (const declarator of node.declarations) {
        if (t.isIdentifier(declarator.id)) {
          const varName = declarator.id.name;
          if (currentScopeDeclarations.has(varName)) {
            duplicates.push(varName);
          } else {
            currentScopeDeclarations.add(varName);
          }
        }
      }
    }

    // Check function declarations
    if (t.isFunctionDeclaration(node) && node.id) {
      const funcName = node.id.name;
      if (scopeDeclarations.has(funcName)) {
        duplicates.push(funcName);
      } else {
        scopeDeclarations.add(funcName);
      }
    }

    // Check class declarations
    if (t.isClassDeclaration(node) && node.id) {
      const className = node.id.name;
      if (scopeDeclarations.has(className)) {
        duplicates.push(className);
      } else {
        scopeDeclarations.add(className);
      }
    }

    // Traverse children with appropriate scope
    for (const key in node) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(c => traverse(c, isNewScope ? currentScopeDeclarations : scopeDeclarations));
      } else if (child && typeof child === 'object') {
        traverse(child, isNewScope ? currentScopeDeclarations : scopeDeclarations);
      }
    }
  };

  traverse(ast, new Set());
  return [...new Set(duplicates)];
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

/**
 * Auto-fix duplicate variable declarations by renaming them
 * Uses text-based approach first, then AST-based for validation
 */
export function fixDuplicateDeclarations(code: string): { code: string; fixed: boolean } {
  // First try text-based fix (works even if code is unparseable)
  const textFix = textBasedDuplicateFix(code);
  
  try {
    // Try to parse the result
    const ast = parseCode(textFix.code);
    let counter = 0;
    let astFixed = false;
    
    const renameDuplicates = (node: any, scopeDeclarations: Map<string, number>) => {
      if (!node || typeof node !== 'object') return;

      // Track declarations in current scope
      const currentScopeDeclarations = new Map(scopeDeclarations);
      let isNewScope = false;

      // Check if this creates a new scope
      if (t.isFunctionDeclaration(node) || t.isFunctionExpression(node) || 
          t.isArrowFunctionExpression(node) || t.isBlockStatement(node)) {
        isNewScope = true;
        currentScopeDeclarations.clear();
      }

      // Fix variable declarations
      if (t.isVariableDeclaration(node)) {
        for (const declarator of node.declarations) {
          if (t.isIdentifier(declarator.id)) {
            const varName = declarator.id.name;
            const count = currentScopeDeclarations.get(varName) || 0;
            
            if (count > 0) {
              // Rename duplicate
              const newName = `${varName}_${counter++}`;
              declarator.id.name = newName;
              currentScopeDeclarations.set(newName, 1);
              astFixed = true;
            } else {
              currentScopeDeclarations.set(varName, 1);
            }
          }
        }
      }

      // Traverse children with appropriate scope
      for (const key in node) {
        if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue;
        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach(c => renameDuplicates(c, isNewScope ? currentScopeDeclarations : scopeDeclarations));
        } else if (child && typeof child === 'object') {
          renameDuplicates(child, isNewScope ? currentScopeDeclarations : scopeDeclarations);
        }
      }
    };

    renameDuplicates(ast, new Map());
    
    if (astFixed) {
      const fixedCode = generateCode(ast);
      return { code: fixedCode, fixed: true };
    }
    
    return textFix;
  } catch (error) {
    // If AST approach fails, return text-based fix
    return textFix;
  }
}
