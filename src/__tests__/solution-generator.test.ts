import { N1SolutionGenerator } from '../generators/n1-solution-generator';
import { Issue } from '../types';

describe('N1SolutionGenerator', () => {
  let generator: N1SolutionGenerator;

  beforeEach(() => {
    generator = new N1SolutionGenerator();
  });

  test('should generate Sequelize solutions', async () => {
    const issue: Issue = {
      id: 'test-1',
      type: 'n_plus_1_query',
      severity: 'high',
      filePath: 'test.js',
      lineNumber: 10,
      title: 'N+1 Query',
      description: 'N+1 query detected',
      codeBefore: 'const users = await User.findAll();',
    };

    const solutions = await generator.generateSolutions(issue, {});

    expect(solutions.length).toBeGreaterThan(0);
    expect(solutions[0].type).toBe('eager_loading');
    expect(solutions[0].fitnessScore).toBeGreaterThan(0);
    expect(solutions[0].code).toContain('include');
  });

  test('should generate Prisma solutions', async () => {
    const issue: Issue = {
      id: 'test-2',
      type: 'n_plus_1_query',
      severity: 'high',
      filePath: 'test.js',
      lineNumber: 10,
      title: 'N+1 Query',
      description: 'N+1 query detected',
      codeBefore: 'const users = await prisma.user.findMany();',
    };

    const solutions = await generator.generateSolutions(issue, {});

    expect(solutions.length).toBeGreaterThan(0);
    expect(solutions[0].type).toBe('prisma_include');
    expect(solutions[0].code).toContain('prisma');
  });

  test('should rank solutions by fitness score', async () => {
    const issue: Issue = {
      id: 'test-3',
      type: 'n_plus_1_query',
      severity: 'high',
      filePath: 'test.js',
      lineNumber: 10,
      title: 'N+1 Query',
      description: 'N+1 query detected',
      codeBefore: 'const users = await User.findAll();',
    };

    const solutions = await generator.generateSolutions(issue, {});

    for (let i = 0; i < solutions.length - 1; i++) {
      expect(solutions[i].fitnessScore).toBeGreaterThanOrEqual(solutions[i + 1].fitnessScore);
    }
  });

  test('should include implementation time and risk level', async () => {
    const issue: Issue = {
      id: 'test-4',
      type: 'n_plus_1_query',
      severity: 'high',
      filePath: 'test.js',
      lineNumber: 10,
      title: 'N+1 Query',
      description: 'N+1 query detected',
      codeBefore: 'const users = await User.findAll();',
    };

    const solutions = await generator.generateSolutions(issue, {});

    solutions.forEach((solution) => {
      expect(solution.implementationTime).toBeGreaterThan(0);
      expect(['low', 'medium', 'high']).toContain(solution.riskLevel);
      expect(solution.reasoning).toBeTruthy();
    });
  });
});
