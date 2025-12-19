export interface ParsedFunction {
  type: 'function' | 'arrow' | 'method';
  name?: string;
  location: SourceLocation;
  async: boolean;
}

export interface SourceLocation {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export interface Loop {
  type: 'for' | 'for-of' | 'for-in' | 'while' | 'forEach';
  node: any;
  location: SourceLocation;
  scope: any;
}

export interface DatabaseCall {
  method: string;
  orm?: string;
  location: SourceLocation;
  code: string;
}

export interface Issue {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  filePath: string;
  lineNumber: number;
  title: string;
  description: string;
  codeBefore: string;
  codeAfter?: string;
  estimatedImpact?: {
    queriesIfN100?: number;
    queriesOptimal?: number;
    performanceGain?: string;
  };
  solutions?: Solution[];
}

export interface AnalysisContext {
  sourceCode: string;
  filePath: string;
  ast: any;
}

export interface DetectorResult {
  issues: Issue[];
  detectorName: string;
}

export interface Solution {
  id: string;
  issueId: string;
  rank: number;
  type: string;
  code: string;
  fitnessScore: number;
  reasoning: string;
  implementationTime: number;
  riskLevel: 'low' | 'medium' | 'high';
}
