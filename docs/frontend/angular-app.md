# Angular Application

The Code Evolution Lab frontend is built with Angular 21 using standalone components.

## Project Structure

```
apps/web/src/
├── app/
│   ├── components/           # Feature components
│   │   ├── analysis-results/ # Analysis result display
│   │   ├── auth-callback/    # OAuth callback handler
│   │   ├── code-analysis/    # Direct code input
│   │   ├── dashboard/        # User dashboard
│   │   ├── evolution-progress/ # Real-time evolution display
│   │   ├── landing/          # Public landing page
│   │   ├── login/            # Login form
│   │   ├── navbar/           # Navigation bar
│   │   ├── profile/          # User profile
│   │   ├── register/         # Registration form
│   │   ├── repository/       # Repository list
│   │   ├── repository-detail/# Single repository view
│   │   ├── sessions/         # Session management
│   │   └── settings/         # User settings
│   ├── guards/               # Route guards
│   ├── interceptors/         # HTTP interceptors
│   ├── pages/                # Static pages
│   ├── services/             # Angular services
│   ├── app.config.ts         # Application configuration
│   ├── app.routes.ts         # Route definitions
│   └── app.ts                # Root component
├── environments/             # Environment configs
├── styles/                   # Global styles
└── main.ts                   # Bootstrap
```

## Key Features

### Standalone Components

All components use Angular 21 standalone architecture:

```typescript
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `...`
})
export class DashboardComponent { }
```

### Routing

Routes defined in `app.routes.ts`:

| Path | Component | Auth |
|------|-----------|------|
| `/` | LandingComponent | Public |
| `/login` | LoginPage | Guest only |
| `/register` | RegisterPage | Guest only |
| `/dashboard` | DashboardComponent | Required |
| `/repositories` | RepositoryComponent | Required |
| `/repositories/:id` | RepositoryDetailComponent | Required |
| `/analysis/:id` | AnalysisResultsComponent | Required |
| `/code-analysis` | CodeAnalysisComponent | Public |
| `/profile` | ProfileComponent | Required |
| `/settings` | SettingsComponent | Required |

### Route Guards

```typescript
// Auth guard - requires login
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  if (authService.isAuthenticated()) {
    return true;
  }
  return router.parseUrl('/login');
};

// Guest guard - redirect if logged in
export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  if (!authService.isAuthenticated()) {
    return true;
  }
  return router.parseUrl('/dashboard');
};
```

## Development

### Start Development Server

```bash
cd apps/web
npm start
```

Runs at `http://localhost:8201`.

### Build for Production

```bash
npm run build
```

Output in `dist/web/browser/`.

### Run Tests

```bash
npm test
```

Uses Vitest for unit testing.

## Configuration

### Environment Files

**Development** (`environments/environment.ts`):
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api'
};
```

**Production** (`environments/environment.prod.ts`):
```typescript
export const environment = {
  production: true,
  apiUrl: 'https://api.codeevolutionlab.com/api'
};
```

### Angular Configuration

Key settings in `angular.json`:

```json
{
  "projects": {
    "web": {
      "architect": {
        "build": {
          "options": {
            "outputPath": "dist/web",
            "styles": ["src/styles.scss"],
            "scripts": []
          }
        },
        "serve": {
          "options": {
            "port": 8201
          }
        }
      }
    }
  }
}
```

## Deployment

### Netlify

Configured via `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist/web/browser"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Manual Deployment

1. Build the application: `npm run build`
2. Deploy contents of `dist/web/browser/` to any static hosting
3. Configure SPA redirects (all routes → `index.html`)
