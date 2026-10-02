/**
 * Payload Solution Generator
 *
 * Held to the Missing Index standard: paste the suggestion over the query and
 * the finding it came from is gone. The row-limit findings (`unbounded-query`,
 * `large-return`, `api-response`, `unbounded-graphql`) carry the query exactly
 * as written in `codeBefore`, and the suggestion is that query with a row
 * limit in the form its library takes:
 *
 *   Prisma            findMany({ ..., take: 100 })
 *   Drizzle           db.query.x.findMany({ ..., limit: 100 })
 *   Sequelize         findAll({ ..., limit: 100 })
 *   TypeORM           repo.find({ ..., take: 100 }), manager.find(E, { ..., take: 100 })
 *   MikroORM          em.find(E, where, { ..., limit: 100 })
 *   Mongoose / Mongo  Model.find(filter).limit(100)
 *   knex              knex('t')....limit(100)
 *   TypeORM builder   qb....take(100).getMany()   (.limit for getRawMany)
 *   Kysely            db.selectFrom('t')....limit(100).execute()
 *
 * Nothing is produced when the library cannot be told from the code: a
 * guessed option name that the library ignores would look like a fix and
 * change nothing.
 *
 * What is deliberately left out:
 *
 * - `deep-include`. A per-relation `take` bounds the rows but not the depth
 *   the rule counts, so the finding would stay; and which relations the caller
 *   can drop is not visible in the query.
 * - `select-star`. Naming the columns needs the table's schema and every use
 *   of the result.
 *
 * A fixed limit is a cap, not pagination. The explanation says so, and for
 * an endpoint says what the next step is: accept a page size and a cursor from
 * the request and pass them on.
 */

import { parseExpression } from '@babel/parser';
import { BaseSolutionGenerator } from './base-generator';
import type { DiagnosticIssue, Solution, SolutionContext } from './types';

/** The cap the suggestion writes. A round number a reader will replace. */
export const DEFAULT_ROW_LIMIT = 100;

const ROW_LIMIT_RULES = new Set([
  'payload/unbounded-query', 'payload/large-return', 'payload/api-response', 'payload/unbounded-graphql',
]);

const TYPEORM_OPTION_KEYS = new Set([
  'where', 'relations', 'order', 'select', 'skip', 'cache', 'withDeleted', 'lock', 'loadRelationIds', 'loadEagerRelations', 'relationLoadStrategy',
]);
const BUILDER_TERMINALS = new Set(['getMany', 'getRawMany', 'getManyAndCount', 'getRawAndEntities']);

export interface LimitEdit {
  /** The rewritten query. */
  code: string;
  /** The library, as the explanation names it. */
  library: string;
}

export class PayloadSolutionGenerator extends BaseSolutionGenerator {
  name = 'Payload Solution Generator';

  async generateSolutions(issue: DiagnosticIssue, _context: SolutionContext): Promise<Solution[]> {
    if (issue.category !== 'payload' || !ROW_LIMIT_RULES.has(issue.rule)) return [];
    const before = issue.codeBefore ?? '';
    if (!before.trim()) return [];

    const edit = addRowLimit(before, DEFAULT_ROW_LIMIT, builderKindOf(issue.title));
    if (!edit) return [];

    const endpoint = issue.rule === 'payload/api-response' || issue.rule === 'payload/unbounded-graphql';
    const reasoning = [
      `Cap the query at ${DEFAULT_ROW_LIMIT} rows (${edit.library}).`,
      `This is a cap, not pagination: rows past the first ${DEFAULT_ROW_LIMIT} are no longer returned, so check what the caller does with them before applying it.`,
      endpoint
        ? (issue.rule === 'payload/unbounded-graphql'
          ? 'For a list field, add pagination arguments (first/after, or limit/offset with a maximum) and pass them to the query in place of the constant.'
          : 'For an endpoint, accept a page size (with a maximum) and a cursor or offset from the request, pass them to the query in place of the constant, and return the cursor for the next page.')
        : 'If every row is needed (an export, a batch job), keep the limit and loop over pages with a cursor or offset instead of loading the table at once.',
    ].join('\n');

    return [this.createSolution(issue.id || '', 1, 'payload-row-limit', edit.code, 80, reasoning, 'medium')];
  }
}

export type BuilderKind = 'knex' | 'typeorm-qb' | 'kysely';

/**
 * The rule names the builder in the title: `knex('t') query`,
 * `createQueryBuilder() query`, `selectFrom('t') query`. A chain held in a
 * variable (`query.where(...)`) does not show its root, so the title is what
 * says which library it is.
 */
export function builderKindOf(title: string): BuilderKind | undefined {
  if (/\bknex\(/.test(title)) return 'knex';
  if (/createQueryBuilder\(\) query/.test(title)) return 'typeorm-qb';
  if (/selectFrom\(/.test(title)) return 'kysely';
  return undefined;
}

/**
 * The query with a row limit added, or null when its library cannot be told
 * from the code or the shape is not one this can rewrite.
 */
export function addRowLimit(code: string, limit: number, builder?: BuilderKind): LimitEdit | null {
  let expr: any;
  try {
    // errorRecovery: `this.#client.x.findMany()` is a private name, which only
    // parses inside a class; the query text alone is still a well-formed call.
    expr = parseExpression(code, { plugins: ['typescript', 'jsx'], errorRecovery: true });
    if (expr?.errors?.some((e: any) => !/private name/i.test(String(e?.message ?? e?.reasonCode ?? '')))) return null;
  } catch {
    return null;
  }
  // The parser's offsets are relative to `code`, which is what the edits use.
  while (expr?.type === 'AwaitExpression' || expr?.type === 'TSAsExpression' || expr?.type === 'ParenthesizedExpression') {
    expr = expr.argument ?? expr.expression;
  }
  if (expr?.type !== 'CallExpression' || expr.callee?.type !== 'MemberExpression' || expr.callee.property?.type !== 'Identifier') {
    return null;
  }

  const method: string = expr.callee.property.name;
  const chain = chainMethods(expr);
  const insertAt = (pos: number, text: string) => code.slice(0, pos) + text + code.slice(pos);
  const append = (text: string) => insertAt(expr.end, text);

  // TypeORM query builder: the limit goes before the terminal call, or at the
  // end of a chain that is held in a variable and run later.
  if (chain.includes('createQueryBuilder') || builder === 'typeorm-qb') {
    if (BUILDER_TERMINALS.has(method)) {
      const take = method === 'getRawMany' || method === 'getRawAndEntities' ? 'limit' : 'take';
      return { code: insertAt(expr.callee.object.end, `.${take}(${limit})`), library: `TypeORM query builder, .${take}()` };
    }
    if (builder !== 'typeorm-qb' || method === 'execute') return null;
    return { code: append(`.take(${limit})`), library: 'TypeORM query builder, .take()' };
  }
  // Kysely: before execute(), or at the end of a held chain.
  if (chain.includes('selectFrom') || builder === 'kysely') {
    if (method === 'execute') return { code: insertAt(expr.callee.object.end, `.limit(${limit})`), library: 'Kysely, .limit()' };
    if (builder !== 'kysely') return null;
    return { code: append(`.limit(${limit})`), library: 'Kysely, .limit()' };
  }
  // A knex chain the rule identified, including one continued from a variable.
  if (builder === 'knex') return { code: append(`.limit(${limit})`), library: 'knex, .limit()' };

  const recv = expr.callee.object;
  const recvName = receiverName(recv);
  const args: any[] = expr.arguments ?? [];

  switch (method) {
    case 'findMany': {
      // db.query.users.findMany(): Drizzle's relational API takes `limit`.
      const drizzle = memberPath(recv).includes('query');
      return withOption(code, expr, 0, drizzle ? 'limit' : 'take', limit, drizzle ? 'Drizzle, limit' : 'Prisma, take');
    }
    case 'findAll':
    case 'findAndCountAll':
      return withOption(code, expr, 0, 'limit', limit, 'Sequelize, limit');
    case 'find':
    case 'findAndCount': {
      // MikroORM: em.find(Entity, where, options)
      if (recvName && /^(em|entityManager|orm)$/i.test(recvName) && args.length >= 1 && isEntityRef(args[0])) {
        return withOption(code, expr, 2, 'limit', limit, 'MikroORM, limit', args.length < 2);
      }
      // TypeORM EntityManager: manager.find(Entity, options)
      if (args.length >= 1 && isEntityRef(args[0]) && recvName && /(manager|^trx|^tx|transaction)$/i.test(recvName)) {
        return withOption(code, expr, 1, 'take', limit, 'TypeORM, take');
      }
      // TypeORM repository: repo.find(options)
      const typeormOptions = args[0]?.type === 'ObjectExpression'
        && args[0].properties.some((p: any) => TYPEORM_OPTION_KEYS.has(keyOf(p) ?? ''));
      if ((recvName && /(repository|repo)$/i.test(recvName) && (args.length === 0 || typeormOptions)) || typeormOptions) {
        return withOption(code, expr, 0, 'take', limit, 'TypeORM, take');
      }
      if (method === 'findAndCount') return null;
      // Mongoose model or a native MongoDB collection: a cursor, limited by chaining.
      if (isMongoReceiver(recv)) return { code: append(`.limit(${limit})`), library: 'MongoDB, .limit()' };
      return null;
    }
    default:
      break;
  }

  // A knex chain: knex('t').where(...), this.database(T).select(...).
  if (isKnexChain(expr)) return { code: append(`.limit(${limit})`), library: 'knex, .limit()' };
  return null;
}

/** Add `key: limit` to the options object at argument `index`, creating it if absent. */
function withOption(code: string, call: any, index: number, key: string, limit: number, library: string, padWhere = false): LimitEdit | null {
  const args: any[] = call.arguments ?? [];
  const prop = `${key}: ${limit}`;
  const arg = args[index];

  if (!arg) {
    if (args.length < index) {
      // em.find(Entity) -> em.find(Entity, {}, { limit })
      if (!padWhere || args.length !== index - 1) return null;
      const last = args[args.length - 1];
      return { code: code.slice(0, last.end) + `, {}, { ${prop} }` + code.slice(last.end), library };
    }
    if (args.length === 0) {
      // findMany() -> findMany({ take: 100 }); the parentheses are the call's last two characters.
      const close = code.lastIndexOf(')', call.end - 1);
      if (close < call.callee.end) return null;
      return { code: code.slice(0, close) + `{ ${prop} }` + code.slice(close), library };
    }
    const last = args[args.length - 1];
    return { code: code.slice(0, last.end) + `, { ${prop} }` + code.slice(last.end), library };
  }

  if (arg.type === 'ObjectExpression') {
    if (arg.properties.length === 0) {
      return { code: code.slice(0, arg.start) + `{ ${prop} }` + code.slice(arg.end), library };
    }
    const lastProp = arg.properties[arg.properties.length - 1];
    const between = code.slice(lastProp.end, arg.end - 1);
    if (between.includes(',')) {
      // A trailing comma: add the option after it, on the same layout.
      const comma = lastProp.end + between.indexOf(',') + 1;
      const multiline = /\n/.test(code.slice(arg.start, arg.end));
      const indent = multiline ? (code.slice(0, lastProp.start).match(/\n([ \t]*)$/)?.[1] ?? '  ') : '';
      return { code: code.slice(0, comma) + (multiline ? `\n${indent}${prop},` : ` ${prop},`) + code.slice(comma), library };
    }
    return { code: code.slice(0, lastProp.end) + `, ${prop}` + code.slice(lastProp.end), library };
  }
  if (arg.type === 'SpreadElement' || arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression') return null;

  // findMany(args) -> findMany({ ...args, take: 100 })
  const inner = code.slice(arg.start, arg.end);
  return { code: code.slice(0, arg.start) + `{ ...${inner}, ${prop} }` + code.slice(arg.end), library };
}

function chainMethods(call: any): string[] {
  const out: string[] = [];
  let n = call;
  for (let i = 0; i < 40 && n; i++) {
    if (n.type === 'CallExpression') {
      if (n.callee?.type === 'MemberExpression' && n.callee.property?.type === 'Identifier') out.push(n.callee.property.name);
      n = n.callee?.type === 'MemberExpression' ? n.callee.object : null;
    } else if (n.type === 'MemberExpression') {
      n = n.object;
    } else break;
  }
  return out;
}

function memberPath(node: any): string[] {
  const out: string[] = [];
  let n = node;
  for (let i = 0; i < 12 && n; i++) {
    if (n.type === 'MemberExpression') {
      if (n.property?.type === 'Identifier') out.push(n.property.name);
      n = n.object;
    } else if (n.type === 'Identifier') { out.push(n.name); break; } else break;
  }
  return out;
}

function receiverName(node: any): string | null {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'MemberExpression' && node.property?.type === 'Identifier') return node.property.name;
  return null;
}

const keyOf = (p: any): string | null =>
  p?.key?.type === 'Identifier' ? p.key.name : p?.key?.type === 'StringLiteral' ? p.key.value : null;

/** `User`, `entities.User`, `'User'`: the entity argument of an EntityManager call. */
const isEntityRef = (n: any): boolean =>
  (n?.type === 'Identifier' && /^[A-Z]/.test(n.name))
  || (n?.type === 'MemberExpression' && n.property?.type === 'Identifier' && /^[A-Z]/.test(n.property.name))
  || n?.type === 'StringLiteral';

/** `Model.find`, `this.userModel.find`, `db.collection('x').find`, `collections.Orders.find`. */
function isMongoReceiver(recv: any): boolean {
  if (recv?.type === 'Identifier') return /^[A-Z]/.test(recv.name);
  if (recv?.type === 'MemberExpression' && recv.property?.type === 'Identifier') {
    return /^[A-Z]/.test(recv.property.name) || /Model$/.test(recv.property.name);
  }
  // db.collection('x').find(), getCollection(NAME).find()
  if (recv?.type === 'CallExpression') {
    const name = recv.callee?.type === 'MemberExpression' ? recv.callee.property?.name
      : recv.callee?.type === 'Identifier' ? recv.callee.name : null;
    return !!name && /collection$/i.test(name);
  }
  return false;
}

/** The chain is rooted at a knex handle called with a table, or starts at knex.select/from. */
function isKnexChain(call: any): boolean {
  let n = call;
  for (let i = 0; i < 40 && n; i++) {
    if (n.type !== 'CallExpression') return false;
    const c = n.callee;
    if (c?.type === 'Identifier' || (c?.type === 'MemberExpression' && c.object?.type === 'ThisExpression')
      || (c?.type === 'MemberExpression' && c.property?.name === 'knex')) {
      return (n.arguments?.length ?? 0) >= 1;
    }
    if (c?.type !== 'MemberExpression') return false;
    // knex.select(...), this.knex.from(...), trx.queryBuilder()
    if (['select', 'from', 'table', 'queryBuilder'].includes(c.property?.name)
      && (c.object?.type === 'Identifier' || (c.object?.type === 'MemberExpression' && c.object.object?.type === 'ThisExpression'))) return true;
    n = c.object;
  }
  return false;
}
