/**
 * Bundle size rules — derived from Study 07 (bundle-size-detector.ts)
 *
 * Detects 2 anti-patterns using Babel AST traversal:
 *   bundle/heavy-package-import — importing a known-heavy package (moment, lodash, etc.)
 *   bundle/namespace-import     — `import * as` on a tree-shakable package defeats tree-shaking
 */

import traverse from '@babel/traverse';
import type { RuleDefinition, DiagnosticIssue } from '../types';

const JS_PATTERNS = ['*.js', '*.ts', '*.jsx', '*.tsx', '*.mjs'];

const HEAVY_PACKAGES: Record<string, { size: string; alternative?: string }> = {
  moment: { size: '~300KB', alternative: 'date-fns or dayjs (~2-7KB)' },
  lodash: { size: '~70KB', alternative: 'lodash-es with tree-shaking or native methods' },
  underscore: { size: '~25KB', alternative: 'native ES6+ methods' },
  jquery: { size: '~90KB', alternative: 'native DOM APIs' },
  axios: { size: '~15KB', alternative: 'native fetch API' },
  bluebird: { size: '~80KB', alternative: 'native Promises' },
  request: { size: '~50KB', alternative: 'node-fetch or native fetch' },
  uuid: { size: '~12KB', alternative: 'crypto.randomUUID()' },
  validator: { size: '~50KB', alternative: 'import specific validators only' },
  chalk: { size: '~20KB', alternative: 'picocolors (~2KB)' },
  inquirer: { size: '~100KB', alternative: 'prompts (~20KB)' },
  rxjs: { size: '~150KB', alternative: 'import specific operators only' },
  'core-js': { size: '~200KB', alternative: 'target modern browsers or use specific polyfills' },
  numeral: { size: '~30KB', alternative: 'Intl.NumberFormat' },
  'crypto-js': { size: '~100KB', alternative: 'Web Crypto API' },
};

const TREESHAKABLE_PACKAGES = ['lodash', 'rxjs', 'date-fns', '@material-ui', '@mui', 'antd'];

function snippetAt(code: string, line: number): string {
  return (code.split('\n')[line - 1] ?? '').trim().slice(0, 120);
}

function detectBundleIssues(filePath: string, content: string, ast: any): DiagnosticIssue[] {
  if (!ast) return [];
  const issues: DiagnosticIssue[] = [];

  try {
    traverse(ast, {
      noScope: true,

      ImportDeclaration(path: any) {
        const node = path.node;
        const source = node.source?.value;
        const loc = node.loc?.start;
        if (!source || !loc) return;

        const packageName = source.split('/')[0];
        const basePackage = source.startsWith('@') ? source.split('/').slice(0, 2).join('/') : packageName;
        const heavy = HEAVY_PACKAGES[basePackage] || HEAVY_PACKAGES[packageName];

        if (heavy) {
          issues.push({
            id: '', rule: 'bundle/heavy-package-import', category: 'bundle', severity: 'medium',
            file: filePath, line: loc.line, column: loc.column,
            title: `Heavy package: ${basePackage}`,
            description: `Package '${basePackage}' adds roughly ${heavy.size} to the bundle.${heavy.alternative ? ` Consider: ${heavy.alternative}.` : ''}`,
            snippet: snippetAt(content, loc.line),
            recommendation: heavy.alternative || 'Consider whether this dependency is necessary.',
            studyReference: 'Study 07',
            confidence: 0.75,
          });
        }

        const specifiers = node.specifiers || [];
        const isNamespace = specifiers.some((s: any) => s.type === 'ImportNamespaceSpecifier');
        const isTreeshakable = TREESHAKABLE_PACKAGES.some(p => source.includes(p));

        if (isNamespace && isTreeshakable) {
          issues.push({
            id: '', rule: 'bundle/namespace-import', category: 'bundle', severity: 'high',
            file: filePath, line: loc.line, column: loc.column,
            title: 'Namespace import prevents tree-shaking',
            description: `'import * as' for '${source}' pulls in the entire package. Import only the functions you need.`,
            snippet: snippetAt(content, loc.line),
            recommendation: `Change to: import { specificFunction } from '${source}'`,
            studyReference: 'Study 07',
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

export const bundleRules: RuleDefinition[] = [
  {
    id: 'bundle/heavy-package-import', name: 'Heavy Package Import', category: 'bundle', severity: 'medium',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectBundleIssues,
  },
  {
    id: 'bundle/namespace-import', name: 'Namespace Import', category: 'bundle', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectBundleIssues,
  },
];
