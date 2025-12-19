import traverse from '@babel/traverse';
import { BaseDetector } from './base-detector';
import { Loop, DatabaseCall, AnalysisContext, DetectorResult } from '../types';

export class N1QueryDetector extends BaseDetector {
  name = 'N+1 Query Detector';

  async detect(ast: any, context: AnalysisContext): Promise<DetectorResult> {
    this.reset();

    const loops = this.findLoops(ast);

    for (const loop of loops) {
      const dbQueries = this.findDatabaseQueries(loop, context.sourceCode);

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

  private findDatabaseQueries(loop: Loop, sourceCode: string): DatabaseCall[] {
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
        const callee = path.node.argument?.callee;

        if (callee?.property) {
          const methodName = callee.property.name;

          if (dbPatterns.includes(methodName)) {
            dbCalls.push({
              method: methodName,
              orm: this.detectORM(methodName),
              location: path.node.loc,
              code: this.getCode(path.node, sourceCode),
            });
          }
        }
      },

      CallExpression: (path: any) => {
        const methodName = path.node.callee?.property?.name;

        if (methodName && dbPatterns.includes(methodName)) {
          dbCalls.push({
            method: methodName,
            orm: this.detectORM(methodName),
            location: path.node.loc,
            code: this.getCode(path.node, sourceCode),
          });
        }
      },
    }, loop.scope);

    return dbCalls;
  }

  private detectORM(methodName: string): string {
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

    const issue = this.createIssue(
      'n_plus_1_query',
      severity,
      context,
      lineNumber,
      'N+1 Query Detected',
      description,
      codeBefore,
      undefined,
      {
        queriesIfN100: dbQueries.length * 100 + 1,
        queriesOptimal: 1,
        performanceGain: `${((dbQueries.length * 100) / 1) * 100}x faster`,
      }
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
