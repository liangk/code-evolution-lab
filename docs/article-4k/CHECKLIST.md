# Article #4K — Implementation Checklist

> Empirical Software Diagnostics as Code

---

## Phase 1 — Core Engine + CLI + Article (Weeks 1–2)

### 1.1 Repository Setup
- [ ] Create root `package.json` with npm workspaces (`packages/*`)
- [ ] Update root `.gitignore` for new package artifacts
- [ ] Create `packages/core-engine/package.json`
- [ ] Create `packages/core-engine/tsconfig.json`
- [ ] Create `packages/cli/package.json` (bin: `code-evolution`)
- [ ] Create `packages/cli/tsconfig.json`

### 1.2 Core Engine — Types & Registry
- [ ] `packages/core-engine/src/types.ts` — `DiagnosticIssue`, `DiagnosticCategory`, `RuleDefinition`, `ScanResult`, `AnalysisReport`
- [ ] `packages/core-engine/src/engine.ts` — `RuleRegistry`, `analyzeFile()`, `analyzeDirectory()`
- [ ] `packages/core-engine/src/index.ts` — public API barrel export

### 1.3 Core Engine — Rules (derived from studies)
- [ ] `packages/core-engine/src/rules/loop-rules.ts` — 6 rules from Study 04 js-loop-detector
  - [ ] `loop/regex-in-loop`
  - [ ] `loop/json-parse-in-loop`
  - [ ] `loop/sequential-await`
  - [ ] `loop/nested-loops`
  - [ ] `loop/nested-array-methods`
  - [ ] `loop/chained-array-methods`
- [ ] `packages/core-engine/src/rules/memory-rules.ts` — 6 rules from Study 03 detectors
  - [ ] `memory/missing-effect-cleanup`
  - [ ] `memory/missing-event-removal`
  - [ ] `memory/missing-timer-cleanup`
  - [ ] `memory/missing-subscription`
  - [ ] `memory/missing-observer-disconnect`
  - [ ] `memory/missing-lifecycle-cleanup`
- [ ] `packages/core-engine/src/rules/index-rules.ts` — 4 rules from Study 05 prisma-index-detector
  - [ ] `index/missing-fk-index`
  - [ ] `index/missing-filter-index`
  - [ ] `index/missing-sort-index`
  - [ ] `index/missing-composite`
- [ ] `packages/core-engine/src/rules/index.ts` — barrel export + `getAllRules()`

### 1.4 Core Engine — Reporters
- [ ] `packages/core-engine/src/reporter/json-reporter.ts` — `.codeevolution/results.json`
- [ ] `packages/core-engine/src/reporter/markdown-reporter.ts` — `.codeevolution/hotspots.md`
- [ ] `packages/core-engine/src/reporter/console-reporter.ts` — colored terminal output
- [ ] `packages/core-engine/src/reporter/score.ts` — confidence score calculator → `.codeevolution/confidence-score.txt`
- [ ] `packages/core-engine/src/reporter/index.ts` — barrel export

### 1.5 CLI — Commands
- [ ] `packages/cli/src/index.ts` — Commander.js program setup
- [ ] `packages/cli/src/commands/analyze.ts` — `code-evolution analyze [path]`
- [ ] `packages/cli/src/commands/replay.ts` — `code-evolution replay [study]`
- [ ] `packages/cli/src/commands/baseline.ts` — `code-evolution baseline create|compare`
- [ ] `packages/cli/bin/code-evolution.js` — shebang entry point

### 1.6 Documentation (Phase 1)
- [ ] `packages/core-engine/README.md` — engine API docs
- [ ] `packages/cli/README.md` — CLI usage, examples, output format
- [ ] `docs/article-4k/article-draft.md` — Article #4K full content draft

### 1.7 Validation (Phase 1)
- [ ] Run `code-evolution analyze` against Study 04 real-world corpus repos
- [ ] Run `code-evolution analyze` against Study 03 sample repos
- [ ] Verify `.codeevolution/` output files are well-formed
- [ ] Verify `npx code-evolution` works from clean install
- [ ] Verify `code-evolution replay` can re-run Study 04 benchmarks

---

## Phase 2 — GitHub Action + Baseline System (Weeks 3–5)

### 2.1 Baseline Snapshot
- [ ] Implement `baseline create` in CLI → writes `.codeevolution/baseline.json`
- [ ] Implement `baseline compare` in CLI → reads baseline, diffs against current
- [ ] Define baseline.json schema (version, timestamp, issue hashes, summary)
- [ ] Implement issue hash function (stable across runs for same issue)

### 2.2 GitHub Action
- [ ] Create `packages/github-action/package.json`
- [ ] Create `packages/github-action/tsconfig.json`
- [ ] Create `packages/github-action/action.yml` — inputs, outputs, runs config
- [ ] `packages/github-action/src/index.ts` — action entry point
- [ ] `packages/github-action/src/pr-comment.ts` — PR comment markdown formatter
- [ ] `packages/github-action/src/diff-filter.ts` — filter issues to changed files only
- [ ] Bundle action with `ncc` for single-file distribution

### 2.3 Documentation (Phase 2)
- [ ] `packages/github-action/README.md` — usage, configuration, examples
- [ ] Update `packages/cli/README.md` with baseline commands
- [ ] Update root `README.md` with packages overview

### 2.4 Validation (Phase 2)
- [ ] Test GitHub Action on a sample PR in this repo
- [ ] Verify baseline create → modify code → baseline compare flow
- [ ] Verify diff-aware filtering only reports new issues
- [ ] Verify PR comment formatting

---

## Hypotheses

| ID | Hypothesis | Validation |
|----|-----------|------------|
| H1 | A single CLI unifying all study detectors is more useful than individual study scripts | Measure: repos analyzed, CLI usage frequency |
| H2 | Diff-aware CI integration increases adoption over full-scan-only | Measure: CI installations, false positive rate on PRs |
| H3 | Baseline comparison creates temporal intelligence that drives repeat usage | Measure: repeat runs, baseline.json commit frequency |
| H4 | Empirical speedup references in diagnostics increase fix rate | Measure: issues resolved after CLI report |

---

## Blockers & Dependencies

| Blocker | Status | Resolution |
|---------|--------|------------|
| Study 03 detectors require `@babel/parser` + `@babel/traverse` | Available | Include as core-engine dependency |
| Study 04 js-loop-detector uses Babel AST | Available | Port rules to core-engine |
| Study 05 prisma-index-detector uses regex + glob | Available | Port rules to core-engine |
| GitHub Action needs `@actions/core` + `@actions/github` | npm | Install in github-action package |
| `ncc` bundling for GitHub Action | npm | `@vercel/ncc` as devDependency |

---

## Messaging (from plan)

**Stop saying:** benchmarking, analysis, performance study

**Start saying:**
- regression intelligence
- structural diagnostics
- empirical guardrails
- evolution safety checks

**Category:** Evolution-Aware Static Analysis
