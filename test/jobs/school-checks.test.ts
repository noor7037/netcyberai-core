import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { indiaDate } from '@/lib/time/india';

// The schools' own scheduled checks through the job queue (C210). The acceptance test, its queue half: "Each night
// the Early Warning check runs for every school with the module on [...]; each week the School Health Auditor records
// the school's check-up the same way; nothing is queued before the deployed code can run it." Proven on the whole
// schema: the database's own enqueue functions, the deployed runner (runDueJobs) with its production handlers, and
// the founder's Monitoring page. The two session helpers of src/lib/auth/db.ts are pointed at the test database
// (the platform's, and the school job's with its own statements); nothing else is replaced. Every name is made up.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
vi.mock('@/lib/auth/db', async (original) => {
  const real = await original<typeof import('@/lib/auth/db')>();
  return {
    ...real,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withPlatformService: (fn: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db.pg.transaction(async (tx: any) => {
        await tx.query('set local role nca_super');
        return fn(tx);
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withSchoolJobContext: (schoolId: string, job: any, fn: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db.pg.transaction(async (tx: any) => {
        for (const s of real.schoolJobContextStatements(schoolId, job)) await tx.query(s.sql, s.params);
        return fn(tx);
      }),
  };
});

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

import { MonitoringView } from '@/components/control/MonitoringView';
import { LangProvider } from '@/components/app-shell/LangContext';
import { withPlatformService } from '@/lib/auth/db';
import { weekStart } from '@/lib/auditor/rules';
import { loadMonitoring, needsALook, schoolCheckState, type Monitoring } from '@/lib/control/monitoring';
import { HANDLED_TYPES_KEY, recordHandledTypes } from '@/lib/jobs/handled-types';
import { productionHandlers, runDueJobs } from '@/lib/jobs/handlers';
import type { Sql } from '@/lib/jobs/types';

const ROOT = path.resolve(__dirname, '../..');
const u = (n: number) => `ab000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// A: both modules on. B: Early Warning off, the auditor on. C: read-only. D: in grace that has not ended. E: grace
// that has ended. F: suspended. G: a test school, both on.
const [A, B, C, D, E, F, G] = [u(1), u(2), u(3), u(4), u(5), u(6), u(7)];
const NAMES: Record<string, string> = { [A]: 'Asha Vidyalaya', [B]: 'Bela Public School', [C]: 'Chirag Academy', [D]: 'Dev Convent', [E]: 'Esha School', [F]: 'Farah High', [G]: 'Gopal Test School' };
const TODAY = indiaDate();
const MONDAY = weekStart(TODAY);
const YESTERDAY = new Date(Date.parse(`${TODAY}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const LAST_WEEK = weekStart(YESTERDAY);
const platform = withPlatformService as unknown as <T>(fn: (c: Sql) => Promise<T>) => Promise<T>;

const jobs = async (type: string) =>
  (await db.pg.query(`select school_id, idempotency_key, payload, status, max_attempts from jobs where type = $1 order by school_id`, [type])).rows as { school_id: string; idempotency_key: string; payload: Record<string, string>; status: string; max_attempts: number }[];
const enqueueBoth = () => db.pg.exec(`select public.early_warning_nightly_enqueue(); select public.auditor_weekly_enqueue();`);
const handlersList = async () => (await db.pg.query(`select value from platform_settings where key = $1`, [HANDLED_TYPES_KEY])).rows[0]?.value;
const page = (m: Monitoring) => renderToStaticMarkup(createElement(LangProvider, { lang: 'en', children: createElement(MonitoringView, { data: m, invitations: [], applications: {}, lang: 'en' }) }));

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    set session_replication_role = replica;
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values
      ${[A, B, C, D, E, F, G].map((s) => `('${s}', '${NAMES[s]}', 'IN-HR', ${s === G})`).join(', ')};
    insert into school_entitlements (school_id, plan, access_mode, grace_ends_at) values
      ('${A}', 'standard', 'full', null), ('${B}', 'standard', 'full', null), ('${C}', 'standard', 'read_only', null), ('${D}', 'standard', 'grace', now() + interval '5 days'),
      ('${E}', 'standard', 'grace', now() - interval '1 hour'), ('${F}', 'standard', 'suspended', null), ('${G}', 'standard', 'full', null)
      on conflict (school_id) do update set access_mode = excluded.access_mode, grace_ends_at = excluded.grace_ends_at;
    insert into school_module_entitlements (school_id, module_id, enabled, source)
      select s, m, not (s = '${B}' and m = 'early-warning'), 'plan' from unnest(array['${A}', '${B}', '${C}', '${D}', '${E}', '${F}', '${G}']::uuid[]) s, unnest(array['early-warning', 'school-auditor']) m
      on conflict (school_id, module_id) do update set enabled = excluded.enabled;
    set session_replication_role = origin;
  `);
}, 120_000);
afterAll(async () => db?.stop());

describe('nothing is queued before the deployed code can run it', () => {
  it('the migration leaves the list of job types the runner handles empty, so the scheduler queues nothing', async () => {
    expect(await handlersList()).toEqual([]);
    await enqueueBoth();
    expect(await jobs('early_warning.nightly')).toEqual([]);
    expect(await jobs('auditor.weekly')).toEqual([]);
  });

  it('the deployed runner writes down the types it handles on its round, and only when they changed', async () => {
    const types = Object.keys(productionHandlers());
    expect(types).toEqual(expect.arrayContaining(['early_warning.nightly', 'auditor.weekly']));
    expect(await runDueJobs()).toMatchObject({ claimed: 0 });
    expect(await handlersList()).toEqual([...types].sort());
    // The same list again is not written again; a new one is.
    expect(await recordHandledTypes(platform, types)).toBe(false);
    expect(await recordHandledTypes(platform, [...types, 'zz.later'])).toBe(true);
    expect(await recordHandledTypes(platform, types)).toBe(true);
    expect(await handlersList()).toEqual([...types].sort());
  });

  it('then the scheduler queues one job a school with the module on whose records can be changed, once a night and once a week', async () => {
    await enqueueBoth();
    await enqueueBoth();
    const nightly = await jobs('early_warning.nightly');
    // A, D (grace not ended) and the test school G; not B (module off), C (read-only), E (grace ended), F (suspended).
    expect(nightly.map((j) => j.school_id)).toEqual([A, D, G]);
    for (const j of nightly) expect(j).toMatchObject({ idempotency_key: `early_warning.nightly:${j.school_id}:${TODAY}`, payload: { date: TODAY }, status: 'pending', max_attempts: 5 });
    const weekly = await jobs('auditor.weekly');
    expect(weekly.map((j) => j.school_id)).toEqual([A, B, D, G]);
    for (const j of weekly) expect(j).toMatchObject({ idempotency_key: `auditor.weekly:${j.school_id}:${MONDAY}`, payload: { week: MONDAY }, status: 'pending' });
  });

  it('the runner runs them in each school’s own session: flags checked and the week’s check-up kept, by no person', async () => {
    const summary = await runDueJobs();
    expect(summary).toMatchObject({ claimed: 7, succeeded: 7, dead: 0, retried: 0 });
    expect((await jobs('early_warning.nightly')).map((j) => j.status)).toEqual(['succeeded', 'succeeded', 'succeeded']);
    // Each school's own check, on its own record: nobody's, the nightly check's.
    const checked = (await db.pg.query(`select school_id, actor_user_id, actor_role, after_state ->> 'by' as by from audit_log where event_action = 'early_warning.checked' order by school_id`)).rows;
    expect(checked).toEqual([A, D, G].map((s) => ({ school_id: s, actor_user_id: null, actor_role: null, by: 'early_warning.nightly' })));
    const kept = (await db.pg.query(`select school_id, run_date::text as run_date, recorded_by, recorded_by_job from school_health_runs order by school_id`)).rows;
    expect(kept).toEqual([A, B, D, G].map((s) => ({ school_id: s, run_date: TODAY, recorded_by: null, recorded_by_job: 'auditor.weekly' })));
  });

  it('a database where the list is gone queues nothing: the runner only ever changes the row, it never makes one', async () => {
    const H = u(8);
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${H}', 'Hina School', 'IN-HR');
      insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${H}', 'early-warning', true, 'plan'), ('${H}', 'school-auditor', true, 'plan');
      delete from platform_settings where key = '${HANDLED_TYPES_KEY}';`);
    expect(await recordHandledTypes(platform, Object.keys(productionHandlers()))).toBe(false);
    expect(await handlersList()).toBeUndefined();
    await enqueueBoth();
    expect((await jobs('early_warning.nightly')).some((j) => j.school_id === H)).toBe(false);
    expect((await jobs('auditor.weekly')).some((j) => j.school_id === H)).toBe(false);
    // Put back as the migration leaves it, with the list the runner writes.
    await db.pg.query(`insert into platform_settings (key, value) values ($1, '[]')`, [HANDLED_TYPES_KEY]);
    await recordHandledTypes(platform, Object.keys(productionHandlers()));
    await db.pg.exec(`set session_replication_role = replica; delete from school_module_entitlements where school_id = '${H}'; delete from schools where school_id = '${H}'; set session_replication_role = origin;`);
  });

  it('no school session can run the enqueue functions or queue these jobs; only the owner’s scheduler does', async () => {
    const asApp = (sql: string, params: unknown[] = []) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db.pg.transaction(async (tx: any) => {
        await tx.query('set local role app_user');
        for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', 'principal'], ['app.current_user_id', u(11)]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
        return tx.query(sql, params);
      });
    await expect(asApp(`select public.early_warning_nightly_enqueue()`)).rejects.toThrow(/permission denied/);
    await expect(asApp(`select public.auditor_weekly_enqueue()`)).rejects.toThrow(/permission denied/);
    await expect(asApp(`insert into jobs (type, payload, idempotency_key, school_id) values ('early_warning.nightly', '{}', 'x-nightly', $1)`, [A])).rejects.toThrow(/row-level security/);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const as = (sql: string) => db.pg.transaction(async (tx: any) => (await tx.query(`set local role ${role}`), tx.query(sql)));
      await expect(as(`select public.early_warning_nightly_enqueue()`), role).rejects.toThrow(/permission denied/);
      await expect(as(`select public.auditor_weekly_enqueue()`), role).rejects.toThrow(/permission denied/);
    }
  });

  it('the scheduler’s entries: 00:20 in India each night, 00:30 in India each Monday', () => {
    const dir = path.join(ROOT, 'supabase/migrations');
    const sql = readFileSync(path.join(dir, readdirSync(dir).find((f) => f.endsWith('_c210_schedules.sql'))!), 'utf8');
    expect(sql).toContain(`cron.schedule('early-warning-nightly', '50 18 * * *', 'select public.early_warning_nightly_enqueue()')`);
    expect(sql).toContain(`cron.schedule('auditor-weekly', '0 19 * * 0', 'select public.auditor_weekly_enqueue()')`);
  });
});

describe('the session a check runs in is reachable from the job runner only', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(path.join(dir, f)).isDirectory() ? files(path.join(dir, f)) : [path.join(dir, f)]));
  const src = files(path.join(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f));
  const importing = (what: RegExp) => src.filter((f) => what.test(readFileSync(f, 'utf8'))).map((f) => path.relative(ROOT, f)).sort();

  it('only the jobs folder opens it, and nothing a request reaches imports the jobs that use it', () => {
    expect(importing(/\bwithSchoolJobContext\b/)).toEqual(['src/lib/auth/db.ts', 'src/lib/jobs/school-context.ts']);
    expect(importing(/from '(@\/lib\/jobs|\.)\/school-context'/)).toEqual(['src/lib/jobs/school-checks.ts', 'src/lib/jobs/handlers.ts'].sort());
    expect(importing(/from '(@\/lib\/jobs|\.)\/school-checks'/)).toEqual(['src/lib/jobs/handlers.ts']);
    // The job's name is set in one place only.
    expect(importing(/set_config\('app\.current_job'/)).toEqual(['src/lib/auth/db.ts']);
  });
});

describe('Monitoring: the two checks among the scheduled runs, counts and ages only', () => {
  it('the state of a night’s jobs taken together: the worst first', () => {
    expect(schoolCheckState([], false)).toEqual({ state: 'not_needed', attempts: 0 });
    expect(schoolCheckState([], true)).toEqual({ state: 'not_queued', attempts: 0 });
    expect(schoolCheckState([{ status: 'succeeded', attempts: 1 }, { status: 'succeeded', attempts: 2 }], true)).toEqual({ state: 'ran', attempts: 2 });
    expect(schoolCheckState([{ status: 'succeeded', attempts: 1 }, { status: 'pending', attempts: 0 }], true)).toEqual({ state: 'queued', attempts: 0 });
    expect(schoolCheckState([{ status: 'pending', attempts: 0 }, { status: 'pending', attempts: 3 }], true)).toEqual({ state: 'retrying', attempts: 3 });
    expect(schoolCheckState([{ status: 'pending', attempts: 3 }, { status: 'running', attempts: 1 }], true)).toEqual({ state: 'running', attempts: 1 });
    expect(schoolCheckState([{ status: 'running', attempts: 1 }, { status: 'dead', attempts: 5 }, { status: 'succeeded', attempts: 1 }], true)).toEqual({ state: 'failed', attempts: 5 });
  });

  it('last night’s and last week’s jobs of live schools, with how many finished and when the last one did; never a school’s name', async () => {
    const put = (type: string, school: string, date: string, status: string, attempts: number, ago: string) =>
      `('${type}', '{}', '${type}:${school}:${date}', '${school}', '${status}', ${attempts}, 5, ${status === 'succeeded' || status === 'dead' ? `now() - interval '${ago}'` : 'null'}, ${status === 'dead' ? `'${type}: the check was refused'` : 'null'})`;
    await db.pg.exec(`insert into jobs (type, payload, idempotency_key, school_id, status, attempts, max_attempts, completed_at, last_error) values
      ${put('early_warning.nightly', A, YESTERDAY, 'succeeded', 1, '20 hours')}, ${put('early_warning.nightly', D, YESTERDAY, 'dead', 5, '19 hours')},
      ${put('early_warning.nightly', G, YESTERDAY, 'dead', 5, '19 hours')}`);
    const m = await withPlatformService((c) => loadMonitoring(c));
    // The test school's dead job is not counted; the live schools' are: one finished, one gave up.
    expect(m.schoolChecks.earlyWarning).toMatchObject({ type: 'early_warning.nightly', forDate: YESTERDAY, state: 'failed', attempts: 5, queued: 2, ran: 1 });
    // The last one finished is tonight's own (the runner above), seconds ago.
    expect(m.schoolChecks.earlyWarning.lastRanSeconds).toBeLessThan(600);
    // The week yesterday was in: this week's check-ups, which the runner ran above (live schools: A, B, D); on a
    // Monday, last week's, which nobody queued here.
    expect(m.schoolChecks.auditor).toMatchObject({ type: 'auditor.weekly', forDate: LAST_WEEK, ...(LAST_WEEK === MONDAY ? { state: 'ran', queued: 3, ran: 3 } : { state: 'not_queued', queued: 0, ran: 0 }) });
    expect(needsALook(m).nightly).toBe(true);
    // The dead job of last night is first in the list of failed jobs, where its Retry is.
    expect(m.jobs.failed[0]).toMatchObject({ type: 'early_warning.nightly', state: 'dead' });

    const html = page(m);
    expect(html).toContain('data-monitoring-school-check="earlyWarning" data-monitoring-school-check-state="failed"');
    expect(html).toContain('data-monitoring-school-check-counts="1/2"');
    expect(html).toContain('data-monitoring-do="schoolChecks.failed"');
    expect(html).toContain('Early Warning, each night');
    expect(html).toContain('School Health Auditor, each week');
    const block = html.slice(html.indexOf('data-monitoring-school-checks'), html.indexOf('data-monitoring-missing='));
    for (const name of Object.values(NAMES)) expect(block, name).not.toContain(name);
  });

  it('with no live school having the module on, nothing was needed', async () => {
    await db.pg.exec(`delete from jobs where type in ('early_warning.nightly', 'auditor.weekly'); update school_module_entitlements set enabled = false where module_id in ('early-warning', 'school-auditor') and school_id <> '${G}'`);
    const m = await withPlatformService((c) => loadMonitoring(c));
    expect(m.schoolChecks.earlyWarning).toMatchObject({ state: 'not_needed', queued: 0, ran: 0, lastRanSeconds: null });
    expect(m.schoolChecks.auditor).toMatchObject({ state: 'not_needed', queued: 0 });
    const html = page(m);
    expect(html).toContain('data-monitoring-school-check="auditor" data-monitoring-school-check-state="not_needed"');
    expect(html).not.toContain('data-monitoring-do="schoolChecks.');
  });
});
