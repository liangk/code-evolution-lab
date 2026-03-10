import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createServer, Server } from 'http';
import { runLoadTest } from './harness/simple-load-test';
import * as tc1 from './scenarios/tc1-readfilesync';
import * as tc2 from './scenarios/tc2-execsync';
import * as tc3 from './scenarios/tc3-crypto-sync';
import * as tc4 from './scenarios/tc4-writefilesync';
import * as tc5 from './scenarios/tc5-existssync';

const BASE_RESULTS_DIR = process.env.CODE_EVOLUTION_LAB_RESULTS_DIR || join(process.cwd(), 'results');
const RESULTS_DIR = join(BASE_RESULTS_DIR, 'study02');
const BASE_PORT = 4000;

interface BenchmarkResult {
  testCase: string;
  variant: 'bad' | 'good';
  concurrency: number;
  duration: number;
  requests: number;
  throughput: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  latencyAvg: number;
  latencyMax: number;
  errors: number;
  timeouts: number;
  eventLoopDelayAvg: number;
  eventLoopDelayMax: number;
}

interface ScenarioDef {
  name: string;
  endpoint: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  createBad: () => any;
  createGood: () => any;
}

const scenarios: ScenarioDef[] = [
  { name: tc1.scenario.name, endpoint: tc1.scenario.endpoint, createBad: tc1.createBadServer, createGood: tc1.createGoodServer },
  { name: tc2.scenario.name, endpoint: tc2.scenario.endpoint, createBad: tc2.createBadServer, createGood: tc2.createGoodServer },
  { name: tc3.scenario.name, endpoint: tc3.scenario.endpoint, method: tc3.scenario.method, body: tc3.scenario.body, headers: tc3.scenario.headers, createBad: tc3.createBadServer, createGood: tc3.createGoodServer },
  { name: tc4.scenario.name, endpoint: tc4.scenario.endpoint, createBad: tc4.createBadServer, createGood: tc4.createGoodServer },
  { name: tc5.scenario.name, endpoint: tc5.scenario.endpoint, createBad: tc5.createBadServer, createGood: tc5.createGoodServer },
];

function startServer(app: any, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => resolve(server));
    server.on('error', reject);
  });
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function printResult(r: BenchmarkResult) {
  console.log(`\n--- ${r.testCase} [${r.variant.toUpperCase()}] ---`);
  console.log(`  Concurrency:     ${r.concurrency}`);
  console.log(`  Duration:        ${r.duration}s`);
  console.log(`  Requests:        ${r.requests}`);
  console.log(`  Throughput:      ${r.throughput.toFixed(1)} req/sec`);
  console.log(`  Latency avg:     ${r.latencyAvg.toFixed(2)}ms`);
  console.log(`  Latency P50:     ${r.latencyP50.toFixed(2)}ms`);
  console.log(`  Latency P95:     ${r.latencyP95.toFixed(2)}ms`);
  console.log(`  Latency P99:     ${r.latencyP99.toFixed(2)}ms`);
  console.log(`  Latency max:     ${r.latencyMax.toFixed(2)}ms`);
  console.log(`  Errors:          ${r.errors}`);
  console.log(`  Timeouts:        ${r.timeouts}`);
  console.log(`  EL delay avg:    ${r.eventLoopDelayAvg.toFixed(2)}ms`);
  console.log(`  EL delay max:    ${r.eventLoopDelayMax.toFixed(2)}ms`);
}

function printComparison(bad: BenchmarkResult, good: BenchmarkResult) {
  const speedupThroughput = good.throughput / bad.throughput;
  const latencyReduction = bad.latencyP95 / Math.max(good.latencyP95, 0.01);
  const elDelayReduction = bad.eventLoopDelayMax / Math.max(good.eventLoopDelayMax, 0.01);
  console.log(`\n=== ${bad.testCase} COMPARISON (concurrency=${bad.concurrency}) ===`);
  console.log(`  Throughput:      ${bad.throughput.toFixed(1)} → ${good.throughput.toFixed(1)} req/sec (${speedupThroughput.toFixed(1)}x)`);
  console.log(`  Latency P95:     ${bad.latencyP95.toFixed(2)} → ${good.latencyP95.toFixed(2)}ms (${latencyReduction.toFixed(1)}x better)`);
  console.log(`  Latency P99:     ${bad.latencyP99.toFixed(2)} → ${good.latencyP99.toFixed(2)}ms`);
  console.log(`  EL delay max:    ${bad.eventLoopDelayMax.toFixed(2)} → ${good.eventLoopDelayMax.toFixed(2)}ms (${elDelayReduction.toFixed(1)}x better)`);
  console.log(`  Errors:          ${bad.errors} → ${good.errors}`);
}

function buildSummaryMarkdown(allResults: { bad: BenchmarkResult; good: BenchmarkResult }[], metadata: any): string {
  const lines: string[] = [];
  lines.push(`# Study 02: Blocking I/O in Node.js — Documentation`);
  lines.push('');
  lines.push(`## Overview`);
  lines.push('');
  lines.push(`Study 02 measures the performance impact of synchronous (blocking) I/O operations in Node.js applications.`);
  lines.push('');
  lines.push(`The full study combines two parts:`);
  lines.push(`1. **Step 1 (Ecosystem Prevalence)**: AST scan of public repositories to find blocking API usage`);
  lines.push(`2. **Step 2 (Runtime Impact)**: Controlled load tests comparing sync vs async implementations`);
  lines.push('');
  lines.push(`**This CLI replay only reproduces Step 2 (performance benchmarks).** Step 1 requires the upstream empirical-study repository (see Optional Reference section below).`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Prerequisites`);
  lines.push('');
  lines.push(`**For this CLI replay (Step 2 benchmarks only):**`);
  lines.push(`- Node.js 18+ (no database required)`);
  lines.push(`- No external dependencies`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Running the Study`);
  lines.push('');
  lines.push(`This document is generated from a \`code-evolution-lab replay 02\` run.`);
  lines.push('');
  lines.push(`\`\`\`bash`);
  lines.push(`code-evolution-lab replay 02`);
  lines.push(`code-evolution-lab replay 02 --quick`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`The replay writes JSON and markdown outputs to the local results directory shown by the CLI.`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Step 1: Repository Scan (Reference — Not Run by This CLI)`);
  lines.push('');
  lines.push(`*Step 1 is not executed by \`code-evolution-lab replay 02\`. The following describes the methodology used in the upstream empirical-study repository for reference.*`);
  lines.push('');
  lines.push(`### Blocking Patterns Detected`);
  lines.push('');
  lines.push(`| Pattern | Module | Examples |`);
  lines.push(`|---------|--------|----------|`);
  lines.push(`| Sync file I/O | \`fs\` | \`readFileSync\`, \`writeFileSync\`, \`existsSync\` |`);
  lines.push(`| Sync child process | \`child_process\` | \`execSync\`, \`spawnSync\` |`);
  lines.push(`| Sync crypto | \`crypto\` | \`pbkdf2Sync\`, \`scryptSync\` |`);
  lines.push(`| Sync compression | \`zlib\` | \`gzipSync\`, \`deflateSync\` |`);
  lines.push('');
  lines.push(`### Context Classification`);
  lines.push('');
  lines.push(`Each finding is categorized by execution context:`);
  lines.push('');
  lines.push(`- **\`request_path\`**: User-facing request execution path (⚠️ **Critical**)`);
  lines.push(`- **\`background_path\`**: Timers/listeners/promise callbacks`);
  lines.push(`- **\`startup_path\`**: Module bootstrap/initialization`);
  lines.push(`- **\`tooling_path\`**: Tests/scripts/migrations/build tools`);
  lines.push(`- **\`unknown_path\`**: Unmatched ancestry (review queue)`);
  lines.push('');
  lines.push(`### Severity Model`);
  lines.push('');
  lines.push(`- **Critical**: Request path + inside loop`);
  lines.push(`- **High**: Request path or looped background pattern`);
  lines.push(`- **Medium**: Uncertain / background non-loop contexts`);
  lines.push(`- **Low**: Startup/tooling contexts`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Step 2: Performance Benchmarks`);
  lines.push('');
  lines.push(`Synthetic Express servers with intentional blocking vs. async implementations, load-tested with autocannon.`);
  lines.push('');
  
  lines.push(`### TC1: readFileSync in Request Handler`);
  lines.push('');
  lines.push(`**Scenario**: Config or template file read on every request.`);
  lines.push('');
  lines.push(`**❌ Bad Pattern (Blocks Event Loop)**`);
  lines.push(`\`\`\`typescript`);
  lines.push(`app.get('/api/config', (req, res) => {`);
  lines.push(`  // Synchronous read + parse on every request`);
  lines.push(`  const config = JSON.parse(readFileSync(FIXTURE_FILE, 'utf-8'));`);
  lines.push(`  res.json({ status: 'ok', keys: Object.keys(config).length });`);
  lines.push(`});`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`**✅ Good Pattern (Async + Cache)**`);
  lines.push(`\`\`\`typescript`);
  lines.push(`let cachedConfig: any = null;`);
  lines.push(`let cacheExpiry = 0;`);
  lines.push(`const CACHE_TTL = 5000;`);
  lines.push('');
  lines.push(`app.get('/api/config', async (req, res) => {`);
  lines.push(`  const now = Date.now();`);
  lines.push(`  if (!cachedConfig || now > cacheExpiry) {`);
  lines.push(`    const raw = await readFileAsync(FIXTURE_FILE, 'utf-8');`);
  lines.push(`    cachedConfig = JSON.parse(raw);`);
  lines.push(`    cacheExpiry = now + CACHE_TTL;`);
  lines.push(`  }`);
  lines.push(`  res.json({ status: 'ok', keys: Object.keys(cachedConfig).length });`);
  lines.push(`});`);
  lines.push(`\`\`\``);
  lines.push('');
  
  lines.push(`### TC2: execSync in Request Handler`);
  lines.push('');
  lines.push(`**Scenario**: Shell command execution in handler.`);
  lines.push('');
  lines.push(`**❌ Bad Pattern (Blocks Event Loop)**`);
  lines.push(`\`\`\`typescript`);
  lines.push(`app.get('/api/system-info', (req, res) => {`);
  lines.push(`  const output = execSync('uname -a').toString();`);
  lines.push(`  res.json({ info: output.trim() });`);
  lines.push(`});`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`**✅ Good Pattern (Async exec)**`);
  lines.push(`\`\`\`typescript`);
  lines.push(`app.get('/api/system-info', async (req, res) => {`);
  lines.push(`  const { stdout } = await execAsync('uname -a');`);
  lines.push(`  res.json({ info: stdout.trim() });`);
  lines.push(`});`);
  lines.push(`\`\`\``);
  lines.push('');
  
  lines.push(`### TC3: crypto.pbkdf2Sync in Auth`);
  lines.push('');
  lines.push(`**Scenario**: Password hashing during authentication.`);
  lines.push('');
  lines.push(`**❌ Bad Pattern (Blocks Event Loop)**`);
  lines.push(`\`\`\`typescript`);
  lines.push(`app.post('/api/login', (req, res) => {`);
  lines.push(`  const hash = pbkdf2Sync(password, salt, 100000, 64, 'sha512');`);
  lines.push(`  // Verify hash...`);
  lines.push(`  res.json({ success: true });`);
  lines.push(`});`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`**✅ Good Pattern (Async pbkdf2)**`);
  lines.push(`\`\`\`typescript`);
  lines.push(`app.post('/api/login', async (req, res) => {`);
  lines.push(`  const hash = await pbkdf2Async(password, salt, 100000, 64, 'sha512');`);
  lines.push(`  // Verify hash...`);
  lines.push(`  res.json({ success: true });`);
  lines.push(`});`);
  lines.push(`\`\`\``);
  lines.push('');
  
  lines.push(`### TC4: writeFileSync in Request Handler`);
  lines.push('');
  lines.push(`**Scenario**: File write operations in handler.`);
  lines.push('');
  lines.push(`**❌ Bad Pattern (Blocks Event Loop)**`);
  lines.push(`\`\`\`typescript`);
  lines.push(`app.post('/api/log', (req, res) => {`);
  lines.push(`  writeFileSync(LOG_FILE, JSON.stringify(req.body) + '\\n', { flag: 'a' });`);
  lines.push(`  res.json({ status: 'logged' });`);
  lines.push(`});`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`**✅ Good Pattern (Async write)**`);
  lines.push(`\`\`\`typescript`);
  lines.push(`app.post('/api/log', async (req, res) => {`);
  lines.push(`  await writeFileAsync(LOG_FILE, JSON.stringify(req.body) + '\\n', { flag: 'a' });`);
  lines.push(`  res.json({ status: 'logged' });`);
  lines.push(`});`);
  lines.push(`\`\`\``);
  lines.push('');
  
  lines.push(`### TC5: existsSync + statSync in Request Handler`);
  lines.push('');
  lines.push(`**Scenario**: File existence checks in handler.`);
  lines.push('');
  lines.push(`**❌ Bad Pattern (Blocks Event Loop)**`);
  lines.push(`\`\`\`typescript`);
  lines.push(`app.get('/api/file-info', (req, res) => {`);
  lines.push(`  if (existsSync(filePath)) {`);
  lines.push(`    const stats = statSync(filePath);`);
  lines.push(`    res.json({ exists: true, size: stats.size });`);
  lines.push(`  } else {`);
  lines.push(`    res.json({ exists: false });`);
  lines.push(`  }`);
  lines.push(`});`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`**✅ Good Pattern (Async stat)**`);
  lines.push(`\`\`\`typescript`);
  lines.push(`app.get('/api/file-info', async (req, res) => {`);
  lines.push(`  try {`);
  lines.push(`    const stats = await statAsync(filePath);`);
  lines.push(`    res.json({ exists: true, size: stats.size });`);
  lines.push(`  } catch {`);
  lines.push(`    res.json({ exists: false });`);
  lines.push(`  }`);
  lines.push(`});`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Metrics Collected`);
  lines.push('');
  lines.push(`**Step 1 (Scan):**`);
  lines.push(`- Prevalence rate across repositories`);
  lines.push(`- Distribution by type, context, and severity`);
  lines.push(`- Top offending repositories and methods`);
  lines.push('');
  lines.push(`**Step 2 (Benchmarks):**`);
  lines.push(`- **Latency**: P50, P95, P99 (milliseconds)`);
  lines.push(`- **Throughput**: Requests per second`);
  lines.push(`- **Error Rate**: Timeouts and failures`);
  lines.push(`- **Event Loop Delay**: Max and average blocking time`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Expected Results`);
  lines.push('');
  lines.push(`Typical performance degradation (bad vs. good under load):`);
  lines.push('');
  lines.push(`| Test Case | P95 Latency Impact | Throughput Impact |`);
  lines.push(`|-----------|-------------------|-------------------|`);
  lines.push(`| TC1 (readFileSync) | 2-5× slower | 50-70% reduction |`);
  lines.push(`| TC2 (execSync) | 5-10× slower | 70-90% reduction |`);
  lines.push(`| TC3 (pbkdf2Sync) | 10-20× slower | 80-95% reduction |`);
  lines.push(`| TC4 (writeFileSync) | 2-4× slower | 40-60% reduction |`);
  lines.push(`| TC5 (existsSync) | 1.5-3× slower | 30-50% reduction |`);
  lines.push('');
  lines.push(`*Actual results depend on concurrency level, file sizes, and system I/O performance.*`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Why Step 1 Requires External Repos`);
  lines.push('');
  lines.push(`The repository scan cannot be self-contained because:`);
  lines.push('');
  lines.push(`1. **Real-World Data**: Needs actual production codebases to measure prevalence`);
  lines.push(`2. **Network Access**: Must clone ~250 public repositories from GitHub`);
  lines.push(`3. **Disk Space**: Temporary clones require 5-10GB storage`);
  lines.push(`4. **Time**: Full scan takes 30-60 minutes depending on network speed`);
  lines.push(`5. **Git Dependency**: Requires git CLI for shallow cloning`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Optional Reference: Original Repository Workflow`);
  lines.push('');
  lines.push(`If you want to reproduce the broader upstream study workflow, including the repository scan phase, you can run the original repository separately:`);
  lines.push('');
  lines.push(`\`\`\`bash`);
  lines.push(`# Clone the original empirical-study repository`);
  lines.push(`git clone https://github.com/liangk/empirical-study.git`);
  lines.push(`cd empirical-study/studies/02-blocking-io`);
  lines.push('');
  lines.push(`# Install dependencies`);
  lines.push(`npm install`);
  lines.push('');
  lines.push(`# Step 1: Repository scan (optional, takes 30-60 min)`);
  lines.push(`npm run scan`);
  lines.push(`npm run scan:aggregate`);
  lines.push('');
  lines.push(`# Step 2: Performance benchmarks (recommended)`);
  lines.push(`npm run bench:all -- --duration 20 --concurrency 100`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`Those upstream results are separate from the \`code-evolution-lab\` replay outputs generated by this CLI.`);
  
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const durationIdx = args.indexOf('--duration');
  const duration = durationIdx >= 0 ? parseInt(args[durationIdx + 1], 10) : 10;
  const concurrencyIdx = args.indexOf('--concurrency');
  const concurrency = concurrencyIdx >= 0 ? parseInt(args[concurrencyIdx + 1], 10) : 50;

  console.log('═══════════════════════════════════════════════════════');
  console.log('  STUDY 02 — BLOCKING I/O BENCHMARKS');
  console.log(`  Duration: ${duration}s | Concurrency: ${concurrency}`);
  console.log('═══════════════════════════════════════════════════════');

  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  const allResults: { bad: BenchmarkResult; good: BenchmarkResult }[] = [];

  for (let i = 0; i < scenarios.length; i++) {
    const sc = scenarios[i];
    const badPort = BASE_PORT + i * 2;
    const goodPort = BASE_PORT + i * 2 + 1;

    console.log(`\n\n━━━ ${sc.name} ━━━`);

    const badApp = sc.createBad();
    const badServer = await startServer(badApp, badPort);
    console.log(`  Bad server on :${badPort}`);

    const badLoadResult = await runLoadTest({
      url: `http://127.0.0.1:${badPort}${sc.endpoint}`,
      method: sc.method,
      body: sc.body,
      headers: sc.headers,
      duration,
      concurrency,
    });
    const badResult: BenchmarkResult = {
      testCase: sc.name,
      variant: 'bad',
      concurrency,
      duration,
      ...badLoadResult,
    };
    printResult(badResult);
    await stopServer(badServer);

    await new Promise(r => setTimeout(r, 500));

    const goodApp = sc.createGood();
    const goodServer = await startServer(goodApp, goodPort);
    console.log(`  Good server on :${goodPort}`);

    const goodLoadResult = await runLoadTest({
      url: `http://127.0.0.1:${goodPort}${sc.endpoint}`,
      method: sc.method,
      body: sc.body,
      headers: sc.headers,
      duration,
      concurrency,
    });
    const goodResult: BenchmarkResult = {
      testCase: sc.name,
      variant: 'good',
      concurrency,
      duration,
      ...goodLoadResult,
    };
    printResult(goodResult);
    await stopServer(goodServer);

    printComparison(badResult, goodResult);
    allResults.push({ bad: badResult, good: goodResult });
  }

  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('| Test Case | Bad P95 | Good P95 | P95 Improvement | Bad Throughput | Good Throughput | Throughput Gain |');
  console.log('|-----------|---------|----------|-----------------|----------------|-----------------|-----------------|');

  for (const { bad, good } of allResults) {
    const p95Imp = (bad.latencyP95 / Math.max(good.latencyP95, 0.01)).toFixed(1);
    const tpGain = (good.throughput / bad.throughput).toFixed(1);
    console.log(
      `| ${bad.testCase} | ${bad.latencyP95.toFixed(1)}ms | ${good.latencyP95.toFixed(1)}ms | **${p95Imp}x** | ${bad.throughput.toFixed(0)} req/s | ${good.throughput.toFixed(0)} req/s | **${tpGain}x** |`
    );
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const metadata = {
    timestamp: new Date().toISOString(),
    duration,
    concurrency,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  };

  const jsonPath = join(RESULTS_DIR, `bench-${timestamp}.json`);
  const output = { metadata, scenarios: allResults };
  writeFileSync(jsonPath, JSON.stringify(output, null, 2));
  console.log(`\n💾 Results saved to ${jsonPath}`);

  const summaryPath = join(RESULTS_DIR, `summary-${timestamp}.md`);
  const summary = buildSummaryMarkdown(allResults, metadata);
  writeFileSync(summaryPath, summary);
  console.log(`📄 Summary saved to ${summaryPath}\n`);
}

main().catch(console.error);
