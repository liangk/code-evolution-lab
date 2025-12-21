import { Component, signal } from '@angular/core';
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
  code = signal('');
  filePath = signal('example.js');
  generateSolutions = signal(true);
  analyzing = signal(false);
  result = signal<AnalysisResult | null>(null);
  error = signal<string | null>(null);
  
  constructor(private analysisService: AnalysisService) {}

  analyzeCode() {
    if (!this.code().trim()) {
      this.error.set('Please enter code to analyze');
      return;
    }

    this.analyzing.set(true);
    this.error.set(null);
    this.result.set(null);

    const request: AnalysisRequest = {
      code: this.code(),
      filePath: this.filePath(),
      generateSolutions: this.generateSolutions()
    };

    this.analysisService.analyzeCode(request).subscribe({
      next: (result) => {
        console.log('Analysis result received:', result);
        this.result.set(result);
        this.analyzing.set(false);
      },
      error: (err) => {
        console.error('Analysis error:', err);
        this.error.set(err.error?.message || 'Analysis failed');
        this.analyzing.set(false);
      }
    });
  }

  loadExample() {
    this.code.set(`// N+1 Query Example
async function getUsers() {
  const users = await User.findAll();
  for (const user of users) {
    user.orders = await Order.findAll({ where: { userId: user.id } });
  }
  return users;
}`);
    this.filePath.set('example.js');
  }

  clearResults() {
    this.result.set(null);
    this.error.set(null);
  }
}
