import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// C230-D's school-side parent logins move to the Family app (M3-9, C340; C230-AD answer 2), on the real schema.
//   1. Only when a Family app account has linked that same guardian with the school's code: never another guardian's
//      link, never a closed link, never by guess.
//   2. At its next sign-in the old login retires: user and membership off, audited once; its sessions are refused at once.
//   3. The guardian record, its children's links and the school's records stay.
//   4. Only a parent's own session can retire its login.

const A = 'dc000000-0000-4000-8000-00000000000a';
const PRINCIPAL = 'dc000000-0000-4000-8000-0000000000a1';
const P1 = 'dc000000-0000-4000-8000-0000000000e1';
const P2 = 'dc000000-0000-4000-8000-0000000000e2';
const S1 = 'dc000000-0000-4000-8000-0000000005a1';
const C5A = 'dc000000-0000-4000-8000-0000000000c5';
const ACCOUNT = 'fa000000-0000-4000-8000-0000000000a1';
const LINK_P2 = 'fa000000-0000-4000-8000-0000000000b2';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = (role: string, user: string, fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (c: any) => {
    await c.query(`set local role app_user`);
    for (const [k, v] of Object.entries({ 'app.current_tenant_id': A, 'app.current_role': role, 'app.current_user_id': user })) await c.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(c);
  });
const moved = (parent: string) => as('parent', parent, async (c) => (await c.query(`select public.parent_login_moved() as m`)).rows[0].m);
const retire = (parent: string) => as('parent', parent, async (c) => (await c.query(`select public.retire_moved_parent_login() as r`)).rows[0].r);
const live = async (user: string) => (await q(`select u.is_active as user_on, m.is_active as membership_on from users u join memberships m on m.user_id = u.user_id where u.user_id = $1`, [user]))[0];

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true),
      ('${P1}', '${A}', 'p1@login.netcyberai.com', 'parent', 'Rajesh Parent', true),
      ('${P2}', '${A}', 'p2@login.netcyberai.com', 'parent', 'Sunita Parent', true);
    insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true), ('${P1}', '${A}', 'parent', true), ('${P2}', '${A}', 'parent', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${C5A}', '${A}', '5-A', '5', 'A');
    insert into students (student_id, school_id, admission_no, name, class_id, status) values ('${S1}', '${A}', 'A-1', 'Aarav Child', '${C5A}', 'active');
    insert into parents (parent_id, school_id, name, phone, relation) values ('${P1}', '${A}', 'Rajesh Parent', '9800000001', 'Father'), ('${P2}', '${A}', 'Sunita Parent', '9800000002', 'Mother');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${P1}', '${S1}');
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'family@example.org');
  `);
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('an old parent login moves only through the school’s code (C340)', () => {
  it('has not moved while no Family app account has linked its guardian: nothing changes', async () => {
    expect(await moved(P1)).toBe(false);
    expect(await retire(P1)).toBe(false);
    expect(await live(P1)).toEqual({ user_on: true, membership_on: true });
  });

  it('another guardian’s link, or a closed link, moves nothing', async () => {
    await q(`insert into family.school_links (link_id, account_id, school_id, parent_id, revoked_at, revoked_by) values ($1, $2, $3, $4, now(), 'family')`, [LINK_P2, ACCOUNT, A, P2]);
    expect(await moved(P2)).toBe(false);
    expect(await retire(P2)).toBe(false);
    await q(`insert into family.school_links (account_id, school_id, parent_id) values ($1, $2, $3)`, [ACCOUNT, A, P2]);
    expect(await moved(P1)).toBe(false);
    expect(await retire(P1)).toBe(false);
    expect(await live(P1)).toEqual({ user_on: true, membership_on: true });
  });

  it('once its guardian is linked, the next sign-in retires it once, audited; its sessions are refused at once', async () => {
    await q(`update family.school_links set revoked_at = now(), revoked_by = 'family' where parent_id = $1 and revoked_at is null`, [P2]);
    await q(`insert into family.school_links (account_id, school_id, parent_id) values ($1, $2, $3)`, [ACCOUNT, A, P1]);
    expect(await moved(P1)).toBe(true);
    expect(await retire(P1)).toBe(true);
    expect(await live(P1)).toEqual({ user_on: false, membership_on: false });
    expect(await q(`select actor_user_id, actor_role::text as role, event_action, target_id, after_state from audit_log where event_action = 'parent_login.moved_to_family'`)).toEqual([
      { actor_user_id: P1, role: 'parent', event_action: 'parent_login.moved_to_family', target_id: P1, after_state: { active: false, moved: 'family_app' } },
    ]);
    expect(await retire(P1)).toBe(false);
    expect(await q(`select count(*)::int as n from audit_log where event_action = 'parent_login.moved_to_family'`)).toEqual([{ n: 1 }]);
    const { withTenantContext, SessionRevokedError } = await import('@/lib/auth/db');
    await expect(
      withTenantContext({ sub: P1, role: 'parent', schoolId: A, membershipId: 'x', tokenVersion: 0, aal: 'aal1', sessionId: 's' }, async () => 'read')
    ).rejects.toBeInstanceOf(SessionRevokedError);
  });

  it('the guardian record, its child’s link and the other guardian’s login stay', async () => {
    expect(await q(`select parent_id from parents order by parent_id`)).toEqual([{ parent_id: P1 }, { parent_id: P2 }]);
    expect(await q(`select parent_id, student_id from parent_student_map`)).toEqual([{ parent_id: P1, student_id: S1 }]);
    expect(await live(P2)).toEqual({ user_on: true, membership_on: true });
  });

  it('only a parent’s own session can retire its login', async () => {
    const said = async (fn: () => Promise<unknown>) => fn().then(() => 'ran', (e: Error) => String(e.message));
    expect(await said(() => as('principal', PRINCIPAL, (c) => c.query(`select public.retire_moved_parent_login()`)))).toMatch(/only a parent/);
    expect(await as('principal', PRINCIPAL, async (c) => (await c.query(`select public.parent_login_moved() as m`)).rows[0].m)).toBe(false);
    const { withFamilyContext } = await import('@/lib/auth/db');
    expect(await said(() => withFamilyContext({ accountId: ACCOUNT, tokenVersion: 0 }, (c) => c.query(`select public.retire_moved_parent_login()`)))).toMatch(/permission denied/);
    // The Family app's guardian door sets the same parent settings inside a Family account's session: refused there too.
    const asGuardianInFamily = await as('parent', P2, async (c) => {
      await c.query(`select set_config('app.current_account_id', '${ACCOUNT}', true)`);
      return c.query(`select public.retire_moved_parent_login()`).then(() => 'ran', (e: Error) => String(e.message));
    }).catch((e: Error) => String(e.message));
    expect(asGuardianInFamily).toMatch(/only a parent/);
  });
});
