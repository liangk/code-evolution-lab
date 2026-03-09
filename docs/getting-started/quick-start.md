# Quick Start Guide

Get Code Evolution Lab running in minutes.

## Prerequisites

- **Node.js** 18+ (recommended: 20+)
- **PostgreSQL** 14+ (for backend database)
- **npm** 9+ or **pnpm**

## 1. Clone the Repository

```bash
git clone https://github.com/liangk/code-evolution-lab.git
cd code-evolution-lab
```

## 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your database credentials
# DATABASE_URL="postgresql://username:password@localhost:5432/code_evolution_lab"

# Run database migrations
npm run prisma:migrate

# Start the API server
npm run start:api
```

The API server will start at `http://localhost:3000`.

## 3. Frontend Setup

Open a new terminal:

```bash
cd apps/web

# Install dependencies
npm install

# Start development server
npm start
```

The frontend will be available at `http://localhost:8201`.

## 4. Verify Installation

1. Open `http://localhost:8201` in your browser
2. Navigate to the Code Analysis page
3. Paste sample code to analyze:

```javascript
// Sample code with performance issues
async function fetchAllUsers() {
  const users = await db.users.findMany();
  for (const user of users) {
    // N+1 query problem
    const orders = await db.orders.findMany({ where: { userId: user.id } });
    user.orders = orders;
  }
  return users;
}
```

4. Click "Analyze" to see detected issues and generated solutions

## 5. Using the CLI

Analyze files directly from the command line:

```bash
cd backend

# Analyze a single file
npm run analyze -- ./examples/sample-code.ts

# Analyze with solution generation
npm run analyze -- ./src/**/*.ts --solutions

# Output as JSON
npm run analyze -- ./src/**/*.ts --format json -o results.json
```

## Next Steps

- [Installation Guide](./installation.md) — Detailed setup instructions
- [Configuration Reference](./configuration.md) — Environment variables and options
- [REST API](../api/rest-api.md) — API endpoint documentation
