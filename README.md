# Code Evolution Lab

<p align="center">
  <strong>AI-Powered Evolutionary Code Optimization Platform</strong>
</p>

<p align="center">
  Detect performance anti-patterns and generate optimized solutions using genetic algorithms.
</p>

---

## Overview

Code Evolution Lab is an intelligent code analysis platform that combines **static code analysis** with **evolutionary algorithms** to automatically detect performance issues in JavaScript/TypeScript codebases and generate optimized solutions.

### Key Features

| Feature | Description |
|---------|-------------|
| **Deep Code Analysis** | AST-based detection of N+1 queries, memory leaks, inefficient loops, and more |
| **Evolutionary Solutions** | Genetic algorithms generate and evolve multiple solution candidates |
| **Fitness Scoring** | Solutions ranked by performance, complexity, and maintainability |
| **GitHub Integration** | Analyze entire repositories with OAuth authentication |
| **Real-time Progress** | Server-Sent Events for live evolution progress tracking |
| **Modern Web UI** | Angular 21 dashboard with real-time analysis visualization |
| **CLI Tool** | Analyze code directly from the terminal |

## Quick Start

### Prerequisites

- **Node.js** 18+ (recommended: 20+)
- **PostgreSQL** 14+
- **npm** 9+

### 1. Clone and Install

```bash
git clone https://github.com/liangk/code-evolution-lab.git
cd code-evolution-lab
```

### 2. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your database credentials
npm run prisma:migrate
npm run start:api
```

### 3. Frontend Setup

```bash
cd apps/web
npm install
npm start
```

Access the application at `http://localhost:8201`.

### 4. Using the CLI

```bash
cd backend
npm run analyze -- ./src/**/*.ts --solutions
```

## Project Structure

```
code-evolution-lab/
├── apps/
│   └── web/                    # Angular 21 frontend
│       ├── src/
│       │   ├── app/
│       │   │   ├── components/ # UI components
│       │   │   ├── services/   # API services
│       │   │   └── guards/     # Route guards
│       │   └── environments/   # Environment configs
│       └── angular.json
│
├── backend/                    # Express.js API server
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
├── packages/                   # Shared packages
│   ├── core-engine/           # Unified detection engine
│   ├── cli/                   # Published CLI tool
│   ├── replay/                # Benchmark replay framework
│   └── github-action/         # GitHub Action for CI/CD
│
└── docs/                      # Documentation
    ├── getting-started/
    ├── architecture/
    ├── backend/
    ├── api/
    ├── frontend/
    └── reference/
```

## Detectors

Code Evolution Lab includes four main detectors:

| Detector | Issues Detected |
|----------|-----------------|
| **N+1 Query** | Database queries inside loops |
| **Inefficient Loop** | Nested loops, regex in loops, JSON operations, sequential awaits |
| **Memory Leak** | Event listeners, timers, closures without cleanup |
| **Large Payload** | Excessive API responses, SELECT * queries |

## Evolutionary Algorithm

The evolutionary engine optimizes solutions through:

1. **Initial Population** — Generate solution candidates from detected issues
2. **Fitness Evaluation** — Score solutions on performance, code preservation, validity
3. **Selection** — Tournament selection based on fitness
4. **Crossover** — Combine strategies from different solutions
5. **Mutation** — Apply random code transformations
6. **Iteration** — Evolve over multiple generations

Configure via environment variables:

```env
EVO_POPULATION_SIZE=20
EVO_MAX_GENERATIONS=10
EVO_MUTATION_RATE=0.3
EVO_CROSSOVER_RATE=0.7
```

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
