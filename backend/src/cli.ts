#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { glob } from 'glob';
import { resolve, relative } from 'path';
import { CodeAnalyzer } from './analyzer/code-analyzer';
import { DetectorResult, Issue } from './types';
import { ConfigLoader, CodeEvolutionConfig } from './config/config-loader';

type OutputFormat = 'text' | 'json' | 'sarif';

interface CLIOptions {
  patterns: string[];
  generateSolutions: boolean;
  ignore: string[];
  concurrency: number;
  minSeverity: string;
  format: OutputFormat;
  outputFile: string | null;
  failOn: string;
}

interface FileResult {
  filePath: string;
  results: DetectorResult[];
  error?: string;
}

interface AggregateSummary {
  totalFiles: number;
  filesWithIssues: number;
  totalIssues: number;
  bySeverity: Record<string, number>;
  byDetector: Record<string, number>;
}

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    patterns: [],
    generateSolutions: false,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
    concurrency: 4,
    minSeverity: 'low',
    format: 'text',
    outputFile: null,
    failOn: 'low',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--solutions') {
      options.generateSolutions = true;
    } else if (arg === '--ignore' && args[i + 1]) {
      options.ignore.push(args[++i]);
    } else if (arg === '--concurrency' && args[i + 1]) {
      options.concurrency = parseInt(args[++i], 10) || 4;
    } else if (arg === '--min-severity' && args[i + 1]) {
      options.minSeverity = args[++i];
    } else if (arg === '--format' && args[i + 1]) {
      const fmt = args[++i].toLowerCase();
      if (fmt === 'json' || fmt === 'sarif' || fmt === 'text') {
        options.format = fmt;
      }
    } else if ((arg === '--output' || arg === '-o') && args[i + 1]) {
      options.outputFile = args[++i];
    } else if (arg === '--fail-on' && args[i + 1]) {
      options.failOn = args[++i];
    } else if (!arg.startsWith('--')) {
      options.patterns.push(arg);
    }
  }

  return options;
}

function showUsage(): void {
  console.log(`
Usage: code-evolution-lab <file-or-pattern> [options]

Arguments:
  <file-or-pattern>   File path or glob pattern (e.g., "src/**/*.ts")

Options:
  --solutions         Generate solution suggestions for detected issues
  --ignore <pattern>  Add ignore pattern (can be used multiple times)
  --concurrency <n>   Number of files to process in parallel (default: 4)
  --min-severity <s>  Minimum severity to report: low, medium, high, critical
  --format <fmt>      Output format: text (default), json, sarif
  --output, -o <file> Write results to file instead of stdout
  --fail-on <s>       Exit with code 1 if issues >= severity: low, medium, high, critical

Examples:
  code-evolution-lab ./src/index.ts
  code-evolution-lab "src/**/*.ts" --solutions
  code-evolution-lab "src/**/*.js" --format json -o results.json
  code-evolution-lab "src/**/*.ts" --format sarif -o report.sarif --fail-on high

Default ignore patterns:
  - **/node_modules/**
  - **/dist/**
  - **/build/**
  - **/.git/**
`);
}

async function resolveFiles(patterns: string[], ignore: string[]): Promise<string[]> {
  const allFiles: Set<string> = new Set();

  for (const pattern of patterns) {
    if (existsSync(pattern) && statSync(pattern).isFile()) {
      allFiles.add(resolve(pattern));
    } else {
      const matches = await glob(pattern, { ignore, nodir: true, absolute: true });
      matches.forEach((f: string) => allFiles.add(f));
    }
  }

  return Array.from(allFiles).filter(f => /\.(js|ts|jsx|tsx|mjs|cjs)$/.test(f));
}

async function analyzeFile(
  filePath: string,
  analyzer: CodeAnalyzer,
  generateSolutions: boolean
): Promise<FileResult> {
  try {
    const sourceCode = readFileSync(filePath, 'utf-8');
    const results = await analyzer.analyzeCode(sourceCode, filePath, generateSolutions);
    return { filePath, results };
  } catch (error) {
    return { filePath, results: [], error: (error as Error).message };
  }
}

async function analyzeFilesInParallel(
  files: string[],
  analyzer: CodeAnalyzer,
  options: CLIOptions
): Promise<FileResult[]> {
  const results: FileResult[] = [];
  const chunks: string[][] = [];

  for (let i = 0; i < files.length; i += options.concurrency) {
    chunks.push(files.slice(i, i + options.concurrency));
  }

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map(f => analyzeFile(f, analyzer, options.generateSolutions))
    );
    results.push(...chunkResults);

    process.stdout.write(`\rAnalyzed ${results.length}/${files.length} files...`);
  }

  console.log('');
  return results;
}

function filterBySeverity(issue: Issue, minSeverity: string): boolean {
  const severityOrder = ['low', 'medium', 'high', 'critical'];
  const minIndex = severityOrder.indexOf(minSeverity);
  const issueIndex = severityOrder.indexOf(issue.severity);
  return issueIndex >= minIndex;
}

function aggregateResults(fileResults: FileResult[], minSeverity: string): AggregateSummary {
  const summary: AggregateSummary = {
    totalFiles: fileResults.length,
    filesWithIssues: 0,
    totalIssues: 0,
    bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
    byDetector: {},
  };

  for (const fr of fileResults) {
    let fileHasIssues = false;

    for (const dr of fr.results) {
      const filteredIssues = dr.issues.filter(i => filterBySeverity(i, minSeverity));

      if (filteredIssues.length > 0) {
        fileHasIssues = true;
        summary.totalIssues += filteredIssues.length;
        summary.byDetector[dr.detectorName] = (summary.byDetector[dr.detectorName] || 0) + filteredIssues.length;

        for (const issue of filteredIssues) {
          summary.bySeverity[issue.severity]++;
        }
      }
    }

    if (fileHasIssues) summary.filesWithIssues++;
  }

  return summary;
}

function printFileResults(fr: FileResult, minSeverity: string): void {
  const relPath = relative(process.cwd(), fr.filePath);

  if (fr.error) {
    console.log(`\n⚠️  ${relPath}: Error - ${fr.error}`);
    return;
  }

  let fileIssueCount = 0;
  for (const dr of fr.results) {
    fileIssueCount += dr.issues.filter(i => filterBySeverity(i, minSeverity)).length;
  }

  if (fileIssueCount === 0) return;

  console.log(`\n📄 ${relPath} (${fileIssueCount} issues)`);

  for (const dr of fr.results) {
    const filteredIssues = dr.issues.filter(i => filterBySeverity(i, minSeverity));
    if (filteredIssues.length === 0) continue;

    console.log(`\n  === ${dr.detectorName} ===`);

    filteredIssues.forEach((issue, index) => {
      console.log(`\n  [${index + 1}] ${issue.title}`);
      console.log(`  Severity: ${issue.severity.toUpperCase()}`);
      console.log(`  Line: ${issue.lineNumber}`);
      console.log(`  ${issue.description}`);

      if (issue.estimatedImpact) {
        const { severityScore, confidenceScore, description, metrics } = issue.estimatedImpact;
        console.log(`  Impact Score: ${severityScore}/10 (Confidence: ${confidenceScore}%)`);
        console.log(`  Impact: ${description}`);
        if (Object.keys(metrics).length > 0) {
          console.log('  Metrics:', Object.entries(metrics).map(([k, v]) => 
            `${k}: ${Array.isArray(v) ? v.join(', ') : v}`
          ).join(' | '));
        }
      }

      const issueWithSolutions = issue as any;
      if (issueWithSolutions.solutions?.length > 0) {
        console.log(`\n  📋 Solutions (${issueWithSolutions.solutions.length}):`);
        issueWithSolutions.solutions.slice(0, 2).forEach((sol: any, si: number) => {
          console.log(`    ${si + 1}. ${sol.type.replace(/_/g, ' ')} (score: ${sol.fitnessScore.toFixed(1)})`);
        });
      }
    });
  }
}

function printSummary(summary: AggregateSummary): void {
  console.log('\n' + '='.repeat(60));
  console.log('📊 ANALYSIS SUMMARY');
  console.log('='.repeat(60));

  console.log(`\nFiles analyzed: ${summary.totalFiles}`);
  console.log(`Files with issues: ${summary.filesWithIssues}`);
  console.log(`Total issues: ${summary.totalIssues}`);

  console.log('\nBy Severity:');
  if (summary.bySeverity.critical > 0) console.log(`  🔴 Critical: ${summary.bySeverity.critical}`);
  if (summary.bySeverity.high > 0) console.log(`  🟠 High: ${summary.bySeverity.high}`);
  if (summary.bySeverity.medium > 0) console.log(`  🟡 Medium: ${summary.bySeverity.medium}`);
  if (summary.bySeverity.low > 0) console.log(`  🟢 Low: ${summary.bySeverity.low}`);

  if (Object.keys(summary.byDetector).length > 0) {
    console.log('\nBy Detector:');
    for (const [detector, count] of Object.entries(summary.byDetector)) {
      console.log(`  - ${detector}: ${count}`);
    }
  }

  console.log('');
}

function formatJSON(fileResults: FileResult[], summary: AggregateSummary, minSeverity: string): string {
  const output = {
    summary,
    files: fileResults.map(fr => ({
      filePath: fr.filePath,
      error: fr.error,
      detectors: fr.results.map(dr => ({
        name: dr.detectorName,
        issues: dr.issues.filter(i => filterBySeverity(i, minSeverity)),
      })),
    })),
  };
  return JSON.stringify(output, null, 2);
}

function severityToSARIF(severity: string): string {
  switch (severity) {
    case 'critical': return 'error';
    case 'high': return 'error';
    case 'medium': return 'warning';
    case 'low': return 'note';
    default: return 'note';
  }
}

function formatSARIF(fileResults: FileResult[], minSeverity: string): string {
  const results: any[] = [];
  const rules: any[] = [];
  const ruleIds = new Set<string>();

  for (const fr of fileResults) {
    for (const dr of fr.results) {
      const filteredIssues = dr.issues.filter(i => filterBySeverity(i, minSeverity));
      for (const issue of filteredIssues) {
        const ruleId = issue.type;
        if (!ruleIds.has(ruleId)) {
          ruleIds.add(ruleId);
          rules.push({
            id: ruleId,
            name: issue.title,
            shortDescription: { text: issue.title },
            fullDescription: { text: issue.description },
            defaultConfiguration: { level: severityToSARIF(issue.severity) },
          });
        }

        results.push({
          ruleId,
          level: severityToSARIF(issue.severity),
          message: { text: issue.description },
          locations: [{
            physicalLocation: {
              artifactLocation: { uri: relative(process.cwd(), fr.filePath).replace(/\\/g, '/') },
              region: { startLine: issue.lineNumber, startColumn: 1 },
            },
          }],
        });
      }
    }
  }

  const sarif = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'Code Evolution Lab',
          version: '1.0.0',
          informationUri: 'https://github.com/liangk/code-evolution-lab',
          rules,
        },
      },
      results,
    }],
  };

  return JSON.stringify(sarif, null, 2);
}

function shouldFail(summary: AggregateSummary, failOn: string): boolean {
  const severityOrder = ['low', 'medium', 'high', 'critical'];
  const failIndex = severityOrder.indexOf(failOn);

  for (let i = failIndex; i < severityOrder.length; i++) {
    const sev = severityOrder[i];
    if (summary.bySeverity[sev] > 0) return true;
  }
  return false;
}

function writeOutput(content: string, outputFile: string | null): void {
  if (outputFile) {
    writeFileSync(outputFile, content, 'utf-8');
    console.log(`Results written to: ${outputFile}`);
  } else {
    console.log(content);
  }
}

function applyConfigToOptions(options: CLIOptions, config: CodeEvolutionConfig): void {
  if (config.ignore) {
    options.ignore = [...options.ignore, ...config.ignore];
  }
  if (config.severity?.minReportLevel && options.minSeverity === 'low') {
    options.minSeverity = config.severity.minReportLevel;
  }
  if (config.severity?.failOn && options.failOn === 'low') {
    options.failOn = config.severity.failOn;
  }
  if (config.output?.format && options.format === 'text') {
    options.format = config.output.format as OutputFormat;
  }
  if (config.output?.file && !options.outputFile) {
    options.outputFile = config.output.file;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const options = parseArgs(args);

  const configLoader = new ConfigLoader();
  const config = configLoader.load();
  const configPath = configLoader.getConfigPath();

  applyConfigToOptions(options, config);

  if (options.patterns.length === 0) {
    console.error('Error: No file or pattern specified');
    showUsage();
    process.exit(1);
  }

  const isQuiet = options.format !== 'text';

  if (!isQuiet && configPath) {
    console.log(`Using config: ${relative(process.cwd(), configPath)}`);
  }

  if (!isQuiet) console.log('\n🔍 Code Evolution Lab - Performance Analysis\n');

  const files = await resolveFiles(options.patterns, options.ignore);

  if (files.length === 0) {
    console.error('Error: No matching files found');
    process.exit(1);
  }

  if (!isQuiet) {
    console.log(`Found ${files.length} file(s) to analyze`);
    if (options.generateSolutions) console.log('Solution generation: enabled');
    if (options.minSeverity !== 'low') console.log(`Minimum severity: ${options.minSeverity}`);
  }

  const analyzer = new CodeAnalyzer();
  const fileResults = await analyzeFilesInParallel(files, analyzer, options);
  const summary = aggregateResults(fileResults, options.minSeverity);

  if (options.format === 'json') {
    const jsonOutput = formatJSON(fileResults, summary, options.minSeverity);
    writeOutput(jsonOutput, options.outputFile);
  } else if (options.format === 'sarif') {
    const sarifOutput = formatSARIF(fileResults, options.minSeverity);
    writeOutput(sarifOutput, options.outputFile);
  } else {
    for (const fr of fileResults) {
      printFileResults(fr, options.minSeverity);
    }
    printSummary(summary);
  }

  if (shouldFail(summary, options.failOn)) {
    process.exit(1);
  }
}

main();
