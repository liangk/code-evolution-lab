import prisma from './prisma';

export class DatabaseService {
  async createRepository(githubUrl: string, name: string, ownerId: string) {
    return prisma.repository.create({
      data: { githubUrl, name, ownerId },
    });
  }

  async getRepository(id: string, ownerId: string) {
    return prisma.repository.findUnique({ 
      where: { id, ownerId } 
    });
  }

  async getAllRepositories(ownerId: string) {
    return prisma.repository.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      include: {
        analyses: {
          orderBy: { analyzedAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  async deleteRepository(id: string, ownerId: string) {
    return prisma.repository.delete({ 
      where: { id, ownerId } 
    });
  }

  async createAnalysis(repositoryId: string, score: number, issuesCounts: any, filesAnalyzed: number = 1) {
    const analysis = await prisma.analysis.create({
      data: {
        repositoryId,
        score,
        filesAnalyzed,
        totalIssues: issuesCounts.total,
        criticalIssues: issuesCounts.critical,
        highIssues: issuesCounts.high,
        mediumIssues: issuesCounts.medium,
      },
    });

    await prisma.repository.update({
      where: { id: repositoryId },
      data: { lastAnalyzedAt: new Date() },
    });

    return analysis;
  }

  async getAnalysis(id: string) {
    return prisma.analysis.findUnique({ 
      where: { id },
      include: {
        repository: {
          select: {
            id: true,
            name: true,
            githubUrl: true,
          },
        },
      },
    });
  }

  async getAnalysesByRepository(repositoryId: string, ownerId: string) {
    return prisma.analysis.findMany({
      where: { 
        repositoryId,
        repository: { ownerId }
      },
      orderBy: { analyzedAt: 'desc' },
    });
  }

  async deleteAnalysis(id: string, ownerId: string) {
    const analysis = await prisma.analysis.findFirst({
      where: {
        id,
        repository: { ownerId },
      },
      select: {
        id: true,
        repositoryId: true,
      },
    });

    if (!analysis) {
      return null;
    }

    await prisma.$transaction(async (tx) => {
      await tx.solution.deleteMany({
        where: { issue: { analysisId: analysis.id } },
      });
      await tx.issue.deleteMany({
        where: { analysisId: analysis.id },
      });
      await tx.analysis.delete({
        where: { id: analysis.id },
      });

      const latest = await tx.analysis.findFirst({
        where: { repositoryId: analysis.repositoryId },
        orderBy: { analyzedAt: 'desc' },
        select: { analyzedAt: true },
      });

      await tx.repository.update({
        where: { id: analysis.repositoryId },
        data: { lastAnalyzedAt: latest?.analyzedAt ?? null },
      });
    });

    return analysis;
  }

  async createIssue(analysisId: string, issue: any) {
    return prisma.issue.create({
      data: {
        analysisId,
        type: issue.type,
        severity: issue.severity,
        score: issue.score,
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

  async createSession(userId: string, ipAddress: string | null, userAgent: string | null) {
    return prisma.session.create({
      data: { userId, ipAddress, userAgent },
    });
  }

  async getSessionsByUser(userId: string) {
    return prisma.session.findMany({
      where: { userId },
      orderBy: { lastActive: 'desc' },
    });
  }

  async getSession(id: string, userId: string) {
    return prisma.session.findFirst({
      where: { id, userId },
    });
  }

  async revokeSession(id: string, userId: string) {
    return prisma.session.updateMany({
      where: { id, userId },
      data: { isActive: false },
    });
  }

  async revokeAllOtherSessions(currentSessionId: string, userId: string) {
    return prisma.session.updateMany({
      where: {
        userId,
        id: { not: currentSessionId },
        isActive: true,
      },
      data: { isActive: false },
    });
  }
}

export const db = new DatabaseService();
