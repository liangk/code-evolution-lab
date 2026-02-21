import { Issue, Solution, AnalysisContext } from '../types';
import { FitnessCalculator, WeightPreset } from './fitness-calculator';
import { analyzeCodePattern, generateTransformationCandidates, CodePattern, TransformationResult } from '../utils/code-transformer';

export interface TransformationStrategy {
  name: string;
  description: string;
  apply: (originalCode: string, pattern: CodePattern, context: AnalysisContext) => TransformationResult;
  fitness: number;
}

export abstract class BaseSolutionGenerator {
  abstract name: string;
  protected fitnessCalculator: FitnessCalculator;

  constructor() {
    const weightPreset = (process.env.FITNESS_WEIGHT_PRESET || 'balanced') as WeightPreset;
    this.fitnessCalculator = new FitnessCalculator(weightPreset);
  }

  abstract generateSolutions(issue: Issue, context: AnalysisContext): Promise<Solution[]>;

  /**
   * Generate solutions by transforming the original problematic code
   * This is the core method that should be used instead of template-based generation
   */
  protected generateTransformationBasedSolutions(issue: Issue, context: AnalysisContext, strategies: TransformationStrategy[]): Solution[] {
    const originalCode = issue.codeBefore || '';
    if (!originalCode.trim()) {
      console.warn(`[${this.name}] No original code provided for issue: ${issue.title}`);
      return [];
    }

    const pattern = analyzeCodePattern(originalCode);
    const solutions: Solution[] = [];

    // Apply each transformation strategy to the original code
    for (const strategy of strategies) {
      try {
        const result = strategy.apply(originalCode, pattern, context);
        if (result.success && this.isValidCode(result.code)) {
          solutions.push(this.createSolution(
            issue.id || '',
            solutions.length + 1,
            strategy.name,
            result.code,
            strategy.fitness,
            `${strategy.description}\nPreserved: ${result.preservedElements.join(', ')}`,
            0, // Will be calculated
            this.assessRiskLevel(result)
          ));
        } else if (result.success && !this.isValidCode(result.code)) {
          console.warn(`[${this.name}] Strategy ${strategy.name} generated comment-only code, skipping`);
        }
      } catch (error) {
        console.warn(`[${this.name}] Strategy ${strategy.name} failed:`, error);
      }
    }

    // Also try generic transformations from the transformer module
    const genericTransforms = generateTransformationCandidates(originalCode);
    for (const transform of genericTransforms) {
      if (!solutions.some(s => s.type === transform.transformationType) && this.isValidCode(transform.code)) {
        solutions.push(this.createSolution(
          issue.id || '',
          solutions.length + 1,
          transform.transformationType,
          transform.code,
          this.calculateTransformFitness(transform),
          transform.description,
          0,
          this.assessRiskLevel(transform)
        ));
      } else if (!this.isValidCode(transform.code)) {
        console.warn(`[${this.name}] Generic transform ${transform.transformationType} generated comment-only code, skipping`);
      }
    }

    return solutions;
  }

  /**
   * Assess risk level based on transformation result
   */
  protected assessRiskLevel(result: TransformationResult): 'low' | 'medium' | 'high' {
    // More preserved elements = lower risk
    if (result.preservedElements.length >= 5) return 'low';
    if (result.preservedElements.length >= 2) return 'medium';
    return 'high';
  }

  /**
   * Calculate fitness for a transformation result
   */
  protected calculateTransformFitness(result: TransformationResult): number {
    const baseFitness = 70;
    const preservationBonus = Math.min(result.preservedElements.length * 5, 20);
    return baseFitness + preservationBonus;
  }

  /**
   * Analyze the original code to understand its structure
   */
  protected analyzeOriginalCode(code: string): CodePattern {
    return analyzeCodePattern(code);
  }

  protected createSolution(
    issueId: string,
    rank: number,
    type: string,
    code: string,
    fitnessScore: number,
    reasoning: string,
    _implementationTime: number,
    riskLevel: 'low' | 'medium' | 'high'
  ): Solution {
    const calculatedTime = this.fitnessCalculator.estimateImplementationTime(code, type);
    
    return {
      id: this.generateId(),
      issueId,
      rank,
      type,
      code,
      fitnessScore,
      reasoning,
      implementationTime: calculatedTime,
      riskLevel,
    };
  }

  protected generateId(): string {
    return `sol-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  protected calculateFitnessScore(
    performanceGain: number,
    complexity: number,
    maintainability: number,
    compatibility: number
  ): number {
    const weights = {
      performance: 0.4,
      complexity: 0.2,
      maintainability: 0.25,
      compatibility: 0.15,
    };

    return (
      performanceGain * weights.performance +
      (100 - complexity) * weights.complexity +
      maintainability * weights.maintainability +
      compatibility * weights.compatibility
    );
  }

  /**
   * Validate that generated code contains actual code, not just comments
   */
  protected isValidCode(code: string): boolean {
    // Remove all comments (both single-line and multi-line)
    const codeWithoutComments = code
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
      .replace(/\/\/.*/g, '') // Remove // comments
      .trim();
    
    // If nothing remains after removing comments, it's not valid code
    if (codeWithoutComments.length === 0) {
      return false;
    }
    
    // Check if there's at least some code-like content (keywords, operators, etc.)
    const hasCodeContent = /[;{}()[\]=]|const|let|var|function|class|if|for|while|return|await|async/.test(codeWithoutComments);
    
    return hasCodeContent;
  }
}
