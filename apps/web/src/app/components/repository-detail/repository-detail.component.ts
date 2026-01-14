import { Component, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AnalysisService } from '../../services/analysis.service';
import { LitePanel } from 'ngx-lite-form';
import { EvolutionProgressComponent } from '../evolution-progress/evolution-progress.component';

interface Repository {
  id: string;
  name: string;
  githubUrl: string;
  lastAnalyzedAt?: Date;
  createdAt: Date;
}

interface Analysis {
  id: string;
  score: number;
  filesAnalyzed: number;
  totalIssues: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  analyzedAt: Date;
}

@Component({
  selector: 'app-repository-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, LitePanel, EvolutionProgressComponent],
  templateUrl: './repository-detail.component.html',
  styleUrls: ['./repository-detail.component.scss']
})
export class RepositoryDetailComponent implements OnInit {
  @ViewChild(EvolutionProgressComponent) evolutionProgress!: EvolutionProgressComponent;

  repository = signal<Repository | null>(null);
  analyses = signal<Analysis[]>([]);
  loading = signal(false);
  analyzing = signal(false);
  error = signal<string | null>(null);
  deletePanelOpen = signal(false);
  deleteAnalysisId = signal<string | null>(null);
  deleteActions = [
    { label: 'Delete', value: 'delete', variant: 'danger' as const },
    { label: 'Cancel', value: null, variant: 'secondary' as const }
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private analysisService: AnalysisService
  ) {}

  ngOnInit() {
    const repoId = this.route.snapshot.paramMap.get('id');
    if (repoId) {
      this.loadRepository(repoId);
      this.loadAnalyses(repoId);
    }
  }

  loadRepository(repoId: string) {
    this.loading.set(true);
    this.analysisService.getAllRepositories().subscribe({
      next: (repos: Repository[]) => {
        const repo = repos.find(r => r.id === repoId);
        if (repo) {
          this.repository.set(repo);
        } else {
          this.error.set('Repository not found');
        }
        this.loading.set(false);
      },
      error: (err: any) => {
        this.error.set(err.error?.message || 'Failed to load repository');
        this.loading.set(false);
      }
    });
  }

  loadAnalyses(repoId: string) {
    this.analysisService.getRepositoryAnalyses(repoId).subscribe({
      next: (analyses) => {
        this.analyses.set(analyses);
      },
      error: (err) => {
        console.error('Failed to load analyses:', err);
      }
    });
  }

  runAnalysis() {
    const repo = this.repository();
    if (!repo) return;

    this.analyzing.set(true);
    this.error.set(null);
    
    if (this.evolutionProgress) {
      this.evolutionProgress.reset();
    }

    const { result$ } = this.analysisService.analyzeGithubRepositoryWithProgress(repo.id, true);
    
    result$.subscribe({
      next: (result) => {
        this.analyzing.set(false);
        this.analysisService.disconnectFromEvolutionProgress();
        this.loadAnalyses(repo.id);
        this.router.navigate(['/analysis', result.id]);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Analysis failed');
        this.analyzing.set(false);
        this.analysisService.disconnectFromEvolutionProgress();
      }
    });
  }

  viewAnalysis(analysisId: string) {
    this.router.navigate(['/analysis', analysisId]);
  }

  deleteAnalysis(analysisId: string) {
    this.deleteAnalysisId.set(analysisId);
  }

  onDeleteAnalysisPanelClosed(result: unknown) {
    const analysisId = this.deleteAnalysisId();
    this.deleteAnalysisId.set(null);

    if (result !== 'delete' || !analysisId) return;

    const repo = this.repository();
    if (!repo) return;

    this.error.set(null);
    this.analysisService.deleteAnalysis(analysisId).subscribe({
      next: () => {
        this.analyses.update((list) => list.filter((a) => a.id !== analysisId));
        this.loadRepository(repo.id);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to delete analysis');
      }
    });
  }

  deleteRepository() {
    this.deletePanelOpen.set(true);
  }

  onDeletePanelClosed(result: unknown) {
    this.deletePanelOpen.set(false);
    if (result === 'delete') {
      const repo = this.repository();
      if (!repo) return;

      this.analysisService.deleteRepository(repo.id).subscribe({
        next: () => {
          this.router.navigate(['/repositories']);
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Failed to delete repository');
        }
      });
    }
  }

  getScoreClass(score: number): string {
    if (score >= 80) return 'good';
    if (score >= 50) return 'warning';
    return 'bad';
  }

  getLatestAnalysis(): Analysis | null {
    const list = this.analyses();
    return list.length > 0 ? list[0] : null;
  }
}
