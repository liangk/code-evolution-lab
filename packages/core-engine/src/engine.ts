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

const VERSION = '1.0.0';
const JS_EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx', '.mjs']);
const PRISMA_FILES = new Set(['schema.prisma']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '.nuxt', 'build', 'coverage', '__pycache__']);

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

  const issues: DiagnosticIssue[] = [];
  for (const rule of applicable) {
    try {
      const found = rule.detect(relPath, content, rule.needsAst ? ast : undefined);
      issues.push(...found);
    } catch {
      // Rule failed on this file — skip silently
    }
  }

  // Assign stable IDs
  for (const issue of issues) {
    if (!issue.id) issue.id = hashIssue(issue);
  }

  return issues;
}

export function analyzeDirectory(options: ScanOptions, registry: RuleRegistry): AnalysisReport {
  const { targetPath, minSeverity, categories, rules: ruleFilter, exclude } = options;

  let activeRules = registry.getAll();
  if (categories?.length) activeRules = activeRules.filter(r => categories.includes(r.category));
  if (ruleFilter?.length) activeRules = activeRules.filter(r => ruleFilter.includes(r.id));

  const files = collectFiles(targetPath, exclude);
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

  return {
    version: VERSION,
    timestamp: new Date().toISOString(),
    target: targetPath,
    summary,
    issues: filtered,
  };
}

// ---------------------------------------------------------------------------
// Summary builder
// ---------------------------------------------------------------------------

function buildSummary(filesScanned: number, issues: DiagnosticIssue[]): AnalysisSummary {
  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  const byCategory: Record<DiagnosticCategory, number> = { loop: 0, memory: 0, index: 0 };

  for (const i of issues) {
    bySeverity[i.severity]++;
    if (i.category in byCategory) byCategory[i.category]++;
  }

  return {
    filesScanned,
    issuesFound: issues.length,
    bySeverity,
    byCategory,
    confidenceScore: calculateScore(issues),
  };
}

// ---------------------------------------------------------------------------
// Confidence score — weighted by severity and confidence per issue
// ---------------------------------------------------------------------------

export function calculateScore(issues: DiagnosticIssue[]): number {
  if (issues.length === 0) return 100;

  const weights: Record<Severity, number> = { critical: 10, high: 5, medium: 2, low: 1 };
  let totalPenalty = 0;
  for (const i of issues) {
    totalPenalty += weights[i.severity] * i.confidence;
  }

  // Score: 100 minus penalty, clamped to 0–100
  const raw = 100 - totalPenalty;
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
