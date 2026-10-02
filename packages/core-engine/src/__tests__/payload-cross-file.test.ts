/**
 * Stage 2: payload/api-response across files. The route sends what a
 * repository method in another file returns — the shape the backend's own
 * routes use (`res.json(await db.getSessionsByUser(id))`), which a
 * single-file trace cannot see.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { analyzeDirectory, RuleRegistry } from '../engine';
import { payloadRules } from '../rules/payload-rules';

function scan(files: Record<string, string>, rules?: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'payload-'));
  for (const [rel, code] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), code);
  }
  const registry = new RuleRegistry();
  registry.registerAll(payloadRules);
  return analyzeDirectory({ targetPath: root, rules }, registry).issues
    .map(i => ({ rule: i.rule, where: `${i.file}:${i.line}`, description: i.description }));
}

const PRISMA = `import { PrismaClient } from "@prisma/client"; const prisma = new PrismaClient();\n`;

describe('payload/api-response across files', () => {
  it('links a route to a repository function by name (the backend shape)', () => {
    const issues = scan({
      'api/database.ts': PRISMA + `export const db = {\n  async getSessionsByUser(userId) {\n    return prisma.session.findMany({ where: { userId } });\n  },\n};`,
      'api/routes/session.ts': `import { db } from '../database';\nrouter.get('/', async (req, res) => {\n  const sessions = await db.getSessionsByUser(req.user.id);\n  res.json(sessions.map(s => s.id));\n});`,
    });
    expect(issues).toEqual([expect.objectContaining({ rule: 'payload/api-response', where: 'api/database.ts:4' })]);
    expect(issues[0].description).toContain('api/routes/session.ts:4');
  });

  it('follows controller -> service -> repository, and picks the class the receiver names', () => {
    const issues = scan({
      'cats/cats.controller.ts': `@Controller('cats')\nexport class CatsController {\n  constructor(private readonly catsService: CatsService) {}\n  @Get()\n  findAll() {\n    return this.catsService.findAll();\n  }\n}`,
      'cats/cats.service.ts': `import { Repository } from "typeorm";\nexport class CatsService {\n  findAll() {\n    return this.catRepository.find();\n  }\n}`,
      // Same method name in another class: without the receiver, the name alone is ambiguous.
      'dogs/dogs.service.ts': `import { Repository } from "typeorm";\nexport class DogsService {\n  findAll() {\n    return this.dogRepository.find({ take: 10 });\n  }\n}`,
    });
    expect(issues).toEqual([expect.objectContaining({ rule: 'payload/api-response', where: 'cats/cats.service.ts:4' })]);
  });

  it('follows a query returned through a variable', () => {
    const issues = scan({
      'repo.ts': PRISMA + `export async function listAnalyses(repoId) {\n  const rows = await prisma.analysis.findMany({ where: { repoId } });\n  return rows;\n}`,
      'route.ts': `app.get('/a', async (req, res) => { res.json(await listAnalyses(req.params.id)); });`,
    });
    expect(issues).toEqual([expect.objectContaining({ rule: 'payload/api-response', where: 'repo.ts:3' })]);
  });

  it('does not link when the name is ambiguous and the receiver names no class', () => {
    const issues = scan({
      'a.ts': PRISMA + `export class A {\n  list() {\n    return prisma.a.findMany();\n  }\n}`,
      'b.ts': PRISMA + `export class B {\n  list() {\n    return prisma.b.findMany();\n  }\n}`,
      'route.ts': `app.get('/x', async (req, res) => { res.json(await repo.list()); });`,
    });
    expect(issues.map(i => i.rule).sort()).toEqual(['payload/large-return', 'payload/large-return']);
  });

  it('reports nothing when the repository function is bounded', () => {
    const issues = scan({
      'repo.ts': PRISMA + `export function recent() {\n  return prisma.event.findMany({ take: 50 });\n}`,
      'route.ts': `app.get('/e', async (req, res) => { res.json(await recent()); });`,
    });
    expect(issues).toEqual([]);
  });

  it('leaves a repository function alone when no endpoint sends its result', () => {
    const issues = scan({
      'repo.ts': PRISMA + `export function everyone() {\n  return prisma.user.findMany();\n}`,
      'job.ts': `export async function nightly() { for (const u of await everyone()) await mail(u); }`,
    });
    expect(issues.map(i => i.rule)).toEqual(['payload/large-return']);
  });

  it('still converts when the scan enables only api-response', () => {
    const issues = scan({
      'repo.ts': PRISMA + `export function everyone() {\n  return prisma.user.findMany();\n}`,
      'route.ts': `app.get('/u', async (req, res) => { res.json(await everyone()); });`,
    }, ['payload/api-response']);
    expect(issues.map(i => i.rule)).toEqual(['payload/api-response']);
  });

  // Round 2, from labelling the 74 api-response findings on the Study 09 corpus.
  it('counts a call into the application\'s own finder-named method once, at its query (cal.com A008)', () => {
    const issues = scan({
      'oauth/OAuthClientRepository.ts': PRISMA + `export class OAuthClientRepository {\n  async findAll() {\n    return this.prisma.oAuthClient.findMany({ select: { clientId: true } });\n  }\n}`,
      'oauth/listClients.handler.ts': `export const listClientsHandler = async ({ ctx }) => {\n  const oAuthClientRepository = new OAuthClientRepository();\n  return oAuthClientRepository.findAll();\n};`,
      'oauth/_router.ts': `export const r = router({\n  listClients: authedAdminProcedure.query(async ({ ctx }) => {\n    return listClientsHandler({ ctx });\n  }),\n});`,
    });
    expect(issues).toEqual([expect.objectContaining({ rule: 'payload/api-response', where: 'oauth/OAuthClientRepository.ts:4' })]);
  });

  it('keeps a call into a generic pass-through base repository, which is the real query (novu)', () => {
    const issues = scan({
      'dal/base-repository.ts': `import mongoose from "mongoose";\nexport class BaseRepository {\n  async find(query, select = '', options = {}) {\n    return this.MongooseModel.find(query, select).skip(options.skip).limit(options.limit).lean();\n  }\n}`,
      'app/topics.ts': `export async function subscribersOf(topicId) {\n  return this.topicSubscribersRepository.find({ _topicId: topicId });\n}`,
    });
    expect(issues).toEqual([expect.objectContaining({ rule: 'payload/large-return', where: 'app/topics.ts:2' })]);
  });

  it('links a knex model method through a service to a controller (lightdash shape)', () => {
    const issues = scan({
      'models/SavedChartModel.ts': `export class SavedChartModel {\n  async find(filters) {\n    const query = this.database('saved_queries').where('project_uuid', filters.projectUuid);\n    return query;\n  }\n}`,
      'services/ProjectService.ts': `export class ProjectService {\n  async getCharts(projectUuid) {\n    return this.savedChartModel.find({ projectUuid });\n  }\n}`,
      'controllers/projectController.ts': `export class ProjectController {\n  @Get('/charts')\n  async getCharts(req) {\n    return { status: 'ok', results: await this.services.getProjectService().getCharts(req.params.projectUuid) };\n  }\n}`,
    });
    expect(issues).toEqual([expect.objectContaining({ rule: 'payload/api-response', where: 'models/SavedChartModel.ts:3' })]);
  });
});
