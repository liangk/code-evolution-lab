import { Issue, Solution } from '../types';

export abstract class BaseSolutionGenerator {
  abstract name: string;

  abstract generateSolutions(issue: Issue, context: any): Promise<Solution[]>;

  protected createSolution(
    issueId: string,
    rank: number,
    type: string,
    code: string,
    fitnessScore: number,
    reasoning: string,
    implementationTime: number,
    riskLevel: 'low' | 'medium' | 'high'
  ): Solution {
    return {
      id: this.generateId(),
      issueId,
      rank,
      type,
      code,
      fitnessScore,
      reasoning,
      implementationTime,
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
}
