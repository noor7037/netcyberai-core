import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { standInProvider, type AIProvider, type DraftRequest } from '@/lib/ai/provider';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { approveAnswer, composeAnswer, discardAnswer, draftAnswer, factsFor, listAnswers, tipRequest } from '@/lib/parent-ai/answers';
import { TEMPLATE_REGISTRY, definitionProblem, renderTemplate } from '@/lib/whatsapp/templates';

// Parent AI v1 (docs/25 slice 7n, C196). The acceptance test: an answer cites what it used; nothing sends
// unapproved; no other child's data is in the prompt. Every name and number is made up.

const A = 'ce000000-0000-4000-8000-000000000001';
const u = (n: number) => `ce000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, TARA, TARUN] = [u(11), u(12), u(13)];
const [CLASS_5A, CLASS_6B] = [u(51), u(52)];
const [MATHS, GEOGRAPHY] = [u(61), u(62)];
const [ASHA, BILAL, FARAH, NEW_CHILD] = [u(31), u(32), u(36), u(38)];
const [G_ASHA, G_BILAL, G_FARAH] = [u(41), u(42), u(46)];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const tara: Who = { role: 'teacher', user: TARA };
const tarun: Who = { role: 'teacher', user: TARUN };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const queue = createPgJobQueue(platform);
const actor = (who: Who) => ({ schoolId: A, userId: who.user, role: who.role as never });
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const sent = async () => (await db.pg.query(`select template_name as t, to_phone as phone, template_params as p, status::text as status from communication_log order by created_at, log_id`)).rows;
// A provider that keeps what it was asked, to hold what may be in a prompt.
const asked: DraftRequest[] = [];
const recording: AIProvider = { name: 'recording', draft: async (r) => (asked.push(r), standInProvider.draft(r)) };
const aiOn = (tokens: number) => db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source, limits) values ($1, 'teacher-copilot', true, 'founder_override', $2::jsonb) on conflict (school_id, module_id) do update set enabled = true, limits = excluded.limits`, [A, JSON.stringify({ monthly_tokens: tokens })]);

describe('the words', () => {
  it('the template names the school first and the child by first name', () => {
    const t = TEMPLATE_REGISTRY.find((x) => x.name === 'home_help')!;
    expect(definitionProblem(t)).toBeNull();
    expect(renderTemplate(t.body.en, { school: 'School A', child: 'Asha', answer: 'x' })).toBe('School A: What you can do at home for Asha. x');
  });
  it('the answer is fixed sentences over the facts; with nothing taught there is no tip to give', () => {
    const facts = { firstName: 'Asha', classLevel: '5', sources: [{ kind: 'taught' as const, subject: 'Maths', topic: 'Fractions', on: '2026-10-12' }, { kind: 'homework' as const, subject: 'Maths', title: 'Exercise 4', due: '2026-10-14' }, { kind: 'followup' as const }] };
    expect(composeAnswer(facts, null)).toBe('This week the class learned: Fractions (Maths). Ask Asha to explain “Fractions” to you in their own words for five minutes. Homework still to finish: Exercise 4 (Maths, due 14 October). Asha’s teacher will also give some extra help in class.');
    expect(composeAnswer(facts, 'A tip.')).toContain('Fractions (Maths). A tip. Homework');
    expect(tipRequest({ ...facts, sources: facts.sources.slice(1) })).toBeNull();
  });
});

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    // 5-A (Tara): Asha Sharma and Bilal Khan. 6-B (Tarun): Farah Ali. 5-A was taught Fractions and Decimals; 6-B, Rivers.
    // Homework "Exercise 4": Asha has NOT done it. Homework "Worksheet 9": Asha has done it, Bilal has not.
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end) values ('${A}', 'School A', 'IN-HR', false, false, true, 100000, '00:00', '00:00');
      insert into school_entitlements (school_id, plan) values ('${A}', 'standard');
      insert into users (user_id, school_id, email, role, display_name) values ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'), ('${TARA}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Teacher'), ('${TARUN}', '${A}', 'tarun@school-a.example', 'teacher', 'Tarun Teacher');
      insert into classes (class_id, school_id, name, grade, class_teacher_id) values ('${CLASS_5A}', '${A}', '5-A', '5', '${TARA}'), ('${CLASS_6B}', '${A}', '6-B', '6', '${TARUN}');
      insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Maths'), ('${GEOGRAPHY}', '${A}', 'Geography');
      insert into students (student_id, school_id, admission_no, name, status, class_id) values ('${ASHA}', '${A}', 'A-1', 'Asha Sharma', 'active', '${CLASS_5A}'), ('${BILAL}', '${A}', 'A-2', 'Bilal Khan', 'active', '${CLASS_5A}'),
        ('${FARAH}', '${A}', 'A-6', 'Farah Ali', 'active', '${CLASS_6B}'), ('${NEW_CHILD}', '${A}', 'A-8', 'Nikhil Nanda', 'active', null);
      insert into parents (parent_id, school_id, name, phone) values ('${G_ASHA}', '${A}', 'Anita Sharma', '9000000001'), ('${G_BILAL}', '${A}', 'Bashir Khan', '9000000002'), ('${G_FARAH}', '${A}', 'Fatima Ali', 'not given');
      insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${G_ASHA}', '${ASHA}'), ('${A}', '${G_BILAL}', '${BILAL}'), ('${A}', '${G_FARAH}', '${FARAH}'), ('${A}', '${G_ASHA}', '${NEW_CHILD}');
      insert into pulse_messages (school_id, class_id, subject_id, topic, body_en, body_hi, body_hinglish, sent_on, status, created_by, sent_at, sent_by) values
        ('${A}', '${CLASS_5A}', '${MATHS}', 'Fractions', 'x', 'हिन्दी', 'x', '${today}', 'ready', '${TARA}', null, null),
        ('${A}', '${CLASS_5A}', '${MATHS}', 'Decimals', 'x', 'हिन्दी', 'x', '${today}'::date - 2, 'sent', '${TARA}', now(), '${TARA}'),
        ('${A}', '${CLASS_5A}', '${MATHS}', 'An old topic', 'x', 'हिन्दी', 'x', '${today}'::date - 20, 'sent', '${TARA}', now(), '${TARA}'),
        ('${A}', '${CLASS_5A}', '${MATHS}', 'A draft topic', '', '', '', '${today}', 'draft', '${TARA}', null, null),
        ('${A}', '${CLASS_6B}', '${GEOGRAPHY}', 'Rivers', 'x', 'हिन्दी', 'x', '${today}', 'sent', '${TARUN}', now(), '${TARUN}');
      insert into homework (homework_id, school_id, subject_id, title, due_date, created_by) values ('${u(71)}', '${A}', '${MATHS}', 'Exercise 4', '${today}', '${TARA}'), ('${u(72)}', '${A}', '${MATHS}', 'Worksheet 9', '${today}', '${TARA}');
      insert into homework_targets (target_id, school_id, homework_id, class_id, title, due_date) values ('${u(81)}', '${A}', '${u(71)}', '${CLASS_5A}', 'Exercise 4', '${today}'), ('${u(82)}', '${A}', '${u(72)}', '${CLASS_5A}', 'Worksheet 9', '${today}');
      insert into homework_status (school_id, target_id, class_id, student_id, done, checked_by) values ('${A}', '${u(81)}', '${CLASS_5A}', '${ASHA}', false, '${TARA}'), ('${A}', '${u(82)}', '${CLASS_5A}', '${ASHA}', true, '${TARA}'), ('${A}', '${u(82)}', '${CLASS_5A}', '${BILAL}', false, '${TARA}');
      insert into pulse_followups (school_id, student_id, class_id, kind, source) values ('${A}', '${BILAL}', '${CLASS_5A}', 'did_not_understand', 'staff');
    `);
    const t = TEMPLATE_REGISTRY.find((x) => x.name === 'home_help')!;
    await db.pg.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status) values (null, 'home_help', 1, 'en', $1, $2, 'utility', 1440, 'approved')`, [t.body.en, [...t.variables]]);
    for (const s of [ASHA, BILAL]) await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1'`, [A, s]);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('the facts are that child’s own: their class’s topics of the last seven days, and their own homework not done', async () => {
    const asha = (await as(tara, (c) => factsFor(c, A, ASHA, today)))!;
    expect(asha).toMatchObject({ firstName: 'Asha', classLevel: '5' });
    expect(asha.sources).toEqual([
      { kind: 'taught', subject: 'Maths', topic: 'Fractions', on: today },
      { kind: 'taught', subject: 'Maths', topic: 'Decimals', on: new Date(new Date(`${today}T00:00:00Z`).getTime() - 2 * 86400_000).toISOString().slice(0, 10) },
      { kind: 'homework', subject: 'Maths', title: 'Exercise 4', due: today },
    ]);
    // Bilal's: his own homework (not Asha's), and the follow-up open for him (not for her).
    expect((await as(tara, (c) => factsFor(c, A, BILAL, today)))!.sources.slice(2)).toEqual([{ kind: 'homework', subject: 'Maths', title: 'Worksheet 9', due: today }, { kind: 'followup' }]);
  });

  it('an answer cites what it used, and nothing is sent by drafting it', async () => {
    const made = await as(tara, (c) => draftAnswer(c, null, actor(tara), { studentId: ASHA, parentId: G_ASHA }, today));
    expect(made).toMatchObject({ ok: true, aiAssisted: false });
    const d = made as Extract<typeof made, { ok: true }>;
    expect(d.sources.map((s) => s.kind)).toEqual(['taught', 'taught', 'homework']);
    expect(d.body).toContain('Fractions (Maths); Decimals (Maths)');
    expect(d.body).toContain('Exercise 4');
    // Nothing of another child's is in it: not Bilal's homework, not his follow-up, not 6-B's topic.
    expect(d.body).not.toMatch(/Worksheet 9|extra help|Rivers|Bilal|Farah|An old topic|A draft topic/);
    const [row] = await as(tara, (c) => listAnswers(c, A));
    expect(row).toMatchObject({ child: 'Asha Sharma', guardian: 'Anita Sharma', status: 'draft', ai_assisted: false, message: null });
    expect(row.sources).toEqual(d.sources);
    expect(await sent()).toEqual([]);
    // The database refuses an answer that cites nothing.
    await expect(as(tara, (c) => c.query(`insert into parent_ai_answers (school_id, student_id, parent_id, body, sources, ai_assisted, drafted_by) values ($1, $2, $3, 'x', '[]'::jsonb, false, $4)`, [A, ASHA, G_ASHA, TARA]))).rejects.toThrow(/check constraint/);
    // With nothing taught on record and no homework of the child's, nothing is drafted: there is nothing true to say.
    expect(await as(principal, (c) => draftAnswer(c, null, actor(principal), { studentId: NEW_CHILD, parentId: G_ASHA }, today))).toEqual({ ok: false, reason: 'nothing_to_go_on' });
  });

  it('no child’s data is in the prompt: a model is asked about the class level, the subject and the topic, and nothing else', async () => {
    await aiOn(100000);
    const made = await as(tara, (c) => draftAnswer(c, recording, actor(tara), { studentId: BILAL, parentId: G_BILAL }, today));
    expect(made).toMatchObject({ ok: true, aiAssisted: true });
    expect(asked).toEqual([{ kind: 'home_help', classLevel: '5', subject: 'Maths', chapter: 'Fractions', topic: 'Fractions' }]);
    const prompt = JSON.stringify(asked);
    for (const never of ['Asha', 'Sharma', 'Bilal', 'Khan', 'Farah', 'Anita', 'Bashir', '9000000', 'Worksheet 9', 'Exercise 4', '5-A', ASHA, BILAL, G_BILAL, A]) expect(prompt, never).not.toContain(never);
    // The child's own work is still in the answer: added by the app's fixed rules, after the model answered.
    const d = made as Extract<typeof made, { ok: true }>;
    expect(d.body).toContain('Worksheet 9');
    expect(d.body).toContain('Bilal’s teacher will also give some extra help in class.');
    expect(d.body).not.toContain('Exercise 4'); // that one is Asha's
    expect((await db.pg.query(`select kind, user_id from ai_usage`)).rows).toEqual([{ kind: 'home_help', user_id: TARA }]);
    // Over the school's limit, the model is not asked at all and the tip is the fixed sentence.
    await aiOn(1);
    expect(await as(tara, (c) => draftAnswer(c, recording, actor(tara), { studentId: BILAL, parentId: G_BILAL }, today))).toMatchObject({ ok: true, aiAssisted: false });
    expect(asked).toHaveLength(1);
  });

  it('a teacher drafts and reads only for children of their own classes', async () => {
    expect(await as(tarun, (c) => draftAnswer(c, null, actor(tarun), { studentId: ASHA, parentId: G_ASHA }, today))).toEqual({ ok: false, reason: 'guardian' });
    expect(await as(tarun, (c) => listAnswers(c, A))).toEqual([]);
    expect(await as(tara, (c) => draftAnswer(c, null, actor(tara), { studentId: ASHA, parentId: G_BILAL }, today))).toEqual({ ok: false, reason: 'guardian' }); // not that child's guardian
    expect(await as({ role: 'accountant', user: PRINCIPAL }, (c) => draftAnswer(c, null, { schoolId: A, userId: PRINCIPAL, role: 'accountant' as never }, { studentId: ASHA, parentId: G_ASHA }, today))).toEqual({ ok: false, reason: 'not_allowed' });
    expect((await as(principal, (c) => listAnswers(c, A))).length).toBe(3);
  });

  it('nothing sends unapproved: approving is what sends it, with the words the person approved, once', async () => {
    const drafts = (await as(tara, (c) => listAnswers(c, A))).filter((a) => a.child === 'Asha Sharma');
    expect(await sent()).toEqual([]);
    expect(await as(tarun, (c) => approveAnswer(c, queue, actor(tarun), drafts[0].answer_id, 'x'))).toEqual({ ok: false, reason: 'not_found' }); // not his class's child
    expect(await as(tara, (c) => approveAnswer(c, queue, actor(tara), drafts[0].answer_id, '   '))).toEqual({ ok: false, reason: 'words' });
    // Marking it sent in the database without an approver is refused.
    await expect(as(tara, (c) => c.query(`update parent_ai_answers set status = 'sent' where answer_id = '${drafts[0].answer_id}'`))).rejects.toThrow(/check constraint/);
    expect(await sent()).toEqual([]);
    expect(await as(tara, (c) => approveAnswer(c, queue, actor(tara), drafts[0].answer_id, 'Ask Asha to show you\nExercise 4 tonight.'))).toEqual({ ok: true, status: 'queued' });
    expect(await sent()).toEqual([{ t: 'home_help', phone: '+919000000001', p: { child: 'Asha', answer: 'Ask Asha to show you Exercise 4 tonight.' }, status: 'queued' }]);
    expect(await as(tara, (c) => approveAnswer(c, queue, actor(tara), drafts[0].answer_id, 'Again.'))).toEqual({ ok: false, reason: 'not_a_draft' });
    await expect(as(principal, (c) => c.query(`update parent_ai_answers set body = 'other words' where answer_id = '${drafts[0].answer_id}'`))).rejects.toThrow(/never changed/);
    expect((await as(tara, (c) => listAnswers(c, A))).find((a) => a.answer_id === drafts[0].answer_id)).toMatchObject({ status: 'sent', approved_by: 'Tara Teacher', body: 'Ask Asha to show you Exercise 4 tonight.', message: 'queued' });
    expect((await db.pg.query(`select after_state from audit_log where event_action = 'parent_ai.approved_and_sent'`)).rows).toEqual([{ after_state: { status: 'sent', message: 'queued' } }]);
  });

  it('a discarded draft is gone from the list and sends nothing; a guardian with no usable number cannot be sent to', async () => {
    const bilals = (await as(tara, (c) => listAnswers(c, A))).filter((a) => a.child === 'Bilal Khan');
    expect(bilals).toHaveLength(2);
    expect(await as(tara, (c) => discardAnswer(c, actor(tara), bilals[0].answer_id))).toEqual({ ok: true });
    expect(await as(tara, (c) => discardAnswer(c, actor(tara), bilals[0].answer_id))).toEqual({ ok: false, reason: 'not_found' });
    expect((await as(tara, (c) => listAnswers(c, A))).filter((a) => a.child === 'Bilal Khan')).toHaveLength(1);
    const farah = await as(tarun, (c) => draftAnswer(c, null, actor(tarun), { studentId: FARAH, parentId: G_FARAH }, today));
    expect(farah).toMatchObject({ ok: true });
    expect(await as(tarun, (c) => approveAnswer(c, queue, actor(tarun), (farah as { answerId: string }).answerId, 'Ask Farah about rivers.'))).toEqual({ ok: false, reason: 'no_number' });
    expect(await sent()).toHaveLength(1);
  });
});
