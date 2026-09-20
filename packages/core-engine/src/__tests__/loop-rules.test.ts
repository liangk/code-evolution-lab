/**
 * Regression tests for the loop rules' severity calibration.
 *
 * `loop/regex-in-loop` used to report every regex in a loop as HIGH with the
 * description "Regex is recompiled on every iteration". That is not what
 * happens: V8 caches the compiled pattern for a literal site, which is why
 * Study 04 measured 1.03x. Scanning this package reported 13 of these as HIGH,
 * 11 of which were literals costing an allocation.
 */

import * as parser from '@babel/parser';
import { loopRules } from '../rules/loop-rules';
import type { DiagnosticIssue } from '../types';

function analyze(code: string): DiagnosticIssue[] {
  const ast = parser.parse(code, {
    sourceType: 'unambiguous',
    plugins: ['jsx', 'typescript'],
    errorRecovery: true,
  });
  return loopRules[0].detect('case.ts', code, ast);
}

function regexIssues(code: string): DiagnosticIssue[] {
  return analyze(code).filter(i => i.rule === 'loop/regex-in-loop');
}

describe('loop/regex-in-loop severity', () => {
  it('reports a regex literal in a loop as low, not high', () => {
    const issues = regexIssues(`
      function parse(lines) {
        for (const line of lines) {
          const m = line.match(/^model\\s+(\\w+)/);
          if (m) use(m);
        }
      }
    `);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('low');
  });

  it('reports new RegExp() with a fixed pattern as low', () => {
    const issues = regexIssues(`
      function parse(lines) {
        for (const line of lines) {
          const re = new RegExp('^model');
          re.test(line);
        }
      }
    `);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('low');
  });

  it('reports new RegExp() with a computed pattern as medium', () => {
    const issues = regexIssues(`
      function find(fields, lines) {
        for (const field of fields) {
          const idx = lines.findIndex(l => new RegExp(\`\\\\b\${field}\\\\b\`).test(l));
          use(idx);
        }
      }
    `);
    expect(issues.some(i => i.severity === 'medium')).toBe(true);
  });

  it('does not report a regex outside any loop', () => {
    const issues = regexIssues(`
      const MODEL = /^model\\s+(\\w+)/;
      function parse(line) { return line.match(MODEL); }
    `);
    expect(issues).toEqual([]);
  });

  it('no longer cites a CPython measurement in a JavaScript tool', () => {
    const issues = regexIssues(`
      function parse(lines) {
        for (const line of lines) { line.match(/x/); }
      }
    `);
    expect(issues[0].empiricalSpeedup).not.toMatch(/CPython/);
  });
});
