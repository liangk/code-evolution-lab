# code-evolution CLI

> Evolution-Aware Static Analysis — empirical software diagnostics as code

Detect performance anti-patterns in your codebase, backed by empirical evidence from 5 research studies covering **200+ benchmarks** and **40+ real-world repositories**.

## Installation

```bash
# Run directly with npx (no install required)
npx code-evolution analyze .

# Or install globally
npm install -g code-evolution
```

## Commands

### `analyze` — Scan a project

```bash
code-evolution analyze [path]
```

Scans the target directory for performance anti-patterns across three categories:

| Category | Patterns | Source |
|----------|----------|--------|
| **Loop** | Regex in loop, JSON.parse in loop, sequential await, nested loops, nested/chained array methods | Study 04 |
| **Memory** | Missing useEffect cleanup, missing event listener removal, timer leaks, subscription leaks, observer leaks | Study 03 |
| **Index** | Missing FK index, missing filter/sort index, missing composite index (Prisma) | Study 05 |

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `-s, --severity <level>` | Minimum severity: `critical\|high\|medium\|low` | `low` |
| `-c, --category <cat>` | Filter by category: `loop\|memory\|index` | all |
| `-o, --output <dir>` | Output directory | `.codeevolution/` |
| `--json` | Output JSON only (no console) | false |
| `--no-files` | Skip writing output files | false |

**Examples:**

```bash
# Analyze current directory
code-evolution analyze

# Analyze a specific project, high severity only
code-evolution analyze ~/projects/my-app --severity high

# Only check for loop anti-patterns
code-evolution analyze . --category loop

# JSON output for CI integration
code-evolution analyze . --json > report.json
```

### `scan` / `compare` — Temporal comparison

```bash
code-evolution scan            # Capture baseline scan snapshot
code-evolution compare         # Re-scan and diff against snapshot
```

Capture a reference scan before you change code; compare runs later guard against regressions.

**Workflow:**

1. Run `code-evolution scan` and commit `.codeevolution/baseline.json`
2. Make code changes
3. Run `code-evolution compare` to spot regressions or resolved issues

**Output:**
```
Baselined scan comparison

  Previous score: 73/100
  Current score:  71/100
  Delta:          -2
  Unchanged:      40

  New issues (2):
    HIGH     loop/nested-loops  src/services/matcher.ts:89
             Nested for-loop at depth 2

  Resolved issues (1):
    ✓ memory/missing-effect-cleanup  src/hooks/useData.ts:45
```

### `replay` — Reproduce study benchmarks

```bash
code-evolution replay [study-number]
```

Re-run the exact benchmarks from any of the 5 empirical studies for reproducibility validation.

```bash
# List available studies
code-evolution replay

# Replay Study 04 (Loop Performance)
code-evolution replay 04

# Quick mode (reduced trials)
code-evolution replay 04 --quick
```

## Output Format

All output is written to `.codeevolution/` (configurable with `--output`):

```
.codeevolution/
  results.json           # Full structured findings (machine-readable)
  hotspots.md            # Human-readable report with code snippets
  confidence-score.txt   # Overall health score with breakdown
  baseline.json          # Baseline snapshot (after `baseline create`)
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

The confidence score (0–100) reflects your codebase's structural health:

- **90–100** — Excellent. No significant anti-patterns detected.
- **70–89** — Good. Minor issues that may not impact production.
- **50–69** — Needs attention. Several patterns with measurable performance impact.
- **0–49** — Critical. Patterns that cause significant performance degradation at scale.

## Detection Rules

### Loop Rules (Study 04)

| Rule | Severity | Empirical Evidence |
|------|----------|-------------------|
| `loop/regex-in-loop` | high | 1.03× V8, 2× CPython |
| `loop/json-parse-in-loop` | high | 46× at n=100,000 |
| `loop/sequential-await` | high | Linear speedup with n |
| `loop/nested-loops` | high | 64× at n=10,000 |
| `loop/nested-array-methods` | medium | 6× at large n |
| `loop/chained-array-methods` | medium | 1.5–2× at large n |

### Memory Rules (Study 03)

| Rule | Severity | Pattern |
|------|----------|---------|
| `memory/missing-effect-cleanup` | critical | useEffect without cleanup return |
| `memory/missing-event-removal` | high | addEventListener without remove |
| `memory/missing-timer-cleanup` | high | setInterval/setTimeout without clear |
| `memory/missing-subscription` | high | .subscribe() without unsubscribe |
| `memory/missing-observer-disconnect` | medium | Observer API without disconnect |
| `memory/missing-lifecycle-cleanup` | high | Vue/Angular lifecycle missing cleanup |

### Index Rules (Study 05)

| Rule | Severity | Pattern |
|------|----------|---------|
| `index/missing-fk-index` | high | Prisma FK field without @@index |
| `index/missing-filter-index` | high | Where clause field without @@index |
| `index/missing-sort-index` | medium | orderBy field without @@index |
| `index/missing-composite` | medium | Multi-field where without composite |

## CI Integration

### Exit Codes

- `0` — No critical issues found
- `1` — Critical issues detected (or score decreased in baseline compare)

### GitHub Actions

See [`packages/github-action/`](../github-action/) for the dedicated GitHub Action that posts PR comments with diff-aware diagnostics.

### Generic CI

```yaml
# .github/workflows/diagnostics.yml
- run: npx code-evolution analyze . --severity high --json > report.json
- run: npx code-evolution baseline compare || echo "Score decreased"
```

## Links

- **Research:** [github.com/liangk/empirical-study](https://github.com/liangk/empirical-study)
- **Publication:** [stackinsight.dev](https://stackinsight.dev)
- **Tool:** [codeevolutionlab.com](https://codeevolutionlab.com)
