import express from 'express';
import { appendFileSync, appendFile, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';

const appendFileAsync = promisify(appendFile);

const BASE_RESULTS_DIR = process.env.CODE_EVOLUTION_LAB_RESULTS_DIR || join(process.cwd(), 'results');
const FIXTURE_DIR = join(BASE_RESULTS_DIR, 'study02', '.fixtures');
const LOG_FILE_BAD = join(FIXTURE_DIR, 'audit-bad.log');
const LOG_FILE_GOOD = join(FIXTURE_DIR, 'audit-good.log');

function ensureFixture() {
  if (!existsSync(FIXTURE_DIR)) mkdirSync(FIXTURE_DIR, { recursive: true });
  writeFileSync(LOG_FILE_BAD, '');
  writeFileSync(LOG_FILE_GOOD, '');
}

export function createBadServer(): express.Express {
  ensureFixture();
  const app = express();
  app.get('/api/action', (req, res) => {
    const entry = `[${new Date().toISOString()}] action from ${req.ip}\n`;
    appendFileSync(LOG_FILE_BAD, entry);
    res.json({ status: 'logged' });
  });
  return app;
}

export function createGoodServer(): express.Express {
  ensureFixture();
  const app = express();
  let buffer: string[] = [];
  let flushTimer: NodeJS.Timeout | null = null;
  const FLUSH_INTERVAL = 100;
  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      if (buffer.length === 0) return;
      const batch = buffer.join('');
      buffer = [];
      await appendFileAsync(LOG_FILE_GOOD, batch);
    }, FLUSH_INTERVAL);
  }
  app.get('/api/action', (req, res) => {
    const entry = `[${new Date().toISOString()}] action from ${req.ip}\n`;
    buffer.push(entry);
    scheduleFlush();
    res.json({ status: 'logged' });
  });
  return app;
}

export const scenario = {
  name: 'TC4: writeFileSync in handler',
  endpoint: '/api/action',
};
