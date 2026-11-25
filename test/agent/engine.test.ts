import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// The school agent's change requests (C546) on the whole schema as the app's own database role, through the school
// app's real class routes. Acceptance: a check changes nothing; going live commits exactly what was checked; a school
// that changed since the review gets nothing; a teacher cannot do what a teacher cannot do; one school cannot reach
// another; Preview shows the change and keeps nothing. Every name is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, db: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => {
  const real = await original<typeof import('@/lib/auth/db')>();
  const { agentTx, inSavepoint } = await import('@/lib/agent/ctx');
  return {
    ...real,
    // The same join as the real withTenantContext: inside the agent's transaction, a savepoint as the same person.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withTenantContext: async (claims: any, fn: any) => {
      const joined = agentTx.getStore();
      if (joined) {
        if (joined.userId !== claims.sub || joined.schoolId !== claims.schoolId) throw new Error('agent_tx_other_person');
        return inSavepoint(joined, fn);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (state.db as any).pg.transaction(async (tx: any) => {
        await tx.query('set local role app_user');
        for (const [k, v] of [['app.current_tenant_id', claims.schoolId], ['app.current_role', claims.role], ['app.current_user_id', claims.sub]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
        // pglite's transaction object has no release(); the engine only needs query().
        return fn(tx);
      });
    },
  };
});

import { applyPlan, checkPlan } from '@/lib/agent/engine';
import { agentTx } from '@/lib/agent/ctx';
import { previewSteps, replayForPreview } from '@/lib/agent/preview';
import { goLive, listRequests, newChat, recentMessages } from '@/lib/agent/requests';
import { withTenantContext } from '@/lib/auth/db';

const u = (n: number) => `a5460000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const [PRINCIPAL, TEACHER, TEACHER2, B_PRINCIPAL] = [u(11), u(12), u(13), u(14)];
const [C6A, CB] = [u(21), u(22)];
const auth = { origin: 'http://localhost', cookie: '', authorization: '' };
const claims = (user: string, role: string, school: string) => ({ sub: user, role, schoolId: school, membershipId: u(80), tokenVersion: 0, aal: 'aal1', sessionId: u(81) }) as never;
const principal = claims(PRINCIPAL, 'principal', A);
const teacher = claims(TEACHER, 'teacher', A);
const bPrincipal = claims(B_PRINCIPAL, 'principal', B);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const owner = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const as = (c: unknown) => {
  state.claims = c;
  return c as never;
};
const classNames = async (school = A) => (await owner(`select name from classes where school_id = $1 order by name`, [school])).map((r: { name: string }) => r.name);

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  state.db = db;
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, board, is_test_fixture) values ('${A}', 'School A', 'IN-HR', 'CBSE', true), ('${B}', 'School B', 'IN-DL', 'CBSE', true);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'p@a.example', 'principal', 'Priya Principal', true), ('${TEACHER}', '${A}', 't@a.example', 'teacher', 'Tara Teacher', true),
      ('${TEACHER2}', '${A}', 't2@a.example', 'teacher', 'Omar Teacher', true), ('${B_PRINCIPAL}', '${B}', 'p@b.example', 'principal', 'Bela Principal', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${C6A}', '${A}', '6-A', '6', 'A'), ('${CB}', '${B}', '6-A', '6', 'A');
    insert into school_module_entitlements (school_id, module_id, enabled, source) select s, 'setup', true, 'plan' from unnest(array['${A}', '${B}']::uuid[]) s
      on conflict (school_id, module_id) do update set enabled = true;
  `);
}, 120_000);
afterAll(async () => {
  await db?.stop?.();
});

const makeC = [{ endpoint: 'POST classes', body: { name: '6-C' } }];

describe('change requests (C546)', () => {
  it('a check runs the real route, records the change, and keeps nothing', async () => {
    const run = await checkPlan(as(principal), makeC, auth);
    expect(run.ok).toBe(true);
    expect(run.tier).toBe(1);
    expect(run.changes.map((c) => c.action)).toContain('class.create');
    expect(await classNames()).toEqual(['6-A']);
    // The same plan on the same school hashes the same, though the new class gets a new id each time.
    expect((await checkPlan(as(principal), makeC, auth)).hash).toBe(run.hash);
  });

  it('going live commits exactly what was checked, once', async () => {
    const run = await checkPlan(as(principal), makeC, auth);
    const out = await applyPlan(as(principal), makeC, auth, run.hash, async () => {});
    expect(out.ok).toBe(true);
    expect(await classNames()).toEqual(['6-A', '6-C']);
    // Again: the route now refuses (it exists), so nothing is applied twice.
    const again = await applyPlan(as(principal), makeC, auth, run.hash, async () => {});
    expect(again.ok).toBe(false);
    expect(await classNames()).toEqual(['6-A', '6-C']);
  });

  it('a school that changed since the review gets nothing', async () => {
    const plan = [{ endpoint: 'PATCH classes/:classId', params: { classId: C6A }, body: { classTeacherId: TEACHER } }];
    const run = await checkPlan(as(principal), plan, auth);
    expect(run.ok).toBe(true);
    await owner(`update classes set class_teacher_id = $1 where class_id = $2`, [TEACHER2, C6A]);
    const out = await applyPlan(as(principal), plan, auth, run.hash, async () => {});
    expect(out).toMatchObject({ ok: false, why: 'changed_since_review' });
    expect((await owner(`select class_teacher_id from classes where class_id = $1`, [C6A]))[0].class_teacher_id).toBe(TEACHER2);
  });

  it('a step fails as the person: a teacher cannot add a class', async () => {
    const run = await checkPlan(as(teacher), [{ endpoint: 'POST classes', body: { name: '6-D' } }], auth);
    expect(run.ok).toBe(false);
    expect(run.steps[0].status).toBe(403);
  });

  it('one school cannot reach another school', async () => {
    const run = await checkPlan(as(bPrincipal), [{ endpoint: 'PATCH classes/:classId', params: { classId: C6A }, body: { classTeacherId: null } }], auth);
    expect(run.ok).toBe(false);
    expect((await owner(`select class_teacher_id from classes where class_id = $1`, [C6A]))[0].class_teacher_id).toBe(TEACHER2);
    // A route joined to another person's agent transaction is refused outright.
    await expect(
      withTenantContext(bPrincipal, async (client) =>
        agentTx.run({ client, userId: PRINCIPAL, schoolId: A, mode: 'check', savepoints: 0 }, () => withTenantContext(bPrincipal, async () => 1))
      )
    ).rejects.toThrow('agent_tx_other_person');
  });

  it('an unknown or never-listed route is not run', async () => {
    for (const endpoint of ['POST fees/payments', 'POST attendance', 'POST users/:userId/send-reset', 'DELETE everything']) {
      const run = await checkPlan(as(principal), [{ endpoint }], auth);
      expect(run.ok).toBe(false);
    }
  });

  it('nothing leaves the transaction: no network inside it', async () => {
    await withTenantContext(as(principal), async (client) =>
      agentTx.run({ client, userId: PRINCIPAL, schoolId: A, mode: 'check', savepoints: 0 }, async () => {
        await expect(fetch('http://localhost:1/x')).rejects.toThrow('agent_tx_escape:network');
      })
    );
  });

  it('Preview shows the change on the screen and keeps nothing', async () => {
    const plan = [{ endpoint: 'POST classes', body: { name: '6-E' } }];
    const run = await checkPlan(as(principal), plan, auth);
    const [{ request_id: id }] = await owner(
      `insert into agent_requests (school_id, title, steps, tier, diff_hash, created_by, created_role) values ($1, 'Make 6-E', $2, 1, $3, $4, 'principal') returning request_id`,
      [A, JSON.stringify(plan), run.hash, PRINCIPAL]
    );
    vi.doMock('next/headers', () => ({ headers: () => new Headers({ host: 'localhost', 'x-forwarded-proto': 'http' }) }));
    const seen = await withTenantContext(as(principal), async (client) => {
      const names = await replayForPreview(client, principal, await previewSteps(client, principal, id), async () => (await client.query(`select name from classes where school_id = $1 order by name`, [A])).rows.map((r: { name: string }) => r.name));
      throw Object.assign(new Error('rollback'), { names });
    }).catch((e) => e.names);
    expect(seen).toContain('6-E');
    expect(await classNames()).not.toContain('6-E');

    // And the request goes live through goLive, by the person who asked for it.
    const live = await goLive(as(principal), id, auth);
    expect(live).toMatchObject({ ok: true });
    expect(await classNames()).toContain('6-E');
    expect((await owner(`select status, approved_by from agent_requests where request_id = $1`, [id]))[0]).toMatchObject({ status: 'live', approved_by: PRINCIPAL });
  });

  it('a live change whose class was later deleted shows as removed, not "Made live"', async () => {
    const before = (await listRequests(as(principal))).find((r) => r.title === 'Make 6-E');
    expect(before?.status).toBe('live');
    await owner(`delete from classes where school_id = $1 and name = '6-E'`, [A]);
    const after = (await listRequests(as(principal))).find((r) => r.title === 'Make 6-E');
    expect(after?.status).toBe('removed');
  });

  it('"New chat" hides what came before, from the screen and from the model', async () => {
    await owner(`insert into agent_messages (school_id, user_id, role, body) values ($1, $2, 'person', 'old ask'), ($1, $2, 'agent', 'old answer')`, [A, PRINCIPAL]);
    expect((await recentMessages(as(principal))).map((m) => m.body)).toContain('old answer');
    await newChat(as(principal));
    expect(await recentMessages(as(principal))).toEqual([]);
  });
});
