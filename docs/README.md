# Code Evolution Lab Documentation

Welcome to the documentation index for **Code Evolution Lab**. This documentation covers the repository's public tooling, supporting packages, contributor workflows, and architecture notes for the empirical diagnostics platform built around [`liangk/empirical-study`](https://github.com/liangk/empirical-study).

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

Code Evolution Lab packages empirical software diagnostics into practical developer workflows. The documentation in this directory is meant to help contributors and users understand:

- What each package in the repository is responsible for
- How to run the CLI and GitHub Action effectively
- How the backend, frontend, and shared packages fit together
- Where to find architecture and reference material when modifying the codebase

### Key Features

| Feature | Description |
|---------|-------------|
| **CLI workflows** | Local analysis, baseline snapshots, regression comparison, and study replay |
| **GitHub Action workflows** | Pull request diagnostics with diff-aware reporting and baseline comparison |
| **Shared analysis engine** | Reusable rule registry, reporters, and temporal comparison primitives |
| **Architecture references** | Backend, frontend, and package-level structure documentation |
| **Research alignment** | Documentation that connects tooling behavior back to empirical-study methodology |

### Project Structure

```
code-evolution-lab/
├── apps/
│   └── web/                    # Angular web interface
├── backend/                    # Express.js API and legacy platform services
├── packages/                   # Public tooling packages
│   ├── core-engine/           # Shared detection engine + reporters
│   ├── cli/                   # Published npm CLI
│   ├── replay/                # Replayable benchmark suites
│   └── github-action/         # GitHub Action for PR diagnostics
└── docs/                      # Documentation index and references
```

### Quick Links

- **Repository**: [GitHub](https://github.com/liangk/code-evolution-lab)
- **CLI README**: [packages/cli/README.md](../packages/cli/README.md)
- **Core Engine README**: [packages/core-engine/README.md](../packages/core-engine/README.md)
- **GitHub Action README**: [packages/github-action/README.md](../packages/github-action/README.md)
- **License**: MIT
- **Author**: Ko-Hsin Liang

---

*Last updated: February 2026*
