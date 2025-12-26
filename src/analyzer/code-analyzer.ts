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
import { EvolutionaryEngine } from '../generators/evolutionary-engine';
import { AnalysisContext, DetectorResult, Issue } from '../types';
import { EventEmitter } from 'events';

export interface EvolutionProgress {
  generation: number;
  maxGenerations: number;
  bestFitness: number;
  avgFitness: number;
  bestSolution: any;
  population: any[];
}

export class CodeAnalyzer extends EventEmitter {
  private parser: CodeParser;
  private importAnalyzer: ImportAnalyzer;
  private detectors: any[];
  private generators: Map<string, any>;
  private fitnessCalculator: FitnessCalculator;
  private evolutionaryEngine: EvolutionaryEngine;
  private useEvolutionary: boolean;

  constructor() {
    super();
    this.parser = new CodeParser();
    this.importAnalyzer = new ImportAnalyzer();
    this.useEvolutionary = process.env.EVO_ENABLE_ALGORITHM === 'true';
    this.evolutionaryEngine = new EvolutionaryEngine();
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
    const MAX_CONCURRENT = 5;
    const MAX_TIME_PER_ISSUE = parseInt(process.env.EVO_MAX_TIME_MS || '30000', 10);

    const processIssue = async (issue: Issue): Promise<Issue> => {
      const generator = this.generators.get(issue.type);
      
      if (!generator) {
        return issue;
      }

      try {
        // Phase 1: Generate quick heuristic solutions (always fast)
        const quickSolutions = await generator.generateSolutions(issue, context);
        const rankedQuickSolutions = this.fitnessCalculator.rankSolutions(
          quickSolutions,
          issue,
          context
        );
        
        // Send quick solutions immediately
        (issue as any).solutions = rankedQuickSolutions;
        this.emit('quick-solutions', {
          issueId: issue.title,
          issueType: issue.type,
          solutions: rankedQuickSolutions,
          phase: 'heuristic'
        });

        // Phase 2: Evolutionary refinement (if enabled and applicable)
        if (this.useEvolutionary && this.shouldUseEvolutionFor(issue)) {
          this.emit('evolution-start', {
            issueId: issue.title,
            issueType: issue.type
          });

          // Set up progress listener
          const progressHandler = (progress: EvolutionProgress) => {
            this.emit('evolution-progress', {
              issueId: issue.title,
              issueType: issue.type,
              issueTitle: issue.title,
              ...progress
            });
          };
          this.evolutionaryEngine.on('progress', progressHandler);

          try {
            // Run evolution with timeout
            const evolvedSolutions = await Promise.race([
              this.evolutionaryEngine.evolve(issue, context, generator),
              this.createTimeout(MAX_TIME_PER_ISSUE)
            ]);

            if (evolvedSolutions) {
              (issue as any).solutions = evolvedSolutions;
              this.emit('evolution-complete', {
                issueId: issue.title,
                issueType: issue.type,
                solutions: evolvedSolutions,
                phase: 'evolutionary'
              });
            }
          } catch (error: any) {
            console.warn(`Evolution timeout or error for ${issue.title}:`, error.message);
            this.emit('evolution-timeout', {
              issueId: issue.title,
              issueType: issue.type,
              fallbackSolutions: rankedQuickSolutions
            });
          } finally {
            this.evolutionaryEngine.removeListener('progress', progressHandler);
          }
        }
      } catch (error) {
        console.error(`Error processing issue ${issue.title}:`, error);
      }

      return issue;
    };

    // Process issues in parallel with concurrency limit
    const results: Issue[] = [];
    for (let i = 0; i < issues.length; i += MAX_CONCURRENT) {
      const batch = issues.slice(i, i + MAX_CONCURRENT);
      const batchResults = await Promise.all(batch.map(processIssue));
      results.push(...batchResults);
    }

    return results;
  }

  private shouldUseEvolutionFor(issue: Issue): boolean {
    const complexTypes = ['n1-query', 'inefficient-loop'];
    const highSeverity = issue.severity === 'critical' || issue.severity === 'high';
    return complexTypes.includes(issue.type) || highSeverity;
  }

  private createTimeout(ms: number): Promise<null> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(null), ms);
    });
  }

  addDetector(detector: any): void {
    this.detectors.push(detector);
  }

  getDetectors(): any[] {
    return this.detectors;
  }
}
