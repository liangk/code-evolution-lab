import { Issue, AnalysisContext, DetectorResult, EstimatedImpact } from '../types';

export abstract class BaseDetector {
  abstract name: string;
  protected issues: Issue[] = [];

  abstract detect(ast: any, context: AnalysisContext): Promise<DetectorResult>;

  protected createIssue(
    type: string,
    severity: 'critical' | 'high' | 'medium' | 'low',
    context: AnalysisContext,
    lineNumber: number,
    title: string,
    description: string,
    codeBefore: string,
    codeAfter?: string,
    estimatedImpact?: EstimatedImpact
  ): Issue {
    return {
      id: this.generateId(),
      type,
      severity,
      filePath: context.filePath,
      lineNumber,
      title,
      description,
      codeBefore,
      codeAfter,
      estimatedImpact,
    };
  }

  protected createImpact(
    severityScore: number,
    description: string,
    confidenceScore: number,
    metrics: Record<string, string | number | boolean | string[]>
  ): EstimatedImpact {
    return { severityScore, description, confidenceScore, metrics };
  }

  protected generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  protected reset(): void {
    this.issues = [];
  }
}
