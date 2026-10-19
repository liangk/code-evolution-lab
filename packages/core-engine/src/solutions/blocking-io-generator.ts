/**
 * Blocking I/O Solution Generator
 *
 * Held to the Missing Index standard: paste the suggestion over the call and
 * the finding it came from is gone, and the file still parses. The rules put
 * the call in `codeBefore` only when its function is already async, so the
 * `await` in every suggestion is legal where it goes. A call in a sync
 * function gets nothing: making it async changes every caller, which is a
 * refactor, not a replacement.
 *
 *   fs           (await fs.promises.readFile(p, 'utf8'))
 *   existsSync   (await fs.promises.access(p).then(() => true, () => false))
 *   crypto, zlib (await new Promise((resolve, reject) => crypto.scrypt(pw, salt, 64, (err, key) => err ? reject(err) : resolve(key))))
 *   isolated-vm  (await script.run(context, { timeout: 50 }))
 *
 * The Promise wrapper is used instead of `util.promisify` because it needs no
 * import: the suggestion is complete as pasted.
 *
 * What is deliberately left out:
 *
 * - fd-based fs calls (`openSync`, `closeSync`, `fstatSync`, ...): the async
 *   API returns a FileHandle, not a descriptor, so every later use changes.
 * - Child processes: `execSync` returns stdout and throws on a non-zero exit,
 *   `spawnSync` returns a status object, and `stdio: 'inherit'` behaves
 *   differently once the call is async. None of the 54 sampled was a real
 *   problem; a rewrite would be all risk.
 * - Database `querySync`: drivers differ on whether the async form takes a
 *   callback or returns a promise.
 * - A bare `readFileSync(...)` imported by name: the async name is not in
 *   scope, and adding an import is outside the call.
 */

import { parseExpression } from '@babel/parser';
import { BaseSolutionGenerator } from './base-generator';
import type { DiagnosticIssue, Solution, SolutionContext } from './types';

/** fs sync method -> fs.promises method with the same arguments and result. */
const FS_PROMISES: Record<string, string> = {
  readFileSync: 'readFile', writeFileSync: 'writeFile', appendFileSync: 'appendFile', copyFileSync: 'copyFile',
  mkdirSync: 'mkdir', rmdirSync: 'rmdir', unlinkSync: 'unlink', renameSync: 'rename', statSync: 'stat',
  lstatSync: 'lstat', readdirSync: 'readdir', readlinkSync: 'readlink', realpathSync: 'realpath',
  chmodSync: 'chmod', chownSync: 'chown', truncateSync: 'truncate', utimesSync: 'utimes', accessSync: 'access',
  linkSync: 'link', symlinkSync: 'symlink',
};

/** Callback APIs: sync method -> async method, and how the callback's results become the value. */
const CALLBACK_FORMS: Record<string, { async: string; params: string; value: string }> = {
  pbkdf2Sync: { async: 'pbkdf2', params: 'err, key', value: 'key' },
  scryptSync: { async: 'scrypt', params: 'err, key', value: 'key' },
  generateKeyPairSync: { async: 'generateKeyPair', params: 'err, publicKey, privateKey', value: '{ publicKey, privateKey }' },
  generateKeySync: { async: 'generateKey', params: 'err, key', value: 'key' },
  randomBytes: { async: 'randomBytes', params: 'err, buf', value: 'buf' },
  randomFillSync: { async: 'randomFill', params: 'err, buf', value: 'buf' },
  deflateSync: { async: 'deflate', params: 'err, buf', value: 'buf' },
  inflateSync: { async: 'inflate', params: 'err, buf', value: 'buf' },
  deflateRawSync: { async: 'deflateRaw', params: 'err, buf', value: 'buf' },
  inflateRawSync: { async: 'inflateRaw', params: 'err, buf', value: 'buf' },
  gzipSync: { async: 'gzip', params: 'err, buf', value: 'buf' },
  gunzipSync: { async: 'gunzip', params: 'err, buf', value: 'buf' },
  unzipSync: { async: 'unzip', params: 'err, buf', value: 'buf' },
  brotliCompressSync: { async: 'brotliCompress', params: 'err, buf', value: 'buf' },
  brotliDecompressSync: { async: 'brotliDecompress', params: 'err, buf', value: 'buf' },
};

/** isolated-vm: each Sync method has a promise-returning twin taking the same arguments. */
const IVM_ASYNC: Record<string, string> = {
  runSync: 'run', evalSync: 'eval', evalClosureSync: 'evalClosure', applySync: 'apply', getSync: 'get',
  setSync: 'set', deleteSync: 'delete', compileScriptSync: 'compileScript', compileModuleSync: 'compileModule',
  createContextSync: 'createContext', instantiateSync: 'instantiate', evaluateSync: 'evaluate',
};

export interface AsyncEdit {
  code: string;
  /** One line on what the rewrite does, for the explanation. */
  what: string;
}

export class BlockingIoSolutionGenerator extends BaseSolutionGenerator {
  name = 'Blocking I/O Solution Generator';

  async generateSolutions(issue: DiagnosticIssue, _context: SolutionContext): Promise<Solution[]> {
    if (issue.category !== 'blocking-io') return [];
    const before = issue.codeBefore ?? '';
    if (!before.trim()) return [];
    const edit = toAsync(before, issue.rule);
    if (!edit) return [];
    const reasoning = [
      edit.what,
      'The enclosing function is already async, so the await is legal here; the call no longer holds the event loop while the work runs.',
      'Errors now arrive as a rejected promise at the same place, so an existing try/catch around the call still catches them.',
    ].join('\n');
    return [this.createSolution(issue.id || '', 1, 'blocking-io-async', edit.code, 85, reasoning, 'low')];
  }
}

/** The call rewritten to its async form, or null when this shape is left alone. */
export function toAsync(code: string, rule: string): AsyncEdit | null {
  let call: any;
  try {
    call = parseExpression(code, { plugins: ['typescript', 'jsx'] });
  } catch {
    return null;
  }
  if (call?.type !== 'CallExpression') return null;
  const callee = call.callee;
  const member = callee?.type === 'MemberExpression' && !callee.computed && callee.property?.type === 'Identifier';
  const method: string | undefined = member ? callee.property.name : callee?.type === 'Identifier' ? callee.name : undefined;
  if (!method) return null;
  // `(require('crypto') as typeof import('crypto')).randomBytes(16)`: the
  // receiver's own parentheses are outside its range, and a rewrite that
  // appends `.promises` needs them back.
  const obj = member ? callee.object : null;
  const simple = obj && ['Identifier', 'MemberExpression', 'ThisExpression', 'CallExpression'].includes(obj.type) && !obj.extra?.parenthesized;
  const recv = obj ? (simple ? code.slice(obj.start, obj.end) : `(${code.slice(obj.start, obj.end)})`) : null;
  const args = call.arguments.map((a: any) => code.slice(a.start, a.end));
  if (call.arguments.some((a: any) => a.type === 'SpreadElement')) return null;

  if (rule === 'blocking-io/sync-file-operation') {
    if (!recv) return null;
    if (method === 'existsSync') {
      if (args.length !== 1) return null;
      return {
        code: `(await ${recv}.promises.access(${args[0]}).then(() => true, () => false))`,
        what: `Check existence with ${recv}.promises.access, which resolves when the path exists and rejects when it does not.`,
      };
    }
    const target = FS_PROMISES[method];
    if (!target) return null;
    return { code: `(await ${recv}.promises.${target}(${args.join(', ')}))`, what: `Use ${recv}.promises.${target}, which takes the same arguments and resolves to the same value as ${method}.` };
  }

  if (rule === 'blocking-io/sync-crypto-operation' || rule === 'blocking-io/sync-zlib-operation') {
    const form = CALLBACK_FORMS[method];
    if (!form) return null;
    // A bare `pbkdf2Sync(...)` has no `pbkdf2` in scope; `randomBytes` is its own async form.
    if (!recv && form.async !== method) return null;
    const fn = recv ? `${recv}.${form.async}` : form.async;
    const params = form.params;
    return {
      code: `(await new Promise((resolve, reject) => ${fn}(${[...args, `(${params}) => (err ? reject(err) : resolve(${form.value}))`].join(', ')})))`,
      what: `Call ${fn} with a callback and await it. It does the same work off the event loop, on libuv's thread pool.`,
    };
  }

  if (rule === 'blocking-io/sync-isolate-execution') {
    const target = IVM_ASYNC[method];
    if (!recv || !target) return null;
    return { code: `(await ${recv}.${target}(${args.join(', ')}))`, what: `Use isolated-vm's ${target}, which takes the same arguments; the isolate then runs on its own thread while the event loop continues.` };
  }

  return null;
}
