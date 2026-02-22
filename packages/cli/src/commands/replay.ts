import { join } from 'path';
import { spawnSync } from 'child_process';

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

const REPLAY_SRC = join(__dirname, '..', '..', '..', 'replay', 'src');

export async function replayCommand(studyArg: string | undefined, options: ReplayOptions): Promise<void> {
  console.log('\n=== Code Evolution Lab — Replay Framework ===\n');

  if (!studyArg) {
    console.log('Available studies:\n');
    for (const [id, meta] of Object.entries(STUDIES)) {
      const dbNote = meta.requiresDb ? ' [requires PostgreSQL]' : '';
      console.log(`  ${id}  ${meta.name.padEnd(22)} ${meta.description}${dbNote}`);
    }
    console.log('\nUsage:   code-evolution replay <study-number> [--quick]');
    console.log('Example: code-evolution replay 04 --quick\n');
    return;
  }

  const key = studyArg.padStart(2, '0');
  const meta = STUDIES[key];
  if (!meta) {
    console.error(`Unknown study: ${studyArg}. Available: ${Object.keys(STUDIES).join(', ')}`);
    process.exit(1);
  }

  if (meta.requiresDb) {
    console.error(`Study ${key} (${meta.name}) requires a live PostgreSQL database.`);
    console.error('Set DATABASE_URL and run the study from the empirical-study repo:');
    console.error(`  cd empirical-study/studies/0${key}-missing-index && npm run bench:all`);
    process.exit(1);
  }

  const entrypoint = join(REPLAY_SRC, `study${key}`, 'run-all.ts');

  console.log(`Replaying: Study ${key} — ${meta.name}`);
  console.log(`Entry:     ${entrypoint}`);
  if (options.quick) console.log('Mode:      Quick (reduced trials)');
  console.log('');

  const nodeArgs = [
    ...meta.nodeFlags,
    '-r', 'ts-node/register',
    entrypoint,
    ...(options.quick ? meta.quickArgs : []),
  ];

  const result = spawnSync(process.execPath, nodeArgs, {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    console.error(`\n✗ Replay failed for Study ${key}`);
    process.exit(result.status ?? 1);
  }

  console.log(`\n✓ Replay complete for Study ${key}\n`);
}
