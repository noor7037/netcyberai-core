import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import type { EmailMessage } from '@/lib/email/sender';
import { emailSendHandler } from '@/lib/jobs/email-handler';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import type { ClaimedJob } from '@/lib/jobs/types';
import { indiaDate } from '@/lib/time/india';
import { TUTOR_PARENT_REPORT_JOB, addDays, enqueueWeeklyReports, mondayOf, parentReportHandler, type ReportDeps } from '@/lib/family/parent-report';

// W16-B3 (the proposal's M9): 1,000 guardian accounts, each with one child who asked the tutor once last week, on the
// PGlite harness. The Sunday enqueue makes 1,000 tutor.parent_report jobs; running them writes 1,000 reports (each one
// the source of the family's "This week with" feed item) and queues 1,000 email.send jobs; the email jobs run with a
// stand-in sender, so nothing is sent to any real address (every address is @example.invalid). The time is printed and
// held under BULK_LIMIT_MS. No provider is set, so every report is the rules-only one: the AI's own time is not measured.

const N = 1000;
const BULK_LIMIT_MS = 120_000;
const WEEK = addDays(mondayOf(indiaDate()), -7);
const acc = (i: number) => `fb3b0000-0000-4000-8000-${String(i).padStart(12, '0')}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-parent-report-bulk-0123456789';
  await db.pg.exec(`
    insert into family.accounts (account_id, email, ui_language)
      select ('fb3b0000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'guardian' || i || '@example.invalid', case when i % 3 = 0 then 'hi' else 'en' end from generate_series(1, ${N}) i;
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code)
      select ('fb3c0000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, ('fb3b0000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'Child', 6, 'CBSE', 'en', 'en', 'IN-HR' from generate_series(1, ${N}) i;
    insert into family.tutor_conversations (conversation_id, account_id, child_id, subject)
      select ('fb3d0000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, ('fb3b0000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, ('fb3c0000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'science' from generate_series(1, ${N}) i;
    insert into family.tutor_messages (conversation_id, account_id, child_id, role, body, chapter_key, created_at)
      select ('fb3d0000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, ('fb3b0000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, ('fb3c0000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
             'child', 'A made-up question', 'nc.showcase.water-cycle', '${addDays(WEEK, 2)}T10:00:00+05:30'::timestamptz from generate_series(1, ${N}) i;
  `);
}, 180_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe(`${N} guardians, one weekly run`, () => {
  it(`writes ${N} reports and feed items and queues ${N} emails, sent only to a stand-in, in time`, async () => {
    const { withFamilyContext, withPlatformService } = await import('@/lib/auth/db');
    const { latestReportFor } = await import('@/lib/family/parent-report');
    const queue = createPgJobQueue(withPlatformService as never);
    const deps: ReportDeps = { platform: withPlatformService, queue };
    const started = Date.now();

    expect(await enqueueWeeklyReports(deps, WEEK)).toBe(N);
    const handler = parentReportHandler(deps);
    const jobs: ClaimedJob[] = [];
    for (;;) {
      const batch = await queue.claim(200, undefined, { only: [TUTOR_PARENT_REPORT_JOB] });
      if (!batch.length) break;
      jobs.push(...batch);
    }
    expect(jobs).toHaveLength(N);
    for (const job of jobs) {
      const out = await handler(job);
      await queue.succeed(job, out.redact);
    }
    const reportsAt = Date.now();

    const sent: EmailMessage[] = [];
    const mail = emailSendHandler({ sender: () => ({ send: async (m) => (sent.push(m), { providerId: `stand-in-${sent.length}` }) }), platform: withPlatformService as never });
    for (;;) {
      const batch = await queue.claim(200, undefined, { only: ['email.send'] });
      if (!batch.length) break;
      for (const job of batch) await queue.succeed(job, ((await mail(job)) ?? {}).redact);
    }
    const ms = Date.now() - started;
    console.info(`[W16-B3 bulk] ${N} guardians: reports in ${reportsAt - started} ms, with the ${sent.length} stand-in emails ${ms} ms in all (limit ${BULK_LIMIT_MS} ms)`);

    expect((await q(`select count(*)::int as n, count(distinct account_id)::int as accounts from family.parent_reports where week_start = $1::date`, [WEEK]))[0]).toEqual({ n: N, accounts: N });
    expect((await q(`select count(*)::int as n from family.parent_reports where body ->> 'source' = 'rules' and jsonb_array_length(body -> 'sentences') = 4`))[0].n).toBe(N);
    // The feed's source, for every account (the same rows readNotifications reads), and the feed item itself for a few.
    expect((await q(`select count(*)::int as n from family.parent_reports where created_at > now() - interval '7 days'`))[0].n).toBe(N);
    for (const i of [1, 500, N]) expect(await withFamilyContext({ accountId: acc(i), tokenVersion: 0 }, (c) => latestReportFor(c, acc(i), `fb3c0000-0000-4000-8000-${String(i).padStart(12, '0')}`))).toEqual({ weekStart: WEEK });
    expect((await q(`select count(*)::int as n, count(*) filter (where status = 'succeeded')::int as done from jobs where type = 'email.send' and payload ->> 'template' = 'family_weekly_report'`))[0]).toEqual({ n: N, done: N });
    expect(sent).toHaveLength(N);
    expect(sent.every((m) => m.to.length === 1 && m.to[0].endsWith('@example.invalid'))).toBe(true);
    expect(new Set(sent.map((m) => m.to[0])).size).toBe(N);
    expect(ms).toBeLessThan(BULK_LIMIT_MS);
  }, BULK_LIMIT_MS + 60_000);
});
