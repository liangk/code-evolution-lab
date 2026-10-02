/**
 * The finalize() hook: a rule family's issues after every file is scanned.
 */
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { analyzeDirectory, RuleRegistry } from '../engine';
import type { DiagnosticIssue, RuleDefinition } from '../types';

function dirWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'finalize-'));
  for (const [name, code] of Object.entries(files)) writeFileSync(join(root, name), code);
  return root;
}

// Reports `a/marker` on every file containing "marker"; finalize turns them
// into `a/linked` once it has seen at least two.
const detect = (file: string, content: string): DiagnosticIssue[] =>
  content.includes('marker') ? [{
    id: '', rule: 'a/marker', category: 'payload', severity: 'low', file, line: 1,
    title: 'marker', description: '', recommendation: '', confidence: 1,
  }] : [];
let calls = 0;
const finalize = (issues: DiagnosticIssue[]) => {
  calls++;
  if (issues.length < 2) return issues;
  return issues.map(i => ({ ...i, rule: 'a/linked', title: 'linked' }));
};
const family: RuleDefinition[] = [
  { id: 'a/marker', name: 'm', category: 'payload', severity: 'low', filePatterns: ['*.ts'], needsAst: false, detect, finalize },
  { id: 'a/linked', name: 'l', category: 'payload', severity: 'low', filePatterns: ['*.ts'], needsAst: false, detect, finalize },
];

function run(root: string, rules?: string[]) {
  const registry = new RuleRegistry();
  registry.registerAll(family);
  return analyzeDirectory({ targetPath: root, rules }, registry).issues;
}

describe('finalize()', () => {
  beforeEach(() => { calls = 0; });

  it('runs once per family, after every file, and replaces its issues', () => {
    const issues = run(dirWith({ 'one.ts': 'marker', 'two.ts': 'marker' }));
    expect(calls).toBe(1);
    expect(issues.map(i => i.rule)).toEqual(['a/linked', 'a/linked']);
  });

  it('re-identifies the issues it changed', () => {
    const [issue] = run(dirWith({ 'one.ts': 'marker', 'two.ts': 'marker' }));
    const unchanged = run(dirWith({ 'one.ts': 'marker' }));
    expect(issue.id).not.toBe(unchanged[0].id);
    expect(issue.id).toMatch(/^[0-9a-f]{12}$/);
  });

  it('still receives the issues of a family rule the scan filtered out', () => {
    // Only a/linked is enabled, but a/linked is made from a/marker issues.
    const issues = run(dirWith({ 'one.ts': 'marker', 'two.ts': 'marker' }), ['a/linked']);
    expect(issues.map(i => i.rule)).toEqual(['a/linked', 'a/linked']);
  });

  it('drops family issues the scan did not enable, once finalize has run', () => {
    const issues = run(dirWith({ 'one.ts': 'marker' }), ['a/linked']);
    expect(issues).toEqual([]);
  });
});
