export type { MemorySnapshot, ScenarioDefinition, ScenarioResult } from './study03/run-all';
export type { BenchmarkModule, BenchmarkOutput, BenchmarkSummary, ComparisonResult, RunConfig, TrialRecord } from './study04/harness/types';

export const STUDIES = {
  '03': {
    id: '03',
    name: 'Memory Leaks',
    description: 'Simulated memory leak patterns in React, Vue, and Angular components',
    entrypoint: './study03/run-all',
    requiresDb: false,
    nodeFlags: ['--expose-gc'],
    quickFlag: '--quick',
  },
  '04': {
    id: '04',
    name: 'Loop Performance',
    description: 'CPU-bound loop anti-patterns: regex, JSON, nested loops, chained array methods',
    entrypoint: './study04/run-all',
    requiresDb: false,
    nodeFlags: [],
    quickFlag: '--trials 5 --warmup 10',
  },
  '05': {
    id: '05',
    name: 'Missing Index',
    description: 'PostgreSQL query performance with and without indexes (requires live DB)',
    entrypoint: './study05/run-all',
    requiresDb: true,
    nodeFlags: [],
    quickFlag: '',
  },
} as const;

export type StudyId = keyof typeof STUDIES;
