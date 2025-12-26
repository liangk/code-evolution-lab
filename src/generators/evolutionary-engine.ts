import { Issue, Solution, AnalysisContext } from '../types';
import { BaseSolutionGenerator } from './base-generator';
import { FitnessCalculator } from './fitness-calculator';
import { parseCode, generateCode, cloneAST, getStatements, isValidSyntax } from '../utils/ast-utils';
import { validateGeneratedCode } from '../utils/code-validator';
import { applyRandomMutation } from './mutation-operators';
import * as t from '@babel/types';
import { EventEmitter } from 'events';

/**
 * PLACEHOLDER: Evolutionary Algorithm Engine
 * 
 * This file is a placeholder for future implementation of a true evolutionary algorithm
 * for solution generation. Currently, solutions are generated from static templates.
 * 
 * The evolutionary approach will:
 * 1. Generate an initial population of solution candidates
 * 2. Evaluate fitness for each candidate
 * 3. Select parents based on fitness
 * 4. Apply crossover operators to create offspring
 * 5. Apply mutation operators to introduce variations
 * 6. Evolve over multiple generations
 * 7. Return the top N solutions
 * 
 * See: temp/phase3-implementation-plan.md for detailed implementation plan
 */

interface SolutionCandidate {
  id: string;
  ast: any; // Parsed code AST
  code: string; // Generated code
  fitness: number;
  generation: number;
  parentIds: string[];
  mutations: MutationHistory[];
}

interface MutationHistory {
  operator: string;
  generation: number;
  description: string;
}

interface EvolutionConfig {
  populationSize: number;
  maxGenerations: number;
  mutationRate: number;
  crossoverRate: number;
  elitismCount: number;
  convergenceThreshold: number;
}

export class EvolutionaryEngine extends EventEmitter {
  private config: EvolutionConfig = {
    populationSize: parseInt(process.env.EVO_POPULATION_SIZE || '20', 10),
    maxGenerations: parseInt(process.env.EVO_MAX_GENERATIONS || '10', 10),
    mutationRate: parseFloat(process.env.EVO_MUTATION_RATE || '0.3'),
    crossoverRate: parseFloat(process.env.EVO_CROSSOVER_RATE || '0.7'),
    elitismCount: parseInt(process.env.EVO_ELITISM_COUNT || '2', 10),
    convergenceThreshold: parseFloat(process.env.EVO_CONVERGENCE_THRESHOLD || '0.01'),
  };

  private tournamentSize = parseInt(process.env.EVO_TOURNAMENT_SIZE || '3', 10);
  private enableAlgorithm = process.env.EVO_ENABLE_ALGORITHM === 'true';
  private fitnessCalculator = new FitnessCalculator();

  constructor() {
    super();
  }

  /**
   * Generate unique ID for candidates
   */
  private generateId(): string {
    return `cand_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Main evolution loop - Implements complete evolutionary algorithm
   */
  async evolve(
    issue: Issue,
    context: AnalysisContext,
    baseGenerator: BaseSolutionGenerator
  ): Promise<Solution[]> {
    // Check if algorithm is enabled
    if (!this.enableAlgorithm) {
      console.log('⚠️  Evolutionary algorithm disabled. Using template-based generation.');
      return baseGenerator.generateSolutions(issue, context);
    }

    console.log('🧬 Starting evolutionary algorithm...');
    console.log(`📊 Config: Population=${this.config.populationSize}, Generations=${this.config.maxGenerations}`);
    
    try {
      // Step 1: Generate initial population
      let population = await this.generateInitialPopulation(issue, context, baseGenerator);
      console.log(`✅ Initial population: ${population.length} candidates`);
      
      if (population.length === 0) {
        console.warn('⚠️  No initial population generated. Falling back to templates.');
        return baseGenerator.generateSolutions(issue, context);
      }

      // Step 2: Evolution loop
      for (let generation = 0; generation < this.config.maxGenerations; generation++) {
        console.log(`\n🔄 Generation ${generation + 1}/${this.config.maxGenerations}`);
        
        // 2a. Evaluate fitness
        population = await this.evaluateFitness(population, issue, context);
        const bestFitness = Math.max(...population.map(c => c.fitness));
        const avgFitness = population.reduce((sum, c) => sum + c.fitness, 0) / population.length;
        console.log(`  📈 Best fitness: ${bestFitness.toFixed(2)}, Avg: ${avgFitness.toFixed(2)}`);
        
        // Emit progress event
        const bestCandidate = population.reduce((best, c) => c.fitness > best.fitness ? c : best);
        this.emit('progress', {
          generation: generation + 1,
          maxGenerations: this.config.maxGenerations,
          bestFitness,
          avgFitness,
          bestSolution: {
            code: bestCandidate.code,
            fitness: bestCandidate.fitness
          },
          population: population.map(c => ({ fitness: c.fitness, generation: c.generation }))
        });
        
        // 2b. Check convergence
        if (this.hasConverged(population, generation)) {
          console.log(`✅ Converged at generation ${generation + 1}`);
          break;
        }
        
        // 2c. Select parents
        const parents = this.selectParents(population);
        console.log(`  👥 Selected ${parents.length} parent pairs`);
        
        // 2d. Crossover
        const offspring = this.crossover(parents);
        console.log(`  🧬 Created ${offspring.length} offspring`);
        
        // 2e. Mutate
        const mutated = this.mutate(offspring, generation);
        const mutationCount = mutated.filter((c, i) => c.code !== offspring[i].code).length;
        console.log(`  🔀 Applied ${mutationCount} mutations`);
        
        // 2f. Evaluate offspring
        const evaluatedOffspring = await this.evaluateFitness(mutated, issue, context);
        
        // 2g. Select survivors
        population = this.selectSurvivors(population, evaluatedOffspring);
      }
      
      // Step 3: Return top solutions
      population.sort((a, b) => b.fitness - a.fitness);
      const topCandidates = population.slice(0, Math.min(5, population.length));
      
      console.log(`\n🎯 Evolution complete! Returning top ${topCandidates.length} solutions`);
      console.log(`   Best fitness: ${topCandidates[0].fitness.toFixed(2)}`);
      
      return this.convertToSolutions(topCandidates);
    } catch (error) {
      console.error('❌ Evolution error:', error);
      console.log('⚠️  Falling back to template-based generation');
      return baseGenerator.generateSolutions(issue, context);
    }
  }

  /**
   * Generate initial population from template solutions
   */
  private async generateInitialPopulation(
    issue: Issue,
    context: AnalysisContext,
    baseGenerator: BaseSolutionGenerator
  ): Promise<SolutionCandidate[]> {
    try {
      // 1. Get template solutions from base generator
      const templates = await baseGenerator.generateSolutions(issue, context);
      
      if (templates.length === 0) {
        console.warn('No template solutions generated');
        return [];
      }

      const candidates: SolutionCandidate[] = [];
      
      // 2. Create base candidates from templates
      for (const template of templates) {
        // Validate template before using it
        const validation = validateGeneratedCode(template.code);
        if (!validation.valid) {
          console.warn(`Skipping invalid template: ${validation.errors.join(', ')}`);
          continue;
        }
        
        try {
          const ast = parseCode(template.code);
          candidates.push({
            id: this.generateId(),
            ast,
            code: template.code,
            fitness: 0,
            generation: 0,
            parentIds: [],
            mutations: []
          });
        } catch (error) {
          console.warn(`Failed to parse template: ${error}`);
        }
      }
      
      // 3. Create variations with mutations
      const variationsPerTemplate = Math.floor((this.config.populationSize - templates.length) / templates.length);
      
      for (const template of templates) {
        for (let i = 0; i < variationsPerTemplate; i++) {
          const mutationResult = applyRandomMutation(template.code);
          
          if (mutationResult.success) {
            // Validate code before adding to population
            const validation = validateGeneratedCode(mutationResult.code);
            if (!validation.valid) {
              continue;
            }
            
            try {
              const ast = parseCode(mutationResult.code);
              candidates.push({
                id: this.generateId(),
                ast,
                code: mutationResult.code,
                fitness: 0,
                generation: 0,
                parentIds: [],
                mutations: [{
                  operator: 'initial',
                  generation: 0,
                  description: mutationResult.description
                }]
              });
            } catch (error) {
              // Skip invalid mutations
            }
          }
        }
      }
      
      // 4. Fill remaining slots if needed
      while (candidates.length < this.config.populationSize && templates.length > 0) {
        const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
        const mutationResult = applyRandomMutation(randomTemplate.code);
        
        if (mutationResult.success) {
          // Validate code before adding to population
          const validation = validateGeneratedCode(mutationResult.code);
          if (!validation.valid) {
            continue;
          }
          
          try {
            const ast = parseCode(mutationResult.code);
            candidates.push({
              id: this.generateId(),
              ast,
              code: mutationResult.code,
              fitness: 0,
              generation: 0,
              parentIds: [],
              mutations: [{
                operator: 'initial',
                generation: 0,
                description: mutationResult.description
              }]
            });
          } catch (error) {
            // Skip invalid mutations
          }
        }
      }
      
      return candidates.slice(0, this.config.populationSize);
    } catch (error) {
      console.error('Error generating initial population:', error);
      return [];
    }
  }

  /**
   * Evaluate fitness for all candidates
   */
  private async evaluateFitness(
    candidates: SolutionCandidate[],
    issue: Issue,
    context: AnalysisContext
  ): Promise<SolutionCandidate[]> {
    return candidates.map(candidate => {
      // Convert candidate to Solution format for fitness calculation
      const solution: Solution = {
        id: candidate.id,
        issueId: issue.id || '',
        rank: 0,
        type: issue.type,
        code: candidate.code,
        fitnessScore: 0,
        reasoning: '',
        implementationTime: 0,
        riskLevel: 'medium'
      };
      
      // Calculate fitness using existing FitnessCalculator
      const fitness = this.fitnessCalculator.calculateFitness(solution, issue, context);
      
      return {
        ...candidate,
        fitness
      };
    });
  }

  /**
   * Select parent pairs using tournament selection
   */
  private selectParents(population: SolutionCandidate[]): [SolutionCandidate, SolutionCandidate][] {
    const pairs: [SolutionCandidate, SolutionCandidate][] = [];
    const numPairs = Math.floor(population.length * this.config.crossoverRate / 2);
    
    for (let i = 0; i < numPairs; i++) {
      const parent1 = this.tournamentSelect(population, this.tournamentSize);
      const parent2 = this.tournamentSelect(population, this.tournamentSize);
      pairs.push([parent1, parent2]);
    }
    
    return pairs;
  }

  /**
   * Tournament selection - select K random candidates and return the best
   */
  private tournamentSelect(population: SolutionCandidate[], tournamentSize: number): SolutionCandidate {
    const tournament: SolutionCandidate[] = [];
    
    for (let i = 0; i < tournamentSize; i++) {
      const randomIndex = Math.floor(Math.random() * population.length);
      tournament.push(population[randomIndex]);
    }
    
    return tournament.reduce((best, current) => 
      current.fitness > best.fitness ? current : best
    );
  }

  /**
   * Crossover operator - combines parent solutions
   */
  private crossover(parents: [SolutionCandidate, SolutionCandidate][]): SolutionCandidate[] {
    const offspring: SolutionCandidate[] = [];
    
    for (const [parent1, parent2] of parents) {
      const child1 = this.singlePointCrossover(parent1, parent2);
      const child2 = this.singlePointCrossover(parent2, parent1);
      
      offspring.push(child1, child2);
    }
    
    return offspring;
  }

  /**
   * Single-point crossover - combines code at statement boundary
   */
  private singlePointCrossover(parent1: SolutionCandidate, parent2: SolutionCandidate): SolutionCandidate {
    try {
      const statements1 = getStatements(parent1.ast);
      const statements2 = getStatements(parent2.ast);
      
      if (statements1.length === 0 || statements2.length === 0) {
        return { ...parent1 };
      }
      
      // Choose random split point
      const splitPoint = Math.floor(Math.random() * Math.min(statements1.length, statements2.length));
      
      // Combine statements
      const childStatements = [
        ...statements1.slice(0, splitPoint),
        ...statements2.slice(splitPoint)
      ];
      
      // Create new AST
      const childAst = cloneAST(parent1.ast) as t.File;
      childAst.program.body = childStatements;
      
      const childCode = generateCode(childAst);
      
      // Validate
      if (!isValidSyntax(childCode)) {
        return { ...parent1 };
      }
      
      return {
        id: this.generateId(),
        ast: childAst,
        code: childCode,
        fitness: 0,
        generation: parent1.generation + 1,
        parentIds: [parent1.id, parent2.id],
        mutations: []
      };
    } catch (error) {
      return { ...parent1 };
    }
  }

  /**
   * Mutation operator - applies random mutations
   */
  private mutate(offspring: SolutionCandidate[], generation: number): SolutionCandidate[] {
    const mutated: SolutionCandidate[] = [];
    
    for (const candidate of offspring) {
      if (Math.random() < this.config.mutationRate) {
        const mutationResult = applyRandomMutation(candidate.code);
        
        if (mutationResult.success) {
          // Validate mutated code before accepting it
          const validation = validateGeneratedCode(mutationResult.code);
          if (!validation.valid) {
            mutated.push(candidate);
            continue;
          }
          
          try {
            const ast = parseCode(mutationResult.code);
            mutated.push({
              ...candidate,
              code: mutationResult.code,
              ast,
              mutations: [
                ...candidate.mutations,
                {
                  operator: 'mutation',
                  generation,
                  description: mutationResult.description
                }
              ]
            });
          } catch (error) {
            mutated.push(candidate);
          }
        } else {
          mutated.push(candidate);
        }
      } else {
        mutated.push(candidate);
      }
    }
    
    return mutated;
  }


  /**
   * Select survivors - elitism + fitness-based selection
   */
  private selectSurvivors(
    population: SolutionCandidate[],
    offspring: SolutionCandidate[]
  ): SolutionCandidate[] {
    // Combine population and offspring
    const combined = [...population, ...offspring];
    
    // Sort by fitness (descending)
    combined.sort((a, b) => b.fitness - a.fitness);
    
    // Keep top elites
    const survivors = combined.slice(0, this.config.elitismCount);
    
    // Fill remaining slots with roulette wheel selection
    const remaining = combined.slice(this.config.elitismCount);
    const totalFitness = remaining.reduce((sum, c) => sum + Math.max(0, c.fitness), 0);
    
    while (survivors.length < this.config.populationSize && remaining.length > 0) {
      if (totalFitness === 0) {
        // If all fitness is 0, select randomly
        const randomIndex = Math.floor(Math.random() * remaining.length);
        survivors.push(remaining[randomIndex]);
        remaining.splice(randomIndex, 1);
      } else {
        // Roulette wheel selection
        let random = Math.random() * totalFitness;
        
        for (let i = 0; i < remaining.length; i++) {
          random -= Math.max(0, remaining[i].fitness);
          if (random <= 0) {
            survivors.push(remaining[i]);
            remaining.splice(i, 1);
            break;
          }
        }
      }
    }
    
    return survivors.slice(0, this.config.populationSize);
  }

  /**
   * Convert candidates to Solution objects
   */
  private convertToSolutions(candidates: SolutionCandidate[]): Solution[] {
    return candidates.map((candidate, index) => ({
      id: candidate.id,
      issueId: '',
      rank: index + 1,
      type: 'evolved',
      code: candidate.code,
      fitnessScore: candidate.fitness,
      reasoning: `Evolved solution (Generation ${candidate.generation}, ${candidate.mutations.length} mutations applied)`,
      implementationTime: 5,
      riskLevel: 'medium'
    }));
  }

  /**
   * Check if evolution has converged
   */
  private hasConverged(population: SolutionCandidate[], generation: number): boolean {
    // Check max generations
    if (generation >= this.config.maxGenerations - 1) {
      return true;
    }
    
    // Check if all candidates have similar fitness (low diversity)
    if (population.length > 1) {
      const avgFitness = population.reduce((sum, c) => sum + c.fitness, 0) / population.length;
      const maxFitness = Math.max(...population.map(c => c.fitness));
      
      if (maxFitness > 0) {
        const improvement = (maxFitness - avgFitness) / maxFitness;
        if (improvement < this.config.convergenceThreshold) {
          return true;
        }
      }
    }
    
    return false;
  }
}
