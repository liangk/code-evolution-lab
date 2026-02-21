// Core engine — public API
export {
  RuleRegistry,
  analyzeFile,
  analyzeDirectory,
  hashIssue,
  calculateScore,
  createBaseline,
  compareBaseline,
  writeOutputFiles,
} from './engine';

// Types
export type {
  DiagnosticIssue,
  DiagnosticCategory,
  Severity,
  RuleDefinition,
  ScanOptions,
  AnalysisReport,
  AnalysisSummary,
  BaselineSnapshot,
  BaselineDiff,
} from './types';

// Rules
export { getAllRules, loopRules, memoryRules, indexRules, resetIndexRuleCache } from './rules';

// Reporters
export {
  writeJsonReport,
  writeMarkdownReport,
  generateMarkdownReport,
  printReport,
  printBaselineDiff,
  writeScoreFile,
  generateScoreText,
} from './reporter';
