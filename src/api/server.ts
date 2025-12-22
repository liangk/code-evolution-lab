import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import analysisRoutes from './routes/analysis.routes';
import authRoutes from './routes/auth.routes';
import repositoryRoutes from './routes/repository.routes';
import { apiLimiter, analysisLimiter } from './middleware/rateLimiter';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(apiLimiter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Code Evolution Lab API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/repositories', repositoryRoutes);
app.use('/api', analysisLimiter, analysisRoutes);

app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Analysis endpoint: http://localhost:${PORT}/api/analyze`);
});

export default app;
