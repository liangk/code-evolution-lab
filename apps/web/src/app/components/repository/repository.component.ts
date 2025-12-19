import { Component, OnInit } from '@angular/core';
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
  repositories: Repository[] = [];
  loading = false;
  error: string | null = null;
  
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
    this.loading = true;
    this.error = null;
    
    // Mock data for now - will be replaced with actual API call
    setTimeout(() => {
      this.repositories = [];
      this.loading = false;
    }, 500);
  }

  addRepository() {
    if (!this.newRepo.name || !this.newRepo.githubUrl) {
      this.error = 'Please fill in all fields';
      return;
    }

    this.loading = true;
    this.error = null;

    // Mock implementation - will be replaced with actual API call
    const repo: Repository = {
      id: Math.random().toString(36).substr(2, 9),
      name: this.newRepo.name,
      githubUrl: this.newRepo.githubUrl,
      createdAt: new Date()
    };

    this.repositories.unshift(repo);
    this.newRepo = { name: '', githubUrl: '', ownerId: 'default-user' };
    this.loading = false;
  }

  deleteRepository(id: string) {
    if (confirm('Are you sure you want to delete this repository?')) {
      this.repositories = this.repositories.filter(r => r.id !== id);
    }
  }

  viewAnalyses(repoId: string) {
    this.analysisService.getRepositoryAnalyses(repoId).subscribe({
      next: (data) => {
        console.log('Analyses:', data);
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to load analyses';
      }
    });
  }
}
