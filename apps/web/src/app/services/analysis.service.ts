import { Injectable, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';

export interface AnalysisRequest {
  code: string;
  filePath?: string;
  generateSolutions?: boolean;
  sessionId?: string;
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

export interface EvolutionProgress {
  type: string;
  issueType: string;
  issueTitle: string;
  generation: number;
  maxGenerations: number;
  bestFitness: number;
  avgFitness: number;
  bestSolution: {
    code: string;
    fitness: number;
  };
  population: Array<{ fitness: number; generation: number }>;
}

@Injectable({
  providedIn: 'root'
})
export class AnalysisService {
  private apiUrl = 'http://localhost:3000/api';
  private eventSource: EventSource | null = null;
  private progressSubject = new Subject<EvolutionProgress>();
  
  public progress$ = this.progressSubject.asObservable();

  constructor(private http: HttpClient, private ngZone: NgZone) {}

  analyzeCode(request: AnalysisRequest): Observable<AnalysisResult> {
    return this.http.post<AnalysisResult>(`${this.apiUrl}/analyze`, request);
  }

  getAnalysis(analysisId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/analysis/${analysisId}`);
  }

  getRepositoryAnalyses(repoId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/repositories/${repoId}/analyses`);
  }

  getAllRepositories(): Observable<any> {
    return this.http.get(`${this.apiUrl}/repositories`);
  }

  createRepository(data: { name: string; githubUrl: string; ownerId: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/repositories`, data);
  }

  deleteRepository(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/repositories/${id}`);
  }

  analyzeGithubRepository(repoId: string, generateSolutions = false, sessionId?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/repository/${repoId}/analyze-github`, { generateSolutions, sessionId });
  }

  // Generate unique session ID
  generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Connect to SSE for evolution progress
  connectToEvolutionProgress(sessionId: string): void {
    this.disconnectFromEvolutionProgress();
    
    this.eventSource = new EventSource(`${this.apiUrl}/sse/evolution-progress/${sessionId}`);
    
    this.eventSource.onmessage = (event) => {
      this.ngZone.run(() => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'evolution-progress') {
            this.progressSubject.next(data);
          }
        } catch (e) {
          console.error('Error parsing SSE data:', e);
        }
      });
    };

    this.eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
    };
  }

  // Disconnect from SSE
  disconnectFromEvolutionProgress(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  // Analyze with evolution progress tracking
  analyzeCodeWithProgress(request: AnalysisRequest): { sessionId: string; result$: Observable<AnalysisResult> } {
    const sessionId = this.generateSessionId();
    this.connectToEvolutionProgress(sessionId);
    
    const result$ = this.http.post<AnalysisResult>(`${this.apiUrl}/analyze`, {
      ...request,
      sessionId
    });

    return { sessionId, result$ };
  }
}
