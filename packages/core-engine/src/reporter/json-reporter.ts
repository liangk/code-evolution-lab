import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { AnalysisReport } from '../types';

export function writeJsonReport(report: AnalysisReport, outputDir: string): string {
  mkdirSync(outputDir, { recursive: true });
  const filePath = join(outputDir, 'results.json');
  writeFileSync(filePath, JSON.stringify(report, null, 2));
  return filePath;
}
