# Code Evolution Lab — packages

The npm-distributed half of the project. Most users reach the tool through
`code-evolution-lab` on npm; the backends serve the API and a small number of
direct users.

```
core-engine/    detection rules, solution generators, scoring  — published as @code-evolution/core-engine
cli/            the code-evolution-lab command                 — published as code-evolution-lab
replay/         benchmark suites from the empirical studies    — not published, bundled into the CLI
github-action/  CI wrapper
```

## core-engine is the source of truth for detection

**All detector and solution work goes into `core-engine/src/` and nowhere
else.** The two backends — `code-evolution-lab/backend` and
`code-evolution-lab-private/backend` — are frozen for rule changes. They keep
serving the API from their own copies until core-engine has all eleven
detectors and all eleven solution generators, and only then get switched over
in one pass.

This is deliberate, and the alternative was tried. The same detection logic
lived in three places — both backends and core-engine — and it drifted
silently. A fix would land in one copy and not the others, with nothing failing
to signal it. The divergence was per-file rather than per-repo, so neither
backend was simply "the newer one":

- the N+1 detector was newer in the public backend, because that is what ran
  the published study
- `inefficient-loop-solution-generator.ts` was 44 KB in private and 10 KB in
  public
- the private backend had all eleven solution generators; the public one had
  four

Until the switch-over, the backends run uncalibrated rules. That is a known,
accepted cost: the API has few users, and merging three ways later costs more
than the backends being behind now.

### What this means in practice

- A rule fix, a new veto, a severity change, a new detector: `core-engine/src/rules/`
- A solution generator: `core-engine/src/solutions/`
- Shared heuristics used by more than one rule: `core-engine/src/rules/shared/`
  or a named module like `rules/db-call-heuristics.ts`
- Do **not** port the change back to either backend. Let them sit.

## Adding or calibrating a detector

The N+1 detector took seven rounds to get from a 60.3% false-positive rate to
0.5%. What made it work, in order:

1. **Self-scan first.** Run the detector against real code you know — this
   repository, your own projects — before running any corpus. Scanning
   `core-engine/src` produced 62 findings on 21 files and caught four broken
   rules in an afternoon. Every one of them had passed its unit tests.
2. **Reduce each false positive to a test case.** One entry in
   `__tests__/<category>-rules.test.ts`, with a `source` field naming the
   repository and file it came from. That file becomes the record of why each
   veto exists, and it is what lets you rewrite the rule later without fear.
3. **Only then run the corpus.**

### The principle behind every fix so far

> An ambiguous signal needs corroboration before it is reported.

A method name, a regex's length, a function's name — none of these are
evidence on their own. Four rules were wrong in exactly this way:

| Rule | Reported on | Now requires |
|---|---|---|
| `n1/query-in-loop` | any method named `find`, `get`, `query` | an ORM import, a query-builder chain, a database handle, or a data-access receiver |
| `payload/unbounded-query` | same, independently | the same shared heuristics |
| `redos/dangerous-pattern` | a high complexity score | a structure that actually backtracks |
| `blocking-io/sync-file-operation` | the method name `statSync` | context — is there an event loop to block? |

Solution generators have their own version of this failure. Five code paths
reported `success: true` while producing nothing usable: comment headers
prepended to unchanged code, code referencing undeclared variables, templates
about a fictional `Model.findAll()`. **A generator that cannot produce a real
rewrite must return nothing.** Saying nothing is a valid answer; a suggestion
that cannot be applied is worse than silence.

## Denominators

A rule can declare a `metrics()` hook returning namespaced counters, which the
engine collects after each scan into `results.json` under `metrics`. This is
not optional detail for an application report: a finding count alone cannot
answer "how common is this?", and prevalence is the question those reports
exist to answer. One unindexed foreign key reads very differently against
three than against three hundred.

```json
"metrics": {
  "index.models": 8,
  "index.explicitIndexes": 8,
  "index.foreignKeys": 8,
  "index.foreignKeysIndexed": 7,
  "index.querySitesExamined": 56
}
```

Two conventions worth keeping:

**Derive the counter from the same data the rule reports from, not from a
tally kept alongside it.** The foreign-key figures above are computed by
walking the parsed models at the end of the scan, so "examined minus indexed"
and "findings reported" cannot disagree. A separate counter drifts the first
time someone changes the detection logic and forgets it.

**Count what the author chose, not what the framework created.**
`index.explicitIndexes` counts `@@index` and nothing else. Primary keys and
unique constraints also create real indexes and coverage checks must honour
them — but including them in the metric would report eight indexes for a
schema where nobody added one, because eight models have eight primary keys.
A denominator that flatters the subject is not a denominator.

## Build order

`cli` resolves core-engine's types from `core-engine/dist`, so a change to
`core-engine/src` is invisible to the CLI until core-engine is built.
`tsc --noEmit` does not emit, which is the most common way to waste ten
minutes here:

```bash
cd packages
npm install
npm run build:core
npm test --workspace=core-engine
npm run build
```

## Releasing

Versions are bumped across all four workspace packages together —
`core-engine`, `cli`, `replay` and `github-action` — **and every workspace
dependency pin must be bumped to match**: two in `cli/package.json`, one in
`github-action/package.json`. Missing one of those has broken a release twice
(1.2.0: the `replay` pin in `cli`; 1.3.0: the `core-engine` pin in
`github-action`). Before `npm install`, this should print nothing:

```bash
v=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' core-engine/package.json | head -1)
grep -rn '"@code-evolution/' --include=package.json cli core-engine replay github-action \
  | grep -v '"name"' | grep -vF "\"$v\""
```

It reads the version with `sed` rather than `node`: on Git Bash, `node` is
often aliased to `winpty node`, which refuses to run inside `$( )` and fails
with `stdin is not a tty`.

`npm version --workspaces` does not touch them, and a stale pin makes
npm treat the workspace package as an external one and fail to resolve it from
the registry. Regenerate `package-lock.json` afterwards or `npm ci` will read
the old resolution.

```bash
npm publish --dry-run --workspace=cli   # check the tarball before tagging
git commit -am "release: x.y.z" && git push
git tag vx.y.z && git push origin vx.y.z
```

Tag after pushing the commit. Publishing runs from CI with provenance, so a
local `npm publish` will fail.
