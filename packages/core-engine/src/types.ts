// ---------------------------------------------------------------------------
// Diagnostic categories — one per empirical study domain
// ---------------------------------------------------------------------------

export type DiagnosticCategory = 'loop' | 'memory' | 'index';

// ---------------------------------------------------------------------------
// Severity levels
// ---------------------------------------------------------------------------

export type Severity = 'critical' | 'high' | 'medium' | 'low';

// ---------------------------------------------------------------------------
// Core issue interface — normalized across all study detectors
// ---------------------------------------------------------------------------

export interface DiagnosticIssue {
  /** Stable hash for dedup and baseline comparison. */
  id: string;
  /** Rule identifier, e.g. "loop/regex-in-loop". */
  rule: string;
  /** Top-level category. */
  category: DiagnosticCategory;
  /** Risk level. */
  severity: Severity;
  /** Repo-relative file path. */
  file: string;
  /** 1-based line number. */
  line: number;
  /** 0-based column (optional). */
  column?: number;
  /** One-line summary. */
  title: string;
  /** Actionable explanation. */
  description: string;
  /** Source code context. */
  snippet?: string;
  /** How to fix. */
  recommendation: string;
  /** e.g. "Study 04, BM-04" */
  studyReference?: string;
  /** e.g. "64× at n=10,000" */
  empiricalSpeedup?: string;
  /** Detection confidence 0.0–1.0. */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Rule definition — each detector exposes an array of these
// ---------------------------------------------------------------------------

export interface RuleDefinition {
  /** Unique rule id, e.g. "loop/regex-in-loop". */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Category this rule belongs to. */
  category: DiagnosticCategory;
  /** Default severity. */
  severity: Severity;
  /** Glob patterns for files this rule applies to. */
  filePatterns: string[];
  /** Whether this rule needs a Babel AST (vs raw text). */
  needsAst: boolean;
  /** The detection function. Receives file path, content, and optionally an AST. */
  detect(filePath: string, content: string, ast?: any): DiagnosticIssue[];
}

// ---------------------------------------------------------------------------
// Scan configuration
// ---------------------------------------------------------------------------

export interface ScanOptions {
  /** Root directory to scan. */
  targetPath: string;
  /** Minimum severity to include in results. */
  minSeverity?: Severity;
  /** Filter by category. */
  categories?: DiagnosticCategory[];
  /** Specific rule IDs to enable (default: all). */
  rules?: string[];
  /** Glob patterns to exclude. */
  exclude?: string[];
}

// ---------------------------------------------------------------------------
// Analysis report — the complete output of a scan
// ---------------------------------------------------------------------------

export interface AnalysisSummary {
  filesScanned: number;
  issuesFound: number;
  bySeverity: Record<Severity, number>;
  byCategory: Record<DiagnosticCategory, number>;
  confidenceScore: number;
}

export interface AnalysisReport {
  version: string;
  timestamp: string;
  target: string;
  summary: AnalysisSummary;
  issues: DiagnosticIssue[];
}

// ---------------------------------------------------------------------------
// Baseline snapshot — for temporal comparison
// ---------------------------------------------------------------------------

export interface BaselineSnapshot {
  version: string;
  createdAt: string;
  target: string;
  summary: AnalysisSummary;
  issueHashes: string[];
  issues: DiagnosticIssue[];
}

export interface BaselineDiff {
  newIssues: DiagnosticIssue[];
  resolvedIssues: DiagnosticIssue[];
  unchangedCount: number;
  scoreDelta: number;
  previousScore: number;
  currentScore: number;
}
