# System Architecture

Code Evolution Lab follows a modern three-tier architecture with a decoupled frontend and backend.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Frontend                                    │
│                        Angular 21 Application                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │  Dashboard  │  │  Analysis   │  │ Repository  │  │   Auth      │   │
│  │  Component  │  │  Component  │  │  Component  │  │  Component  │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
│                              │                                          │
│                    ┌─────────▼─────────┐                               │
│                    │  Analysis Service │  ← SSE Progress               │
│                    └───────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────┘
                               │ HTTP/SSE
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              Backend                                     │
│                        Express.js API Server                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         API Layer                                │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────┐ │   │
│  │  │ Analysis│  │  Auth   │  │  Repo   │  │Dashboard│  │  SSE  │ │   │
│  │  │ Routes  │  │ Routes  │  │ Routes  │  │ Routes  │  │Routes │ │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └───────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                               │                                         │
│  ┌────────────────────────────▼────────────────────────────────────┐   │
│  │                      Core Engine                                 │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │   │
│  │  │ Code Parser  │  │  Detectors   │  │ Evolutionary Engine  │  │   │
│  │  │  (Babel AST) │  │  (4 types)   │  │ (Genetic Algorithm)  │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘  │   │
│  │                               │                                  │   │
│  │  ┌────────────────────────────▼─────────────────────────────┐  │   │
│  │  │              Solution Generators (4 types)                │  │   │
│  │  │  N+1 Query │ Loop │ Memory Leak │ Large Payload          │  │   │
│  │  └──────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Database                                       │
│                         PostgreSQL                                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────┐   │
│  │  Users  │  │Sessions │  │  Repos  │  │Analyses │  │Issues/Solns │   │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Overview

### Frontend (Angular 21)

| Component | Responsibility |
|-----------|---------------|
| `LandingComponent` | Public landing page |
| `DashboardComponent` | User dashboard with analysis overview |
| `CodeAnalysisComponent` | Direct code input analysis |
| `RepositoryComponent` | GitHub repository management |
| `AnalysisResultsComponent` | Display analysis results with solutions |
| `EvolutionProgressComponent` | Real-time evolution visualization |

### Backend (Express.js)

| Module | Responsibility |
|--------|---------------|
| `api/routes/` | REST API endpoints |
| `analyzer/` | Code parsing and AST generation |
| `detectors/` | Issue detection logic |
| `generators/` | Solution generation with evolutionary algorithm |

### Database (PostgreSQL + Prisma)

| Table | Purpose |
|-------|---------|
| `users` | User accounts and authentication |
| `sessions` | Active user sessions |
| `repositories` | GitHub repository references |
| `analyses` | Analysis run metadata |
| `issues` | Detected code issues |
| `solutions` | Generated solutions for issues |

## Data Flow

### Analysis Request Flow

```
1. User submits code → Frontend
2. Frontend → POST /api/analyze → Backend
3. Backend parses code (Babel AST)
4. Detectors scan AST for issues
5. For each issue:
   a. Generate initial solutions (base generator)
   b. Evolve solutions (evolutionary engine)
   c. Emit SSE progress events
6. Return final results to frontend
7. Save to database (if authenticated)
```

### Evolutionary Solution Flow

```
1. Initial Population
   └─ Generate N solution candidates from original code

2. Fitness Evaluation
   └─ Score each candidate on:
      - Performance improvement
      - Code structure preservation
      - Syntax validity

3. Selection (Tournament)
   └─ Select parents based on fitness

4. Crossover
   └─ Combine transformation strategies

5. Mutation
   └─ Apply random transformations

6. Repeat for G generations

7. Return top-ranked solutions
```

## Security Architecture

### Authentication Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │────▶│   API    │────▶│   DB     │
└──────────┘     └──────────┘     └──────────┘
     │                │
     │  1. Login      │  2. Verify credentials
     │───────────────▶│───────────────────────▶
     │                │
     │  3. JWT tokens │  4. Create session
     │◀───────────────│◀───────────────────────
     │                │
     │  5. API calls  │
     │  (Bearer token)│
     │───────────────▶│
```

### Token Strategy

- **Access Token**: Short-lived (15 min), stored in memory
- **Refresh Token**: Long-lived (7 days), stored in httpOnly cookie
- **Token Version**: Invalidate all tokens on password change

## Scalability Considerations

### Horizontal Scaling

- Stateless API servers behind load balancer
- Database connection pooling via Prisma
- SSE connections can be distributed

### Performance Optimizations

- AST caching for repeated analysis
- Parallel detector execution
- Configurable population size and generations
- Early termination on convergence
