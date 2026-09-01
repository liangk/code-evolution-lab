import * as github from '@actions/github';
import type { AnalysisReport, DiagnosticIssue } from '@code-evolution/core-engine';

/**
 * Fetch the set of files changed in the current pull request.
 * Returns an empty set when not running in a PR context.
 */
export async function getChangedFiles(
  context: typeof github.context,
  token: string,
): Promise<Set<string>> {
  const pr = context.payload.pull_request;
  if (!pr) return new Set();

  const octokit = github.getOctokit(token);

  const { data: files } = await octokit.rest.pulls.listFiles({
    ...context.repo,
    pull_number: pr.number,
    per_page: 300,
  });

  return new Set(files.map(f => f.filename));
}

/**
 * Filter a list of issues down to only those in the given set of files.
 * Used to scope both the current-scan report and a baseline diff to the
 * same set of changed files, so summary counts and itemized lists agree.
 */
export function filterIssuesByFiles(issues: DiagnosticIssue[], files: Set<string>): DiagnosticIssue[] {
  return issues.filter(issue => files.has(issue.file));
}

/**
 * Filter an analysis report to only include issues in the given changed
 * files, rebuilding its summary counts to match the filtered issue list.
 */
export function filterReportByFiles(report: AnalysisReport, files: Set<string>): AnalysisReport {
  const filtered = filterIssuesByFiles(report.issues, files);

  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const byCategory = {
    n1: 0, 'blocking-io': 0, memory: 0, loop: 0, index: 0,
    resource: 0, bundle: 0, dom: 0, payload: 0, redos: 0, caching: 0,
  };
  for (const i of filtered) {
    bySeverity[i.severity]++;
    if (i.category in byCategory) (byCategory as any)[i.category]++;
  }

  return {
    ...report,
    summary: {
      ...report.summary,
      issuesFound: filtered.length,
      bySeverity,
      byCategory,
    },
    issues: filtered,
  };
}
