import { Solution, Issue } from '../types';

export interface FitnessWeights {
  performance: number;
  complexity: number;
  maintainability: number;
  compatibility: number;
}

export type WeightPreset = 'balanced' | 'performance' | 'maintainability' | 'enterprise';

export const WEIGHT_PRESETS: Record<WeightPreset, FitnessWeights> = {
  balanced: {
    performance: 0.35,
    complexity: 0.25,
    maintainability: 0.25,
    compatibility: 0.15,
  },
  performance: {
    performance: 0.55,
    complexity: 0.15,
    maintainability: 0.15,
    compatibility: 0.15,
  },
  maintainability: {
    performance: 0.20,
    complexity: 0.20,
    maintainability: 0.45,
    compatibility: 0.15,
  },
  enterprise: {
    performance: 0.25,
    complexity: 0.20,
    maintainability: 0.35,
    compatibility: 0.20,
  },
};

export class FitnessCalculator {
  private weights: FitnessWeights;

  constructor(preset: WeightPreset = 'balanced') {
    this.weights = WEIGHT_PRESETS[preset];
  }

  setWeights(weights: FitnessWeights): void {
    this.weights = weights;
  }

  calculateFitness(solution: Solution, _issue: Issue, context: any): number {
    const performanceScore = this.calculatePerformanceScore(solution);
    const complexityScore = this.calculateComplexityScore(solution);
    const maintainabilityScore = this.calculateMaintainabilityScore(solution);
    const compatibilityScore = this.calculateCompatibilityScore(solution, context);

    return (
      performanceScore * this.weights.performance +
      complexityScore * this.weights.complexity +
      maintainabilityScore * this.weights.maintainability +
      compatibilityScore * this.weights.compatibility
    );
  }

  estimateImplementationTime(code: string, solutionType: string): number {
    const lines = code.split('\n').filter(l => l.trim().length > 0).length;
    const asyncOps = (code.match(/await|\.then\(/g) || []).length;
    const conditionals = (code.match(/if|switch|case|\?/g) || []).length;
    const loops = (code.match(/for|while|map|filter|reduce|forEach/g) || []).length;
    const dbCalls = (code.match(/prisma\.|mongoose\.|findMany|findUnique|create|update|delete|aggregate/g) || []).length;
    const functions = (code.match(/function|=>|\bconst\s+\w+\s*=\s*\(/g) || []).length;
    
    const typeComplexity: { [key: string]: number } = {
      raw_join: 30,
      dataloader: 25,
      batch_query: 20,
      prisma_include: 10,
      prisma_select: 8,
      eager_loading: 12,
      mongoose_populate: 15,
    };
    
    let baseTime = typeComplexity[solutionType] || 15;
    baseTime += lines * 0.5;
    baseTime += asyncOps * 3;
    baseTime += conditionals * 2;
    baseTime += loops * 4;
    baseTime += dbCalls * 5;
    baseTime += functions * 3;
    
    return Math.round(Math.max(5, Math.min(180, baseTime)));
  }

  private calculatePerformanceScore(solution: Solution): number {
    let score = 70;
    const code = solution.code;

    const dbCallCount = (code.match(/\.(find|findOne|findMany|findUnique|create|update|delete|aggregate|query|exec)\(/g) || []).length;
    if (dbCallCount === 0) {
      score += 15;
    } else if (dbCallCount === 1) {
      score += 25;
    } else if (dbCallCount === 2) {
      score += 10;
    } else {
      score -= (dbCallCount - 2) * 5;
    }

    if (code.includes('include') || code.includes('populate') || code.includes('join')) {
      score += 10;
    }

    if (code.includes('select') || code.includes('projection')) {
      score += 5;
    }

    const loopCount = (code.match(/\bfor\s*\(|\bwhile\s*\(|\.forEach\(|\.map\(/g) || []).length;
    if (loopCount === 0) {
      score += 5;
    } else {
      score -= loopCount * 3;
    }

    if (code.includes('Promise.all') || code.includes('await Promise.all')) {
      score += 8;
    }

    if (code.includes('cache') || code.includes('memoize')) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
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
    let score = 70;
    const code = solution.code;
    const lines = code.split('\n').filter(l => l.trim().length > 0);

    const avgLineLength = lines.reduce((sum, line) => sum + line.trim().length, 0) / lines.length;
    if (avgLineLength < 60) {
      score += 10;
    } else if (avgLineLength > 100) {
      score -= 10;
    }

    const hasComments = code.includes('//') || code.includes('/*');
    if (hasComments) {
      score += 5;
    }

    const cyclomaticComplexity = (code.match(/if|else|switch|case|for|while|\?|&&|\|\|/g) || []).length;
    if (cyclomaticComplexity < 5) {
      score += 15;
    } else if (cyclomaticComplexity < 10) {
      score += 5;
    } else {
      score -= (cyclomaticComplexity - 10) * 2;
    }

    const usesORMAbstraction = code.match(/\.(findMany|findUnique|include|select|populate)\(/g);
    if (usesORMAbstraction && usesORMAbstraction.length > 0) {
      score += 10;
    }

    const usesRawSQL = code.includes('$queryRaw') || code.includes('raw(') || code.includes('SELECT') || code.includes('FROM');
    if (usesRawSQL) {
      score -= 15;
    }

    const functionCount = (code.match(/function\s+\w+|const\s+\w+\s*=\s*\(/g) || []).length;
    if (functionCount > 3) {
      score -= 5;
    }

    const nestingLevel = this.calculateMaxNesting(code);
    if (nestingLevel < 3) {
      score += 10;
    } else if (nestingLevel > 4) {
      score -= (nestingLevel - 4) * 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  private calculateMaxNesting(code: string): number {
    let maxNesting = 0;
    let currentNesting = 0;
    for (const char of code) {
      if (char === '{') {
        currentNesting++;
        maxNesting = Math.max(maxNesting, currentNesting);
      } else if (char === '}') {
        currentNesting--;
      }
    }
    return maxNesting;
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
