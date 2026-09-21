/**
 * Code Transformer
 *
 * AST-based analysis and transformation of the original problematic code.
 * Ported from `backend/src/utils/code-transformer.ts`.
 *
 * Two transformations from the original are deliberately not ported:
 *
 *   `transformLoopQueryToBatch` detected a query inside a loop and then
 *   returned a four-line comment header prepended to the *unchanged* original
 *   code, marked `success: true`. It transformed nothing. The N+1 generator
 *   has its own `batch-query-before-loop` strategy that does produce a
 *   rewrite, so nothing is lost.
 *
 *   `transformBatchMethodCalls` replaced `form.get('x')?.value` with
 *   `formValues.x` but never emitted the `const formValues = ...` declaration
 *   — its own comment admitted it needed scope analysis it didn't do. The
 *   result referenced an undefined variable and still reported success.
 *
 *   `transformMemoize` is likewise a prefix-plus-original, not a rewrite.
 *
 * What remains is `transformChainedToSinglePass`, which genuinely rewrites the
 * AST. Adding a transformation here means adding one that changes the code.
 */

import { parse } from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';

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

/** Parse code with error handling. Returns null rather than throwing. */
export function parseCodeSafe(code: string): t.File | null {
  try {
    return parse(code, {
      sourceType: 'module',
      plugins: [
        'typescript', 'jsx', 'decorators-legacy', 'classProperties',
        'objectRestSpread', 'asyncGenerators', 'dynamicImport',
        'optionalChaining', 'nullishCoalescingOperator',
      ],
    });
  } catch {
    return null;
  }
}

/** Analyze code to identify patterns that can be optimized. */
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
      if (
        t.isIdentifier(path.node.left) ||
        (t.isVariableDeclaration(path.node.left) && t.isIdentifier(path.node.left.declarations[0]?.id))
      ) {
        loopVariable = t.isIdentifier(path.node.left)
          ? path.node.left.name
          : (path.node.left.declarations[0]?.id as t.Identifier).name;
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
            count: 1,
          });
        }

        // .forEach/.map/.filter callbacks carry the loop variable and collection.
        if (['forEach', 'map', 'filter'].includes(methodName) && !loopVariable) {
          iteratedCollection = objectPath;
          const callback = path.node.arguments[0];
          if (callback && (t.isArrowFunctionExpression(callback) || t.isFunctionExpression(callback))) {
            const params = callback.params;
            if (params.length > 0 && t.isIdentifier(params[0])) {
              loopVariable = params[0].name;
            }
          }
          if (!patternType || patternType === 'unknown') {
            patternType = 'loop-with-calls';
          }
        }
      }
    },
  });

  if (code.includes('.filter(') && code.includes('.map(')) {
    patternType = 'chained-methods';
  }

  const getCallCount = Array.from(callCounts.values())
    .filter(c => c.call.methodName === 'get')
    .reduce((sum, c) => sum + c.count, 0);
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
    originalStructure: ast,
  };
}

/** Extract variable names and their rough types from code. */
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
    },
  });

  return variables;
}

/**
 * Transform: convert chained array methods to a single pass.
 *
 *   items.filter(x => x.active).map(x => x.value)
 *   -> items.reduce((acc, x) => { if (x.active) acc.push(x.value); return acc; }, [])
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
    CallExpression(path: NodePath<t.CallExpression>) {
      // .map().filter()
      if (
        t.isMemberExpression(path.node.callee) &&
        t.isIdentifier(path.node.callee.property) &&
        path.node.callee.property.name === 'filter'
      ) {
        const mapCall = path.node.callee.object;
        if (
          t.isCallExpression(mapCall) &&
          t.isMemberExpression(mapCall.callee) &&
          t.isIdentifier(mapCall.callee.property) &&
          mapCall.callee.property.name === 'map'
        ) {
          const originalCollection = generate(mapCall.callee.object).code;
          preservedElements.push(originalCollection);

          const mapTransform = mapCall.arguments[0];
          const filterPredicate = path.node.arguments[0];

          if (t.isArrowFunctionExpression(mapTransform) && t.isArrowFunctionExpression(filterPredicate)) {
            const mapParam = t.isIdentifier(mapTransform.params[0]) ? mapTransform.params[0].name : 'item';
            preservedElements.push(mapParam);

            const tempVar = t.identifier('mapped');
            const reduceBody = t.blockStatement([
              t.variableDeclaration('const', [t.variableDeclarator(tempVar, mapTransform.body as t.Expression)]),
              t.ifStatement(
                t.callExpression(filterPredicate, [tempVar]),
                t.expressionStatement(
                  t.callExpression(t.memberExpression(t.identifier('acc'), t.identifier('push')), [tempVar])
                )
              ),
              t.returnStatement(t.identifier('acc')),
            ]);

            const reduceArrow = t.arrowFunctionExpression([t.identifier('acc'), t.identifier(mapParam)], reduceBody);
            const reduceCall = t.callExpression(
              t.memberExpression(mapCall.callee.object, t.identifier('reduce')),
              [reduceArrow, t.arrayExpression([])]
            );

            path.replaceWith(reduceCall);
            transformed = true;
          }
        }
      }
      // .filter().map()
      else if (
        t.isMemberExpression(path.node.callee) &&
        t.isIdentifier(path.node.callee.property) &&
        path.node.callee.property.name === 'map'
      ) {
        const filterCall = path.node.callee.object;
        if (
          t.isCallExpression(filterCall) &&
          t.isMemberExpression(filterCall.callee) &&
          t.isIdentifier(filterCall.callee.property) &&
          filterCall.callee.property.name === 'filter'
        ) {
          const originalCollection = generate(filterCall.callee.object).code;
          preservedElements.push(originalCollection);

          const filterPredicate = filterCall.arguments[0];
          const mapTransform = path.node.arguments[0];

          if (t.isArrowFunctionExpression(filterPredicate) && t.isArrowFunctionExpression(mapTransform)) {
            const filterParam = t.isIdentifier(filterPredicate.params[0]) ? filterPredicate.params[0].name : 'item';
            preservedElements.push(filterParam);

            const reduceBody = t.blockStatement([
              t.ifStatement(
                filterPredicate.body as t.Expression,
                t.expressionStatement(
                  t.callExpression(t.memberExpression(t.identifier('acc'), t.identifier('push')), [
                    mapTransform.body as t.Expression,
                  ])
                )
              ),
              t.returnStatement(t.identifier('acc')),
            ]);

            const reduceArrow = t.arrowFunctionExpression([t.identifier('acc'), t.identifier(filterParam)], reduceBody);
            const reduceCall = t.callExpression(
              t.memberExpression(filterCall.callee.object, t.identifier('reduce')),
              [reduceArrow, t.arrayExpression([])]
            );

            path.replaceWith(reduceCall);
            transformed = true;
          }
        }
      }
    },
  });

  if (transformed) {
    resultCode = generate(ast).code;
  }

  return {
    success: transformed,
    code: resultCode,
    description: transformed
      ? 'Converted chained array methods to single reduce() pass'
      : 'No applicable chain found',
    transformationType: 'single-pass',
    preservedElements,
  };
}

/** Apply every generic transformation and return the ones that changed the code. */
export function generateTransformationCandidates(originalCode: string): TransformationResult[] {
  const pattern = analyzeCodePattern(originalCode);
  const candidates: TransformationResult[] = [];

  const transformations = [() => transformChainedToSinglePass(originalCode, pattern)];

  for (const transform of transformations) {
    try {
      const result = transform();
      if (result.success) candidates.push(result);
    } catch {
      // Skip failed transformations
    }
  }

  return candidates;
}
