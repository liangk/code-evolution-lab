# Frontend Components

Overview of key Angular components in Code Evolution Lab.

## Component Hierarchy

```
AppComponent
├── NavbarComponent
└── <router-outlet>
    ├── LandingComponent
    ├── LoginPage
    ├── RegisterPage
    ├── DashboardComponent
    ├── CodeAnalysisComponent
    │   └── EvolutionProgressComponent
    ├── RepositoryComponent
    ├── RepositoryDetailComponent
    │   └── AnalysisResultsComponent
    ├── ProfileComponent
    ├── SettingsComponent
    └── SessionsComponent
```

## Core Components

### NavbarComponent

Global navigation bar with auth-aware links.

**Location:** `components/navbar/`

**Features:**
- Responsive navigation menu
- User avatar and dropdown
- Login/logout links
- Active route highlighting

---

### LandingComponent

Public landing page with feature highlights.

**Location:** `components/landing/`

**Features:**
- Hero section with CTA
- Feature cards
- Demo code analysis
- Pricing overview

---

### DashboardComponent

User dashboard with analysis overview.

**Location:** `components/dashboard/`

**Features:**
- Analysis statistics
- Recent analyses list
- Score trends chart
- Quick actions

**Data:**
```typescript
interface DashboardData {
  totalRepositories: number;
  totalAnalyses: number;
  totalIssues: number;
  averageScore: number;
  recentAnalyses: Analysis[];
}
```

---

### CodeAnalysisComponent

Direct code input for instant analysis.

**Location:** `components/code-analysis/`

**Features:**
- Code editor textarea
- Language detection
- Real-time analysis
- Solution display
- Evolution progress visualization

**Usage:**
```html
<app-code-analysis></app-code-analysis>
```

---

### EvolutionProgressComponent

Real-time evolutionary algorithm visualization.

**Location:** `components/evolution-progress/`

**Features:**
- Generation progress bar
- Fitness score display
- Population visualization
- Best solution preview

**Inputs:**
```typescript
@Input() progress: EvolutionProgress;
```

---

### AnalysisResultsComponent

Displays analysis results with issues and solutions.

**Location:** `components/analysis-results/`

**Features:**
- Issue list by severity
- Code before/after comparison
- Solution ranking
- Impact metrics

---

### RepositoryComponent

List and manage GitHub repositories.

**Location:** `components/repository/`

**Features:**
- Repository cards
- Add repository form
- Last analysis date
- Quick analyze action

---

### RepositoryDetailComponent

Single repository view with analysis history.

**Location:** `components/repository-detail/`

**Features:**
- Repository info
- Analysis history table
- Trigger new analysis
- Delete repository

---

### LoginPage / RegisterPage

Authentication forms.

**Location:** `components/login/`, `components/register/`

**Features:**
- Email/password form
- OAuth buttons (Google, GitHub)
- Form validation
- Error display

---

### ProfileComponent

User profile management.

**Location:** `components/profile/`

**Features:**
- Display user info
- Edit name
- Change password
- Avatar upload

---

### SessionsComponent

Manage active sessions.

**Location:** `components/sessions/`

**Features:**
- List all sessions
- Device info display
- Revoke individual session
- Revoke all sessions

## Creating New Components

Generate with Angular CLI:

```bash
ng generate component components/my-component --standalone
```

Component template:

```typescript
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-my-component',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './my-component.html',
  styleUrl: './my-component.scss'
})
export class MyComponent {
  // Component logic
}
```
