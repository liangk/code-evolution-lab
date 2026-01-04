import { Routes } from '@angular/router';
import { LandingComponent } from './components/landing/landing.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { RepositoryComponent } from './components/repository/repository.component';
import { RepositoryDetailComponent } from './components/repository-detail/repository-detail.component';
import { AnalysisResultsComponent } from './components/analysis-results/analysis-results.component';
import { LoginPage } from './components/login/login.page';
import { RegisterPage } from './components/register/register.page';
import { AuthCallbackComponent } from './components/auth-callback/auth-callback.component';
import { ProfileComponent } from './components/profile/profile.component';
import { SettingsComponent } from './components/settings/settings.component';
import { SessionsComponent } from './components/sessions/sessions.component';
import { authGuard, guestGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'login', component: LoginPage, canActivate: [guestGuard] },
  { path: 'register', component: RegisterPage, canActivate: [guestGuard] },
  { path: 'auth/callback', component: AuthCallbackComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'repositories', component: RepositoryComponent, canActivate: [authGuard] },
  { path: 'repositories/:id', component: RepositoryDetailComponent, canActivate: [authGuard] },
  { path: 'analysis/:id', component: AnalysisResultsComponent, canActivate: [authGuard] },
  { path: 'profile', component: ProfileComponent, canActivate: [authGuard] },
  { path: 'settings', component: SettingsComponent, canActivate: [authGuard] },
  { path: 'settings/sessions', component: SessionsComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '' }
];
