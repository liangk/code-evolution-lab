# Evolutionary Engine

The Evolutionary Engine (`backend/src/generators/evolutionary-engine.ts`) is the core AI component of Code Evolution Lab. It utilizes a genetic algorithm to iteratively improve and optimize code solutions for detected performance issues. 

Crucially, the engine evolves **transformation-based solutions derived from the original problematic code**, rather than relying on generic, abstract templates. This ensures the resulting solutions preserve the user's original business logic, variable names, and code structure.

---

## The Evolutionary Algorithm Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    EVOLUTIONARY ALGORITHM                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. INITIALIZATION                                              │
│     └─ Parse original code AST                                  │
│     └─ Apply base generator transformations to create seeds     │
│     └─ Populate remaining slots via random mutations            │
│                                                                 │
│  2. FITNESS EVALUATION                                          │
│     └─ Score each candidate (Performance, Preservation, etc.)   │
│                                                                 │
│  3. SELECTION                                                   │
│     └─ Tournament selection (Size: 3) to pick parents           │
│                                                                 │
│  4. CROSSOVER                                                   │
│     └─ Single-point AST statement boundary crossover            │
│                                                                 │
│  5. MUTATION                                                    │
│     └─ Apply AST-safe mutation operators (e.g. Variable Rename) │
│                                                                 │
│  6. SURVIVOR SELECTION                                          │
│     └─ Elitism (preserve top N) + Roulette Wheel selection      │
│                                                                 │
│  7. TERMINATION CHECK                                           │
│     └─ Stop if MAX_GENERATIONS reached or population converged  │
│                                                                 │
│  8. OUTPUT                                                      │
│     └─ Return top 5 solutions ranked by fitness                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Initialization

When an issue is detected, the engine requests initial seed solutions from the relevant `BaseSolutionGenerator`. These generators apply specific AST transformations (like extracting a loop query into a batch query) to the user's code.

If these initial seeds do not fill the `EVO_POPULATION_SIZE`, the engine generates the remaining candidates by applying random mutation operators (like variable renaming or query parameter modification) to the seeds. Every candidate's code is strictly validated using `validateGeneratedCode` and `fixDuplicateDeclarations` to ensure syntax validity before entering the population pool.

## 2. Fitness Evaluation

The `FitnessCalculator` (`backend/src/generators/fitness-calculator.ts`) evaluates every solution candidate and assigns a score from 0 to 100 based on a weighted preset.

### Fitness Factors
1. **Performance Gain**: Analyzes AST for database calls (fewer is better), loops (fewer is better), eager loading keywords (`include`, `populate`), and parallelization (`Promise.all`).
2. **Complexity Reduction**: Uses the estimated implementation time and cyclomatic complexity (counting `if`, `switch`, `for`, `&&`, etc.) to penalize overly complex solutions.
3. **Maintainability**: Analyzes line length, presence of comments, nesting depth, and whether the code relies on modern ORM abstractions versus raw SQL strings.
4. **Compatibility**: Checks if the generated code introduces new dependencies (like `dataloader`) that the user's project doesn't currently have.

### Weight Presets
The engine can be configured via `FITNESS_WEIGHT_PRESET` environment variable:

| Preset | Performance | Complexity | Maintainability | Compatibility | Best For |
|--------|-------------|------------|-----------------|---------------|----------|
| `balanced` (default)| 35% | 25% | 25% | 15% | General usage |
| `performance` | 55% | 15% | 15% | 15% | Mission-critical endpoints |
| `maintainability`| 20% | 20% | 45% | 15% | Complex legacy codebases |

## 3. Selection (Tournament)

To select parents for the next generation, the engine uses **Tournament Selection**. It randomly picks $K$ candidates (configurable via `EVO_TOURNAMENT_SIZE`, default 3) from the population and selects the one with the highest fitness score. This process is repeated to create pairs of parents.

## 4. Crossover

The crossover operator (`singlePointCrossover`) mimics biological reproduction by combining the code of two parent solutions. 

Because standard string crossover would destroy JavaScript syntax, the engine performs **AST-level Statement Boundary Crossover**. It parses both parents into statement arrays, picks a random split index, and concatenates the statements. It then auto-fixes any resulting duplicate variable declarations.

## 5. Mutation

The engine iterates through the new offspring. With a probability of `EVO_MUTATION_RATE` (default 30%), a candidate undergoes mutation via `applyRandomMutation` (`backend/src/generators/mutation-operators.ts`).

### Available Mutation Operators
1. **Variable Rename (`mutateVariableName`)**: Traverses the AST and intelligently renames a variable (e.g. adding prefixes/suffixes) while avoiding object property keys.
2. **Query Parameter Mutation (`mutateQueryParameter`)**: Injects, removes, or modifies ORM query objects (e.g., adding a `select: {}` clause or `take: 50` for pagination).
3. **ORM Method Mutation (`mutateORMMethod`)**: Swaps ORM methods safely (e.g., changing `findAll` to `findOne` to see if fitness improves).
4. **Add Optimization (`addOptimization`)**: Wraps a function body in a simple `Map`-based caching layer.

## 6. Survivor Selection

The next generation's population is formed using a hybrid approach:
1. **Elitism**: The absolute best candidates (configurable via `EVO_ELITISM_COUNT`, default 2) are guaranteed survival into the next generation.
2. **Roulette Wheel Selection**: The remaining slots are filled probabilistically based on fitness scores, allowing lower-fitness solutions a small chance to survive to maintain genetic diversity.

## 7. Termination & Convergence

The algorithm stops when one of two conditions is met:
1. **Maximum Generations**: Reaches `EVO_MAX_GENERATIONS` (default 10).
2. **Convergence**: If the improvement of the maximum fitness over the average fitness drops below `EVO_CONVERGENCE_THRESHOLD` (default 0.01), the population has stagnated, and the engine halts early to save time.

---

## Configuration Reference

The engine behavior is highly tunable via environment variables in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `EVO_ENABLE_ALGORITHM` | `true` | When false, simply returns the base generator templates instantly without evolving. |
| `EVO_POPULATION_SIZE` | `20` | Total candidates per generation. Higher = better quality, slower execution. |
| `EVO_MAX_GENERATIONS` | `10` | Maximum evolution cycles. |
| `EVO_MUTATION_RATE` | `0.3` | Probability (0.0 - 1.0) of a mutation occurring during reproduction. |
| `EVO_CROSSOVER_RATE` | `0.7` | Proportion of the new population generated via crossover. |
| `EVO_ELITISM_COUNT` | `2` | Number of elite solutions guaranteed to survive per generation. |
| `EVO_CONVERGENCE_THRESHOLD` | `0.01` | Early stop threshold. |
| `EVO_TOURNAMENT_SIZE` | `3` | Number of candidates competing in selection phase. |
| `FITNESS_WEIGHT_PRESET` | `balanced` | Defines the scoring weights (`balanced`, `performance`, `maintainability`). |

## Real-Time Progress via SSE

Because evolution takes time (often 5-30 seconds), the engine inherits from `EventEmitter`. It fires a `progress` event at the end of every generation. 

The API layer (`backend/src/api/routes/sse.routes.ts`) catches these events and streams them to the Angular frontend via Server-Sent Events (SSE). The payload includes the current generation, max generations, average fitness, and the code of the current best solution, allowing the UI to display a live "evolving code" visual.
