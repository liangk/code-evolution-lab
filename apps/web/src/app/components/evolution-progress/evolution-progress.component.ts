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
    this.subscription = this.analysisService.progress$.subscribe((progress) => {
      this.handleProgress(progress);
    });
  }

  private handleProgress(progress: EvolutionProgress): void {
    this.isActive.set(true);
    this.currentGeneration.set(progress.generation);
    this.maxGenerations.set(progress.maxGenerations);
    this.bestFitness.set(progress.bestFitness);
    this.avgFitness.set(progress.avgFitness);
    this.bestSolutionCode.set(progress.bestSolution?.code || '');
    this.issueTitle.set(progress.issueTitle || '');
    this.issueType.set(progress.issueType || '');

    // Add to history
    this.generationHistory.update(history => [
      ...history,
      {
        generation: progress.generation,
        bestFitness: progress.bestFitness,
        avgFitness: progress.avgFitness
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
