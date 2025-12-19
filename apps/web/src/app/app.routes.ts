import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { RepositoryComponent } from './components/repository/repository.component';

export const routes: Routes = [
  { path: '', component: DashboardComponent },
  { path: 'repositories', component: RepositoryComponent },
  { path: '**', redirectTo: '' }
];
