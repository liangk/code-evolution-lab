/**
 * Tests for the payload solution generator.
 *
 * The standard, as for missing indexes: paste the suggestion over the query
 * and scan again; the finding is gone. Every shape below is checked that way
 * against the rule itself, not against an expected string alone.
 */
import * as parser from '@babel/parser';
import { payloadRules } from '../rules/payload-rules';
import { PayloadSolutionGenerator, addRowLimit } from '../solutions/payload-generator';
import { generateSolutionsFor, hasSolutionGenerator } from '../solutions';
import type { DiagnosticIssue } from '../types';

const ROW_RULES = ['payload/unbounded-query', 'payload/large-return', 'payload/api-response', 'payload/unbounded-graphql'];

function scan(code: string, file = 'src/repo.ts'): DiagnosticIssue[] {
  const ast = parser.parse(code, { sourceType: 'unambiguous', plugins: ['typescript', 'jsx', 'decorators-legacy'], errorRecovery: true });
  return payloadRules[0].detect(file, code, ast).filter(i => ROW_RULES.includes(i.rule));
}

async function fixOnce(code: string) {
  const [issue] = scan(code);
  expect(issue).toBeDefined();
  expect(issue.codeBefore).toBeTruthy();
  expect(code).toContain(issue.codeBefore!);
  const [solution] = await new PayloadSolutionGenerator().generateSolutions(issue, {});
  expect(solution).toBeDefined();
  const fixed = code.replace(issue.codeBefore!, solution.code);
  return { issue, solution, fixed, after: scan(fixed) };
}

const PRISMA = `import { PrismaClient } from "@prisma/client"; const prisma = new PrismaClient();\n`;

describe('every suggestion removes its own finding', () => {
  it.each([
    ['Prisma, no arguments', PRISMA + `export async function all() { const u = await prisma.user.findMany(); use(u); }`, 'prisma.user.findMany({ take: 100 })'],
    ['Prisma, with where', PRISMA + `export async function f() { const u = await prisma.user.findMany({ where: { active: true } }); use(u); }`, 'prisma.user.findMany({ where: { active: true }, take: 100 })'],
    ['Prisma, options in a variable', PRISMA + `export async function f(args) { const u = await prisma.user.findMany(args); use(u); }`, 'prisma.user.findMany({ ...args, take: 100 })'],
    ['Prisma, returned', PRISMA + `export async function f() { return prisma.post.findMany({ orderBy: { createdAt: 'desc' } }); }`, `prisma.post.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })`],
    ['Sequelize findAll', `import { Model } from 'sequelize';\nexport async function f() { const r = await Order.findAll({ where: { status: 'open' } }); use(r); }`, `Order.findAll({ where: { status: 'open' }, limit: 100 })`],
    ['TypeORM repository find', `export class S { async f() { const r = await this.userRepository.find({ where: { active: true } }); use(r); } }`, 'this.userRepository.find({ where: { active: true }, take: 100 })'],
    ['TypeORM repository find, no arguments', `export class S { async f() { return this.userRepository.find(); } }`, 'this.userRepository.find({ take: 100 })'],
    ['Mongoose find', `import mongoose from 'mongoose';\nexport async function f() { const r = await Event.find({ type: 'click' }); use(r); }`, `Event.find({ type: 'click' }).limit(100)`],
    ['knex', `export class M { async f(id) { const r = await this.database('comments').where('doc_id', id); use(r); } }`, `this.database('comments').where('doc_id', id).limit(100)`],
    ['TypeORM query builder', `export class R { async f(id) { return this.repo.createQueryBuilder('t').where('t.projectId = :id', { id }).getMany(); } }`, `this.repo.createQueryBuilder('t').where('t.projectId = :id', { id }).take(100).getMany()`],
    ['TypeORM raw query builder', `export class R { async f() { const r = await this.repo.createQueryBuilder('t').select('t.name').getRawMany(); use(r); } }`, `this.repo.createQueryBuilder('t').select('t.name').limit(100).getRawMany()`],
    ['Kysely', `export async function f(db) { const r = await db.selectFrom('person').selectAll().execute(); use(r); }`, `db.selectFrom('person').selectAll().limit(100).execute()`],
    // Corpus round: shapes the first version returned nothing for.
    ['Prisma on a private field (trigger.dev)', PRISMA + `export class P { #prismaClient = prisma; async f(id) { return this.#prismaClient.organization.findMany({ where: { members: { some: { userId: id } } } }); } }`, `this.#prismaClient.organization.findMany({ where: { members: { some: { userId: id } } }, take: 100 })`],
    ['knex.select().from() on this.knex (directus)', `export class S { async f() { const r = await this.knex.select('collection').from('directus_collections'); use(r); } }`, `this.knex.select('collection').from('directus_collections').limit(100)`],
    ['a knex chain continued from a variable (lightdash)', `export class M { async f(id) { const logsQuery = this.database('logs').where('job_id', id); const r = await logsQuery.orderBy('created_at', 'desc'); use(r); } }`, `logsQuery.orderBy('created_at', 'desc').limit(100)`],
    ['a TypeORM builder run from a variable (n8n)', `export class R { async f() { const qb = this.repo.createQueryBuilder('w').select('w.id'); const r = await qb.getRawMany(); use(r); } }`, `qb.limit(100).getRawMany()`],
    ['TypeORM transaction manager (n8n)', `export class R { async f(trx, where) { const r = await trx.find(SharedCredentials, { where }); use(r); } }`, `trx.find(SharedCredentials, { where, take: 100 })`],
  ])('%s', async (_name, code, expected) => {
    const { solution, after } = await fixOnce(code);
    expect(solution.code).toBe(expected);
    expect(after).toEqual([]);
  });

  it('an endpoint: api-response, with pagination advice', async () => {
    const code = PRISMA + `app.get('/u', async (req, res) => { const users = await prisma.user.findMany(); res.json(users); });`;
    const { issue, solution, after } = await fixOnce(code);
    expect(issue.rule).toBe('payload/api-response');
    expect(solution.explanation).toMatch(/cursor or offset from the request/);
    expect(after).toEqual([]);
  });

  it('a GraphQL resolver: pagination arguments', async () => {
    const code = PRISMA + `export const resolvers = { Query: { users: () => prisma.user.findMany() } };`;
    const { issue, solution, after } = await fixOnce(code);
    expect(issue.rule).toBe('payload/unbounded-graphql');
    expect(solution.explanation).toMatch(/first\/after/);
    expect(after).toEqual([]);
  });

  it('keeps a multi-line options object in its own layout', () => {
    const before = `prisma.user.findMany({\n    where: { active: true },\n    orderBy: { name: 'asc' },\n  })`;
    expect(addRowLimit(before, 100)!.code).toBe(`prisma.user.findMany({\n    where: { active: true },\n    orderBy: { name: 'asc' },\n    take: 100,\n  })`);
  });

  it('says a fixed limit is a cap, not pagination', async () => {
    const { solution } = await fixOnce(PRISMA + `export async function f() { const u = await prisma.user.findMany(); use(u); }`);
    expect(solution.explanation).toMatch(/This is a cap, not pagination/);
    expect(solution.riskLevel).toBe('medium');
  });
});

describe('the library decides the option name', () => {
  it.each([
    ['Drizzle relational query', `db.query.users.findMany({ where: eq(users.active, true) })`, `db.query.users.findMany({ where: eq(users.active, true), limit: 100 })`],
    ['MikroORM em.find with where', `em.find(Book, { author })`, `em.find(Book, { author }, { limit: 100 })`],
    ['MikroORM em.find with options', `em.find(Book, {}, { orderBy: { title: 1 } })`, `em.find(Book, {}, { orderBy: { title: 1 }, limit: 100 })`],
    ['TypeORM manager.find', `manager.find(User, { where: { active: true } })`, `manager.find(User, { where: { active: true }, take: 100 })`],
    ['native MongoDB collection', `db.collection('events').find({ type })`, `db.collection('events').find({ type }).limit(100)`],
    ['a MongoDB collection getter (growthbook)', `getCollection(COLLECTION).find({ organization: org })`, `getCollection(COLLECTION).find({ organization: org }).limit(100)`],
  ])('%s', (_name, before, expected) => {
    expect(addRowLimit(before, 100)!.code).toBe(expected);
  });
});

describe('returns nothing rather than a guess', () => {
  it.each([
    ['a find on an unknown receiver', `service.find({ status: 'x' })`],
    ['a findBy (TypeORM where-only signature)', `this.repo.findBy({ projectId })`],
    ['a TypeORM builder not ended by a list terminal', `this.repo.createQueryBuilder('t').where('x')`],
    ['not a call', `users`],
    ['unparseable text', `prisma.user.findMany({`],
  ])('%s', (_name, before) => {
    expect(addRowLimit(before, 100)).toBeNull();
  });

  it('for deep-include and select-star findings', async () => {
    for (const rule of ['payload/deep-include', 'payload/select-star']) {
      const issue = { id: 'x', rule, category: 'payload', severity: 'medium', file: 'a.ts', line: 1, title: '', description: '', recommendation: '', confidence: 1, codeBefore: 'prisma.user.findMany()' } as DiagnosticIssue;
      expect(await new PayloadSolutionGenerator().generateSolutions(issue, {})).toEqual([]);
    }
  });

  it('when the finding has no codeBefore', async () => {
    const [issue] = scan(PRISMA + `export async function f() { const u = await prisma.user.findMany(); use(u); }`);
    expect(await new PayloadSolutionGenerator().generateSolutions({ ...issue, codeBefore: undefined }, {})).toEqual([]);
  });
});

describe('generateSolutionsFor', () => {
  it('routes payload findings to this generator', async () => {
    expect(hasSolutionGenerator('payload')).toBe(true);
    const [issue] = scan(PRISMA + `export async function f() { const u = await prisma.user.findMany(); use(u); }`);
    const solutions = await generateSolutionsFor(issue);
    expect(solutions).toHaveLength(1);
    expect(solutions[0].type).toBe('payload-row-limit');
  });
});
