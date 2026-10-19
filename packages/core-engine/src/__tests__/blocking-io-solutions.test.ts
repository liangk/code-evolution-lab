import * as parser from '@babel/parser';
import { blockingIoRules } from '../rules/blocking-io-rules';
import { generateSolutionsFor, toAsync } from '../solutions';

const detect = (code: string) => blockingIoRules[0].detect('src/a.js', code, parser.parse(code, { sourceType: 'unambiguous', plugins: ['typescript'] }));

/** Paste the suggestion over the call; the file must parse and the finding must be gone. */
async function applyAll(code: string) {
  const out: string[] = [];
  for (const issue of detect(code)) {
    const [sol] = await generateSolutionsFor(issue);
    if (!sol) { out.push(`none:${issue.title}`); continue; }
    const at = code.indexOf(issue.codeBefore!);
    const after = code.slice(0, at) + sol.code + code.slice(at + issue.codeBefore!.length);
    parser.parse(after, { sourceType: 'unambiguous', plugins: ['typescript'] });
    const left = detect(after).filter((i: any) => i.line === issue.line && i.title === issue.title);
    out.push(left.length ? `still:${issue.title}` : sol.code);
  }
  return out;
}

describe('blocking-io solutions (Stage 2, item 4)', () => {
  it('rewrites fs calls in an async function to fs.promises', async () => {
    expect(await applyAll(`async function h(p) { const s = fs.readFileSync(p, 'utf8').trim(); if (fs.existsSync(p)) fs.unlinkSync(p); return s; }`)).toEqual([
      "(await fs.promises.readFile(p, 'utf8'))",
      '(await fs.promises.access(p).then(() => true, () => false))',
      '(await fs.promises.unlink(p))',
    ]);
  });

  it('wraps callback APIs in a promise', async () => {
    expect(await applyAll(`const f = async (pw, salt) => [crypto.scryptSync(pw, salt, 64), randomBytes(16), zlib.gzipSync(buf)];`)).toEqual([
      '(await new Promise((resolve, reject) => crypto.scrypt(pw, salt, 64, (err, key) => (err ? reject(err) : resolve(key)))))',
      '(await new Promise((resolve, reject) => randomBytes(16, (err, buf) => (err ? reject(err) : resolve(buf)))))',
      '(await new Promise((resolve, reject) => zlib.gzip(buf, (err, buf) => (err ? reject(err) : resolve(buf)))))',
    ]);
  });

  it('keeps a parenthesised receiver parenthesised', () => {
    expect(toAsync("(require('crypto') as typeof import('crypto'))\n  .randomBytes(16)", 'blocking-io/sync-crypto-operation')?.code).toBe(
      "(await new Promise((resolve, reject) => (require('crypto') as typeof import('crypto')).randomBytes(16, (err, buf) => (err ? reject(err) : resolve(buf)))))",
    );
  });

  it('uses the isolated-vm async twin', async () => {
    expect(await applyAll(`import ivm from 'isolated-vm';\nasync function run(script, ctx) { return script.runSync(ctx, { timeout: 50 }); }`)).toEqual([
      '(await script.run(ctx, { timeout: 50 }))',
    ]);
  });

  it('offers nothing where await is not legal or the rewrite is not a drop-in', async () => {
    expect(await applyAll(`function sync(p) { return fs.readFileSync(p); }\nasync function a(p) { const fd = fs.openSync(p, 'r'); execSync('ls'); readFileSync(p); pbkdf2Sync('a', 'b', 1, 8, 'sha256'); }`)).toEqual([
      'none:Blocking file operation: readFileSync',
      'none:Blocking file operation: openSync',
      'none:Blocking child process: execSync',
      'none:Blocking file operation: readFileSync',
      'none:Blocking crypto operation: pbkdf2Sync',
    ]);
    expect(toAsync('fs.readFileSync(...args)', 'blocking-io/sync-file-operation')).toBeNull();
  });
});
