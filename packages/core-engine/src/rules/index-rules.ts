/**
 * Missing index rules — Study 05
 *
 * Detects 4 anti-patterns from a Prisma schema plus the query call sites that
 * use it:
 *   index/missing-fk-index     — a foreign key with no index
 *   index/missing-filter-index — a where-clause field no index can serve
 *   index/missing-sort-index   — an orderBy field with no index
 *   index/missing-composite    — a multi-field where with no composite index
 *
 * The first version of these rules had an 85% false-positive rate on a real
 * Prisma project, and missed the one foreign key that was genuinely unindexed.
 * Four things caused that, and each is handled explicitly below:
 *
 *   1. `@@unique` was never parsed. The line-level matcher required a word
 *      character where `@` sits, so a composite unique — which Postgres
 *      implements as a real index — was invisible. Every query served by one
 *      was reported as unindexed.
 *
 *   2. Composite indexes marked every column as independently indexed.
 *      `@@index([projectId, createdAt])` cannot serve `WHERE createdAt = x`;
 *      only a *leading* column is usable on its own.
 *
 *   3. Foreign keys were guessed from the field name (`/Id$/` plus a String or
 *      Int type) rather than read from `@relation(fields: [...])`, which is
 *      the declaration. A `BigInt` foreign key was therefore never seen.
 *
 *   4. Query call sites were matched with a line regex over a ten-line window.
 *      `where:\s*\{([^}]+)\}` stops at the first `}`, so a nested operator
 *      object leaked `in`, `gte` and `lt` into the field list, Prisma's
 *      compound-key selector `projectId_email` was read as a column, and a
 *      window starting at one query picked up the `where` of the next one —
 *      reporting fields of one model against another model's name.
 *
 * Query analysis is now AST-based and index coverage is modelled properly.
 */

import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { RuleDefinition, DiagnosticIssue } from '../types';

const PRISMA_PATTERNS = ['schema.prisma'];
const TS_PATTERNS = ['*.ts', '*.tsx', '*.js', '*.mjs'];

/**
 * Prisma filter operators and logical combinators. These appear as object keys
 * inside a `where` clause but are not columns.
 */
const WHERE_OPERATORS = new Set([
  'equals', 'not', 'in', 'notIn', 'lt', 'lte', 'gt', 'gte',
  'contains', 'startsWith', 'endsWith', 'mode', 'search',
  'every', 'some', 'none', 'is', 'isNot', 'isSet', 'has', 'hasEvery', 'hasSome',
  'AND', 'OR', 'NOT',
]);

// ---------------------------------------------------------------------------
// Prisma schema model
// ---------------------------------------------------------------------------

interface FieldInfo {
  name: string;
  type: string;
  line: number;
  /** Declared via @relation(fields: [...]) on this model. */
  isForeignKey: boolean;
}

/** An index and where it came from. All of them serve queries identically. */
interface IndexInfo {
  columns: string[];
  /**
   * `index` is a deliberate `@@index`. `unique` is `@unique` or `@@unique`,
   * and `id` is a primary key — both of those create a real index as a side
   * effect of enforcing a constraint, which is why coverage must count them,
   * and why counting them as "indexes this project added for performance"
   * would overstate the case.
   */
  source: 'index' | 'unique' | 'id';
}

interface ModelInfo {
  name: string;
  line: number;
  fields: Map<string, FieldInfo>;
  /**
   * Every index on the model, as an ordered column list. Covers @id, @unique,
   * @@id, @@unique and @@index — Postgres builds a real index for all of them.
   */
  indexes: IndexInfo[];
  /**
   * Every foreign key, one entry per `@relation(fields: [...])`. A composite
   * foreign key is *one* entry with several columns, not several foreign keys:
   * `@relation(fields: [chequeNo, uniqueNo])` needs one index that leads with
   * both, and counting it as two would double it in the denominator and report
   * the second column as unindexed even when a matching composite index exists.
   */
  foreignKeys: Array<{ columns: string[]; line: number }>;
  /**
   * Marked `@@ignore`. Prisma leaves these out of its own model list — they
   * are typically introspected tables Prisma Client cannot use — so their
   * foreign keys were never Prisma's to index and are not counted.
   */
  ignored: boolean;
  /**
   * The model block exactly as written in schema.prisma, comments included,
   * from `model X {` through its closing brace. The fix for every index
   * finding is an edit to this block, so it travels with the finding as
   * `codeBefore` and the solution generator hands back the reader's own model
   * with one line added, rather than a template about a model it invented.
   */
  source: string;
}

/** An index serves a single-field lookup only when that field leads it. */
function servesField(model: ModelInfo, field: string): boolean {
  return model.indexes.some(index => index.columns[0] === field);
}

/**
 * An index serves a multi-field filter when the fields cover a prefix of it.
 * `@@index([a, b, c])` serves `{a, b}` but not `{b, c}`.
 */
function servesFieldSet(model: ModelInfo, fields: string[]): boolean {
  const wanted = new Set(fields);
  return model.indexes.some(({ columns }) => {
    if (columns.length < wanted.size) return false;
    for (let i = 0; i < wanted.size; i++) {
      if (!wanted.has(columns[i])) return false;
    }
    return true;
  });
}

/**
 * Prisma's compound-key selector: `where: { projectId_email: { ... } }` targets
 * `@@unique([projectId, email])` by name. Such a query is served by definition.
 */
function compoundSelectorFor(model: ModelInfo, key: string): string[] | null {
  for (const { columns } of model.indexes) {
    if (columns.length > 1 && columns.join('_') === key) return columns;
  }
  return null;
}

/**
 * Blank out comments, keeping every newline so line numbers stay exact.
 *
 * The attribute patterns below match anywhere on a line, so without this a
 * commented-out `// @@index([userId])` was read as a real index — the
 * foreign key was then reported as covered when Prisma, correctly, sees no
 * index at all. Block comments are worse: Prisma accepts `/* ... *\/` and
 * ignores whole models inside one, which the line parser read as live.
 * Both were found by cross-checking every corpus schema against Prisma's own
 * parser.
 *
 * Quoted strings are respected, so `@default("https://example.com")` keeps
 * its `//`. A string cannot span lines in Prisma, so an unterminated quote is
 * closed at the newline rather than swallowing the rest of the file.
 */
function stripComments(content: string): string {
  let out = '';
  let i = 0;
  let inString = false;

  while (i < content.length) {
    const c = content[i];
    const next = content[i + 1];

    if (inString) {
      if (c === '\\' && i + 1 < content.length) {
        out += c + next;
        i += 2;
        continue;
      }
      out += c;
      if (c === '"' || c === '\n') inString = false;
      i++;
      continue;
    }

    if (c === '"') {
      inString = true;
      out += c;
      i++;
      continue;
    }

    if (c === '/' && next === '*') {
      const end = content.indexOf('*/', i + 2);
      const stop = end === -1 ? content.length : end + 2;
      out += content.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }

    if (c === '/' && next === '/') {
      const end = content.indexOf('\n', i);
      const stop = end === -1 ? content.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
      continue;
    }

    out += c;
    i++;
  }

  return out;
}

export function parseSchema(content: string): Map<string, ModelInfo> {
  const models = new Map<string, ModelInfo>();
  const lines = stripComments(content).split('\n');
  // stripComments blanks comments in place, so a column in `lines` is the
  // same column in `rawLines`. That is what lets a model's closing brace,
  // found in the stripped text, cut the original text at the same point.
  const rawLines = content.split('\n');
  let current: ModelInfo | null = null;
  let currentStart = 0;
  /** Where `model` begins on its line — not 0 after `}model Next {`. */
  let currentStartCol = 0;

  /** Close the open model at line `i`, whose closing brace is at `braceCol`. */
  const closeModel = (i: number, braceCol: number): void => {
    if (!current) return;
    const block = rawLines.slice(currentStart, i);
    if (block.length > 0) block[0] = block[0].slice(currentStartCol);
    block.push(rawLines[i].slice(0, braceCol + 1));
    current.source = block.join('\n');
    current = null;
  };

  const columnsOf = (raw: string): string[] =>
    raw.split(',').map(f => f.trim().split('(')[0].trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const lineNo = i + 1;

    // `}model Next {` — Prisma accepts a closing brace and the next block
    // declaration on the same line. The model pattern requires `model` at
    // the start of a line, so fazendansaibiraci-wq/gestao-fazenda lost a whole
    // model and its five foreign keys: the `}` closed the previous model and
    // the declaration on the same line was never seen. Close, then carry on
    // with whatever follows the brace, on the same line number.
    const closeThen = line.match(/^\s*\}\s*(\S.*)$/);
    if (closeThen) {
      closeModel(i, line.indexOf('}'));
      line = closeThen[1];
    }

    const modelMatch = line.match(/^\s*model\s+(\w+)\s*\{/);
    if (modelMatch) {
      current = {
        name: modelMatch[1], line: lineNo, fields: new Map(), indexes: [], foreignKeys: [],
        ignored: false, source: '',
      };
      currentStart = i;
      currentStartCol = lines[i].length - line.length + line.search(/\S/);
      models.set(current.name, current);
      continue;
    }
    if (!current) continue;
    if (/^\s*\}/.test(line)) { closeModel(i, line.indexOf('}')); continue; }

    if (/@@ignore\b/.test(line)) { current.ignored = true; continue; }

    // Block attributes: @@index, @@unique, @@id — all become real indexes.
    //
    // Prisma accepts a single field without brackets: `@@index(companyId)` is
    // the same index as `@@index([companyId])`, and Prisma's own DMMF records
    // it as one. The first version of this regex required the brackets, so
    // that form was silently dropped and both its fields were reported as
    // unindexed. Found during manual verification of the schema corpus.
    const blockIndex = line.match(
      /@@(index|unique|id)\s*\(\s*(?:fields\s*:\s*)?(?:\[([^\]]+)\]|([A-Za-z_]\w*))/,
    );
    if (blockIndex) {
      const columns = blockIndex[2] !== undefined ? columnsOf(blockIndex[2]) : [blockIndex[3]];
      const kind = blockIndex[1] as 'index' | 'unique' | 'id';
      if (columns.length > 0) current.indexes.push({ columns, source: kind });
      continue;
    }

    // Prisma does not require indentation. WinnieLooh/BoboQ has every field
    // at column 0, and `^\s+` required at least one leading space, so all its
    // fields — and its three foreign keys — were silently skipped. This only
    // runs inside a model block (`current` is set), so `^\s*` cannot pick up
    // generator, datasource or enum lines.
    const fieldMatch = line.match(/^\s*(\w+)\s+([\w[\]?]+)/);
    if (!fieldMatch) continue;
    const [, name, type] = fieldMatch;

    // `project Project @relation(fields: [projectId], references: [id])`
    // names the foreign key column. This is the declaration, not a guess.
    // `fields: projectId` without brackets is equally valid Prisma; missing it
    // would leave the foreign key out of the denominator entirely, which is
    // worse than a false positive because nothing shows up to be checked.
    // Prisma also allows whitespace before the colon — DivijJ16's schema
    // writes `fields : [userId]`, which `fields:` did not match.
    const relation = line.match(/@relation\s*\([^)]*fields\s*:\s*(?:\[([^\]]+)\]|([A-Za-z_]\w*))/);
    if (relation) {
      const columns = relation[1] !== undefined ? columnsOf(relation[1]) : [relation[2]];
      for (const fk of columns) {
        const existing = current.fields.get(fk);
        if (existing) existing.isForeignKey = true;
        else current.fields.set(fk, { name: fk, type: 'unknown', line: lineNo, isForeignKey: true });
      }
      const key = columns.join(',');
      if (columns.length > 0 && !current.foreignKeys.some(f => f.columns.join(',') === key)) {
        current.foreignKeys.push({ columns, line: lineNo });
      }
      // The relation field itself is not a column.
      continue;
    }

    const existing = current.fields.get(name);
    if (existing) {
      existing.type = type;
      existing.line = lineNo;
    } else {
      current.fields.set(name, { name, type, line: lineNo, isForeignKey: false });
    }

    // Field-level @id / @unique are single-column indexes.
    if (/@id\b/.test(line)) current.indexes.push({ columns: [name], source: 'id' });
    else if (/@unique\b/.test(line)) current.indexes.push({ columns: [name], source: 'unique' });
  }

  // A schema that ends without closing its last model: keep what is there.
  if (current) {
    const rest = rawLines.slice(currentStart);
    rest[0] = rest[0].slice(currentStartCol);
    (current as ModelInfo).source = rest.join('\n');
  }

  return models;
}

// ---------------------------------------------------------------------------
// Recommendation format
// ---------------------------------------------------------------------------

/**
 * The recommendation every index rule emits. All four rules build it here, and
 * the solution generator reads the model and columns back with
 * `parseIndexRecommendation` — keeping both halves in one file is what stops
 * the wording drifting away from the parser.
 */
export function indexRecommendation(model: string, columns: string[]): string {
  return `Add @@index([${columns.join(', ')}]) to model '${model}' in schema.prisma`;
}

/** The model and columns an index finding asks for, or null if it names none. */
export function parseIndexRecommendation(recommendation: string): { model: string; columns: string[] } | null {
  const match = recommendation.match(/@@index\(\[([^\]]+)\]\) to model '(\w+)'/);
  if (!match) return null;
  const columns = match[1].split(',').map(c => c.trim()).filter(Boolean);
  return columns.length > 0 ? { model: match[2], columns } : null;
}

/** One foreign key and whether any index can serve it. */
export interface ForeignKeyCoverage {
  model: string;
  columns: string[];
  /** The line of the first column's declaration. */
  line: number;
  indexed: boolean;
}

/**
 * Every foreign key across the given models, with its coverage.
 *
 * This is the one place foreign-key coverage is decided. The detection rule,
 * the scan metrics and the study harness all call it, so the number of
 * findings, the denominator in `results.json` and the figures in an article
 * cannot disagree — the study script previously reimplemented the coverage
 * check itself, which is how a second implementation starts to drift.
 *
 * A composite foreign key counts as covered only when a single index leads
 * with *all* of its columns. An index leading with just the first column does
 * help Postgres, but it still re-checks the remaining columns row by row,
 * which is the same standard `missing-composite` applies to filters.
 */
export function foreignKeyCoverage(models: Map<string, ModelInfo>): ForeignKeyCoverage[] {
  const out: ForeignKeyCoverage[] = [];
  for (const model of models.values()) {
    if (model.ignored) continue;
    for (const fk of model.foreignKeys) {
      out.push({
        model: model.name,
        columns: fk.columns,
        line: model.fields.get(fk.columns[0])?.line ?? fk.line,
        indexed: servesFieldSet(model, fk.columns),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cross-file model registry
// ---------------------------------------------------------------------------

let schemaModels: Map<string, ModelInfo> = new Map();

/** Query call sites examined this scan. Not derivable from the registry. */
let querySitesExamined = 0;

/**
 * Clear models collected from a previous scan. The engine calls this before
 * every run: without it, models leak between scans of different projects, and
 * a stale model makes findings that name fields the current schema does not
 * have.
 */
export function resetIndexRuleCache(): void {
  schemaModels = new Map();
  querySitesExamined = 0;
}

/**
 * Denominators for this scan.
 *
 * "12 unindexed foreign keys" is not a result on its own — across 20 foreign
 * keys it is a broken schema, across 400 it is housekeeping. Prevalence is the
 * question an application report answers, so the count of what was examined
 * ships alongside the count of what was found.
 *
 * Foreign-key figures are computed from the parsed models rather than tallied
 * during detection, so they cannot drift from what the rules actually saw.
 *
 * `index.explicitIndexes` counts `@@index` only. Primary keys and unique
 * constraints also create real indexes, and coverage checks count them — but
 * reporting them here would inflate the figure with indexes nobody chose to
 * add. A schema with eight models has at least eight primary keys whether or
 * not anyone thought about performance.
 */
export function indexRuleMetrics(): Record<string, number> {
  let models = 0;
  let explicitIndexes = 0;

  for (const model of schemaModels.values()) {
    if (model.ignored) continue;
    models++;
    explicitIndexes += model.indexes.filter(i => i.source === 'index').length;
  }

  const coverage = foreignKeyCoverage(schemaModels);

  return {
    'index.models': models,
    'index.explicitIndexes': explicitIndexes,
    'index.foreignKeys': coverage.length,
    'index.foreignKeysIndexed': coverage.filter(fk => fk.indexed).length,
    'index.querySitesExamined': querySitesExamined,
  };
}

// ---------------------------------------------------------------------------
// Schema-level detection
// ---------------------------------------------------------------------------

function detectSchemaIssues(filePath: string, _content: string, _ast: any): DiagnosticIssue[] {
  const models = parseSchema(_content);
  models.forEach((model, name) => schemaModels.set(name, model));

  const issues: DiagnosticIssue[] = [];

  for (const fk of foreignKeyCoverage(models)) {
    if (fk.indexed) continue;

    const label = fk.columns.length === 1 ? `'${fk.columns[0]}'` : `[${fk.columns.join(', ')}]`;

    issues.push({
      id: '', rule: 'index/missing-fk-index', category: 'index', severity: 'high',
      file: filePath, line: fk.line,
      title: `Foreign key ${label} on '${fk.model}' has no index`,
      description:
        `Prisma does not create indexes for foreign keys — unlike Rails and Django, which do it ` +
        `automatically. Every query filtering or joining on ${label}, and every cascading ` +
        `delete of the parent row, scans the whole '${fk.model}' table.`,
      codeBefore: models.get(fk.model)?.source,
      recommendation: indexRecommendation(fk.model, fk.columns),
      studyReference: 'Study 05, BM-03',
      empiricalSpeedup: '10–100× depending on table size',
      confidence: 0.9,
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Query call-site detection
// ---------------------------------------------------------------------------

interface QuerySite {
  model: ModelInfo;
  line: number;
  column: number;
  whereFields: string[];
  orderByFields: string[];
  /** The query targets a composite unique by name, so it is served already. */
  usesCompoundSelector: boolean;
}

/** `prisma.subscriber.findMany(...)` / `tx.subscriber.count(...)` → "Subscriber". */
function prismaModelName(callee: any): string | null {
  if (!t.isMemberExpression(callee) || !t.isIdentifier(callee.property)) return null;

  const owner = callee.object;
  if (!t.isMemberExpression(owner) || !t.isIdentifier(owner.property)) return null;

  const rootName = t.isIdentifier(owner.object)
    ? owner.object.name
    : t.isMemberExpression(owner.object) && t.isIdentifier(owner.object.property)
      ? owner.object.property.name
      : null;

  if (!rootName) return null;
  if (!/^(prisma|prismaClient|db|tx|trx|client)$/i.test(rootName)) return null;

  const raw = owner.property.name;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Collect real column names from a where object, skipping operators. */
function collectWhereFields(
  node: any,
  model: ModelInfo,
  out: Set<string>,
  state: { compound: boolean },
  depth = 0,
): void {
  if (!t.isObjectExpression(node) || depth > 6) return;

  for (const prop of node.properties) {
    if (!t.isObjectProperty(prop)) continue;
    const key = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null;
    if (!key) continue;

    // Logical combinators hold nested where objects.
    if (key === 'AND' || key === 'OR' || key === 'NOT') {
      if (t.isArrayExpression(prop.value)) {
        for (const element of prop.value.elements) collectWhereFields(element, model, out, state, depth + 1);
      } else {
        collectWhereFields(prop.value, model, out, state, depth + 1);
      }
      continue;
    }

    if (WHERE_OPERATORS.has(key)) continue;

    // `projectId_email: { ... }` selects a composite unique by name.
    if (compoundSelectorFor(model, key)) {
      state.compound = true;
      continue;
    }

    // A relation filter (`project: { slug: ... }`) constrains another model;
    // it says nothing about an index on this one.
    if (!model.fields.has(key)) continue;

    out.add(key);
  }
}

function collectOrderByFields(node: any, model: ModelInfo, out: Set<string>): void {
  const fromObject = (obj: any) => {
    if (!t.isObjectExpression(obj)) return;
    for (const prop of obj.properties) {
      if (!t.isObjectProperty(prop)) continue;
      const key = t.isIdentifier(prop.key) ? prop.key.name : null;
      if (key && model.fields.has(key)) out.add(key);
    }
  };

  if (t.isArrayExpression(node)) node.elements.forEach(fromObject);
  else fromObject(node);
}

function findQuerySites(content: string): QuerySite[] {
  let ast;
  try {
    ast = parse(content, {
      sourceType: 'unambiguous',
      plugins: ['typescript', 'jsx', 'decorators-legacy'],
      errorRecovery: true,
    });
  } catch {
    return [];
  }

  const sites: QuerySite[] = [];

  traverse(ast, {
    noScope: true,
    CallExpression(path: any) {
      const node = path.node;
      const method = t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)
        ? node.callee.property.name
        : null;
      if (!method || !/^(findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow|count|aggregate|groupBy|updateMany|deleteMany)$/.test(method)) {
        return;
      }

      const modelName = prismaModelName(node.callee);
      if (!modelName) return;

      const model = schemaModels.get(modelName);
      if (!model) return;

      const arg = node.arguments[0];
      if (!t.isObjectExpression(arg)) return;
      const loc = node.loc?.start;
      if (!loc) return;

      const whereFields = new Set<string>();
      const orderByFields = new Set<string>();
      const state = { compound: false };

      for (const prop of arg.properties) {
        if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue;
        if (prop.key.name === 'where') collectWhereFields(prop.value, model, whereFields, state);
        if (prop.key.name === 'orderBy') collectOrderByFields(prop.value, model, orderByFields);
      }

      if (whereFields.size === 0 && orderByFields.size === 0 && !state.compound) return;

      sites.push({
        model,
        line: loc.line,
        column: loc.column,
        whereFields: [...whereFields],
        orderByFields: [...orderByFields],
        usesCompoundSelector: state.compound,
      });
    },
  });

  return sites;
}

function detectQueryIssues(filePath: string, content: string, _ast: any): DiagnosticIssue[] {
  if (schemaModels.size === 0) return [];
  if (!/\b(prisma|prismaClient|db|tx|trx|client)\s*\.\s*\w+\s*\./.test(content)) return [];

  const issues: DiagnosticIssue[] = [];

  for (const site of findQuerySites(content)) {
    querySitesExamined++;
    const { model, whereFields, orderByFields } = site;

    // A compound-unique selector is served by that unique index by definition.
    // Otherwise, ask whether the filter *as a whole* is served before looking
    // at fields individually: `where: { projectId, createdAt }` against
    // `@@index([projectId, createdAt])` is fully covered, even though
    // `createdAt` does not lead any index on its own.
    const filterFullyServed = whereFields.length > 0 && servesFieldSet(model, whereFields);

    if (!site.usesCompoundSelector && !filterFullyServed) {
      for (const field of whereFields) {
        if (servesField(model, field)) continue;
        issues.push({
          id: '', rule: 'index/missing-filter-index', category: 'index', severity: 'high',
          file: filePath, line: site.line, column: site.column,
          title: `Field '${field}' filtered on '${model.name}' has no index`,
          description:
            `This query filters '${model.name}' by '${field}', and no index on that model leads with ` +
            `'${field}'. Postgres can only use an index for a leading column, so this is a sequential scan.`,
          codeBefore: model.source,
          recommendation: indexRecommendation(model.name, [field]),
          studyReference: 'Study 05, BM-01',
          empiricalSpeedup: 'Seq Scan → Index Scan (10–1000× at scale)',
          confidence: 0.8,
        });
      }

      if (whereFields.length >= 2) {
        issues.push({
          id: '', rule: 'index/missing-composite', category: 'index', severity: 'medium',
          file: filePath, line: site.line, column: site.column,
          title: `Multi-field filter on '${model.name}' [${whereFields.join(', ')}] has no composite index`,
          description:
            `No index on '${model.name}' starts with these ${whereFields.length} fields. Postgres can use ` +
            `one single-column index and then re-check the rest row by row.`,
          codeBefore: model.source,
          recommendation: indexRecommendation(model.name, whereFields),
          studyReference: 'Study 05, BM-04',
          empiricalSpeedup: 'Composite index eliminates the filter + recheck step',
          confidence: 0.65,
        });
      }
    }

    // Sorting is reported only where an orderBy actually appears. The previous
    // version reported any field named createdAt or updatedAt on the theory
    // that it was "commonly used in orderBy", which is a guess about code it
    // had not looked at.
    for (const field of orderByFields) {
      if (servesField(model, field)) continue;
      issues.push({
        id: '', rule: 'index/missing-sort-index', category: 'index', severity: 'medium',
        file: filePath, line: site.line, column: site.column,
        title: `Sorting '${model.name}' by '${field}' with no index`,
        description:
          `This query orders by '${field}' and no index leads with it, so Postgres sorts the result ` +
          `set in memory. The cost grows with the number of rows matched, not returned.`,
        codeBefore: model.source,
        recommendation: indexRecommendation(model.name, [field]),
        studyReference: 'Study 05, BM-02',
        empiricalSpeedup: 'Eliminates an O(n log n) sort',
        confidence: 0.75,
      });
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
    reset: resetIndexRuleCache, metrics: indexRuleMetrics,
  },
  {
    id: 'index/missing-sort-index', name: 'Missing Sort Index', category: 'index', severity: 'medium',
    filePatterns: TS_PATTERNS, needsAst: false, detect: detectQueryIssues,
    reset: resetIndexRuleCache, metrics: indexRuleMetrics,
  },
  {
    id: 'index/missing-filter-index', name: 'Missing Filter Index', category: 'index', severity: 'high',
    filePatterns: TS_PATTERNS, needsAst: false, detect: detectQueryIssues,
    reset: resetIndexRuleCache, metrics: indexRuleMetrics,
  },
  {
    id: 'index/missing-composite', name: 'Missing Composite Index', category: 'index', severity: 'medium',
    filePatterns: TS_PATTERNS, needsAst: false, detect: detectQueryIssues,
    reset: resetIndexRuleCache, metrics: indexRuleMetrics,
  },
];
