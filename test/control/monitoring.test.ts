import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// Control → Monitoring (docs/26 slice 8g, C206), on the whole real schema (every migration replayed on PGlite).
// The acceptance test: "A dead job, a refused notice, an uncertain send and a missed nightly run each appear on the
// page from seeded rows. The page shows no parent's name, number or message words."
// Every school, person, number, address and message below is made up.

// Only the connection is replaced: the health endpoint's own platform helper runs on the test database as nca_super.
const h = vi.hoisted(() => ({ platform: null as null | ((fn: (db: unknown) => Promise<unknown>) => Promise<unknown>) }));
vi.mock('@/lib/auth/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/db')>()),
  withBackendConnection: (fn: never) => h.platform!(fn),
  withPlatformService: (fn: never) => h.platform!(fn),
}));
// The Retry button asks the router to read the page again; there is no router in a test.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

import { GET as healthEndpoint } from '@/app/api/health/route';
import { LangProvider } from '@/components/app-shell/LangContext';
import { ageWords, MonitoringView } from '@/components/control/MonitoringView';
import { cutContacts, FAILED_JOBS_LISTED, invitationsWaiting, loadMonitoring, maskStaffEmail, MONITORING_DAYS, needsALook, type Monitoring } from '@/lib/control/monitoring';
import { feesNightlyHandler } from '@/lib/fees/nightly';
import { createPgJobQueue, retryDeadJob } from '@/lib/jobs/pg-queue';
import { runJobs } from '@/lib/jobs/runner';
import { BACKLOG_AFTER_MINUTES } from '@/lib/observability/health';
import { indiaDate } from '@/lib/time/india';
import { decideTemplate, recordMetaDecision } from '@/lib/whatsapp/templates';

describe('what may be shown of an error or a reason', () => {
  it('cuts an email address and anything that looks like a phone number, however it is written', () => {
    expect(cutContacts('Mailbox meenakshi.iyer@family.example rejected the message')).toBe('Mailbox <email> rejected the message');
    for (const number of ['9812345678', '+919812345678', '+91 98123 45678', '98123-45678', '919812345678', '+1 415 555 2671', '(022) 2345 6789', '022-2345-6789', '98 12 34 56 78', '98123 - 45678', '981/234/5678', '98123 / 45678', '(981) 234 - 5678']) {
      const cut = cutContacts(`Recipient ${number} is not reachable`)!;
      expect(cut, number).toMatch(/^Recipient <(phone|number)> is not reachable$/);
      expect(cut.replace(/\D/g, ''), number).toBe('');
    }
    // A provider's id for a message carries the number it went to.
    expect(cutContacts('status for wamid.HBgMOTE5ODEyMzQ1Njc4FQIAERgSN0Y5 was late')).toBe('status for <message id> was late');
    // A number inside other words goes too: cutting too much is the safe side.
    expect(cutContacts('Key (phone)=(9812345678) already exists')).toBe('Key (phone)=(<phone>) already exists');
    expect(cutContacts('to:919812345678;name')).not.toMatch(/\d{4}/);
    expect(cutContacts('dialled 0091 98123 45678 twice')).not.toMatch(/\d{5}/);
  });

  it('cuts what an error quotes, unless it is a name in code', () => {
    // An error that quotes what it choked on is quoting somebody's data: a name, or the start of a message.
    expect(cutContacts('invalid input syntax for type uuid: "Meenakshi Iyer"')).toBe('invalid input syntax for type uuid: "<value>"');
    expect(cutContacts(`Unexpected token 'K', "Kabir was absent, ple"... is not valid JSON`)).toBe(`Unexpected token '<value>', "<value>"... is not valid JSON`);
    expect(cutContacts('could not read “Kabir Iyer” as a date')).toBe('could not read “<value>” as a date');
    expect(cutContacts('could not parse "Kabir was absent: please bring the blue')).toBe('could not parse "<value>');
    // What code calls things stays, so the text still says what went wrong.
    expect(cutContacts('duplicate key value violates unique constraint "jobs_idempotency_key_key"')).toBe('duplicate key value violates unique constraint "jobs_idempotency_key_key"');
    expect(cutContacts('template "class_notice" is not an approved template for this school')).toBe('template "class_notice" is not an approved template for this school');
    const named = `consent for purpose ‘daily_pulse’, template \`fee_reminder\`, status 'blocked_consent', constraint “jobs_pkey”`;
    expect(cutContacts(named)).toBe(named);
    expect(cutContacts(`current time falls within this school's quiet hours (21:00:00-07:00:00 Asia/Kolkata)`)).toBe(`current time falls within this school's quiet hours (21:00:00-07:00:00 Asia/Kolkata)`);
  });

  it('a quoted value passes as a name in code only with an underscore in it: one small word is somebody’s name as easily', () => {
    expect(cutContacts('invalid input syntax for type uuid: "meenakshi"')).toBe('invalid input syntax for type uuid: "<value>"');
    expect(cutContacts('no such user "kabir.iyer"')).toBe('no such user "<value>"');
    expect(cutContacts('no such user "kabir-iyer" in list "a/b:c"')).toBe('no such user "<value>" in list "<value>"');
    expect(cutContacts('relation "parents" has no column "kabir"')).toBe('relation "<value>" has no column "<value>"');
    // An underscore at an end, two together, a capital, a digit first, or a name too long to be one: not how code names things.
    for (const value of ['_kabir', 'kabir_', 'kabir__iyer', 'Kabir_Iyer', '9_kabir', `${'a_'.repeat(45)}b`]) expect(cutContacts(`could not read "${value}"`), value).toBe('could not read "<value>"');
  });

  it('every kind of quotation mark is one: curly single marks, backticks, and a mark opened and never closed', () => {
    expect(cutContacts('could not read ‘Kabir Iyer’ as a date')).toBe('could not read ‘<value>’ as a date');
    expect(cutContacts('Invalid `to` field: `Meenakshi Iyer` is not a number')).toBe('Invalid `<value>` field: `<value>` is not a number');
    // An apostrophe inside a quoted value does not end it; an apostrophe in plain words opens nothing.
    expect(cutContacts(`could not read 'Kabir's blue notebook' as a date`)).toBe(`could not read '<value>' as a date`);
    expect(cutContacts('could not read ‘Kabir’s blue notebook’ as a date')).toBe('could not read ‘<value>’ as a date');
    expect(cutContacts('the school’s limit and the parents’ consent are the school’s own')).toBe('the school’s limit and the parents’ consent are the school’s own');
    expect(cutContacts(`the school's limit and the parents' consent`)).toBe(`the school's limit and the parents' consent`);
    // Left open: what follows is the rest of the value.
    expect(cutContacts('could not parse “Kabir was absent: please bring')).toBe('could not parse “<value>');
    expect(cutContacts('could not parse ‘Kabir’s notebook is')).toBe('could not parse ‘<value>');
    expect(cutContacts('could not parse `Kabir was absent')).toBe('could not parse `<value>');
    expect(cutContacts(`could not parse 'Kabir was absent`)).toBe(`could not parse '<value>`);
    expect(cutContacts('field `to` then `Kabir was absent')).toBe('field `<value>` then `<value>');
  });

  it('keeps what says which row, which day and how many', () => {
    expect(cutContacts('fees.nightly: 2 school(s) not done')).toBe('fees.nightly: 2 school(s) not done');
    expect(cutContacts('invitation 0b6f3c1e-91aa-4c07-8d55-3e1f0a2b7c4d not found')).toBe('invitation 0b6f3c1e-91aa-4c07-8d55-3e1f0a2b7c4d not found');
    expect(cutContacts('billing.nightly: that day has not begun in India (2026-10-13)')).toBe('billing.nightly: that day has not begun in India (2026-10-13)');
    expect(cutContacts('provider said 131026: message undeliverable, attempt 3 of 8')).toBe('provider said 131026: message undeliverable, attempt 3 of 8');
    // A date is kept only when it is one: a number written like a date is not.
    expect(cutContacts('call 2345-67-8912')).toBe('call <number>');
    expect(cutContacts('seen 2026-10-13-9812345678')).not.toMatch(/9812345678/);
  });

  it('shows the first line only, at most 200 characters, and nothing for nothing', () => {
    expect(cutContacts('first line\n    at stack (file.ts:1:1)\nMeenakshi')).toBe('first line');
    const long = cutContacts(`start ${'word '.repeat(80)}`)!;
    expect(long.length).toBeLessThanOrEqual(200);
    expect(long.endsWith('…')).toBe(true);
    expect(cutContacts(null)).toBeNull();
    expect(cutContacts(undefined)).toBeNull();
    expect(cutContacts('   ')).toBeNull();
  });
});

describe('how long, in words', () => {
  it('minutes, hours, then days, in both languages', () => {
    expect(ageWords('en', 12)).toBe('less than a minute');
    expect(ageWords('en', 60)).toBe('1 minute');
    expect(ageWords('en', 25 * 60)).toBe('25 minutes');
    expect(ageWords('en', 3 * 3600 + 59)).toBe('3 hours');
    expect(ageWords('en', 47 * 3600)).toBe('47 hours');
    expect(ageWords('en', 49 * 3600)).toBe('2 days');
    expect(ageWords('hi', 3600)).toBe('1 घंटा');
    expect(ageWords('hi', 5 * 86400)).toBe('5 दिन');
  });
});

const id = (n: number) => `c8a00000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [SUNRISE, HILLTOP, LATE_DUES, TEST_SCHOOL] = [id(1), id(2), id(3), id(4)];
const [PRINCIPAL, FOUNDER] = [id(11), id(12)];
const [KABIR, FARHAN, PUPIL_HILLTOP, PUPIL_LATE, PUPIL_TEST] = [id(21), id(22), id(23), id(24), id(25)];
const [MEENAKSHI, G_TEST] = [id(31), id(32)];
const NAMES = { sunrise: 'Sunrise Made-up School', hilltop: 'Hilltop Made-up School', lateDues: 'Late Dues Made-up School', test: 'Made-up Test School' };
// What must never be on the page or in the loader's answer: the family's names, numbers and addresses, the words
// of their messages, the sealed words of a held reply, and the provider's id (it carries the number).
const PHONE = '9812345678';
const PRIVATE = ['Meenakshi', 'Iyer', 'Kabir', 'Farhan', 'Qureshi', PHONE, '98123 45678', '9812345679', 'family.example', 'blue notebook', 'call the office', 'U0VBTEVELVdPUkRTLW9mLWEtcGFyZW50', 'wamid.', 'HBgMOTE5ODEyMzQ1Njc4', 'Kabir was absent'];
const STAFF_EMAIL = 'new.teacher@staff.example';
const STAFF_MASKED = 'n…@staff.example';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
// A school's own session: the app's role, with the school, role and person set, so row level security applies.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asPrincipal = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', SUNRISE], ['app.current_role', 'principal'], ['app.current_user_id', PRINCIPAL]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const read = () => platform((c) => loadMonitoring(c));
// The page as the Control shell draws it: the view inside the shell's language (the Retry button reads its words from it).
const page = (data: Monitoring, lang: 'en' | 'hi' = 'en', invitations: Awaited<ReturnType<typeof invitationsWaiting>> = []) =>
  renderToStaticMarkup(createElement(LangProvider, { lang, children: createElement(MonitoringView, { data, invitations, applications: { submitted: 2 }, lang }) }));
// The figure a fact tile shows.
const fact = (html: string, name: string) => new RegExp(`data-monitoring-fact="${name.replace('.', '\\.')}"[^>]*><dt[^>]*>[^<]*</dt><dd[^>]*>([^<]*)</dd>`).exec(html)?.[1];
const section = (html: string, name: string) => new RegExp(`data-monitoring-section="${name}" data-monitoring-state="(\\w+)"`).exec(html)?.[1];
const jobId = async (key: string) => (await db.pg.query(`select job_id from jobs where idempotency_key = $1`, [key])).rows[0].job_id as string;

const YESTERDAY = indiaDate(new Date(Date.now() - 86_400_000));
const TODAY = indiaDate(new Date());
// A day as the page writes it.
const dayWords = (day: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
const INDIA_YESTERDAY_SQL = `((now() at time zone 'Asia/Kolkata')::date - 1)`;
let n = 0;
// One message in the log as the gate and the delivery notices leave it: with the number, the family and the values.
const logged = (school: string, status: string, o: { ago?: string; code?: string; reason?: string; student?: string; parent?: string } = {}) =>
  db.pg.query(
    `insert into communication_log (school_id, to_phone, channel, template_name, billing_category, billable, est_cost_paise, gst_paise, cost_basis, status, dedupe_key, provider_used, purpose, provider, provider_message_id,
                                    student_id, parent_id, template_params, failure_code, reason, created_at)
     values ($1, $2, 'whatsapp', 'class_notice', 'utility', false, 0, 0, 'not_billable', $3, $4, 'platform_default', 'operational_communication', 'meta', $5, $6, $7, $8, $9, $10, now() - $11::interval)`,
    [school, `+91${PHONE}`, status, `monitoring-${++n}`, status === 'failed' && o.code ? `wamid.HBgMOTE5ODEyMzQ1Njc4-${n}` : null, o.student ?? null, o.parent ?? null,
     JSON.stringify({ guardian: 'Meenakshi Iyer', child: 'Kabir Iyer', note: 'Kabir was absent: please bring the blue notebook and call the office' }), o.code ?? null, o.reason ?? null, o.ago ?? '1 hour']
  );
const job = (type: string, key: string, status: string, extra: string, values: string) => db.pg.exec(`insert into jobs (type, idempotency_key, status, ${extra}) values ('${type}', '${key}', '${status}', ${values});`);

describe('on the real schema', () => {
  let templatesAtStart: Monitoring['templates'];
  // One version of a platform template, in one language, with our decision and Meta's.
  const template = (name: string, language: string, status: string, meta: string, version = 1) =>
    db.pg.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status, meta_status) values (null, $1, $5, $2, '{{school}}: made-up words for the monitoring test.', '{school}', 'utility', 60, $3::whatsapp_template_status, $4)`, [name, language, status, meta, version]);

  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    h.platform = platform as never;
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture) values
        ('${SUNRISE}', '${NAMES.sunrise}', 'IN-HR', false), ('${HILLTOP}', '${NAMES.hilltop}', 'IN-DL', false), ('${LATE_DUES}', '${NAMES.lateDues}', 'IN-UP', false), ('${TEST_SCHOOL}', '${NAMES.test}', 'IN-HR', true);
      insert into users (user_id, school_id, email, role, display_name) values ('${PRINCIPAL}', '${SUNRISE}', 'principal@sunrise.example', 'principal', 'Priya Principal'), ('${FOUNDER}', null, 'founder@netcyberai.example', 'super_admin', 'Made-up Founder');
      insert into students (student_id, school_id, admission_no, name, status) values
        ('${KABIR}', '${SUNRISE}', 'S-1', 'Kabir Iyer', 'active'), ('${FARHAN}', '${SUNRISE}', 'S-2', 'Farhan Qureshi', 'active'),
        ('${PUPIL_HILLTOP}', '${HILLTOP}', 'H-1', 'Farhan Qureshi', 'active'), ('${PUPIL_LATE}', '${LATE_DUES}', 'L-1', 'Kabir Iyer', 'active'), ('${PUPIL_TEST}', '${TEST_SCHOOL}', 'T-1', 'Kabir Iyer', 'active');
      insert into parents (parent_id, school_id, name, phone, email) values ('${MEENAKSHI}', '${SUNRISE}', 'Meenakshi Iyer', '${PHONE}', 'meenakshi.iyer@family.example'), ('${G_TEST}', '${TEST_SCHOOL}', 'Meenakshi Iyer', '9812345679', null);
    `);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('with nothing wrong, every count is zero and only the nightly work asks for a look (no scheduler has queued it here)', async () => {
    const m = await read();
    templatesAtStart = m.templates;
    expect(m.days).toBe(MONITORING_DAYS);
    expect(m.health).toEqual({ status: 'ok', jobs: 'ok', backlogAfterMinutes: BACKLOG_AFTER_MINUTES });
    expect(m.jobs).toEqual({ byType: [], dead: 0, stuck: 0, stuckLongestSeconds: null, retrying: 0, due: 0, oldestDueSeconds: null, lastDoneSeconds: null, failed: [] });
    expect(m.notices).toMatchObject({ received: 0, refused: 0, refusedByOutcome: [], lastSeconds: null });
    expect(m.sends).toEqual({ uncertain: { key: '', count: 0, schools: [], latestReason: null }, failed: [], held: [] });
    expect(m.replies).toMatchObject({ heldNow: 0, oldestHeldSeconds: null, pastTheirTime: 0, dropped: 0, delivered: 0 });
    expect(m.nightly).toEqual({ date: YESTERDAY, feesJob: { type: 'fees.nightly', state: 'not_queued', attempts: 0 }, billingJob: { type: 'billing.nightly', state: 'not_needed', attempts: 0 }, feeRunsExpected: 0, feeRunMissing: [], feeRunCaughtUp: [], runsWithProblems: [] });
    // No template of these tests is on record yet, and nothing a migration wrote stands in the way of a message.
    expect(m.templates.inTheWay).toEqual({ waitingForUs: 0, refusedByMeta: 0, pausedByMeta: 0 });
    expect(needsALook(m)).toEqual({ health: false, jobs: false, notices: false, sends: false, replies: false, nightly: true, templates: false });

    // The empty page teaches: each section says what it would show and what, if anything, to do.
    const html = page(m);
    expect(section(html, 'jobs')).toBe('clear');
    expect(section(html, 'sends')).toBe('clear');
    expect(section(html, 'nightly')).toBe('look');
    for (const words of ['No job is dead or waiting for another try.', 'No job has been queued yet', 'No notice has come in this time.', 'No message of a live school was uncertain, failed or held back in this time.', 'No live school had dues on record before that day, so no fee run was expected.', 'On a database with no scheduler, such as a test copy, this is expected.'])
      expect(html, words).toContain(words);
    expect(html).not.toContain('data-job-retry');
  });

  it('a dead job, a stuck job, a job waiting for another try and a late one each appear; a job set for later is not due', async () => {
    await job('email.send', 'dead-1', 'dead', 'attempts, max_attempts, last_error, completed_at, updated_at', `8, 8, 'Mailbox meenakshi.iyer@family.example rejected "Kabir was absent"; try +91 98123 45678', now() - interval '2 hours', now() - interval '2 hours'`);
    await job('whatsapp_send.deliver', 'stuck-1', 'running', 'attempts, locked_until, updated_at', `1, now() - interval '20 minutes', now() - interval '25 minutes'`);
    await job('email.send', 'retry-1', 'pending', 'attempts, next_run_at, last_error, updated_at', `2, now() + interval '5 minutes', 'timeout talking to the mail provider', now() - interval '3 minutes'`);
    await job('complaint.escalate', 'later-1', 'pending', 'next_run_at', `now() + interval '2 days'`);
    await job('email.send', 'done-1', 'succeeded', 'attempts, completed_at', `1, now() - interval '4 minutes'`);
    const dead = await jobId('dead-1');

    let m = await read();
    expect(m.jobs).toMatchObject({ dead: 1, stuck: 1, retrying: 1, due: 0, oldestDueSeconds: null });
    expect(m.jobs.stuckLongestSeconds).toBeGreaterThanOrEqual(20 * 60);
    expect(m.jobs.stuckLongestSeconds).toBeLessThan(21 * 60);
    expect(m.jobs.lastDoneSeconds).toBeGreaterThanOrEqual(4 * 60);
    expect(m.jobs.byType).toEqual([
      { type: 'complaint.escalate', counts: { pending: 1, running: 0, succeeded: 0, dead: 0 }, retrying: 0 },
      { type: 'email.send', counts: { pending: 1, running: 0, succeeded: 1, dead: 1 }, retrying: 1 },
      { type: 'whatsapp_send.deliver', counts: { pending: 0, running: 1, succeeded: 0, dead: 0 }, retrying: 0 },
    ]);
    // The dead job, then the one waiting for another try (which failed later), each error cut before it is shown.
    expect(m.jobs.failed.map((f) => [f.type, f.state, f.attempts, f.maxAttempts, f.error])).toEqual([
      ['email.send', 'dead', 8, 8, 'Mailbox <email> rejected "<value>"; try <phone>'],
      ['email.send', 'retrying', 2, 8, 'timeout talking to the mail provider'],
    ]);
    expect(m.jobs.failed.find((f) => f.state === 'dead')).toMatchObject({ jobId: dead });
    expect(m.jobs.failed.find((f) => f.state === 'dead')!.forSeconds).toBeGreaterThanOrEqual(2 * 3600);
    // Nothing is late yet, so the health check is still fine.
    expect(m.health.status).toBe('ok');
    expect(needsALook(m)).toMatchObject({ health: false, jobs: true });

    // A due job that has waited 25 minutes: the oldest due job's age, and the health check turns.
    await job('email.send', 'late-1', 'pending', 'next_run_at', `now() - interval '25 minutes'`);
    m = await read();
    expect(m.jobs.due).toBe(1);
    expect(m.jobs.oldestDueSeconds).toBeGreaterThanOrEqual(25 * 60);
    expect(m.jobs.oldestDueSeconds).toBeLessThan(26 * 60);
    expect(m.health).toMatchObject({ status: 'degraded', jobs: 'backlog' });

    const html = page(m);
    expect(section(html, 'jobs')).toBe('look');
    expect(section(html, 'health')).toBe('look');
    expect(fact(html, 'jobs.dead')).toBe('1');
    expect(fact(html, 'jobs.stuck')).toBe('1');
    expect(fact(html, 'jobs.stuckFor')).toBe('20 minutes');
    expect(fact(html, 'jobs.oldestDue')).toBe('25 minutes');
    expect(html).toContain(`data-monitoring-job="${dead}" data-monitoring-job-state="dead"`);
    // The table by type and status, dead first.
    const emails = /data-monitoring-job-type="email\.send".*?<\/tr>/.exec(html)![0];
    expect([...emails.matchAll(/data-monitoring-job-count="(\w+)"[^>]*>(\d+)</g)].map((c) => [c[1], c[2]])).toEqual([['dead', '1'], ['pending', '2'], ['running', '0'], ['succeeded', '1']]);
    for (const what of ['jobs.dead', 'jobs.stuck', 'health']) expect(html, what).toContain(`data-monitoring-do="${what}"`);
    // Retry is offered on the dead job only.
    expect(html.match(/data-job-retry="/g)).toHaveLength(1);
    expect(html).toContain(`data-job-retry="${dead}"`);
  });

  it('the health check on the page is the one the health endpoint runs', async () => {
    const answer = async () => (await healthEndpoint(new NextRequest('https://www.netcyberai.test/api/health'))).json();
    expect((await answer()).checks).toEqual({ database: 'ok', jobs: 'backlog' });
    expect((await answer()).status).toBe((await read()).health.status);
    // The late job runs: both say fine again.
    await db.pg.exec(`update jobs set status = 'succeeded', completed_at = now() where idempotency_key = 'late-1';`);
    expect(await answer()).toMatchObject({ status: 'ok', checks: { database: 'ok', jobs: 'ok' } });
    expect((await read()).health).toMatchObject({ status: 'ok', jobs: 'ok' });
  });

  it('a refused notice appears, by what was wrong, and never with what it carried', async () => {
    const notice = (hash: string, ok: boolean, outcome: string, payload: string, ago: string) =>
      db.pg.query(`insert into webhook_events (provider, payload_hash, payload, signature_ok, outcome, processed_at, created_at) values ('whatsapp', $1, $2, $3, $4, now(), now() - $5::interval)`, [hash, payload, ok, outcome, ago]);
    await notice('hash-1', false, 'refused: bad signature', '{"provider": "meta", "bytes": 412}', '3 hours');
    await notice('hash-2', false, 'refused: bad signature', '{"provider": "meta", "bytes": 388}', '2 days');
    await notice('hash-3', false, 'refused: no signature', '{"provider": "meta", "bytes": 12}', '5 days');
    await notice('hash-4', true, 'applied 1, stale 0, unknown 0, replies 1', `{"provider": "meta", "notices": [{"kind": "status", "id": "wamid.HBgMOTE5ODEyMzQ1Njc4", "status": "delivered"}], "from": "${PHONE}"}`, '40 minutes');
    await notice('hash-5', false, 'refused: bad signature', '{"provider": "meta", "bytes": 5}', '9 days'); // before the days counted

    const m = await read();
    expect(m.notices).toMatchObject({ received: 4, refused: 3, refusedByOutcome: [{ outcome: 'refused: bad signature', count: 2 }, { outcome: 'refused: no signature', count: 1 }] });
    expect(m.notices.lastSeconds).toBeGreaterThanOrEqual(40 * 60);
    expect(m.notices.lastSeconds).toBeLessThan(41 * 60);
    expect(needsALook(m).notices).toBe(true);
    const html = page(m);
    expect(fact(html, 'notices.received')).toBe('4');
    expect(fact(html, 'notices.refused')).toBe('3');
    expect(html).toContain('refused: bad signature: <span class="font-bold tabular-nums">2</span>');
    expect(html).toContain('data-monitoring-do="notices.refused"');
  });

  it('an uncertain send, failed sends by the provider’s code and messages held back each appear by school; a test school is left out', async () => {
    await logged(SUNRISE, 'uncertain', { student: KABIR, parent: MEENAKSHI, reason: 'the send was interrupted and nobody knows whether it went; it is not sent again, so that a parent is never messaged twice' });
    await logged(SUNRISE, 'failed', { code: '131026', student: KABIR, parent: MEENAKSHI, ago: '2 hours', reason: `Recipient +91 98123 45678 (meenakshi.iyer@family.example) is not on WhatsApp` });
    await logged(HILLTOP, 'failed', { code: '131026', ago: '3 days', reason: 'the provider could not deliver it' });
    await logged(HILLTOP, 'failed', { ago: '1 day', reason: `the provider did not answer for ${PHONE}` });
    await logged(SUNRISE, 'blocked_consent', { student: FARHAN, reason: 'consent for purpose "operational_communication" is not currently granted' });
    await logged(SUNRISE, 'blocked_consent', { student: KABIR, ago: '6 days', reason: 'this number asked to stop WhatsApp messages from the school' });
    await logged(SUNRISE, 'blocked_budget', { reason: 'monthly WhatsApp budget is not configured for this school' });
    await logged(HILLTOP, 'blocked_no_template', { reason: 'template "class_notice" is not an approved template for this school' });
    await logged(HILLTOP, 'blocked_quiet_hours', { reason: `current time falls within this school's quiet hours (21:00:00-07:00:00 Asia/Kolkata)` });
    // Not counted: what went, what is older than the days counted, and everything of a test school.
    await logged(SUNRISE, 'delivered');
    await logged(SUNRISE, 'queued');
    await logged(SUNRISE, 'failed', { code: '131026', ago: '8 days', reason: 'long ago' });
    await logged(SUNRISE, 'uncertain', { ago: '10 days' });
    for (const status of ['uncertain', 'failed', 'blocked_budget', 'blocked_pilot']) await logged(TEST_SCHOOL, status, { student: PUPIL_TEST, parent: G_TEST, reason: 'a test school never sends through a real account', code: status === 'failed' ? '131026' : undefined });

    const m = await read();
    expect(m.sends.uncertain).toEqual({ key: '', count: 1, schools: [{ schoolName: NAMES.sunrise, count: 1 }], latestReason: null });
    expect(m.sends.failed).toEqual([
      // The latest reason recorded for the code, with the number and the address cut out of it.
      { key: '131026', count: 2, schools: [{ schoolName: NAMES.hilltop, count: 1 }, { schoolName: NAMES.sunrise, count: 1 }], latestReason: 'Recipient <phone> (<email>) is not on WhatsApp' },
      { key: '', count: 1, schools: [{ schoolName: NAMES.hilltop, count: 1 }], latestReason: 'the provider did not answer for <phone>' },
    ]);
    expect(m.sends.held).toEqual([
      { key: 'blocked_consent', count: 2, schools: [{ schoolName: NAMES.sunrise, count: 2 }], latestReason: 'consent for purpose "operational_communication" is not currently granted' },
      { key: 'blocked_budget', count: 1, schools: [{ schoolName: NAMES.sunrise, count: 1 }], latestReason: 'monthly WhatsApp budget is not configured for this school' },
      { key: 'blocked_no_template', count: 1, schools: [{ schoolName: NAMES.hilltop, count: 1 }], latestReason: 'template "class_notice" is not an approved template for this school' },
      { key: 'blocked_quiet_hours', count: 1, schools: [{ schoolName: NAMES.hilltop, count: 1 }], latestReason: `current time falls within this school's quiet hours (21:00:00-07:00:00 Asia/Kolkata)` },
    ]);
    expect(JSON.stringify(m)).not.toContain(NAMES.test);
    expect(needsALook(m).sends).toBe(true);

    const html = page(m);
    expect(section(html, 'sends')).toBe('look');
    expect(html).toContain('data-monitoring-group="uncertain"');
    expect(html).toContain('data-monitoring-group="failed:131026"');
    expect(html).toContain('data-monitoring-group="held:blocked_budget"');
    expect(html).toContain(`${NAMES.sunrise}: 1 message<`);
    expect(html).toContain(`${NAMES.sunrise}: 2 messages<`);
    // What waits on NetCyberAI gets a line on what to do; what is the school's own gets a line that says so.
    for (const what of ['sends.uncertain', 'sends.failed', 'sends.blocked_budget', 'sends.blocked_no_template']) expect(html, what).toContain(`data-monitoring-do="${what}"`);
    expect(html).not.toContain('data-monitoring-do="sends.blocked_consent"');
    expect(html).toContain('Nothing to do here: consent is the parent’s to give and the school’s to ask for.');
    expect(html).not.toContain(NAMES.test);
  });

  it('messages held only for the school’s own reasons do not ask for a look', async () => {
    const m = await read();
    const quiet: Monitoring = { ...m, sends: { uncertain: { key: '', count: 0, schools: [], latestReason: null }, failed: [], held: m.sends.held.filter((g) => g.key === 'blocked_consent' || g.key === 'blocked_quiet_hours') } };
    expect(quiet.sends.held).toHaveLength(2);
    expect(needsALook(quiet).sends).toBe(false);
    expect(section(page(quiet), 'sends')).toBe('clear');
  });

  it('replies held for “which school?”: held now, past their time, dropped and delivered are counted; the sealed words are never read', async () => {
    const digest = (c: string) => c.repeat(64);
    const held = (provId: string, d: string, status: string, received: string, extra: { decided?: string; school?: string; reason?: string } = {}) =>
      db.pg.query(
        `insert into held_inbound (provider, provider_message_id, phone_digest, school_ids, ciphertext, iv, tag, key_version, received_at, expires_at, status, chosen_school_id, reason, decided_at)
         values ('meta', $1, $2, $3::uuid[], $4, $5, $6, $7, now() - $8::interval, now() - $8::interval + interval '24 hours', $9, $10, $11, case when $12::text is null then null else now() - $12::interval end)`,
        [provId, digest(d), `{${SUNRISE},${HILLTOP}}`, status === 'held' ? 'U0VBTEVELVdPUkRTLW9mLWEtcGFyZW50' : null, status === 'held' ? 'A'.repeat(16) : null, status === 'held' ? 'B'.repeat(24) : null, status === 'held' ? 1 : null, received, status, extra.school ?? null, extra.reason ?? null, extra.decided ?? null]
      );
    await held('wamid.held-1', 'a', 'held', '3 hours');
    await held('wamid.held-2', 'b', 'held', '30 hours'); // its 24 hours ran out six hours ago and nothing dropped it
    await held('wamid.dropped-1', 'c', 'dropped', '3 days', { decided: '2 days', reason: 'no school was chosen within 24 hours' });
    await held('wamid.dropped-2', 'd', 'dropped', '11 days', { decided: '10 days', reason: 'no school was chosen within 24 hours' }); // before the days counted
    await held('wamid.delivered-1', 'e', 'delivered', '2 days', { decided: '1 day', school: SUNRISE });

    const m = await read();
    expect(m.replies).toMatchObject({ heldNow: 2, pastTheirTime: 1, dropped: 1, delivered: 1, holdHours: 24 });
    expect(m.replies.oldestHeldSeconds).toBeGreaterThanOrEqual(30 * 3600);
    expect(needsALook(m).replies).toBe(true);
    const html = page(m);
    expect(fact(html, 'replies.held')).toBe('2');
    expect(fact(html, 'replies.oldest')).toBe('30 hours');
    expect(fact(html, 'replies.past')).toBe('1');
    expect(fact(html, 'replies.dropped')).toBe('1');
    expect(html).toContain('data-monitoring-do="replies.past"');
  });

  it('a school with dues and no fee run for yesterday appears; one whose dues came later, one that had its run and a test school do not', async () => {
    const due = (school: string, student: string, createdSql: string) => db.pg.exec(`insert into fees_ledger (school_id, student_id, gross_minor, concession_minor, amount_minor, due_date, created_at) values ('${school}', '${student}', 450000, 0, 450000, ${INDIA_YESTERDAY_SQL} - 20, ${createdSql});`);
    const run = (school: string, daySql: string, problems: number) => db.pg.exec(`insert into fee_status_runs (school_id, run_date, marked_overdue, late_fees_raised, late_fee_minor, problems, balance_minor) values ('${school}', ${daySql}, 1, 0, 0, ${problems}, 450000);`);
    await due(SUNRISE, KABIR, `now() - interval '6 days'`);
    await due(HILLTOP, PUPIL_HILLTOP, `now() - interval '6 days'`);
    await due(TEST_SCHOOL, PUPIL_TEST, `now() - interval '6 days'`);
    // Raised at noon yesterday in India: after that night's run, so no run was due for it.
    await due(LATE_DUES, PUPIL_LATE, `(${INDIA_YESTERDAY_SQL}::timestamp at time zone 'Asia/Kolkata') + interval '12 hours'`);
    await run(HILLTOP, INDIA_YESTERDAY_SQL, 0);
    // Sunrise ran three nights ago, and its books did not add up in two places; yesterday it did not run at all.
    await run(SUNRISE, `${INDIA_YESTERDAY_SQL} - 2`, 2);
    await run(SUNRISE, `${INDIA_YESTERDAY_SQL} - 3`, 0);
    await run(TEST_SCHOOL, `${INDIA_YESTERDAY_SQL} - 2`, 5);
    // That night's fee job gave up; the billing check was never queued. The fee job is as the scheduler queues it
    // (fees_nightly_enqueue): with the night it was for.
    await job('fees.nightly', `fees.nightly:${YESTERDAY}`, 'dead', 'attempts, max_attempts, last_error, completed_at, payload', `8, 8, 'fees.nightly: 1 school(s) not done', now() - interval '5 hours', '{"date": "${YESTERDAY}"}'`);

    let m = await read();
    expect(m.nightly).toEqual({
      date: YESTERDAY,
      feesJob: { type: 'fees.nightly', state: 'failed', attempts: 8 },
      billingJob: { type: 'billing.nightly', state: 'not_needed', attempts: 0 },
      feeRunsExpected: 2,
      feeRunMissing: [NAMES.sunrise],
      feeRunCaughtUp: [],
      runsWithProblems: [{ schoolName: NAMES.sunrise, runDate: indiaDate(new Date(Date.now() - 3 * 86_400_000)), problems: 2 }],
    });
    expect(needsALook(m).nightly).toBe(true);
    let html = page(m);
    expect(html).toContain('data-monitoring-missing="1"');
    expect(html).toContain(`data-monitoring-missing-school="true" class="break-words">${NAMES.sunrise}</li>`);
    expect(html).toContain('data-monitoring-night="fees" data-monitoring-night-state="failed"');
    // No school is billed yet, so no billing job is queued and that is as it should be (C204): no red light, no advice.
    expect(html).toContain('data-monitoring-night="billing" data-monitoring-night-state="not_needed"');
    expect(html).not.toContain('data-monitoring-do="nightly.not_needed"');
    for (const what of ['nightly.missing', 'nightly.failed', 'nightly.problems']) expect(html, what).toContain(`data-monitoring-do="${what}"`);
    expect(html).not.toContain('data-monitoring-caught-up');
    expect(html).toContain(`${NAMES.sunrise}: 2 places, on the night of`);
    expect(html).not.toContain(NAMES.lateDues);
    expect(html).not.toContain(NAMES.test);

    // The founder presses Retry on the dead fee job (the function the button's route calls) and the job runner runs
    // it with the real handler. A fee run that starts late runs for TODAY (src/lib/fees/nightly.ts): it writes
    // today's row for the school, and never one for the night that was missed.
    const feesKey = `fees.nightly:${YESTERDAY}`;
    const feesJob = await jobId(feesKey);
    expect(await platform((c) => retryDeadJob(c, feesJob))).toMatchObject({ retried: true });
    expect(await runJobs({ handlers: { 'fees.nightly': feesNightlyHandler({ platform }) }, queue: createPgJobQueue(platform), onlyKeys: [feesKey] })).toMatchObject({ claimed: 1, succeeded: 1, dead: 0 });
    const runsSince = async (school: string) => (await db.pg.query(`select run_date::text as day from fee_status_runs where school_id = $1 and run_date >= ${INDIA_YESTERDAY_SQL} order by 1`, [school])).rows.map((r: { day: string }) => r.day);
    expect(await runsSince(SUNRISE)).toEqual([TODAY]);
    expect(await runsSince(HILLTOP)).toEqual([YESTERDAY, TODAY]);
    // So the page says what happened: the job ran; the school missed that night and has been brought up to date
    // since. Nothing is left to retry, and the page does not ask for it. (The billing check is still not queued.)
    m = await read();
    expect(m.nightly).toEqual({
      date: YESTERDAY,
      feesJob: { type: 'fees.nightly', state: 'ran', attempts: 9 },
      billingJob: { type: 'billing.nightly', state: 'not_needed', attempts: 0 },
      feeRunsExpected: 2,
      feeRunMissing: [],
      feeRunCaughtUp: [{ schoolName: NAMES.sunrise, runDate: TODAY }],
      // Today's run found Sunrise's books in order, and it is now the latest.
      runsWithProblems: [],
    });
    expect(m.jobs.failed.some((f) => f.type === 'fees.nightly')).toBe(false);
    html = page(m);
    expect(html).toContain('data-monitoring-night="fees" data-monitoring-night-state="ran"');
    expect(html).toContain('data-monitoring-missing="0"');
    expect(html).not.toContain('data-monitoring-missing-school');
    expect(html).not.toContain('data-monitoring-do="nightly.missing"');
    expect(html).not.toContain('data-monitoring-do="nightly.failed"');
    expect(html).toContain('No live school with dues is still waiting for a fee run. 1 of 2 had it that night; the others are listed below.');
    expect(html).toContain('data-monitoring-caught-up="1"');
    expect(html).toContain(`data-monitoring-caught-up-school="true" class="break-words">${NAMES.sunrise}: by the fee run of ${dayWords(TODAY)}</li>`);
    expect(html).toContain('Nothing to do for these.');
    // No school is billed, so the billing check had nothing to check: nothing asks for a look now.
    expect(needsALook(m).nightly).toBe(false);
    // Once a school has a paid-until day the clock queues the check; a night with no job is then a fault.
    await db.pg.exec(`set session_replication_role = replica; insert into plans (plan_id, name, grace_days, all_working_modules) values ('monitoring-test', 'A plan for this test', 7, true) on conflict do nothing; insert into school_subscriptions (school_id, plan_id, paid_until) select school_id, 'monitoring-test', '${TODAY}' from schools order by school_id limit 1 on conflict (school_id) do update set paid_until = excluded.paid_until; set session_replication_role = origin;`);
    const billed = await read();
    expect(billed.nightly.billingJob).toEqual({ type: 'billing.nightly', state: 'not_queued', attempts: 0 });
    expect(needsALook(billed).nightly).toBe(true);
    expect(page(billed)).toContain('data-monitoring-do="nightly.not_queued"');
    await db.pg.exec(`set session_replication_role = replica; update school_subscriptions set paid_until = null, billing_access = null, billing_grace_ends_at = null, billing_access_since = null where plan_id = 'monitoring-test'; set session_replication_role = origin;`);
  });

  it('a night’s job that was never started, is with a worker, or failed and waits says which; only the last points at an error in the failed jobs', async () => {
    const key = `billing.nightly:${YESTERDAY}`;
    const advice = (html: string, state: string) => new RegExp(`data-monitoring-do="nightly\\.${state}"[^>]*>(.*?)</p>`).exec(html)?.[1] ?? '';
    const listed = (m: Monitoring) => m.jobs.failed.filter((f) => f.type === 'billing.nightly');

    // Queued twenty hours ago and never picked up: the job runner has stopped. No attempt, so no error anywhere.
    await job('billing.nightly', key, 'pending', 'attempts, next_run_at', `0, now() - interval '20 hours'`);
    let m = await read();
    expect(m.nightly.billingJob).toEqual({ type: 'billing.nightly', state: 'queued', attempts: 0 });
    expect(listed(m)).toEqual([]);
    expect(m.health.status).toBe('degraded');
    let html = page(m);
    expect(html).toContain('data-monitoring-night="billing" data-monitoring-night-state="queued"');
    expect(advice(html, 'queued')).toContain('no worker has started it, so it has no error to read');
    expect(advice(html, 'queued')).toContain('Health check');
    expect(advice(html, 'queued')).not.toContain('failed jobs');
    expect(html).toContain('data-monitoring-do="health"');
    expect(needsALook(m).nightly).toBe(true);

    // A worker has it, on its first attempt: still nothing of it in the failed jobs.
    await db.pg.exec(`update jobs set status = 'running', attempts = 1, locked_until = now() + interval '2 minutes' where idempotency_key = '${key}';`);
    m = await read();
    expect(m.nightly.billingJob).toEqual({ type: 'billing.nightly', state: 'running', attempts: 1 });
    expect(listed(m)).toEqual([]);
    html = page(m);
    expect(html).toContain('data-monitoring-night="billing" data-monitoring-night-state="running"');
    expect(advice(html, 'running')).toContain('is with a worker now (attempt 1)');
    expect(advice(html, 'running')).not.toContain('failed jobs');
    expect(needsALook(m).nightly).toBe(true);

    // It failed and waits for another try: now its error is in the failed jobs, and only now does the line say so.
    await db.pg.exec(`update jobs set status = 'pending', attempts = 3, locked_until = null, next_run_at = now() + interval '10 minutes', last_error = 'billing.nightly: 1 school(s) not done' where idempotency_key = '${key}';`);
    m = await read();
    expect(m.nightly.billingJob).toEqual({ type: 'billing.nightly', state: 'retrying', attempts: 3 });
    expect(listed(m)).toMatchObject([{ state: 'retrying', attempts: 3, error: 'billing.nightly: 1 school(s) not done' }]);
    html = page(m);
    expect(html).toContain('data-monitoring-night="billing" data-monitoring-night-state="retrying"');
    expect(advice(html, 'retrying')).toBe('<strong>What to do:</strong> That night’s job failed and waits for another try (tries so far: 3). Its error is in the failed jobs above.');
    expect(needsALook(m).nightly).toBe(true);
    // Each state has its own words in both languages, on its badge and (all but "ran") on its line on what to do.
    for (const state of ['queued', 'running', 'retrying', 'failed', 'not_queued', 'ran'] as const)
      for (const lang of ['en', 'hi'] as const) {
        const drawn = page({ ...m, nightly: { ...m.nightly, billingJob: { ...m.nightly.billingJob, state } } }, lang);
        const badge = new RegExp(`data-monitoring-night="billing" data-monitoring-night-state="${state}"[^>]*>.*?<code[^>]*>billing\\.nightly</code><span[^>]*>([^<]+)</span>`).exec(drawn)?.[1];
        expect(badge, `${state} ${lang}`).toBeTruthy();
        if (state !== 'ran') expect(advice(drawn, state).replace(/<strong>.*?<\/strong>/, '').trim().length, `${state} ${lang}`).toBeGreaterThan(20);
      }

    // It ran. With the fee run made good in the test before, the nightly work asks for nothing.
    await db.pg.exec(`update jobs set status = 'succeeded', completed_at = now(), last_error = null where idempotency_key = '${key}';`);
    m = await read();
    expect(m.nightly).toMatchObject({ feesJob: { state: 'ran' }, billingJob: { state: 'ran', attempts: 3 }, feeRunMissing: [], runsWithProblems: [] });
    expect(needsALook(m).nightly).toBe(false);
    html = page(m);
    expect(section(html, 'nightly')).toBe('clear');
    expect(html).not.toMatch(/data-monitoring-do="nightly\./);
    // Had every school been run on the night itself, the page would say that instead.
    const onTime = page({ ...m, nightly: { ...m.nightly, feeRunCaughtUp: [] } });
    expect(onTime).toContain('Every live school with dues had its fee run that night: 2 of 2.');
    expect(onTime).not.toContain('data-monitoring-caught-up');
  });

  it('templates are counted by our approval and by Meta’s, with the Hindi versions not yet reviewed', async () => {
    await template('monitoring_a', 'en', 'approved', 'approved');
    await template('monitoring_b', 'en', 'pending', 'not_submitted');
    await template('monitoring_c', 'en', 'approved', 'pending');
    await template('monitoring_d', 'en', 'approved', 'rejected');
    await template('monitoring_e', 'en', 'rejected', 'not_submitted');
    await template('monitoring_f', 'en', 'approved', 'paused');
    await template('monitoring_a', 'hi', 'approved', 'approved'); // Hindi, not reviewed
    const m = await read();
    const s = templatesAtStart;
    expect(m.templates).toEqual({
      total: s.total + 7,
      approvedByUs: s.approvedByUs + 5,
      waitingForUs: s.waitingForUs + 1,
      rejectedByUs: s.rejectedByUs + 1,
      withMeta: s.withMeta + 1,
      approvedByMeta: s.approvedByMeta + 2,
      refusedByMeta: s.refusedByMeta + 1,
      pausedByMeta: s.pausedByMeta + 1,
      hindiNotReviewed: s.hindiNotReviewed + 1,
      // Each is the only version of its template, so each of the three stands in the way of a message.
      inTheWay: { waitingForUs: 1, refusedByMeta: 1, pausedByMeta: 1 },
    });
    expect(needsALook(m).templates).toBe(true);
    const html = page(m);
    expect(fact(html, 'templates.refusedByMeta')).toBe(String(s.refusedByMeta + 1));
    expect(fact(html, 'templates.hindiNotReviewed')).toBe(String(s.hindiNotReviewed + 1));
    for (const what of ['templates.waitingForUs', 'templates.refusedByMeta']) expect(html, what).toContain(`data-monitoring-do="${what}"`);
    expect(html).not.toContain('data-monitoring-templates-settled');
    expect(html).toContain('href="/control/templates"');
  });

  it('a version stops asking for a look once a newer version of its template has the approvals it needs, or we reject it ourselves; it stays in the counts', async () => {
    const s = templatesAtStart;
    const already = s.waitingForUs + s.refusedByMeta + s.pausedByMeta;
    const templateId = async (name: string, version: number) => (await db.pg.query(`select id from whatsapp_templates where school_id is null and template_name = $1 and language = 'en' and version = $2`, [name, version])).rows[0].id as string;
    const settled = (html: string) => Number(/data-monitoring-templates-settled="(\d+)"/.exec(html)?.[1] ?? 0);

    // The founder does what the page says for the version Meta refused: new words as version 2, approved by us and
    // by Meta. The sender now sends version 2, so version 1's refusal is history. The version waiting for our
    // approval gets a newer one that we approve. The paused one gets a newer one that is still with Meta.
    await template('monitoring_d', 'en', 'approved', 'approved', 2);
    await template('monitoring_b', 'en', 'approved', 'not_submitted', 2);
    await template('monitoring_f', 'en', 'approved', 'pending', 2);
    // In another language the same name is another template: a Hindi version 3 takes no English version's place.
    await template('monitoring_f', 'hi', 'approved', 'approved', 3);
    let m = await read();
    expect(m.templates).toMatchObject({ waitingForUs: s.waitingForUs + 1, refusedByMeta: s.refusedByMeta + 1, pausedByMeta: s.pausedByMeta + 1, inTheWay: { waitingForUs: 0, refusedByMeta: 0, pausedByMeta: 1 } });
    expect(needsALook(m).templates).toBe(true);
    let html = page(m);
    expect(html).toContain('data-monitoring-do="templates.refusedByMeta"');
    expect(html).not.toContain('data-monitoring-do="templates.waitingForUs"');
    expect(settled(html)).toBe(already + 2);
    // The plain counts are still of every version on record.
    expect(fact(html, 'templates.refusedByMeta')).toBe(String(s.refusedByMeta + 1));
    expect(fact(html, 'templates.waitingForUs')).toBe(String(s.waitingForUs + 1));

    // Meta approves the paused template's version 2 (recorded as Control → Message templates records it): all clear.
    const withMeta = await templateId('monitoring_f', 2);
    expect(await platform((c) => recordMetaDecision(c, withMeta, { metaStatus: 'approved', metaTemplateId: 'made-up-meta-id' }))).toEqual({ ok: true });
    m = await read();
    expect(m.templates).toMatchObject({ refusedByMeta: s.refusedByMeta + 1, pausedByMeta: s.pausedByMeta + 1, inTheWay: { waitingForUs: 0, refusedByMeta: 0, pausedByMeta: 0 } });
    expect(needsALook(m).templates).toBe(false);
    html = page(m);
    expect(section(html, 'templates')).toBe('clear');
    expect(html).not.toMatch(/data-monitoring-do="templates\./);
    expect(settled(html)).toBe(already + 3);
    expect(html).toContain('3 versions counted above as waiting, refused or paused ask for nothing');

    // The other way round: version 1 has both approvals and goes out; Meta refuses our newer version 2. That one
    // does ask for a look, until we reject it ourselves and keep the older words.
    await template('monitoring_g', 'en', 'approved', 'approved', 1);
    await template('monitoring_g', 'en', 'approved', 'rejected', 2);
    m = await read();
    expect(m.templates.inTheWay).toEqual({ waitingForUs: 0, refusedByMeta: 1, pausedByMeta: 0 });
    expect(needsALook(m).templates).toBe(true);
    expect(section(page(m), 'templates')).toBe('look');
    const refused = await templateId('monitoring_g', 2);
    expect(await platform((c) => decideTemplate(c, { userId: FOUNDER }, refused, false))).toEqual({ ok: true });
    m = await read();
    expect(m.templates).toMatchObject({ refusedByMeta: s.refusedByMeta + 2, inTheWay: { waitingForUs: 0, refusedByMeta: 0, pausedByMeta: 0 } });
    expect(needsALook(m).templates).toBe(false);
    html = page(m);
    expect(section(html, 'templates')).toBe('clear');
    expect(settled(html)).toBe(already + 4);
  });

  it('the loader’s whole answer, and the whole page in both languages, hold no parent’s or child’s name, number, address or message words', async () => {
    const m = await read();
    const answer = JSON.stringify(m);
    // It is not empty-handed: the schools, the jobs and the reasons are all there.
    for (const shown of [NAMES.sunrise, NAMES.hilltop, 'email.send', '131026', 'refused: bad signature', 'blocked_consent']) expect(answer, shown).toContain(shown);
    for (const text of [answer, page(m, 'en'), page(m, 'hi')]) {
      for (const secret of PRIVATE) expect(text, secret).not.toContain(secret);
      expect(text).not.toContain(NAMES.test);
      expect(text).not.toMatch(/9812345\d{3}/);
    }
    // The rows these were read from do hold them: the test would mean nothing otherwise.
    const stored = JSON.stringify((await db.pg.query(`select (select jsonb_agg(l) from communication_log l) as log, (select jsonb_agg(j) from jobs j) as jobs, (select jsonb_agg(w) from webhook_events w) as notices, (select jsonb_agg(x) from held_inbound x) as held`)).rows[0]);
    for (const secret of ['Meenakshi Iyer', 'Kabir Iyer', PHONE, 'family.example', 'blue notebook', 'Kabir was absent', 'U0VBTEVELVdPUkRTLW9mLWEtcGFyZW50', 'wamid.HBgMOTE5ODEyMzQ1Njc4']) expect(stored, secret).toContain(secret);
  });

  it('a school’s own session cannot read any of it: the page’s tables are the platform’s', async () => {
    await expect(asPrincipal((c) => loadMonitoring(c))).rejects.toThrow(/permission denied/);
    for (const table of ['jobs', 'held_inbound']) await expect(asPrincipal((c) => c.query(`select count(*) from ${table}`)), table).rejects.toThrow(/permission denied/);
    // A school reads only notices about its own messages: the refused ones belong to no school.
    expect(await asPrincipal(async (c) => (await c.query(`select count(*)::int as n from webhook_events`)).rows[0].n as number)).toBe(0);
    expect((await db.pg.query(`select count(*)::int as n from webhook_events where signature_ok = false`)).rows[0].n).toBe(4);
  });

  it('the page in Hindi says the same things in Hindi', async () => {
    const m = await read();
    const html = page(m, 'hi');
    expect(html).toContain('lang="hi"');
    for (const words of ['देखना ज़रूरी', 'क्या करें:', 'पीछे चलने वाले काम', 'दोबारा चलाएँ', 'जो संदेश नहीं गए, पिछले 7 दिन', `${NAMES.sunrise}: 2 संदेश`]) expect(html, words).toContain(words);
    // No English sentence of the page is left in it.
    for (const words of ['Needs a look', 'What to do:', 'Background jobs', 'Retry', 'Held:', 'All clear']) expect(html, words).not.toContain(words);
  });

  it('the invitations list is the one place about a person: a member of staff, masked, and never in the loader’s answer', async () => {
    await db.pg.query(`insert into staff_invitations (school_id, email, email_key, display_name, role, status, source, invited_by) values ($1, $2, $2, 'New Teacher', 'teacher', 'needs_founder', 'staff', $3)`, [SUNRISE, STAFF_EMAIL, PRINCIPAL]);
    const waiting = await platform((c) => invitationsWaiting(c));
    // The full address never leaves the loader (C210): its first letter, dots and the domain.
    expect(waiting).toMatchObject([{ schoolName: NAMES.sunrise, maskedEmail: STAFF_MASKED, role: 'teacher' }]);
    expect(JSON.stringify(waiting)).not.toContain(STAFF_EMAIL);
    expect(JSON.stringify(waiting)).not.toContain('new.teacher');
    const m = await read();
    expect(JSON.stringify(m)).not.toContain('staff.example');
    const html = page(m, 'en', waiting);
    expect(html).toContain(`${NAMES.sunrise} invited ${STAFF_MASKED} as Teacher.`);
    expect(html).not.toContain(STAFF_EMAIL);
    expect(html).not.toContain('new.teacher');
    // Only inside its own section, which says what it is.
    expect(html.split(STAFF_MASKED)).toHaveLength(2);
    expect(html.indexOf(STAFF_MASKED)).toBeGreaterThan(html.indexOf('data-monitoring-section="invitations" data-monitoring-state="look"'));
    expect(html).toContain('The one list on this page about a person: a member of staff a school invited, never a parent or a child. Only the first letter of their email and its domain are shown here.');
    for (const secret of PRIVATE) expect(html, secret).not.toContain(secret);
  });

  it('an email is masked to its first letter, three dots and its domain, whatever is typed', () => {
    expect(maskStaffEmail('anita.rao@school.in')).toBe('a…@school.in');
    expect(maskStaffEmail('  Kabir@Example.org ')).toBe('K…@Example.org');
    expect(maskStaffEmail('x@y.in')).toBe('x…@y.in');
    // The last @ is where the domain starts; nothing after the first letter of the name is kept.
    expect(maskStaffEmail('"odd@name"@school.in')).toBe('"…@school.in');
    // No @, nothing typed, or no name: no domain to show, and nothing of the rest.
    expect(maskStaffEmail('not-an-email')).toBe('n…');
    expect(maskStaffEmail('')).toBe('…');
    expect(maskStaffEmail(null)).toBe('…');
    expect(maskStaffEmail('@school.in')).toBe('…@school.in');
    // A name that starts with a letter outside ASCII keeps that one letter whole.
    expect(maskStaffEmail('अनीता@school.in')).toBe('अ…@school.in');
  });

  it('the list of failed jobs stops at its limit and says so; last night’s own jobs come first, then dead jobs; the counts are of all of them', async () => {
    await db.pg.exec(`
      insert into jobs (type, idempotency_key, status, attempts, max_attempts, last_error, completed_at, updated_at)
      select 'email.send', 'many-' || g, 'dead', 8, 8, 'the mail provider refused it', now() - g * interval '1 minute', now() - g * interval '1 minute' from generate_series(1, ${FAILED_JOBS_LISTED + 5}) g;
      -- Jobs that failed a moment ago and wait for another try: newer than every dead one.
      insert into jobs (type, idempotency_key, status, attempts, next_run_at, last_error, updated_at)
      select 'email.send', 'trying-' || g, 'pending', 1, now() + interval '1 minute', 'timeout', now() from generate_series(1, 30) g;`);
    const m = await read();
    expect(m.jobs.failed).toHaveLength(FAILED_JOBS_LISTED);
    expect(m.jobs.failed.every((f) => f.state === 'dead')).toBe(true);
    expect(m.jobs.dead).toBe(FAILED_JOBS_LISTED + 5 + 1);
    expect(m.jobs.retrying).toBe(30 + 1);
    const html = page(m);
    expect(html).toContain(`The latest ${FAILED_JOBS_LISTED} are listed.`);
    expect(html.match(/data-job-retry="/g)).toHaveLength(FAILED_JOBS_LISTED);

    // Last night's own jobs are on the list however long it is, and first: the nightly section sends the reader
    // there for the error and for Retry. Here both failed three days ago, before every other job on the list.
    const feesKey = `fees.nightly:${YESTERDAY}`;
    await db.pg.exec(`
      update jobs set status = 'dead', updated_at = now() - interval '3 days' where idempotency_key = '${feesKey}';
      update jobs set status = 'pending', attempts = 2, next_run_at = now() + interval '1 hour', last_error = 'billing.nightly: 1 school(s) not done', updated_at = now() - interval '3 days' where idempotency_key = 'billing.nightly:${YESTERDAY}';`);
    const feesJob = await jobId(feesKey);
    const night = await read();
    expect(night.nightly).toMatchObject({ feesJob: { state: 'failed' }, billingJob: { state: 'retrying', attempts: 2 } });
    expect(night.jobs.failed).toHaveLength(FAILED_JOBS_LISTED);
    expect(night.jobs.failed.slice(0, 2).map((f) => [f.type, f.state, f.jobId === feesJob])).toEqual([['fees.nightly', 'dead', true], ['billing.nightly', 'retrying', false]]);
    expect(night.jobs.failed.slice(2).every((f) => f.type === 'email.send' && f.state === 'dead')).toBe(true);
    const drawn = page(night);
    for (const what of ['nightly.failed', 'nightly.retrying']) expect(drawn, what).toContain(`data-monitoring-do="${what}"`);
    expect(drawn).toContain(`data-job-retry="${feesJob}"`);
  });
});
