import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { recordTaught, type TaughtInput } from '@/lib/academics/taught';
import { createHomework, editHomework } from '@/lib/homework/homework';
import { changeDraft, listDrafts } from '@/lib/pulse/drafts';
import { pulseBodies, pulseDate } from '@/lib/pulse/text';

// The Pulse draft's words (docs/20 5f, C151): fixed templates in English,
// Hindi and Hinglish, then the draft as the app keeps it, on the whole real
// schema as app_user.

describe('the words, with no database', () => {
  const lesson = { className: '5-A', subjectName: 'Maths', topic: 'Fractions: halves and quarters', homework: [] as { title: string; dueDate: string }[] };

  it('a lesson not taught produces nothing', () => {
    expect(pulseBodies({ ...lesson, status: 'not_taught' })).toBeNull();
    expect(pulseBodies({ ...lesson, status: 'not_taught', homework: [{ title: 'Page 42', dueDate: '2026-10-14' }] })).toBeNull();
  });

  it('taught, in the three languages, and always the same words for the same lesson', () => {
    const b = pulseBodies({ ...lesson, status: 'taught' })!;
    expect(b).toEqual({
      en: '5-A, Maths: today the class learned “Fractions: halves and quarters”.',
      hi: '5-A, Maths: आज कक्षा में “Fractions: halves and quarters” पढ़ाया गया।',
      hinglish: '5-A, Maths: aaj class mein “Fractions: halves and quarters” padhaya gaya.',
    });
    expect(pulseBodies({ ...lesson, status: 'taught' })).toEqual(b);
    expect(b.hi).toMatch(/[ऀ-ॿ]/);
    expect(b.hinglish).not.toMatch(/[ऀ-ॿ]/);
  });

  it('partly taught and delayed say so; neither says the lesson was taught', () => {
    const partial = pulseBodies({ ...lesson, status: 'partial' })!;
    const delayed = pulseBodies({ ...lesson, status: 'delayed' })!;
    expect(partial.en).toBe('5-A, Maths: today the class began “Fractions: halves and quarters”. It will be completed in the next class.');
    expect(delayed.en).toBe('5-A, Maths: today’s lesson “Fractions: halves and quarters” was moved to the next class.');
    for (const b of [partial, delayed]) {
      expect(b.en).not.toMatch(/learned/);
      expect(b.hi).not.toMatch(/पढ़ाया गया/);
      expect(b.hinglish).not.toMatch(/padhaya gaya/);
    }
  });

  it('the day’s homework follows the lesson, with its due date in words', () => {
    const b = pulseBodies({ ...lesson, status: 'taught', homework: [{ title: 'Questions 1 to 5, page 42', dueDate: '2026-10-14' }] })!;
    expect(b.en.split('\n')[1]).toBe('Homework: Questions 1 to 5, page 42. Due on 14 October.');
    expect(b.hi.split('\n')[1]).toBe('गृहकार्य: Questions 1 to 5, page 42। 14 अक्टूबर तक जमा करना है।');
    expect(b.hinglish.split('\n')[1]).toBe('Homework: Questions 1 to 5, page 42. 14 October tak jama karna hai.');
    expect([pulseDate('2026-01-05', 'en'), pulseDate('2026-12-31', 'hi')]).toEqual(['5 January', '31 दिसंबर']);
  });
});

const A = 'aa000000-0000-4000-8000-000000000001';
const PRINCIPAL = 'aa000000-0000-4000-8000-0000000000a1';
const T1 = 'aa000000-0000-4000-8000-0000000000a2';
const T2 = 'aa000000-0000-4000-8000-0000000000a3';
const ACCOUNTANT = 'aa000000-0000-4000-8000-0000000000a4';
const T1_PROFILE = 'aa000000-0000-4000-8000-0000000000f2';
const C5 = 'aa000000-0000-4000-8000-0000000000c1';
const MATHS = 'aa000000-0000-4000-8000-0000000000d1';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const t1: Who = { role: 'teacher', user: T1, school: A };
const t2: Who = { role: 'teacher', user: T2, school: A };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT, school: A };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    await tx.query(`select set_config('app.current_tenant_id', $1, true)`, [who.school]);
    await tx.query(`select set_config('app.current_role', $1, true)`, [who.role]);
    await tx.query(`select set_config('app.current_user_id', $1, true)`, [who.user]);
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
let TODAY = '';
const tap = (more: Partial<TaughtInput> = {}) => as(t1, (c) => recordTaught(c, actor(t1), { classId: C5, subjectId: MATHS, topic: 'Fractions: halves and quarters', status: 'taught', date: TODAY, teacherId: null, unitId: null, note: null, ...more }));
const homework = (who: Who, title: string, dueDate: string) => as(who, (c) => createHomework(c, actor(who), { title, details: null, dueDate, subjectId: MATHS, classIds: [C5] }));
const drafts = (who: Who = t1) => as(who, (c) => listDrafts(c, A, TODAY));
const reset = () => db.pg.exec(`delete from homework_status; delete from homework_targets; delete from homework; delete from pulse_messages; delete from syllabus_progress; delete from usage_events;`);
const plusDays = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

describe('the draft, as the app keeps it', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR');
      insert into users (user_id, school_id, email, role, display_name) values
        ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'), ('${T1}', '${A}', 't1@a.invalid', 'teacher', 'Teacher One'),
        ('${T2}', '${A}', 't2@a.invalid', 'teacher', 'Teacher Two'), ('${ACCOUNTANT}', '${A}', 'acc@a.invalid', 'accountant', 'Accountant');
      insert into teachers (teacher_id, school_id, user_id, name) values ('${T1_PROFILE}', '${A}', '${T1}', 'Teacher One');
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5}', '${A}', '5-A', '${T1}');
      insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Maths');
      insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ('${A}', '${T1_PROFILE}', '${MATHS}', '${C5}');
    `);
    TODAY = (await db.pg.query(`select (now() at time zone 'Asia/Kolkata')::date::text as d`)).rows[0].d;
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  it('one tap prepares the words in three languages', async () => {
    await reset();
    await tap();
    expect(await drafts()).toMatchObject([{ class_name: '5-A', subject_name: 'Maths', status: 'draft', edited: false, body_en: '5-A, Maths: today the class learned “Fractions: halves and quarters”.', body_hinglish: '5-A, Maths: aaj class mein “Fractions: halves and quarters” padhaya gaya.' }]);
    expect((await drafts())[0].body_hi).toContain('पढ़ाया गया');
  });

  it('homework set that day for the same class and subject joins the draft, whether set before or after the tap; changing it changes the draft', async () => {
    const due = plusDays(2);
    const made = await homework(t1, 'Questions 1 to 5, page 42', due);
    const [d] = await drafts();
    expect(d.body_en.split('\n')).toEqual(['5-A, Maths: today the class learned “Fractions: halves and quarters”.', expect.stringMatching(/^Homework: Questions 1 to 5, page 42\. Due on \d{1,2} [A-Z][a-z]+\.$/)]);
    expect(d.body_hinglish).toContain('tak jama karna hai');
    // The tap again (a changed topic): the homework is still in it.
    await tap({ topic: 'Fractions: comparing' });
    expect((await drafts())[0].body_en).toMatch(/learned “Fractions: comparing”\.\nHomework: Questions 1 to 5, page 42\./);
    // The homework is corrected for this section: the draft follows.
    if (!made.ok) throw new Error('unreachable');
    await as(t1, (c) => editHomework(c, actor(t1), made.homeworkId, { title: 'Questions 1 to 6, page 42', details: null, dueDate: due, applyTo: made.targetIds }));
    expect((await drafts())[0].body_en).toContain('Homework: Questions 1 to 6, page 42.');
  });

  it('a ready message contains the day’s topic and homework; ready needs words in all three languages', async () => {
    const [d] = await drafts();
    expect(await as(t1, (c) => changeDraft(c, actor(t1), d.pulse_id, { bodies: { hi: '   ' }, status: 'ready' }))).toEqual({ ok: false, reason: 'words_missing' });
    const ready = await as(t1, (c) => changeDraft(c, actor(t1), d.pulse_id, { status: 'ready' }));
    expect(ready).toMatchObject({ ok: true, draft: { status: 'ready', edited: false } });
    if (!ready.ok) throw new Error('unreachable');
    for (const body of [ready.draft.body_en, ready.draft.body_hi, ready.draft.body_hinglish]) {
      expect(body).toContain('Fractions: comparing');
      expect(body).toContain('Questions 1 to 6, page 42');
    }
    // The database holds the rule too.
    await expect(db.pg.query(`update pulse_messages set body_hi = '' where status = 'ready'`)).rejects.toThrow(/pulse_messages_ready_has_words/);
  });

  it('nothing is sent: no message is logged, no job is enqueued, and no message is marked sent', async () => {
    expect((await db.pg.query(`select 1 from communication_log where school_id = $1`, [A])).rows).toEqual([]);
    const jobs = (await db.pg.query(`select table_name from information_schema.tables where table_schema = 'public' and table_name like '%job%'`)).rows as { table_name: string }[];
    for (const j of jobs) expect((await db.pg.query(`select count(*)::int as n from ${j.table_name}`)).rows[0].n, j.table_name).toBe(0);
    expect((await db.pg.query(`select status from pulse_messages`)).rows).toEqual([{ status: 'ready' }]);
    // The app has no way to mark one sent.
    const [d] = await drafts();
    expect(await as(t1, (c) => changeDraft(c, actor(t1), d.pulse_id, { status: 'sent' as never }))).toMatchObject({ ok: true, draft: { status: 'ready' } });
  });

  it('a person’s own words are kept when homework is set later; changing the words of a ready message takes it back to draft', async () => {
    const [d] = await drafts();
    const edited = await as(t1, (c) => changeDraft(c, actor(t1), d.pulse_id, { bodies: { en: 'Today we compared fractions with paper strips. Ask your child to show you!' } }));
    expect(edited).toMatchObject({ ok: true, draft: { status: 'draft', edited: true } });
    await homework(principal, 'Bring a ruler', plusDays(1));
    expect((await drafts())[0].body_en).toBe('Today we compared fractions with paper strips. Ask your child to show you!');
    // A changed lesson starts the words again: the message must not contradict the log.
    await tap({ topic: 'Fractions: on the number line', status: 'partial' });
    const [fresh] = await drafts();
    expect(fresh).toMatchObject({ status: 'draft', edited: false });
    expect(fresh.body_en).toMatch(/^5-A, Maths: today the class began “Fractions: on the number line”\./);
    expect(fresh.body_en).toContain('Homework: Bring a ruler.');
    expect((await db.pg.query(`select event_action from audit_log where school_id = $1 and event_action like 'pulse.%' order by audit_id`, [A])).rows.map((r: { event_action: string }) => r.event_action)).toEqual(['pulse.ready', 'pulse.draft']);
  });

  it('only the class’s teacher or the office can change it; a sent message is never changed', async () => {
    const [d] = await drafts();
    expect(await drafts(t2)).toEqual([]);
    expect(await as(t2, (c) => changeDraft(c, actor(t2), d.pulse_id, { status: 'ready' }))).toEqual({ ok: false, reason: 'not_found' });
    expect(await as(accountant, (c) => changeDraft(c, actor(accountant), d.pulse_id, { status: 'ready' }))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principal, (c) => changeDraft(c, actor(principal), d.pulse_id, { status: 'ready' }))).toMatchObject({ ok: true, draft: { status: 'ready' } });
    await db.pg.query(`update pulse_messages set status = 'sent'`);
    expect(await as(t1, (c) => changeDraft(c, actor(t1), d.pulse_id, { bodies: { en: 'x' } }))).toEqual({ ok: false, reason: 'already_sent' });
    expect(await as(t1, (c) => changeDraft(c, actor(t1), d.pulse_id, { bodies: { en: 'x'.repeat(1001) } }))).toEqual({ ok: false, reason: 'already_sent' });
  });
});
