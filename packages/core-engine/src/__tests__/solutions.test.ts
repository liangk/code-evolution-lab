/**
 * Tests for solution generation.
 *
 * The rejection cases matter most. Two things reached published scan results
 * before this was ported: a pattern-analysis fallback that emitted a
 * "solution" made entirely of comments, and generic transforms that prepended
 * a comment header to unchanged code and reported success. Both read as fixes
 * and neither could be applied.
 */

import { N1SolutionGenerator } from '../solutions/n1-generator';
import { generateSolutionsFor, hasSolutionGenerator } from '../solutions';
import type { DiagnosticIssue } from '../types';

function issue(codeBefore: string, over: Partial<DiagnosticIssue> = {}): DiagnosticIssue {
  return {
    id: 'test-1',
    rule: 'n1/query-in-loop',
    category: 'n1',
    severity: 'medium',
    file: 'src/service.ts',
    line: 1,
    title: 'N+1 query in loop',
    description: 'test fixture',
    recommendation: 'test fixture',
    confidence: 0.85,
    codeBefore,
    ...over,
  };
}

const SEQUELIZE_LOOP = `for (const mention of mentions) {
  const recipient = await User.findByPk(mention.modelId);
  await send(recipient);
}`;

describe('N1SolutionGenerator', () => {
  it('produces a batch-query scaffold that keeps the original names', async () => {
    const solutions = await new N1SolutionGenerator().generateSolutions(issue(SEQUELIZE_LOOP), {});
    const batch = solutions.find(s => s.type === 'batch-query-before-loop');

    expect(batch).toBeDefined();
    // The reader's own loop variable and collection, not a generic template.
    expect(batch!.code).toContain('mentions.map(mention =>');
    expect(batch!.code).toContain('const dataMap = new Map(');
    // The placeholder is deliberate — this is a scaffold, not a patch.
    expect(batch!.code).toContain('Replace with actual batch query');
  });

  it('ranks solutions by fitness, highest first', async () => {
    const solutions = await new N1SolutionGenerator().generateSolutions(issue(SEQUELIZE_LOOP), {});
    const scores = solutions.map(s => s.fitnessScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('returns nothing when there is no code to transform', async () => {
    expect(await new N1SolutionGenerator().generateSolutions(issue(''), {})).toEqual([]);
  });

  it('returns nothing rather than commentary when no strategy applies', async () => {
    // A loop with no async call and no recognised ORM: every strategy bails.
    const solutions = await new N1SolutionGenerator().generateSolutions(
      issue(`for (const x of xs) { total += x.value; }`),
      {},
    );
    expect(solutions).toEqual([]);
  });

  it('never emits a solution that is only comments', async () => {
    const solutions = await new N1SolutionGenerator().generateSolutions(issue(SEQUELIZE_LOOP), {});
    for (const solution of solutions) {
      const withoutComments = solution.code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*/g, '')
        .trim();
      expect(withoutComments.length).toBeGreaterThan(0);
    }
  });
});

describe('strategies that cannot apply say nothing', () => {
  // Scanning outline gave 25 of 27 findings a `sequelize-include` solution
  // built around a fictional `Model.findAll({ include: [] })`, with the
  // reader's own code pasted into a comment block below it. Both include
  // strategies had no failure path: no models found meant falling back to the
  // literal string 'Model' and still reporting success.

  const NO_FINDALL = `for (const eg of externalGroups) {
  const [externalGroup, created] = await ExternalGroup.findOrCreate({ where: { externalId: eg.id } });
  await externalGroup.update({ lastSyncedAt: now });
}`;

  it('does not offer sequelize-include when the code has no findAll', async () => {
    const solutions = await new N1SolutionGenerator().generateSolutions(issue(NO_FINDALL), {});
    expect(solutions.map(s => s.type)).not.toContain('sequelize-include');
  });

  it('does not offer sequelize-include for a single model', async () => {
    const single = `for (const id of ids) {
  const rows = await Document.findAll({ where: { id } });
  use(rows);
}`;
    const solutions = await new N1SolutionGenerator().generateSolutions(issue(single), {});
    expect(solutions.map(s => s.type)).not.toContain('sequelize-include');
  });

  it('does offer sequelize-include when two models are eager-loadable', async () => {
    const two = `for (const id of ids) {
  const docs = await Document.findAll({ where: { id } });
  const attachments = await Attachment.findAll({ where: { documentId: id } });
}`;
    const solutions = await new N1SolutionGenerator().generateSolutions(issue(two), {});
    const include = solutions.find(s => s.type === 'sequelize-include');
    expect(include).toBeDefined();
    // Real model names, never the placeholder.
    expect(include!.code).toContain('await Document.findAll(');
    expect(include!.code).toContain('model: Attachment');
  });

  it('never emits a placeholder model name or an empty include', async () => {
    const cases = [NO_FINDALL, SEQUELIZE_LOOP, `for (const x of xs) { await prisma.user.update({ where: { id: x.id } }); }`];
    for (const code of cases) {
      const solutions = await new N1SolutionGenerator().generateSolutions(issue(code), {});
      for (const solution of solutions) {
        expect(solution.code).not.toContain('await Model.findAll(');
        expect(solution.code).not.toContain('// Add models here');
        expect(solution.code).not.toContain('// Add relations here');
      }
    }
  });
});

describe('generateSolutionsFor', () => {
  it('has a generator for n1 and not for categories that were not ported', () => {
    expect(hasSolutionGenerator('n1')).toBe(true);
    expect(hasSolutionGenerator('redos')).toBe(false);
  });

  it('returns an empty array for a category with no generator', async () => {
    const redos = issue(SEQUELIZE_LOOP, { category: 'redos', rule: 'redos/dangerous-pattern' });
    expect(await generateSolutionsFor(redos)).toEqual([]);
  });

  it('returns an empty array rather than throwing on unparseable code', async () => {
    expect(await generateSolutionsFor(issue('for (const x of { { {'))).toEqual([]);
  });
});
