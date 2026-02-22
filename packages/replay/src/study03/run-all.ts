import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { reactUseEffectScenario } from './scenarios/react-useeffect-leak';
import { vueOnMountedScenario } from './scenarios/vue-onmounted-leak';
import { angularSubscribeScenario } from './scenarios/angular-subscribe-leak';
import { vueWatchStopScenario } from './scenarios/vue-watch-stop-leak';
import { rafCancelScenario } from './scenarios/raf-cancel-leak';

const RESULTS_DIR = join(__dirname, '..', '..', '..', 'results', 'study03');

export interface MemorySnapshot {
  cycle: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

export interface ScenarioDefinition {
  name: string;
  framework: string;
  description: string;
  runBad: (cycles: number) => Promise<MemorySnapshot[]>;
  runGood: (cycles: number) => Promise<MemorySnapshot[]>;
}

export interface ScenarioResult {
  name: string;
  framework: string;
  description: string;
  cycles: number;
  bad: MemorySnapshot[];
  good: MemorySnapshot[];
  heapGrowthBadBytes: number;
  heapGrowthGoodBytes: number;
  leakDetected: boolean;
}

function calcHeapGrowth(snapshots: MemorySnapshot[]): number {
  if (snapshots.length < 2) return 0;
  return snapshots[snapshots.length - 1].heapUsed - snapshots[0].heapUsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runScenario(
  scenario: ScenarioDefinition,
  cycles: number,
): Promise<ScenarioResult> {
  console.log(`\n  [${scenario.framework}/${scenario.name}] Running bad pattern (${cycles} cycles)...`);
  const bad = await scenario.runBad(cycles);
  await sleep(500);

  console.log(`  [${scenario.framework}/${scenario.name}] Running good pattern (${cycles} cycles)...`);
  const good = await scenario.runGood(cycles);
  await sleep(500);

  const heapGrowthBadBytes = calcHeapGrowth(bad);
  const heapGrowthGoodBytes = calcHeapGrowth(good);
  const leakDetected = heapGrowthBadBytes > heapGrowthGoodBytes * 2 && heapGrowthBadBytes > 1_000_000;

  const flag = leakDetected ? '✓ LEAK DETECTED' : '~ no significant leak';
  console.log(
    `  → bad growth: ${(heapGrowthBadBytes / 1024 / 1024).toFixed(2)} MB  ` +
    `good growth: ${(heapGrowthGoodBytes / 1024 / 1024).toFixed(2)} MB  ${flag}`,
  );

  return {
    name: scenario.name,
    framework: scenario.framework,
    description: scenario.description,
    cycles,
    bad,
    good,
    heapGrowthBadBytes,
    heapGrowthGoodBytes,
    leakDetected,
  };
}

function parseArgs(): { cycles: number; quick: boolean } {
  const args = process.argv.slice(2);
  const quick = args.includes('--quick');
  const cyclesIdx = args.indexOf('--cycles');
  const cycles = cyclesIdx >= 0 ? parseInt(args[cyclesIdx + 1], 10) : quick ? 100 : 500;
  return { cycles, quick };
}

async function main(): Promise<void> {
  const { cycles } = parseArgs();

  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  const scenarios: ScenarioDefinition[] = [
    reactUseEffectScenario,
    vueOnMountedScenario,
    angularSubscribeScenario,
    vueWatchStopScenario,
    rafCancelScenario,
  ];

  console.log('\n=== Study 03: Memory Leak Benchmarks ===');
  console.log(`Scenarios : ${scenarios.map(s => s.name).join(', ')}`);
  console.log(`Cycles    : ${cycles}`);
  console.log(`Node      : ${process.version}  Platform: ${process.platform}`);
  console.log('NOTE: Run with --expose-gc for accurate GC-forced snapshots.\n');

  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    const result = await runScenario(scenario, cycles);
    results.push(result);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const output = {
    metadata: {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      cycles,
    },
    results,
  };

  const outputPath = join(RESULTS_DIR, `bench-${timestamp}.json`);
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);

  const leaked = results.filter(r => r.leakDetected);
  const missed = results.filter(r => !r.leakDetected);
  console.log(`\nSummary: ${leaked.length}/${results.length} scenarios confirmed leak`);
  if (missed.length > 0) {
    console.warn(`⚠ ${missed.length} scenario(s) did not show significant heap growth — may need more cycles or --expose-gc`);
    missed.forEach(r => console.warn(`  ${r.name}`));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
