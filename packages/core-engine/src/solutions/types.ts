/**
 * Types for solution generation.
 *
 * Ported from the backend's `types.ts`, narrowed to what generators actually
 * use. The backend passes a full `Issue`; generators only read `id`, `title`,
 * `category` and `codeBefore`, all of which `DiagnosticIssue` already has.
 */

import type { DiagnosticIssue } from '../types';

export type { DiagnosticIssue };

export interface Solution {
  id: string;
  issueId: string;
  rank: number;
  type: string;
  code: string;
  fitnessScore: number;
  reasoning: string;
  /** First line of the reasoning, for compact display. */
  description: string;
  /** Full reasoning. */
  explanation: string;
  generationMethod: 'heuristic';
  /** Estimated minutes to apply. */
  implementationTime: number;
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * What the surrounding project looks like. The backend supplies this from its
 * own analysis; the CLI has no equivalent, so every field is optional and the
 * generators fall back to their defaults without it.
 */
export interface SolutionContext {
  /** Solution types already used elsewhere in this codebase. */
  existingPatterns?: string[];
  /** Package names from the project's package.json. */
  dependencies?: string[];
}
