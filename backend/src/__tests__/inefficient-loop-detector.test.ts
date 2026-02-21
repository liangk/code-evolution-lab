import { CodeParser } from '../analyzer/parser';
import { InefficientLoopDetector } from '../detectors/inefficient-loop-detector';
import { AnalysisContext } from '../types';

describe('InefficientLoopDetector', () => {
  let parser: CodeParser;
  let detector: InefficientLoopDetector;

  beforeEach(() => {
    parser = new CodeParser();
    detector = new InefficientLoopDetector();
  });

  test('should detect filter().map() chaining', async () => {
    const code = `
      const result = users
        .filter(user => user.active)
        .map(user => user.name);
    `;

    const ast = parser.parse(code);
    const context: AnalysisContext = {
      sourceCode: code,
      filePath: 'test.js',
      ast,
    };

    const result = await detector.detect(ast, context);

    expect(result.issues.length).toBe(1);
    expect(result.issues[0].type).toBe('inefficient_array_chaining');
    expect(result.issues[0].severity).toBe('medium');
  });

  test('should detect nested array methods', async () => {
    const code = `
      const result = users.map(user => {
        return orders.filter(order => order.userId === user.id);
      });
    `;

    const ast = parser.parse(code);
    const context: AnalysisContext = {
      sourceCode: code,
      filePath: 'test.js',
      ast,
    };

    const result = await detector.detect(ast, context);

    expect(result.issues.length).toBe(1);
    expect(result.issues[0].type).toBe('nested_array_methods');
    expect(result.issues[0].severity).toBe('high');
  });

  test('should detect array.push() in loop', async () => {
    const code = `
      const result = [];
      for (let i = 0; i < items.length; i++) {
        result.push(items[i] * 2);
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
    expect(result.issues[0].type).toBe('array_push_in_loop');
  });

  test('should detect DOM manipulation in loop', async () => {
    const code = `
      for (const item of items) {
        document.body.appendChild(createDiv(item));
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
    expect(result.issues[0].type).toBe('dom_manipulation_in_loop');
    expect(result.issues[0].severity).toBe('high');
  });
});
