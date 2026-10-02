/**
 * payload/select-star: a SELECT * string only counts when it reaches the
 * database. Study 09's `select_star` matched the regex in any string.
 */
import * as parser from '@babel/parser';
import { payloadRules } from '../rules/payload-rules';

const rule = payloadRules.find(r => r.id === 'payload/select-star')!;

function lines(code: string, file = 'src/repo.ts'): number[] {
  const ast = parser.parse(code, { sourceType: 'unambiguous', plugins: ['typescript', 'decorators-legacy'], errorRecovery: true });
  return rule.detect(file, code, ast).map(i => i.line);
}

describe('select-star — must detect', () => {
  it.each([
    ['pg pool.query', `const r = await pool.query('SELECT * FROM users WHERE org_id = $1', [id]);`],
    ['a qualified star', `const r = await db.query('SELECT u.* FROM users u JOIN teams t ON t.id = u.team_id');`],
    ['knex.raw', `const r = await knex.raw('select * from events where id = ?', [id]);`],
    ['Prisma $queryRawUnsafe', `const r = await prisma.$queryRawUnsafe(\`SELECT * FROM "Session" WHERE "userId" = \${id}\`);`],
    ['a sql tagged template', 'const r = await sql`SELECT * FROM users WHERE id = ${id}`;'],
    ['Prisma.sql', 'const r = await prisma.$queryRaw(Prisma.sql`SELECT * FROM users`);'],
    ['a string in a const, run in the same function', `async function f(id) { const q = 'SELECT * FROM orders WHERE user_id = ?'; return conn.execute(q, [id]); }`],
    ['a concatenated table name', `async function f(t) { return db.all('SELECT * FROM ' + t); }`],
    ['sqlite prepare', `const rows = db.prepare('SELECT * FROM notes').all();`],
    ['a module-level const', `const Q = 'SELECT * FROM jobs WHERE state = $1';\nexport async function next() { return pool.query(Q, ['ready']); }`],
  ])('%s', (_name, code) => {
    expect(lines(code)).toHaveLength(1);
  });
});

describe('select-star — must not detect', () => {
  it.each([
    ['a log line', `logger.info('running SELECT * FROM users');`],
    ['a SQL editor placeholder', `const DEFAULT_QUERY = 'SELECT * FROM table_name LIMIT 10'; editor.setValue(DEFAULT_QUERY);`],
    ['an assertion on generated SQL', `expect(toSql(q)).toBe('select * from users');`],
    ['EXISTS', `await pool.query('SELECT id FROM a WHERE EXISTS (SELECT * FROM b WHERE b.a_id = a.id)');`],
    ['IN (subquery)', `await pool.query('DELETE FROM a WHERE id IN (SELECT * FROM stale)');`],
    ['INSERT ... SELECT *', `await pool.query('INSERT INTO archive SELECT * FROM events WHERE ts < $1', [t]);`],
    ['CREATE TABLE AS', `await pool.query('CREATE TABLE copy AS SELECT * FROM events');`],
    ['COUNT(*)', `await pool.query('SELECT COUNT(*) FROM events');`],
    ['a column list', `await pool.query('SELECT id, name FROM users');`],
    ['a const used elsewhere in another function', `function a() { const q = 'SELECT * FROM x'; show(q); }\nasync function b(q) { return pool.query(q); }`],
    ['.get with the SQL as a later argument', `cache.get('k', 'SELECT * FROM users');`],
    // Round 1: the columns belong to a function or a subquery, not a table.
    ['FROM unnest() in an UPDATE (outline)', "await sequelize.query(`WITH l AS (SELECT id FROM d) UPDATE d SET s = x.s FROM (SELECT * FROM unnest(ARRAY[:ids]::uuid[], ARRAY[:s]::float[]) AS x(id, s)) AS x WHERE d.id = x.id`);"],
    ['FROM a set-returning function (trigger.dev)', "await tx.$queryRawUnsafe(`SELECT * FROM ${schema}.add_job(identifier => $1::text)`);"],
    ['FROM pg_create_logical_replication_slot', "await client.query(`SELECT * FROM pg_create_logical_replication_slot('s', 'pgoutput')`);"],
    ['FROM (subquery)', `await knex.raw('select * from (select id, name from users) as u');`],
  ])('%s', (_name, code) => {
    expect(lines(code)).toEqual([]);
  });

  it('skips tests, migrations and scripts', () => {
    const code = `await pool.query('SELECT * FROM users');`;
    for (const f of [
      'test/db.ts', 'migrations/001.js', 'scripts/dump.ts',
      // Round 1: hyphenated test and sample directories, and named cases.
      'dev-packages/e2e-tests/test-applications/nuxt-3/server/api/db-test.ts',
      'packages/cubejs-testing-shared/src/query-test.abstract.ts',
      'packages/@n8n/backend-test-utils/src/migration-test-helpers.ts',
      'sdk/cosmosdb/cosmos/samples-dev/Diagnostics.ts',
      'nodejs/src/worker/ingestion/persons/repositories/test-helpers.ts',
      '.scripts/compare-database.js',
      'packages/schemas/alterations/1.0.0-sign-up.ts',
      'references/d3-chat/src/trigger/chat.ts',
    ]) expect(lines(code, f)).toEqual([]);
  });

  it('still reports served directories whose names only contain "test"', () => {
    const code = `await pool.query('SELECT * FROM users');`;
    for (const f of [
      'src/latest/users.ts', 'src/contest-results/users.ts', 'src/services/testimonials/repo.ts',
      // A file named like a test directory is still served (n8n's evaluation controller).
      'packages/cli/src/evaluation.ee/test-runs.controller.ee.ts',
      'apps/api/src/app/workflows-v2/usecases/build-test-data/build-workflow-test-data.usecase.ts',
    ]) expect(lines(code, f)).toHaveLength(1);
  });
});
