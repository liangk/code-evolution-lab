# Code Evolution Lab Web App

This Angular application is the browser-based interface for Code Evolution Lab. It is intended for contributors and teams that want a visual workflow on top of the project's analysis capabilities, rather than working only through the CLI and GitHub Action.

## What this app is for

The web app provides an interactive surface for the broader platform experience around Code Evolution Lab. Depending on the part of the repository you are working on, that can include:

- Reviewing analysis workflows in a browser instead of the terminal
- Connecting the UI to the backend API for interactive diagnostics
- Experimenting with contributor-facing dashboards and project views
- Validating frontend flows around repository analysis and reporting

If you only want to scan a codebase locally or in CI, use the published CLI in [`packages/cli`](../../packages/cli/README.md) or the GitHub Action in [`packages/github-action`](../../packages/github-action/README.md).

## Local development

### Prerequisites

- **Node.js** 18+
- **npm** 9+
- The backend API running locally if you are working on integrated flows

### Start the app

```bash
npm install
npm start
```

Open `http://localhost:8201/` in your browser.

The application reloads automatically when you modify source files.

## Recommended workflow

For full-stack local development:

1. Start the backend API from the repository's `backend` project
2. Start this Angular app with `npm start`
3. Use the browser UI to exercise the flows you are changing

## Common commands

```bash
# Start development server
npm start

# Create a production build
npm run build

# Run unit tests
npm test
```

Production builds are written to the app's `dist/` output directory.

## Project structure

| Path | Purpose |
|------|---------|
| `src/app/components/` | UI components and feature views |
| `src/app/services/` | API clients and frontend orchestration |
| `src/app/guards/` | Routing and access guards |
| `src/environments/` | Environment-specific configuration |

## When to update this README

Update this document when the web app's role changes significantly, especially if you add:

- New contributor workflows
- New backend dependencies or environment requirements
- New build, test, or preview commands
- New top-level feature areas worth documenting for other contributors

## Additional resources

- **Root project overview:** [`README.md`](../../README.md)
- **CLI documentation:** [`packages/cli/README.md`](../../packages/cli/README.md)
- **Docs index:** [`docs/README.md`](../../docs/README.md)
- **Angular CLI reference:** [angular.dev/tools/cli](https://angular.dev/tools/cli)
