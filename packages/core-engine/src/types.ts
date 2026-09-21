// ---------------------------------------------------------------------------
// Diagnostic categories — one per empirical study domain
// ---------------------------------------------------------------------------

export type DiagnosticCategory =
  | 'n1'
  | 'blocking-io'
  | 'memory'
  | 'loop'
  | 'index'
  | 'resource'
  | 'bundle'
  | 'dom'
  | 'payload'
  | 'redos'
  | 'caching';

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
  /** The single source line the finding points at, for console output. */
  snippet?: string;
  /**
   * The whole problematic construct — the loop body, the effect, the handler —
   * not just the line the finding points at. Solution generators transform
   * this, so a one-line snippet produces nothing useful: the loop structure and
   * the variable names are what a batch rewrite has to preserve.
   */
  codeBefore?: string;
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
  /**
   * Called once at the start of each scan, for rules that accumulate state
   * across files. The index rules build a registry of Prisma models from
   * `schema.prisma` and then consult it while scanning query call sites;
   * without a reset, models leak between scans of different projects and
   * produce findings naming fields the current schema does not have.
   */
  reset?: () => void;
  /**
   * Called once after each scan, for rules that can report how much they
   * looked at. A finding count on its own has no denominator: "12 unindexed
   * foreign keys" means something different across 20 foreign keys than
   * across 400, and prevalence is the whole point of an application report.
   * Keys should be namespaced by category, e.g. `index.foreignKeys`.
   */
  metrics?: () => Record<string, number>;
  /** The detection function. Receives file path, content, and optionally an AST. */
  detect(filePath: string, content: string, ast?: any): DiagnosticIssue[];
}

// ---------------------------------------------------------------------------
// Scan configuration
// ---------------------------------------------------------------------------

export interface ScanOptions {
  /** Root directory to scan, and the anchor for relative file paths. */
  targetPath: string;
  /**
   * Directories to actually walk, when the scan covers several sibling
   * directories rather than one tree — `server/{routes,commands,queues}`.
   * Reported paths stay relative to `targetPath`. Omit to walk `targetPath`.
   */
  includePaths?: string[];
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
  /**
   * Denominators contributed by the rules that ran — how many foreign keys
   * were examined, how many query sites, and so on. Absent when no active
   * rule reports any.
   */
  metrics?: Record<string, number>;
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
