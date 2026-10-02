/**
 * Large payload rules — derived from Study 09 (large-payload-detector.ts)
 *
 * Detects 2 anti-patterns using Babel AST traversal:
 *   payload/unbounded-query — findAll/findMany without field selection or a row limit
 *   payload/large-return    — returning unbounded query results directly from a function
 *
 * The first version of these rules matched on the method name alone, with
 * `find` in the list and nothing to corroborate it. That is the same mistake
 * the N+1 rule made in its first round: `Array.prototype.find(cb)`,
 * `Map.get()` and a plain object named `store` all match. Scanning this very
 * package reported `find() without field selection and a row limit` against an
 * in-memory array lookup.
 *
 * Both rules now go through the shared heuristics in `db-call-heuristics.ts`:
 * distinctive ORM method names are evidence on their own, ambiguous ones need
 * an ORM import, a query-builder chain, a database handle or a data-access
 * receiver before anything is reported.
 *
 * Only a missing row limit is reported. The first version also reported a
 * query that had a limit but no `select`, which is 143 of the 3,584 findings
 * across the Study 09 corpus: `findMany({ take: 20 })` is not what makes a
 * response large. The number of rows is what grows with data; the number of
 * columns does not.
 *
 * Round 2 (2026-09-24) comes from labelling 400 findings across the 283
 * repositories of the Study 09 corpus. Five causes, each handled below:
 *
 *   1. Files that never serve a request: test directories the engine does not
 *      skip (`test/`, `tests/`, fixtures), migrations, seeds, scripts, samples,
 *      and vendored or minified bundles. 2,085 of 3,441 findings.
 *   2. Filters bounded by the caller: `where: { id: { in: ids } }`,
 *      `{ _id: { $in: ids } }`, `In(ids)`, or an id equality. The largest class
 *      in the rest: 85 of 300 labelled.
 *   3. A limit the rule could not see: Mongoose takes options as its third
 *      argument, and a chained `.limit()`, `.countDocuments()` or `.cursor()`
 *      bounds or replaces the rows.
 *   4. Calls that are not queries but pass the shared heuristics: selector
 *      lookups (`testSubjects.findAll('row')`), callback finders, and an
 *      application service's own `findAll()`, whose query is reported inside
 *      the service.
 *   5. `return await x.findMany()` was reported twice, once by each rule.
 */

import traverse from '@babel/traverse';
import type { RuleDefinition, DiagnosticIssue } from '../types';
import {
  AMBIGUOUS_DB_METHODS,
  DISTINCTIVE_DB_METHODS,
  classifyDatabaseCall,
  collectDbContext,
  isDefinitelyNotADatabaseCall,
  receiverName,
  rootIdentifierName,
  type DbContext,
} from './db-call-heuristics';

const JS_PATTERNS = ['*.js', '*.ts', '*.jsx', '*.tsx', '*.mjs'];

/**
 * Finders that return a collection. A payload rule is about rows coming back,
 * so `findUnique` and friends are irrelevant here even though they are
 * database calls.
 */
const COLLECTION_FINDERS = new Set(['findAll', 'findMany', 'find', 'getMany', 'findAndCountAll']);

/**
 * Directories whose code never serves a request. A whole-table read in a
 * migration or a seed is expected, and a test fixture's is irrelevant.
 */
const NOT_SERVED_PATH = new RegExp([
  String.raw`(^|/)(test|tests|__fixtures__|fixtures|cypress|e2e|integration-tests|node-integration-tests)(/|$)`,
  String.raw`\.(integration-test|cy)\.[cm]?[jt]sx?$|\.test-d\.tsx?$`,
  String.raw`(^|/)(migrations?|data-migrations|seeds?|seeders|scripts)(/|$)`,
  // knex_migrations/, migration-scripts/, migration-jobs/ (added in Stage 2, item 2)
  String.raw`(^|/)[\w-]*[-_]migrations?(/|$)|(^|/)migrations?[-_][\w-]*(/|$)`,
  String.raw`(^|/)seed[-\w]*\.[cm]?[jt]s$`,
  String.raw`(^|/)(examples?|samples?|sandbox|benchmarks?|type-benchmark-tests)(/|$)`,
  // Hyphenated variants (Stage 2, item 4): e2e-tests/, test-applications/,
  // cubejs-testing-shared/, backend-test-utils/, samples-dev/.
  // Directories only (n8n serves `evaluation.ee/test-runs.controller.ee.ts`),
  // and not any name with "test" in it (novu serves `build-test-data/`).
  String.raw`(^|/)(e2e|tests?|testing|samples?|examples?)-[\w.-]+/`,
  String.raw`(^|/)[\w.-]+-(test|testing)-(utils|helpers|shared|harness|kit)[\w.-]*/`,
  String.raw`(^|/)[\w.-]+-(e2e|tests|samples|examples)/`,
  String.raw`(^|/)test-(helpers|utils)\.[cm]?[jt]sx?$`,
  // logto's schema alterations are migrations; trigger.dev's references/ are sample projects.
  String.raw`(^|/)(\.scripts|alterations|references)(/|$)`,
  String.raw`(^|/)(vendor|\.yarn)(/|$)|\.min\.[cm]?js$`,
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

/** Chained calls that bound the rows, or replace them with a count or a stream. */
const BOUNDING_CHAIN = new Set([
  'limit', 'take', 'paginate', 'countDocuments', 'estimatedDocumentCount', 'count',
  'cursor', 'batchSize', 'stream', 'first', 'findOne',
]);

/** Receivers that are an application service, not a data-access object. */
const SERVICE_RECEIVER = /Service$/;

/** Receivers that are UI or cache lookups whose finders share ORM names. */
const NON_DB_FINDER_RECEIVERS = new Set(['testSubjects', 'find', 'browser', 'page', 'cy', 'Walker']);

/**
 * The query exactly as written, for the solution generator: it rewrites this
 * text and the suggestion is pasted back over it.
 */
function sourceOf(code: string, node: any): string | undefined {
  return typeof node?.start === 'number' && typeof node?.end === 'number' ? code.slice(node.start, node.end) : undefined;
}

function snippetAt(code: string, line: number): string {
  return (code.split('\n')[line - 1] ?? '').trim().slice(0, 120);
}

function hasRowLimit(optionsNode: any): boolean {
  let hasLimit = false;
  if (!optionsNode || optionsNode.type !== 'ObjectExpression') return hasLimit;

  try {
    traverse(optionsNode, {
      noScope: true,
      ObjectProperty(inner: any) {
        const key = inner.node.key?.name;
        if (key === 'limit' || key === 'take' || key === 'perPage') hasLimit = true;
      },
    });
  } catch {
    // ignore
  }
  return hasLimit;
}

/** Any object argument carries a limit — Mongoose puts options third. */
function anyArgumentHasRowLimit(callExpr: any): boolean {
  return (callExpr.arguments ?? []).some((arg: any) => hasRowLimit(arg));
}

/** `.find(q).skip(n).limit(m)`, `.find().countDocuments()`, `.find().cursor()`. */
function chainBoundsRows(path: any): boolean {
  let current = path;
  for (let depth = 0; depth < 8; depth++) {
    const parent = current.parentPath;
    if (!parent || parent.node.type !== 'MemberExpression' || parent.node.object !== current.node) return false;
    const name = parent.node.property?.name;
    if (name && BOUNDING_CHAIN.has(name)) return true;
    const call = parent.parentPath;
    if (!call || call.node.type !== 'CallExpression' || call.node.callee !== parent.node) return false;
    current = call;
  }
  return false;
}

const keyName = (prop: any): string | null =>
  prop?.key?.type === 'Identifier' ? prop.key.name
    : prop?.key?.type === 'StringLiteral' ? prop.key.value
    : null;

/** Logical combinators hold nested filters, not values. */
const LOGICAL_KEYS = new Set(['OR', 'AND', 'NOT', '$or', '$and', '$nor', 'or', 'and']);

/** Keys that select one row: `where: { id }`, `{ slug }`. */
const UNIQUE_KEYS = new Set(['id', '_id', 'uuid', 'slug']);


/** `id`, `_id`, `userId`, `workflowIds`, `project_id`. */
const ID_LIKE_KEY = /^(_?id|\w+(Id|Ids|_id|_ids|Uuid|Uuids))$/;

/**
 * An IN list whose members the caller supplied: `{ in: ids }`,
 * `{ $in: items.map(...) }`, `In(ids)`, `{ [Op.in]: ids }`. A constant list —
 * `type: { $in: [Kind.ECHO, Kind.BRIDGE] }` — selects a category of rows, not
 * a known set of them, so it bounds nothing. A bare array value only means IN
 * for an id-like key: Sequelize reads `where: { id: ids }` as IN, but Mongo
 * reads `projects: [projectId]` as an exact array match.
 */
function isInList(key: string, value: any): boolean {
  if (!value) return false;
  const callerSupplied = (operand: any) => operand && operand.type !== 'ArrayExpression';
  if (value.type === 'ArrayExpression') return ID_LIKE_KEY.test(key);
  if (value.type === 'CallExpression' && value.callee?.type === 'Identifier' && value.callee.name === 'In') {
    return callerSupplied(value.arguments?.[0]) || ID_LIKE_KEY.test(key);
  }
  if (value.type === 'ObjectExpression') {
    return value.properties.some((p: any) => {
      const k = keyName(p);
      const isIn = k === 'in' || k === '$in' || (p.computed && p.key?.type === 'MemberExpression' && p.key.property?.name === 'in');
      return isIn && (callerSupplied(p.value) || ID_LIKE_KEY.test(key));
    });
  }
  return false;
}

/**
 * The filter is bounded by what the caller passed in: an IN list or an id.
 * Only top-level keys count — `teams: { some: { teamId: { in: ids } } }`
 * selects every member of those teams and stays a finding.
 */
function filterIsBoundedByKey(callExpr: any): boolean {
  const filters: any[] = [];
  for (const arg of callExpr.arguments ?? []) {
    if (arg?.type !== 'ObjectExpression') continue;
    const where = arg.properties.find((p: any) => keyName(p) === 'where');
    if (where) filters.push(where.value);
    // Mongo-style: the first object argument is the filter itself.
    else if (filters.length === 0 && !arg.properties.some((p: any) => ['select', 'include', 'orderBy', 'relations', 'order'].includes(keyName(p) ?? ''))) {
      filters.push(arg);
    }
  }

  return filters.some(filter => filter?.type === 'ObjectExpression' && filter.properties.some((p: any) => {
    const k = keyName(p);
    if (!k || LOGICAL_KEYS.has(k)) return false;
    if (isInList(k, p.value)) return true;
    const scalar = p.value && p.value.type !== 'ObjectExpression' && p.value.type !== 'ArrayExpression';
    // Not done: treating `{ spaceUuids }` (a plural id key holding a list) as
    // bounded. It removed six false positives in the labelled sample and one
    // true positive — `savedChartModel.find({ spaceUuids: allowedSpaceUuids })`
    // loads every chart in every space the user can see. A list of the rows'
    // own ids bounds the result; a list of parent ids does not, and the key
    // name cannot tell the two apart.
    return UNIQUE_KEYS.has(k) && scalar;
  }));
}

/** Finder-shaped calls that are not queries: selectors, callbacks, services. */
function isNotACollectionQuery(callExpr: any): boolean {
  const args = callExpr.arguments ?? [];
  if (args[0]?.type === 'StringLiteral' || args[0]?.type === 'TemplateLiteral') return true;
  if (args.some((a: any) => a.type === 'ArrowFunctionExpression' || a.type === 'FunctionExpression')) return true;

  const receiver = callExpr.callee?.object;
  const name = receiver?.type === 'Identifier' ? receiver.name
    : receiver?.type === 'MemberExpression' ? receiver.property?.name
    : null;
  if (name && (SERVICE_RECEIVER.test(name) || NON_DB_FINDER_RECEIVERS.has(name))) return true;

  // queryClient.getQueryCache().findAll(...)
  if (receiver?.type === 'CallExpression' && receiver.callee?.property?.name === 'getQueryCache') return true;
  return false;
}

/**
 * True when this call is a database query returning a collection. Returns
 * false for anything that only looks like one by name.
 */
function isCollectionQuery(callExpr: any, method: string, ctx: DbContext, resultIsAwaited: boolean): boolean {
  if (!COLLECTION_FINDERS.has(method)) return false;
  if (!DISTINCTIVE_DB_METHODS.has(method) && !AMBIGUOUS_DB_METHODS.has(method)) return false;
  if (isDefinitelyNotADatabaseCall(callExpr, method, ctx)) return false;
  return classifyDatabaseCall(callExpr, method, ctx, resultIsAwaited) !== null;
}

const PROMISE_CONTEXT = new Set([
  'AwaitExpression', 'ReturnStatement', 'ArrowFunctionExpression',
  'ArrayExpression', 'CallExpression', 'YieldExpression',
]);

// ---------------------------------------------------------------------------
// Query builders — Stage 2, item 2
// ---------------------------------------------------------------------------
//
// Stage 1's largest false-negative class: directus, nocodb and lightdash write
// their queries with knex, never call a finder, and reported nothing. A builder
// chain is a query when it is executed — awaited, returned, `.then()`-ed or
// ended with a terminal method — and unbounded when nothing on it, or on the
// variable holding it, limits the rows.

/** Handles called with a table name: `knex('users')`, `this.database('t')`. */
const KNEX_HANDLES = new Set(['knex', 'db', 'trx', 'tx', 'database', 'dbDriver', 'knexClient', 'conn']);
/** `knex.select(...)`, `knex.from('t')`, `db.table('t')`: a chain started on the handle. */
const KNEX_ENTRY = new Set(['select', 'from', 'table', 'distinct', 'queryBuilder']);
/** Methods that execute a TypeORM or Kysely chain and return every row. */
const BUILDER_TERMINAL = new Set(['getMany', 'getRawMany', 'getManyAndCount', 'getRawAndEntities', 'execute']);
/** Methods that bound the rows, or replace them with one row or a stream. */
const BUILDER_BOUNDING = new Set([
  'limit', 'first', 'take', 'paginate', 'modify', 'count', 'countDistinct', 'sum', 'sumDistinct', 'avg',
  'avgDistinct', 'min', 'max', 'executeTakeFirst', 'executeTakeFirstOrThrow', 'getOne', 'getOneOrFail',
  'getRawOne', 'getCount', 'getExists', 'stream', 'cursor',
]);
/** Methods that turn a chain into SQL text without running it. */
const BUILDER_NOT_RUN = new Set(['toSQL', 'toQuery', 'toString', 'toNative', 'getQuery', 'getSql', 'compile']);
/**
 * Database catalogs: `information_schema.tables`, `sqlite_master`, Oracle's
 * `USER_TABLES`. They grow with the schema, not with the data, so reading one
 * whole is how schema inspection works.
 */
const CATALOG_TABLE = /^(information_schema\.|pg_catalog\.|pg_[a-z]|sqlite_(master|schema|sequence)$|pragma_|(user|all|dba)_(tab|tables|views|cons|ind|objects|col))/i;
/** SQL aggregates: a select of one of these returns one row, or one per group. */
const AGGREGATE_SQL = /\b(count|sum|avg|min|max|array_agg|json_agg|jsonb_agg|string_agg|group_concat|bool_and|bool_or)\s*\(/i;
const AGGREGATE_FN = new Set(['count', 'countAll', 'countDistinct', 'sum', 'avg', 'min', 'max']);
/** Writes are not reads. */
const BUILDER_WRITES = new Set([
  'insert', 'update', 'del', 'delete', 'truncate', 'increment', 'decrement', 'upsert', 'softDelete',
  'restore', 'insertInto', 'updateTable', 'deleteFrom', 'merge', 'onConflict',
]);
const KEY_WHERES = new Set(['where', 'andWhere', 'whereIn', 'andWhereIn']);
const SELECTS = new Set(['select', 'addSelect', 'column', 'columns', 'distinct', 'pluck']);

interface BuilderChain {
  kind: 'knex' | 'typeorm' | 'kysely' | 'var';
  /** For 'var': the variable the chain continues. */
  varName?: string;
  table: string | null;
  methods: string[];
  /** Arguments of where-like calls, to spot a where on the table's own key. */
  wheres: any[][];
  /** Arguments of select-like calls, to spot an aggregate. */
  selects?: any[][];
}

/**
 * The handle a chain is rooted at: `knex(...)`, `this.database(...)`,
 * `ncMeta.knex(...)`. A handle name on any other receiver is not a knex
 * instance: `client.db(name)` is a MongoDB database, `metadata.database(id)`
 * and Spanner's `instance.database(id)` are lookups.
 */
function calleeHandleName(callee: any): string | null {
  if (callee?.type === 'Identifier') return callee.name;
  if (callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier'
    && (callee.object?.type === 'ThisExpression' || callee.property.name === 'knex')) return callee.property.name;
  return null;
}

const tableArg = (arg: any): string | null =>
  arg?.type === 'StringLiteral' ? arg.value
    : arg?.type === 'TemplateLiteral' && arg.quasis.length === 1 ? arg.quasis[0].value.cooked
    : null;

const snake = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/**
 * The table a handle is called with. Besides a literal, codebases name tables
 * with constants — Lightdash's `ProjectTableName`, nocodb's
 * `MetaTable.COMMENTS` — and the name says which table it is.
 */
function tableOf(arg: any): string | null {
  const lit = tableArg(arg);
  if (lit) return lit;
  const name = arg?.type === 'Identifier' ? arg.name
    : arg?.type === 'MemberExpression' && arg.property?.type === 'Identifier' ? arg.property.name
    : null;
  if (!name) return null;
  const m = name.match(/^(\w+?)_?(TableName|Table|TABLE_NAME|TABLE)$/);
  if (m) return snake(m[1]);
  if (arg.type === 'MemberExpression' && /^[A-Z][A-Z0-9_]+$/.test(name)) return name.toLowerCase();
  return null;
}

/** `${SavedChartsTableName}.saved_query_uuid` -> [table, column]. */
function columnOf(arg: any): { table: string | null; column: string } | null {
  const lit = tableArg(arg);
  if (lit && /^[\w.]+$/.test(lit)) {
    const parts = lit.split('.');
    return { table: parts.length > 1 ? parts[parts.length - 2] : null, column: parts[parts.length - 1] };
  }
  if (arg?.type === 'TemplateLiteral' && arg.expressions.length === 1 && arg.quasis.length === 2
    && arg.quasis[0].value.cooked === '' && arg.quasis[1].value.cooked.startsWith('.')) {
    return { table: tableOf(arg.expressions[0]), column: arg.quasis[1].value.cooked.slice(1) };
  }
  return null;
}

/** True when `node` contains an SQL aggregate: `count()`, `fn.countAll()`, `raw('ARRAY_AGG(x)')`. */
function hasAggregate(node: any, depth = 0): boolean {
  if (!node || typeof node !== 'object' || depth > 14) return false;
  if (node.type === 'StringLiteral') return AGGREGATE_SQL.test(node.value);
  if (node.type === 'TemplateLiteral') return node.quasis.some((q: any) => AGGREGATE_SQL.test(q.value.cooked ?? ''));
  if (node.type === 'CallExpression') {
    const c = node.callee;
    const name = c?.type === 'Identifier' ? c.name : c?.type === 'MemberExpression' ? c.property?.name : null;
    if (name && AGGREGATE_FN.has(name)) return true;
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments' || key === 'trailingComments') continue;
    const v = node[key];
    if (Array.isArray(v)) { if (v.some(x => hasAggregate(x, depth + 1))) return true; }
    else if (v && typeof v === 'object' && typeof v.type === 'string' && hasAggregate(v, depth + 1)) return true;
  }
  return false;
}

/** Walk a chain from its outermost call to its root. Null when it is not a builder chain. */
function builderChain(outer: any): BuilderChain | null {
  const methods: string[] = [];
  const wheres: any[][] = [];
  const selects: any[][] = [];
  let table: string | null = null;
  let n = outer;
  for (let depth = 0; depth < 40 && n; depth++) {
    if (n.type === 'Identifier') {
      return methods.length ? { kind: 'var', varName: n.name, table, methods, wheres, selects } : null;
    }
    if (n.type !== 'CallExpression') return null;
    const callee = n.callee;

    // knex('users'), this.database('spaces'), trx(table)
    const handle = calleeHandleName(callee);
    if (handle && KNEX_HANDLES.has(handle) && n.arguments?.length >= 1) {
      const a = n.arguments[0];
      if (a.type === 'StringLiteral' || a.type === 'TemplateLiteral' || a.type === 'Identifier' || a.type === 'MemberExpression') {
        return { kind: 'knex', table: table ?? tableOf(a), methods, wheres, selects };
      }
    }
    if (callee?.type !== 'MemberExpression' || callee.property?.type !== 'Identifier') return null;
    const m = callee.property.name;
    methods.push(m);
    if (KEY_WHERES.has(m)) wheres.push(n.arguments ?? []);
    if (SELECTS.has(m)) selects.push(n.arguments ?? []);
    if ((m === 'from' || m === 'table') && !table) table = tableOf(n.arguments?.[0]);
    if (m === 'createQueryBuilder') {
      // TypeORM names the root by its alias: createQueryBuilder('u') or (User, 'u').
      const alias = [...(n.arguments ?? [])].reverse().map(tableArg).find(Boolean) ?? null;
      return { kind: 'typeorm', table: table ?? alias, methods, wheres, selects };
    }
    if (m === 'selectFrom') return { kind: 'kysely', table: tableOf(n.arguments?.[0]), methods, wheres, selects };
    const objHandle = callee.object?.type === 'Identifier' ? callee.object.name
      : callee.object?.type === 'MemberExpression' && callee.object.object?.type === 'ThisExpression' ? callee.object.property?.name
      : null;
    if (KNEX_ENTRY.has(m) && objHandle && KNEX_HANDLES.has(objHandle)) {
      // knex.select(knex.raw('1')) with no from() reads no table.
      if ((m === 'select' || m === 'distinct') && !methods.includes('from')) return null;
      return { kind: 'knex', table, methods, wheres, selects };
    }
    n = callee.object;
  }
  return null;
}

const singular = (t: string) => t.replace(/ies$/, 'y').replace(/(ses|xes)$/, (x) => x.slice(0, -2)).replace(/s$/, '');

/** `id`, `uuid`, and `<table>_id` / `<table>_uuid` where the table's name ends with that prefix. */
function isOwnKey(column: string, table: string | null): boolean {
  if (column === 'id' || column === 'uuid' || column === '_id') return true;
  const m = column.match(/^(\w+)_(id|uuid)$/);
  if (!m || !table) return false;
  const t = singular(snake(table.split(/\s+as\s+|\s+/i)[0].split('.').pop()!));
  return t === m[1] || t.endsWith(`_${m[1]}`);
}

const tableKey = (t: string) => singular(snake(t.split(/\s+as\s+|\s+/i)[0].split('.').pop()!));
const sameTable = (a: string, b: string) => tableKey(a) === tableKey(b);

/**
 * A where on the table's own key, or an IN over a list the caller passes:
 * `where('id', x)`, `whereIn('spaces.space_uuid', ids)`, `where({ id })`,
 * TypeORM's `.where('q.id IN (:...ids)')`.
 */
function whereOnOwnKey(chain: BuilderChain): boolean {
  return chain.wheres.some(args => {
    const col = columnOf(args[0]);
    // A qualified column on another table is a join's key, not this table's:
    // dashboards joined to spaces `where('spaces.space_uuid', x)` is every
    // dashboard in one space.
    if (col) return isOwnKey(col.column, chain.table) && (!col.table || !chain.table || sameTable(col.table, chain.table));
    const sql = tableArg(args[0]);
    if (sql) {
      const m = sql.match(/^\s*(?:(\w+)\.)?(\w+)\s*(=|in\s*\(\s*:\.\.\.)/i);
      // `user.id = :id` on a builder rooted at 'friend' is a joined row's key.
      if (!m || (m[1] && chain.table && m[1] !== chain.table)) return false;
      const [, , column, op] = m;
      return /^(id|uuid|_id)$/.test(column) || (/^in/i.test(op) && /^(name|slug|key|email)$/.test(column));
    }
    if (args[0]?.type === 'ObjectExpression') {
      return args[0].properties.some((p: any) => {
        const k = keyName(p);
        return !!k && isOwnKey(k.split('.').pop()!, chain.table) && p.value?.type !== 'ObjectExpression';
      });
    }
    return false;
  });
}

const chainTitle = (c: BuilderChain) =>
  c.kind === 'typeorm' ? 'createQueryBuilder() query'
    : c.kind === 'kysely' ? `selectFrom(${c.table ? `'${c.table}'` : ''}) query`
    : `knex(${c.table ? `'${c.table}'` : ''}) query`;

interface BuilderQuery {
  /** Where the query is reported: the chain, or the chain the variable holds. */
  node: any;
  chain: BuilderChain;
  returned: boolean;
}

const isAwaited = (n: any): boolean => {
  let x = n;
  for (let i = 0; i < 6 && x; i++) {
    if (x.type === 'AwaitExpression') return true;
    if (x.type === 'TSAsExpression' || x.type === 'TSNonNullExpression' || x.type === 'ParenthesizedExpression' || x.type === 'TSSatisfiesExpression') x = x.expression;
    else return false;
  }
  return false;
};

const isThenCall = (n: any): boolean =>
  n?.type === 'CallExpression' && n.callee?.type === 'MemberExpression' && n.callee.property?.name === 'then';

const typeAnnotationText = (t: any): string => {
  if (!t) return '';
  const names: string[] = [];
  const walk = (x: any, d: number) => {
    if (!x || typeof x !== 'object' || d > 8) return;
    if (x.type === 'Identifier') names.push(x.name);
    for (const k of ['typeAnnotation', 'typeName', 'typeParameters', 'params', 'types', 'right', 'left']) {
      const v = x[k];
      if (Array.isArray(v)) v.forEach(y => walk(y, d + 1)); else walk(v, d + 1);
    }
  };
  walk(t, 0);
  return names.join(' ');
};

/**
 * Every executed, unbounded builder query in the file, and the chain nodes
 * that are one (so the api-response trace can accept them).
 */
function analyzeBuilders(ast: any): { executed: BuilderQuery[]; unbounded: Map<any, BuilderChain> } {
  const executed: BuilderQuery[] = [];
  const unbounded = new Map<any, BuilderChain>();

  const isBounded = (c: BuilderChain, extra: Set<string>) =>
    c.methods.some(m => BUILDER_BOUNDING.has(m) || BUILDER_WRITES.has(m) || BUILDER_NOT_RUN.has(m))
    || [...extra].some(m => BUILDER_BOUNDING.has(m) || BUILDER_WRITES.has(m) || BUILDER_NOT_RUN.has(m))
    || whereOnOwnKey(c)
    || (!!c.table && CATALOG_TABLE.test(c.table))
    || (c.selects ?? []).some(args => args.some(a => hasAggregate(a)));

  try {
    traverse(ast, {
      noScope: true,
      enter(path: any) {
        const fn = path.node;
        if (!FUNCTION_TYPES.has(fn.type)) return;

        // Per function: what each variable holding a builder is assigned, and
        // every method called on it, so a later `q.limit(n)` counts.
        const assigned = new Map<string, Array<{ node: any; chain: BuilderChain }>>();
        const calledOn = new Map<string, Set<string>>();
        const argsOn = new Map<string, { wheres: any[][]; selects: any[][] }>();
        const escapes = new Set<string>();
        const note = (name: string, m: string) => {
          const set = calledOn.get(name) ?? new Set<string>();
          set.add(m);
          calledOn.set(name, set);
        };
        traverse(fn.body, {
          noScope: true,
          Function(p: any) { p.skip(); },
          VariableDeclarator(p: any) {
            const { id, init } = p.node;
            // `const rows = await q` holds rows, not a builder.
            const c = init && id.type === 'Identifier' && !isAwaited(init) ? builderChain(unwrap(init)) : null;
            if (c) assigned.set(id.name, [...(assigned.get(id.name) ?? []), { node: unwrap(init), chain: c }]);
          },
          AssignmentExpression(p: any) {
            const { left, right } = p.node;
            const c = left.type === 'Identifier' && !isAwaited(right) ? builderChain(unwrap(right)) : null;
            if (c) assigned.set(left.name, [...(assigned.get(left.name) ?? []), { node: unwrap(right), chain: c }]);
          },
          CallExpression(p: any) {
            // q.limit(10), q.where(...).orderBy(...) as statements
            const c = builderChain(p.node);
            if (c?.kind === 'var' && c.varName) {
              c.methods.forEach(m => note(c.varName!, m));
              const a = argsOn.get(c.varName) ?? { wheres: [], selects: [] };
              a.wheres.push(...c.wheres); a.selects.push(...(c.selects ?? []));
              argsOn.set(c.varName, a);
            }
            // applyFilters(q) — handed to code that may paginate it
            for (const a of p.node.arguments ?? []) if (a.type === 'Identifier') escapes.add(a.name);
          },
        } as any, undefined as any);

        const resolve = (c: BuilderChain, seen = new Set<string>()): { chain: BuilderChain; extra: Set<string> } | null => {
          if (c.kind !== 'var') return { chain: c, extra: new Set() };
          const name = c.varName!;
          if (seen.has(name) || escapes.has(name)) return null;
          seen.add(name);
          const bases = assigned.get(name);
          if (!bases?.length) return null;
          const rootChain = bases.map(b => resolve(b.chain, seen)).find(Boolean);
          if (!rootChain) return null;
          const later = argsOn.get(name);
          if (later) {
            rootChain.chain = {
              ...rootChain.chain,
              wheres: [...rootChain.chain.wheres, ...later.wheres],
              selects: [...(rootChain.chain.selects ?? []), ...later.selects],
            };
          }
          const extra = new Set([...rootChain.extra, ...(calledOn.get(name) ?? []), ...bases.flatMap(b => b.chain.methods)]);
          return {
            chain: {
              ...rootChain.chain,
              methods: [...c.methods, ...rootChain.chain.methods],
              wheres: [...c.wheres, ...rootChain.chain.wheres, ...bases.flatMap(b => b.chain.wheres)],
              selects: [...(c.selects ?? []), ...(rootChain.chain.selects ?? []), ...bases.flatMap(b => b.chain.selects ?? [])],
            },
            extra,
          };
        };

        // A function that is not async and does not declare a Promise hands its
        // builder back unexecuted: a query factory, run (and often limited) by
        // its caller.
        // A route handler or resolver's return value is awaited by the framework.
        const returnsPromise = !!fn.async || /Promise/.test(typeAnnotationText(fn.returnType)) || responseKind(path) !== null;
        const consider = (exprNode: any, reportNode: any, returned: boolean, byVariable: boolean, awaited = false) => {
          // `await q`: the variable itself, with no calls of its own yet.
          const c = exprNode.type === 'Identifier'
            ? { kind: 'var' as const, varName: exprNode.name, table: null, methods: [], wheres: [] }
            : builderChain(exprNode);
          if (!c) return;
          const r = resolve(c);
          if (!r) return;
          const { chain, extra } = r;
          const needsTerminal = chain.kind === 'typeorm' || chain.kind === 'kysely';
          const all = new Set([...chain.methods, ...extra]);
          if (needsTerminal && ![...all].some(m => BUILDER_TERMINAL.has(m))) return;
          if (returned && !awaited && !returnsPromise && ![...all].some(m => BUILDER_TERMINAL.has(m))) return;
          if (isBounded(chain, extra)) return;
          if (!needsTerminal && !chain.methods.length && byVariable === false && chain.kind === 'knex' && !chain.table) return;
          unbounded.set(reportNode, chain);
          executed.push({ node: reportNode, chain, returned });
        };

        traverse(fn.body, {
          noScope: true,
          Function(p: any) { p.skip(); },
          AwaitExpression(p: any) {
            const arg = unwrap(p.node.argument);
            // `const [row] = await q`: one row is read, the lookup is by design.
            const parent = p.parent?.type === 'TSAsExpression' ? null : p.parent;
            if (parent?.type === 'VariableDeclarator' && parent.id?.type === 'ArrayPattern'
              && parent.id.elements.length === 1 && parent.id.elements[0]?.type !== 'RestElement') return;
            // `await q.then(...)`: the CallExpression visitor reports q.
            if (isThenCall(arg)) return;
            if (arg?.type === 'CallExpression') consider(arg, arg, p.parent?.type === 'ReturnStatement', false, true);
            else if (arg?.type === 'Identifier') {
              const last = assigned.get(arg.name)?.slice(-1)[0];
              if (last) consider(arg, last.node, p.parent?.type === 'ReturnStatement', true, true);
            }
          },
          ReturnStatement(p: any) {
            const arg = p.node.argument;
            if (isThenCall(arg)) return;
            if (arg?.type === 'CallExpression') consider(arg, arg, true, false);
            else if (arg?.type === 'Identifier') {
              const last = assigned.get(arg.name)?.slice(-1)[0];
              if (last) consider(arg, last.node, true, true);
            }
          },
          CallExpression(p: any) {
            // knex('t').where(...).then(rows => ...)
            const callee = p.node.callee;
            if (callee?.type === 'MemberExpression' && callee.property?.name === 'then' && callee.object?.type === 'CallExpression') {
              consider(callee.object, callee.object, false, false);
            }
            // TypeORM / Kysely chains end in a terminal method, awaited or not.
            if (callee?.type === 'MemberExpression' && BUILDER_TERMINAL.has(callee.property?.name)
              && p.parent?.type !== 'AwaitExpression' && p.parent?.type !== 'ReturnStatement') {
              consider(p.node, p.node, false, false);
            }
          },
        } as any, undefined as any);
        if (fn.type === 'ArrowFunctionExpression' && fn.body?.type === 'CallExpression' && !isThenCall(fn.body)) consider(fn.body, fn.body, true, false);
      },
    });
  } catch {
    // partial result
  }

  // One report per node: an awaited return is seen by both visitors.
  const seen = new Set<any>();
  return { executed: executed.filter(q => (seen.has(q.node) ? false : (seen.add(q.node), true))), unbounded };
}

// ---------------------------------------------------------------------------
// payload/api-response — Stage 2, item 1
// ---------------------------------------------------------------------------
//
// A query whose rows are sent to the client. Study 09's `missing_pagination`
// is this rule: a list endpoint without a pagination contract is a handler
// whose response carries an unbounded query result.
//
// The backend's `large_api_payload` had the same intent and never fired on
// the ordinary shapes: it compared a variable's initialiser to the query call
// by identity, so `const users = await prisma.user.findMany()` — where the
// initialiser is the `await`, not the call — was never connected to
// `res.json(users)`. Here the response value is traced backwards through
// awaits, bindings, object properties and pass-through chains until it reaches
// a query call or runs out.

/** `res.json(x)`, `reply.send(x)`, `c.json(x)`, `res.status(200).json(x)`. */
const GRAPHQL_DESCRIPTION = 'A GraphQL list field returns every matching row. The client cannot ask for less than the whole table, and the response grows with it.';
const GRAPHQL_RECOMMENDATION = 'Add pagination arguments to the field (first/after, or limit/offset with a maximum) and pass them to the query as take/limit, or return a connection type.';

const RESPONSE_RECEIVER = /^(res|response|reply|ctx|context|c|h)$/;
const RESPONSE_METHODS = new Set(['json', 'send', 'jsonp']);
/** `Response.json(x)`, `NextResponse.json(x)`. */
const RESPONSE_CLASSES = new Set(['Response', 'NextResponse']);
/** Remix / React Router `json(x)`, `typedjson(x)`. */
const RESPONSE_FUNCTIONS = new Set(['json', 'typedjson']);
/** Nest route decorators: a controller method's return value is the response. */
const ROUTE_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'All']);
/** GraphQL resolver decorators: NestJS `@Query` / `@ResolveField`, type-graphql `@FieldResolver`. */
const GRAPHQL_DECORATORS = new Set(['Query', 'ResolveField', 'FieldResolver']);
/** A module that holds one resolver: `resolvers/Query/groups.js`, `resolvers/Account/addressBook.js`. */
const RESOLVER_MODULE_PATH = /(^|\/)resolvers\/[A-Z]\w*\/[\w.-]+\.[cm]?[jt]sx?$/;
/** The root keys that mark an object as a resolver map. */
const RESOLVER_MAP_ROOTS = new Set(['Query', 'Mutation']);

/** Calls that keep every row: a traced value passes through them. */
const PASS_THROUGH = new Set([
  'map', 'filter', 'flatMap', 'sort', 'reverse', 'lean', 'exec', 'toArray', 'populate', 'then',
  'select', 'orderBy', 'order', 'where', 'andWhere', 'orWhere', 'include', 'with', 'leftJoin',
  'innerJoin', 'join', 'from', 'returning',
]);

function unwrap(node: any): any {
  let n = node;
  for (let i = 0; i < 8 && n; i++) {
    if (n.type === 'AwaitExpression' || n.type === 'TSAsExpression' || n.type === 'TSNonNullExpression'
      || n.type === 'ParenthesizedExpression' || n.type === 'TSSatisfiesExpression') n = n.argument ?? n.expression;
    else break;
  }
  return n;
}

type Bindings = Map<string, any>;

/** Every `const x = ...` in a function, plus `const [a, b] = await Promise.all([qa, qb])`. */
function collectBindings(fn: any, into: Bindings): void {
  try {
    traverse(fn, {
      noScope: true,
      VariableDeclarator(p: any) {
        const { id, init } = p.node;
        if (!init) return;
        if (id.type === 'Identifier') { into.set(id.name, init); return; }
        const inner = unwrap(init);
        if (id.type === 'ArrayPattern' && inner?.type === 'CallExpression'
          && inner.callee?.type === 'MemberExpression' && inner.callee.object?.name === 'Promise'
          && inner.arguments?.[0]?.type === 'ArrayExpression') {
          id.elements.forEach((el: any, i: number) => {
            const src = inner.arguments[0].elements[i];
            if (el?.type === 'Identifier' && src) into.set(el.name, src);
          });
        }
      },
      AssignmentExpression(p: any) {
        const { left, right } = p.node;
        if (left.type === 'Identifier') into.set(left.name, right);
      },
    }, undefined as any);
  } catch {
    // leave what was collected
  }
}

/** Follow a response value back to the query calls whose rows it carries. */
/** A call the trace could not see into: the name of a function defined elsewhere. */
interface CalleeRef {
  name: string;
  receiver: string | null;
  /** On a sink: the response is a GraphQL resolver's result. */
  graphql?: boolean;
  /** The function making the call, which cannot be the one it calls. */
  caller?: { file: string; name: string; cls: string | null };
}

/**
 * The receiver's name, for matching a class: `this.catsService` → catsService,
 * `this.services.getProjectService()` → ProjectService.
 */
function receiverNameOf(recv: any): string | null {
  if (recv?.type === 'Identifier') return recv.name;
  if (recv?.type === 'MemberExpression' && recv.property?.type === 'Identifier') return recv.property.name;
  if (recv?.type === 'CallExpression' && recv.callee?.type === 'MemberExpression') {
    const getter = recv.callee.property?.name;
    const m = getter && /^get([A-Z]\w*)$/.exec(getter);
    if (m && (recv.arguments?.length ?? 0) === 0) return m[1];
  }
  return null;
}

function traceToQueries(
  node: any, lookup: (name: string) => any, out: Set<any>, depth = 0, seen = new Set<string>(), calls?: CalleeRef[],
): void {
  const n = unwrap(node);
  if (!n || depth > 8) return;

  if (n.type === 'Identifier') {
    if (seen.has(n.name)) return;
    seen.add(n.name);
    const bound = lookup(n.name);
    if (bound) traceToQueries(bound, lookup, out, depth + 1, seen, calls);
    return;
  }
  if (n.type === 'ObjectExpression') {
    for (const p of n.properties) {
      if (p.type === 'ObjectProperty') traceToQueries(p.value, lookup, out, depth + 1, seen, calls);
      else if (p.type === 'SpreadElement') traceToQueries(p.argument, lookup, out, depth + 1, seen, calls);
    }
    return;
  }
  if (n.type === 'ConditionalExpression' || n.type === 'LogicalExpression') {
    traceToQueries(n.consequent ?? n.left, lookup, out, depth + 1, seen, calls);
    traceToQueries(n.alternate ?? n.right, lookup, out, depth + 1, seen, calls);
    return;
  }
  if (n.type !== 'CallExpression') return;

  const method = n.callee?.type === 'MemberExpression' ? n.callee.property?.name : null;
  const chain = builderChain(n);
  if (chain && chain.kind !== 'var') { out.add(n); return; }
  if (method && COLLECTION_FINDERS.has(method)) { out.add(n); return; }
  if (method && BOUNDING_CHAIN.has(method)) return;
  if (method && PASS_THROUGH.has(method)) { traceToQueries(n.callee.object, lookup, out, depth + 1, seen, calls); return; }

  // A call into code the trace cannot see: remember it for the cross-file pass.
  if (calls) {
    const callee = n.callee;
    if (callee?.type === 'Identifier') calls.push({ name: callee.name, receiver: null });
    else if (callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier') {
      calls.push({ name: callee.property.name, receiver: receiverNameOf(callee.object) });
    }
  }
}

/** The value a sink sends, or null when this node is not a response sink. */
function responseValue(node: any): any {
  if (node.type === 'CallExpression') {
    const callee = node.callee;
    if (callee?.type === 'MemberExpression' && RESPONSE_METHODS.has(callee.property?.name)) {
      if (callee.object?.type === 'Identifier' && RESPONSE_CLASSES.has(callee.object.name)) return node.arguments?.[0];
      const root = rootIdentifierName(callee.object);
      if (root && RESPONSE_RECEIVER.test(root)) return node.arguments?.[0];
    }
    if (callee?.type === 'Identifier' && RESPONSE_FUNCTIONS.has(callee.name)) return node.arguments?.[0];
  }
  // ctx.body = rows (Koa)
  if (node.type === 'AssignmentExpression' && node.left?.type === 'MemberExpression'
    && node.left.property?.name === 'body') {
    const root = rootIdentifierName(node.left.object);
    if (root && /^(ctx|context|response)$/.test(root)) return node.right;
  }
  return null;
}

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ClassMethod', 'ObjectMethod',
]);

type ResponseKind = 'rest' | 'graphql' | null;

const decoratorNames = (node: any): string[] =>
  (node.decorators ?? []).map((d: any) => {
    const e = d.expression;
    return e?.type === 'CallExpression' ? e.callee?.name : e?.name;
  }).filter(Boolean);

const propKey = (p: any): string | null =>
  p?.key?.type === 'Identifier' ? p.key.name : p?.key?.type === 'StringLiteral' ? p.key.value : null;

/** `{ Query: { users }, User: { posts } }`: an object with a Query or Mutation key whose value is an object. */
const isResolverMap = (obj: any): boolean =>
  obj?.type === 'ObjectExpression'
  && obj.properties.some((p: any) => RESOLVER_MAP_ROOTS.has(propKey(p) ?? '') && p.value?.type === 'ObjectExpression');

/**
 * Whether the framework sends a function's return value, and how: a Nest
 * route or tRPC procedure ('rest'), or a GraphQL resolver ('graphql').
 */
function responseKind(path: any): ResponseKind {
  const node = path.node;
  if (node.type === 'ClassMethod') {
    const names = decoratorNames(node);
    if (names.some(n => GRAPHQL_DECORATORS.has(n))) return 'graphql';
    if (names.some(n => ROUTE_DECORATORS.has(n))) return 'rest';
    return null;
  }
  // publicProcedure.query(async ({ ctx }) => ...) — a function argument, which
  // is what separates it from db.query(sql).
  const parent = path.parent;
  if (parent?.type === 'CallExpression' && parent.arguments?.[0] === node
    && parent.callee?.type === 'MemberExpression' && ['query', 'mutation'].includes(parent.callee.property?.name)) {
    return 'rest';
  }

  // Resolver map: Query.users / User.posts, as a property value or a method.
  const prop = node.type === 'ObjectMethod' ? node : parent?.type === 'ObjectProperty' && parent.value === node ? parent : null;
  if (prop) {
    const typeObj = node.type === 'ObjectMethod' ? path.parentPath : path.parentPath?.parentPath;
    const typeProp = typeObj?.parentPath;
    const map = typeProp?.parentPath;
    if (typeObj?.node?.type === 'ObjectExpression' && typeProp?.node?.type === 'ObjectProperty' && isResolverMap(map?.node)) {
      return 'graphql';
    }
    // Field config: { type: [User], resolve: () => ... }
    if (propKey(prop) === 'resolve') {
      const config = node.type === 'ObjectMethod' ? path.parentPath?.node : path.parentPath?.parentPath?.node;
      if (config?.type === 'ObjectExpression' && config.properties.some((p: any) => propKey(p) === 'type')) return 'graphql';
    }
  }
  return null;
}

/** `class X { m() {} }`, `function m() {}`, `const m = () => {}`, `{ m: () => {} }`. */
function functionName(path: any): { name: string; cls: string | null } | null {
  const node = path.node;
  const cls = (() => {
    const c = path.findParent?.((p: any) => p.isClassDeclaration?.() || p.isClassExpression?.());
    return c?.node?.id?.name ?? null;
  })();
  if (node.type === 'FunctionDeclaration' && node.id) return { name: node.id.name, cls: null };
  if ((node.type === 'ClassMethod' || node.type === 'ObjectMethod') && node.key?.type === 'Identifier') {
    return { name: node.key.name, cls: node.type === 'ClassMethod' ? cls : null };
  }
  const parent = path.parent;
  if (parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier') return { name: parent.id.name, cls: null };
  if ((parent?.type === 'ObjectProperty' || parent?.type === 'ClassProperty') && parent.key?.type === 'Identifier') {
    return { name: parent.key.name, cls: parent.type === 'ClassProperty' ? cls : null };
  }
  return null;
}

/** What one named function hands back to its caller. */
interface FunctionReturns {
  name: string;
  cls: string | null;
  line: number;
  queries: Set<any>;
  calls: CalleeRef[];
}

interface FileFlow {
  /** Query calls whose rows reach a response in this file. */
  sent: Set<any>;
  /** The subset of `sent` that only GraphQL resolvers return. */
  sentGraphql: Set<any>;
  /** Calls into other code whose result reaches a response in this file. */
  sinkCalls: Array<CalleeRef & { line: number }>;
  /** Finder-named calls a response depends on, with the line of the sink. */
  sinkFinders: Array<{ node: any; line: number; graphql?: boolean }>;
  /** Every named function, and what it returns. */
  functions: FunctionReturns[];
}

/**
 * Collect the query calls whose rows reach a response. The caller reports
 * those as api-response and skips them in the other two rules. Also records,
 * for the cross-file pass, what each named function returns and which calls
 * into other code a response depends on.
 */
function findQueriesSentToClient(ast: any, filePath = ''): FileFlow {
  const resolverModule = RESOLVER_MODULE_PATH.test(filePath.replace(/\\/g, '/'));
  const sent = new Set<any>();
  const viaRest = new Set<any>();
  const viaGraphql = new Set<any>();
  const sinkCalls: FileFlow['sinkCalls'] = [];
  const sinkFinders: FileFlow['sinkFinders'] = [];
  const functions: FunctionReturns[] = [];
  const stack: Array<{ bindings: Bindings; returns: ResponseKind; fn: FunctionReturns | null }> = [];
  const lookup = (name: string) => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const v = stack[i].bindings.get(name);
      if (v) return v;
    }
    return undefined;
  };

  const currentCaller = (): CalleeRef['caller'] | undefined => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const fn = stack[i].fn;
      if (fn) return { file: '', name: fn.name, cls: fn.cls };
    }
    return undefined;
  };
  const sinkTrace = (value: any, line: number, kind: ResponseKind = 'rest') => {
    const calls: CalleeRef[] = [];
    const found = new Set<any>();
    traceToQueries(value, lookup, found, 0, new Set(), calls);
    const graphql = kind === 'graphql';
    for (const n of found) {
      sent.add(n);
      (graphql ? viaGraphql : viaRest).add(n);
      sinkFinders.push({ node: n, line, ...(graphql ? { graphql } : {}) });
    }
    const caller = currentCaller();
    for (const c of calls) sinkCalls.push({ ...c, line, caller, ...(graphql ? { graphql } : {}) });
  };
  const returnTrace = (value: any) => {
    const top = stack[stack.length - 1];
    if (!top) return;
    if (top.returns) sinkTrace(value, value.loc?.start?.line ?? 0, top.returns);
    else if (top.fn) traceToQueries(value, lookup, top.fn.queries, 0, new Set(), top.fn.calls);
  };

  try {
    traverse(ast, {
      noScope: true,
      enter(path: any) {
        const node = path.node;
        if (FUNCTION_TYPES.has(node.type)) {
          const bindings: Bindings = new Map();
          collectBindings(node.body, bindings);
          const named = functionName(path);
          const fn = named ? { ...named, line: node.loc?.start?.line ?? 0, queries: new Set<any>(), calls: [] } : null;
          if (fn) functions.push(fn);
          // Reaction Commerce and others keep one resolver per module:
          // resolvers/Query/groups.js default-exports Query.groups.
          const kind = responseKind(path)
            ?? (resolverModule && path.parent?.type === 'ExportDefaultDeclaration' ? 'graphql' : null);
          stack.push({ bindings, returns: kind, fn });
          if (node.type === 'ArrowFunctionExpression' && node.body?.type !== 'BlockStatement') returnTrace(node.body);
          return;
        }
        const value = responseValue(node);
        if (value) { sinkTrace(value, node.loc?.start?.line ?? 0); return; }
        if (node.type === 'ReturnStatement' && node.argument) returnTrace(node.argument);
      },
      exit(path: any) {
        if (FUNCTION_TYPES.has(path.node.type)) stack.pop();
      },
    });
  } catch {
    // partial result is still correct as far as it goes
  }
  // A query reached by both a REST response and a resolver is reported as api-response.
  const sentGraphql = new Set([...viaGraphql].filter(n => !viaRest.has(n)));
  return { sent, sentGraphql, sinkCalls, sinkFinders, functions };
}

// ---------------------------------------------------------------------------
// Cross-file: a route sends what a repository method in another file returns
// ---------------------------------------------------------------------------
//
// Most applications do not query in the handler. The route calls a service,
// the service calls a repository, and the repository runs the query:
//
//   routes/session.ts   res.json(await db.getSessionsByUser(id))
//   api/database.ts     getSessionsByUser(id) { return prisma.session.findMany(...) }
//
// Each file on its own shows half. During the scan every named function's
// returns are recorded — the queries it returns and the calls it returns the
// result of — along with the calls whose result a response sends. finalize()
// runs once every file has been seen and links them by name, up to three hops.
//
// Linking by name is a guess, so it is a cautious one. A name with one
// definition in the scanned code links. A name with several links only if the
// call's receiver names one class — `this.catsService.findAll()` and
// `class CatsService` — and otherwise does not link at all. A missed endpoint
// is a false negative; a wrong link would blame the wrong code.

interface RegistryFunction {
  file: string;
  name: string;
  cls: string | null;
  /** Issue locations (file:line) of the unbounded queries it returns. */
  queryIssues: string[];
  calls: CalleeRef[];
}

/**
 * A finder-named call the file could not accept as a query — an application's
 * own `this.catsService.findAll()` — is a call into code defined elsewhere,
 * and the cross-file pass should follow it. A call accepted as a query is not
 * followed: `prisma.user.findMany()` is the query, and linking it to some
 * application method that happens to be called findMany would be wrong.
 */
function calleeRefOf(call: any): CalleeRef | null {
  const callee = call.callee;
  if (callee?.type !== 'MemberExpression' || callee.property?.type !== 'Identifier') return null;
  return { name: callee.property.name, receiver: receiverNameOf(callee.object) };
}

let registryFunctions: RegistryFunction[] = [];
let registrySinks: Array<CalleeRef & { file: string; line: number }> = [];
/**
 * Every reported query call that has a receiver and a method name, by issue
 * location: `oAuthClientRepository.findAll()` in a handler is reported as a
 * query because the receiver looks like data access, but when the scanned code
 * defines that method, and the query inside it is itself a finding, the call
 * site is the same rows counted twice.
 */
let registryCallSites: Array<CalleeRef & { key: string; file: string; line: number }> = [];

function resetPayloadRegistry(): void {
  registryFunctions = [];
  registrySinks = [];
  registryCallSites = [];
}

// Keyed by file and line, not column: large-return reports at the `return`,
// and the query it returns starts later on the same line.
const issueKey = (i: { file: string; line: number }) => `${i.file}:${i.line}`;

function resolveCallee(ref: CalleeRef): RegistryFunction | null {
  // A controller's getCharts() calling the service's getCharts() is not
  // calling itself: the caller is never a candidate.
  const candidates = registryFunctions.filter(f => f.name === ref.name
    && !(ref.caller && f.file === ref.caller.file && f.name === ref.caller.name && f.cls === ref.caller.cls));
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0 || !ref.receiver) return null;
  const recv = ref.receiver.toLowerCase().replace(/^_+/, '');
  const byClass = candidates.filter(f => f.cls && f.cls.toLowerCase() === recv);
  return byClass.length === 1 ? byClass[0] : null;
}

/** The unbounded-query issues a call reaches, following returned calls up to three hops. */
function issuesReachedBy(ref: CalleeRef, hops = 0, seen = new Set<RegistryFunction>()): string[] {
  if (hops > 3) return [];
  const fn = resolveCallee(ref);
  if (!fn || seen.has(fn)) return [];
  seen.add(fn);
  return [...fn.queryIssues, ...fn.calls.flatMap(c => issuesReachedBy(c, hops + 1, seen))];
}

function finalizePayload(issues: DiagnosticIssue[]): DiagnosticIssue[] {
  // Round 2: a call site that is really a call into the application's own
  // method is dropped when that method's query is already a finding. If the
  // call site's rows were sent to the client, the endpoint moves to the
  // method's query, which the linking below then converts.
  const dropped = new Set<string>();
  for (const site of registryCallSites) {
    const fn = resolveCallee(site);
    if (!fn || fn.queryIssues.length === 0 || fn.queryIssues.includes(site.key)) continue;
    const here = issues.filter(i => issueKey(i) === site.key);
    if (here.length === 0) continue;
    dropped.add(site.key);
    // Functions that returned the call site now return the method's result:
    // route -> handler -> oAuthClientRepository.findAll() keeps its chain.
    for (const other of registryFunctions) {
      if (other.queryIssues.includes(site.key)) other.calls.push({ name: site.name, receiver: site.receiver });
    }
    const sentHere = here.filter(i => i.rule === 'payload/api-response' || i.rule === 'payload/unbounded-graphql');
    if (sentHere.length) {
      registrySinks.push({
        name: site.name, receiver: site.receiver, file: site.file, line: site.line,
        ...(sentHere.every(i => i.rule === 'payload/unbounded-graphql') ? { graphql: true } : {}),
      });
    }
  }
  issues = issues.filter(i => !dropped.has(issueKey(i)));

  const byLocation = new Map<string, DiagnosticIssue[]>();
  for (const issue of issues) {
    if (issue.rule === 'payload/api-response' || issue.rule === 'payload/unbounded-graphql') continue;
    const k = issueKey(issue);
    byLocation.set(k, [...(byLocation.get(k) ?? []), issue]);
  }

  const endpoints = new Map<DiagnosticIssue, string[]>();
  const restReached = new Set<DiagnosticIssue>();
  for (const sink of registrySinks) {
    for (const key of issuesReachedBy(sink)) {
      for (const issue of byLocation.get(key) ?? []) {
        const list = endpoints.get(issue) ?? [];
        list.push(`${sink.file}:${sink.line}`);
        endpoints.set(issue, list);
        if (!sink.graphql) restReached.add(issue);
      }
    }
  }

  for (const [issue, where] of endpoints) {
    const unique = [...new Set(where)];
    // Keep what the original title named: `findMany()` for a finder,
    // `knex('spaces') query` for a builder.
    const builder = /^(?:Returning unbounded )?((?:knex|selectFrom)\([^)]*\) query|createQueryBuilder\(\) query)/.exec(issue.title)?.[1];
    const method = /^(\w+)\(\)/.exec(issue.title)?.[1] ?? 'query';
    if (!restReached.has(issue)) {
      issue.rule = 'payload/unbounded-graphql';
      issue.severity = 'high';
      issue.title = `${builder ?? `${method}()`} result returned by a GraphQL resolver without a row limit`;
      issue.description = `Every matching row is loaded here and returned by the resolver at ${unique[0]}`
        + (unique.length > 1 ? ` and ${unique.length - 1} other resolver(s)` : '')
        + '. A GraphQL list field with no pagination arguments returns the whole table, and the response grows with it.';
      issue.recommendation = GRAPHQL_RECOMMENDATION;
      issue.confidence = 0.65;
      continue;
    }
    issue.rule = 'payload/api-response';
    issue.severity = 'high';
    issue.title = builder ? `${builder} result sent in an API response without a row limit`
      : `${method}() result sent in an API response without a row limit`;
    issue.description =
      `Every matching row is loaded here and sent to the client by ${unique[0]}` +
      (unique.length > 1 ? ` and ${unique.length - 1} other endpoint(s)` : '') +
      '. The response grows with the table, and so do memory, parse time and transfer size on both ends.';
    issue.recommendation = 'Paginate the endpoint: accept a page size (with a maximum) and a cursor or offset, and pass them to the query as take/limit.';
    issue.confidence = 0.65;
  }
  return issues;
}

function detectPayloadIssues(filePath: string, content: string, ast: any): DiagnosticIssue[] {
  if (!ast) return [];
  if (NOT_SERVED_PATH.test(filePath.replace(/\\/g, '/')) || looksMinified(content)) return [];
  const issues: DiagnosticIssue[] = [];

  try {
    const ctx = collectDbContext(ast);

    // api-response first: a query that reaches a response is reported once,
    // as the more specific claim, and skipped by the other two rules below.
    const flow = findQueriesSentToClient(ast, filePath);
    const sentToClient = flow.sent;
    const builders = analyzeBuilders(ast);
    const acceptedQuery = (node: any) => {
      if (builders.unbounded.has(node)) return true;
      const method = node.callee?.property?.name;
      return !!method && isCollectionQuery(node, method, ctx, true) && !isNotACollectionQuery(node);
    };
    for (const node of sentToClient) {
      const builder = builders.unbounded.get(node);
      const method = builder ? chainTitle(builder).replace(/ query$/, '') : node.callee?.property?.name;
      const loc = node.loc?.start;
      if (!loc || !method) continue;
      if (!acceptedQuery(node)) continue;
      if (!builder && (anyArgumentHasRowLimit(node) || filterIsBoundedByKey(node))) continue;
      const what = builder ? chainTitle(builder) : `${method}()`;
      issues.push(flow.sentGraphql.has(node) ? {
        id: '', rule: 'payload/unbounded-graphql', category: 'payload', severity: 'high',
        file: filePath, line: loc.line, column: loc.column,
        title: `${what} result returned by a GraphQL resolver without a row limit`,
        description: GRAPHQL_DESCRIPTION,
        snippet: snippetAt(content, loc.line),
        codeBefore: sourceOf(content, node),
        recommendation: GRAPHQL_RECOMMENDATION,
        studyReference: 'Study 09',
        confidence: 0.7,
      } : {
        id: '', rule: 'payload/api-response', category: 'payload', severity: 'high',
        file: filePath, line: loc.line, column: loc.column,
        title: `${what} result sent in an API response without a row limit`,
        description: 'Every matching row is loaded, serialised and sent to the client. The response grows with the table, and so do memory, parse time and transfer size on both ends.',
        snippet: snippetAt(content, loc.line),
        codeBefore: sourceOf(content, node),
        recommendation: 'Paginate the endpoint: accept a page size (with a maximum) and a cursor or offset, and pass them to the query as take/limit.',
        studyReference: 'Study 09',
        confidence: 0.7,
      });
    }

    traverse(ast, {
      noScope: true,

      CallExpression(path: any) {
        const node = path.node;
        if (sentToClient.has(node)) return;
        const methodName = node.callee?.property?.name;
        const loc = node.loc?.start;
        if (!loc || !methodName) return;

        // A ReturnStatement wrapping this call is handled by the ReturnStatement
        // visitor below (more specific "returning unbounded results" framing),
        // including through an await: `return await x.findMany()` was reported
        // by both rules.
        if (path.parent?.type === 'ReturnStatement') return;
        if (path.parent?.type === 'AwaitExpression' && path.parentPath?.parent?.type === 'ReturnStatement') return;

        const awaited = PROMISE_CONTEXT.has(path.parent?.type ?? '');
        if (!isCollectionQuery(node, methodName, ctx, awaited)) return;
        if (isNotACollectionQuery(node)) return;

        if (anyArgumentHasRowLimit(node) || chainBoundsRows(path) || filterIsBoundedByKey(node)) return;

        issues.push({
          id: '', rule: 'payload/unbounded-query', category: 'payload', severity: 'medium',
          file: filePath, line: loc.line, column: loc.column,
          title: `${methodName}() without a row limit`,
          description: `This query returns every matching row. As the table grows, so does the result — and the memory and response time that come with it.`,
          snippet: snippetAt(content, loc.line),
          codeBefore: sourceOf(content, node),
          recommendation: 'Add a row limit (take/limit) or paginate the query.',
          studyReference: 'Study 09',
          confidence: 0.6,
        });
      },

      ReturnStatement(path: any) {
        const node = path.node;
        const loc = node.loc?.start;
        let argument = node.argument;
        if (argument?.type === 'AwaitExpression') argument = argument.argument;
        if (!loc || argument?.type !== 'CallExpression') return;

        const methodName = argument.callee?.property?.name;
        if (!methodName) return;
        if (sentToClient.has(argument)) return;
        if (!isCollectionQuery(argument, methodName, ctx, true)) return;
        if (isNotACollectionQuery(argument)) return;

        // The returned call is the argument of the return (or of its await);
        // its chain has already ended, so only the arguments can bound it.
        if (anyArgumentHasRowLimit(argument) || filterIsBoundedByKey(argument)) return;

        issues.push({
          id: '', rule: 'payload/large-return', category: 'payload', severity: 'high',
          file: filePath, line: loc.line, column: loc.column,
          title: 'Returning unbounded database results',
          description: `Function returns '${methodName}()' results directly without pagination, which can cause large response payloads and memory pressure.`,
          snippet: snippetAt(content, loc.line),
          codeBefore: sourceOf(content, argument),
          recommendation: 'Add pagination (limit/offset or cursor-based) before returning results.',
          studyReference: 'Study 09',
          confidence: 0.65,
        });
      },
    });
    // Builder queries not already reported as api-response.
    for (const q of builders.executed) {
      if (sentToClient.has(q.node)) continue;
      const loc = q.node.loc?.start;
      if (!loc) continue;
      issues.push({
        id: '', rule: q.returned ? 'payload/large-return' : 'payload/unbounded-query', category: 'payload',
        severity: q.returned ? 'high' : 'medium',
        file: filePath, line: loc.line, column: loc.column,
        title: q.returned ? `Returning unbounded ${chainTitle(q.chain)} results` : `${chainTitle(q.chain)} without a row limit`,
        description: 'This query builder returns every matching row: nothing on the chain, or on the variable holding it, limits the result.',
        snippet: snippetAt(content, loc.line),
        codeBefore: sourceOf(content, q.node),
        recommendation: 'Add .limit() (or .take()), or paginate the query.',
        studyReference: 'Study 09',
        confidence: 0.6,
      });
    }

    // Cross-file registry. Each returned query is recorded by the location of
    // the issue it produced, so finalize() can find and convert that issue.
    const reported = new Set(issues.map(issueKey));
    for (const fn of flow.functions) {
      const queryIssues = [...fn.queries]
        .map(q => q.loc?.start ? issueKey({ file: filePath, line: q.loc.start.line }) : '')
        .filter(k => reported.has(k));
      const calls = [...fn.calls];
      for (const q of fn.queries) {
        const ref = !acceptedQuery(q) ? calleeRefOf(q) : null;
        if (ref) calls.push(ref);
      }
      const self = { file: filePath, name: fn.name, cls: fn.cls };
      registryFunctions.push({ ...self, queryIssues, calls: calls.map(c => ({ ...c, caller: self })) });
    }
    for (const sink of flow.sinkCalls) {
      registrySinks.push({ ...sink, file: filePath, caller: sink.caller && { ...sink.caller, file: filePath } });
    }
    // Call sites of reported queries, so finalize() can tell a query from a
    // call into the application's own method of the same name.
    const seenSites = new Set<string>();
    traverse(ast, {
      noScope: true,
      CallExpression(p: any) {
        const loc = p.node.loc?.start;
        if (!loc) return;
        const key = issueKey({ file: filePath, line: loc.line });
        if (!reported.has(key) || seenSites.has(key)) return;
        const method = p.node.callee?.property?.name;
        if (!method || !COLLECTION_FINDERS.has(method)) return;
        const ref = calleeRefOf(p.node);
        if (!ref?.receiver) return;
        seenSites.add(key);
        registryCallSites.push({ ...ref, key, file: filePath, line: loc.line });
      },
    });
    for (const { node, line, graphql } of flow.sinkFinders) {
      const ref = !acceptedQuery(node) ? calleeRefOf(node) : null;
      if (ref) registrySinks.push({ ...ref, line, file: filePath, ...(graphql ? { graphql } : {}) });
    }
  } catch {
    // AST traversal failed — skip
  }

  return issues;
}


// ---------------------------------------------------------------------------
// payload/deep-include — Stage 2, item 3
// ---------------------------------------------------------------------------
//
// Study 09's `deep_nested_include` fired on any call whose first argument
// nested three objects deep, so a `where` on a JSON field counted, and so did
// route definitions. Here the depth is counted in relations, per ORM syntax,
// and only on an ORM read.

/** ORM read methods that take relation options. */
const INCLUDE_READS = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow', // Prisma, Drizzle
  'findAll', 'findOne', 'findByPk', 'findAndCountAll',                            // Sequelize
  'find', 'findBy', 'findOneBy', 'findAndCount', 'findOneOrFail', 'findOneByOrFail', // TypeORM, MikroORM
]);
/** Keys of a Prisma relation's own options: a `select` entry holding one of these is a relation. */
const RELATION_OPTION_KEYS = new Set(['select', 'include', 'where', 'orderBy', 'take', 'skip', 'cursor', 'distinct', 'with', 'limit', 'offset']);
/** Receivers whose `find*` is not an ORM: a browser driver, a test harness. */
const NON_ORM_RECEIVERS = new Set(['testSubjects', 'browser', 'page', 'cy', 'wrapper', 'screen', 'element', '$', 'jQuery', '_', 'lodash', 'R']);

/** Options inside a Strapi populate entry, not relations. */
const POPULATE_OPTION_KEYS = new Set([
  'where', 'filters', 'fields', 'select', 'orderBy', 'sort', 'limit', 'offset', 'start', 'count', 'on', 'publicationState', 'status', 'locale',
]);

const propValue = (obj: any, key: string): any =>
  obj?.type === 'ObjectExpression'
    ? obj.properties.find((p: any) => p.type === 'ObjectProperty' && keyName(p) === key)?.value
    : undefined;

const dottedDepth = (s: string) => s.split('.').filter(Boolean).length;

/** Prisma `include` / Drizzle `with`: each key is a relation. */
function keyedRelationDepth(node: any, depth: number): number {
  if (node?.type !== 'ObjectExpression' || depth > 12) return 0;
  let max = 0;
  for (const p of node.properties) {
    if (p.type !== 'ObjectProperty') continue;
    if (keyName(p) === '_count') continue;
    const v = p.value;
    if (v?.type === 'BooleanLiteral' && !v.value) continue;
    max = Math.max(max, 1 + (v?.type === 'ObjectExpression' ? optionsDepth(v, depth + 1) : 0));
  }
  return max;
}

/** Prisma `select`: only an entry whose value carries relation options is a relation. */
function selectRelationDepth(node: any, depth: number): number {
  if (node?.type !== 'ObjectExpression' || depth > 12) return 0;
  let max = 0;
  for (const p of node.properties) {
    if (p.type !== 'ObjectProperty' || keyName(p) === '_count') continue;
    const v = p.value;
    if (v?.type !== 'ObjectExpression') continue;
    const isRelation = v.properties.some((q: any) => q.type === 'ObjectProperty' && RELATION_OPTION_KEYS.has(keyName(q) ?? ''));
    if (isRelation) max = Math.max(max, 1 + optionsDepth(v, depth + 1));
  }
  return max;
}

/** Sequelize `include: [Model, { model, include: [...] }]`, or a single include object. */
function sequelizeIncludeDepth(node: any, depth: number): number {
  if (depth > 12) return 0;
  const items = node?.type === 'ArrayExpression' ? node.elements : [node];
  let max = 0;
  for (const el of items) {
    if (!el) continue;
    if (el.type === 'ObjectExpression') {
      const all = propValue(el, 'all'), nested = propValue(el, 'nested');
      if (all?.value === true && nested?.value === true) return Infinity;
      max = Math.max(max, 1 + optionsDepth(el, depth + 1));
    } else if (el.type === 'Identifier' || el.type === 'MemberExpression' || el.type === 'StringLiteral') {
      max = Math.max(max, 1);
    }
  }
  return max;
}

/** TypeORM `relations` / MikroORM `populate`: dotted strings, or nested `{ a: { b: true } }`. */
function pathRelationDepth(node: any, depth: number): number {
  if (!node || depth > 12) return 0;
  if (node.type === 'StringLiteral') return dottedDepth(node.value);
  if (node.type === 'ArrayExpression') return Math.max(0, ...node.elements.map((e: any) => pathRelationDepth(e, depth + 1)));
  if (node.type === 'ObjectExpression') {
    let max = 0;
    for (const p of node.properties) {
      if (p.type !== 'ObjectProperty') continue;
      const k = keyName(p) ?? '';
      const v = p.value;
      if (v?.type === 'BooleanLiteral' && !v.value) continue;
      // Strapi's populate object mixes relations with their options:
      // `populate: { roles: { where, fields, populate: { ... } } }`.
      if (POPULATE_OPTION_KEYS.has(k)) continue;
      if (k === 'populate') { max = Math.max(max, pathRelationDepth(v, depth + 1)); continue; }
      max = Math.max(max, 1 + (v?.type === 'ObjectExpression' ? pathRelationDepth(v, depth + 1) : 0));
    }
    return max;
  }
  return 0;
}

/** Mongoose `populate`: a path string, `{ path, populate }`, or an array of either. */
function mongoosePopulateDepth(node: any, depth: number): number {
  if (!node || depth > 12) return 0;
  if (node.type === 'StringLiteral') return node.value.trim() ? 1 : 0;
  if (node.type === 'ArrayExpression') return Math.max(0, ...node.elements.map((e: any) => mongoosePopulateDepth(e, depth + 1)));
  if (node.type === 'ObjectExpression') {
    if (!propValue(node, 'path')) return 0;
    return 1 + mongoosePopulateDepth(propValue(node, 'populate'), depth + 1);
  }
  return 0;
}

/** The deepest relation path an options object loads. */
function optionsDepth(opts: any, depth = 0): number {
  if (opts?.type !== 'ObjectExpression' || depth > 12) return 0;
  let max = 0;
  const include = propValue(opts, 'include');
  const sequelizeObject = include?.type === 'ObjectExpression'
    && ['model', 'association', 'all'].some(k => propValue(include, k) !== undefined);
  if (include?.type === 'ObjectExpression' && !sequelizeObject) {
    max = Math.max(max, keyedRelationDepth(include, depth));
  } else if (include) {
    max = Math.max(max, sequelizeIncludeDepth(include, depth));
  }
  max = Math.max(max, keyedRelationDepth(propValue(opts, 'with'), depth));
  max = Math.max(max, selectRelationDepth(propValue(opts, 'select'), depth));
  max = Math.max(max, pathRelationDepth(propValue(opts, 'relations'), depth));
  const populate = propValue(opts, 'populate');
  if (populate?.type === 'ObjectExpression' && propValue(populate, 'path')) max = Math.max(max, mongoosePopulateDepth(populate, depth));
  else max = Math.max(max, pathRelationDepth(populate, depth));
  return max;
}

/** A Prisma relation tree: every key under include/select, for the schema check in finalize(). */
interface RelationNode { field: string; children: RelationNode[] }

function prismaRelationTree(opts: any, depth = 0): RelationNode[] {
  if (opts?.type !== 'ObjectExpression' || depth > 12) return [];
  const out: RelationNode[] = [];
  for (const key of ['include', 'select']) {
    const v = propValue(opts, key);
    if (v?.type !== 'ObjectExpression') continue;
    for (const p of v.properties) {
      if (p.type !== 'ObjectProperty') continue;
      const field = keyName(p);
      if (!field || field === '_count') continue;
      if (p.value?.type === 'BooleanLiteral' && !p.value.value) continue;
      out.push({ field, children: prismaRelationTree(p.value, depth + 1) });
    }
  }
  return out;
}

/**
 * Every field of every model with its declared type, relation fields included
 * (`posts Post[]`, `author User? @relation(...)`). The index rules' parseSchema
 * keeps columns only, and leaves the owning side of a relation out.
 */
function prismaFieldTypes(content: string): Map<string, Map<string, { type: string }>> {
  const models = new Map<string, Map<string, { type: string }>>();
  const src = content.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /^\s*model\s+(\w+)\s*\{([\s\S]*?)^\s*\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const fields = new Map<string, { type: string }>();
    for (const raw of m[2].split('\n')) {
      const line = raw.replace(/\/\/.*$/, '').trim();
      if (!line || line.startsWith('@@')) continue;
      const f = line.match(/^(\w+)\s+(\w+(?:\[\])?\??)/);
      if (f) fields.set(f[1], { type: f[2] });
    }
    models.set(m[1], fields);
  }
  return models;
}

interface DeepIncludeRecord { key: string; model: string; tree: RelationNode[] }
let deepIncludeRecords: DeepIncludeRecord[] = [];
let prismaModels = new Map<string, Map<string, { type: string }>>();

function resetDeepIncludes(): void {
  deepIncludeRecords = [];
  prismaModels = new Map();
}

/**
 * With the project's schema.prisma in hand, a Prisma relation tree whose
 * relations are all to-one loads one row per level: drop it. A tree that
 * names a field the schema does not have is kept, since the schema read may
 * not be the one the query runs against.
 */
function finalizeDeepIncludes(issues: DiagnosticIssue[]): DiagnosticIssue[] {
  if (!prismaModels.size) return issues;
  const byLower = new Map([...prismaModels].map(([name, fields]) => [name.toLowerCase(), fields]));
  const records = new Map(deepIncludeRecords.map(r => [r.key, r]));

  // 'many' if any to-many is reached, 'one' if every relation resolved to-one,
  // 'unknown' if a field is missing from the schema.
  const walk = (model: string, nodes: RelationNode[]): 'many' | 'one' | 'unknown' => {
    const fields = byLower.get(model.toLowerCase());
    if (!fields) return 'unknown';
    let result: 'one' | 'unknown' = 'one';
    for (const n of nodes) {
      const f = fields.get(n.field);
      if (!f) { result = 'unknown'; continue; }
      const base = f.type.replace(/[[\]?]/g, '');
      if (!byLower.has(base.toLowerCase())) continue; // a scalar in a select
      if (f.type.includes('[]')) return 'many';
      const sub = walk(base, n.children);
      if (sub === 'many') return 'many';
      if (sub === 'unknown') result = 'unknown';
    }
    return result;
  };

  return issues.filter(issue => {
    if (issue.rule !== 'payload/deep-include') return true;
    const r = records.get(issueKey(issue));
    if (!r) return true;
    return walk(r.model, r.tree) !== 'one';
  });
}

/** Objection's relation expressions: `'[owner.pets, children.[pets, movies.actors]]'`. */
export function relationExpressionDepth(expr: string): number {
  let i = 0;
  const skip = () => { while (i < expr.length && /\s/.test(expr[i])) i++; };
  const list = (): number => {
    let max = 0;
    do { skip(); if (expr[i] === ',') i++; max = Math.max(max, item()); skip(); } while (expr[i] === ',');
    return max;
  };
  const item = (): number => {
    skip();
    if (expr[i] === '[') { i++; const d = list(); skip(); if (expr[i] === ']') i++; return d; }
    const start = i;
    while (i < expr.length && /[\w$*^]/.test(expr[i])) i++;
    if (i === start) return 0;
    skip();
    if (expr[i] === '.') { i++; return 1 + item(); }
    return 1;
  };
  try { return list(); } catch { return 0; }
}

function detectDeepIncludes(filePath: string, content: string, ast: any): DiagnosticIssue[] {
  if (/\.prisma$/.test(filePath)) {
    if (NOT_SERVED_PATH.test(filePath.replace(/\\/g, '/'))) return [];
    // A monorepo can hold several schemas (trigger.dev keeps sample apps with
    // their own `User`): merge fields by model name rather than let the last
    // file read win.
    for (const [name, fields] of prismaFieldTypes(content)) {
      const into = prismaModels.get(name) ?? new Map<string, { type: string }>();
      for (const [f, info] of fields) if (!into.has(f)) into.set(f, info);
      prismaModels.set(name, into);
    }
    return [];
  }
  if (!ast) return [];
  if (NOT_SERVED_PATH.test(filePath.replace(/\\/g, '/')) || looksMinified(content)) return [];
  const issues: DiagnosticIssue[] = [];
  const reported = new Set<any>();

  const report = (node: any, method: string, depth: number) => {
    const loc = node.loc?.start;
    if (!loc || reported.has(node)) return;
    reported.add(node);
    const levels = depth === Infinity ? 'every association, nested' : `relations ${depth} levels deep`;
    issues.push({
      id: '', rule: 'payload/deep-include', category: 'payload', severity: 'medium',
      file: filePath, line: loc.line, column: loc.column,
      title: `${method}() loads ${levels}`,
      description: 'Each to-many level multiplies the rows per parent, so the result grows with the product of the fan-outs, not with the number of root rows.',
      snippet: snippetAt(content, loc.line),
      recommendation: 'Load only the relations the caller uses: select the fields it needs, give nested to-many relations their own take/limit, or fetch the deepest level in a separate, paginated query.',
      studyReference: 'Study 09',
      confidence: 0.55,
    });
  };

  try {
    traverse(ast, {
      noScope: true,
      CallExpression(path: any) {
        const node = path.node;
        const callee = node.callee;
        if (callee?.type !== 'MemberExpression' || callee.property?.type !== 'Identifier') return;
        const method = callee.property.name;
        const recv = receiverName(callee.object);
        if (recv && NON_ORM_RECEIVERS.has(recv)) return;

        if (INCLUDE_READS.has(method)) {
          const depth = Math.max(0, ...(node.arguments ?? []).map((a: any) => optionsDepth(a)));
          if (depth >= 3) {
            report(node, method, depth);
            // prisma.booking.findUnique(...): the model is the receiver's last property.
            const model = callee.object?.type === 'MemberExpression' && callee.object.property?.type === 'Identifier'
              ? callee.object.property.name : null;
            const opts = node.arguments?.[0];
            if (model && node.loc) {
              deepIncludeRecords.push({ key: issueKey({ file: filePath, line: node.loc.start.line }), model, tree: prismaRelationTree(opts) });
            }
          }
          return;
        }
        // Mongoose: Model.find(q).populate({ path, populate: { ... } })
        if (method === 'populate') {
          const depth = Math.max(0, ...(node.arguments ?? []).map((a: any) => mongoosePopulateDepth(a, 0)));
          if (depth >= 3) report(node, method, depth);
          return;
        }
        // Objection: .withGraphFetched('[a.[b.c]]')
        if (method === 'withGraphFetched' || method === 'withGraphJoined' || method === 'eager') {
          const arg = node.arguments?.[0];
          const expr = arg?.type === 'StringLiteral' ? arg.value
            : arg?.type === 'TemplateLiteral' && arg.quasis.length === 1 ? arg.quasis[0].value.cooked : null;
          if (expr) {
            const depth = relationExpressionDepth(expr);
            if (depth >= 3) report(node, method, depth);
          }
        }
      },
    });
  } catch {
    // partial result
  }
  return issues;
}


// ---------------------------------------------------------------------------
// payload/select-star — Stage 2, item 4
// ---------------------------------------------------------------------------
//
// Study 09's `select_star` matched `SELECT * FROM` in any string: log lines,
// SQL editor placeholders, a SQL parser's test inputs. Here the string has to
// reach a database call.

const SELECT_STAR = /\bselect\s+(?:distinct\s+)?(?:[\w"`]+\.)?\*\s+from\b/gi;
/** Calls that send SQL text to a database. */
const SQL_SINKS = new Set([
  'query', 'raw', 'execute', 'exec', 'unsafe', 'prepare', '$queryRaw', '$queryRawUnsafe', 'queryRaw',
  'any', 'many', 'one', 'oneOrNone', 'manyOrNone', 'all', 'get', 'each', 'queryRows', 'select',
]);
/** Tags that make a template a SQL query: postgres.js `sql`, Prisma.sql, drizzle's `sql`, slonik. */
const SQL_TAGS = new Set(['sql', 'SQL', 'raw']);

const sqlText = (n: any): string =>
  n.type === 'StringLiteral' ? n.value
    // An interpolation stands for a value or a name: `${schema}.add_job(` must still read as a call.
    : n.type === 'TemplateLiteral' ? n.quasis.map((q: any) => q.value.cooked ?? q.value.raw).join('__p__')
    : '';

/**
 * The `SELECT *` matches in a statement whose rows come back: not inside
 * `EXISTS (...)` or `IN (...)`, and not in an INSERT or CREATE that keeps the
 * rows in the database.
 */
function returningSelectStar(text: string): boolean {
  if (/^\s*(insert|create|replace|merge)\b/i.test(text)) return false;
  SELECT_STAR.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SELECT_STAR.exec(text))) {
    const before = text.slice(0, m.index);
    if (/\b(exists|in)\s*\(\s*$/i.test(before)) continue;
    // FROM (subquery), FROM unnest(...), FROM add_job(...): the columns are the
    // subquery's or the function's, not a table's.
    const after = text.slice(m.index + m[0].length);
    if (/^\s*(\(|[\w."$`]+\s*\()/.test(after)) continue;
    return true;
  }
  return false;
}

const sinkName = (callee: any): string | null =>
  callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier' ? callee.property.name
    : callee?.type === 'Identifier' ? callee.name
    : null;

const tagName = (tag: any): string | null =>
  tag?.type === 'Identifier' ? tag.name
    : tag?.type === 'MemberExpression' && tag.property?.type === 'Identifier' ? tag.property.name
    : null;

function detectSelectStar(filePath: string, content: string, ast: any): DiagnosticIssue[] {
  if (!ast) return [];
  if (NOT_SERVED_PATH.test(filePath.replace(/\\/g, '/')) || looksMinified(content)) return [];
  if (!/select\s+(?:distinct\s+)?(?:[\w"`]+\.)?\*\s+from/i.test(content)) return [];
  const issues: DiagnosticIssue[] = [];
  const reported = new Set<any>();

  // Variables holding a SELECT * string, per enclosing function (or program).
  const held = new Map<any, Map<string, any>>();

  const report = (literal: any) => {
    const loc = literal.loc?.start;
    if (!loc || reported.has(literal)) return;
    reported.add(literal);
    issues.push({
      id: '', rule: 'payload/select-star', category: 'payload', severity: 'low',
      file: filePath, line: loc.line, column: loc.column,
      title: 'SELECT * sent to the database',
      description: 'Every column of every row comes back, whether the caller uses it or not. Wide columns (JSON, text, blobs) travel on every call, and the payload grows each time a column is added.',
      snippet: snippetAt(content, loc.line),
      recommendation: 'Name the columns the caller uses.',
      studyReference: 'Study 09',
      confidence: 0.6,
    });
  };

  // The expression a SQL string is part of: 'SELECT * FROM ' + table, (sql), `${a}`.
  const stringRoot = (path: any): any => {
    let p = path;
    while (p.parentPath && ['BinaryExpression', 'ParenthesizedExpression', 'TSAsExpression'].includes(p.parent.type)) p = p.parentPath;
    return p;
  };

  const scopeOf = (path: any): any => path.getFunctionParent?.()?.node ?? null;

  try {
    const candidates: Array<{ literal: any; root: any }> = [];
    traverse(ast, {
      noScope: true,
      'StringLiteral|TemplateLiteral'(path: any) {
        const text = sqlText(path.node);
        if (!returningSelectStar(text)) return;
        candidates.push({ literal: path.node, root: stringRoot(path) });
      },
    });
    if (!candidates.length) return [];

    // Pass 1: strings bound to a variable.
    const fnOf = new Map<any, any>();
    for (const { literal, root } of candidates) {
      const parent = root.parent;
      if (parent?.type === 'TaggedTemplateExpression' && SQL_TAGS.has(tagName(parent.tag) ?? '')) { report(literal); continue; }
      if (parent?.type === 'CallExpression' && parent.arguments.includes(root.node) && SQL_SINKS.has(sinkName(parent.callee) ?? '')) {
        // `.get` / `.all` / `.select` are too common a name to trust unless the SQL is the first argument.
        const name = sinkName(parent.callee)!;
        if (['all', 'get', 'each', 'select'].includes(name) && parent.arguments[0] !== root.node) continue;
        report(literal);
        continue;
      }
      if (parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier' && parent.init === root.node) {
        const fn = scopeOf(root) ?? ast.program;
        const vars = held.get(fn) ?? new Map<string, any>();
        vars.set(parent.id.name, literal);
        held.set(fn, vars);
        fnOf.set(literal, fn);
      }
    }
    if (!held.size) return issues;

    // Pass 2: a held string passed to a sink in the same function, or at the top level.
    traverse(ast, {
      noScope: true,
      CallExpression(path: any) {
        const name = sinkName(path.node.callee);
        if (!name || !SQL_SINKS.has(name)) return;
        const fn = scopeOf(path) ?? ast.program;
        path.node.arguments.forEach((a: any, i: number) => {
          if (a.type !== 'Identifier') return;
          if (['all', 'get', 'each', 'select'].includes(name) && i !== 0) return;
          const literal = held.get(fn)?.get(a.name) ?? held.get(ast.program)?.get(a.name);
          if (literal) report(literal);
        });
      },
    });
  } catch {
    // partial result
  }
  return issues;
}

export const payloadRules: RuleDefinition[] = [
  {
    id: 'payload/unbounded-query', name: 'Unbounded Query', category: 'payload', severity: 'medium',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectPayloadIssues,
    reset: resetPayloadRegistry, finalize: finalizePayload,
  },
  {
    id: 'payload/large-return', name: 'Large Return Payload', category: 'payload', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectPayloadIssues,
    reset: resetPayloadRegistry, finalize: finalizePayload,
  },
  {
    id: 'payload/api-response', name: 'Unbounded API Response', category: 'payload', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectPayloadIssues,
    reset: resetPayloadRegistry, finalize: finalizePayload,
  },
  {
    id: 'payload/unbounded-graphql', name: 'Unbounded GraphQL List', category: 'payload', severity: 'high',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectPayloadIssues,
    reset: resetPayloadRegistry, finalize: finalizePayload,
  },
  {
    id: 'payload/deep-include', name: 'Deep Relation Include', category: 'payload', severity: 'medium',
    filePatterns: [...JS_PATTERNS, '*.prisma'], needsAst: true, detect: detectDeepIncludes,
    reset: resetDeepIncludes, finalize: finalizeDeepIncludes,
  },
  {
    id: 'payload/select-star', name: 'SELECT * Query', category: 'payload', severity: 'low',
    filePatterns: JS_PATTERNS, needsAst: true, detect: detectSelectStar,
  },
];
