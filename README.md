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

- **Population Generation** - Creates diverse solution candidates
- **Fitness Evaluation** - Scores solutions on performance, complexity, risk
- **Tournament Selection** - Selects best candidates for breeding
- **Crossover** - Combines successful solution strategies
- **Mutation** - AST-based code mutations (variable names, ORM methods, caching)
- **Elitism** - Preserves top solutions across generations

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
| **Auth** | JWT, OAuth 2.0 (Google, GitHub) |
| **Parser** | Babel (AST parsing) |
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
EVO_ENABLE_ALGORITHM=true
EVO_POPULATION_SIZE=20
EVO_MAX_GENERATIONS=10
EVO_MUTATION_RATE=0.3
EVO_CROSSOVER_RATE=0.7
EVO_ELITISM_COUNT=2
EVO_MAX_TIME_MS=30000
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
│   │   ├── middleware/               # Auth, rate limiting
│   │   ├── services/                 # Business logic
│   │   └── utils/                    # JWT, helpers
│   ├── analyzer/
│   │   ├── parser.ts                 # AST parser
│   │   └── code-analyzer.ts          # Main orchestrator
│   ├── detectors/
│   │   ├── base-detector.ts
│   │   ├── n1-query-detector.ts
│   │   ├── inefficient-loop-detector.ts
│   │   ├── memory-leak-detector.ts
│   │   └── large-payload-detector.ts
│   ├── generators/
│   │   ├── evolutionary-engine.ts    # Genetic algorithm
│   │   ├── fitness-calculator.ts     # Solution scoring
│   │   ├── mutation-operators.ts     # AST mutations
│   │   └── n1-query-solution-generator.ts
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

## 🗺️ Roadmap

- [x] Core code analysis detectors
- [x] Evolutionary solution engine
- [x] Web interface with Angular
- [x] OAuth authentication
- [x] GitHub repository integration
- [ ] VS Code extension
- [ ] CI/CD integration (GitHub Actions)
- [ ] Custom detector plugins
- [ ] Team collaboration features
- [ ] Solution A/B testing

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
