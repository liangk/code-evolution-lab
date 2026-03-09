import { join } from 'path';
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';

export interface ReplayOptions {
  quick?: boolean;
}

interface StudyMeta {
  id: string;
  name: string;
  description: string;
  requiresDb: boolean;
  nodeFlags: string[];
  quickArgs: string[];
}

const STUDIES: Record<string, StudyMeta> = {
  '01': {
    id: '01',
    name: 'N+1 Queries',
    description: 'Prisma/PostgreSQL N+1 query benchmarks (requires live DB)',
    requiresDb: true,
    nodeFlags: [],
    quickArgs: [],
  },
  '02': {
    id: '02',
    name: 'Blocking I/O',
    description: 'Node.js sync I/O vs async benchmarks',
    requiresDb: false,
    nodeFlags: [],
    quickArgs: ['--duration', '5', '--concurrency', '25'],
  },
  '03': {
    id: '03',
    name: 'Memory Leaks',
    description: 'Simulated memory leak patterns in React, Vue, Angular',
    requiresDb: false,
    nodeFlags: ['--expose-gc'],
    quickArgs: ['--quick'],
  },
  '04': {
    id: '04',
    name: 'Loop Performance',
    description: 'CPU-bound loop anti-patterns: regex, JSON, nested loops, chained array methods',
    requiresDb: false,
    nodeFlags: [],
    quickArgs: ['--trials', '5', '--warmup', '10'],
  },
  '05': {
    id: '05',
    name: 'Missing Index',
    description: 'PostgreSQL query performance with/without indexes (requires live DB)',
    requiresDb: true,
    nodeFlags: [],
    quickArgs: [],
  },
};

function resolveReplayEntrypoint(studyKey: string): string {
  // Prefer installed package (works for global installs)
  try {
    const replayPkgJson = require.resolve('@code-evolution/replay/package.json');
    const replayRoot = join(replayPkgJson, '..');
    const compiled = join(replayRoot, 'dist', `study${studyKey}`, 'run-all.js');
    if (existsSync(compiled)) return compiled;
  } catch {
    // ignore
  }

  // Fallback for monorepo/dev usage
  return join(__dirname, '..', '..', '..', 'replay', 'dist', `study${studyKey}`, 'run-all.js');
}

export async function replayCommand(studyArg: string | undefined, options: ReplayOptions): Promise<void> {
  console.log('\n=== Code Evolution Lab — Replay Framework ===\n');

  if (!studyArg) {
    console.log('Available studies:\n');
    for (const [id, meta] of Object.entries(STUDIES)) {
      const dbNote = meta.requiresDb ? ' [requires PostgreSQL]' : '';
      console.log(`  ${id}  ${meta.name.padEnd(22)} ${meta.description}${dbNote}`);
    }
    console.log('\nUsage:   code-evolution-lab replay <study-number> [--quick]');
    console.log('Example: code-evolution-lab replay 02 --quick');
    console.log('         code-evolution-lab replay 04 --quick\n');
    console.log('Flag --quick: runs a reduced-workload replay (shorter duration/concurrency where supported).\n');
    return;
  }

  const key = studyArg.padStart(2, '0');
  const meta = STUDIES[key];
  if (!meta) {
    console.error(`Unknown study: ${studyArg}. Available: ${Object.keys(STUDIES).join(', ')}`);
    process.exit(1);
  }

  if (meta.requiresDb) {
    console.log(`Study ${key} (${meta.name}) requires a live PostgreSQL database.`);
    console.log('You will be prompted for a DB name before the study runs.\n');
  }

  const entrypoint = resolveReplayEntrypoint(key);
  const baseResultsDir = process.env.CODE_EVOLUTION_LAB_RESULTS_DIR || join(process.cwd(), 'results');
  const resultsDir = join(baseResultsDir, `study${key}`);

  console.log(`Replaying: Study ${key} — ${meta.name}`);
  console.log(`Runner:    ${entrypoint}`);
  console.log(`Working:   ${process.cwd()}`);
  console.log(`Results:   ${resultsDir}`);
  if (options.quick) console.log('Mode:      Quick (reduced trials)');
  console.log('');

  const nodeArgs = [
    ...meta.nodeFlags,
    entrypoint,
    ...(options.quick ? meta.quickArgs : []),
  ];

  const result = spawnSync(process.execPath, nodeArgs, {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });

  if (result.status !== 0) {
    console.error(`\n✗ Replay failed for Study ${key}`);
    process.exit(result.status ?? 1);
  }

  console.log(`\n✓ Replay complete for Study ${key}\n`);
}
