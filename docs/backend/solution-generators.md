# Solution Generators

Solution generators (`backend/src/generators/`) are responsible for analyzing detected issues and generating initial "seed" solutions. These seeds are then passed into the Evolutionary Engine for iterative optimization.

The Code Evolution Lab's solution generation architecture is built around **AST Transformation**. Rather than replacing the user's code with a generic template, generators actively parse the original buggy code, extract the business logic and variable names, and restructure the AST to apply the fix.

---

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    SOLUTION GENERATION                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Issue Detected by Detector                                      │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────┐                                     │
│  │ BaseSolutionGenerator   │  ← Abstract class                   │
│  └────────┬────────────────┘                                     │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────────┐                                     │
│  │ Specialized Generator   │  ← e.g., N1SolutionGenerator        │
│  │ (AST Analysis Phase)    │    Extracts ORM context, variables  │
│  └────────┬────────────────┘                                     │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────────┐                                     │
│  │ Transformation Strategy │  ← Selects the best strategy based  │
│  │ Application             │    on code pattern analysis         │
│  └────────┬────────────────┘                                     │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────────┐                                     │
│  │ Output to Evol Engine   │  ← Returns Solution[] seeds         │
│  └─────────────────────────┘                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. N+1 Solution Generator

**File:** `backend/src/generators/n1-solution-generator.ts`

This generator resolves $N+1$ query issues by extracting queries out of loops and replacing them with batch queries or eager loading structures. 

### AST Analysis Phase
It uses a `CodeContext` analyzer to extract:
- **ORM Detection**: Identifies whether the user is using `prisma`, `sequelize`, `mongoose`, or `angular-forms`.
- **Variables**: Collects variable names and their types.
- **Loop Structure**: Identifies the loop variable and the collection being iterated over.

### Transformation Strategies

Based on the detected `CodeContext`, it selects one or more of the following strategies:

#### `prisma-include` Strategy
- **Trigger**: The code uses `prisma` and queries relations.
- **Action**: Generates a single `prisma.model.findMany({ include: { relation: true } })` query, replacing the multiple sequential `.findMany()` calls.

#### `sequelize-include` Strategy
- **Trigger**: The code uses `sequelize` `findAll()`.
- **Action**: Generates a single `.findAll({ include: [{ model: relation }] })` query.

#### `batch-query-before-loop` Strategy
- **Trigger**: The code loops over a collection and makes async calls inside.
- **Action**: 
  1. Generates an array map to extract all IDs before the loop (`const allIds = collection.map(x => x.id)`).
  2. Generates a batch database call.
  3. Reconstructs the original loop but replaces the database `await` with an $O(1)$ map lookup (`dataMap.get(id)`).

#### `form-batch-read` Strategy (Angular Specific)
- **Trigger**: Multiple `form.get('field')?.value` calls in an Angular reactive form.
- **Action**: Replaces them with a single `const formValues = form.getRawValue();` call to reduce property access overhead.

---

## 2. Inefficient Loop Solution Generator

**File:** `backend/src/generators/inefficient-loop-solution-generator.ts`

Optimizes algorithmic complexity and runtime performance issues inside loops.

### Transformation Strategies

#### $O(n^2)$ to $O(n)$ Hash Map Transformation
- **Trigger**: A nested loop or an `.indexOf()`, `.find()`, `.includes()` call inside a loop over a large array.
- **Action**: Extracts the inner array into a `new Map()` or `new Set()` before the outer loop begins. Replaces the inner loop search with a highly efficient `.has()` or `.get()` lookup.

#### Regex Hoisting
- **Trigger**: `new RegExp()` or a literal `/pattern/` declared inside a loop body.
- **Action**: Moves the regex declaration to the scope immediately outside and above the loop.

#### `Promise.all` Parallelization
- **Trigger**: Independent `await` expressions executed sequentially inside a `for-of` loop.
- **Action**: Refactors the loop into an `.map()` that returns an array of promises, wrapped in `await Promise.all()`.

---

## 3. Memory Leak Solution Generator

**File:** `backend/src/generators/memory-leak-solution-generator.ts`

Adds proper lifecycle cleanup code to prevent memory exhaustion.

### Transformation Strategies

#### React `useEffect` Cleanup
- **Trigger**: `addEventListener` or `setInterval` called inside a `useEffect` that lacks a return function.
- **Action**: Injects a `return () => { ... }` block containing the exact corresponding `removeEventListener` or `clearInterval` for the specific variables used.

#### Angular `ngOnDestroy` Injection
- **Trigger**: Missing cleanup in an Angular component class.
- **Action**: Generates an `ngOnDestroy()` method (or appends to an existing one) to handle the cleanup.

---

## 4. Large Payload Solution Generator

**File:** `backend/src/generators/large-payload-solution-generator.ts`

Reduces network bandwidth and database memory pressure.

### Transformation Strategies

#### Field Selection Injection
- **Trigger**: An ORM query like `prisma.user.findMany()` feeding directly into an API response without field selection.
- **Action**: Reads the variables actually accessed in the surrounding code and injects a `select: { ... }` object containing only those required fields.

#### Pagination Injection
- **Trigger**: An unbounded `findMany()` or `findAll()`.
- **Action**: Modifies the query AST to inject `limit: 50` or `take: 50` arguments to prevent returning massive datasets.

---

## Creating Custom Generators

To build a custom generator, you must extend the `BaseSolutionGenerator` class (`backend/src/generators/base-generator.ts`).

1. Define a class extending `BaseSolutionGenerator`.
2. Implement the `generateSolutions` method.
3. Write your AST transformation strategies using Babel.
4. Return an array of `Solution` objects, ensuring the `code` property contains your newly transformed string.

```typescript
import { BaseSolutionGenerator, TransformationStrategy } from './base-generator';
import { Issue, Solution, AnalysisContext } from '../types';

export class CustomSolutionGenerator extends BaseSolutionGenerator {
  name = 'Custom Solution Generator';

  async generateSolutions(issue: Issue, context: AnalysisContext): Promise<Solution[]> {
    const originalCode = issue.codeBefore || '';
    
    // Apply AST transformations here to generate `fixedCode`
    const fixedCode = this.applyMyASTTransform(originalCode);
    
    return [{
      id: this.generateId(),
      issueId: issue.id,
      rank: 1, // Let the Evolutionary Engine sort this later
      type: 'custom_fix',
      code: fixedCode,
      fitnessScore: 0, // Calculated by evolutionary engine
      reasoning: 'Applied custom AST transformation',
      implementationTime: 15,
      riskLevel: 'low'
    }];
  }

  private applyMyASTTransform(code: string): string {
    // Traverse and modify AST...
    return code;
  }
}
```
