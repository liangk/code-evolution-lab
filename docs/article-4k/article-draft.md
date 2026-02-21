# Your Performance Research Is Now a CLI Command

> How we turned 5 empirical studies into a single diagnostic tool — and why reproducibility changes everything.

---

## The Problem No One Talks About

Performance research has a reproducibility problem.

Academic papers cite benchmarks. Blog posts share flamegraphs. Conference talks show speedup numbers. But almost none of it is **executable** by the person reading it.

You read "nested loops cause 64× slowdown at n=10,000" and think: *does that apply to my code?*

You can't answer that question. The benchmark data lives in a paper. The detection logic lives in someone's head. The connection between *research finding* and *your codebase* doesn't exist.

Until now.

---

## What We Built (And Why)

Over the past year, [Code Evolution Lab](https://codeevolutionlab.com) ran **5 empirical studies** on Node.js performance:

| # | Study | Key Finding | Scale |
|---|-------|-------------|-------|
| 01 | N+1 Query Problem | Prisma eager loading eliminates O(n) query cascades | 30 trials × 5 sizes |
| 02 | Blocking I/O | Synchronous file ops block the event loop for 10–200ms | AST scan of 40 repos |
| 03 | Memory Leaks | Missing cleanup in React/Vue/Angular causes retention | 190 repos scanned |
| 04 | Loop Performance | Nested loops → 64× speedup with Map; JSON.parse → 46× | 6 benchmarks × 5 sizes × 30 trials |
| 05 | Missing Indexes | FK without @@index → 10–100× slowdown in Prisma | 5 benchmarks × 4 sizes × 30 trials |

Each study followed the same methodology:
1. **Benchmark** the anti-pattern vs. the optimized version
2. **Scale** across input sizes to establish complexity curves
3. **Scan** real-world repositories to measure prevalence
4. **Detect** via static analysis with precision/recall evaluation

The results are rigorous. Welch's t-test. Cohen's d effect sizes. Power-law regression with R² > 0.87. Not vibes — *evidence*.

But they sat in a repo. Useful for articles. Useless for engineers.

---

## Introducing: `code-evolution`

```bash
npx code-evolution analyze .
```

One command. 16 detection rules. Every finding backed by empirical data.

### What It Detects

**Loop patterns** (Study 04):
- Regex compiled inside loop body — *1.03× in V8, 2× in CPython*
- JSON.parse repeated in loop — *46× at n=100,000*
- `await` inside loop instead of `Promise.all()` — *linear speedup with n*
- Nested loops reducible to Map/Set — *64× at n=10,000*
- Nested array methods at depth ≥ 2 — *6× at large n*
- Chained `.filter().map()` — *1.5–2× at large n*

**Memory patterns** (Study 03):
- `useEffect` without cleanup return — *critical: causes retention on unmount*
- `addEventListener` without `removeEventListener`
- `setInterval`/`setTimeout` without clear
- `.subscribe()` without `.unsubscribe()`
- Observer API without `.disconnect()`
- Vue/Angular lifecycle missing cleanup

**Index patterns** (Study 05):
- Prisma FK field without `@@index` — *Prisma does NOT auto-create FK indexes*
- Where clause field without `@@index` — *Seq Scan → Index Scan: 10–1000×*
- `orderBy` field without `@@index` — *eliminates O(n log n) filesort*
- Multi-field where without composite `@@index`

Every issue includes:
- **What** the anti-pattern is
- **Where** it is (file:line)
- **Why** it matters (empirical speedup data)
- **How** to fix it (actionable recommendation)

---

## The Output: Deterministic, Machine-Readable

```bash
npx code-evolution analyze my-project
```

Produces:

```
.codeevolution/
  results.json           # Full structured findings
  hotspots.md            # Human-readable report
  confidence-score.txt   # Overall health score
```

### Console Output

```
Code Evolution Lab — Diagnostic Report

  Files scanned:    1,247
  Issues found:     42
  Confidence score: 73/100

  By category:
    loop       18
    memory     12
    index      12

  By severity:
    CRITICAL   2
    HIGH       15
    MEDIUM     25

Issues:

  CRITICAL memory/missing-effect-cleanup  src/hooks/useData.ts:45
           useEffect sets up addEventListener without cleanup return

  HIGH     loop/nested-loops              src/services/matcher.ts:89
           Nested for-loop at depth 2
```

### Confidence Score

The score (0–100) reflects structural health:
- **90–100** — No significant anti-patterns
- **70–89** — Minor issues, may not impact production
- **50–69** — Patterns with measurable performance impact
- **0–49** — Critical degradation at scale

---

## Baseline: Temporal Intelligence

Research isn't just about *what*. It's about *when*.

```bash
# Snapshot your current state
npx code-evolution baseline create

# After changes, compare
npx code-evolution baseline compare
```

Output:

```
Baseline Comparison

  Previous score: 73/100
  Current score:  71/100
  Delta:          -2

  New issues (2):
    HIGH  loop/nested-loops  src/services/matcher.ts:89
    HIGH  index/missing-fk   prisma/schema.prisma:42

  Resolved issues (1):
    ✓ memory/missing-effect-cleanup  src/hooks/useData.ts:45
```

Commit `.codeevolution/baseline.json` to your repo. Now every PR has a benchmark to beat.

---

## CI: Where Teams Accept New Truth

The GitHub Action makes this automatic:

```yaml
# .github/workflows/code-evolution.yml
name: Code Evolution Diagnostics
on: [pull_request]

jobs:
  diagnostics:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: liangk/empirical-study/packages/github-action@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

On every PR, the action:

1. **Scans** only the changed files
2. **Compares** against your committed baseline
3. **Comments** with new and resolved issues
4. **Fails** the check if critical issues are introduced

### PR Comment

```markdown
## Code Evolution Diagnostics

| Category | New | Resolved | Total |
|----------|-----|----------|-------|
| loop     | +2  | -1       | 19    |
| memory   | 0   | 0        | 12    |

### New Issues in This PR

🟠 [loop/nested-loops] src/services/matcher.ts:89
> Potential O(n²) — consider Map/Set lookup for O(n).
> Study 04, BM-04 — 64× at n=10,000

Score: 71/100 📉 (was 73 — -2)
```

Developers will not uninstall something that prevents silent degradation.

---

## Why This Matters

Most static analysis tools detect *syntax* problems. ESLint catches formatting. TypeScript catches types.

But **no tool catches algorithmic backslides**.

No tool tells you: "this nested loop will cost you 64× at scale, and we have the benchmark data to prove it."

That's what `code-evolution` does. It connects **runtime observation** with **empirical evidence**.

We're calling this category: **Evolution-Aware Static Analysis**.

---

## How It Works Under the Hood

The core engine (`@code-evolution/core-engine`) is a rule registry. Each rule is a function:

```typescript
(filePath: string, content: string, ast?: BabelAST) => DiagnosticIssue[]
```

**Loop and memory rules** use Babel AST traversal — the same analysis we used in Studies 03 and 04.

**Index rules** use Prisma schema parsing and regex-based query call-site detection — the same detector from Study 05.

The engine walks your project, routes files to applicable rules based on extension, deduplicates findings via stable hashing, and produces a structured `AnalysisReport`.

The confidence score is penalty-based: start at 100, subtract weighted points for each issue (critical × 10, high × 5, medium × 2, low × 1) scaled by detection confidence.

Baseline comparison uses hash-based set difference. Same file + same line + same rule = same issue. New hash = new issue. Missing hash = resolved.

---

## What's Next

This is version 1.0. The detection coverage matches our current research.

As we complete more studies (bundle bloat, DOM manipulation, large payloads, ReDoS, caching, resource leaks), the rule set grows. Every new study becomes a new set of detection rules — backed by the same empirical methodology.

The system compounds:
- **Developer curiosity** → reads the article
- **Local validation** → runs the CLI
- **Team enforcement** → installs the GitHub Action
- **Investigation** → reads the study that backs the finding

Each surface reinforces the others.

---

## Try It Now

```bash
npx code-evolution analyze .
```

No configuration. No accounts. No subscriptions.

Just your code, measured against empirical reality.

---

*Published on [stackinsight.dev](https://stackinsight.dev) by [Code Evolution Lab](https://codeevolutionlab.com)*

*Research: [github.com/liangk/empirical-study](https://github.com/liangk/empirical-study)*
