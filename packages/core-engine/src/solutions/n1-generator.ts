/**
 * N+1 Query Solution Generator
 *
 * Ported from `backend/src/generators/n1-solution-generator.ts` (private copy,
 * which drops the pattern-analysis fallback — see below).
 *
 * Solutions are built by applying transformation strategies to the original
 * loop, so the reader gets their own variable names back rather than a generic
 * template. What comes out is a scaffold with a placeholder where the real
 * batch query goes, not a patch to apply blind.
 *
 * Two things the backend version does that this one does not:
 *
 *   The public backend still has `generateContextAwareSolutions`, a fallback
 *   that emits a "solution" made entirely of comments describing the detected
 *   pattern. `base-generator` rejects comment-only output from strategies, but
 *   the fallback bypassed that check, so non-actionable commentary reached
 *   published scan results. When no strategy applies, this returns nothing.
 *
 *   The Angular reactive-forms strategies (`batch-form-reads`,
 *   `form-batch-read`) are not ported. Batching `form.get('field')?.value`
 *   calls is a real optimisation but has nothing to do with database queries,
 *   and `detectORM` classifying any code containing both `.get(` and `form` as
 *   `angular-forms` could hijack a genuine repository finding.
 */

import generate from '@babel/generator';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { BaseSolutionGenerator, TransformationStrategy } from './base-generator';
import { CodePattern, TransformationResult, parseCodeSafe, analyzeCodePattern } from './code-transformer';
import type { DiagnosticIssue, Solution, SolutionContext } from './types';

interface CodeContext {
  orm: string;
  variables: Map<string, { name: string; type: string }>;
  methodCalls: { methodName: string; object: string; isAsync: boolean }[];
  loopStructure: { type: string; variable: string; collection: string } | null;
  asyncCalls: string[];
}

export class N1SolutionGenerator extends BaseSolutionGenerator {
  name = 'N+1 Query Solution Generator';

  async generateSolutions(issue: DiagnosticIssue, context: SolutionContext): Promise<Solution[]> {
    const originalCode = issue.codeBefore || '';
    if (!originalCode.trim()) return [];

    const pattern = analyzeCodePattern(originalCode);
    const codeContext = this.analyzeCodeContext(originalCode);

    const strategies = this.buildTransformationStrategies(pattern, codeContext);
    const solutions = this.generateTransformationBasedSolutions(issue, context, strategies);

    // No applicable transformation means no suggestion. Saying nothing beats
    // emitting commentary that looks like a fix.
    if (solutions.length === 0) return [];

    return solutions.sort((a, b) => b.fitnessScore - a.fitnessScore);
  }

  /** Extract ORM, variable names, loop structure and async calls. */
  private analyzeCodeContext(code: string): CodeContext {
    const context: CodeContext = {
      orm: this.detectORM(code),
      variables: new Map(),
      methodCalls: [],
      loopStructure: null,
      asyncCalls: [],
    };

    const ast = parseCodeSafe(code);
    if (!ast) return context;

    traverse(ast, {
      VariableDeclarator(path) {
        if (t.isIdentifier(path.node.id)) {
          context.variables.set(path.node.id.name, {
            name: path.node.id.name,
            type: path.node.init ? path.node.init.type : 'unknown',
          });
        }
      },
      CallExpression(path) {
        if (t.isMemberExpression(path.node.callee)) {
          const methodName = t.isIdentifier(path.node.callee.property) ? path.node.callee.property.name : '';
          const objectCode = generate(path.node.callee.object).code;
          context.methodCalls.push({
            methodName,
            object: objectCode,
            isAsync: path.parentPath?.isAwaitExpression() || false,
          });
        }
      },
      ForOfStatement(path) {
        let loopVar = '';
        if (t.isVariableDeclaration(path.node.left) && t.isIdentifier(path.node.left.declarations[0]?.id)) {
          loopVar = (path.node.left.declarations[0].id as t.Identifier).name;
        } else if (t.isIdentifier(path.node.left)) {
          loopVar = path.node.left.name;
        }
        context.loopStructure = { type: 'for-of', variable: loopVar, collection: generate(path.node.right).code };
      },
      ForStatement(_path) {
        context.loopStructure = { type: 'for', variable: '', collection: '' };
      },
      AwaitExpression(path) {
        context.asyncCalls.push(generate(path.node).code);
      },
    });

    return context;
  }

  private detectORM(code: string): string {
    if (code.includes('prisma.') || code.includes('findMany') || code.includes('findUnique')) return 'prisma';
    if (code.includes('findAll') || code.includes('findByPk')) return 'sequelize';
    if (code.includes('.find(') && (code.includes('mongoose') || code.includes('Model.'))) return 'mongoose';
    if (code.includes('fetch(') || code.includes('axios')) return 'http';
    return 'unknown';
  }

  private buildTransformationStrategies(pattern: CodePattern, codeContext: CodeContext): TransformationStrategy[] {
    const strategies: TransformationStrategy[] = [];

    if (codeContext.loopStructure && codeContext.asyncCalls.length > 0) {
      strategies.push(this.createBatchQueryStrategy(codeContext));
    }

    if (codeContext.orm === 'prisma') {
      strategies.push(this.createPrismaIncludeStrategy());
    } else if (codeContext.orm === 'sequelize') {
      strategies.push(this.createSequelizeIncludeStrategy());
    }

    if (pattern.repeatedCalls.some(c => c.isAsync && c.count > 1)) {
      strategies.push(this.createMemoizationStrategy(pattern));
    }

    return strategies;
  }

  /** Extract the per-item query out of the loop and issue it once. */
  private createBatchQueryStrategy(codeContext: CodeContext): TransformationStrategy {
    return {
      name: 'batch-query-before-loop',
      description: 'Extract queries from loop and batch them before iteration',
      fitness: 92,
      apply: (originalCode: string): TransformationResult => {
        const preservedElements: string[] = [];

        if (!codeContext.loopStructure) {
          return {
            success: false, code: originalCode, description: 'No loop structure found',
            transformationType: 'batch-query', preservedElements,
          };
        }

        const { variable: loopVar, collection } = codeContext.loopStructure;
        preservedElements.push(loopVar, collection);

        const asyncCallsInLoop = codeContext.asyncCalls;
        if (asyncCallsInLoop.length === 0) {
          return {
            success: false, code: originalCode, description: 'No async calls in loop',
            transformationType: 'batch-query', preservedElements,
          };
        }

        const transformedCode = `// OPTIMIZED: Batch query before loop
// Original: ${asyncCallsInLoop.length} async call(s) inside loop over ${collection}
// Problem: N+1 queries where N = ${collection}.length

// Step 1: Collect all IDs/keys needed
const allIds = ${collection}.map(${loopVar} => ${loopVar}.id);

// Step 2: Batch query (single database call)
const allData = await batchQuery(allIds); // Replace with actual batch query
const dataMap = new Map(allData.map(d => [d.id, d]));

// Step 3: Original loop (now uses cached data)
${originalCode.replace(/await\s+\w+\.\w+\([^)]*\)/g, `dataMap.get(${loopVar}.id)`)}

// Performance: 1 query instead of N queries`;

        return {
          success: true,
          code: transformedCode,
          description: `Extracted ${asyncCallsInLoop.length} queries from loop over ${collection}`,
          transformationType: 'batch-query-before-loop',
          preservedElements,
        };
      },
    };
  }

  private createPrismaIncludeStrategy(): TransformationStrategy {
    return {
      name: 'prisma-include',
      description: 'Use Prisma include for eager loading related data',
      fitness: 95,
      apply: (originalCode: string): TransformationResult => {
        const preservedElements: string[] = [];

        const modelMatch = originalCode.match(/prisma\.(\w+)\./);
        const modelName = modelMatch ? modelMatch[1] : 'model';
        preservedElements.push(modelName);

        const relationMatches = originalCode.matchAll(/prisma\.(\w+)\.findMany\(\{[^}]*where:\s*\{\s*(\w+):/g);
        const relations: string[] = [];
        for (const match of relationMatches) {
          relations.push(match[1]);
          preservedElements.push(match[1]);
        }

        if (relations.length === 0) {
          const loopQueryMatch = originalCode.match(/for.*of\s+(\w+).*await.*prisma\.(\w+)/);
          if (loopQueryMatch) {
            relations.push(loopQueryMatch[2]);
            preservedElements.push(loopQueryMatch[1], loopQueryMatch[2]);
          }
        }

        // Without a real model and at least one relation, the best this can do
        // is emit a template about an invented model with an empty include,
        // wrapped around the original code in a comment block. That reads like
        // a fix and contains nothing. Say nothing instead.
        if (!modelMatch || relations.length === 0) {
          return {
            success: false,
            code: originalCode,
            description: 'No Prisma model and relation pair found to eager-load',
            transformationType: 'prisma-include',
            preservedElements,
          };
        }

        const transformedCode = `// OPTIMIZED: Prisma eager loading with include
// Original: Separate queries for ${modelName} and ${relations.join(', ') || 'related data'}
// Optimized: Single query with include

const ${modelName}WithRelations = await prisma.${modelName}.findMany({
  include: {
${relations.map(r => `    ${r}: true, // Eager load ${r}`).join('\n')}
  }
});

// Original code reference:
/*
${originalCode}
*/

// Access related data directly: ${modelName}WithRelations[0].${relations[0]}`;

        return {
          success: true,
          code: transformedCode,
          description: `Added Prisma include for ${relations.length} relation(s)`,
          transformationType: 'prisma-include',
          preservedElements,
        };
      },
    };
  }

  private createSequelizeIncludeStrategy(): TransformationStrategy {
    return {
      name: 'sequelize-include',
      description: 'Use Sequelize include for eager loading related data',
      fitness: 93,
      apply: (originalCode: string): TransformationResult => {
        const preservedElements: string[] = [];

        const modelMatches = originalCode.matchAll(/(\w+)\.findAll\(/g);
        const models: string[] = [];
        for (const match of modelMatches) {
          models.push(match[1]);
          preservedElements.push(match[1]);
        }

        const mainModel = models[0];
        const relatedModels = models.slice(1);

        // One model is not an eager-loading opportunity, and zero models means
        // the code has no findAll() at all — 25 of outline's 27 findings hit
        // that path and got a template about a fictional `Model.findAll()`
        // with their own code pasted into a comment block underneath.
        if (models.length === 0 || relatedModels.length === 0) {
          return {
            success: false,
            code: originalCode,
            description: 'Needs at least two Sequelize models to eager-load',
            transformationType: 'sequelize-include',
            preservedElements,
          };
        }

        const transformedCode = `// OPTIMIZED: Sequelize eager loading with include
// Original: Separate findAll() calls for ${models.join(', ') || 'models'}
// Optimized: Single query with include

const ${mainModel.toLowerCase()}WithRelations = await ${mainModel}.findAll({
  include: [
${relatedModels.map(m => `    { model: ${m}, as: '${m.toLowerCase()}s' },`).join('\n')}
  ]
});

// Original code reference:
/*
${originalCode}
*/

// Access: ${mainModel.toLowerCase()}WithRelations[0].${relatedModels[0].toLowerCase()}s`;

        return {
          success: true,
          code: transformedCode,
          description: `Added Sequelize include for ${relatedModels.length} model(s)`,
          transformationType: 'sequelize-include',
          preservedElements,
        };
      },
    };
  }

  private createMemoizationStrategy(pattern: CodePattern): TransformationStrategy {
    return {
      name: 'memoization',
      description: 'Add memoization cache for repeated expensive calls',
      fitness: 82,
      apply: (originalCode: string): TransformationResult => {
        const preservedElements: string[] = [];

        const expensiveCalls = pattern.repeatedCalls.filter(c => c.isAsync && c.count > 1);
        if (expensiveCalls.length === 0) {
          return {
            success: false, code: originalCode, description: 'No repeated expensive calls',
            transformationType: 'memoization', preservedElements,
          };
        }

        expensiveCalls.forEach(call => preservedElements.push(`${call.objectPath}.${call.methodName}`));

        let transformedCode = `// OPTIMIZED: Memoization for repeated expensive calls
// Found ${expensiveCalls.length} repeated async call(s)\n\n`;

        expensiveCalls.forEach(call => {
          const cacheName = `${call.methodName}Cache`;
          const fnName = call.methodName.charAt(0).toUpperCase() + call.methodName.slice(1);
          transformedCode += `// Memoize ${call.objectPath}.${call.methodName} (called ${call.count}x)
const ${cacheName} = new Map();
async function memoized${fnName}(key) {
  if (${cacheName}.has(key)) return ${cacheName}.get(key);
  const result = await ${call.objectPath}.${call.methodName}(key);
  ${cacheName}.set(key, result);
  return result;
}\n\n`;
        });

        transformedCode += `// Original code (replace calls with memoized versions):\n${originalCode}`;

        return {
          success: true,
          code: transformedCode,
          description: `Added memoization for ${expensiveCalls.length} repeated call(s)`,
          transformationType: 'memoization',
          preservedElements,
        };
      },
    };
  }
}
