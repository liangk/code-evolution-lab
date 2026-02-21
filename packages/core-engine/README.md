# @code-evolution/core-engine

> Unified detection engine for empirical software diagnostics

The core engine powers the `code-evolution` CLI and GitHub Action. It provides:

- **16 detection rules** derived from 5 empirical studies
- **Babel AST analysis** for JavaScript/TypeScript patterns
- **Prisma schema analysis** for missing database indexes
- **Reporting** in JSON, Markdown, and console formats
- **Baseline system** for temporal comparison

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
