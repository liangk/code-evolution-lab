import traverse from '@babel/traverse';

export interface ImportInfo {
  source: string;
  defaultImport?: string;
  namedImports: string[];
  namespaceImport?: string;
}

export interface ORMContext {
  detectedORMs: Set<string>;
  symbolToORM: Map<string, string>;
  prismaClientVar?: string;
}

const ORM_PACKAGES: Record<string, string> = {
  'sequelize': 'sequelize',
  '@prisma/client': 'prisma',
  'prisma': 'prisma',
  'mongoose': 'mongoose',
  'typeorm': 'typeorm',
  'knex': 'knex',
  'pg': 'raw_sql',
  'mysql': 'raw_sql',
  'mysql2': 'raw_sql',
  'better-sqlite3': 'raw_sql',
  'sqlite3': 'raw_sql',
};

export class ImportAnalyzer {
  extractImports(ast: any): ImportInfo[] {
    const imports: ImportInfo[] = [];

    traverse(ast, {
      ImportDeclaration(path: any) {
        const source = path.node.source.value;
        const info: ImportInfo = { source, namedImports: [] };

        for (const specifier of path.node.specifiers) {
          if (specifier.type === 'ImportDefaultSpecifier') {
            info.defaultImport = specifier.local.name;
          } else if (specifier.type === 'ImportNamespaceSpecifier') {
            info.namespaceImport = specifier.local.name;
          } else if (specifier.type === 'ImportSpecifier') {
            info.namedImports.push(specifier.local.name);
          }
        }

        imports.push(info);
      },

      CallExpression(path: any) {
        if (path.node.callee.name === 'require' && path.node.arguments.length > 0) {
          const arg = path.node.arguments[0];
          if (arg.type === 'StringLiteral') {
            const source = arg.value;
            const parent = path.parent;

            const info: ImportInfo = { source, namedImports: [] };

            if (parent.type === 'VariableDeclarator') {
              if (parent.id.type === 'Identifier') {
                info.defaultImport = parent.id.name;
              } else if (parent.id.type === 'ObjectPattern') {
                for (const prop of parent.id.properties) {
                  if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
                    info.namedImports.push(prop.key.name);
                  }
                }
              }
            }

            imports.push(info);
          }
        }
      },
    });

    return imports;
  }

  buildORMContext(ast: any): ORMContext {
    const imports = this.extractImports(ast);
    const context: ORMContext = {
      detectedORMs: new Set(),
      symbolToORM: new Map(),
    };

    for (const imp of imports) {
      const normalizedSource = imp.source.toLowerCase();
      
      for (const [pkg, orm] of Object.entries(ORM_PACKAGES)) {
        if (normalizedSource === pkg || normalizedSource.startsWith(`${pkg}/`)) {
          context.detectedORMs.add(orm);

          if (imp.defaultImport) {
            context.symbolToORM.set(imp.defaultImport, orm);
          }
          if (imp.namespaceImport) {
            context.symbolToORM.set(imp.namespaceImport, orm);
          }
          for (const named of imp.namedImports) {
            context.symbolToORM.set(named, orm);
          }

          if (orm === 'prisma' && imp.namedImports.includes('PrismaClient')) {
            this.findPrismaClientInstantiation(ast, context);
          }
        }
      }
    }

    return context;
  }

  private findPrismaClientInstantiation(ast: any, context: ORMContext): void {
    traverse(ast, {
      VariableDeclarator(path: any) {
        const init = path.node.init;
        if (init?.type === 'NewExpression') {
          const callee = init.callee;
          if (callee.type === 'Identifier' && callee.name === 'PrismaClient') {
            if (path.node.id.type === 'Identifier') {
              context.prismaClientVar = path.node.id.name;
              context.symbolToORM.set(path.node.id.name, 'prisma');
            }
          }
        }
      },
    });
  }

  getORMFromCallExpression(node: any, context: ORMContext): string | null {
    let current = node.callee;

    while (current) {
      if (current.type === 'Identifier') {
        const orm = context.symbolToORM.get(current.name);
        if (orm) return orm;
        
        if (current.name === context.prismaClientVar) {
          return 'prisma';
        }
        break;
      }

      if (current.type === 'MemberExpression') {
        if (current.object.type === 'Identifier') {
          const orm = context.symbolToORM.get(current.object.name);
          if (orm) return orm;
          
          if (current.object.name === context.prismaClientVar) {
            return 'prisma';
          }
        }
        current = current.object;
      } else if (current.type === 'CallExpression') {
        current = current.callee;
      } else {
        break;
      }
    }

    return null;
  }
}

export default new ImportAnalyzer();
