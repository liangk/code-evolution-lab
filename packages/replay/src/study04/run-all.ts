import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { runTrials } from './harness/runner';
import { summarize, compare } from './harness/stats';
import type { BenchmarkModule, BenchmarkOutput, BenchmarkSummary, ComparisonResult, RunConfig, TrialRecord } from './harness/types';
import { runBaseline as bm01Base } from './modules/bm01-regex/baseline';
import { runOptimized as bm01Opt } from './modules/bm01-regex/optimized';
import { runBaseline as bm02Base } from './modules/bm02-json/baseline';
import { runOptimized as bm02Opt } from './modules/bm02-json/optimized';
import { runBaseline as bm03Base } from './modules/bm03-async-io/baseline';
import { runOptimized as bm03Opt } from './modules/bm03-async-io/optimized';
import { runBaseline as bm04Base } from './modules/bm04-nested-loops/baseline';
import { runOptimized as bm04Opt } from './modules/bm04-nested-loops/optimized';
import { runBaseline as bm05Base } from './modules/bm05-nested-array/baseline';
import { runOptimized as bm05Opt } from './modules/bm05-nested-array/optimized';
import { runBaseline as bm06Base } from './modules/bm06-chained-array/baseline';
import { runOptimized as bm06Opt } from './modules/bm06-chained-array/optimized';

const BASE_RESULTS_DIR = process.env.CODE_EVOLUTION_LAB_RESULTS_DIR || join(process.cwd(), 'results');
const RESULTS_DIR = join(BASE_RESULTS_DIR, 'study04');

const DEFAULT_CONFIG: RunConfig = {
  trials: 30,
  warmupIterations: 50,
  sleepBetweenTrialsMs: 200,
  moduleFilter: null,
  nFilter: null,
};

const N_VALUES = [10, 100, 1_000, 10_000, 100_000];

const MODULES: BenchmarkModule[] = [
  {
    id: 'BM-01', name: 'Regex Compilation Inside Loop',
    description: 'Regex literal compiled on every iteration vs. hoisted constant.',
    hypothesis: 'H2', nValues: N_VALUES, isAsync: false,
    runBaseline: (n) => bm01Base(n),
    runOptimized: (n) => bm01Opt(n),
  },
  {
    id: 'BM-02', name: 'JSON Parsing Inside Loop',
    description: 'JSON.parse() called every iteration vs. cached before loop.',
    hypothesis: null, nValues: N_VALUES, isAsync: false,
    runBaseline: (n) => bm02Base(n),
    runOptimized: (n) => bm02Opt(n),
  },
  {
    id: 'BM-03', name: 'Sequential Async I/O — await-in-loop vs Promise.all',
    description: 'Sequential await of independent async operations vs concurrent batching with Promise.all.',
    hypothesis: 'H4', nValues: [10, 100, 1_000], isAsync: true,
    runBaseline: (n) => bm03Base(n),
    runOptimized: (n) => bm03Opt(n),
  },
  {
    id: 'BM-04', name: 'Nested Loops — O(n²) vs O(n) via Map',
    description: 'Inner linear scan vs. Map.get() O(1) lookup.',
    hypothesis: 'H1+H4', nValues: N_VALUES, isAsync: false,
    runBaseline: (n) => bm04Base(n),
    runOptimized: (n) => bm04Opt(n),
  },
  {
    id: 'BM-05', name: 'Nested Array Methods (forEach-in-forEach)',
    description: 'Nested forEach callback overhead vs. direct for-loop.',
    hypothesis: null, nValues: N_VALUES, isAsync: false,
    runBaseline: (n) => bm05Base(n),
    runOptimized: (n) => bm05Opt(n),
  },
  {
    id: 'BM-06', name: 'Chained Array Methods (filter+map)',
    description: 'Two-pass filter().map() with intermediate array vs. single-pass reduce.',
    hypothesis: null, nValues: N_VALUES, isAsync: false,
    runBaseline: (n) => bm06Base(n),
    runOptimized: (n) => bm06Opt(n),
  },
];

function parseArgs(): RunConfig {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };
  return {
    trials: parseInt(get('--trials') ?? String(DEFAULT_CONFIG.trials), 10),
    warmupIterations: parseInt(get('--warmup') ?? String(DEFAULT_CONFIG.warmupIterations), 10),
    sleepBetweenTrialsMs: DEFAULT_CONFIG.sleepBetweenTrialsMs,
    moduleFilter: get('--module') ?? null,
    nFilter: get('--n') ? parseInt(get('--n')!, 10) : null,
  };
}

function hypothesisFn(id: string): ((speedup: number) => boolean) | undefined {
  if (id === 'BM-01') return (s) => s >= 5;
  if (id === 'BM-04') return (s) => s >= 100;
  return undefined;
}

function getCodeComparison(moduleId: string): { bad: string; good: string; explanation: string } {
  const comparisons: Record<string, { bad: string; good: string; explanation: string }> = {
    'BM-01': {
      bad: 'for (let i = 0; i < items.length; i++) {\n  const match = /^\\d{4}-\\d{2}-\\d{2}$/.test(items[i]); // Regex compiled every iteration\n  if (match) matches++;\n}',
      good: 'const DATE_REGEX = /^\\d{4}-\\d{2}-\\d{2}$/; // Hoisted outside loop\nfor (let i = 0; i < items.length; i++) {\n  if (DATE_REGEX.test(items[i])) matches++;\n}',
      explanation: 'Regex literal inside loop causes re-compilation on every iteration. Hoisting the regex constant outside the loop compiles it once and reuses it.'
    },
    'BM-02': {
      bad: 'for (let i = 0; i < keys.length; i++) {\n  const obj = JSON.parse(jsonStr); // Parsing same string n times\n  results.push(obj[keys[i]]);\n}',
      good: 'const obj = JSON.parse(jsonStr); // Parse once before loop\nfor (let i = 0; i < keys.length; i++) {\n  results.push(obj[keys[i]]);\n}',
      explanation: 'Calling JSON.parse() inside the loop re-parses the same unchanged string on every iteration. Moving it outside the loop parses once and reuses the object.'
    },
    'BM-03': {
      bad: 'for (const item of items) {\n  results.push(await fetchItem(item)); // Sequential await blocks the next request\n}',
      good: 'const results = await Promise.all(items.map(item => fetchItem(item))); // Run independent I/O concurrently',
      explanation: 'Awaiting each independent async operation inside a loop serializes latency. Promise.all batches those independent operations so total wall time approaches the slowest request rather than the sum of all requests.'
    },
    'BM-04': {
      bad: 'for (const user of users) { // O(n²) nested loops\n  let found = null;\n  for (const order of orders) {\n    if (order.userId === user.id) { found = order; break; }\n  }\n  results.push(found);\n}',
      good: 'const orderMap = new Map(); // O(n) with Map lookup\nfor (const o of orders) orderMap.set(o.userId, o);\nfor (const user of users) {\n  results.push(orderMap.get(user.id) ?? null);\n}',
      explanation: 'Nested loops create O(n²) complexity with linear scans. Pre-building a Map enables O(1) lookups, reducing complexity to O(n).'
    },
    'BM-05': {
      bad: 'users.forEach(user => {\n  orders.forEach(order => { // Nested forEach with callback overhead\n    if (order.userId === user.id) results.push({ user, order });\n  });\n});',
      good: 'for (let i = 0; i < users.length; i++) {\n  for (let j = 0; j < orders.length; j++) { // Direct for-loops\n    if (orders[j].userId === users[i].id) results.push({ user: users[i], order: orders[j] });\n  }\n}',
      explanation: 'Nested forEach methods add callback invocation overhead. Direct for-loops eliminate this overhead while maintaining the same logic.'
    },
    'BM-06': {
      bad: 'const filtered = items.filter(x => x.active); // Two-pass with intermediate array\nconst mapped = filtered.map(x => x.value);\nreturn mapped;',
      good: 'return items.reduce((acc, x) => { // Single-pass reduce\n  if (x.active) acc.push(x.value);\n  return acc;\n}, []);',
      explanation: 'Chained filter().map() creates an intermediate array and iterates twice. Single-pass reduce() processes items once without intermediate allocations.'
    }
  };
  return comparisons[moduleId] || { bad: 'N/A', good: 'N/A', explanation: 'No description available.' };
}

function buildArticleReportMarkdown(output: BenchmarkOutput, modules: BenchmarkModule[]): string {
  const lines: string[] = [];
  const moduleMap = new Map(modules.map(m => [m.id, m]));
  const total = output.comparisons.length;
  const sig = output.comparisons.filter(c => c.significant).length;
  const anomalies = output.comparisons.filter(c => c.anomaly).length;
  const avgSpeedup = total === 0 ? 0 : output.comparisons.reduce((s, c) => s + c.speedupRatio, 0) / total;
  const best = output.comparisons.reduce<ComparisonResult | null>((acc, c) => !acc || c.speedupRatio > acc.speedupRatio ? c : acc, null);

  lines.push(`# Study 04: Loop Performance — Replay Report`);
  lines.push('');
  lines.push(`## Executive Summary`);
  lines.push('');
  lines.push(`This report summarizes the current replay run of the Study 04 loop performance benchmarks. It is generated directly from the replay execution data rather than from the original long-form article dataset.`);
  lines.push('');
  lines.push(`- **Timestamp**: ${output.metadata.timestamp}`);
  lines.push(`- **Node Version**: ${output.metadata.nodeVersion}`);
  lines.push(`- **Platform**: ${output.metadata.platform} (${output.metadata.arch})`);
  lines.push(`- **Trials per configuration**: ${output.metadata.config.trials}`);
  lines.push(`- **Warmup iterations**: ${output.metadata.config.warmupIterations}`);
  lines.push(`- **Configurations tested**: ${total}`);
  lines.push(`- **Statistically significant results**: ${sig}/${total}`);
  lines.push(`- **Anomalies detected**: ${anomalies}/${total}`);
  lines.push(`- **Average speedup across all configurations**: ${avgSpeedup.toFixed(2)}×`);
  if (best) {
    lines.push(`- **Largest observed speedup**: ${best.moduleId} at n=${best.n.toLocaleString()} (${best.speedupRatio.toFixed(2)}×)`);
  }
  if (output.metadata.config.trials < 30) {
    lines.push(`- **Run mode note**: This appears to be a reduced-trial run. Results are useful for replay validation but may not match a full publication-quality benchmark.`);
  }
  lines.push('');
  lines.push(`## Methodology`);
  lines.push('');
  lines.push(`The replay executes selected benchmark modules across configured input sizes. For each configuration, it runs baseline and optimized implementations, summarizes timing distributions, and compares them using effect size and significance estimates.`);
  lines.push('');
  lines.push(`The modules in this run cover:`);
  for (const module of modules) {
    lines.push(`- **${module.id}**: ${module.name} — ${module.description}`);
  }
  lines.push('');
  lines.push(`**Omitted modules (not implemented in this CLI replay):**`);
  lines.push(`- **BM-07** (DOM manipulation inside loop → DocumentFragment): Browser-only; cannot run in a Node.js process.`);
  lines.push('');
  lines.push(`**Note on BM-01 (Regex Compilation):** V8's JIT compiler caches regex literals even when written inline, so hoisting may produce little or no measurable speedup on modern Node.js. The hypothesis of ≥5× improvement (H2) is unlikely to be met on V8 18+; the pattern remains a readability and portability best practice rather than a runtime optimisation on this runtime.`);
  lines.push('');

  for (const module of modules) {
    const comps = output.comparisons.filter(c => c.moduleId === module.id).sort((a, b) => a.n - b.n);
    if (comps.length === 0) continue;
    const codeComp = getCodeComparison(module.id);
    const moduleAvg = comps.reduce((s, c) => s + c.speedupRatio, 0) / comps.length;
    const moduleSig = comps.filter(c => c.significant).length;
    const moduleAnom = comps.filter(c => c.anomaly).length;
    const moduleBest = comps.reduce((acc, c) => c.speedupRatio > acc.speedupRatio ? c : acc, comps[0]);

    lines.push(`## ${module.id}: ${module.name}`);
    lines.push('');
    lines.push(`**What is being tested:** ${module.description}`);
    lines.push('');
    lines.push(`**Baseline pattern**`);
    lines.push('```typescript');
    lines.push(codeComp.bad);
    lines.push('```');
    lines.push('');
    lines.push(`**Optimized pattern**`);
    lines.push('```typescript');
    lines.push(codeComp.good);
    lines.push('```');
    lines.push('');
    lines.push(`**Interpretation**: ${codeComp.explanation}`);
    lines.push('');
    lines.push(`### Findings`);
    lines.push('');
    lines.push(`- **Average speedup**: ${moduleAvg.toFixed(2)}×`);
    lines.push(`- **Best speedup**: ${moduleBest.speedupRatio.toFixed(2)}× at n=${moduleBest.n.toLocaleString()}`);
    lines.push(`- **Significant results**: ${moduleSig}/${comps.length}`);
    lines.push(`- **Anomalies**: ${moduleAnom}/${comps.length}`);
    if (module.hypothesis) {
      const met = comps.filter(c => c.hypothesisMet === true).length;
      lines.push(`- **Hypothesis ${module.hypothesis} met**: ${met}/${comps.length}`);
    }
    lines.push('');
    lines.push(`### Per-Input Results`);
    lines.push('');
    lines.push(`| n | Baseline mean (ms) | Optimized mean (ms) | Speedup | p-value | Effect size | Notes |`);
    lines.push(`|---|--------------------|---------------------|---------|---------|-------------|-------|`);
    for (const comp of comps) {
      const baseSummary = output.summaries.find(s => s.moduleId === module.id && s.pattern === 'baseline' && s.n === comp.n);
      const optSummary = output.summaries.find(s => s.moduleId === module.id && s.pattern === 'optimized' && s.n === comp.n);
      const notes = [comp.significant ? 'significant' : 'not-significant', comp.anomaly ? 'anomaly' : '', comp.hypothesisMet === true ? 'hypothesis-met' : comp.hypothesisMet === false ? 'hypothesis-miss' : ''].filter(Boolean).join(', ');
      lines.push(`| ${comp.n.toLocaleString()} | ${baseSummary?.meanWallMs.toFixed(3) ?? 'N/A'} | ${optSummary?.meanWallMs.toFixed(3) ?? 'N/A'} | ${comp.speedupRatio.toFixed(2)}× | ${comp.pValue.toFixed(4)} | ${comp.cohensD.toFixed(2)} (${comp.effectSize}) | ${notes || '—'} |`);
    }
    lines.push('');
  }

  lines.push(`## Overall Interpretation`);
  lines.push('');
  lines.push(`This replay report reflects the benchmark behavior observed on the current machine and runtime. Differences from previously published study materials are expected when using different Node.js versions, hardware, operating systems, or reduced quick-mode settings.`);
  lines.push('');
  lines.push(`In general, the replay data should be read as:`);
  lines.push(`- **Strong evidence** when speedups are large and consistent across input sizes.`);
  lines.push(`- **Suggestive evidence** when only a subset of configurations are significant.`);
  lines.push(`- **Unstable or low-impact behavior** when anomalies are common or effect sizes are small.`);
  lines.push('');
  lines.push(`## Output Files`);
  lines.push('');
  lines.push(`- Detailed raw data: benchmark JSON output`);
  lines.push(`- Detailed markdown: full summary table and module breakdown`);
  lines.push(`- Brief markdown: short operational summary`);
  lines.push(`- This file: article-style replay report`);
  lines.push('');

  return lines.join('\n');
}

function buildBriefSummaryMarkdown(output: BenchmarkOutput): string {
  const lines: string[] = [];
  lines.push(`# Study 04: Loop Performance — Brief Summary`);
  lines.push('');
  lines.push(`- **Timestamp**: ${output.metadata.timestamp}`);
  lines.push(`- **Node**: ${output.metadata.nodeVersion}`);
  lines.push(`- **Platform**: ${output.metadata.platform} (${output.metadata.arch})`);
  lines.push(`- **Trials**: ${output.metadata.config.trials}`);
  lines.push(`- **Warmup**: ${output.metadata.config.warmupIterations}`);
  lines.push('');

  const total = output.comparisons.length;
  const sig = output.comparisons.filter(c => c.significant).length;
  const anomalies = output.comparisons.filter(c => c.anomaly).length;
  const avgSpeedup = total === 0 ? 0 : output.comparisons.reduce((s, c) => s + c.speedupRatio, 0) / total;
  lines.push(`## Overall`);
  lines.push('');
  lines.push(`- **Configurations Tested**: ${total}`);
  lines.push(`- **Significant (p < 0.05)**: ${sig}/${total}`);
  lines.push(`- **Anomalies (speedup < 1.0)**: ${anomalies}/${total}`);
  lines.push(`- **Average Speedup**: ${avgSpeedup.toFixed(2)}×`);
  lines.push('');

  lines.push(`## By Module (Avg Speedup)`);
  lines.push('');
  lines.push(`| Module | Avg Speedup | Significant | Anomalies |`);
  lines.push(`|--------|-------------|-------------|----------|`);
  const byModule = new Map<string, ComparisonResult[]>();
  for (const c of output.comparisons) {
    const arr = byModule.get(c.moduleId) ?? [];
    arr.push(c);
    byModule.set(c.moduleId, arr);
  }
  for (const [moduleId, comps] of Array.from(byModule.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const mAvg = comps.reduce((s, c) => s + c.speedupRatio, 0) / comps.length;
    const mSig = comps.filter(c => c.significant).length;
    const mAnom = comps.filter(c => c.anomaly).length;
    lines.push(`| ${moduleId} | ${mAvg.toFixed(2)}× | ${mSig}/${comps.length} | ${mAnom}/${comps.length} |`);
  }
  lines.push('');

  return lines.join('\n');
}

async function main(): Promise<void> {
  const config = parseArgs();

  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  const activeModules = MODULES.filter(m =>
    !config.moduleFilter || m.id === config.moduleFilter,
  );

  if (activeModules.length === 0) {
    console.error(`No modules match filter: ${config.moduleFilter}`);
    process.exit(1);
  }

  console.log('\n=== Study 04: Loop Performance Benchmarks ===');
  console.log(`Modules : ${activeModules.map(m => m.id).join(', ')}`);
  console.log(`n values: ${config.nFilter ? [config.nFilter] : N_VALUES}`);
  console.log(`Trials  : ${config.trials}  Warmup: ${config.warmupIterations}`);
  console.log(`Node    : ${process.version}  Platform: ${process.platform}\n`);
  console.log('NOTE: BM-07 (DOM benchmark) remains excluded because it requires a browser runtime.\n');

  const allTrials: TrialRecord[] = [];
  const allSummaries: BenchmarkSummary[] = [];
  const allComparisons: ComparisonResult[] = [];

  const nValues = config.nFilter ? [config.nFilter] : N_VALUES;
  const env = `node_${process.version}`;

  for (const mod of activeModules) {
    console.log(`\n--- ${mod.id}: ${mod.name} ---`);
    for (const n of nValues) {
      if (!mod.nValues.includes(n)) continue;

      const baseTrials = await runTrials(mod, 'baseline', n, config);
      const optTrials = await runTrials(mod, 'optimized', n, config);

      allTrials.push(...baseTrials, ...optTrials);

      const baseSummary = summarize(baseTrials, mod.id, 'baseline', n, env);
      const optSummary = summarize(optTrials, mod.id, 'optimized', n, env);
      allSummaries.push(baseSummary, optSummary);

      const comparison = compare(baseSummary, optSummary, baseTrials, optTrials, hypothesisFn(mod.id));
      allComparisons.push(comparison);

      const flag = comparison.anomaly ? '⚠ ANOMALY' : comparison.hypothesisMet === false ? '✗ H-MISS' : comparison.hypothesisMet ? '✓ H-MET' : '';
      console.log(
        `  n=${n}: speedup=${comparison.speedupRatio.toFixed(2)}×  p=${comparison.pValue.toFixed(4)}  d=${comparison.cohensD.toFixed(2)} (${comparison.effectSize})  ${flag}`,
      );
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const output: BenchmarkOutput = {
    metadata: {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      config,
    },
    trials: allTrials,
    summaries: allSummaries,
    comparisons: allComparisons,
  };

  const outputPath = join(RESULTS_DIR, `bench-${timestamp}.json`);
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);

  const reportMd = buildArticleReportMarkdown(output, activeModules);
  const reportPath = join(RESULTS_DIR, `summary-${timestamp}.md`);
  writeFileSync(reportPath, reportMd);
  console.log(`Summary saved to: ${reportPath}`);

  const flagged = allSummaries.filter(s => s.flaggedHighCV);
  if (flagged.length > 0) {
    console.warn(`\n⚠ ${flagged.length} configuration(s) have CV > 10% — review before publishing:`);
    flagged.forEach(s => console.warn(`  ${s.moduleId} ${s.pattern} n=${s.n}: CV=${s.cvPct.toFixed(1)}%`));
  }
  const anomalies = allComparisons.filter(c => c.anomaly);
  if (anomalies.length > 0) {
    console.warn(`\n⚠ ${anomalies.length} configuration(s) show speedup < 1.0 (optimization slower):`);
    anomalies.forEach(c => console.warn(`  ${c.moduleId} n=${c.n}: speedup=${c.speedupRatio.toFixed(3)}`));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
