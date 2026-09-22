import { resolve } from 'path';
import {
  RuleRegistry,
  getAllRules,
  analyzeDirectory,
  attachSolutions,
  printReport,
  writeJsonReport,
  writeMarkdownReport,
  writeScoreFile,
} from '@code-evolution/core-engine';
import type { DiagnosticCategory, Severity } from '@code-evolution/core-engine';
import { resolveScanTargets, warnIfNothingScanned } from '../target';

interface AnalyzeOptions {
  severity?: string;
  category?: string;
  output?: string;
  json?: boolean;
  files?: boolean;
  solutions?: boolean;
}

export async function analyzeCommand(pathArgs: string[] | undefined, options: AnalyzeOptions): Promise<void> {
  const { targetPath, includePaths } = resolveScanTargets(pathArgs ?? []);
  const outputDir = resolve(options.output ?? '.codeevolution');

  // In --json mode stdout carries the report and nothing else, so anything
  // meant for a human is skipped. Warnings go to stderr and are unaffected.
  if (!options.json) {
    console.log(`\nScanning: ${(includePaths ?? [targetPath]).join(', ')}\n`);
  }

  const registry = new RuleRegistry();
  registry.registerAll(getAllRules());

  const categories = options.category
    ? [options.category as DiagnosticCategory]
    : undefined;

  const report = analyzeDirectory({
    targetPath,
    includePaths,
    minSeverity: (options.severity as Severity) ?? 'low',
    categories,
  }, registry);

  warnIfNothingScanned(report.summary.filesScanned, includePaths ?? [targetPath]);

  // Suggested rewrites are opt-in: they need the whole construct re-parsed per
  // finding, and they are only useful if you are going to read them.
  if (options.solutions) {
    report.issues = await attachSolutions(report.issues);
  }

  // Console output (unless --json)
  if (!options.json) {
    printReport(report);
  }

  // Write output files (unless --no-files)
  if (options.files !== false) {
    const jsonPath = writeJsonReport(report, outputDir);
    const mdPath = writeMarkdownReport(report, outputDir);
    const scorePath = writeScoreFile(report, outputDir);

    if (!options.json) {
      console.log(`\nOutput files:`);
      console.log(`  ${jsonPath}`);
      console.log(`  ${mdPath}`);
      console.log(`  ${scorePath}\n`);
    }
  }

  // --json prints the report whether or not files are written. It used to
  // live inside the file-writing branch, so `--json --no-files` printed
  // nothing at all, and a "Scanning" line ahead of it broke every consumer
  // that parsed stdout.
  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  }

  // Non-zero exit if critical issues were found. exitCode rather than
  // process.exit(): with stdout piped, exit() can end the process before a
  // large JSON report has finished writing, and the reader gets a truncated
  // document.
  if (report.summary.bySeverity.critical > 0) {
    process.exitCode = 1;
  }
}
