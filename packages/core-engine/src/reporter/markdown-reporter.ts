import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { AnalysisReport, DiagnosticIssue, Severity } from '../types';

function severityEmoji(s: Severity): string {
  switch (s) {
    case 'critical': return '🔴';
    case 'high': return '🟠';
    case 'medium': return '🟡';
    case 'low': return '🟢';
  }
}

function issueBlock(issue: DiagnosticIssue): string {
  let block = `### ${severityEmoji(issue.severity)} [${issue.rule}] \`${issue.file}:${issue.line}\`\n\n`;
  block += `> ${issue.description}\n\n`;
  if (issue.snippet) block += `\`\`\`\n${issue.snippet}\n\`\`\`\n\n`;
  block += `**Fix:** ${issue.recommendation}\n`;
  if (issue.studyReference) block += `**Evidence:** ${issue.studyReference}`;
  if (issue.empiricalSpeedup) block += ` — ${issue.empiricalSpeedup}`;
  block += '\n';
  return block;
}

export function generateMarkdownReport(report: AnalysisReport): string {
  const { summary, issues } = report;
  let md = `# Code Evolution Lab — Diagnostic Report\n\n`;
  md += `> Scanned **${summary.filesScanned}** files | Found **${summary.issuesFound}** issues | `;
  md += `Confidence: **${summary.confidenceScore}/100**\n\n`;
  md += `*Generated: ${report.timestamp}*\n\n---\n\n`;

  // Summary table
  md += `## Summary\n\n`;
  md += `| Category | Issues |\n|----------|--------|\n`;
  for (const [cat, count] of Object.entries(summary.byCategory)) {
    if (count > 0) md += `| ${cat} | ${count} |\n`;
  }
  md += `\n| Severity | Count |\n|----------|-------|\n`;
  for (const [sev, count] of Object.entries(summary.bySeverity)) {
    if (count > 0) md += `| ${severityEmoji(sev as Severity)} ${sev} | ${count} |\n`;
  }
  md += '\n---\n\n';

  // Group by severity
  const grouped: Record<Severity, DiagnosticIssue[]> = { critical: [], high: [], medium: [], low: [] };
  for (const i of issues) grouped[i.severity].push(i);

  for (const sev of ['critical', 'high', 'medium', 'low'] as Severity[]) {
    const group = grouped[sev];
    if (group.length === 0) continue;
    md += `## ${sev.charAt(0).toUpperCase() + sev.slice(1)} Issues (${group.length})\n\n`;
    for (const issue of group) md += issueBlock(issue) + '\n';
  }

  // Study references
  const studyRefs = new Set(issues.filter(i => i.studyReference).map(i => i.studyReference!));
  if (studyRefs.size > 0) {
    md += `---\n\n## Study References\n\n`;
    for (const ref of studyRefs) {
      const count = issues.filter(i => i.studyReference === ref).length;
      md += `- **${ref}** — ${count} finding(s) match empirically benchmarked anti-patterns\n`;
    }
  }

  md += `\n---\n\n*Powered by [Code Evolution Lab](https://codeevolutionlab.com) — Evolution-Aware Static Analysis*\n`;
  return md;
}

export function writeMarkdownReport(report: AnalysisReport, outputDir: string): string {
  mkdirSync(outputDir, { recursive: true });
  const filePath = join(outputDir, 'hotspots.md');
  writeFileSync(filePath, generateMarkdownReport(report));
  return filePath;
}
