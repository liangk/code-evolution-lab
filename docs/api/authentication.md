# Authentication

Code Evolution Lab uses JWT-based authentication with refresh token rotation.

## Authentication Flow

```
┌──────────┐                    ┌──────────┐                    ┌──────────┐
│  Client  │                    │   API    │                    │    DB    │
└────┬─────┘                    └────┬─────┘                    └────┬─────┘
     │                               │                               │
     │  1. POST /auth/login          │                               │
     │  { email, password }          │                               │
     │──────────────────────────────▶│                               │
     │                               │  2. Verify credentials        │
     │                               │──────────────────────────────▶│
     │                               │                               │
     │                               │  3. Create session            │
     │                               │──────────────────────────────▶│
     │                               │                               │
     │  4. { accessToken }           │                               │
     │  + Set-Cookie: refreshToken   │                               │
     │◀──────────────────────────────│                               │
     │                               │                               │
     │  5. API request               │                               │
     │  Authorization: Bearer <AT>   │                               │
     │──────────────────────────────▶│                               │
     │                               │                               │
     │  6. When AT expires:          │                               │
     │  POST /auth/refresh           │                               │
     │  Cookie: refreshToken         │                               │
     │──────────────────────────────▶│                               │
     │                               │                               │
     │  7. New { accessToken }       │                               │
     │◀──────────────────────────────│                               │
     │                               │                               │
```

## Endpoints

### Register

```http
POST /api/auth/register
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "name": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Login

```http
POST /api/auth/login
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Cookies Set:**
```
Set-Cookie: refreshToken=<token>; HttpOnly; Secure; SameSite=Strict; Max-Age=604800
```

### Refresh Token

```http
POST /api/auth/refresh
```

Requires `refreshToken` cookie.

**Response:**
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Logout

```http
POST /api/auth/logout
```

Clears refresh token cookie and invalidates session.

### Get Current User

```http
GET /api/auth/me
```

**Response:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "avatarUrl": "https://...",
  "authProvider": null
}
```

---

## OAuth Authentication

### Google OAuth

```http
GET /api/auth/social/google
```

Redirects to Google OAuth consent screen.

**Callback:**
```http
GET /api/auth/social/callback?code=<auth_code>&state=google
```

### GitHub OAuth

```http
GET /api/auth/social/github
```

Redirects to GitHub OAuth authorization.

**Callback:**
```http
GET /api/auth/social/callback?code=<auth_code>&state=github
```

---

## Session Management

### List Sessions

```http
GET /api/sessions
```

**Response:**
```json
{
  "sessions": [
    {
      "id": "uuid",
      "device": "Chrome on Windows",
      "ipAddress": "192.168.1.1",
      "location": "San Francisco, CA",
      "lastActive": "2026-02-22T10:00:00Z",
      "isActive": true,
      "isCurrent": true
    }
  ]
}
```

### Revoke Session

```http
DELETE /api/sessions/:id
```

### Revoke All Sessions

```http
DELETE /api/sessions/all
```

Logs out all devices except current.

---

## Token Structure

### Access Token (JWT)

```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "tokenVersion": 0,
  "iat": 1708600000,
  "exp": 1708600900
}
```

- **Expiry:** 15 minutes (configurable via `JWT_ACCESS_EXPIRY`)
- **Storage:** Client memory (not localStorage)

### Refresh Token (JWT)

```json
{
  "userId": "uuid",
  "tokenVersion": 0,
  "iat": 1708600000,
  "exp": 1709204800
}
```

- **Expiry:** 7 days (configurable via `JWT_REFRESH_EXPIRY`)
- **Storage:** HttpOnly cookie

## Security Features

### Token Versioning

Each user has a `tokenVersion` field. Incrementing it invalidates all existing tokens:

```typescript
// Invalidate all user tokens
await prisma.user.update({
  where: { id: userId },
  data: { tokenVersion: { increment: 1 } }
});
```

### Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/auth/login` | 5 | 15 min |
| `/auth/register` | 3 | 1 hour |
| `/auth/refresh` | 10 | 1 min |

### Account Lockout

After `AUTH_LOGIN_LOCK_AFTER` failed attempts:
- Account locked for `AUTH_LOGIN_LOCK_MINUTES`
- CAPTCHA required after `AUTH_LOGIN_CAPTCHA_THRESHOLD` attempts

## Frontend Integration

```typescript
// Angular AuthService
@Injectable({ providedIn: 'root' })
export class AuthService {
  private accessToken: string | null = null;

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/login', { email, password })
      .pipe(tap(res => this.accessToken = res.accessToken));
  }

  getAuthHeader(): HttpHeaders {
    return new HttpHeaders({
      'Authorization': `Bearer ${this.accessToken}`
    });
  }
}
```
