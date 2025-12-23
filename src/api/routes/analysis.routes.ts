import { Router, Request, Response } from 'express';
import { CodeAnalyzer } from '../../analyzer/code-analyzer';
import { db } from '../database';
import { sendProgressUpdate } from './sse.routes';

const router = Router();

router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { code, filePath, generateSolutions = false, sessionId } = req.body;
    
    // Create analyzer instance for this request
    const analyzer = new CodeAnalyzer();
    
    // Listen for evolution progress events
    if (sessionId) {
      analyzer.on('evolution-progress', (progress) => {
        sendProgressUpdate(sessionId, {
          type: 'evolution-progress',
          ...progress
        });
      });
    }

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

// Analyze entire GitHub repository
router.post('/repository/:repoId/analyze-github', async (req: Request, res: Response) => {
  const { cloneRepository, readCodeFiles, cleanupRepository } = await import('../../utils/github-utils');
  
  try {
    const { repoId } = req.params;
    const { generateSolutions = false, sessionId } = req.body;

    const repository = await db.getRepository(repoId);
    if (!repository) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    // Create analyzer instance for this request
    const analyzer = new CodeAnalyzer();
    
    // Listen for evolution progress events
    if (sessionId) {
      analyzer.on('evolution-progress', (progress) => {
        sendProgressUpdate(sessionId, {
          type: 'evolution-progress',
          ...progress
        });
      });
    }

    // Clone the repository
    console.log(`Starting analysis of ${repository.githubUrl}...`);
    const cloneResult = await cloneRepository(repository.githubUrl);
    
    if (!cloneResult.success) {
      return res.status(500).json({ 
        error: 'Failed to clone repository', 
        message: cloneResult.error 
      });
    }

    try {
      // Find and read all code files
      console.log(`Reading code files from ${cloneResult.localPath}...`);
      const files = await readCodeFiles(cloneResult.localPath);
      
      if (files.length === 0) {
        cleanupRepository(cloneResult.localPath);
        return res.json({
          success: true,
          message: 'No code files found in repository',
          filesAnalyzed: 0,
          results: []
        });
      }

      console.log(`Found ${files.length} code files to analyze`);

      // Analyze each file
      const allResults: any[] = [];
      let totalIssues = 0;
      const issuesBySeverity = { critical: 0, high: 0, medium: 0, low: 0 };

      for (const file of files) {
        try {
          const results = await analyzer.analyzeCode(file.content, file.relativePath, generateSolutions);
          
          results.forEach((result) => {
            totalIssues += result.issues.length;
            result.issues.forEach((issue) => {
              const severity = issue.severity.toLowerCase();
              if (severity in issuesBySeverity) {
                issuesBySeverity[severity as keyof typeof issuesBySeverity]++;
              }
              // Add file path to issue
              issue.filePath = file.relativePath;
            });
          });

          allResults.push(...results);
        } catch (error) {
          console.error(`Error analyzing ${file.relativePath}:`, error);
        }
      }

      const score = Math.max(0, 100 - totalIssues * 5);

      // Save analysis to database
      const analysis = await db.createAnalysis(repoId, score, {
        total: totalIssues,
        ...issuesBySeverity,
      });

      // Save issues to database
      for (const result of allResults) {
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

      // Cleanup cloned repository
      cleanupRepository(cloneResult.localPath);

      // Normalize results for frontend
      const normalizedResults = allResults.map((detector) => ({
        ...detector,
        issues: detector.issues.map((issue: any) => ({
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
        filesAnalyzed: files.length,
        results: normalizedResults,
      });
      return;
    } catch (error) {
      // Cleanup on error
      cleanupRepository(cloneResult.localPath);
      throw error;
    }
  } catch (error) {
    console.error('Repository analysis error:', error);
    res.status(500).json({ 
      error: 'Analysis failed', 
      message: (error as Error).message 
    });
    return;
  }
});

export default router;
