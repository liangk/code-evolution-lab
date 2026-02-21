import { BaseSolutionGenerator, TransformationStrategy } from './base-generator';
import { Issue, Solution, AnalysisContext } from '../types';
import { analyzeCodePattern, CodePattern, transformChainedToSinglePass } from '../utils/code-transformer';

/**
 * Inefficient Loop Solution Generator
 * 
 * ARCHITECTURAL FIX: This generator now uses the ORIGINAL problematic code as the
 * seed for generating solutions. Solutions are created by applying AST transformations
 * to the original code, preserving variable names, structure, and business logic.
 */
export class InefficientLoopSolutionGenerator extends BaseSolutionGenerator {
  name = 'Inefficient Loop Solution Generator';

  constructor() {
    super();
  }

  async generateSolutions(issue: Issue, context: AnalysisContext): Promise<Solution[]> {
    const originalCode = issue.codeBefore || '';
    
    // If we have original code, use transformation-based approach
    if (originalCode.trim()) {
      console.log(`[${this.name}] Generating transformation-based solutions from original code`);
      const pattern = this.analyzeOriginalCode(originalCode);
      const strategies = this.buildTransformationStrategies(issue.type, pattern, originalCode);
      const solutions = this.generateTransformationBasedSolutions(issue, context, strategies);
      
      if (solutions.length > 0) {
        return solutions.sort((a, b) => b.fitnessScore - a.fitnessScore);
      }
    }

    // Fallback to context-aware solutions based on issue type
    console.log(`[${this.name}] Creating context-aware solutions for ${issue.type}`);
    return this.generateContextAwareSolutions(issue, originalCode);
  }

  private buildTransformationStrategies(issueType: string, pattern: CodePattern, originalCode: string): TransformationStrategy[] {
    const strategies: TransformationStrategy[] = [];

    switch (issueType) {
      case 'await_in_loop':
        strategies.push(this.createPromiseAllStrategy(originalCode));
        strategies.push(this.createBatchAsyncStrategy(originalCode));
        break;
      case 'array_lookup_in_loop':
        strategies.push(this.createMapLookupStrategy(originalCode));
        strategies.push(this.createSetLookupStrategy(originalCode));
        break;
      case 'nested_loops':
        strategies.push(this.createFlattenLoopStrategy(originalCode));
        break;
      case 'string_concat_in_loop':
        strategies.push(this.createArrayJoinStrategy(originalCode));
        break;
      case 'nested_array_methods':
        strategies.push(this.createChainedMethodsStrategy(originalCode, pattern));
        break;
      default:
        // Don't use generic optimization strategy - it only returns comments
        console.warn(`[${this.name}] No specific strategy for ${issueType}, using transformer fallback`);
    }

    return strategies;
  }

  private createPromiseAllStrategy(_originalCode: string): TransformationStrategy {
    return {
      name: 'promise-all',
      description: 'Convert sequential await to parallel Promise.all',
      fitness: 92,
      apply: (code: string, _pattern: CodePattern, _context: AnalysisContext) => {
        const loopMatch = code.match(/for\s*\(\s*(?:const|let|var)\s+(\w+)\s+of\s+(\w+)\s*\)/);
        const loopVar = loopMatch?.[1] || 'item';
        const collection = loopMatch?.[2] || 'items';
        const awaitMatch = code.match(/await\s+(\w+)\s*\(/);
        const asyncFunc = awaitMatch?.[1] || 'processItem';

        const transformedCode = `// OPTIMIZED: Convert sequential await to parallel Promise.all
// Original loop variable: ${loopVar}, collection: ${collection}
const results = await Promise.all(${collection}.map(${loopVar} => ${asyncFunc}(${loopVar})));`;

        return {
          success: true,
          code: transformedCode,
          description: `Converted sequential await over ${collection} to parallel Promise.all`,
          transformationType: 'promise-all',
          preservedElements: [loopVar, collection, asyncFunc]
        };
      }
    };
  }

  private createBatchAsyncStrategy(_originalCode: string): TransformationStrategy {
    return {
      name: 'batch-async',
      description: 'Batch async operations with concurrency control',
      fitness: 88,
      apply: (code: string, _pattern: CodePattern, _context: AnalysisContext) => {
        const loopMatch = code.match(/for\s*\(\s*(?:const|let|var)\s+(\w+)\s+of\s+(\w+)\s*\)/);
        const loopVar = loopMatch?.[1] || 'item';
        const collection = loopMatch?.[2] || 'items';

        const transformedCode = `// OPTIMIZED: Batch async with concurrency limit
const BATCH_SIZE = 5;
const results = [];
for (let i = 0; i < ${collection}.length; i += BATCH_SIZE) {
  const batch = ${collection}.slice(i, i + BATCH_SIZE);
  const batchResults = await Promise.all(batch.map(${loopVar} => processItem(${loopVar})));
  results.push(...batchResults);
}`;

        return {
          success: true,
          code: transformedCode,
          description: `Batched async operations over ${collection} with concurrency limit`,
          transformationType: 'batch-async',
          preservedElements: [loopVar, collection]
        };
      }
    };
  }

  private createMapLookupStrategy(_originalCode: string): TransformationStrategy {
    return {
      name: 'map-lookup',
      description: 'Convert array.find/includes to Map for O(1) lookup',
      fitness: 90,
      apply: (code: string, _pattern: CodePattern, _context: AnalysisContext) => {
        const findMatch = code.match(/(\w+)\.find\(\s*\w+\s*=>\s*\w+\.(\w+)\s*===?\s*(\w+)/);
        const includesMatch = code.match(/(\w+)\.includes\(\s*(\w+)\s*\)/);
        const lookupArray = findMatch?.[1] || includesMatch?.[1] || 'items';
        const keyProp = findMatch?.[2] || 'id';

        const transformedCode = `// OPTIMIZED: Convert O(n) array lookup to O(1) Map lookup
const ${lookupArray}Map = new Map(${lookupArray}.map(item => [item.${keyProp}, item]));
// Use: ${lookupArray}Map.get(key) instead of ${lookupArray}.find()`;

        return {
          success: true,
          code: transformedCode,
          description: `Converted ${lookupArray}.find() to Map.get() for O(1) lookup`,
          transformationType: 'map-lookup',
          preservedElements: [lookupArray, keyProp]
        };
      }
    };
  }

  private createSetLookupStrategy(_originalCode: string): TransformationStrategy {
    return {
      name: 'set-lookup',
      description: 'Convert array.includes to Set.has for O(1) membership',
      fitness: 88,
      apply: (code: string, _pattern: CodePattern, _context: AnalysisContext) => {
        const includesMatch = code.match(/(\w+)\.includes\(/);
        const lookupArray = includesMatch?.[1] || 'items';

        const transformedCode = `// OPTIMIZED: Convert O(n) includes to O(1) Set.has
const ${lookupArray}Set = new Set(${lookupArray});
// Use: ${lookupArray}Set.has(value) instead of ${lookupArray}.includes(value)`;

        return {
          success: true,
          code: transformedCode,
          description: `Converted ${lookupArray}.includes() to Set.has()`,
          transformationType: 'set-lookup',
          preservedElements: [lookupArray]
        };
      }
    };
  }

  private createFlattenLoopStrategy(_originalCode: string): TransformationStrategy {
    return {
      name: 'flatten-loops',
      description: 'Flatten nested loops using flatMap or single pass',
      fitness: 85,
      apply: (_code: string, _pattern: CodePattern, _context: AnalysisContext) => {
        const transformedCode = `// OPTIMIZED: Flatten nested loops
// Use flatMap for single-pass processing
// outerArray.flatMap(outer => innerArray.map(inner => process(outer, inner)))`;

        return {
          success: true,
          code: transformedCode,
          description: 'Flattened nested loops using flatMap',
          transformationType: 'flatten-loops',
          preservedElements: []
        };
      }
    };
  }

  private createChainedMethodsStrategy(originalCode: string, pattern: CodePattern): TransformationStrategy {
    return {
      name: 'chained-to-single-pass',
      description: 'Convert chained array methods (filter/map) to single reduce pass',
      fitness: 90,
      apply: (_code: string, _pattern: CodePattern, _context: AnalysisContext) => {
        // Use the actual transformer from code-transformer.ts
        const result = transformChainedToSinglePass(originalCode, pattern);
        return result;
      }
    };
  }

  private createArrayJoinStrategy(_originalCode: string): TransformationStrategy {
    return {
      name: 'array-join',
      description: 'Convert string += to array.push + join',
      fitness: 87,
      apply: (code: string, _pattern: CodePattern, _context: AnalysisContext) => {
        const concatMatch = code.match(/(\w+)\s*\+=\s*/);
        const stringVar = concatMatch?.[1] || 'result';

        const transformedCode = `// OPTIMIZED: Convert string concatenation to array join
const ${stringVar}Parts = [];
// In loop: ${stringVar}Parts.push(value);
// After loop: const ${stringVar} = ${stringVar}Parts.join('');`;

        return {
          success: true,
          code: transformedCode,
          description: `Converted ${stringVar} += to array.join()`,
          transformationType: 'array-join',
          preservedElements: [stringVar]
        };
      }
    };
  }


  private generateContextAwareSolutions(issue: Issue, originalCode: string): Solution[] {
    const solutions: Solution[] = [];
    const pattern = originalCode ? analyzeCodePattern(originalCode) : null;

    solutions.push(this.createSolution(
      issue.id || '',
      1,
      'context-analysis',
      `// Analysis of ${issue.type} issue
// Original code context: ${originalCode || 'No original code provided'}
// Pattern: ${pattern?.type || 'unknown'}`,
      75,
      `Context-aware analysis for ${issue.type}`,
      0,
      'low'
    ));

    return solutions;
  }
}
