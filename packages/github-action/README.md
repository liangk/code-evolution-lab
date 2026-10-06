# Code Evolution Lab GitHub Action

> Detect performance anti-patterns on every PR — backed by empirical evidence from 11 research studies

## Quick Start

Use the published action from this repository (no local packaging required):

```yaml
# .github/workflows/code-evolution.yml
name: Code Evolution Lab Diagnostics
on: [pull_request]

permissions:
  contents: read
  pull-requests: write   # lets the action list changed files and post its comment

jobs:
  diagnostics:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: liangk/code-evolution-lab/packages/github-action@v1
```

Notes for users:

- Replace `@v1` with a specific version or `@main` if you want the latest commit (less stable).
- No npm install is needed; the action bundles the CLI.
- `github-token` defaults to the job's `GITHUB_TOKEN`; you only need to set it to use a different token. The workflow needs `pull-requests: write` for the comment.
- On pull requests from forks the token is read-only: the scan and the fail check still run, the comment is skipped with a warning.
- Re-runs update the action's existing PR comment instead of adding a new one.
- Optional: add a baseline by committing `.codeevolution/baseline.json` (generated via the CLI) to enable regression comparisons.

## What It Does

On every pull request, this action:

1. **Scans** your codebase for 39 empirically-validated anti-patterns across all 11 detector categories
2. **Filters** to only report issues in files changed by the PR
3. **Compares** against your baseline (if `.codeevolution/baseline.json` exists)
4. **Comments** on the PR with actionable diagnostics and empirical evidence
5. **Fails** the check if critical issues are introduced by the PR

## PR Comment Example

```markdown
## Code Evolution Diagnostics

| Category | New | Resolved | Total |
|----------|-----|----------|-------|
| loop     | +2  | -1       | 19    |
| memory   | 0   | 0        | 12    |

### New Issues in This PR

🟠 **[loop/nested-loops]** `src/services/matcher.ts:89`
> Potential O(n²) — consider Map/Set lookup for O(n).
> *Study 04, BM-04 — 64× at n=10,000*

**Score: 71/100** 📉 (was 73 — -2)
```

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `path` | Path to analyze (relative to repo root) | `.` |
| `severity` | Minimum severity to report: `critical\|high\|medium\|low` | `medium` |
| `fail-on` | Fail check at this severity or above: `critical\|high\|medium\|low\|none` | `critical` |
| `baseline` | Compare against `.codeevolution/baseline.json` | `true` |
| `comment` | Post a PR comment with results | `true` |
| `github-token` | Token used to list the PR's changed files and post the comment | `${{ github.token }}` |

## Outputs

| Output | Description |
|--------|-------------|
| `issues-found` | Total number of issues found |
| `confidence-score` | Overall score (0–100) |
| `new-issues` | New issues vs baseline (`0` when there is no baseline) |
| `resolved-issues` | Resolved issues vs baseline (`0` when there is no baseline) |

## Setting Up Baseline

For temporal comparison (recommended):

```bash
# Install CLI
npm install -g code-evolution-lab

# Capture a scan snapshot and commit it
code-evolution-lab scan
git add .codeevolution/baseline.json
git commit -m "chore: add code evolution scan snapshot"
```

The action will automatically compare against this baseline on every PR.

If the action scans a subdirectory (`path: src`), create the snapshot with the same path so the issue paths line up, still from the repo root:

```bash
code-evolution-lab scan src
git add .codeevolution/baseline.json
```

The action looks for `.codeevolution/baseline.json` at the repo root first, then next to the scanned path.

## Advanced Configuration

### Fail only on high+ severity

```yaml
- uses: liangk/code-evolution-lab/packages/github-action@v1
  with:
    fail-on: high
    severity: medium
```

### Scan specific directory

```yaml
- uses: liangk/code-evolution-lab/packages/github-action@v1
  with:
    path: src
```

### No PR comment (check only)

```yaml
- uses: liangk/code-evolution-lab/packages/github-action@v1
  with:
    comment: 'false'
```

## Detection Categories

| Category | Rules | Source Study |
|----------|-------|-------------|
| **N+1** | 1 anti-pattern (ORM/DB call inside a loop) | Study 01: N+1 Query |
| **Blocking I/O** | 4 anti-patterns (sync file, crypto, child-process, DB) | Study 02: Blocking I/O |
| **Memory** | 6 anti-patterns (useEffect, listeners, timers, subscriptions) | Study 03: Memory Leaks |
| **Loop** | 6 anti-patterns (regex, JSON.parse, await, nested, chained) | Study 04: Loop Performance |
| **Index** | 4 anti-patterns (FK, filter, sort, composite — Prisma) | Study 05: Missing Index |
| **Resource** | 3 anti-patterns (connections, streams, file handles) | Study 06: Resource Leaks |
| **Bundle** | 2 anti-patterns (heavy packages, namespace imports) | Study 07: Bundle Bloat |
| **DOM** | 3 anti-patterns (loop manipulation, innerHTML XSS, document.write) | Study 08: DOM Manipulation |
| **Payload** | 6 anti-patterns (unbounded queries, large returns, API responses, unbounded GraphQL, deep includes, select-star) | Study 09: Large Payloads |
| **ReDoS** | 2 anti-patterns (dangerous patterns, regex on user input) | Study 10: ReDoS |
| **Caching** | 2 anti-patterns (repeated calls, uncached hot paths) | Study 11: Caching |

All rules are backed by controlled benchmarks with statistical significance testing (Welch's t-test, Cohen's d, power-law regression).

## Links

- **CLI:** [`code-evolution-lab`](https://www.npmjs.com/package/code-evolution-lab)
- **Research:** [github.com/liangk/empirical-study](https://github.com/liangk/empirical-study)
- **Publication:** [stackinsight.dev](https://stackinsight.dev)
