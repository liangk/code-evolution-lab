/**
 * Missing Index Solution Generator
 *
 * Every index finding names one model and the exact columns an index should
 * lead with, and carries that model's block from schema.prisma as
 * `codeBefore`. The solution is that block with one `@@index` line added —
 * the reader's own model, fields, comments and indentation, ready to paste
 * over the original. It is the only thing this generator produces.
 *
 * Why not port the backend version (`missing-index-solution-generator.ts`,
 * private copy):
 *
 *   It was written for a different detector. It keyed on issue types the
 *   core-engine rules do not emit, and guessed the model and fields from the
 *   query text. When a guess failed it fell back to `FIELD_NAME`,
 *   `TABLE_NAME` and `COLUMN_NAME` and still reported success — a template
 *   that reads as a fix and cannot be applied. Here the rule has already
 *   decided the model and the columns from the parsed schema, so there is
 *   nothing to guess, and when the pieces do not line up the answer is no
 *   solution at all.
 *
 *   It also offered Sequelize, TypeORM, Mongoose and raw-SQL variants. The
 *   index rules only read `schema.prisma`, so those strategies could never be
 *   reached by a real finding.
 *
 * What is deliberately left out: a `CREATE INDEX CONCURRENTLY` migration.
 * Adding an index to a large, busy Postgres table with a plain `CREATE INDEX`
 * blocks writes while it builds, and that is worth knowing — but the right SQL
 * depends on the provider, the mapped table and column names, and how the
 * project runs its migrations, none of which a single finding can see. One
 * line of guidance goes in the explanation instead of SQL that may not apply.
 */

import { BaseSolutionGenerator } from './base-generator';
import { parseIndexRecommendation } from '../rules/index-rules';
import type { DiagnosticIssue, Solution, SolutionContext } from './types';

export class IndexSolutionGenerator extends BaseSolutionGenerator {
  name = 'Missing Index Solution Generator';

  async generateSolutions(issue: DiagnosticIssue, _context: SolutionContext): Promise<Solution[]> {
    if (issue.category !== 'index') return [];

    const block = issue.codeBefore || '';
    if (!block.trim()) return [];

    const wanted = parseIndexRecommendation(issue.recommendation);
    if (!wanted) return [];

    const patched = addIndexToModel(block, wanted.model, wanted.columns);
    if (!patched) return [];

    const reasoning = [
      `Add @@index([${wanted.columns.join(', ')}]) to model ${wanted.model} in schema.prisma, then create a migration with \`npx prisma migrate dev\`.`,
      wanted.columns.length > 1
        ? 'Column order matters: an index serves a filter only on a leading prefix of its columns. Put columns compared with equality before columns compared with a range (gt, lt, gte, lte).'
        : null,
      'On a large table in production, a plain CREATE INDEX blocks writes while it builds. On Postgres, generate the migration with --create-only and build the index CONCURRENTLY instead.',
    ].filter(Boolean).join('\n');

    return [
      this.createSolution(issue.id || '', 1, 'prisma-schema-index', patched, 95, reasoning, 'low'),
    ];
  }
}

/**
 * Return `block` with `@@index([columns])` added before its closing brace, or
 * null if the block is not the named model, a column is not a field of it, or
 * the index is already there.
 *
 * Returning null is the point of most of this function. Each check stands
 * between the reader and a suggestion that would fail `prisma validate`, or
 * that would add an index they already have.
 */
export function addIndexToModel(block: string, model: string, columns: string[]): string | null {
  const eol = block.includes('\r\n') ? '\r\n' : '\n';
  const lines = block.split(/\r?\n/);

  const header = lines[0].match(/^\s*model\s+(\w+)\s*\{/);
  if (!header || header[1] !== model) return null;

  const closeIdx = lines.length - 1;
  if (closeIdx < 1 || !/^\s*\}\s*$/.test(lines[closeIdx])) return null;

  const body = lines.slice(1, closeIdx);
  const code = body.map(stripLineComment);

  // Every column must be declared as a field in this block. The rule found
  // them in the parsed model, so a miss means the block and the finding have
  // come apart — suggesting an index on a field that is not there would fail
  // `prisma validate`.
  const fieldNames = new Set<string>();
  for (const line of code) {
    const field = line.match(/^\s*(\w+)\s+[\w[\]?]+/);
    if (field && !line.trim().startsWith('@@')) fieldNames.add(field[1]);
  }
  if (!columns.every(c => fieldNames.has(c))) return null;

  const indexLine = `@@index([${columns.join(', ')}])`;
  const target = columns.join(',');
  const existing = code.some(line => {
    const m = line.match(/@@index\s*\(\s*(?:fields\s*:\s*)?\[([^\]]+)\]/);
    return !!m && m[1].split(',').map(c => c.trim().split('(')[0].trim()).join(',') === target;
  });
  if (existing) return null;

  // Match the block's own style: the indentation of its existing @@ lines if
  // it has any, otherwise that of its fields.
  const attrIdx = lastIndexWhere(code, l => /^\s*@@/.test(l));
  const fieldIdx = code.findIndex(l => /^\s*\w+\s+[\w[\]?]+/.test(l));
  const styleLine = attrIdx >= 0 ? body[attrIdx] : fieldIdx >= 0 ? body[fieldIdx] : '';
  const indent = styleLine.match(/^\s*/)![0];

  const out = [...body];
  if (attrIdx >= 0) {
    // Alongside the other block attributes.
    out.splice(attrIdx + 1, 0, indent + indexLine);
  } else {
    // After the last non-blank line, separated from the fields by a blank
    // line — the layout `prisma format` produces.
    const last = lastIndexWhere(out, l => l.trim() !== '');
    out.splice(last + 1, out.length - last - 1, '', indent + indexLine);
  }

  return [lines[0], ...out, lines[closeIdx]].join(eol);
}

/** A Prisma line with any `//` comment removed, respecting quoted strings. */
function stripLineComment(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inString) {
      if (c === '\\') { i++; continue; }
      if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === '/' && line[i + 1] === '/') {
      return line.slice(0, i);
    }
  }
  return line;
}

function lastIndexWhere<T>(items: T[], test: (item: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i--) if (test(items[i])) return i;
  return -1;
}
