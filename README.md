# Code Evolution Lab

🧬 **An AI-powered evolutionary code optimization platform** that automatically detects performance issues in JavaScript/TypeScript code and generates optimized solutions using genetic algorithms.

## Overview

Code Evolution Lab combines static code analysis with evolutionary algorithms to identify and fix performance bottlenecks in your codebase. It analyzes entire GitHub repositories, detects issues like N+1 queries, memory leaks, and inefficient loops, then uses AI to generate multiple solution approaches ranked by fitness score.

**Key Capabilities:**
- 🔍 Analyze entire GitHub repositories automatically
- 🧬 Generate multiple AI-powered solutions using evolutionary algorithms
- 📊 Web-based dashboard with real-time analysis
- 🎯 Fitness-based solution ranking (performance, complexity, maintainability)
- 🚀 Support for multiple ORMs (Sequelize, Prisma, Mongoose, TypeORM)

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
- **Evolutionary Algorithm**: Uses genetic operators (selection, crossover, mutation) to evolve optimal solutions
- **AST Mutation**: Variable renaming, query optimization, ORM method changes, caching strategies
- **Code Validation**: Syntax checking, undefined variable detection, unreachable code analysis

### Phase 4: Web Interface ✅
- **Angular Frontend**: Modern, responsive UI with Angular 17+ and signals
- **Repository Management**: Add, analyze, and track GitHub repositories
- **GitHub Integration**: Automatic repository cloning and file discovery
- **Real-time Analysis**: Analyze entire repositories with progress tracking
- **Analysis Dashboard**: View issues, solutions, and performance metrics
- **Example Files**: Built-in examples for testing (N+1 queries, memory leaks, etc.)

## Architecture

### Backend (Node.js + TypeScript)
- **Express API Server**: RESTful API for code analysis
- **AST Parser**: Babel-based JavaScript/TypeScript parsing
- **Detectors**: Modular detector system for different issue types
- **Solution Generators**: AI-powered solution generation with evolutionary algorithms
- **GitHub Integration**: Repository cloning and file discovery
- **SQLite Database**: Stores repositories, analyses, issues, and solutions

### Frontend (Angular 17+)
- **Dashboard**: Main analysis interface with example selection
- **Repository Manager**: GitHub repository CRUD operations
- **Analysis Viewer**: Display issues, solutions, and metrics
- **Signals-based State**: Reactive state management with Angular signals

### Evolutionary Engine
- **Population**: Generates multiple solution candidates
- **Fitness Function**: Evaluates solutions based on performance, complexity, risk
- **Selection**: Tournament selection for parent solutions
- **Crossover**: Single-point crossover for solution recombination
- **Mutation**: AST-based mutations (variable names, query params, ORM methods)
- **Elitism**: Preserves best solutions across generations

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/code-evolution-lab.git
cd code-evolution-lab

# Install dependencies
npm install

# Install frontend dependencies
cd apps/web
npm install
cd ../..

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
```

## Usage

### Quick Start

1. **Start the API Server**
```bash
npm run start:api
# Server runs on http://localhost:3000
```

2. **Start the Frontend**
```bash
cd apps/web
npm start
# Frontend runs on http://localhost:8201
```

3. **Open the Dashboard**
   - Navigate to `http://localhost:8201`
   - Try the built-in examples or add your own code

### CLI Usage

#### Analyze a Single File
```bash
npm run build
npm run analyze examples/n-plus-1-query.js
```

#### Generate AI Solutions
```bash
npm run analyze examples/n-plus-1-query.js --solutions
```

#### Analyze with Evolutionary Algorithm
```bash
# Enable in .env
EVO_ENABLE_ALGORITHM=true
EVO_POPULATION_SIZE=20
EVO_MAX_GENERATIONS=10

npm run analyze examples/mixed-issues.js --solutions
```

### Web Interface Usage

#### 1. Analyze Code Snippets
- Go to Dashboard (`http://localhost:8201`)
- Select an example from dropdown or paste your code
- Click "Analyze Code"
- View detected issues and AI-generated solutions

#### 2. Analyze GitHub Repositories
- Go to Repositories (`http://localhost:8201/repositories`)
- Add a repository:
  - Name: `My Project`
  - GitHub URL: `https://github.com/username/repo`
- Click "Analyze" button
- Wait for analysis to complete
- View results with file-by-file breakdown

**Example Repositories to Try:**
- `https://github.com/stackinsight/stackinsight-auth-lite`
- Any public JavaScript/TypeScript repository

### Available Examples

1. **N+1 Query** (`examples/n-plus-1-query.js`)
   - Classic N+1 query problem with Sequelize
   - Severity: HIGH

2. **Inefficient Loop** (`examples/inefficient-loop.js`)
   - Nested loops and await in loop
   - Severity: MEDIUM

3. **Memory Leak** (`examples/memory-leak.js`)
   - Uncleaned event listeners and timers
   - Severity: CRITICAL

4. **Large Payload** (`examples/large-payload.js`)
   - Missing pagination and field selection
   - Severity: MEDIUM

5. **Mixed Issues** (`examples/mixed-issues.js`)
   - Combination of multiple problems
   - Severity: HIGH

6. **React Memory Leak** (`examples/react-memory-leak.tsx`)
   - React-specific memory issues
   - Severity: HIGH

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Development

```bash
# Build the project
npm run build

# Development mode with auto-reload
npm run dev

# Lint code
npm run lint

# Format code
npm run format
```

## Project Structure

```
code-evolution-lab/
├── src/
│   ├── analyzer/
│   │   ├── parser.ts                    # Core AST parser
│   │   └── code-analyzer.ts             # Main analyzer orchestrator
│   ├── detectors/
│   │   ├── base-detector.ts             # Base class for detectors
│   │   ├── n1-query-detector.ts         # N+1 query pattern detector
│   │   ├── inefficient-loop-detector.ts # Loop optimization detector
│   │   ├── memory-leak-detector.ts      # Memory leak detector
│   │   └── large-payload-detector.ts    # API payload detector
│   ├── generators/
│   │   ├── base-solution-generator.ts   # Base solution generator
│   │   ├── evolutionary-engine.ts       # Genetic algorithm engine
│   │   ├── fitness-calculator.ts        # Fitness scoring system
│   │   ├── mutation-operators.ts        # AST mutation operators
│   │   └── n1-query-solution-generator.ts # N+1 solution generator
│   ├── utils/
│   │   ├── ast-utils.ts                 # AST parsing and manipulation
│   │   ├── code-validator.ts            # Code validation utilities
│   │   └── github-utils.ts              # GitHub cloning and file discovery
│   ├── api/
│   │   ├── server.ts                    # Express server
│   │   ├── database.ts                  # SQLite database layer
│   │   └── routes/
│   │       ├── analysis.routes.ts       # Analysis endpoints
│   │       └── repository.routes.ts     # Repository CRUD endpoints
│   ├── types/
│   │   └── index.ts                     # TypeScript type definitions
│   ├── __tests__/                       # Test files
│   ├── cli.ts                           # CLI tool
│   └── index.ts                         # Main exports
├── apps/
│   └── web/                             # Angular frontend
│       ├── src/
│       │   └── app/
│       │       ├── components/
│       │       │   ├── dashboard/       # Main analysis dashboard
│       │       │   └── repository/      # Repository management
│       │       └── services/
│       │           └── analysis.service.ts # API client
│       └── angular.json
├── examples/
│   ├── n-plus-1-query.js                # N+1 query example
│   ├── inefficient-loop.js              # Loop optimization example
│   ├── memory-leak.js                   # Memory leak example
│   ├── large-payload.js                 # Large payload example
│   ├── mixed-issues.js                  # Combined issues example
│   ├── react-memory-leak.tsx            # React example
│   └── README.md                        # Example documentation
├── docs/
│   └── evolutionary-algorithm-implementation.md # Algorithm docs
├── database/
│   └── code-evolution.db                # SQLite database
├── temp/
│   └── repos/                           # Cloned repositories (gitignored)
├── .env.example                         # Environment variables template
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

### Phase 4: Web Interface (Weeks 13-16) ✅
- [x] Angular frontend with signals
- [x] GitHub repository integration
- [x] Real-time analysis dashboard
- [x] Repository management UI
- [x] Example file selector
- [x] Analysis results viewer
- [ ] User authentication (future)
- [ ] WebSocket progress updates (future)
- [ ] Private repository support (future)

### Phase 5: Advanced Features (Future)
- [ ] Incremental analysis (only changed files)
- [ ] Parallel file analysis
- [ ] Custom detector plugins
- [ ] CI/CD integration
- [ ] VS Code extension
- [ ] Performance benchmarking
- [ ] Solution A/B testing

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Database
DATABASE_PATH=./database/code-evolution.db

# API Server
PORT=3000

# Evolutionary Algorithm
EVO_POPULATION_SIZE=20        # Number of solution candidates per generation
EVO_MAX_GENERATIONS=10        # Maximum evolution iterations
EVO_MUTATION_RATE=0.3         # Probability of mutation (0-1)
EVO_CROSSOVER_RATE=0.7        # Probability of crossover (0-1)
EVO_ELITISM_COUNT=2           # Number of best solutions to preserve
EVO_CONVERGENCE_THRESHOLD=0.01 # Fitness convergence threshold
EVO_TOURNAMENT_SIZE=3         # Tournament selection size
EVO_ENABLE_ALGORITHM=true     # Enable/disable evolutionary algorithm
```

### Detector Configuration

Each detector can be customized in the code:

```typescript
// src/detectors/n1-query-detector.ts
export class N1QueryDetector extends BaseDetector {
  private readonly SEVERITY_THRESHOLD = 10; // Queries threshold
  private readonly SUPPORTED_ORMS = ['sequelize', 'prisma', 'mongoose'];
}
```

## API Reference

### Analysis Endpoints

#### Analyze Code Snippet
```http
POST /api/analyze
Content-Type: application/json

{
  "code": "const users = await User.findAll();",
  "filePath": "example.js",
  "generateSolutions": true
}
```

#### Analyze GitHub Repository
```http
POST /api/repository/:repoId/analyze-github
Content-Type: application/json

{
  "generateSolutions": true
}
```

#### Get Analysis Results
```http
GET /api/analysis/:analysisId
```

### Repository Endpoints

#### List Repositories
```http
GET /api/repositories
```

#### Create Repository
```http
POST /api/repositories
Content-Type: application/json

{
  "name": "My Project",
  "githubUrl": "https://github.com/username/repo",
  "ownerId": "user-id"
}
```

#### Delete Repository
```http
DELETE /api/repositories/:id
```

## Troubleshooting

### Empty Analysis Results

**Problem**: Repository analysis returns empty array

**Solution**: 
- Ensure repository contains `.js`, `.ts`, `.jsx`, or `.tsx` files
- Check that files are not in ignored directories (`node_modules`, `dist`, etc.)
- Verify GitHub URL is correct and repository is public

### Windows Permission Errors

**Problem**: `EPERM` error when cleaning up cloned repositories

**Solution**: The system now handles this automatically using Windows `rmdir` command. If issues persist:
- Manually delete `temp/repos/` directory
- Ensure no processes are locking the files
- Run with administrator privileges if needed

### TypeScript Compilation Errors

**Problem**: `ts-node` fails to compile

**Solution**:
```bash
# Clean build
rm -rf dist/
npm run build

# Check TypeScript version
npm list typescript
```

### Port Already in Use

**Problem**: `EADDRINUSE: address already in use`

**Solution**:
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:3000 | xargs kill -9
```

## Performance Tips

1. **Large Repositories**: Analysis time scales with file count. Consider:
   - Using file filters to exclude test files
   - Analyzing specific directories only
   - Running analysis during off-peak hours

2. **Evolutionary Algorithm**: Adjust parameters for speed vs. quality:
   - Reduce `EVO_POPULATION_SIZE` for faster results
   - Reduce `EVO_MAX_GENERATIONS` for quicker convergence
   - Increase both for better solution quality

3. **Database**: PostgreSQL is used with Prisma ORM. For production:
   - The current setup is production-ready with PostgreSQL
   - Add indexes for frequently queried fields in prisma/schema.prisma
   - Consider connection pooling with PgBouncer for high traffic
   - Monitor database performance and optimize queries

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/my-feature`
3. **Write tests** for new functionality
4. **Follow code style**: Run `npm run lint` and `npm run format`
5. **Update documentation** as needed
6. **Submit a pull request**

### Adding New Detectors

1. Create detector class extending `BaseDetector`
2. Implement `detect()` method
3. Add tests in `src/__tests__/`
4. Register in `code-analyzer.ts`
5. Create example file in `examples/`

### Adding New Solution Generators

1. Create generator class extending `BaseSolutionGenerator`
2. Implement `generateSolutions()` method
3. Define fitness calculation logic
4. Add mutation operators if needed
5. Test with evolutionary engine

## License

MIT License - see LICENSE file for details

## Acknowledgments

- **Babel**: AST parsing and code generation
- **Angular**: Frontend framework
- **Express**: Backend API framework
- **SQLite**: Embedded database
- **TypeScript**: Type-safe development

## Support

For questions or issues:
- 📧 Email: support@codeevolutionlab.com
- 🐛 Issues: [GitHub Issues](https://github.com/yourusername/code-evolution-lab/issues)
- 📖 Docs: [Documentation](https://github.com/yourusername/code-evolution-lab/wiki)

---

**Built with 🧬 by the Code Evolution Lab team**
