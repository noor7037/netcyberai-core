import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { STAND_IN_PROVIDER } from '@/lib/ai/adapters';
import { draft } from '@/lib/copilot/copilot';
import { AiUnavailableError, schoolProvider } from '@/lib/ai/school-provider';

// M2-10 (C284): Copilot and Parent AI on the AI platform, as app_user on the real migrations (PGlite). School staff
// read only the two school profiles and the provider list, and write none of them; with no profile switched on there
// is no provider (Copilot says so); with one, a draft goes through the platform (here the stand-in adapter, which
// sends nothing anywhere), is metered in Control's counts, and never touches a family's daily cap; a refusal turns
// into "no provider", never an error page. Made-up names only.

const A = 'ad000000-0000-4000-8000-000000000001';
const T1 = 'ad000000-0000-4000-8000-0000000000a2';
const C5 = 'ad000000-0000-4000-8000-0000000000c1';
const MATHS = 'ad000000-0000-4000-8000-0000000000d1';
const UNIT = 'ad000000-0000-4000-8000-0000000000e1';
const DAY = '2026-10-22';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asTeacher = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    await tx.query(`select set_config('app.current_tenant_id', $1, true)`, [A]);
    await tx.query(`select set_config('app.current_role', 'teacher', true)`);
    await tx.query(`select set_config('app.current_user_id', $1, true)`, [T1]);
    return fn(tx);
  });
const refused = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error('expected the database to refuse');
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  // The platform's stand-in adapter (tests only, never in a production build) answers without sending anything.
  process.env.AI_PLATFORM_STAND_IN = 'on';
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR');
    insert into users (user_id, school_id, email, phone, role, display_name) values ('${T1}', '${A}', 't1@a.invalid', null, 'teacher', 'Tarun Teacher');
    insert into classes (class_id, school_id, name, grade, section, class_teacher_id) values ('${C5}', '${A}', '5-A', '5', 'A', '${T1}');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Maths');
    insert into syllabus_units (unit_id, school_id, class_id, subject_id, position, chapter, topic) values ('${UNIT}', '${A}', '${C5}', '${MATHS}', 1, 'Fractions', 'Comparing two fractions');
    insert into school_module_entitlements (school_id, module_id, enabled, source, limits) values ('${A}', 'teacher-copilot', true, 'founder_override', '{"monthly_tokens": 100000}');
    insert into control.ai_providers (provider_id) values ('${STAND_IN_PROVIDER}') on conflict do nothing;
  `);
}, 120_000);
afterAll(async () => {
  delete process.env.AI_PLATFORM_STAND_IN;
  await db?.stop();
});

describe('what school staff may reach in Control', () => {
  it('reads only the two school profiles, and writes none', async () => {
    const ids = await asTeacher(async (c) => (await c.query(`select profile_id from control.ai_profiles order by profile_id`)).rows.map((r: { profile_id: string }) => r.profile_id));
    expect(ids).toEqual(['copilot.draft', 'parent_ai.home_help']);
    expect(await refused(() => asTeacher((c) => c.query(`update control.ai_profiles set enabled = false where profile_id = 'copilot.draft'`)))).toMatch(/permission denied|row-level security/);
    expect(await refused(() => asTeacher((c) => c.query(`select * from control.settings`)))).toMatch(/permission denied/);
    expect(await refused(() => asTeacher((c) => c.query(`select * from control.ai_credentials`)))).toMatch(/permission denied/);
  });
});

describe('Copilot through the platform', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lessonPlan = (c: any, provider: Awaited<ReturnType<typeof schoolProvider>>) =>
    draft(c, provider, { schoolId: A, userId: T1, role: 'teacher' as never }, { kind: 'lesson_plan', classId: C5, subjectId: MATHS, unitId: UNIT });
  // The provider is made and used in the request's own transaction, as the route does.
  const ask = () => asTeacher(async (c) => lessonPlan(c, await schoolProvider(c, A, DAY)));

  it('no profile switched on: no provider, and Copilot says so', async () => {
    const provider = await asTeacher((c) => schoolProvider(c, A, DAY));
    expect(provider).toBeNull();
    expect(await ask()).toEqual({ ok: false, reason: 'off', why: 'no_provider' });
  });

  it("drafts through the copilot.draft profile, metered in Control's counts, never in a family's cap", async () => {
    await db.pg.query(`update control.ai_profiles set provider_id = $1, model = 'stand-in-model' where profile_id = 'copilot.draft'`, [STAND_IN_PROVIDER]);
    const result = await ask();
    expect(result.ok).toBe(true);
    const usage = (await db.pg.query(`select profile_id, provider_id, requests from control.ai_usage where profile_id = 'copilot.draft'`)).rows;
    expect(usage).toEqual([{ profile_id: 'copilot.draft', provider_id: STAND_IN_PROVIDER, requests: 1 }]);
    expect((await db.pg.query(`select count(*)::int as n from family.ai_daily`)).rows[0].n).toBe(0);
    expect((await db.pg.query(`select count(*)::int as n from ai_usage where school_id = $1`, [A])).rows[0].n).toBe(1);
  });

  it("a refusal (the profile switched off after the provider was made) is 'no provider', not an error", async () => {
    // Switched off between the provider being made and the draft: the platform refuses inside the same request.
    const result = await asTeacher(async (c) => {
      const provider = await schoolProvider(c, A, DAY);
      await c.query(`reset role`);
      await c.query(`update control.ai_profiles set enabled = false where profile_id = 'copilot.draft'`);
      await c.query(`set local role app_user`);
      return lessonPlan(c, provider);
    });
    expect(result).toEqual({ ok: false, reason: 'off', why: 'no_provider' });
  });

  it('Parent AI asks its own profile, and is refused while that one is off', async () => {
    await db.pg.query(`update control.ai_profiles set enabled = true where profile_id = 'copilot.draft'`);
    await expect(
      asTeacher(async (c) => (await schoolProvider(c, A, DAY))!.draft({ kind: 'home_help', classLevel: '5', subject: 'Maths', chapter: 'Fractions', topic: 'Comparing two fractions' }))
    ).rejects.toBeInstanceOf(AiUnavailableError);
  });
});
