# Database Schema

Code Evolution Lab uses PostgreSQL with Prisma ORM.

## Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐
│    User     │───────│   Session   │
│             │ 1   N │             │
└─────────────┘       └─────────────┘
       │
       │ (owner)
       ▼
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│ Repository  │───────│  Analysis   │───────│    Issue    │
│             │ 1   N │             │ 1   N │             │
└─────────────┘       └─────────────┘       └─────────────┘
                                                   │
                                                   │ 1   N
                                                   ▼
                                            ┌─────────────┐
                                            │  Solution   │
                                            │             │
                                            └─────────────┘
```

## Tables

### User

Stores user accounts and authentication data.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `email` | String | Unique email address |
| `password` | String? | Hashed password (null for OAuth) |
| `name` | String? | Display name |
| `avatarUrl` | String? | Profile picture URL |
| `authProvider` | String? | `google`, `github`, or null |
| `googleId` | String? | Google OAuth ID |
| `githubId` | String? | GitHub OAuth ID |
| `githubToken` | String? | GitHub access token for repo analysis |
| `userType` | Enum | `CUSTOMER` or `TUNER` |
| `tokenVersion` | Int | Incremented to invalidate tokens |
| `lastLoginAt` | DateTime? | Last login timestamp |
| `isSuspended` | Boolean | Account suspension flag |
| `createdAt` | DateTime | Account creation time |
| `updatedAt` | DateTime | Last update time |

### Session

Tracks active user sessions for security.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `userId` | UUID | Foreign key to User |
| `ipAddress` | String? | Client IP address |
| `userAgent` | String? | Browser user agent |
| `device` | String? | Parsed device type |
| `location` | String? | Geo-location (if available) |
| `createdAt` | DateTime | Session start time |
| `lastActive` | DateTime | Last activity time |
| `isActive` | Boolean | Session validity flag |

### Repository

Stores GitHub repository references.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `githubUrl` | String | Full GitHub URL |
| `name` | String | Repository name |
| `ownerId` | UUID | User who added the repo |
| `isPrivate` | Boolean | Private repository flag |
| `lastAnalyzedAt` | DateTime? | Last analysis timestamp |
| `createdAt` | DateTime | When added to system |

### Analysis

Stores analysis run metadata and summary.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `repositoryId` | UUID | Foreign key to Repository |
| `score` | Float | Overall health score (0-100) |
| `filesAnalyzed` | Int | Number of files scanned |
| `totalIssues` | Int | Total issues found |
| `criticalIssues` | Int | Critical severity count |
| `highIssues` | Int | High severity count |
| `mediumIssues` | Int | Medium severity count |
| `analyzedAt` | DateTime | Analysis timestamp |

### Issue

Stores individual detected issues.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `analysisId` | UUID | Foreign key to Analysis |
| `type` | String | Issue type identifier |
| `severity` | String | `critical`, `high`, `medium`, `low` |
| `score` | Float | Issue severity score |
| `filePath` | String | File where issue found |
| `lineNumber` | Int? | Line number in file |
| `title` | String | Short issue title |
| `description` | String? | Detailed explanation |
| `codeBefore` | String? | Original problematic code |
| `codeAfter` | String? | Suggested fix (basic) |
| `estimatedImpact` | JSON? | Impact metrics |
| `createdAt` | DateTime | Detection timestamp |

### Solution

Stores evolved solutions for issues.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `issueId` | UUID | Foreign key to Issue |
| `type` | String | Solution type |
| `description` | String | Solution description |
| `codeAfter` | String | Generated solution code |
| `explanation` | String? | Why this solution works |
| `estimatedImpact` | String? | Expected improvement |
| `difficulty` | String? | Implementation difficulty |
| `fitnessScore` | Float | Evolutionary fitness score |
| `rank` | Int | Solution ranking |
| `createdAt` | DateTime | Generation timestamp |

## Indexes

```sql
-- User lookups
CREATE INDEX idx_users_email ON users(email);

-- Session queries
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- Analysis queries by repository
CREATE INDEX idx_analyses_repository_id ON analyses(repository_id);

-- Issue queries by analysis
CREATE INDEX idx_issues_analysis_id ON issues(analysis_id);

-- Solution queries by issue
CREATE INDEX idx_solutions_issue_id ON solutions(issue_id);
```

## Prisma Schema

Full schema in `backend/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserType {
  CUSTOMER
  TUNER
}

model User {
  id           String    @id @default(uuid())
  email        String    @unique
  password     String?
  name         String?
  // ... (see full schema in codebase)
}
```

## Migrations

Run migrations with:

```bash
cd backend

# Create new migration
npm run prisma:migrate -- --name migration_name

# Apply migrations
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset
```
