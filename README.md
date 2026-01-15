<div align="center">

# 🧬 Code Evolution Lab

**AI-Powered Evolutionary Code Optimization Platform**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Angular](https://img.shields.io/badge/Angular-17+-red)](https://angular.io/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue)](https://www.postgresql.org/)

[Features](#-features) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [API Reference](#-api-reference) • [Contributing](#-contributing)

</div>

---

## 📖 Overview

**Code Evolution Lab** is an intelligent code analysis platform that combines static code analysis with genetic algorithms to automatically detect performance issues in JavaScript/TypeScript codebases and generate optimized solutions.

Unlike traditional linters that only identify problems, Code Evolution Lab **evolves** multiple solution candidates using evolutionary algorithms, ranking them by fitness score based on performance gain, code complexity, and maintainability.

### Why Code Evolution Lab?

| Traditional Tools | Code Evolution Lab |
|------------------|-------------------|
| Identify problems only | Identify AND solve problems |
| Single solution suggestion | Multiple ranked solutions |
| Rule-based analysis | AI-powered evolutionary optimization |
| Manual optimization | Automated code generation |

### Key Capabilities

- 🔍 **Deep Code Analysis** - AST-based detection of N+1 queries, memory leaks, inefficient loops, and large payloads
- 🧬 **Evolutionary Solutions** - Genetic algorithms generate and evolve multiple solution candidates
- 📊 **Fitness Scoring** - Solutions ranked by performance, complexity, and maintainability
- 🌐 **GitHub Integration** - Analyze entire repositories with one click
- 🔐 **OAuth Authentication** - Secure login with Google and GitHub
- 🎨 **Modern Web UI** - Angular 17+ dashboard with real-time analysis

---

## ✨ Features

### 🔍 Code Analysis Detectors

| Detector | Description | Severity |
|----------|-------------|----------|
| **N+1 Query** | Detects database queries inside loops (Sequelize, Prisma, Mongoose, TypeORM) | HIGH |
| **Inefficient Loop** | Identifies nested loops, array method chaining, await in loops | MEDIUM-HIGH |
| **Memory Leak** | Finds uncleaned event listeners, timers, closures, React effects | CRITICAL |
| **Large Payload** | Detects missing pagination, field selection, unbounded queries | MEDIUM |

### 🧬 Evolutionary Solution Engine

The genetic algorithm evolves optimal solutions through:

- **Population Generation** - Creates diverse solution candidates from transformation-based solutions (not templates)
- **Fitness Evaluation** - Multi-criteria scoring (performance 40%, complexity 20%, maintainability 25%, compatibility 15%)
- **Tournament Selection** - Selects best candidates for breeding (configurable tournament size)
- **Crossover** - Single-point crossover at statement boundaries with duplicate declaration auto-fix
- **Mutation** - 4 AST-based code transformations:
  - Variable name mutations (rename with prefixes/suffixes)
  - Query parameter mutations (add select, take, include properties)
  - ORM method mutations (findMany ↔ findFirst, findAll ↔ findOne)
  - Optimization additions (caching logic injection)
- **Elitism** - Preserves top solutions across generations (configurable count)
- **Convergence Detection** - Stops when fitness plateaus or max generations reached
- **Validation** - Auto-fixes duplicate declarations, validates syntax before accepting mutations

**Current Status:** ✅ **FULLY IMPLEMENTED** - Complete evolution loop with 647 lines of production code

### 🔐 Authentication & Security

- **OAuth 2.0** - Login with Google or GitHub
- **JWT Tokens** - Secure access/refresh token pairs
- **HTTP-Only Cookies** - Protected token storage
- **Rate Limiting** - API protection against abuse
- **Session Management** - Track and manage user sessions

### 🎨 Modern Web Interface

- **Angular 17+** with Signals for reactive state management
- **Real-time Analysis** with Server-Sent Events (SSE)
- **Repository Dashboard** for GitHub integration
- **Evolution Progress** visualization
- **Responsive Design** for all devices

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Code Evolution Lab                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │  Angular 17+    │    │  Express API    │    │  PostgreSQL     │     │
│  │  Frontend       │◄──►│  Server         │◄──►│  Database       │     │
│  │  (Port 8201)    │    │  (Port 3000)    │    │  (Prisma ORM)   │     │
│  └─────────────────┘    └────────┬────────┘    └─────────────────┘     │
│                                  │                                      │
│                    ┌─────────────┴─────────────┐                        │
│                    │                           │                        │
│           ┌────────▼────────┐       ┌─────────▼─────────┐              │
│           │  Code Analyzer  │       │  Auth Service     │              │
│           │  ┌────────────┐ │       │  • OAuth 2.0      │              │
│           │  │ Detectors  │ │       │  • JWT Tokens     │              │
│           │  │ • N+1      │ │       │  • Sessions       │              │
│           │  │ • Memory   │ │       └───────────────────┘              │
│           │  │ • Loops    │ │                                          │
│           │  │ • Payload  │ │                                          │
│           │  └────────────┘ │                                          │
│           │        │        │                                          │
│           │  ┌─────▼──────┐ │                                          │
│           │  │ Evolution  │ │                                          │
│           │  │ Engine     │ │                                          │
│           │  └────────────┘ │                                          │
│           └─────────────────┘                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Angular 17+, TypeScript, Signals, SCSS |
| **Backend** | Node.js, Express, TypeScript |
| **Database** | PostgreSQL, Prisma ORM |
| **Auth** | JWT, bcryptjs, OAuth 2.0 (Google, GitHub) |
| **Parser** | Babel (@babel/parser, @babel/traverse, @babel/generator) |
| **Security** | express-rate-limit, HTTP-only cookies |
| **Testing** | Jest, ts-jest |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+ 
- **PostgreSQL** 15+
- **npm** or **yarn**

### Installation

```bash
# Clone the repository
git clone https://github.com/liangk/code-evolution-lab.git
cd code-evolution-lab

# Install backend dependencies
npm install

# Install frontend dependencies
cd apps/web
npm install
cd ../..

# Set up environment
cp .env.example .env
```

### Configure Environment

Edit `.env` with your settings:

```bash
# Database (PostgreSQL)
DATABASE_URL="postgresql://user:password@localhost:5432/code_evolution_lab"

# OAuth (Google)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# OAuth (GitHub)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# JWT Secrets
JWT_ACCESS_SECRET=your_secure_access_secret
JWT_REFRESH_SECRET=your_secure_refresh_secret
```

### Database Setup

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# (Optional) Open Prisma Studio
npm run prisma:studio
```

### Start the Application

```bash
# Terminal 1: Start API Server
npm run start:api
# → http://localhost:3000

# Terminal 2: Start Frontend
cd apps/web
npm start
# → http://localhost:8201
```

---

## 📖 Documentation

### Web Interface

#### Dashboard
1. Navigate to `http://localhost:8201`
2. Login with Google or GitHub
3. Select an example or paste your code
4. Click **Analyze Code**
5. View detected issues and AI-generated solutions

#### Repository Analysis
1. Go to **Repositories** page
2. Add a GitHub repository URL
3. Click **Analyze**
4. View file-by-file breakdown with issues and solutions

### CLI Usage

```bash
# Build the project first
npm run build

# Analyze a single file
npm run analyze examples/n-plus-1-query.js

# Generate AI solutions
npm run analyze examples/n-plus-1-query.js --solutions

# Analyze with evolutionary algorithm
npm run analyze examples/mixed-issues.js --solutions
```

### Example Files

| File | Issue Type | Severity |
|------|------------|----------|
| `examples/n-plus-1-query.js` | N+1 Query (Sequelize) | HIGH |
| `examples/inefficient-loop.js` | Nested loops, await in loop | MEDIUM |
| `examples/memory-leak.js` | Event listeners, timers | CRITICAL |
| `examples/large-payload.js` | Missing pagination | MEDIUM |
| `examples/mixed-issues.js` | Multiple issues | HIGH |
| `examples/react-memory-leak.tsx` | React useEffect leaks | HIGH |

---

## 🔧 Configuration

### Environment Variables

```bash
# Server
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:8201

# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/code_evolution_lab"

# Google OAuth
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/social/callback

# GitHub OAuth
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GITHUB_REDIRECT_URI=http://localhost:3000/api/auth/social/callback

# JWT
JWT_ACCESS_SECRET=your_secret
JWT_REFRESH_SECRET=your_secret
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Evolutionary Algorithm
EVO_ENABLE_ALGORITHM=false          # Toggle evolution on/off (false = template-based)
EVO_POPULATION_SIZE=20              # Solution candidates per generation
EVO_MAX_GENERATIONS=10              # Maximum evolution iterations
EVO_MUTATION_RATE=0.3               # Probability of mutation (0.0-1.0)
EVO_CROSSOVER_RATE=0.7              # Probability of crossover (0.0-1.0)
EVO_ELITISM_COUNT=2                 # Best solutions to preserve
EVO_CONVERGENCE_THRESHOLD=0.01      # Stop if improvement < 1%
EVO_TOURNAMENT_SIZE=3               # Candidates per tournament selection
EVO_MAX_TIME_MS=30000               # Maximum evolution time
```

### OAuth Setup

#### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Google+ API**
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:3000/api/auth/social/callback`
6. Copy Client ID and Secret to `.env`

#### GitHub OAuth
1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set callback URL: `http://localhost:3000/api/auth/social/callback`
4. Copy Client ID and Secret to `.env`

---

## 📡 API Reference

### Authentication

#### Login with OAuth
```http
GET /api/auth/social/google
GET /api/auth/social/github
```

#### OAuth Callback
```http
POST /api/auth/social/callback
Content-Type: application/json

{
  "provider": "google",
  "code": "oauth_authorization_code"
}
```

#### Refresh Token
```http
POST /api/auth/refresh
Cookie: refresh_token=xxx
```

#### Logout
```http
POST /api/auth/logout
```

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <access_token>
```

### Code Analysis

#### Analyze Code Snippet
```http
POST /api/analyze
Content-Type: application/json

{
  "code": "const users = await User.findAll();...",
  "filePath": "example.js",
  "generateSolutions": true
}
```

#### Get Analysis Results
```http
GET /api/analysis/:analysisId
```

### Repository Management

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
  "githubUrl": "https://github.com/username/repo"
}
```

#### Analyze Repository
```http
POST /api/repositories/:id/analyze-github
```

#### Delete Repository
```http
DELETE /api/repositories/:id
```

### Server-Sent Events

#### Evolution Progress
```http
GET /api/sse/evolution/:analysisId
```

---

## 📁 Project Structure

```
code-evolution-lab/
├── apps/
│   └── web/                          # Angular frontend
│       └── src/app/
│           ├── components/
│           │   ├── dashboard/        # Main analysis UI
│           │   ├── login/            # OAuth login
│           │   ├── register/         # User registration
│           │   ├── repository/       # Repo management
│           │   └── evolution-progress/
│           ├── services/
│           │   ├── auth.service.ts   # Authentication
│           │   └── analysis.service.ts
│           └── guards/
│               └── auth.guard.ts     # Route protection
├── src/
│   ├── api/
│   │   ├── server.ts                 # Express app
│   │   ├── controllers/              # Request handlers
│   │   ├── routes/                   # API routes
│   │   │   ├── auth.routes.ts        # Authentication
│   │   │   ├── analysis.routes.ts    # Code analysis
│   │   │   └── repository.routes.ts  # Repo management
│   │   ├── middleware/               # Auth, rate limiting
│   │   │   ├── auth.ts               # JWT middleware
│   │   │   └── rateLimiter.ts        # Rate limiting
│   │   ├── services/                 # Business logic
│   │   └── utils/                    # JWT, helpers
│   ├── analyzer/
│   │   ├── parser.ts                 # Babel AST parser
│   │   └── code-analyzer.ts          # Main orchestrator
│   ├── detectors/
│   │   ├── base-detector.ts
│   │   ├── n1-query-detector.ts
│   │   ├── inefficient-loop-detector.ts
│   │   ├── memory-leak-detector.ts
│   │   └── large-payload-detector.ts
│   ├── generators/
│   │   ├── base-generator.ts         # Abstract base class
│   │   ├── evolutionary-engine.ts    # Genetic algorithm (in progress)
│   │   ├── fitness-calculator.ts     # Multi-criteria scoring
│   │   ├── mutation-operators.ts     # AST mutations (4 types)
│   │   └── n1-query-solution-generator.ts
│   ├── utils/
│   │   ├── ast-utils.ts              # AST parsing/generation
│   │   └── code-validator.ts         # Syntax validation
│   └── cli.ts                        # CLI tool
├── prisma/
│   └── schema.prisma                 # Database schema
├── examples/                         # Sample code files
└── package.json
```

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

---

## 🛠️ Development

```bash
# Build TypeScript
npm run build

# Development mode
npm run dev

# Lint code
npm run lint
npm run lint:fix

# Format code
npm run format
```

---

## 🚧 Troubleshooting

### Port Already in Use

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:3000 | xargs kill -9
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
pg_isready

# Reset database
npm run prisma:migrate reset
```

### OAuth Redirect Issues

- Ensure redirect URIs match exactly in OAuth provider settings
- Check `FRONTEND_URL` matches your Angular app URL
- Verify cookies are being set (check browser DevTools)

---

## 🗺️ Development Progress

### ✅ Phase 1-2: Core Detection & Analysis (Complete)

**Code Analysis Detectors**
- [x] **N+1 Query Detection** (234 lines) - Import-aware ORM detection with `ImportAnalyzer`
  - Supports: Sequelize, Prisma, Mongoose, TypeORM, Knex, Raw SQL
  - Detects: for/for-of/for-in/while/forEach/map loops
  - Import analysis: Tracks ORM packages and symbols
  - Severity: Critical (≥3 queries), High (≥2), Medium (1)
  
- [x] **Inefficient Loop Detection** (547 lines) - 12 distinct pattern detectors
  - Array method chaining (.filter().map())
  - Nested array methods (O(n²) detection)
  - Array.push in loops
  - DOM manipulation in loops
  - **await in loop** (sequential → Promise.all suggestion)
  - **String concatenation** (→ array.join())
  - **Regex compilation** in loops
  - **JSON.parse/stringify** in loops
  - **Sync file I/O** in loops (critical severity)
  - **Array.includes/indexOf** in loops (O(n²) → Set/Map)
  - **Nested for loops** with depth calculation (O(n²), O(n³))
  - **Object.keys() with lookups**
  
- [x] **Memory Leak Detection** (367 lines) - Framework-aware lifecycle detection
  - **Framework detection**: React (useEffect, componentWillUnmount), Vue (unmounted), Angular (ngOnDestroy)
  - Event listeners with lifecycle cleanup tracking
  - Timer leaks (setInterval/setTimeout) with cleanup verification
  - Global variable assignments (window/global)
  - Closure capturing large data (>100 elements)
  - Confidence scoring based on framework context
  
- [x] **Large Payload Detection** (267 lines) - Data-flow aware analysis
  - API response payload analysis with data-flow tracking
  - SELECT * query detection
  - Unlimited return detection
  - Pagination wrapper recognition (paginate, withPagination)
  - Streaming response detection
  - Cursor-based pagination detection
  
- [x] **AST Infrastructure**
  - Babel parser with 11 plugins (TypeScript, JSX, decorators, async, optional chaining, etc.)
  - Import analyzer (169 lines) - Tracks ORM packages and symbol mappings
  - 15+ AST utility functions (316 lines total)
  - Code validator with auto-fix (419 lines)

**Advanced Features:**
- ✅ Import-based ORM detection (not just pattern matching)
- ✅ Framework lifecycle awareness (React/Vue/Angular)
- ✅ Data-flow tracking for payload analysis
- ✅ Confidence scoring per detection
- ✅ Auto-fix for duplicate declarations

### ✅ Phase 3: Solution Generation & Evolution (FULLY IMPLEMENTED)

**Solution Generators (All Detectors Covered)**
- [x] **N+1 Query Solution Generator** (585 lines) - Transformation-based, not templates
  - 6 transformation strategies: batch-form-reads, batch-query-before-loop, prisma-include, sequelize-include, form-batch-read, memoization
  - Analyzes original code context (ORM, variables, loops, async calls)
  - Preserves variable names and code structure
  - Context-aware solutions for Prisma, Sequelize, Mongoose, Angular forms
  
- [x] **Inefficient Loop Solution Generator** (255 lines)
  - Promise.all strategy (sequential → parallel)
  - Batch async with concurrency control
  - Map/Set lookup strategies (O(n) → O(1))
  - Array.join for string concatenation
  - Chained-to-single-pass transformation
  
- [x] **Memory Leak Solution Generator** (680 lines)
  - Framework-specific cleanup patterns (React/Vue/Angular)
  - 20+ solution templates across 4 leak types
  - AbortController for modern event management
  - Timer manager utility
  - WeakMap for garbage collection
  
- [x] **Large Payload Solution Generator** (564 lines)
  - Limit/offset pagination
  - Cursor-based pagination
  - Field selection patterns
  - Streaming responses
  - DTO/serializer patterns
  - Response compression

**Evolutionary Algorithm (COMPLETE - 647 lines)**
- [x] **EvolutionaryEngine class** - Full production implementation
  - `evolve()` - Main evolution loop with progress events
  - `generateInitialPopulation()` - Creates candidates from transformations (not templates)
  - `evaluateFitness()` - Multi-criteria scoring
  - `selectParents()` - Tournament selection
  - `tournamentSelect()` - K-way tournament
  - `crossover()` - Creates offspring pairs
  - `singlePointCrossover()` - Statement-level code merging with auto-fix
  - `mutate()` - Applies random mutations with validation
  - `selectSurvivors()` - Elitism + roulette wheel selection
  - `hasConverged()` - Fitness plateau detection
  - `convertToSolutions()` - Candidate → Solution conversion
  
- [x] **Mutation Operators** (413 lines) - 4 fully implemented
  - `mutateVariableName()` - Rename with prefixes/suffixes
  - `mutateQueryParameter()` - Add/modify select, take, include
  - `mutateORMMethod()` - Swap ORM methods (findMany ↔ findFirst)
  - `addOptimization()` - Inject caching logic
  - `applyRandomMutation()` - Tries mutations until success
  
- [x] **AST Utilities** (316 lines) - 20+ functions
  - `parseCode()` - Babel parser with 11 plugins
  - `generateCode()` - AST → code
  - `validateCode()` - Syntax checking
  - `getVariableDeclarations()` - Extract variables
  - `getFunctionCalls()` - Extract calls
  - `findIdentifiers()` - Search by name
  - `renameVariable()` - Rename with scope awareness
  - `getStatements()` - Extract statements
  - `cloneAST()` - Deep clone
  - `hasAsyncAwait()` - Async pattern detection
  - `findDatabaseQueries()` - Query detection
  - `isInsideLoop()` - Loop context checking
  
- [x] **Code Validator** (419 lines) - Auto-fix + validation
  - `validateGeneratedCode()` - Comprehensive validation
  - `fixDuplicateDeclarations()` - Auto-rename duplicates
  - `textBasedDuplicateFix()` - Pre-parse duplicate fixing
  - `checkUndefinedVariables()` - Undefined detection
  - `checkUnreachableCode()` - Dead code detection
  - `checkEmptyBlocks()` - Empty block detection
  
- [x] **Fitness Calculator** - Multi-criteria with configurable weights
  - Performance impact (40%)
  - Code complexity (20%)
  - Maintainability (25%)
  - Framework compatibility (15%)
  - Implementation time estimation
  - Risk level assessment

**Key Architectural Features:**
- ✅ Transformation-based (not template-based) - Solutions derived from original code
- ✅ Preserves variable names and code structure
- ✅ Auto-fixes duplicate declarations from crossover/mutation
- ✅ Validates all generated code before acceptance
- ✅ Progress events via EventEmitter
- ✅ Configurable via environment variables
- ✅ Fallback to template generation if evolution disabled

### ✅ Phase 4: Frontend & API Features (Complete)

**Web Interface (Angular 17+)**
- [x] Repository connection interface
  - Add/list/delete repositories
  - View analyses per repository
  - Beautiful card-based UI
- [x] Advanced filtering and search
  - Search by description/ID
  - Filter by severity (critical/high/medium/low)
  - Filter by detector type
  - Real-time filtering
- [x] Dashboard with example code selection
- [x] Evolution progress visualization
- [x] Responsive design

**Authentication & Security**
- [x] JWT-based authentication
  - Access/refresh token pairs
  - HTTP-only cookies
  - 7-day token expiry
- [x] User registration with bcrypt hashing
- [x] Authentication middleware
- [x] Rate limiting
  - Global: 100 req/15min per IP
  - Analysis: 10 req/min per IP
- [x] OAuth 2.0 foundation (Google, GitHub)

**API Endpoints**
- [x] Authentication routes (`/api/auth/*`)
- [x] Code analysis routes (`/api/analyze`)
- [x] Repository management routes (`/api/repositories/*`)
- [x] Server-Sent Events for evolution progress

**Database (PostgreSQL + Prisma)**
- [x] User model with authentication
- [x] Repository model
- [x] Analysis model
- [x] Session management
- [x] Migrations and schema management

### 🔄 In Progress

**Potential Enhancements (Not Blockers)**
- Additional mutation operators (6 more categories from design docs)
- Multi-point crossover variations
- Adaptive mutation rates
- Parallel evolution (multiple populations)

**GitHub Integration (Foundation Ready)**
- OAuth flow (routes + controllers implemented, needs OAuth app setup)
- Repository cloning (API structure ready)
- Webhook setup (endpoint structure ready)

### 📋 Planned Features

**Phase 4A: Testing & Polish (Next)**
- [x] ~~Complete evolutionary engine implementation~~ ✅ DONE
- [x] ~~Solution validation pipeline~~ ✅ DONE (auto-fix + validation)
- [x] ~~Additional solution generators~~ ✅ DONE (all 4 detectors covered)
- [ ] Comprehensive test suite (unit + integration)
- [ ] End-to-end evolution testing
- [ ] Performance benchmarking

**Phase 4B: Accuracy Improvements**
- [ ] ORM import analysis for better detection
- [ ] Lifecycle-aware memory leak detection
- [ ] Data-flow analysis for payload detection
- [ ] CLI glob support and output formats (JSON/SARIF)
- [ ] Configuration file support (`.codeevolutionrc`)

**Phase 4C: Advanced Features**
- [ ] Context-aware generation (dependency analysis)
- [ ] Multi-issue optimization
- [ ] Solution metadata (compatibility, rollback)
- [ ] VS Code extension
- [ ] CI/CD integration (GitHub Actions)
- [ ] Custom detector plugins
- [ ] Team collaboration features

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Write tests for new functionality
4. Run linting: `npm run lint`
5. Submit a pull request

### Adding a New Detector

1. Create class extending `BaseDetector` in `src/detectors/`
2. Implement `detect()` method
3. Register in `code-analyzer.ts`
4. Add tests and example file

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 👤 Author

**Ko-Hsin Liang**

- GitHub: [@liangk](https://github.com/liangk)

---

<div align="center">

**Built with 🧬 by Code Evolution Lab**

[⬆ Back to Top](#-code-evolution-lab)

</div>
