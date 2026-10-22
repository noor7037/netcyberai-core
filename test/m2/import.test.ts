import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// M2-12 (C286): Control's catalog import from a board's PDF. The PDF's text layer is read page by page (no PDF
// library), sent to the content.syllabus_extract profile, and only lines whose title is printed on their page are kept;
// the draft goes through the CSV import's own path, in review, and its uploader can never approve it. The model is
// scripted; the routes run on the real migrations (PGlite). Made-up accounts; the syllabus lines are made up too.

const h = vi.hoisted(() => ({ db: null as unknown as { pg: { transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>; query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }; stop: () => Promise<void> } }));
const ai = vi.hoisted(() => ({ reply: '', calls: [] as { profile: string; ctx: { childFirstNames: string[] }; request: { system: string; messages: { content: string }[] } }[], refuse: null as null | string }));

vi.mock('@/lib/auth/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/db')>();
  return {
    ...real,
    withTenantContext: (claims: { role: string; sub: string; schoolId: string | null }, fn: (db: unknown) => Promise<unknown>) =>
      h.db.pg.transaction(async (tx: any) => {
        await tx.query(`set local role ${claims.role === 'super_admin' ? 'nca_super' : 'app_user'}`);
        await tx.query(`select set_config('app.current_tenant_id', $1, true)`, [claims.schoolId ?? '00000000-0000-0000-0000-000000000000']);
        await tx.query(`select set_config('app.current_role', $1, true)`, [claims.role]);
        await tx.query(`select set_config('app.current_user_id', $1, true)`, [claims.sub]);
        return fn(tx);
      }),
  };
});
vi.mock('@/lib/ai/platform', async (original) => ({
  ...(await original<typeof import('@/lib/ai/platform')>()),
  activePromptVersion: async () => 'v1',
  prepareText: async (_db: unknown, ctx: { childFirstNames: string[] }, profile: string, request: { system: string; messages: { content: string }[] }) => {
    ai.calls.push({ profile, ctx, request });
    if (ai.refuse) return { ok: false, reason: ai.refuse };
    const reply = ai.reply;
    return { ok: true, text: { send: async () => ({ result: { ok: true, text: reply, tokensIn: 1, tokensOut: 1, provider: 'anthropic', model: 'm' }, record: async () => {} }) } };
  },
}));

// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { extractedCatalog, isBoardSourceUrl, squash } from '@/lib/content/pdf-import';
import { readPdf } from '@/lib/privacy/pdf-text';
import { indiaDate } from '@/lib/time/india';
import { POST as pdfImport } from '@/app/api/control/content/pdf-import/route';
import { POST as versionPost } from '@/app/api/control/content/versions/[versionId]/route';
import { GET as diffRoute } from '@/app/api/control/content/diff/route';

const FOUNDER = 'c6000000-0000-4000-8000-0000000000f1';
const SECOND = 'c6000000-0000-4000-8000-0000000000f2';
const PRINCIPAL = 'c6000000-0000-4000-8000-0000000000a1';
const SCHOOL = 'c6000000-0000-4000-8000-0000000000b1';
const SOURCE = 'https://cbseacademic.nic.in/web_material/made-up/Maths_X.pdf';

// A PDF made by hand. The page tree lists page 1 (object 5) before page 2 (object 3), so the reader must follow the
// tree, not the object order.
type Obj = { dict: string; data?: Buffer };
function pdfOf(objects: Obj[]): Uint8Array {
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  objects.forEach((o, i) => {
    if (o.data) parts.push(Buffer.from(`${i + 1} 0 obj\n<< ${o.dict} /Length ${o.data.length} >>\nstream\n`, 'latin1'), o.data, Buffer.from('\nendstream\nendobj\n', 'latin1'));
    else parts.push(Buffer.from(`${i + 1} 0 obj\n<< ${o.dict} >>\nendobj\n`, 'latin1'));
  });
  parts.push(Buffer.from(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n%%EOF\n`, 'latin1'));
  return new Uint8Array(Buffer.concat(parts));
}
const shows = (lines: string[]): Obj => ({ dict: '', data: Buffer.from(`BT /F1 12 Tf 72 720 Td ${lines.map((l) => `(${l.replace(/[()\\]/g, (c) => `\\${c}`)}) Tj 0 -14 Td`).join(' ')} ET`, 'latin1') });
const PAGE1 = ['COURSE STRUCTURE', 'Unit I: NUMBER SYSTEMS', '1. REAL NUMBERS'];
const PAGE2 = ['REAL NUMBERS', "1. Euclid's division lemma", '2. Fundamental Theorem of', 'Arithmetic - statements after reviewing work done earlier'];
const twoPages = () =>
  pdfOf([
    { dict: '/Type /Catalog /Pages 2 0 R' },
    { dict: '/Type /Pages /Kids [5 0 R 3 0 R] /Count 2' },
    { dict: '/Type /Page /Parent 2 0 R /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R' },
    shows(PAGE2),
    { dict: '/Type /Page /Parent 2 0 R /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R' },
    shows(PAGE1),
    { dict: '/Type /Font /Subtype /Type1 /BaseFont /Helvetica' },
  ]);
const scanOnly = () =>
  pdfOf([
    { dict: '/Type /Catalog /Pages 2 0 R' },
    { dict: '/Type /Pages /Kids [3 0 R] /Count 1' },
    { dict: '/Type /Page /Parent 2 0 R /Contents 4 0 R' },
    { dict: '', data: Buffer.from('q 612 0 0 792 0 0 cm /Im1 Do Q', 'latin1') },
  ]);
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');

const REPLY = {
  units: [
    {
      title: 'NUMBER SYSTEMS',
      page: 1,
      chapters: [
        {
          title: 'Real Numbers',
          page: 1,
          topics: [
            { title: "Euclid's division lemma", page: 2 },
            { title: 'Fundamental Theorem of Arithmetic', page: 2 },
            // Made up by the model: on no page.
            { title: 'Irrational numbers and their decimal expansions', page: 2 },
            // Real words, but not on the page named.
            { title: "Euclid's division lemma", page: 1 },
          ],
        },
      ],
    },
    // Not in the document: dropped, with its chapter.
    { title: 'ALGEBRA', page: 1, chapters: [{ title: 'Polynomials', page: 1, topics: [] }] },
  ],
  chapters: [],
};

function req(path: string, body: unknown, cookie?: string): NextRequest {
  return new NextRequest(`https://www.netcyberai.test${path}`, { method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } });
}
async function cookieFor(sub: string, role: string, schoolId: string | null, aal: 'aal1' | 'aal2') {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal, sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
const form = (extra: Record<string, unknown> = {}) => ({ pdf: b64(twoPages()), sourceUrl: SOURCE, board: 'CBSE', classLevel: 10, subject: 'mathematics', academicYear: '2026-27', ...extra });

let founder = '';
let second = '';
let principal = '';
let family = '';

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-m2-12-import-tests-0123456789';
  h.db = await startHarnessDb({ port: 0 });
  await h.db.pg.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'Made-up School', 'IN-HR')`, [SCHOOL]);
  await h.db.pg.query(
    `insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Made-up Founder'), ($2, null, 'super_admin', 'Made-up Reviewer'), ($3, $4, 'principal', 'Made-up Principal')`,
    [FOUNDER, SECOND, PRINCIPAL, SCHOOL]
  );
  founder = await cookieFor(FOUNDER, 'super_admin', null, 'aal2');
  second = await cookieFor(SECOND, 'super_admin', null, 'aal2');
  principal = await cookieFor(PRINCIPAL, 'principal', SCHOOL, 'aal1');
  const { signFamilySession } = await import('@/lib/family/session');
  family = `ncf_session=${await signFamilySession({ accountId: 'c6000000-0000-4000-8000-0000000000c1', tokenVersion: 0, sessionId: 's1' })}`;
}, 120_000);
afterAll(async () => {
  await h.db?.stop();
});
beforeEach(() => {
  ai.reply = JSON.stringify(REPLY);
  ai.refuse = null;
});

describe('reading the PDF and the model', () => {
  it('reads each page’s text in the page tree’s order', () => {
    const read = readPdf(twoPages(), { pages: true });
    expect(read.pages).toHaveLength(2);
    expect(read.pages[0]).toContain('Unit I: NUMBER SYSTEMS');
    expect(read.pages[1]).toContain("Euclid's division lemma");
    expect(read.pages[0]).not.toContain('Euclid');
  });

  it('keeps a line only when its title is printed on its page; the lines under a dropped one go with it', () => {
    const pages = readPdf(twoPages(), { pages: true }).pages;
    const x = extractedCatalog(`Here it is:\n${JSON.stringify(REPLY)}`, pages, { board: 'CBSE', classLevel: 10, subject: 'mathematics' })!;
    expect(x.lines.map((l) => [l.level, l.key, l.parentKey, l.position, l.title, l.page])).toEqual([
      ['unit', 'cbse.c10.mathematics.u1', null, 1, 'NUMBER SYSTEMS', 1],
      ['chapter', 'cbse.c10.mathematics.u1.ch01', 'cbse.c10.mathematics.u1', 1, 'Real Numbers', 1],
      ['topic', 'cbse.c10.mathematics.u1.ch01.t01', 'cbse.c10.mathematics.u1.ch01', 1, "Euclid's division lemma", 2],
      // Printed across a line break: the spaces and capitals aside, the words are on the page.
      ['topic', 'cbse.c10.mathematics.u1.ch01.t02', 'cbse.c10.mathematics.u1.ch01', 2, 'Fundamental Theorem of Arithmetic', 2],
    ]);
    expect(x.dropped.map((d) => [d.title, d.reason])).toEqual([
      ['Irrational numbers and their decimal expansions', 'not_on_page'],
      ["Euclid's division lemma", 'not_on_page'],
      ['ALGEBRA', 'not_on_page'],
      ['Polynomials', 'parent_dropped'],
    ]);
    // Too long, no page, a page the file does not have, not JSON.
    const odd = extractedCatalog(JSON.stringify({ chapters: [{ title: 'x'.repeat(121), page: 1 }, { title: 'REAL NUMBERS' }, { title: 'REAL NUMBERS', page: 9 }] }), pages, { board: 'CBSE', classLevel: 10, subject: 'mathematics' })!;
    expect(odd.dropped.map((d) => d.reason)).toEqual(['title_bad', 'page_bad', 'page_bad']);
    // A line left out leaves its number unused: the next chapter keeps the key it has when nothing is dropped.
    const gap = extractedCatalog(JSON.stringify({ chapters: [{ title: 'Made up', page: 1 }, { title: 'REAL NUMBERS', page: 2 }] }), pages, { board: 'CBSE', classLevel: 10, subject: 'mathematics' })!;
    expect(gap.lines.map((l) => [l.key, l.position])).toEqual([['cbse.c10.mathematics.ch02', 2]]);
    expect(extractedCatalog('no json here', pages, { board: 'CBSE', classLevel: 10, subject: 'mathematics' })).toBeNull();
    expect(squash('Fundamental  Theorem\nof – Arithmetic')).toBe(squash('fundamental theorem of - arithmetic'));
  });

  it('a source address must be https on a board’s own site', () => {
    for (const ok of [SOURCE, 'https://ncert.nic.in/x.pdf', 'https://www.cisce.org/x.pdf', 'https://bseh.org.in.gov.in/x.pdf', 'https://upmsp.edu.in.nic.in/a.pdf', 'https://kseab.karnataka.gov.in/s.pdf']) expect(isBoardSourceUrl(ok), ok).toBe(true);
    for (const bad of ['http://cbseacademic.nic.in/x.pdf', 'https://example.org/x.pdf', 'https://cbseacademic.nic.in.evil.example/x.pdf', 'https://gov.in/x.pdf', 'https://user:pw@ncert.nic.in/x.pdf', 'https://ncert.nic.in:8443/x.pdf', 'ftp://ncert.nic.in/x.pdf']) expect(isBoardSourceUrl(bad), bad).toBe(false);
  });
});

describe('the import route', () => {
  let versionId = '';
  it('makes a draft version whose every line quotes its page, in review, with the source and today’s date', async () => {
    const res = await pdfImport(req('/api/control/content/pdf-import', form(), founder));
    expect(res.status).toBe(201);
    const got = await res.json();
    expect(got.version).toMatchObject({ board: 'CBSE', classLevel: 10, subject: 'mathematics', academicYear: '2026-27', versionNo: 1, units: 1, chapters: 1, topics: 2 });
    expect(got.dropped).toHaveLength(4);
    expect(got.pages).toBe(2);
    versionId = got.version.versionId;

    // The profile is the syllabus one; the pages go numbered; nothing names a child.
    const call = ai.calls.at(-1)!;
    expect(call.profile).toBe('content.syllabus_extract');
    expect(call.ctx.childFirstNames).toEqual([]);
    expect(call.request.messages[0].content).toMatch(/^--- page 1 ---\n[\s\S]*Unit I: NUMBER SYSTEMS[\s\S]*--- page 2 ---\n[\s\S]*Euclid/);

    const v = (await h.db.pg.query(`select status, import_source, imported_by from content.syllabus_versions where version_id = $1`, [versionId])).rows[0];
    expect(v).toEqual({ status: 'in_review', import_source: 'control', imported_by: FOUNDER });
    const pageText = readPdf(twoPages(), { pages: true }).pages;
    const lines = (
      await h.db.pg.query(
        `select title_en, source_url, source_page, checked_on::text as checked_on from content.units where version_id = $1
         union all select title_en, source_url, source_page, checked_on::text from content.chapters where version_id = $1
         union all select title_en, source_url, source_page, checked_on::text from content.topics where version_id = $1`,
        [versionId]
      )
    ).rows;
    expect(lines).toHaveLength(4);
    for (const l of lines) {
      expect(l.source_url).toBe(SOURCE);
      expect(l.checked_on).toBe(indiaDate());
      expect(squash(pageText[Number(l.source_page) - 1])).toContain(squash(l.title_en));
    }
    const audits = (await h.db.pg.query(`select event_action, after_state from audit_log where target_id = $1 order by audit_id`, [versionId])).rows;
    expect(audits.map((a) => a.event_action)).toEqual(['content.syllabus.imported', 'content.syllabus.extracted']);
    expect(audits[1].after_state).toEqual({ pages: 2, kept: 4, dropped: 4, promptVersion: 'v1' });
  });

  it('the uploader cannot approve it; another person can', async () => {
    const own = await versionPost(req(`/api/control/content/versions/${versionId}`, { action: 'approve' }, founder), { params: { versionId } });
    expect(own.status).toBe(403);
    expect((await own.json()).code).toBe('own_import');
    const ok = await versionPost(req(`/api/control/content/versions/${versionId}`, { action: 'approve' }, second), { params: { versionId } });
    expect(ok.status).toBe(200);
  });

  it('a second import of the same syllabus is the next version, compared with the one before', async () => {
    ai.reply = JSON.stringify({ units: [{ title: 'NUMBER SYSTEMS', page: 1, chapters: [{ title: 'REAL NUMBERS', page: 2, topics: [{ title: "Euclid's division lemma", page: 2 }] }] }] });
    const res = await pdfImport(req('/api/control/content/pdf-import', form(), second));
    expect(res.status).toBe(201);
    const next = (await res.json()).version;
    expect(next.versionNo).toBe(2);
    const diff = await (await diffRoute(req(`/api/control/content/diff?from=${versionId}&to=${next.versionId}`, undefined, founder))).json();
    expect(diff.diff.removed.map((l: { key: string }) => l.key)).toEqual(['cbse.c10.mathematics.u1.ch01.t02']);
    expect(diff.diff.renamed.map((l: { key: string }) => l.key)).toEqual(['cbse.c10.mathematics.u1.ch01']);
  });

  it('refuses a source address off the allowlist, a PDF with no text, a file that is not a PDF, before any AI call', async () => {
    const before = ai.calls.length;
    for (const sourceUrl of ['https://example.org/syllabus.pdf', 'http://cbseacademic.nic.in/x.pdf', 'https://cbseacademic.nic.in.evil.example/x.pdf']) {
      const res = await pdfImport(req('/api/control/content/pdf-import', form({ sourceUrl }), founder));
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('source_url_bad');
    }
    const scan = await pdfImport(req('/api/control/content/pdf-import', form({ pdf: b64(scanOnly()) }), founder));
    expect(scan.status).toBe(422);
    expect((await scan.json()).code).toBe('no_text');
    const notPdf = await pdfImport(req('/api/control/content/pdf-import', form({ pdf: Buffer.from('hello, not a pdf').toString('base64') }), founder));
    expect((await notPdf.json()).code).toBe('not_a_pdf');
    const unknown = await pdfImport(req('/api/control/content/pdf-import', form({ board: 'ZZB' }), founder));
    expect((await unknown.json()).code).toBe('board_unknown');
    expect(ai.calls.length).toBe(before);
  });

  it('says plainly when the profile is not switched on, and keeps nothing when no chapter is on its page', async () => {
    const count = async () => Number((await h.db.pg.query(`select count(*) n from content.syllabus_versions`)).rows[0].n);
    const before = await count();
    ai.refuse = 'not_switched_on';
    const off = await pdfImport(req('/api/control/content/pdf-import', form(), founder));
    expect(off.status).toBe(503);
    expect((await off.json()).code).toBe('ai_not_switched_on');
    ai.refuse = null;
    ai.reply = JSON.stringify({ units: [], chapters: [{ title: 'Made-up chapter', page: 1, topics: [] }] });
    const none = await pdfImport(req('/api/control/content/pdf-import', form(), founder));
    expect(none.status).toBe(422);
    expect((await none.json()).code).toBe('nothing_found');
    expect(await count()).toBe(before);
  });

  it('nobody without a session, nobody from a school or a family, no staff session without the authenticator', async () => {
    expect((await pdfImport(req('/api/control/content/pdf-import', form()))).status).toBe(401);
    expect((await pdfImport(req('/api/control/content/pdf-import', form(), family))).status).toBe(401);
    expect((await pdfImport(req('/api/control/content/pdf-import', form(), principal))).status).toBe(403);
    const aal1 = await cookieFor(FOUNDER, 'super_admin', null, 'aal1');
    expect((await pdfImport(req('/api/control/content/pdf-import', form(), aal1))).status).toBe(403);
  });
});
