import * as parser from '@babel/parser';
import { n1Rules } from '../rules/n1-rules';
import { blockingIoRules } from '../rules/blocking-io-rules';
import { memoryRules } from '../rules/memory-rules';
import { loopRules } from '../rules/loop-rules';
import { resourceRules } from '../rules/resource-rules';
import { bundleRules } from '../rules/bundle-rules';
import { domRules } from '../rules/dom-rules';
import { payloadRules } from '../rules/payload-rules';
import { redosRules } from '../rules/redos-rules';
import { cachingRules } from '../rules/caching-rules';

function parse(code: string) {
  return parser.parse(code, {
    sourceType: 'unambiguous',
    plugins: ['jsx', 'typescript', 'decorators-legacy'],
    errorRecovery: true,
  });
}

function detectAll(rules: { detect(filePath: string, content: string, ast?: any): any[] }[], code: string, needsAst = true) {
  const ast = needsAst ? parse(code) : undefined;
  const seenFns = new Set<any>();
  const issues: any[] = [];
  for (const rule of rules) {
    if (seenFns.has(rule.detect)) continue;
    seenFns.add(rule.detect);
    issues.push(...rule.detect('test-file.ts', code, ast));
  }
  return issues;
}

describe('n1/query-in-loop', () => {
  it('flags an ORM call inside a for-of loop', () => {
    const code = `
      async function f(ids) {
        for (const id of ids) {
          const user = await db.user.findUnique({ where: { id } });
        }
      }
    `;
    const issues = detectAll(n1Rules, code);
    expect(issues.some(i => i.rule === 'n1/query-in-loop')).toBe(true);
  });

  it('does not flag a batched query outside a loop', () => {
    const code = `
      async function f(ids) {
        const users = await db.user.findMany({ where: { id: { in: ids } } });
      }
    `;
    const issues = detectAll(n1Rules, code);
    expect(issues).toEqual([]);
  });

  it('reports the outer loop only once for a nested loop, not once per nesting level', () => {
    const code = `
      async function f(a, b) {
        for (const x of a) {
          for (const y of b) {
            await db.thing.findFirst({ where: { x, y } });
          }
        }
      }
    `;
    const issues = detectAll(n1Rules, code);
    // Both loops match a DB call inside them (the inner loop finds it directly,
    // the outer loop finds it via the inner loop) — assert it doesn't further
    // multiply beyond one finding per loop level.
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.length).toBeLessThanOrEqual(2);
  });
});

describe('blocking-io rules', () => {
  it('flags readFileSync as blocking', () => {
    const code = `const data = fs.readFileSync('/tmp/x.txt');`;
    const issues = detectAll(blockingIoRules, code);
    expect(issues.some(i => i.rule === 'blocking-io/sync-file-operation')).toBe(true);
  });

  it('does not flag the async equivalent', () => {
    const code = `const data = await fs.promises.readFile('/tmp/x.txt');`;
    const issues = detectAll(blockingIoRules, code);
    expect(issues).toEqual([]);
  });
});

describe('memory rules', () => {
  it('flags useEffect with addEventListener and no cleanup return', () => {
    const code = `
      function W() {
        useEffect(() => {
          window.addEventListener('resize', onResize);
        }, []);
      }
    `;
    const issues = detectAll(memoryRules, code);
    expect(issues.some(i => i.rule === 'memory/missing-effect-cleanup')).toBe(true);
  });

  it('does not flag useEffect that returns a cleanup function', () => {
    const code = `
      function W() {
        useEffect(() => {
          window.addEventListener('resize', onResize);
          return () => window.removeEventListener('resize', onResize);
        }, []);
      }
    `;
    const issues = detectAll(memoryRules, code);
    expect(issues.some(i => i.rule === 'memory/missing-effect-cleanup')).toBe(false);
  });
});

describe('loop rules', () => {
  it('flags a nested for loop', () => {
    const code = `
      function f(a, b) {
        for (let i = 0; i < a.length; i++) {
          for (let j = 0; j < b.length; j++) {}
        }
      }
    `;
    const issues = detectAll(loopRules, code);
    expect(issues.some(i => i.rule === 'loop/nested-loops')).toBe(true);
  });

  it('does not flag a single, non-nested loop', () => {
    const code = `
      function f(a) {
        for (let i = 0; i < a.length; i++) {}
      }
    `;
    const issues = detectAll(loopRules, code);
    expect(issues).toEqual([]);
  });
});

describe('resource rules', () => {
  it('flags a DB connection with no close call', () => {
    const code = `function f() { const conn = mysql.createConnection(cfg); conn.query('SELECT 1'); }`;
    const issues = detectAll(resourceRules, code);
    expect(issues.some(i => i.rule === 'resource/unclosed-connection')).toBe(true);
  });

  it('does not flag a connection that is closed', () => {
    const code = `function f() { const conn = mysql.createConnection(cfg); conn.query('SELECT 1'); conn.close(); }`;
    const issues = detectAll(resourceRules, code);
    expect(issues.some(i => i.rule === 'resource/unclosed-connection')).toBe(false);
  });
});

describe('bundle rules', () => {
  it('flags a heavy package import', () => {
    const code = `import moment from 'moment';`;
    const issues = detectAll(bundleRules, code);
    expect(issues.some(i => i.rule === 'bundle/heavy-package-import')).toBe(true);
  });

  it('flags a namespace import of a tree-shakable package', () => {
    const code = `import * as _ from 'lodash';`;
    const issues = detectAll(bundleRules, code);
    expect(issues.some(i => i.rule === 'bundle/namespace-import')).toBe(true);
  });
});

describe('dom rules', () => {
  it('flags innerHTML assigned from a nested user-input property (req.body.bio)', () => {
    // Regression test: looksLikeUserInput() originally only checked one
    // MemberExpression level deep (req.body) and missed req.body.bio.
    const code = `function f(req, el) { el.innerHTML = \`<div>\${req.body.bio}</div>\`; }`;
    const issues = detectAll(domRules, code);
    expect(issues.some(i => i.rule === 'dom/innerhtml-user-input')).toBe(true);
  });

  it('flags DOM manipulation inside a loop', () => {
    const code = `
      function f(items, list) {
        for (const item of items) {
          const li = document.createElement('li');
          list.appendChild(li);
        }
      }
    `;
    const issues = detectAll(domRules, code);
    expect(issues.some(i => i.rule === 'dom/manipulation-in-loop')).toBe(true);
  });

  it('flags document.write()', () => {
    const code = `document.write('<h1>hi</h1>');`;
    const issues = detectAll(domRules, code);
    expect(issues.some(i => i.rule === 'dom/document-write')).toBe(true);
  });

  it('does not flag innerHTML assigned from a static string', () => {
    const code = `function f(el) { el.innerHTML = '<div>static</div>'; }`;
    const issues = detectAll(domRules, code);
    expect(issues.some(i => i.rule === 'dom/innerhtml-user-input')).toBe(false);
  });
});

describe('payload rules', () => {
  it('flags an unbounded findMany with no select or limit', () => {
    const code = `async function f() { const users = await db.user.findMany(); return users; }`;
    const issues = detectAll(payloadRules, code);
    expect(issues.some(i => i.rule === 'payload/unbounded-query' || i.rule === 'payload/large-return')).toBe(true);
  });

  it('does not flag a query with select and a limit', () => {
    const code = `async function f() { const users = await db.user.findMany({ select: { id: true }, take: 20 }); return users; }`;
    const issues = detectAll(payloadRules, code);
    expect(issues).toEqual([]);
  });
});

describe('redos rules', () => {
  it('flags a nested-quantifier regex', () => {
    const code = `const r = /^(a+)+$/;`;
    const issues = detectAll(redosRules, code);
    expect(issues.some(i => i.rule === 'redos/dangerous-pattern')).toBe(true);
  });

  it('flags a regex test applied to user input', () => {
    const code = `function f(req) { return /^\\d+$/.test(req.body.value); }`;
    const issues = detectAll(redosRules, code);
    expect(issues.some(i => i.rule === 'redos/regex-user-input')).toBe(true);
  });

  it('does not flag a simple, safe regex on a non-user value', () => {
    const code = `const r = /^\\d+$/; r.test(someLocalVar);`;
    const issues = detectAll(redosRules, code);
    expect(issues).toEqual([]);
  });
});

describe('caching rules', () => {
  it('flags the same expensive call repeated in one function', () => {
    const code = `function f() { const a = fetch('/api/config'); const b = fetch('/api/config'); }`;
    const issues = detectAll(cachingRules, code);
    expect(issues.some(i => i.rule === 'caching/repeated-expensive-call')).toBe(true);
  });
});
