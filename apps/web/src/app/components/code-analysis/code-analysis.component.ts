import { Component, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AnalysisService, AnalysisRequest, AnalysisResult } from '../../services/analysis.service';
import { EvolutionProgressComponent } from '../evolution-progress/evolution-progress.component';
import { exampleFiles } from './examples';
import { LiteTextarea, FieldDto, SelectFieldDto, LiteSelect, LiteCheckbox } from 'ngx-lite-form';
import { FormControl } from '@angular/forms';

@Component({
  selector: 'app-code-analysis',
  standalone: true,
  imports: [CommonModule, FormsModule, EvolutionProgressComponent, LiteTextarea, LiteSelect, LiteCheckbox],
  templateUrl: './code-analysis.component.html',
  styleUrls: ['./code-analysis.component.scss']
})
export class CodeAnalysisComponent {
  @ViewChild(EvolutionProgressComponent) evolutionProgress!: EvolutionProgressComponent;
  
  filePath = signal('example.js');
  generateSolutions = signal(true);
  analyzing = signal(false);
  result = signal<AnalysisResult | null>(null);
  error = signal<string | null>(null);
  selectedExample = signal<string>('');
  showEvolutionProgress = signal(false);
  inputPanelCollapsed = signal(false);
  expandedIssues = signal<Set<string>>(new Set());
  examples = exampleFiles;
  codeField: FieldDto = { 
    label: 'Paste your code here or select an example above...', 
    formControl: new FormControl(''),
    rows: 10
  };
  selectExample: SelectFieldDto = {
    label: 'Select Example',
    formControl: new FormControl(null),
    options: exampleFiles,
    displayWith: (option: any) => option?.name + ' - ' + option?.severity,
  };
  needSolutions: FieldDto = {
    label: 'Generate AI Solutions (Evolutionary Algorithm)',
    formControl: new FormControl<boolean>(true, { nonNullable: true }),
  };
  get isDisabled() {
    return this.analyzing() || !this.codeField.formControl.value?.trim();
  }
  
  constructor(private analysisService: AnalysisService) {
    this.selectExample.formControl.valueChanges.subscribe(v => {
      const example = this.examples.find(ex => ex.id === v?.id);
      if (example) {
        this.codeField.formControl.setValue(example.code);
        this.filePath.set(example.fileName);
        this.selectedExample.set(example.id);
      } else {
        console.log('No example found', v);
      }
    })
  }

  analyzeCode() {
    if (!this.codeField.formControl.value?.trim()) {
      this.error.set('Please enter code to analyze');
      return;
    }

    this.analyzing.set(true);
    this.error.set(null);
    this.result.set(null);
    this.showEvolutionProgress.set(true);
    
    // Reset evolution progress display
    if (this.evolutionProgress) {
      this.evolutionProgress.reset();
    }

    const request: AnalysisRequest = {
      code: this.codeField.formControl.value,
      filePath: this.filePath(),
      generateSolutions: this.generateSolutions()
    };

    // Use SSE-enabled analysis with progress tracking
    const { sessionId, result$ } = this.analysisService.analyzeCodeWithProgress(request);
    console.log('Started analysis with session:', sessionId);

    result$.subscribe({
      next: (result) => {
        console.log('Analysis result received:', result);
        this.result.set(result);
        this.analyzing.set(false);
        // Disconnect SSE after analysis complete
        this.analysisService.disconnectFromEvolutionProgress();
      },
      error: (err) => {
        console.error('Analysis error:', err);
        this.error.set(err.error?.message || 'Analysis failed');
        this.analyzing.set(false);
        this.analysisService.disconnectFromEvolutionProgress();
      }
    });
  }

  loadExample(exampleId?: string) {
    const id = exampleId || this.selectedExample() || 'n-plus-1';
    const example = this.examples.find(ex => ex.id === id);
    
    if (example) {
      this.filePath.set(example.fileName);
      this.selectedExample.set(example.id);
    }
  }

  clearResults() {
    this.codeField.formControl.setValue('');
    this.selectExample.formControl.setValue(null);
    this.result.set(null);
    this.error.set(null);
  }

  getSelectedSeverity(): string {
    const example = this.examples.find(e => e.id === this.selectedExample());
    return example?.severity || '';
  }

  getSelectedSeverityClass(): string {
    return this.getSelectedSeverity().toLowerCase();
  }

  toggleInputPanel() {
    this.inputPanelCollapsed.set(!this.inputPanelCollapsed());
  }

  toggleIssue(issueId: string) {
    const expanded = new Set(this.expandedIssues());
    if (expanded.has(issueId)) {
      expanded.delete(issueId);
    } else {
      expanded.add(issueId);
    }
    this.expandedIssues.set(expanded);
  }

  isIssueExpanded(issueId: string): boolean {
    return this.expandedIssues().has(issueId);
  }
}
