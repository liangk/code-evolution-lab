import * as t from '@babel/types';
import traverse from '@babel/traverse';
import { parseCode, generateCode, cloneAST, findDatabaseQueries, getObjectProperties } from '../utils/ast-utils';
import { validateGeneratedCode } from '../utils/code-validator';

/**
 * Mutation Operators for Evolutionary Algorithm
 * Each operator applies a specific type of code transformation
 */

export interface MutationResult {
  code: string;
  success: boolean;
  description: string;
  ast?: t.File;
}

/**
 * 1. Variable Name Mutation
 * Renames variables to improve readability or avoid conflicts
 */
export function mutateVariableName(code: string): MutationResult {
  try {
    const ast = parseCode(code);
    const cloned = cloneAST(ast);
    
    // Find all variable declarations
    const variables: string[] = [];
    traverse(cloned, {
      VariableDeclarator(path) {
        if (t.isIdentifier(path.node.id)) {
          variables.push(path.node.id.name);
        }
      }
    });

    if (variables.length === 0) {
      return { code, success: false, description: 'No variables to rename' };
    }

    // Pick a random variable to rename
    const oldName = variables[Math.floor(Math.random() * variables.length)];
    const newName = generateNewVariableName(oldName);

    // Rename all occurrences
    let renamed = false;
    traverse(cloned, {
      Identifier(path) {
        if (path.node.name === oldName) {
          // Only rename if it's not a property key
          const parent = path.parent;
          if (!t.isMemberExpression(parent) || parent.object === path.node) {
            path.node.name = newName;
            renamed = true;
          }
        }
      }
    });

    if (!renamed) {
      return { code, success: false, description: 'Failed to rename variable' };
    }

    const newCode = generateCode(cloned);
    const validation = validateGeneratedCode(newCode);

    if (!validation.valid) {
      return { code, success: false, description: `Validation failed: ${validation.errors.join(', ')}` };
    }

    return {
      code: newCode,
      success: true,
      description: `Renamed variable '${oldName}' to '${newName}'`,
      ast: cloned
    };
  } catch (error) {
    return {
      code,
      success: false,
      description: `Mutation error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Generate a new variable name based on the old one
 */
function generateNewVariableName(oldName: string): string {
  const suffixes = ['New', 'Updated', 'Modified', 'Alt', 'V2'];
  const prefixes = ['my', 'the', 'current', 'temp'];
  
  // Try adding suffix
  if (Math.random() > 0.5) {
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    return oldName + suffix;
  }
  
  // Try adding prefix
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  return prefix + oldName.charAt(0).toUpperCase() + oldName.slice(1);
}

/**
 * 2. Query Parameter Mutation
 * Modifies database query parameters (include, select, where, etc.)
 */
export function mutateQueryParameter(code: string): MutationResult {
  try {
    const ast = parseCode(code);
    const cloned = cloneAST(ast);
    
    const queries = findDatabaseQueries(cloned);
    
    if (queries.length === 0) {
      return { code, success: false, description: 'No database queries found' };
    }

    // Pick a random query to mutate
    const query = queries[Math.floor(Math.random() * queries.length)];
    let mutated = false;
    let mutationDesc = '';

    traverse(cloned, {
      CallExpression(path) {
        if (path === query.path && path.node.arguments.length > 0) {
          const arg = path.node.arguments[0];
          
          if (t.isObjectExpression(arg)) {
            mutated = mutateQueryObject(arg);
            if (mutated) {
              mutationDesc = `Modified ${query.type} query parameters`;
            }
          }
        }
      }
    });

    if (!mutated) {
      return { code, success: false, description: 'Failed to mutate query parameters' };
    }

    const newCode = generateCode(cloned);
    const validation = validateGeneratedCode(newCode);

    if (!validation.valid) {
      return { code, success: false, description: `Validation failed: ${validation.errors.join(', ')}` };
    }

    return {
      code: newCode,
      success: true,
      description: mutationDesc,
      ast: cloned
    };
  } catch (error) {
    return {
      code,
      success: false,
      description: `Mutation error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Mutate a query object (add/remove/modify properties)
 */
function mutateQueryObject(obj: t.ObjectExpression): boolean {
  const properties = getObjectProperties(obj);
  
  if (properties.length === 0) {
    return false;
  }

  const mutations = [
    // Add 'select' if not present
    () => {
      if (!properties.some(p => p.key === 'select')) {
        obj.properties.push(
          t.objectProperty(
            t.identifier('select'),
            t.objectExpression([
              t.objectProperty(t.identifier('id'), t.booleanLiteral(true)),
              t.objectProperty(t.identifier('name'), t.booleanLiteral(true))
            ])
          )
        );
        return true;
      }
      return false;
    },
    
    // Add 'take' for pagination
    () => {
      if (!properties.some(p => p.key === 'take')) {
        obj.properties.push(
          t.objectProperty(
            t.identifier('take'),
            t.numericLiteral(Math.floor(Math.random() * 50) + 10)
          )
        );
        return true;
      }
      return false;
    },
    
    // Modify 'include' to add/remove relations
    () => {
      const includeProp = properties.find(p => p.key === 'include');
      if (includeProp && t.isObjectExpression(includeProp.value)) {
        const includeObj = includeProp.value;
        if (includeObj.properties.length > 0) {
          // Remove a random property
          const randomIndex = Math.floor(Math.random() * includeObj.properties.length);
          includeObj.properties.splice(randomIndex, 1);
          return true;
        }
      }
      return false;
    }
  ];

  // Try a random mutation
  const mutation = mutations[Math.floor(Math.random() * mutations.length)];
  return mutation();
}

/**
 * 3. ORM Method Mutation
 * Changes ORM method calls (e.g., findMany -> findFirst)
 */
export function mutateORMMethod(code: string): MutationResult {
  try {
    const ast = parseCode(code);
    const cloned = cloneAST(ast);
    
    const queries = findDatabaseQueries(cloned);
    
    if (queries.length === 0) {
      return { code, success: false, description: 'No database queries found' };
    }

    const query = queries[Math.floor(Math.random() * queries.length)];
    let mutated = false;
    let oldMethod = '';
    let newMethod = '';

    traverse(cloned, {
      CallExpression(path) {
        if (path === query.path) {
          const callee = path.node.callee;
          if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
            oldMethod = callee.property.name;
            newMethod = getAlternativeMethod(oldMethod, query.type);
            
            if (newMethod !== oldMethod) {
              callee.property.name = newMethod;
              mutated = true;
            }
          }
        }
      }
    });

    if (!mutated) {
      return { code, success: false, description: 'Failed to mutate ORM method' };
    }

    const newCode = generateCode(cloned);
    const validation = validateGeneratedCode(newCode);

    if (!validation.valid) {
      return { code, success: false, description: `Validation failed: ${validation.errors.join(', ')}` };
    }

    return {
      code: newCode,
      success: true,
      description: `Changed ${query.type} method from '${oldMethod}' to '${newMethod}'`,
      ast: cloned
    };
  } catch (error) {
    return {
      code,
      success: false,
      description: `Mutation error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Get an alternative ORM method
 */
function getAlternativeMethod(currentMethod: string, ormType: string): string {
  const alternatives: Record<string, Record<string, string[]>> = {
    prisma: {
      findMany: ['findFirst'],
      findFirst: ['findMany'],
      findUnique: ['findFirst']
    },
    sequelize: {
      findAll: ['findOne'],
      findOne: ['findAll']
    },
    mongoose: {
      find: ['findOne'],
      findOne: ['find']
    }
  };

  const ormAlts = alternatives[ormType];
  if (ormAlts) {
    const methodAlts = ormAlts[currentMethod];
    if (methodAlts && methodAlts.length > 0) {
      return methodAlts[Math.floor(Math.random() * methodAlts.length)];
    }
  }

  return currentMethod;
}

/**
 * 4. Add Optimization (Caching)
 * Adds simple caching logic to functions
 */
export function addOptimization(code: string): MutationResult {
  try {
    const ast = parseCode(code);
    const cloned = cloneAST(ast);
    
    let mutated = false;

    traverse(cloned, {
      FunctionDeclaration(path) {
        if (!path.node.async) return;
        
        // Add cache check at the beginning
        const cacheCheck = t.ifStatement(
          t.memberExpression(
            t.identifier('cache'),
            t.identifier('has'),
            false
          ),
          t.blockStatement([
            t.returnStatement(
              t.callExpression(
                t.memberExpression(
                  t.identifier('cache'),
                  t.identifier('get')
                ),
                [t.identifier('key')]
              )
            )
          ])
        );

        if (path.node.body.body.length > 0) {
          path.node.body.body.unshift(cacheCheck);
          mutated = true;
          path.stop();
        }
      }
    });

    if (!mutated) {
      return { code, success: false, description: 'No suitable function found for optimization' };
    }

    const newCode = generateCode(cloned);

    return {
      code: newCode,
      success: true,
      description: 'Added caching optimization',
      ast: cloned
    };
  } catch (error) {
    return {
      code,
      success: false,
      description: `Mutation error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Apply a random mutation to the code
 */
export function applyRandomMutation(code: string): MutationResult {
  const mutations = [
    mutateVariableName,
    mutateQueryParameter,
    mutateORMMethod,
    addOptimization
  ];

  // Try mutations in random order until one succeeds
  const shuffled = mutations.sort(() => Math.random() - 0.5);
  
  for (const mutation of shuffled) {
    const result = mutation(code);
    if (result.success) {
      return result;
    }
  }

  return {
    code,
    success: false,
    description: 'All mutation attempts failed'
  };
}
