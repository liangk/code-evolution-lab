import { resolve } from 'path';
import {
  RuleRegistry,
  getAllRules,
  analyzeDirectory,
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
}

export async function analyzeCommand(pathArgs: string[] | undefined, options: AnalyzeOptions): Promise<void> {
  const { targetPath, includePaths } = resolveScanTargets(pathArgs ?? []);
  const outputDir = resolve(options.output ?? '.codeevolution');

  console.log(`\nScanning: ${(includePaths ?? [targetPath]).join(', ')}\n`);

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
    } else {
      // JSON-only mode: print the report to stdout
      console.log(JSON.stringify(report, null, 2));
    }
  }

  // Exit with non-zero if critical issues found
  if (report.summary.bySeverity.critical > 0) {
    process.exit(1);
  }
}
