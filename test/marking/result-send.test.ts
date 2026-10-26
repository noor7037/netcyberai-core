import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { RESULT_TEMPLATE, resultDedupeKey, tellParentsPreview, tellParentsSend } from '@/lib/marking/result-send';
import { definitionProblem, metaShapeProblem, placeholderOrder, TEMPLATE_LANGUAGES, TEMPLATE_REGISTRY } from '@/lib/whatsapp/templates';
import { templateExample } from '@/lib/whatsapp/template-examples';

// AM-5 (C351): the office tells parents on WhatsApp that a published result is ready, after seeing who will get it.
// The template is in Meta's shape with no marks in it; the preview's recipients are the send-gate's own (consent off,
// no number, STOP, the school's WhatsApp off); Send queues exactly one message per guardian through the outbox, and a
// second Send queues none; another school's office and a teacher reach nothing. Every name and number is made up.

const u = (n: number) => `a9000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const [PRINCIPAL, TEACHER, COORDINATOR, B_PRINCIPAL, ADMIN] = [u(11), u(12), u(13), u(14), u(15)];
const C6A = u(21);
const MATH = u(31);
const [S1, S2, S3, S4] = [u(51), u(52), u(53), u(54)];
const [P1, P1B, P2, P3, P4, P5] = [u(61), u(62), u(63), u(64), u(65), u(66)];
const X1 = u(71);
const PP1 = u(81);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (c: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const queue = createPgJobQueue(platform);
type Who = { role: string; user: string; school: string };
const office: Who = { role: 'principal', user: PRINCIPAL, school: A };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (c: any, actor: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (c: any) => {
    await c.query(`set local role app_user`);
    for (const [k, v] of Object.entries({ 'app.current_tenant_id': who.school, 'app.current_role': who.role, 'app.current_user_id': who.user })) await c.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(c, { schoolId: who.school, userId: who.user, role: who.role });
  });
const jobs = async () => (await q(`select payload from jobs where type = 'whatsapp.send' order by created_at`)).map((r: { payload: Record<string, unknown> }) => r.payload);
const preview = (who: Who = office) => as(who, (c, a) => tellParentsPreview(c, a, X1, C6A));
const send = (who: Who = office) => as(who, (c, a) => tellParentsSend(c, queue, a, X1, C6A));

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  const def = TEMPLATE_REGISTRY.find((d) => d.name === RESULT_TEMPLATE)!;
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise) values
      ('${A}', 'School A', 'IN-HR', false, false, true, 100000), ('${B}', 'School B', 'IN-DL', false, false, true, 100000);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true), ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Tara Teacher', true),
      ('${COORDINATOR}', '${A}', 'c@a.invalid', 'academic_coordinator', 'Chetan Coordinator', true), ('${B_PRINCIPAL}', '${B}', 'p@b.invalid', 'principal', 'Bela Principal', true),
      ('${ADMIN}', '${A}', 'a@a.invalid', 'school_admin', 'Arjun Admin', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${C6A}', '${A}', '6-A', '6', 'A');
    insert into subjects (subject_id, school_id, name) values ('${MATH}', '${A}', 'Mathematics');
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
      ('${S1}', '${A}', 'A-1', 'Aarav Kumar', '${C6A}', '1', 'active'), ('${S2}', '${A}', 'A-2', 'Bela Singh', '${C6A}', '2', 'active'),
      ('${S3}', '${A}', 'A-3', 'Chirag Rao', '${C6A}', '3', 'active'), ('${S4}', '${A}', 'A-4', 'Diya Shah', '${C6A}', '4', 'active');
    insert into parents (parent_id, school_id, name, phone, relation) values
      ('${P1}', '${A}', 'Rajesh Kumar', '9800000001', 'Father'), ('${P1B}', '${A}', 'Rita Kumar', '9800000011', 'Mother'),
      ('${P2}', '${A}', 'Sunita Singh', '9800000002', 'Mother'), ('${P3}', '${A}', 'Ravi Rao', '9800000003', 'Father'),
      ('${P4}', '${A}', 'Hina Shah', '', 'Mother'), ('${P5}', '${A}', 'Hari Shah', '9800000005', 'Father');
    insert into parent_student_map (school_id, parent_id, student_id) values
      ('${A}', '${P1}', '${S1}'), ('${A}', '${P1B}', '${S1}'), ('${A}', '${P2}', '${S2}'), ('${A}', '${P3}', '${S3}'), ('${A}', '${P4}', '${S4}'), ('${A}', '${P5}', '${S4}');
    -- S1 and S4: records and messages. S2: records, no messages. S3: no consent for the records at all.
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values
      ('${A}', '${S1}', 'core_records', true, 'school_attested', 'v1'), ('${A}', '${S1}', 'operational_communication', true, 'school_attested', 'v1'),
      ('${A}', '${S2}', 'core_records', true, 'school_attested', 'v1'),
      ('${A}', '${S4}', 'core_records', true, 'school_attested', 'v1'), ('${A}', '${S4}', 'operational_communication', true, 'school_attested', 'v1'),
      ('${A}', '${S3}', 'operational_communication', true, 'school_attested', 'v1');
    insert into whatsapp_opt_outs (school_id, phone) values ('${A}', '+919800000005');
    insert into grading_schemes (school_id, version, scheme, made_by) values ('${A}', 1, '{"bands":[],"decimals":0,"passMark":33,"components":[],"terms":[],"layout":{},"coScholastic":null}'::jsonb, '${PRINCIPAL}');
    insert into exams (exam_id, school_id, name, term, created_by) values ('${X1}', '${A}', 'Half-yearly', 'Term 1', '${PRINCIPAL}');
    insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, unit_ids, components, created_by) values
      ('${PP1}', '${A}', '${X1}', '${C6A}', '${MATH}', '{}', '[{"key":"marks","name":"Marks","max":50,"share":null}]', '${PRINCIPAL}');
  `);
  for (const lang of TEMPLATE_LANGUAGES) {
    await q(
      `insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status, approved_at, wording_reviewed, wording_reviewed_by, wording_reviewed_at, wording_reviewed_note)
       values (null, $1, $2, $3, $4, $5, 'utility', $6, 'approved', now(), true, gen_random_uuid(), now(), 'Read by a Hindi reader (made up for the test).')`,
      [def.name, def.version, lang, def.body[lang], [...def.variables], def.staleAfterMinutes]
    );
  }
}, 120_000);
afterAll(async () => db?.stop());

describe('the template, exam_result_ready v1 (C344, C351)', () => {
  it('is in Meta’s shape, utility, under the certificates’ purpose, and names no mark', () => {
    const d = TEMPLATE_REGISTRY.find((x) => x.name === RESULT_TEMPLATE)!;
    expect(d).toMatchObject({ version: 1, category: 'utility', purpose: 'operational_communication', variables: ['school', 'child', 'exam', 'link'] });
    expect(definitionProblem(d)).toBeNull();
    for (const lang of TEMPLATE_LANGUAGES) {
      expect(metaShapeProblem(d.body[lang])).toBeNull();
      expect(placeholderOrder(d.body[lang])).toEqual(['school', 'child', 'exam', 'link']);
      expect(d.body[lang]).toMatch(/30/);
      expect(d.body[lang]).not.toMatch(/mark|grade|percent|अंक|ग्रेड|प्रतिशत/i);
      for (const v of d.variables) expect(templateExample(d.name, v, lang), `${lang} ${v}`).not.toBeNull();
    }
  });
});

describe('telling parents on WhatsApp (C351)', () => {
  it('nothing before the class is published', async () => {
    expect(await preview()).toBe('not_published');
    expect(await send()).toEqual({ ok: false, reason: 'not_published' });
    await db.pg.exec(`
      insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score, entered_by)
        select '${A}', '${X1}', '${MATH}', '${PP1}', 'marks', s, 'score', 40, 0, '${TEACHER}' from unnest(array['${S1}', '${S2}', '${S3}', '${S4}']::uuid[]) s;
      update exam_papers set entered_at = now(), entered_by = '${TEACHER}' where paper_id = '${PP1}';
      insert into exam_publications (school_id, exam_id, class_id, version, scheme_version, scheme, published_by) values ('${A}', '${X1}', '${C6A}', 1, 1, '{}', '${PRINCIPAL}');
    `);
  });

  it('the preview says who will get it and why the others will not, by the send-gate’s own rules', async () => {
    const p = await preview();
    if (typeof p === 'string') throw new Error(p);
    const lines = p.children.map((c) => [c.name, c.guardians.map((g) => [g.name, g.will, g.why, g.last4])]);
    expect(lines).toEqual([
      ['Aarav Kumar', [['Rajesh Kumar', true, null, '0001'], ['Rita Kumar', true, null, '0011']]],
      ['Bela Singh', [['Sunita Singh', false, 'no_consent', '0002']]],
      ['Chirag Rao', [['Ravi Rao', false, 'no_records', '0003']]],
      ['Diya Shah', [['Hari Shah', false, 'opted_out', '0005'], ['Hina Shah', false, 'no_number', null]]],
    ]);
    expect(p).toMatchObject({ version: 1, will: 2, wont: 4, sent: 0 });
    // The preview recorded nothing: no message row, no job, no link.
    expect(await q(`select count(*)::int as n from communication_log`)).toEqual([{ n: 0 }]);
    expect(await jobs()).toEqual([]);
    expect(await q(`select count(*)::int as n from marking_report_links`)).toEqual([{ n: 0 }]);
  });

  it('the school’s WhatsApp switched off: nobody will get it, and the preview says so', async () => {
    await q(`update schools set is_pilot = true, pilot_allow_outbound = false where school_id = $1`, [A]);
    const p = await preview();
    if (typeof p === 'string') throw new Error(p);
    expect(p.will).toBe(0);
    expect(p.children[0].guardians.map((g) => g.why)).toEqual(['whatsapp_off', 'whatsapp_off']);
    expect(await send()).toEqual({ ok: true, queued: 0, children: 0 });
    expect(await jobs()).toEqual([]);
    await q(`update schools set is_pilot = false, pilot_allow_outbound = true where school_id = $1`, [A]);
    // No budget set, then the words not approved: the gate's own reasons.
    await q(`update schools set monthly_budget_paise = null where school_id = $1`, [A]);
    expect(((await preview()) as { children: { guardians: { why: string | null }[] }[] }).children[0].guardians.map((g) => g.why)).toEqual(['budget', 'budget']);
    await q(`update schools set monthly_budget_paise = 100000 where school_id = $1`, [A]);
    await q(`update whatsapp_templates set status = 'pending' where template_name = $1`, [RESULT_TEMPLATE]);
    expect(((await preview()) as { children: { guardians: { why: string | null }[] }[] }).children[0].guardians.map((g) => g.why)).toEqual(['not_approved', 'not_approved']);
    expect(await send()).toEqual({ ok: true, queued: 0, children: 0 });
    await q(`update whatsapp_templates set status = 'approved' where template_name = $1`, [RESULT_TEMPLATE]);
    // Nothing was written by any of it: no message row, no link.
    expect(await q(`select count(*)::int as n from communication_log`)).toEqual([{ n: 0 }]);
    expect(await q(`select count(*)::int as n from marking_report_links`)).toEqual([{ n: 0 }]);
  });

  it('two guardians with one number: one message reaches it', async () => {
    await q(`update parents set phone = '9800000001' where parent_id = $1`, [P1B]);
    const p = await preview();
    if (typeof p === 'string') throw new Error(p);
    expect(p.children[0].guardians.map((g) => [g.name, g.will, g.why])).toEqual([['Rajesh Kumar', true, null], ['Rita Kumar', false, 'same_number']]);
    await q(`update parents set phone = '9800000011' where parent_id = $1`, [P1B]);
  });

  it('a teacher, the coordinator and another school’s office reach nothing', async () => {
    expect(await preview({ role: 'teacher', user: TEACHER, school: A })).toBe('not_allowed');
    // The coordinator cannot see a parent's STOP under the school's rules, so it cannot be shown a true preview.
    expect(await preview({ role: 'academic_coordinator', user: COORDINATOR, school: A })).toBe('not_allowed');
    expect(await send({ role: 'academic_coordinator', user: COORDINATOR, school: A })).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await send({ role: 'teacher', user: TEACHER, school: A })).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await preview({ role: 'principal', user: B_PRINCIPAL, school: B })).toBe('not_found');
    expect(await send({ role: 'principal', user: B_PRINCIPAL, school: B })).toEqual({ ok: false, reason: 'not_found' });
    expect(await jobs()).toEqual([]);
  });

  it('Send makes the child’s link and queues exactly one message per guardian the gate takes; the job holds no link', async () => {
    expect(await send()).toEqual({ ok: true, queued: 2, children: 1 });
    const rows = await q(`select parent_id, student_id, template_name, status::text as status, dedupe_key, template_params, language from communication_log order by parent_id`);
    expect(rows.map((r: { parent_id: string; status: string; dedupe_key: string }) => [r.parent_id, r.status, r.dedupe_key])).toEqual([
      [P1, 'queued', resultDedupeKey(X1, C6A, 1, S1, P1)],
      [P1B, 'queued', resultDedupeKey(X1, C6A, 1, S1, P1B)],
    ]);
    const link = rows[0].template_params.link as string;
    expect(rows[0].template_params).toEqual({ child: 'Aarav Kumar', exam: 'Half-yearly', link });
    const key = link.split('/results/')[1].split('?')[0];
    expect(await q(`select student_id, publication_version from marking_report_links where key_hash = $1`, [createHash('sha256').update(key).digest('hex')])).toEqual([{ student_id: S1, publication_version: 1 }]);
    const queued = await jobs();
    expect(queued).toHaveLength(2);
    expect(JSON.stringify(queued)).not.toContain(key);
    // The audit row has counts and ids only.
    const audit = await q(`select after_state from audit_log where event_action = 'marking.results_sent' order by occurred_at desc limit 1`);
    expect(audit[0].after_state).toMatchObject({ classId: C6A, version: 1, children: 1, queued: 2 });
    expect(JSON.stringify(audit)).not.toContain(key);
  });

  it('a second Send queues none, and a child already sent is not sent again', async () => {
    expect(await send()).toEqual({ ok: true, queued: 0, children: 0 });
    expect(await jobs()).toHaveLength(2);
    expect(await q(`select count(*)::int as n from marking_report_links`)).toEqual([{ n: 1 }]);
    // The school admin finds nothing new either.
    expect(await send({ role: 'school_admin', user: ADMIN, school: A })).toEqual({ ok: true, queued: 0, children: 0 });
    const p = await preview();
    if (typeof p === 'string') throw new Error(p);
    expect(p.children[0]).toMatchObject({ sent: true });
    expect(p.children[0].guardians.map((g) => g.state)).toEqual(['queued', 'queued']);
    expect(p).toMatchObject({ will: 0, sent: 1 });
  });

  it('after sending, each message’s state follows the message records', async () => {
    await q(`update communication_log set status = 'delivered', delivered_at = now() where parent_id = $1`, [P1]);
    await q(`update communication_log set status = 'read', delivered_at = now(), read_at = now() where parent_id = $1`, [P1B]);
    const p = await preview({ role: 'school_admin', user: ADMIN, school: A });
    if (typeof p === 'string') throw new Error(p);
    expect(p.children[0].guardians.map((g) => [g.name, g.state])).toEqual([['Rajesh Kumar', 'delivered'], ['Rita Kumar', 'read']]);
  });

  it('consent given later: the next Send reaches the child who could not be sent before, once', async () => {
    await q(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version, created_at) values ($1, $2, 'operational_communication', true, 'school_attested', 'v1', now() + interval '1 second')`, [A, S2]);
    expect(await send()).toEqual({ ok: true, queued: 1, children: 1 });
    expect(await send()).toEqual({ ok: true, queued: 0, children: 0 });
    expect(await jobs()).toHaveLength(3);
  });
});
