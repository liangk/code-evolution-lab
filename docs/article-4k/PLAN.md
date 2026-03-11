# Article #4K — Development Plan

## Executable Manifesto: Empirical Software Diagnostics as Code

> "All prior studies are now machine-reproducible with a single command."

---

## Strategic Objective

Transform Code Evolution Lab from **research artifacts** into a **repeatable diagnostic system**.

**Success metrics:**
- CLI runs per week
- Repositories analyzed
- CI installations
- Repeat usage

---

## Architecture Overview

```
code-evolution-lab/                    # Monorepo root
  package.json                         # npm workspaces (core-engine, cli, replay, github-action)
  tsconfig.base.json                   # Shared TypeScript compiler options
  .npmrc                               # npm publish config (@code-evolution scope, provenance)

  packages/
    core-engine/                       # Unified detection engine
      src/
        rules/
          loop-rules.ts                # Derived from Study 04 (regex, JSON, nested loops, chained array)
          memory-rules.ts              # Derived from Study 03 (React/Vue/Angular leak patterns)
          index-rules.ts               # Derived from Study 05 (Prisma missing index patterns)
        engine.ts                      # Rule registry + AST file scanner
        types.ts                       # DiagnosticIssue, ScanOptions, AnalysisReport
        reporter/
          json-reporter.ts             # .codeevolution/results.json
          markdown-reporter.ts         # .codeevolution/hotspots.md
          console-reporter.ts          # Colored terminal output
          score.ts                     # Confidence score calculator
      package.json                     # @code-evolution/core-engine
      tsconfig.json
      README.md

    cli/                               # CLI entry point (published as `code-evolution-lab`)
      src/
        index.ts                       # Commander.js CLI setup
        commands/
          analyze.ts                   # code-evolution-lab analyze <path>
          replay.ts                    # code-evolution-lab replay [study] --quick
          baseline.ts                  # code-evolution-lab scan|compare implementation
      bin/
        code-evolution-lab.js          # Shebang entry point
      package.json                     # name: "code-evolution-lab"
      tsconfig.json

    replay/                            # Bundled benchmark suites (self-contained)
      src/
        index.ts                       # STUDIES registry + exported types
        study03/                       # Memory Leak benchmarks (no DB required)
          run-all.ts                   # Orchestrator: 5 scenarios, heap growth analysis
          scenarios/
            react-useeffect-leak.ts    # useEffect without cleanup
            vue-onmounted-leak.ts      # onMounted timer without clearInterval
            angular-subscribe-leak.ts  # subscribe without unsubscribe
            vue-watch-stop-leak.ts     # watch/watchEffect without stop handle
            raf-cancel-leak.ts         # requestAnimationFrame without cancel
        study04/                       # Loop Performance benchmarks (no DB required)
          run-all.ts                   # Orchestrator: BM-01..06, t-test, Cohen's d
          harness/
            types.ts                   # TrialRecord, BenchmarkSummary, ComparisonResult
            runner.ts                  # Trial runner with warmup + GC
            stats.ts                   # mean, median, stddev, paired t-test, Cohen's d
            data-gen.ts                # Seeded PRNG data generators (deterministic)
          modules/
            bm01-regex/                # Regex compiled in loop vs. hoisted constant
            bm02-json/                 # JSON.parse in loop vs. cached before loop
            bm04-nested-loops/         # O(n²) nested scan vs. O(n) Map lookup
            bm05-nested-array/         # Nested forEach vs. for-loop
            bm06-chained-array/        # filter().map() vs. single-pass reduce
        study05/                       # Missing Index benchmarks (requires PostgreSQL)
          run-all.ts                   # Stub — exits with DB requirement message
      package.json                     # @code-evolution/replay (private: true)
      tsconfig.json

    github-action/                     # GitHub Action
      src/
        index.ts                       # Action entry point
        pr-comment.ts                  # PR comment formatter
        diff-filter.ts                 # Diff-aware: only report issues in changed files
      action.yml
      package.json
      tsconfig.json

  results/                             # Benchmark output (gitignored)
    study03/bench-<timestamp>.json
    study04/bench-<timestamp>.json

  docs/
    article-4k/
      PLAN.md                          # This file
      article-draft.md                 # Article #4K content
```

### Study Inclusion Summary

| Study | Self-Contained | Included in `packages/replay` | Notes |
|-------|---------------|-------------------------------|-------|
| 01 — N+1 Query | ✗ | ✗ | Requires PostgreSQL + Prisma |
| 02 — Blocking I/O | ✗ | ✗ | Requires Express server + autocannon |
| 03 — Memory Leaks | ✓ | ✓ | Pure Node.js, no external deps |
| 04 — Loop Performance | ✓ | ✓ | Pure Node.js, seeded PRNG data |
| 05 — Missing Index | ✗ | stub only | Requires PostgreSQL + Prisma |

---

## Phase 1 — Core Engine + CLI + Article (Weeks 1–2)

### 1.1 Core Engine (`packages/core-engine/`)

**Unified issue type** that normalizes findings across all study detectors:

```typescript
interface DiagnosticIssue {
  id: string;                          // Stable hash for dedup
  rule: string;                        // e.g. "loop/regex-in-loop"
  category: DiagnosticCategory;        // loop | memory | index | io
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;                        // Repo-relative path
  line: number;
  column?: number;
  title: string;                       // One-line summary
  description: string;                 // Actionable explanation
  snippet?: string;                    // Source code context
  recommendation: string;             // How to fix
  studyReference?: string;            // e.g. "Study 04, BM-04"
  empiricalSpeedup?: string;          // e.g. "64× at n=10,000"
  confidence: number;                  // 0.0–1.0
}
```

**Rule registry:** Each rule is a function `(filePath, content, ast?) => DiagnosticIssue[]`.

Rules derived from existing detectors:
| Rule ID | Source | Pattern | Severity |
|---------|--------|---------|----------|
| `loop/regex-in-loop` | Study 04 BM-01 | Regex compiled inside loop body | high |
| `loop/json-parse-in-loop` | Study 04 BM-02 | JSON.parse repeated in loop | high |
| `loop/sequential-await` | Study 04 BM-03 | await inside loop instead of Promise.all | high |
| `loop/nested-loops` | Study 04 BM-04 | O(n²) nested loops reducible to Map/Set | high |
| `loop/nested-array-methods` | Study 04 BM-05 | Nested forEach/map at depth ≥2 | medium |
| `loop/chained-array-methods` | Study 04 BM-06 | filter().map() two-pass chain | medium |
| `memory/missing-effect-cleanup` | Study 03 | useEffect without cleanup return | critical |
| `memory/missing-event-removal` | Study 03 | addEventListener without remove | high |
| `memory/missing-timer-cleanup` | Study 03 | setInterval/setTimeout without clear | high |
| `memory/missing-subscription` | Study 03 | .subscribe() without unsubscribe | high |
| `memory/missing-observer-disconnect` | Study 03 | Observer API without disconnect | medium |
| `memory/missing-lifecycle-cleanup` | Study 03 | Vue/Angular lifecycle missing cleanup | high |
| `index/missing-fk-index` | Study 05 BM-03 | Prisma FK field without @@index | high |
| `index/missing-filter-index` | Study 05 | Where clause field without @@index | high |
| `index/missing-sort-index` | Study 05 BM-02 | orderBy field without @@index | medium |
| `index/missing-composite` | Study 05 BM-04 | Multi-field where without composite | medium |

**File scanner:** Walks target directory, applies relevant rules based on file type:
- `.js/.ts/.jsx/.tsx` → loop rules + memory rules (if React/Vue/Angular detected)
- `schema.prisma` → index schema rules
- `.ts/.tsx` with `prisma.` calls → index query rules

**Reporter system:**
- `JsonReporter` → `.codeevolution/results.json`
- `MarkdownReporter` → `.codeevolution/hotspots.md`
- `ConsoleReporter` → colored terminal output
- `ScoreCalculator` → `.codeevolution/confidence-score.txt`

### 1.2 CLI (`packages/cli/`)

**Commands:**

```bash
# Analyze a project
npx code-evolution-lab analyze [path]
  --format json|markdown|console     # Output format (default: all)
  --severity high|medium|low         # Minimum severity filter
  --category loop|memory|index       # Filter by category
  --output <dir>                     # Output directory (default: .codeevolution/)

# Replay study benchmarks (requires study dependencies)
npx code-evolution-lab replay [study]
  --study 01|02|03|04|05             # Specific study to replay
  --quick                            # Reduced trial count for quick validation

# Scan snapshot workflow
npx code-evolution-lab scan          # Snapshot current state
npx code-evolution-lab compare       # Compare against last snapshot
```

**Package setup:**
- Commander.js for CLI framework
- chalk for colored output
- ora for spinners
- Dependencies: `@code-evolution/core-engine`
- Bin entry: `code-evolution-lab` → `bin/code-evolution-lab.js`

### 1.3 Deterministic Output Format

```
.codeevolution/
  results.json             # Full structured findings
  hotspots.md              # Human-readable report with code snippets
  confidence-score.txt     # Single number 0–100 + breakdown
  baseline.json            # Snapshot for temporal comparison (Phase 2)
```

**`results.json` schema:**
```json
{
  "version": "1.0.0",
  "timestamp": "2026-02-21T...",
  "target": "/path/to/project",
  "summary": {
    "filesScanned": 1247,
    "issuesFound": 42,
    "bySeverity": { "critical": 2, "high": 15, "medium": 25 },
    "byCategory": { "loop": 18, "memory": 12, "index": 12 },
    "confidenceScore": 73
  },
  "issues": [ ... DiagnosticIssue[] ]
}
```

**`hotspots.md` structure:**
```markdown
# Code Evolution Lab — Diagnostic Report
> Scanned 1,247 files | Found 42 issues | Confidence: 73/100

## Critical Issues (2)
### [memory/missing-effect-cleanup] src/hooks/useData.ts:45
...

## High Issues (15)
...

## Study References
- Study 04: Loop patterns — 18 findings match empirically benchmarked anti-patterns
...
```

**`confidence-score.txt`:**
```
73/100

Breakdown:
  Loop patterns:   85/100 (18 issues, 15 high-confidence)
  Memory patterns:  65/100 (12 issues, 8 high-confidence)
  Index patterns:   70/100 (12 issues, 10 high-confidence)

Based on: 5 empirical studies, 200+ benchmarks, 40+ real-world repos
```

### 1.4 Article #4K Content

**Narrative arc:**
1. **Problem:** Research is rarely reproducible in day-to-day engineering
2. **Prior work:** 4 completed empirical studies exposed recurring patterns
3. **Breakthrough:** These patterns are now executable against *any* codebase
4. **Demo:** Run against samples + well-known OSS project
5. **Call to action:** `npx code-evolution-lab analyze my-project`

**Target:** ~4,000 words, published on stackinsight.dev

---

## Phase 2 — GitHub Action + Baseline System (Weeks 3–5)

### 2.1 GitHub Action (`packages/github-action/`)

**`action.yml` configuration:**
```yaml
name: 'Code Evolution Diagnostics'
description: 'Detect performance anti-patterns with empirical evidence'
inputs:
  path:
    description: 'Path to analyze'
    default: '.'
  severity:
    description: 'Minimum severity to report'
    default: 'medium'
  fail-on:
    description: 'Fail the check if issues at this severity exist'
    default: 'critical'
  baseline:
    description: 'Compare against baseline'
    default: 'true'
```

**Action behavior on every PR:**
1. Run `code-evolution-lab analyze` on the repo
2. Filter findings to only changed files (diff-aware)
3. Compare against `.codeevolution/baseline.json` if it exists
4. Post PR comment with:
   - New issues introduced in this PR
   - Resolved issues
   - Overall score change
5. Set check status (pass/fail based on `fail-on` threshold)

**PR comment format:**
```markdown
## Code Evolution Diagnostics

| Category | New | Resolved | Total |
|----------|-----|----------|-------|
| Loop     | +2  | -1       | 19    |
| Memory   | 0   | 0        | 12    |
| Index    | +1  | 0        | 13    |

### New Issues in This PR

⚠ **[loop/nested-loops]** `src/services/matcher.ts:89`
> Nested for-loop at depth 2 — potential O(n²). Consider Map/Set substitution.
> *Empirical evidence: 64× speedup at n=10,000 (Study 04, BM-04)*

**Score: 71/100** (was 73 — decreased by 2)
```

### 2.2 Baseline Snapshot System

**Create scan snapshot:**
```bash
npx code-evolution-lab scan
# Writes .codeevolution/baseline.json
```

**baseline.json schema:**
```json
{
  "version": "1.0.0",
  "createdAt": "2026-02-21T...",
  "summary": { ... },
  "issueHashes": ["a1b2c3", "d4e5f6", ...],
  "issues": [ ... ]
}
```

**Compare scan snapshot:**
```bash
npx code-evolution-lab compare
# Outputs diff: new issues, resolved issues, score delta
```

**Integration with CI:**
- First `scan` is run manually and committed
- CI runs `compare` on every PR
- New issues → warning or failure
- Resolved issues → positive signal

---

## Dependency Map

```
packages/core-engine    (0 internal deps)
    ↑
packages/cli            (depends on core-engine)
    ↑
packages/github-action  (depends on cli or core-engine directly)
```

External dependencies:
- **core-engine:** `@babel/parser`, `@babel/traverse`, `@babel/types`, `glob`
- **cli:** `commander`, `chalk`, `ora`, `@code-evolution/core-engine`
- **github-action:** `@actions/core`, `@actions/github`, `@code-evolution/core-engine`

---

## Build & Publish Strategy

1. **Monorepo:** npm workspaces in root `package.json`
2. **Package names:**
   - `@code-evolution/core-engine`
   - `code-evolution-lab` (CLI, the `npx` entry)
   - `code-evolution-action` (GitHub Marketplace)
3. **Build:** TypeScript → CommonJS via tsc
4. **Publish:** npm for CLI + core-engine, GitHub Marketplace for action

---

## What NOT To Do (from the plan)

- No dashboards yet
- No user accounts
- No subscriptions
- No team management
- No website redesign

Those only make sense **after CI adoption proves necessity**.
