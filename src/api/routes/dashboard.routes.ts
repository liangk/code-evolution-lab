import { Router } from 'express';
import { db } from '../database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Get dashboard statistics
router.get('/stats', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const stats = await db.getDashboardStats(req.user!.id);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// Get recent analyses
router.get('/recent-analyses', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const analyses = await db.getRecentAnalyses(req.user!.id, limit);
    res.json(analyses);
  } catch (error) {
    console.error('Error fetching recent analyses:', error);
    res.status(500).json({ error: 'Failed to fetch recent analyses' });
  }
});

// Get recent issues
router.get('/recent-issues', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const issues = await db.getRecentIssues(req.user!.id, limit);
    res.json(issues);
  } catch (error) {
    console.error('Error fetching recent issues:', error);
    res.status(500).json({ error: 'Failed to fetch recent issues' });
  }
});

export default router;
