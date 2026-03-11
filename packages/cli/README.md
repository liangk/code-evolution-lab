# code-evolution-lab CLI

> Evolution-Aware Static Analysis — empirical software diagnostics as code

`code-evolution-lab` scans any JavaScript or TypeScript codebase for performance anti-patterns that are known to cause measurable degradation in production. Its rules are derived from **5 completed empirical studies** published in [liangk/empirical-study](https://github.com/liangk/empirical-study), which combine controlled benchmarks with static analysis evaluation and real-world corpus scans.

It is not a linter that flags style preferences. It flags patterns where measured evidence shows a **10×–64× performance cost** at realistic data scales — and it tells you the exact magnitude.

---

## Why use this tool?

Most static analysis tools flag what *could* be wrong. `code-evolution-lab` flags patterns that were studied in published empirical research — measured with controlled experiments and paired with static analysis evaluation and corpus scans.

**What you get:**

- **Evidence-backed findings** — every issue links to the study and benchmark that quantified the cost (e.g., `46× slower at n=100,000`)
- **A confidence score** — a single 0–100 health number for your codebase that you can track over time
- **Temporal comparison** — capture a snapshot before refactoring, compare after, and know definitively whether you improved or regressed
- **Reproducible benchmarks** — re-run the original study benchmarks locally with `replay` to verify the evidence for yourself
- **CI-ready output** — JSON, Markdown, and exit codes designed for pipeline integration out of the box

**Who is this for:**

- **Engineering teams** who want to catch performance regressions before they reach production
- **Tech leads and architects** who want an objective, evidence-based measure of codebase health
- **Individual developers** who want to learn which patterns actually matter and why
- **Open source maintainers** who want a reproducibility-first approach to performance claims

---

## Quick Start

```bash
# Scan your project immediately — no install required
npx code-evolution-lab analyze .
```

For a typical first-use workflow:

```bash
# 1. Analyze your project (writes findings to .codeevolution/)
npx code-evolution-lab analyze . --severity high

# 2. Capture a baseline snapshot before making changes
npx code-evolution-lab scan

# 3. Refactor, then verify you improved (not regressed)
npx code-evolution-lab compare
```

---

## Installation

```bash
# Run directly with npx (no install required)
npx code-evolution-lab analyze .

# Or install globally for repeated use
npm install -g code-evolution-lab
```

---

## Commands

### `analyze` — Scan a project

```bash
code-evolution-lab analyze [path]
```

Analyzes the target directory (default: current directory) and produces:

- A colored console summary with rule IDs, file locations, severity, and empirical speedup data
- `.codeevolution/results.json` — full machine-readable findings
- `.codeevolution/hotspots.md` — human-readable Markdown report with code context
- `.codeevolution/confidence-score.txt` — the overall 0–100 health score

The scan covers 16 rules across three categories derived from empirical studies:

| Category | Patterns detected | Source study |
|----------|-------------------|-------------|
| **Loop** | Regex in loop, JSON.parse in loop, sequential await, nested loops, nested/chained array methods | Study 04 — Loop Performance |
| **Memory** | Missing useEffect cleanup, event listener leaks, timer leaks, RxJS subscription leaks, Observer leaks, Vue/Angular lifecycle leaks | Study 03 — Memory Leaks |
| **Index** | Missing FK index, missing filter/sort index, missing composite index (Prisma schemas) | Study 05 — Missing Index |

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `-s, --severity <level>` | Minimum severity to report: `critical\|high\|medium\|low` | `low` |
| `-c, --category <cat>` | Filter to one category: `loop\|memory\|index` | all |
| `-o, --output <dir>` | Directory for output files | `.codeevolution/` |
| `--json` | Output JSON to stdout only (suppresses console output) | false |
| `--no-files` | Skip writing output files to disk | false |

**Examples:**

```bash
# Analyze current directory (all rules, all severities)
code-evolution-lab analyze

# Focus on a specific project path
code-evolution-lab analyze ~/projects/my-app

# High-severity issues only — ideal for CI gates
code-evolution-lab analyze . --severity high

# Check only loop-related anti-patterns
code-evolution-lab analyze . --category loop

# Machine-readable output for downstream tools or dashboards
code-evolution-lab analyze . --json > report.json

# Analyze without writing any files (terminal review only)
code-evolution-lab analyze . --no-files
```

---

### `scan` — Capture a performance snapshot

```bash
code-evolution-lab scan
```

Runs a full analysis and saves the result as a reference snapshot at `.codeevolution/baseline.json`. Use this before making significant changes — refactoring a hot path, migrating a library, or upgrading a framework.

The snapshot records your current issue hashes, confidence score, and summary statistics. Later `compare` runs diff against this exact state, so you get a precise, reproducible before/after view.

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `-o, --output <dir>` | Output directory for the snapshot | `.codeevolution/` |

```bash
# Capture snapshot in default directory
code-evolution-lab scan

# Capture snapshot in a custom directory
code-evolution-lab scan --output .diagnostics
```

**Recommended workflow:** commit `.codeevolution/baseline.json` to your repository so the snapshot travels with your code and CI can always compare against it.

---

### `compare` — Detect regressions or improvements

```bash
code-evolution-lab compare
```

Re-runs the full analysis and compares it against the saved `baseline.json`. The output tells you exactly:

- How many new issues were introduced since the snapshot
- How many issues were resolved
- Whether the overall confidence score improved or regressed

Exits with code `1` if the score decreased — ideal for failing CI on regressions.

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `-o, --output <dir>` | Directory containing the baseline snapshot | `.codeevolution/` |

**Example output:**

```
Baseline scan comparison

  Previous score: 73/100
  Current score:  71/100
  Delta:          -2
  Unchanged:      40

  New issues (2):
    HIGH     loop/nested-loops  src/services/matcher.ts:89
             Nested for-loop at depth 2 — 64× cost at n=10,000

  Resolved issues (1):
    ✓ memory/missing-effect-cleanup  src/hooks/useData.ts:45
```

**Full scan → compare workflow:**

```bash
# Step 1: Before refactoring — capture a reference
code-evolution-lab scan
git add .codeevolution/baseline.json
git commit -m "chore: capture performance snapshot"

# Step 2: Make your changes...

# Step 3: After refactoring — verify improvement
code-evolution-lab compare
# Exit 0 = improved or unchanged
# Exit 1 = regression introduced
```

---

### `replay` — Reproduce study benchmarks locally

```bash
code-evolution-lab replay [study-number]
```

Re-runs the exact controlled benchmarks from the underlying empirical studies. This lets you:

- **Verify the evidence** — confirm the measured speedups on your own hardware
- **Understand the scale** — see at what input sizes the patterns become critical
- **Use as a learning tool** — run the study, then examine the code and apply the same patterns in your own projects

| Study | Topic | Requirements |
|-------|-------|-------------|
| `01` | N+1 Query / Missing Index (PostgreSQL) | PostgreSQL running locally |
| `02` | Blocking I/O patterns | Node.js only |
| `03` | Memory leak scenarios (React, Vue, Angular, RxJS) | Node.js only |
| `04` | Loop performance anti-patterns | Node.js only |
| `05` | Prisma query index impact | PostgreSQL running locally |

```bash
# List all available studies with descriptions
code-evolution-lab replay

# Run Study 03 (Memory Leaks — no DB required)
code-evolution-lab replay 03

# Run Study 04 (Loop Performance — no DB required)
code-evolution-lab replay 04

# Quick mode: reduced trial count for fast validation (~2 min)
code-evolution-lab replay 04 --quick

# Full mode: statistically robust trial count (~10–20 min)
code-evolution-lab replay 04
```

Each replay writes a timestamped Markdown report to the local results directory, including benchmark tables, statistical summaries, and the methodology used.

---

## Output Format

All output is written to `.codeevolution/` by default (override with `--output`):

```
.codeevolution/
  results.json           # Full structured findings (machine-readable)
  hotspots.md            # Human-readable report with code snippets
  confidence-score.txt   # Overall health score with breakdown
  baseline.json          # Scan snapshot (created by `scan`)
```

### `results.json` schema

```json
{
  "version": "1.0.0",
  "timestamp": "2026-02-21T...",
  "target": "/path/to/project",
  "summary": {
    "filesScanned": 1247,
    "issuesFound": 42,
    "bySeverity": { "critical": 2, "high": 15, "medium": 25, "low": 0 },
    "byCategory": { "loop": 18, "memory": 12, "index": 12 },
    "confidenceScore": 73
  },
  "issues": [
    {
      "id": "a1b2c3d4e5f6",
      "rule": "loop/nested-loops",
      "category": "loop",
      "severity": "high",
      "file": "src/services/matcher.ts",
      "line": 89,
      "title": "Nested for-loop at depth 2",
      "description": "Potential O(n²) — consider Map/Set lookup for O(n).",
      "recommendation": "Replace inner loop scan with a Map or Set lookup.",
      "studyReference": "Study 04, BM-04",
      "empiricalSpeedup": "64× at n=10,000",
      "confidence": 0.8
    }
  ]
}
```

### Confidence Score

The confidence score (0–100) is a composite measure of your codebase's structural health. It factors in the number of detected issues weighted by severity and the proportion of scanned files affected.

| Score | Interpretation |
|-------|---------------|
| **90–100** | Excellent — no significant anti-patterns detected |
| **70–89** | Good — minor issues unlikely to impact production at current scale |
| **50–69** | Needs attention — several patterns with measurable performance impact |
| **0–49** | Critical — patterns that cause significant degradation at realistic data sizes |

Track this score over time as a team health metric. A declining score across PRs is an early signal of accruing performance debt.

---

## Detection Rules

### Loop Rules (Study 04 — Loop Performance)

These patterns were derived from the loop-performance study in the research repository. That study pairs controlled baseline-vs-optimized benchmarks with static analysis evaluation and real-world corpus profiling.

| Rule | Severity | What it detects | Measured cost |
|------|----------|----------------|--------------|
| `loop/regex-in-loop` | high | `RegExp` literal or constructor called inside a loop body | 1.03× V8, 2× CPython — cost compounds with iterations |
| `loop/json-parse-in-loop` | high | `JSON.parse()` or `JSON.stringify()` called per iteration | **46× slower** at n=100,000 vs. hoisting outside the loop |
| `loop/sequential-await` | high | `await` inside a `for`/`while` loop serializing parallel work | Linear cost; parallelizing with `Promise.all` eliminates it |
| `loop/nested-loops` | high | `for`/`while` loop nested inside another | **64× cost** at n=10,000 (O(n²) growth) |
| `loop/nested-array-methods` | medium | `.map()`, `.filter()`, `.find()` nested inside each other | 6× at large n |
| `loop/chained-array-methods` | medium | Multiple `.filter().map().reduce()` chains on the same array | 1.5–2× — each pass rebuilds an intermediate array |

### Memory Rules (Study 03 — Memory Leaks)

These patterns cause heap growth that doesn't recover across component mount/unmount cycles. They are the most common cause of browser tab memory exhaustion in long-lived React, Vue, and Angular applications.

| Rule | Severity | What it detects | Real-world impact |
|------|----------|----------------|------------------|
| `memory/missing-effect-cleanup` | critical | `useEffect` with a side effect but no cleanup return function | Component unmount leaves subscriptions/listeners alive indefinitely |
| `memory/missing-event-removal` | high | `addEventListener` with no corresponding `removeEventListener` | Event listeners accumulate on every render; DOM nodes cannot be GC'd |
| `memory/missing-timer-cleanup` | high | `setInterval` or `setTimeout` without `clearInterval`/`clearTimeout` | Timers keep firing after component is gone; causes ghost state updates |
| `memory/missing-subscription` | high | RxJS `.subscribe()` without `.unsubscribe()` or `takeUntil` | Observable chains stay alive and trigger state mutations on dead components |
| `memory/missing-observer-disconnect` | medium | `IntersectionObserver`, `MutationObserver`, `ResizeObserver` without `.disconnect()` | Observers retain references to DOM trees, preventing garbage collection |
| `memory/missing-lifecycle-cleanup` | high | Vue `onMounted` / Angular `ngOnInit` setup without corresponding teardown hook | Framework lifecycle listeners outlive the component instance |

### Index Rules (Study 05 — Missing Database Indexes)

These patterns are detected from **Prisma schema files** combined with query call-site analysis. Missing indexes at scale produce full table scans that grow linearly with row count — the single most common cause of slow API responses in data-heavy applications.

| Rule | Severity | What it detects | Real-world impact |
|------|----------|----------------|------------------|
| `index/missing-fk-index` | high | Foreign key field (`@relation`) with no `@@index` | JOIN and cascade operations scan the full child table |
| `index/missing-filter-index` | high | Field used in `.where()` query with no `@@index` | Full table scan on every filtered query — cost grows with row count |
| `index/missing-sort-index` | medium | Field used in `.orderBy()` with no `@@index` | Database sorts the full result set in memory instead of using an index |
| `index/missing-composite` | medium | Multiple fields used together in `.where()` with no `@@index([a, b])` | Two separate single-column indexes are far less efficient than one composite |

---

## CI Integration

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | No issues at or above the reporting threshold; or score held / improved vs. baseline |
| `1` | Issues found at or above threshold; or confidence score decreased vs. baseline |

### GitHub Actions (recommended)

Use the dedicated [`code-evolution-action`](../github-action/) for pull request integration. It automatically:

- Scans only the files changed in the PR
- Compares against the committed baseline snapshot
- Posts a structured comment directly on the PR with new issues, resolved issues, and score delta
- Sets a pass/fail check status based on your configured severity threshold

See [`packages/github-action/`](../github-action/) for setup instructions.

### Generic CI pipeline

```yaml
# .github/workflows/diagnostics.yml
steps:
  - uses: actions/checkout@v4

  - name: Install dependencies
    run: npm ci

  - name: Analyze for high-severity issues
    run: npx code-evolution-lab analyze . --severity high --json > report.json

  - name: Fail if score regressed since last snapshot
    run: npx code-evolution-lab compare || (echo "Performance score decreased — review new issues" && exit 1)

  - name: Upload report artifact
    uses: actions/upload-artifact@v4
    with:
      name: code-evolution-report
      path: .codeevolution/
```

**Recommended CI setup for teams:**

1. Run `code-evolution-lab scan` locally and commit `.codeevolution/baseline.json` to the repo
2. Add the `compare` step to your CI pipeline
3. Any PR that introduces new high-severity issues or drops the confidence score will fail the check automatically

---

## Empirical Research Backing

`code-evolution-lab` is built on top of 5 completed empirical studies published in [`liangk/empirical-study`](https://github.com/liangk/empirical-study). Across the completed studies, the methodology combines controlled benchmark experiments, static analysis evaluation, and real-world corpus scans.

| Study | Topic | Key finding |
|-------|-------|------------|
| Study 01 | N+1 Query / Missing Index | Indexed lookups 10–100× faster than unindexed full table scans at 100K rows |
| Study 02 | Blocking I/O | Sequential blocking calls 5–15× slower than async equivalents under load |
| Study 03 | Memory Leaks | Missing cleanup causes heap to grow proportionally with component mount count |
| Study 04 | Loop Performance | Nested loops and JSON.parse-in-loop up to 64× and 46× slower at large n |
| Study 05 | Prisma Missing Index | Missing composite indexes add full-table-scan cost to every filtered query |

Raw data, methodology, and benchmark code are available in the [empirical-study repository](https://github.com/liangk/empirical-study). Use `code-evolution-lab replay` to run any study benchmark locally.

---

## Links

- **npm:** [npmjs.com/package/code-evolution-lab](https://www.npmjs.com/package/code-evolution-lab)
- **GitHub Action:** [`packages/github-action/`](../github-action/)
- **Research:** [github.com/liangk/empirical-study](https://github.com/liangk/empirical-study)
- **Publication:** [stackinsight.dev](https://stackinsight.dev)
- **Tool:** [codeevolutionlab.com](https://codeevolutionlab.com)
