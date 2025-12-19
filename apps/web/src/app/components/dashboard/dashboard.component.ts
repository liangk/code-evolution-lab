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

  constructor(private analysisService: AnalysisService) {}

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
