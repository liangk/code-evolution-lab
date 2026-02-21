import type { AnalysisReport, DiagnosticIssue, Severity, BaselineDiff } from '../types';

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '\x1b[91m',  // bright red
  high:     '\x1b[33m',  // yellow
  medium:   '\x1b[36m',  // cyan
  low:      '\x1b[90m',  // gray
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function colorize(text: string, color: string): string { return `${color}${text}${RESET}`; }

function severityLabel(s: Severity): string {
  return colorize(s.toUpperCase().padEnd(8), SEVERITY_COLORS[s]);
}

function issueOneLiner(issue: DiagnosticIssue): string {
  return `  ${severityLabel(issue.severity)} ${colorize(issue.rule, DIM)}  ${issue.file}:${issue.line}\n` +
         `           ${issue.title}\n`;
}

export function printReport(report: AnalysisReport): void {
  const { summary, issues } = report;

  console.log(`\n${BOLD}Code Evolution Lab — Diagnostic Report${RESET}\n`);
  console.log(`  Files scanned:    ${summary.filesScanned}`);
  console.log(`  Issues found:     ${summary.issuesFound}`);
  console.log(`  Confidence score: ${BOLD}${summary.confidenceScore}/100${RESET}\n`);

  // Category breakdown
  console.log(`  ${BOLD}By category:${RESET}`);
  for (const [cat, count] of Object.entries(summary.byCategory)) {
    if (count > 0) console.log(`    ${cat.padEnd(10)} ${count}`);
  }

  // Severity breakdown
  console.log(`\n  ${BOLD}By severity:${RESET}`);
  for (const sev of ['critical', 'high', 'medium', 'low'] as Severity[]) {
    const count = summary.bySeverity[sev];
    if (count > 0) console.log(`    ${severityLabel(sev)} ${count}`);
  }

  if (issues.length === 0) {
    console.log(`\n  ${colorize('✓ No issues found', '\x1b[32m')}\n`);
    return;
  }

  console.log(`\n${BOLD}Issues:${RESET}\n`);

  // Show up to 30 issues
  const shown = issues.slice(0, 30);
  for (const issue of shown) console.log(issueOneLiner(issue));
  if (issues.length > 30) {
    console.log(`  ${DIM}... and ${issues.length - 30} more (see .codeevolution/results.json)${RESET}\n`);
  }
}

export function printBaselineDiff(diff: BaselineDiff): void {
  console.log(`\n${BOLD}Baseline Comparison${RESET}\n`);
  console.log(`  Previous score: ${diff.previousScore}/100`);
  console.log(`  Current score:  ${BOLD}${diff.currentScore}/100${RESET}`);

  const deltaStr = diff.scoreDelta >= 0
    ? colorize(`+${diff.scoreDelta}`, '\x1b[32m')
    : colorize(`${diff.scoreDelta}`, '\x1b[91m');
  console.log(`  Delta:          ${deltaStr}`);
  console.log(`  Unchanged:      ${diff.unchangedCount}`);

  if (diff.newIssues.length > 0) {
    console.log(`\n  ${colorize(`New issues (${diff.newIssues.length}):`, '\x1b[91m')}`);
    for (const issue of diff.newIssues.slice(0, 10)) console.log(issueOneLiner(issue));
  }

  if (diff.resolvedIssues.length > 0) {
    console.log(`\n  ${colorize(`Resolved issues (${diff.resolvedIssues.length}):`, '\x1b[32m')}`);
    for (const issue of diff.resolvedIssues.slice(0, 10)) console.log(`    ✓ ${issue.rule}  ${issue.file}:${issue.line}`);
  }

  console.log('');
}
