import { Router } from 'express';
import { db } from '../database';

const router = Router();

// Get all repositories
router.get('/', async (_req, res) => {
  try {
    const repositories = await db.getAllRepositories();
    res.json(repositories);
  } catch (error) {
    console.error('Error fetching repositories:', error);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

// Get single repository
router.get('/:id', async (req, res) => {
  try {
    const repository = await db.getRepository(req.params.id);
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
router.post('/', async (req, res) => {
  try {
    const { name, githubUrl, ownerId } = req.body;

    if (!name || !githubUrl) {
      return res.status(400).json({ error: 'Name and GitHub URL are required' });
    }

    const repository = await db.createRepository(
      githubUrl,
      name,
      ownerId || 'default-user'
    );

    return res.status(201).json(repository);
  } catch (error) {
    console.error('Error creating repository:', error);
    return res.status(500).json({ error: 'Failed to create repository' });
  }
});

// Delete repository
router.delete('/:id', async (req, res) => {
  try {
    await db.deleteRepository(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting repository:', error);
    res.status(500).json({ error: 'Failed to delete repository' });
  }
});

// Get repository analyses
router.get('/:id/analyses', async (req, res) => {
  try {
    const analyses = await db.getAnalysesByRepository(req.params.id);
    res.json(analyses);
  } catch (error) {
    console.error('Error fetching analyses:', error);
    res.status(500).json({ error: 'Failed to fetch analyses' });
  }
});

export default router;
