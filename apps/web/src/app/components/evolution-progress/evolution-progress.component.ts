import { Component, signal, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AnalysisService, EvolutionProgress } from '../../services/analysis.service';

interface GenerationData {
  generation: number;
  bestFitness: number;
  avgFitness: number;
}

@Component({
  selector: 'app-evolution-progress',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './evolution-progress.component.html',
  styleUrls: ['./evolution-progress.component.scss']
})
export class EvolutionProgressComponent implements OnDestroy {
  isActive = signal(false);
  currentGeneration = signal(0);
  maxGenerations = signal(10);
  bestFitness = signal(0);
  avgFitness = signal(0);
  bestSolutionCode = signal('');
  issueTitle = signal('');
  issueType = signal('');
  generationHistory = signal<GenerationData[]>([]);
  phase = signal<'quick' | 'evolving' | 'complete' | 'timeout'>('quick');
  statusMessage = signal('Generating quick solutions...');
  
  progressPercent = computed(() => 
    this.maxGenerations() > 0 ? (this.currentGeneration() / this.maxGenerations()) * 100 : 0
  );

  fitnessImprovement = computed(() => {
    const history = this.generationHistory();
    if (history.length < 2) return 0;
    const first = history[0].bestFitness;
    const last = history[history.length - 1].bestFitness;
    return last - first;
  });

  private subscription: Subscription | null = null;

  constructor(private analysisService: AnalysisService) {
    this.subscription = this.analysisService.progress$.subscribe((data) => {
      this.handleEvent(data);
    });
  }

  private handleEvent(data: any): void {
    const eventType = data.type;
    
    switch (eventType) {
      case 'quick-solutions':
        this.isActive.set(true);
        this.phase.set('quick');
        this.issueTitle.set(data.issueId || '');
        this.issueType.set(data.issueType || '');
        this.statusMessage.set(`✓ Quick solutions ready for ${data.issueType}`);
        break;
        
      case 'evolution-start':
        this.phase.set('evolving');
        this.statusMessage.set(`🧬 Optimizing solutions for ${data.issueType}...`);
        this.generationHistory.set([]);
        break;
        
      case 'evolution-progress':
        this.handleEvolutionProgress(data);
        break;
        
      case 'evolution-complete':
        this.phase.set('complete');
        this.statusMessage.set(`✓ Optimization complete for ${data.issueType}`);
        break;
        
      case 'evolution-timeout':
        this.phase.set('timeout');
        this.statusMessage.set(`⚠ Using quick solutions (optimization timeout)`);
        break;
    }
  }

  private handleEvolutionProgress(progress: any): void {
    this.isActive.set(true);
    this.currentGeneration.set(progress.generation || 0);
    this.maxGenerations.set(progress.maxGenerations || 10);
    this.bestFitness.set(progress.bestFitness || 0);
    this.avgFitness.set(progress.avgFitness || 0);
    this.bestSolutionCode.set(progress.bestSolution?.code || '');
    this.issueTitle.set(progress.issueTitle || '');
    this.issueType.set(progress.issueType || '');
    this.statusMessage.set(`🧬 Generation ${progress.generation}/${progress.maxGenerations}`);

    // Add to history
    this.generationHistory.update(history => [
      ...history,
      {
        generation: progress.generation || 0,
        bestFitness: progress.bestFitness || 0,
        avgFitness: progress.avgFitness || 0
      }
    ]);
  }

  reset(): void {
    this.isActive.set(false);
    this.currentGeneration.set(0);
    this.maxGenerations.set(10);
    this.bestFitness.set(0);
    this.avgFitness.set(0);
    this.bestSolutionCode.set('');
    this.issueTitle.set('');
    this.issueType.set('');
    this.generationHistory.set([]);
  }

  getBarHeight(fitness: number): number {
    return Math.max(5, (fitness / 100) * 100);
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }
}
