import { resolve, join } from 'path';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import {
  RuleRegistry,
  getAllRules,
  analyzeDirectory,
  createBaseline,
  compareBaseline,
  printReport,
  printBaselineDiff,
  writeJsonReport,
  writeMarkdownReport,
  writeScoreFile,
} from '@code-evolution/core-engine';
import type { BaselineSnapshot } from '@code-evolution/core-engine';

interface BaselineOptions {
  output?: string;
}

export async function baselineCommand(action: string, options: BaselineOptions): Promise<void> {
  const outputDir = resolve(options.output ?? '.codeevolution');
  const baselinePath = join(outputDir, 'baseline.json');

  if (action === 'create') {
    await createBaselineSnapshot(outputDir, baselinePath);
  } else if (action === 'compare') {
    await compareBaselineSnapshot(outputDir, baselinePath);
  } else {
    console.error(`Unknown action: ${action}. Use 'scan' or 'compare'.`);
    process.exit(1);
  }
}

async function createBaselineSnapshot(outputDir: string, baselinePath: string): Promise<void> {
  const targetPath = resolve('.');
  console.log(`\nScanning workspace for baseline snapshot: ${targetPath}\n`);

  const registry = new RuleRegistry();
  registry.registerAll(getAllRules());

  const report = analyzeDirectory({ targetPath }, registry);
  const baseline = createBaseline(report);

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));

  printReport(report);
  writeJsonReport(report, outputDir);
  writeMarkdownReport(report, outputDir);
  writeScoreFile(report, outputDir);

  console.log(`\nScan snapshot saved: ${baselinePath}`);
  console.log(`Score: ${baseline.summary.confidenceScore}/100`);
  console.log(`Issues: ${baseline.summary.issuesFound}\n`);
}

async function compareBaselineSnapshot(outputDir: string, baselinePath: string): Promise<void> {
  if (!existsSync(baselinePath)) {
    console.error(`No scan snapshot found at: ${baselinePath}`);
    console.error(`Run 'code-evolution-lab scan' first.`);
    process.exit(1);
  }

  const targetPath = resolve('.');
  console.log(`\nComparing workspace against scan snapshot: ${baselinePath}\n`);

  const baseline: BaselineSnapshot = JSON.parse(readFileSync(baselinePath, 'utf-8'));

  const registry = new RuleRegistry();
  registry.registerAll(getAllRules());

  const report = analyzeDirectory({ targetPath }, registry);
  const diff = compareBaseline(baseline, report);

  printBaselineDiff(diff);

  // Update output files with current state
  writeJsonReport(report, outputDir);
  writeMarkdownReport(report, outputDir);
  writeScoreFile(report, outputDir);

  // Exit non-zero if score decreased
  if (diff.scoreDelta < 0) {
    console.log(`Score decreased by ${Math.abs(diff.scoreDelta)} points. Failing.\n`);
    process.exit(1);
  }
}
