import { resolve, join } from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

interface ReplayOptions {
  quick?: boolean;
}

const STUDY_MAP: Record<string, { dir: string; script: string; description: string }> = {
  '01': { dir: 'studies/01-n-plus-1-query', script: 'bench:all', description: 'N+1 Query Problem' },
  '02': { dir: 'studies/02-blocking-io', script: 'bench:all', description: 'Blocking I/O' },
  '03': { dir: 'studies/03-memory-leaks', script: 'bench:all', description: 'Memory Leaks' },
  '04': { dir: 'studies/04-loop-performance', script: 'bench:all', description: 'Loop Performance' },
  '05': { dir: 'studies/05-missing-index', script: 'bench:all', description: 'Missing Index Crisis' },
};

export async function replayCommand(studyArg: string | undefined, options: ReplayOptions): Promise<void> {
  console.log('\n=== Code Evolution Lab — Replay Framework ===\n');

  if (!studyArg) {
    // List available studies
    console.log('Available studies:\n');
    for (const [id, info] of Object.entries(STUDY_MAP)) {
      const dir = resolve(info.dir);
      const installed = existsSync(join(dir, 'node_modules'));
      const status = installed ? '✓ Ready' : '○ Not installed';
      console.log(`  ${id}  ${info.description.padEnd(25)} ${status}`);
    }
    console.log('\nUsage: code-evolution replay <study-number>');
    console.log('Example: code-evolution replay 04\n');
    return;
  }

  const study = STUDY_MAP[studyArg.padStart(2, '0')];
  if (!study) {
    console.error(`Unknown study: ${studyArg}. Valid: ${Object.keys(STUDY_MAP).join(', ')}`);
    process.exit(1);
  }

  const studyDir = resolve(study.dir);
  if (!existsSync(studyDir)) {
    console.error(`Study directory not found: ${studyDir}`);
    console.error('Make sure you are running from the empirical-study root.');
    process.exit(1);
  }

  console.log(`Replaying: Study ${studyArg} — ${study.description}`);
  console.log(`Directory: ${studyDir}`);
  console.log(`Script:    npm run ${study.script}`);
  if (options.quick) console.log(`Mode:      Quick (reduced trials)`);
  console.log('');

  // Check if deps are installed
  if (!existsSync(join(studyDir, 'node_modules'))) {
    console.log('Installing dependencies...\n');
    execSync('npm install', { cwd: studyDir, stdio: 'inherit' });
    console.log('');
  }

  // Run the benchmark
  const env = options.quick ? 'QUICK=1' : '';
  const cmd = `${env} npm run ${study.script}`.trim();

  console.log(`Running: ${cmd}\n`);
  try {
    execSync(cmd, { cwd: studyDir, stdio: 'inherit', env: { ...process.env, QUICK: options.quick ? '1' : '' } });
    console.log(`\n✓ Replay complete for Study ${studyArg}\n`);
  } catch (err) {
    console.error(`\n✗ Replay failed for Study ${studyArg}`);
    process.exit(1);
  }
}
