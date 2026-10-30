import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// W9-D: the Quality Lab's cases built from the syllabus, on the real migrations (PGlite). One case for each unit, each
// question type that fits the subject and each language; keys that do not change; the Hindi text in Devanagari; a second
// add inserts nothing; the route lets in the founder with the authenticator only; a run may name a stored case and no
// unknown one. No model is called anywhere in this file. Every name here is made up.

const h = vi.hoisted(() => ({ db: null as unknown as { pg: { transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>; query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }; stop: () => Promise<void> } }));

vi.mock('@/lib/auth/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/db')>();
  const run = (fn: (db: unknown) => Promise<unknown>) =>
    h.db.pg.transaction(async (tx: any) => {
      await tx.query('set local role nca_super');
      return fn(tx);
    });
  return { ...real, withPlatformService: run, withTenantContext: (_c: unknown, fn: (db: unknown) => Promise<unknown>) => run(fn) };
});

// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { addCurriculumCases, bandOf, buildCurriculumCases, curriculumCase, curriculumCases, curriculumKey, curriculumList, fittingTypes } from '@/lib/ai/lab/curriculum-cases';
import { GET, POST } from '@/app/api/control/ai/lab/route';
import type { Sql } from '@/lib/jobs/types';

const FOUNDER = 'c9d10000-0000-4000-8000-0000000000f1';
const PRINCIPAL = 'c9d10000-0000-4000-8000-0000000000a1';
const SCHOOL = 'c9d10000-0000-4000-8000-0000000000b1';
const SRC = 'https://example.org/syllabus.pdf';
const DEVANAGARI = /[ऀ-ॿ]/;
const q = async (sql: string, params: unknown[] = []) => (await h.db.pg.query(sql, params)).rows;
const asStaff = <T>(fn: (db: Sql) => Promise<T>): Promise<T> =>
  h.db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });

let founder = '';
let founderAal1 = '';
let principal = '';
async function cookieFor(sub: string, role: string, schoolId: string | null, aal: 'aal1' | 'aal2') {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal, sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
const call = async (body: unknown, cookie: string | null) => {
  const res = await POST(new NextRequest('https://www.netcyberai.test/api/control/ai/lab', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } }));
  return { status: res.status, body: await res.json() };
};

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-curriculum-cases-tests-0123456789';
  h.db = await startHarnessDb({ port: 0 });
  await q(`insert into schools (school_id, name, jurisdiction) values ($1, 'Made-up School', 'IN-HR')`, [SCHOOL]);
  await q(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Farid Founder'), ($2, $3, 'principal', 'Priya Principal')`, [FOUNDER, PRINCIPAL, SCHOOL]);

  const version = async (cls: number, subject: string) =>
    (
      await q(
        `insert into content.syllabus_versions (board_id, class_level, subject, academic_year, version_no, status, audience, import_source, approved_by)
         values ('CBSE', $1, $2, '2026-27', 1, 'published', 'everyone', 'repository', $3) returning version_id`,
        [cls, subject, FOUNDER]
      )
    )[0].version_id as string;
  const unit = async (v: string, key: string, position: number, en: string, hi: string | null) =>
    (await q(`insert into content.units (version_id, unit_key, position, title_en, title_hi, source_url, source_page, checked_on) values ($1, $2, $3, $4, $5, $6, '1', '2026-10-20') returning unit_id`, [v, key, position, en, hi, SRC]))[0].unit_id as string;
  const chapterWithTopics = async (v: string, u: string, key: string, titles: [string, string | null][]) => {
    const c = (await q(`insert into content.chapters (version_id, unit_id, chapter_key, position, title_en, source_url, source_page, checked_on) values ($1, $2, $3, 1, 'A chapter', $4, '1', '2026-10-20') returning chapter_id`, [v, u, key, SRC]))[0].chapter_id;
    for (const [i, [en, hi]] of titles.entries()) {
      await q(`insert into content.topics (version_id, chapter_id, topic_key, position, title_en, title_hi, source_url, source_page, checked_on) values ($1, $2, $3, $4, $5, $6, $7, '1', '2026-10-20')`, [v, c, `${key}.t${i + 1}`, i + 1, en, hi, SRC]);
    }
  };
  const sci = await version(7, 'science');
  const cells = await unit(sci, 'cbse.c7.science.u1', 1, 'Living world', 'जीवित संसार');
  await chapterWithTopics(sci, cells, 'cbse.c7.science.u1.ch01', [['Cell parts', 'कोशिका के भाग'], ['Cell division', null]]);
  await unit(sci, 'cbse.c7.science.u2', 2, 'Matter', null);
  const maths = await version(10, 'mathematics');
  await unit(maths, 'cbse.c10.maths.u1', 1, 'Real numbers', 'वास्तविक संख्याएँ');
  const social = await version(6, 'social_science');
  const history = await unit(social, 'cbse.c6.social.u1', 1, 'Early people', null);
  await chapterWithTopics(social, history, 'cbse.c6.social.u1.ch01', [['Hunters and gatherers', null]]);
  const english = await version(3, 'english');
  await unit(english, 'cbse.c3.english.u1', 1, 'Poems', null);
  founder = await cookieFor(FOUNDER, 'super_admin', null, 'aal2');
  founderAal1 = await cookieFor(FOUNDER, 'super_admin', null, 'aal1');
  principal = await cookieFor(PRINCIPAL, 'principal', SCHOOL, 'aal1');
}, 120_000);
afterAll(async () => {
  await h.db?.stop();
});

describe('the types that fit', () => {
  it('definition, concept, comparison and application everywhere; problem and derivation for Mathematics and Science; history and case for Social Science', () => {
    expect(fittingTypes('english')).toEqual(['definition', 'concept', 'comparison', 'application']);
    expect(fittingTypes('mathematics')).toEqual(['definition', 'concept', 'comparison', 'application', 'problem', 'derivation']);
    expect(fittingTypes('science')).toContain('derivation');
    expect(fittingTypes('science')).not.toContain('history');
    expect(fittingTypes('social_science')).toEqual(['definition', 'concept', 'comparison', 'application', 'history', 'case']);
    expect(fittingTypes('social_science')).not.toContain('problem');
  });

  it('the band comes from the class', () => {
    expect([1, 3, 6, 8, 9, 10, 11, 12].map(bandOf)).toEqual(['lkg_1', 'c2_5', 'c6_8', 'c6_8', 'c9_10', 'c9_10', 'c11_12', 'c11_12']);
  });
});

describe('the cases built from the syllabus', () => {
  it('one case for each unit, fitting type and language: 28 in English and 28 in Hindi for these five units', async () => {
    const cases = await asStaff((db) => curriculumCases(db, { boardId: 'CBSE' }));
    expect(cases).toHaveLength(56);
    expect(new Set(cases.map((c) => c.id)).size).toBe(56);
    const per = (unit: string, lang: string) => cases.filter((c) => c.tags!.unit === unit && c.language === lang).map((c) => c.tags!.type);
    expect(per('cbse.c7.science.u1', 'en')).toEqual(['definition', 'concept', 'comparison', 'application', 'problem', 'derivation']);
    expect(per('cbse.c6.social.u1', 'hi')).toEqual(['definition', 'concept', 'comparison', 'application', 'history', 'case']);
    expect(per('cbse.c3.english.u1', 'en')).toEqual(['definition', 'concept', 'comparison', 'application']);
    expect(cases.find((c) => c.tags!.unit === 'cbse.c10.maths.u1')!.tags).toMatchObject({ board: 'CBSE', classLevel: 10, subject: 'mathematics', band: 'c9_10' });
    expect(cases.every((c) => c.area === 'curriculum' && c.expect === 'text' && c.messages.length === 1 && c.messages[0].role === 'user' && c.rubric.length >= 3)).toBe(true);
  });

  it('the question is written from the unit and topic titles; the Hindi ones are in Devanagari, the English ones are not', async () => {
    const cases = await asStaff((db) => curriculumCases(db, { boardId: 'CBSE', classLevel: 7, subject: 'science' }));
    const text = (unit: string, type: string, lang: string) => cases.find((c) => c.tags!.unit === unit && c.tags!.type === type && c.language === lang)!.messages[0].content;
    expect(text('cbse.c7.science.u1', 'definition', 'en')).toBe('What is Cell parts? Define it in simple words.');
    expect(text('cbse.c7.science.u1', 'comparison', 'en')).toBe('How are Cell parts and Cell division alike, and how are they different?');
    expect(text('cbse.c7.science.u1', 'definition', 'hi')).toBe('कोशिका के भाग क्या है? इसे आसान शब्दों में समझाइए।');
    // A unit with no topics is asked about by its own title; a title with no Hindi falls back to the English one.
    expect(text('cbse.c7.science.u2', 'definition', 'en')).toBe('What is Matter? Define it in simple words.');
    expect(text('cbse.c7.science.u2', 'comparison', 'hi')).toBe('"Matter" के मुख्य विचारों की तुलना कीजिए।');
    for (const c of cases) {
      expect(DEVANAGARI.test(c.messages[0].content), c.id).toBe(c.language === 'hi');
      expect(c.system).toContain(c.language === 'hi' ? 'Hindi (Devanagari script)' : 'Answer in English');
    }
  });

  it('is deterministic: the same syllabus gives the same cases and keys, and a key does not depend on the title', async () => {
    const a = await asStaff((db) => curriculumCases(db, { boardId: 'CBSE' }));
    const b = await asStaff((db) => curriculumCases(db, { boardId: 'CBSE' }));
    expect(b).toEqual(a);
    for (const c of a) expect(c.id).toMatch(/^cur-[a-f0-9]{16}$/);
    const unit = { boardId: 'CBSE', classLevel: 7, subject: 'science', unitKey: 'cbse.c7.science.u1', position: 1, titleEn: 'Living world', titleHi: null, topics: [] };
    const renamed = buildCurriculumCases([{ ...unit, titleEn: 'Life around us' }]);
    expect(renamed.map((c) => c.id)).toEqual(buildCurriculumCases([unit]).map((c) => c.id));
    expect(renamed[0].id).toBe(curriculumKey(unit, 'definition', 'en'));
    expect(curriculumKey(unit, 'definition', 'en')).not.toBe(curriculumKey(unit, 'definition', 'hi'));
  });

  it('perUnit limits the types a unit gets, rotating with its position', async () => {
    const two = await asStaff((db) => curriculumCases(db, { boardId: 'CBSE', perUnit: 2 }));
    expect(two).toHaveLength(5 * 2 * 2);
    const types = new Set(two.map((c) => c.tags!.type));
    expect(types.size).toBeGreaterThan(2);
    expect(await asStaff((db) => curriculumCases(db, { boardId: 'ICSE' }))).toHaveLength(0);
  });
});

describe('adding them to the Lab', () => {
  it('stores each case once: a second add inserts nothing and says how many were skipped', async () => {
    const first = await asStaff((db) => addCurriculumCases(db, { userId: FOUNDER }, { boardId: 'CBSE' }));
    expect(first).toEqual({ ok: true, units: 5, added: 56, skipped: 0 });
    const second = await asStaff((db) => addCurriculumCases(db, { userId: FOUNDER }, { boardId: 'CBSE' }));
    expect(second).toEqual({ ok: true, units: 5, added: 0, skipped: 56 });
    expect((await q(`select count(*)::int as n from control.ai_eval_cases`))[0].n).toBe(56);
    const narrower = await asStaff((db) => addCurriculumCases(db, { userId: FOUNDER }, { boardId: 'CBSE', classLevel: 7, perUnit: 2 }));
    expect(narrower).toMatchObject({ ok: true, units: 2 });
    const stored = await asStaff((db) => curriculumList(db));
    expect(stored.total).toBe(56 + (narrower as { added: number }).added);
    expect(stored.scopes).toHaveLength(4);
    const one = await asStaff((db) => curriculumCase(db, stored.cases[0].id));
    expect(one).toMatchObject({ area: 'curriculum', expect: 'text' });
    expect(await asStaff((db) => curriculumCase(db, 'cur-0000000000000000'))).toBeNull();
    expect(await asStaff((db) => addCurriculumCases(db, { userId: FOUNDER }, { boardId: 'cbse' }))).toEqual({ ok: false, code: 'request' });
  });
});

describe('the Lab route', () => {
  it('refuses no session (401), a school principal (403) and the founder without the authenticator (403), adding nothing', async () => {
    const before = (await q(`select count(*)::int as n from control.ai_eval_cases`))[0].n;
    expect((await call({ action: 'curriculum', boardId: 'CBSE' }, null)).status).toBe(401);
    expect((await call({ action: 'curriculum', boardId: 'CBSE' }, principal)).status).toBe(403);
    const weak = await call({ action: 'curriculum', boardId: 'CBSE' }, founderAal1);
    expect(weak.status).toBe(403);
    expect(weak.body.code).toBe('aal2');
    expect((await q(`select count(*)::int as n from control.ai_eval_cases`))[0].n).toBe(before);
  });

  it('adds for the founder with the authenticator, counts what was added and skipped, and lists the cases', async () => {
    const r = await call({ action: 'curriculum', boardId: 'CBSE', classLevel: 3 }, founder);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, units: 1, added: 0, skipped: 8 });
    const bad = await call({ action: 'curriculum', boardId: 'CBSE', classLevel: 'seven' }, founder);
    expect(bad.status).toBe(400);
    expect((await call({ action: 'curriculum' }, founder)).status).toBe(400);
    const res = await GET(new NextRequest('https://www.netcyberai.test/api/control/ai/lab', { headers: { cookie: founder } }));
    const body = await res.json();
    expect(body.curriculumTotal).toBeGreaterThanOrEqual(56);
    expect(body.cases.filter((c: { area: string }) => c.area === 'curriculum').length).toBeLessThanOrEqual(300);
    expect(body.scopes).toContainEqual({ boardId: 'CBSE', classLevel: 7, subject: 'science' });
  });

  it('a run may name a stored curriculum case and no unknown one', async () => {
    const stored = (await q(`select case_key from control.ai_eval_cases order by case_key limit 1`))[0].case_key as string;
    const models = [{ provider: 'anthropic', model: 'model-a' }, { provider: 'openai', model: 'model-b' }];
    const unknown = await call({ action: 'start', caseIds: ['cur-0000000000000000'], models }, founder);
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe('cases');
    // Past the case check; with no provider key saved, the run says so instead.
    const known = await call({ action: 'start', caseIds: [stored], models }, founder);
    expect(known.body.code).toBe('not_configured');
  });
});
