/**
 * Regression tests for the payload rules.
 *
 * The must-not-detect cases are the ones that matter: before the shared
 * db-call heuristics were applied, scanning this very package reported
 * `find() without field selection and a row limit` against an in-memory array
 * lookup in `engine.ts`, and `Returning unbounded database results` against a
 * function returning `Array.prototype.filter`.
 */

import * as parser from '@babel/parser';
import { payloadRules } from '../rules/payload-rules';
import type { DiagnosticIssue } from '../types';

function analyze(code: string): DiagnosticIssue[] {
  const ast = parser.parse(code, {
    sourceType: 'unambiguous',
    plugins: ['jsx', 'typescript', 'decorators-legacy'],
    errorRecovery: true,
  });
  return payloadRules[0].detect('case.ts', code, ast);
}

describe('payload rules — must detect', () => {
  it('a Prisma findMany with neither select nor take', () => {
    const issues = analyze(`
      import { prisma } from "@prisma/client";
      async function listUsers() {
        const users = await prisma.user.findMany({ where: { active: true } });
        return users;
      }
    `);
    expect(issues.map(i => i.rule)).toContain('payload/unbounded-query');
  });

  it('a Sequelize findAll returned straight out of a function', () => {
    const issues = analyze(`
      import { Op } from "sequelize";
      async function listDocuments(teamId) {
        return User.findAll({ where: { teamId } });
      }
    `);
    expect(issues.map(i => i.rule)).toContain('payload/large-return');
  });

  it('an awaited findAll returned straight out of a function', () => {
    const issues = analyze(`
      import { Op } from "sequelize";
      async function listDocuments(teamId) {
        return await Document.findAll({ where: { teamId } });
      }
    `);
    expect(issues.map(i => i.rule)).toContain('payload/large-return');
  });
});

describe('payload rules — must not detect', () => {
  it('Array.prototype.find with a callback', () => {
    const issues = analyze(`
      function pick(rules, id) {
        return rules.find((rule) => rule.id === id);
      }
    `);
    expect(issues).toEqual([]);
  });

  it('Array.prototype.find on a local array', () => {
    const issues = analyze(`
      function resolve(id) {
        const registered = [];
        const match = registered.find((r) => r.id === id);
        return match;
      }
    `);
    expect(issues).toEqual([]);
  });

  it('a Map lookup named like a store', () => {
    const issues = analyze(`
      class Registry {
        private ruleStore = new Map();
        get(id) {
          return this.ruleStore.get(id);
        }
      }
    `);
    expect(issues).toEqual([]);
  });

  it('a findMany that already has select and take', () => {
    const issues = analyze(`
      import { prisma } from "@prisma/client";
      async function listUsers() {
        return prisma.user.findMany({ select: { id: true }, take: 50 });
      }
    `);
    expect(issues).toEqual([]);
  });

  it('a single-record finder is not a payload concern', () => {
    const issues = analyze(`
      import { prisma } from "@prisma/client";
      async function getUser(id) {
        return prisma.user.findUnique({ where: { id } });
      }
    `);
    expect(issues).toEqual([]);
  });

  it('Promise.all is not a query', () => {
    const issues = analyze(`
      async function run(items) {
        return Promise.all(items.map((i) => handle(i)));
      }
    `);
    expect(issues).toEqual([]);
  });
});
