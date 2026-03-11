# Code Evolution Lab

<p align="center">
  <strong>Research-backed empirical diagnostics for JavaScript and TypeScript codebases</strong>
</p>

<p align="center">
  Detect performance anti-patterns, track regressions over time, and reproduce the benchmark evidence behind every rule.
</p>

---

## Overview

Code Evolution Lab is a monorepo for the public tooling around empirical software diagnostics. It packages the research from [`liangk/empirical-study`](https://github.com/liangk/empirical-study) into practical developer tools: a CLI for local analysis, a GitHub Action for pull request checks, a reusable core engine, and replayable benchmark suites for reproducibility.

The project focuses on performance patterns that have been studied empirically rather than stylistic lint rules. Today the public packages cover three rule families:

- **Loop performance anti-patterns** — nested loops, sequential await, repeated regex/JSON work inside loops
- **Memory leak patterns** — missing cleanup in React, Vue, Angular, timers, listeners, and subscriptions
- **Missing Prisma indexes** — foreign-key, filter, sort, and composite index gaps

### Key Features

| Feature | Description |
|---------|-------------|
| **CLI diagnostics** | Run `code-evolution-lab analyze`, `scan`, `compare`, and `replay` locally |
| **Evidence-backed rules** | Findings are derived from completed empirical studies, controlled benchmarks, and corpus scans |
| **Temporal comparison** | Capture a baseline snapshot and fail CI if code health regresses |
| **GitHub integration** | Post diff-aware diagnostics on pull requests with the GitHub Action |
| **Reusable core engine** | Programmatic API for custom analysis workflows and reporting |
| **Replayable studies** | Re-run the underlying benchmark suites locally to inspect the evidence yourself |
| **Web interface** | Angular-based UI for interactive workflows and project visualization |

## Quick Start

### For CLI users

```bash
# Analyze the current project
npx code-evolution-lab analyze .

# Capture a baseline snapshot before refactoring
npx code-evolution-lab scan

# Compare after changes to catch regressions
npx code-evolution-lab compare
```

See [`packages/cli/`](./packages/cli/README.md) for full CLI documentation.

### For repository contributors

#### Prerequisites

- **Node.js** 18+ (recommended: 20+)
- **PostgreSQL** 14+
- **npm** 9+

#### 1. Clone and Install

```bash
git clone https://github.com/liangk/code-evolution-lab.git
cd code-evolution-lab
```

#### 2. Install workspace dependencies

```bash
npm install
```

#### 3. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your database credentials
npm run prisma:migrate
npm run start:api
```

#### 4. Frontend Setup

```bash
cd apps/web
npm install
npm start
```

Access the application at `http://localhost:8201`.

#### 5. Using the packaged CLI from this monorepo

```bash
cd packages/cli
npm run build
node bin/code-evolution-lab.js analyze ../..
```

## Project Structure

```
code-evolution-lab/
├── apps/
│   └── web/                    # Angular UI for interactive workflows
│       ├── src/
│       │   ├── app/
│       │   │   ├── components/ # UI components
│       │   │   ├── services/   # API services
│       │   │   └── guards/     # Route guards
│       │   └── environments/   # Environment configs
│       └── angular.json
│
├── backend/                    # Express.js API server and legacy platform services
│   ├── src/
│   │   ├── api/               # REST API routes
│   │   ├── analyzer/          # Code parsing (Babel AST)
│   │   ├── detectors/         # Issue detection
│   │   │   ├── n1-query-detector.ts
│   │   │   ├── inefficient-loop-detector.ts
│   │   │   ├── memory-leak-detector.ts
│   │   │   └── large-payload-detector.ts
│   │   ├── generators/        # Solution generation
│   │   │   ├── evolutionary-engine.ts
│   │   │   ├── fitness-calculator.ts
│   │   │   └── mutation-operators.ts
│   │   └── cli.ts             # Command-line interface
│   └── prisma/                # Database schema
│
├── packages/                  # Public tooling packages
│   ├── core-engine/           # Shared detection engine + reporters + baseline logic
│   ├── cli/                   # Published npm CLI: code-evolution-lab
│   ├── replay/                # Reproducible benchmark studies
│   └── github-action/         # Pull request diagnostics action
│
└── docs/                      # Documentation
    ├── getting-started/
    ├── architecture/
    ├── backend/
    ├── api/
    ├── frontend/
    └── reference/
```

## Public packages

| Package | What it is for |
|---------|----------------|
| [`packages/cli`](./packages/cli/README.md) | Local project analysis, baseline snapshots, regression comparison, and study replay |
| [`packages/core-engine`](./packages/core-engine/README.md) | Programmatic detection engine for custom tooling and integrations |
| [`packages/github-action`](./packages/github-action/README.md) | Diff-aware pull request diagnostics in GitHub Actions |
| `packages/replay` | Bundled benchmark suites that reproduce the empirical study workloads |

## Why this repository exists

This repository connects three layers that are often separate in tooling projects:

1. **Empirical research** — benchmark studies and corpus analysis in `liangk/empirical-study`
2. **Detection engine** — reusable rules and reporting in `@code-evolution/core-engine`
3. **Developer workflows** — CLI, GitHub Action, replay tooling, and web UI

The goal is to help developers answer practical questions with evidence:

- Which patterns in this codebase have measurable performance cost?
- Did this refactor improve things or introduce regressions?
- Can I reproduce the benchmark that justified this rule?

## API

### Analyze Code

```http
POST /api/analyze
Content-Type: application/json

{
  "code": "async function fetchUsers() { ... }",
  "generateSolutions": true
}
```

### Response

```json
{
  "success": true,
  "score": 72.5,
  "totalIssues": 5,
  "results": [
    {
      "detectorName": "n1-query-detector",
      "issues": [
        {
          "type": "n_plus_1_query",
          "severity": "critical",
          "title": "N+1 Query detected",
          "solutions": [...]
        }
      ]
    }
  ]
}
```

## Documentation

Full documentation available in [`/docs`](./docs/README.md):

- [Quick Start Guide](./docs/getting-started/quick-start.md)
- [Installation](./docs/getting-started/installation.md)
- [Configuration](./docs/getting-started/configuration.md)
- [System Architecture](./docs/architecture/system-architecture.md)
- [REST API Reference](./docs/api/rest-api.md)
- [CLI Commands](./docs/reference/cli-commands.md)
- [Issue Type Catalog](./docs/reference/issue-type-catalog.md)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Angular 21, TypeScript, SCSS |
| Backend | Express.js, TypeScript, Prisma |
| Database | PostgreSQL |
| Code Analysis | Babel Parser, AST Traversal |
| Authentication | JWT, OAuth (Google, GitHub) |

## Deployment

### Frontend (Netlify)

```bash
cd apps/web
npm run build
# Deploy dist/web/browser to Netlify
```

### Backend (Railway)

The project includes `railway.toml` for easy deployment:

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm run start:api"
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Submit a Pull Request

## License

MIT License — see [LICENSE](./LICENSE) for details.

## Author

**Ko-Hsin Liang**

- GitHub: [@liangk](https://github.com/liangk)

---

<p align="center">
  <sub>Built with ❤️ for better code performance</sub>
</p>
