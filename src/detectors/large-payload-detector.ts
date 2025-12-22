import traverse from '@babel/traverse';
import { BaseDetector } from './base-detector';
import { AnalysisContext, DetectorResult } from '../types';

export class LargePayloadDetector extends BaseDetector {
  name = 'Large Payload Detector';

  async detect(ast: any, context: AnalysisContext): Promise<DetectorResult> {
    this.reset();

    traverse(ast, {
      CallExpression: (path: any) => {
        this.checkAPIResponse(path, context);
        this.checkSelectAllQuery(path, context);
      },

      ReturnStatement: (path: any) => {
        this.checkLargeReturnPayload(path, context);
      },
    });

    return {
      issues: this.issues,
      detectorName: this.name,
    };
  }

  private checkAPIResponse(path: any, context: AnalysisContext): void {
    const node = path.node;
    
    if (node.callee?.property?.name === 'json' && 
        path.parent?.type === 'CallExpression') {
      
      const functionScope = path.getFunctionParent();
      let hasSelectFields = false;
      let hasLimit = false;
      let hasPaginationWrapper = false;
      let hasStreaming = false;
      let dataFlowFromQuery = false;

      if (functionScope) {
        const jsonArgument = path.parent.arguments?.[0];
        
        traverse(functionScope.node, {
          ObjectProperty: (innerPath: any) => {
            if (innerPath.node.key?.name === 'attributes' || 
                innerPath.node.key?.name === 'select') {
              hasSelectFields = true;
            }
            if (innerPath.node.key?.name === 'limit' || 
                innerPath.node.key?.name === 'take' ||
                innerPath.node.key?.name === 'perPage') {
              hasLimit = true;
            }
          },
          CallExpression: (innerPath: any) => {
            const methodName = innerPath.node.callee?.property?.name;
            const functionName = innerPath.node.callee?.name;
            
            if (['paginate', 'withPagination', 'paginateResults'].includes(methodName) ||
                ['paginate', 'withPagination', 'paginateResults'].includes(functionName)) {
              hasPaginationWrapper = true;
            }
            
            if (methodName === 'stream' || functionName === 'createReadStream') {
              hasStreaming = true;
            }
            
            if (['findAll', 'findMany', 'find'].includes(methodName)) {
              if (jsonArgument && this.isDataFlowConnected(innerPath.node, jsonArgument, functionScope)) {
                dataFlowFromQuery = true;
              }
            }
          },
          Identifier: (innerPath: any) => {
            if (['cursor', 'nextCursor', 'prevCursor', 'pageToken'].includes(innerPath.node.name)) {
              hasPaginationWrapper = true;
            }
          },
        }, functionScope.scope);
      }

      if (hasStreaming || hasPaginationWrapper) {
        return;
      }

      if (dataFlowFromQuery && (!hasSelectFields || !hasLimit)) {
        const lineNumber = node.loc?.start.line || 0;
        const code = this.getCode(functionScope?.node || node, context.sourceCode);

        const missingOptimizations = [
          !hasSelectFields ? 'Field selection (select/attributes)' : null,
          !hasLimit ? 'Pagination (limit/offset)' : null,
        ].filter(Boolean) as string[];
        
        const issue = this.createIssue(
          'large_api_payload',
          'high',
          context,
          lineNumber,
          'Large API Response from Database Query',
          'API endpoint returns database query results without proper pagination or field selection. This can cause performance issues with large datasets.',
          code,
          undefined,
          this.createImpact(7, 'Large payloads impact performance and bandwidth', 80, 'network', 'easy', {
            missingOptimizations,
            dataFlowTracked: true,
            recommendation: 'Add field selection and pagination',
          })
        );

        this.issues.push(issue);
      }
    }
  }

  private isDataFlowConnected(queryNode: any, targetNode: any, scope: any): boolean {
    if (queryNode === targetNode) return true;
    
    let isConnected = false;
    const queryParent = scope.path.getStatementParent();
    
    if (queryParent) {
      traverse(queryParent.node, {
        VariableDeclarator: (varPath: any) => {
          if (varPath.node.init === queryNode) {
            const varName = varPath.node.id?.name;
            if (varName && this.identifierReferencesTarget(targetNode, varName)) {
              isConnected = true;
            }
          }
        },
        AssignmentExpression: (assignPath: any) => {
          if (assignPath.node.right === queryNode) {
            const varName = assignPath.node.left?.name;
            if (varName && this.identifierReferencesTarget(targetNode, varName)) {
              isConnected = true;
            }
          }
        },
      }, scope);
    }
    
    return isConnected;
  }

  private identifierReferencesTarget(node: any, varName: string): boolean {
    let found = false;
    traverse(node, {
      Identifier: (path: any) => {
        if (path.node.name === varName) {
          found = true;
        }
      },
    }, undefined);
    return found;
  }

  private checkSelectAllQuery(path: any, context: AnalysisContext): void {
    const node = path.node;
    const dbMethods = ['findAll', 'findMany', 'find'];
    
    if (dbMethods.includes(node.callee?.property?.name)) {
      let hasAttributes = false;
      let hasLimit = false;

      if (node.arguments && node.arguments.length > 0) {
        const options = node.arguments[0];
        
        traverse(options, {
          ObjectProperty: (innerPath: any) => {
            if (innerPath.node.key?.name === 'attributes' || 
                innerPath.node.key?.name === 'select') {
              hasAttributes = true;
            }
            if (innerPath.node.key?.name === 'limit' || 
                innerPath.node.key?.name === 'take') {
              hasLimit = true;
            }
          },
        }, path.scope);
      }

      if (!hasAttributes || !hasLimit) {
        const lineNumber = node.loc?.start.line || 0;
        const code = this.getCode(node, context.sourceCode);

        const queryIssues = [
          !hasAttributes ? 'Selects all columns (SELECT *)' : null,
          !hasLimit ? 'No row limit specified' : null,
        ].filter(Boolean) as string[];
        const issue = this.createIssue(
          'select_all_query',
          'medium',
          context,
          lineNumber,
          'SELECT * Query Without Limits',
          'Database query selects all fields without limits. This can load unnecessary data and impact performance.',
          code,
          undefined,
          this.createImpact(5, 'Increased memory usage and slower queries', 75, 'performance', 'easy', {
            issues: queryIssues,
            impact: 'Increased memory usage and slower queries',
            solution: 'Specify required fields and add pagination',
          })
        );

        this.issues.push(issue);
      }
    }
  }

  private checkLargeReturnPayload(path: any, context: AnalysisContext): void {
    const node = path.node;
    
    if (node.argument?.type === 'CallExpression') {
      const callee = node.argument.callee;
      
      if (callee?.property?.name === 'findAll' || 
          callee?.property?.name === 'findMany') {
        
        let hasLimit = false;
        
        if (node.argument.arguments && node.argument.arguments.length > 0) {
          traverse(node.argument.arguments[0], {
            ObjectProperty: (innerPath: any) => {
              if (innerPath.node.key?.name === 'limit' || 
                  innerPath.node.key?.name === 'take') {
                hasLimit = true;
              }
            },
          }, path.scope);
        }

        if (!hasLimit) {
          const lineNumber = node.loc?.start.line || 0;
          const code = this.getCode(node, context.sourceCode);

          const issue = this.createIssue(
            'large_return_payload',
            'high',
            context,
            lineNumber,
            'Returning Unlimited Database Results',
            'Function returns database query results without pagination. This can cause memory issues and slow responses.',
            code,
            undefined,
            this.createImpact(7, 'Memory overflow with large datasets', 80, 'memory', 'easy', {
              risk: 'Memory overflow with large datasets',
              solution: 'Add pagination (limit/offset or cursor-based)',
            })
          );

          this.issues.push(issue);
        }
      }
    }
  }

  private getCode(node: any, sourceCode: string): string {
    if (!node.start || !node.end) {
      return '';
    }
    return sourceCode.substring(node.start, node.end);
  }
}
