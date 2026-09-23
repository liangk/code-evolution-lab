/**
 * Solution generation.
 *
 * Attaches suggested rewrites to findings. One generator per category; N+1
 * and missing index are ported so far, and a category without a generator
 * simply gets no solutions rather than a generic template.
 *
 * Generators read `DiagnosticIssue.codeBefore` — the whole loop or construct,
 * not the reported line — so the suggestion comes back with the reader's own
 * variable names in it.
 */

import { N1SolutionGenerator } from './n1-generator';
import { IndexSolutionGenerator } from './index-generator';
import type { BaseSolutionGenerator } from './base-generator';
import type { DiagnosticCategory } from '../types';
import type { DiagnosticIssue, Solution, SolutionContext } from './types';

export type { Solution, SolutionContext };
export { BaseSolutionGenerator } from './base-generator';
export { N1SolutionGenerator } from './n1-generator';
export { IndexSolutionGenerator, addIndexToModel } from './index-generator';
export { FitnessCalculator, WEIGHT_PRESETS } from './fitness-calculator';
export type { FitnessWeights, FitnessBreakdown, FitnessResult, WeightPreset } from './fitness-calculator';
export {
  analyzeCodePattern,
  generateTransformationCandidates,
  parseCodeSafe,
  extractVariables,
} from './code-transformer';
export type { CodePattern, RepeatedCall, TransformationResult } from './code-transformer';

const GENERATORS: Partial<Record<DiagnosticCategory, () => BaseSolutionGenerator>> = {
  n1: () => new N1SolutionGenerator(),
  index: () => new IndexSolutionGenerator(),
};

/** True when a generator exists for this finding's category. */
export function hasSolutionGenerator(category: DiagnosticCategory): boolean {
  return category in GENERATORS;
}

/**
 * Generate ranked solutions for one finding. Returns an empty array when no
 * generator covers the category, when the finding carries no `codeBefore`, or
 * when no transformation applies to the code as written.
 */
export async function generateSolutionsFor(
  issue: DiagnosticIssue,
  context: SolutionContext = {},
): Promise<Solution[]> {
  const factory = GENERATORS[issue.category];
  if (!factory) return [];

  try {
    return await factory().generateSolutions(issue, context);
  } catch {
    return [];
  }
}

/**
 * Attach solutions to every finding that has a generator. Findings are
 * returned in the same order, with a `solutions` array added where anything
 * was produced.
 */
export async function attachSolutions(
  issues: DiagnosticIssue[],
  context: SolutionContext = {},
): Promise<Array<DiagnosticIssue & { solutions?: Solution[] }>> {
  const out: Array<DiagnosticIssue & { solutions?: Solution[] }> = [];

  for (const issue of issues) {
    const solutions = await generateSolutionsFor(issue, context);
    out.push(solutions.length > 0 ? { ...issue, solutions } : issue);
  }

  return out;
}
