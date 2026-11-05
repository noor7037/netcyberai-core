import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// W21-M6: the seven Control pages made to act, on the real schema (PGlite). Only the connection is replaced: the
// routes' own transaction helpers run on the test database as the platform role. Audit filters and the CSV export
// (no personal value leaks), the analytics numbers for a fixture, a data request marked done with its audit row, a
// setting saved and a bad value refused, an email template edited with its audit row and used by the sender, a held
// WhatsApp message released, and a non-super-admin refused on every route. Made-up people and schools only.

const h = vi.hoisted(() => ({ db: null as unknown as { pg: { transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>; query: (sql: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }; stop: () => Promise<void> } }));

vi.mock('@/lib/auth/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/db')>();
  const run = (fn: (db: unknown) => Promise<unknown>) =>
    h.db.pg.transaction(async (tx) => {
      await (tx as { query: (s: string) => Promise<unknown> }).query('set local role nca_super');
      return fn(tx);
    });
  // The backend's own connection (sessions) has no role switch: the test database's owner stands in for it.
  const backend = (fn: (db: unknown) => Promise<unknown>) => h.db.pg.transaction((tx) => fn(tx));
  return { ...real, withPlatformService: run, withTenantContext: (_c: unknown, fn: (db: unknown) => Promise<unknown>) => run(fn), withBackendConnection: backend };
});

// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { writeAuditLog } from '@/lib/audit/log';
import { emailSendHandler } from '@/lib/jobs/email-handler';
import * as auditRoute from '@/app/api/control/audit-logs/route';
import * as analyticsRoute from '@/app/api/control/analytics/route';
import * as complianceRoute from '@/app/api/control/compliance/route';
import * as integrationsRoute from '@/app/api/control/integrations/route';
import * as settingsRoute from '@/app/api/control/system-settings/route';
import * as emailRoute from '@/app/api/control/templates/email/route';
import * as waRoute from '@/app/api/control/whatsapp/schools/route';

const FOUNDER = randomUUID();
const PRINCIPAL = randomUUID();
const A = randomUUID(); // a live school, out of pilot
const P = randomUUID(); // a live school still in pilot
const F = randomUUID(); // a tagged test school
const STUDENT = randomUUID();
const DAY = '2026-01-10'; // a day no harness seed touches
const q = async (sql: string, params: unknown[] = []) => (await h.db.pg.query(sql, params)).rows;
const asPlatform = <T>(fn: (db: never) => Promise<T>) =>
  h.db.pg.transaction(async (raw) => {
    const tx = raw as { query: (s: string) => Promise<unknown> };
    await tx.query('set local role nca_super');
    return fn(tx as never);
  });

let founder = '';
let principal = '';
async function cookieFor(sub: string, role: string, schoolId: string | null) {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal: role === 'super_admin' ? 'aal2' : 'aal1', sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
type Handler = (req: NextRequest) => Promise<Response>;
async function call(handler: Handler, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const cookie = opts.cookie ?? founder;
  const req = new NextRequest(`https://www.netcyberai.test${path}`, {
    method: opts.body === undefined ? 'GET' : 'POST',
    headers: { ...(cookie ? { cookie } : {}), ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  });
  const res = await handler(req);
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, text, body: json as Record<string, any>, headers: res.headers };
}
const auditRows = (action: string) => q(`select school_id, actor_user_id, target_id, before_state, after_state from audit_log where event_action = $1 order by audit_id`, [action]);

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-w21-m6-tests-0123456789abc';
  h.db = await startHarnessDb({ port: 0 });
  await q(
    `insert into schools (school_id, name, jurisdiction, is_pilot, is_test_fixture) values
       ($1, 'Made-up School Alpha', 'IN-HR', false, false), ($2, 'Made-up School Pilot', 'IN-HR', true, false), ($3, 'Made-up Test School', 'IN-DL', false, true)`,
    [A, P, F]
  );
  await q(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Farid Founder'), ($2, $3, 'principal', 'Priya Principal')`, [FOUNDER, PRINCIPAL, A]);
  await q(`insert into students (student_id, school_id, admission_no, name, status) values ($1, $2, 'M6-1', 'Made-up Child', 'active')`, [STUDENT, A]);
  founder = await cookieFor(FOUNDER, 'super_admin', null);
  principal = await cookieFor(PRINCIPAL, 'principal', A);
}, 120_000);
afterAll(async () => {
  await h.db?.stop();
});

describe('a non-super-admin is refused everywhere', () => {
  it('401 with no session and 403 for a principal, on every new route and action', async () => {
    const routes: [Handler, string, unknown?][] = [
      [auditRoute.GET, '/api/control/audit-logs?format=csv'],
      [auditRoute.GET, '/api/control/audit-logs?id=1'],
      [analyticsRoute.GET, '/api/control/analytics'],
      [complianceRoute.GET, '/api/control/compliance'],
      [complianceRoute.POST, '/api/control/compliance', { action: 'done', requestId: randomUUID(), note: 'done here' }],
      [integrationsRoute.GET, '/api/control/integrations'],
      [settingsRoute.GET, '/api/control/system-settings'],
      [settingsRoute.POST, '/api/control/system-settings', { key: 'leads.auto_reply', value: false, reason: 'a reason' }],
      [emailRoute.GET, '/api/control/templates/email'],
      [emailRoute.POST, '/api/control/templates/email', { action: 'save', template: 'lead_received', subject: 's', body: 'b', reason: 'a reason' }],
      [waRoute.GET, '/api/control/whatsapp/schools'],
      [waRoute.POST, '/api/control/whatsapp/schools', { action: 'release', logId: randomUUID(), reason: 'a reason' }],
    ];
    for (const [handler, path, body] of routes) {
      expect((await call(handler, path, { body, cookie: '' })).status, path).toBe(401);
      expect((await call(handler, path, { body, cookie: principal })).status, path).toBe(403);
    }
    expect(await auditRows('control.setting_changed')).toEqual([]);
  });
});

describe('Audit logs: filters, detail and export', () => {
  beforeAll(async () => {
    await asPlatform(async (db) => {
      await writeAuditLog(db, { schoolId: A, actorUserId: PRINCIPAL, actorRole: 'principal', eventAction: 'm6.student.updated', targetType: 'students', targetId: STUDENT, beforeState: { name: 'Old Made-up Name', class: 6 }, afterState: { name: 'New Made-up Name', class: 7 } });
      await writeAuditLog(db, { schoolId: null, actorUserId: FOUNDER, actorRole: 'super_admin', eventAction: 'm6.platform.thing', targetType: 'x', targetId: 'y', afterState: { ok: true } });
    });
  });

  it('narrows by who (part of the name) and by the start of the action', async () => {
    const byActor = await call(auditRoute.GET, '/api/control/audit-logs?actor=priya&action=m6.');
    expect(byActor.status).toBe(200);
    expect(byActor.body.rows.map((r: { action: string }) => r.action)).toEqual(['m6.student.updated']);
    const byPrefix = await call(auditRoute.GET, '/api/control/audit-logs?action=m6.');
    expect(byPrefix.body.rows.map((r: { action: string }) => r.action).sort()).toEqual(['m6.platform.thing', 'm6.student.updated']);
    expect((await call(auditRoute.GET, `/api/control/audit-logs?actor=${'x'.repeat(81)}`)).status).toBe(400);
  });

  it('the list and the detail hide a personal value, and the detail shows the before state the same way', async () => {
    const list = await call(auditRoute.GET, '/api/control/audit-logs?action=m6.student');
    expect(list.text).not.toContain('Made-up Name');
    expect(list.body.rows[0].afterPreview).toBe('{"name":"•••","class":7}');
    const id = list.body.rows[0].id as string;
    const detail = await call(auditRoute.GET, `/api/control/audit-logs?id=${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.row).toMatchObject({ action: 'm6.student.updated', actorName: 'Priya Principal', actorRole: 'principal', schoolName: 'Made-up School Alpha', before: { preview: '{"name":"•••","class":6}', keysOnly: false } });
    expect(detail.text).not.toContain('Made-up Name');
    expect((await call(auditRoute.GET, '/api/control/audit-logs?id=999999999')).status).toBe(404);
    expect((await call(auditRoute.GET, '/api/control/audit-logs?id=abc')).status).toBe(404);
  });

  it('the CSV holds the filtered rows only, with no state at all', async () => {
    const res = await call(auditRoute.GET, '/api/control/audit-logs?action=m6.&format=csv');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const lines = res.text.trim().split('\r\n');
    expect(lines[0]).toBe('audit_id,occurred_at,action,actor,actor_role,school,target_type,target_id');
    expect(lines).toHaveLength(3);
    expect(res.text).toContain('m6.student.updated');
    expect(res.text).toContain('platform');
    expect(res.text).not.toContain('Made-up Name');
    expect(res.text).not.toContain('class');
  });
});

describe('Analytics: the numbers for a fixture', () => {
  it('counts schools, active people, Family, AI by day and WhatsApp by day, never a test school', async () => {
    const before = (await call(analyticsRoute.GET, `/api/control/analytics?from=${DAY}&to=${DAY}`)).body;
    const ACCOUNT = randomUUID();
    await q(`insert into sessions (user_id, refresh_token_hash, token_version_snapshot, expires_at, last_used_at) values ($1, $2, 0, now() + interval '1 day', now() - interval '10 days')`, [PRINCIPAL, `m6-${randomUUID()}`]);
    await q(`insert into family.accounts (account_id, email) values ($1, 'm6-family@example.org')`, [ACCOUNT]);
    await q(`insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ($1, $2, 'Madeup', 6, 'CBSE', 'en', 'en', 'IN-HR')`, [randomUUID(), ACCOUNT]);
    for (const [outcome, usd] of [['ok', 0.25], ['ok', 0.5], ['ok', null], ['upstream_timeout', null]] as const)
      await q(`insert into control.ai_usage_ledger (day, profile_id, provider_id, model, route_position, outcome, cost_usd) values ($1, 'family.resolver', 'anthropic', 'm', 0, $2, $3)`, [DAY, outcome, usd]);
    const at = `${DAY} 06:00:00+00`;
    await q(`insert into communication_log (school_id, channel, status, created_at) values ($1, 'whatsapp', 'sent', $3), ($1, 'whatsapp', 'delivered', $3), ($1, 'whatsapp', 'failed', $3), ($1, 'whatsapp', 'blocked_budget', $3), ($2, 'whatsapp', 'sent', $3), ($2, 'whatsapp', 'sent', $3)`, [A, F, at]);

    const res = await call(analyticsRoute.GET, `/api/control/analytics?from=${DAY}&to=${DAY}`);
    expect(res.status).toBe(200);
    const a = res.body;
    expect(a.range).toEqual({ from: DAY, to: DAY });
    expect(a.activeUsers.days30 - before.activeUsers.days30).toBe(1);
    expect(a.activeUsers.days7 - before.activeUsers.days7).toBe(0);
    expect(a.family.accounts - before.family.accounts).toBe(1);
    expect(a.family.children - before.family.children).toBe(1);
    expect(a.aiByDay).toEqual([{ day: DAY, requests: 4, failures: 1, costUsd: 0.75, unpriced: 1 }]);
    expect(a.whatsappByDay).toEqual([{ day: DAY, sent: 2, failed: 1, stopped: 1 }]);
    const stage = (x: Record<string, any>) => (x.schoolsByStage as { stage: string; count: number }[]).find((s) => s.stage === 'tenant_created')?.count ?? 0;
    expect(stage(a)).toBeGreaterThanOrEqual(2); // Alpha and Pilot; the test school is counted apart
    expect(a.testSchools).toBeGreaterThanOrEqual(1);

    const csv = await call(analyticsRoute.GET, `/api/control/analytics?from=${DAY}&to=${DAY}&format=csv`);
    expect(csv.text.split('\r\n')[0]).toBe('section,measure,day_or_range,value');
    expect(csv.text).toContain(`ai,cost_usd,${DAY},0.75`);
    expect(csv.text).toContain(`whatsapp,sent,${DAY},2`);
    expect((await call(analyticsRoute.GET, '/api/control/analytics?from=2026-02-01&to=2026-01-01')).status).toBe(400);
    expect((await call(analyticsRoute.GET, '/api/control/analytics?from=2024-01-01&to=2026-01-01')).status).toBe(400);
  });
});

describe('Compliance: the desk and a request marked done', () => {
  it('lists open requests with no requester, and closes an access request with a note and an audit row', async () => {
    const [ACCESS, DELETION] = [randomUUID(), randomUUID()];
    await q(
      `insert into data_subject_requests (request_id, school_id, student_id, request_type, requested_by_description, logged_by, created_at) values
         ($1, $3, $4, 'access', 'Made-up Mother, by phone', $5, now() - interval '5 days'), ($2, $3, $4, 'deletion', 'Made-up Father', $5, now())`,
      [ACCESS, DELETION, A, STUDENT, PRINCIPAL]
    );
    await q(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version, created_at) values ($1, $2, 'daily_pulse', true, 'school_attested', 'v1', now() - interval '1 day'), ($1, $2, 'daily_pulse', false, 'school_attested', 'v1', now())`, [A, STUDENT]);
    await q(`insert into jobs (type, idempotency_key, status, completed_at) values ('ai.upkeep', $1, 'succeeded', now())`, [`m6-${randomUUID()}`]);

    const desk = await call(complianceRoute.GET, '/api/control/compliance');
    expect(desk.status).toBe(200);
    expect(desk.text).not.toContain('Made-up Mother');
    const access = desk.body.requests.find((r: { requestId: string }) => r.requestId === ACCESS);
    expect(access).toMatchObject({ schoolName: 'Made-up School Alpha', type: 'access', status: 'logged', daysOpen: 5, closable: true });
    expect(desk.body.requests.find((r: { requestId: string }) => r.requestId === DELETION).closable).toBe(false);
    expect(desk.body.consent.find((c: { purpose: string }) => c.purpose === 'daily_pulse')).toMatchObject({ withdrawn: 1 });
    expect(desk.body.retention.find((r: { type: string }) => r.type === 'ai.upkeep').lastSucceededAt).not.toBeNull();

    expect((await call(complianceRoute.POST, '/api/control/compliance', { body: { action: 'done', requestId: ACCESS, note: 'x' } })).status).toBe(400);
    expect((await call(complianceRoute.POST, '/api/control/compliance', { body: { action: 'done', requestId: DELETION, note: 'the data was sent' } })).body.code).toBe('deletion_requires_execute');
    const done = await call(complianceRoute.POST, '/api/control/compliance', { body: { action: 'done', requestId: ACCESS, note: 'Copy of the record sent to the school office.' } });
    expect(done.status).toBe(200);
    const [row] = await q(`select status::text, notes from data_subject_requests where request_id = $1`, [ACCESS]);
    expect(row).toMatchObject({ status: 'completed', notes: 'NetCyberAI: Copy of the record sent to the school office.' });
    const audit = (await auditRows('dsr.status_updated')).filter((r) => r.target_id === ACCESS);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ school_id: A, actor_user_id: FOUNDER, before_state: { status: 'logged' }, after_state: { status: 'completed', by_platform: true } });
    expect((await call(complianceRoute.POST, '/api/control/compliance', { body: { action: 'done', requestId: ACCESS, note: 'again please' } })).body.code).toBe('closed');
  });
});

describe('System settings: saved inside the range, refused outside it', () => {
  it('saves a number and a switch with a reason, audited; refuses a bad value, an unlisted key and no reason', async () => {
    const save = (body: unknown) => call(settingsRoute.POST, '/api/control/system-settings', { body });
    expect((await save({ key: 'family.tutor.text_turns_per_day', value: 25, reason: 'Pilot families asked for more' })).status).toBe(200);
    expect((await save({ key: 'leads.auto_reply', value: false, reason: 'Founder replies by hand this week' })).status).toBe(200);
    const stored = await q(`select key, value from control.settings where key in ('family.tutor.text_turns_per_day', 'leads.auto_reply') order by key`);
    expect(stored).toEqual([{ key: 'family.tutor.text_turns_per_day', value: 25 }, { key: 'leads.auto_reply', value: 'off' }]);
    const audit = await auditRows('control.setting_changed');
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ school_id: null, actor_user_id: FOUNDER, target_id: 'family.tutor.text_turns_per_day', after_state: { key: 'family.tutor.text_turns_per_day', value: 25, change_reason: 'Pilot families asked for more' } });

    expect((await save({ key: 'family.tutor.text_turns_per_day', value: 10_001, reason: 'too many' })).body.code).toBe('bad_value');
    expect((await save({ key: 'family.tutor.text_turns_per_day', value: 2.5, reason: 'not whole' })).body.code).toBe('bad_value');
    expect((await save({ key: 'control.alert.ai_failure_share', value: 1.5, reason: 'over one' })).body.code).toBe('bad_value');
    expect((await save({ key: 'family.tutor.text_turns_per_day', value: '25', reason: 'a string' })).body.code).toBe('bad_value');
    expect((await save({ key: 'content.pilot_scope', value: 1, reason: 'a list setting' })).status).toBe(404);
    expect((await save({ key: 'family.tutor.text_turns_per_day', value: 30, reason: ' ' })).body.code).toBe('reason_required');
    expect(await auditRows('control.setting_changed')).toHaveLength(2);
    expect((await q(`select value from control.settings where key = 'family.tutor.text_turns_per_day'`))[0].value).toBe(25);

    const list = await call(settingsRoute.GET, '/api/control/system-settings');
    const row = list.body.settings.find((s: { key: string }) => s.key === 'family.tutor.text_turns_per_day');
    expect(row.edit).toEqual({ kind: 'number', min: 0, max: 10_000, whole: true, current: 25 });
    // A setting the platform's set-up wrote: the form starts from its stored value, with its range.
    expect(list.body.settings.find((s: { key: string }) => s.key === 'control.alert.queue_days')).toMatchObject({ value: '7', edit: { kind: 'number', min: 1, max: 365, current: 7 } });
  });
});

describe('Templates: an email template edited, previewed and used', () => {
  it('previews, saves with a reason (audited), is used by the sender, and goes back to the code’s words', async () => {
    const post = (body: unknown) => call(emailRoute.POST, '/api/control/templates/email', { body });
    const words = { template: 'lead_received', subject: 'Thank you, {contactName}', body: 'Hello {contactName},\n\nWe have your request for {schoolName}.' };
    const preview = await post({ action: 'preview', ...words });
    expect(preview.body.preview.subject).toBe('Thank you, [contactName]');
    expect(preview.body.preview.html).toContain('We have your request for [schoolName].');
    expect((await post({ action: 'save', ...words, body: 'Hi {parentPhone}', reason: 'unknown value' })).body.code).toBe('unknown_value');
    expect((await post({ action: 'save', ...words, template: 'application_code', reason: 'not editable' })).status).toBe(404);
    expect((await post({ action: 'save', ...words })).body.code).toBe('reason_required');
    expect((await post({ action: 'save', ...words, reason: 'Warmer first words' })).status).toBe(200);

    const audit = await auditRows('email.template_changed');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ school_id: null, actor_user_id: FOUNDER, target_id: 'email.template.lead_received', before_state: { template: 'lead_received', words: null }, after_state: { template: 'lead_received', words: { subject: 'Thank you, {contactName}', body_chars: words.body.length }, change_reason: 'Warmer first words' } });
    const list = await call(emailRoute.GET, '/api/control/templates/email');
    const row = list.body.templates.find((r: { template: string }) => r.template === 'lead_received');
    expect(row).toMatchObject({ editable: true, override: { subject: words.subject } });
    expect(row.defaultSubject).toBe('We received your request');
    expect(list.body.templates.find((r: { template: string }) => r.template === 'application_code')).toMatchObject({ editable: false, override: null });

    const sent: { subject: string; html: string; text: string }[] = [];
    const handler = emailSendHandler({ sender: () => ({ send: async (m: { subject: string; html: string; text: string }) => void sent.push(m) }) as never, platform: asPlatform as never });
    await handler({ payload: { to: ['someone@example.org'], template: 'lead_received', data: { schoolName: 'A <b>School</b>', contactName: 'Made-up Asha' } }, idempotencyKey: 'm6-email-1' } as never);
    expect(sent[0].subject).toBe('Thank you, Made-up Asha');
    expect(sent[0].html).toContain('We have your request for A &lt;b&gt;School&lt;/b&gt;.');

    expect((await post({ action: 'reset', template: 'lead_received', reason: 'Back to the standard words' })).status).toBe(200);
    expect(await auditRows('email.template_reset')).toHaveLength(1);
    await handler({ payload: { to: ['someone@example.org'], template: 'lead_received', data: { schoolName: 'S', contactName: 'C' } }, idempotencyKey: 'm6-email-2' } as never);
    expect(sent[1].subject).toBe('We received your request');
  });
});

describe('WhatsApp: per school, the held queue and a release', () => {
  it('shows the day per school, releases a held message where the gate allows, and refuses where it does not', async () => {
    const [READY, QUIET, PILOT] = [randomUUID(), randomUUID(), randomUUID()];
    await q(
      `insert into communication_log (log_id, school_id, channel, template_name, status, attempts, not_before, created_at) values
         ($1, $4, 'whatsapp', 'absence_alert', 'queued', 3, now() - interval '1 hour', now() - interval '2 hours'),
         ($2, $4, 'whatsapp', 'absence_alert', 'queued', 0, now() + interval '5 hours', now()),
         ($3, $5, 'whatsapp', 'absence_alert', 'queued', 0, now() - interval '1 hour', now() - interval '2 hours'),
         (gen_random_uuid(), $4, 'whatsapp', 'absence_alert', 'sent', 1, null, now()),
         (gen_random_uuid(), $4, 'whatsapp', 'absence_alert', 'failed', 1, null, now())`,
      [READY, QUIET, PILOT, A, P]
    );
    const view = await call(waRoute.GET, '/api/control/whatsapp/schools');
    expect(view.status).toBe(200);
    expect(view.body.schools.find((s: { schoolId: string }) => s.schoolId === A)).toMatchObject({ schoolName: 'Made-up School Alpha', number: null, status: 'platform_default', sentToday: 1, failedToday: 1, queued: 2 });
    const held = (id: string) => view.body.held.find((m: { logId: string }) => m.logId === id);
    expect(held(READY)).toMatchObject({ releasable: true, heldBy: null });
    expect(held(QUIET)).toMatchObject({ releasable: false, heldBy: 'quiet_hours' });
    expect(held(PILOT)).toMatchObject({ releasable: false, heldBy: 'pilot' });

    const release = (logId: string, reason = 'The job stopped after a network fault') => call(waRoute.POST, '/api/control/whatsapp/schools', { body: { action: 'release', logId, reason } });
    expect((await release(READY, '')).status).toBe(400);
    expect((await release(QUIET)).body.code).toBe('quiet_hours');
    expect((await release(PILOT)).body.code).toBe('pilot');
    expect((await release(randomUUID())).status).toBe(404);
    expect((await release(READY)).status).toBe(200);
    const jobs = await q(`select type, payload, school_id from jobs where payload->>'logId' = $1`, [READY]);
    expect(jobs).toEqual([{ type: 'whatsapp.send', payload: { logId: READY, attempt: 3 }, school_id: A }]);
    const audit = await auditRows('whatsapp.held_released');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ school_id: null, actor_user_id: FOUNDER, target_id: READY, after_state: { school_id: A, attempts: 3, change_reason: 'The job stopped after a network fault' } });
    expect(await q(`select 1 from jobs where payload->>'logId' = any($1::text[])`, [[QUIET, PILOT]])).toEqual([]);
  });
});

describe('Integrations: one table, no secret', () => {
  it('lists the platform WhatsApp, the email sender, the AI providers and Razorpay, with tests only where they exist', async () => {
    const res = await call(integrationsRoute.GET, '/api/control/integrations');
    expect(res.status).toBe(200);
    const rows = res.body.integrations as { id: string; kind: string; state: string; test: unknown; keyLast4: string | null }[];
    expect(rows.find((r) => r.id === 'whatsapp:platform')).toMatchObject({ state: 'not_set', test: null });
    expect(rows.find((r) => r.id === 'email')).toMatchObject({ kind: 'email', test: null });
    expect(rows.find((r) => r.id === 'payments:razorpay')).toMatchObject({ state: 'not_started', test: null });
    expect(rows.some((r) => r.kind === 'ai' || r.kind === 'video')).toBe(true);
    expect(res.text).not.toMatch(/ciphertext|api_key|apiKey|secret/i);
    for (const r of rows) if (r.keyLast4 !== null) expect(r.keyLast4).toHaveLength(4);
  });
});
