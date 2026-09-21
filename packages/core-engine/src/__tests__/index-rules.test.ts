/**
 * Regression tests for the index rules.
 *
 * Every case here comes from scanning one real Prisma project
 * (subscribe-service), where the previous implementation produced 31 findings
 * of which roughly 26 were wrong — and missed the single foreign key that
 * genuinely had no index.
 */

import {
  indexRules,
  parseSchema,
  resetIndexRuleCache,
  indexRuleMetrics,
  foreignKeyCoverage,
} from '../rules/index-rules';
import type { DiagnosticIssue } from '../types';

const fkRule = indexRules.find(r => r.id === 'index/missing-fk-index')!;
const queryRule = indexRules.find(r => r.id === 'index/missing-filter-index')!;

/** The shapes from subscribe-service that mattered, trimmed to the point. */
const SCHEMA = `
model Project {
  id        String   @id @default(cuid())
  slug      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  subscribers Subscriber[]
}

model Subscriber {
  id        BigInt   @id @default(autoincrement())
  projectId String   @map("project_id")
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  email     String
  status    String   @default("pending")
  createdAt DateTime @default(now())

  @@unique([projectId, email])
}

model SendLog {
  id        BigInt   @id @default(autoincrement())
  projectId String   @map("project_id")
  project   Project  @relation(fields: [projectId], references: [id])
  createdAt DateTime @default(now())

  @@index([projectId, createdAt])
}

model CampaignRecipient {
  id           String     @id @default(cuid())
  subscriberId BigInt     @map("subscriber_id")
  subscriber   Subscriber @relation(fields: [subscriberId], references: [id], onDelete: Cascade)
  status       String     @default("pending")
}

// No @relation here on purpose: projectAdminUserId is indexed but is not a
// declared foreign key in this fixture, which keeps the foreign-key
// denominators above focused on the three that are.
model AdminSession {
  id                 String   @id @default(cuid())
  token              String   @unique
  projectAdminUserId String   @map("project_admin_user_id")
  userAgent          String?  @map("user_agent")
  lastActiveAt       DateTime @default(now())

  @@index([projectAdminUserId])
}
`;

function scanSchema(): DiagnosticIssue[] {
  resetIndexRuleCache();
  return fkRule.detect('prisma/schema.prisma', SCHEMA);
}

function scanQueries(code: string): DiagnosticIssue[] {
  resetIndexRuleCache();
  fkRule.detect('prisma/schema.prisma', SCHEMA);
  return queryRule.detect('src/routes/admin.ts', code);
}

describe('parseSchema', () => {
  it('reads foreign keys from @relation, not from the field name', () => {
    const models = parseSchema(SCHEMA);
    // BigInt — the old /Id$/ + String|Int heuristic could not see this one.
    expect(models.get('CampaignRecipient')!.fields.get('subscriberId')!.isForeignKey).toBe(true);
  });

  it('treats @@unique as an index', () => {
    const models = parseSchema(SCHEMA);
    expect(models.get('Subscriber')!.indexes).toContainEqual({
      columns: ['projectId', 'email'],
      source: 'unique',
    });
  });

  it('treats field-level @id and @unique as single-column indexes', () => {
    const models = parseSchema(SCHEMA);
    expect(models.get('Project')!.indexes).toContainEqual({ columns: ['id'], source: 'id' });
    expect(models.get('Project')!.indexes).toContainEqual({ columns: ['slug'], source: 'unique' });
  });

  it('records each field at its own line', () => {
    const models = parseSchema(SCHEMA);
    const projectCreatedAt = models.get('Project')!.fields.get('createdAt')!.line;
    const subscriberCreatedAt = models.get('Subscriber')!.fields.get('createdAt')!.line;
    expect(subscriberCreatedAt).toBeGreaterThan(projectCreatedAt);
  });
});

describe('composite foreign keys', () => {
  // From vibhanshuverma02/Billing-Software, found during manual verification of
  // the schema corpus. `@relation(fields: [chequeNo, uniqueNo])` is one foreign
  // key of two columns. The first implementation treated it as two foreign
  // keys — double-counting it, and, worse, reporting the second column as
  // unindexed whenever a matching composite index did exist.

  const COMPOSITE_UNINDEXED = `
model Bill {
  id       Int    @id
  chequeNo String
  uniqueNo String
  payments Payment[]

  @@unique([chequeNo, uniqueNo])
}

model Payment {
  id       Int    @id
  chequeNo String
  uniqueNo String
  bill     Bill   @relation(fields: [chequeNo, uniqueNo], references: [chequeNo, uniqueNo])
}
`;

  const COMPOSITE_INDEXED = COMPOSITE_UNINDEXED.replace(
    'bill     Bill   @relation(fields: [chequeNo, uniqueNo], references: [chequeNo, uniqueNo])\n}',
    'bill     Bill   @relation(fields: [chequeNo, uniqueNo], references: [chequeNo, uniqueNo])\n\n  @@index([chequeNo, uniqueNo])\n}',
  );

  it('counts a composite foreign key once, not once per column', () => {
    const coverage = foreignKeyCoverage(parseSchema(COMPOSITE_UNINDEXED));
    expect(coverage).toHaveLength(1);
    expect(coverage[0].columns).toEqual(['chequeNo', 'uniqueNo']);
  });

  it('reports an unindexed composite foreign key as one finding', () => {
    resetIndexRuleCache();
    const issues = fkRule.detect('prisma/schema.prisma', COMPOSITE_UNINDEXED);
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toContain('[chequeNo, uniqueNo]');
    expect(issues[0].recommendation).toContain('@@index([chequeNo, uniqueNo])');
  });

  it('does not report the second column when a composite index covers both', () => {
    // The false positive the per-column model would have produced.
    resetIndexRuleCache();
    expect(fkRule.detect('prisma/schema.prisma', COMPOSITE_INDEXED)).toEqual([]);
  });

  it('does not count an index on the first column alone as full coverage', () => {
    const partial = COMPOSITE_UNINDEXED.replace(
      'bill     Bill   @relation(fields: [chequeNo, uniqueNo], references: [chequeNo, uniqueNo])\n}',
      'bill     Bill   @relation(fields: [chequeNo, uniqueNo], references: [chequeNo, uniqueNo])\n\n  @@index([chequeNo])\n}',
    );
    const coverage = foreignKeyCoverage(parseSchema(partial));
    expect(coverage[0].indexed).toBe(false);
  });
});

describe('index/missing-fk-index', () => {
  it('reads a model declared on the same line as the previous closing brace', () => {
    // fazendansaibiraci-wq/gestao-fazenda: `}model AplicacaoInsumo {`. Prisma
    // accepts it; the parser required `model` at the start of the line and
    // lost the whole model with its five foreign keys.
    const models = parseSchema(`
model User {
  id String @id
}model Post {
  id     String @id
  userId String
  user   User   @relation(fields: [userId], references: [id])
}
`);
    expect([...models.keys()]).toEqual(['User', 'Post']);
    expect(foreignKeyCoverage(models)).toHaveLength(1);
  });

  it('allows whitespace before the colon in fields:', () => {
    // DivijJ16/Project-Management-App writes `fields : [userId]`.
    const coverage = foreignKeyCoverage(parseSchema(`
model User {
  id String @id
}
model RefreshToken {
  id     String @id
  userId String
  user   User   @relation(fields : [userId], references : [id], onDelete : Cascade)
}
`));
    expect(coverage).toHaveLength(1);
    expect(coverage[0].columns).toEqual(['userId']);
  });

  it('does not count a commented-out @@index as an index', () => {
    // Four corpus schemas had a foreign key whose only index was commented
    // out. The attribute pattern matched anywhere on the line, so the key was
    // reported as covered; Prisma, correctly, sees no index.
    resetIndexRuleCache();
    const issues = fkRule.detect('prisma/schema.prisma', `
model User {
  id    String @id
  posts Post[]
}
model Post {
  id     String @id
  userId String
  user   User   @relation(fields: [userId], references: [id])

  // @@index([userId])
}
`);
    expect(issues).toHaveLength(1);
  });

  it('ignores models inside a block comment', () => {
    // Prisma accepts /* */ and skips whatever is inside. The line parser read
    // commented-out models as live and counted their foreign keys.
    const models = parseSchema(`
model User {
  id String @id
}
/*
model Retired {
  id     String @id
  userId String
  user   User   @relation(fields: [userId], references: [id])
}
*/
`);
    expect([...models.keys()]).toEqual(['User']);
  });

  it('keeps // inside a string when stripping comments', () => {
    const models = parseSchema(`
model Link {
  id  String @id
  url String @default("https://example.com") @unique
}
`);
    expect(models.get('Link')!.indexes).toContainEqual({ columns: ['url'], source: 'unique' });
  });

  it('does not count foreign keys on @@ignore models', () => {
    // Prisma leaves @@ignore models out of its own model list; they are
    // typically introspected tables it cannot use, whose keys it never made.
    const coverage = foreignKeyCoverage(parseSchema(`
model User {
  id String @id
}
model LegacyAudit {
  id     Int    @default(autoincrement())
  userId String
  user   User   @relation(fields: [userId], references: [id])

  @@ignore
}
`));
    expect(coverage).toEqual([]);
  });

  it('reads fields in a schema with no indentation at all', () => {
    // WinnieLooh/BoboQ. Valid Prisma, every field at column 0. The parser
    // required leading whitespace and found no fields, so this schema came out
    // with zero foreign keys — caught by the corpus arithmetic check, since
    // every collected schema must have at least one relation.
    const coverage = foreignKeyCoverage(parseSchema(`
generator client {
provider = "prisma-client-js"
}

model User {
id     String  @id @default(uuid())
email  String  @unique
orders Order[]
}

model Order {
id     String @id @default(uuid())
userId String
user   User   @relation(fields: [userId], references: [id])
}
`));
    expect(coverage).toHaveLength(1);
    expect(coverage[0].columns).toEqual(['userId']);
    expect(coverage[0].indexed).toBe(false);
  });

  it('does not read generator or datasource settings as fields', () => {
    // The flip side of allowing column-0 fields: settings blocks sit at the
    // same indentation and must still be ignored.
    const models = parseSchema(`
generator client {
provider = "prisma-client-js"
}
datasource db {
provider = "postgresql"
}
enum Role {
ADMIN
USER
}
model User {
id String @id
}
`);
    expect([...models.keys()]).toEqual(['User']);
    expect([...models.get('User')!.fields.keys()]).toEqual(['id']);
  });

  it('reads a bracketless @@index(field) as an index', () => {
    // leo-def/school-monitor declares `@@index(companyId)`. Prisma accepts it
    // and its DMMF records a normal index on companyId; the first parser
    // required brackets and reported companyId as unindexed.
    resetIndexRuleCache();
    const issues = fkRule.detect('prisma/schema.prisma', `
model Company {
  id      String        @id
  classes SchoolClass[]
}
model SchoolClass {
  id        String  @id
  company   Company @relation(fields: [companyId], references: [id])
  companyId String

  @@index(companyId)
}
`);
    expect(issues).toEqual([]);
  });

  it('reads a bracketless @relation(fields: x) as a foreign key', () => {
    // Also valid Prisma. Missing it would drop the foreign key from the
    // denominator silently rather than produce anything to check.
    const coverage = foreignKeyCoverage(parseSchema(`
model Company {
  id      String        @id
  classes SchoolClass[]
}
model SchoolClass {
  id        String  @id
  company   Company @relation(fields: companyId, references: id)
  companyId String
}
`));
    expect(coverage).toHaveLength(1);
    expect(coverage[0].columns).toEqual(['companyId']);
    expect(coverage[0].indexed).toBe(false);
  });

  it('reports a foreign key with no index at all', () => {
    const fields = scanSchema().map(i => i.title);
    expect(fields.some(t => t.includes("'subscriberId'") && t.includes('CampaignRecipient'))).toBe(true);
  });

  it('does not report a foreign key covered by a composite unique', () => {
    // Subscriber.projectId leads @@unique([projectId, email]).
    const titles = scanSchema().map(i => i.title);
    expect(titles.some(t => t.includes("'projectId'") && t.includes('Subscriber'))).toBe(false);
  });

  it('does not report a foreign key that leads a composite index', () => {
    // SendLog.projectId leads @@index([projectId, createdAt]).
    const titles = scanSchema().map(i => i.title);
    expect(titles.some(t => t.includes('SendLog'))).toBe(false);
  });

  it('finds exactly one unindexed foreign key in this schema', () => {
    expect(scanSchema()).toHaveLength(1);
  });
});

describe('index/missing-filter-index', () => {
  it('does not report a filter served by a composite unique', () => {
    const issues = scanQueries(`
      const rows = await prisma.subscriber.findMany({ where: { projectId: project.id } });
    `);
    expect(issues).toEqual([]);
  });

  it('does not report a compound-key selector', () => {
    // where: { projectId_email: {...} } targets @@unique([projectId, email]) by name.
    const issues = scanQueries(`
      const subscriber = await prisma.subscriber.findUnique({
        where: { projectId_email: { projectId: project.id, email: paramsParsed.data.email } },
      });
    `);
    expect(issues).toEqual([]);
  });

  it('reports a field no index leads with', () => {
    const issues = scanQueries(`
      const rows = await prisma.subscriber.findMany({ where: { status: 'confirmed' } });
    `);
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toContain("'status'");
  });

  it('does not treat operators as fields', () => {
    const issues = scanQueries(`
      const rows = await prisma.subscriber.findMany({
        where: { status: { in: ['pending', 'confirmed'] }, createdAt: { gte: start, lt: end } },
      });
    `);
    for (const issue of issues) {
      expect(issue.title).not.toMatch(/'(in|gte|lt|not|contains)'/);
    }
  });

  it("does not attribute one query's where clause to another query's model", () => {
    // The old ten-line window read the sendLog where clause below and reported
    // its fields against Project, which has no projectId column at all.
    const issues = scanQueries(`
      const projects = await prisma.project.findMany({
        orderBy: { createdAt: 'asc' },
      });

      const count = await prisma.sendLog.count({
        where: { projectId: project.id, createdAt: { gte: start, lt: end } },
      });
    `);
    for (const issue of issues) {
      expect(issue.title).not.toMatch(/'projectId'.*Project'/);
    }
  });

  it('does not report a filter fully served by a composite index', () => {
    // SendLog @@index([projectId, createdAt]) covers both, in order.
    const issues = scanQueries(`
      const count = await prisma.sendLog.count({
        where: { projectId: project.id, createdAt: { gte: start, lt: end } },
      });
    `);
    expect(issues).toEqual([]);
  });

  it('ignores relation filters, which constrain a different model', () => {
    const issues = scanQueries(`
      const rows = await prisma.subscriber.findMany({
        where: { project: { slug: 'bitnotes' } },
      });
    `);
    expect(issues).toEqual([]);
  });

  it('reports the second column of a composite unique when queried alone', () => {
    // The case most easily got backwards. @@unique([projectId, email]) serves
    // `where: { projectId }` but not `where: { email }` — Postgres can only
    // start from a leading column. subscribe-service filters by email alone
    // in its bounce webhook, deliberately and across all projects, so this is
    // a real sequential scan rather than a modelling artefact.
    const issues = scanQueries(`
      await prisma.subscriber.updateMany({
        where: { email, status: { notIn: ['unsubscribed'] } },
        data: { status },
      });
    `);
    const fields = issues.map(i => i.title);
    expect(fields.some(t => t.includes("'email'"))).toBe(true);
    expect(fields.some(t => t.includes("'status'"))).toBe(true);
  });

  it('reports a non-key column used as a filter alongside an indexed one', () => {
    // AdminSession has @@index([projectAdminUserId]), so that field is served
    // and userAgent is not. From subscribe-service's login path, which runs
    // this deleteMany on every sign-in.
    const issues = scanQueries(`
      await prisma.adminSession.deleteMany({
        where: {
          projectAdminUserId: adminUser.id,
          userAgent: request.headers['user-agent'] ?? null,
        },
      });
    `);
    const titles = issues.map(i => i.title);
    expect(titles.some(t => t.includes("'userAgent'"))).toBe(true);
    expect(titles.some(t => t.includes("'projectAdminUserId'"))).toBe(false);
  });
});

describe('index/missing-sort-index', () => {
  function sortIssues(code: string): DiagnosticIssue[] {
    resetIndexRuleCache();
    fkRule.detect('prisma/schema.prisma', SCHEMA);
    return queryRule
      .detect('src/routes/admin.ts', code)
      .filter(i => i.rule === 'index/missing-sort-index');
  }

  it('reports a real orderBy on an unindexed column', () => {
    const issues = sortIssues(`
      const projects = await prisma.project.findMany({ orderBy: { createdAt: 'asc' } });
    `);
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toContain("'createdAt'");
  });

  it('does not report a createdAt column that is never sorted on', () => {
    // The old rule reported every createdAt and updatedAt field in the schema
    // on the theory that they are "commonly used in orderBy", having looked at
    // no query at all.
    expect(sortIssues(`const rows = await prisma.subscriber.findMany({});`)).toEqual([]);
    expect(scanSchema().filter(i => i.rule === 'index/missing-sort-index')).toEqual([]);
  });
});

describe('denominators', () => {
  // A finding count with no denominator cannot answer "how common is this?",
  // which is the question an application report exists to answer. "One
  // unindexed foreign key" reads differently against 3 than against 300.

  it('counts the foreign keys examined, not only the ones missing an index', () => {
    resetIndexRuleCache();
    fkRule.detect('prisma/schema.prisma', SCHEMA);
    const metrics = indexRuleMetrics();

    // Subscriber.projectId, SendLog.projectId, CampaignRecipient.subscriberId
    expect(metrics['index.foreignKeys']).toBe(3);
    // All but CampaignRecipient.subscriberId lead an index.
    expect(metrics['index.foreignKeysIndexed']).toBe(2);
    expect(metrics['index.models']).toBe(5);
  });

  it('counts only @@index, not the indexes that constraints create', () => {
    resetIndexRuleCache();
    fkRule.detect('prisma/schema.prisma', SCHEMA);
    // SendLog @@index([projectId, createdAt]) and AdminSession
    // @@index([projectAdminUserId]) — the primary keys, @unique columns and
    // the @@unique on Subscriber are all real indexes, and all excluded here.
    expect(indexRuleMetrics()['index.explicitIndexes']).toBe(2);
  });

  it('agrees with the findings: examined minus indexed equals reported', () => {
    resetIndexRuleCache();
    const issues = fkRule.detect('prisma/schema.prisma', SCHEMA);
    const metrics = indexRuleMetrics();
    expect(metrics['index.foreignKeys'] - metrics['index.foreignKeysIndexed']).toBe(issues.length);
  });

  it('counts query sites examined', () => {
    resetIndexRuleCache();
    fkRule.detect('prisma/schema.prisma', SCHEMA);
    queryRule.detect('src/routes/admin.ts', `
      const a = await prisma.subscriber.findMany({ where: { status: 'confirmed' } });
      const b = await prisma.project.findMany({ orderBy: { createdAt: 'asc' } });
    `);
    expect(indexRuleMetrics()['index.querySitesExamined']).toBe(2);
  });

  it('resets between scans', () => {
    resetIndexRuleCache();
    fkRule.detect('prisma/schema.prisma', SCHEMA);
    resetIndexRuleCache();
    expect(indexRuleMetrics()['index.foreignKeys']).toBe(0);
    expect(indexRuleMetrics()['index.querySitesExamined']).toBe(0);
  });
});

describe('scan isolation', () => {
  it('forgets models from a previous scan', () => {
    resetIndexRuleCache();
    fkRule.detect('prisma/schema.prisma', SCHEMA);
    resetIndexRuleCache();
    // With no schema loaded, query rules have nothing to check against and
    // must stay silent rather than reporting against a stale model.
    const issues = queryRule.detect('src/routes/admin.ts', `
      const rows = await prisma.subscriber.findMany({ where: { status: 'confirmed' } });
    `);
    expect(issues).toEqual([]);
  });
});
