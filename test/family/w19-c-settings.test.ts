import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { DEFAULT_CHILD_SETTINGS, checkSettingsPatch, parseChildSettings } from '@/lib/family/child-settings';

// W19-C: the child's own settings (family.child_settings), on the real migrations (PGlite). Read with the defaults
// before anything is saved, written through the route with the family session only (no parent PIN), for the child this
// phone has chosen; own account only, and on one child's phone that child only. Every name is made up.

const ACCOUNT = 'f1900000-0000-4000-8000-0000000000a1';
const OTHER = 'f1900000-0000-4000-8000-0000000000b1';
const ASHA = 'f1900000-0000-4000-8000-0000000000c1';
const KABIR = 'f1900000-0000-4000-8000-0000000000c2';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
const asFamily = <T>(account: string, child: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', $1, true)`, [account]);
    await tx.query(`select set_config('app.current_child_id', $1, true)`, [child ?? '']);
    return fn(tx);
  });
const cookie = async (account = ACCOUNT, child = ASHA) => {
  const { signFamilySession } = await import('@/lib/family/session');
  return `ncf_session=${await signFamilySession({ accountId: account, tokenVersion: 0, sessionId: 's1' })}; ncf_child=${child}`;
};
const call = async (method: 'GET' | 'PATCH', body?: unknown, account = ACCOUNT, child = ASHA) => {
  const route = await import('@/app/api/family/settings/route');
  const req = new NextRequest('http://localhost/api/family/settings', { method, headers: { 'content-type': 'application/json', cookie: await cookie(account, child) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await (method === 'GET' ? route.GET(req) : route.PATCH(req));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-child-settings-tests-0123456789';
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'settings@example.org'), ('${OTHER}', 'other@example.org');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${ASHA}', '${ACCOUNT}', 'Asha', 6, 'CBSE', 'en', 'en', 'IN-HR'), ('${KABIR}', '${ACCOUNT}', 'Kabir', 7, 'CBSE', 'en', 'en', 'IN-HR');
  `);
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('the settings shape', () => {
  it('fills the defaults and keeps only known keys with their shape', () => {
    expect(parseChildSettings(null)).toEqual(DEFAULT_CHILD_SETTINGS);
    expect(parseChildSettings({ readAloud: false, voiceSpeed: 'fast', motion: 'no', extra: 1 })).toEqual({ ...DEFAULT_CHILD_SETTINGS, readAloud: false });
    expect(checkSettingsPatch({ handsFree: true, voiceSpeed: 'slow' })).toEqual({ handsFree: true, voiceSpeed: 'slow' });
    for (const bad of [null, [], {}, { motion: 'off' }, { voiceSpeed: 'fast' }, { lang: 'hi' }, { readAloud: true, pin: '1234' }]) expect(checkSettingsPatch(bad)).toBeNull();
  });
});

describe('the settings route on the real migrations', () => {
  it('reads the defaults before anything is saved, then saves a change with the family session alone', async () => {
    expect(await call('GET')).toEqual({ status: 200, body: { settings: DEFAULT_CHILD_SETTINGS } });
    const saved = await call('PATCH', { readAloud: false, voiceSpeed: 'slow' });
    expect(saved).toEqual({ status: 200, body: { settings: { ...DEFAULT_CHILD_SETTINGS, readAloud: false, voiceSpeed: 'slow' } } });
    expect((await call('PATCH', { motion: false })).body.settings).toEqual({ ...DEFAULT_CHILD_SETTINGS, readAloud: false, voiceSpeed: 'slow', motion: false });
    expect((await call('GET')).body.settings).toEqual({ ...DEFAULT_CHILD_SETTINGS, readAloud: false, voiceSpeed: 'slow', motion: false });
    expect(await q(`select child_id from family.child_settings`)).toEqual([{ child_id: ASHA }]);
  });

  it('keeps each child apart: the chosen child only, the brother untouched', async () => {
    expect((await call('GET', undefined, ACCOUNT, KABIR)).body.settings).toEqual(DEFAULT_CHILD_SETTINGS);
    await call('PATCH', { tutorFace: false }, ACCOUNT, KABIR);
    expect((await call('GET', undefined, ACCOUNT, KABIR)).body.settings).toEqual({ ...DEFAULT_CHILD_SETTINGS, tutorFace: false });
    expect((await call('GET')).body.settings).toMatchObject({ tutorFace: true, readAloud: false });
  });

  it('refuses a bad change and a call without a session', async () => {
    expect((await call('PATCH', { voiceSpeed: 'fast' })).status).toBe(400);
    expect((await call('PATCH', { lang: 'hi' })).status).toBe(400);
    const route = await import('@/app/api/family/settings/route');
    expect((await route.GET(new NextRequest('http://localhost/api/family/settings'))).status).toBe(401);
  });

  it('is own account only, and on Asha’s phone her brother’s row is neither seen nor written', async () => {
    expect(await asFamily(OTHER, null, (tx) => tx.query(`select child_id from family.child_settings`).then((r) => r.rows))).toEqual([]);
    await expect(asFamily(OTHER, null, (tx) => tx.query(`insert into family.child_settings (account_id, child_id, settings) values ($1, $2, '{}')`, [ACCOUNT, ASHA]))).rejects.toThrow(/row-level security/);
    const seen = await asFamily(ACCOUNT, ASHA, (tx) => tx.query(`select child_id from family.child_settings`).then((r) => r.rows.map((x) => x.child_id)));
    expect(seen).toEqual([ASHA]);
    const changed = await asFamily(ACCOUNT, ASHA, (tx) => tx.query(`update family.child_settings set settings = '{}' where child_id = $1 returning child_id`, [KABIR]).then((r) => r.rows));
    expect(changed).toEqual([]);
    expect(await q(`select count(*)::int as n from information_schema.role_table_grants where table_schema = 'family' and table_name = 'child_settings' and grantee in ('app_user', 'anon', 'authenticated', 'PUBLIC')`)).toEqual([{ n: 0 }]);
  });

  it('goes with the child: deleting the child deletes the settings', async () => {
    await q(`delete from family.children where child_id = $1`, [KABIR]);
    expect(await q(`select child_id from family.child_settings`)).toEqual([{ child_id: ASHA }]);
  });
});
