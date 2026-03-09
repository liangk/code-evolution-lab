import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { spawnSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

const BASE_RESULTS_DIR = process.env.CODE_EVOLUTION_LAB_RESULTS_DIR || join(process.cwd(), 'results');
const RESULTS_DIR = join(BASE_RESULTS_DIR, 'study05');

function resolveSchemaPath(): string {
  const local = join(__dirname, 'prisma', 'schema.prisma');
  if (existsSync(local)) return local;
  const fromRepoRoot = join(__dirname, '..', '..', 'src', 'study05', 'prisma', 'schema.prisma');
  return fromRepoRoot;
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
const PRISMA_CLI_PATH = resolvePrismaCliPath();
const SEED_SCRIPT = join(__dirname, 'seed.js');
const DEFAULT_DB_NAME = 'empirical_study_05';
const DEFAULT_DB_BASE = 'postgresql://postgres:postgres@localhost:5432';

async function promptForDatabaseName(defaultName: string): Promise<string> {
  const rl = createInterface({ input, output });
  const answer = await rl.question(`Enter PostgreSQL DB name [${defaultName}]: `);
  rl.close();
  const name = answer.trim() || defaultName;
  console.log(`Using database name: ${name}`);
  return name;
}

async function promptYesNo(question: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  const answer = await rl.question(`${question} (Y/n): `);
  rl.close();
  const normalized = answer.trim().toLowerCase();
  return normalized === '' || normalized === 'y' || normalized === 'yes';
}

function runCommand(cmd: string, args: string[]): boolean {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  return result.status === 0;
}

function runPrismaCommand(args: string[]): boolean {
  return runCommand(process.execPath, [PRISMA_CLI_PATH, ...args]);
}

async function setupPrisma(): Promise<boolean> {
  console.log('\n--- Prisma Setup Check ---\n');

  let needsGenerate = false;
  try {
    const { PrismaClient } = require('@prisma/client');
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

  if (needsGenerate || await promptYesNo('Run prisma generate?')) {
    console.log('\nGenerating Prisma client...');
    if (!runPrismaCommand(['generate', '--schema', SCHEMA_PATH])) {
      console.error('Failed to generate Prisma client');
      return false;
    }
  }

  if (await promptYesNo('\nPush database schema (creates tables)?')) {
    console.log('\nPushing schema to database...');
    if (!runPrismaCommand(['db', 'push', '--schema', SCHEMA_PATH, '--skip-generate'])) {
      console.error('Failed to push schema');
      return false;
    }
  }

  const prisma = new PrismaClient();
  try {
    const userCount = await prisma.benchUser.count();
    if (userCount === 0) {
      console.log('\n✗ Database is empty');
      if (await promptYesNo('Run seed script to populate test data?')) {
        console.log('\nSeeding database (this may take a minute)...');
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

/**
 * Study 05 — Missing Index Benchmarks
 *
 * This study requires a live PostgreSQL database with Prisma.
 * It cannot run in a self-contained Node.js process like Studies 03 and 04.
 *
 * Prerequisites:
 *   1. PostgreSQL running (e.g. via Docker: `docker compose up -d`)
 *   2. DATABASE_URL set in environment
 *   3. Run `npx prisma migrate deploy` in the study directory
 *   4. Run `npx prisma db seed` to populate bench_users / bench_orders tables
 *
 * To run Study 05 benchmarks, use the original empirical-study repo:
 *   cd empirical-study/studies/05-missing-index
 *   npm run bench:all
 *
 * Modules covered:
 *   BM-01: Point Lookup — Unindexed Column (email)
 *   BM-02: Sorted Range Query — Unindexed ORDER BY (created_at)
 *   BM-03: Foreign Key Scan — Unindexed FK column (user_id)
 *   BM-04: Composite Filter — Multi-column WHERE without composite index
 *   BM-05: Covering Index — SELECT with/without covering index
 *
 * Each module measures query latency (ms) with and without the relevant index,
 * using Welch's t-test and Cohen's d for statistical significance.
 */

function buildDocumentationMarkdown(): string {
  const lines: string[] = [];
  lines.push(`# Study 05: Missing Index Benchmarks — Documentation`);
  lines.push('');
  lines.push(`## Overview`);
  lines.push('');
  lines.push(`Study 05 benchmarks the performance impact of missing database indexes in PostgreSQL.`);
  lines.push(`Unlike Studies 03 and 04, this study **requires a live PostgreSQL database** and cannot run in a self-contained Node.js process.`);
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
  lines.push(`   export DATABASE_URL="postgresql://replay_user:replay_pass@localhost:5432/replay_study05"`);
  lines.push(`   \`\`\``);
  lines.push('');
  lines.push(`3. **Database Schema**: Deploy Prisma migrations`);
  lines.push(`   \`\`\`bash`);
  lines.push(`   cd empirical-study/studies/05-missing-index`);
  lines.push(`   npx prisma migrate deploy`);
  lines.push(`   \`\`\``);
  lines.push('');
  lines.push(`4. **Seed Data**: Populate \`bench_users\` and \`bench_orders\` tables`);
  lines.push(`   \`\`\`bash`);
  lines.push(`   npx prisma db seed`);
  lines.push(`   \`\`\``);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Running the Benchmarks`);
  lines.push('');
  lines.push(`To execute Study 05 benchmarks, use the original empirical-study repository:`);
  lines.push('');
  lines.push(`\`\`\`bash`);
  lines.push(`cd empirical-study/studies/05-missing-index`);
  lines.push(`npm run bench:all`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`Or run individual modules:`);
  lines.push('');
  lines.push(`\`\`\`bash`);
  lines.push(`npm run bench:01  # Point Lookup`);
  lines.push(`npm run bench:02  # Sorted Range Query`);
  lines.push(`npm run bench:03  # Foreign Key Scan`);
  lines.push(`npm run bench:04  # Composite Filter`);
  lines.push(`npm run bench:05  # Covering Index`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Benchmark Modules`);
  lines.push('');
  
  lines.push(`### BM-01: Point Lookup — Unindexed Column`);
  lines.push('');
  lines.push(`**Issue**: Querying by unindexed \`email\` column requires full table scan.`);
  lines.push('');
  lines.push(`**❌ Without Index**`);
  lines.push(`\`\`\`sql`);
  lines.push(`SELECT * FROM bench_users WHERE email = 'user@example.com';`);
  lines.push(`-- Full table scan: O(n)`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`**✅ With Index**`);
  lines.push(`\`\`\`sql`);
  lines.push(`CREATE INDEX idx_users_email ON bench_users(email);`);
  lines.push(`SELECT * FROM bench_users WHERE email = 'user@example.com';`);
  lines.push(`-- B-tree index lookup: O(log n)`);
  lines.push(`\`\`\``);
  lines.push('');
  
  lines.push(`### BM-02: Sorted Range Query — Unindexed ORDER BY`);
  lines.push('');
  lines.push(`**Issue**: Sorting by unindexed \`created_at\` requires in-memory sort.`);
  lines.push('');
  lines.push(`**❌ Without Index**`);
  lines.push(`\`\`\`sql`);
  lines.push(`SELECT * FROM bench_orders ORDER BY created_at DESC LIMIT 100;`);
  lines.push(`-- Full scan + sort: O(n log n)`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`**✅ With Index**`);
  lines.push(`\`\`\`sql`);
  lines.push(`CREATE INDEX idx_orders_created_at ON bench_orders(created_at DESC);`);
  lines.push(`SELECT * FROM bench_orders ORDER BY created_at DESC LIMIT 100;`);
  lines.push(`-- Index scan (already sorted): O(log n + k)`);
  lines.push(`\`\`\``);
  lines.push('');
  
  lines.push(`### BM-03: Foreign Key Scan — Unindexed FK Column`);
  lines.push('');
  lines.push(`**Issue**: Joining on unindexed foreign key \`user_id\` requires sequential scan.`);
  lines.push('');
  lines.push(`**❌ Without Index**`);
  lines.push(`\`\`\`sql`);
  lines.push(`SELECT * FROM bench_orders WHERE user_id = 12345;`);
  lines.push(`-- Sequential scan: O(n)`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`**✅ With Index**`);
  lines.push(`\`\`\`sql`);
  lines.push(`CREATE INDEX idx_orders_user_id ON bench_orders(user_id);`);
  lines.push(`SELECT * FROM bench_orders WHERE user_id = 12345;`);
  lines.push(`-- Index scan: O(log n + k)`);
  lines.push(`\`\`\``);
  lines.push('');
  
  lines.push(`### BM-04: Composite Filter — Multi-column WHERE`);
  lines.push('');
  lines.push(`**Issue**: Filtering on multiple columns without composite index.`);
  lines.push('');
  lines.push(`**❌ Without Composite Index**`);
  lines.push(`\`\`\`sql`);
  lines.push(`SELECT * FROM bench_orders WHERE user_id = 123 AND status = 'completed';`);
  lines.push(`-- Uses single-column index (if available) + filter, or full scan`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`**✅ With Composite Index**`);
  lines.push(`\`\`\`sql`);
  lines.push(`CREATE INDEX idx_orders_user_status ON bench_orders(user_id, status);`);
  lines.push(`SELECT * FROM bench_orders WHERE user_id = 123 AND status = 'completed';`);
  lines.push(`-- Composite index lookup: O(log n)`);
  lines.push(`\`\`\``);
  lines.push('');
  
  lines.push(`### BM-05: Covering Index — Index-Only Scan`);
  lines.push('');
  lines.push(`**Issue**: Query requires accessing table heap even when index could provide all data.`);
  lines.push('');
  lines.push(`**❌ Without Covering Index**`);
  lines.push(`\`\`\`sql`);
  lines.push(`CREATE INDEX idx_orders_user_id ON bench_orders(user_id);`);
  lines.push(`SELECT user_id, total_amount FROM bench_orders WHERE user_id = 123;`);
  lines.push(`-- Index scan + heap fetch for total_amount`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`**✅ With Covering Index**`);
  lines.push(`\`\`\`sql`);
  lines.push(`CREATE INDEX idx_orders_user_covering ON bench_orders(user_id) INCLUDE (total_amount);`);
  lines.push(`SELECT user_id, total_amount FROM bench_orders WHERE user_id = 123;`);
  lines.push(`-- Index-only scan (no heap access)`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Statistical Analysis`);
  lines.push('');
  lines.push(`Each benchmark module measures:`);
  lines.push(`- **Query Latency (ms)**: Mean, median, standard deviation, percentiles`);
  lines.push(`- **Speedup Ratio**: Indexed vs. unindexed performance`);
  lines.push(`- **Welch's t-test**: Statistical significance (p-value)`);
  lines.push(`- **Cohen's d**: Effect size (negligible, small, medium, large)`);
  lines.push(`- **Coefficient of Variation (CV)**: Measurement stability`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Why This Study Requires PostgreSQL`);
  lines.push('');
  lines.push(`Unlike memory leak (Study 03) and loop performance (Study 04) benchmarks that can run in pure Node.js:`);
  lines.push('');
  lines.push(`1. **Database-Specific Behavior**: Index performance varies by RDBMS implementation`);
  lines.push(`2. **Query Planner**: PostgreSQL's query planner decides index usage based on statistics`);
  lines.push(`3. **Real I/O**: Disk-based operations cannot be accurately simulated in-memory`);
  lines.push(`4. **Data Volume**: Meaningful index benchmarks require realistic dataset sizes`);
  lines.push(`5. **Prisma ORM**: Tests real-world ORM query generation and execution`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Expected Results`);
  lines.push('');
  lines.push(`Typical speedup ratios (indexed vs. unindexed):`);
  lines.push('');
  lines.push(`| Module | Dataset Size | Expected Speedup |`);
  lines.push(`|--------|--------------|------------------|`);
  lines.push(`| BM-01 (Point Lookup) | 100K rows | 50-200× |`);
  lines.push(`| BM-02 (Sorted Range) | 100K rows | 20-100× |`);
  lines.push(`| BM-03 (FK Scan) | 500K rows | 100-500× |`);
  lines.push(`| BM-04 (Composite) | 100K rows | 30-150× |`);
  lines.push(`| BM-05 (Covering) | 100K rows | 2-5× |`);
  lines.push('');
  lines.push(`*Actual results depend on hardware, PostgreSQL configuration, and data distribution.*`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
  
  lines.push(`## Alternative: Run from Original Repository`);
  lines.push('');
  lines.push(`For full benchmark execution with summary generation:`);
  lines.push('');
  lines.push(`\`\`\`bash`);
  lines.push(`# Clone the original empirical-study repository`);
  lines.push(`git clone https://github.com/code-evolution-lab/empirical-study.git`);
  lines.push(`cd empirical-study/studies/05-missing-index`);
  lines.push('');
  lines.push(`# Install dependencies`);
  lines.push(`npm install`);
  lines.push('');
  lines.push(`# Set up database`);
  lines.push(`docker compose up -d`);
  lines.push(`npx prisma migrate deploy`);
  lines.push(`npx prisma db seed`);
  lines.push('');
  lines.push(`# Run benchmarks`);
  lines.push(`npm run bench:all`);
  lines.push(`\`\`\``);
  lines.push('');
  lines.push(`Results will be saved to \`results/\` directory with both JSON and Markdown summaries.`);
  
  return lines.join('\n');
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Missing Index Empirical Study — Benchmark     ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  const dbName = await promptForDatabaseName(DEFAULT_DB_NAME);
  process.env.DATABASE_URL = `${DEFAULT_DB_BASE}/${dbName}?schema=public`;

  // Check DB connection
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    await prisma.$disconnect();
  } catch (error: any) {
    console.error('\n❌ Failed to connect to database:', error.message);
    console.error('   Make sure PostgreSQL is running and DATABASE_URL is correct.\n');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const docPath = join(RESULTS_DIR, `study05-setup-${timestamp}.md`);
    const documentation = buildDocumentationMarkdown();
    writeFileSync(docPath, documentation);
    console.log('📄 Setup guide saved to:', docPath);
    console.log('\nTo run benchmarks:');
    console.log('  1. Start PostgreSQL (e.g., docker compose up -d)');
    console.log('  2. Set DATABASE_URL or enter DB name when prompted');
    console.log('  3. Run: npm run replay:05\n');
    return;
  }

  // Run automated setup
  const setupSuccess = await setupPrisma();
  if (!setupSuccess) {
    console.error('\n✗ Setup failed. Cannot run benchmarks.\n');
    process.exit(1);
  }

  console.log('\n⚠️  Note: Study 05 currently outputs documentation only.');
  console.log('    Full index benchmark implementation coming soon.\n');
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const docPath = join(RESULTS_DIR, `study05-documentation-${timestamp}.md`);
  const documentation = buildDocumentationMarkdown();
  writeFileSync(docPath, documentation);
  console.log('📖 Documentation generated:', docPath);
  console.log('\n✓ Study 05 setup complete\n');
}

main().catch((e) => {
  console.error('Study 05 failed:', e);
  process.exit(1);
});
