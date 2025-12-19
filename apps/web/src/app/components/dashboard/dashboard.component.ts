import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AnalysisService, AnalysisRequest, AnalysisResult } from '../../services/analysis.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent {
  code = '';
  filePath = 'example.js';
  generateSolutions = true;
  analyzing = false;
  result: AnalysisResult | null = null;
  error: string | null = null;
  
  // Filtering and search
  searchTerm = '';
  selectedSeverity = 'all';
  selectedDetector = 'all';
  severityOptions = ['all', 'critical', 'high', 'medium', 'low'];
  
  constructor(private analysisService: AnalysisService) {}
  
  get filteredResults() {
    if (!this.result) return null;
    
    const filtered = { ...this.result };
    filtered.results = this.result.results.map(detector => {
      const filteredIssues = detector.issues.filter((issue: any) => {
        const matchesSearch = !this.searchTerm || 
          issue.description.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
          issue.id.toLowerCase().includes(this.searchTerm.toLowerCase());
        
        const matchesSeverity = this.selectedSeverity === 'all' || 
          issue.severity.toLowerCase() === this.selectedSeverity;
        
        const matchesDetector = this.selectedDetector === 'all' || 
          detector.detectorName === this.selectedDetector;
        
        return matchesSearch && matchesSeverity && matchesDetector;
      });
      
      return { ...detector, issues: filteredIssues };
    }).filter(detector => detector.issues.length > 0);
    
    return filtered;
  }
  
  get detectorOptions() {
    if (!this.result) return ['all'];
    return ['all', ...this.result.results.map(r => r.detectorName)];
  }
  
  clearFilters() {
    this.searchTerm = '';
    this.selectedSeverity = 'all';
    this.selectedDetector = 'all';
  }

  analyzeCode() {
    if (!this.code.trim()) {
      this.error = 'Please enter code to analyze';
      return;
    }

    this.analyzing = true;
    this.error = null;
    this.result = null;

    const request: AnalysisRequest = {
      code: this.code,
      filePath: this.filePath,
      generateSolutions: this.generateSolutions
    };

    this.analysisService.analyzeCode(request).subscribe({
      next: (result) => {
        this.result = result;
        this.analyzing = false;
      },
      error: (err) => {
        this.error = err.error?.message || 'Analysis failed';
        this.analyzing = false;
      }
    });
  }

  loadExample() {
    this.code = `// N+1 Query Example
async function getUsers() {
  const users = await User.findAll();
  for (const user of users) {
    user.orders = await Order.findAll({ where: { userId: user.id } });
  }
  return users;
}`;
    this.filePath = 'example.js';
  }

  clearResults() {
    this.result = null;
    this.error = null;
  }
}
