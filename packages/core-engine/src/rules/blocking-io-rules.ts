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
const SYNC_DB_METHODS = new Set(['querySync', 'executeSync', 'runSync', 'getSync', 'allSync']);

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

function isInRequestHandler(path: any): boolean {
  let p = path;
  while (p?.node) {
    const callee = p.node.callee;
    const method = callee?.property?.name;
    if (['get', 'post', 'put', 'delete', 'patch', 'use', 'all'].includes(method)) {
      const objName = callee?.object?.name || callee?.object?.callee?.name;
      if (['app', 'router', 'express', 'server'].includes(objName)) return true;
    }
    if (p.node.type === 'FunctionDeclaration' || p.node.type === 'FunctionExpression') {
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

          // Request-handler context dominates: blocking one request handler
          // stalls every other in-flight request. A loop only multiplies a
          // cost that matters in the first place.
          let severity: DiagnosticIssue['severity'];
          if (inHandler) severity = inLoop ? 'critical' : 'high';
          else if (serverFile) severity = inLoop ? 'high' : 'medium';
          else severity = inLoop ? 'medium' : 'low';

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
            confidence: inHandler ? 0.85 : serverFile ? 0.7 : 0.4,
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
            severity: expensive ? (inHandler ? 'high' : 'medium') : 'low',
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
          issues.push({
            id: '', rule: 'blocking-io/sync-child-process', category: 'blocking-io',
            severity: serverFile ? 'high' : 'medium',
            file: filePath, line: loc.line, column: loc.column,
            title: `Blocking child process: ${methodName}`,
            description: `Synchronous child process call '${methodName}' blocks until the process exits.${serverFile ? '' : ' This file shows no sign of being part of a server; in a build or CLI script this is usually intentional.'}`,
            snippet: snippetAt(content, loc.line),
            recommendation: 'Use exec/execFile/spawn with callbacks or util.promisify instead.',
            studyReference: 'Study 02',
            confidence: serverFile ? 0.85 : 0.5,
          });
          return;
        }

        if (SYNC_DB_METHODS.has(methodName) && t.isMemberExpression(callee)) {
          issues.push({
            id: '', rule: 'blocking-io/sync-database-operation', category: 'blocking-io', severity: 'critical',
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
    id: 'blocking-io/sync-file-operation', name: 'Sync File Operation', category: 'blocking-io', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectBlockingIoIssues,
  },
  {
    id: 'blocking-io/sync-crypto-operation', name: 'Sync Crypto Operation', category: 'blocking-io', severity: 'medium',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectBlockingIoIssues,
  },
  {
    id: 'blocking-io/sync-child-process', name: 'Sync Child Process', category: 'blocking-io', severity: 'medium',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectBlockingIoIssues,
  },
  {
    id: 'blocking-io/sync-database-operation', name: 'Sync Database Operation', category: 'blocking-io', severity: 'critical',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectBlockingIoIssues,
  },
];
