import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { extractedCatalog } from '@/lib/content/pdf-import';
import { familySyllabusPrompt } from '@/lib/ai/prompts/family.syllabus_extract';
import {
  checkChapters,
  confirmSyllabus,
  deleteSyllabus,
  draftFromCatalogLines,
  draftFromReply,
  keepDraft,
  listSyllabi,
  ownSyllabusLine,
  readOwnSyllabus,
  type StoredSyllabus,
} from '@/lib/family/child-syllabus';
import { removeChild } from '@/lib/family/children';
import { SyllabusList } from '@/components/family/SyllabusList';

// C230-AB: a parent's own syllabus for a child. A PDF's draft keeps only titles printed on their page; a photo is
// screened, read once by the family.syllabus_extract profile (mocked here) and becomes a draft the child never sees;
// the parent's Save makes it the child's syllabus for the subject (one per child and subject); parent mode and the
// study_core consent are required; another account can neither read nor change it; deleting the child deletes it.
// Made-up names only.

const ai = vi.hoisted(() => ({ reply: '', requests: [] as { profile: unknown; request: unknown; ctx: unknown }[], prepare: 'ok' as string }));
const screen = vi.hoisted(() => ({ result: { ok: true } as { ok: boolean; reason?: string }, calls: 0 }));
vi.mock('@/lib/ai/platform', async (original) => ({
  ...(await original<typeof import('@/lib/ai/platform')>()),
  activePromptVersion: async () => 'v1',
  prepareText: async (_db: unknown, ctx: unknown, profile: unknown, request: unknown) => {
    ai.requests.push({ profile, request, ctx });
    if (ai.prepare !== 'ok') return { ok: false, reason: ai.prepare };
    return {
      ok: true,
      text: { send: async () => ({ result: { ok: true, text: ai.reply, tokensIn: 1, tokensOut: 1, provider: 'workers-ai', model: 'm' }, record: async () => {} }) },
    };
  },
}));
vi.mock('@/lib/privacy/upload-check', async (original) => ({
  // The real rule for a PDF's words; the photo's OCR screen is stood in for.
  textProblem: (await original<typeof import('@/lib/privacy/upload-check')>()).textProblem,
  checkUpload: async () => {
    screen.calls += 1;
    return screen.result;
  },
}));

const A = 'f8000000-0000-4000-8000-0000000005a1';
const CHILD = 'f8000000-0000-4000-8000-0000000005a2';
const CHILD2 = 'f8000000-0000-4000-8000-0000000005a3';
const B = 'f8000000-0000-4000-8000-0000000005b1';
const CHILD_B = 'f8000000-0000-4000-8000-0000000005b2';
const C = 'f8000000-0000-4000-8000-0000000005c1';
const CHILD_C = 'f8000000-0000-4000-8000-0000000005c2';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64');
const PHOTO_1 = { chapters: [{ title: '  Knowing   Our Numbers ', topics: [{ title: 'Comparing numbers' }, { title: '' }] }, { title: '', topics: [{ title: 'Lost' }] }, { title: 'Whole Numbers' }] };
const PHOTO_2 = { units: [{ title: 'Unit 2', chapters: [{ title: 'Playing with Numbers', topics: [{ title: 'Factors and multiples' }] }] }] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };
const asFamily = <T>(account: string, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', $1, true)`, [account]);
    return fn(tx);
  });
const refused = async (fn: () => Promise<unknown>): Promise<string> => {
  try {
    await fn();
    return '';
  } catch (err) {
    return String((err as Error).message);
  }
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-child-syllabus-tests-0123456789';
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${A}', 'own-syllabus@example.org'), ('${B}', 'other-syllabus@example.org'), ('${C}', 'no-consent@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values
      ('${A}', 'study_core', true, 'parent_tap', 'v1'), ('${B}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${CHILD}', '${A}', 'Ira', 6, 'CBSE', 'en', 'en', 'IN-MH'),
      ('${CHILD2}', '${A}', 'Kabir', 7, 'CBSE', 'en', 'en', 'IN-MH'),
      ('${CHILD_B}', '${B}', 'Meher', 6, 'CBSE', 'en', 'en', 'IN-MH'),
      ('${CHILD_C}', '${C}', 'Neel', 6, 'CBSE', 'en', 'en', 'IN-MH');
  `);
}, 90_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});
beforeEach(() => {
  ai.reply = JSON.stringify(PHOTO_1);
  ai.requests = [];
  ai.prepare = 'ok';
  screen.result = { ok: true };
  screen.calls = 0;
});

const cookieFor = async (account: string, parent: boolean) => {
  const { signFamilySession, signParentMode } = await import('@/lib/family/session');
  const s = { accountId: account, tokenVersion: 0, sessionId: 's1' };
  return `ncf_session=${await signFamilySession(s)}${parent ? `; ncf_parent=${await signParentMode(s)}` : ''}`;
};
const call = async (path: '/api/family/syllabus' | '/api/family/syllabus/read', method: 'POST' | 'DELETE', body: unknown, opts: { account?: string; parent?: boolean } = {}) => {
  const mod = path.endsWith('/read') ? await import('@/app/api/family/syllabus/read/route') : await import('@/app/api/family/syllabus/route');
  const handler = (mod as unknown as Record<string, (req: NextRequest) => Promise<Response>>)[method];
  const res = await handler(
    new NextRequest(`http://localhost${path}`, { method, headers: { cookie: await cookieFor(opts.account ?? A, opts.parent ?? true), 'content-type': 'application/json' }, body: JSON.stringify(body) })
  );
  return { status: res.status, body: await res.json() };
};
const rows = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const titles = (s: StoredSyllabus | null) => s?.chapters.map((c) => ({ title: c.title, topics: c.topics.map((t) => t.title) })) ?? null;

describe('drafts keep titles only', () => {
  it("a PDF's draft keeps only the lines whose title is printed on their page", () => {
    const pages = ['Contents\n1. Knowing Our Numbers ........ 1\n2. Whole Numbers ........ 28', 'Chapter 1  Knowing Our Numbers\n1.1 Comparing numbers\n1.2 Large numbers in practice'];
    const reply = JSON.stringify({
      units: [],
      chapters: [
        { title: 'Knowing Our Numbers', page: 1, topics: [{ title: 'Comparing numbers', page: 2 }, { title: 'Roman numerals', page: 2 }] },
        { title: 'Whole Numbers', page: 1, topics: [] },
        // Not printed anywhere: dropped, with its topic.
        { title: 'Playing with Numbers', page: 1, topics: [{ title: 'Factors', page: 2 }] },
      ],
    });
    const extracted = extractedCatalog(reply, pages, { board: 'FAMILY', classLevel: 6, subject: 'mathematics' });
    expect(extracted).not.toBeNull();
    expect(draftFromCatalogLines(extracted!.lines)).toEqual([
      { title: 'Knowing Our Numbers', topics: [{ title: 'Comparing numbers' }] },
      { title: 'Whole Numbers', topics: [] },
    ]);
    // The prompt's PDF form names each page, as extractedCatalog reads them.
    const prompt = familySyllabusPrompt('v1');
    expect(prompt.user({ classLevel: 6, subject: 'mathematics', pages })).toContain('--- page 2 ---\nChapter 1');
  });

  it("a photo's answer keeps usable titles, tidied, and drops a line with no title together with its topics", () => {
    expect(draftFromReply(JSON.stringify(PHOTO_1))).toEqual([
      { title: 'Knowing Our Numbers', topics: [{ title: 'Comparing numbers' }] },
      { title: 'Whole Numbers', topics: [] },
    ]);
    expect(draftFromReply(JSON.stringify(PHOTO_2))).toEqual([{ title: 'Playing with Numbers', topics: [{ title: 'Factors and multiples' }] }]);
    expect(draftFromReply('no json here')).toBeNull();
    expect(draftFromReply(JSON.stringify({ chapters: [{ title: 'x'.repeat(201) }] }))).toEqual([]);
  });

  it("the parent's list: every line needs a name, within the limits", () => {
    expect(checkChapters([{ title: ' Fractions ', topics: [{ title: 'Halves' }] }])).toEqual({ ok: true, chapters: [{ title: 'Fractions', topics: [{ title: 'Halves' }] }] });
    expect(checkChapters([])).toEqual({ ok: false, reason: 'empty' });
    expect(checkChapters([{ title: 'Fractions', topics: [{ title: '   ' }] }])).toEqual({ ok: false, reason: 'title_bad' });
    expect(checkChapters(Array.from({ length: 61 }, () => ({ title: 'A' })))).toEqual({ ok: false, reason: 'too_many' });
    expect(checkChapters('nope')).toEqual({ ok: false, reason: 'bad_request' });
  });
});

describe('the list Study draws', () => {
  it('numbers the chapters, links every topic (and a chapter that has its own link), with 44 px targets and each title in its language', () => {
    const html = renderToStaticMarkup(
      h(SyllabusList, {
        title: 'Your syllabus',
        tone: 'mathematics',
        chapters: [
          { title: 'Knowing Our Numbers', href: '/family/understand?kind=own&key=c1', topics: [{ title: 'Comparing numbers', href: '/family/understand?kind=own&key=t1' }] },
          { title: 'संख्याएँ', topics: [] },
        ],
      })
    );
    expect(html).toContain('>Your syllabus</h2>');
    expect(html).toContain('href="/family/understand?kind=own&amp;key=t1"');
    expect(html).toContain('href="/family/understand?kind=own&amp;key=c1"');
    expect(html).toMatch(/min-h-\[44px\][^"]*"[^>]*href="\/family\/understand\?kind=own&amp;key=t1"|href="\/family\/understand\?kind=own&amp;key=t1"[^>]*min-h-\[44px\]/);
    expect(html).toContain('lang="hi">संख्याएँ</span>');
    expect((html.match(/<li/g) ?? []).length).toBe(3);
  });
});

describe('the routes', () => {
  let draftId = '';

  it('need parent mode', async () => {
    expect(await call('/api/family/syllabus/read', 'POST', { childId: CHILD, subject: 'mathematics', photo: JPEG }, { parent: false })).toEqual({ status: 403, body: { error: 'parent_pin_required' } });
    expect((await call('/api/family/syllabus', 'POST', { childId: CHILD, subject: 'mathematics', chapters: [{ title: 'A' }] }, { parent: false })).status).toBe(403);
    expect((await call('/api/family/syllabus', 'DELETE', { syllabusId: CHILD }, { parent: false })).status).toBe(403);
    expect([ai.requests.length, screen.calls]).toEqual([0, 0]);
  });

  it("need the parent's study_core consent: nothing is screened, sent or kept without it", async () => {
    expect(await call('/api/family/syllabus/read', 'POST', { childId: CHILD_C, subject: 'mathematics', photo: JPEG }, { account: C })).toEqual({ status: 403, body: { error: 'consent_required' } });
    expect(await call('/api/family/syllabus', 'POST', { childId: CHILD_C, subject: 'mathematics', chapters: [{ title: 'A' }] }, { account: C })).toEqual({ status: 403, body: { error: 'consent_required' } });
    expect([ai.requests.length, screen.calls]).toEqual([0, 0]);
    expect(await rows(`select 1 from family.child_syllabi where account_id = $1`, [C])).toHaveLength(0);
  });

  it("refuse a subject outside the child's class and a photo with an Aadhaar card, before any AI call", async () => {
    expect((await call('/api/family/syllabus/read', 'POST', { childId: CHILD, subject: 'astrology', photo: JPEG })).body.error).toBe('subject_bad');
    screen.result = { ok: false, reason: 'upload_aadhaar_card' };
    expect(await call('/api/family/syllabus/read', 'POST', { childId: CHILD, subject: 'mathematics', photo: JPEG })).toEqual({ status: 422, body: { error: 'personal_info' } });
    expect((await call('/api/family/syllabus/read', 'POST', { childId: CHILD, subject: 'mathematics', photo: Buffer.from('not an image').toString('base64') })).body.error).toBe('not_a_photo');
    expect(ai.requests).toHaveLength(0);
  });

  it('read a photo into a draft through the family.syllabus_extract profile, with no child name in the request; the next photo joins its end', async () => {
    const r = await call('/api/family/syllabus/read', 'POST', { childId: CHILD, subject: 'mathematics', photo: JPEG });
    expect(r.status).toBe(200);
    expect(r.body.syllabus).toMatchObject({ childId: CHILD, subject: 'mathematics', source: 'photos', status: 'draft', photos: 1 });
    expect(titles(r.body.syllabus)).toEqual([
      { title: 'Knowing Our Numbers', topics: ['Comparing numbers'] },
      { title: 'Whole Numbers', topics: [] },
    ]);
    draftId = r.body.syllabus.syllabusId;
    const sent = ai.requests[0] as { profile: string; request: { system: string; messages: { content: string; images: unknown[] }[] }; ctx: { childFirstNames: string[] } };
    expect(sent.profile).toBe('family.syllabus_extract');
    expect(sent.request.messages[0].images).toEqual([{ mediaType: 'image/jpeg', base64: JPEG }]);
    expect(JSON.stringify({ s: sent.request.system, u: sent.request.messages[0].content })).not.toMatch(/Ira|Kabir/);
    // The platform's pre-processor is given every child's name to remove.
    expect(sent.ctx.childFirstNames).toEqual(['Ira', 'Kabir']);

    ai.reply = JSON.stringify(PHOTO_2);
    const next = await call('/api/family/syllabus/read', 'POST', { childId: CHILD, subject: 'mathematics', photo: JPEG, syllabusId: draftId });
    expect(next.body.syllabus).toMatchObject({ syllabusId: draftId, photos: 2 });
    expect(titles(next.body.syllabus)!.map((c) => c.title)).toEqual(['Knowing Our Numbers', 'Whole Numbers', 'Playing with Numbers']);

    // A draft is never Study's.
    expect(await asFamily(A, (tx) => readOwnSyllabus(tx, A, CHILD, 'mathematics'))).toBeNull();
  });

  it('say so when a photo has no chapters, pass on the AI platform\'s refusal, and stop at five photos', async () => {
    ai.reply = '{"chapters": []}';
    expect(await call('/api/family/syllabus/read', 'POST', { childId: CHILD, subject: 'mathematics', photo: JPEG, syllabusId: draftId })).toEqual({ status: 422, body: { error: 'nothing_found' } });
    ai.prepare = 'not_switched_on';
    expect((await call('/api/family/syllabus/read', 'POST', { childId: CHILD, subject: 'mathematics', photo: JPEG, syllabusId: draftId })).body.error).toBe('ai_not_switched_on');
    await db.pg.query(`update family.child_syllabi set photos = 5 where syllabus_id = $1`, [draftId]);
    ai.prepare = 'ok';
    ai.requests = [];
    expect(await call('/api/family/syllabus/read', 'POST', { childId: CHILD, subject: 'mathematics', photo: JPEG, syllabusId: draftId })).toEqual({ status: 409, body: { error: 'too_many_photos' } });
    expect(ai.requests).toHaveLength(0);
  });

  it("the parent's Save makes the checked list visible to Study's loader; a line opens Understand with its chapter", async () => {
    expect((await call('/api/family/syllabus', 'POST', { childId: CHILD, subject: 'mathematics', syllabusId: draftId, chapters: [] })).body.error).toBe('empty');
    const edited = [
      { title: 'Knowing Our Numbers', topics: [{ title: 'Comparing numbers' }, { title: 'Estimation' }] },
      { title: 'Playing with Numbers', topics: [] },
    ];
    const r = await call('/api/family/syllabus', 'POST', { childId: CHILD, subject: 'mathematics', syllabusId: draftId, chapters: edited });
    expect(r.status).toBe(200);
    expect(r.body.syllabus).toMatchObject({ syllabusId: draftId, status: 'confirmed' });
    const own = await asFamily(A, (tx) => readOwnSyllabus(tx, A, CHILD, 'mathematics'));
    expect(titles(own)).toEqual([
      { title: 'Knowing Our Numbers', topics: ['Comparing numbers', 'Estimation'] },
      { title: 'Playing with Numbers', topics: [] },
    ]);
    const topic = own!.chapters[0].topics[1];
    expect(await asFamily(A, (tx) => ownSyllabusLine(tx, A, CHILD, topic.itemId))).toEqual({ itemId: topic.itemId, kind: 'topic', title: 'Estimation', chapterTitle: 'Knowing Our Numbers', subject: 'mathematics' });
    expect(await asFamily(A, (tx) => ownSyllabusLine(tx, A, CHILD2, topic.itemId))).toBeNull();
  });

  it('a second Save for the same child and subject replaces the first', async () => {
    const r = await call('/api/family/syllabus', 'POST', { childId: CHILD, subject: 'mathematics', chapters: [{ title: 'Integers', topics: [{ title: 'Number line' }] }] });
    expect(r.status).toBe(200);
    expect(r.body.syllabus).toMatchObject({ source: 'typed', status: 'confirmed' });
    expect(titles(await asFamily(A, (tx) => readOwnSyllabus(tx, A, CHILD, 'mathematics')))).toEqual([{ title: 'Integers', topics: ['Number line'] }]);
    expect(await rows(`select syllabus_id, status from family.child_syllabi where child_id = $1 and subject = 'mathematics'`, [CHILD])).toEqual([{ syllabus_id: r.body.syllabus.syllabusId, status: 'confirmed' }]);
    expect(await rows(`select 1 from family.child_syllabus_items where syllabus_id = $1`, [draftId])).toHaveLength(0);
    // Two saved syllabi for one child and subject cannot exist at all.
    expect(
      await refused(() => db.pg.query(`insert into family.child_syllabi (account_id, child_id, subject, source, status, confirmed_at) values ($1, $2, 'mathematics', 'typed', 'confirmed', now())`, [A, CHILD]))
    ).toMatch(/unique/);
  });

  it('another account can neither read nor change it', async () => {
    const mine = (await asFamily(A, (tx) => readOwnSyllabus(tx, A, CHILD, 'mathematics')))!;
    // Through the routes: B's parent names A's syllabus or child.
    expect((await call('/api/family/syllabus', 'DELETE', { syllabusId: mine.syllabusId }, { account: B })).status).toBe(404);
    expect((await call('/api/family/syllabus', 'POST', { childId: CHILD, subject: 'mathematics', chapters: [{ title: 'Taken' }] }, { account: B })).status).toBe(404);
    expect((await call('/api/family/syllabus', 'POST', { childId: CHILD_B, subject: 'mathematics', syllabusId: mine.syllabusId, chapters: [{ title: 'Taken' }] }, { account: B })).status).toBe(404);
    expect((await call('/api/family/syllabus/read', 'POST', { childId: CHILD, subject: 'mathematics', photo: JPEG }, { account: B })).status).toBe(404);
    // Under B's own row level security, even a query that does not name the account sees and changes nothing of A's.
    expect(await asFamily(B, (tx) => listSyllabi(tx, B))).toEqual([]);
    expect(await asFamily(B, async (tx) => (await tx.query(`select count(*)::int as n from family.child_syllabi`)).rows[0].n)).toBe(0);
    expect(await asFamily(B, async (tx) => (await tx.query(`update family.child_syllabus_items set title = 'Taken'`)).rowCount)).toBe(0);
    expect(await asFamily(B, async (tx) => (await tx.query(`delete from family.child_syllabi`)).rowCount)).toBe(0);
    expect(await asFamily(B, (tx) => deleteSyllabus(tx, B, mine.syllabusId))).toBe(false);
    expect(await asFamily(B, (tx) => confirmSyllabus(tx, B, { childId: CHILD, subject: 'mathematics', syllabusId: null, chapters: [{ title: 'Taken', topics: [] }] }))).toBe('not_found');
    expect(
      await refused(() => asFamily(B, (tx) => tx.query(`insert into family.child_syllabi (account_id, child_id, subject, source) values ($1, $2, 'science', 'typed')`, [A, CHILD])))
    ).toMatch(/row-level security/);
    // B's own row cannot name A's child either.
    expect(await refused(() => asFamily(B, (tx) => tx.query(`insert into family.child_syllabi (account_id, child_id, subject, source) values ($1, $2, 'science', 'typed')`, [B, CHILD])))).toMatch(/foreign key/);
    expect(titles(await asFamily(A, (tx) => readOwnSyllabus(tx, A, CHILD, 'mathematics')))).toEqual([{ title: 'Integers', topics: ['Number line'] }]);
  });

  it('the parent deletes a saved syllabus; Study no longer has it', async () => {
    const mine = (await asFamily(A, (tx) => readOwnSyllabus(tx, A, CHILD, 'mathematics')))!;
    expect(await call('/api/family/syllabus', 'DELETE', { syllabusId: mine.syllabusId })).toEqual({ status: 200, body: { ok: true } });
    expect(await asFamily(A, (tx) => readOwnSyllabus(tx, A, CHILD, 'mathematics'))).toBeNull();
  });
});

describe('deleting the child', () => {
  it('deletes its syllabi and their lines', async () => {
    const saved = await asFamily(A, async (tx) => {
      const draft = await keepDraft(tx, A, { childId: CHILD2, subject: 'science', source: 'photos', syllabusId: null, chapters: [{ title: 'Food', topics: [{ title: 'Sources of food' }] }] });
      expect(draft).toMatchObject({ status: 'draft' });
      return confirmSyllabus(tx, A, { childId: CHILD2, subject: 'science', syllabusId: (draft as StoredSyllabus).syllabusId, chapters: [{ title: 'Food', topics: [{ title: 'Sources of food' }] }] });
    });
    expect(saved).toMatchObject({ status: 'confirmed' });
    expect(await rows(`select 1 from family.child_syllabus_items where account_id = $1 and syllabus_id = $2`, [A, (saved as StoredSyllabus).syllabusId])).toHaveLength(2);
    expect(await asFamily(A, (tx) => removeChild(tx, A, CHILD2))).toBe(true);
    expect(await rows(`select 1 from family.child_syllabi where child_id = $1`, [CHILD2])).toHaveLength(0);
    expect(await rows(`select 1 from family.child_syllabus_items where syllabus_id = $1`, [(saved as StoredSyllabus).syllabusId])).toHaveLength(0);
  });
});

describe('a PDF of the contents, through the route (C230-AB)', () => {
  // A one-page PDF made by hand, with a text layer.
  const pdf = (lines: string[]) => {
    const text = Buffer.from(`BT /F1 12 Tf 72 720 Td ${lines.map((l) => `(${l}) Tj 0 -14 Td`).join(' ')} ET`, 'latin1');
    const objs = ['/Type /Catalog /Pages 2 0 R', '/Type /Pages /Kids [3 0 R] /Count 1', '/Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R', null, '/Type /Font /Subtype /Type1 /BaseFont /Helvetica'];
    const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
    objs.forEach((d, i) => {
      if (d === null) parts.push(Buffer.from(`${i + 1} 0 obj\n<< /Length ${text.length} >>\nstream\n`, 'latin1'), text, Buffer.from('\nendstream\nendobj\n', 'latin1'));
      else parts.push(Buffer.from(`${i + 1} 0 obj\n<< ${d} >>\nendobj\n`, 'latin1'));
    });
    parts.push(Buffer.from(`trailer\n<< /Size 6 /Root 1 0 R >>\n%%EOF\n`, 'latin1'));
    return Buffer.concat(parts).toString('base64');
  };

  it('keeps only titles printed in the PDF, never screens it as a photo, and sends its pages as text', async () => {
    ai.reply = JSON.stringify({ units: [], chapters: [{ title: 'Exploring Magnets', page: 1, topics: [] }, { title: 'Made Up Chapter', page: 1, topics: [] }] });
    const before = screen.calls;
    const r = await call('/api/family/syllabus/read', 'POST', { childId: CHILD, subject: 'science', pdf: pdf(['Contents', '1. Exploring Magnets']) });
    expect(r.status).toBe(200);
    expect(r.body.syllabus).toMatchObject({ source: 'pdf', status: 'draft' });
    expect(titles(r.body.syllabus)).toEqual([{ title: 'Exploring Magnets', topics: [] }]);
    expect(screen.calls).toBe(before);
    const sent = ai.requests.at(-1) as { request: { messages: { content: string; images?: unknown }[] } };
    expect(sent.request.messages[0].images).toBeUndefined();
    expect(sent.request.messages[0].content).toContain('--- page 1 ---');
  });

  it('a PDF with no text (a scan) is refused before any AI call', async () => {
    const calls = ai.requests.length;
    const scan = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'latin1').toString('base64');
    const r = await call('/api/family/syllabus/read', 'POST', { childId: CHILD, subject: 'social_science', pdf: scan });
    expect(r.status).toBe(422);
    expect(ai.requests.length).toBe(calls);
  });

  it('a PDF whose words hold an Aadhaar number is refused before any AI call', async () => {
    const calls = ai.requests.length;
    const r = await call('/api/family/syllabus/read', 'POST', { childId: CHILD, subject: 'social_science', pdf: pdf(['Contents', 'Aadhaar 4123 4567 8901']) });
    expect(r).toMatchObject({ status: 422, body: { error: 'personal_info' } });
    expect(ai.requests.length).toBe(calls);
  });
});
