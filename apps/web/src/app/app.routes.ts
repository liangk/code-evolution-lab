import { Routes } from '@angular/router';
import { LandingComponent } from './components/landing/landing.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { RepositoryComponent } from './components/repository/repository.component';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'repositories', component: RepositoryComponent },
  { path: '**', redirectTo: '' }
];
