import { Routes } from '@angular/router';
import { LandingComponent } from './components/landing/landing.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { RepositoryComponent } from './components/repository/repository.component';
import { LoginPage } from './components/login/login.page';
import { RegisterPage } from './components/register/register.page';
import { authGuard, guestGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'login', component: LoginPage, canActivate: [guestGuard] },
  { path: 'register', component: RegisterPage, canActivate: [guestGuard] },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'repositories', component: RepositoryComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '' }
];
