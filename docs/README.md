# Code Evolution Lab Documentation

Welcome to the documentation for **Code Evolution Lab** — an AI-powered evolutionary code optimization platform that combines static code analysis with genetic algorithms to automatically detect performance issues and generate optimized solutions.

## Table of Contents

### Getting Started
- [Quick Start Guide](./getting-started/quick-start.md)
- [Installation Guide](./getting-started/installation.md)
- [Configuration Reference](./getting-started/configuration.md)

### Architecture
- [System Architecture](./architecture/system-architecture.md)
- [Database Schema](./architecture/database-schema.md)
- [Tech Stack](./architecture/tech-stack.md)

### Backend
- [Detectors](./backend/detectors.md)
- [Evolutionary Engine](./backend/evolutionary-engine.md)
- [Solution Generators](./backend/solution-generators.md)

### API Reference
- [REST API](./api/rest-api.md)
- [Authentication](./api/authentication.md)
- [Server-Sent Events](./api/sse.md)

### Frontend
- [Angular Application](./frontend/angular-app.md)
- [Components](./frontend/components.md)
- [Services](./frontend/services.md)

### Reference
- [Environment Variables](./reference/environment-variables.md)
- [CLI Commands](./reference/cli-commands.md)
- [Issue Type Catalog](./reference/issue-type-catalog.md)

---

## Overview

Code Evolution Lab is an intelligent code analysis platform that detects performance anti-patterns in JavaScript/TypeScript codebases and generates optimized solutions using evolutionary algorithms.

### Key Features

| Feature | Description |
|---------|-------------|
| **Deep Code Analysis** | AST-based detection of N+1 queries, memory leaks, inefficient loops, and more |
| **Evolutionary Solutions** | Genetic algorithms generate and evolve multiple solution candidates |
| **Fitness Scoring** | Solutions ranked by performance, complexity, and maintainability |
| **GitHub Integration** | Analyze entire repositories with OAuth authentication |
| **Real-time Progress** | Server-Sent Events for live evolution progress tracking |
| **Modern Web UI** | Angular 21 dashboard with real-time analysis visualization |

### Project Structure

```
code-evolution-lab/
├── apps/
│   └── web/                    # Angular 21 frontend application
├── backend/                    # Express.js API server
│   ├── src/
│   │   ├── api/               # REST API routes and middleware
│   │   ├── analyzer/          # Code parsing and analysis
│   │   ├── detectors/         # Issue detection modules
│   │   ├── generators/        # Solution generation with evolutionary algorithm
│   │   └── cli.ts             # Command-line interface
│   └── prisma/                # Database schema and migrations
├── packages/                   # Shared packages
│   ├── core-engine/           # Unified detection engine
│   ├── cli/                   # Published CLI tool
│   ├── replay/                # Benchmark replay framework
│   └── github-action/         # GitHub Action for CI/CD
└── docs/                      # Documentation
```

### Quick Links

- **Repository**: [GitHub](https://github.com/liangk/code-evolution-lab)
- **License**: MIT
- **Author**: Ko-Hsin Liang

---

*Last updated: February 2026*
