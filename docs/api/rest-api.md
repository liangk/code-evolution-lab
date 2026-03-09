# REST API Reference

Complete API documentation for Code Evolution Lab backend.

## Base URL

```
Development: http://localhost:3000/api
Production:  https://api.codeevolutionlab.com/api
```

## Authentication

Most endpoints require JWT authentication via Bearer token:

```http
Authorization: Bearer <access_token>
```

## Endpoints

### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "message": "Code Evolution Lab API is running"
}
```

---

### Analysis

#### Analyze Code

```http
POST /api/analyze
```

Analyzes code for performance issues and generates solutions.

**Request Body:**
```json
{
  "code": "string",           // Source code to analyze
  "filePath": "string",       // Optional file path for context
  "generateSolutions": true,  // Enable solution generation
  "sessionId": "string"       // Optional SSE session ID
}
```

**Response:**
```json
{
  "success": true,
  "score": 72.5,
  "totalIssues": 5,
  "issuesBySeverity": {
    "critical": 1,
    "high": 2,
    "medium": 2,
    "low": 0
  },
  "results": [
    {
      "detectorName": "n1-query-detector",
      "issues": [
        {
          "id": "uuid",
          "type": "n_plus_1_query",
          "severity": "critical",
          "filePath": "src/service.ts",
          "lineNumber": 45,
          "title": "N+1 Query detected in loop",
          "description": "Database query inside for-of loop",
          "codeBefore": "...",
          "solutions": [
            {
              "id": "uuid",
              "type": "batch_query",
              "code": "...",
              "fitnessScore": 0.92,
              "reasoning": "Batch queries reduce database round trips"
            }
          ]
        }
      ]
    }
  ]
}
```

#### Get Analysis

```http
GET /api/analysis/:id
```

**Response:**
```json
{
  "id": "uuid",
  "repositoryId": "uuid",
  "score": 72.5,
  "filesAnalyzed": 150,
  "totalIssues": 5,
  "criticalIssues": 1,
  "highIssues": 2,
  "mediumIssues": 2,
  "analyzedAt": "2026-02-22T10:00:00Z",
  "issues": [...]
}
```

#### Delete Analysis

```http
DELETE /api/analysis/:id
```

**Response:**
```json
{
  "success": true,
  "message": "Analysis deleted"
}
```

---

### Repositories

#### List Repositories

```http
GET /api/repositories
```

**Response:**
```json
{
  "repositories": [
    {
      "id": "uuid",
      "name": "my-project",
      "githubUrl": "https://github.com/user/my-project",
      "isPrivate": false,
      "lastAnalyzedAt": "2026-02-22T10:00:00Z"
    }
  ]
}
```

#### Create Repository

```http
POST /api/repositories
```

**Request Body:**
```json
{
  "name": "my-project",
  "githubUrl": "https://github.com/user/my-project"
}
```

#### Delete Repository

```http
DELETE /api/repositories/:id
```

#### Analyze GitHub Repository

```http
POST /api/repository/:id/analyze-github
```

**Request Body:**
```json
{
  "generateSolutions": true,
  "sessionId": "optional-sse-session"
}
```

#### Get Repository Analyses

```http
GET /api/repositories/:id/analyses
```

---

### Dashboard

#### Get Dashboard Data

```http
GET /api/dashboard
```

**Response:**
```json
{
  "totalRepositories": 5,
  "totalAnalyses": 23,
  "totalIssues": 142,
  "averageScore": 76.4,
  "recentAnalyses": [...],
  "issuesTrend": [...]
}
```

---

### Authentication

See [Authentication](./authentication.md) for detailed auth endpoints.

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

**Common Error Codes:**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `RATE_LIMIT` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

## Rate Limiting

| Endpoint | Limit |
|----------|-------|
| General API | 100 req/min |
| Analysis | 10 req/min |
| Auth | 20 req/min |

Rate limit headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1708600000
```
