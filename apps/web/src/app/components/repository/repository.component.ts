import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AnalysisService } from '../../services/analysis.service';

interface Repository {
  id: string;
  name: string;
  githubUrl: string;
  lastAnalyzedAt?: Date;
  createdAt: Date;
}

@Component({
  selector: 'app-repository',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './repository.component.html',
  styleUrls: ['./repository.component.scss']
})
export class RepositoryComponent implements OnInit {
  repositories = signal<Repository[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  
  newRepo = {
    name: '',
    githubUrl: '',
    ownerId: 'default-user'
  };

  constructor(private analysisService: AnalysisService) {}

  ngOnInit() {
    this.loadRepositories();
  }

  loadRepositories() {
    this.loading.set(true);
    this.error.set(null);
    
    this.analysisService.getAllRepositories().subscribe({
      next: (data) => {
        this.repositories.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load repositories');
        this.loading.set(false);
      }
    });
  }

  addRepository() {
    if (!this.newRepo.name || !this.newRepo.githubUrl) {
      this.error.set('Please fill in all fields');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.analysisService.createRepository(this.newRepo).subscribe({
      next: (repo) => {
        this.repositories.update(repos => [repo, ...repos]);
        this.newRepo = { name: '', githubUrl: '', ownerId: 'default-user' };
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to create repository');
        this.loading.set(false);
      }
    });
  }

  deleteRepository(id: string) {
    if (confirm('Are you sure you want to delete this repository?')) {
      this.analysisService.deleteRepository(id).subscribe({
        next: () => {
          this.repositories.update(repos => repos.filter(r => r.id !== id));
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Failed to delete repository');
        }
      });
    }
  }

  viewAnalyses(repoId: string) {
    this.analysisService.getRepositoryAnalyses(repoId).subscribe({
      next: (data) => {
        console.log('Analyses:', data);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load analyses');
      }
    });
  }

  analyzeRepository(repoId: string) {
    this.loading.set(true);
    this.error.set(null);

    this.analysisService.analyzeGithubRepository(repoId, true).subscribe({
      next: (result) => {
        console.log('Analysis complete:', result);
        this.loading.set(false);
        alert(`Analysis complete!\nScore: ${result.score}\nFiles analyzed: ${result.filesAnalyzed}\nTotal issues: ${result.totalIssues}`);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to analyze repository');
        this.loading.set(false);
      }
    });
  }
}
