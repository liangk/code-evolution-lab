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

const JS_PATTERNS = ['*.js', '*.ts', '*.jsx', '*.tsx', '*.mjs'];
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
  'randomBytes',
  'pbkdf2Sync', 'scryptSync', 'generateKeyPairSync', 'generateKeySync',
]);
const EXPENSIVE_CRYPTO_METHODS = new Set([
  'pbkdf2Sync', 'scryptSync', 'generateKeyPairSync', 'generateKeySync',
]);
const SYNC_CHILD_PROCESS_METHODS = new Set(['execSync', 'execFileSync', 'spawnSync']);
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

function isInRequestHandler(path: any): boolean {
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
    if (FUNCTION_TYPES.has(p.node.type)) {
      const names = (p.node.params || []).map((param: any) => param.name);
      if (names.includes('req') && names.includes('res')) return true;
    }
    p = p.parentPath;
  }
  return false;
}

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

  try {
    const serverFile = fileLooksLikeServer(ast);
    traverse(ast, {
      noScope: true,

      CallExpression(path: any) {
        const node = path.node;
        const callee = node.callee;
        const methodName = callee?.property?.name || callee?.name;
        const loc = node.loc?.start;
        if (!methodName || !loc) return;

        if (SYNC_FILE_METHODS.has(methodName)) {
          const inLoop = isInLoop(path);
          const inHandler = isInRequestHandler(path);

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
            recommendation: `Use ${methodName.replace('Sync', '')} with async/await instead.`,
            studyReference: 'Study 02',
            empiricalSpeedup: '5\u201315\u00d7 slower',
            confidence: inHandler ? 0.85 : 0.4,
          });
          return;
        }

        if (SYNC_CRYPTO_METHODS.has(methodName)) {
          // `randomBytes(n, cb)` is the async form.
          if (methodName === 'randomBytes') {
            const last = node.arguments?.[node.arguments.length - 1];
            if (last?.type === 'ArrowFunctionExpression' || last?.type === 'FunctionExpression') return;
          }
          const inHandler = isInRequestHandler(path);
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
            recommendation: 'Use the async version with util.promisify or a native async equivalent.',
            studyReference: 'Study 02',
            confidence: expensive ? 0.75 : 0.4,
          });
          return;
        }

        if (SYNC_CHILD_PROCESS_METHODS.has(methodName)) {
          // Outside a request handler, a synchronous child process is almost
          // always a CLI, a build step or a startup check: none of the 54 in
          // the Blocking I/O story's labelled sample was tp (2026-10-19).
          const inHandler = isInRequestHandler(path);
          issues.push({
            id: '', rule: 'blocking-io/sync-child-process', category: 'blocking-io',
            severity: inHandler ? 'high' : 'low',
            file: filePath, line: loc.line, column: loc.column,
            title: `Blocking child process: ${methodName}`,
            description: `Synchronous child process call '${methodName}' blocks until the process exits.${serverFile ? '' : ' This file shows no sign of being part of a server; in a build or CLI script this is usually intentional.'}`,
            snippet: snippetAt(content, loc.line),
            recommendation: 'Use exec/execFile/spawn with callbacks or util.promisify instead.',
            studyReference: 'Study 02',
            confidence: inHandler ? 0.85 : 0.4,
          });
          return;
        }

        if (SYNC_DB_METHODS.has(methodName) && t.isMemberExpression(callee)) {
          const inHandler = isInRequestHandler(path);
          issues.push({
            id: '', rule: 'blocking-io/sync-database-operation', category: 'blocking-io', severity: inHandler ? 'critical' : 'medium',
            file: filePath, line: loc.line, column: loc.column,
            title: `Blocking database operation: ${methodName}`,
            description: 'Synchronous database calls block the event loop and prevent handling other requests.',
            snippet: snippetAt(content, loc.line),
            recommendation: 'Use the async database method with await.',
            studyReference: 'Study 02',
            confidence: 0.75,
          });
        }
      },
    });
  } catch {
    // AST traversal failed — skip
  }

  return issues;
}

export const blockingIoRules: RuleDefinition[] = [
  {
    id: 'blocking-io/sync-file-operation', name: 'Sync File Operation', category: 'blocking-io', severity: 'low',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectBlockingIoIssues,
  },
  {
    id: 'blocking-io/sync-crypto-operation', name: 'Sync Crypto Operation', category: 'blocking-io', severity: 'medium',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectBlockingIoIssues,
  },
  {
    id: 'blocking-io/sync-child-process', name: 'Sync Child Process', category: 'blocking-io', severity: 'low',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectBlockingIoIssues,
  },
  {
    id: 'blocking-io/sync-database-operation', name: 'Sync Database Operation', category: 'blocking-io', severity: 'medium',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectBlockingIoIssues,
  },
];
