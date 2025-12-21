import { Router, Request, Response } from 'express';
import { CodeAnalyzer } from '../../analyzer/code-analyzer';
import { db } from '../database';

const router = Router();
const analyzer = new CodeAnalyzer();

router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { code, filePath, generateSolutions = false } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    const results = await analyzer.analyzeCode(code, filePath || 'unknown.js', generateSolutions);

    let totalIssues = 0;
    const issuesBySeverity = { critical: 0, high: 0, medium: 0, low: 0 };

    results.forEach((result) => {
      totalIssues += result.issues.length;
      result.issues.forEach((issue) => {
        const severity = issue.severity.toLowerCase();
        if (severity in issuesBySeverity) {
          issuesBySeverity[severity as keyof typeof issuesBySeverity]++;
        }
      });
    });

    const score = Math.max(0, 100 - totalIssues * 5);

    // Normalize solution fields for frontend (generator uses code/reasoning, frontend expects codeAfter/description)
    const normalizedResults = results.map((detector) => ({
      ...detector,
      issues: detector.issues.map((issue) => ({
        ...issue,
        solutions: issue.solutions?.map((sol: any) => ({
          ...sol,
          description: sol.description ?? sol.reasoning ?? '',
          codeAfter: sol.codeAfter ?? sol.code ?? '',
        })),
      })),
    }));

    res.json({
      success: true,
      score,
      totalIssues,
      issuesBySeverity,
      results: normalizedResults,
    });
    return;
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Analysis failed', message: (error as Error).message });
    return;
  }
});

router.post('/repository/:repoId/analyze', async (req: Request, res: Response) => {
  try {
    const { repoId } = req.params;
    const { code, filePath, generateSolutions = false } = req.body;

    const repository = await db.getRepository(repoId);
    if (!repository) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const results = await analyzer.analyzeCode(code, filePath || 'unknown.js', generateSolutions);

    let totalIssues = 0;
    const issuesBySeverity = { critical: 0, high: 0, medium: 0, low: 0 };

    results.forEach((result) => {
      totalIssues += result.issues.length;
      result.issues.forEach((issue) => {
        const severity = issue.severity.toLowerCase();
        if (severity in issuesBySeverity) {
          issuesBySeverity[severity as keyof typeof issuesBySeverity]++;
        }
      });
    });

    const score = Math.max(0, 100 - totalIssues * 5);

    const analysis = await db.createAnalysis(repoId, score, {
      total: totalIssues,
      ...issuesBySeverity,
    });

    for (const result of results) {
      for (const issue of result.issues) {
        const dbIssue = await db.createIssue(analysis.id, {
          type: result.detectorName,
          severity: issue.severity,
          filePath: issue.filePath,
          lineNumber: issue.lineNumber,
          title: issue.title,
          description: issue.description,
          codeBefore: issue.codeBefore,
          codeAfter: issue.codeAfter || null,
          estimatedImpact: issue.estimatedImpact || {},
        });

        if (issue.solutions) {
          for (const solution of issue.solutions) {
            await db.createSolution(dbIssue.id, solution);
          }
        }
      }
    }

    // Normalize solution fields for frontend
    const normalizedResults = results.map((detector) => ({
      ...detector,
      issues: detector.issues.map((issue) => ({
        ...issue,
        solutions: issue.solutions?.map((sol: any) => ({
          ...sol,
          description: sol.description ?? sol.reasoning ?? '',
          codeAfter: sol.codeAfter ?? sol.code ?? '',
        })),
      })),
    }));

    res.json({
      success: true,
      analysisId: analysis.id,
      score,
      totalIssues,
      issuesBySeverity,
      results: normalizedResults,
    });
    return;
  } catch (error) {
    console.error('Repository analysis error:', error);
    res.status(500).json({ error: 'Analysis failed', message: (error as Error).message });
    return;
  }
});

router.get('/analysis/:analysisId', async (req: Request, res: Response) => {
  try {
    const { analysisId } = req.params;

    const analysis = await db.getAnalysis(analysisId);
    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    const issues = await db.getIssuesByAnalysis(analysisId);

    res.json({
      success: true,
      analysis: {
        ...analysis,
        issues,
      },
    });
    return;
  } catch (error) {
    console.error('Get analysis error:', error);
    res.status(500).json({ error: 'Failed to retrieve analysis', message: (error as Error).message });
    return;
  }
});

router.get('/repository/:repoId/analyses', async (req: Request, res: Response) => {
  try {
    const { repoId } = req.params;

    const repository = await db.getRepository(repoId);
    if (!repository) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const analyses = await db.getAnalysesByRepository(repoId);

    res.json({
      success: true,
      repository,
      analyses,
    });
    return;
  } catch (error) {
    console.error('Get analyses error:', error);
    res.status(500).json({ error: 'Failed to retrieve analyses', message: (error as Error).message });
    return;
  }
});

export default router;
