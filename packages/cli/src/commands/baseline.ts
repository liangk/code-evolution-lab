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
import { resolveScanTargets, warnIfNothingScanned } from '../target';

interface BaselineOptions {
  output?: string;
}

export async function baselineCommand(
  action: string,
  pathArgs: string[] | undefined,
  options: BaselineOptions,
): Promise<void> {
  const outputDir = resolve(options.output ?? '.codeevolution');
  const baselinePath = join(outputDir, 'baseline.json');
  const { targetPath, includePaths } = resolveScanTargets(pathArgs ?? []);

  if (action === 'create') {
    await createBaselineSnapshot(targetPath, includePaths, outputDir, baselinePath);
  } else if (action === 'compare') {
    await compareBaselineSnapshot(targetPath, includePaths, outputDir, baselinePath);
  } else {
    console.error(`Unknown action: ${action}. Use 'scan' or 'compare'.`);
    process.exit(1);
  }
}

async function createBaselineSnapshot(
  targetPath: string,
  includePaths: string[] | undefined,
  outputDir: string,
  baselinePath: string,
): Promise<void> {
  console.log(`\nScanning workspace for baseline snapshot: ${(includePaths ?? [targetPath]).join(', ')}\n`);

  const registry = new RuleRegistry();
  registry.registerAll(getAllRules());

  const report = analyzeDirectory({ targetPath, includePaths }, registry);
  warnIfNothingScanned(report.summary.filesScanned, includePaths ?? [targetPath]);
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

async function compareBaselineSnapshot(
  targetPath: string,
  includePaths: string[] | undefined,
  outputDir: string,
  baselinePath: string,
): Promise<void> {
  if (!existsSync(baselinePath)) {
    console.error(`No scan snapshot found at: ${baselinePath}`);
    console.error(`Run 'code-evolution-lab scan' first.`);
    process.exit(1);
  }

  console.log(`\nComparing workspace against scan snapshot: ${baselinePath}\n`);

  const baseline: BaselineSnapshot = JSON.parse(readFileSync(baselinePath, 'utf-8'));

  if (baseline.target && baseline.target !== targetPath) {
    console.warn(`Warning: the snapshot was taken against ${baseline.target},`);
    console.warn(`but this run is scanning ${targetPath}. The diff will be meaningless.\n`);
  }

  const registry = new RuleRegistry();
  registry.registerAll(getAllRules());

  const report = analyzeDirectory({ targetPath, includePaths }, registry);
  warnIfNothingScanned(report.summary.filesScanned, includePaths ?? [targetPath]);
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
