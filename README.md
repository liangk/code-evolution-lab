# Code Evolution Lab

A hands-on lab for evolutionary approaches to code performance optimization. This tool uses AST (Abstract Syntax Tree) parsing to detect performance issues in JavaScript/TypeScript code and suggest optimizations.

## Features

- **N+1 Query Detection**: Automatically detects N+1 query patterns in database operations
- **AST-based Analysis**: Robust code analysis using Babel parser
- **Multiple ORM Support**: Works with Sequelize, Prisma, Mongoose, and raw SQL
- **CLI Tool**: Easy-to-use command-line interface for local analysis
- **Detailed Reports**: Comprehensive issue reports with severity levels and estimated impact

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

--------------------------------------------------------------------------------

Total Issues Found: 1
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
- [ ] Missing database index detector
- [ ] Inefficient loop detector
- [ ] Memory leak detector
- [ ] Large payload detector

### Phase 3: Solution Generator (Weeks 9-12)
- [ ] Evolutionary algorithm for solution generation
- [ ] Fitness scoring system
- [ ] Code transformation engine

### Phase 4: Web Interface (Weeks 13-16)
- [ ] Angular frontend
- [ ] GitHub integration
- [ ] Real-time analysis dashboard
- [ ] User authentication

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
