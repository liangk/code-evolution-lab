import express from 'express';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export function createBadServer(): express.Express {
  const app = express();
  app.get('/api/system-info', (req, res) => {
    try {
      const hostname = execSync('hostname', { encoding: 'utf-8' }).trim();
      const uptime = execSync('node -e "console.log(process.uptime())"', { encoding: 'utf-8' }).trim();
      res.json({ hostname, uptime, timestamp: Date.now() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  return app;
}

export function createGoodServer(): express.Express {
  const app = express();
  let cachedInfo: any = null;
  let cacheExpiry = 0;
  const CACHE_TTL = 10000;
  app.get('/api/system-info', async (req, res) => {
    try {
      const now = Date.now();
      if (!cachedInfo || now > cacheExpiry) {
        const [hostnameResult, uptimeResult] = await Promise.all([
          execAsync('hostname'),
          execAsync('node -e "console.log(process.uptime())"'),
        ]);
        cachedInfo = {
          hostname: hostnameResult.stdout.trim(),
          uptime: uptimeResult.stdout.trim(),
        };
        cacheExpiry = now + CACHE_TTL;
      }
      res.json({ ...cachedInfo, timestamp: Date.now() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  return app;
}

export const scenario = {
  name: 'TC2: execSync in handler',
  endpoint: '/api/system-info',
};
