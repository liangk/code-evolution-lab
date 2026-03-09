# CLI Commands

Command-line interface for Code Evolution Lab.

## Overview

The CLI allows you to analyze code directly from the terminal without running the web UI.

## Installation

### From Backend Directory

```bash
cd backend
npm install
npm run build
```

### Run Analysis

```bash
npm run analyze -- <file-or-pattern> [options]
```

Or directly with Node:

```bash
node dist/cli.js <file-or-pattern> [options]
```

## Commands

### Analyze Files

```bash
code-evolution-lab <file-or-pattern> [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<file-or-pattern>` | File path or glob pattern (e.g., `src/**/*.ts`) |

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--solutions` | Generate solution suggestions | `false` |
| `--ignore <pattern>` | Add ignore pattern (repeatable) | See below |
| `--concurrency <n>` | Parallel file processing | `4` |
| `--min-severity <s>` | Minimum severity to report | `low` |
| `--format <fmt>` | Output format: `text`, `json`, `sarif` | `text` |
| `--output, -o <file>` | Write results to file | stdout |
| `--fail-on <s>` | Exit 1 if issues at severity | `low` |

**Default Ignore Patterns:**
- `**/node_modules/**`
- `**/dist/**`
- `**/build/**`
- `**/.git/**`

## Examples

### Basic Analysis

```bash
# Analyze single file
npm run analyze -- ./src/index.ts

# Analyze all TypeScript files
npm run analyze -- "src/**/*.ts"

# Analyze with glob pattern
npm run analyze -- "src/**/*.{ts,js}"
```

### With Solutions

```bash
# Generate solutions for detected issues
npm run analyze -- ./src/service.ts --solutions
```

### Output Formats

```bash
# Text output (default)
npm run analyze -- ./src/**/*.ts

# JSON output
npm run analyze -- ./src/**/*.ts --format json

# SARIF output (for IDE integration)
npm run analyze -- ./src/**/*.ts --format sarif -o report.sarif
```

### Filtering

```bash
# Only show high and critical issues
npm run analyze -- ./src/**/*.ts --min-severity high

# Ignore test files
npm run analyze -- ./src/**/*.ts --ignore "**/*.test.ts" --ignore "**/*.spec.ts"
```

### CI Integration

```bash
# Fail CI if any critical issues found
npm run analyze -- ./src/**/*.ts --fail-on critical

# Fail if high or critical issues found
npm run analyze -- ./src/**/*.ts --fail-on high
```

## Output Formats

### Text Format

```
╔════════════════════════════════════════════════════════════╗
║              Code Evolution Lab - Analysis Report           ║
╠════════════════════════════════════════════════════════════╣
║ Files analyzed: 42                                          ║
║ Total issues: 12                                            ║
║ Score: 76/100                                               ║
╚════════════════════════════════════════════════════════════╝

━━━ CRITICAL (1) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[n_plus_1_query] src/services/user-service.ts:45
  N+1 Query detected in loop
  
  Database query inside for-of loop will execute N+1 queries
  for N items. Consider using batch query with IN clause.
  
  ┌─ Code Before ─────────────────────────────────────────────
  │ for (const user of users) {
  │   const orders = await db.orders.findMany({
  │     where: { userId: user.id }
  │   });
  │ }
  └───────────────────────────────────────────────────────────

━━━ HIGH (3) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
...
```

### JSON Format

```json
{
  "version": "1.0.0",
  "timestamp": "2026-02-22T10:00:00Z",
  "summary": {
    "filesAnalyzed": 42,
    "totalIssues": 12,
    "score": 76,
    "bySeverity": {
      "critical": 1,
      "high": 3,
      "medium": 5,
      "low": 3
    }
  },
  "files": [
    {
      "filePath": "src/services/user-service.ts",
      "results": [
        {
          "detectorName": "n1-query-detector",
          "issues": [
            {
              "type": "n_plus_1_query",
              "severity": "critical",
              "lineNumber": 45,
              "title": "N+1 Query detected in loop",
              "description": "...",
              "codeBefore": "...",
              "solutions": [...]
            }
          ]
        }
      ]
    }
  ]
}
```

### SARIF Format

SARIF (Static Analysis Results Interchange Format) for IDE integration:

```json
{
  "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
  "version": "2.1.0",
  "runs": [
    {
      "tool": {
        "driver": {
          "name": "Code Evolution Lab",
          "version": "1.0.0"
        }
      },
      "results": [...]
    }
  ]
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success, no issues matching `--fail-on` |
| `1` | Issues found matching `--fail-on` severity |
| `2` | CLI error (invalid arguments, file not found) |

## Configuration File

Create `.codeevolutionrc.json` in project root:

```json
{
  "detectors": {
    "n1Query": { "enabled": true },
    "inefficientLoop": { "enabled": true },
    "memoryLeak": { "enabled": true },
    "largePayload": { "enabled": true }
  },
  "ignore": [
    "**/node_modules/**",
    "**/dist/**",
    "**/*.test.ts"
  ]
}
```

The CLI automatically reads this configuration.
