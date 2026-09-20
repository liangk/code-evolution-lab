import { join } from 'path';
import { RuleRegistry, analyzeDirectory, calculateScore } from '../engine';
import { getAllRules } from '../rules';
import type { DiagnosticCategory, DiagnosticIssue, Severity } from '../types';

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

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function makeIssues(count: number, severity: Severity = 'high', confidence = 0.8): DiagnosticIssue[] {
  return Array.from({ length: count }, (_, n) => ({
    id: `issue-${n}`,
    rule: 'loop/nested-loops',
    category: 'loop' as DiagnosticCategory,
    severity,
    file: `src/file-${n}.ts`,
    line: n + 1,
    title: 'Nested loop',
    description: 'test fixture',
    recommendation: 'test fixture',
    confidence,
  }));
}

describe('calculateScore', () => {
  it('scores a clean scan 100', () => {
    expect(calculateScore([], 250)).toBe(100);
  });

  it('is scale-invariant: the same issue density scores the same at any scan size', () => {
    // Regression test for the absolute-penalty formula, which saturated at 0
    // after ~25 high-severity findings and so gave every non-trivial project
    // the same score regardless of size.
    const small = calculateScore(makeIssues(10), 100);
    const large = calculateScore(makeIssues(100), 1000);
    expect(small).toBe(large);
  });

  it('does not bottom out at 0 on a large scan with many findings', () => {
    // 200 high-severity findings across 1,000 files is bad but not hopeless;
    // the old formula returned 0 here, and also for 2,000 findings.
    expect(calculateScore(makeIssues(200), 1000)).toBeGreaterThan(0);
  });

  it('moves when issues are fixed, so a baseline diff can detect improvement', () => {
    // This is what makes the `compare` CI guard work: both sides used to clamp
    // to 0, leaving scoreDelta permanently 0 no matter how much was fixed.
    const before = calculateScore(makeIssues(300), 500);
    const after = calculateScore(makeIssues(150), 500);
    expect(after).toBeGreaterThan(before);
  });

  it('weights severity: criticals cost more than mediums at equal count', () => {
    const criticals = calculateScore(makeIssues(20, 'critical'), 200);
    const mediums = calculateScore(makeIssues(20, 'medium'), 200);
    expect(criticals).toBeLessThan(mediums);
  });

  it('treats a zero file count as one file instead of dividing by zero', () => {
    expect(Number.isFinite(calculateScore(makeIssues(3), 0))).toBe(true);
  });
});
