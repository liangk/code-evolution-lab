# Configuration Reference

Complete configuration options for Code Evolution Lab.

## Environment Variables

All configuration is done through environment variables in the `backend/.env` file.

### Database Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | — | Yes |

Example:
```env
DATABASE_URL="postgresql://user:pass@localhost:5432/code_evolution_lab?schema=public"
```

### Server Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | `3000` |
| `NODE_ENV` | Environment mode | `development` |
| `FRONTEND_URL` | Frontend origin for CORS | `http://localhost:8201` |

### JWT Authentication

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_ACCESS_SECRET` | Access token signing secret | — |
| `JWT_REFRESH_SECRET` | Refresh token signing secret | — |
| `JWT_ACCESS_EXPIRY` | Access token expiration | `15m` |
| `JWT_REFRESH_EXPIRY` | Refresh token expiration | `7d` |

### OAuth Configuration

**Google OAuth:**

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL |
| `GOOGLE_OAUTH_SCOPES` | OAuth scopes (default: `openid email profile`) |

**GitHub OAuth:**

| Variable | Description |
|----------|-------------|
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret |
| `GITHUB_REDIRECT_URI` | OAuth callback URL |
| `GITHUB_OAUTH_SCOPES` | OAuth scopes (default: `read:user user:email`) |

### Auth Security

| Variable | Description | Default |
|----------|-------------|---------|
| `SKIP_EMAIL_VERIFICATION` | Skip email verification | `true` |
| `AUTH_LOGIN_CAPTCHA_THRESHOLD` | Failed logins before captcha | `3` |
| `AUTH_LOGIN_LOCK_AFTER` | Failed logins before lock | `10` |
| `AUTH_LOGIN_LOCK_MINUTES` | Account lock duration | `10` |

### Evolutionary Algorithm

| Variable | Description | Default |
|----------|-------------|---------|
| `EVO_ENABLE_ALGORITHM` | Enable evolutionary engine | `true` |
| `EVO_POPULATION_SIZE` | Population size per generation | `20` |
| `EVO_MAX_GENERATIONS` | Maximum generations | `10` |
| `EVO_MUTATION_RATE` | Mutation probability (0-1) | `0.3` |
| `EVO_CROSSOVER_RATE` | Crossover probability (0-1) | `0.7` |
| `EVO_ELITISM_COUNT` | Elite solutions to preserve | `2` |
| `EVO_CONVERGENCE_THRESHOLD` | Stop when fitness delta below | `0.01` |
| `EVO_TOURNAMENT_SIZE` | Tournament selection size | `3` |
| `EVO_MAX_TIME_MS` | Maximum evolution time (ms) | `30000` |

## Configuration File

Create `.codeevolutionrc.json` in your project root for project-specific settings:

```json
{
  "detectors": {
    "n1Query": { "enabled": true, "severity": "high" },
    "inefficientLoop": { "enabled": true },
    "memoryLeak": { "enabled": true },
    "largePayload": { "enabled": true, "threshold": 1000 }
  },
  "ignore": [
    "**/node_modules/**",
    "**/dist/**",
    "**/*.test.ts"
  ],
  "output": {
    "format": "json",
    "path": "./analysis-results"
  }
}
```

### Detector Configuration

| Option | Type | Description |
|--------|------|-------------|
| `enabled` | boolean | Enable/disable detector |
| `severity` | string | Override default severity |
| `threshold` | number | Detector-specific threshold |

### Ignore Patterns

Glob patterns for files/directories to exclude from analysis.

### Output Configuration

| Option | Values | Description |
|--------|--------|-------------|
| `format` | `text`, `json`, `sarif` | Output format |
| `path` | string | Output directory |

## Frontend Configuration

Frontend configuration in `apps/web/src/environments/`:

**environment.ts (development):**
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api'
};
```

**environment.prod.ts (production):**
```typescript
export const environment = {
  production: true,
  apiUrl: 'https://api.codeevolutionlab.com/api'
};
```

## Performance Tuning

### For Large Codebases

```env
# Increase concurrency
EVO_POPULATION_SIZE=10
EVO_MAX_GENERATIONS=5
EVO_MAX_TIME_MS=60000
```

### For Quick Analysis

```env
# Disable evolutionary algorithm for fast scanning
EVO_ENABLE_ALGORITHM=false
```

### For Thorough Analysis

```env
# Maximum quality solutions
EVO_POPULATION_SIZE=30
EVO_MAX_GENERATIONS=20
EVO_MUTATION_RATE=0.4
EVO_CONVERGENCE_THRESHOLD=0.005
```
