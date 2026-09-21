import * as parser from '@babel/parser';
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, extname, relative } from 'path';
import { createHash } from 'crypto';
import type {
  RuleDefinition, DiagnosticIssue, ScanOptions, AnalysisReport,
  AnalysisSummary, Severity, DiagnosticCategory, BaselineSnapshot, BaselineDiff,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Read from package.json rather than written here. This was a literal '1.0.0'
// that was never bumped, so every results.json from 1.2.x claimed to come
// from 1.0.0 — and a result that cannot say which rules produced it cannot be
// reproduced. `../package.json` resolves from both src/ (tests) and dist/
// (published), and npm always ships package.json regardless of `files`.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const VERSION: string = require('../package.json').version;
const JS_EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx', '.mjs']);
const PRISMA_FILES = new Set(['schema.prisma']);
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', '.next', '.nuxt', 'build', 'coverage', '__pycache__',
  '__tests__', '__mocks__', 'e2e', '.turbo',
]);

// Test and spec files are excluded by default. A performance scan is about
// code that runs in production: a deliberate N+1 in a fixture is not a finding,
// and letting test files into the count skews the score against codebases that
// are well tested.
const TEST_FILE = /\.(test|spec|e2e)\.[cm]?[jt]sx?$/;

// Points deducted per unit of penalty density (penalty per file scanned).
// At 25, one high-severity finding in every file scores 0, one every four
// files scores 75, and a clean tree scores 100.
const DENSITY_SCALE = 25;

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// ---------------------------------------------------------------------------
// Issue hashing — stable across runs for the same issue
// ---------------------------------------------------------------------------

export function hashIssue(issue: DiagnosticIssue): string {
  const raw = `${issue.rule}::${issue.file}::${issue.line}::${issue.title}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 12);
}

// ---------------------------------------------------------------------------
// Rule Registry
// ---------------------------------------------------------------------------

export class RuleRegistry {
  private rules: RuleDefinition[] = [];

  register(rule: RuleDefinition): void { this.rules.push(rule); }
  registerAll(rules: RuleDefinition[]): void { rules.forEach(r => this.register(r)); }
  getAll(): RuleDefinition[] { return [...this.rules]; }
  getByCategory(cat: DiagnosticCategory): RuleDefinition[] { return this.rules.filter(r => r.category === cat); }
  getById(id: string): RuleDefinition | undefined { return this.rules.find(r => r.id === id); }
}

// ---------------------------------------------------------------------------
// AST Cache — parse once per file, reuse across rules
// ---------------------------------------------------------------------------

function tryParseAst(content: string): any | null {
  try {
    return parser.parse(content, {
      sourceType: 'unambiguous',
      plugins: ['jsx', 'typescript', 'decorators-legacy'],
      errorRecovery: true,
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

function collectFiles(dir: string, exclude: string[] = []): string[] {
  const files: string[] = [];
  const excludeSet = new Set(exclude);

  function walk(current: string): void {
    let entries: string[];
    try { entries = readdirSync(current); } catch { return; }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry) || excludeSet.has(entry)) continue;
      const full = join(current, entry);
      let stat;
      try { stat = statSync(full); } catch { continue; }
      if (stat.isDirectory()) { walk(full); continue; }
      if (TEST_FILE.test(entry)) continue;
      const ext = extname(entry);
      if (JS_EXTENSIONS.has(ext) || PRISMA_FILES.has(entry)) {
        files.push(full);
      }
    }
  }

  walk(dir);
  return files;
}

// ---------------------------------------------------------------------------
// File-to-rule matching
// ---------------------------------------------------------------------------

function rulesForFile(fileName: string, rules: RuleDefinition[]): RuleDefinition[] {
  return rules.filter(rule => {
    return rule.filePatterns.some(pattern => {
      if (pattern.startsWith('*.')) return fileName.endsWith(pattern.slice(1));
      return fileName === pattern || fileName.endsWith(pattern);
    });
  });
}

// ---------------------------------------------------------------------------
// Core analyze functions
// ---------------------------------------------------------------------------

export function analyzeFile(
  filePath: string,
  targetRoot: string,
  rules: RuleDefinition[],
): DiagnosticIssue[] {
  const fileName = filePath.split(/[\\/]/).pop() ?? '';
  const applicable = rulesForFile(fileName, rules);
  if (applicable.length === 0) return [];

  let content: string;
  try { content = readFileSync(filePath, 'utf-8'); } catch { return []; }

  const relPath = relative(targetRoot, filePath).replace(/\\/g, '/');
  const needsAst = applicable.some(r => r.needsAst);
  const ast = needsAst ? tryParseAst(content) : null;

  // Several RuleDefinitions commonly share one detect() function — one AST
  // traversal that emits every issue for its whole rule family in a single
  // call, with each issue already tagged with its own specific `rule` id.
  // Calling detect() once per RuleDefinition (instead of once per unique
  // function) would replay that same full traversal result once per sibling
  // rule id, duplicating every real finding N times over. Deduplicate by
  // function identity, and filter each family's output down to the rule ids
  // actually enabled for this scan, so a `rules`/`categories` filter applies
  // correctly even when several ids share one detector.
  const uniqueDetectors = new Set(applicable.map(r => r.detect));
  const enabledRuleIds = new Set(applicable.map(r => r.id));

  const issues: DiagnosticIssue[] = [];
  for (const detect of uniqueDetectors) {
    const owner = applicable.find(r => r.detect === detect);
    try {
      const found = detect(relPath, content, owner?.needsAst ? ast : undefined);
      issues.push(...found.filter(i => enabledRuleIds.has(i.rule)));
    } catch {
      // Rule family failed on this file — skip silently
    }
  }

  // Assign stable IDs
  for (const issue of issues) {
    if (!issue.id) issue.id = hashIssue(issue);
  }

  return issues;
}

/**
 * Schema files first.
 *
 * The index rules read `schema.prisma` to learn which models and indexes
 * exist, then use that while scanning query call sites. Directory order
 * decided whether the schema was seen first, so on a project laid out as
 * `src/` before `prisma/` the query rules silently found nothing — no error,
 * no warning, just zero findings.
 */
function schemaFirst(a: string, b: string): number {
  const aSchema = a.endsWith('.prisma') ? 0 : 1;
  const bSchema = b.endsWith('.prisma') ? 0 : 1;
  return aSchema - bSchema || a.localeCompare(b);
}

export function analyzeDirectory(options: ScanOptions, registry: RuleRegistry): AnalysisReport {
  const { targetPath, includePaths, minSeverity, categories, rules: ruleFilter, exclude } = options;

  let activeRules = registry.getAll();
  if (categories?.length) activeRules = activeRules.filter(r => categories.includes(r.category));
  if (ruleFilter?.length) activeRules = activeRules.filter(r => ruleFilter.includes(r.id));

  // Rules that accumulate state across files start each scan clean.
  for (const rule of activeRules) rule.reset?.();

  // A scan can cover several sibling directories rather than one tree. Walk
  // each, but keep reported paths anchored at targetPath so they read the same
  // either way, and deduplicate in case one root nests inside another.
  const roots = includePaths?.length ? includePaths : [targetPath];
  const files = [...new Set(roots.flatMap(root => collectFiles(root, exclude)))].sort(schemaFirst);
  const allIssues: DiagnosticIssue[] = [];

  for (const file of files) {
    const issues = analyzeFile(file, targetPath, activeRules);
    allIssues.push(...issues);
  }

  // Filter by severity
  const minSev = minSeverity ?? 'low';
  const minOrder = SEVERITY_ORDER[minSev];
  const filtered = allIssues.filter(i => SEVERITY_ORDER[i.severity] <= minOrder);

  // Sort: critical first, then by file
  filtered.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return a.file.localeCompare(b.file) || a.line - b.line;
  });

  const summary = buildSummary(files.length, filtered);

  // Denominators from the rules that ran. Collected after the scan, since a
  // rule can only say how much it examined once it has examined it.
  const metrics: Record<string, number> = {};
  const seenMetricFns = new Set<() => Record<string, number>>();
  for (const rule of activeRules) {
    if (!rule.metrics || seenMetricFns.has(rule.metrics)) continue;
    seenMetricFns.add(rule.metrics);
    try {
      Object.assign(metrics, rule.metrics());
    } catch {
      // A rule that cannot report its denominators does not fail the scan.
    }
  }

  return {
    version: VERSION,
    timestamp: new Date().toISOString(),
    target: targetPath,
    summary,
    ...(Object.keys(metrics).length > 0 ? { metrics } : {}),
    issues: filtered,
  };
}

// ---------------------------------------------------------------------------
// Summary builder
// ---------------------------------------------------------------------------

function buildSummary(filesScanned: number, issues: DiagnosticIssue[]): AnalysisSummary {
  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  const byCategory: Record<DiagnosticCategory, number> = {
    n1: 0, 'blocking-io': 0, memory: 0, loop: 0, index: 0,
    resource: 0, bundle: 0, dom: 0, payload: 0, redos: 0, caching: 0,
  };

  for (const i of issues) {
    bySeverity[i.severity]++;
    if (i.category in byCategory) byCategory[i.category]++;
  }

  return {
    filesScanned,
    issuesFound: issues.length,
    bySeverity,
    byCategory,
    confidenceScore: calculateScore(issues, filesScanned),
  };
}

// ---------------------------------------------------------------------------
// Confidence score — penalty density, weighted by severity and confidence
// ---------------------------------------------------------------------------

/**
 * Score a scan from 0 (worst) to 100 (clean).
 *
 * The penalty is normalised by the number of files scanned. An absolute
 * penalty saturates: at weight 5 and confidence 0.8, twenty-five
 * high-severity findings already exceed 100, so every project past that point
 * scores exactly 0. That makes the score identical for a 300-file package and
 * a 300,000-line monolith, and — worse — makes `compareBaseline`'s scoreDelta
 * permanently 0, so the CI guard in `compare` can never fire. Scoring density
 * instead keeps the number responsive at any scan size.
 *
 * `filesScanned` is required: passing 0 or a negative number is treated as 1.
 */
export function calculateScore(issues: DiagnosticIssue[], filesScanned: number): number {
  if (issues.length === 0) return 100;

  const weights: Record<Severity, number> = { critical: 10, high: 5, medium: 2, low: 1 };
  let totalPenalty = 0;
  for (const i of issues) {
    totalPenalty += weights[i.severity] * i.confidence;
  }

  const density = totalPenalty / Math.max(filesScanned, 1);
  const raw = 100 - density * DENSITY_SCALE;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

// ---------------------------------------------------------------------------
// Baseline operations
// ---------------------------------------------------------------------------

export function createBaseline(report: AnalysisReport): BaselineSnapshot {
  return {
    version: VERSION,
    createdAt: report.timestamp,
    target: report.target,
    summary: report.summary,
    issueHashes: report.issues.map(i => i.id),
    issues: report.issues,
  };
}

export function compareBaseline(baseline: BaselineSnapshot, current: AnalysisReport): BaselineDiff {
  const baseHashes = new Set(baseline.issueHashes);
  const currentHashes = new Set(current.issues.map(i => i.id));

  const newIssues = current.issues.filter(i => !baseHashes.has(i.id));
  const resolvedIssues = baseline.issues.filter(i => !currentHashes.has(i.id));
  const unchangedCount = current.issues.length - newIssues.length;

  return {
    newIssues,
    resolvedIssues,
    unchangedCount,
    scoreDelta: current.summary.confidenceScore - baseline.summary.confidenceScore,
    previousScore: baseline.summary.confidenceScore,
    currentScore: current.summary.confidenceScore,
  };
}

// ---------------------------------------------------------------------------
// Output directory helper
// ---------------------------------------------------------------------------

export function writeOutputFiles(report: AnalysisReport, outputDir: string): void {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'results.json'), JSON.stringify(report, null, 2));
}
