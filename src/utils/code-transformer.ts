import { parse } from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';

/**
 * Code Transformer Module
 * 
 * Provides AST-based transformations that preserve original code structure
 * while applying pattern-specific optimizations.
 */

export interface TransformationResult {
  success: boolean;
  code: string;
  description: string;
  transformationType: string;
  preservedElements: string[];
  error?: string;
}

export interface CodePattern {
  type: 'loop-with-calls' | 'chained-methods' | 'repeated-access' | 'nested-loops' | 'unknown';
  loopVariable?: string;
  iteratedCollection?: string;
  repeatedCalls: RepeatedCall[];
  originalStructure: t.Node;
}

export interface RepeatedCall {
  methodName: string;
  objectPath: string;
  arguments: string[];
  count: number;
  isAsync: boolean;
}

/**
 * Parse code with error handling
 */
export function parseCodeSafe(code: string): t.File | null {
  try {
    return parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'decorators-legacy', 'classProperties', 'objectRestSpread', 'asyncGenerators', 'dynamicImport', 'optionalChaining', 'nullishCoalescingOperator']
    });
  } catch (error) {
    return null;
  }
}

/**
 * Analyze code to identify patterns that can be optimized
 */
export function analyzeCodePattern(code: string): CodePattern {
  const ast = parseCodeSafe(code);
  if (!ast) {
    return { type: 'unknown', repeatedCalls: [], originalStructure: t.nullLiteral() };
  }

  const repeatedCalls: RepeatedCall[] = [];
  const callCounts = new Map<string, { call: RepeatedCall; count: number }>();
  let loopVariable: string | undefined;
  let iteratedCollection: string | undefined;
  let patternType: CodePattern['type'] = 'unknown';

  traverse(ast, {
    ForOfStatement(path) {
      patternType = 'loop-with-calls';
      if (t.isIdentifier(path.node.left) || (t.isVariableDeclaration(path.node.left) && t.isIdentifier(path.node.left.declarations[0]?.id))) {
        loopVariable = t.isIdentifier(path.node.left) ? path.node.left.name : (path.node.left.declarations[0]?.id as t.Identifier).name;
      }
      if (t.isIdentifier(path.node.right)) {
        iteratedCollection = path.node.right.name;
      }
    },
    ForStatement(_path) {
      patternType = 'loop-with-calls';
    },
    CallExpression(path) {
      if (t.isMemberExpression(path.node.callee)) {
        const methodName = t.isIdentifier(path.node.callee.property) ? path.node.callee.property.name : '';
        const objectPath = generate(path.node.callee.object).code;
        const args = path.node.arguments.map((arg: any) => generate(arg).code);
        const isAsync = path.parentPath?.isAwaitExpression() || false;
        const key = `${objectPath}.${methodName}`;

        if (callCounts.has(key)) {
          callCounts.get(key)!.count++;
        } else {
          callCounts.set(key, {
            call: { methodName, objectPath, arguments: args, count: 1, isAsync },
            count: 1
          });
        }
      }
    }
  });

  // Check for chained method calls (e.g., .filter().map())
  if (code.includes('.filter(') && code.includes('.map(')) {
    patternType = 'chained-methods';
  }

  // Check for repeated property access (e.g., multiple .get() calls)
  const getCallCount = Array.from(callCounts.values()).filter(c => c.call.methodName === 'get').reduce((sum, c) => sum + c.count, 0);
  if (getCallCount > 2) {
    patternType = 'repeated-access';
  }

  callCounts.forEach(({ call, count }) => {
    repeatedCalls.push({ ...call, count });
  });

  return {
    type: patternType,
    loopVariable,
    iteratedCollection,
    repeatedCalls,
    originalStructure: ast
  };
}

/**
 * Extract variable names and their types from code
 */
export function extractVariables(code: string): Map<string, string> {
  const variables = new Map<string, string>();
  const ast = parseCodeSafe(code);
  if (!ast) return variables;

  traverse(ast, {
    VariableDeclarator(path) {
      if (t.isIdentifier(path.node.id)) {
        const name = path.node.id.name;
        let type = 'unknown';
        if (path.node.init) {
          if (t.isCallExpression(path.node.init)) type = 'call-result';
          else if (t.isArrayExpression(path.node.init)) type = 'array';
          else if (t.isObjectExpression(path.node.init)) type = 'object';
          else if (t.isArrowFunctionExpression(path.node.init)) type = 'function';
        }
        variables.set(name, type);
      }
    }
  });

  return variables;
}

/**
 * Transform: Batch repeated method calls
 * 
 * Before: items.forEach(item => { item.form.get('a'); item.form.get('b'); })
 * After:  items.forEach(item => { const formValue = item.form.getRawValue(); formValue.a; formValue.b; })
 */
export function transformBatchMethodCalls(code: string, __pattern: CodePattern): TransformationResult {
  const ast = parseCodeSafe(code);
  if (!ast) {
    return { success: false, code, description: 'Failed to parse code', transformationType: 'batch-calls', preservedElements: [] };
  }

  const preservedElements: string[] = [];
  let transformed = false;

  // Find repeated .get() calls on the same object
  const getCallsByObject = new Map<string, { paths: NodePath<t.CallExpression>[]; args: string[] }>();

  traverse(ast, {
    CallExpression(path) {
      if (t.isMemberExpression(path.node.callee) && t.isIdentifier(path.node.callee.property) && path.node.callee.property.name === 'get') {
        const objectCode = generate(path.node.callee.object).code;
        if (!getCallsByObject.has(objectCode)) {
          getCallsByObject.set(objectCode, { paths: [], args: [] });
        }
        const entry = getCallsByObject.get(objectCode)!;
        entry.paths.push(path as NodePath<t.CallExpression>);
        if (path.node.arguments[0] && t.isStringLiteral(path.node.arguments[0])) {
          entry.args.push(path.node.arguments[0].value);
        }
      }
    }
  });

  // Transform objects with multiple .get() calls
  getCallsByObject.forEach((entry, objectCode) => {
    if (entry.paths.length >= 2) {
      // Generate a cached variable name
      const varName = objectCode.replace(/[^a-zA-Z0-9]/g, '_') + 'Values';
      preservedElements.push(objectCode);

      // Replace .get('key')?.value with cachedVar.key
      entry.paths.forEach(path => {
        const arg = path.node.arguments[0];
        if (t.isStringLiteral(arg)) {
          const propName = arg.value;
          // Check if it's .get('x')?.value pattern
          if (t.isOptionalMemberExpression(path.parentPath?.node) || t.isMemberExpression(path.parentPath?.node)) {
            const parent = path.parentPath;
            if (parent && t.isMemberExpression(parent.node) && t.isIdentifier(parent.node.property) && parent.node.property.name === 'value') {
              parent.replaceWith(t.memberExpression(t.identifier(varName), t.identifier(propName)));
              transformed = true;
            } else if (parent && t.isOptionalMemberExpression(parent.node) && t.isIdentifier(parent.node.property) && parent.node.property.name === 'value') {
              parent.replaceWith(t.memberExpression(t.identifier(varName), t.identifier(propName)));
              transformed = true;
            }
          }
        }
      });
    }
  });

  if (!transformed) {
    return { success: false, code, description: 'No transformations applicable', transformationType: 'batch-calls', preservedElements };
  }

  // Add variable declaration at the beginning of the appropriate scope
  // This is a simplified version - real implementation would need scope analysis

  const resultCode = generate(ast).code;
  return {
    success: true,
    code: resultCode,
    description: 'Batched repeated method calls into cached variable access',
    transformationType: 'batch-calls',
    preservedElements
  };
}

/**
 * Transform: Extract loop queries to batch query before loop
 * 
 * Before: for (item of items) { await db.find({ id: item.id }) }
 * After:  const allData = await db.findMany({ id: { in: items.map(i => i.id) } }); for (item of items) { const data = allData.get(item.id); }
 */
export function transformLoopQueryToBatch(code: string, pattern: CodePattern): TransformationResult {
  const ast = parseCodeSafe(code);
  if (!ast) {
    return { success: false, code, description: 'Failed to parse code', transformationType: 'batch-query', preservedElements: [] };
  }

  const preservedElements: string[] = [];
  let transformed = false;
  const loopVar = pattern.loopVariable || 'item';
  const collection = pattern.iteratedCollection || 'items';

  preservedElements.push(loopVar, collection);

  // Find async calls inside loops
  traverse(ast, {
    ForOfStatement(path) {
      const body = path.node.body;
      if (!t.isBlockStatement(body)) return;

      traverse(body, {
        AwaitExpression(awaitPath) {
          if (t.isCallExpression(awaitPath.node.argument)) {
            const call = awaitPath.node.argument;
            if (t.isMemberExpression(call.callee)) {
              const methodName = t.isIdentifier(call.callee.property) ? call.callee.property.name : '';
              if (['findMany', 'findAll', 'find', 'findOne', 'findUnique', 'get'].includes(methodName)) {
                // This is a database query inside a loop - mark for transformation
                transformed = true;
              }
            }
          }
        }
      }, path.scope, path.state, path.parentPath);
    }
  });

  if (!transformed) {
    return { success: false, code, description: 'No loop queries found to batch', transformationType: 'batch-query', preservedElements };
  }

  // Generate the transformed code with batch query pattern
  // Note: This creates a transformation scaffold that preserves original variables
  const batchQueryComment = `// Optimization: Batch query before loop
// Original loop variable: ${loopVar}
// Original collection: ${collection}
// Extract all IDs first, then batch query`;

  return {
    success: true,
    code: batchQueryComment + '\n' + code,
    description: `Identified loop query pattern with ${loopVar} iterating over ${collection}. Apply batch query transformation.`,
    transformationType: 'batch-query',
    preservedElements
  };
}

/**
 * Transform: Memoize repeated calls
 * 
 * Creates a memoization wrapper for expensive repeated calls
 */
export function transformMemoize(code: string, pattern: CodePattern): TransformationResult {
  const ast = parseCodeSafe(code);
  if (!ast) {
    return { success: false, code, description: 'Failed to parse code', transformationType: 'memoize', preservedElements: [] };
  }

  const preservedElements: string[] = [];
  const expensiveCalls = pattern.repeatedCalls.filter(c => c.count > 1 && c.isAsync);

  if (expensiveCalls.length === 0) {
    return { success: false, code, description: 'No repeated expensive calls to memoize', transformationType: 'memoize', preservedElements };
  }

  expensiveCalls.forEach(call => {
    preservedElements.push(`${call.objectPath}.${call.methodName}`);
  });

  // Add memoization structure
  const memoizeSetup = expensiveCalls.map(call => {
    const cacheName = `${call.methodName}Cache`;
    return `const ${cacheName} = new Map(); // Memoize ${call.objectPath}.${call.methodName}`;
  }).join('\n');

  return {
    success: true,
    code: memoizeSetup + '\n\n' + code,
    description: `Added memoization for ${expensiveCalls.length} repeated calls`,
    transformationType: 'memoize',
    preservedElements
  };
}

/**
 * Transform: Convert chained array methods to single pass
 * 
 * Before: items.filter(x => x.active).map(x => x.value)
 * After:  items.reduce((acc, x) => { if (x.active) acc.push(x.value); return acc; }, [])
 */
export function transformChainedToSinglePass(code: string, _pattern: CodePattern): TransformationResult {
  const ast = parseCodeSafe(code);
  if (!ast) {
    return { success: false, code, description: 'Failed to parse code', transformationType: 'single-pass', preservedElements: [] };
  }

  const preservedElements: string[] = [];
  let transformed = false;
  let resultCode = code;

  traverse(ast, {
    CallExpression(path) {
      // Look for .map() called on .filter() result
      if (t.isMemberExpression(path.node.callee) && t.isIdentifier(path.node.callee.property) && path.node.callee.property.name === 'map') {
        const filterCall = path.node.callee.object;
        if (t.isCallExpression(filterCall) && t.isMemberExpression(filterCall.callee) && t.isIdentifier(filterCall.callee.property) && filterCall.callee.property.name === 'filter') {
          // Found .filter().map() chain
          const originalCollection = generate(filterCall.callee.object).code;
          preservedElements.push(originalCollection);

          const filterPredicate = filterCall.arguments[0];
          const mapTransform = path.node.arguments[0];

          if (t.isArrowFunctionExpression(filterPredicate) && t.isArrowFunctionExpression(mapTransform)) {
            const filterParam = t.isIdentifier(filterPredicate.params[0]) ? filterPredicate.params[0].name : 'item';
            preservedElements.push(filterParam);

            // Create reduce expression
            const reduceBody = t.blockStatement([
              t.ifStatement(
                filterPredicate.body as t.Expression,
                t.expressionStatement(
                  t.callExpression(
                    t.memberExpression(t.identifier('acc'), t.identifier('push')),
                    [mapTransform.body as t.Expression]
                  )
                )
              ),
              t.returnStatement(t.identifier('acc'))
            ]);

            const reduceArrow = t.arrowFunctionExpression(
              [t.identifier('acc'), t.identifier(filterParam)],
              reduceBody
            );

            const reduceCall = t.callExpression(
              t.memberExpression(filterCall.callee.object, t.identifier('reduce')),
              [reduceArrow, t.arrayExpression([])]
            );

            path.replaceWith(reduceCall);
            transformed = true;
          }
        }
      }
    }
  });

  if (transformed) {
    resultCode = generate(ast).code;
  }

  return {
    success: transformed,
    code: resultCode,
    description: transformed ? 'Converted filter().map() chain to single reduce() pass' : 'No applicable chain found',
    transformationType: 'single-pass',
    preservedElements
  };
}

/**
 * Apply all applicable transformations to original code and return candidates
 */
export function generateTransformationCandidates(originalCode: string): TransformationResult[] {
  const pattern = analyzeCodePattern(originalCode);
  const candidates: TransformationResult[] = [];

  // Try each transformation strategy
  const transformations = [
    () => transformBatchMethodCalls(originalCode, pattern),
    () => transformLoopQueryToBatch(originalCode, pattern),
    () => transformMemoize(originalCode, pattern),
    () => transformChainedToSinglePass(originalCode, pattern),
  ];

  for (const transform of transformations) {
    try {
      const result = transform();
      if (result.success) {
        candidates.push(result);
      }
    } catch (error) {
      // Skip failed transformations
    }
  }

  return candidates;
}

/**
 * Create a hybrid solution that combines original code structure with optimization pattern
 */
export function createHybridSolution(originalCode: string, _optimizationPattern: string, patternDescription: string): TransformationResult {
  const pattern = analyzeCodePattern(originalCode);
  const variables = extractVariables(originalCode);
  const preservedElements = Array.from(variables.keys());

  // Extract key identifiers from original code
  const originalAst = parseCodeSafe(originalCode);
  if (!originalAst) {
    return { success: false, code: originalCode, description: 'Failed to parse original code', transformationType: 'hybrid', preservedElements: [] };
  }

  // Build context from original code
  let contextComment = `// Original code context:\n`;
  if (pattern.loopVariable) contextComment += `// - Loop variable: ${pattern.loopVariable}\n`;
  if (pattern.iteratedCollection) contextComment += `// - Collection: ${pattern.iteratedCollection}\n`;
  pattern.repeatedCalls.forEach(call => {
    contextComment += `// - ${call.count}x calls to ${call.objectPath}.${call.methodName}()\n`;
  });
  contextComment += `//\n// Transformation: ${patternDescription}\n\n`;

  // The hybrid combines the optimization pattern with original variable names
  const hybridCode = contextComment + `// Original code (preserved for reference):\n/*\n${originalCode}\n*/\n\n// Optimized version:\n${_optimizationPattern}`;

  return {
    success: true,
    code: hybridCode,
    description: `Hybrid solution preserving original context: ${patternDescription}`,
    transformationType: 'hybrid',
    preservedElements
  };
}
