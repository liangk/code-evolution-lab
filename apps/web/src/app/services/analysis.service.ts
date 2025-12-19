import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AnalysisRequest {
  code: string;
  filePath?: string;
  generateSolutions?: boolean;
}

export interface AnalysisResult {
  success: boolean;
  score: number;
  totalIssues: number;
  issuesBySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  results: any[];
}

@Injectable({
  providedIn: 'root'
})
export class AnalysisService {
  private apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  analyzeCode(request: AnalysisRequest): Observable<AnalysisResult> {
    return this.http.post<AnalysisResult>(`${this.apiUrl}/analyze`, request);
  }

  getAnalysis(analysisId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/analysis/${analysisId}`);
  }

  getRepositoryAnalyses(repoId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/repository/${repoId}/analyses`);
  }
}
