import { readFileSync } from 'fs';
import { CodeParser } from './parser';
import { N1QueryDetector } from '../detectors/n1-query-detector';
import { AnalysisContext, DetectorResult } from '../types';

export class CodeAnalyzer {
  private parser: CodeParser;
  private detectors: any[];

  constructor() {
    this.parser = new CodeParser();
    this.detectors = [new N1QueryDetector()];
  }

  async analyzeFile(filePath: string): Promise<DetectorResult[]> {
    const sourceCode = readFileSync(filePath, 'utf-8');
    return this.analyzeCode(sourceCode, filePath);
  }

  async analyzeCode(sourceCode: string, filePath: string = 'unknown'): Promise<DetectorResult[]> {
    const ast = this.parser.parse(sourceCode);

    const context: AnalysisContext = {
      sourceCode,
      filePath,
      ast,
    };

    const results: DetectorResult[] = [];

    for (const detector of this.detectors) {
      const result = await detector.detect(ast, context);
      results.push(result);
    }

    return results;
  }

  addDetector(detector: any): void {
    this.detectors.push(detector);
  }

  getDetectors(): any[] {
    return this.detectors;
  }
}
