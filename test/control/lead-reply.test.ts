import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// W12-F: the first reply to every new lead, on real Postgres (PGlite): the leads migrations and this slice's
// migration applied verbatim, then the website intake route, the email job with a stand-in email service, and
// Control's reply and switch routes. Each helper runs as the same role as in production. Every school, person and
// address here is made up.

const h = vi.hoisted(() => ({ db: null as unknown as import('../db/pglite-harness').TestDb, kicked: [] as string[] }));

vi.mock('@/lib/auth/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/db')>();
  return {
    ...real,
    withTenantContext: (claims: never, fn: (db: unknown) => Promise<unknown>) => h.db.tenant(claims, fn as never),
    withBackendConnection: (fn: (db: unknown) => Promise<unknown>) => h.db.asRole('app_backend', {}, fn as never),
    withPlatformService: (fn: (db: unknown) => Promise<unknown>) => h.db.platform(fn as never),
  };
});
vi.mock('@/lib/jobs/handlers', () => ({ kickJobs: async (keys: string[]) => void h.kicked.push(...keys) }));

import { createTestDb } from '../db/pglite-harness';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { POST as submit } from '@/app/api/public/leads/route';
import { GET as repliesRoute, POST as replyRoute } from '@/app/api/control/leads/reply/route';
import { GET as autoGet, PATCH as autoPatch } from '@/app/api/control/leads/auto-reply/route';
import { FIRST_REPLY_DELAY_MS, LEAD_REPLY_JOB, leadReplyHandler } from '@/lib/leads/reply';
import { WHAT_WE_DO, renderEmail } from '@/lib/email/templates';
import type { EmailMessage } from '@/lib/email/sender';
import type { ClaimedJob } from '@/lib/jobs/types';

const ROOT = path.resolve(__dirname, '../..');
const MIGRATIONS = [
  '20260925061202_leads_table.sql',
  '20260925090000_leads_sources_contact_callback_pilot.sql',
  '20260927100000_leads_quote_source_preferred_contact.sql',
  '20260927200000_leads_free_tools_source.sql',
  '20261028134900_leads_contact_notes_import.sql',
];
const W12F = '20261031121203_w12_f_lead_replies.sql';
// control.settings comes from the Family app's migration, which needs far more than this small database has: the
// table alone, exactly as 20261021094627_m1_family_content_control.sql creates it, with its platform-role grant.
const CONTROL_SETTINGS = `
  create schema control;
  grant usage on schema control to nca_super;
  create table control.settings (
    key text primary key check (key ~ '^[a-z][a-z0-9_.]{2,79}$'),
    value jsonb not null,
    updated_at timestamptz not null default now(),
    updated_by uuid
  );
  alter table control.settings enable row level security;
  alter table control.settings force row level security;
  grant select, insert, update on control.settings to nca_super;`;
const FOUNDER = randomUUID();
const PRINCIPAL = randomUUID();
const SCHOOL = randomUUID();
let founder = '';
let principal = '';
let n = 0;

function req(pathname: string, init: { method?: string; body?: string; cookie?: string } = {}): NextRequest {
  return new NextRequest(`https://www.netcyberai.test${pathname}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    body: init.body,
    headers: { 'content-type': 'application/json', ...(init.cookie ? { cookie: init.cookie } : {}) },
  });
}
async function cookieFor(sub: string, role: string, schoolId: string | null) {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal: role === 'super_admin' ? 'aal2' : 'aal1', sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
const q = async (sql: string, params: unknown[] = []) => (await h.db.platform((db) => db.query(sql, params))).rows;

// A new lead each call: its own number and address, so neither the burst limit nor the duplicate check applies.
async function newLead(over: Record<string, unknown> = {}): Promise<string> {
  n += 1;
  const res = await submit(
    req('/api/public/leads', {
      body: JSON.stringify({
        source: 'book_demo',
        schoolName: `Made-up School ${n}`,
        contactName: 'Asha Example',
        contactPhone: `98765 ${String(40000 + n)}`,
        contactEmail: `office${n}@made-up-school.test`,
        ...over,
      }),
    })
  );
  expect(res.status).toBe(201);
  return (await res.json()).leadId as string;
}

const firstReplyJobs = (leadId: string) => q(`select job_id, type, payload, idempotency_key, next_run_at, created_at from jobs where idempotency_key = $1`, [`${LEAD_REPLY_JOB}:first_reply:${leadId}`]);

// The job as the runner claims it, run by the real handler with a stand-in email service.
async function runJob(row: Record<string, unknown>, sent: EmailMessage[]) {
  const handler = leadReplyHandler({
    sender: () => ({ send: async (m: EmailMessage) => (sent.push(m), { providerId: `msg-${m.idempotencyKey}` }) }),
    platform: (fn) => h.db.platform(fn),
  });
  const job: ClaimedJob = { jobId: row.job_id as string, type: row.type as string, payload: row.payload as Record<string, unknown>, attempts: 1, maxAttempts: 4, schoolId: null, idempotencyKey: row.idempotency_key as string };
  return handler(job);
}

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-lead-reply-tests-0123456789';
  h.db = await createTestDb();
  for (const f of MIGRATIONS) await h.db.pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
  await h.db.pg.exec(CONTROL_SETTINGS);
  await h.db.pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', W12F), 'utf8'));
  await h.db.platform(async (db) => {
    await db.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'Made-up School', 'IN-HR')`, [SCHOOL]);
    await db.query(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Farid Founder'), ($2, $3, 'principal', 'Priya Principal')`, [FOUNDER, PRINCIPAL, SCHOOL]);
  });
  founder = await cookieFor(FOUNDER, 'super_admin', null);
  principal = await cookieFor(PRINCIPAL, 'principal', SCHOOL);
}, 60000);

describe('the automatic first reply', () => {
  it('a new lead gets exactly one first reply, two minutes after the receipt; once sent: one row, and the lead is contacted', async () => {
    const leadId = await newLead();
    const jobs = await firstReplyJobs(leadId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].type).toBe(LEAD_REPLY_JOB);
    expect(jobs[0].payload).toEqual({ leadId, kind: 'first_reply' });
    const wait = new Date(jobs[0].next_run_at).getTime() - new Date(jobs[0].created_at).getTime();
    expect(wait).toBeGreaterThan(FIRST_REPLY_DELAY_MS - 10_000);
    expect(wait).toBeLessThan(FIRST_REPLY_DELAY_MS + 10_000);
    expect(await q(`select 1 from jobs where idempotency_key = $1`, [`email.send:lead_received:${leadId}`])).toHaveLength(1);

    const sent: EmailMessage[] = [];
    await runJob(jobs[0], sent);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual([`office${n}@made-up-school.test`]);
    expect(sent[0].subject).toBe(`Next steps for Made-up School ${n}`);
    expect(sent[0].text).toContain('https://wa.me/');
    expect(sent[0].text).not.toContain('हिंदी');
    const replies = await q(`select kind, channel, "by", provider_id, body from lead_replies where lead_id = $1`, [leadId]);
    expect(replies).toEqual([{ kind: 'first_reply', channel: 'email', by: null, provider_id: `msg-${LEAD_REPLY_JOB}:first_reply:${leadId}`, body: sent[0].text }]);
    const [lead] = await q(`select status, status_changed_at from leads where lead_id = $1`, [leadId]);
    expect(lead.status).toBe('contacted');
    expect(lead.status_changed_at).not.toBeNull();

    // The job running again sends nothing more and records nothing more.
    await runJob(jobs[0], sent);
    expect(sent).toHaveLength(1);
    expect(await q(`select 1 from lead_replies where lead_id = $1`, [leadId])).toHaveLength(1);

    // Control shows it.
    const list = await repliesRoute(req(`/api/control/leads/reply?leadId=${leadId}`, { cookie: founder }));
    expect(list.status).toBe(200);
    const body = await list.json();
    expect(body.replies).toHaveLength(1);
    expect(body.replies[0]).toMatchObject({ kind: 'first_reply', channel: 'email', body: sent[0].text });
  });

  it('a lead already contacted (or later) gets none', async () => {
    const leadId = await newLead();
    await q(`update leads set status = 'contacted', status_changed_at = now() where lead_id = $1`, [leadId]);
    const sent: EmailMessage[] = [];
    await runJob((await firstReplyJobs(leadId))[0], sent);
    expect(sent).toHaveLength(0);
    expect(await q(`select 1 from lead_replies where lead_id = $1`, [leadId])).toHaveLength(0);
  });

  it('a lead the founder already replied to gets none', async () => {
    const leadId = await newLead();
    await q(`insert into lead_replies (lead_id, kind, body, "by") values ($1, 'manual', 'Hello, a made-up reply.', $2)`, [leadId, FOUNDER]);
    const sent: EmailMessage[] = [];
    await runJob((await firstReplyJobs(leadId))[0], sent);
    expect(sent).toHaveLength(0);
    expect(await q(`select kind from lead_replies where lead_id = $1`, [leadId])).toEqual([{ kind: 'manual' }]);
  });

  it('the switch off queues none, is audited, and on again queues as before', async () => {
    expect(await (await autoGet(req('/api/control/leads/auto-reply', { cookie: founder }))).json()).toEqual({ on: true });
    expect((await autoPatch(req('/api/control/leads/auto-reply', { method: 'PATCH', body: JSON.stringify({ on: false }), cookie: principal }))).status).toBe(403);
    const off = await autoPatch(req('/api/control/leads/auto-reply', { method: 'PATCH', body: JSON.stringify({ on: false }), cookie: founder }));
    expect(await off.json()).toEqual({ on: false });
    const [audit] = await q(`select actor_user_id, before_state, after_state from audit_log where event_action = 'leads.auto_reply_changed' order by audit_id desc limit 1`);
    expect(audit).toEqual({ actor_user_id: FOUNDER, before_state: { key: 'leads.auto_reply', value: 'on' }, after_state: { key: 'leads.auto_reply', value: 'off' } });

    const quiet = await newLead();
    expect(await firstReplyJobs(quiet)).toHaveLength(0);
    expect(await q(`select 1 from jobs where idempotency_key = $1`, [`email.send:lead_received:${quiet}`])).toHaveLength(1);

    await autoPatch(req('/api/control/leads/auto-reply', { method: 'PATCH', body: JSON.stringify({ on: true }), cookie: founder }));
    expect(await firstReplyJobs(await newLead())).toHaveLength(1);
  });

  it('switched off after it was queued, it is not sent', async () => {
    const leadId = await newLead();
    await q(`update control.settings set value = '"off"'::jsonb where key = 'leads.auto_reply'`);
    const sent: EmailMessage[] = [];
    await runJob((await firstReplyJobs(leadId))[0], sent);
    expect(sent).toHaveLength(0);
    await q(`update control.settings set value = '"on"'::jsonb where key = 'leads.auto_reply'`);
  });

  it('a repeat request (duplicate) gets no first reply', async () => {
    const leadId = await newLead({ contactEmail: 'repeat@made-up-school.test', contactPhone: '98111 22233' });
    const repeat = await submit(req('/api/public/leads', { body: JSON.stringify({ source: 'contact', schoolName: 'Repeat School', contactName: 'Asha Example', contactPhone: '98111 22233', contactEmail: 'repeat@made-up-school.test' }) }));
    const { leadId: second, isDuplicate } = await repeat.json();
    expect(isDuplicate).toBe(true);
    expect(await firstReplyJobs(leadId)).toHaveLength(1);
    expect(await firstReplyJobs(second)).toHaveLength(0);
  });

  it('adds the Hindi line when the requirements are written in Devanagari', async () => {
    const leadId = await newLead({ requirements: 'हमें फीस और हाज़िरी के लिए मदद चाहिए' });
    const sent: EmailMessage[] = [];
    await runJob((await firstReplyJobs(leadId))[0], sent);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain('आप चाहें तो हिंदी में जवाब दें, हम हिंदी में बात कर सकते हैं।');
    expect(sent[0].html).toContain('lang="hi"');
  });
});

describe('a reply by email from Control', () => {
  it('is refused for a principal, and queued, sent and recorded as manual for NetCyberAI staff', async () => {
    const leadId = await newLead();
    const words = 'Hello Asha,\n\nThank you. Shall we speak on Monday?\n\nFarid';
    expect((await replyRoute(req('/api/control/leads/reply', { body: JSON.stringify({ leadId, body: words }), cookie: principal }))).status).toBe(403);
    expect((await repliesRoute(req(`/api/control/leads/reply?leadId=${leadId}`, { cookie: principal }))).status).toBe(403);
    expect(await q(`select 1 from jobs where type = $1 and payload->>'kind' = 'manual' and payload->>'leadId' = $2`, [LEAD_REPLY_JOB, leadId])).toHaveLength(0);

    expect((await replyRoute(req('/api/control/leads/reply', { body: JSON.stringify({ leadId, body: '  ' }), cookie: founder }))).status).toBe(400);
    expect((await replyRoute(req('/api/control/leads/reply', { body: JSON.stringify({ leadId, body: 'x'.repeat(4001) }), cookie: founder }))).status).toBe(400);
    const ok = await replyRoute(req('/api/control/leads/reply', { body: JSON.stringify({ leadId, body: words }), cookie: founder }));
    expect(ok.status).toBe(202);
    const [job] = await q(`select job_id, type, payload, idempotency_key from jobs where type = $1 and payload->>'kind' = 'manual' and payload->>'leadId' = $2`, [LEAD_REPLY_JOB, leadId]);
    expect(h.kicked).toContain(job.idempotency_key);
    const [audit] = await q(`select target_id, after_state from audit_log where event_action = 'lead.reply_queued' order by audit_id desc limit 1`);
    expect(audit).toEqual({ target_id: leadId, after_state: { channel: 'email', kind: 'manual' } });

    const sent: EmailMessage[] = [];
    const outcome = await runJob(job, sent);
    expect(outcome).toEqual({ redact: ['body'] });
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe(words);
    expect(sent[0].subject).toBe(`Re: your request for Made-up School ${n}`);
    expect(await q(`select kind, "by", body from lead_replies where lead_id = $1`, [leadId])).toEqual([{ kind: 'manual', by: FOUNDER, body: words }]);
    expect((await q(`select status from leads where lead_id = $1`, [leadId]))[0].status).toBe('contacted');

    // The first reply, due two minutes later, then sees the founder's reply and stays unsent.
    await runJob((await firstReplyJobs(leadId))[0], sent);
    expect(sent).toHaveLength(1);
  });
});

describe('the first reply text', () => {
  it('names the school, signs with the founder, escapes what the form sent, and keeps the catalogue sentence', () => {
    const e = renderEmail('lead_first_reply', { schoolName: '<b>School</b>', contactName: 'Asha', hindi: false });
    expect(e.subject).toBe('Next steps for <b>School</b>');
    expect(e.html).toContain('&lt;b&gt;School&lt;/b&gt;');
    expect(e.html).not.toContain('<b>School</b>');
    expect(e.text).toContain(WHAT_WE_DO);
    expect(e.text).toMatch(/Noor\nFounder, NetCyberAI$/);
    expect(readFileSync(path.join(ROOT, 'src/content/catalog.ts'), 'utf8')).toContain(WHAT_WE_DO);
  });

  it('check_claims.py passes on the templates', () => {
    expect(() => execFileSync('python3', [path.join(ROOT, 'scripts/check_claims.py'), path.join(ROOT, 'src/lib/email/templates.ts')], { stdio: 'pipe' })).not.toThrow();
  });
});
