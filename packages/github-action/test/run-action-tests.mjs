#!/usr/bin/env node
// End-to-end tests for the Code Evolution Lab GitHub Action.
//
// Runs the BUNDLED action (action-dist/index.js) the way the GitHub runner
// does: inputs as INPUT_* env vars (defaults taken from action.yml), outputs
// via $GITHUB_OUTPUT, event payload via $GITHUB_EVENT_PATH, and GitHub API
// calls redirected to a local mock server via $GITHUB_API_URL.
//
// Usage:
//   node run-action-tests.mjs --action <packages/github-action dir> --fixtures <dir> [--dist <index.js>] [--json out.json]
//
// --fixtures should point at packages/core-engine/src/__tests__/fixtures
// (one file per detector category). Exit code is the number of failed tests.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]]);
  return acc;
}, []));
const ACTION_DIR = resolve(args.action ?? '.');
const FIXTURES = resolve(args.fixtures ?? join(ACTION_DIR, '../core-engine/src/__tests__/fixtures'));
const ACTION_YML = readFileSync(join(ACTION_DIR, 'action.yml'), 'utf-8');
const MAIN = ACTION_YML.match(/main:\s*'?([^'\n]+)'?/)[1].trim();
const DIST = resolve(args.dist ?? join(ACTION_DIR, MAIN));
const OWNER = 'acme', REPO = 'widgets', PR = 42;

// ---------------------------------------------------------------------------
// action.yml helpers (tiny YAML subset: the inputs block)
// ---------------------------------------------------------------------------
function declaredInputs() {
  const block = ACTION_YML.split(/^inputs:\s*$/m)[1]?.split(/^\S/m)[0] ?? '';
  const out = {};
  let current = null;
  for (const line of block.split('\n')) {
    const name = line.match(/^ {2}([\w-]+):\s*$/);
    if (name) { current = name[1]; out[current] = { default: undefined }; continue; }
    const def = line.match(/^ {4}default:\s*'?([^'\n]*)'?\s*$/);
    if (def && current) out[current].default = def[1];
  }
  return out;
}
const INPUTS = declaredInputs();

// ---------------------------------------------------------------------------
// Mock GitHub REST API
// ---------------------------------------------------------------------------
const mock = { changedFiles: [], commentStatus: 201, requests: [], comments: [] };
const server = createServer((req, res) => {
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    mock.requests.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body });
    const send = (status, json, headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(JSON.stringify(json));
    };
    if (req.method === 'GET' && url.pathname === `/repos/${OWNER}/${REPO}/pulls/${PR}/files`) {
      const perPage = Math.min(100, Number(url.searchParams.get('per_page') ?? 30)); // GitHub caps per_page at 100
      const page = Number(url.searchParams.get('page') ?? 1);
      const all = mock.changedFiles;
      const slice = all.slice((page - 1) * perPage, page * perPage);
      const last = Math.max(1, Math.ceil(all.length / perPage));
      const headers = page < last
        ? { link: `<http://127.0.0.1:${server.address().port}${url.pathname}?per_page=${perPage}&page=${page + 1}>; rel="next"` }
        : {};
      return send(200, slice.map(filename => ({ filename, status: 'modified' })), headers);
    }
    if (req.method === 'GET' && url.pathname === `/repos/${OWNER}/${REPO}/issues/${PR}/comments`) {
      return send(200, mock.comments);
    }
    if (req.method === 'POST' && url.pathname === `/repos/${OWNER}/${REPO}/issues/${PR}/comments`) {
      if (mock.commentStatus >= 400) return send(mock.commentStatus, { message: 'Resource not accessible by integration' });
      const c = { id: mock.comments.length + 1, body: JSON.parse(body).body };
      mock.comments.push(c);
      return send(201, c);
    }
    const patch = url.pathname.match(new RegExp(`^/repos/${OWNER}/${REPO}/issues/comments/(\\d+)$`));
    if (req.method === 'PATCH' && patch) {
      if (mock.commentStatus >= 400) return send(mock.commentStatus, { message: 'Resource not accessible by integration' });
      const c = mock.comments.find(x => x.id === Number(patch[1]));
      if (!c) return send(404, { message: 'Not Found' });
      c.body = JSON.parse(body).body;
      return send(200, c);
    }
    send(404, { message: `mock: no route for ${req.method} ${url.pathname}` });
  });
});

// ---------------------------------------------------------------------------
// Fixture repos
// ---------------------------------------------------------------------------
const ALL_FIXTURES = readdirSync(FIXTURES);
const CRITICAL_FILES = ['dom.js', 'memory.tsx', 'redos.js'];

/** layout: { 'rel/path': 'fixture-name' | { content } } */
function makeRepo(layout) {
  const dir = mkdtempSync(join(tmpdir(), 'cel-repo-'));
  for (const [rel, src] of Object.entries(layout)) {
    const dest = join(dir, rel);
    mkdirSync(join(dest, '..'), { recursive: true });
    if (typeof src === 'string') cpSync(join(FIXTURES, src), dest);
    else writeFileSync(dest, src.content);
  }
  return dir;
}
const fullRepo = (prefix = '') => Object.fromEntries(ALL_FIXTURES.map(f => [prefix + f, f]));
const cleanRepo = () => ({ 'src/clean.js': 'clean.js' });

// ---------------------------------------------------------------------------
// Runner emulation
// ---------------------------------------------------------------------------
async function runAction({ repo, inputs = {}, event = 'push', token = undefined, envTokenOnly = false }) {
  const work = mkdtempSync(join(tmpdir(), 'cel-run-'));
  const outputFile = join(work, 'output'); writeFileSync(outputFile, '');
  const eventFile = join(work, 'event.json');
  const payload = event === 'pull_request'
    ? { action: 'synchronize', number: PR, pull_request: { number: PR, head: { sha: 'abc' }, base: { sha: 'def' } }, repository: { name: REPO, owner: { login: OWNER } } }
    : { ref: 'refs/heads/main', repository: { name: REPO, owner: { login: OWNER } } };
  writeFileSync(eventFile, JSON.stringify(payload));

  const env = {
    PATH: process.env.PATH,
    GITHUB_ACTIONS: 'true',
    GITHUB_WORKSPACE: repo,
    GITHUB_REPOSITORY: `${OWNER}/${REPO}`,
    GITHUB_EVENT_NAME: event,
    GITHUB_EVENT_PATH: eventFile,
    GITHUB_OUTPUT: outputFile,
    GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_SHA: 'abc', GITHUB_REF: 'refs/heads/main', RUNNER_TEMP: work,
  };
  // The runner sets INPUT_<NAME> for every declared input (default applied)
  // and for every extra `with:` key (with an "Unexpected input" warning).
  for (const [name, spec] of Object.entries(INPUTS)) {
    if (spec.default === undefined) continue;
    // The runner evaluates expressions in defaults; ${{ github.token }} becomes the job token.
    env[`INPUT_${name.toUpperCase()}`] = spec.default.replace(/\$\{\{\s*github\.token\s*\}\}/, 'ghs_runner_default');
  }
  for (const [name, value] of Object.entries(inputs)) env[`INPUT_${name.toUpperCase()}`] = value;
  if (token !== undefined) {
    if (envTokenOnly) env.GITHUB_TOKEN = token;
    else env['INPUT_GITHUB-TOKEN'] = token;
  }

  const before = mock.requests.length;
  const t0 = Date.now();
  const r = await new Promise(done => {
    const child = spawn(process.execPath, [DIST], { cwd: repo, env });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => (stdout += d)); child.stderr.on('data', d => (stderr += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000);
    child.on('close', status => { clearTimeout(timer); done({ status, stdout, stderr }); });
  });
  const ms = Date.now() - t0;

  const outputs = {};
  const raw = readFileSync(outputFile, 'utf-8');
  for (const m of raw.matchAll(/^([\w-]+)<<(\S+)\n([\s\S]*?)\n\2$/gm)) outputs[m[1]] = m[3];
  const stdout = r.stdout ?? '';
  const outDir = join(repo, inputs.path && inputs.path !== '.' ? inputs.path : '', '.codeevolution');
  rmSync(work, { recursive: true, force: true });
  return {
    exitCode: r.status, ms, stdout, stderr: r.stderr ?? '', outputs,
    failed: /^::error::/m.test(stdout),
    errors: [...stdout.matchAll(/^::error::(.*)$/gm)].map(m => m[1]),
    warnings: [...stdout.matchAll(/^::warning::(.*)$/gm)].map(m => m[1]),
    requests: mock.requests.slice(before),
    comments: mock.requests.slice(before).filter(q => q.method === 'POST' || q.method === 'PATCH').map(q => JSON.parse(q.body).body),
    outDir,
  };
}

// ---------------------------------------------------------------------------
// Test framework
// ---------------------------------------------------------------------------
const results = [];
function test(id, title, severityIfFails, fn) { results.push({ id, title, severityIfFails, fn }); }
class Fail extends Error {}
const expect = (cond, msg) => { if (!cond) throw new Fail(msg); };

// ===========================================================================
// A. Packaging and manifest
// ===========================================================================
test('A1', 'action.yml runs.main points at an existing bundle', 'must-fix', async () => {
  expect(existsSync(join(ACTION_DIR, MAIN)), `${MAIN} missing`);
  return `${MAIN} present (${(readFileSync(join(ACTION_DIR, MAIN)).length / 1024).toFixed(0)} KB)`;
});

test('A2', 'Every input the code reads is declared in action.yml', 'should-fix', async () => {
  const src = readFileSync(join(ACTION_DIR, 'src/index.ts'), 'utf-8');
  const used = [...src.matchAll(/getInput\('([\w-]+)'\)/g)].map(m => m[1]);
  const missing = [...new Set(used)].filter(u => !(u in INPUTS));
  expect(missing.length === 0, `read but not declared: ${missing.join(', ')} (runner warns "Unexpected input" and no default token is supplied)`);
  return `all ${new Set(used).size} inputs declared`;
});

test('A3', 'Runtime is a currently supported node version', 'should-fix', async () => {
  const using = ACTION_YML.match(/using:\s*'?([\w]+)'?/)[1];
  expect(using !== 'node20' && using !== 'node16' && using !== 'node12', `runs.using is ${using}`);
  return using;
});

test('A4', 'Bundle runs from a cold directory (no node_modules needed)', 'must-fix', async () => {
  const r = await runAction({ repo: makeRepo(cleanRepo()), inputs: { comment: 'false' } });
  expect(!/Cannot find module/.test(r.stderr), r.stderr.slice(0, 300));
  expect(r.exitCode === 0, `exit ${r.exitCode}: ${r.errors.join(' | ')}`);
  return `exit 0 in ${r.ms} ms`;
});

// ===========================================================================
// B. Core scan behaviour (push events)
// ===========================================================================
test('B1', 'Clean repo: passes, sets outputs, writes report files', 'must-fix', async () => {
  const repo = makeRepo(cleanRepo());
  const r = await runAction({ repo, inputs: { comment: 'false' } });
  expect(r.exitCode === 0, `exit ${r.exitCode}`);
  expect(r.outputs['issues-found'] === '0', `issues-found=${r.outputs['issues-found']}`);
  expect(r.outputs['confidence-score'] !== undefined, 'confidence-score not set');
  for (const f of ['results.json', 'hotspots.md', 'confidence-score.txt'])
    expect(existsSync(join(repo, '.codeevolution', f)), `${f} not written`);
  return `issues-found=0, score=${r.outputs['confidence-score']}`;
});

test('B2', 'All 11 detector categories fire through the bundled action', 'must-fix', async () => {
  const repo = makeRepo(fullRepo());
  const r = await runAction({ repo, inputs: { comment: 'false', 'fail-on': 'none', severity: 'low' } });
  const json = JSON.parse(readFileSync(join(repo, '.codeevolution/results.json'), 'utf-8'));
  const cats = Object.entries(json.summary.byCategory).filter(([, n]) => n > 0).map(([c]) => c);
  expect(cats.length === 11, `only ${cats.length}/11 categories: ${cats.join(', ')}`);
  return `11/11 categories, ${r.outputs['issues-found']} issues`;
});

test('B3', 'fail-on=critical fails a repo containing critical issues', 'must-fix', async () => {
  const r = await runAction({ repo: makeRepo(fullRepo()), inputs: { comment: 'false' } });
  expect(r.exitCode === 1, `exit ${r.exitCode}`);
  expect(r.errors.some(e => /severity 'critical'/.test(e)), `error: ${r.errors.join(' | ')}`);
  return 'exit 1 with severity message';
});

test('B4', 'fail-on=none never fails', 'must-fix', async () => {
  const r = await runAction({ repo: makeRepo(fullRepo()), inputs: { comment: 'false', 'fail-on': 'none' } });
  expect(r.exitCode === 0, `exit ${r.exitCode}`);
  return 'exit 0';
});

test('B5', 'fail-on=high fails on high-only repo; fail-on=critical does not', 'must-fix', async () => {
  const layout = { 'blocking-io.js': 'blocking-io.js' }; // high only
  const a = await runAction({ repo: makeRepo(layout), inputs: { comment: 'false', 'fail-on': 'high' } });
  const b = await runAction({ repo: makeRepo(layout), inputs: { comment: 'false', 'fail-on': 'critical' } });
  expect(a.exitCode === 1 && b.exitCode === 0, `high->${a.exitCode}, critical->${b.exitCode}`);
  return 'threshold ordering correct';
});

test('B6', 'severity input filters reported issues', 'should-fix', async () => {
  const low = await runAction({ repo: makeRepo(fullRepo()), inputs: { comment: 'false', 'fail-on': 'none', severity: 'low' } });
  const crit = await runAction({ repo: makeRepo(fullRepo()), inputs: { comment: 'false', 'fail-on': 'none', severity: 'critical' } });
  const n1 = Number(low.outputs['issues-found']), n2 = Number(crit.outputs['issues-found']);
  expect(n2 > 0 && n2 < n1, `low=${n1}, critical=${n2}`);
  return `low=${n1}, critical=${n2}`;
});

test('B7', 'Invalid fail-on value is rejected (not silently treated as critical)', 'minor', async () => {
  const r = await runAction({ repo: makeRepo({ 'blocking-io.js': 'blocking-io.js' }), inputs: { comment: 'false', 'fail-on': 'hgih' } });
  expect(r.exitCode === 1 && r.errors.some(e => /fail-on/i.test(e) && /invalid|unknown|must be/i.test(e)),
    `typo 'hgih' accepted silently (exit ${r.exitCode}); behaves as fail-on=critical`);
  return 'rejected';
});

test('B8', 'Invalid severity value is rejected', 'minor', async () => {
  const r = await runAction({ repo: makeRepo(fullRepo()), inputs: { comment: 'false', 'fail-on': 'none', severity: 'hgih' } });
  expect(r.exitCode === 1, `accepted silently, issues-found=${r.outputs['issues-found']}`);
  return 'rejected';
});

test('B9', 'Non-existent path fails with a clear error', 'should-fix', async () => {
  const r = await runAction({ repo: makeRepo(cleanRepo()), inputs: { comment: 'false', path: 'does-not-exist' } });
  expect(r.exitCode === 1, `exit ${r.exitCode}, issues-found=${r.outputs['issues-found']} (a typo in path passes green)`);
  return `exit 1: ${r.errors[0]}`;
});

test('B10', 'node_modules is not scanned', 'must-fix', async () => {
  const r = await runAction({ repo: makeRepo({ 'src/clean.js': 'clean.js', 'node_modules/pkg/dom.js': 'dom.js' }), inputs: { comment: 'false' } });
  expect(r.exitCode === 0 && r.outputs['issues-found'] === '0', `issues-found=${r.outputs['issues-found']}`);
  return 'ignored';
});

// ===========================================================================
// C. Pull request behaviour
// ===========================================================================
test('C1', 'PR touching only clean files passes even if repo has criticals elsewhere', 'must-fix', async () => {
  mock.changedFiles = ['clean.js']; mock.commentStatus = 201;
  const r = await runAction({ repo: makeRepo(fullRepo()), event: 'pull_request', token: 'ghs_test' });
  expect(r.exitCode === 0, `exit ${r.exitCode}: ${r.errors.join(' | ')}`);
  expect(r.comments.length === 1, `${r.comments.length} comments posted`);
  return 'exit 0, 1 comment';
});

test('C2', 'PR touching a critical file fails and the comment lists it', 'must-fix', async () => {
  mock.changedFiles = ['dom.js'];
  const r = await runAction({ repo: makeRepo(fullRepo()), event: 'pull_request', token: 'ghs_test' });
  expect(r.exitCode === 1, `exit ${r.exitCode}`);
  expect(r.comments[0]?.includes('dom.js'), 'comment does not mention dom.js');
  expect(!/blocking-io|redos\.js|memory\.tsx/.test(r.comments[0]), 'comment leaks issues from unchanged files');
  return 'exit 1, comment scoped to dom.js';
});

test('C3', 'Comment summary table agrees with itemised issues', 'should-fix', async () => {
  mock.changedFiles = ['dom.js', 'redos.js'];
  const r = await runAction({ repo: makeRepo(fullRepo()), event: 'pull_request', token: 'ghs_test', inputs: { 'fail-on': 'none' } });
  const c = r.comments[0] ?? '';
  const table = [...c.matchAll(/^\| (\w[\w-]*) \| (\d+) \|$/gm)].reduce((s, m) => s + Number(m[2]), 0);
  const items = (c.match(/\*\*\[[^\]]+\]\*\*/g) ?? []).length;
  expect(table === items, `table total ${table} vs ${items} itemised`);
  return `table=${table}, items=${items}`;
});

test('C4', 'PR run uses the default token when github-token is omitted', 'must-fix', async () => {
  // README documents the default as ${{ github.token }}; action.yml declares no
  // such input, so a workflow that omits `with: github-token` gets no token.
  mock.changedFiles = ['clean.js'];
  const r = await runAction({ repo: makeRepo(fullRepo()), event: 'pull_request' });
  expect(r.comments.length === 1, 'no PR comment posted');
  expect(r.exitCode === 0, `PR touching only clean.js FAILED on repo-wide criticals (exit ${r.exitCode})`);
  return 'comment posted, scoped';
});

test('C5', 'Changed-file list is fully paginated (PR with >100 files)', 'should-fix', async () => {
  mock.changedFiles = [...Array.from({ length: 120 }, (_, i) => `docs/f${i}.md`), 'dom.js'];
  const r = await runAction({ repo: makeRepo(fullRepo()), event: 'pull_request', token: 'ghs_test', inputs: { comment: 'false' } });
  const pages = r.requests.filter(q => q.path.endsWith('/files')).length;
  expect(r.exitCode === 1, `dom.js is file #121; only ${pages} page(s) fetched so it was dropped and the PR passed`);
  return `${pages} pages fetched`;
});

test('C6', 'path: input still matches PR changed files (repo-root paths)', 'must-fix', async () => {
  mock.changedFiles = ['src/dom.js'];
  const r = await runAction({ repo: makeRepo(fullRepo('src/')), event: 'pull_request', token: 'ghs_test', inputs: { path: 'src', comment: 'false' } });
  expect(r.exitCode === 1, `critical in src/dom.js not caught (exit ${r.exitCode}); issue paths are relative to path:, PR paths to repo root`);
  return 'caught';
});

test('C7', 'Comment failure (fork PR, read-only token) does not kill the check', 'should-fix', async () => {
  mock.changedFiles = ['clean.js']; mock.commentStatus = 403;
  const r = await runAction({ repo: makeRepo(fullRepo()), event: 'pull_request', token: 'ghs_readonly' });
  mock.commentStatus = 201;
  expect(r.exitCode === 0, `clean PR marked failed because the comment POST was 403: ${r.errors.join(' | ')}`);
  return 'warning only';
});

test('C8', 'Re-runs update one comment instead of stacking new ones', 'should-fix', async () => {
  mock.changedFiles = ['clean.js'];
  const repo = makeRepo(fullRepo());
  const a = await runAction({ repo, event: 'pull_request', token: 'ghs_test' });
  const b = await runAction({ repo, event: 'pull_request', token: 'ghs_test' });
  const posts = [...a.requests, ...b.requests].filter(q => q.method === 'POST').length;
  const patches = [...a.requests, ...b.requests].filter(q => q.method === 'PATCH').length;
  expect(posts === 1 && patches === 1 && mock.comments.length === 1, `${posts} POST, ${patches} PATCH after 2 runs (expected 1 and 1)`);
  return '1 comment, updated on re-run';
});

test('C9', 'comment=false posts nothing', 'must-fix', async () => {
  mock.changedFiles = ['dom.js'];
  const r = await runAction({ repo: makeRepo(fullRepo()), event: 'pull_request', token: 'ghs_test', inputs: { comment: 'false' } });
  expect(r.comments.length === 0, `${r.comments.length} comments`);
  return '0 comments';
});

test('C10', 'GITHUB_TOKEN env var fallback works', 'minor', async () => {
  mock.changedFiles = ['clean.js'];
  const r = await runAction({ repo: makeRepo(fullRepo()), event: 'pull_request', token: 'ghs_env', envTokenOnly: true });
  expect(r.comments.length === 1 && r.exitCode === 0, `comments=${r.comments.length}, exit=${r.exitCode}`);
  return 'works';
});

// ===========================================================================
// D. Baseline comparison
// ===========================================================================
// Same shape as core-engine createBaseline(report).
const toSnapshot = r => JSON.stringify({
  version: 'test', createdAt: r.timestamp, target: r.target, summary: r.summary,
  issueHashes: r.issues.map(i => i.id), issues: r.issues,
});
async function makeBaseline(repoLayout, path = '.') {
  // Scan a repo state through the action itself, then convert results.json
  // into a baseline snapshot, so the hashes come from the bundled engine.
  const repo = makeRepo(repoLayout);
  await runAction({ repo, inputs: { comment: 'false', 'fail-on': 'none', severity: 'medium', path } });
  return toSnapshot(JSON.parse(readFileSync(join(repo, path, '.codeevolution/results.json'), 'utf-8')));
}

test('D1', 'Baseline present: new/resolved outputs set', 'must-fix', async () => {
  const base = fullRepo(); delete base['dom.js'];
  const baseline = await makeBaseline(base);
  const repo = makeRepo({ ...fullRepo(), '.codeevolution/baseline.json': { content: baseline } });
  const r = await runAction({ repo, inputs: { comment: 'false', 'fail-on': 'none' } });
  expect(r.outputs['new-issues'] !== undefined, `new-issues not set; stderr: ${r.stderr.slice(0, 200)} ${r.errors.join(' | ')}`);
  expect(Number(r.outputs['new-issues']) === 3, `new-issues=${r.outputs['new-issues']} (dom.js adds 3)`);
  return `new=${r.outputs['new-issues']}, resolved=${r.outputs['resolved-issues']}`;
});

test('D2', 'Baseline absent: new/resolved outputs default to 0 (not unset)', 'minor', async () => {
  const r = await runAction({ repo: makeRepo(cleanRepo()), inputs: { comment: 'false' } });
  expect(r.outputs['new-issues'] !== undefined, 'outputs unset — `steps.x.outputs.new-issues > 0` comparisons see empty string');
  return 'set';
});

test('D3', 'PR comment shows New/Resolved table when baseline exists', 'should-fix', async () => {
  const base = fullRepo(); delete base['dom.js'];
  const baseline = await makeBaseline(base);
  mock.changedFiles = ['dom.js'];
  const repo = makeRepo({ ...fullRepo(), '.codeevolution/baseline.json': { content: baseline } });
  const r = await runAction({ repo, event: 'pull_request', token: 'ghs_test', inputs: { 'fail-on': 'none' } });
  const c = r.comments[0] ?? '';
  expect(/\| Category \| New \| Resolved \| Total \|/.test(c) && /New Issues in This PR/.test(c), 'no baseline sections in comment');
  return 'baseline sections present';
});

test('D4', 'Root baseline is found when path: is a subdirectory', 'should-fix', async () => {
  const base = fullRepo('src/'); delete base['src/dom.js'];
  const baseline = await makeBaseline(base, 'src');
  const repo = makeRepo({ ...fullRepo('src/'), '.codeevolution/baseline.json': { content: baseline } });
  const r = await runAction({ repo, inputs: { comment: 'false', 'fail-on': 'none', path: 'src' } });
  expect(r.outputs['new-issues'] === '3', `new-issues=${r.outputs['new-issues']}; root baseline (CLI default location) not used or hashes mismatched`);
  return `found, new=${r.outputs['new-issues']}`;
});

test('D5', 'Corrupt baseline degrades to a warning, not a crash', 'minor', async () => {
  const repo = makeRepo({ ...cleanRepo(), '.codeevolution/baseline.json': { content: '{not json' } });
  const r = await runAction({ repo, inputs: { comment: 'false' } });
  expect(r.exitCode === 0, `exit ${r.exitCode}: ${r.errors.join(' | ')}`);
  return 'warning';
});

// ===========================================================================
// Run
// ===========================================================================
await new Promise(r => server.listen(0, '127.0.0.1', r));
console.log(`dist:     ${DIST}\nfixtures: ${FIXTURES}\n`);
const report = [];
for (const t of results) {
  let status, detail;
  mock.comments = []; mock.commentStatus = 201;
  try { detail = await t.fn(); status = 'PASS'; }
  catch (e) { status = 'FAIL'; detail = e instanceof Fail ? e.message : `harness error: ${e.stack}`; }
  report.push({ id: t.id, title: t.title, status, severityIfFails: t.severityIfFails, detail });
  console.log(`${status === 'PASS' ? 'PASS' : 'FAIL'}  ${t.id.padEnd(4)} ${t.title}\n        ${detail}`);
}
server.close();
const failed = report.filter(r => r.status === 'FAIL');
console.log(`\n${report.length - failed.length}/${report.length} passed`);
if (args.json) writeFileSync(args.json, JSON.stringify(report, null, 2));
process.exit(failed.length);
