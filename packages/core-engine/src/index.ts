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
export {
  getAllRules,
  loopRules,
  memoryRules,
  indexRules,
  resetIndexRuleCache,
  n1Rules,
  blockingIoRules,
  resourceRules,
  bundleRules,
  domRules,
  payloadRules,
  redosRules,
  cachingRules,
} from './rules';

// Schema analysis, exposed for study harnesses so corpus figures come from the
// same implementation the CLI ships rather than a second parser that can drift.
export { parseSchema, indexRuleMetrics, foreignKeyCoverage } from './rules/index-rules';
export type { ForeignKeyCoverage } from './rules/index-rules';

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

// Solutions
export {
  generateSolutionsFor,
  attachSolutions,
  hasSolutionGenerator,
  BaseSolutionGenerator,
  N1SolutionGenerator,
  FitnessCalculator,
  WEIGHT_PRESETS,
  analyzeCodePattern,
  generateTransformationCandidates,
} from './solutions';

export type {
  Solution,
  SolutionContext,
  CodePattern,
  TransformationResult,
  WeightPreset,
} from './solutions';
