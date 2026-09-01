/**
 * Resource leak rules — derived from Study 06 (resource-leaks-detector.ts)
 *
 * Detects 3 anti-patterns using Babel AST traversal:
 *   resource/unclosed-connection  — DB/socket connection opened without close/release
 *   resource/unclosed-stream      — read/write stream opened without close/destroy
 *   resource/unclosed-file-handle — fs.open()/openSync() without a matching close
 */

import traverse from '@babel/traverse';
import type { RuleDefinition, DiagnosticIssue } from '../types';

const JS_PATTERNS = ['*.js', '*.ts', '*.jsx', '*.tsx', '*.mjs'];

const CONNECTION_METHODS = new Set(['createConnection', 'connect', 'createPool', 'getConnection']);
const STREAM_METHODS = new Set(['createReadStream', 'createWriteStream']);
const CLOSE_METHODS = new Set(['close', 'end', 'destroy', 'release', 'disconnect', 'dispose']);

function snippetAt(code: string, line: number): string {
  return (code.split('\n')[line - 1] ?? '').trim().slice(0, 120);
}

function functionBodyHasCloseCall(path: any, closeMethods: Set<string>): boolean {
  const fnScope = path.getFunctionParent?.();
  if (!fnScope) return false;

  let found = false;
  try {
    traverse(fnScope.node, {
      noScope: true,
      CallExpression(inner: any) {
        const method = inner.node.callee?.property?.name;
        if (method && closeMethods.has(method)) found = true;
      },
    });
  } catch {
    // ignore
  }
  return found;
}

function detectResourceLeakIssues(filePath: string, content: string, ast: any): DiagnosticIssue[] {
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

        if (CONNECTION_METHODS.has(methodName)) {
          if (!functionBodyHasCloseCall(path, CLOSE_METHODS)) {
            issues.push({
              id: '', rule: 'resource/unclosed-connection', category: 'resource', severity: 'high',
              file: filePath, line: loc.line, column: loc.column,
              title: `Potentially unclosed connection: ${methodName}`,
              description: `Connection created with '${methodName}' has no apparent close/release call in the same function.`,
              snippet: snippetAt(content, loc.line),
              recommendation: 'Wrap in try/finally and close the connection in the finally block, or use connection pooling.',
              studyReference: 'Study 06',
              confidence: 0.65,
            });
          }
          return;
        }

        if (STREAM_METHODS.has(methodName)) {
          if (!functionBodyHasCloseCall(path, new Set(['close', 'end', 'destroy']))) {
            issues.push({
              id: '', rule: 'resource/unclosed-stream', category: 'resource', severity: 'high',
              file: filePath, line: loc.line, column: loc.column,
              title: `Potentially unclosed stream: ${methodName}`,
              description: `Stream created with '${methodName}' has no apparent close/destroy call in the same function.`,
              snippet: snippetAt(content, loc.line),
              recommendation: 'Call stream.destroy() on error and ensure the stream is properly ended.',
              studyReference: 'Study 06',
              confidence: 0.6,
            });
          }
          return;
        }

        const isFsOpen = callee?.property?.name === 'open' && callee?.object?.name === 'fs';
        const isBareOpenSync = callee?.name === 'openSync';
        const isFsPromisesOpen = callee?.object?.property?.name === 'promises' && callee?.property?.name === 'open';
        if (isFsOpen || isBareOpenSync || isFsPromisesOpen) {
          if (!functionBodyHasCloseCall(path, new Set(['close', 'closeSync']))) {
            issues.push({
              id: '', rule: 'resource/unclosed-file-handle', category: 'resource', severity: 'high',
              file: filePath, line: loc.line, column: loc.column,
              title: 'Unclosed file handle',
              description: 'File opened without a corresponding close() call. File handles are a limited system resource.',
              snippet: snippetAt(content, loc.line),
              recommendation: 'Use try/finally with close(), or fs.promises with an explicit close.',
              studyReference: 'Study 06',
              confidence: 0.6,
            });
          }
        }
      },
    });
  } catch {
    // AST traversal failed — skip
  }

  return issues;
}

export const resourceRules: RuleDefinition[] = [
  {
    id: 'resource/unclosed-connection', name: 'Unclosed Connection', category: 'resource', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectResourceLeakIssues,
  },
  {
    id: 'resource/unclosed-stream', name: 'Unclosed Stream', category: 'resource', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectResourceLeakIssues,
  },
  {
    id: 'resource/unclosed-file-handle', name: 'Unclosed File Handle', category: 'resource', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectResourceLeakIssues,
  },
];
