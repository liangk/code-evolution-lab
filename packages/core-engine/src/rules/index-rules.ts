/**
 * Missing index rules — derived from Study 05 (prisma-index-detector.ts)
 *
 * Detects 4 anti-patterns via Prisma schema + TS query call-site analysis:
 *   index/missing-fk-index     — FK field without @@index
 *   index/missing-filter-index — Where clause field without @@index
 *   index/missing-sort-index   — orderBy field without @@index
 *   index/missing-composite    — Multi-field where without composite @@index
 */

import type { RuleDefinition, DiagnosticIssue } from '../types';

const PRISMA_PATTERNS = ['schema.prisma'];
const TS_PATTERNS = ['*.ts', '*.tsx'];

// ---------------------------------------------------------------------------
// Prisma schema parser (reused from Study 05)
// ---------------------------------------------------------------------------

interface ModelInfo {
  name: string;
  fields: Map<string, { type: string; isFk: boolean }>;
  indexedFields: Set<string>;
  compositeIndexes: string[][];
}

function parseSchema(content: string): Map<string, ModelInfo> {
  const models = new Map<string, ModelInfo>();
  const lines = content.split('\n');
  let current: ModelInfo | null = null;
  let inModel = false;

  for (const line of lines) {
    const modelMatch = line.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      current = { name: modelMatch[1], fields: new Map(), indexedFields: new Set(), compositeIndexes: [] };
      models.set(current.name, current);
      inModel = true;
      continue;
    }
    if (line.match(/^\}/) && inModel) { inModel = false; current = null; continue; }
    if (!inModel || !current) continue;

    const idxMatch = line.match(/@@index\s*\(\s*\[([^\]]+)\]/);
    if (idxMatch) {
      const fields = idxMatch[1].split(',').map(f => f.trim().split('(')[0].trim());
      fields.forEach(f => current!.indexedFields.add(f));
      if (fields.length > 1) current.compositeIndexes.push(fields);
      continue;
    }

    if (line.match(/@unique/) || line.match(/@id/)) {
      const fieldMatch = line.match(/^\s+(\w+)\s+/);
      if (fieldMatch) current.indexedFields.add(fieldMatch[1]);
      continue;
    }

    const fieldMatch = line.match(/^\s+(\w+)\s+([\w\[\]?]+)/);
    if (fieldMatch) {
      const [, fieldName, fieldType] = fieldMatch;
      const isFk = /Id$/.test(fieldName) && (fieldType === 'Int' || fieldType === 'String');
      current.fields.set(fieldName, { type: fieldType, isFk });
    }
  }

  return models;
}

// Shared parsed models cache (populated when schema.prisma is scanned first)
let cachedModels: Map<string, ModelInfo> = new Map();

// ---------------------------------------------------------------------------
// Schema-level detection
// ---------------------------------------------------------------------------

function detectSchemaIssues(filePath: string, content: string): DiagnosticIssue[] {
  const models = parseSchema(content);
  // Cache for query-level detection
  models.forEach((v, k) => cachedModels.set(k, v));

  const issues: DiagnosticIssue[] = [];
  const lines = content.split('\n');

  for (const [, model] of models) {
    for (const [field, info] of model.fields) {
      if (info.isFk && !model.indexedFields.has(field)) {
        const lineNum = lines.findIndex(l => new RegExp(`\\b${field}\\b`).test(l) && l.includes(info.type)) + 1;
        issues.push({
          id: '', rule: 'index/missing-fk-index', category: 'index', severity: 'high',
          file: filePath, line: lineNum,
          title: `FK '${field}' on '${model.name}' has no @@index`,
          description: `Prisma does NOT auto-create FK indexes. Queries filtering by '${field}' will do a full table scan.`,
          recommendation: `Add @@index([${field}]) to model '${model.name}'`,
          studyReference: 'Study 05, BM-03',
          empiricalSpeedup: '10–100× depending on table size',
          confidence: 0.95,
        });
      }

      if ((field === 'createdAt' || field === 'updatedAt') && !model.indexedFields.has(field)) {
        const lineNum = lines.findIndex(l => new RegExp(`\\b${field}\\b`).test(l) && l.includes('DateTime')) + 1;
        issues.push({
          id: '', rule: 'index/missing-sort-index', category: 'index', severity: 'medium',
          file: filePath, line: lineNum,
          title: `'${field}' on '${model.name}' commonly used in orderBy but has no @@index`,
          description: `Sorting by '${field}' without an index causes PostgreSQL to perform an in-memory sort (filesort).`,
          recommendation: `Add @@index([${field}(sort: Desc)]) to model '${model.name}'`,
          studyReference: 'Study 05, BM-02',
          empiricalSpeedup: 'Eliminates O(n log n) filesort',
          confidence: 0.8,
        });
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Query call-site detection (TS files using Prisma client)
// ---------------------------------------------------------------------------

function detectQueryIssues(filePath: string, content: string): DiagnosticIssue[] {
  // Only scan files that contain prisma client calls
  if (!content.includes('prisma.')) return [];
  if (cachedModels.size === 0) return [];

  const issues: DiagnosticIssue[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const findMatch = line.match(/prisma\.(\w+)\.(findMany|findFirst|findUnique)\(/);
    if (!findMatch) continue;

    const modelName = findMatch[1].charAt(0).toUpperCase() + findMatch[1].slice(1);
    const model = cachedModels.get(modelName);
    if (!model) continue;

    const block = lines.slice(i, i + 10).join('\n');
    const whereFields = [...block.matchAll(/where:\s*\{([^}]+)\}/g)];
    if (whereFields.length === 0) continue;

    const fieldStr = whereFields[0][1];
    const usedFields = [...fieldStr.matchAll(/(\w+)\s*:/g)].map(m => m[1]).filter(f => f !== 'where');

    for (const field of usedFields) {
      if (model.fields.has(field) && !model.indexedFields.has(field)) {
        issues.push({
          id: '', rule: 'index/missing-filter-index', category: 'index', severity: 'high',
          file: filePath, line: i + 1,
          title: `Field '${field}' in where clause for '${modelName}' has no @@index`,
          description: `Query filters by '${field}' but the field has no index in the Prisma schema. This causes a sequential scan.`,
          recommendation: `Add @@index([${field}]) to model '${modelName}' in schema.prisma`,
          studyReference: 'Study 05, BM-01',
          empiricalSpeedup: 'Seq Scan → Index Scan (10–1000× at scale)',
          confidence: 0.85,
        });
      }
    }

    if (usedFields.length >= 2) {
      const hasComposite = model.compositeIndexes.some(idx => usedFields.every(f => idx.includes(f)));
      if (!hasComposite) {
        const unindexed = usedFields.filter(f => !model.indexedFields.has(f));
        if (unindexed.length > 0) {
          issues.push({
            id: '', rule: 'index/missing-composite', category: 'index', severity: 'medium',
            file: filePath, line: i + 1,
            title: `Multi-field where on '${modelName}' [${usedFields.join(', ')}] without composite @@index`,
            description: `Multiple fields used in a single where clause without a composite index. PostgreSQL can only use one single-column index.`,
            recommendation: `Add @@index([${usedFields.join(', ')}]) to model '${modelName}'`,
            studyReference: 'Study 05, BM-04',
            empiricalSpeedup: 'Composite index eliminates filter + recheck step',
            confidence: 0.7,
          });
        }
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Rule exports
// ---------------------------------------------------------------------------

export const indexRules: RuleDefinition[] = [
  {
    id: 'index/missing-fk-index', name: 'Missing FK Index', category: 'index', severity: 'high',
    filePatterns: PRISMA_PATTERNS, needsAst: false, detect: detectSchemaIssues,
  },
  {
    id: 'index/missing-sort-index', name: 'Missing Sort Index', category: 'index', severity: 'medium',
    filePatterns: PRISMA_PATTERNS, needsAst: false, detect: detectSchemaIssues,
  },
  {
    id: 'index/missing-filter-index', name: 'Missing Filter Index', category: 'index', severity: 'high',
    filePatterns: TS_PATTERNS, needsAst: false, detect: detectQueryIssues,
  },
  {
    id: 'index/missing-composite', name: 'Missing Composite Index', category: 'index', severity: 'medium',
    filePatterns: TS_PATTERNS, needsAst: false, detect: detectQueryIssues,
  },
];

/** Reset the cached models — useful for testing or scanning multiple projects. */
export function resetIndexRuleCache(): void { cachedModels = new Map(); }
