import traverse from '@babel/traverse';
import { BaseDetector } from './base-detector';
import { ImportAnalyzer } from '../analyzer/import-analyzer';
import { Loop, DatabaseCall, AnalysisContext, DetectorResult, ORMContext } from '../types';

export class N1QueryDetector extends BaseDetector {
  name = 'N+1 Query Detector';
  private importAnalyzer = new ImportAnalyzer();

  async detect(ast: any, context: AnalysisContext): Promise<DetectorResult> {
    this.reset();

    const loops = this.findLoops(ast);

    for (const loop of loops) {
      const dbQueries = this.findDatabaseQueries(loop, context);

      if (dbQueries.length > 0) {
        this.reportIssue(loop, dbQueries, context);
      }
    }

    return {
      issues: this.issues,
      detectorName: this.name,
    };
  }

  private findLoops(ast: any): Loop[] {
    const loops: Loop[] = [];

    traverse(ast, {
      ForOfStatement: (path: any) => {
        loops.push({
          type: 'for-of',
          node: path.node,
          location: path.node.loc,
          scope: path.scope,
        });
      },

      ForStatement: (path: any) => {
        loops.push({
          type: 'for',
          node: path.node,
          location: path.node.loc,
          scope: path.scope,
        });
      },

      ForInStatement: (path: any) => {
        loops.push({
          type: 'for-in',
          node: path.node,
          location: path.node.loc,
          scope: path.scope,
        });
      },

      WhileStatement: (path: any) => {
        loops.push({
          type: 'while',
          node: path.node,
          location: path.node.loc,
          scope: path.scope,
        });
      },

      CallExpression: (path: any) => {
        if (path.node.callee.property?.name === 'forEach' || 
            path.node.callee.property?.name === 'map') {
          loops.push({
            type: 'forEach',
            node: path.node,
            location: path.node.loc,
            scope: path.scope,
          });
        }
      },
    });

    return loops;
  }

  private findDatabaseQueries(loop: Loop, context: AnalysisContext): DatabaseCall[] {
    const dbCalls: DatabaseCall[] = [];
    const dbPatterns = [
      'findOne', 'findAll', 'findByPk', 'findAndCountAll',
      'findUnique', 'findMany', 'findFirst',
      'find', 'findById', 'findByIdAndUpdate',
      'query', 'execute', 'raw',
      'get', 'all', 'run',
    ];

    traverse(loop.node, {
      AwaitExpression: (path: any) => {
        const callExpr = path.node.argument;
        if (callExpr?.type !== 'CallExpression') return;
        
        const callee = callExpr.callee;
        if (!callee?.property) return;

        const methodName = callee.property.name;
        if (!dbPatterns.includes(methodName)) return;

        const orm = this.detectORMFromNode(callExpr, methodName, context.ormContext);
        if (orm) {
          dbCalls.push({
            method: methodName,
            orm,
            location: path.node.loc,
            code: this.getCode(path.node, context.sourceCode),
          });
        }
      },

      CallExpression: (path: any) => {
        if (path.parent?.type === 'AwaitExpression') return;
        
        const methodName = path.node.callee?.property?.name;
        if (!methodName || !dbPatterns.includes(methodName)) return;

        const orm = this.detectORMFromNode(path.node, methodName, context.ormContext);
        if (orm) {
          dbCalls.push({
            method: methodName,
            orm,
            location: path.node.loc,
            code: this.getCode(path.node, context.sourceCode),
          });
        }
      },
    }, loop.scope);

    return dbCalls;
  }

  private detectORMFromNode(node: any, methodName: string, ormContext?: ORMContext): string | null {
    if (ormContext) {
      const importBasedORM = this.importAnalyzer.getORMFromCallExpression(node, ormContext);
      if (importBasedORM) {
        return this.formatORMName(importBasedORM);
      }

      if (ormContext.detectedORMs.size > 0) {
        const fallbackORM = this.detectORMByMethodName(methodName);
        const normalizedFallback = fallbackORM.toLowerCase().replace(' ', '_');
        if (ormContext.detectedORMs.has(normalizedFallback)) {
          return fallbackORM;
        }
        return null;
      }
    }

    return this.detectORMByMethodName(methodName);
  }

  private detectORMByMethodName(methodName: string): string {
    if (['findOne', 'findAll', 'findByPk', 'findAndCountAll'].includes(methodName)) {
      return 'Sequelize';
    }
    if (['findUnique', 'findMany', 'findFirst'].includes(methodName)) {
      return 'Prisma';
    }
    if (['find', 'findById', 'findByIdAndUpdate'].includes(methodName)) {
      return 'Mongoose';
    }
    if (['query', 'execute', 'raw'].includes(methodName)) {
      return 'Raw SQL';
    }
    return 'Unknown';
  }

  private formatORMName(orm: string): string {
    const names: Record<string, string> = {
      'sequelize': 'Sequelize',
      'prisma': 'Prisma',
      'mongoose': 'Mongoose',
      'typeorm': 'TypeORM',
      'knex': 'Knex',
      'raw_sql': 'Raw SQL',
    };
    return names[orm] || orm;
  }

  private getCode(node: any, sourceCode: string): string {
    if (!node.start || !node.end) {
      return '';
    }
    return sourceCode.substring(node.start, node.end);
  }

  private reportIssue(loop: Loop, dbQueries: DatabaseCall[], context: AnalysisContext): void {
    const severity = this.calculateSeverity(dbQueries.length);
    const lineNumber = loop.location.start.line;

    const codeBefore = this.getCode(loop.node, context.sourceCode);
    const description = this.generateDescription(loop, dbQueries);

    const queriesIfN100 = dbQueries.length * 100 + 1;
    const issue = this.createIssue(
      'n_plus_1_query',
      severity,
      context,
      lineNumber,
      'N+1 Query Detected',
      description,
      codeBefore,
      undefined,
      this.createImpact(
        severity === 'critical' ? 9 : severity === 'high' ? 7 : 5,
        `${queriesIfN100} queries for 100 items vs 1 optimal query`,
        85,
        'performance',
        'moderate',
        { queriesIfN100, queriesOptimal: 1, performanceGain: `${queriesIfN100}x slower` }
      )
    );

    this.issues.push(issue);
  }

  private calculateSeverity(queryCount: number): 'critical' | 'high' | 'medium' | 'low' {
    if (queryCount >= 3) return 'critical';
    if (queryCount >= 2) return 'high';
    return 'medium';
  }

  private generateDescription(loop: Loop, dbQueries: DatabaseCall[]): string {
    const queryList = dbQueries.map((q) => `${q.orm}.${q.method}()`).join(', ');
    return `Found ${dbQueries.length} database ${dbQueries.length === 1 ? 'query' : 'queries'} (${queryList}) inside a ${loop.type} loop. This creates an N+1 query problem where each iteration makes a separate database call. Consider using eager loading or batch queries instead.`;
  }
}
