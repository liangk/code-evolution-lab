# Changelog

All notable changes to `code-evolution-lab` and `@code-evolution/core-engine`.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-09-21

`@code-evolution/core-engine` is now published on its own, the index rules
have been rewritten, and the CLI can suggest rewrites.

### Upgrading

The index rules report different findings from 1.2.x — most of the old
ones were wrong, and some genuine ones were missed. A baseline taken with
1.2.x will show index findings appearing and disappearing on `compare` that
have nothing to do with your code. Take a new baseline after upgrading.

### Added

- `@code-evolution/core-engine` as a standalone package, for using the
  detection engine without the CLI. It exports `parseSchema` and
  `foreignKeyCoverage` for Prisma schema analysis on its own.
- `--solutions` on `analyze`, generating a suggested rewrite for each finding
  and writing it into `results.json`. The solution generation layer moved into
  the core engine from the backend, so the CLI and the API now produce the same
  suggestions from the same code.
- `DiagnosticIssue.codeBefore` — the whole problematic construct (the loop
  body, the effect) rather than only the reported line. Solution generators
  transform this, so the suggestion comes back carrying your own variable
  names.
- `results.json` now carries a `metrics` object: denominators from the rules
  that ran, such as `index.foreignKeys` and `index.querySitesExamined`. A
  finding count on its own cannot say how common something is — one unindexed
  foreign key reads differently against three than against three hundred.
- Optional `reset()` and `metrics()` hooks on `RuleDefinition`, for rules that
  accumulate state across files.

### Changed

- **The index rules were rewritten.** On a real Prisma project they produced 31
  findings of which roughly 26 were wrong, and missed the one foreign key that
  genuinely had no index. Four causes, all now handled:

  - `@@unique` was never parsed. The line matcher required a word character
    where `@` sits, so a composite unique — which Postgres implements as a real
    index — was invisible, and every query it served was reported as unindexed.
  - Composite indexes marked every column as independently indexed.
    `@@index([projectId, createdAt])` cannot serve `WHERE createdAt = x`; only
    a leading column is usable alone. Index coverage is now modelled as ordered
    column lists, and a multi-field filter is checked as a set before its
    fields are checked individually.
  - Foreign keys were guessed from the field name (`/Id$/` plus a String or Int
    type) rather than read from `@relation(fields: [...])`, which is the
    declaration. A `BigInt` foreign key was therefore invisible — that was the
    missed one.
  - Query call sites were matched with a line regex over a ten-line window.
    `where:\s*\{([^}]+)\}` stops at the first `}`, so operators like `in`,
    `gte` and `lt` leaked into the field list, Prisma's compound-key selector
    `projectId_email` was read as a column, and a window starting at one query
    picked up the `where` of the next — reporting one model's fields against
    another model's name. Query analysis is now AST-based.

- `index/missing-sort-index` moved from the schema to the query rules. It used
  to report every field named `createdAt` or `updatedAt` on the theory that
  they are "commonly used in orderBy", having looked at no query at all. It now
  reports only where an `orderBy` actually appears in code.

- `index/missing-fk-index` no longer reports foreign keys on models marked
  `@@ignore`. Prisma leaves those out of its own model list — they are
  typically introspected tables Prisma Client cannot use — so their foreign
  keys were never Prisma's to index, and reporting them was noise.

- Five code paths in the solution generators that always reported success were
  fixed or dropped rather than ported as they were. Three were in the
  transformer: `transformLoopQueryToBatch` and `transformMemoize` prepended a
  comment header to unchanged code, and `transformBatchMethodCalls` emitted
  code referencing a variable it never declared. Two more were in the N+1
  generator's own include strategies, which fell back to a literal `'Model'`
  when no model name could be found and produced a template about a fictional
  `Model.findAll({ include: [] })` with the reader's code pasted into a comment
  block underneath. Scanning outline gave 25 of its 27 findings one of those.
  Both strategies now require real names — a Prisma model with at least one
  relation, or two Sequelize models — and return nothing otherwise.
- The N+1 generator no longer falls back to emitting a pattern-analysis
  comment block when no transformation applies. It returns nothing instead.
  Findings with no applicable rewrite now carry no `solutions` key at all; on
  outline that is 4 of 27.

### Fixed

- `results.json` reported `"version": "1.0.0"` whatever version produced it.
  The version was a literal in the engine that had not been touched since
  1.0.0, so no result from 1.2.x could say which rules it came from. It is now
  read from the package.
- The index rules depended on `schema.prisma` being scanned before the files
  that query it, which was decided by directory order. On a project laid out
  with `src/` ahead of `prisma/`, every query-level index rule silently found
  nothing — no error, no warning, zero findings. Schema files are now sorted
  first, and rules can declare a `reset` hook so accumulated state cannot leak
  between scans of different projects.
- The Prisma schema parser now agrees with Prisma's own on every one of 2,961
  public schemas and all 90,029 of their foreign keys — same models, same
  foreign keys, same index coverage — checked by running both over a corpus
  collected from GitHub. The cross-check found six shapes the parser
  misread, all valid Prisma:
  - `@@index(field)` without brackets was ignored, so the field was reported
    as unindexed.
  - Fields at column 0, with no indentation, were not read at all.
  - A commented-out `// @@index([field])` was read as a real index, hiding an
    unindexed foreign key.
  - Models inside a `/* */` block comment were read as live.
  - `}model Next {` on one line lost the second model entirely.
  - `fields : [x]`, with a space before the colon, was not recognised as a
    foreign key.

  Three of those dropped foreign keys silently rather than misreporting
  them, which is why no amount of spot-checking findings would have caught
  them: a key that is never counted never appears in the output to be checked.

### Note

The two include strategies passed every unit test before the fix. They were
only caught by running the scanner against a real repository and asking why
one strategy fired 25 times out of 27. The index rules were the same story at
larger scale. Unit tests check the paths you thought of; a corpus scan checks
the ones you didn't.

## [1.2.1] - 2026-09-20

Rule calibration. Every change here came from running the scanner against its
own source: 62 findings and a score of 0 on 21 files, most of them wrong.

### Changed

- **`payload/unbounded-query` and `payload/large-return`** no longer match on
  method name alone. The rule matched `find`, `findAll` and `findMany` with
  nothing to corroborate them, so `Array.prototype.find` and `Map` lookups were
  reported as unbounded database queries. Both rules now go through the shared
  database-call heuristics: distinctive ORM method names count on their own,
  ambiguous ones need an ORM import, a query-builder chain, a database handle
  or a data-access receiver. Single-record finders (`findUnique`) are no longer
  reported at all — they are database calls, but a payload rule is about rows
  coming back.
- **`loop/regex-in-loop`** was reporting every regex in a loop as `high` with
  the description "Regex is recompiled on every iteration". That is not what
  happens: V8 caches the compiled pattern per literal site, which is why the
  measured cost is 1.03x. Regex literals and `new RegExp()` with a fixed
  pattern are now `low`; `new RegExp()` with a pattern computed from loop data
  is `medium`, because that one genuinely recompiles and cannot be hoisted. The
  reported measurement no longer cites a CPython number in a JavaScript tool.
- **`redos/dangerous-pattern`** scored regex *complexity* — two points per
  quantifier, two per group, three per alternation branch, report above ten.
  That measures length, not backtracking: a flat anchored alternation like
  `/^(chunk|batch|partition)$/` scored 17 and was reported as a ReDoS
  vulnerability despite matching in linear time. The rule now reports only the
  three structures that actually backtrack — a nested quantifier, two unbounded
  quantifiers over the same character class, or alternation inside a quantified
  group. `str.split(',')` and `str.replace('a', 'b')` are no longer treated as
  regex operations.
- **`blocking-io/sync-file-operation`** had its severity ladder inverted: being
  inside a loop outranked being inside a request handler, so a CLI walking a
  directory tree with `statSync` scored `critical`. Handler context now
  dominates, and findings in a file with no sign of belonging to a server (no
  server framework import, no `(req, res)` handler) are reported at `low` with
  low confidence — synchronous fs is usually the right call in a CLI or build
  script.
- **`blocking-io/sync-crypto-operation`** no longer reports `createHash` or
  `createHmac`. Constructing a hash object does no work. `randomBytes` is now
  `low` and is skipped entirely when called with a callback; the key-derivation
  functions remain the ones worth flagging.

### Added

- `rules/db-call-heuristics.ts` — the shared "is this actually a database call"
  logic, extracted so the N+1 and payload rules cannot drift apart. Adding a
  rule that identifies database calls by method name means using this module.
- A warning when a scan matches zero files. Previously that case printed
  "No issues found" and a score of 100, which is indistinguishable from a clean
  codebase and is what a mistyped path or a `dist`-only package looks like.

## [1.2.0] - 2026-09-20

The N+1 query detector from the [empirical
study](https://stackinsight.dev/blog/n-plus-1-query-detection-story) replaces
the original implementation, and the confidence score becomes usable on real
codebases.

### Changed

- **BREAKING:** `calculateScore(issues)` is now
  `calculateScore(issues, filesScanned)`. The score is penalty *density* rather
  than an absolute penalty, which saturated at zero after roughly twenty-five
  high-severity findings. Every non-trivial project scored 0, and because both
  sides of a baseline comparison clamped to 0, `compare` could never detect
  improvement — its CI guard never fired. Delete any `baseline.json` written by
  an earlier version; the stored scores are not comparable.
- **`n1/query-in-loop`** is the detector from the study, replacing one that
  matched any of a flat list of method names inside any loop. That version had
  a 60.3% false-positive rate on three repositories and 88.6% across twenty
  more, and could not see write-side N+1s at all because its method list held
  only readers. Seven rounds of corpus work produced: distinctive and ambiguous
  method names, hard vetoes for `Map.get()` / `Array.find(cb)` / `Promise.all`,
  innermost-loop attribution, and skips for retry loops, pagination loops,
  pre-chunked batches, bulk flushes and fallback chains. Re-scanning outline,
  cal.com and immich reproduces the published counts exactly: 27, 7 and 8
  findings with identical line numbers.
- **`loop/nested-loops`** reported any loop inside another loop as `high`.
  Walking a tree — `for (const child of node.children)` inside
  `for (const node of nodes)` — is linear in the total number of elements, not
  quadratic, and it is how most recursive structures get traversed. The rule
  now reports only a cross product: an inner loop whose collection does not
  derive from the outer loop variable. Severity is `medium` at depth 2 and
  `high` at depth 3 or more.
- Test and spec files are excluded from scans by default, along with
  `__tests__`, `__mocks__` and `e2e` directories. A deliberate anti-pattern in
  a fixture is not a finding, and counting test files skews the score against
  well-tested codebases.

### Added

- `analyze`, `scan` and `compare` accept multiple directories, for a scope made
  of sibling directories such as `server/{routes,commands,queues}`. Reported
  paths stay relative to the current directory so they read the same as a
  single-directory scan.
- Glob patterns are rejected with an explanation instead of being silently
  swallowed by the argument parser and scanning the current directory instead.
- A warning when the scan path is inside `node_modules`. The walker skips
  `node_modules` as a child directory, but that does nothing when the scan
  *starts* inside one.
- A warning when `compare` runs against a different path than the one the
  baseline was taken from, which otherwise produces a meaningless diff.

### Fixed

- `@code-evolution/replay` was pinned to `1.0.0` in the CLI's dependencies
  while the workspace had moved to `1.2.0`, so npm treated it as an external
  package and failed to resolve it from the registry.

[Unreleased]: https://github.com/liangk/code-evolution-lab/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/liangk/code-evolution-lab/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/liangk/code-evolution-lab/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/liangk/code-evolution-lab/compare/v1.1.0...v1.2.0
