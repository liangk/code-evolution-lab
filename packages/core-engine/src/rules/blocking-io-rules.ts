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
const SYNC_CRYPTO_METHODS = new Set([
  'randomBytes', 'createHash', 'createHmac',
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

function detectBlockingIoIssues(filePath: string, content: string, ast: any): DiagnosticIssue[] {
  if (!ast) return [];
  const issues: DiagnosticIssue[] = [];

  try {
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
          const severity: DiagnosticIssue['severity'] = inLoop ? 'critical' : inHandler ? 'high' : 'medium';
          issues.push({
            id: '', rule: 'blocking-io/sync-file-operation', category: 'blocking-io', severity,
            file: filePath, line: loc.line, column: loc.column,
            title: `Blocking file operation: ${methodName}`,
            description: `Synchronous file operation '${methodName}' blocks the event loop.${inLoop ? ' Inside a loop, this severely degrades performance.' : ''}${inHandler ? ' In a request handler, this blocks other requests.' : ''}`,
            snippet: snippetAt(content, loc.line),
            recommendation: `Use ${methodName.replace('Sync', '')} with async/await instead.`,
            studyReference: 'Study 02',
            empiricalSpeedup: '5\u201315\u00d7 slower',
            confidence: 0.85,
          });
          return;
        }

        if (SYNC_CRYPTO_METHODS.has(methodName)) {
          const inHandler = isInRequestHandler(path);
          issues.push({
            id: '', rule: 'blocking-io/sync-crypto-operation', category: 'blocking-io', severity: inHandler ? 'high' : 'medium',
            file: filePath, line: loc.line, column: loc.column,
            title: `Blocking crypto operation: ${methodName}`,
            description: `Synchronous crypto operation '${methodName}' is CPU-intensive and blocks the event loop.`,
            snippet: snippetAt(content, loc.line),
            recommendation: 'Use the async version with util.promisify or a native async equivalent.',
            studyReference: 'Study 02',
            confidence: 0.75,
          });
          return;
        }

        if (SYNC_CHILD_PROCESS_METHODS.has(methodName)) {
          issues.push({
            id: '', rule: 'blocking-io/sync-child-process', category: 'blocking-io', severity: 'high',
            file: filePath, line: loc.line, column: loc.column,
            title: `Blocking child process: ${methodName}`,
            description: `Synchronous child process call '${methodName}' blocks until the process exits.`,
            snippet: snippetAt(content, loc.line),
            recommendation: 'Use exec/execFile/spawn with callbacks or util.promisify instead.',
            studyReference: 'Study 02',
            confidence: 0.85,
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
    id: 'blocking-io/sync-child-process', name: 'Sync Child Process', category: 'blocking-io', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectBlockingIoIssues,
  },
  {
    id: 'blocking-io/sync-database-operation', name: 'Sync Database Operation', category: 'blocking-io', severity: 'critical',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectBlockingIoIssues,
  },
];
