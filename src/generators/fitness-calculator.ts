import { Solution, Issue } from '../types';

export class FitnessCalculator {
  calculateFitness(solution: Solution, _issue: Issue, context: any): number {
    const performanceScore = this.calculatePerformanceScore(solution);
    const complexityScore = this.calculateComplexityScore(solution);
    const maintainabilityScore = this.calculateMaintainabilityScore(solution);
    const compatibilityScore = this.calculateCompatibilityScore(solution, context);

    const weights = {
      performance: 0.4,
      complexity: 0.2,
      maintainability: 0.25,
      compatibility: 0.15,
    };

    return (
      performanceScore * weights.performance +
      complexityScore * weights.complexity +
      maintainabilityScore * weights.maintainability +
      compatibilityScore * weights.compatibility
    );
  }

  private calculatePerformanceScore(solution: Solution): number {
    const typeScores: { [key: string]: number } = {
      eager_loading: 95,
      prisma_include: 95,
      prisma_select: 98,
      mongoose_populate: 90,
      batch_query: 90,
      raw_join: 100,
      dataloader: 85,
    };

    return typeScores[solution.type] || 70;
  }

  private calculateComplexityScore(solution: Solution): number {
    const riskScores = {
      low: 90,
      medium: 70,
      high: 50,
    };

    let score = riskScores[solution.riskLevel] || 60;

    if (solution.implementationTime < 30) {
      score += 10;
    } else if (solution.implementationTime > 120) {
      score -= 20;
    }

    return Math.max(0, Math.min(100, score));
  }

  private calculateMaintainabilityScore(solution: Solution): number {
    const typeScores: { [key: string]: number } = {
      eager_loading: 90,
      prisma_include: 95,
      prisma_select: 90,
      mongoose_populate: 85,
      batch_query: 75,
      raw_join: 60,
      dataloader: 70,
    };

    return typeScores[solution.type] || 70;
  }

  private calculateCompatibilityScore(solution: Solution, context: any): number {
    let score = 80;

    if (context?.existingPatterns?.includes(solution.type)) {
      score += 20;
    }

    if (solution.type === 'dataloader' && !context?.dependencies?.includes('dataloader')) {
      score -= 15;
    }

    if (solution.type === 'raw_join') {
      score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  rankSolutions(solutions: Solution[], issue: Issue, context: any): Solution[] {
    return solutions
      .map((solution) => ({
        ...solution,
        fitnessScore: this.calculateFitness(solution, issue, context),
      }))
      .sort((a, b) => b.fitnessScore - a.fitnessScore)
      .map((solution, index) => ({
        ...solution,
        rank: index + 1,
      }));
  }
}

export default new FitnessCalculator();
