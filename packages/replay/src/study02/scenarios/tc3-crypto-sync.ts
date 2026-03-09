import express from 'express';
import { pbkdf2Sync, pbkdf2, randomBytes } from 'crypto';
import { promisify } from 'util';

if (!process.env.UV_THREADPOOL_SIZE) process.env.UV_THREADPOOL_SIZE = '16';

const pbkdf2Async = promisify(pbkdf2);
const ITERATIONS = Math.max(100_000, Number(process.env.TC3_PBKDF2_ITERATIONS || '100000'));
const KEY_LEN = 64;
const DIGEST = 'sha512';
const SALT = randomBytes(16);

export function createBadServer(): express.Express {
  const app = express();
  app.use(express.json());
  app.post('/api/login', (req, res) => {
    const password = req.body?.password || 'test-password';
    const hash = pbkdf2Sync(password, SALT, ITERATIONS, KEY_LEN, DIGEST);
    res.json({ status: 'ok', hashLength: hash.length });
  });
  app.get('/health', (req, res) => res.json({ ok: true }));
  return app;
}

export function createGoodServer(): express.Express {
  const app = express();
  app.use(express.json());
  app.post('/api/login', async (req, res) => {
    const password = req.body?.password || 'test-password';
    const hash = await pbkdf2Async(password, SALT, ITERATIONS, KEY_LEN, DIGEST);
    res.json({ status: 'ok', hashLength: hash.length });
  });
  app.get('/health', (req, res) => res.json({ ok: true }));
  return app;
}

export const scenario = {
  name: 'TC3: pbkdf2Sync in auth',
  endpoint: '/api/login',
  method: 'POST' as const,
  body: JSON.stringify({ password: 'test-password-123' }),
  headers: { 'Content-Type': 'application/json' },
};
