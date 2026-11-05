import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';
import { STAND_IN_PROVIDER } from '@/lib/ai/adapters';
import { REGISTER_DAILY_READS } from '@/lib/students/register-read';

// W21-M5: POST /api/app/students/import/ocr on the real schema, the AI platform's call stood in for (as test/marking
// stands in for the page reader). The office only; the pictures checked; the rows come back with the unsure fields
// marked; nothing is written to students; the metering is recorded and the audit row holds counts, never the words.
// One case runs the platform itself: with no service of its own the profile follows exams.read_pages's chain. Every name and number is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, tenant: null as unknown }));
const ai = vi.hoisted(() => ({
  real: false,
  answer: '[]',
  ok: true,
  asked: [] as { profile: string; system: string; content: string; images: number }[],
  recorded: 0,
}));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));
vi.mock('@/lib/frameworks/page-access', () => ({ moduleOffReason: async () => null }));
vi.mock('@/lib/ai/platform', async (original) => {
  const real = await original<typeof import('@/lib/ai/platform')>();
  return {
    ...real,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prepareText: async (db: any, ctx: any, profile: any, request: { system: string; messages: { content: string; images?: unknown[] }[] }) => {
      if (ai.real) return real.prepareText(db, ctx, profile, request as never);
      const m = request.messages[request.messages.length - 1];
      ai.asked.push({ profile, system: request.system, content: m.content, images: m.images?.length ?? 0 });
      return {
        ok: true,
        text: {
          send: async () => ({
            result: ai.ok ? { ok: true, text: ai.answer, tokensIn: 900, tokensOut: 300, provider: 'gemini', model: 'vision-test' } : { ok: false, reason: 'failed' },
            record: async () => {
              ai.recorded++;
            },
          }),
        },
      };
    },
  };
});

import { POST } from '@/app/api/app/students/import/ocr/route';

const A = 'e2150000-0000-4000-8000-000000000001';
const ADMIN = 'e2150000-0000-4000-8000-000000000011';
const TEACHER = 'e2150000-0000-4000-8000-000000000012';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const signIn = (role: 'school_admin' | 'teacher') => {
  const sub = role === 'teacher' ? TEACHER : ADMIN;
  state.claims = { sub, role, schoolId: A, membershipId: sub, tokenVersion: 0, aal: 'aal1', sessionId: sub };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state.tenant = (_c: unknown, fn: (client: any) => Promise<unknown>) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.pg.transaction(async (tx: any) => {
      await tx.query('set local role app_user');
      for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', role], ['app.current_user_id', sub]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
      return fn(tx);
    });
};
const jpeg = (w: number, h: number) =>
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xc0, 0x00, 0x0b, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x01, 0x01, 0x11, 0x00, 0xff, 0xda, 0x00, 0x02, 0x00, 0xff, 0xd9]);
const send = async (pages: Uint8Array[], role: 'school_admin' | 'teacher' = 'school_admin') => {
  signIn(role);
  const form = new FormData();
  pages.forEach((p, i) => form.append('page', new File([p], `page-${i + 1}.jpg`, { type: 'image/jpeg' })));
  const res = await POST(new NextRequest('http://localhost/api/app/students/import/ocr', { method: 'POST', body: form }));
  return { status: res.status, body: await res.json() };
};
const cell = (value: string | null, confidence = 0.96) => ({ value, confidence });
const ANSWER = JSON.stringify([
  { admission_no: cell('R-17'), name: cell('Meera Example'), guardian_name: cell('Sunil Example'), dob: cell('05/09/2016'), class: cell('3'), section: cell('B'), gender: cell('F'), phone: cell('9812345678'), address: cell('Ward 4, Karnal') },
  { admission_no: cell('R-18'), name: cell('Neel Exampel', 0.55), guardian_name: cell(null, 0), dob: cell(''), class: cell('3'), section: cell('B'), gender: cell('Boy'), phone: cell(null, 0), address: cell(null, 0) },
]);

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR');
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${ADMIN}', '${A}', 'office@school-a.example', 'school_admin', 'Office Person', true),
      ('${TEACHER}', '${A}', 'teacher@school-a.example', 'teacher', 'Teacher Person', true);
    insert into school_module_entitlements (school_id, module_id, enabled, source)
      select '${A}', m, true, 'plan' from unnest(array[${MODULE_REGISTRY.map((m) => `'${m.id}'`).join(', ')}]) m on conflict (school_id, module_id) do update set enabled = true;
  `);
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe('reading a register page for the import', () => {
  it('the profile’s row: no service of its own, children’s words, and the school may read it', async () => {
    expect((await db.pg.query(`select provider_id, model, prompt_version, carries_child_words, enabled from control.ai_profiles where profile_id = 'students.register_ocr'`)).rows).toEqual([
      { provider_id: null, model: null, prompt_version: 'v1', carries_child_words: true, enabled: true },
    ]);
  });

  it('the office only; no file, or a file that is not a page, is refused before anything is asked', async () => {
    expect((await send([jpeg(300, 300)], 'teacher')).status).toBe(403);
    expect(await send([])).toEqual({ status: 400, body: { error: 'no_file' } });
    expect(await send([new TextEncoder().encode('name,dob\nA,2015-01-01')])).toEqual({ status: 400, body: { error: 'not_a_page' } });
    expect(await send([jpeg(300, 300), jpeg(300, 300), jpeg(300, 300), jpeg(300, 300)])).toEqual({ status: 400, body: { error: 'too_many' } });
    expect(ai.asked).toHaveLength(0);
  });

  it('returns the rows with the unsure fields marked, writes no student, meters the call and audits counts only', async () => {
    ai.answer = ANSWER;
    const before = Number((await db.pg.query(`select count(*)::int as n from students`)).rows[0].n);
    const got = await send([jpeg(300, 300), jpeg(320, 300)]);
    expect(got.status).toBe(200);
    expect(got.body.floor).toBe(0.8);
    expect(got.body.pages).toBe(2);
    expect(got.body.rows).toHaveLength(2);
    expect(got.body.rows[0]).toMatchObject({ name: { value: 'Meera Example', low: false }, dob: { value: '2016-09-05', low: false }, gender: { value: 'female' } });
    expect(got.body.rows[1]).toMatchObject({ name: { value: 'Neel Exampel', confidence: 0.55, low: true }, guardian_name: { value: null }, dob: { value: null }, gender: { value: 'male' } });
    // The request: the profile, the pictures and their count; no name, no school.
    expect(ai.asked).toEqual([expect.objectContaining({ profile: 'students.register_ocr', images: 2, content: 'The register pages are the 2 pictures, in order.' })]);
    expect(ai.asked[0].system).not.toMatch(/School A/);
    expect(ai.recorded).toBe(1);
    expect(Number((await db.pg.query(`select count(*)::int as n from students`)).rows[0].n)).toBe(before);
    const audit = (await db.pg.query(`select actor_role, event_action, after_state from audit_log where school_id = $1 and event_action = 'students.register_ocr'`, [A])).rows;
    expect(audit).toEqual([{ actor_role: 'school_admin', event_action: 'students.register_ocr', after_state: { pages: 2, outcome: 'read', rows: 2, provider: 'gemini', model: 'vision-test' } }]);
    expect(JSON.stringify(audit)).not.toMatch(/Meera|Neel|Karnal/);
  });

  it('an answer that is not JSON, or a chain that fails, is a plain error, still metered', async () => {
    ai.answer = 'Sorry, the page is blurred.';
    expect(await send([jpeg(300, 300)])).toEqual({ status: 502, body: { error: 'not_json' } });
    ai.ok = false;
    expect(await send([jpeg(300, 300)])).toEqual({ status: 502, body: { error: 'failed' } });
    ai.ok = true;
    expect(ai.recorded).toBe(3);
  });

  it('a school reads at most its daily number of pages', async () => {
    const done = Number((await db.pg.query(`select count(*)::int as n from audit_log where school_id = $1 and event_action = 'students.register_ocr'`, [A])).rows[0].n);
    for (let i = done; i < REGISTER_DAILY_READS; i++) {
      await db.pg.query(`insert into audit_log (school_id, actor_user_id, actor_role, event_action, after_state) values ($1, $2, 'school_admin', 'students.register_ocr', '{"pages":1}')`, [A, ADMIN]);
    }
    const asked = ai.asked.length;
    expect(await send([jpeg(300, 300)])).toEqual({ status: 429, body: { error: 'daily_limit' } });
    expect(ai.asked).toHaveLength(asked);
    await db.pg.query(`delete from audit_log where event_action = 'students.register_ocr'`).catch(() => undefined);
  });
});

describe('through the platform itself', () => {
  it('with no service anywhere it is not switched on; then it runs on exams.read_pages’s chain, metered under its own name', async () => {
    ai.real = true;
    process.env.AI_PLATFORM_STAND_IN = 'on';
    try {
      // A fresh day's count: the reads above are moved two days back (the audit rows are otherwise append-only).
      await db.pg.query(`alter table audit_log disable trigger all`);
      await db.pg.query(`update audit_log set occurred_at = occurred_at - interval '2 days' where event_action = 'students.register_ocr'`);
      await db.pg.query(`alter table audit_log enable trigger all`);
      expect(await send([jpeg(300, 300)])).toEqual({ status: 503, body: { error: 'not_switched_on' } });
      // The founder clears the stand-in for children's words and routes the marking page reader to it; the register
      // reader has no service of its own, so it follows. The stand-in's answer is not a list of rows: a plain error.
      await db.pg.query(`insert into control.ai_providers (provider_id, cleared_for_minors, cleared_terms_url, cleared_at, cleared_by) values ('${STAND_IN_PROVIDER}', true, 'https://example.org/terms', now(), $1) on conflict (provider_id) do update set cleared_for_minors = true, cleared_terms_url = excluded.cleared_terms_url, cleared_at = now(), cleared_by = $1`, [ADMIN]);
      await db.pg.query(`update control.ai_profiles set provider_id = $1, model = 'stand-in-vision', enabled = true where profile_id = 'exams.read_pages'`, [STAND_IN_PROVIDER]);
      expect(await send([jpeg(300, 300)])).toEqual({ status: 502, body: { error: 'not_json' } });
      expect((await db.pg.query(`select profile_id, provider_id, model, requests from control.ai_usage where profile_id = 'students.register_ocr'`)).rows).toEqual([
        { profile_id: 'students.register_ocr', provider_id: STAND_IN_PROVIDER, model: 'stand-in-vision', requests: 1 },
      ]);
      expect((await db.pg.query(`select provider_id, outcome from control.ai_usage_ledger where profile_id = 'students.register_ocr'`)).rows).toEqual([{ provider_id: STAND_IN_PROVIDER, outcome: 'ok' }]);
    } finally {
      delete process.env.AI_PLATFORM_STAND_IN;
      ai.real = false;
    }
  });
});
