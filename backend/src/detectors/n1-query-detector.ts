import traverse from '@babel/traverse';
import { BaseDetector } from './base-detector';
import { ImportAnalyzer } from '../analyzer/import-analyzer';
import { Loop, DatabaseCall, AnalysisContext, DetectorResult, ORMContext } from '../types';

/**
 * Method names that are specific enough to ORMs that seeing one is strong
 * evidence on its own. None of these exist on Map, Set, Array, or Promise.
 */
const DISTINCTIVE_DB_METHODS = new Set([
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
 * Method names that ORMs use but that collide constantly with ordinary
 * JavaScript. A match on one of these is only reported when something else
 * (an import, a query-builder chain, a data-access receiver) confirms it.
 */
const AMBIGUOUS_DB_METHODS = new Set([
  'find', 'get', 'all', 'run', 'query', 'execute', 'exec', 'raw',
  'create', 'update', 'delete', 'destroy', 'save', 'insert', 'count',
]);

/** Array/iterable methods whose first argument is a callback. */
const CALLBACK_FIRST_METHODS = new Set([
  'find', 'findIndex', 'findLast', 'findLastIndex', 'filter', 'some', 'every',
  'map', 'forEach', 'flatMap', 'reduce', 'sort',
]);

/** Receivers that are never a database handle. */
const NON_DB_RECEIVERS = new Set([
  'Promise', 'Object', 'JSON', 'Math', 'Array', 'Number', 'String', 'Boolean',
  'Reflect', 'Symbol', 'Date', 'RegExp', 'Set', 'Map', 'WeakMap', 'WeakSet',
  'console', 'process', 'crypto', 'localStorage', 'sessionStorage',
  'res', 'req', 'request', 'response', 'headers', 'searchParams', 'params',
  'cookies', 'logger', 'log', 'config', 'env', 'i18n', 'router',
  'redis', 'cache', 'memcached', 'kv', 'socket', 'socketio', 'io', 'emitter',
]);

/** Receiver names that identify a database handle or ORM client. */
const DB_HANDLE_NAMES = new Map<string, string>([
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
const DATA_ACCESS_RECEIVER = /(repository|repositories|repo|dao|store|model)s?$/i;

/** Variable names that almost always hold an in-memory collection. */
const COLLECTION_NAME_HINT = /(map|set|cache|registry|lookup|index|dict|counts|byId|byKey|byName|byType)$/i;

/** Query-builder methods that mark a chain as SQL, not a plain method call. */
const SQL_BUILDER_METHODS = new Set([
  'selectFrom', 'insertInto', 'updateTable', 'deleteFrom', 'selectAll',
  'createQueryBuilder', 'getMany', 'getOne', 'getRawMany', 'getRawOne',
  'innerJoin', 'leftJoin', 'returningAll', 'from', 'into',
]);

/** Helpers that split a collection into fixed-size batches. */
const BATCH_PRODUCERS = /^(chunk|chunked|chunks|batch|batched|batches|partition|paginate|splitIntoChunks|toChunks)$/i;

const SQL_KEYWORD =
  /\b(select|insert\s+into|update\s+\w|delete\s+from|with\s+\w+\s+as|truncate|(drop|create|alter)\s+(table|index|publication|schema|database|view|subscription))\b/i;

export class N1QueryDetector extends BaseDetector {
  name = 'N+1 Query Detector';
  private importAnalyzer = new ImportAnalyzer();
  /** Names known to hold a Map/Set/Array within the current file. */
  private collectionVars = new Set<string>();
  /** Names known to hold pre-chunked batches (from chunk()/batched()/...). */
  private batchVars = new Set<string>();
  /** True when the file uses a driver that stages writes and commits once. */
  private hasStagedWriteDriver = false;
  /** Call nodes whose result is awaited, returned, or collected as a promise. */
  private awaitedCalls = new WeakSet<object>();

  async detect(ast: any, context: AnalysisContext): Promise<DetectorResult> {
    this.reset();

    this.collectionVars = this.collectCollectionVariables(ast);
    this.batchVars = this.collectBatchVariables(ast);
    this.hasStagedWriteDriver = this.usesStagedWriteDriver(ast);

    const allLoops = this.findLoops(ast);
    const loops = allLoops.filter((loop) => !this.isBatchLoop(loop));

    // Collect queries per loop, scanning loop bodies only.
    const perLoop = loops.map((loop) => ({
      loop,
      calls: this.findDatabaseQueries(loop, context),
      bodyRanges: this.getScanNodes(loop)
        .filter((n: any) => typeof n.start === 'number')
        .map((n: any) => [n.start, n.end] as [number, number]),
    }));

    // A query sitting in a nested loop belongs to that inner loop. Without this,
    // one N+1 gets reported once per enclosing loop. Loops skipped above still
    // own their queries, otherwise skipping a batch loop would push its queries
    // up to the loop around it.
    for (const entry of perLoop) {
      const innerRanges = allLoops
        .filter((other) => other !== entry.loop && this.isNestedWithin(other, entry.loop))
        .flatMap((other) =>
          this.getScanNodes(other)
            .filter((n: any) => typeof n.start === 'number')
            .map((n: any) => [n.start, n.end] as [number, number])
        );

      entry.calls = entry.calls.filter(
        (call: any) => !innerRanges.some(([start, end]) => call._start >= start && call._end <= end)
      );
    }

    for (const entry of perLoop) {
      if (entry.calls.length > 0) {
        this.reportIssue(entry.loop, entry.calls, context);
      }
    }

    return {
      issues: this.issues,
      detectorName: this.name,
    };
  }

  /**
   * Walk the file once and record every identifier that demonstrably holds an
   * in-memory collection: `new Map()`, an array literal, or the result of an
   * array-producing call. Calls on these are never database calls, no matter
   * what the method is named.
   */
  private collectCollectionVariables(ast: any): Set<string> {
    const names = new Set<string>();
    const arrayProducing = new Set([
      'map', 'filter', 'slice', 'concat', 'split', 'flat', 'flatMap',
      'sort', 'reverse', 'keys', 'values', 'entries', 'from', 'chunk',
    ]);
    const collectionConstructors = new Set(['Map', 'Set', 'WeakMap', 'WeakSet']);

    const isCollectionInit = (init: any): boolean => {
      if (!init) return false;
      if (init.type === 'NewExpression') {
        return init.callee?.type === 'Identifier' && collectionConstructors.has(init.callee.name);
      }
      if (init.type === 'ArrayExpression') return true;
      if (init.type === 'CallExpression') {
        const method = init.callee?.property?.name;
        if (method && arrayProducing.has(method)) return true;
        // Object.entries(...) / Object.keys(...) / Array.from(...)
        const objectName = init.callee?.object?.name;
        if ((objectName === 'Object' || objectName === 'Array') && method) return true;
      }
      if (init.type === 'TSAsExpression' || init.type === 'TSNonNullExpression') {
        return isCollectionInit(init.expression);
      }
      return false;
    };

    traverse(ast, {
      VariableDeclarator(path: any) {
        if (path.node.id?.type !== 'Identifier') return;
        if (isCollectionInit(path.node.init)) {
          names.add(path.node.id.name);
        }
      },

      // class Foo { private cache = new Map(); }
      ClassProperty(path: any) {
        if (path.node.key?.type === 'Identifier' && isCollectionInit(path.node.value)) {
          names.add(path.node.key.name);
        }
      },

      // this.cache = new Map();
      AssignmentExpression(path: any) {
        const left = path.node.left;
        if (
          left?.type === 'MemberExpression' &&
          left.object?.type === 'ThisExpression' &&
          left.property?.type === 'Identifier' &&
          isCollectionInit(path.node.right)
        ) {
          names.add(left.property.name);
        }
      },
    });

    return names;
  }

  /**
   * Record variables assigned from a chunking helper: `const batches =
   * chunk(ids, 1000)`. Only these count as batch collections — a variable is
   * not a batch just because its name ends in "batches".
   */
  private collectBatchVariables(ast: any): Set<string> {
    const names = new Set<string>();

    traverse(ast, {
      VariableDeclarator(path: any) {
        if (path.node.id?.type !== 'Identifier') return;
        let init = path.node.init;
        if (init?.type === 'AwaitExpression') init = init.argument;
        if (init?.type !== 'CallExpression') return;
        const fn = init.callee?.name || init.callee?.property?.name;
        if (fn && BATCH_PRODUCERS.test(fn)) names.add(path.node.id.name);
      },
    });

    return names;
  }

  /**
   * Firestore, DynamoDB and similar stage writes on a transaction or batch
   * object and send them in one commit, so a write per item in a loop there is
   * not a round trip per item.
   */
  private usesStagedWriteDriver(ast: any): boolean {
    let found = false;
    const pattern = /(firebase|firestore|@google-cloud\/firestore|dynamodb|@aws-sdk\/lib-dynamodb)/i;

    traverse(ast, {
      ImportDeclaration(path: any) {
        if (pattern.test(path.node.source?.value || '')) found = true;
      },
      CallExpression(path: any) {
        if (path.node.callee?.name === 'require') {
          const arg = path.node.arguments?.[0];
          if (arg?.type === 'StringLiteral' && pattern.test(arg.value)) found = true;
        }
      },
    });

    return found;
  }

  /**
   * True when the call's result is consumed as a promise — awaited, returned,
   * collected into an array, or chained. A data-access call whose result is
   * used inline without any of that is almost always a plain lookup.
   */
  private resultIsAwaitedOrReturned(callExpr: any): boolean {
    return this.awaitedCalls.has(callExpr);
  }

  private findLoops(ast: any): Loop[] {
    const loops: Loop[] = [];

    traverse(ast, {
      ForOfStatement: (path: any) => {
        loops.push({
          type: 'for-of',
          node: path.node,
          location: path.node.loc,
          scope: path.scope,
        });
      },

      ForStatement: (path: any) => {
        loops.push({
          type: 'for',
          node: path.node,
          location: path.node.loc,
          scope: path.scope,
        });
      },

      ForInStatement: (path: any) => {
        loops.push({
          type: 'for-in',
          node: path.node,
          location: path.node.loc,
          scope: path.scope,
        });
      },

      WhileStatement: (path: any) => {
        loops.push({
          type: 'while',
          node: path.node,
          location: path.node.loc,
          scope: path.scope,
        });
      },

      CallExpression: (path: any) => {
        if (path.node.callee.property?.name === 'forEach' ||
            path.node.callee.property?.name === 'map') {
          loops.push({
            type: 'forEach',
            node: path.node,
            location: path.node.loc,
            scope: path.scope,
          });
        }
      },
    });

    return loops;
  }

  /** True when `inner` sits entirely inside `outer`. */
  private isNestedWithin(inner: Loop, outer: Loop): boolean {
    const i: any = inner.node;
    const o: any = outer.node;
    if (typeof i.start !== 'number' || typeof o.start !== 'number') return false;
    if (i.start === o.start && i.end === o.end) return false;
    return i.start >= o.start && i.end <= o.end;
  }

  /**
   * The parts of a loop that actually run once per iteration. Deliberately
   * excludes the expression being iterated: in `(await Model.findAll()).map(...)`
   * the query produces the collection, it does not run per item.
   */
  private getScanNodes(loop: Loop): any[] {
    const node: any = loop.node;

    if (loop.type === 'forEach') {
      // Only the callback(s) passed to .map()/.forEach(), never the receiver.
      return (node.arguments || []).filter(
        (arg: any) => arg?.type === 'ArrowFunctionExpression' || arg?.type === 'FunctionExpression'
      );
    }

    return node.body ? [node.body] : [];
  }

  /**
   * Loops that walk pre-chunked batches or paginate through a table are the
   * cure for N+1, not a case of it. One query per batch of 1,000 rows is the
   * shape we would recommend, so reporting it would be telling people to undo
   * the optimisation they already made.
   */
  private isBatchLoop(loop: Loop): boolean {
    const node: any = loop.node;
    const iterable =
      loop.type === 'forEach'
        ? node.callee?.object
        : node.right /* for-of / for-in */;

    if (iterable) {
      // `for (const batch of batches)` counts only when `batches` was actually
      // produced by a chunking helper — a queue of jobs called `campaignBatches`
      // still runs one query per job.
      if (iterable.type === 'Identifier' && this.batchVars.has(iterable.name)) return true;
      if (iterable.type === 'CallExpression') {
        const fnName = iterable.callee?.name || iterable.callee?.property?.name;
        if (fnName && BATCH_PRODUCERS.test(fnName)) return true;
      }
    }

    // while (true) { ... findMany({ skip, take }) ... } — cursor/offset paging.
    if (loop.type === 'while' || loop.type === 'for') {
      if (this.containsPaginationArguments(node)) return true;
    }

    // for (let i = 0; i < ids.length; i += PAGE_SIZE) — walking fixed-size
    // windows, so each query covers a page of rows rather than a single row.
    if (loop.type === 'for' && node.update?.type === 'AssignmentExpression' && node.update.operator === '+=') {
      const step = node.update.right;
      const isSingleStep = step?.type === 'NumericLiteral' && step.value === 1;
      if (!isSingleStep) return true;
    }

    // for (;;) / while (true): a retry or polling loop. There is no collection
    // being walked, so there is no set of queries that could be batched into one.
    if (loop.type === 'for' && !node.init && !node.test) return true;
    if (loop.type === 'while' && node.test?.type === 'BooleanLiteral' && node.test.value === true) {
      return true;
    }

    // Bounded retry loops — `while (retries <= MAX_RETRIES)`, or
    // `for (let attempt = 0; attempt < 3; attempt++)`. Same reasoning: the
    // iterations are attempts at one operation, not items in a collection.
    if (loop.type === 'while' || loop.type === 'for') {
      const RETRY_NAME = /retr(y|ies)|attempt/i;
      if (this.mentionsIdentifier(node.test, RETRY_NAME)) return true;
      if (this.mentionsIdentifier(node.init, RETRY_NAME)) return true;
    }

    // Flag-driven batch loops — `while (hasMore) { ...deleteMany... }`. Each
    // iteration clears a batch of rows, which is the batching we recommend.
    if (loop.type === 'while' && this.mentionsIdentifier(node.test, /^(hasMore|hasNext|more|remaining|keepGoing|shouldContinue)$/i)) {
      return true;
    }

    return false;
  }

  /** True when any identifier inside `node` matches `pattern`. */
  private mentionsIdentifier(node: any, pattern: RegExp): boolean {
    if (!node) return false;
    let found = false;

    const walk = (current: any, depth: number) => {
      if (!current || typeof current !== 'object' || found || depth > 8) return;
      if (current.type === 'Identifier' && pattern.test(current.name)) {
        found = true;
        return;
      }
      for (const key of Object.keys(current)) {
        if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
        const value = (current as any)[key];
        if (Array.isArray(value)) {
          value.forEach((v) => walk(v, depth + 1));
        } else if (value && typeof value.type === 'string') {
          walk(value, depth + 1);
        }
      }
    };

    walk(node, 0);
    return found;
  }

  private containsPaginationArguments(node: any): boolean {
    const pagingKeys = new Set(['skip', 'take', 'offset', 'limit', 'cursor', 'lastId', 'after']);
    let found = false;

    const walk = (current: any, depth: number) => {
      if (!current || typeof current !== 'object' || found || depth > 14) return;
      if (current.type === 'ObjectProperty' && current.key?.type === 'Identifier' && pagingKeys.has(current.key.name)) {
        found = true;
        return;
      }
      for (const key of Object.keys(current)) {
        if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
        const value = (current as any)[key];
        if (Array.isArray(value)) {
          value.forEach((v) => walk(v, depth + 1));
        } else if (value && typeof value.type === 'string') {
          walk(value, depth + 1);
        }
      }
    };

    walk(node, 0);
    return found;
  }

  /** The name bound to each item of the loop: `for (const batch of batches)` -> "batch". */
  private getIterationVariable(loop: Loop): string | null {
    const node: any = loop.node;

    if (loop.type === 'forEach') {
      const callback = (node.arguments || []).find(
        (a: any) => a?.type === 'ArrowFunctionExpression' || a?.type === 'FunctionExpression'
      );
      const first = callback?.params?.[0];
      return first?.type === 'Identifier' ? first.name : null;
    }

    const left = node.left;
    if (left?.type === 'VariableDeclaration') {
      const id = left.declarations?.[0]?.id;
      return id?.type === 'Identifier' ? id.name : null;
    }
    if (left?.type === 'Identifier') return left.name;

    return null;
  }

  /**
   * True when the query consumes the whole iterated item as a set, as in
   * `where: { id: { in: batch } }`. That is one query per batch of rows, which
   * is the batching we would recommend — not a query per row.
   */
  private queryConsumesWholeItem(callExpr: any, itemName: string | null): boolean {
    if (!itemName) return false;
    let found = false;

    // The item itself must be the list being matched. `in: batch` is batching;
    // `in: workspace.typebots.map(...)` is still one query per workspace.
    const isItem = (node: any) => node?.type === 'Identifier' && node.name === itemName;

    const referencesItem = (node: any, depth: number): boolean => {
      if (!node || typeof node !== 'object' || depth > 4) return false;
      if (isItem(node)) return true;
      if (node.type === 'SpreadElement') return referencesItem(node.argument, depth + 1);
      if (node.type === 'ArrayExpression') return node.elements.some((e: any) => referencesItem(e, depth + 1));
      if (node.type === 'CallExpression') {
        // batch.map(...) — a transform of the whole batch
        return node.callee?.type === 'MemberExpression' && isItem(node.callee.object);
      }
      return false;
    };

    const walk = (node: any, depth: number) => {
      if (!node || typeof node !== 'object' || found || depth > 12) return;
      if (
        node.type === 'ObjectProperty' &&
        node.key?.type === 'Identifier' &&
        (node.key.name === 'in' || node.key.name === 'notIn' || node.key.name === 'hasSome') &&
        referencesItem(node.value, 0)
      ) {
        found = true;
        return;
      }
      for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
        const value = (node as any)[key];
        if (Array.isArray(value)) value.forEach((v) => walk(v, depth + 1));
        else if (value && typeof value.type === 'string') walk(value, depth + 1);
      }
    };

    (callExpr.arguments || []).forEach((arg: any) => walk(arg, 0));
    return found;
  }

  private findDatabaseQueries(loop: Loop, context: AnalysisContext): DatabaseCall[] {
    const dbCalls: DatabaseCall[] = [];
    const itemName = this.getIterationVariable(loop);

    const consider = (callExpr: any, node: any) => {
      const callee = callExpr.callee;
      if (!callee?.property) return;

      const methodName = callee.property.name;
      if (!DISTINCTIVE_DB_METHODS.has(methodName) && !AMBIGUOUS_DB_METHODS.has(methodName)) {
        return;
      }

      if (this.isNotADatabaseCall(callExpr, methodName)) return;
      if (this.queryConsumesWholeItem(callExpr, itemName)) return;

      const orm = this.classifyDatabaseCall(callExpr, methodName, context.ormContext);
      if (!orm) return;

      dbCalls.push({
        method: methodName,
        orm,
        location: node.loc,
        code: this.getCode(node, context.sourceCode),
        _start: callExpr.start,
        _end: callExpr.end,
      } as any);
    };

    // Parent node types that mean "this call's result is used as a promise":
    // awaited, returned from an arrow, pushed into an array for Promise.all,
    // handed to another call, or chained with .then().
    const PROMISE_CONTEXT = new Set([
      'AwaitExpression', 'ReturnStatement', 'ArrowFunctionExpression',
      'ArrayExpression', 'CallExpression', 'YieldExpression',
    ]);

    const visitors = {
      AwaitExpression: (path: any) => {
        const callExpr = path.node.argument;
        if (callExpr?.type !== 'CallExpression') return;
        this.awaitedCalls.add(callExpr);
        consider(callExpr, path.node);
      },

      CallExpression: (path: any) => {
        if (path.parent?.type === 'AwaitExpression') return;
        if (PROMISE_CONTEXT.has(path.parent?.type)) {
          this.awaitedCalls.add(path.node);
        }
        consider(path.node, path.node);
      },
    };

    for (const scanNode of this.getScanNodes(loop)) {
      traverse(scanNode, visitors, loop.scope);
    }

    return dbCalls;
  }

  /**
   * Hard vetoes. These rule out calls that look like queries by name but
   * demonstrably aren't — the largest source of false positives in practice.
   */
  private isNotADatabaseCall(callExpr: any, methodName: string): boolean {
    const callee = callExpr.callee;
    const receiver = callee.object;

    // Promise.all(...), Object.keys(...), JSON.parse(...), res.get(...) etc.
    const rootName = this.getRootIdentifierName(receiver);
    if (rootName && NON_DB_RECEIVERS.has(rootName)) return true;

    // Array.prototype.find(cb) / .some(cb) / .filter(cb): an ORM finder never
    // takes a callback as its first argument — it takes a filter object or id.
    if (CALLBACK_FIRST_METHODS.has(methodName)) {
      const firstArg = callExpr.arguments?.[0];
      if (firstArg && (firstArg.type === 'ArrowFunctionExpression' || firstArg.type === 'FunctionExpression')) {
        return true;
      }
    }

    // The receiver is a variable this file initialised with new Map()/[]/.map().
    const receiverName = this.getReceiverName(receiver);
    if (receiverName && this.collectionVars.has(receiverName)) return true;

    // someMap.get(k) / countsByKey.set(k, v) — name-shaped in-memory lookups.
    if (receiverName && COLLECTION_NAME_HINT.test(receiverName)) {
      if (['get', 'set', 'has', 'delete', 'keys', 'values', 'find'].includes(methodName)) {
        return true;
      }
    }

    // A write whose payload is a whole buffered array is a bulk flush, which is
    // the fix for N+1, not an instance of it.
    if (this.isBulkOperation(callExpr)) return true;

    return false;
  }

  /** `insertInto(t).values(buffer).execute()` or `createMany({ data: rows })`. */
  private isBulkOperation(callExpr: any): boolean {
    const isCollectionArg = (arg: any): boolean => {
      if (!arg) return false;
      if (arg.type === 'Identifier') return this.collectionVars.has(arg.name);
      if (arg.type === 'ArrayExpression') return true;
      if (arg.type === 'SpreadElement') return true;
      if (arg.type === 'ObjectExpression') {
        return arg.properties.some(
          (prop: any) =>
            prop.type === 'ObjectProperty' &&
            prop.key?.name === 'data' &&
            isCollectionArg(prop.value)
        );
      }
      return false;
    };

    if ((callExpr.arguments || []).some(isCollectionArg)) return true;

    let current: any = callExpr.callee;
    let depth = 0;
    while (current && depth < 12) {
      depth++;
      if (current.type === 'CallExpression') {
        const method = current.callee?.property?.name;
        if (method && ['values', 'insert', 'addValues', 'createMany'].includes(method)) {
          if ((current.arguments || []).some(isCollectionArg)) return true;
        }
        current = current.callee;
      } else if (current.type === 'MemberExpression') {
        current = current.object;
      } else {
        break;
      }
    }

    return false;
  }

  /**
   * Positive identification. Returns the ORM/driver label, or null when there
   * is not enough evidence that this call reaches a database.
   */
  private classifyDatabaseCall(callExpr: any, methodName: string, ormContext?: ORMContext): string | null {
    // 1. Strongest: the receiver traces back to an imported ORM symbol.
    if (ormContext) {
      const importBasedORM = this.importAnalyzer.getORMFromCallExpression(callExpr, ormContext);
      if (importBasedORM) {
        return this.formatORMName(importBasedORM);
      }
    }

    // 2. A SQL query-builder chain: tx.deleteFrom(...).where(...).execute()
    if (this.isQueryBuilderChain(callExpr)) {
      return 'SQL Builder';
    }

    // 3. A raw SQL string passed to query()/raw()/execute().
    if (['query', 'raw', 'execute', 'exec'].includes(methodName) && this.hasSqlStringArgument(callExpr)) {
      return 'Raw SQL';
    }

    // 4. The receiver is a recognised database handle: prisma.*, db.*, tx.*
    const rootName = this.getRootIdentifierName(callExpr.callee.object);
    if (rootName && DB_HANDLE_NAMES.has(rootName)) {
      // Firestore and friends stage writes on a transaction/batch object and
      // commit once, so `transaction.delete(ref)` is not a round trip per item.
      const isStagedWrite = rootName === 'transaction' || rootName === 'tx' || rootName === 'batch';
      if (!(this.hasStagedWriteDriver && isStagedWrite)) {
        return DB_HANDLE_NAMES.get(rootName)!;
      }
    }

    // 5. The receiver is a data-access object: userRepository.get(id).
    // Only when the result is actually awaited or returned — a plain `Map`
    // that happens to be called `repositories` is not a data-access layer.
    const receiverName = this.getReceiverName(callExpr.callee.object);
    if (receiverName && DATA_ACCESS_RECEIVER.test(receiverName)) {
      if (DISTINCTIVE_DB_METHODS.has(methodName) || this.resultIsAwaitedOrReturned(callExpr)) {
        return 'Repository';
      }
    }

    // 6. A method name that only ORMs use is evidence by itself.
    if (DISTINCTIVE_DB_METHODS.has(methodName)) {
      return this.detectORMByMethodName(methodName);
    }

    // 7. An ambiguous method name, but this file imports the matching ORM.
    if (ormContext && ormContext.detectedORMs.size > 0) {
      const fallbackORM = this.detectORMByMethodName(methodName);
      const normalizedFallback = fallbackORM.toLowerCase().replace(' ', '_');
      if (ormContext.detectedORMs.has(normalizedFallback)) {
        return fallbackORM;
      }
    }

    // Not enough evidence. Staying quiet beats another false positive.
    return null;
  }

  /** True for chains like `tx.deleteFrom('x').where(...).execute()`. */
  private isQueryBuilderChain(callExpr: any): boolean {
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

  /** True when the first argument is a string containing SQL. */
  private hasSqlStringArgument(callExpr: any): boolean {
    const firstArg = callExpr.arguments?.[0];
    if (!firstArg) return false;
    return SQL_KEYWORD.test(this.flattenStringLiteral(firstArg));
  }

  /**
   * The literal text of a string expression, including template literals and
   * `'DELETE FROM ' + table` style concatenation.
   */
  private flattenStringLiteral(node: any, depth = 0): string {
    if (!node || depth > 8) return '';

    if (node.type === 'StringLiteral') return node.value;
    if (node.type === 'TemplateLiteral') {
      return node.quasis.map((q: any) => q.value?.raw ?? '').join(' ');
    }
    if (node.type === 'BinaryExpression' && node.operator === '+') {
      return (
        this.flattenStringLiteral(node.left, depth + 1) +
        ' ' +
        this.flattenStringLiteral(node.right, depth + 1)
      );
    }

    return '';
  }

  /** `foo.bar.baz()` -> "foo"; `this.userRepo.get()` -> "userRepo". */
  private getRootIdentifierName(node: any): string | null {
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
  private getReceiverName(node: any): string | null {
    if (!node) return null;
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'TSNonNullExpression' || node.type === 'TSAsExpression') {
      return this.getReceiverName(node.expression);
    }
    if (node.type === 'MemberExpression' && node.property?.type === 'Identifier') {
      return node.property.name;
    }
    return null;
  }

  private detectORMByMethodName(methodName: string): string {
    if (['findOne', 'findAll', 'findByPk', 'findAndCountAll', 'findOrCreate', 'bulkCreate'].includes(methodName)) {
      return 'Sequelize';
    }
    if (['findUnique', 'findUniqueOrThrow', 'findMany', 'findFirst', 'findFirstOrThrow',
         'createMany', 'updateMany', 'deleteMany', 'upsert', 'groupBy'].includes(methodName)) {
      return 'Prisma';
    }
    if (['find', 'findById', 'findByIdAndUpdate', 'findByIdAndDelete',
         'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace'].includes(methodName)) {
      return 'Mongoose';
    }
    if (['executeTakeFirst', 'executeTakeFirstOrThrow'].includes(methodName)) {
      return 'SQL Builder';
    }
    if (['query', 'execute', 'exec', 'raw'].includes(methodName)) {
      return 'Raw SQL';
    }
    return 'Database';
  }

  private formatORMName(orm: string): string {
    const names: Record<string, string> = {
      'sequelize': 'Sequelize',
      'prisma': 'Prisma',
      'mongoose': 'Mongoose',
      'typeorm': 'TypeORM',
      'knex': 'Knex',
      'raw_sql': 'Raw SQL',
    };
    return names[orm] || orm;
  }

  // `protected` so it stays compatible with builds where BaseDetector
  // already provides this helper.
  protected getCode(node: any, sourceCode: string): string {
    if (!node.start || !node.end) {
      return '';
    }
    return sourceCode.substring(node.start, node.end);
  }

  private reportIssue(loop: Loop, dbQueries: DatabaseCall[], context: AnalysisContext): void {
    const severity = this.calculateSeverity(dbQueries.length);
    const lineNumber = loop.location.start.line;

    const codeBefore = this.getCode(loop.node, context.sourceCode);
    const description = this.generateDescription(loop, dbQueries);

    const queriesIfN100 = dbQueries.length * 100 + 1;
    const issue = this.createIssue(
      'n_plus_1_query',
      severity,
      context,
      lineNumber,
      'N+1 Query Detected',
      description,
      codeBefore,
      undefined,
      this.createImpact(
        severity === 'critical' ? 9 : severity === 'high' ? 7 : 5,
        `${queriesIfN100} queries for 100 items vs 1 optimal query`,
        85,
        'performance',
        'moderate',
        { queriesIfN100, queriesOptimal: 1, performanceGain: `${queriesIfN100}x slower` }
      )
    );

    this.issues.push(issue);
  }

  private calculateSeverity(queryCount: number): 'critical' | 'high' | 'medium' | 'low' {
    if (queryCount >= 3) return 'critical';
    if (queryCount >= 2) return 'high';
    return 'medium';
  }

  private generateDescription(loop: Loop, dbQueries: DatabaseCall[]): string {
    const queryList = dbQueries.map((q) => `${q.orm}.${q.method}()`).join(', ');
    return `Found ${dbQueries.length} database ${dbQueries.length === 1 ? 'query' : 'queries'} (${queryList}) inside a ${loop.type} loop. This creates an N+1 query problem where each iteration makes a separate database call. Consider using eager loading or batch queries instead.`;
  }
}
