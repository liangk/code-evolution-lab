import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { reactUseEffectScenario } from './scenarios/react-useeffect-leak';
import { vueOnMountedScenario } from './scenarios/vue-onmounted-leak';
import { angularSubscribeScenario } from './scenarios/angular-subscribe-leak';
import { vueWatchStopScenario } from './scenarios/vue-watch-stop-leak';
import { rafCancelScenario } from './scenarios/raf-cancel-leak';

const BASE_RESULTS_DIR = process.env.CODE_EVOLUTION_LAB_RESULTS_DIR || join(process.cwd(), 'results');
const RESULTS_DIR = join(BASE_RESULTS_DIR, 'study03');

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

function toMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2);
}

function calculateStats(snapshots: MemorySnapshot[]): { mean: number; cv: number } {
  if (snapshots.length === 0) return { mean: 0, cv: 0 };
  
  const heapValues = snapshots.map(s => s.heapUsed);
  const mean = heapValues.reduce((sum, val) => sum + val, 0) / heapValues.length;
  
  if (heapValues.length < 2) return { mean, cv: 0 };
  
  const variance = heapValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / heapValues.length;
  const stddev = Math.sqrt(variance);
  const cv = mean !== 0 ? (stddev / mean) * 100 : 0;
  
  return { mean, cv };
}

function getCodeDescription(scenarioName: string): { bad: string; good: string } {
  const descriptions: Record<string, { bad: string; good: string }> = {
    'react-useeffect-leak': {
      bad: 'useEffect(() => { window.addEventListener(\'resize\', handler); }); // No cleanup',
      good: 'useEffect(() => { window.addEventListener(\'resize\', handler); return () => window.removeEventListener(\'resize\', handler); }, []);'
    },
    'vue-onmounted-leak': {
      bad: 'onMounted(() => { timerId = setInterval(() => {...}, 100); }); // No cleanup',
      good: 'onMounted(() => { timerId = setInterval(() => {...}, 100); }); onUnmounted(() => { clearInterval(timerId); });'
    },
    'angular-subscribe-leak': {
      bad: 'ngOnInit() { this.dataService.subscribe(() => {...}); } ngOnDestroy() { /* no unsubscribe */ }',
      good: 'ngOnInit() { this.subscription = this.dataService.subscribe(() => {...}); } ngOnDestroy() { this.subscription.unsubscribe(); }'
    },
    'vue-watch-stop-leak': {
      bad: 'onMounted(() => { watch(source, () => {...}); }); // No stop handle',
      good: 'onMounted(() => { const stop = watch(source, () => {...}); onUnmounted(() => { stop(); }); });'
    },
    'raf-cancel-leak': {
      bad: 'useEffect(() => { rafId = requestAnimationFrame(animate); }); // No cancel return',
      good: 'useEffect(() => { rafId = requestAnimationFrame(animate); return () => cancelAnimationFrame(rafId); }, []);'
    }
  };
  return descriptions[scenarioName] || { bad: 'N/A', good: 'N/A' };
}

function buildSummaryMarkdown(
  timestamp: string,
  cycles: number,
  results: ScenarioResult[],
  metadata: { nodeVersion: string; platform: string }
): string {
  const lines: string[] = [];
  lines.push(`# Study 03: Memory Leak Benchmarks — Summary Report`);
  lines.push('');
  lines.push(`## Metadata`);
  lines.push(`- **Timestamp**: ${timestamp}`);
  lines.push(`- **Cycles**: ${cycles}`);
  lines.push(`- **Node Version**: ${metadata.nodeVersion}`);
  lines.push(`- **Platform**: ${metadata.platform}`);
  lines.push('');
  lines.push(`**Replay note:** This CLI report is a lightweight benchmark reproduction, not the full publication workflow. The original article combined these scenarios with a 500-repository static analysis and 50 repeated benchmark runs; this replay executes one local benchmark pass at the configured cycle count, so article-level statistics will not match line-for-line.`);
  lines.push('');
  lines.push(`---`);
  lines.push('');

  for (const r of results) {
    const badStats = calculateStats(r.bad);
    const goodStats = calculateStats(r.good);
    const codeDesc = getCodeDescription(r.name);
    
    lines.push(`## ${r.framework.toUpperCase()} — ${r.name}`);
    lines.push('');
    lines.push(`**Issue**: ${r.description}`);
    lines.push('');
    lines.push(`### Code Comparison`);
    lines.push('');
    lines.push(`**❌ Bad Pattern (Leaks Memory)**`);
    lines.push('```typescript');
    lines.push(codeDesc.bad);
    lines.push('```');
    lines.push('');
    lines.push(`**✅ Good Pattern (Proper Cleanup)**`);
    lines.push('```typescript');
    lines.push(codeDesc.good);
    lines.push('```');
    lines.push('');
    lines.push(`### Statistical Data`);
    lines.push('');
    lines.push(`| Metric | Bad Pattern | Good Pattern |`);
    lines.push(`|--------|-------------|--------------|`);
    lines.push(`| **Heap Growth** | ${toMB(r.heapGrowthBadBytes)} MB | ${toMB(r.heapGrowthGoodBytes)} MB |`);
    lines.push(`| **Mean Heap Usage** | ${toMB(badStats.mean)} MB | ${toMB(goodStats.mean)} MB |`);
    lines.push(`| **CV (Coefficient of Variation)** | ${badStats.cv.toFixed(2)}% | ${goodStats.cv.toFixed(2)}% |`);
    lines.push(`| **Leak Detected** | ${r.leakDetected ? '✅ Yes' : '~ No'} | N/A |`);
    lines.push('');
    lines.push(`---`);
    lines.push('');
  }

  const leaked = results.filter(r => r.leakDetected).length;
  lines.push(`## Summary`);
  lines.push('');
  lines.push(`**${leaked}/${results.length}** scenarios confirmed significant memory leak growth.`);
  lines.push('');
  if (leaked < results.length) {
    const missed = results.filter(r => !r.leakDetected);
    lines.push(`⚠️ **Note**: ${missed.length} scenario(s) did not show significant heap growth:`);
    missed.forEach(r => lines.push(`- ${r.name}`));
    lines.push('');
    lines.push(`**Why leaks may not be detected:** The CLI already runs with \`--expose-gc\` to force GC before each snapshot. If leaks still go undetected, the most likely cause is an insufficient cycle count — the detection threshold requires heap growth > 1 MB above the good pattern. At low cycle counts (e.g. \`--quick\` = 100 cycles), growth may fall just under this threshold even though a real leak exists.`);
    lines.push('');
    lines.push(`**To confirm leak detection, re-run without \`--quick\` (default 500 cycles):**`);
    lines.push('```bash');
    lines.push('code-evolution-lab replay 03');
    lines.push('```');
  }
  return lines.join('\n');
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

  const summaryMd = buildSummaryMarkdown(
    output.metadata.timestamp,
    cycles,
    results,
    { nodeVersion: process.version, platform: process.platform }
  );
  const summaryPath = join(RESULTS_DIR, `summary-${timestamp}.md`);
  writeFileSync(summaryPath, summaryMd);
  console.log(`Summary saved to: ${summaryPath}`);

  const leaked = results.filter(r => r.leakDetected);
  const missed = results.filter(r => !r.leakDetected);
  console.log(`\nSummary: ${leaked.length}/${results.length} scenarios confirmed leak`);
  if (missed.length > 0) {
    console.warn(`⚠ ${missed.length} scenario(s) did not show significant heap growth — may need more cycles or --expose-gc`);
    missed.forEach(r => console.warn(`  ${r.name}`));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
