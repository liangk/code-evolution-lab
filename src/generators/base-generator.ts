import { Issue, Solution } from '../types';
import { FitnessCalculator, WeightPreset } from './fitness-calculator';

export abstract class BaseSolutionGenerator {
  abstract name: string;
  protected fitnessCalculator: FitnessCalculator;

  constructor() {
    const weightPreset = (process.env.FITNESS_WEIGHT_PRESET || 'balanced') as WeightPreset;
    this.fitnessCalculator = new FitnessCalculator(weightPreset);
  }

  abstract generateSolutions(issue: Issue, context: any): Promise<Solution[]>;

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
}
