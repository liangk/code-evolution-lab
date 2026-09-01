import * as core from '@actions/core';
import * as github from '@actions/github';
import { resolve, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import {
  RuleRegistry,
  getAllRules,
  analyzeDirectory,
  createBaseline,
  compareBaseline,
  writeJsonReport,
  writeMarkdownReport,
  writeScoreFile,
} from '@code-evolution/core-engine';
import type { AnalysisReport, BaselineSnapshot, BaselineDiff, Severity } from '@code-evolution/core-engine';
import { formatPrComment } from './pr-comment';
import { getChangedFiles, filterReportByFiles, filterIssuesByFiles } from './diff-filter';

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };

async function run(): Promise<void> {
  try {
    const inputPath = core.getInput('path') || '.';
    const severity = core.getInput('severity') || 'medium';
    const failOn = core.getInput('fail-on') || 'critical';
    const useBaseline = core.getInput('baseline') === 'true';
    const postComment = core.getInput('comment') === 'true';

    const targetPath = resolve(inputPath);
    const outputDir = join(targetPath, '.codeevolution');

    core.info(`Scanning: ${targetPath}`);
    core.info(`Min severity: ${severity}`);

    const registry = new RuleRegistry();
    registry.registerAll(getAllRules());

    const report = analyzeDirectory({
      targetPath,
      minSeverity: severity as Severity,
    }, registry);

    // Write output files
    writeJsonReport(report, outputDir);
    writeMarkdownReport(report, outputDir);
    writeScoreFile(report, outputDir);

    // Set outputs
    core.setOutput('issues-found', report.summary.issuesFound);
    core.setOutput('confidence-score', report.summary.confidenceScore);

    // Baseline comparison (repo-wide — tracks overall drift since the baseline was captured)
    let diff: BaselineDiff | undefined;
    const baselinePath = join(outputDir, 'baseline.json');

    if (useBaseline && existsSync(baselinePath)) {
      const baseline: BaselineSnapshot = JSON.parse(readFileSync(baselinePath, 'utf-8'));
      diff = compareBaseline(baseline, report);
      core.setOutput('new-issues', diff.newIssues.length);
      core.setOutput('resolved-issues', diff.resolvedIssues.length);
      core.info(`Baseline comparison: +${diff.newIssues.length} new, -${diff.resolvedIssues.length} resolved`);
    }

    // Scope everything PR-facing (comment + fail check) to the files this PR
    // actually changed, so a pre-existing issue elsewhere in the repo can't
    // fail a PR that never touched it, and the comment's summary table always
    // matches its itemized lists.
    let filteredReport = report;
    let prDiff = diff;
    const context = github.context;
    if (context.payload.pull_request) {
      try {
        const token = core.getInput('github-token') || process.env.GITHUB_TOKEN || '';
        if (token) {
          const changedFiles = await getChangedFiles(context, token);
          filteredReport = filterReportByFiles(report, changedFiles);
          if (diff) {
            prDiff = {
              ...diff,
              newIssues: filterIssuesByFiles(diff.newIssues, changedFiles),
              resolvedIssues: filterIssuesByFiles(diff.resolvedIssues, changedFiles),
            };
          }
        }
      } catch (err) {
        core.warning(`Could not filter by changed files: ${(err as Error).message}`);
      }
    }

    // Post PR comment
    if (postComment && context.payload.pull_request) {
      const token = core.getInput('github-token') || process.env.GITHUB_TOKEN || '';
      if (token) {
        const comment = formatPrComment(filteredReport, prDiff);
        const octokit = github.getOctokit(token);
        await octokit.rest.issues.createComment({
          ...context.repo,
          issue_number: context.payload.pull_request.number,
          body: comment,
        });
        core.info('PR comment posted');
      }
    }

    // Log summary
    core.info(`Issues: ${report.summary.issuesFound}`);
    core.info(`Score: ${report.summary.confidenceScore}/100`);

    // Fail check if threshold exceeded — scoped to the PR's changed files on
    // PR runs (filteredReport === report on push/schedule runs, where there's
    // no "changed files" concept to scope to).
    if (failOn !== 'none') {
      const failOrder = SEVERITY_ORDER[failOn] ?? 0;
      const hasFailure = filteredReport.issues.some(i => SEVERITY_ORDER[i.severity] <= failOrder);
      if (hasFailure) {
        core.setFailed(`Issues found at severity '${failOn}' or above.`);
      }
    }
  } catch (error) {
    core.setFailed((error as Error).message);
  }
}

run();
