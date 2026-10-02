/**
 * payload/unbounded-graphql: a resolver returns every row of a query.
 * Study 09 declared `unbounded_graphql` and never implemented it.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import * as parser from '@babel/parser';
import { analyzeDirectory, RuleRegistry } from '../engine';
import { payloadRules } from '../rules/payload-rules';

const PRISMA = `import { PrismaClient } from "@prisma/client"; const prisma = new PrismaClient();\n`;

function rules(code: string, file = 'src/schema.ts'): string[] {
  const ast = parser.parse(code, { sourceType: 'unambiguous', plugins: ['typescript', 'decorators-legacy'], errorRecovery: true });
  return payloadRules[0].detect(file, code, ast).map(i => i.rule);
}

function scan(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'graphql-'));
  for (const [rel, code] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), code);
  }
  const registry = new RuleRegistry();
  registry.registerAll(payloadRules);
  return analyzeDirectory({ targetPath: root }, registry).issues
    .filter(i => i.rule.startsWith('payload/') && i.rule !== 'payload/deep-include' && i.rule !== 'payload/select-star')
    .map(i => ({ rule: i.rule, where: `${i.file}:${i.line}`, description: i.description }));
}

describe('unbounded-graphql — single file', () => {
  it.each([
    ['an Apollo resolver map', PRISMA + `export const resolvers = { Query: { users: () => prisma.user.findMany() } };`],
    ['a resolver map method', PRISMA + `export const resolvers = { Query: { async users() { return prisma.user.findMany({ where: { active: true } }); } } };`],
    ['a field resolver under a type', PRISMA + `export const resolvers = { Query: { me: (_, __, ctx) => ctx.user }, User: { posts: (parent) => prisma.post.findMany({ where: { authorId: parent.id } }) } };`],
    ['a NestJS @Query', PRISMA + `class R { @Query(() => [User]) async users() { return prisma.user.findMany(); } }`],
    ['a NestJS @ResolveField', PRISMA + `class R { @ResolveField() async posts(@Parent() u) { return prisma.post.findMany({ where: { authorId: u.id } }); } }`],
    ['a type-graphql @FieldResolver', PRISMA + `class R { @FieldResolver() async posts(@Root() u) { return prisma.post.findMany({ where: { authorId: u.id } }); } }`],
    ['a graphql-js field config', PRISMA + `const Q = new GraphQLObjectType({ name: 'Query', fields: { users: { type: new GraphQLList(User), resolve: () => prisma.user.findMany() } } });`],
    ['a Pothos field', PRISMA + `builder.queryField('users', (t) => t.prismaField({ type: ['User'], resolve: (query) => prisma.user.findMany({ ...query }) }));`],
    ['a knex builder in a resolver', `export const resolvers = { Query: { tags: () => knex('tags').where('project_id', 1) } };`],
  ])('%s', (_name, code) => {
    expect(rules(code)).toEqual(['payload/unbounded-graphql']);
  });

  it.each([
    ['take from the field arguments', PRISMA + `export const resolvers = { Query: { users: (_, args) => prisma.user.findMany({ take: args.first, skip: args.offset }) } };`],
    ['a single row by id', PRISMA + `export const resolvers = { Query: { user: (_, { id }) => prisma.user.findUnique({ where: { id } }) } };`],
    ['a DataLoader batch by keys', PRISMA + `const loader = new DataLoader((ids) => prisma.user.findMany({ where: { id: { in: ids } } }));`],
    ['an object with a Query key that is not a resolver map', `const routes = { Query: 'q', run: () => list() };`],
  ])('not: %s', (_name, code) => {
    expect(rules(code)).not.toContain('payload/unbounded-graphql');
  });

  it('a default export in resolvers/<Type>/ (Reaction Commerce layout)', () => {
    const code = PRISMA + `export default async function groups(_, { shopId }, context) { return prisma.group.findMany({ where: { shopId } }); }`;
    expect(rules(code, 'packages/api-plugin-accounts/src/resolvers/Query/groups.js')).toEqual(['payload/unbounded-graphql']);
    expect(rules(code, 'packages/api-plugin-accounts/src/queries/groups.js')).toEqual(['payload/large-return']);
  });

  it('a REST route is still api-response', () => {
    expect(rules(PRISMA + `class C { @Get() async list() { return prisma.user.findMany(); } }`)).toEqual(['payload/api-response']);
  });

  it('a query that a REST route and a resolver both return is api-response', () => {
    expect(rules(PRISMA + `async function all() { return prisma.user.findMany(); }\nconst resolvers = { Query: { users: () => prisma.user.findMany() } };\nclass C { @Get() async list() { const u = await prisma.post.findMany(); return u; } }`))
      .toEqual(['payload/unbounded-graphql', 'payload/api-response', 'payload/large-return']);
  });
});

describe('unbounded-graphql — across files', () => {
  it('links a resolver to a repository method by name', () => {
    const issues = scan({
      'src/users.repository.ts': PRISMA + `export class UsersRepository {\n  async findActive() {\n    return prisma.user.findMany({ where: { active: true } });\n  }\n}`,
      'src/users.resolver.ts': `export class UsersResolver {\n  @Query(() => [User])\n  async users() {\n    return this.usersRepository.findActive();\n  }\n}`,
    });
    expect(issues).toEqual([expect.objectContaining({ rule: 'payload/unbounded-graphql', where: 'src/users.repository.ts:4' })]);
    expect(issues[0].description).toContain('src/users.resolver.ts:4');
  });

  it('prefers api-response when a REST route returns the same method', () => {
    const issues = scan({
      'src/users.repository.ts': PRISMA + `export class UsersRepository {\n  async findActive() {\n    return prisma.user.findMany({ where: { active: true } });\n  }\n}`,
      'src/users.resolver.ts': `export class UsersResolver {\n  @Query(() => [User])\n  async users() {\n    return this.usersRepository.findActive();\n  }\n}`,
      'src/users.controller.ts': `export class UsersController {\n  @Get()\n  async list() {\n    return this.usersRepository.findActive();\n  }\n}`,
    });
    expect(issues).toEqual([expect.objectContaining({ rule: 'payload/api-response', where: 'src/users.repository.ts:4' })]);
  });
});
