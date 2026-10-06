import * as core from '@actions/core';
import * as github from '@actions/github';
import { resolve, join, relative, isAbsolute } from 'path';
import { readFileSync, existsSync, statSync } from 'fs';
import {
  RuleRegistry,
  getAllRules,
  analyzeDirectory,
  compareBaseline,
  writeJsonReport,
  writeMarkdownReport,
  writeScoreFile,
} from '@code-evolution/core-engine';
import type { BaselineSnapshot, BaselineDiff, Severity } from '@code-evolution/core-engine';
import { formatPrComment, COMMENT_MARKER } from './pr-comment';
import { getChangedFiles, filterReportByFiles, filterIssuesByFiles } from './diff-filter';

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
const SEVERITIES = ['critical', 'high', 'medium', 'low'];

function readChoice(name: string, fallback: string, allowed: string[]): string {
  const value = (core.getInput(name) || fallback).trim().toLowerCase();
  if (!allowed.includes(value)) {
    throw new Error(`Invalid '${name}' input: '${value}'. Must be one of: ${allowed.join(', ')}.`);
  }
  return value;
}

/**
 * Find the baseline snapshot. The CLI (`code-evolution-lab scan [path]`) writes
 * it to .codeevolution/ in the directory it was run from, i.e. the repo root;
 * older setups may have it next to the scanned path instead.
 */
function findBaseline(workspace: string, targetPath: string): string | undefined {
  const candidates = [
    join(workspace, '.codeevolution', 'baseline.json'),
    join(targetPath, '.codeevolution', 'baseline.json'),
  ];
  return candidates.find(p => existsSync(p));
}

function loadBaseline(path: string): BaselineSnapshot | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    if (!Array.isArray(parsed?.issueHashes) || !Array.isArray(parsed?.issues)) {
      throw new Error('missing issueHashes/issues');
    }
    return parsed as BaselineSnapshot;
  } catch (err) {
    core.warning(`Ignoring baseline at ${path}: ${(err as Error).message}`);
    return undefined;
  }
}

/** Create the action's PR comment, or update it if a previous run left one. */
async function upsertComment(token: string, prNumber: number, body: string): Promise<void> {
  const { context } = github;
  const octokit = github.getOctokit(token);
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    ...context.repo,
    issue_number: prNumber,
    per_page: 100,
  });
  const existing = comments.find(c => c.body?.includes(COMMENT_MARKER));
  if (existing) {
    await octokit.rest.issues.updateComment({ ...context.repo, comment_id: existing.id, body });
    core.info('PR comment updated');
  } else {
    await octokit.rest.issues.createComment({ ...context.repo, issue_number: prNumber, body });
    core.info('PR comment posted');
  }
}

async function run(): Promise<void> {
  try {
    const inputPath = core.getInput('path') || '.';
    const severity = readChoice('severity', 'medium', SEVERITIES) as Severity;
    const failOn = readChoice('fail-on', 'critical', [...SEVERITIES, 'none']);
    const useBaseline = core.getInput('baseline') === 'true';
    const postComment = core.getInput('comment') === 'true';
    const token = core.getInput('github-token') || process.env.GITHUB_TOKEN || '';

    const workspace = resolve(process.env.GITHUB_WORKSPACE || '.');
    const targetPath = resolve(inputPath);
    if (!existsSync(targetPath) || !statSync(targetPath).isDirectory()) {
      throw new Error(`'path' input '${inputPath}' is not a directory (resolved to ${targetPath}).`);
    }
    const outputDir = join(targetPath, '.codeevolution');

    // Issue paths are relative to targetPath; PR file paths are relative to
    // the repo root. This prefix maps one onto the other.
    const rel = relative(workspace, targetPath).replace(/\\/g, '/');
    const scanPrefix = rel.startsWith('..') || isAbsolute(rel) ? '' : rel;

    core.info(`Scanning: ${targetPath}`);
    core.info(`Min severity: ${severity}`);

    const registry = new RuleRegistry();
    registry.registerAll(getAllRules());

    const report = analyzeDirectory({ targetPath, minSeverity: severity }, registry);

    // Write output files
    writeJsonReport(report, outputDir);
    writeMarkdownReport(report, outputDir);
    writeScoreFile(report, outputDir);

    // Set outputs (baseline counts default to 0 so `> 0` checks in workflows work)
    core.setOutput('issues-found', report.summary.issuesFound);
    core.setOutput('confidence-score', report.summary.confidenceScore);
    core.setOutput('new-issues', 0);
    core.setOutput('resolved-issues', 0);

    // Baseline comparison (repo-wide — tracks overall drift since the baseline was captured)
    let diff: BaselineDiff | undefined;
    const baselinePath = useBaseline ? findBaseline(workspace, targetPath) : undefined;
    const baseline = baselinePath ? loadBaseline(baselinePath) : undefined;
    if (baseline) {
      diff = compareBaseline(baseline, report);
      core.setOutput('new-issues', diff.newIssues.length);
      core.setOutput('resolved-issues', diff.resolvedIssues.length);
      core.info(`Baseline ${relative(workspace, baselinePath!)}: +${diff.newIssues.length} new, -${diff.resolvedIssues.length} resolved`);
    }

    // Scope everything PR-facing (comment + fail check) to the files this PR
    // actually changed, so a pre-existing issue elsewhere in the repo can't
    // fail a PR that never touched it, and the comment's summary table always
    // matches its itemized lists.
    let filteredReport = report;
    let prDiff = diff;
    const pr = github.context.payload.pull_request;
    if (pr) {
      if (!token) {
        core.warning('No github-token available: the fail check covers the whole repo, not just this PR\'s changed files.');
      } else {
        try {
          const changedFiles = await getChangedFiles(github.context, token);
          filteredReport = filterReportByFiles(report, changedFiles, scanPrefix);
          if (diff) {
            prDiff = {
              ...diff,
              newIssues: filterIssuesByFiles(diff.newIssues, changedFiles, scanPrefix),
              resolvedIssues: filterIssuesByFiles(diff.resolvedIssues, changedFiles, scanPrefix),
            };
          }
        } catch (err) {
          core.warning(`Could not filter by changed files: ${(err as Error).message}`);
        }
      }
    }

    // Post PR comment. A failure here (e.g. read-only token on a fork PR)
    // must not change the check result.
    if (postComment && pr && token) {
      try {
        await upsertComment(token, pr.number, formatPrComment(filteredReport, prDiff));
      } catch (err) {
        core.warning(`Could not post PR comment: ${(err as Error).message}`);
      }
    }

    // Log summary
    core.info(`Issues: ${report.summary.issuesFound}`);
    core.info(`Score: ${report.summary.confidenceScore}/100`);

    // Fail check if threshold exceeded — scoped to the PR's changed files on
    // PR runs (filteredReport === report on push/schedule runs, where there's
    // no "changed files" concept to scope to).
    if (failOn !== 'none') {
      const failOrder = SEVERITY_ORDER[failOn];
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
