# Tech Stack

Complete technology stack for Code Evolution Lab.

## Overview

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend | Angular | 21.x |
| Backend | Express.js | 4.18.x |
| Database | PostgreSQL | 14+ |
| ORM | Prisma | 5.x |
| Language | TypeScript | 5.x |

## Frontend Stack

### Core Framework

| Package | Purpose |
|---------|---------|
| `@angular/core` | Angular framework |
| `@angular/router` | Client-side routing |
| `@angular/forms` | Reactive forms |
| `@angular/animations` | UI animations |

### UI & Styling

| Package | Purpose |
|---------|---------|
| SCSS | Styling preprocessor |
| `ngx-lite-form` | Lightweight form utilities |

### HTTP & State

| Package | Purpose |
|---------|---------|
| `HttpClient` | API communication |
| `rxjs` | Reactive state management |

### Build Tools

| Tool | Purpose |
|------|---------|
| `@angular/cli` | Build and development |
| `@angular/build` | Production bundling |
| `Vitest` | Unit testing |

## Backend Stack

### Core Framework

| Package | Purpose |
|---------|---------|
| `express` | HTTP server framework |
| `cors` | Cross-origin resource sharing |
| `cookie-parser` | Cookie handling |
| `dotenv` | Environment configuration |

### Code Analysis

| Package | Purpose |
|---------|---------|
| `@babel/parser` | JavaScript/TypeScript parsing |
| `@babel/traverse` | AST traversal |
| `@babel/types` | AST node types |
| `glob` | File pattern matching |

### Database & ORM

| Package | Purpose |
|---------|---------|
| `@prisma/client` | Database client |
| `prisma` | Schema management |

### Authentication

| Package | Purpose |
|---------|---------|
| `jsonwebtoken` | JWT token handling |
| `bcryptjs` | Password hashing |
| `express-rate-limit` | Rate limiting |

### Validation

| Package | Purpose |
|---------|---------|
| `express-validator` | Request validation |

### Development

| Tool | Purpose |
|------|---------|
| `typescript` | Type checking |
| `ts-node` | TypeScript execution |
| `jest` | Unit testing |
| `eslint` | Code linting |
| `prettier` | Code formatting |

## Database

### PostgreSQL

- **Version**: 14+ recommended
- **Features used**: UUID, JSON, indexes
- **Connection**: Via Prisma Client

### Prisma Features

- Declarative schema
- Type-safe queries
- Automatic migrations
- Prisma Studio for data browsing

## Infrastructure

### Development

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Angular   │────▶│   Express   │────▶│  PostgreSQL │
│   :8201     │     │   :3000     │     │   :5432     │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Production

| Service | Platform |
|---------|----------|
| Frontend | Netlify |
| Backend | Railway |
| Database | Railway PostgreSQL |

## Key Design Decisions

### Why Angular 21?

- Signals for reactive state
- Standalone components
- Built-in SSR support
- Strong TypeScript integration

### Why Babel for AST?

- Comprehensive JS/TS support
- Well-documented API
- Large ecosystem
- Battle-tested in production

### Why Prisma?

- Type-safe database access
- Schema-first approach
- Excellent DX with Studio
- Easy migrations

### Why PostgreSQL?

- ACID compliance
- JSON support for flexible data
- Robust indexing
- Scalable for growth

## Version Compatibility

| Requirement | Minimum | Tested |
|-------------|---------|--------|
| Node.js | 18.x | 20.x, 22.x |
| npm | 9.x | 11.x |
| PostgreSQL | 14.x | 16.x |
| TypeScript | 5.0 | 5.9 |
