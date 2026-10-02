/**
 * payload/deep-include counts relations, not object nesting. Study 09's
 * `deep_nested_include` fired on any call whose first argument nested three
 * objects deep; the must-not cases below are the shapes that made most of its
 * 16,428 findings.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import * as parser from '@babel/parser';
import { analyzeDirectory, RuleRegistry } from '../engine';
import { payloadRules, relationExpressionDepth } from '../rules/payload-rules';

const rule = payloadRules.find(r => r.id === 'payload/deep-include')!;

function titles(code: string, file = 'src/service.ts'): string[] {
  const ast = parser.parse(code, { sourceType: 'unambiguous', plugins: ['typescript', 'decorators-legacy'], errorRecovery: true });
  return rule.detect(file, code, ast).map(i => i.title);
}

describe('deep-include — must detect', () => {
  it.each([
    ['Prisma include, three relations',
      `const p = await prisma.project.findUnique({ where: { id }, include: { members: { include: { user: { include: { sessions: true } } } } } });`,
      'findUnique() loads relations 3 levels deep'],
    ['Prisma select with nested relation selects',
      `const p = await prisma.org.findMany({ select: { id: true, teams: { select: { members: { select: { posts: { where: { live: true } } } } } } } });`,
      'findMany() loads relations 3 levels deep'],
    ['Drizzle with',
      `const u = await db.query.users.findMany({ with: { posts: { with: { comments: { with: { author: true } } } } } });`,
      'findMany() loads relations 3 levels deep'],
    ['Sequelize nested include',
      `const o = await Order.findAll({ include: [{ model: Customer, include: [{ model: Address, include: [Country] }] }] });`,
      'findAll() loads relations 3 levels deep'],
    ['Sequelize all + nested',
      `const o = await Order.findAll({ include: { all: true, nested: true } });`,
      'findAll() loads every association, nested'],
    ['TypeORM dotted relations',
      `const u = await this.repo.find({ where: { active: true }, relations: ['team', 'team.projects', 'team.projects.tasks'] });`,
      'find() loads relations 3 levels deep'],
    ['TypeORM nested relations object',
      `const u = await this.repo.findOne({ where: { id }, relations: { team: { projects: { tasks: true } } } });`,
      'findOne() loads relations 3 levels deep'],
    ['MikroORM populate in the third argument',
      `const b = await em.find(Book, {}, { populate: ['author.friends.books'] });`,
      'find() loads relations 3 levels deep'],
    ['Mongoose nested populate',
      `const t = await Thread.find({}).populate({ path: 'posts', populate: { path: 'comments', populate: { path: 'author' } } });`,
      'populate() loads relations 3 levels deep'],
    ['Objection relation expression',
      `const p = await Person.query().withGraphFetched('[pets, children.[pets, movies.actors]]');`,
      'withGraphFetched() loads relations 3 levels deep'],
  ])('%s', (_name, code, title) => {
    expect(titles(code)).toEqual([title]);
  });
});

describe('deep-include — must not detect', () => {
  it.each([
    ['a where nested three objects (Study 09)', `const r = await prisma.event.findMany({ where: { meta: { path: { equals: 'x' } } }, include: { user: true } });`],
    ['two relations deep', `const p = await prisma.project.findMany({ include: { members: { include: { user: true } } } });`],
    ['a scalar select', `const u = await prisma.user.findMany({ select: { id: true, profile: { select: { name: true } } } });`],
    ['_count', `const u = await prisma.user.findMany({ include: { _count: { select: { posts: { where: { live: true } } } } } });`],
    ['orderBy on a relation', `const u = await prisma.post.findMany({ orderBy: { author: { profile: { name: 'asc' } } } });`],
    ['a false include', `const u = await prisma.user.findMany({ include: { posts: { include: { comments: { include: { author: false } } } } } });`],
    ['a route definition', `router.find({ path: '/a', options: { auth: { strategy: 'jwt' } } });`],
    ['expect().to.include', `expect(result).to.include({ a: { b: { c: 1 } } });`],
    ['Array.prototype.find', `const x = items.find(i => i.a.b.c);`],
    ['two dotted segments', `const u = await this.repo.find({ relations: ['team.projects'] });`],
    ['Mongoose populate two deep', `await Thread.find().populate({ path: 'posts', populate: { path: 'author' } });`],
    // Round 1: Strapi's populate object mixes relations with their options.
    ['Strapi populate options (strapi admin user service)', `const [u] = await strapi.db.query('admin::user').findMany({ populate: { roles: { where: { code: { $eq: 'x' } } } }, limit: 1 });`],
    ['Strapi populate fields and filters', `const r = await releaseService.findMany({ populate: { actions: { fields: ['type'], filters: { contentType } } } });`],
    ['Strapi nested populate key', `const e = await strapi.documents(uid).findOne({ documentId: id, populate: { stage: { populate: { workflow: true } } } });`],
  ])('%s', (_name, code) => {
    expect(titles(code)).toEqual([]);
  });

  it('skips migrations, seeds and tests', () => {
    const code = `await prisma.a.findMany({ include: { b: { include: { c: { include: { d: true } } } } } });`;
    expect(titles(code, 'prisma/seed.ts')).toEqual([]);
    expect(titles(code, 'test/a.ts')).toEqual([]);
  });
});

describe('relationExpressionDepth', () => {
  it.each([
    ['pets', 1], ['owner.pets', 2], ['[pets, children]', 1], ['[pets, children.[pets, movies.actors]]', 3],
    ['children.^', 2], ['a.b.c.d', 4], ['', 0],
  ])('%s -> %d', (expr, depth) => {
    expect(relationExpressionDepth(expr as string)).toBe(depth);
  });
});

describe('deep-include — the Prisma schema decides cardinality', () => {
  const SCHEMA = `model ApiToken {\n  id Int @id\n  teamId Int\n  team Team @relation(fields: [teamId], references: [id])\n}\nmodel Team {\n  id Int @id\n  orgId Int\n  organisation Organisation @relation(fields: [orgId], references: [id])\n  members Member[]\n}\nmodel Organisation {\n  id Int @id\n  ownerId Int\n  owner User @relation(fields: [ownerId], references: [id])\n  teams Team[]\n}\nmodel User {\n  id Int @id\n  name String\n}\nmodel Member {\n  id Int @id\n  teamId Int\n  team Team @relation(fields: [teamId], references: [id])\n  userId Int\n  user User @relation(fields: [userId], references: [id])\n}\n`;

  function scan(files: Record<string, string>) {
    const root = mkdtempSync(join(tmpdir(), 'deep-include-'));
    for (const [rel, code] of Object.entries(files)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), code);
    }
    const registry = new RuleRegistry();
    registry.registerAll(payloadRules);
    return analyzeDirectory({ targetPath: root, rules: ['payload/deep-include'] }, registry).issues.map(i => `${i.file}:${i.line}`);
  }

  it('drops a tree whose relations are all to-one (documenso api token)', () => {
    expect(scan({
      'prisma/schema.prisma': SCHEMA,
      'src/token.ts': `export const t = (token) => prisma.apiToken.findFirst({ where: { token }, include: { team: { include: { organisation: { include: { owner: true } } } } } });`,
    })).toEqual([]);
  });

  it('keeps a tree with a to-many, even a leaf selected with true', () => {
    expect(scan({
      'prisma/schema.prisma': SCHEMA,
      'src/token.ts': `export const t = (token) => prisma.apiToken.findFirst({ where: { token }, include: { team: { include: { organisation: { include: { owner: true, teams: true } } } } } });`,
    })).toEqual(['src/token.ts:1']);
  });

  it('keeps a to-many reached through select', () => {
    expect(scan({
      'prisma/schema.prisma': SCHEMA,
      'src/org.ts': `export const o = (id) => prisma.organisation.findUnique({ where: { id }, select: { owner: { select: { name: true } }, teams: { select: { members: { select: { user: { select: { name: true } } } } } } } });`,
    })).toEqual(['src/org.ts:1']);
  });

  it('keeps the finding when the schema does not have the field', () => {
    expect(scan({
      'prisma/schema.prisma': SCHEMA,
      'src/token.ts': `export const t = (token) => prisma.apiToken.findFirst({ include: { team: { include: { organisation: { include: { billing: true } } } } } });`,
    })).toEqual(['src/token.ts:1']);
  });

  it('keeps every finding when there is no schema', () => {
    expect(scan({
      'src/token.ts': `export const t = (token) => prisma.apiToken.findFirst({ include: { team: { include: { organisation: { include: { owner: true } } } } } });`,
    })).toEqual(['src/token.ts:1']);
  });

  it('merges a sample app schema instead of letting it replace the real model', () => {
    expect(scan({
      'prisma/schema.prisma': SCHEMA,
      'references/demo/prisma/schema.prisma': `model Organisation {\n  id Int @id\n  owner User\n}\n`,
      'src/token.ts': `export const t = (token) => prisma.apiToken.findFirst({ include: { team: { include: { organisation: { include: { teams: true } } } } } });`,
    })).toEqual(['src/token.ts:1']);
  });
});
