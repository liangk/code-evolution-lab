import { join } from 'path';
import { RuleRegistry, analyzeDirectory } from '../engine';
import { getAllRules } from '../rules';
import type { DiagnosticCategory } from '../types';

const FIXTURES_DIR = join(__dirname, 'fixtures');

const ALL_CATEGORIES: DiagnosticCategory[] = [
  'n1', 'blocking-io', 'memory', 'loop', 'index',
  'resource', 'bundle', 'dom', 'payload', 'redos', 'caching',
];

function scanFixtures() {
  const registry = new RuleRegistry();
  registry.registerAll(getAllRules());
  return analyzeDirectory({ targetPath: FIXTURES_DIR }, registry);
}

describe('core-engine integration', () => {
  it('registers exactly one RuleDefinition per rule id across all 11 categories', () => {
    const registry = new RuleRegistry();
    registry.registerAll(getAllRules());
    const ids = registry.getAll().map(r => r.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
    expect(new Set(registry.getAll().map(r => r.category))).toEqual(new Set(ALL_CATEGORIES));
  });

  it('never reports the same finding twice for one file', () => {
    // Regression test for the bug where several RuleDefinitions sharing one
    // detect() function caused every real finding to be duplicated once per
    // sibling rule id (6x for loop/memory, 2-4x for index).
    const report = scanFixtures();
    const seen = new Map<string, number>();
    for (const issue of report.issues) {
      const key = `${issue.rule}::${issue.file}::${issue.line}::${issue.title}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
    expect(duplicates).toEqual([]);
  });

  it('fires at least one issue in every one of the 11 categories on the fixture set', () => {
    const report = scanFixtures();
    const firedCategories = new Set(report.issues.map(i => i.category));
    for (const category of ALL_CATEGORIES) {
      expect(firedCategories.has(category)).toBe(true);
    }
  });

  it('reports zero issues on a clean file with no injected anti-patterns', () => {
    const report = scanFixtures();
    const cleanIssues = report.issues.filter(i => i.file.includes('clean.js'));
    expect(cleanIssues).toEqual([]);
  });

  it('respects a category filter and only returns issues from that category', () => {
    const registry = new RuleRegistry();
    registry.registerAll(getAllRules());
    const report = analyzeDirectory({ targetPath: FIXTURES_DIR, categories: ['n1'] }, registry);
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues.every(i => i.category === 'n1')).toBe(true);
  });

  it('respects a rule id filter and only returns issues from that rule', () => {
    // Regression test: a shared detect() function used to ignore the rule
    // filter entirely and return every issue in its family regardless of
    // which specific rule id was requested.
    const registry = new RuleRegistry();
    registry.registerAll(getAllRules());
    const report = analyzeDirectory({ targetPath: FIXTURES_DIR, rules: ['dom/document-write'] }, registry);
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues.every(i => i.rule === 'dom/document-write')).toBe(true);
  });

  it('gives a nested loop exactly one nested-loop finding, not one per depth level', () => {
    const report = scanFixtures();
    const nestedLoopIssues = report.issues.filter(
      i => i.file.includes('nested-loop.js') && i.rule === 'loop/nested-loops'
    );
    expect(nestedLoopIssues.length).toBe(1);
  });
});
