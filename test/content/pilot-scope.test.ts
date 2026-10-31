import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// W12-D: the pilot scope on the real migrations (PGlite). The migration leaves the setting empty; the founder sets it
// through the route and reads the same value back; an audit row names the change with its before and after; a bad
// value is refused and stores nothing; a school principal and a visitor are refused; "Pilot only" keeps the units inside
// the scope and, with no scope set, none; the coverage export honours &pilot=1. Every name here is made up.

const h = vi.hoisted(() => ({ db: null as unknown as { pg: { transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>; query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }; stop: () => Promise<void> } }));

vi.mock('@/lib/auth/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/db')>();
  return {
    ...real,
    withTenantContext: (claims: { role: string; sub: string; schoolId: string | null }, fn: (db: unknown) => Promise<unknown>) =>
      h.db.pg.transaction(async (tx: any) => {
        await tx.query(`set local role ${claims.role === 'super_admin' ? 'nca_super' : 'app_user'}`);
        await tx.query(`select set_config('app.current_tenant_id', $1, true)`, [claims.schoolId ?? '00000000-0000-0000-0000-000000000000']);
        await tx.query(`select set_config('app.current_role', $1, true)`, [claims.role]);
        await tx.query(`select set_config('app.current_user_id', $1, true)`, [claims.sub]);
        return fn(tx);
      }),
  };
});

// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { EMPTY_PILOT_SCOPE, PILOT_SCOPE_SETTING, inPilot, parsePilotScope, pilotOnly, readPilotScope, type PilotScope } from '@/lib/content/pilot-scope';
import { GET as getScope, POST as postScope } from '@/app/api/control/content/pilot/route';
import { GET as exportRoute } from '@/app/api/control/content/coverage/export/route';
import type { Sql } from '@/lib/jobs/types';

const FOUNDER = 'c9e00000-0000-4000-8000-0000000000f1';
const PRINCIPAL = 'c9e00000-0000-4000-8000-0000000000a1';
const SCHOOL = 'c9e00000-0000-4000-8000-0000000000b1';
const SRC = 'https://example.org/syllabus.pdf';
const q = async (sql: string, params: unknown[] = []) => (await h.db.pg.query(sql, params)).rows;
const asStaff = <T>(fn: (db: Sql) => Promise<T>): Promise<T> =>
  h.db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });

let founder = '';
let principal = '';

async function cookieFor(sub: string, role: string, schoolId: string | null) {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal: role === 'super_admin' ? 'aal2' : 'aal1', sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
const url = 'https://www.netcyberai.test/api/control/content/pilot';
const read = (cookie: string | null) => getScope(new NextRequest(url, { headers: cookie ? { cookie } : {} }));
const write = (cookie: string | null, body: unknown) =>
  postScope(new NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
const exported = (cookie: string, search: string) => exportRoute(new NextRequest(`https://www.netcyberai.test/api/control/content/coverage/export${search}`, { headers: { cookie } }));
const stored = async () => (await q(`select value from control.settings where key = $1`, [PILOT_SCOPE_SETTING]))[0]?.value;

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-pilot-scope-tests-0123456789';
  h.db = await startHarnessDb({ port: 0 });
  await q(`insert into schools (school_id, name, jurisdiction) values ($1, 'Made-up School', 'IN-HR')`, [SCHOOL]);
  await q(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Farid Founder'), ($2, $3, 'principal', 'Priya Principal')`, [FOUNDER, PRINCIPAL, SCHOOL]);
  founder = await cookieFor(FOUNDER, 'super_admin', null);
  principal = await cookieFor(PRINCIPAL, 'principal', SCHOOL);

  // Two published syllabi, one unit each: Class 7 Science and Class 8 Maths.
  for (const [cls, subject, key, title] of [[7, 'science', 'cbse.c7.science.u1', 'Living world'], [8, 'maths', 'cbse.c8.maths.u1', 'Numbers']] as const) {
    const v = (
      await q(
        `insert into content.syllabus_versions (board_id, class_level, subject, academic_year, version_no, status, audience, import_source, approved_by)
         values ('CBSE', $1, $2, '2026-27', 1, 'published', 'everyone', 'repository', $3) returning version_id`,
        [cls, subject, FOUNDER]
      )
    )[0].version_id as string;
    await q(`insert into content.units (version_id, unit_key, position, title_en, source_url, source_page, checked_on) values ($1, $2, 1, $3, $4, '1', '2026-10-20')`, [v, key, title, SRC]);
  }
}, 120_000);

afterAll(async () => {
  await h.db?.stop();
});

const scope = (over: Partial<PilotScope>): PilotScope => ({ ...EMPTY_PILOT_SCOPE, ...over });
const units = [
  { boardId: 'CBSE', classLevel: 7, subject: 'science' },
  { boardId: 'CBSE', classLevel: 8, subject: 'maths' },
  { boardId: 'ICSE', classLevel: 7, subject: 'science' },
];

describe('the setting', () => {
  it('starts empty from the migration', async () => {
    expect(await stored()).toEqual({ boardId: null, classLevels: [], subjects: [] });
    expect(await asStaff((db) => readPilotScope(db))).toEqual(EMPTY_PILOT_SCOPE);
    const got = await (await read(founder)).json();
    expect(got.scope).toEqual(EMPTY_PILOT_SCOPE);
  });

  it('round-trips through the route and leaves one audit row with the before and after', async () => {
    const res = await write(founder, { boardId: 'CBSE', classLevels: [7, 6, 7], subjects: ['science', 'maths'] });
    expect(res.status).toBe(200);
    const want = { boardId: 'CBSE', classLevels: [6, 7], subjects: ['maths', 'science'] };
    expect((await res.json()).scope).toEqual(want);
    expect(await stored()).toEqual(want);
    expect((await (await read(founder)).json()).scope).toEqual(want);
    const rows = await q(`select actor_role, before_state, after_state from audit_log where event_action = 'content.pilot_scope_changed'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_role).toBe('super_admin');
    expect(rows[0].before_state.value).toEqual(EMPTY_PILOT_SCOPE);
    expect(rows[0].after_state.value).toEqual(want);
  });

  it('refuses a value that is not a scope and stores nothing', async () => {
    const before = await stored();
    for (const bad of [{ boardId: 'cbse lower', classLevels: [], subjects: [] }, { boardId: 'CBSE', classLevels: [13], subjects: [] }, { boardId: 'CBSE', classLevels: [1.5], subjects: [] }, { boardId: null, classLevels: [], subjects: ['Science!'] }, { boardId: null, classLevels: 'all', subjects: [] }, [], 'nope']) {
      expect((await write(founder, bad)).status).toBe(400);
    }
    expect((await write(founder, 'not json')).status).toBe(400);
    expect(await stored()).toEqual(before);
    expect(await q(`select 1 from audit_log where event_action = 'content.pilot_scope_changed'`)).toHaveLength(1);
  });

  it('refuses a school principal (403) and a visitor (401), and changes nothing', async () => {
    const before = await stored();
    expect((await read(null)).status).toBe(401);
    expect((await read(principal)).status).toBe(403);
    expect((await write(null, EMPTY_PILOT_SCOPE)).status).toBe(401);
    expect((await write(principal, EMPTY_PILOT_SCOPE)).status).toBe(403);
    expect(await stored()).toEqual(before);
  });

  it('clears when all three parts are empty', async () => {
    expect((await write(founder, EMPTY_PILOT_SCOPE)).status).toBe(200);
    expect(await stored()).toEqual(EMPTY_PILOT_SCOPE);
    expect(await q(`select 1 from audit_log where event_action = 'content.pilot_scope_changed'`)).toHaveLength(2);
  });

  it('reads a damaged stored value as empty, never as everything', async () => {
    await q(`update control.settings set value = '{"classLevels": [99]}'::jsonb where key = $1`, [PILOT_SCOPE_SETTING]);
    expect(await asStaff((db) => readPilotScope(db))).toEqual(EMPTY_PILOT_SCOPE);
    await q(`update control.settings set value = $2::jsonb where key = $1`, [PILOT_SCOPE_SETTING, JSON.stringify(EMPTY_PILOT_SCOPE)]);
  });
});

describe('the filter', () => {
  it('keeps only the units in scope', () => {
    expect(pilotOnly(scope({ boardId: 'CBSE' }), units)).toEqual([units[0], units[1]]);
    expect(pilotOnly(scope({ boardId: 'CBSE', classLevels: [7] }), units)).toEqual([units[0]]);
    expect(pilotOnly(scope({ classLevels: [7], subjects: ['science'] }), units)).toEqual([units[0], units[2]]);
    expect(pilotOnly(scope({ subjects: ['maths'] }), units)).toEqual([units[1]]);
    expect(pilotOnly(scope({ boardId: 'CBSE', classLevels: [9] }), units)).toEqual([]);
  });

  it('keeps none when no scope is set', () => {
    expect(inPilot(EMPTY_PILOT_SCOPE, units[0])).toBe(false);
    expect(pilotOnly(EMPTY_PILOT_SCOPE, units)).toEqual([]);
  });

  it('tidies a scope and refuses a malformed one', () => {
    expect(parsePilotScope({ boardId: '', classLevels: [8, 7, 8], subjects: ['maths', 'maths'] })).toEqual({ boardId: null, classLevels: [7, 8], subjects: ['maths'] });
    expect(parsePilotScope({ classLevels: [0] })).toBeNull();
    expect(parsePilotScope(null)).toBeNull();
  });

  it('the coverage export keeps the pilot units with &pilot=1 and none when nothing is set', async () => {
    const all = await (await exported(founder, '')).text();
    expect(all).toContain('Living world');
    expect(all).toContain('Numbers');
    expect(await (await exported(founder, '?pilot=1')).text()).not.toContain('Living world');
    await write(founder, { boardId: 'CBSE', classLevels: [7], subjects: [] });
    const pilot = await (await exported(founder, '?pilot=1')).text();
    expect(pilot).toContain('Living world');
    expect(pilot).not.toContain('Numbers');
    expect(await (await exported(founder, '')).text()).toContain('Numbers');
    expect((await exported(principal, '?pilot=1')).status).toBe(403);
  });
});
