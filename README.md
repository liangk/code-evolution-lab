# Code Evolution Lab

A hands-on lab for evolutionary approaches to code performance optimization. This tool uses AST (Abstract Syntax Tree) parsing to detect performance issues in JavaScript/TypeScript code and suggest optimizations.

## Features

### Phase 1: Core Detection ✅
- **N+1 Query Detection**: Automatically detects N+1 query patterns in database operations
- **AST-based Analysis**: Robust code analysis using Babel parser
- **Multiple ORM Support**: Works with Sequelize, Prisma, Mongoose, and raw SQL
- **CLI Tool**: Easy-to-use command-line interface for local analysis
- **Detailed Reports**: Comprehensive issue reports with severity levels and estimated impact

### Phase 2: Advanced Detectors ✅
- **Inefficient Loop Detection**: Identifies array method chaining, nested loops, and DOM manipulation issues
- **Memory Leak Detection**: Detects uncleaned event listeners, timers, and closure memory issues
- **Large Payload Detection**: Finds API endpoints and queries without pagination or field selection
- **Performance Scoring**: Each issue includes estimated performance impact

### Phase 3: Solution Generation ✅
- **AI-Powered Solutions**: Automatically generates multiple solution approaches for each issue
- **Fitness Scoring**: Solutions ranked by performance gain, complexity, and maintainability
- **Multiple Strategies**: Provides 3-5 different solutions per issue (eager loading, batch queries, raw SQL, etc.)
- **Implementation Guidance**: Each solution includes code examples, pros/cons, and estimated time
- **Evolutionary Algorithm**: Uses fitness functions to rank solutions based on your codebase context

## Installation

```bash
npm install
```

## Usage

### Analyze a File

```bash
npm run build
npm run analyze examples/bad-code.js
```

### Generate Solutions

```bash
npm run analyze examples/bad-code.js --solutions
```

This will detect issues AND generate ranked solution suggestions with code examples.

### Run Tests

```bash
npm test
```

### Development

```bash
npm run dev
```

## Project Structure

```
code-evolution-lab/
├── src/
│   ├── analyzer/
│   │   ├── parser.ts           # Core AST parser
│   │   └── code-analyzer.ts    # Main analyzer orchestrator
│   ├── detectors/
│   │   ├── base-detector.ts    # Base class for detectors
│   │   └── n1-query-detector.ts # N+1 query pattern detector
│   ├── types/
│   │   └── index.ts            # TypeScript type definitions
│   ├── __tests__/              # Test files
│   ├── cli.ts                  # CLI tool
│   └── index.ts                # Main exports
├── examples/
│   ├── bad-code.js             # Example code with issues
│   └── good-code.js            # Optimized code examples
├── database/
│   └── schema.sql              # Database schema for future features
└── package.json
```

## Example Output

### Basic Analysis

```
Analyzing: examples/bad-code.js

=== N+1 Query Detector ===

[1] N+1 Query Detected
Severity: MEDIUM
Location: examples/bad-code.js:5

Description:
Found 1 database query (Sequelize.findAll()) inside a for-of loop. 
This creates an N+1 query problem where each iteration makes a 
separate database call. Consider using eager loading or batch queries instead.

Estimated Impact:
  - queriesIfN100: 101
  - queriesOptimal: 1
  - performanceGain: 10100x faster

=== Inefficient Loop Detector ===

[1] Nested Array Methods Detected
Severity: HIGH
Location: examples/inefficient-loops.js:12

Description:
Nested array methods create O(n²) or worse complexity...

=== Memory Leak Detector ===

[1] Uncleaned setInterval Detected
Severity: CRITICAL
Location: examples/memory-leaks.js:10

--------------------------------------------------------------------------------

Total Issues Found: 3
```

### With Solution Generation

```bash
npm run analyze examples/bad-code.js --solutions
```

```
[1] N+1 Query Detected
Severity: MEDIUM
Location: examples/bad-code.js:5

📋 Suggested Solutions:

  Solution 1: EAGER LOADING
  Fitness Score: 93.5/100
  Implementation Time: ~15 minutes
  Risk Level: LOW
  
  Use Sequelize include to load related data in a single query. 
  This is the simplest and most maintainable solution for Sequelize.

  Code Example:
  // Before: N+1 Query Problem
  const users = await User.findAll();
  for (const user of users) {
    user.orders = await Order.findAll({ where: { userId: user.id } });
  }

  // After: Eager Loading with Include
  const users = await User.findAll({
    include: [{
      model: Order,
      as: 'orders'
    }]
  });

  Solution 2: BATCH QUERY
  Fitness Score: 87.0/100
  Implementation Time: ~30 minutes
  Risk Level: LOW
  ...

  Solution 3: RAW JOIN
  Fitness Score: 82.5/100
  Implementation Time: ~60 minutes
  Risk Level: MEDIUM
  ...
```

## Development Roadmap

### Phase 1: Foundation (Weeks 1-4) 
- [x] Project setup with TypeScript, ESLint, Prettier
- [x] Core AST parser implementation
- [x] N+1 Query Detector
- [x] CLI tool
- [x] Unit tests
- [x] Database schema

### Phase 2: Additional Detectors (Weeks 5-8) 
- [x] Inefficient loop detector
- [x] Memory leak detector
- [x] Large payload detector
- [x] Comprehensive test coverage
- [x] Example files for all detectors
- [ ] Missing database index detector (optional)

### Phase 3: Solution Generator (Weeks 9-12) 
- [x] Evolutionary algorithm for solution generation
- [x] Fitness scoring system
- [x] N+1 query solution generator
- [x] Multiple solution strategies (5+ per issue)
- [x] Solution ranking and optimization
- [x] CLI integration with --solutions flag

### Phase 4: Web Interface (Weeks 13-16)
- [ ] Angular frontend
- [ ] GitHub integration
- [ ] Real-time analysis dashboard
- [ ] User authentication

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
