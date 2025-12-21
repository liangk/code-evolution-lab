import { BaseSolutionGenerator } from './base-generator';
import { Issue, Solution, AnalysisContext } from '../types';

export class InefficientLoopSolutionGenerator extends BaseSolutionGenerator {
  name = 'Inefficient Loop Solution Generator';

  async generateSolutions(issue: Issue, context?: AnalysisContext): Promise<Solution[]> {
    const solutions: Solution[] = [];
    const issueType = issue.type;

    // Route to specific solution generators based on issue type
    switch (issueType) {
      case 'await_in_loop':
        solutions.push(...this.generateAwaitInLoopSolutions(issue));
        break;
      case 'array_lookup_in_loop':
        solutions.push(...this.generateArrayLookupSolutions(issue));
        break;
      case 'nested_loops':
        solutions.push(...this.generateNestedLoopSolutions(issue));
        break;
      case 'string_concat_in_loop':
        solutions.push(...this.generateStringConcatSolutions(issue));
        break;
      case 'regex_compilation_in_loop':
        solutions.push(...this.generateRegexSolutions(issue));
        break;
      case 'json_operations_in_loop':
        solutions.push(...this.generateJSONOperationsSolutions(issue));
        break;
      case 'sync_file_io_in_loop':
        solutions.push(...this.generateSyncFileIOSolutions(issue));
        break;
      case 'inefficient_array_chaining':
        solutions.push(...this.generateArrayChainingSolutions(issue));
        break;
      case 'nested_array_methods':
        solutions.push(...this.generateNestedArrayMethodsSolutions(issue));
        break;
      case 'dom_manipulation_in_loop':
        solutions.push(...this.generateDOMManipulationSolutions(issue));
        break;
      default:
        // Generic loop optimization solutions
        solutions.push(...this.generateGenericLoopSolutions(issue));
    }

    // TODO: PLACEHOLDER FOR EVOLUTIONARY ALGORITHM
    // Future enhancement: Apply evolutionary algorithm to generate and evolve solutions
    // - Generate initial population from templates above
    // - Apply mutation operators (see phase3-implementation-plan.md)
    // - Apply crossover operators to combine solutions
    // - Evolve over multiple generations
    // - Return top N solutions based on fitness
    // See: src/generators/evolutionary-engine.ts (to be implemented)

    return solutions.sort((a, b) => b.fitnessScore - a.fitnessScore);
  }

  private generateAwaitInLoopSolutions(issue: Issue): Solution[] {
    const solutions: Solution[] = [];

    // Solution 1: Promise.all with map
    solutions.push(this.createSolution(
      issue.id,
      1,
      'promise_all_map',
      `// Before: Sequential await in loop
for (const item of items) {
  const result = await processItem(item);
  results.push(result);
}

// After: Parallel execution with Promise.all
const results = await Promise.all(
  items.map(item => processItem(item))
);

// All promises execute concurrently, dramatically faster`,
      this.calculateFitnessScore(95, 15, 95, 100),
      'Use Promise.all with map to execute all promises concurrently. This is the simplest and most effective solution for independent async operations.',
      10,
      'low'
    ));

    // Solution 2: Promise.allSettled for error handling
    solutions.push(this.createSolution(
      issue.id,
      2,
      'promise_all_settled',
      `// Before: Sequential await in loop
for (const item of items) {
  try {
    const result = await processItem(item);
    results.push(result);
  } catch (error) {
    console.error('Failed:', error);
  }
}

// After: Promise.allSettled for robust error handling
const settled = await Promise.allSettled(
  items.map(item => processItem(item))
);

const results = settled
  .filter(result => result.status === 'fulfilled')
  .map(result => result.value);

const errors = settled
  .filter(result => result.status === 'rejected')
  .map(result => result.reason);

// Continues even if some promises fail`,
      this.calculateFitnessScore(92, 25, 90, 100),
      'Use Promise.allSettled when you need to handle individual failures gracefully. All promises execute, and you get results for both successes and failures.',
      15,
      'low'
    ));

    // Solution 3: Batched processing with p-limit
    solutions.push(this.createSolution(
      issue.id,
      3,
      'batched_concurrency',
      `// Install: npm install p-limit

import pLimit from 'p-limit';

// Before: Sequential await in loop
for (const item of items) {
  const result = await processItem(item);
  results.push(result);
}

// After: Controlled concurrency with batching
const limit = pLimit(5); // Max 5 concurrent operations

const results = await Promise.all(
  items.map(item => limit(() => processItem(item)))
);

// Prevents overwhelming the system with too many concurrent operations`,
      this.calculateFitnessScore(90, 40, 85, 85),
      'Use p-limit for controlled concurrency when dealing with rate limits, database connections, or resource constraints. Balances speed with system stability.',
      30,
      'low'
    ));

    return solutions;
  }

  private generateArrayLookupSolutions(issue: Issue): Solution[] {
    const solutions: Solution[] = [];

    // Solution 1: Convert to Set for O(1) lookups
    solutions.push(this.createSolution(
      issue.id,
      1,
      'array_to_set',
      `// Before: O(n²) with array.includes()
const validIds = [1, 2, 3, 4, 5];
const filtered = items.filter(item => validIds.includes(item.id));

// After: O(n) with Set
const validIdsSet = new Set([1, 2, 3, 4, 5]);
const filtered = items.filter(item => validIdsSet.has(item.id));

// Set.has() is O(1) vs array.includes() O(n)`,
      this.calculateFitnessScore(98, 10, 95, 100),
      'Convert array to Set for O(1) membership checks. This is the simplest and most effective solution for lookup-heavy operations.',
      5,
      'low'
    ));

    // Solution 2: Use Map for key-value lookups
    solutions.push(this.createSolution(
      issue.id,
      2,
      'array_to_map',
      `// Before: O(n²) with array.find()
const users = [...]; // Large array
for (const order of orders) {
  const user = users.find(u => u.id === order.userId);
  order.userName = user?.name;
}

// After: O(n) with Map
const userMap = new Map(users.map(u => [u.id, u]));
for (const order of orders) {
  const user = userMap.get(order.userId);
  order.userName = user?.name;
}

// Map.get() is O(1) vs array.find() O(n)`,
      this.calculateFitnessScore(98, 15, 90, 100),
      'Use Map for key-value lookups when you need to retrieve objects by ID. Provides O(1) access with better semantics than Set.',
      10,
      'low'
    ));

    // Solution 3: Index-based lookup object
    solutions.push(this.createSolution(
      issue.id,
      3,
      'index_object',
      `// Before: O(n²) with array.find()
const users = [...];
for (const order of orders) {
  const user = users.find(u => u.id === order.userId);
  order.userName = user?.name;
}

// After: O(n) with indexed object
const userIndex = users.reduce((acc, user) => {
  acc[user.id] = user;
  return acc;
}, {});

for (const order of orders) {
  const user = userIndex[order.userId];
  order.userName = user?.name;
}

// Plain object works well for simple cases`,
      this.calculateFitnessScore(95, 20, 85, 100),
      'Use plain object for indexing when you prefer traditional JavaScript patterns. Slightly less performant than Map but more familiar to many developers.',
      10,
      'low'
    ));

    return solutions;
  }

  private generateNestedLoopSolutions(issue: Issue): Solution[] {
    const solutions: Solution[] = [];

    // Solution 1: Hash map to eliminate inner loop
    solutions.push(this.createSolution(
      issue.id,
      1,
      'hash_map_join',
      `// Before: O(n²) nested loops
for (const user of users) {
  for (const order of orders) {
    if (order.userId === user.id) {
      user.orders.push(order);
    }
  }
}

// After: O(n) with hash map
const ordersByUser = orders.reduce((acc, order) => {
  if (!acc[order.userId]) acc[order.userId] = [];
  acc[order.userId].push(order);
  return acc;
}, {});

for (const user of users) {
  user.orders = ordersByUser[user.id] || [];
}

// Reduced from O(n²) to O(n)`,
      this.calculateFitnessScore(98, 25, 90, 100),
      'Use hash map to group data and eliminate nested loops. This is the most common and effective solution for join-like operations.',
      20,
      'low'
    ));

    // Solution 2: Sort and merge (when data is sortable)
    solutions.push(this.createSolution(
      issue.id,
      2,
      'sort_and_merge',
      `// Before: O(n²) nested loops
for (const user of users) {
  for (const order of orders) {
    if (order.userId === user.id) {
      user.orders.push(order);
    }
  }
}

// After: O(n log n) with sort and merge
users.sort((a, b) => a.id - b.id);
orders.sort((a, b) => a.userId - b.userId);

let orderIndex = 0;
for (const user of users) {
  user.orders = [];
  while (orderIndex < orders.length && orders[orderIndex].userId <= user.id) {
    if (orders[orderIndex].userId === user.id) {
      user.orders.push(orders[orderIndex]);
    }
    orderIndex++;
  }
}

// Efficient when data is already sorted or sortable`,
      this.calculateFitnessScore(85, 50, 70, 90),
      'Use sort-and-merge algorithm when data is already sorted or when memory is constrained. More complex but memory-efficient.',
      45,
      'medium'
    ));

    // Solution 3: Database-level join (if applicable)
    solutions.push(this.createSolution(
      issue.id,
      3,
      'database_join',
      `// Before: O(n²) nested loops in application code
const users = await User.findAll();
for (const user of users) {
  user.orders = [];
  for (const order of orders) {
    if (order.userId === user.id) {
      user.orders.push(order);
    }
  }
}

// After: O(n) with database JOIN
const users = await User.findAll({
  include: [{
    model: Order,
    as: 'orders'
  }]
});

// Let the database do the join - it's optimized for this`,
      this.calculateFitnessScore(100, 15, 95, 95),
      'Move the join operation to the database level. Databases are highly optimized for joins and can use indexes effectively.',
      15,
      'low'
    ));

    return solutions;
  }

  private generateStringConcatSolutions(issue: Issue): Solution[] {
    const solutions: Solution[] = [];

    // Solution 1: Array join
    solutions.push(this.createSolution(
      issue.id,
      1,
      'array_join',
      `// Before: String concatenation in loop
let html = '';
for (const item of items) {
  html += '<li>' + item.name + '</li>';
}

// After: Array join
const parts = [];
for (const item of items) {
  parts.push('<li>' + item.name + '</li>');
}
const html = parts.join('');

// Or more concisely with map:
const html = items.map(item => '<li>' + item.name + '</li>').join('');

// Avoids creating intermediate string objects`,
      this.calculateFitnessScore(95, 10, 95, 100),
      'Use array join to build strings efficiently. This avoids creating intermediate string objects on each iteration.',
      5,
      'low'
    ));

    // Solution 2: Template literals with map
    solutions.push(this.createSolution(
      issue.id,
      2,
      'template_map',
      `// Before: String concatenation in loop
let html = '';
for (const item of items) {
  html += '<li>' + item.name + '</li>';
}

// After: Template literals with map
const html = items
  .map(item => \`<li>\${item.name}</li>\`)
  .join('');

// More readable and efficient`,
      this.calculateFitnessScore(95, 10, 98, 100),
      'Use template literals with map for cleaner, more maintainable code. Combines readability with performance.',
      5,
      'low'
    ));

    return solutions;
  }

  private generateRegexSolutions(issue: Issue): Solution[] {
    const solutions: Solution[] = [];

    solutions.push(this.createSolution(
      issue.id,
      1,
      'hoist_regex',
      `// Before: Regex compiled on every iteration
for (const text of texts) {
  if (/\\d{3}-\\d{4}/.test(text)) {
    matches.push(text);
  }
}

// After: Compile regex once outside loop
const phonePattern = /\\d{3}-\\d{4}/;
for (const text of texts) {
  if (phonePattern.test(text)) {
    matches.push(text);
  }
}

// Or use filter for cleaner code:
const phonePattern = /\\d{3}-\\d{4}/;
const matches = texts.filter(text => phonePattern.test(text));

// Regex is compiled once and reused`,
      this.calculateFitnessScore(98, 5, 100, 100),
      'Move regex compilation outside the loop. This is a trivial fix with significant performance impact.',
      2,
      'low'
    ));

    return solutions;
  }

  private generateJSONOperationsSolutions(issue: Issue): Solution[] {
    const solutions: Solution[] = [];

    // Solution 1: Move JSON operations outside loop
    solutions.push(this.createSolution(
      issue.id,
      1,
      'batch_json_operations',
      `// Before: JSON.stringify in loop
for (const item of items) {
  const json = JSON.stringify(item);
  await saveToCache(item.id, json);
}

// After: Batch stringify and save
const jsonItems = items.map(item => ({
  id: item.id,
  json: JSON.stringify(item)
}));

await Promise.all(
  jsonItems.map(({ id, json }) => saveToCache(id, json))
);

// Separates serialization from I/O for better performance`,
      this.calculateFitnessScore(90, 20, 85, 100),
      'Batch JSON operations and separate them from I/O. This allows for better optimization and parallelization.',
      15,
      'low'
    ));

    // Solution 2: Use structured clone for deep copies
    solutions.push(this.createSolution(
      issue.id,
      2,
      'structured_clone',
      `// Before: JSON parse/stringify for deep clone
const clones = [];
for (const item of items) {
  const clone = JSON.parse(JSON.stringify(item));
  clones.push(clone);
}

// After: Use structuredClone (Node 17+, modern browsers)
const clones = items.map(item => structuredClone(item));

// Much faster and handles more data types`,
      this.calculateFitnessScore(95, 10, 90, 90),
      'Use structuredClone API for deep copying. It\'s faster than JSON.parse/stringify and handles more data types (Date, RegExp, etc.).',
      5,
      'low'
    ));

    return solutions;
  }

  private generateSyncFileIOSolutions(issue: Issue): Solution[] {
    const solutions: Solution[] = [];

    // Solution 1: Async with Promise.all
    solutions.push(this.createSolution(
      issue.id,
      1,
      'async_promise_all',
      `// Before: Synchronous file I/O blocks event loop
const fs = require('fs');
for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  processContent(content);
}

// After: Async file I/O with Promise.all
const fs = require('fs').promises;
const contents = await Promise.all(
  files.map(file => fs.readFile(file, 'utf-8'))
);

contents.forEach(content => processContent(content));

// Non-blocking and parallel`,
      this.calculateFitnessScore(98, 20, 95, 100),
      'Use async file operations with Promise.all for parallel, non-blocking I/O. This is the standard solution for file operations.',
      15,
      'low'
    ));

    // Solution 2: Streaming for large files
    solutions.push(this.createSolution(
      issue.id,
      2,
      'streaming',
      `// Before: Reading entire files into memory
const fs = require('fs');
for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  processContent(content);
}

// After: Stream processing
const fs = require('fs');
const { pipeline } = require('stream/promises');

for (const file of files) {
  await pipeline(
    fs.createReadStream(file),
    processStream, // Transform stream
    outputStream
  );
}

// Memory-efficient for large files`,
      this.calculateFitnessScore(95, 40, 85, 95),
      'Use streams for large files to avoid loading everything into memory. More complex but essential for large-scale file processing.',
      45,
      'medium'
    ));

    return solutions;
  }

  private generateArrayChainingSolutions(issue: Issue): Solution[] {
    const solutions: Solution[] = [];

    solutions.push(this.createSolution(
      issue.id,
      1,
      'single_reduce',
      `// Before: Multiple array iterations
const result = items
  .filter(item => item.active)
  .map(item => item.value)
  .reduce((sum, value) => sum + value, 0);

// After: Single reduce operation
const result = items.reduce((sum, item) => {
  if (item.active) {
    return sum + item.value;
  }
  return sum;
}, 0);

// Single iteration instead of three`,
      this.calculateFitnessScore(92, 20, 85, 100),
      'Combine filter, map, and reduce into a single reduce operation. Reduces iterations from 3 to 1.',
      10,
      'low'
    ));

    return solutions;
  }

  private generateNestedArrayMethodsSolutions(issue: Issue): Solution[] {
    const solutions: Solution[] = [];

    solutions.push(this.createSolution(
      issue.id,
      1,
      'flatten_with_map',
      `// Before: Nested array methods (O(n²))
const result = users.map(user => {
  return orders.filter(order => order.userId === user.id);
});

// After: Pre-index with Map (O(n))
const ordersByUser = new Map();
for (const order of orders) {
  if (!ordersByUser.has(order.userId)) {
    ordersByUser.set(order.userId, []);
  }
  ordersByUser.get(order.userId).push(order);
}

const result = users.map(user => 
  ordersByUser.get(user.id) || []
);

// Reduced from O(n²) to O(n)`,
      this.calculateFitnessScore(98, 25, 90, 100),
      'Pre-index data with Map to eliminate nested array methods. Converts O(n²) to O(n) complexity.',
      20,
      'low'
    ));

    return solutions;
  }

  private generateDOMManipulationSolutions(issue: Issue): Solution[] {
    const solutions: Solution[] = [];

    // Solution 1: DocumentFragment
    solutions.push(this.createSolution(
      issue.id,
      1,
      'document_fragment',
      `// Before: DOM manipulation in loop (causes multiple reflows)
for (const item of items) {
  const li = document.createElement('li');
  li.textContent = item.name;
  ul.appendChild(li);
}

// After: Use DocumentFragment
const fragment = document.createDocumentFragment();
for (const item of items) {
  const li = document.createElement('li');
  li.textContent = item.name;
  fragment.appendChild(li);
}
ul.appendChild(fragment);

// Single reflow instead of multiple`,
      this.calculateFitnessScore(98, 15, 95, 100),
      'Use DocumentFragment to batch DOM insertions. This causes only one reflow instead of multiple, dramatically improving performance.',
      10,
      'low'
    ));

    // Solution 2: innerHTML with template literals
    solutions.push(this.createSolution(
      issue.id,
      2,
      'inner_html_batch',
      `// Before: DOM manipulation in loop
for (const item of items) {
  const li = document.createElement('li');
  li.textContent = item.name;
  ul.appendChild(li);
}

// After: Build HTML string and set innerHTML once
const html = items
  .map(item => \`<li>\${item.name}</li>\`)
  .join('');
ul.innerHTML = html;

// Fastest for simple HTML, but be careful with XSS`,
      this.calculateFitnessScore(95, 10, 85, 95),
      'Build HTML string and set innerHTML once. Fastest approach but requires proper escaping to prevent XSS vulnerabilities.',
      5,
      'low'
    ));

    return solutions;
  }

  private generateGenericLoopSolutions(issue: Issue): Solution[] {
    const solutions: Solution[] = [];

    solutions.push(this.createSolution(
      issue.id,
      1,
      'functional_approach',
      `// Before: Imperative loop
const results = [];
for (const item of items) {
  if (item.active) {
    results.push(item.value * 2);
  }
}

// After: Functional approach
const results = items
  .filter(item => item.active)
  .map(item => item.value * 2);

// More declarative and often better optimized`,
      this.calculateFitnessScore(85, 10, 95, 100),
      'Use functional array methods for cleaner, more maintainable code. Modern JavaScript engines optimize these well.',
      5,
      'low'
    ));

    return solutions;
  }
}
