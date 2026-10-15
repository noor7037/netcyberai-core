import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { loadSchoolBrand, logoAddress, readSchoolLogo, updateSchoolBranding, type BrandingActor } from '@/lib/school/branding';
import { FileStorageUnavailableError, MemoryFileStorage, type FileStorage } from '@/lib/storage/file-storage';

// C235-B: a school's official name and logo. Only the principal and the school admin of that school change them (and
// NetCyberAI's founder from Control); every change is audited by ids, never with the picture or the name; another
// school's row is never touched. On the whole schema, as the app's own database role and as the platform role. Every
// school and person here is made up.

const u = (n: number) => `c235b000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const [PRINCIPAL, ADMIN, COORDINATOR, TEACHER, ACCOUNTANT, PARENT, B_PRINCIPAL, FOUNDER] = [u(11), u(12), u(13), u(14), u(15), u(16), u(21), u(91)];
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (w: number, h: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0]);
const ids = (() => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
})();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR };
const teacher: Who = { role: 'teacher', user: TEACHER };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const parent: Who = { role: 'parent', user: PARENT };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <R>(who: Who, fn: (client: any) => Promise<R>): Promise<R> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school ?? A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <R>(fn: (client: any) => Promise<R>): Promise<R> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    for (const [k, v] of [['app.current_tenant_id', '00000000-0000-0000-0000-000000000000'], ['app.current_role', 'super_admin'], ['app.current_user_id', FOUNDER]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const actor = (who: Who): BrandingActor => ({ userId: who.user, role: who.role as BrandingActor['role'] });
const attempt = (who: Who, sql: string, params: unknown[] = []) => as(who, (c) => c.query(sql, params).then((r: { rowCount: number }) => `changed ${r.rowCount}`, (e: Error) => e.message));
const row = async (school: string) => (await db.pg.query(`select name, address, logo_path, logo_updated_at, updated_at from schools where school_id = $1`, [school])).rows[0];
const audits = async (school: string) => (await db.pg.query(`select actor_user_id, actor_role::text as actor_role, target_type, target_id, before_state, after_state from audit_log where school_id = $1 and event_action = 'school.branding_updated' order by audit_id`, [school])).rows;

const storage = new MemoryFileStorage();

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, address, jurisdiction) values
      ('${A}', 'Made-up School A', 'Old Road', 'IN-HR'), ('${B}', 'Made-up School B', 'Far Road', 'IN-DL');
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'principal@a.example', 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'admin@a.example', 'school_admin', 'Asif Admin'),
      ('${COORDINATOR}', '${A}', 'coordinator@a.example', 'academic_coordinator', 'Chitra Coordinator'), ('${TEACHER}', '${A}', 'teacher@a.example', 'teacher', 'Tara Teacher'),
      ('${ACCOUNTANT}', '${A}', 'accounts@a.example', 'accountant', 'Anil Accountant'), ('${PARENT}', '${A}', 'parent@a.example', 'parent', 'Pooja Parent'),
      ('${B_PRINCIPAL}', '${B}', 'principal@b.example', 'principal', 'Bela Principal'), ('${FOUNDER}', null, 'founder@platform.example', 'super_admin', 'Farid Founder');
  `);
}, 120_000);
afterAll(async () => db?.stop());

describe('the school’s name and logo (C235-B)', () => {
  it('the principal sets the name and a logo: the file is kept under the school’s own prefix, the row names it, and its version moves', async () => {
    const done = await as(principal, (c) => updateSchoolBranding(c, storage, actor(principal), A, { name: '  Made-up   Public School A ', logo: png(512, 256) }, ids));
    expect(done).toMatchObject({ ok: true, name: 'Made-up Public School A', changed: { name: true, logo: 'set' } });
    const r = await row(A);
    expect(r.logo_path).toBe(`${A}/branding/logo-00000000-0000-4000-8000-000000000001.png`);
    expect(r.logo_updated_at).not.toBeNull();
    expect(done.ok && done.logoVersion).toBe(String(new Date(r.logo_updated_at).getTime()));
    expect(storage.files.get(r.logo_path)).toMatchObject({ contentType: 'image/png' });
    // What the header reads, and the address it asks.
    expect(await as(principal, (c) => loadSchoolBrand(c, A))).toEqual({ name: 'Made-up Public School A', logoVersion: done.ok ? done.logoVersion : null });
    expect(logoAddress('123', A)).toBe(`/api/branding/logo?school=${A}&v=123`);
    expect(logoAddress(null, A)).toBeNull();
  });

  it('every change is audited by ids and what changed: never the picture, never the name', async () => {
    const [first] = await audits(A);
    expect(first).toMatchObject({ actor_user_id: PRINCIPAL, actor_role: 'principal', target_type: 'schools', target_id: A, before_state: null });
    expect(first.after_state).toEqual({ nameChanged: true, logo: 'set', logoType: 'image/png', logoBytes: 33, width: 512, height: 256 });
    expect(JSON.stringify(first)).not.toMatch(/Made-up|base64|branding\/logo/);
  });

  it('the school admin replaces the logo: the old file is removed after the row moves on, and the version changes', async () => {
    const before = await row(A);
    const done = await as(admin, (c) => updateSchoolBranding(c, storage, actor(admin), A, { logo: png(128, 128) }, ids));
    expect(done).toMatchObject({ ok: true, changed: { name: false, logo: 'set' } });
    const after = await row(A);
    expect(after.logo_path).toBe(`${A}/branding/logo-00000000-0000-4000-8000-000000000002.png`);
    expect(storage.files.has(before.logo_path)).toBe(false);
    expect(storage.files.has(after.logo_path)).toBe(true);
    expect(new Date(after.logo_updated_at).getTime()).toBeGreaterThan(new Date(before.logo_updated_at).getTime());
    // The school admin renames the school too.
    expect(await as(admin, (c) => updateSchoolBranding(c, storage, actor(admin), A, { name: 'Made-up School A' }, ids))).toMatchObject({ ok: true, changed: { name: true, logo: 'kept' } });
    expect((await row(A)).name).toBe('Made-up School A');
    // Saving what is already there changes nothing and writes no audit row.
    const count = (await audits(A)).length;
    expect(await as(admin, (c) => updateSchoolBranding(c, storage, actor(admin), A, { name: 'Made-up School A' }, ids))).toMatchObject({ ok: true, changed: { name: false, logo: 'kept' } });
    expect((await audits(A)).length).toBe(count);
  });

  it('the logo is read back for the school’s own sessions; never a file outside the school’s prefix', async () => {
    const logo = await as(parent, (c) => readSchoolLogo(c, storage, A));
    expect(logo?.type).toBe('image/png');
    expect(logo?.bytes).toEqual(png(128, 128));
    // A school with no logo, and a key that is not this school's, give nothing.
    expect(await platform((c) => readSchoolLogo(c, storage, B))).toBeNull();
    expect(await as({ ...principal, school: B, user: B_PRINCIPAL }, (c) => readSchoolLogo(c, storage, A))).toBeNull(); // A's row is not B's to read
  });

  it('a teacher, the accountant, the coordinator and a parent are refused, in the code and by the database', async () => {
    const before = await row(A);
    for (const who of [teacher, accountant, coordinator, parent]) {
      expect(await as(who, (c) => updateSchoolBranding(c, storage, actor(who), A, { name: 'Taken Over', logo: png(64, 64) }, ids)), who.role).toEqual({ ok: false, reason: 'not_allowed' });
      expect(await attempt(who, `update schools set name = 'Taken Over' where school_id = $1`, [A]), who.role).toBe('changed 0');
      expect(await attempt(who, `update schools set logo_path = null where school_id = $1`, [A]), who.role).toBe('changed 0');
    }
    expect(await row(A)).toEqual(before);
    expect([...storage.files.keys()].filter((k) => !k.endsWith('000000000002.png'))).toEqual([]);
  });

  it('another school’s row is not theirs: nothing changes there, and no file is left behind', async () => {
    const before = await row(B);
    const keys = storage.files.size;
    expect(await as(principal, (c) => updateSchoolBranding(c, storage, actor(principal), B, { name: 'Taken Over', logo: png(64, 64) }, ids))).toEqual({ ok: false, reason: 'not_found' });
    expect(await attempt(principal, `update schools set logo_path = $2 where school_id = $1`, [B, `${B}/branding/logo-00000000-0000-4000-8000-000000000099.png`])).toBe('changed 0');
    expect(await row(B)).toEqual(before);
    expect(storage.files.size).toBe(keys);
  });

  it('the database holds the logo to the school’s own prefix and shape, and keeps its version itself', async () => {
    // Another school's file, another area of the bucket, or any other shape is refused.
    for (const path of [`${B}/branding/logo-00000000-0000-4000-8000-000000000099.png`, `${A}/documents/x/birth/00000000-0000-4000-8000-000000000099.png`, `${A}/branding/logo-00000000-0000-4000-8000-000000000099.svg`, `${A}/branding/../${B}/branding/logo-00000000-0000-4000-8000-000000000099.png`])
      expect(await attempt(principal, `update schools set logo_path = $2 where school_id = $1`, [A, path]), path).toMatch(/schools_logo_path_shape/);
    // The version is the database's: the app's role cannot set it, and it is not a profile column.
    expect(await attempt(principal, `update schools set logo_updated_at = now() - interval '1 day' where school_id = $1`, [A])).toMatch(/permission denied/);
    // A blank name is refused by the database too.
    expect(await attempt(principal, `update schools set name = '   ' where school_id = $1`, [A])).toMatch(/schools_name_not_blank/);
  });

  it('the founder sets a school’s name and logo from Control, and removes a logo; both audited as the platform', async () => {
    const set = await platform((c) => updateSchoolBranding(c, storage, { userId: FOUNDER, role: 'super_admin' }, B, { name: 'Made-up School B Onboarded', logo: png(256, 64) }, ids));
    expect(set).toMatchObject({ ok: true, name: 'Made-up School B Onboarded', changed: { name: true, logo: 'set' } });
    const key = (await row(B)).logo_path;
    expect(key).toMatch(new RegExp(`^${B}/branding/logo-`));
    const removed = await platform((c) => updateSchoolBranding(c, storage, { userId: FOUNDER, role: 'super_admin' }, B, { removeLogo: true }, ids));
    expect(removed).toMatchObject({ ok: true, logoVersion: null, changed: { name: false, logo: 'removed' } });
    expect(await row(B)).toMatchObject({ logo_path: null, logo_updated_at: null });
    expect(storage.files.has(key)).toBe(false);
    expect((await audits(B)).map((a: { actor_role: string; after_state: { logo: string } }) => [a.actor_role, a.after_state.logo])).toEqual([['super_admin', 'set'], ['super_admin', 'removed']]);
  });

  it('a file that is not a picture, a name too short, or a storage that is down changes nothing', async () => {
    const before = await row(A);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(await as(principal, (c) => updateSchoolBranding(c, storage, actor(principal), A, { logo: svg }, ids))).toEqual({ ok: false, reason: 'logo_not_image' });
    expect(await as(principal, (c) => updateSchoolBranding(c, storage, actor(principal), A, { name: 'X', logo: png(64, 64) }, ids))).toEqual({ ok: false, reason: 'name_blank' });
    const down: FileStorage = { put: async () => Promise.reject(new FileStorageUnavailableError()), signedUrl: async () => '', remove: async () => undefined };
    expect(await as(principal, (c) => updateSchoolBranding(c, down, actor(principal), A, { name: 'Made-up School A Renamed', logo: png(64, 64) }, ids))).toEqual({ ok: false, reason: 'storage_unavailable' });
    expect(await row(A)).toEqual(before);
  });
});
