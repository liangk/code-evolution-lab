# Detectors

Code Evolution Lab includes four robust, AST-based code detectors that identify performance anti-patterns, memory leaks, and architectural inefficiencies in JavaScript and TypeScript codebases. The detection engine is built on top of Babel (`@babel/parser`, `@babel/traverse`, `@babel/types`), allowing for deep semantic analysis rather than simple regex matching.

## Architecture

All detectors extend the `BaseDetector` abstract class (`backend/src/detectors/base-detector.ts`) and implement a common interface. The engine passes the parsed Abstract Syntax Tree (AST) and analysis context to each detector.

```typescript
export abstract class BaseDetector {
  abstract name: string;
  protected issues: Issue[] = [];

  abstract detect(ast: any, context: AnalysisContext): Promise<DetectorResult>;

  // Helper to standardise issue creation
  protected createIssue(
    type: string,
    severity: 'critical' | 'high' | 'medium' | 'low',
    context: AnalysisContext,
    lineNumber: number,
    title: string,
    description: string,
    codeBefore: string,
    codeAfter?: string,
    estimatedImpact?: EstimatedImpact
  ): Issue { ... }
}
```

The `AnalysisContext` provides detectors with the original source code, file path, AST, and an optional `ORMContext` (which maps symbols and imports to specific ORMs like Prisma or Sequelize).

---

## 1. N+1 Query Detector

**File:** `backend/src/detectors/n1-query-detector.ts`

The N+1 Query Detector identifies the classic anti-pattern where a database query is executed inside a loop, resulting in $N+1$ database round-trips instead of 1 batched query.

### Detection Mechanism

1. **Loop Identification**: Traverses the AST looking for loop constructs: `ForOfStatement`, `ForStatement`, `ForInStatement`, `WhileStatement`, and array methods like `forEach` and `map`.
2. **Query Identification**: Inside each identified loop, it searches for `AwaitExpression` or `CallExpression` nodes matching known database method patterns (e.g., `findMany`, `findOne`, `findAll`, `query`, `execute`).
3. **ORM Resolution**: Uses `ImportAnalyzer` and `ORMContext` to confidently link a method call (e.g., `prisma.user.findMany`) to an ORM. Supported ORMs include Prisma, Sequelize, Mongoose, TypeORM, Knex, and Raw SQL.
4. **Severity Calculation**: 
   - `critical`: 3 or more distinct queries inside the loop.
   - `high`: 2 distinct queries inside the loop.
   - `medium`: 1 query inside the loop.

### Impact Calculation

The detector calculates a concrete impact score based on a hypothetical $N=100$ iterations. 
*Example impact output:* "101 queries for 100 items vs 1 optimal query (101x slower)".

### Example Detection

```javascript
// ❌ Detected: n_plus_1_query (Severity: High/Critical)
for (const user of users) {
  // Detector flags this `findMany` call inside the `for-of` loop
  const orders = await prisma.orders.findMany({ 
    where: { userId: user.id } 
  });
}
```

---

## 2. Inefficient Loop Detector

**File:** `backend/src/detectors/inefficient-loop-detector.ts`

This is the most comprehensive detector, analyzing loops for 9 distinct performance-degrading patterns. It calculates algorithmic complexity ($O(n^2)$, $O(n^3)$) and flags operations that block the Node.js event loop.

### Detected Anti-Patterns

| Pattern ID | Trigger Condition | Severity | Impact |
|------------|-------------------|----------|--------|
| `nested_loops` | `For/While` loops nested 2+ levels deep | High/Critical | O(n²) or O(n³) exponential degradation |
| `inefficient_array_chaining` | `.filter().map()` call chains | Medium | Two-pass array iteration (50% slower) |
| `nested_array_methods` | `.map()` inside a `.forEach()`, etc. | High | Hidden O(n²) complexity |
| `array_push_in_loop` | `Array.push()` called inside a loop | Low | Minor memory/allocation overhead |
| `dom_manipulation_in_loop` | `appendChild` / `innerHTML` in loop | High | Severe browser reflow/repaint jank |
| `await_in_loop` | `await` expression inside a loop | High | Sequential execution instead of parallel |
| `string_concat_in_loop` | `+=` with strings inside a loop | Medium | Repeated string allocation / memory churn |
| `regex_compilation_in_loop` | `new RegExp()` or literal inside loop | Medium | Unnecessary recompilation overhead |
| `json_operations_in_loop` | `JSON.parse` / `stringify` in loop | High | Expensive CPU serialization |
| `array_lookup_in_loop` | `.includes()`, `.indexOf()` in loop | High | O(n²) from nested linear searches |
| `object_keys_with_lookup` | `Object.keys()` + `.includes()` | High | O(n²) key extraction and search |
| `sync_file_io_in_loop` | `readFileSync`, `writeFileSync` in loop | Critical | Blocks the entire Node.js event loop |

### Deep Dive: Algorithmic Complexity Tracking

The detector features a recursive `countNestedLoops` function that traverses an AST node to calculate the exact depth of loop nesting, accurately reporting the Big-O complexity ($O(n^2)$, $O(n^3)$, etc.) to the user.

---

## 3. Memory Leak Detector

**File:** `backend/src/detectors/memory-leak-detector.ts`

The Memory Leak Detector analyzes code for uncleaned event listeners, uncleared intervals, and heavy closures. It is highly context-aware and specifically tracks React, Vue, and Angular lifecycle hooks.

### Framework Context Detection

Before analyzing leaks, the detector maps the framework context:
- **React**: Looks for `useEffect` cleanup returns or `componentWillUnmount`.
- **Vue**: Looks for `unmounted` or `beforeUnmount` lifecycle hooks.
- **Angular**: Looks for `ngOnDestroy` class methods.

### Detected Anti-Patterns

#### `event_listener_leak` (Severity: High)
Finds `addEventListener` calls. It then traverses the function scope (and the framework's cleanup lifecycle method, if applicable) looking for a corresponding `removeEventListener`. If missing, it flags a leak.

#### `timer_leak` (Severity: Critical)
Finds `setInterval` or `setTimeout` calls. It checks if the timer ID is assigned to a variable (`const id = setInterval(...)`). It then searches the scope and lifecycle methods for `clearInterval` or `clearTimeout`. Uncleaned intervals are flagged as critical because they continuously consume CPU and retain memory.

#### `global_variable_leak` (Severity: Medium)
Detects assignments to `window` or `global` objects (`window.data = ...`), which bypass garbage collection and pollute the global namespace.

#### `closure_memory_leak` (Severity: Medium)
Detects arrow functions or function expressions that capture excessively large arrays (>100 elements) from their outer scope, preventing the JavaScript garbage collector from freeing that memory.

---

## 4. Large Payload Detector

**File:** `backend/src/detectors/large-payload-detector.ts`

The Large Payload Detector identifies endpoints and database queries that pull or return excessive amounts of data, leading to memory bloat and network latency.

### Data Flow Tracking

This detector features an advanced `isDataFlowConnected` tracker. It can trace a variable generated by a database query (e.g., `const users = await prisma.user.findMany()`) through assignments and verify if that exact variable is passed into an API response (e.g., `res.json(users)`).

### Detected Anti-Patterns

#### `large_api_payload` (Severity: High)
Triggers when a database query's result flows directly into a `res.json()` call **without** the presence of pagination (no `limit`, `take`, `cursor`) AND **without** field selection (no `select`, `attributes`).
*Exceptions:* Safely ignores queries wrapped in pagination helpers (e.g., `paginateResults()`) or streams (`createReadStream`).

#### `select_all_query` (Severity: Medium)
Triggers on database ORM calls (`findAll`, `findMany`) that do not contain an `attributes` or `select` object, AND lack a `limit` or `take` constraint. This flags the classic `SELECT * FROM table` anti-pattern.

#### `large_return_payload` (Severity: High)
Triggers when a function directly returns (`return await prisma.user.findMany()`) the results of an unbounded database query without pagination limits.

---

## Adding Custom Detectors

To add a new detector to the Code Evolution Lab engine:

1. Create a new file in `backend/src/detectors/`.
2. Extend `BaseDetector`.
3. Implement the `detect` method using `@babel/traverse`.
4. Register the detector in `backend/src/analyzer/code-analyzer.ts`.

```typescript
import traverse from '@babel/traverse';
import { BaseDetector } from './base-detector';
import { AnalysisContext, DetectorResult } from '../types';

export class MyCustomDetector extends BaseDetector {
  name = 'My Custom Detector';

  async detect(ast: any, context: AnalysisContext): Promise<DetectorResult> {
    this.reset();

    traverse(ast, {
      CallExpression: (path) => {
        if (path.node.callee.name === 'eval') {
          this.issues.push(this.createIssue(
            'eval_usage',
            'critical',
            context,
            path.node.loc?.start.line || 0,
            'Eval is Evil',
            'Using eval() is a severe security and performance risk.',
            this.getCode(path.node, context.sourceCode)
          ));
        }
      }
    });

    return { issues: this.issues, detectorName: this.name };
  }
}
```
