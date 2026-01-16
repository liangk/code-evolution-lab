import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AnalysisService } from '../../services/analysis.service';
import { FieldDto, LiteInput, LiteTable, TableFieldDto, LitePanel } from 'ngx-lite-form';
import { FormControl } from '@angular/forms';

interface Repository {
  id: string;
  name: string;
  githubUrl: string;
  isPrivate: boolean;
  createdAt: Date;
  analyses?: Array<{ analyzedAt: Date }>;
}

@Component({
  selector: 'app-repository',
  standalone: true,
  imports: [CommonModule, FormsModule, LiteInput, LiteTable, LitePanel],
  templateUrl: './repository.component.html',
  styleUrls: ['./repository.component.scss']
})
export class RepositoryComponent implements OnInit {
  repositories = signal<Repository[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  showAddForm = false;
  deletePanelOpen = signal(false);
  deleteRepositoryId = signal<string | null>(null);
  deleteActions = [
    { label: 'Delete', value: 'delete', variant: 'danger' as const },
    { label: 'Cancel', value: null, variant: 'secondary' as const }
  ];

  nameField: FieldDto = { label: 'Repository Name', formControl: new FormControl('') };
  githubUrlField: FieldDto = { label: 'GitHub URL', formControl: new FormControl('') };

  tableConfig = signal(new TableFieldDto<Repository>(
    [
      { key: 'name', label: 'Repository Name', sortable: true, flex: '1' },
      { 
        key: 'githubUrl', 
        label: 'GitHub URL', 
        flex: '2',
        cellTemplate: (url: string) => `<a href="${url}" target="_blank" style="color: #667eea; text-decoration: none;">${url}</a>`
      },
      { 
        key: 'createdAt', 
        label: 'Created', 
        sortable: true,
        flex: '0 0 200px',
        cellTemplate: (date: Date) => new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      },
      {
        key: 'isPrivate',
        label: 'Visibility',
        flex: '0 0 120px',
        cellTemplate: (isPrivate: boolean) => isPrivate ? 'Private' : 'Public'
      },
      { 
        key: 'analyses', 
        label: 'Last Analyzed',
        flex: '0 0 200px',
        cellTemplate: (analyses: any[]) => 
          analyses?.[0]?.analyzedAt 
            ? new Date(analyses[0].analyzedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '<span style="color: #999;">Not analyzed</span>'
      },
      {
        label: 'Actions',
        key: 'actions',
        type: 'menu',
        flex: '0 0 80px',
        menuItems: [
          { label: 'Analyze', value: 'analyze' },
          { label: 'History', value: 'history' },
          { label: 'Delete', value: 'delete', variant: 'danger' }
        ]
      }
    ],
    this.repositories(),
    false
  ));
  

  constructor(private analysisService: AnalysisService, private router: Router) {}

  ngOnInit() {
    this.loadRepositories();
  }

  onMenuAction(event: { action: string; row: Repository }) {
    switch (event.action) {
      case 'analyze':
        this.analyzeRepository(event.row.id);
        break;
      case 'history':
        this.viewAnalyses(event.row.id);
        break;
      case 'delete':
        this.deleteRepository(event.row.id);
        break;
    }
  }

  onRowClick(repository: Repository) {
    this.router.navigate(['/repositories', repository.id]);
  }

  loadRepositories() {
    this.loading.set(true);
    this.error.set(null);
    
    this.analysisService.getAllRepositories().subscribe({
      next: (data) => {
        this.repositories.set(data);
        this.tableConfig.set(new TableFieldDto<Repository>(
          this.tableConfig().columns,
          data,
          false
        ));
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load repositories');
        this.loading.set(false);
      }
    });
  }

  addRepository() {
    const name = this.nameField.formControl.value;
    const githubUrl = this.githubUrlField.formControl.value;

    if (!name || !githubUrl) {
      this.error.set('Please fill in all fields');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.analysisService.createRepository({ name, githubUrl }).subscribe({
      next: (repo) => {
        this.repositories.update(repos => [repo, ...repos]);
        this.tableConfig.set(new TableFieldDto<Repository>(
          this.tableConfig().columns,
          [...this.repositories()],
          false
        ));
        this.nameField.formControl.setValue('');
        this.githubUrlField.formControl.setValue('');
        this.showAddForm = false;
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to create repository');
        this.loading.set(false);
      }
    });
  }

  deleteRepository(id: string) {
    this.deleteRepositoryId.set(id);
    this.deletePanelOpen.set(true);
  }

  onDeletePanelClosed(result: unknown) {
    const id = this.deleteRepositoryId();
    this.deletePanelOpen.set(false);
    this.deleteRepositoryId.set(null);

    if (result === 'delete' && id) {
      this.analysisService.deleteRepository(id).subscribe({
        next: () => {
          this.repositories.update(repos => repos.filter(r => r.id !== id));
          this.tableConfig.set(new TableFieldDto<Repository>(
            this.tableConfig().columns,
            this.repositories(),
            false
          ));
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
