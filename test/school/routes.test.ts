import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// The branding routes (C235-B), as each person's own session: the principal and the school admin save the school's
// name and logo from Settings; a teacher, an accountant and a parent are refused; the founder does the same from
// Control; the logo is served to the school's own sessions (a parent's too), kept by the browser for a day, and to
// nobody else. Storage is the in-memory FileStorage. Every school and person here is made up.

const hoisted = vi.hoisted(() => ({ claims: null as unknown, run: null as unknown, storage: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => hoisted.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (hoisted.run as any)(claims, fn),
}));
vi.mock('@/lib/storage/supabase-file-storage', async () => {
  const { MemoryFileStorage } = await import('@/lib/storage/file-storage');
  hoisted.storage = new MemoryFileStorage();
  return { supabaseFileStorage: hoisted.storage };
});

import { GET as logoRoute } from '@/app/api/branding/logo/route';
import { POST as schoolRoute } from '@/app/api/app/school/branding/route';
import { GET as controlGet, POST as controlPost } from '@/app/api/control/schools/[schoolId]/branding/route';
import type { MemoryFileStorage } from '@/lib/storage/file-storage';

const u = (n: number) => `c235b100-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const [PRINCIPAL, ADMIN, TEACHER, ACCOUNTANT, PARENT, B_PRINCIPAL, FOUNDER] = [u(11), u(12), u(13), u(14), u(15), u(21), u(91)];
type Who = { role: string; user: string; school: string | null };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const admin: Who = { role: 'school_admin', user: ADMIN, school: A };
const teacher: Who = { role: 'teacher', user: TEACHER, school: A };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT, school: A };
const parent: Who = { role: 'parent', user: PARENT, school: A };
const bPrincipal: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
const founder: Who = { role: 'super_admin', user: FOUNDER, school: null };
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (w: number, h: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const signIn = (w: Who | null) => {
  hoisted.claims = w ? { sub: w.user, role: w.role, schoolId: w.school, membershipId: w.school ? u(100) : null, tokenVersion: 0 } : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hoisted.run = (claims: any, fn: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.pg.transaction(async (tx: any) => {
      await tx.query(claims.role === 'super_admin' ? 'set local role nca_super' : 'set local role app_user');
      for (const [k, v] of [['app.current_tenant_id', claims.schoolId ?? '00000000-0000-0000-0000-000000000000'], ['app.current_role', claims.role], ['app.current_user_id', claims.sub]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
      return fn(tx);
    });
};
const form = (fields: Record<string, string | Uint8Array>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string') f.set(k, v);
    else f.set(k, new Blob([v]), 'logo.png');
  }
  return f;
};
const post = async (w: Who, route: (req: NextRequest, ctx: { params: { schoolId: string } }) => Promise<Response>, path: string, fields: Record<string, string | Uint8Array>, schoolId = '') => {
  signIn(w);
  const body = new Response(form(fields));
  const bytes = new Uint8Array(await body.arrayBuffer());
  const req = new NextRequest(`http://school.example${path}`, { method: 'POST', body: bytes, headers: { 'content-type': body.headers.get('content-type')!, 'content-length': String(bytes.length) } });
  const res = await route(req, { params: { schoolId } });
  return { status: res.status, body: await res.json() };
};
const getLogo = async (w: Who | null, query = '') => {
  signIn(w);
  const res = await logoRoute(new NextRequest(`http://school.example/api/branding/logo${query}`));
  return { status: res.status, headers: res.headers, bytes: res.status === 200 ? new Uint8Array(await res.arrayBuffer()) : null };
};
const school = async (id: string) => (await db.pg.query(`select name, logo_path from schools where school_id = $1`, [id])).rows[0];

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'Made-up School A', 'IN-HR'), ('${B}', 'Made-up School B', 'IN-DL');
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'principal@a.example', 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'admin@a.example', 'school_admin', 'Asif Admin'),
      ('${TEACHER}', '${A}', 'teacher@a.example', 'teacher', 'Tara Teacher'), ('${ACCOUNTANT}', '${A}', 'accounts@a.example', 'accountant', 'Anil Accountant'),
      ('${PARENT}', '${A}', 'parent@a.example', 'parent', 'Pooja Parent'), ('${B_PRINCIPAL}', '${B}', 'principal@b.example', 'principal', 'Bela Principal'),
      ('${FOUNDER}', null, 'founder@platform.example', 'super_admin', 'Farid Founder');
  `);
}, 120_000);
afterAll(async () => db?.stop());

describe('the school’s branding routes (C235-B)', () => {
  it('the principal saves the name and a logo from Settings; the school admin replaces the logo', async () => {
    const saved = await post(principal, schoolRoute, '/api/app/school/branding', { name: 'Made-up Public School A', logo: png(512, 512) });
    expect(saved).toMatchObject({ status: 200, body: { name: 'Made-up Public School A', changed: { name: true, logo: 'set' } } });
    expect(saved.body.logoVersion).toMatch(/^\d+$/);
    expect((await school(A)).logo_path).toMatch(new RegExp(`^${A}/branding/logo-[0-9a-f-]{36}\\.png$`));
    const replaced = await post(admin, schoolRoute, '/api/app/school/branding', { name: 'Made-up Public School A', logo: png(256, 128) });
    expect(replaced).toMatchObject({ status: 200, body: { changed: { name: false, logo: 'set' } } });
    expect((hoisted.storage as MemoryFileStorage).files.size).toBe(1);
  });

  it('a teacher, the accountant and a parent are refused, and nothing changes', async () => {
    const before = await school(A);
    for (const who of [teacher, accountant]) expect((await post(who, schoolRoute, '/api/app/school/branding', { name: 'Taken Over', logo: png(64, 64) })).status, who.role).toBe(403);
    expect((await post(parent, schoolRoute, '/api/app/school/branding', { name: 'Taken Over' })).status).toBe(401); // a parent's session is never a staff session
    expect((await post(principal, controlPost, `/api/control/schools/${B}/branding`, { name: 'Taken Over' }, B)).status).toBe(403); // Control's route is the platform's only
    expect(await school(A)).toEqual(before);
    expect((await school(B)).name).toBe('Made-up School B');
  });

  it('a file that is not a PNG, JPEG or WebP is refused by its bytes, whatever it is called', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><script>alert(1)</script></svg>');
    expect(await post(principal, schoolRoute, '/api/app/school/branding', { logo: svg })).toMatchObject({ status: 400, body: { code: 'logo_not_image' } });
    expect(await post(principal, schoolRoute, '/api/app/school/branding', { logo: png(8, 8) })).toMatchObject({ status: 400, body: { code: 'logo_dimensions' } });
    expect(await post(principal, schoolRoute, '/api/app/school/branding', { name: ' ' })).toMatchObject({ status: 400, body: { code: 'name_blank' } });
  });

  it('the logo is served to the school’s own sessions, a parent’s too, kept privately for a day, with its own type', async () => {
    for (const who of [principal, teacher, parent]) {
      const got = await getLogo(who, '?v=1');
      expect(got.status, who.role).toBe(200);
      expect(got.headers.get('content-type')).toBe('image/png');
      expect(got.headers.get('cache-control')).toBe('private, max-age=86400');
      expect(got.headers.get('x-content-type-options')).toBe('nosniff');
      expect(got.bytes).toEqual(png(256, 128));
    }
    // Another school's session asking for A's is refused, and gets its own school's (none yet); nobody signed in gets nothing.
    expect((await getLogo(bPrincipal, `?school=${A}&v=1`)).status).toBe(403);
    expect((await getLogo(parent, `?school=${B}&v=1`)).status).toBe(403);
    expect((await getLogo(bPrincipal, `?school=${B}&v=1`)).status).toBe(404);
    expect((await getLogo(null)).status).toBe(401);
  });

  it('the founder sets a school’s name and logo from Control, and sees its logo by naming the school', async () => {
    expect((await getLogo(founder)).status).toBe(400); // Control names the school
    expect((await getLogo(founder, `?school=${A}&v=1`)).status).toBe(200);
    const set = await post(founder, controlPost, `/api/control/schools/${B}/branding`, { name: 'Made-up School B Onboarded', logo: png(128, 128) }, B);
    expect(set).toMatchObject({ status: 200, body: { name: 'Made-up School B Onboarded', changed: { name: true, logo: 'set' } } });
    signIn(founder);
    const read = await controlGet(new NextRequest(`http://school.example/api/control/schools/${B}/branding`), { params: { schoolId: B } });
    expect(await read.json()).toEqual({ name: 'Made-up School B Onboarded', logoVersion: set.body.logoVersion });
    // B's principal now sees B's new logo; the audit row is the platform's.
    expect((await getLogo(bPrincipal, '?v=2')).bytes).toEqual(png(128, 128));
    const audit = (await db.pg.query(`select actor_role::text as role from audit_log where school_id = $1 and event_action = 'school.branding_updated'`, [B])).rows;
    expect(audit).toEqual([{ role: 'super_admin' }]);
  });
});
