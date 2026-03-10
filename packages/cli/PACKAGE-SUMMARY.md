# code-evolution-lab CLI Package Summary

## 1. Global Installation Verification ✓

**Package Structure:**
- `name`: `code-evolution-lab` (available on npm)
- `bin`: `code-evolution-lab` → `bin/code-evolution-lab.js`
- `files`: `["dist", "bin"]` - ships compiled code + bin entry
- `main`: `dist/index.js` - for programmatic use
- `bundledDependencies`: bundles `@code-evolution/core-engine` and `@code-evolution/replay` inside the published tarball

**Installation:**
```bash
npm install -g code-evolution-lab
```

**After global install, users can run from any directory:**
```bash
code-evolution-lab --help
code-evolution-lab replay 04
code-evolution-lab analyze ./my-project
```

**How it works:**
- npm symlinks `bin/code-evolution-lab.js` to global bin directory
- Bin script requires `dist/index.js` which loads Commander and routes commands
- Replay command resolves the bundled `@code-evolution/replay` package included inside `code-evolution-lab`

---

## 2. Replay 01 & 05 Automated Setup Flow

### User Experience:

```bash
$ code-evolution-lab replay 01

=== Code Evolution Lab — Replay Framework ===

Study 01 (N+1 Queries) requires a live PostgreSQL database.
You will be prompted for a DB name before the study runs.

Replaying: Study 01 — N+1 Queries
Entry:     /path/to/replay/src/study01/run-all.ts

╔══════════════════════════════════════════════════╗
║   N+1 Query Empirical Study — Full Benchmark    ║
╚══════════════════════════════════════════════════╝

Enter PostgreSQL DB name [empirical_study_01]: my_custom_db
Using database name: my_custom_db

--- Prisma Setup Check ---

✗ Prisma client not found
Run prisma generate? (y/n): y

Generating Prisma client...
✔ Generated Prisma Client

Push database schema (creates tables)? (y/n): y

Pushing schema to database...
✔ Schema pushed successfully

✗ Database is empty
Run seed script to populate test data? (y/n): y

Seeding database...
Creating 100 users...
  Created 10 users...
  Created 20 users...
  ...
  Created 100 users...

✓ Seed complete:
  Users:    100
  Posts:    500
  Comments: 1500
  Orders:   1000

--- Setup Complete ---

▶ Running TC1: Simple One-to-Many (Users → Posts)...

--- TC1: Simple One-to-Many [BAD] ---
  Dataset:    100 users
  Queries:    101
  Avg:        245.32ms
  Median:     243.10ms
  P95:        267.45ms
  P99:        289.12ms
  All runs:   [245.3, 243.1, 247.8, 241.2, 249.2]ms

--- TC1: Simple One-to-Many [GOOD] ---
  Dataset:    100 users
  Queries:    1
  Avg:        12.45ms
  Median:     12.30ms
  P95:        13.21ms
  P99:        13.89ms
  All runs:   [12.5, 12.3, 12.7, 12.1, 12.6]ms

=== TC1: Simple One-to-Many COMPARISON ===
  Dataset:         100 users
  Bad queries:     101
  Good queries:    1
  Query reduction: 99.01%
  Bad avg time:    245.32ms
  Good avg time:   12.45ms
  Speedup:         19.7x

[... similar output for TC2, TC3, TC4 ...]

╔══════════════════════════════════════════════════════════════════════════════════════╗
║                              SUMMARY TABLE                                          ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
Test Case                     Dataset   Bad Queries   Good Queries  Reduction   Bad Time    Good Time   Speedup
--------------------------------------------------------------------------------------------------------
TC1: Simple One-to-Many       100       101           1             99.0%       245.32ms    12.45ms     19.7x
TC2: Nested Relationships     100       601           1             99.8%       1234.56ms   45.67ms     27.0x
TC3: Prisma Orders->User      100       1001          1             99.9%       2345.67ms   23.45ms     100.0x
TC4: Conditional Loading      100       451           2             99.6%       987.65ms    34.56ms     28.6x

💾 Results saved to: /path/to/results/study01/benchmark-2026-03-04T16-31-42-123Z.json
📄 Summary saved to: /path/to/results/study01/summary-2026-03-04T16-31-42-123Z.md

✓ Replay complete for Study 01
```

### Automated Setup Steps:

**a) Database Name Prompt**
- Shows default name: `empirical_study_01` (or `_05` for Study 05)
- User can press Enter to accept or type custom name
- Constructs `DATABASE_URL`: `postgresql://postgres:postgres@localhost:5432/{dbname}?schema=public`

**b) Prisma Client Generation**
- Detects if `@prisma/client` is available
- Prompts: "Run prisma generate? (y/n)"
- Executes: `npx prisma generate --schema src/study01/prisma/schema.prisma`
- Required for first-time setup

**c) Database Schema Push**
- Prompts: "Push database schema (creates tables)? (y/n)"
- Executes: `npx prisma db push --schema ... --skip-generate`
- Creates User, Post, Comment, Order tables
- Idempotent: safe to run multiple times

**d) Seed Data Check**
- Queries: `SELECT COUNT(*) FROM users`
- If empty, prompts: "Run seed script to populate test data? (y/n)"
- Executes: `npx ts-node src/study01/seed.ts`
- Creates 100 users, 500 posts, 1500 comments, 1000 orders
- Takes ~10-30 seconds depending on DB speed

**e) Summary Results on Console**
- Prints detailed results for each test case (bad vs good)
- Shows comparison table with speedup ratios
- Saves JSON and Markdown files to results directory
- Returns exit code 0 on success

---

## 3. Local Testing Steps

### Quick Test (5 minutes)

```bash
# 1. Build packages
cd packages && npm run build

# 2. Link locally
npm link

# 3. Test from anywhere
cd ~/Desktop
code-evolution-lab --help
code-evolution-lab replay 02 --quick

# 4. Cleanup
npm unlink -g code-evolution-lab
```

### Full Test (15 minutes)

```bash
# 1. Create tarball
cd packages/cli
npm pack

# 2. Install globally from tarball
npm install -g ./code-evolution-lab-1.0.0.tgz

# 3. Test all commands
code-evolution-lab --help
code-evolution-lab replay        # List studies
code-evolution-lab replay 02 --quick
code-evolution-lab replay 03 --quick
code-evolution-lab replay 04 --quick

# 4. Test DB-backed replay (requires PostgreSQL)
docker compose up -d postgres    # Start DB
code-evolution-lab replay 01     # Follow prompts
# Enter DB name, confirm all setup steps (y/y/y)

# 5. Verify output
# - Check console shows detailed results
# - Check results/ directory has JSON and MD files

# 6. Cleanup
npm uninstall -g code-evolution-lab
```

### Verify Package Contents

```bash
# Extract tarball
tar -tzf code-evolution-lab-1.0.0.tgz | head -20

# Should see:
# package/package.json
# package/bin/code-evolution-lab.js
# package/dist/index.js
# package/dist/commands/replay.js
# package/dist/commands/analyze.js
# package/dist/commands/baseline.js
# package/node_modules/@code-evolution/core-engine/
# package/node_modules/@code-evolution/replay/
# ... etc
```

### Test in Clean Environment

```bash
# Create throwaway project
mkdir ~/test-cli && cd ~/test-cli
npm init -y

# Install from tarball
npm install /path/to/packages/cli/code-evolution-lab-1.0.0.tgz

# Test via npx
npx code-evolution-lab replay 04
```

---

## 4. Pre-Publish Checklist

- [ ] Build succeeds: `npm run build` in cli and replay packages
- [ ] No TypeScript errors
- [ ] Bin file has shebang: `#!/usr/bin/env node`
- [ ] Package.json has correct bin path
- [ ] `npm pack` produces tarball with dist/ and bin/
- [ ] Global install via `npm link` works
- [ ] Commands run from any directory
- [ ] Study 02/03/04 run without DB setup
- [ ] Study 01 prompts for DB, generates client, pushes schema, seeds
- [ ] Console output shows detailed benchmark results
- [ ] Results files saved to disk
- [ ] README.md is up to date
- [ ] Version number updated

---

## 5. Publish Process

```bash
# Login to npm
npm login

# From packages/cli
cd packages/cli
npm publish --access public

# Verify
npm view code-evolution-lab

# Test install
npm install -g code-evolution-lab
code-evolution-lab --version
```

---

## Notes

- The CLI is published as a single npm package and bundles the internal `core-engine` and `replay` workspaces
- For monorepo setup, consider using workspaces or lerna
- DB-backed replays (01, 05) require PostgreSQL running locally
- Self-contained replays (02, 03, 04) have no external dependencies beyond Node.js
- All prompts default to sensible values (press Enter to accept)
- Seed script creates realistic dataset sizes for meaningful benchmarks
