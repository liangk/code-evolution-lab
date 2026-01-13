import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AnalysisService } from '../../services/analysis.service';

interface Issue {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  filePath: string;
  lineNumber: number;
  codeBefore: string;
  estimatedImpact: any;
  solutions: Solution[];
}

interface Solution {
  id: string;
  type: string;
  description: string;
  codeAfter: string;
  explanation: string;
  difficulty: string;
  fitnessScore: number;
  rank: number;
}

interface AnalysisDetail {
  id: string;
  score: number;
  totalIssues: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  analyzedAt: Date;
  repository?: { id: string; name: string };
  issues: Issue[];
}

@Component({
  selector: 'app-analysis-results',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './analysis-results.component.html',
  styleUrls: ['./analysis-results.component.scss']
})
export class AnalysisResultsComponent implements OnInit {
  analysis = signal<AnalysisDetail | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  severityFilter = signal<string>('all');
  expandedIssues = signal<Set<string>>(new Set());

  constructor(
    private route: ActivatedRoute,
    private analysisService: AnalysisService
  ) {}

  ngOnInit() {
    const analysisId = this.route.snapshot.paramMap.get('id');
    if (analysisId) {
      this.loadAnalysis(analysisId);
    }
  }

  loadAnalysis(analysisId: string) {
    this.loading.set(true);
    this.analysisService.getAnalysis(analysisId).subscribe({
      next: (response: any) => {
        this.analysis.set(response.analysis || response);
        this.loading.set(false);
      },
      error: (err: any) => {
        this.error.set(err.error?.message || 'Failed to load analysis');
        this.loading.set(false);
      }
    });
  }

  filterBySeverity(severity: string) {
    this.severityFilter.set(severity);
  }

  getFilteredIssues(): Issue[] {
    const data = this.analysis();
    if (!data || !data.issues) return [];
    
    const filter = this.severityFilter();
    if (filter === 'all') return data.issues;
    return data.issues.filter(i => i.severity.toLowerCase() === filter);
  }

  toggleIssue(issueId: string) {
    this.expandedIssues.update(set => {
      const newSet = new Set(set);
      if (newSet.has(issueId)) {
        newSet.delete(issueId);
      } else {
        newSet.add(issueId);
      }
      return newSet;
    });
  }

  isExpanded(issueId: string): boolean {
    return this.expandedIssues().has(issueId);
  }

  getScoreClass(score: number): string {
    if (score >= 80) return 'good';
    if (score >= 50) return 'warning';
    return 'bad';
  }

  getSeverityClass(severity: string): string {
    return severity.toLowerCase();
  }

  copyCode(code: string) {
    navigator.clipboard.writeText(code);
  }
}
