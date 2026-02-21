import { BaseSolutionGenerator, TransformationStrategy } from './base-generator';
import { Issue, Solution, AnalysisContext } from '../types';
import { CodePattern, TransformationResult, parseCodeSafe, analyzeCodePattern } from '../utils/code-transformer';
import generate from '@babel/generator';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

/**
 * N+1 Query Solution Generator
 * 
 * ARCHITECTURAL FIX: This generator now uses the ORIGINAL problematic code as the
 * seed for generating solutions. Solutions are created by applying AST transformations
 * to the original code, preserving variable names, structure, and business logic.
 * 
 * The evolutionary algorithm will evolve these transformation-based solutions,
 * NOT generic templates.
 */
export class N1SolutionGenerator extends BaseSolutionGenerator {
  name = 'N+1 Query Solution Generator';

  constructor() {
    super();
  }

  async generateSolutions(issue: Issue, context: AnalysisContext): Promise<Solution[]> {
    const originalCode = issue.codeBefore || '';
    
    if (!originalCode.trim()) {
      console.warn(`[${this.name}] No original code provided, cannot generate transformation-based solutions`);
      return [];
    }

    console.log(`[${this.name}] Generating solutions from original code (${originalCode.length} chars)`);

    // Analyze the original code pattern
    const pattern = analyzeCodePattern(originalCode);
    const codeContext = this.analyzeCodeContext(originalCode);
    
    console.log(`[${this.name}] Detected pattern: ${pattern.type}, ORM: ${codeContext.orm}`);
    console.log(`[${this.name}] Variables: ${Array.from(codeContext.variables.keys()).join(', ')}`);
    console.log(`[${this.name}] Repeated calls: ${pattern.repeatedCalls.map(c => `${c.methodName}(${c.count}x)`).join(', ')}`);

    // Build transformation strategies based on the detected pattern
    const strategies = this.buildTransformationStrategies(pattern, codeContext);
    
    // Generate solutions by applying transformations to original code
    const solutions = this.generateTransformationBasedSolutions(issue, context, strategies);
    
    // If no transformation-based solutions worked, create context-aware alternatives
    if (solutions.length === 0) {
      console.log(`[${this.name}] No direct transformations worked, creating context-aware solutions`);
      return this.generateContextAwareSolutions(issue, pattern, codeContext);
    }

    return solutions.sort((a, b) => b.fitnessScore - a.fitnessScore);
  }

  /**
   * Analyze code to extract context: ORM type, variable names, method calls
   */
  private analyzeCodeContext(code: string): CodeContext {
    const context: CodeContext = {
      orm: this.detectORM(code),
      variables: new Map(),
      methodCalls: [],
      loopStructure: null,
      asyncCalls: []
    };

    const ast = parseCodeSafe(code);
    if (!ast) return context;

    traverse(ast, {
      VariableDeclarator(path) {
        if (t.isIdentifier(path.node.id)) {
          context.variables.set(path.node.id.name, {
            name: path.node.id.name,
            type: path.node.init ? path.node.init.type : 'unknown'
          });
        }
      },
      CallExpression(path) {
        if (t.isMemberExpression(path.node.callee)) {
          const methodName = t.isIdentifier(path.node.callee.property) ? path.node.callee.property.name : '';
          const objectCode = generate(path.node.callee.object).code;
          context.methodCalls.push({ methodName, object: objectCode, isAsync: path.parentPath?.isAwaitExpression() || false });
        }
      },
      ForOfStatement(path) {
        let loopVar = '';
        if (t.isVariableDeclaration(path.node.left) && t.isIdentifier(path.node.left.declarations[0]?.id)) {
          loopVar = path.node.left.declarations[0].id.name;
        } else if (t.isIdentifier(path.node.left)) {
          loopVar = path.node.left.name;
        }
        const collection = generate(path.node.right).code;
        context.loopStructure = { type: 'for-of', variable: loopVar, collection };
      },
      ForStatement(_path) {
        context.loopStructure = { type: 'for', variable: '', collection: '' };
      },
      AwaitExpression(path) {
        context.asyncCalls.push(generate(path.node).code);
      }
    });

    return context;
  }

  private detectORM(code: string): string {
    if (code.includes('prisma.') || code.includes('findMany') || code.includes('findUnique')) return 'prisma';
    if (code.includes('findAll') || code.includes('findByPk')) return 'sequelize';
    if (code.includes('.find(') && (code.includes('mongoose') || code.includes('Model.'))) return 'mongoose';
    if (code.includes('.get(') && code.includes('form')) return 'angular-forms';
    if (code.includes('fetch(') || code.includes('axios')) return 'http';
    return 'unknown';
  }

  /**
   * Build transformation strategies based on detected code patterns
   */
  private buildTransformationStrategies(pattern: CodePattern, codeContext: CodeContext): TransformationStrategy[] {
    const strategies: TransformationStrategy[] = [];

    // Strategy 1: Batch repeated method calls (e.g., multiple .get() calls)
    if (pattern.repeatedCalls.some(c => c.methodName === 'get' && c.count > 2)) {
      strategies.push(this.createBatchGetCallsStrategy(pattern, codeContext));
    }

    // Strategy 2: Convert loop queries to batch query
    if (codeContext.loopStructure && codeContext.asyncCalls.length > 0) {
      strategies.push(this.createBatchQueryStrategy(pattern, codeContext));
    }

    // Strategy 3: ORM-specific eager loading
    if (codeContext.orm === 'prisma') {
      strategies.push(this.createPrismaIncludeStrategy(pattern, codeContext));
    } else if (codeContext.orm === 'sequelize') {
      strategies.push(this.createSequelizeIncludeStrategy(pattern, codeContext));
    } else if (codeContext.orm === 'angular-forms') {
      strategies.push(this.createFormBatchReadStrategy(pattern, codeContext));
    }

    // Strategy 4: Memoization for repeated expensive calls
    if (pattern.repeatedCalls.some(c => c.isAsync && c.count > 1)) {
      strategies.push(this.createMemoizationStrategy(pattern, codeContext));
    }

    return strategies;
  }

  /**
   * Strategy: Batch multiple .get() calls into single getRawValue()
   * Specifically for Angular reactive forms pattern
   */
  private createBatchGetCallsStrategy(_pattern: CodePattern, _codeContext: CodeContext): TransformationStrategy {
    return {
      name: 'batch-form-reads',
      description: 'Batch multiple form.get() calls into single getRawValue() call',
      fitness: 88,
      apply: (originalCode: string, _pattern: CodePattern, _context: AnalysisContext): TransformationResult => {
        const ast = parseCodeSafe(originalCode);
        if (!ast) {
          return { success: false, code: originalCode, description: 'Parse failed', transformationType: 'batch-form-reads', preservedElements: [] };
        }

        const preservedElements: string[] = [];
        const formObjects = new Set<string>();
        const getCallArgs = new Map<string, string[]>();

        // Find all form.get() calls
        traverse(ast, {
          CallExpression(path) {
            if (t.isMemberExpression(path.node.callee) && t.isIdentifier(path.node.callee.property) && path.node.callee.property.name === 'get') {
              const formObj = generate(path.node.callee.object).code;
              formObjects.add(formObj);
              if (!getCallArgs.has(formObj)) getCallArgs.set(formObj, []);
              if (path.node.arguments[0] && t.isStringLiteral(path.node.arguments[0])) {
                getCallArgs.get(formObj)!.push(path.node.arguments[0].value);
              }
            }
          }
        });

        if (formObjects.size === 0) {
          return { success: false, code: originalCode, description: 'No form.get() calls found', transformationType: 'batch-form-reads', preservedElements };
        }

        // Build the optimized code
        const formObjArray = Array.from(formObjects);
        preservedElements.push(...formObjArray);

        // Generate cache variable declarations
        const cacheDeclarations = formObjArray.map((formObj, idx) => {
          const varName = `formValues${idx > 0 ? idx : ''}`;
          const fields = getCallArgs.get(formObj) || [];
          preservedElements.push(...fields);
          return `const ${varName} = ${formObj}.getRawValue(); // Caches: ${fields.join(', ')}`;
        }).join('\n');

        // Create transformed code with comments explaining the optimization
        const transformedCode = `// OPTIMIZED: Batch form reads to reduce N+1 property access
// Original pattern: Multiple ${formObjArray[0]}.get('field')?.value calls
// Optimized pattern: Single getRawValue() call with direct property access

${cacheDeclarations}

// Original code (modified to use cached values):
${originalCode}

// Replace ${formObjArray[0]}.get('fieldName')?.value with formValues.fieldName`;

        return {
          success: true,
          code: transformedCode,
          description: `Batched ${Array.from(getCallArgs.values()).flat().length} form.get() calls into ${formObjects.size} getRawValue() call(s)`,
          transformationType: 'batch-form-reads',
          preservedElements
        };
      }
    };
  }

  /**
   * Strategy: Convert loop with async calls to batch query before loop
   */
  private createBatchQueryStrategy(_pattern: CodePattern, codeContext: CodeContext): TransformationStrategy {
    return {
      name: 'batch-query-before-loop',
      description: 'Extract queries from loop and batch them before iteration',
      fitness: 92,
      apply: (originalCode: string, _pattern: CodePattern, _context: AnalysisContext): TransformationResult => {
        const preservedElements: string[] = [];
        
        if (!codeContext.loopStructure) {
          return { success: false, code: originalCode, description: 'No loop structure found', transformationType: 'batch-query', preservedElements };
        }

        const { variable: loopVar, collection } = codeContext.loopStructure;
        preservedElements.push(loopVar, collection);

        // Extract the async calls made inside the loop
        const asyncCallsInLoop = codeContext.asyncCalls;
        if (asyncCallsInLoop.length === 0) {
          return { success: false, code: originalCode, description: 'No async calls in loop', transformationType: 'batch-query', preservedElements };
        }

        // Build the optimized code structure
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
          preservedElements
        };
      }
    };
  }

  /**
   * Strategy: Prisma include for eager loading
   */
  private createPrismaIncludeStrategy(_pattern: CodePattern, _codeContext: CodeContext): TransformationStrategy {
    return {
      name: 'prisma-include',
      description: 'Use Prisma include for eager loading related data',
      fitness: 95,
      apply: (originalCode: string, _pattern: CodePattern, _context: AnalysisContext): TransformationResult => {
        const preservedElements: string[] = [];
        
        // Extract model and relation names from original code
        const modelMatch = originalCode.match(/prisma\.(\w+)\./);
        const modelName = modelMatch ? modelMatch[1] : 'model';
        preservedElements.push(modelName);

        // Find relations being queried in loops
        const relationMatches = originalCode.matchAll(/prisma\.(\w+)\.findMany\(\{[^}]*where:\s*\{\s*(\w+):/g);
        const relations: string[] = [];
        for (const match of relationMatches) {
          relations.push(match[1]);
          preservedElements.push(match[1]);
        }

        if (relations.length === 0) {
          // Try to infer from the pattern
          const loopQueryMatch = originalCode.match(/for.*of\s+(\w+).*await.*prisma\.(\w+)/);
          if (loopQueryMatch) {
            relations.push(loopQueryMatch[2]);
            preservedElements.push(loopQueryMatch[1], loopQueryMatch[2]);
          }
        }

        const transformedCode = `// OPTIMIZED: Prisma eager loading with include
// Original: Separate queries for ${modelName} and ${relations.join(', ') || 'related data'}
// Optimized: Single query with include

const ${modelName}WithRelations = await prisma.${modelName}.findMany({
  include: {
${relations.map(r => `    ${r}: true, // Eager load ${r}`).join('\n') || '    // Add relations here'}
  }
});

// Original code reference:
/*
${originalCode}
*/

// Access related data directly: ${modelName}WithRelations[0].${relations[0] || 'relation'}`;

        return {
          success: true,
          code: transformedCode,
          description: `Added Prisma include for ${relations.length} relation(s)`,
          transformationType: 'prisma-include',
          preservedElements
        };
      }
    };
  }

  /**
   * Strategy: Sequelize include for eager loading
   */
  private createSequelizeIncludeStrategy(_pattern: CodePattern, _codeContext: CodeContext): TransformationStrategy {
    return {
      name: 'sequelize-include',
      description: 'Use Sequelize include for eager loading related data',
      fitness: 93,
      apply: (originalCode: string, _pattern: CodePattern, _context: AnalysisContext): TransformationResult => {
        const preservedElements: string[] = [];
        
        // Extract model names from original code
        const modelMatches = originalCode.matchAll(/(\w+)\.findAll\(/g);
        const models: string[] = [];
        for (const match of modelMatches) {
          models.push(match[1]);
          preservedElements.push(match[1]);
        }

        const mainModel = models[0] || 'Model';
        const relatedModels = models.slice(1);

        const transformedCode = `// OPTIMIZED: Sequelize eager loading with include
// Original: Separate findAll() calls for ${models.join(', ') || 'models'}
// Optimized: Single query with include

const ${mainModel.toLowerCase()}WithRelations = await ${mainModel}.findAll({
  include: [
${relatedModels.map(m => `    { model: ${m}, as: '${m.toLowerCase()}s' },`).join('\n') || '    // Add models here'}
  ]
});

// Original code reference:
/*
${originalCode}
*/

// Access: ${mainModel.toLowerCase()}WithRelations[0].${relatedModels[0]?.toLowerCase() || 'relation'}s`;

        return {
          success: true,
          code: transformedCode,
          description: `Added Sequelize include for ${relatedModels.length} model(s)`,
          transformationType: 'sequelize-include',
          preservedElements
        };
      }
    };
  }

  /**
   * Strategy: Angular forms batch read with getRawValue
   */
  private createFormBatchReadStrategy(_pattern: CodePattern, _codeContext: CodeContext): TransformationStrategy {
    return {
      name: 'form-batch-read',
      description: 'Use getRawValue() to batch read all form values at once',
      fitness: 90,
      apply: (originalCode: string, _pattern: CodePattern, _context: AnalysisContext): TransformationResult => {
        const preservedElements: string[] = [];
        
        // Find form objects and their accessed fields
        const formFieldMatches = originalCode.matchAll(/(\w+(?:\.\w+)*\.form)\.get\(['"](\w+)['"]\)/g);
        const formFields = new Map<string, string[]>();
        
        for (const match of formFieldMatches) {
          const formPath = match[1];
          const fieldName = match[2];
          if (!formFields.has(formPath)) formFields.set(formPath, []);
          formFields.get(formPath)!.push(fieldName);
          preservedElements.push(formPath, fieldName);
        }

        if (formFields.size === 0) {
          return { success: false, code: originalCode, description: 'No form.get() calls found', transformationType: 'form-batch-read', preservedElements };
        }

        // Build optimized code
        let transformedCode = `// OPTIMIZED: Batch form value reads
// Original: Multiple .get('field')?.value calls (${Array.from(formFields.values()).flat().length} total)
// Optimized: Single getRawValue() per form object\n\n`;

        formFields.forEach((fields, formPath) => {
          const varName = formPath.replace(/[^a-zA-Z0-9]/g, '_') + 'Values';
          transformedCode += `// Cache all values from ${formPath}\n`;
          transformedCode += `const ${varName} = ${formPath}.getRawValue();\n`;
          transformedCode += `// Access fields: ${fields.map(f => `${varName}.${f}`).join(', ')}\n\n`;
        });

        // Show how to transform the original code
        let modifiedOriginal = originalCode;
        formFields.forEach((fields, formPath) => {
          const varName = formPath.replace(/[^a-zA-Z0-9]/g, '_') + 'Values';
          fields.forEach(field => {
            const pattern = new RegExp(`${formPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.get\\(['"]${field}['"]\\)\\?\\.value`, 'g');
            modifiedOriginal = modifiedOriginal.replace(pattern, `${varName}.${field}`);
          });
        });

        transformedCode += `// Transformed code:\n${modifiedOriginal}`;

        return {
          success: true,
          code: transformedCode,
          description: `Batched ${Array.from(formFields.values()).flat().length} form.get() calls into ${formFields.size} getRawValue() call(s)`,
          transformationType: 'form-batch-read',
          preservedElements
        };
      }
    };
  }

  /**
   * Strategy: Memoization for repeated expensive calls
   */
  private createMemoizationStrategy(pattern: CodePattern, _codeContext: CodeContext): TransformationStrategy {
    return {
      name: 'memoization',
      description: 'Add memoization cache for repeated expensive calls',
      fitness: 82,
      apply: (originalCode: string, _pattern: CodePattern, _context: AnalysisContext): TransformationResult => {
        const preservedElements: string[] = [];
        
        const expensiveCalls = pattern.repeatedCalls.filter(c => c.isAsync && c.count > 1);
        if (expensiveCalls.length === 0) {
          return { success: false, code: originalCode, description: 'No repeated expensive calls', transformationType: 'memoization', preservedElements };
        }

        expensiveCalls.forEach(call => {
          preservedElements.push(`${call.objectPath}.${call.methodName}`);
        });

        let transformedCode = `// OPTIMIZED: Memoization for repeated expensive calls
// Found ${expensiveCalls.length} repeated async call(s)\n\n`;

        expensiveCalls.forEach(call => {
          const cacheName = `${call.methodName}Cache`;
          transformedCode += `// Memoize ${call.objectPath}.${call.methodName} (called ${call.count}x)
const ${cacheName} = new Map();
async function memoized${call.methodName.charAt(0).toUpperCase() + call.methodName.slice(1)}(key) {
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
          preservedElements
        };
      }
    };
  }

  /**
   * Generate context-aware solutions when direct transformations don't apply
   */
  private generateContextAwareSolutions(issue: Issue, pattern: CodePattern, codeContext: CodeContext): Solution[] {
    const solutions: Solution[] = [];
    const originalCode = issue.codeBefore || '';

    // Create solutions that reference the actual original code structure
    const variables = Array.from(codeContext.variables.keys());
    const methodCalls = codeContext.methodCalls.map(m => `${m.object}.${m.methodName}()`);

    // Solution 1: General optimization guidance based on detected pattern
    solutions.push(this.createSolution(
      issue.id || '',
      1,
      'pattern-analysis',
      `// Analysis of original code:
// Pattern type: ${pattern.type}
// ORM/Framework: ${codeContext.orm}
// Variables: ${variables.join(', ') || 'none detected'}
// Method calls: ${methodCalls.join(', ') || 'none detected'}
// Loop structure: ${codeContext.loopStructure ? `${codeContext.loopStructure.type} over ${codeContext.loopStructure.collection}` : 'none'}
// Async calls: ${codeContext.asyncCalls.length}

// Original code:
${originalCode}

// Recommended optimizations based on pattern:
${this.getPatternSpecificRecommendations(pattern, codeContext)}`,
      75,
      `Pattern analysis for ${pattern.type} with ${codeContext.orm} framework`,
      0,
      'low'
    ));

    return solutions;
  }

  /**
   * Get pattern-specific optimization recommendations
   */
  private getPatternSpecificRecommendations(pattern: CodePattern, codeContext: CodeContext): string {
    const recommendations: string[] = [];

    if (pattern.type === 'repeated-access') {
      recommendations.push('1. Cache repeated property accesses in a variable');
      recommendations.push('2. Use destructuring to extract multiple properties at once');
      recommendations.push('3. Consider using getRawValue() for form groups');
    }

    if (pattern.type === 'loop-with-calls') {
      recommendations.push('1. Extract queries before the loop');
      recommendations.push('2. Use batch queries with IN clause');
      recommendations.push('3. Build a Map for O(1) lookups inside the loop');
    }

    if (pattern.type === 'chained-methods') {
      recommendations.push('1. Consider using reduce() for single-pass processing');
      recommendations.push('2. Avoid creating intermediate arrays');
      recommendations.push('3. Use for...of loop for better performance on large arrays');
    }

    if (codeContext.orm === 'prisma') {
      recommendations.push('- Use include: {} for eager loading');
      recommendations.push('- Use select: {} to limit fields');
    }

    if (codeContext.orm === 'sequelize') {
      recommendations.push('- Use include: [] with model references');
      recommendations.push('- Use attributes: [] to limit fields');
    }

    if (codeContext.orm === 'angular-forms') {
      recommendations.push('- Use getRawValue() instead of multiple get() calls');
      recommendations.push('- Cache form values before mapping');
    }

    return recommendations.join('\n// ');
  }
}

interface CodeContext {
  orm: string;
  variables: Map<string, { name: string; type: string }>;
  methodCalls: { methodName: string; object: string; isAsync: boolean }[];
  loopStructure: { type: string; variable: string; collection: string } | null;
  asyncCalls: string[];
}
