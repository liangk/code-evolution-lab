import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface DashboardStats {
  totalRepositories: number;
  totalAnalyses: number;
  totalIssues: number;
  totalSolutions: number;
  activeSessions: number;
  averageScore: number;
  issuesBySeverity: Record<string, number>;
}

interface RecentAnalysis {
  id: string;
  score: number;
  filesAnalyzed: number;
  totalIssues: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  analyzedAt: string;
  repository: { id: string; name: string; githubUrl: string };
}

interface RecentIssue {
  id: string;
  type: string;
  severity: string;
  score: number;
  title: string;
  filePath: string;
  lineNumber: number;
  analysis: { id: string; repository: { id: string; name: string } };
  solutions: { id: string; fitnessScore: number }[];
}

interface Repository {
  id: string;
  name: string;
  githubUrl: string;
  lastAnalyzedAt: string | null;
  createdAt: string;
  analyses: { score: number }[];
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  private apiUrl = environment.apiUrl;
  
  loading = signal(true);
  error = signal<string | null>(null);
  stats = signal<DashboardStats | null>(null);
  recentAnalyses = signal<RecentAnalysis[]>([]);
  recentIssues = signal<RecentIssue[]>([]);
  repositories = signal<Repository[]>([]);

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadDashboardData();
  }

  loadDashboardData() {
    this.loading.set(true);
    this.error.set(null);

    Promise.all([
      this.http.get<DashboardStats>(`${this.apiUrl}/dashboard/stats`, { withCredentials: true }).toPromise(),
      this.http.get<RecentAnalysis[]>(`${this.apiUrl}/dashboard/recent-analyses?limit=5`, { withCredentials: true }).toPromise(),
      this.http.get<RecentIssue[]>(`${this.apiUrl}/dashboard/recent-issues?limit=8`, { withCredentials: true }).toPromise(),
      this.http.get<Repository[]>(`${this.apiUrl}/repositories`, { withCredentials: true }).toPromise(),
    ]).then(([stats, analyses, issues, repos]) => {
      this.stats.set(stats || null);
      this.recentAnalyses.set(analyses || []);
      this.recentIssues.set(issues || []);
      this.repositories.set(repos || []);
      this.loading.set(false);
    }).catch(err => {
      console.error('Dashboard load error:', err);
      this.error.set('Failed to load dashboard data');
      this.loading.set(false);
    });
  }

  getScoreClass(score: number): string {
    if (score >= 80) return 'good';
    if (score >= 50) return 'warning';
    return 'bad';
  }

  getSeverityClass(severity: string): string {
    return severity.toLowerCase();
  }

  getRepoScore(repo: Repository): number | null {
    return repo.analyses?.length > 0 ? repo.analyses[0].score : null;
  }

  formatDate(date: string | null): string {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatDateTime(date: string): string {
    return new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}
