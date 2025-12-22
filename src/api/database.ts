import prisma from './prisma';

export class DatabaseService {
  async createRepository(githubUrl: string, name: string, ownerId: string) {
    return prisma.repository.create({
      data: { githubUrl, name, ownerId },
    });
  }

  async getRepository(id: string) {
    return prisma.repository.findUnique({ where: { id } });
  }

  async getAllRepositories() {
    return prisma.repository.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        analyses: {
          orderBy: { analyzedAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  async deleteRepository(id: string) {
    return prisma.repository.delete({ where: { id } });
  }

  async createAnalysis(repositoryId: string, score: number, issuesCounts: any) {
    return prisma.analysis.create({
      data: {
        repositoryId,
        score,
        totalIssues: issuesCounts.total,
        criticalIssues: issuesCounts.critical,
        highIssues: issuesCounts.high,
        mediumIssues: issuesCounts.medium,
      },
    });
  }

  async getAnalysis(id: string) {
    return prisma.analysis.findUnique({ where: { id } });
  }

  async getAnalysesByRepository(repositoryId: string) {
    return prisma.analysis.findMany({
      where: { repositoryId },
      orderBy: { analyzedAt: 'desc' },
    });
  }

  async createIssue(analysisId: string, issue: any) {
    return prisma.issue.create({
      data: {
        analysisId,
        type: issue.type,
        severity: issue.severity,
        filePath: issue.filePath,
        lineNumber: issue.lineNumber,
        title: issue.title,
        description: issue.description,
        codeBefore: issue.codeBefore,
        codeAfter: issue.codeAfter,
        estimatedImpact: issue.estimatedImpact,
      },
    });
  }

  async getIssuesByAnalysis(analysisId: string) {
    return prisma.issue.findMany({
      where: { analysisId },
      include: { solutions: { orderBy: { rank: 'asc' } } },
      orderBy: [{ severity: 'desc' }, { lineNumber: 'asc' }],
    });
  }

  async createSolution(issueId: string, solution: any) {
    const normalized = {
      type: solution.type,
      description: solution.description ?? solution.reasoning ?? '',
      codeAfter: solution.codeAfter ?? solution.code ?? '',
      explanation: solution.explanation ?? solution.reasoning ?? null,
      estimatedImpact: solution.estimatedImpact ?? null,
      difficulty: solution.difficulty ?? null,
      fitnessScore: solution.fitnessScore ?? 0,
      rank: solution.rank ?? 0,
    };

    return prisma.solution.create({
      data: {
        issueId,
        type: normalized.type,
        description: normalized.description,
        codeAfter: normalized.codeAfter,
        explanation: normalized.explanation,
        estimatedImpact: normalized.estimatedImpact,
        difficulty: normalized.difficulty,
        fitnessScore: normalized.fitnessScore,
        rank: normalized.rank,
      },
    });
  }

  async getSolutionsByIssue(issueId: string) {
    return prisma.solution.findMany({
      where: { issueId },
      orderBy: { rank: 'asc' },
    });
  }
}

export const db = new DatabaseService();
