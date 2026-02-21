import * as github from '@actions/github';
import type { AnalysisReport } from '@code-evolution/core-engine';

/**
 * Filter an analysis report to only include issues in files changed in the PR.
 */
export async function filterByChangedFiles(
  report: AnalysisReport,
  context: typeof github.context,
  token: string,
): Promise<AnalysisReport> {
  const pr = context.payload.pull_request;
  if (!pr) return report;

  const octokit = github.getOctokit(token);

  // Get list of changed files in the PR
  const { data: files } = await octokit.rest.pulls.listFiles({
    ...context.repo,
    pull_number: pr.number,
    per_page: 300,
  });

  const changedFiles = new Set(files.map(f => f.filename));

  // Filter issues to only those in changed files
  const filtered = report.issues.filter(issue => changedFiles.has(issue.file));

  // Rebuild summary
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const byCategory = { loop: 0, memory: 0, index: 0 };
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
