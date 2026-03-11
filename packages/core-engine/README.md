# @code-evolution/core-engine

> Unified detection engine for empirical software diagnostics

`@code-evolution/core-engine` is the shared analysis package behind the `code-evolution-lab` CLI and the GitHub Action. It turns the research from [`liangk/empirical-study`](https://github.com/liangk/empirical-study) into reusable programmatic building blocks for scanning projects, generating reports, and comparing codebase health over time.

It is designed for teams that want the detection engine without coupling themselves to the CLI UX. If you want to embed empirical diagnostics into your own workflow, CI pipeline, internal platform, or developer tooling, this is the package that provides the underlying primitives.

## What this package provides

- **16 detection rules** derived from 5 empirical studies
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
| **Loop** | Nested loops, sequential await, regex/JSON work inside loops, nested/chained array methods | Study 04 — Loop Performance |
| **Memory** | React/Vue/Angular cleanup issues, listener leaks, timer leaks, subscription leaks, observer leaks | Study 03 — Memory Leaks |
| **Index** | Missing Prisma foreign-key, filter, sort, and composite indexes | Study 05 — Missing Index |

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

type DiagnosticCategory = 'loop' | 'memory' | 'index';
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
