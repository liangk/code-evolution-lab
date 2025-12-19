import { CodeParser } from '../analyzer/parser';

describe('CodeParser', () => {
  let parser: CodeParser;

  beforeEach(() => {
    parser = new CodeParser();
  });

  test('should parse simple JavaScript code', () => {
    const code = 'const x = 10;';
    const ast = parser.parse(code);
    expect(ast).toBeDefined();
    expect(ast.type).toBe('File');
  });

  test('should parse TypeScript code', () => {
    const code = 'const x: number = 10;';
    const ast = parser.parse(code);
    expect(ast).toBeDefined();
  });

  test('should extract function declarations', () => {
    const code = `
      function hello() {
        return 'world';
      }
      
      const arrow = () => 'test';
      
      class MyClass {
        myMethod() {
          return 'method';
        }
      }
    `;
    const ast = parser.parse(code);
    const functions = parser.extractFunctions(ast);
    
    expect(functions.length).toBe(3);
    expect(functions[0].type).toBe('function');
    expect(functions[0].name).toBe('hello');
    expect(functions[1].type).toBe('arrow');
    expect(functions[2].type).toBe('method');
  });

  test('should handle parse errors gracefully', () => {
    const invalidCode = 'const x = ;';
    expect(() => parser.parse(invalidCode)).toThrow();
  });
});
