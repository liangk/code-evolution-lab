import type { AnalysisReport, BaselineDiff, DiagnosticIssue, DiagnosticCategory } from '@code-evolution/core-engine';

function severityIcon(s: string): string {
  switch (s) {
    case 'critical': return '🔴';
    case 'high': return '🟠';
    case 'medium': return '🟡';
    default: return '🟢';
  }
}

function issueRow(issue: DiagnosticIssue): string {
  let row = `${severityIcon(issue.severity)} **[${issue.rule}]** \`${issue.file}:${issue.line}\`\n`;
  row += `> ${issue.description}\n`;
  if (issue.studyReference) {
    row += `> *${issue.studyReference}`;
    if (issue.empiricalSpeedup) row += ` — ${issue.empiricalSpeedup}`;
    row += `*\n`;
  }
  return row;
}

export function formatPrComment(report: AnalysisReport, diff?: BaselineDiff): string {
  let md = `## Code Evolution Diagnostics\n\n`;

  // Summary table
  const cats: DiagnosticCategory[] = ['loop', 'memory', 'index'];
  if (diff) {
    md += `| Category | New | Resolved | Total |\n|----------|-----|----------|-------|\n`;
    for (const cat of cats) {
      const total = report.summary.byCategory[cat];
      const newCount = diff.newIssues.filter(i => i.category === cat).length;
      const resolvedCount = diff.resolvedIssues.filter(i => i.category === cat).length;
      if (total > 0 || newCount > 0 || resolvedCount > 0) {
        md += `| ${cat} | ${newCount > 0 ? `+${newCount}` : '0'} | ${resolvedCount > 0 ? `-${resolvedCount}` : '0'} | ${total} |\n`;
      }
    }
  } else {
    md += `| Category | Issues |\n|----------|--------|\n`;
    for (const cat of cats) {
      const count = report.summary.byCategory[cat];
      if (count > 0) md += `| ${cat} | ${count} |\n`;
    }
  }

  // New issues (if baseline comparison available)
  if (diff && diff.newIssues.length > 0) {
    md += `\n### New Issues in This PR\n\n`;
    for (const issue of diff.newIssues.slice(0, 10)) {
      md += issueRow(issue) + '\n';
    }
    if (diff.newIssues.length > 10) {
      md += `*... and ${diff.newIssues.length - 10} more new issues*\n\n`;
    }
  } else if (!diff && report.issues.length > 0) {
    md += `\n### Top Issues\n\n`;
    for (const issue of report.issues.slice(0, 10)) {
      md += issueRow(issue) + '\n';
    }
    if (report.issues.length > 10) {
      md += `*... and ${report.issues.length - 10} more issues (see .codeevolution/hotspots.md)*\n\n`;
    }
  }

  // Resolved
  if (diff && diff.resolvedIssues.length > 0) {
    md += `### Resolved Issues\n\n`;
    for (const issue of diff.resolvedIssues.slice(0, 5)) {
      md += `✅ ~~${issue.rule}~~ \`${issue.file}:${issue.line}\`\n`;
    }
    if (diff.resolvedIssues.length > 5) {
      md += `*... and ${diff.resolvedIssues.length - 5} more resolved*\n`;
    }
    md += '\n';
  }

  // Score
  md += `**Score: ${report.summary.confidenceScore}/100**`;
  if (diff) {
    const arrow = diff.scoreDelta >= 0 ? '📈' : '📉';
    md += ` ${arrow} (was ${diff.previousScore} — ${diff.scoreDelta >= 0 ? '+' : ''}${diff.scoreDelta})`;
  }
  md += '\n\n';

  md += `---\n*Powered by [Code Evolution Lab](https://codeevolutionlab.com) — Evolution-Aware Static Analysis*\n`;
  return md;
}
