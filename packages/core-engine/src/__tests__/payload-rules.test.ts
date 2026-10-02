/**
 * Regression tests for the payload rules.
 *
 * The must-not-detect cases are the ones that matter: before the shared
 * db-call heuristics were applied, scanning this very package reported
 * `find() without field selection and a row limit` against an in-memory array
 * lookup in `engine.ts`, and `Returning unbounded database results` against a
 * function returning `Array.prototype.filter`.
 */

import * as parser from '@babel/parser';
import { payloadRules } from '../rules/payload-rules';
import type { DiagnosticIssue } from '../types';

function analyze(code: string, file = 'case.ts'): DiagnosticIssue[] {
  const ast = parser.parse(code, {
    sourceType: 'unambiguous',
    plugins: ['jsx', 'typescript', 'decorators-legacy'],
    errorRecovery: true,
  });
  return payloadRules[0].detect(file, code, ast);
}

const UNBOUNDED = `
  import { prisma } from "@prisma/client";
  async function all() {
    const rows = await prisma.event.findMany({ where: { live: true } });
    return rows.length;
  }
`;

describe('payload rules — must detect', () => {
  it('a Prisma findMany with neither select nor take', () => {
    const issues = analyze(`
      import { prisma } from "@prisma/client";
      async function listUsers() {
        const users = await prisma.user.findMany({ where: { active: true } });
        return users;
      }
    `);
    expect(issues.map(i => i.rule)).toContain('payload/unbounded-query');
  });

  it('a Sequelize findAll returned straight out of a function', () => {
    const issues = analyze(`
      import { Op } from "sequelize";
      async function listDocuments(teamId) {
        return User.findAll({ where: { teamId } });
      }
    `);
    expect(issues.map(i => i.rule)).toContain('payload/large-return');
  });

  it('an awaited findAll returned straight out of a function', () => {
    const issues = analyze(`
      import { Op } from "sequelize";
      async function listDocuments(teamId) {
        return await Document.findAll({ where: { teamId } });
      }
    `);
    expect(issues.map(i => i.rule)).toContain('payload/large-return');
  });
});

describe('payload rules — must not detect', () => {
  it('Array.prototype.find with a callback', () => {
    const issues = analyze(`
      function pick(rules, id) {
        return rules.find((rule) => rule.id === id);
      }
    `);
    expect(issues).toEqual([]);
  });

  it('Array.prototype.find on a local array', () => {
    const issues = analyze(`
      function resolve(id) {
        const registered = [];
        const match = registered.find((r) => r.id === id);
        return match;
      }
    `);
    expect(issues).toEqual([]);
  });

  it('a Map lookup named like a store', () => {
    const issues = analyze(`
      class Registry {
        private ruleStore = new Map();
        get(id) {
          return this.ruleStore.get(id);
        }
      }
    `);
    expect(issues).toEqual([]);
  });

  it('a findMany that already has select and take', () => {
    const issues = analyze(`
      import { prisma } from "@prisma/client";
      async function listUsers() {
        return prisma.user.findMany({ select: { id: true }, take: 50 });
      }
    `);
    expect(issues).toEqual([]);
  });

  it('a findMany with a row limit but no select', () => {
    // Missing field selection alone is out of scope: the number of rows is
    // what grows with data, not the number of columns.
    const issues = analyze(`
      import { prisma } from "@prisma/client";
      async function recent() {
        const rows = await prisma.event.findMany({ where: { live: true }, take: 20 });
        return rows;
      }
    `);
    expect(issues).toEqual([]);
  });

  it('a single-record finder is not a payload concern', () => {
    const issues = analyze(`
      import { prisma } from "@prisma/client";
      async function getUser(id) {
        return prisma.user.findUnique({ where: { id } });
      }
    `);
    expect(issues).toEqual([]);
  });

  it('Promise.all is not a query', () => {
    const issues = analyze(`
      async function run(items) {
        return Promise.all(items.map((i) => handle(i)));
      }
    `);
    expect(issues).toEqual([]);
  });
});

/**
 * Round 2 — from labelling 400 findings across the 283 repositories of the
 * Study 09 corpus (stories/03-large-payloads). Each case names where it came
 * from. The "still reported" cases matter as much as the vetoes: each is a
 * true positive that an earlier draft of a veto removed.
 */
describe('payload rules — round 2: code that never serves a request', () => {
  it.each([
    ['x-pack/platform/test/functional/page_objects/console_page.ts', 'kibana'],
    ['packages/client/tests/functional/json/tests.ts', 'prisma'],
    ['server/data-migrations/1639038616546-UpdateDefinitions.ts', 'tooljet'],
    ['packages/prisma/seed/documents.ts', 'documenso'],
    ['scripts/seed-utils.ts', 'cal.com'],
    ['sample/01-cats-app/src/cats/cats.service.ts', 'nest'],
    ['app/client/public/tinymce/tinymce.min.js', 'appsmith'],
    ['packages/lib/booking.integration-test.ts', 'cal.com'],
  ])('%s (%s)', (file) => {
    expect(analyze(UNBOUNDED, file)).toEqual([]);
  });

  it('skips a minified bundle whatever its path (hasura console assets)', () => {
    const bundle = UNBOUNDED + '/*' + 'x'.repeat(1200) + '*/';
    expect(analyze(bundle, 'frontend/src/assets/common/codegen/actions-codegen.js')).toEqual([]);
  });

  it('still reports the same query in served code', () => {
    expect(analyze(UNBOUNDED, 'apps/api/src/events.service.ts')).toHaveLength(1);
  });
});

describe('payload rules — round 2: filters bounded by the caller', () => {
  it.each([
    ['Prisma id IN (cal.com UserRepository)', `await prisma.user.findMany({ where: { id: { in: userIds } } });`],
    ['Mongo _id $in (novu)', `import mongoose from "mongoose"; await Snapshot.find({ _id: { $in: ids }, _environmentId: env });`],
    ['TypeORM In() (n8n)', `import { In } from "typeorm"; await this.dataTableRepository.find({ where: { id: In(dataTableIds) } });`],
    ['Sequelize id array (outline)', `import { Op } from "sequelize"; await User.findAll({ where: { id: [a, b] } });`],
    ['id equality (cal.com)', `await this.prismaClient.team.findMany({ where: { id: teamId } });`],
    ['slug equality (lightdash)', `await prisma.space.findMany({ where: { slug: 'agent-suggestions' } });`],
  ])('%s', (_name, line) => {
    expect(analyze(`async function f() { const r = ${line}; return r; }`)).toEqual([]);
  });

  it.each([
    ['logical OR is not an IN list (cal.com booking reminder cron)',
      `await prisma.booking.findMany({ where: { status: 'PENDING', OR: [{ a: 1 }, { b: 2 }] } });`],
    ['a constant $in selects a category, not a known set (novu bridge)',
      `await this.notificationTemplateRepository.find({ _environmentId: env, type: { $in: [Kind.ECHO, Kind.BRIDGE] } });`],
    ['Mongo array value is an exact match, not IN (growthbook MetricModel)',
      `await this.metricRepository.find({ organization: org, projects: [projectId] });`],
    ['a nested IN over parents selects all their children (cal.com members of teams)',
      `await prisma.user.findMany({ where: { teams: { some: { teamId: { in: teamIds } } } } });`],
  ])('still reported: %s', (_name, line) => {
    expect(analyze(`async function f() { const r = ${line}; return r; }`)).toHaveLength(1);
  });
});

describe('payload rules — round 2: limits outside the first argument', () => {
  it.each([
    ['limit in the options argument (growthbook ExperimentSnapshotModel)',
      `await Snapshot.find(query, null, { sort: { dateCreated: -1 }, limit: 1 }).exec();`],
    ['chained skip/limit (growthbook EventModel)',
      `await EventModel.find(query).sort([["dateCreated", -1]]).skip(s).limit(n);`],
    ['a count, not rows (growthbook OrganizationModel)',
      `await OrganizationModel.find(query).countDocuments();`],
    ['a streamed cursor (novu BaseRepository)',
      `for await (const doc of this._model.find(query, select).batchSize(500).cursor()) {}`],
  ])('%s', (_name, line) => {
    expect(analyze(`import mongoose from "mongoose"; async function f() { ${line} }`)).toEqual([]);
  });
});

describe('payload rules — round 2: finders that are not queries', () => {
  it.each([
    ['a selector lookup (kibana testSubjects)', `const rows = await testSubjects.findAll('relationshipsTableRow');`],
    ['an application service (tooljet, nest)', `const plugins = await this.pluginsService.findAll();`],
    ['an AST walker with a predicate (kibana ES|QL)', `const cols = Walker.findAll(commands, (node) => node.type === 'column');`],
    ['a React Query cache (supabase studio)', `const keys = queryClient.getQueryCache().findAll({ queryKey: ['projects'] });`],
  ])('%s', (_name, line) => {
    expect(analyze(`async function f() { ${line} return 1; }`)).toEqual([]);
  });
});

describe('payload rules — round 2: one finding per call', () => {
  it('reports return await x.findMany() once, as large-return (cal.com)', () => {
    const issues = analyze(`
      import { prisma } from "@prisma/client";
      async function hosts(eventTypeId) {
        return await prisma.host.findMany({ where: { eventTypeId } });
      }
    `);
    expect(issues.map(i => i.rule)).toEqual(['payload/large-return']);
  });
});

/**
 * Stage 2, item 1: payload/api-response. The first four "must detect" shapes
 * are the ones the backend's large_api_payload never reported (tested
 * 2026-09-24): an await between the query and its variable broke its
 * identity check.
 */
describe('payload/api-response — must detect', () => {
  const PRISMA = `import { PrismaClient } from "@prisma/client"; const prisma = new PrismaClient();`;
  const rules = (code: string) => analyze(PRISMA + code).map(i => i.rule);

  it.each([
    ['awaited variable into res.json', `app.get('/u', async (req, res) => { const users = await prisma.user.findMany(); res.json(users); });`],
    ['await inside res.json', `app.get('/u', async (req, res) => { res.json(await prisma.user.findMany()); });`],
    ['res.status(200).json', `app.get('/u', async (req, res) => { const users = await prisma.user.findMany(); res.status(200).json(users); });`],
    ['wrapped in an envelope object', `app.get('/u', async (req, res) => { const users = await prisma.user.findMany(); res.json({ data: users, ok: true }); });`],
    ['shorthand property', `app.get('/u', async (req, res) => { const users = await prisma.user.findMany(); res.json({ users }); });`],
    ['mapped before sending', `app.get('/u', async (req, res) => { const users = await prisma.user.findMany(); res.json(users.map(u => u.email)); });`],
    ['Fastify reply.send', `fastify.get('/u', async (req, reply) => { const rows = await prisma.user.findMany(); return reply.send(rows); });`],
    ['Koa ctx.body', `router.get('/u', async (ctx) => { ctx.body = await prisma.user.findMany(); });`],
    ['NextResponse.json', `export async function GET() { const users = await prisma.user.findMany(); return NextResponse.json(users); }`],
    ['Hono c.json', `app.get('/u', async (c) => { const users = await prisma.user.findMany(); return c.json(users); });`],
    ['a tRPC procedure', `export const r = router({ list: publicProcedure.query(async ({ ctx }) => { return ctx.prisma.user.findMany(); }) });`],
    ['a tRPC procedure, expression body', `export const r = router({ list: publicProcedure.query(({ ctx }) => ctx.prisma.user.findMany()) });`],
  ])('%s', (_name, code) => {
    expect(rules(code)).toContain('payload/api-response');
  });

  it('a Nest controller route returning a repository query', () => {
    const issues = analyze(`
      import { Repository } from "typeorm";
      @Controller('cats')
      export class CatsController {
        constructor(private readonly catsRepository: Repository<Cat>) {}
        @Get()
        async findAll() {
          return this.catsRepository.find();
        }
      }
    `);
    expect(issues.map(i => i.rule)).toEqual(['payload/api-response']);
  });

  it('is reported once, not also as unbounded-query or large-return', () => {
    expect(rules(`app.get('/u', async (req, res) => { const users = await prisma.user.findMany(); res.json(users); });`))
      .toEqual(['payload/api-response']);
  });
});

describe('payload/api-response — must not detect', () => {
  const PRISMA = `import { PrismaClient } from "@prisma/client"; const prisma = new PrismaClient();`;
  const rules = (code: string) => analyze(PRISMA + code).map(i => i.rule);

  it.each([
    ['a paginated query', `app.get('/u', async (req, res) => { const users = await prisma.user.findMany({ take: 20, skip: req.query.skip }); res.json(users); });`],
    ['the Promise.all page-and-count pattern', `app.get('/u', async (req, res) => { const [items, total] = await Promise.all([prisma.user.findMany({ take: 20 }), prisma.user.count()]); res.json({ items, total }); });`],
    ['a single-row lookup', `app.get('/u/:id', async (req, res) => { res.json(await prisma.user.findUnique({ where: { id: req.params.id } })); });`],
    ['only a count reaches the response', `app.get('/n', async (req, res) => { const users = await prisma.user.findMany(); res.json({ count: users.length }); });`],
    ['an in-memory Array.find', `app.get('/c', (req, res) => { res.json(config.items.find((i) => i.id === req.params.id)); });`],
    ['a mongoose query bounded by a chained limit', `import mongoose from "mongoose"; app.get('/e', async (req, res) => { res.json(await Event.find({}).sort({ at: -1 }).limit(50).lean()); });`],
  ])('%s', (_name, code) => {
    expect(rules(code)).not.toContain('payload/api-response');
  });

  it('still reports an unbounded query that never reaches a response', () => {
    const r = rules(`async function job() { const users = await prisma.user.findMany(); for (const u of users) await notify(u); }`);
    expect(r).toEqual(['payload/unbounded-query']);
  });
});

/**
 * Stage 2, item 2: query builders. Stage 1's biggest false-negative class —
 * directus, nocodb and lightdash write queries with knex and reported nothing.
 */
describe('query builders — must detect', () => {
  const rules = (code: string) => analyze(code).map(i => i.rule);

  it.each([
    ['knex table call, awaited (directus)', `async function all() { const rows = await knex('directus_users').select('*').where('status', 'active'); return rows.length; }`],
    ['this.database, awaited (lightdash)', `class M { async find(projectUuid) { const rows = await this.database('spaces').where('project_id', projectUuid); use(rows); } }`],
    ['knex.select().from()', `async function f() { const r = await knex.select('id', 'name').from('users'); use(r); }`],
    ['a builder in a variable, filtered later, awaited', `async function f(status) { const q = knex('events').select('*'); if (status) q.where('status', status); const rows = await q; use(rows); }`],
    ['.then() on the chain', `function f() { knex('users').where('active', true).then(rows => use(rows)); }`],
    ['TypeORM createQueryBuilder().getMany()', `async function f() { const rows = await this.repo.createQueryBuilder('u').where('u.active = true').getMany(); use(rows); }`],
    ['Kysely selectFrom().execute()', `async function f() { const rows = await db.selectFrom('person').selectAll().execute(); use(rows); }`],
  ])('%s', (_name, code) => {
    expect(rules(code)).toContain('payload/unbounded-query');
  });

  it('a returned builder is large-return', () => {
    expect(rules(`async function list(projectId) { return knex('charts').where('project_id', projectId); }`)).toEqual(['payload/large-return']);
  });

  it('a non-async function declared to return a Promise executes it', () => {
    expect(rules(`function list(projectId): Promise<Chart[]> { return knex('charts').where('project_id', projectId); }`))
      .toEqual(['payload/large-return']);
  });

  it('a builder whose rows reach a response is api-response', () => {
    expect(rules(`app.get('/u', async (req, res) => { const users = await knex('users').select('*'); res.json(users); });`))
      .toEqual(['payload/api-response']);
  });

  it("a where on a joined table's key does not bound it (lightdash)", () => {
    const code = "class M { async f(s) { const q = this.database(DashboardsTableName).select('dashboard_uuid').innerJoin(SpaceTableName, 'a', 'b').where(`${SpaceTableName}.space_uuid`, s); const r = await q; use(r); } }";
    expect(rules(code)).toContain('payload/unbounded-query');
  });

  it("a TypeORM where on a joined alias's id does not bound it (nightwatch)", () => {
    const code = `class S { async findFriends(id) { return this.repo.createQueryBuilder('friend').leftJoinAndSelect('friend.user', 'user').where('user.id = :id', { id }).getMany(); } }`;
    expect(rules(code)).toEqual(['payload/large-return']);
  });

  it('a where on a foreign key does not bound it', () => {
    expect(rules(`async function f(ids) { const r = await knex('charts').whereIn('space_id', ids); use(r); }`)).toContain('payload/unbounded-query');
  });
});

describe('query builders — must not detect', () => {
  const rules = (code: string) => analyze(code).map(i => i.rule);

  it.each([
    ['a limit on the chain', `async function f() { const r = await knex('users').select('*').limit(50); use(r); }`],
    ['.first()', `async function f(id) { const r = await knex('users').where('email', id).first(); use(r); }`],
    ['a count', `async function f() { const [{ n }] = await knex('users').count('* as n'); use(n); }`],
    ['a limit added to the variable later', `async function f(page) { const q = knex('events'); if (page) q.limit(20).offset(page * 20); const rows = await q; use(rows); }`],
    ['a reassigned chain that ends with a limit', `async function f() { let q = knex('events'); q = q.where('a', 1); q = q.limit(10); return await q; }`],
    ['a builder handed to code that may paginate it', `async function f(query) { const q = knex('events'); applyQuery(q, query); const rows = await q; use(rows); }`],
    ["a where on the table's own key", `async function f(ids) { const r = await knex('spaces').whereIn('spaces.space_uuid', ids); use(r); }`],
    ['a where on id', `async function f(id) { const r = await this.database('users').where({ id }); use(r); }`],
    ['a write', `async function f(rows) { await knex('events').insert(rows); }`],
    ['an update', `async function f() { await knex('users').where('active', false).update({ archived: true }); }`],
    ['a subquery that is only built', `async function f() { const r = await knex('a').whereIn('b_id', knex('b').select('id')).limit(10); use(r); }`],
    ['a TypeORM chain ending in getOne', `async function f() { const u = await this.repo.createQueryBuilder('u').where('u.id = :id', { id: 1 }).getOne(); use(u); }`],
    ['a TypeORM chain with take', `async function f() { const r = await this.repo.createQueryBuilder('u').take(20).getMany(); use(r); }`],
    ['a Kysely chain with executeTakeFirst', `async function f() { const r = await db.selectFrom('person').selectAll().executeTakeFirst(); use(r); }`],
    // Round 1 of the builder sample (B001-B399), one case per false-positive class.
    ['a MongoDB database handle on another receiver (n8n)', `async function f(client, i) { const mdb = client.db(name); await mdb.collection(c).updateOne(filter, { $set: i }); }`],
    ['a lookup named database on another receiver (metabase)', `function getDatabase(metadata, id) { const database = metadata.database(id); return database; }`],
    ['Spanner instance.database() (tooljet)', `class P { getDatabase(instance, id) { const database = instance.database(id); return database; } }`],
    ['rows awaited into a variable, then mapped (lightdash)', `class M { async f(id) { const rows = await this.database('tags').where('project_uuid', id).limit(10); return rows.map(r => r.uuid); } }`],
    ['knex.select(raw) with no from()', `async function ping() { await knex.select(knex.raw('1')); }`],
    ['a non-async builder factory (lightdash ContentConfiguration)', `const cfg = { getQuery: (knex, filters): Knex.QueryBuilder => knex.from('dashboards').where('x', filters.x) };`],
    ['a private builder factory method (lightdash)', `class M { private getSummaryQuery() { return this.database('saved_queries').leftJoin('spaces', 'a', 'b'); } }`],
    ['a chain that ends in toSQL (strapi)', `const sel = (t) => db.connection(t).select('id').where('x', 'in', ids).toSQL();`],
    ['const [row] = await ... (lightdash)', `class M { async get(uuid) { const [org] = await this.database(OrganizationTableName).where('organization_uuid', uuid).select('*'); return org; } }`],
    ['a table constant and its own key (lightdash)', `class M { async f(uuids) { const r = await this.database(SavedChartsTableName).whereIn('saved_chart_uuid', uuids); use(r); } }`],
    ['a template column on its own key', "class M { async f(uuids) { const r = await this.database(SpaceTableName).whereIn(`${SpaceTableName}.space_uuid`, uuids); use(r); } }"],
    ['a TypeORM IN over ids (tooljet)', `async function f(m, ids) { const r = await m.createQueryBuilder(DataQuery, 'q').where('q.id IN(:...ids)', { ids }).getMany(); use(r); }`],
    ['an ARRAY_AGG select (lightdash)', `class M { async f(q) { const r = await this.database('group_memberships').where('g', q).select(this.database.raw('ARRAY_AGG(user_uuid) as ids')); use(r); } }`],
    ['a TypeORM COUNT grouped by role (n8n)', `class R { async c() { const rows = await this.createQueryBuilder().select(['role', 'COUNT(role) as count']).groupBy('role').execute(); return rows; } }`],
    ['a schema catalog (directus)', `async function tables(knex) { const r = await knex.select('TABLE_NAME').from('INFORMATION_SCHEMA.TABLES').where('TABLE_SCHEMA', db); return r; }`],
    ['sqlite_master (directus)', `async function tables(knex) { const r = await knex.select('name').from('sqlite_master').whereRaw("type = 'table'"); return r; }`],
    ['a drizzle count() select (payload)', `async function c(db, t, where) { const r = await db.select({ count: count() }).from(t).where(where); return Number(r[0].count); }`],
    ['a Kysely count inside a select callback', `async function c(db) { const r = await db.selectFrom('person').select((eb) => eb.fn.countAll().as('n')).execute(); use(r); }`],
  ])('%s', (_name, code) => {
    expect(rules(code)).toEqual([]);
  });
});

describe('query builders — one finding per query', () => {
  it('reports a .then() chain once, awaited or not', () => {
    const code = `class S { async f(p, ids) { const v = await this.database('validations').where('project_uuid', p).whereIn('chart', ids).select('id').then((rows) => rows.reduce((a, r) => a, {})); return v; } }`;
    expect(analyze(code).map(i => i.rule)).toEqual(['payload/unbounded-query']);
  });

  it('reports rows awaited into a variable at the query, not again at the return', () => {
    const code = `class M { async f(id) { const rows = await this.database('comments').where('doc_id', id); return rows.map(r => r.text); } }`;
    const issues = analyze(code);
    expect(issues).toHaveLength(1);
    expect(issues[0].line).toBe(1);
  });

  it('skips type tests and knex_migrations, migration-scripts and migration-jobs directories', () => {
    const code = `async function up(knex) { const rows = await knex('monitor').where('type', 'x').select('id'); use(rows); }`;
    for (const f of ['test/types/select.test-d.ts', 'db/knex_migrations/2025-06-13.js', 'src/migration-scripts/fix.ts', 'src/modules/jobs/migration-jobs/nc_job_003.ts']) {
      expect(analyze(code, f)).toEqual([]);
    }
    expect(analyze(code, 'src/services/monitor.ts').map(i => i.rule)).toEqual(['payload/unbounded-query']);
  });
});

