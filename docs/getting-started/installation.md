# Installation Guide

Complete installation instructions for Code Evolution Lab.

## System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Node.js | 18.x | 20.x or 22.x |
| PostgreSQL | 14.x | 16.x |
| RAM | 4 GB | 8 GB |
| Disk Space | 500 MB | 1 GB |

## Backend Installation

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Database Setup

**Option A: Local PostgreSQL**

```bash
# Create database
createdb code_evolution_lab

# Or using psql
psql -U postgres -c "CREATE DATABASE code_evolution_lab;"
```

**Option B: Docker**

```bash
docker run -d \
  --name cel-postgres \
  -e POSTGRES_DB=code_evolution_lab \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  postgres:16
```

### 3. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/code_evolution_lab"
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:8201
```

### 4. Database Migration

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# (Optional) Open Prisma Studio
npm run prisma:studio
```

### 5. Start the Server

```bash
# Development mode
npm run start:api

# Or build and run
npm run build
node dist/api/server.js
```

## Frontend Installation

### 1. Install Dependencies

```bash
cd apps/web
npm install
```

### 2. Environment Configuration

The frontend connects to the backend API. Default configuration in `src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api'
};
```

### 3. Start Development Server

```bash
npm start
```

Access at `http://localhost:8201`.

### 4. Build for Production

```bash
npm run build
```

Output in `dist/web/browser/`.

## OAuth Setup (Optional)

### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials
3. Add authorized redirect URI: `http://localhost:3000/api/auth/social/callback`
4. Update `.env`:

```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/social/callback
```

### GitHub OAuth

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set callback URL: `http://localhost:3000/api/auth/social/callback`
4. Update `.env`:

```env
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_REDIRECT_URI=http://localhost:3000/api/auth/social/callback
```

## Deployment

### Netlify (Frontend)

The frontend includes `netlify.toml` for deployment:

```bash
cd apps/web
npm run build
# Deploy dist/web/browser to Netlify
```

### Railway (Backend)

The project includes `railway.toml` for backend deployment:

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm run start:api"
```

## Troubleshooting

### Database Connection Failed

```
Error: P1001: Can't reach database server
```

**Solution:** Ensure PostgreSQL is running and `DATABASE_URL` is correct.

### Port Already in Use

```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution:** Change `PORT` in `.env` or kill the process using the port.

### Prisma Client Not Generated

```
Error: @prisma/client did not initialize yet
```

**Solution:** Run `npm run prisma:generate` before starting the server.
