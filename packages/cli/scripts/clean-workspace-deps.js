// Removes the local copies created by bundle-workspace-deps.js after packing.
//
// Without this, packages/cli/node_modules/@code-evolution/* would be a real,
// non-symlinked snapshot that shadows the live workspace symlink at
// packages/node_modules/@code-evolution/* — so local dev/testing of the CLI
// after a pack would silently use stale code instead of your current source,
// until this directory is removed.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'node_modules', '@code-evolution');
fs.rmSync(dir, { recursive: true, force: true });
console.log('Removed local node_modules/@code-evolution copies (workspace symlink still intact at ../../node_modules)');
