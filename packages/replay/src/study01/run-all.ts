import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { spawnSync } from 'child_process';
import { runTC1 } from './benchmarks/tc1-simple-one-to-many';
import { runTC2 } from './benchmarks/tc2-nested-relationships';
import { runTC3 } from './benchmarks/tc3-prisma-specific';
import { runTC4 } from './benchmarks/tc4-conditional-loading';
import { printResult, printComparison, BenchmarkResult } from './benchmarks/utils';

const BASE_RESULTS_DIR = process.env.CODE_EVOLUTION_LAB_RESULTS_DIR || join(process.cwd(), 'results');
const RESULTS_DIR = join(BASE_RESULTS_DIR, 'study01');

function resolveSchemaPath(): string {
  const local = join(__dirname, 'prisma', 'schema.prisma');
  if (existsSync(local)) return local;
  const fromRepoRoot = join(__dirname, '..', '..', 'src', 'study01', 'prisma', 'schema.prisma');
  return fromRepoRoot;
}

function resolveGeneratedClientPath(): string {
  const local = join(__dirname, 'prisma', 'generated', 'client');
  if (existsSync(join(local, 'index.js'))) return local;
  return join(__dirname, '..', '..', 'src', 'study01', 'prisma', 'generated', 'client');
}

function resolvePrismaCliPath(): string {
  try {
    return require.resolve('prisma/build/index.js');
  } catch {
    const fallback = join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
    if (existsSync(fallback)) return fallback;
    throw new Error('Prisma CLI was not found. Reinstall the package dependencies and try again.');
  }
}

const SCHEMA_PATH = resolveSchemaPath();
const GENERATED_CLIENT_PATH = resolveGeneratedClientPath();
const PRISMA_CLI_PATH = resolvePrismaCliPath();
const SEED_SCRIPT = join(__dirname, 'seed.js');
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/empirical_study_01?schema=public';

async function promptForDatabaseUrl(defaultUrl: string): Promise<string> {
  const rl = createInterface({ input, output });
  const answer = await rl.question(`Enter DATABASE_URL [${defaultUrl}]: `);
  rl.close();
  const databaseUrl = answer.trim() || defaultUrl;
  console.log(`Using DATABASE_URL: ${databaseUrl}`);
  return databaseUrl;
}

async function promptYesNo(question: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  const answer = await rl.question(`${question} (Y/n): `);
  rl.close();
  const normalized = answer.trim().toLowerCase();
  return normalized === '' || normalized === 'y' || normalized === 'yes';
}

function runCommand(cmd: string, args: string[]): boolean {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  return result.status === 0;
}

function runPrismaCommand(args: string[]): boolean {
  return runCommand(process.execPath, [PRISMA_CLI_PATH, ...args]);
}

function clearPrismaClientCache(): void {
  const moduleIds = [
    GENERATED_CLIENT_PATH,
    join(GENERATED_CLIENT_PATH, 'index.js'),
    join(GENERATED_CLIENT_PATH, 'default.js'),
  ];

  for (const moduleId of moduleIds) {
    try {
      const resolved = require.resolve(moduleId);
      delete require.cache[resolved];
    } catch {}
  }
}

function createPrismaClient(forceReload = false): any {
  if (forceReload) clearPrismaClientCache();
  const { PrismaClient } = require(GENERATED_CLIENT_PATH);
  return new PrismaClient();
}

async function setupPrisma(): Promise<boolean> {
  console.log('\n--- Prisma Setup Check ---\n');

  let needsGenerate = false;
  try {
    const { PrismaClient } = require(GENERATED_CLIENT_PATH);
    try {
      const testClient = new PrismaClient();
      await testClient.$disconnect();
      console.log('✓ Prisma client detected');
    } catch (e: any) {
      if (typeof e?.message === 'string' && e.message.includes('did not initialize yet')) {
        console.log('✗ Prisma client not generated yet');
        needsGenerate = true;
      } else {
        throw e;
      }
    }
  } catch {
    console.log('✗ Prisma client not found');
    needsGenerate = true;
  }

  if (needsGenerate) {
    if (!await promptYesNo('Run prisma generate?')) {
      console.error('Prisma client generation is required before running this study.');
      return false;
    }
    console.log('\nGenerating Prisma client...');
    if (!runPrismaCommand(['generate', '--schema', SCHEMA_PATH])) {
      console.error('Failed to generate Prisma client');
      return false;
    }
    clearPrismaClientCache();
  }

  // Check DB connection and ask about schema push
  if (await promptYesNo('\nPush database schema (creates tables)?')) {
    console.log('\nPushing schema to database...');
    if (!runPrismaCommand(['db', 'push', '--schema', SCHEMA_PATH, '--skip-generate'])) {
      console.error('Failed to push schema');
      return false;
    }
  }

  // Check if DB has data
  const prisma = createPrismaClient(true);
  try {
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      console.log('\n✗ Database is empty');
      if (await promptYesNo('Run seed script to populate test data?')) {
        console.log('\nSeeding database...');
        await prisma.$disconnect();
        if (!runCommand(process.execPath, [SEED_SCRIPT])) {
          console.error('Failed to seed database');
          return false;
        }
      } else {
        console.log('\n⚠ Warning: Running benchmarks on empty database will produce invalid results.');
      }
    } else {
      console.log(`\n✓ Database has ${userCount} users (ready for benchmarks)`);
    }
    await prisma.$disconnect();
  } catch (error: any) {
    console.error('\nFailed to check database:', error.message);
    await prisma.$disconnect();
    return false;
  }

  console.log('\n--- Setup Complete ---\n');
  return true;
}

async function checkDatabaseConnection(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = createPrismaClient(true);
  try {
    await prisma.$connect();
    await prisma.$disconnect();
    return true;
  } catch (error: any) {
    console.error('\n❌ Failed to connect to database:', error.message);
    console.error('   Make sure PostgreSQL is running and DATABASE_URL is correct.\n');
    return false;
  }
}

function buildSummaryMarkdown(allResults: { bad: BenchmarkResult; good: BenchmarkResult }[], metadata: any): string {
  const lines: string[] = [];
  lines.push(`# Study 01: N+1 Query Problem — Documentation`);
  lines.push('');
  lines.push(`## Overview`);
  lines.push('');
  lines.push(`Study 01 measures the real performance impact of N+1 query patterns in a Prisma + PostgreSQL stack.`);
  lines.push(`Unlike Studies 03 and 04, this study **requires a live PostgreSQL database** and cannot run in a self-contained Node.js process.`);
  lines.push('');
  lines.push(`Instead of only describing the anti-pattern, the benchmark suite compares **bad implementations** (query in loops / lazy loading style) against **good implementations** (eager loading or batch pre-fetching).`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Prerequisites`);
  lines.push('');
  lines.push(`1. **PostgreSQL Database**: Running instance (local or Docker)`);
  lines.push(`   \`\`\`bash`);
  lines.push(`   docker compose up -d  # If using Docker`);
  lines.push(`   \`\`\``);
  lines.push('');
  lines.push(`2. **Environment Configuration**: Set \`DATABASE_URL\``);
  lines.push(`   \`\`\`bash`);
  lines.push(`   export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/empirical_study_01?schema=public"`);
  lines.push(`   \`\`\``);
  lines.push('');
  lines.push(`3. **Database Schema + Seed Data**: The CLI handles Prisma schema push and data seeding automatically.`);
  lines.push(`   When you run \`code-evolution-lab replay 01\`, it will prompt for your database URL, push the schema,`);
  lines.push(`   generate the Prisma client, and seed test data — no manual steps required.`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Running the Benchmarks`);
  lines.push('');
  lines.push(`This document is generated from a \`code-evolution-lab replay 01\` run.`);
  lines.push('');
  lines.push(`\`\`\`bash`);
  lines.push(`code-evolution-lab replay 01`);
  lines.push(`code-evolution-lab replay 01 --quick`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`The replay saves benchmark JSON and markdown summaries to the local results directory shown by the CLI.`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Test Cases`);
  lines.push('');
  
  lines.push(`### TC1: Simple One-to-Many — Users → Posts`);
  lines.push('');
  lines.push(`**Issue**: Fetches all users, then loops to fetch each user's posts (N+1 pattern).`);
  lines.push('');
  lines.push(`**❌ Bad Pattern (N+1 Queries)**`);
  lines.push(`\`\`\`typescript`);
  lines.push(`const users = await prisma.user.findMany();`);
  lines.push(`for (const user of users) {`);
  lines.push(`  user.posts = await prisma.post.findMany({`);
  lines.push(`    where: { userId: user.id },`);
  lines.push(`  });`);
  lines.push(`}`);
  lines.push(`// Query count: 1 + N (where N = number of users)`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`**✅ Good Pattern (Eager Loading)**`);
  lines.push(`\`\`\`typescript`);
  lines.push(`const users = await prisma.user.findMany({`);
  lines.push(`  include: { posts: true },`);
  lines.push(`});`);
  lines.push(`// Query count: 1 (single JOIN query)`);
  lines.push(`\`\`\``);
  lines.push('');
  
  lines.push(`### TC2: Nested Relationships — Users → Posts → Comments`);
  lines.push('');
  lines.push(`**Issue**: Three-level nested relationships with N+1 at each level.`);
  lines.push('');
  lines.push(`**❌ Bad Pattern (Nested N+1)**`);
  lines.push(`\`\`\`typescript`);
  lines.push(`const users = await prisma.user.findMany();`);
  lines.push(`for (const user of users) {`);
  lines.push(`  user.posts = await prisma.post.findMany({ where: { userId: user.id } });`);
  lines.push(`  for (const post of user.posts) {`);
  lines.push(`    post.comments = await prisma.comment.findMany({ where: { postId: post.id } });`);
  lines.push(`  }`);
  lines.push(`}`);
  lines.push(`// Query count: 1 + N + (N × M) where M = avg posts per user`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`**✅ Good Pattern (Nested Eager Loading)**`);
  lines.push(`\`\`\`typescript`);
  lines.push(`const users = await prisma.user.findMany({`);
  lines.push(`  include: {`);
  lines.push(`    posts: {`);
  lines.push(`      include: { comments: true },`);
  lines.push(`    },`);
  lines.push(`  },`);
  lines.push(`});`);
  lines.push(`// Query count: 1 (single multi-level JOIN)`);
  lines.push(`\`\`\``);
  lines.push('');
  
  lines.push(`### TC3: Many-to-One (Prisma-specific) — Orders → Users`);
  lines.push('');
  lines.push(`**Issue**: Fetching parent entity for each child in a loop.`);
  lines.push('');
  lines.push(`**❌ Bad Pattern (Reverse N+1)**`);
  lines.push(`\`\`\`typescript`);
  lines.push(`const orders = await prisma.order.findMany();`);
  lines.push(`for (const order of orders) {`);
  lines.push(`  order.user = await prisma.user.findUnique({`);
  lines.push(`    where: { id: order.userId },`);
  lines.push(`  });`);
  lines.push(`}`);
  lines.push(`// Query count: 1 + N`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`**✅ Good Pattern (Include Parent)**`);
  lines.push(`\`\`\`typescript`);
  lines.push(`const orders = await prisma.order.findMany({`);
  lines.push(`  include: { user: true },`);
  lines.push(`});`);
  lines.push(`// Query count: 1`);
  lines.push(`\`\`\``);
  lines.push('');
  
  lines.push(`### TC4: Conditional Loading — Active Orders → Users`);
  lines.push('');
  lines.push(`**Issue**: Conditionally loading related data based on a flag.`);
  lines.push('');
  lines.push(`**❌ Bad Pattern (Conditional N+1)**`);
  lines.push(`\`\`\`typescript`);
  lines.push(`const orders = await prisma.order.findMany({ where: { status: 'active' } });`);
  lines.push(`for (const order of orders) {`);
  lines.push(`  if (order.requiresUserData) {`);
  lines.push(`    order.user = await prisma.user.findUnique({ where: { id: order.userId } });`);
  lines.push(`  }`);
  lines.push(`}`);
  lines.push(`// Query count: 1 + N (where N = orders with requiresUserData = true)`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`**✅ Good Pattern (Batch Pre-fetch + Map Lookup)**`);
  lines.push(`\`\`\`typescript`);
  lines.push(`const orders = await prisma.order.findMany({ where: { status: 'active' } });`);
  lines.push(`const userIds = orders.filter(o => o.requiresUserData).map(o => o.userId);`);
  lines.push(`const users = await prisma.user.findMany({ where: { id: { in: userIds } } });`);
  lines.push(`const userMap = new Map(users.map(u => [u.id, u]));`);
  lines.push(`for (const order of orders) {`);
  lines.push(`  if (order.requiresUserData) order.user = userMap.get(order.userId);`);
  lines.push(`}`);
  lines.push(`// Query count: 2 (orders + batch user fetch)`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Dataset Sizes`);
  lines.push('');
  lines.push(`| Size | Users | Posts | Comments | Orders |`);
  lines.push(`|------|-------|-------|----------|--------|`);
  lines.push(`| Small | 100 | 300 | 600 | 200 |`);
  lines.push(`| Medium | 1,000 | 3,000 | 6,000 | 2,000 |`);
  lines.push(`| Large | 10,000 | 30,000 | 60,000 | 20,000 |`);
  lines.push(`| XLarge | 100,000 | 300,000 | 600,000 | 200,000 |`);
  lines.push('');
  lines.push(`*Dataset size can be configured in \`src/seed.ts\`*`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Metrics Collected`);
  lines.push('');
  lines.push(`Each benchmark measures:`);
  lines.push(`- **Query Count**: Total database queries executed`);
  lines.push(`- **Execution Time**: Mean, median, P95, P99 latency`);
  lines.push(`- **Speedup Factor**: Bad avg time / Good avg time`);
  lines.push(`- **Query Reduction**: Percentage of queries eliminated`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Why This Study Requires PostgreSQL`);
  lines.push('');
  lines.push(`Unlike memory leak (Study 03) and loop performance (Study 04) benchmarks:`);
  lines.push('');
  lines.push(`1. **ORM Behavior**: Prisma query generation and optimization is database-specific`);
  lines.push(`2. **Real Network Latency**: Database round-trips cannot be accurately simulated`);
  lines.push(`3. **Query Planning**: PostgreSQL's query planner affects JOIN performance`);
  lines.push(`4. **Data Volume**: Meaningful N+1 impact requires realistic dataset sizes`);
  lines.push(`5. **Transaction Overhead**: Connection pooling and transaction costs are real`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Expected Results`);
  lines.push('');
  lines.push(`Typical improvements (good vs. bad):`);
  lines.push('');
  lines.push(`| Test Case | Query Reduction | Speedup |`);
  lines.push(`|-----------|-----------------|---------|`);
  lines.push(`| TC1 (Simple One-to-Many) | ~99% | 5-20× |`);
  lines.push(`| TC2 (Nested Relationships) | ~99% | 10-50× |`);
  lines.push(`| TC3 (Many-to-One) | ~99% | 10-30× |`);
  lines.push(`| TC4 (Conditional Loading) | ~90-99% | 10-30× |`);
  lines.push('');
  lines.push(`*Actual results depend on dataset size, network latency, and database configuration.*`);
  lines.push(`*Reference note: The original article numbers came from a specific empirical-study run. This CLI replay seeds its own local dataset and runs against your PostgreSQL environment, so exact query counts and speedup ratios may differ. The largest variation is usually in TC4, where the proportion of records requiring user data changes both the bad-query count and the observed speedup.*`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Optional Reference: Original Repository Workflow`);
  lines.push('');
  lines.push(`If you want to compare this replay against the original study implementation, you can still run the upstream repository separately:`);
  lines.push('');
  lines.push(`\`\`\`bash`);
  lines.push(`# Clone the original empirical-study repository`);
  lines.push(`git clone https://github.com/liangk/empirical-study.git`);
  lines.push(`cd empirical-study/studies/01-n-plus-1-query`);
  lines.push('');
  lines.push(`# Install dependencies`);
  lines.push(`npm install`);
  lines.push('');
  lines.push(`# Set up database`);
  lines.push(`export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/empirical_study_01"`);
  lines.push(`npx prisma db push`);
  lines.push(`npx prisma generate`);
  lines.push('');
  lines.push(`# Seed data`);
  lines.push(`npm run seed`);
  lines.push('');
  lines.push(`# Run benchmarks`);
  lines.push(`npm run bench:all`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`Those upstream results are separate from the \`code-evolution-lab\` replay outputs generated by this CLI.`);
  
  return lines.join('\n');
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   N+1 Query Empirical Study — Full Benchmark    ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });
  const defaultDatabaseUrl = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
  process.env.DATABASE_URL = await promptForDatabaseUrl(defaultDatabaseUrl);

  // Run automated setup
  const setupSuccess = await setupPrisma();
  if (!setupSuccess) {
    console.log('\n📖 Generating setup documentation instead...\n');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const docPath = join(RESULTS_DIR, `study01-setup-${timestamp}.md`);
    const documentation = buildSummaryMarkdown([], {});
    writeFileSync(docPath, documentation);
    console.log('📄 Setup guide saved to:', docPath);
    console.log('\nTo run benchmarks:');
    console.log('  1. Start PostgreSQL (e.g., docker compose up -d)');
    console.log('  2. Press Enter to accept setup prompts');
    console.log('  3. Allow prisma generate / db push / seed when prompted');
    console.log('  4. Run: code-evolution-lab replay 01\n');
    process.exit(1);
  }

  const dbAvailable = await checkDatabaseConnection();
  if (!dbAvailable) {
    console.log('\n📖 Generating setup documentation instead...\n');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const docPath = join(RESULTS_DIR, `study01-setup-${timestamp}.md`);
    const documentation = buildSummaryMarkdown([], {});
    writeFileSync(docPath, documentation);
    console.log('📄 Setup guide saved to:', docPath);
    console.log('\nTo run benchmarks:');
    console.log('  1. Start PostgreSQL (e.g., docker compose up -d)');
    console.log('  2. Make sure the DB name is correct');
    console.log('  3. Run: code-evolution-lab replay 01\n');
    return;
  }

  const allResults: { bad: BenchmarkResult; good: BenchmarkResult }[] = [];

  console.log('\n▶ Running TC1: Simple One-to-Many (Users → Posts)...');
  const tc1 = await runTC1();
  printResult(tc1.bad);
  printResult(tc1.good);
  printComparison(tc1.bad, tc1.good);
  allResults.push(tc1);

  console.log('\n▶ Running TC2: Nested Relationships (Users → Posts → Comments)...');
  const tc2 = await runTC2();
  printResult(tc2.bad);
  printResult(tc2.good);
  printComparison(tc2.bad, tc2.good);
  allResults.push(tc2);

  console.log('\n▶ Running TC3: Prisma Orders → User...');
  const tc3 = await runTC3();
  printResult(tc3.bad);
  printResult(tc3.good);
  printComparison(tc3.bad, tc3.good);
  allResults.push(tc3);

  console.log('\n▶ Running TC4: Conditional Loading (Active Orders)...');
  const tc4 = await runTC4();
  printResult(tc4.bad);
  printResult(tc4.good);
  printComparison(tc4.bad, tc4.good);
  allResults.push(tc4);

  console.log('\n\n╔══════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              SUMMARY TABLE                                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════════════╝');
  console.log(
    'Test Case'.padEnd(30) +
    'Dataset'.padEnd(10) +
    'Bad Queries'.padEnd(14) +
    'Good Queries'.padEnd(14) +
    'Reduction'.padEnd(12) +
    'Bad Time'.padEnd(12) +
    'Good Time'.padEnd(12) +
    'Speedup'
  );
  console.log('-'.repeat(104));

  for (const { bad, good } of allResults) {
    const queryReduction = ((bad.queryCount - good.queryCount) / bad.queryCount * 100).toFixed(1);
    const speedup = (bad.avgMs / good.avgMs).toFixed(1);
    console.log(
      bad.testCase.padEnd(30) +
      String(bad.datasetSize).padEnd(10) +
      String(bad.queryCount).padEnd(14) +
      String(good.queryCount).padEnd(14) +
      `${queryReduction}%`.padEnd(12) +
      `${bad.avgMs}ms`.padEnd(12) +
      `${good.avgMs}ms`.padEnd(12) +
      `${speedup}x`
    );
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const metadata = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  };

  const resultsFile = join(RESULTS_DIR, `benchmark-${timestamp}.json`);
  writeFileSync(resultsFile, JSON.stringify({ metadata, results: allResults }, null, 2));
  console.log(`\n💾 Results saved to: ${resultsFile}`);

  const summaryFile = join(RESULTS_DIR, `summary-${timestamp}.md`);
  const summary = buildSummaryMarkdown(allResults, metadata);
  writeFileSync(summaryFile, summary);
  console.log(`📄 Summary saved to: ${summaryFile}\n`);
}

main().catch((e) => {
  console.error('Benchmark failed:', e);
  process.exit(1);
});
