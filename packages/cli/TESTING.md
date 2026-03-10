# Local Testing Guide for code-evolution-lab CLI

## Before Publishing to npm

Follow these steps to test the CLI package locally before publishing:

### 1. Build All Packages

```bash
# From repo root
cd packages
npm install
npm run build
```

Note: `code-evolution-lab` bundles the internal `core-engine` and `replay` workspace packages into the published tarball, so they must be built before packing or publishing.

### 2. Create Local Tarball

```bash
# In packages/cli
npm pack
# This creates: code-evolution-lab-1.0.0.tgz
```

### 3. Test Global Installation (Method 1: npm link)

```bash
# In packages/cli
npm link

# Now test from any directory
cd ~
code-evolution-lab --help
code-evolution-lab replay
code-evolution-lab replay 04 --quick
code-evolution-lab analyze ./my-project

# Unlink when done
npm unlink -g code-evolution-lab
```

### 4. Test Global Installation (Method 2: tarball)

```bash
# Install from tarball globally
npm install -g ./packages/cli/code-evolution-lab-1.0.0.tgz

# Test from any directory
cd ~/Desktop
code-evolution-lab --help
code-evolution-lab replay 02

# Uninstall when done
npm uninstall -g code-evolution-lab
```

### 5. Test in a Clean Project

```bash
# Create test directory
mkdir ~/test-code-evolution
cd ~/test-code-evolution
npm init -y

# Install from local tarball
npm install ../path/to/packages/cli/code-evolution-lab-1.0.0.tgz

# Test via npx
npx code-evolution-lab --help
npx code-evolution-lab replay 03 --quick
```

### 6. Verify Package Contents

```bash
# Extract and inspect tarball
tar -tzf code-evolution-lab-1.0.0.tgz

# Should contain:
# - package/dist/          (compiled TypeScript)
# - package/bin/           (CLI entry point)
# - package/package.json
# - package/README.md
# - package/node_modules/@code-evolution/core-engine/
# - package/node_modules/@code-evolution/replay/
```

### 7. Test DB-Backed Replays (Study 01/05)

```bash
# Ensure PostgreSQL is running
docker compose up -d postgres

# Run replay 01
npx code-evolution-lab replay 01
# Should prompt for:
# - DB name (default: empirical_study_01)
# - Generate Prisma client? (y/n)
# - Push schema? (y/n)
# - Seed data? (y/n)

# Verify results are output to console
```

### 8. Test Self-Contained Replays (Study 02/03/04)

```bash
# These should run without DB setup
npx code-evolution-lab replay 02 --quick
npx code-evolution-lab replay 03 --quick
npx code-evolution-lab replay 04 --quick

# Verify console output shows results
```

## Publishing Checklist

- [ ] All packages build successfully (`npm run build`)
- [ ] Lint errors resolved
- [ ] Version numbers updated in package.json
- [ ] README.md updated with latest features
- [ ] CHANGELOG.md updated (if exists)
- [ ] All tests pass
- [ ] Local testing via `npm link` works
- [ ] Local testing via tarball works
- [ ] Global install works from any directory
- [ ] DB-backed replays prompt correctly
- [ ] Self-contained replays run successfully
- [ ] Results output to console properly

## Publish Commands

```bash
# 1. Ensure you're logged in
npm whoami
# If not logged in:
npm login

# 2. Publish from packages/cli
cd packages/cli
npm publish --access public

# 3. Verify on npmjs.com
# Visit: https://www.npmjs.com/package/code-evolution-lab

# 4. Test install from npm
npm install -g code-evolution-lab
code-evolution-lab --version
```

## Troubleshooting

### "Cannot find module" errors
- Ensure `npm run build` completed in `packages`
- Run `npm pack` in `packages/cli` and confirm bundled internal packages are present under `package/node_modules/@code-evolution/`

### "Command not found" after global install
- Check bin path: `npm config get prefix`
- Ensure bin directory is in PATH
- On Windows: restart terminal after install

### Prisma errors in Study 01/05
- Ensure PostgreSQL is running
- Check DATABASE_URL is accessible
- Run `npx prisma generate` manually if prompted

### Empty benchmark results
- For Study 01/05: ensure database was seeded
- Check console output for errors during setup
