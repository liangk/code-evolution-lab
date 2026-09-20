import { resolve, sep } from 'path';
import { existsSync, statSync } from 'fs';

const GLOB_CHARS = /[*?[\]{}]/;

/**
 * Resolve and validate the directory a command should scan.
 *
 * Two mistakes this catches, both of which used to fail silently:
 *
 * 1. A glob. The engine walks a directory tree; it does not expand patterns.
 *    `scan "src/**\/*.ts"` previously had its argument swallowed by commander
 *    and scanned the current directory instead, with no indication that the
 *    pattern had been ignored.
 *
 * 2. A path inside node_modules. The walker skips `node_modules` as a child
 *    directory, but that guard does nothing when the scan *starts* inside one,
 *    so you end up analysing your dependencies' compiled output.
 */
export interface ScanTargets {
  /** Anchor for relative file paths in the report. */
  targetPath: string;
  /** Directories to walk, when more than one was given. */
  includePaths?: string[];
}

/**
 * Resolve one or more directories to scan.
 *
 * A study scope is often several sibling directories rather than one tree —
 * `server/{routes,commands,presenters,queues,policies,services}`. Passing them
 * all keeps reported paths anchored at the current directory, so they read the
 * same as a single-directory scan of the repository root.
 */
export function resolveScanTargets(pathArgs: string[]): ScanTargets {
  const args = pathArgs.filter(Boolean);

  if (args.length === 0) {
    return { targetPath: validateDirectory(resolve('.')) };
  }

  const resolved = args.map(arg => {
    if (GLOB_CHARS.test(arg)) {
      console.error(`\nGlob patterns are not supported: ${arg}`);
      console.error(`Pass directories instead. Each one is walked recursively and`);
      console.error(`picks up .js, .ts, .jsx, .tsx and .mjs files.\n`);
      console.error(`  code-evolution-lab analyze server/routes server/commands\n`);
      process.exit(1);
    }
    return validateDirectory(resolve(arg));
  });

  if (resolved.length === 1) return { targetPath: resolved[0] };

  // Several roots: anchor relative paths at the current directory so a finding
  // reads `server/commands/groupsSyncer.ts`, not `commands/groupsSyncer.ts`.
  return { targetPath: resolve('.'), includePaths: resolved };
}

/**
 * A scan that matched nothing looks identical to a clean codebase: zero
 * issues, a perfect score, and a tick. That is how a mistyped path or a
 * directory holding only compiled output reads, so say what happened instead.
 */
export function warnIfNothingScanned(filesScanned: number, targets: string[]): void {
  if (filesScanned > 0) return;
  console.warn(`\nNo .js, .ts, .jsx, .tsx or .mjs files were found under:`);
  for (const target of targets) console.warn(`  ${target}`);
  console.warn(`\nA score of 100 here means nothing was scanned, not that nothing is wrong.`);
  console.warn(`Directories named node_modules, dist, build, coverage, .next, .nuxt,`);
  console.warn(`__tests__, __mocks__ and e2e are skipped, as are *.test.* and *.spec.* files.`);
  console.warn(`Most published npm packages ship only compiled output in dist/, so pass a`);
  console.warn(`source directory instead.\n`);
}

function validateDirectory(targetPath: string): string {
  if (!existsSync(targetPath)) {
    console.error(`\nNo such directory: ${targetPath}\n`);
    process.exit(1);
  }

  if (!statSync(targetPath).isDirectory()) {
    console.error(`\nNot a directory: ${targetPath}`);
    console.error(`Pass the directory that contains the code you want scanned.\n`);
    process.exit(1);
  }

  if (targetPath.split(sep).includes('node_modules')) {
    console.warn(`\nWarning: this path is inside node_modules.`);
    console.warn(`Findings in third-party packages are not actionable, and the`);
    console.warn(`score will reflect your dependencies rather than your code.\n`);
  }

  return targetPath;
}
