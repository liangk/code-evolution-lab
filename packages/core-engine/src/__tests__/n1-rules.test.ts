/**
 * Regression corpus for the N+1 query rule.
 *
 * Ported case-for-case from the study detector's corpus at
 * `backend/src/__tests__/n1-query-detector.corpus.test.ts`. Every case here is
 * distilled from real open-source code that was read and classified during a
 * scan of 28 repositories. The MUST_DETECT cases come from confirmed N+1
 * patterns; the MUST_NOT_DETECT cases come from code the detector used to
 * report and shouldn't — each one cost a round of fixes to get right, and this
 * file is what stops them coming back.
 *
 * `source` names the repository and file the case was reduced from.
 *
 * These cases gate the rule but do not replace the corpus scan: re-scanning
 * outline, cal.com and immich must still return 27, 7 and 8 findings, with
 * severity splits of 0/9/18, 0/0/7 and 0/1/7.
 */

import * as parser from '@babel/parser';
import { n1Rules } from '../rules/n1-rules';
import type { DiagnosticIssue } from '../types';

interface Case {
  name: string;
  source: string;
  code: string;
  /** Expected number of reported issues. */
  expected: number;
}

function analyze(code: string): DiagnosticIssue[] {
  const ast = parser.parse(code, {
    sourceType: 'unambiguous',
    plugins: ['jsx', 'typescript', 'decorators-legacy'],
    errorRecovery: true,
  });
  return n1Rules[0].detect('case.ts', code, ast);
}

const MUST_DETECT: Case[] = [
  {
    name: 'Prisma findUnique per item in a for-of loop',
    source: 'calcom/cal.com bookings/get.handler.ts',
    expected: 1,
    code: `
      import { prisma } from "@calcom/prisma";
      async function run(bookings) {
        for (const booking of bookings) {
          const rescheduled = await prisma.booking.findUnique({ where: { uid: booking.fromReschedule } });
          booking.rescheduler = rescheduled;
        }
      }
    `,
  },
  {
    name: 'Prisma update per item inside .map()',
    source: 'calcom/cal.com loggedInViewer/eventTypeOrder.handler.ts',
    expected: 1,
    code: `
      import { prisma } from "@calcom/prisma";
      async function reorder(ids) {
        await Promise.all(
          ids.map((id, position) => prisma.eventType.update({ where: { id }, data: { position } }))
        );
      }
    `,
  },
  {
    name: 'Prisma upsert per item inside .map()',
    source: 'calcom/cal.com slots/reserveSlot.handler.ts',
    expected: 1,
    code: `
      import { prisma } from "@calcom/prisma";
      async function reserve(users, slot) {
        await Promise.all(
          users.map((user) => prisma.selectedSlots.upsert({
            where: { userId: user.id }, update: { slot }, create: { userId: user.id, slot },
          }))
        );
      }
    `,
  },
  {
    name: 'Sequential transaction update per item',
    source: 'calcom/cal.com eventTypes/heavy/update.handler.ts',
    expected: 1,
    code: `
      async function updateGroups(tx, groupsToUpdate) {
        for (const group of groupsToUpdate) {
          await tx.hostGroup.update({ where: { id: group.id }, data: { name: group.name } });
        }
      }
    `,
  },
  {
    name: 'Sequelize findByPk per mention',
    source: 'outline/outline queues/tasks/CommentCreatedNotificationsTask.ts',
    expected: 1,
    code: `
      import { Op } from "sequelize";
      async function notify(mentions) {
        for (const mention of mentions) {
          const recipient = await User.findByPk(mention.modelId);
          if (recipient) await send(recipient);
        }
      }
    `,
  },
  {
    name: 'Three Sequelize queries nested in one loop reports critical',
    source: 'outline/outline queues/tasks/RevisionCreatedNotificationsTask.ts:108',
    expected: 1,
    code: `
      import { Op } from "sequelize";
      async function notifyGroups(groupMentions) {
        for (const group of groupMentions) {
          const groupModel = await Group.findByPk(group.modelId);
          const members = await GroupUser.findAll({ where: { groupId: group.modelId } });
          const actor = await User.findByPk(group.actorId);
          await send(groupModel, members, actor);
        }
      }
    `,
  },
  {
    name: 'Sequelize findOrCreate per synced record',
    source: 'outline/outline commands/groupsSyncer.ts',
    expected: 1,
    code: `
      import { Op } from "sequelize";
      async function sync(externalGroups, provider) {
        for (const eg of externalGroups) {
          const [group] = await ExternalGroup.findOrCreate({ where: { providerId: provider.id, externalId: eg.id } });
          await group.update({ name: eg.name });
        }
      }
    `,
  },
  {
    name: 'Kysely delete chain executed per item',
    source: 'immich-app/immich repositories/asset.repository.ts deleteBulkMetadata',
    expected: 1,
    code: `
      async function deleteBulkMetadata(db, items) {
        await db.transaction().execute(async (tx) => {
          for (const { assetId, key } of items) {
            await tx.deleteFrom('asset_metadata').where('assetId', '=', assetId).where('key', '=', key).execute();
          }
        });
      }
    `,
  },
  {
    name: 'Repository lookup awaited per item',
    source: 'immich-app/immich services/album.service.ts:104',
    expected: 1,
    code: `
      class AlbumService {
        async create(albumUsers) {
          for (const { userId } of albumUsers) {
            const exists = await this.userRepository.get(userId, {});
            if (!exists) throw new Error('Invalid user');
          }
        }
      }
    `,
  },
  {
    name: 'Two repository calls per item',
    source: 'immich-app/immich services/album.service.ts:292',
    expected: 1,
    code: `
      class AlbumService {
        async addUsers(id, albumUsers) {
          for (const { userId, role } of albumUsers) {
            const user = await this.userRepository.get(userId, {});
            if (!user) continue;
            await this.albumUserRepository.create({ userId, albumId: id, role });
          }
        }
      }
    `,
  },
  {
    name: 'Raw SQL query per item, as a template literal',
    source: 'civitai/civitai scripts/teardown-pg-replication.ts',
    expected: 1,
    code: `
      import { Client } from 'pg';
      async function dropAll(client, publications) {
        for (const pub of publications.rows) {
          await client.query(\`DROP PUBLICATION IF EXISTS \${pub.pubname}\`);
        }
      }
    `,
  },
  {
    name: 'Raw SQL query per item, built by concatenation',
    source: 'civitai/civitai scripts/teardown-pg-replication.ts (concatenated form)',
    expected: 1,
    code: `
      async function dropAll(client, publications) {
        for (const pub of publications.rows) {
          await client.query('DROP TABLE IF EXISTS ' + pub.tablename);
        }
      }
    `,
  },
  {
    name: 'Mongoose findOne per item',
    source: 'novuhq/novu inbox usecases',
    expected: 1,
    code: `
      import mongoose from "mongoose";
      async function load(subscriptions) {
        for (const subscription of subscriptions) {
          const prefs = await PreferenceModel.findOne({ subscriberId: subscription.subscriberId });
          subscription.prefs = prefs;
        }
      }
    `,
  },
  {
    name: 'TypeORM repository findOne per item',
    source: 'twentyhq/twenty calendar-channel-sync-status.service.ts',
    expected: 1,
    code: `
      class SyncStatusService {
        async run(calendarChannels) {
          for (const channel of calendarChannels) {
            const account = await this.connectedAccountRepository.findOne({ where: { id: channel.accountId } });
            if (account) await this.touch(account);
          }
        }
      }
    `,
  },
  {
    name: 'Prisma create per row in a seed script',
    source: 'prisma/prisma-examples orm/*/prisma/seed.ts',
    expected: 1,
    code: `
      import { PrismaClient } from '@prisma/client';
      const prisma = new PrismaClient();
      async function main(userData) {
        for (const u of userData) {
          const user = await prisma.user.create({ data: u });
          console.log('Created user ' + user.id);
        }
      }
    `,
  },
  {
    name: 'Per-item query inside a concurrency-limited batch is still N+1',
    source: 'useplunk/plunk services/SegmentService.ts:303',
    expected: 1,
    code: `
      import { prisma } from "../database/prisma";
      async function refresh(segments) {
        const BATCH_SIZE = 5;
        for (let i = 0; i < segments.length; i += BATCH_SIZE) {
          const slice = segments.slice(i, i + BATCH_SIZE);
          await Promise.all(slice.map(async (segment) => {
            const count = await prisma.segmentMembership.count({ where: { segmentId: segment.id } });
            return count;
          }));
        }
      }
    `,
  },
  {
    name: 'A collection merely named "...Batches" is not a batch loop',
    source: 'useplunk/plunk services/QueueService.ts:728',
    expected: 1,
    code: `
      import { prisma } from "../database/prisma";
      async function cancel(campaignQueue, projectId) {
        const campaignBatches = await campaignQueue.getJobs(['waiting', 'delayed']);
        for (const job of campaignBatches) {
          const campaign = await prisma.campaign.findUnique({ where: { id: job.data.campaignId } });
          if (campaign?.projectId === projectId) await job.remove();
        }
      }
    `,
  },
  {
    name: "Query batched over the item's children is still one query per item",
    source: 'baptisteArno/typebot.io scripts/helpers/trackAndReportYesterdaysResults.ts',
    expected: 1,
    code: `
      import { prisma } from "@typebot.io/prisma";
      async function report(workspaces) {
        for (const workspace of workspaces) {
          const results = await prisma.result.groupBy({
            by: ["typebotId"],
            where: { typebotId: { in: workspace.typebots.map((t) => t.id) } },
          });
          await send(results);
        }
      }
    `,
  },
  {
    name: 'Write per item in a background job loop',
    source: 'toeverything/AFFiNE models/permission-write.ts:589',
    expected: 1,
    code: `
      class PermissionModel {
        async grantAll(userIds, workspaceId, docId) {
          for (const userId of userIds) {
            await this.db.docGrant.upsert({
              where: { workspaceId_docId_principalId: { workspaceId, docId, principalId: userId } },
              update: { type: 'Reader' },
              create: { workspaceId, docId, principalId: userId, type: 'Reader' },
            });
          }
        }
      }
    `,
  },
  {
    name: 'An early guard that returns is not a fallback chain',
    source: 'regression guard for the fallback-chain veto',
    expected: 1,
    code: `
      import { Op } from "sequelize";
      async function notify(mentions) {
        for (const mention of mentions) {
          const recipient = await User.findByPk(mention.modelId);
          if (!recipient) return;
          await send(recipient);
        }
      }
    `,
  },
];

const MUST_NOT_DETECT: Case[] = [
  {
    name: 'Map.get() used as a translation cache',
    source: 'calcom/cal.com apps/toggle.handler.ts (was reported as Unknown.get())',
    expected: 0,
    code: `
      async function notify(credentials) {
        const translations = new Map();
        for (const credential of credentials) {
          let t = translations.get(credential.locale);
          if (!t) {
            t = await getTranslation(credential.locale);
            translations.set(credential.locale, t);
          }
          await sendEmail(credential, t);
        }
      }
    `,
  },
  {
    name: 'Map held on a class property',
    source: 'toeverything/AFFiNE core/sync/gateway.ts',
    expected: 0,
    code: `
      class Gateway {
        private activeDocSockets = new Map();
        remove(client, docs) {
          for (const key of docs) {
            const sockets = this.activeDocSockets.get(key);
            sockets?.delete(client);
          }
        }
      }
    `,
  },
  {
    name: 'Array.prototype.find with a callback',
    source: 'calcom/cal.com availability/calendarOverlay.handler.ts (was reported as Mongoose.find())',
    expected: 0,
    code: `
      function build(calendarsToLoad, credentials) {
        return calendarsToLoad.map((calendar) => {
          const credential = credentials.find((item) => item.id === calendar.credentialId);
          return { calendar, credential };
        });
      }
    `,
  },
  {
    name: 'Promise.all over a map of non-database work',
    source: 'calcom/cal.com apps/toggle.handler.ts (was reported as Unknown.all())',
    expected: 0,
    code: `
      async function run(items) {
        await Promise.all(items.map(async (item) => {
          const rendered = await renderTemplate(item);
          return rendered;
        }));
      }
    `,
  },
  {
    name: 'Bounded retry loop with a counter variable',
    source: 'dubinc/dub lib/api/partners/generate-partner-username.ts',
    expected: 0,
    code: `
      import { prisma } from "../prisma";
      async function generate(username) {
        let retries = 0;
        while (retries <= MAX_RETRIES) {
          const existing = await prisma.partner.findUnique({ where: { username } });
          if (!existing) return username;
          retries++;
        }
        return null;
      }
    `,
  },
  {
    name: 'Bounded retry loop with an attempt counter',
    source: 'triggerdotdev/trigger.dev services/dashboardAgentWatchAlerts.server.ts',
    expected: 0,
    code: `
      import { prisma } from "../db.server";
      async function subscribe(projectId) {
        for (let attempt = 0; attempt < SUBSCRIBE_ATTEMPTS; attempt++) {
          const existing = await prisma.projectAlertChannel.findFirst({ where: { projectId } });
          if (existing) return existing;
        }
      }
    `,
  },
  {
    name: 'Infinite retry loop generating a unique value',
    source: 'outline/outline commands/teamCreator.ts',
    expected: 0,
    code: `
      import { Op } from "sequelize";
      async function uniqueSubdomain(base) {
        let subdomain = base;
        for (;;) {
          const existing = await Team.findOne({ where: { subdomain } });
          if (!existing) return subdomain;
          subdomain = base + Math.random();
        }
      }
    `,
  },
  {
    name: 'Cursor pagination with skip/take',
    source: 'toeverything/AFFiNE data/migrations/1698398506533-guid.ts',
    expected: 0,
    code: `
      async function backfill(db) {
        let turn = 0;
        while (true) {
          const rows = await db.snapshot.findMany({ skip: turn * 100, take: 100 });
          if (rows.length < 100) break;
          turn++;
        }
      }
    `,
  },
  {
    name: 'Flag-driven batch deletion',
    source: 'useplunk/plunk jobs/api-request-cleanup-processor.ts',
    expected: 0,
    code: `
      import { prisma } from "../database/prisma";
      async function cleanup(cutoffDate) {
        let hasMore = true;
        while (hasMore) {
          const result = await prisma.apiRequest.deleteMany({ where: { createdAt: { lt: cutoffDate } } });
          hasMore = result.count >= BATCH_SIZE;
        }
      }
    `,
  },
  {
    name: 'Fixed-window paging loop',
    source: 'twentyhq/twenty calendar-event-cleaner.service.ts',
    expected: 0,
    code: `
      class Cleaner {
        async run(calendarEventIds) {
          for (let index = 0; index < calendarEventIds.length; index += CALENDAR_CLEANUP_PAGE_SIZE) {
            const page = calendarEventIds.slice(index, index + CALENDAR_CLEANUP_PAGE_SIZE);
            await this.calendarEventRepository.find({ where: { id: page } });
          }
        }
      }
    `,
  },
  {
    name: 'Chunked query using an in clause over the whole batch',
    source: 'formbricks/formbricks lib/authorization/resolvers.ts',
    expected: 0,
    code: `
      import { prisma } from "../prisma";
      async function resolve(batches) {
        return Promise.all(
          batches.map((batch) => prisma.workspace.findMany({ where: { id: { in: batch } } }))
        );
      }
    `,
  },
  {
    name: 'Loop over batches produced by a chunk helper',
    source: 'civitai/civitai common/feeds/images.feed.ts',
    expected: 0,
    code: `
      async function build(ctx, ids) {
        const batches = chunk(ids, 1000);
        for (const batch of batches) {
          const images = await ctx.pg.query('SELECT * FROM images WHERE id = ANY($1)', [batch]);
          await index(images);
        }
      }
    `,
  },
  {
    name: 'The query that produces the collection is not inside the loop',
    source: 'outline/outline queues/processors/ApiKeyCleanupProcessor.ts',
    expected: 0,
    code: `
      import { Op } from "sequelize";
      async function ids(teamId) {
        return (await User.findAll({ attributes: ["id"], where: { teamId } })).map((u) => u.id);
      }
    `,
  },
  {
    name: 'Buffered bulk flush of an accumulator array',
    source: 'immich-app/immich repositories/map.repository.ts',
    expected: 0,
    code: `
      async function importGeodata(db, lineReader) {
        const bufferGeodata = [];
        for await (const line of lineReader) {
          bufferGeodata.push(parse(line));
          if (bufferGeodata.length === 1000) {
            await db.insertInto('geodata_places').values(bufferGeodata).execute();
            bufferGeodata.length = 0;
          }
        }
      }
    `,
  },
  {
    name: 'Firestore staged transaction writes',
    source: 'nextauthjs/next-auth packages/adapter-firebase/src/index.ts',
    expected: 0,
    code: `
      import { getFirestore } from "firebase-admin/firestore";
      async function deleteUser(db, C, userId) {
        await db.runTransaction(async (transaction) => {
          const accounts = await C.accounts.where("userId", "==", userId).get();
          accounts.forEach((account) => transaction.delete(account.ref));
        });
      }
    `,
  },
  {
    name: 'A plain Map that happens to be named repositories',
    source: 'triggerdotdev/trigger.dev services/resolveTriggerUriInOrganization.server.ts',
    expected: 0,
    code: `
      function resolveAll(inScope, repositories, resolved) {
        for (const [uri, environment] of inScope) {
          const scope = {
            id: environment.id,
            repository: repositories.get(environment.project.id) ?? null,
          };
          resolved.set(uri, scope);
        }
      }
    `,
  },
  {
    name: 'A CQRS usecase .execute() is not a query',
    source: 'novuhq/novu inbox/usecases/mark-notifications-as-seen',
    expected: 0,
    code: `
      class MarkSeen {
        async execute(messageChunk) {
          const promises = messageChunk.map((message) =>
            this.sendWebhookMessage.execute({ eventType: 'seen', payload: { object: message } })
          );
          await Promise.all(promises);
        }
      }
    `,
  },
  {
    name: 'Redis calls in a loop are not database queries',
    source: 'civitai/civitai services/query-cache-manager.ts',
    expected: 0,
    code: `
      async function restore(redis, cacheKey, numChunks) {
        for (let i = 0; i < numChunks; i++) {
          const data = await redis.get(cacheKey + ':chunk:' + i);
          if (!data) continue;
        }
      }
    `,
  },
  {
    name: 'A fallback chain that returns on the first success',
    source: 'keystonejs/keystone packages/core/src/testing/postgresql.ts:27',
    expected: 0,
    code: `
      import { Client } from 'pg';
      async function create(candidates, config, database) {
        let lastError;
        for (const candidate of candidates) {
          const client = new Client(configForDatabase(config, candidate));
          try {
            await client.connect();
            await client.query('CREATE DATABASE ' + escapeIdentifier(database));
            return;
          } catch (error) {
            if (errorCode(error) === '42P04') return;
            lastError = error;
          } finally {
            await client.end().catch(() => {});
          }
        }
        throw lastError;
      }
    `,
  },
];

const NESTED_LOOP_CASE = {
  name: 'One N+1 in nested loops is reported once, at the inner loop',
  source: 'outline/outline queues/processors/WebsocketsProcessor.ts',
  code: `
    import { Op } from "sequelize";
    async function run(groups) {
      for (const group of groups) {
        for (const member of group.members) {
          const user = await User.findByPk(member.userId);
          await send(user);
        }
      }
    }
  `,
};

describe('n1/query-in-loop regression corpus', () => {
  describe('patterns that must be detected', () => {
    test.each(MUST_DETECT.map(c => [c.name, c] as [string, Case]))('%s', (_name, testCase) => {
      const issues = analyze(testCase.code);
      expect({ case: testCase.source, issues: issues.length }).toEqual({
        case: testCase.source,
        issues: testCase.expected,
      });
    });
  });

  describe('patterns that must not be reported', () => {
    test.each(MUST_NOT_DETECT.map(c => [c.name, c] as [string, Case]))('%s', (_name, testCase) => {
      const issues = analyze(testCase.code);
      expect({ case: testCase.source, issues: issues.length }).toEqual({
        case: testCase.source,
        issues: testCase.expected,
      });
    });
  });

  test(NESTED_LOOP_CASE.name, () => {
    const issues = analyze(NESTED_LOOP_CASE.code);
    expect(issues).toHaveLength(1);
    // The inner loop owns the query, so the reported line is the inner `for`.
    const innerLoopLine =
      NESTED_LOOP_CASE.code.split('\n').findIndex(l => l.includes('for (const member')) + 1;
    expect(issues[0].line).toBe(innerLoopLine);
  });

  test('severity rises with the number of queries in the loop', () => {
    const one = analyze(MUST_DETECT[0].code);
    const three = analyze(MUST_DETECT[5].code);
    expect(one[0].severity).toBe('medium');
    expect(three[0].severity).toBe('critical');
  });
});
