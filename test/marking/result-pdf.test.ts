import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { CHECKED_PAPER_KEYS } from '@/lib/family/marks-words';
import { CHECKED_PDF_WORD_KEYS, looksLikePdf, pdfFileName, PDF_MAX_BYTES } from '@/lib/marking/checked-pdf-shape';
import { PDF_ROLES, PDF_TEMPLATE, resultPdfsSweepHandler, storeResultPdf } from '@/lib/marking/checked-pdf-store';
import { RESULT_TEMPLATE, resultDedupeKey, TELL_ROLES, tellParentsPreview, tellParentsSend } from '@/lib/marking/result-send';
import { MemoryFileStorage } from '@/lib/storage/file-storage';
import { examplePdf } from '@/lib/whatsapp/example-pdf';
import { deliverQueued, sendWhatsAppMessage } from '@/lib/whatsapp/gate';
import { GRAPH_VERSION, MetaWhatsAppProvider } from '@/lib/whatsapp/meta';
import { definitionProblem, metaShapeProblem, placeholderOrder, TEMPLATE_LANGUAGES, TEMPLATE_REGISTRY } from '@/lib/whatsapp/templates';
import { templateExample } from '@/lib/whatsapp/template-examples';

// AQ-5 (C366): the checked answer sheets as a PDF on WhatsApp, on the whole schema. The office's browser hands in a
// child's PDF (the route is the principal's and the school admin's only, refuses a child outside the publication and
// anything that is not a PDF); Send queues the PDF message for that child and the link-only one for a child without
// pages; the send-gate gives the PDF to Meta only for a message that passed every rule, once for all the child's
// guardians and retries; our copy is deleted once sent, and the sweep deletes what is left after seven days; another
// school reaches nothing. NO NETWORK CALL IS MADE: Meta's adapter is handed a fetch that answers in Meta's documented
// shape. Every name, number, token and id is made up.

const session = vi.hoisted(() => ({ claims: null as unknown, run: null as unknown }));
const files = vi.hoisted(() => ({ store: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => session.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (session.run as (c: unknown, f: unknown) => Promise<unknown>)(claims, fn),
}));
vi.mock('@/lib/storage/supabase-file-storage', async () => {
  const { MemoryFileStorage: Memory } = await import('@/lib/storage/file-storage');
  files.store = new Memory();
  return { supabaseFileStorage: files.store };
});
import { GET as dataRoute, POST as uploadRoute } from '@/app/api/app/exams/[examId]/classes/[classId]/tell-parents/pdf/route';

const u = (n: number) => `a7500000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const [PRINCIPAL, TEACHER, COORDINATOR, ADMIN, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(15)];
const [C6A, C7B] = [u(21), u(22)];
const MATH = u(31);
const U1 = u(41);
const [S1, S2, S3, S4] = [u(51), u(52), u(53), u(54)];
const [P1, P1B, P1C, P2, P4] = [u(61), u(62), u(63), u(64), u(65)];
const X1 = u(71);
const PP1 = u(81);
const [Q1, Q2] = [u(91), u(92)];
const UP = u(101);
const [SH1, SH2, SH4] = [u(111), u(112), u(114)];
const [G1A, G1B, G4A] = [u(121), u(122), u(124)];
const SCHEME = { bands: [], decimals: 0, passMark: 33, components: [], terms: [], layout: {}, coScholastic: null };
const CONFIG = { accessToken: 'MADEUPTOKEN_aq5_0123456789abcdefghijklmnopqrstuvwxyz_END', appSecret: 'madeupappsecret0123456789abcdef', verifyToken: 'made-up-verify-token-0123456789', phoneNumberId: '106540352242922', wabaId: '102290129340398' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const store = () => files.store as MemoryFileStorage;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (c: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const queue = createPgJobQueue(platform);
// One statement as the platform role (the send-gate and the sweep's role), its rows.
const pq = (sql: string, p: unknown[]): Promise<Record<string, unknown>[]> => platform(async (c) => (await c.query(sql, p)).rows as Record<string, unknown>[]);
type Who = { role: string; user: string; school: string };
const office: Who = { role: 'principal', user: PRINCIPAL, school: A };
const teacher: Who = { role: 'teacher', user: TEACHER, school: A };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR, school: A };
const otherSchool: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (c: any, actor: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (c: any) => {
    await c.query(`set local role app_user`);
    for (const [k, v] of Object.entries({ 'app.current_tenant_id': who.school, 'app.current_role': who.role, 'app.current_user_id': who.user })) await c.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(c, { schoolId: who.school, userId: who.user, role: who.role });
  });
const signIn = (who: Who) => {
  session.claims = { sub: who.user, role: who.role, schoolId: who.school, membershipId: null, tv: 0 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session.run = (claims: any, fn: any) => as({ role: claims.role, user: claims.sub, school: claims.schoolId }, (c) => fn(c));
};
const params = { examId: X1, classId: C6A };
const getData = async (who: Who, studentId: string) => {
  signIn(who);
  const res = await dataRoute(new NextRequest(`http://school.example/api/app/exams/${X1}/classes/${C6A}/tell-parents/pdf?studentId=${studentId}`), { params });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const upload = async (who: Who, studentId: string, bytes: Uint8Array, length = bytes.length) => {
  signIn(who);
  const req = new NextRequest(`http://school.example/api/app/exams/${X1}/classes/${C6A}/tell-parents/pdf?studentId=${studentId}`, { method: 'POST', body: bytes, headers: { 'content-type': 'application/pdf', 'content-length': String(length) } } as never);
  const res = await uploadRoute(req, { params });
  return { status: res.status, body: await res.json().catch(() => null) };
};
// A PDF as the office's browser hands it in: the format the browser's writer makes (src/lib/pdf/jpeg-pdf.ts), made up.
const madePdf = (tag: string) => new TextEncoder().encode(`%PDF-1.4\n% a child's checked papers, made up for the test: ${tag}\n${'x'.repeat(200)}\ntrailer\n<< >>\n%%EOF\n`);

// Meta, as its documentation answers: a file given → its media id; a template message → its message id. Every call
// is recorded, with the form's fields when it is a file.
type Call = { url: string; method: string; headers: Record<string, string>; form: Record<string, unknown> | null; json: unknown };
const meta = { calls: [] as Call[], failMessages: 0 };
const fetcher = async (url: string, init: { method: string; headers: Record<string, string>; body?: string | FormData | Uint8Array }) => {
  let form: Record<string, unknown> | null = null;
  if (init.body instanceof FormData) {
    form = {};
    for (const [k, v] of init.body.entries()) form[k] = typeof v === 'string' ? v : { name: (v as File).name, type: v.type, bytes: new Uint8Array(await v.arrayBuffer()) };
  }
  meta.calls.push({ url, method: init.method, headers: init.headers, form, json: typeof init.body === 'string' ? JSON.parse(init.body) : null });
  if (url.endsWith('/media')) return { ok: true, status: 200, json: async () => ({ id: '1037543291543636' }) };
  if (meta.failMessages > 0) {
    meta.failMessages -= 1;
    return { ok: false, status: 500, json: async () => ({ error: { message: 'Temporary error', code: 2 } }) };
  }
  return { ok: true, status: 200, json: async () => ({ messaging_product: 'whatsapp', contacts: [{ input: '+919800000001', wa_id: '919800000001' }], messages: [{ id: `wamid.made-up-${meta.calls.length}` }] }) };
};
const provider = new MetaWhatsAppProvider(CONFIG, fetcher as never);
let clock = new Date();
const deliver = (logId: string) => deliverQueued({ platform, queue, provider, storage: store(), now: () => clock }, logId);
const logOf = async (parentId: string) => (await q(`select log_id, status::text as status, reason, template_name, template_params from communication_log where parent_id = $1 order by created_at desc limit 1`, [parentId]))[0];
const pdfRow = async (studentId: string) => (await q(`select * from result_pdfs where student_id = $1 order by made_at desc limit 1`, [studentId]))[0];
const mediaCalls = () => meta.calls.filter((c) => c.url.endsWith('/media'));

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-aq-5-pdf-tests-0123456789abcdef';
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end) values
      ('${A}', 'School A', 'IN-HR', false, false, true, 100000, '00:00', '00:00'), ('${B}', 'School B', 'IN-DL', false, false, true, 100000, '00:00', '00:00');
    insert into school_entitlements (school_id, plan) values ('${A}', 'standard'), ('${B}', 'standard');
    insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'exams', true, 'plan'), ('${B}', 'exams', true, 'plan') on conflict do nothing;
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true), ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Tara Teacher', true),
      ('${COORDINATOR}', '${A}', 'c@a.invalid', 'academic_coordinator', 'Chetan Coordinator', true), ('${ADMIN}', '${A}', 'a@a.invalid', 'school_admin', 'Arjun Admin', true),
      ('${B_PRINCIPAL}', '${B}', 'p@b.invalid', 'principal', 'Bela Principal', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${C6A}', '${A}', '6-A', '6', 'A'), ('${C7B}', '${A}', '7-B', '7', 'B');
    insert into subjects (subject_id, school_id, name) values ('${MATH}', '${A}', 'Mathematics');
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
      ('${S1}', '${A}', 'A-1', 'Aarav Kumar', '${C6A}', '1', 'active'), ('${S2}', '${A}', 'A-2', 'Bela Singh', '${C6A}', '2', 'active'),
      ('${S3}', '${A}', 'A-3', 'Chirag Rao', '${C7B}', '3', 'active'), ('${S4}', '${A}', 'A-4', 'Diya Shah', '${C6A}', '4', 'active');
    insert into parents (parent_id, school_id, name, phone, relation) values
      ('${P1}', '${A}', 'Rajesh Kumar', '9800000001', 'Father'), ('${P1B}', '${A}', 'Rita Kumar', '9800000011', 'Mother'), ('${P1C}', '${A}', 'Ravi Kumar', '9800000021', 'Uncle'),
      ('${P2}', '${A}', 'Sunita Singh', '9800000002', 'Mother'), ('${P4}', '${A}', 'Hari Shah', '9800000004', 'Father');
    insert into parent_student_map (school_id, parent_id, student_id) values
      ('${A}', '${P1}', '${S1}'), ('${A}', '${P1B}', '${S1}'), ('${A}', '${P1C}', '${S1}'), ('${A}', '${P2}', '${S2}'), ('${A}', '${P4}', '${S4}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version)
      select '${A}', s, p::consent_purpose, true, 'school_attested', 'v1' from unnest(array['${S1}', '${S2}', '${S3}', '${S4}']::uuid[]) s, unnest(array['core_records', 'operational_communication']) p;
    insert into message_rate_table (channel, billing_category, rate_paise, gst_percent, verified_source, verified_at, effective_from) values ('whatsapp', 'utility', 100, 18, 'TEST VALUE, not a real rate', now(), current_date - 30);
    insert into syllabus_units (unit_id, school_id, class_id, subject_id, position, chapter, topic) values ('${U1}', '${A}', '${C6A}', '${MATH}', 1, 'Fractions', 'Adding fractions');
    insert into grading_schemes (school_id, version, scheme, made_by) values ('${A}', 1, '${JSON.stringify(SCHEME)}'::jsonb, '${PRINCIPAL}');
    insert into exams (exam_id, school_id, name, term, created_by) values ('${X1}', '${A}', 'Half-yearly', 'Term 1', '${PRINCIPAL}');
    insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, unit_ids, components, created_by) values
      ('${PP1}', '${A}', '${X1}', '${C6A}', '${MATH}', '{}', '[{"key":"written","name":"Written","max":10,"share":null}]', '${PRINCIPAL}');
    insert into marking_questions (school_id, question_id, paper_id, position, label, component, max_marks, choice_group, unit_id, kind, prompt, answer_key, steps, updated_by) values
      ('${A}', '${Q1}', '${PP1}', 1, '1', 'written', 5, null, '${U1}', 'short', 'Add 1/2 and 1/4.', 'SECRET-KEY', '[]', '${TEACHER}'),
      ('${A}', '${Q2}', '${PP1}', 2, '2', 'written', 5, null, null, 'short', 'Write 0.7 as a fraction.', 'SECRET-KEY', '[]', '${TEACHER}');
    insert into marking_uploads (school_id, upload_id, paper_id, mode, created_by, closed_at) values ('${A}', '${UP}', '${PP1}', 'per_file', '${TEACHER}', now());
  `);
  // Aarav (S1) and Diya (S4) have their checked pages kept; Bela (S2) was marked with no page kept.
  await q(`select set_config('app.current_user_id', $1, false), set_config('app.current_role', 'teacher', false)`, [TEACHER]);
  for (const [sheet, student] of [[SH1, S1], [SH2, S2], [SH4, S4]]) {
    await q(
      `insert into marking_sheets (school_id, sheet_id, paper_id, upload_id, student_id, matched_by, state, strengths, improve, practice)
       values ($1, $2, $3, $4, $5, 'roll', 'marked', 'Neat working.', 'Show each step.', $6::jsonb)`,
      [A, sheet, PP1, UP, student, JSON.stringify([{ unitId: U1, text: 'Five sums adding fractions.' }])]
    );
  }
  for (const [page, sheet, pos, file] of [[G1A, SH1, 1, 1], [G1B, SH1, 2, 1], [G4A, SH4, 1, 4]] as const) {
    await q(
      `insert into marking_pages (school_id, page_id, upload_id, paper_id, file_no, page_no, storage_key, sha256, bytes, width, height, state, sheet_id, sheet_position)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 1000, 1400, 2000, 'read', $9, $6)`,
      [A, page, UP, PP1, file, pos, `${A}/marking/${PP1}/${page}.jpg`, createHash('sha256').update(page).digest('hex'), sheet]
    );
  }
  for (const [sheet, page] of [[SH1, G1A], [SH2, null], [SH4, G4A]] as const) {
    await q(`insert into marking_marks (school_id, sheet_id, paper_id, question_id, attempted, ai_marks, page_id, y_from, y_to) values ($1, $2, $3, $4, true, 4, $5, 0.1, 0.3), ($1, $2, $3, $6, true, 2.5, $5, 0.5, 0.7)`, [A, sheet, PP1, Q1, page, Q2]);
  }
  await q(`update marking_sheets set state = 'approved', approved_at = now() where sheet_id in ($1, $2, $3)`, [SH1, SH2, SH4]);
  await q(`select set_config('app.current_user_id', '', false), set_config('app.current_role', '', false)`);
  await db.pg.exec(`
    insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score, entered_by)
      select '${A}', '${X1}', '${MATH}', '${PP1}', 'written', s, 'score', 6.5, 0, '${TEACHER}' from unnest(array['${S1}', '${S2}', '${S4}']::uuid[]) s;
    update exam_papers set entered_at = now(), entered_by = '${TEACHER}' where paper_id = '${PP1}';
    insert into exam_publications (school_id, exam_id, class_id, version, scheme_version, scheme, published_by) values ('${A}', '${X1}', '${C6A}', 1, 1, '{}', '${PRINCIPAL}');
  `);
  // Both messages' words, approved by us and by Meta (the Hindi read by a reader of Hindi), as Control leaves them.
  for (const name of [RESULT_TEMPLATE, PDF_TEMPLATE]) {
    const d = TEMPLATE_REGISTRY.find((x) => x.name === name)!;
    for (const lang of TEMPLATE_LANGUAGES) {
      await q(
        `insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status, approved_at, meta_status, meta_template_id, wording_reviewed, wording_reviewed_by, wording_reviewed_at, wording_reviewed_note)
         values (null, $1, $2, $3, $4, $5, 'utility', $6, 'approved', now(), 'approved', $7, true, gen_random_uuid(), now(), 'Read by a Hindi reader (made up for the test).')`,
        [d.name, d.version, lang, d.body[lang], [...d.variables], d.staleAfterMinutes, `9${name.length}${lang === 'en' ? 1 : 2}000`]
      );
    }
  }
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
}, 120_000);
afterAll(async () => db?.stop());

describe('the template, exam_result_pdf v1 (C366)', () => {
  it('is in Meta’s shape, carries a document, names the child and the link, and no mark', () => {
    const d = TEMPLATE_REGISTRY.find((x) => x.name === PDF_TEMPLATE)!;
    expect(d).toMatchObject({ version: 1, category: 'utility', purpose: 'operational_communication', header: 'document', variables: ['school', 'child', 'exam', 'link'] });
    expect(definitionProblem(d)).toBeNull();
    for (const lang of TEMPLATE_LANGUAGES) {
      expect(metaShapeProblem(d.body[lang])).toBeNull();
      expect(placeholderOrder(d.body[lang])).toEqual(['school', 'child', 'exam', 'link']);
      expect(d.body[lang]).toMatch(/PDF/);
      expect(d.body[lang]).not.toMatch(/mark|grade|percent|अंक|ग्रेड|प्रतिशत/i);
      for (const v of d.variables) expect(templateExample(d.name, v, lang), `${lang} ${v}`).not.toBeNull();
    }
    // The link-only message stays for a child without pages.
    expect(TEMPLATE_REGISTRY.find((x) => x.name === RESULT_TEMPLATE)?.header).toBeUndefined();
  });

  it('the roles that keep a PDF are the roles that press Send; the family is given every word the PDF needs', () => {
    expect([...PDF_ROLES].sort()).toEqual([...TELL_ROLES].sort());
    for (const k of CHECKED_PDF_WORD_KEYS) expect(CHECKED_PAPER_KEYS, k).toContain(k);
  });

  it('a PDF is known by its own bytes; its name at WhatsApp is the exam, class and roll, never the child', () => {
    expect(looksLikePdf(examplePdf())).toBe(true);
    expect(looksLikePdf(madePdf('x'))).toBe(true);
    expect(looksLikePdf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(100).fill(1)]))).toBe(false);
    expect(looksLikePdf(new TextEncoder().encode(`%PDF-1.4 ${'x'.repeat(2000)}`))).toBe(false);
    expect(pdfFileName('Half-yearly', '6-A', '12')).toBe('Half-yearly_6-A_roll-12.pdf');
    expect(pdfFileName('अर्धवार्षिक', '6-A', null)).toBe('result_6-A.pdf');
    expect(pdfFileName('Unit test (2)', 'Class 6 / A', '3')).toBe('Unit-test-2_Class-6-A_roll-3.pdf');
    expect(new TextDecoder().decode(examplePdf())).toMatch(/Example only: no real child, school or mark\./);
  });
});

describe('the preview says who gets the PDF and who the link only (C366)', () => {
  it('a child with checked pages kept: the PDF; a child with none: the link; the gate is asked about the message each will get', async () => {
    const p = await as(office, (c, a) => tellParentsPreview(c, a, X1, C6A));
    if (typeof p === 'string') throw new Error(p);
    expect(p.pdf).toEqual({ on: true, why: null });
    expect(p.children.map((c) => [c.name, c.pdf, c.guardians.map((g) => g.will)])).toEqual([
      ['Aarav Kumar', 'make', [true, true, true]],
      ['Bela Singh', 'no_pages', [true]],
      ['Diya Shah', 'make', [true]],
    ]);
    // Nothing was written: no message, no copy.
    expect(await q(`select count(*)::int as n from communication_log`)).toEqual([{ n: 0 }]);
    expect(await q(`select count(*)::int as n from result_pdfs`)).toEqual([{ n: 0 }]);
  });

  it('families not shown the checked sheets, or the PDF message not approved by Meta: the link only, said once', async () => {
    await q(`insert into school_settings (school_id, module_id, schema_version, setting_values) values ($1, 'exams', 1, '{"families_see_scripts": false}'::jsonb)`, [A]);
    let p = await as(office, (c, a) => tellParentsPreview(c, a, X1, C6A));
    if (typeof p === 'string') throw new Error(p);
    expect(p.pdf).toEqual({ on: false, why: 'not_shown' });
    expect(p.children.map((c) => c.pdf)).toEqual([null, null, null]);
    expect((await getData(office, S1)).status).toBe(409);
    await q(`delete from school_settings where school_id = $1 and module_id = 'exams'`, [A]);
    await q(`update whatsapp_templates set meta_status = 'pending' where template_name = $1 and language = 'en'`, [PDF_TEMPLATE]);
    p = await as(office, (c, a) => tellParentsPreview(c, a, X1, C6A));
    if (typeof p === 'string') throw new Error(p);
    expect(p.pdf).toEqual({ on: false, why: 'not_approved' });
    await q(`update whatsapp_templates set meta_status = 'approved' where template_name = $1`, [PDF_TEMPLATE]);
  });
});

describe('what the browser draws from, and handing in the PDF (C366)', () => {
  it('the child’s checked papers as the family is shown them, with the pages still kept; only the office reads it', async () => {
    const r = await getData(office, S1);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ school: 'School A', child: 'Aarav Kumar', className: '6-A', rollNo: '1', exam: 'Half-yearly', lang: 'en' });
    expect(r.body.papers).toHaveLength(1);
    expect(r.body.papers[0]).toMatchObject({ subject: 'Mathematics', parts: [{ component: 'written', name: 'Written', score: 6.5, max: 10 }], strengths: 'Neat working.' });
    expect(r.body.papers[0].pages.map((g: { pageId: string }) => g.pageId)).toEqual([G1A, G1B]);
    expect(JSON.stringify(r.body)).not.toMatch(/SECRET/);
    expect((await getData(teacher, S1)).status).toBe(403);
    expect((await getData(coordinator, S1)).status).toBe(403);
    expect((await getData(otherSchool, S1)).status).toBe(404);
    expect((await getData(office, S3)).status).toBe(404); // another class: not in this publication
    expect((await getData(office, S2)).body).toMatchObject({ code: 'no_pages' });
  });

  it('only the principal and the school admin hand one in; not a PDF, too large, a child outside the publication, another school: refused, nothing kept', async () => {
    const pdf = madePdf('Aarav');
    expect((await upload(teacher, S1, pdf)).status).toBe(403);
    expect((await upload(coordinator, S1, pdf)).status).toBe(403);
    expect(await upload(office, S1, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(200).fill(7)]))).toMatchObject({ status: 400, body: { code: 'not_a_pdf' } });
    expect(await upload(office, S1, pdf, PDF_MAX_BYTES + 1)).toMatchObject({ status: 413, body: { code: 'too_large' } });
    expect((await upload(office, S3, pdf)).status).toBe(404);
    expect((await upload(office, S2, pdf)).body).toMatchObject({ code: 'no_pages' });
    expect((await upload(otherSchool, S1, pdf)).status).toBe(404);
    expect(store().files.size).toBe(0);
    expect(await q(`select count(*)::int as n from result_pdfs`)).toEqual([{ n: 0 }]);
  });

  it('kept in the school’s own folder, once: a second hand-in finds the first', async () => {
    const first = await upload(office, S1, madePdf('Aarav'));
    expect(first).toMatchObject({ status: 201, body: { ok: true, existing: false } });
    const again = await upload({ role: 'school_admin', user: ADMIN, school: A }, S1, madePdf('Aarav again'));
    expect(again).toMatchObject({ status: 200, body: { ok: true, existing: true, pdfId: first.body.pdfId } });
    const row = await pdfRow(S1);
    expect(row).toMatchObject({ school_id: A, exam_id: X1, class_id: C6A, student_id: S1, file_name: 'Half-yearly_6-A_roll-1.pdf', made_by: PRINCIPAL, media_id: null, sent_at: null, deleted_at: null });
    expect(row.storage_key).toMatch(new RegExp(`^${A}/result-pdfs/[0-9a-f-]{36}/${row.pdf_id}\\.pdf$`));
    expect([...store().files.keys()]).toEqual([row.storage_key]);
    expect(row.sha256).toBe(createHash('sha256').update(madePdf('Aarav')).digest('hex'));
    // The audit row: ids and the size, never the child's name or the file's place.
    const audit = await q(`select after_state from audit_log where event_action = 'marking.result_pdf_made'`);
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toMatch(/Aarav|result-pdfs/);
    const d = await upload(office, S4, madePdf('Diya'));
    expect(d.status).toBe(201);
  });

  it('the row rules: another school, a teacher and the coordinator read nothing; no session changes or removes a copy', async () => {
    expect(await as(otherSchool, (c) => c.query(`select count(*)::int as n from result_pdfs`).then((r: { rows: unknown[] }) => r.rows))).toEqual([{ n: 0 }]);
    expect(await as(teacher, (c) => c.query(`select count(*)::int as n from result_pdfs`).then((r: { rows: unknown[] }) => r.rows))).toEqual([{ n: 0 }]);
    expect(await as(coordinator, (c) => c.query(`select count(*)::int as n from result_pdfs`).then((r: { rows: unknown[] }) => r.rows))).toEqual([{ n: 0 }]);
    expect(await as(office, (c) => c.query(`select count(*)::int as n from result_pdfs`).then((r: { rows: unknown[] }) => r.rows))).toEqual([{ n: 2 }]);
    await expect(as(office, (c) => c.query(`update result_pdfs set sent_at = now()`))).rejects.toThrow(/permission denied/);
    await expect(as(office, (c) => c.query(`delete from result_pdfs`))).rejects.toThrow(/permission denied/);
    // Made in another's name, for a reopened or another class's publication: refused by the database itself.
    const pub = (await q(`select publication_id from exam_publications where exam_id = $1`, [X1]))[0].publication_id;
    await expect(
      as(office, (c) => c.query(`insert into result_pdfs (pdf_id, school_id, exam_id, class_id, student_id, publication_id, storage_key, file_name, sha256, bytes, made_by) values ($1, $2, $3, $4, $5, $6, $7, 'x.pdf', $8, 10, $9)`, [u(900), A, X1, C6A, S2, pub, `${A}/result-pdfs/${pub}/${u(900)}.pdf`, 'a'.repeat(64), ADMIN]))
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(office, (c) => c.query(`insert into result_pdfs (pdf_id, school_id, exam_id, class_id, student_id, publication_id, storage_key, file_name, sha256, bytes, made_by) values ($1, $2, $3, $4, $5, $6, $7, 'x.pdf', $8, 10, $9)`, [u(901), A, X1, C6A, S3, pub, `${A}/result-pdfs/${pub}/${u(901)}.pdf`, 'a'.repeat(64), PRINCIPAL]))
    ).rejects.toThrow(/row-level security/);
    // The send-gate's functions are the platform's only.
    await expect(as(office, (c) => c.query(`select * from public.result_pdf_take($1, $2, $3)`, [A, u(1), S1]))).rejects.toThrow(/permission denied/);
    await expect(as(office, (c) => c.query(`select * from public.result_pdfs_due(10)`))).rejects.toThrow(/permission denied/);
  });
});

describe('Send, and the send-gate giving the PDF to Meta (C366)', () => {
  it('Send queues the PDF message for a child whose PDF is kept, the link-only one for a child without pages; each once', async () => {
    expect(await as(office, (c, a) => tellParentsSend(c, queue, a, X1, C6A))).toEqual({ ok: true, queued: 5, children: 3 });
    const rows = await q(`select parent_id, template_name, template_params, dedupe_key from communication_log order by parent_id`);
    const pdf1 = (await pdfRow(S1)).pdf_id;
    expect(rows.map((r: { parent_id: string; template_name: string; template_params: Record<string, string> }) => [r.parent_id, r.template_name, r.template_params.child, r.template_params.document ?? null])).toEqual([
      [P1, PDF_TEMPLATE, 'Aarav', pdf1],
      [P1B, PDF_TEMPLATE, 'Aarav', pdf1],
      [P1C, PDF_TEMPLATE, 'Aarav', pdf1],
      [P2, RESULT_TEMPLATE, 'Bela Singh', null],
      [P4, PDF_TEMPLATE, 'Diya', (await pdfRow(S4)).pdf_id],
    ]);
    // One message per child, guardian and publication, under the same keys as before.
    expect(rows[0].dedupe_key).toBe(resultDedupeKey(X1, C6A, 1, S1, P1));
    expect(rows[0].template_params.link).toMatch(/^sealed:/);
    const audit = await q(`select after_state from audit_log where event_action = 'marking.results_sent'`);
    expect(audit[0].after_state).toMatchObject({ children: 3, queued: 5, pdfs: 2 });
    // A second Send sends nothing twice; the preview says the children are sent.
    expect(await as(office, (c, a) => tellParentsSend(c, queue, a, X1, C6A))).toEqual({ ok: true, queued: 0, children: 0 });
    expect((await getData(office, S1)).body).toMatchObject({ code: 'already_sent' });
    expect(meta.calls).toEqual([]);
  });

  it('a message the gate refuses gives nothing to Meta', async () => {
    // Rajesh asked to stop after the message was queued: the gate reads it again as the message goes.
    await q(`insert into whatsapp_opt_outs (school_id, phone) values ($1, '+919800000001')`, [A]);
    clock = new Date(Date.now() + 1000);
    const out = await deliver((await logOf(P1)).log_id);
    expect(out.status).toBe('blocked_consent');
    expect(meta.calls).toEqual([]);
    expect(await pdfRow(S1)).toMatchObject({ media_id: null, upload_claimed_at: null, sent_at: null, deleted_at: null });
    expect(store().files.size).toBe(2);
  });

  it('while another send is giving the same PDF, this one waits and gives nothing', async () => {
    const pdf1 = (await pdfRow(S1)).pdf_id;
    expect((await pq(`select state from public.result_pdf_take($1, $2, $3)`, [A, pdf1, S1]))).toEqual([{ state: 'upload' }]);
    const out = await deliver((await logOf(P1B)).log_id);
    expect(out).toMatchObject({ status: 'queued' });
    expect(meta.calls).toEqual([]);
    expect((await logOf(P1B)).status).toBe('queued');
    await platform((c) => c.query(`select public.result_pdf_release($1, $2)`, [A, pdf1]));
  });

  it('the first message that passes gives the PDF to Meta, as documented, then sends the template with it; our copy is deleted', async () => {
    clock = new Date(Date.now() + 5 * 60_000);
    const out = await deliver((await logOf(P1B)).log_id);
    expect(out.status).toBe('sent');
    const [given, sent] = meta.calls;
    expect(meta.calls).toHaveLength(2);
    // POST /{phone-number-id}/media, multipart: messaging_product, the file with its type, and the type.
    expect(given.url).toBe(`https://graph.facebook.com/${GRAPH_VERSION}/${CONFIG.phoneNumberId}/media`);
    expect(given.headers).toEqual({ Authorization: `Bearer ${CONFIG.accessToken}` });
    expect(given.form).toMatchObject({ messaging_product: 'whatsapp', type: 'application/pdf', file: { name: 'Half-yearly_6-A_roll-1.pdf', type: 'application/pdf' } });
    expect((given.form?.file as { bytes: Uint8Array }).bytes).toEqual(madePdf('Aarav'));
    // The template, with the document header first: { type: header, parameters: [{ type: document, document: { id, filename } }] }.
    expect(sent.url).toBe(`https://graph.facebook.com/${GRAPH_VERSION}/${CONFIG.phoneNumberId}/messages`);
    const body = sent.json as { to: string; template: { name: string; components: { type: string; parameters: unknown[] }[] } };
    expect(body.to).toBe('+919800000011');
    expect(body.template.name).toBe(PDF_TEMPLATE);
    expect(body.template.components[0]).toEqual({ type: 'header', parameters: [{ type: 'document', document: { id: '1037543291543636', filename: 'Half-yearly_6-A_roll-1.pdf' } }] });
    expect(body.template.components[1].type).toBe('body');
    expect(body.template.components[1].parameters.map((p) => (p as { text: string }).text)).toEqual(['School A', 'Aarav', 'Half-yearly', expect.stringMatching(/\/results\/[A-Za-z0-9_-]{43}$/)]);
    expect(JSON.stringify(body)).not.toMatch(/Kumar|6\.5/);
    // Recorded: the media id, once; sent; our copy deleted from the store.
    const row = await pdfRow(S1);
    expect(row.media_id).toBe('1037543291543636');
    expect(row.sent_at).not.toBeNull();
    expect(row.deleted_at).not.toBeNull();
    expect(store().files.has(row.storage_key)).toBe(false);
    // The log keeps which copy the message carried, and never the link.
    const log = await logOf(P1B);
    expect(log).toMatchObject({ status: 'sent', template_name: PDF_TEMPLATE });
    expect(log.template_params.document).toBe(row.pdf_id);
    expect(log.template_params.link).toMatch(/^sealed:/);
  });

  it('the child’s other guardian, and a retry after Meta failed, send the same file again by its id: Meta is given it once', async () => {
    meta.failMessages = 1;
    const first = await deliver((await logOf(P1C)).log_id);
    expect(first).toMatchObject({ status: 'queued' });
    expect(mediaCalls()).toHaveLength(1);
    clock = new Date(clock.getTime() + 30 * 60_000);
    const again = await deliver((await logOf(P1C)).log_id);
    expect(again.status).toBe('sent');
    expect(mediaCalls()).toHaveLength(1);
    const last = meta.calls[meta.calls.length - 1].json as { to: string; template: { components: { parameters: { document?: { id: string } }[] }[] } };
    expect(last.to).toBe('+919800000021');
    expect(last.template.components[0].parameters[0].document?.id).toBe('1037543291543636');
    // A message already sent is never sent again.
    const n = meta.calls.length;
    expect(await deliver((await logOf(P1C)).log_id)).toEqual({ status: 'sent' });
    expect(await deliver((await logOf(P1B)).log_id)).toEqual({ status: 'sent' });
    expect(meta.calls).toHaveLength(n);
  });

  it('the link-only message carries no document', async () => {
    const out = await deliver((await logOf(P2)).log_id);
    expect(out.status).toBe('sent');
    const last = meta.calls[meta.calls.length - 1].json as { template: { name: string; components: { type: string }[] } };
    expect(last.template.name).toBe(RESULT_TEMPLATE);
    expect(last.template.components.map((c) => c.type)).toEqual(['body']);
    expect(mediaCalls()).toHaveLength(1);
  });

  it('a copy no longer kept, or a result reopened: the message fails, saying so, and nothing goes to Meta', async () => {
    // Diya's copy is swept before her message goes (made more than seven days ago).
    await q(`set session_replication_role = replica`);
    await q(`update result_pdfs set made_at = now() - interval '8 days' where student_id = $1`, [S4]);
    await q(`set session_replication_role = origin`);
    await resultPdfsSweepHandler({ platform, storage: store() })({ payload: {} } as never);
    const swept = await pdfRow(S4);
    expect(swept.deleted_at).not.toBeNull();
    expect(store().files.size).toBe(0);
    const n = meta.calls.length;
    const out = await deliver((await logOf(P4)).log_id);
    expect(out).toMatchObject({ status: 'failed', reason: expect.stringMatching(/not kept any more/) });
    expect(meta.calls).toHaveLength(n);
    expect((await logOf(P4)).template_params.document).toBe(swept.pdf_id);
  });

  it('the send-now path never sends a message with a document', async () => {
    const r = await platform((c) =>
      sendWhatsAppMessage(c, { schoolId: A, studentId: S1, parentId: P1B, purpose: 'operational_communication', toPhone: '+919800000011', templateName: PDF_TEMPLATE, templateParams: { child: 'Aarav', exam: 'Half-yearly', link: 'https://x.example/l', document: u(1) }, dedupeKey: 'aq5-send-now' }, { platformDefaultProvider: provider })
    );
    expect(r).toMatchObject({ status: 'failed', reason: 'a message with a document is sent through the outbox only' });
  });
});

describe('the sweep, and another school (C366)', () => {
  it('deletes every copy sent, or made more than seven days ago, and records it; a fresh copy stays', async () => {
    // A copy kept for a new publication of the class after it is reopened and published again.
    await q(`update exam_publications set reopened_at = now(), reopened_by = $1, reopen_reason = 'A mark was corrected.' where exam_id = $2 and version = 1`, [PRINCIPAL, X1]);
    await q(`insert into exam_publications (school_id, exam_id, class_id, version, scheme_version, scheme, published_by) values ($1, $2, $3, 2, 1, '{}', $4)`, [A, X1, C6A, PRINCIPAL]);
    const fresh = await as(office, (c, a) => storeResultPdf(c, store(), a, X1, C6A, S1, madePdf('Aarav, again')));
    expect(fresh).toMatchObject({ ok: true, existing: false });
    const key = (await pdfRow(S1)).storage_key;
    // Diya's new copy was sent, but its file could not be deleted at that moment: the sweep deletes it.
    expect(await as(office, (c, a) => storeResultPdf(c, store(), a, X1, C6A, S4, madePdf('Diya, again')))).toMatchObject({ ok: true, existing: false });
    const diya = await pdfRow(S4);
    expect((await pq(`select public.result_pdf_sent($1, $2) as key`, [A, diya.pdf_id]))).toEqual([{ key: diya.storage_key }]);
    expect(store().files.has(diya.storage_key)).toBe(true);
    await resultPdfsSweepHandler({ platform, storage: store() })({ payload: {} } as never);
    expect([...store().files.keys()]).toEqual([key]);
    expect((await pdfRow(S1)).deleted_at).toBeNull();
    expect((await pdfRow(S4)).deleted_at).not.toBeNull();
    // One audit row a school and run, with the count only.
    const audit = await q(`select school_id, after_state from audit_log where event_action = 'marking.result_pdfs_deleted' order by occurred_at`);
    expect(audit).toEqual([
      { school_id: A, after_state: { deleted: 1, by: 'marking.result_pdfs_sweep' } },
      { school_id: A, after_state: { deleted: 1, by: 'marking.result_pdfs_sweep' } },
    ]);
  });

  it('another school’s copy is out of reach: not read, not taken, not given', async () => {
    const row = await pdfRow(S1);
    expect((await pq(`select state from public.result_pdf_take($1, $2, $3)`, [B, row.pdf_id, S1]))).toEqual([{ state: 'gone' }]);
    expect((await pq(`select state from public.result_pdf_take($1, $2, $3)`, [A, row.pdf_id, S2]))).toEqual([{ state: 'gone' }]);
    expect(await as(otherSchool, (c, a) => storeResultPdf(c, store(), a, X1, C6A, S1, madePdf('B')))).toEqual({ ok: false, reason: 'not_found' });
    expect(await as(otherSchool, (c) => c.query(`select * from result_pdfs`).then((r: { rows: unknown[] }) => r.rows))).toEqual([]);
    // The right school and child, while the result is in force: it may go.
    expect((await pq(`select state from public.result_pdf_take($1, $2, $3)`, [A, row.pdf_id, S1]))).toEqual([{ state: 'upload' }]);
  });
});
