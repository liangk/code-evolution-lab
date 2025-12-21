import { readFileSync } from 'fs';
import { CodeParser } from './parser';
import { ImportAnalyzer } from './import-analyzer';
import { N1QueryDetector } from '../detectors/n1-query-detector';
import { InefficientLoopDetector } from '../detectors/inefficient-loop-detector';
import { MemoryLeakDetector } from '../detectors/memory-leak-detector';
import { LargePayloadDetector } from '../detectors/large-payload-detector';
import { N1SolutionGenerator } from '../generators/n1-solution-generator';
import { FitnessCalculator } from '../generators/fitness-calculator';
import { AnalysisContext, DetectorResult, Issue } from '../types';

export class CodeAnalyzer {
  private parser: CodeParser;
  private importAnalyzer: ImportAnalyzer;
  private detectors: any[];
  private generators: Map<string, any>;
  private fitnessCalculator: FitnessCalculator;

  constructor() {
    this.parser = new CodeParser();
    this.importAnalyzer = new ImportAnalyzer();
    this.detectors = [
      new N1QueryDetector(),
      new InefficientLoopDetector(),
      new MemoryLeakDetector(),
      new LargePayloadDetector(),
    ];
    this.generators = new Map();
    this.generators.set('n_plus_1_query', new N1SolutionGenerator());
    this.fitnessCalculator = new FitnessCalculator();
  }

  async analyzeFile(filePath: string): Promise<DetectorResult[]> {
    const sourceCode = readFileSync(filePath, 'utf-8');
    return this.analyzeCode(sourceCode, filePath);
  }

  async analyzeCode(
    sourceCode: string,
    filePath: string = 'unknown',
    generateSolutions: boolean = false
  ): Promise<DetectorResult[]> {
    const ast = this.parser.parse(sourceCode);
    const ormContext = this.importAnalyzer.buildORMContext(ast);

    const context: AnalysisContext = {
      sourceCode,
      filePath,
      ast,
      ormContext,
    };

    const results: DetectorResult[] = [];

    for (const detector of this.detectors) {
      const result = await detector.detect(ast, context);
      
      if (generateSolutions) {
        result.issues = await this.generateSolutionsForIssues(result.issues, context);
      }
      
      results.push(result);
    }

    return results;
  }

  private async generateSolutionsForIssues(
    issues: Issue[],
    context: AnalysisContext
  ): Promise<Issue[]> {
    const issuesWithSolutions: Issue[] = [];

    for (const issue of issues) {
      const generator = this.generators.get(issue.type);
      
      if (generator) {
        const solutions = await generator.generateSolutions(issue, context);
        const rankedSolutions = this.fitnessCalculator.rankSolutions(
          solutions,
          issue,
          context
        );
        
        (issue as any).solutions = rankedSolutions;
      }
      
      issuesWithSolutions.push(issue);
    }

    return issuesWithSolutions;
  }

  addDetector(detector: any): void {
    this.detectors.push(detector);
  }

  getDetectors(): any[] {
    return this.detectors;
  }
}
