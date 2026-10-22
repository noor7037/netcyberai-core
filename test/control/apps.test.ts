import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { GET as appsGet } from '@/app/api/control/apps/route';
import { POST as flagsPost } from '@/app/api/control/apps/flags/route';
import { POST as versionPost } from '@/app/api/control/apps/version/route';
import { POST as bannersPost } from '@/app/api/control/apps/banners/route';
import { POST as bannersEndPost } from '@/app/api/control/apps/banners/end/route';
import { POST as previewRemovePost } from '@/app/api/control/apps/preview/remove/route';
import { POST as undoPost } from '@/app/api/control/apps/undo/route';
import { GET as familyGet } from '@/app/api/control/family/route';
import { liveBuild, loadControlApps, parseFlagInput } from '@/lib/control/apps';
import { AppsView } from '@/components/control/apps/AppsView';
import { activeBanner, flagOn, moduleOn, rolloutBucket, type AppBanner, type AppFlag } from '@/lib/contracts/app-flags';

// The routes run on the real migrations (PGlite), as the platform role. Only the connection helper is replaced: it
// does what withTenantContext does (SET LOCAL ROLE nca_super) on the test database.
const h = vi.hoisted(() => ({ db: null as unknown as { pg: any; stop?: () => Promise<void> } }));
vi.mock('@/lib/auth/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/db')>();
  return {
    ...real,
    withTenantContext: (claims: { role: string }, fn: (db: unknown) => Promise<unknown>) =>
      h.db.pg.transaction(async (tx: { query: (sql: string, p?: unknown[]) => Promise<unknown> }) => {
        await tx.query(`set local role ${claims.role === 'super_admin' ? 'nca_super' : 'app_user'}`);
        return fn(tx);
      }),
  };
});

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const NOW = new Date('2026-10-21T10:00:00Z');
const flag = (over: Partial<AppFlag> = {}): AppFlag => ({
  app: 'family',
  module: 'practice',
  enabled: true,
  audience: 'everyone',
  audiencePercent: null,
  audienceSchools: null,
  reason: null,
  endsAt: null,
  offMessageEn: null,
  offMessageHi: null,
  ...over,
});
const anyone = { accountId: 'a1000000-0000-4000-8000-000000000001', isPreview: false };

describe('flagOn', () => {
  it('a missing row is off, a disabled row is off', () => {
    expect(flagOn(undefined, anyone, NOW)).toBe(false);
    expect(flagOn(flag({ enabled: false }), anyone, NOW)).toBe(false);
  });
  it('everyone is on for everyone, signed in or not', () => {
    expect(flagOn(flag(), anyone, NOW)).toBe(true);
    expect(flagOn(flag(), { accountId: null, isPreview: false }, NOW)).toBe(true);
  });
  it('an end date in the past is off, one in the future is on', () => {
    expect(flagOn(flag({ endsAt: new Date('2026-10-21T09:59:59Z') }), anyone, NOW)).toBe(false);
    expect(flagOn(flag({ endsAt: NOW }), anyone, NOW)).toBe(false);
    expect(flagOn(flag({ endsAt: new Date('2026-10-22T00:00:00Z') }), anyone, NOW)).toBe(true);
  });
  it('staff_preview is on only for preview accounts', () => {
    const f = flag({ audience: 'staff_preview' });
    expect(flagOn(f, anyone, NOW)).toBe(false);
    expect(flagOn(f, { ...anyone, isPreview: true }, NOW)).toBe(true);
  });
  it('schools is on only for a listed school', () => {
    const f = flag({ audience: 'schools', audienceSchools: ['s1'] });
    expect(flagOn(f, { ...anyone, schoolId: 's1' }, NOW)).toBe(true);
    expect(flagOn(f, { ...anyone, schoolId: 's2' }, NOW)).toBe(false);
    expect(flagOn(f, anyone, NOW)).toBe(false);
    expect(flagOn(flag({ audience: 'schools', audienceSchools: [] }), { ...anyone, schoolId: 's1' }, NOW)).toBe(false);
  });
  it('percent: 0 is nobody, 100 is everybody, and no account is never in', () => {
    expect(flagOn(flag({ audience: 'percent', audiencePercent: 0 }), anyone, NOW)).toBe(false);
    expect(flagOn(flag({ audience: 'percent', audiencePercent: 100 }), anyone, NOW)).toBe(true);
    expect(flagOn(flag({ audience: 'percent', audiencePercent: 100 }), { accountId: null, isPreview: false }, NOW)).toBe(false);
  });
  it('percent: the bucket is stable, in 0..99, and a larger share only adds accounts', () => {
    const ids = Array.from({ length: 400 }, (_, i) => `acct-${i}-${(i * 7919).toString(16)}`);
    for (const id of ids) {
      const b = rolloutBucket(id);
      expect(b).toBe(rolloutBucket(id));
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(100);
    }
    const inAt = (p: number) => ids.filter((id) => flagOn(flag({ audience: 'percent', audiencePercent: p }), { accountId: id, isPreview: false }, NOW));
    const ten = inAt(10);
    const fifty = inAt(50);
    expect(ten.every((id) => fifty.includes(id))).toBe(true);
    expect(ten.length).toBeGreaterThan(10);
    expect(ten.length).toBeLessThan(80);
    expect(fifty.length).toBeGreaterThan(140);
    expect(fifty.length).toBeLessThan(260);
  });
});

describe('moduleOn', () => {
  const whole = flag({ module: '*' });
  it('is on when the module and the whole app are on', () => {
    expect(moduleOn([whole, flag()], 'family', 'practice', anyone, NOW)).toBe(true);
  });
  it('the whole-app switch off turns every module off, and a missing one counts as off', () => {
    expect(moduleOn([flag({ module: '*', enabled: false }), flag()], 'family', 'practice', anyone, NOW)).toBe(false);
    expect(moduleOn([flag()], 'family', 'practice', anyone, NOW)).toBe(false);
    expect(moduleOn([flag({ module: '*', enabled: false })], 'family', '*', anyone, NOW)).toBe(false);
  });
  it('a missing module is off, and another app’s rows do not count', () => {
    expect(moduleOn([whole], 'family', 'practice', anyone, NOW)).toBe(false);
    expect(moduleOn([whole, flag({ app: 'teacher' })], 'family', 'practice', anyone, NOW)).toBe(false);
    expect(moduleOn([whole], 'family', '*', anyone, NOW)).toBe(true);
  });
});

describe('activeBanner', () => {
  const banner = (over: Partial<AppBanner> = {}): AppBanner => ({
    bannerId: 'b1',
    app: 'family',
    tone: 'info',
    textEn: 'Maintenance tonight',
    textHi: 'आज रात रखरखाव',
    startsAt: new Date('2026-10-21T08:00:00Z'),
    endsAt: new Date('2026-10-21T12:00:00Z'),
    endedAt: null,
    ...over,
  });
  it('shows a banner between its start and its end', () => {
    expect(activeBanner([banner()], 'family', NOW)?.bannerId).toBe('b1');
  });
  it('not before the start, not at or after the end, not once ended by hand, not for another app', () => {
    expect(activeBanner([banner({ startsAt: new Date('2026-10-21T10:00:01Z') })], 'family', NOW)).toBeNull();
    expect(activeBanner([banner({ endsAt: NOW })], 'family', NOW)).toBeNull();
    expect(activeBanner([banner({ endedAt: new Date('2026-10-21T09:00:00Z') })], 'family', NOW)).toBeNull();
    expect(activeBanner([banner()], 'teacher', NOW)).toBeNull();
    expect(activeBanner([], 'family', NOW)).toBeNull();
  });
  it('the most recently started wins', () => {
    const newer = banner({ bannerId: 'b2', startsAt: new Date('2026-10-21T09:00:00Z') });
    expect(activeBanner([newer, banner()], 'family', NOW)?.bannerId).toBe('b2');
  });
});

describe('liveBuild', () => {
  it('the first 7 characters of the commit and the deploy time, when the environment gives them', () => {
    expect(liveBuild({ VERCEL_GIT_COMMIT_SHA: '0123456789abcdef0123456789abcdef01234567', NCA_DEPLOYED_AT: '2026-10-20T10:30:00Z' })).toEqual({ commit: '0123456', deployedAt: '2026-10-20T10:30:00.000Z' });
  });
  it('not known when it does not', () => {
    expect(liveBuild({})).toEqual({ commit: null, deployedAt: null });
    expect(liveBuild({ VERCEL_GIT_COMMIT_SHA: 'not a sha' })).toEqual({ commit: null, deployedAt: null });
  });
});

// --- The routes, on the real schema -----------------------------------------------------------------------------

const FOUNDER = randomUUID();
const PRINCIPAL = randomUUID();
const PARENT = randomUUID();
const SCHOOL = randomUUID();
const PREVIEW = randomUUID();

async function cookieFor(sub: string, role: string, aal: 'aal1' | 'aal2', schoolId: string | null = null) {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal, sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
const req = (path: string, body?: unknown, cookie?: string) =>
  new NextRequest(`https://www.netcyberai.test${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  });
const q = async (sql: string, params: unknown[] = []) => (await h.db.pg.query(sql, params)).rows as any[];
const auditRows = (action: string) => q(`select audit_id::text as id, school_id, actor_user_id, before_state, after_state, target_id from audit_log where event_action = $1 order by audit_id`, [action]);

let founder = '';
let founderAal1 = '';
let principal = '';
let parent = '';

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-apps-route-tests-0123456789abcdef';
  h.db = await startHarnessDb({ port: 0 });
  await h.db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${SCHOOL}', 'Made-up School', 'IN-HR');
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${FOUNDER}', null, 'founder@example.invalid', 'super_admin', 'Farid Founder', true),
      ('${PRINCIPAL}', '${SCHOOL}', 'p@example.invalid', 'principal', 'Priya Principal', true);
    insert into control.preview_accounts (account_id, added_by) values ('${PREVIEW}', '${FOUNDER}');
  `);
  founder = await cookieFor(FOUNDER, 'super_admin', 'aal2');
  founderAal1 = await cookieFor(FOUNDER, 'super_admin', 'aal1');
  principal = await cookieFor(PRINCIPAL, 'principal', 'aal2', SCHOOL);
  parent = await cookieFor(PARENT, 'parent', 'aal2');
}, 120_000);
afterAll(async () => {
  await h.db?.stop?.();
});

const flagBody = (over: Record<string, unknown> = {}) => ({ app: 'family', module: 'practice', enabled: false, audience: 'everyone', reason: 'Practice answers look wrong', ...over });
const changeRoutes: [string, (r: NextRequest) => Promise<Response> | Response, unknown][] = [
  ['flags', flagsPost, flagBody()],
  ['version', versionPost, { app: 'family', minShellVersion: 3, reason: 'x' }],
  ['banners', bannersPost, { app: 'family', tone: 'info', textEn: 'a', textHi: 'b', endsAt: '2030-01-01T00:00:00Z', reason: 'x' }],
  ['banners/end', bannersEndPost, { bannerId: randomUUID(), reason: 'x' }],
  ['preview/remove', previewRemovePost, { accountId: PREVIEW, reason: 'x' }],
  ['undo', undoPost, { auditId: '1' }],
];

describe('who is let in', () => {
  it('no session: 401 on every route', async () => {
    expect((await appsGet(req('/api/control/apps'))).status).toBe(401);
    expect((await familyGet(req('/api/control/family'))).status).toBe(401);
    for (const [name, route, body] of changeRoutes) expect((await route(req(`/api/control/apps/${name}`, body))).status, name).toBe(401);
  });
  it('school staff and a parent: 403 on every route', async () => {
    for (const cookie of [principal, parent]) {
      expect((await appsGet(req('/api/control/apps', undefined, cookie))).status).toBe(403);
      expect((await familyGet(req('/api/control/family', undefined, cookie))).status).toBe(403);
      for (const [name, route, body] of changeRoutes) expect((await route(req(`/api/control/apps/${name}`, body, cookie))).status, name).toBe(403);
    }
  });
  it('the founder at aal1 may read but changes nothing', async () => {
    expect((await appsGet(req('/api/control/apps', undefined, founderAal1))).status).toBe(200);
    expect((await familyGet(req('/api/control/family', undefined, founderAal1))).status).toBe(200);
    for (const [name, route, body] of changeRoutes) {
      const res = await route(req(`/api/control/apps/${name}`, body, founderAal1));
      expect(res.status, name).toBe(403);
      expect((await res.json()).code).toBe('aal2');
    }
    expect(await auditRows('app_flag.set')).toHaveLength(0);
    expect((await q(`select enabled from control.app_flags where app = 'family' and module = 'practice'`))[0].enabled).toBe(true);
  });
});

describe('a change is audited with its before and after, and can be undone', () => {
  it('a module switched off: the row changes, one audit row (platform-level) holds before, after and the reason', async () => {
    const res = await flagsPost(req('/api/control/apps/flags', flagBody(), founder));
    expect(res.status).toBe(200);
    expect((await q(`select enabled, reason, updated_by from control.app_flags where app = 'family' and module = 'practice'`))[0]).toMatchObject({ enabled: false, reason: 'Practice answers look wrong', updated_by: FOUNDER });
    const [row] = await auditRows('app_flag.set');
    expect(row.school_id).toBeNull();
    expect(row.actor_user_id).toBe(FOUNDER);
    expect(row.target_id).toBe('family:practice');
    expect(row.before_state).toMatchObject({ module: 'practice', enabled: true, audience: 'everyone', reason: 'M1' });
    expect(row.after_state).toMatchObject({ module: 'practice', enabled: false, change_reason: 'Practice answers look wrong' });
  });
  it('a change without a reason, with a bad audience, share or school list, or a reason over 300 characters is refused and writes nothing', async () => {
    const before = (await auditRows('app_flag.set')).length;
    for (const bad of [{ reason: '' }, { reason: '  ' }, { reason: 'x'.repeat(301) }, { audience: 'nobody' }, { audience: 'percent', audiencePercent: 101 }, { audience: 'percent' }, { audience: 'schools', audienceSchools: [] }, { audience: 'schools', audienceSchools: ['not-an-id'] }, { module: 'Bad Module' }, { app: 'control' }, { endsAt: 'tomorrow-ish' }, { endsAt: '2020-01-01T00:00:00Z' }, { offMessageEn: 'x'.repeat(301) }]) {
      const res = await flagsPost(req('/api/control/apps/flags', flagBody(bad), founder));
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect(await auditRows('app_flag.set')).toHaveLength(before);
  });
  it('an end time already past is refused with its own words, since it would save a switch "on" that is off (C230-W)', async () => {
    const res = await flagsPost(req('/api/control/apps/flags', flagBody({ enabled: true, endsAt: new Date(Date.now() - 60_000).toISOString() }), founder));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('ends_past');
    const at = new Date('2026-10-22T16:01:59Z');
    expect(parseFlagInput({ ...flagBody({ endsAt: '2026-10-22T16:01:00Z' }) }, at)).toEqual({ ok: false, code: 'ends_past' });
    expect(parseFlagInput({ ...flagBody({ endsAt: '2026-10-22T18:00:00Z' }) }, at)).toMatchObject({ ok: true, value: { endsAt: '2026-10-22T18:00:00.000Z' } });
  });
  it('Undo restores the before state in one step, is itself audited, and works once', async () => {
    const [change] = await auditRows('app_flag.set');
    const res = await undoPost(req('/api/control/apps/undo', { auditId: change.id }, founder));
    expect(res.status).toBe(200);
    expect((await q(`select enabled, reason from control.app_flags where app = 'family' and module = 'practice'`))[0]).toEqual({ enabled: true, reason: 'M1' });
    const [undo] = await auditRows('app_change.undo');
    expect(undo.school_id).toBeNull();
    expect(undo.after_state).toMatchObject({ undoes: change.id, enabled: true });
    expect((await undoPost(req('/api/control/apps/undo', { auditId: change.id }, founder))).status).toBe(409);
    expect((await undoPost(req('/api/control/apps/undo', { auditId: '999999' }, founder))).status).toBe(404);
  });
  it('a percentage rollout and a listed-schools audience are stored as given; undoing a newly created flag switches it off', async () => {
    expect((await flagsPost(req('/api/control/apps/flags', flagBody({ module: 'tutor', enabled: true, audience: 'percent', audiencePercent: 25, reason: 'Start small' }), founder))).status).toBe(200);
    expect((await flagsPost(req('/api/control/apps/flags', flagBody({ module: 'tutor', enabled: true, audience: 'schools', audienceSchools: [SCHOOL], offMessageEn: 'Back soon', offMessageHi: 'जल्द वापस', reason: 'Only one school' }), founder))).status).toBe(200);
    expect((await q(`select audience, audience_percent, audience_schools, off_message_hi from control.app_flags where module = 'tutor'`))[0]).toEqual({ audience: 'schools', audience_percent: null, audience_schools: [SCHOOL], off_message_hi: 'जल्द वापस' });
    const [created, second] = (await auditRows('app_flag.set')).filter((r) => r.target_id === 'family:tutor');
    expect(created.before_state).toBeNull();
    await undoPost(req('/api/control/apps/undo', { auditId: second.id }, founder));
    expect((await q(`select audience, audience_percent from control.app_flags where module = 'tutor'`))[0]).toEqual({ audience: 'percent', audience_percent: 25 });
    await undoPost(req('/api/control/apps/undo', { auditId: created.id }, founder));
    // A flag row cannot be deleted by Control (no DELETE right), so undoing its creation switches it off: a missing row is off too.
    expect((await q(`select enabled from control.app_flags where module = 'tutor'`))[0].enabled).toBe(false);
  });
  it('the whole-app switch is module "*", for everyone only', async () => {
    expect((await flagsPost(req('/api/control/apps/flags', flagBody({ module: '*', audience: 'percent', audiencePercent: 5 }), founder))).status).toBe(400);
    expect((await flagsPost(req('/api/control/apps/flags', flagBody({ module: '*', enabled: false, reason: 'Incident' }), founder))).status).toBe(200);
    expect((await q(`select enabled from control.app_flags where app = 'family' and module = '*'`))[0].enabled).toBe(false);
    const rows = await auditRows('app_flag.set');
    await undoPost(req('/api/control/apps/undo', { auditId: rows[rows.length - 1].id }, founder));
    expect((await q(`select enabled from control.app_flags where app = 'family' and module = '*'`))[0].enabled).toBe(true);
  });
  it('the oldest accepted version: changed with a reason, audited, undone', async () => {
    expect((await versionPost(req('/api/control/apps/version', { app: 'family', minShellVersion: 4, reason: 'Old shell breaks sign-in' }, founder))).status).toBe(200);
    expect((await q(`select min_shell_version from control.app_versions where app = 'family'`))[0].min_shell_version).toBe(4);
    for (const bad of [{ minShellVersion: -1 }, { minShellVersion: 1.5 }, { minShellVersion: '3' }, { reason: '' }]) {
      expect((await versionPost(req('/api/control/apps/version', { app: 'family', minShellVersion: 4, reason: 'x', ...bad }, founder))).status).toBe(400);
    }
    const [row] = await auditRows('app_version.set');
    expect(row.before_state).toEqual({ min_shell_version: 0 });
    expect(row.after_state).toEqual({ min_shell_version: 4, change_reason: 'Old shell breaks sign-in' });
    await undoPost(req('/api/control/apps/undo', { auditId: row.id }, founder));
    expect((await q(`select min_shell_version from control.app_versions where app = 'family'`))[0].min_shell_version).toBe(0);
  });
  it('a banner: put up, ended by hand (once), and each step undone', async () => {
    const body = { app: 'teacher', tone: 'warning', textEn: 'Maintenance tonight', textHi: 'आज रात रखरखाव', startsAt: '2026-10-21T08:00:00Z', endsAt: '2099-01-01T00:00:00Z', reason: 'Planned work' };
    expect((await bannersPost(req('/api/control/apps/banners', { ...body, endsAt: '2020-01-01T00:00:00Z' }, founder))).status).toBe(400);
    expect((await bannersPost(req('/api/control/apps/banners', { ...body, textHi: '' }, founder))).status).toBe(400);
    const made = await bannersPost(req('/api/control/apps/banners', body, founder));
    expect(made.status).toBe(200);
    const { bannerId } = await made.json();
    expect((await q(`select tone, text_hi, created_by from control.app_banners where banner_id = $1`, [bannerId]))[0]).toEqual({ tone: 'warning', text_hi: 'आज रात रखरखाव', created_by: FOUNDER });
    expect((await bannersEndPost(req('/api/control/apps/banners/end', { bannerId, reason: 'Done early' }, founder))).status).toBe(200);
    expect((await q(`select ended_at from control.app_banners where banner_id = $1`, [bannerId]))[0].ended_at).not.toBeNull();
    expect((await bannersEndPost(req('/api/control/apps/banners/end', { bannerId, reason: 'Again' }, founder))).status).toBe(409);
    expect((await bannersEndPost(req('/api/control/apps/banners/end', { bannerId: randomUUID(), reason: 'x' }, founder))).status).toBe(404);
    const [end] = await auditRows('app_banner.end');
    expect(end.after_state).toMatchObject({ banner_id: bannerId, change_reason: 'Done early' });
    await undoPost(req('/api/control/apps/undo', { auditId: end.id }, founder));
    expect((await q(`select ended_at from control.app_banners where banner_id = $1`, [bannerId]))[0].ended_at).toBeNull();
    const [create] = await auditRows('app_banner.create');
    expect(create.before_state).toBeNull();
    await undoPost(req('/api/control/apps/undo', { auditId: create.id }, founder));
    expect((await q(`select ended_at from control.app_banners where banner_id = $1`, [bannerId]))[0].ended_at).not.toBeNull();
  });
  it('a preview account: removed with a reason, audited, put back by Undo', async () => {
    expect((await previewRemovePost(req('/api/control/apps/preview/remove', { accountId: PREVIEW, reason: '' }, founder))).status).toBe(400);
    expect((await previewRemovePost(req('/api/control/apps/preview/remove', { accountId: PREVIEW, reason: 'Left the team' }, founder))).status).toBe(200);
    expect(await q(`select 1 from control.preview_accounts`)).toHaveLength(0);
    const [row] = await auditRows('preview_account.remove');
    expect(row.before_state).toMatchObject({ account_id: PREVIEW, added_by: FOUNDER });
    await undoPost(req('/api/control/apps/undo', { auditId: row.id }, founder));
    expect((await q(`select account_id, added_by from control.preview_accounts`))[0]).toEqual({ account_id: PREVIEW, added_by: FOUNDER });
  });
  it('the read lists the changes, newest first, with those already undone marked', async () => {
    const data = await (await appsGet(req('/api/control/apps', undefined, founder))).json();
    expect(data.changes.length).toBeGreaterThan(5);
    expect(Number(data.changes[0].audit_id)).toBeGreaterThan(Number(data.changes[1].audit_id));
    expect(data.changes.some((c: { undone: boolean }) => c.undone)).toBe(true);
    expect(data.changes.filter((c: { event_action: string }) => c.event_action === 'app_change.undo').every((c: { undoable: boolean }) => !c.undoable)).toBe(true);
    expect(data.flags.map((f: { module: string }) => f.module)[0]).toBe('*');
    expect(data.schools).toEqual([{ id: SCHOOL, name: 'Made-up School' }]);
    expect(Object.keys(data.minShell).sort()).toEqual(['family', 'school_web', 'teacher']);
  });
});

describe('the page', () => {
  it('draws the three apps with the whole-app switch, the modules, the banner form, the preview accounts and the changes, in both languages', async () => {
    const data = await h.db.pg.transaction(async (tx: { query: (s: string) => Promise<unknown> }) => {
      await tx.query('set local role nca_super');
      return loadControlApps(tx as never);
    });
    for (const lang of ['en', 'hi'] as const) {
      const html = renderToStaticMarkup(createElement(AppsView, { data, build: { commit: '0123456', deployedAt: '2026-10-20T10:30:00.000Z' }, lang, now: new Date() }));
      for (const app of ['family', 'teacher', 'school_web']) {
        expect(html).toContain(`data-app="${app}"`);
        expect(html).toContain(`data-kill-switch="${app}"`);
        expect(html).toContain(`data-banner-form="${app}"`);
      }
      expect(html).toContain('data-kill-state="on"');
      expect(html).toContain('data-flag="family:practice"');
      expect(html).toContain('0123456');
      expect(html).toContain('href="/control/schools"');
      expect(html).toContain(`data-preview-account="${PREVIEW}"`);
      expect(html).toContain('data-change=');
    }
    expect(renderToStaticMarkup(createElement(AppsView, { data, build: { commit: null, deployedAt: null }, lang: 'en', now: new Date() }))).toContain('Not known here');
  });
});
