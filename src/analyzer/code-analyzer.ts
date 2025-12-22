import { readFileSync } from 'fs';
import { CodeParser } from './parser';
import { ImportAnalyzer } from './import-analyzer';
import { N1QueryDetector } from '../detectors/n1-query-detector';
import { InefficientLoopDetector } from '../detectors/inefficient-loop-detector';
import { MemoryLeakDetector } from '../detectors/memory-leak-detector';
import { LargePayloadDetector } from '../detectors/large-payload-detector';
import { N1SolutionGenerator } from '../generators/n1-solution-generator';
import { InefficientLoopSolutionGenerator } from '../generators/inefficient-loop-solution-generator';
import { MemoryLeakSolutionGenerator } from '../generators/memory-leak-solution-generator';
import { LargePayloadSolutionGenerator } from '../generators/large-payload-solution-generator';
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
    
    // Inefficient loop generators
    const loopGenerator = new InefficientLoopSolutionGenerator();
    this.generators.set('await_in_loop', loopGenerator);
    this.generators.set('array_lookup_in_loop', loopGenerator);
    this.generators.set('nested_loops', loopGenerator);
    this.generators.set('string_concat_in_loop', loopGenerator);
    this.generators.set('regex_compilation_in_loop', loopGenerator);
    this.generators.set('json_operations_in_loop', loopGenerator);
    this.generators.set('sync_file_io_in_loop', loopGenerator);
    this.generators.set('inefficient_array_chaining', loopGenerator);
    this.generators.set('nested_array_methods', loopGenerator);
    this.generators.set('dom_manipulation_in_loop', loopGenerator);
    
    // Memory leak generators
    const memoryLeakGenerator = new MemoryLeakSolutionGenerator();
    this.generators.set('event_listener_leak', memoryLeakGenerator);
    this.generators.set('timer_leak', memoryLeakGenerator);
    this.generators.set('global_variable_leak', memoryLeakGenerator);
    this.generators.set('closure_memory_leak', memoryLeakGenerator);
    
    // Large payload generators
    const payloadGenerator = new LargePayloadSolutionGenerator();
    this.generators.set('large_api_payload', payloadGenerator);
    this.generators.set('select_all_query', payloadGenerator);
    this.generators.set('large_return_payload', payloadGenerator);
    
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
