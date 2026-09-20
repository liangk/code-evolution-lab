/**
 * Shared heuristics for "is this call actually reaching a database?"
 *
 * The N+1 rule spent seven rounds of corpus work learning this, and the answer
 * is never "the method is called `find`". `Map.get()`, `Array.prototype.find()`
 * with a callback, `Promise.all()` and a plain object called `store` all match
 * on name alone, and on real codebases that produced a 60-88% false-positive
 * rate.
 *
 * The structure that fixed it:
 *
 *   - DISTINCTIVE method names are evidence on their own. No Map, Set, Array or
 *     Promise has a `findUnique` or a `findByPk`.
 *   - AMBIGUOUS method names need corroboration from somewhere else: an ORM
 *     import in the file, a query-builder chain, a known database handle, or a
 *     data-access receiver whose result is awaited.
 *   - Some receivers are hard vetoes regardless of method name.
 *
 * Any rule that identifies database calls by method name should use this
 * module rather than keeping its own list. Changing these sets changes
 * published study results — the corpus tests in `__tests__/n1-rules.test.ts`
 * are the gate.
 */

import traverse from '@babel/traverse';

/**
 * Method names specific enough to ORMs that seeing one is strong evidence on
 * its own. None of these exist on Map, Set, Array, or Promise.
 */
export const DISTINCTIVE_DB_METHODS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findMany', 'findFirst', 'findFirstOrThrow',
  'findOne',
  'findByPk', 'findAll', 'findAndCountAll', 'findOrCreate',
  'findById', 'findByIdAndUpdate', 'findByIdAndDelete',
  'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
  'executeTakeFirst', 'executeTakeFirstOrThrow',
  'createMany', 'updateMany', 'deleteMany', 'bulkCreate',
  'upsert', 'aggregate', 'groupBy',
]);

/**
 * Method names ORMs use that collide constantly with ordinary JavaScript. A
 * match on one of these is only reported when something else confirms it.
 */
export const AMBIGUOUS_DB_METHODS = new Set([
  'find', 'get', 'all', 'run', 'query', 'execute', 'exec', 'raw',
  'create', 'update', 'delete', 'destroy', 'save', 'insert', 'count',
]);

/** Array/iterable methods whose first argument is a callback. */
export const CALLBACK_FIRST_METHODS = new Set([
  'find', 'findIndex', 'findLast', 'findLastIndex', 'filter', 'some', 'every',
  'map', 'forEach', 'flatMap', 'reduce', 'sort',
]);

/** Receivers that are never a database handle. */
export const NON_DB_RECEIVERS = new Set([
  'Promise', 'Object', 'JSON', 'Math', 'Array', 'Number', 'String', 'Boolean',
  'Reflect', 'Symbol', 'Date', 'RegExp', 'Set', 'Map', 'WeakMap', 'WeakSet',
  'console', 'process', 'crypto', 'localStorage', 'sessionStorage',
  'res', 'req', 'request', 'response', 'headers', 'searchParams', 'params',
  'cookies', 'logger', 'log', 'config', 'env', 'i18n', 'router',
  'redis', 'cache', 'memcached', 'kv', 'socket', 'socketio', 'io', 'emitter',
]);

/** Receiver names that identify a database handle or ORM client. */
export const DB_HANDLE_NAMES = new Map<string, string>([
  ['prisma', 'Prisma'],
  ['prismaClient', 'Prisma'],
  ['knex', 'Knex'],
  ['sequelize', 'Sequelize'],
  ['mongoose', 'Mongoose'],
  ['kysely', 'SQL Builder'],
  ['db', 'Database'],
  ['database', 'Database'],
  ['orm', 'Database'],
  ['tx', 'Database'],
  ['trx', 'Database'],
  ['transaction', 'Database'],
  ['pg', 'Raw SQL'],
  ['sql', 'Raw SQL'],
  ['datasource', 'Database'],
  ['dataSource', 'Database'],
  ['em', 'TypeORM'],
  ['entityManager', 'TypeORM'],
  ['queryRunner', 'TypeORM'],
  ['models', 'Database'],
]);

/** Receiver names that identify a data-access layer wrapping the database. */
export const DATA_ACCESS_RECEIVER = /(repository|repositories|repo|dao|store|model)s?$/i;

/** Variable names that almost always hold an in-memory collection. */
export const COLLECTION_NAME_HINT = /(map|set|cache|registry|lookup|index|dict|counts|byId|byKey|byName|byType)$/i;

/** Query-builder methods that mark a chain as SQL, not a plain method call. */
export const SQL_BUILDER_METHODS = new Set([
  'selectFrom', 'insertInto', 'updateTable', 'deleteFrom', 'selectAll',
  'createQueryBuilder', 'getMany', 'getOne', 'getRawMany', 'getRawOne',
  'innerJoin', 'leftJoin', 'returningAll', 'from', 'into',
]);

export const SQL_KEYWORD =
  /\b(select|insert\s+into|update\s+\w|delete\s+from|with\s+\w+\s+as|truncate|(drop|create|alter)\s+(table|index|publication|schema|database|view|subscription))\b/i;

/** Packages whose imported bindings identify an ORM. */
export const ORM_PACKAGES: Array<[RegExp, string]> = [
  [/^@prisma\/client$|^\.prisma\//, 'Prisma'],
  [/^sequelize($|\/)/, 'Sequelize'],
  [/^mongoose$/, 'Mongoose'],
  [/^typeorm($|\/)/, 'TypeORM'],
  [/^knex$/, 'Knex'],
  [/^kysely($|\/)/, 'SQL Builder'],
  [/^(pg|mysql|mysql2|postgres|better-sqlite3|sqlite3)$/, 'Raw SQL'],
];

/** What a file tells us about where its database calls could come from. */
export interface DbContext {
  /** Names this file initialised with new Map()/[]/an array-producing call. */
  collectionVars: Set<string>;
  /** Local binding name -> ORM label, from imports and require(). */
  ormBindings: Map<string, string>;
  /** ORM labels this file imports at all. */
  detectedORMs: Set<string>;
}

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

/** `foo.bar.baz()` -> "foo"; `this.userRepo.get()` -> "userRepo". */
export function rootIdentifierName(node: any): string | null {
  let current = node;
  let depth = 0;
  while (current && depth < 12) {
    depth++;
    if (current.type === 'Identifier') return current.name;
    if (current.type === 'ThisExpression') return null;
    if (current.type === 'MemberExpression') {
      if (current.object?.type === 'ThisExpression') {
        return current.property?.type === 'Identifier' ? current.property.name : null;
      }
      current = current.object;
    } else if (current.type === 'CallExpression') {
      current = current.callee;
    } else if (current.type === 'TSNonNullExpression' || current.type === 'TSAsExpression') {
      current = current.expression;
    } else {
      return null;
    }
  }
  return null;
}

/** The immediate receiver name: `this.userRepository.get()` -> "userRepository". */
export function receiverName(node: any): string | null {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'TSNonNullExpression' || node.type === 'TSAsExpression') {
    return receiverName(node.expression);
  }
  if (node.type === 'MemberExpression' && node.property?.type === 'Identifier') {
    return node.property.name;
  }
  return null;
}

/** True for chains like `tx.deleteFrom('x').where(...).execute()`. */
export function isQueryBuilderChain(callExpr: any): boolean {
  let current: any = callExpr.callee;
  let depth = 0;
  while (current && depth < 12) {
    depth++;
    if (current.type === 'MemberExpression') {
      const method = current.property?.name;
      if (method && SQL_BUILDER_METHODS.has(method)) return true;
      current = current.object;
    } else if (current.type === 'CallExpression') {
      const method = current.callee?.property?.name;
      if (method && SQL_BUILDER_METHODS.has(method)) return true;
      current = current.callee;
    } else {
      break;
    }
  }
  return false;
}

/**
 * The literal text of a string expression, including templates and `'a' + b`.
 */
export function flattenStringLiteral(node: any, depth = 0): string {
  if (!node || depth > 8) return '';
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral') {
    return node.quasis.map((q: any) => q.value?.raw ?? '').join(' ');
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    return flattenStringLiteral(node.left, depth + 1) + ' ' + flattenStringLiteral(node.right, depth + 1);
  }
  return '';
}

export function ormForPackage(source: string): string | null {
  for (const [pattern, label] of ORM_PACKAGES) {
    if (pattern.test(source)) return label;
  }
  return null;
}

export function ormByMethodName(method: string): string {
  if (['findOne', 'findAll', 'findByPk', 'findAndCountAll', 'findOrCreate', 'bulkCreate'].includes(method)) {
    return 'Sequelize';
  }
  if (['findUnique', 'findUniqueOrThrow', 'findMany', 'findFirst', 'findFirstOrThrow',
       'createMany', 'updateMany', 'deleteMany', 'upsert', 'groupBy'].includes(method)) {
    return 'Prisma';
  }
  if (['find', 'findById', 'findByIdAndUpdate', 'findByIdAndDelete',
       'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace'].includes(method)) {
    return 'Mongoose';
  }
  if (['executeTakeFirst', 'executeTakeFirstOrThrow'].includes(method)) return 'SQL Builder';
  if (['query', 'execute', 'exec', 'raw'].includes(method)) return 'Raw SQL';
  return 'Database';
}

// ---------------------------------------------------------------------------
// File-level context
// ---------------------------------------------------------------------------

const ARRAY_PRODUCING = new Set([
  'map', 'filter', 'slice', 'concat', 'split', 'flat', 'flatMap',
  'sort', 'reverse', 'keys', 'values', 'entries', 'from', 'chunk',
]);
const COLLECTION_CONSTRUCTORS = new Set(['Map', 'Set', 'WeakMap', 'WeakSet']);

export function isCollectionInit(init: any): boolean {
  if (!init) return false;
  if (init.type === 'NewExpression') {
    return init.callee?.type === 'Identifier' && COLLECTION_CONSTRUCTORS.has(init.callee.name);
  }
  if (init.type === 'ArrayExpression') return true;
  if (init.type === 'CallExpression') {
    const method = init.callee?.property?.name;
    if (method && ARRAY_PRODUCING.has(method)) return true;
    const objectName = init.callee?.object?.name;
    if ((objectName === 'Object' || objectName === 'Array') && method) return true;
  }
  if (init.type === 'TSAsExpression' || init.type === 'TSNonNullExpression') {
    return isCollectionInit(init.expression);
  }
  return false;
}

/**
 * Walk the file once and record what it tells us about database access:
 * which names hold in-memory collections, and which ORMs it imports.
 */
export function collectDbContext(ast: any): DbContext {
  const collectionVars = new Set<string>();
  const ormBindings = new Map<string, string>();
  const detectedORMs = new Set<string>();

  traverse(ast, {
    noScope: true,

    ImportDeclaration(path: any) {
      const label = ormForPackage(path.node.source?.value ?? '');
      if (!label) return;
      detectedORMs.add(label);
      for (const spec of path.node.specifiers ?? []) {
        if (spec.local?.type === 'Identifier') ormBindings.set(spec.local.name, label);
      }
    },

    VariableDeclarator(path: any) {
      const id = path.node.id;
      let init = path.node.init;

      if (id?.type === 'Identifier' && isCollectionInit(init)) {
        collectionVars.add(id.name);
      }

      if (init?.type === 'AwaitExpression') init = init.argument;
      if (init?.type === 'CallExpression' && init.callee?.name === 'require') {
        const arg = init.arguments?.[0];
        if (arg?.type === 'StringLiteral') {
          const label = ormForPackage(arg.value);
          if (label) {
            detectedORMs.add(label);
            if (id?.type === 'Identifier') ormBindings.set(id.name, label);
          }
        }
      }
    },

    ClassProperty(path: any) {
      if (path.node.key?.type === 'Identifier' && isCollectionInit(path.node.value)) {
        collectionVars.add(path.node.key.name);
      }
    },

    AssignmentExpression(path: any) {
      const left = path.node.left;
      if (
        left?.type === 'MemberExpression' &&
        left.object?.type === 'ThisExpression' &&
        left.property?.type === 'Identifier' &&
        isCollectionInit(path.node.right)
      ) {
        collectionVars.add(left.property.name);
      }
    },
  });

  return { collectionVars, ormBindings, detectedORMs };
}

// ---------------------------------------------------------------------------
// Vetoes and classification
// ---------------------------------------------------------------------------

/**
 * Hard vetoes — calls that look like queries by name but demonstrably are not.
 * In the study corpus these accounted for most of the false positives.
 *
 * Does not cover bulk-flush detection, which needs the calling rule's own
 * notion of what a buffered payload is.
 */
export function isDefinitelyNotADatabaseCall(callExpr: any, method: string, ctx: DbContext): boolean {
  const receiver = callExpr.callee?.object;

  // Promise.all(...), Object.keys(...), res.get(...) etc.
  const rootName = rootIdentifierName(receiver);
  if (rootName && NON_DB_RECEIVERS.has(rootName)) return true;

  // Array.prototype.find(cb) / .some(cb): an ORM finder never takes a callback
  // as its first argument — it takes a filter object or an id.
  if (CALLBACK_FIRST_METHODS.has(method)) {
    const firstArg = callExpr.arguments?.[0];
    if (firstArg && (firstArg.type === 'ArrowFunctionExpression' || firstArg.type === 'FunctionExpression')) {
      return true;
    }
  }

  // The receiver is a variable this file initialised with new Map()/[]/.map().
  const recvName = receiverName(receiver);
  if (recvName && ctx.collectionVars.has(recvName)) return true;

  // someMap.get(k) / countsByKey.set(k, v) — name-shaped in-memory lookups.
  if (recvName && COLLECTION_NAME_HINT.test(recvName)) {
    if (['get', 'set', 'has', 'delete', 'keys', 'values', 'find'].includes(method)) return true;
  }

  return false;
}

/**
 * Positive identification. Returns the ORM/driver label, or null when there is
 * not enough evidence that this call reaches a database. Staying quiet beats
 * another false positive.
 *
 * `resultIsAwaited` lets the caller supply its own notion of promise context;
 * it only affects the data-access-receiver branch. `allowDbHandleReceiver` can
 * be turned off for drivers that stage writes on a `tx`/`transaction`/`batch`
 * object and commit once, where the receiver name is not evidence of a round
 * trip.
 */
export function classifyDatabaseCall(
  callExpr: any,
  method: string,
  ctx: DbContext,
  resultIsAwaited = false,
  allowDbHandleReceiver = true,
): string | null {
  // 1. The receiver traces back to an imported ORM binding.
  const rootName = rootIdentifierName(callExpr.callee?.object);
  if (rootName && ctx.ormBindings.has(rootName)) return ctx.ormBindings.get(rootName)!;

  // 2. A SQL query-builder chain: tx.deleteFrom(...).where(...).execute()
  if (isQueryBuilderChain(callExpr)) return 'SQL Builder';

  // 3. A raw SQL string passed to query()/raw()/execute().
  if (['query', 'raw', 'execute', 'exec'].includes(method)) {
    const firstArg = callExpr.arguments?.[0];
    if (firstArg && SQL_KEYWORD.test(flattenStringLiteral(firstArg))) return 'Raw SQL';
  }

  // 4. The receiver is a recognised database handle: prisma.*, db.*, tx.*
  if (allowDbHandleReceiver && rootName && DB_HANDLE_NAMES.has(rootName)) {
    return DB_HANDLE_NAMES.get(rootName)!;
  }

  // 5. The receiver is a data-access object: userRepository.get(id).
  const recvName = receiverName(callExpr.callee?.object);
  if (recvName && DATA_ACCESS_RECEIVER.test(recvName)) {
    if (DISTINCTIVE_DB_METHODS.has(method) || resultIsAwaited) return 'Repository';
  }

  // 6. A method name that only ORMs use is evidence by itself.
  if (DISTINCTIVE_DB_METHODS.has(method)) return ormByMethodName(method);

  // 7. An ambiguous method name, but this file imports the matching ORM.
  if (ctx.detectedORMs.size > 0) {
    const fallback = ormByMethodName(method);
    if (ctx.detectedORMs.has(fallback)) return fallback;
  }

  return null;
}
