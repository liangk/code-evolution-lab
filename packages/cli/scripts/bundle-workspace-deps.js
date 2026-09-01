// Copies the built @code-evolution/core-engine and @code-evolution/replay
// packages into this package's own node_modules before packing.
//
// Why this exists: with npm workspaces, cross-workspace dependencies are
// hoisted to the workspace root's node_modules (packages/node_modules/@code-evolution/*)
// and symlinked there — they are never installed *inside* packages/cli/node_modules.
// `bundledDependencies` only looks in the local package's own node_modules, so
// without this step, `npm pack`/`npm publish` silently produces a tarball with
// no @code-evolution/* content at all (no error — it just finds nothing to bundle).
const fs = require('fs');
const path = require('path');

function copyPackage(name, srcDir) {
  const destDir = path.join(__dirname, '..', 'node_modules', '@code-evolution', name);
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(path.join(srcDir, 'package.json'), path.join(destDir, 'package.json'));
  fs.cpSync(path.join(srcDir, 'dist'), path.join(destDir, 'dist'), { recursive: true });
  console.log(`Bundled @code-evolution/${name} -> node_modules/@code-evolution/${name}`);
}

copyPackage('core-engine', path.join(__dirname, '..', '..', 'core-engine'));
copyPackage('replay', path.join(__dirname, '..', '..', 'replay'));
