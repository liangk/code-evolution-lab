/**
 * Tests for the missing-index solution generator.
 *
 * The standard every case is held to: paste the suggested model block back
 * into the schema, run the rule again, and the finding is gone. A suggestion
 * that does not pass that test is not a fix, however plausible it reads — the
 * backend generator this replaces would emit `@@index([FIELD_NAME])` on a
 * model called `TABLE_NAME` and report success.
 */

import {
  indexRules,
  parseSchema,
  resetIndexRuleCache,
  foreignKeyCoverage,
  parseIndexRecommendation,
} from '../rules/index-rules';
import { IndexSolutionGenerator, addIndexToModel } from '../solutions/index-generator';
import { generateSolutionsFor, hasSolutionGenerator } from '../solutions';
import type { DiagnosticIssue } from '../types';

const fkRule = indexRules.find(r => r.id === 'index/missing-fk-index')!;
const queryRule = indexRules.find(r => r.id === 'index/missing-filter-index')!;

const SCHEMA = `
model Project {
  id        String   @id @default(cuid())
  slug      String   @unique
  createdAt DateTime @default(now())
  subscribers Subscriber[]
}

model Subscriber {
  id        BigInt   @id @default(autoincrement())
  projectId String   @map("project_id")
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  email     String
  status    String   @default("pending") // "pending" | "confirmed"
  createdAt DateTime @default(now())

  @@unique([projectId, email])
  @@map("subscribers")
}

/// Rows written once per recipient per campaign send.
model CampaignRecipient {
  id           String     @id @default(cuid())
  subscriberId BigInt     @map("subscriber_id")
  subscriber   Subscriber @relation(fields: [subscriberId], references: [id], onDelete: Cascade)
  status       String     @default("pending")
}
`;

/** One query of each kind the query rules report on. */
const QUERIES = `
  const confirmed = await prisma.subscriber.findMany({ where: { status: 'confirmed' } });
  const recent = await prisma.subscriber.findMany({
    where: { status: 'confirmed', createdAt: { gte: since } },
  });
  const projects = await prisma.project.findMany({ orderBy: { createdAt: 'desc' } });
`;

function scanAll(schema = SCHEMA, queries = QUERIES): DiagnosticIssue[] {
  resetIndexRuleCache();
  const schemaIssues = fkRule.detect('prisma/schema.prisma', schema);
  const queryIssues = queryRule.detect('src/routes/subscribers.ts', queries);
  return [...schemaIssues, ...queryIssues];
}

async function solve(issue: DiagnosticIssue) {
  return new IndexSolutionGenerator().generateSolutions(issue, {});
}

/** Replace one model block in the schema with the suggested one. */
function apply(schema: string, before: string, after: string): string {
  expect(schema).toContain(before);
  return schema.replace(before, after);
}

describe('the rules attach what the generator needs', () => {
  it('produces all four finding types from the fixture', () => {
    const rules = new Set(scanAll().map(i => i.rule));
    expect(rules).toEqual(new Set([
      'index/missing-fk-index',
      'index/missing-filter-index',
      'index/missing-composite',
      'index/missing-sort-index',
    ]));
  });

  it('gives every finding a parseable recommendation and its own model block', () => {
    for (const issue of scanAll()) {
      const wanted = parseIndexRecommendation(issue.recommendation);
      expect(wanted).not.toBeNull();
      expect(issue.codeBefore).toMatch(new RegExp(`^model ${wanted!.model} \\{`));
      expect(issue.codeBefore!.trimEnd().endsWith('}')).toBe(true);
    }
  });

  it('keeps the model block exactly as written, comments included', () => {
    const fk = scanAll().find(i => i.rule === 'index/missing-fk-index')!;
    const start = SCHEMA.indexOf('model CampaignRecipient {');
    const end = SCHEMA.indexOf('}', start) + 1;
    expect(fk.codeBefore).toBe(SCHEMA.slice(start, end));
  });

  it('starts the block at `model` when it shares a line with the previous brace', () => {
    const schema = `model A {\n  id Int @id\n}model B {\n  id  Int @id\n  aId Int\n  a   A   @relation(fields: [aId], references: [id])\n}\n`;
    resetIndexRuleCache();
    const [issue] = fkRule.detect('schema.prisma', schema);
    expect(issue.codeBefore!.startsWith('model B {')).toBe(true);
  });
});

describe('every suggestion removes its own finding', () => {
  // The whole contract in one test: for each finding, paste the suggested
  // block over the original and rescan. The same finding must not come back.
  it('holds for all four rule types', async () => {
    const issues = scanAll();
    expect(issues.length).toBeGreaterThanOrEqual(4);

    for (const issue of issues) {
      const [solution] = await solve(issue);
      expect(solution).toBeDefined();

      const fixed = apply(SCHEMA, issue.codeBefore!, solution.code);
      // Rules leave `id` for the engine to assign, so compare on what a
      // finding says: its rule and its title name the model and columns.
      const again = scanAll(fixed).map(i => `${i.rule} ${i.title}`);
      expect(again).not.toContain(`${issue.rule} ${issue.title}`);
    }
  });

  it('covers the foreign key once the block is applied', async () => {
    const fk = scanAll().find(i => i.rule === 'index/missing-fk-index')!;
    const [solution] = await solve(fk);
    const coverage = foreignKeyCoverage(parseSchema(apply(SCHEMA, fk.codeBefore!, solution.code)));
    expect(coverage.every(c => c.indexed)).toBe(true);
  });
});

describe('the suggestion is the reader\'s own model', () => {
  it('keeps every original line, in order, and adds exactly one', async () => {
    const fk = scanAll().find(i => i.rule === 'index/missing-fk-index')!;
    const [solution] = await solve(fk);

    const before = fk.codeBefore!.split('\n');
    const after = solution.code.split('\n');
    const added = after.filter(l => !before.includes(l));
    expect(added.map(l => l.trim()).filter(Boolean)).toEqual(['@@index([subscriberId])']);

    let cursor = 0;
    for (const line of before) {
      cursor = after.indexOf(line, cursor);
      expect(cursor).toBeGreaterThanOrEqual(0);
    }
  });

  it('places the index with existing block attributes, at their indentation', () => {
    const block = `model Subscriber {\n    id     Int    @id\n    status String\n\n    @@unique([id, status])\n    @@map("subscribers")\n}`;
    const out = addIndexToModel(block, 'Subscriber', ['status'])!;
    expect(out).toBe(
      `model Subscriber {\n    id     Int    @id\n    status String\n\n    @@unique([id, status])\n    @@map("subscribers")\n    @@index([status])\n}`,
    );
  });

  it('adds a blank line before the first block attribute, as prisma format does', () => {
    const block = `model A {\n  id     Int @id\n  userId Int\n\n}`;
    expect(addIndexToModel(block, 'A', ['userId'])).toBe(
      `model A {\n  id     Int @id\n  userId Int\n\n  @@index([userId])\n}`,
    );
  });

  it('matches a schema with no indentation', () => {
    const block = `model A {\nid Int @id\nuserId Int\n}`;
    expect(addIndexToModel(block, 'A', ['userId'])).toBe(`model A {\nid Int @id\nuserId Int\n\n@@index([userId])\n}`);
  });

  it('keeps Windows line endings', () => {
    const block = `model A {\r\n  id     Int @id\r\n  userId Int\r\n}`;
    const out = addIndexToModel(block, 'A', ['userId'])!;
    expect(out).toBe(`model A {\r\n  id     Int @id\r\n  userId Int\r\n\r\n  @@index([userId])\r\n}`);
  });

  it('keeps the column order of a composite index', async () => {
    const composite = scanAll().find(i => i.rule === 'index/missing-composite')!;
    const [solution] = await solve(composite);
    expect(solution.code).toContain('@@index([status, createdAt])');
    expect(solution.explanation).toMatch(/Column order matters/);
  });

  it('does not mention column order for a single column', async () => {
    const fk = scanAll().find(i => i.rule === 'index/missing-fk-index')!;
    const [solution] = await solve(fk);
    expect(solution.explanation).not.toMatch(/Column order/);
  });
});

describe('returns nothing rather than a suggestion that cannot apply', () => {
  const BLOCK = `model A {\n  id     Int @id\n  userId Int\n}`;

  it('when the block is a different model', () => {
    expect(addIndexToModel(BLOCK, 'B', ['userId'])).toBeNull();
  });

  it('when a column is not a field of the model', () => {
    expect(addIndexToModel(BLOCK, 'A', ['ownerId'])).toBeNull();
  });

  it('when a column appears only in a comment', () => {
    const block = `model A {\n  id Int @id\n  // userId Int  -- removed\n}`;
    expect(addIndexToModel(block, 'A', ['userId'])).toBeNull();
  });

  it('when the same index is already there', () => {
    const block = `model A {\n  id     Int @id\n  userId Int\n\n  @@index(fields: [userId])\n}`;
    expect(addIndexToModel(block, 'A', ['userId'])).toBeNull();
  });

  it('but not when the existing index is only commented out', () => {
    const block = `model A {\n  id     Int @id\n  userId Int\n\n  // @@index([userId])\n}`;
    expect(addIndexToModel(block, 'A', ['userId'])).toContain('\n  @@index([userId])\n}');
  });

  it('when the block is not closed', () => {
    expect(addIndexToModel(`model A {\n  id Int @id\n  userId Int`, 'A', ['userId'])).toBeNull();
  });

  it('when the finding has no codeBefore', async () => {
    const fk = scanAll().find(i => i.rule === 'index/missing-fk-index')!;
    expect(await solve({ ...fk, codeBefore: undefined })).toEqual([]);
  });

  it('when the recommendation names no index', async () => {
    const fk = scanAll().find(i => i.rule === 'index/missing-fk-index')!;
    expect(await solve({ ...fk, recommendation: 'Consider adding an index' })).toEqual([]);
  });

  it('for a finding from another category', async () => {
    const fk = scanAll().find(i => i.rule === 'index/missing-fk-index')!;
    expect(await solve({ ...fk, category: 'n1' })).toEqual([]);
  });

  it('never emits a placeholder name', async () => {
    for (const issue of scanAll()) {
      for (const solution of await solve(issue)) {
        expect(solution.code).not.toMatch(/FIELD_NAME|TABLE_NAME|COLUMN_NAME|fieldName|field_name/);
      }
    }
  });
});

describe('generateSolutionsFor', () => {
  it('routes index findings to this generator', async () => {
    expect(hasSolutionGenerator('index')).toBe(true);
    const fk = scanAll().find(i => i.rule === 'index/missing-fk-index')!;
    const solutions = await generateSolutionsFor(fk);
    expect(solutions).toHaveLength(1);
    expect(solutions[0].type).toBe('prisma-schema-index');
    expect(solutions[0].riskLevel).toBe('low');
  });
});
