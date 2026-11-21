import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { saveScheme, schemeInForce } from '@/lib/exams/schemes';
import { schemeFromPreset } from '@/lib/exams/scheme';
import { listBoards } from '@/lib/exams/boards';

// A new school starts with its board's grading preset, so results can be published on day one (the principal can
// still replace it). Through Control's create-school route, on the whole schema. Every name is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, tenant: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));
import { POST as createSchool } from '@/app/api/control/schools/route';

const FOUNDER = '9b000000-0000-4000-8000-000000000091';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asRole = <T>(role: string, school: string, user: string, fn: (c: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query(`set local role ${role === 'super_admin' ? 'nca_super' : 'app_user'}`);
    for (const [k, v] of [['app.current_tenant_id', school], ['app.current_role', role], ['app.current_user_id', user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const make = async (name: string, board: string) => {
  state.claims = { sub: FOUNDER, role: 'super_admin', schoolId: null, membershipId: null, tokenVersion: 0, aal: 'aal2', sessionId: '9b000000-0000-4000-8000-000000000092' };
  const res = await createSchool(new NextRequest('http://localhost/api/control/schools', { method: 'POST', body: JSON.stringify({ name, board, tenantType: 'school', jurisdiction: 'IN-HR' }) }));
  expect(res.status).toBe(201);
  return (await res.json()).school.school_id as string;
};
const inForce = (school: string) => asRole('super_admin', school, FOUNDER, (c) => schemeInForce(c, school));

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`insert into users (user_id, school_id, email, role, display_name, is_active) values ('${FOUNDER}', null, 'founder@platform.example', 'super_admin', 'Farid Founder', true);`);
  state.tenant = (c: { role: string; sub: string; schoolId: string | null }, fn: (x: unknown) => Promise<unknown>) => asRole(c.role, c.schoolId ?? '00000000-0000-0000-0000-000000000000', c.sub, fn as never);
}, 120_000);
afterAll(async () => db?.stop());

describe('a new school starts with its board scheme', () => {
  it('a CBSE school has the CBSE preset saved as version 1, audited as a system default', async () => {
    const id = await make('Cbse Test School', 'CBSE');
    const s = await inForce(id);
    const boards = await asRole('super_admin', id, FOUNDER, (c) => listBoards(c));
    const preset = boards.find((b) => b.boardId === 'cbse')!.presets[0];
    expect(s).toMatchObject({ version: 1, fromPresetId: preset.presetId });
    expect(s!.scheme).toEqual(schemeFromPreset(preset));
    const audit = await db.pg.query(`select event_action from audit_log where school_id = $1 and event_action like 'grading_scheme.%'`, [id]);
    expect(audit.rows.map((r: { event_action: string }) => r.event_action)).toEqual(['grading_scheme.default_applied']);
  });

  it('a school with no preset for its board has none, and the principal saves one as before', async () => {
    const id = await make('State Test School', 'STATE');
    expect(await inForce(id)).toBeNull();
  });

  it('the principal can replace the default, and the new version is in force', async () => {
    const id = await make('Cbse Second School', 'CBSE');
    const principal = '9b000000-0000-4000-8000-000000000011';
    await db.pg.query(`insert into users (user_id, school_id, email, role, display_name, is_active) values ($1, $2, 'p@second.example', 'principal', 'Priya Principal', true)`, [principal, id]);
    const first = (await inForce(id))!;
    const scheme = { ...first.scheme, passMark: 40 };
    const r = await asRole('principal', id, principal, (c) => saveScheme(c, { schoolId: id, userId: principal, role: 'principal' }, { scheme, fromPresetId: first.fromPresetId, basedOn: first.version }));
    expect(r).toEqual({ ok: true, version: 2 });
    expect((await inForce(id))!.scheme.passMark).toBe(40);
  });
});
