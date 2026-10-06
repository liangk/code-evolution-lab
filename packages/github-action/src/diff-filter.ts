import * as github from '@actions/github';
import type { AnalysisReport, DiagnosticIssue } from '@code-evolution/core-engine';

/**
 * Fetch the set of files changed in the current pull request, as paths
 * relative to the repository root. Paginates: the API caps per_page at 100.
 * Returns an empty set when not running in a PR context.
 */
export async function getChangedFiles(
  context: typeof github.context,
  token: string,
): Promise<Set<string>> {
  const pr = context.payload.pull_request;
  if (!pr) return new Set();

  const octokit = github.getOctokit(token);

  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    ...context.repo,
    pull_number: pr.number,
    per_page: 100,
  });

  return new Set(files.map(f => f.filename));
}

/**
 * Issue paths are relative to the scanned directory (the `path` input);
 * PR file paths are relative to the repo root. `scanPrefix` is the scanned
 * directory relative to the repo root ('' when scanning the root).
 */
function repoPath(issue: DiagnosticIssue, scanPrefix: string): string {
  return scanPrefix ? `${scanPrefix}/${issue.file}` : issue.file;
}

/**
 * Filter a list of issues down to only those in the given set of files.
 * Used to scope both the current-scan report and a baseline diff to the
 * same set of changed files, so summary counts and itemized lists agree.
 */
export function filterIssuesByFiles(
  issues: DiagnosticIssue[],
  files: Set<string>,
  scanPrefix = '',
): DiagnosticIssue[] {
  return issues.filter(issue => files.has(repoPath(issue, scanPrefix)));
}

/**
 * Filter an analysis report to only include issues in the given changed
 * files, rebuilding its summary counts to match the filtered issue list.
 */
export function filterReportByFiles(
  report: AnalysisReport,
  files: Set<string>,
  scanPrefix = '',
): AnalysisReport {
  const filtered = filterIssuesByFiles(report.issues, files, scanPrefix);

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
