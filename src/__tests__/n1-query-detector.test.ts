import { CodeParser } from '../analyzer/parser';
import { N1QueryDetector } from '../detectors/n1-query-detector';
import { AnalysisContext } from '../types';

describe('N1QueryDetector', () => {
  let parser: CodeParser;
  let detector: N1QueryDetector;

  beforeEach(() => {
    parser = new CodeParser();
    detector = new N1QueryDetector();
  });

  test('should detect N+1 query in for-of loop', async () => {
    const code = `
      async function getUsers() {
        const users = await User.findAll();
        
        for (const user of users) {
          user.orders = await Order.findAll({ where: { userId: user.id } });
        }
        
        return users;
      }
    `;

    const ast = parser.parse(code);
    const context: AnalysisContext = {
      sourceCode: code,
      filePath: 'test.js',
      ast,
    };

    const result = await detector.detect(ast, context);

    expect(result.issues.length).toBe(1);
    expect(result.issues[0].type).toBe('n_plus_1_query');
    expect(result.issues[0].severity).toBe('medium');
    expect(result.issues[0].title).toBe('N+1 Query Detected');
  });

  test('should detect N+1 query in forEach', async () => {
    const code = `
      async function processUsers(users) {
        users.forEach(async (user) => {
          const profile = await Profile.findOne({ where: { userId: user.id } });
          user.profile = profile;
        });
      }
    `;

    const ast = parser.parse(code);
    const context: AnalysisContext = {
      sourceCode: code,
      filePath: 'test.js',
      ast,
    };

    const result = await detector.detect(ast, context);

    expect(result.issues.length).toBe(1);
    expect(result.issues[0].type).toBe('n_plus_1_query');
  });

  test('should not detect false positives', async () => {
    const code = `
      async function getUsers() {
        const users = await User.findAll({
          include: [{ model: Order }]
        });
        
        for (const user of users) {
          console.log(user.name);
        }
        
        return users;
      }
    `;

    const ast = parser.parse(code);
    const context: AnalysisContext = {
      sourceCode: code,
      filePath: 'test.js',
      ast,
    };

    const result = await detector.detect(ast, context);

    expect(result.issues.length).toBe(0);
  });

  test('should calculate severity based on query count', async () => {
    const code = `
      async function complexQuery() {
        const items = await Item.findAll();
        
        for (const item of items) {
          const detail1 = await Detail1.findOne({ where: { itemId: item.id } });
          const detail2 = await Detail2.findOne({ where: { itemId: item.id } });
          const detail3 = await Detail3.findOne({ where: { itemId: item.id } });
        }
      }
    `;

    const ast = parser.parse(code);
    const context: AnalysisContext = {
      sourceCode: code,
      filePath: 'test.js',
      ast,
    };

    const result = await detector.detect(ast, context);

    expect(result.issues.length).toBe(1);
    expect(result.issues[0].severity).toBe('critical');
  });
});
