import { Router } from 'express';
import { db } from '../database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all repositories
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const repositories = await db.getAllRepositories(req.user!.id);
    res.json(repositories);
  } catch (error) {
    console.error('Error fetching repositories:', error);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

// Get single repository
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const repository = await db.getRepository(req.params.id, req.user!.id);
    if (!repository) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    return res.json(repository);
  } catch (error) {
    console.error('Error fetching repository:', error);
    return res.status(500).json({ error: 'Failed to fetch repository' });
  }
});

// Create new repository
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { name, githubUrl } = req.body;

    if (!name || !githubUrl) {
      return res.status(400).json({ error: 'Name and GitHub URL are required' });
    }

    const repository = await db.createRepository(
      githubUrl,
      name,
      req.user!.id
    );

    return res.status(201).json(repository);
  } catch (error) {
    console.error('Error creating repository:', error);
    return res.status(500).json({ error: 'Failed to create repository' });
  }
});

// Delete repository
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    await db.deleteRepository(req.params.id, req.user!.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting repository:', error);
    res.status(500).json({ error: 'Failed to delete repository' });
  }
});

// Get repository analyses
router.get('/:id/analyses', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const analyses = await db.getAnalysesByRepository(req.params.id, req.user!.id);
    res.json(analyses);
  } catch (error) {
    console.error('Error fetching analyses:', error);
    res.status(500).json({ error: 'Failed to fetch analyses' });
  }
});

export default router;
