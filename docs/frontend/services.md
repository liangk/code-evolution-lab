# Frontend Services

Angular services for API communication and state management.

## Available Services

### AnalysisService

Handles code analysis and evolution progress.

**Location:** `services/analysis.service.ts`

**Methods:**

| Method | Description |
|--------|-------------|
| `analyzeCode(request)` | Submit code for analysis |
| `analyzeCodeWithProgress(request)` | Analyze with SSE progress |
| `getAnalysis(id)` | Get analysis by ID |
| `deleteAnalysis(id)` | Delete analysis |
| `getAllRepositories()` | List user repositories |
| `createRepository(data)` | Add new repository |
| `deleteRepository(id)` | Remove repository |
| `analyzeGithubRepository(id)` | Analyze GitHub repo |
| `connectToEvolutionProgress(sessionId)` | Connect SSE |
| `disconnectFromEvolutionProgress()` | Disconnect SSE |

**Usage:**

```typescript
@Component({...})
export class CodeAnalysisComponent {
  constructor(private analysisService: AnalysisService) {}

  analyze() {
    const { sessionId, result$ } = this.analysisService.analyzeCodeWithProgress({
      code: this.code,
      generateSolutions: true
    });

    // Listen for progress
    this.analysisService.progress$.subscribe(progress => {
      console.log('Generation:', progress.generation);
    });

    // Get final result
    result$.subscribe(result => {
      console.log('Analysis complete:', result);
      this.analysisService.disconnectFromEvolutionProgress();
    });
  }
}
```

---

### AuthService

Manages authentication state and tokens.

**Location:** `services/auth.service.ts`

**Methods:**

| Method | Description |
|--------|-------------|
| `login(email, password)` | Email/password login |
| `register(email, password, name)` | Create account |
| `logout()` | Clear session |
| `refreshToken()` | Refresh access token |
| `isAuthenticated()` | Check auth state |
| `getCurrentUser()` | Get user profile |
| `updateProfile(data)` | Update user info |
| `changePassword(old, new)` | Change password |
| `initiateOAuth(provider)` | Start OAuth flow |

**State:**

```typescript
// Observable of current user
user$: Observable<User | null>;

// Observable of auth state
isAuthenticated$: Observable<boolean>;
```

**Usage:**

```typescript
@Component({...})
export class LoginComponent {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  login() {
    this.authService.login(this.email, this.password).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (err) => this.error = err.message
    });
  }

  loginWithGoogle() {
    this.authService.initiateOAuth('google');
  }
}
```

---

### SessionService

Manages user sessions.

**Location:** `services/session.service.ts`

**Methods:**

| Method | Description |
|--------|-------------|
| `getSessions()` | List all sessions |
| `revokeSession(id)` | Revoke specific session |
| `revokeAllSessions()` | Revoke all except current |

---

## HTTP Interceptors

### AuthInterceptor

Automatically attaches access token to requests.

**Location:** `interceptors/auth.interceptor.ts`

```typescript
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getAccessToken();
  
  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
  }
  
  return next(req).pipe(
    catchError(error => {
      if (error.status === 401) {
        // Try to refresh token
        return authService.refreshToken().pipe(
          switchMap(() => next(req))
        );
      }
      return throwError(() => error);
    })
  );
};
```

## State Management

Services use RxJS BehaviorSubjects for reactive state:

```typescript
@Injectable({ providedIn: 'root' })
export class AuthService {
  private userSubject = new BehaviorSubject<User | null>(null);
  public user$ = this.userSubject.asObservable();

  login(email: string, password: string): Observable<void> {
    return this.http.post<LoginResponse>('/api/auth/login', { email, password })
      .pipe(
        tap(response => {
          this.setAccessToken(response.accessToken);
          this.userSubject.next(response.user);
        }),
        map(() => void 0)
      );
  }
}
```

## Error Handling

Services throw typed errors:

```typescript
interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string>;
}

// In component
this.analysisService.analyzeCode(request).subscribe({
  error: (err: ApiError) => {
    if (err.code === 'RATE_LIMIT') {
      this.showRateLimitWarning();
    } else {
      this.showError(err.message);
    }
  }
});
```
