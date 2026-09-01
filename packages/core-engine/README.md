# @code-evolution/core-engine

> Unified detection engine for empirical software diagnostics

`@code-evolution/core-engine` is the shared analysis package behind the `code-evolution-lab` CLI and the GitHub Action. It turns the research from [`liangk/empirical-study`](https://github.com/liangk/empirical-study) into reusable programmatic building blocks for scanning projects, generating reports, and comparing codebase health over time.

It is designed for teams that want the detection engine without coupling themselves to the CLI UX. If you want to embed empirical diagnostics into your own workflow, CI pipeline, internal platform, or developer tooling, this is the package that provides the underlying primitives.

## What this package provides

- **35 detection rules** derived from all 11 empirical studies
- **Babel AST analysis** for JavaScript/TypeScript patterns
- **Prisma schema analysis** for missing database indexes
- **Reporting** in JSON, Markdown, and console formats
- **Baseline system** for temporal comparison

## Why use the core engine directly?

- **Build custom workflows** — integrate diagnostics into your own scripts, editors, bots, or internal tooling
- **Reuse the report pipeline** — generate JSON, Markdown, and score outputs without reimplementing reporting logic
- **Control the analysis scope** — choose categories, severity thresholds, and registry composition programmatically
- **Extend the rule set** — register your own custom rules alongside the built-in empirical ones

## Who uses this package?

- **The CLI** uses it to scan local projects and write `.codeevolution/` output
- **The GitHub Action** uses it to analyze pull requests and compare against baselines
- **Custom integrations** can call it directly to build organization-specific diagnostics workflows

## Rule categories

| Category | What it covers | Origin |
|----------|----------------|--------|
| **N+1** | ORM/DB calls made once per loop iteration instead of a batched query | Study 01 — N+1 Query |
| **Blocking I/O** | Sync file, crypto, child-process, and DB calls that block the event loop | Study 02 — Blocking I/O |
| **Memory** | React/Vue/Angular cleanup issues, listener leaks, timer leaks, subscription leaks, observer leaks | Study 03 — Memory Leaks |
| **Loop** | Nested loops, sequential await, regex/JSON work inside loops, nested/chained array methods | Study 04 — Loop Performance |
| **Index** | Missing Prisma foreign-key, filter, sort, and composite indexes | Study 05 — Missing Index |
| **Resource** | Unclosed connections, streams, and file handles | Study 06 — Resource Leaks |
| **Bundle** | Heavy package imports and namespace imports that defeat tree-shaking | Study 07 — Bundle Bloat |
| **DOM** | DOM manipulation in loops, innerHTML XSS risk, document.write() | Study 08 — DOM Manipulation |
| **Payload** | Unbounded queries and unpaginated return payloads | Study 09 — Large Payloads |
| **ReDoS** | Regex patterns vulnerable to catastrophic backtracking | Study 10 — ReDoS |
| **Caching** | Repeated expensive calls and uncached API/DB calls in hot paths | Study 11 — Caching |

Every issue emitted by the engine carries rule metadata, severity, a recommendation, and research context such as `studyReference` and `empiricalSpeedup` when available.

## API

```typescript
import {
  RuleRegistry,
  getAllRules,
  analyzeDirectory,
  createBaseline,
  compareBaseline,
  writeJsonReport,
  writeMarkdownReport,
  writeScoreFile,
  printReport,
} from '@code-evolution/core-engine';

// Set up registry with all rules
const registry = new RuleRegistry();
registry.registerAll(getAllRules());

// Analyze a directory
const report = analyzeDirectory({
  targetPath: '/path/to/project',
  minSeverity: 'medium',
  categories: ['loop', 'memory'],
}, registry);

// Output
printReport(report);                          // Console
writeJsonReport(report, '.codeevolution');     // JSON file
writeMarkdownReport(report, '.codeevolution'); // Markdown file
writeScoreFile(report, '.codeevolution');       // Score file

// Baseline
const baseline = createBaseline(report);
// ... later ...
const diff = compareBaseline(baseline, newReport);
```

## Types

```typescript
interface DiagnosticIssue {
  id: string;
  rule: string;              // e.g. "loop/regex-in-loop"
  category: DiagnosticCategory;
  severity: Severity;
  file: string;
  line: number;
  title: string;
  description: string;
  snippet?: string;
  recommendation: string;
  studyReference?: string;   // e.g. "Study 04, BM-04"
  empiricalSpeedup?: string; // e.g. "64× at n=10,000"
  confidence: number;        // 0.0–1.0
}

type DiagnosticCategory =
  | 'n1' | 'blocking-io' | 'memory' | 'loop' | 'index'
  | 'resource' | 'bundle' | 'dom' | 'payload' | 'redos' | 'caching';
type Severity = 'critical' | 'high' | 'medium' | 'low';
```

## Custom Rules

```typescript
import { RuleDefinition, RuleRegistry } from '@code-evolution/core-engine';

const myRule: RuleDefinition = {
  id: 'custom/my-pattern',
  name: 'My Custom Pattern',
  category: 'loop',
  severity: 'high',
  filePatterns: ['*.ts', '*.js'],
  needsAst: false,
  detect(filePath, content) {
    const issues = [];
    // Your detection logic here
    return issues;
  },
};

const registry = new RuleRegistry();
registry.register(myRule);
```

## License

MIT
