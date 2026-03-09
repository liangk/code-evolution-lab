# Environment Variables

Complete reference for all environment variables.

## Backend Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp backend/.env.example backend/.env
```

### Database

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |

**Format:**
```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
```

**Examples:**
```env
# Local development
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/code_evolution_lab"

# Railway
DATABASE_URL="postgresql://postgres:xxx@xxx.railway.app:5432/railway"
```

---

### Server

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | API server port |
| `NODE_ENV` | No | `development` | Environment mode |
| `FRONTEND_URL` | No | `http://localhost:8201` | Frontend URL for CORS |

---

### JWT Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_ACCESS_SECRET` | Yes | — | Access token signing secret |
| `JWT_REFRESH_SECRET` | Yes | — | Refresh token signing secret |
| `JWT_ACCESS_EXPIRY` | No | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRY` | No | `7d` | Refresh token lifetime |

**Generate secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

### Google OAuth

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | No | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | — | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | No | — | OAuth callback URL |
| `GOOGLE_OAUTH_SCOPES` | No | `openid email profile` | OAuth scopes |

---

### GitHub OAuth

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_CLIENT_ID` | No | — | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | No | — | GitHub OAuth client secret |
| `GITHUB_REDIRECT_URI` | No | — | OAuth callback URL |
| `GITHUB_OAUTH_SCOPES` | No | `read:user user:email` | OAuth scopes |

---

### Auth Security

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SKIP_EMAIL_VERIFICATION` | No | `true` | Skip email verification |
| `AUTH_LOGIN_CAPTCHA_THRESHOLD` | No | `3` | Failed attempts before CAPTCHA |
| `AUTH_LOGIN_LOCK_AFTER` | No | `10` | Failed attempts before lockout |
| `AUTH_LOGIN_LOCK_MINUTES` | No | `10` | Lockout duration (minutes) |

---

### Evolutionary Algorithm

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EVO_ENABLE_ALGORITHM` | No | `true` | Enable evolutionary optimization |
| `EVO_POPULATION_SIZE` | No | `20` | Candidates per generation |
| `EVO_MAX_GENERATIONS` | No | `10` | Maximum evolution cycles |
| `EVO_MUTATION_RATE` | No | `0.3` | Mutation probability (0-1) |
| `EVO_CROSSOVER_RATE` | No | `0.7` | Crossover probability (0-1) |
| `EVO_ELITISM_COUNT` | No | `2` | Elite solutions preserved |
| `EVO_CONVERGENCE_THRESHOLD` | No | `0.01` | Early stop threshold |
| `EVO_TOURNAMENT_SIZE` | No | `3` | Tournament selection size |
| `EVO_MAX_TIME_MS` | No | `30000` | Max evolution time (ms) |

---

## Example Configuration

### Development

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/code_evolution_lab"

# Server
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:8201

# JWT (use random secrets in production)
JWT_ACCESS_SECRET=dev_access_secret_change_in_production
JWT_REFRESH_SECRET=dev_refresh_secret_change_in_production
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Auth
SKIP_EMAIL_VERIFICATION=true

# Evolution (faster for development)
EVO_ENABLE_ALGORITHM=true
EVO_POPULATION_SIZE=5
EVO_MAX_GENERATIONS=3
EVO_MAX_TIME_MS=10000
```

### Production

```env
# Database
DATABASE_URL="postgresql://user:pass@production-host:5432/code_evolution_lab"

# Server
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://app.codeevolutionlab.com

# JWT (use strong random secrets)
JWT_ACCESS_SECRET=<64-byte-random-hex>
JWT_REFRESH_SECRET=<64-byte-random-hex>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=https://api.codeevolutionlab.com/api/auth/social/callback

GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GITHUB_REDIRECT_URI=https://api.codeevolutionlab.com/api/auth/social/callback

# Auth
SKIP_EMAIL_VERIFICATION=false
AUTH_LOGIN_CAPTCHA_THRESHOLD=3
AUTH_LOGIN_LOCK_AFTER=10
AUTH_LOGIN_LOCK_MINUTES=15

# Evolution (quality for production)
EVO_ENABLE_ALGORITHM=true
EVO_POPULATION_SIZE=20
EVO_MAX_GENERATIONS=10
EVO_MAX_TIME_MS=30000
```

## Frontend Environment

Frontend configuration is in TypeScript files, not environment variables:

**`apps/web/src/environments/environment.ts`**
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api'
};
```

**`apps/web/src/environments/environment.prod.ts`**
```typescript
export const environment = {
  production: true,
  apiUrl: 'https://api.codeevolutionlab.com/api'
};
```
