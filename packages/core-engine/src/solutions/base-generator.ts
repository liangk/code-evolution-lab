/**
 * Base Solution Generator
 *
 * Ported from `backend/src/generators/base-generator.ts` (private copy, which
 * adds `description`, `explanation` and `generationMethod` to each solution).
 *
 * Solutions are produced by applying transformation strategies to the
 * *original* problematic code, so variable names, loop structure and business
 * logic survive into the suggestion. That is why `DiagnosticIssue.codeBefore`
 * carries the whole construct and not just the reported line.
 */

import { FitnessCalculator, WeightPreset } from './fitness-calculator';
import {
  analyzeCodePattern,
  generateTransformationCandidates,
  CodePattern,
  TransformationResult,
} from './code-transformer';
import type { DiagnosticIssue, Solution, SolutionContext } from './types';

export interface TransformationStrategy {
  name: string;
  description: string;
  apply: (originalCode: string, pattern: CodePattern, context: SolutionContext) => TransformationResult;
  fitness: number;
}

export abstract class BaseSolutionGenerator {
  abstract name: string;
  protected fitnessCalculator: FitnessCalculator;

  constructor(preset: WeightPreset = 'balanced') {
    this.fitnessCalculator = new FitnessCalculator(preset);
  }

  abstract generateSolutions(issue: DiagnosticIssue, context: SolutionContext): Promise<Solution[]>;

  protected generateTransformationBasedSolutions(
    issue: DiagnosticIssue,
    context: SolutionContext,
    strategies: TransformationStrategy[],
  ): Solution[] {
    const originalCode = issue.codeBefore || '';
    if (!originalCode.trim()) return [];

    const pattern = analyzeCodePattern(originalCode);
    const solutions: Solution[] = [];

    for (const strategy of strategies) {
      try {
        const result = strategy.apply(originalCode, pattern, context);
        if (result.success && this.isValidCode(result.code)) {
          solutions.push(
            this.createSolution(
              issue.id || '',
              solutions.length + 1,
              strategy.name,
              result.code,
              strategy.fitness,
              `${strategy.description}\nPreserved: ${result.preservedElements.join(', ')}`,
              this.assessRiskLevel(result),
            )
          );
        }
      } catch {
        // A strategy that throws is skipped; the others still run.
      }
    }

    // Generic transformations that apply regardless of category.
    const genericTransforms = generateTransformationCandidates(originalCode);
    for (const transform of genericTransforms) {
      if (!solutions.some(s => s.type === transform.transformationType) && this.isValidCode(transform.code)) {
        solutions.push(
          this.createSolution(
            issue.id || '',
            solutions.length + 1,
            transform.transformationType,
            transform.code,
            this.calculateTransformFitness(transform),
            transform.description,
            this.assessRiskLevel(transform),
          )
        );
      }
    }

    return solutions;
  }

  /** More preserved elements from the original code means a safer rewrite. */
  protected assessRiskLevel(result: TransformationResult): 'low' | 'medium' | 'high' {
    if (result.preservedElements.length >= 5) return 'low';
    if (result.preservedElements.length >= 2) return 'medium';
    return 'high';
  }

  protected calculateTransformFitness(result: TransformationResult): number {
    const baseFitness = 70;
    const preservationBonus = Math.min(result.preservedElements.length * 5, 20);
    return baseFitness + preservationBonus;
  }

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
    riskLevel: 'low' | 'medium' | 'high',
  ): Solution {
    return {
      id: this.generateId(),
      issueId,
      rank,
      type,
      code,
      fitnessScore,
      reasoning,
      description: reasoning.split('\n')[0],
      explanation: reasoning,
      generationMethod: 'heuristic',
      implementationTime: this.fitnessCalculator.estimateImplementationTime(code, type),
      riskLevel,
    };
  }

  protected generateId(): string {
    return `sol-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Reject output that is only commentary. A "solution" made entirely of
   * comments reads as a suggestion but cannot be applied, and it is how the
   * old pattern-analysis fallback got into published results.
   */
  protected isValidCode(code: string): boolean {
    const codeWithoutComments = code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '')
      .trim();

    if (codeWithoutComments.length === 0) return false;

    return /[;{}()[\]=]|const|let|var|function|class|if|for|while|return|await|async/.test(codeWithoutComments);
  }
}
