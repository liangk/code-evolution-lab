/**
 * Blocking I/O rules — derived from Study 02 (blocking-io-detector.ts)
 *
 * Detects 4 anti-patterns using Babel AST traversal:
 *   blocking-io/sync-file-operation     — readFileSync/writeFileSync/etc block the event loop
 *   blocking-io/sync-crypto-operation   — pbkdf2Sync/scryptSync/etc are CPU-intensive and blocking
 *   blocking-io/sync-child-process      — execSync/spawnSync block until the child process exits
 *   blocking-io/sync-database-operation — querySync/runSync-style calls block all concurrent requests
 */

import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { RuleDefinition, DiagnosticIssue } from '../types';
import { indexFile, enclosingFn, findHandlerPath, handlerKind, resetReach } from './blocking-io-reach';

/**
 * `.cjs` is scanned by the blocking-io rules only (Stage 2, item 2): Study 02
 * scanned it, and CommonJS build output and config are where it is common.
 * The walker collects it for every rule; rules whose patterns do not list it
 * never see it, so no other rule's counts change.
 */
const JS_PATTERNS = ['*.js', '*.ts', '*.jsx', '*.tsx', '*.mjs', '*.cjs'];
const LOOP_TYPES = new Set(['ForStatement', 'ForOfStatement', 'ForInStatement', 'WhileStatement', 'DoWhileStatement']);

const SYNC_FILE_METHODS = new Set([
  'readFileSync', 'writeFileSync', 'appendFileSync', 'copyFileSync',
  'mkdirSync', 'rmdirSync', 'unlinkSync', 'renameSync', 'statSync',
  'lstatSync', 'existsSync', 'readdirSync', 'readlinkSync', 'realpathSync',
  'chmodSync', 'chownSync', 'truncateSync', 'utimesSync', 'accessSync',
  'openSync', 'closeSync', 'fstatSync', 'ftruncateSync', 'futimesSync',
  'fsyncSync', 'fdatasyncSync', 'linkSync', 'symlinkSync',
]);
/**
 * Creating a Hash or Hmac object does no work — `crypto.createHash('sha256')`
 * allocates and returns; the cost is in `.update()`/`.digest()`, and even then
 * it is proportional to the data, not a blocking I/O wait. They were in this
 * list and produced a finding for every hash construction in this package.
 *
 * `randomBytes(n)` without a callback is synchronous but takes microseconds
 * for the sizes anyone actually uses, so it is reported at low severity only.
 * The genuinely expensive ones are the key-derivation functions.
 */
const SYNC_CRYPTO_METHODS = new Set([
  'randomBytes', 'randomFillSync',
  'pbkdf2Sync', 'scryptSync', 'generateKeyPairSync', 'generateKeySync',
]);
const EXPENSIVE_CRYPTO_METHODS = new Set([
  'pbkdf2Sync', 'scryptSync', 'generateKeyPairSync', 'generateKeySync',
]);
const SYNC_CHILD_PROCESS_METHODS = new Set(['execSync', 'execFileSync', 'spawnSync']);
/**
 * isolated-vm's synchronous API (Stage 2, item 3). Running a script in an
 * isolate with `runSync` blocks the calling thread until the script finishes
 * or times out: real blocking, but script execution, not the database call
 * these names used to be counted as. Reported only in files that import
 * isolated-vm, because `runSync` and `getSync` are common method names.
 */
const IVM_SYNC_METHODS = new Set([
  'runSync', 'evalSync', 'evalClosureSync', 'applySync', 'applySyncPromise', 'getSync', 'setSync', 'deleteSync',
  'compileScriptSync', 'compileModuleSync', 'createContextSync', 'instantiateSync', 'evaluateSync',
]);

function importsIsolatedVm(ast: any): boolean {
  for (const node of ast.program?.body ?? []) {
    if (node.type === 'ImportDeclaration' && node.source?.value === 'isolated-vm') return true;
  }
  let found = false;
  try {
    traverse(ast, {
      noScope: true,
      CallExpression(path: any) {
        const n = path.node;
        if (n.callee?.name === 'require' && n.arguments?.[0]?.value === 'isolated-vm') { found = true; path.stop(); }
      },
      ImportExpression(path: any) {
        if (path.node.source?.value === 'isolated-vm') { found = true; path.stop(); }
      },
    });
  } catch {
    // ignore
  }
  return found;
}

/**
 * zlib's synchronous forms (Stage 2, item 2). Compression is CPU work on the
 * calling thread: for a large buffer it blocks as long as a file read, and
 * Study 02 reported 59 of them.
 */
const SYNC_ZLIB_METHODS = new Set([
  'deflateSync', 'inflateSync', 'deflateRawSync', 'inflateRawSync', 'gzipSync', 'gunzipSync',
  'unzipSync', 'brotliCompressSync', 'brotliDecompressSync',
]);
/**
 * Only names that are a database driver's synchronous API (ibm_db, odbc).
 * `runSync`, `getSync` and `allSync` were in this list and matched methods
 * that happen to share the name: sequelize's in-memory hook runner, config
 * getters, isolated-vm's script execution, async HTTP clients. In the Blocking
 * I/O story's labelled sample, all 36 database findings were such methods and
 * none was a blocking database call (2026-10-19).
 */
const SYNC_DB_METHODS = new Set(['querySync', 'executeSync', 'prepareSync']);

/**
 * Paths whose code does not run in a process that serves concurrent work:
 * scripts, CLI entry points, examples and demos, benchmarks, codemods,
 * migrations and seeds, build configuration, bundled tools, and test helpers
 * the walker does not already skip.
 *
 * Measured against the Blocking I/O story's labels (2026-10-19): these paths
 * held 4,762 of round 0's 10,861 findings, and 301 labelled locations, of
 * which 296 were tooling and none was `tp`.
 *
 * `tools/`, `tasks/` and `docs/` count only at a repository or package root:
 * deeper down they are domain words (directus serves `ai/tools/`). `vendor/`
 * is left out for the same reason (a marketplace's `vendor/` routes); bundled
 * yarn releases are matched by file name instead, and other bundles by
 * `looksMinified`.
 */
const NOT_SERVED_PATH = new RegExp([
  String.raw`(^|/)(scripts?|\.scripts|bin|examples?|samples?|demos?|playground|sandbox|bench|benchmarks?|codemods?|compiled|\.yarn)/`,
  String.raw`^(tools?|tasks|internals|\.github|\.ci|docs?|www)/|^packages/[^/]+/(tools?|tasks|scripts|docs?)/`,
  String.raw`(^|/)[\w-]*codemod[\w-]*/`,
  String.raw`(^|/)(e2e|tests?|testing|samples?|examples?)-[\w.-]+/|(^|/)[\w.-]+-(e2e|tests|samples|examples)/`,
  String.raw`(^|/)[\w.-]+-(test|testing)-(utils|helpers|shared|harness|kit)[\w.-]*/|(^|/)test-(helpers|utils)\.[cm]?[jt]sx?$`,
  String.raw`(^|/)(migrations?|seeds?|seeders)(/|$)|(^|/)seed[-\w]*\.[cm]?[jt]s$`,
  String.raw`(^|/)[\w.-]*\.config\.[cm]?[jt]s$|(^|/)(Makefile|gulpfile|Gruntfile|Jakefile)\.[cm]?[jt]s$`,
  String.raw`(^|/)(prepublish|postinstall|preinstall|prepare)\.[cm]?js$|(^|/)\.pnp\.(c?js|loader\.mjs)$|(^|/)yarn-[\d.]+\.c?js$`,
].join('|'), 'i');

/** A bundle rather than source: any line this long is generated. */
function looksMinified(content: string): boolean {
  let start = 0;
  while (start < content.length) {
    const end = content.indexOf('\n', start);
    const stop = end === -1 ? content.length : end;
    if (stop - start > 1000) return true;
    start = stop + 1;
  }
  return false;
}

/**
 * The call's source, when an async rewrite can go in its place: its
 * innermost function is async, so `await` is legal there. The solution
 * generator rewrites only what this returns; a call in a sync function or at
 * module level gets no suggestion, because making the caller async is a
 * change to every caller.
 */
function awaitableSource(path: any, content: string): string | undefined {
  const fn = path.getFunctionParent?.() ?? path.findParent((p: any) => p.isFunction?.());
  if (!fn?.node?.async) return undefined;
  const node = path.node;
  return typeof node.start === 'number' && typeof node.end === 'number' ? content.slice(node.start, node.end) : undefined;
}

function snippetAt(code: string, line: number): string {
  return (code.split('\n')[line - 1] ?? '').trim().slice(0, 120);
}

function isInLoop(path: any): boolean {
  let p = path.parentPath;
  while (p?.node) {
    if (LOOP_TYPES.has(p.node.type)) return true;
    const prop = p.node.callee?.property?.name;
    if (prop === 'forEach' || prop === 'map') return true;
    p = p.parentPath;
  }
  return false;
}

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod', 'ClassPrivateMethod',
]);

function isInRequestHandler(path: any, filePath = ''): boolean {
  let p = path;
  while (p?.node) {
    const callee = p.node.callee;
    const method = callee?.property?.name;
    if (['get', 'post', 'put', 'delete', 'patch', 'use', 'all'].includes(method)) {
      const objName = callee?.object?.name || callee?.object?.callee?.name;
      if (['app', 'router', 'express', 'server'].includes(objName)) return true;
    }
    // Any function form: `async (req, res) => {}` handlers and class or object
    // methods were missed when only declarations and expressions counted.
    // handlerKind also knows Next.js routes, controllers taking ctx and
    // Electron ipcMain handlers (Stage 2, item 1).
    if (FUNCTION_TYPES.has(p.node.type) && handlerKind(p, filePath)) return true;
    p = p.parentPath;
  }
  return false;
}

/**
 * Findings outside a handler, kept until finalize() can look for a handler
 * among their callers. Cleared at the start of each scan.
 */
const pending = new Map<DiagnosticIssue, { offset: number; promote: DiagnosticIssue['severity'] }>();

/**
 * Whether this file is plausibly part of a server at all.
 *
 * Blocking the event loop only matters when there is an event loop serving
 * concurrent work. A CLI that walks a directory tree with `statSync`, a build
 * script, or a test helper has nothing to block — synchronous fs is the
 * correct choice there, and often the simpler one. Scanning this package
 * reported `statSync` as CRITICAL for exactly that reason.
 *
 * The signal is deliberately coarse: a server framework import, a Node server
 * module, or a function that takes (req, res). When none of those appear, the
 * findings are still reported, but at low severity and low confidence — the
 * file may still be required by a server somewhere.
 */
const SERVER_MODULES = /^(express|fastify|koa|@hapi\/hapi|hapi|restify|http|https|http2|net|next|@nestjs\/)/;

function fileLooksLikeServer(ast: any): boolean {
  let found = false;
  try {
    traverse(ast, {
      noScope: true,
      ImportDeclaration(path: any) {
        if (SERVER_MODULES.test(path.node.source?.value ?? '')) found = true;
      },
      CallExpression(path: any) {
        if (path.node.callee?.name === 'require') {
          const arg = path.node.arguments?.[0];
          if (arg?.type === 'StringLiteral' && SERVER_MODULES.test(arg.value)) found = true;
        }
      },
      Function(path: any) {
        const names = (path.node.params || []).map((p: any) => p?.name);
        if (names.includes('req') && names.includes('res')) found = true;
      },
    });
  } catch {
    // ignore
  }
  return found;
}

function detectBlockingIoIssues(filePath: string, content: string, ast: any): DiagnosticIssue[] {
  if (!ast) return [];
  if (NOT_SERVED_PATH.test(filePath.replace(/\\/g, '/')) || looksMinified(content)) return [];
  const issues: DiagnosticIssue[] = [];
  indexFile(filePath, ast);

  try {
    const serverFile = fileLooksLikeServer(ast);
    const usesIvm = importsIsolatedVm(ast);
    traverse(ast, {
      noScope: true,

      CallExpression(path: any) {
        const node = path.node;
        const callee = node.callee;
        const methodName = callee?.property?.name || callee?.name;
        const loc = node.loc?.start;
        if (!methodName || !loc) return;
        // A finding outside a handler waits for finalize(), which raises it to
        // `promote` if a handler calls its function within two levels.
        const later = (promote: DiagnosticIssue['severity']) => {
          pending.set(issues[issues.length - 1], { offset: node.start, promote });
        };

        if (SYNC_FILE_METHODS.has(methodName)) {
          const inLoop = isInLoop(path);
          const inHandler = isInRequestHandler(path, filePath);

          // Request-handler context is the only signal that ranks: blocking one
          // request handler stalls every other in-flight request. A loop only
          // multiplies a cost that matters in the first place. Being in a
          // file that imports a server module does not: in the Blocking I/O
          // story's labels, such findings outside a handler were tp no more
          // often than findings in files with no sign of a server (2.2% and
          // 4.2%), so both are low (2026-10-19).
          const severity: DiagnosticIssue['severity'] = inHandler ? (inLoop ? 'critical' : 'high') : 'low';

          const context = inHandler
            ? ' In a request handler, this blocks every other in-flight request.'
            : serverFile
              ? ''
              : ' This file shows no sign of being part of a server, so there may be no event loop to block — synchronous fs is often the right choice in a CLI or build script.';

          issues.push({
            id: '', rule: 'blocking-io/sync-file-operation', category: 'blocking-io', severity,
            file: filePath, line: loc.line, column: loc.column,
            title: `Blocking file operation: ${methodName}`,
            description: `Synchronous file operation '${methodName}' blocks the event loop.${inLoop ? ' It runs once per iteration here.' : ''}${context}`,
            snippet: snippetAt(content, loc.line),
            codeBefore: awaitableSource(path, content),
            recommendation: `Use ${methodName.replace('Sync', '')} with async/await instead.`,
            studyReference: 'Study 02',
            empiricalSpeedup: '5\u201315\u00d7 slower',
            confidence: inHandler ? 0.85 : 0.4,
          });
          if (!inHandler) later(inLoop ? 'critical' : 'high');
          return;
        }

        if (SYNC_CRYPTO_METHODS.has(methodName)) {
          // `randomBytes(n, cb)` is the async form.
          if (methodName === 'randomBytes') {
            const last = node.arguments?.[node.arguments.length - 1];
            if (last?.type === 'ArrowFunctionExpression' || last?.type === 'FunctionExpression') return;
          }
          const inHandler = isInRequestHandler(path, filePath);
          const expensive = EXPENSIVE_CRYPTO_METHODS.has(methodName);
          issues.push({
            id: '', rule: 'blocking-io/sync-crypto-operation', category: 'blocking-io',
            severity: expensive ? (inHandler ? 'high' : 'medium') : (inHandler ? 'medium' : 'low'),
            file: filePath, line: loc.line, column: loc.column,
            title: `Blocking crypto operation: ${methodName}`,
            description: expensive
              ? `Synchronous key derivation '${methodName}' is deliberately CPU-intensive and blocks the event loop for its entire duration.`
              : `'${methodName}' is synchronous, though it is fast at typical sizes.`,
            snippet: snippetAt(content, loc.line),
            codeBefore: awaitableSource(path, content),
            recommendation: 'Use the async version with util.promisify or a native async equivalent.',
            studyReference: 'Study 02',
            confidence: expensive ? 0.75 : 0.4,
          });
          if (!inHandler) later(expensive ? 'high' : 'medium');
          return;
        }

        if (SYNC_ZLIB_METHODS.has(methodName)) {
          const inHandler = isInRequestHandler(path, filePath);
          issues.push({
            id: '', rule: 'blocking-io/sync-zlib-operation', category: 'blocking-io',
            severity: inHandler ? 'high' : 'low',
            file: filePath, line: loc.line, column: loc.column,
            title: `Blocking compression: ${methodName}`,
            description: `Synchronous zlib call '${methodName}' compresses or decompresses on the event loop; for a large buffer it blocks as long as a file read.`,
            snippet: snippetAt(content, loc.line),
            codeBefore: awaitableSource(path, content),
            recommendation: `Use ${methodName.replace(/Sync$/, '')} with util.promisify, or a stream, instead.`,
            studyReference: 'Study 02',
            confidence: inHandler ? 0.8 : 0.4,
          });
          if (!inHandler) later('high');
          return;
        }

        if (SYNC_CHILD_PROCESS_METHODS.has(methodName)) {
          // Outside a request handler, a synchronous child process is almost
          // always a CLI, a build step or a startup check: none of the 54 in
          // the Blocking I/O story's labelled sample was tp (2026-10-19).
          const inHandler = isInRequestHandler(path, filePath);
          issues.push({
            id: '', rule: 'blocking-io/sync-child-process', category: 'blocking-io',
            severity: inHandler ? 'high' : 'low',
            file: filePath, line: loc.line, column: loc.column,
            title: `Blocking child process: ${methodName}`,
            description: `Synchronous child process call '${methodName}' blocks until the process exits.${serverFile ? '' : ' This file shows no sign of being part of a server; in a build or CLI script this is usually intentional.'}`,
            snippet: snippetAt(content, loc.line),
            codeBefore: awaitableSource(path, content),
            recommendation: 'Use exec/execFile/spawn with callbacks or util.promisify instead.',
            studyReference: 'Study 02',
            confidence: inHandler ? 0.85 : 0.4,
          });
          if (!inHandler) later('high');
          return;
        }

        if (usesIvm && IVM_SYNC_METHODS.has(methodName) && t.isMemberExpression(callee)) {
          const inHandler = isInRequestHandler(path, filePath);
          issues.push({
            id: '', rule: 'blocking-io/sync-isolate-execution', category: 'blocking-io',
            severity: inHandler ? 'high' : 'low',
            file: filePath, line: loc.line, column: loc.column,
            title: `Blocking isolate call: ${methodName}`,
            description: `isolated-vm's '${methodName}' runs on the calling thread and blocks the event loop until the isolate returns or times out.`,
            snippet: snippetAt(content, loc.line),
            codeBefore: awaitableSource(path, content),
            recommendation: `Use the async form (${methodName.replace(/Sync(Promise)?$/, '')}) and await it; the isolate then runs on its own thread.`,
            studyReference: 'Study 02',
            confidence: inHandler ? 0.8 : 0.45,
          });
          if (!inHandler) later('high');
          return;
        }

        if (SYNC_DB_METHODS.has(methodName) && t.isMemberExpression(callee)) {
          const inHandler = isInRequestHandler(path, filePath);
          issues.push({
            id: '', rule: 'blocking-io/sync-database-operation', category: 'blocking-io', severity: inHandler ? 'critical' : 'medium',
            file: filePath, line: loc.line, column: loc.column,
            title: `Blocking database operation: ${methodName}`,
            description: 'Synchronous database calls block the event loop and prevent handling other requests.',
            snippet: snippetAt(content, loc.line),
            codeBefore: awaitableSource(path, content),
            recommendation: 'Use the async database method with await.',
            studyReference: 'Study 02',
            confidence: 0.75,
          });
          if (!inHandler) later('critical');
        }
      },
    });
  } catch {
    // AST traversal failed — skip
  }

  return issues;
}

/**
 * After every file is scanned: raise a finding whose function a request
 * handler calls within two levels, in its own file or through an import, to
 * the severity it would have inside the handler, and say which handler.
 */
function finalizeBlockingIo(issues: DiagnosticIssue[]): DiagnosticIssue[] {
  for (const issue of issues) {
    const p = pending.get(issue);
    if (!p) continue;
    const fn = enclosingFn(issue.file, p.offset);
    if (!fn) continue;
    const hp = findHandlerPath(issue.file, fn);
    if (!hp) continue;
    issue.severity = p.promote;
    issue.confidence = 0.7;
    const where = hp.file === issue.file.replace(/\\/g, '/') ? `line ${hp.line}` : `${hp.file}:${hp.line}`;
    issue.description = issue.description.replace(/ This file shows no sign of being part of a server[^]*$/, '')
      + (hp.levels === 0
        ? ` It is in a handler (${hp.handler}, ${where}), so it runs while the process is serving other work.`
        : ` It is reached from a handler (${hp.handler}, ${where}) ${hp.levels === 1 ? 'one call' : 'two calls'} up, so it runs while the process is serving other work.`);
  }
  return issues;
}

function resetBlockingIo(): void {
  pending.clear();
  resetReach();
}

export const blockingIoRules: RuleDefinition[] = [
  {
    id: 'blocking-io/sync-file-operation', name: 'Sync File Operation', category: 'blocking-io', severity: 'low',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectBlockingIoIssues,
    reset: resetBlockingIo, finalize: finalizeBlockingIo,
  },
  {
    id: 'blocking-io/sync-crypto-operation', name: 'Sync Crypto Operation', category: 'blocking-io', severity: 'medium',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectBlockingIoIssues,
    reset: resetBlockingIo, finalize: finalizeBlockingIo,
  },
  {
    id: 'blocking-io/sync-isolate-execution', name: 'Sync Isolate Execution', category: 'blocking-io', severity: 'low',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectBlockingIoIssues,
    reset: resetBlockingIo, finalize: finalizeBlockingIo,
  },
  {
    id: 'blocking-io/sync-zlib-operation', name: 'Sync Zlib Operation', category: 'blocking-io', severity: 'low',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectBlockingIoIssues,
    reset: resetBlockingIo, finalize: finalizeBlockingIo,
  },
  {
    id: 'blocking-io/sync-child-process', name: 'Sync Child Process', category: 'blocking-io', severity: 'low',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectBlockingIoIssues,
    reset: resetBlockingIo, finalize: finalizeBlockingIo,
  },
  {
    id: 'blocking-io/sync-database-operation', name: 'Sync Database Operation', category: 'blocking-io', severity: 'medium',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectBlockingIoIssues,
    reset: resetBlockingIo, finalize: finalizeBlockingIo,
  },
];
