import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { AnalysisReport, DiagnosticCategory } from '../types';

export function generateScoreText(report: AnalysisReport): string {
  const { summary } = report;
  let text = `${summary.confidenceScore}/100\n\nBreakdown:\n`;

  const categories: DiagnosticCategory[] = [
    'n1', 'blocking-io', 'memory', 'loop', 'index',
    'resource', 'bundle', 'dom', 'payload', 'redos', 'caching',
  ];
  for (const cat of categories) {
    const catIssues = report.issues.filter(i => i.category === cat);
    if (catIssues.length === 0) {
      text += `  ${cat.padEnd(18)} 100/100 (no issues)\n`;
      continue;
    }
    const highConf = catIssues.filter(i => i.confidence >= 0.8).length;
    // Category score: 100 minus weighted penalties, proportional to total
    const penalty = catIssues.reduce((sum, i) => {
      const w = i.severity === 'critical' ? 10 : i.severity === 'high' ? 5 : i.severity === 'medium' ? 2 : 1;
      return sum + w * i.confidence;
    }, 0);
    const catScore = Math.max(0, Math.min(100, Math.round(100 - penalty)));
    text += `  ${cat.padEnd(18)} ${String(catScore).padStart(3)}/100 (${catIssues.length} issues, ${highConf} high-confidence)\n`;
  }

  text += `\nBased on: 11 completed empirical studies, controlled benchmarks, and real-world corpus scans\n`;
  text += `Generated: ${report.timestamp}\n`;
  return text;
}

export function writeScoreFile(report: AnalysisReport, outputDir: string): string {
  mkdirSync(outputDir, { recursive: true });
  const filePath = join(outputDir, 'confidence-score.txt');
  writeFileSync(filePath, generateScoreText(report));
  return filePath;
}
