import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTestDb, type TestDb } from '../db/pglite-harness';
import { MyDayView } from '@/components/dashboards/MyDayView';
import type { SchoolEntitlements } from '@/lib/contracts/entitlements';
import { MODULE_REGISTRY, SCHOOL_ROLES, type SchoolRole } from '@/lib/contracts/modules';
import { arrangeMyDay, TODAY_CARD_TYPES, type TodayCard } from '@/lib/contracts/today-cards';
import { isMessageKey } from '@/lib/i18n';
import { loadMyDay, providersFor, TODAY_PROVIDERS } from '@/lib/today/cards';

// My Day (docs/19 rule 2, C136) on real Postgres (PGlite) with the
// migrations applied: every card is counted from the school's own rows,
// under the person's own row-level security.

let db: TestDb;
const A = randomUUID();
const B = randomUUID();
const principal = randomUUID();
const admin = randomUUID();
const teacher = randomUUID();
const otherTeacher = randomUUID();
const accountant = randomUUID();
const coordinator = randomUUID();
const classOwn = randomUUID();
const classOther = randomUUID();
const classEmpty = randomUUID();
const students: string[] = [];

const ents = (modules: Record<string, { enabled: boolean }> = {}, accessMode: SchoolEntitlements['accessMode'] = 'full'): SchoolEntitlements => ({
  schoolId: A,
  plan: 'unassigned',
  accessMode,
  modules: Object.fromEntries(MODULE_REGISTRY.map((m) => [m.id, { enabled: modules[m.id]?.enabled ?? true, source: 'plan' as const }])),
});
// A weekday unless a test says otherwise, so the attendance cards are tested every day of the week.
const day = (role: SchoolRole, user: string, e = ents(), school = A, sunday = false) =>
  db.tenant({ role: role as any, sub: user, schoolId: school }, (sql) => loadMyDay(sql, { schoolId: school, userId: user, role }, e, { sunday }));
const card = (cards: TodayCard[], type: string) => cards.find((c) => c.type === type);

beforeAll(async () => {
  db = await createTestDb();
  await db.platform(async (q) => {
    await q.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'A', 'IN-HR'), ($2, 'B', 'IN-DL')`, [A, B]);
    for (const [id, role] of [[principal, 'principal'], [admin, 'school_admin'], [teacher, 'teacher'], [otherTeacher, 'teacher'], [accountant, 'accountant'], [coordinator, 'academic_coordinator']] as const) {
      await q.query(`insert into users (user_id, school_id, role, display_name) values ($1, $2, $3, 'Someone')`, [id, A, role]);
      await q.query(`insert into memberships (user_id, school_id, role) values ($1, $2, $3)`, [id, A, role]);
    }
    await q.query(`insert into classes (class_id, school_id, name, section, class_teacher_id) values ($1, $4, '5', 'A', $5), ($2, $4, '6', 'A', null), ($3, $4, '7', 'A', null)`, [classOwn, classOther, classEmpty, A, teacher]);
    const ownRow = randomUUID();
    await q.query(`insert into teachers (teacher_id, school_id, user_id, name) values ($1, $2, $3, 'Own')`, [ownRow, A, teacher]);
    await q.query(`insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ($1, $2, $3, $4)`, [A, ownRow, randomUUID(), classOwn]);
    const otherRow = randomUUID();
    await q.query(`insert into teachers (teacher_id, school_id, user_id, name) values ($1, $2, $3, 'Other')`, [otherRow, A, otherTeacher]);
    await q.query(`insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ($1, $2, $3, $4)`, [A, otherRow, randomUUID(), classOther]);
    for (let i = 0; i < 5; i++) {
      const id = randomUUID();
      students.push(id);
      await q.query(`insert into students (student_id, school_id, admission_no, name, class_id, status) values ($1, $2, $3, $4, $5, $6)`, [id, A, `A-${i}`, `Child ${i}`, i < 3 ? classOwn : classOther, i === 4 ? 'pending_consent' : 'active']);
    }
    // Another school's rows, which must never be counted.
    const classB = randomUUID();
    await q.query(`insert into classes (class_id, school_id, name, section) values ($1, $2, '5', 'A')`, [classB, B]);
    await q.query(`insert into students (school_id, admission_no, name, class_id, status) values ($1, 'B-1', 'Elsewhere', $2, 'pending_consent'), ($1, 'B-2', 'Elsewhere 2', $2, 'active')`, [B, classB]);
    await q.query(
      `insert into fees_ledger (school_id, student_id, amount_minor, due_date, status) values
         ($1, $2, 100000, (now() at time zone 'Asia/Kolkata')::date, 'pending'),
         ($1, $3, 100000, (now() at time zone 'Asia/Kolkata')::date, 'paid'),
         ($1, $2, 100000, (now() at time zone 'Asia/Kolkata')::date - 10, 'overdue'),
         ($1, $3, 100000, (now() at time zone 'Asia/Kolkata')::date - 20, 'pending'),
         ($1, $3, 100000, (now() at time zone 'Asia/Kolkata')::date - 30, 'paid'),
         ($1, $3, 100000, (now() at time zone 'Asia/Kolkata')::date + 5, 'pending')`,
      [A, students[0], students[1]]
    );
    await q.query(
      `insert into support_tickets (school_id, raised_by, raised_role, category, subject, body, status) values
         ($1, $2, 'principal', 'how_to', 'Office ticket', 'A question from the office about printing.', 'waiting_on_school'),
         ($1, $3, 'teacher', 'how_to', 'Teacher ticket', 'A question from a teacher about a class.', 'waiting_on_school'),
         ($1, $2, 'principal', 'how_to', 'Still open', 'A ticket nobody has answered yet at all.', 'open')`,
      [A, principal, teacher]
    );
  });
}, 60000);

describe('the contract', () => {
  it('every card type has one provider, and its words in both languages', () => {
    expect(TODAY_PROVIDERS.map((p) => p.type).sort()).toEqual([...TODAY_CARD_TYPES].sort());
    for (const type of TODAY_CARD_TYPES) {
      expect(isMessageKey(`today.${type}.action`), type).toBe(true);
      expect(isMessageKey(`today.${type}.why`), type).toBe(true);
      expect(isMessageKey(`today.${type}.todo`) || isMessageKey(`today.${type}.todo.other`), type).toBe(true);
    }
  });

  it('every role has a day; what is waiting comes before what is done', () => {
    for (const role of SCHOOL_ROLES) expect(providersFor(role, ents()).length, role).toBeGreaterThan(0);
    const cards: TodayCard[] = [
      { id: 'a', type: 'attendance-class', moduleId: 'attendance', state: 'done', count: 3, href: '/app/attendance' },
      { id: 'b', type: 'tickets-waiting', moduleId: 'raise-ticket', state: 'todo', count: 1, href: '/app/help/ticket' },
    ];
    expect(arrangeMyDay(cards)).toMatchObject({ waiting: 1, cards: [{ id: 'b' }, { id: 'a' }] });
  });

  it('a module switched off takes its cards away (docs/19 rule 7); tickets are always on', () => {
    expect(providersFor('teacher', ents({ attendance: { enabled: false } })).map((p) => p.type).sort()).toEqual(['followups-open', 'homework-to-check', 'replies-waiting', 'tickets-waiting', 'timetable-today'].sort());
    expect(providersFor('teacher', ents({ attendance: { enabled: false }, timetable: { enabled: false }, pulse: { enabled: false }, homework: { enabled: false }, communication: { enabled: false } })).map((p) => p.type)).toEqual(['tickets-waiting']);
    expect(providersFor('accountant', ents({ fees: { enabled: false } })).map((p) => p.type)).toEqual(['tickets-waiting']);
    expect(providersFor('principal', ents({ fees: { enabled: false }, communication: { enabled: false } })).map((p) => p.type)).toEqual(['attendance-school', 'attendance-requests', 'followups-open', 'consent-waiting', 'complaints-overdue', 'tickets-waiting', 'leave-waiting']);
    expect(providersFor('principal', ents({}, 'suspended')).map((p) => p.type)).toEqual(['tickets-waiting']);
  });
});

describe('each role’s day, counted from the school’s own rows', () => {
  it('teacher: a card for their own class only, counting its active students, and only their own ticket', async () => {
    const d = await day('teacher', teacher);
    expect(d.failed).toBe(0);
    const mine = d.cards.filter((c) => c.type === 'attendance-class');
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ state: 'todo', count: 3, total: 3, subject: '5-A', href: `/app/attendance?class=${classOwn}` });
    expect(card(d.cards, 'tickets-waiting')).toMatchObject({ count: 1 });
    expect(d.cards.some((c) => ['consent-waiting', 'fees-overdue', 'fees-due-today', 'attendance-school', 'messages-held'].includes(c.type))).toBe(false);
  });

  it('a teacher who teaches a class through a subject gets that class, not the other teacher’s', async () => {
    const d = await day('teacher', otherTeacher);
    const mine = d.cards.filter((c) => c.type === 'attendance-class');
    expect(mine.map((c) => c.subject)).toEqual(['6-A']);
    // One active student there and one waiting for consent: both are marked (C143).
    expect(mine[0]).toMatchObject({ count: 2, total: 2 });
  });

  it('teacher: once attendance is saved the card turns to done, with the number marked', async () => {
    await db.platform(async (q) => {
      for (const s of students.slice(0, 2)) await q.query(`insert into attendance (school_id, student_id, class_id, date, status) values ($1, $2, $3, (now() at time zone 'Asia/Kolkata')::date, 'present')`, [A, s, classOwn]);
    });
    expect(card((await day('teacher', teacher)).cards, 'attendance-class')).toMatchObject({ state: 'todo', count: 1, total: 3 });
    await db.platform((q) => q.query(`insert into attendance (school_id, student_id, class_id, date, status) values ($1, $2, $3, (now() at time zone 'Asia/Kolkata')::date, 'absent')`, [A, students[2], classOwn]));
    const d = await day('teacher', teacher);
    expect(card(d.cards, 'attendance-class')).toMatchObject({ state: 'done', count: 3, total: 3 });
    expect(d.cards[d.cards.length - 1].type).toBe('attendance-class'); // done goes last
  });

  it('office: classes with no attendance (a class without students is not counted), consent, fees due today, tickets', async () => {
    const d = await day('school_admin', admin);
    expect(d.failed).toBe(0);
    expect(card(d.cards, 'attendance-school')).toMatchObject({ state: 'todo', count: 1, total: 2 });
    expect(card(d.cards, 'consent-waiting')).toMatchObject({ count: 1 });
    expect(card(d.cards, 'fees-due-today')).toMatchObject({ count: 1 }); // the paid one is not due
    expect(card(d.cards, 'tickets-waiting')).toMatchObject({ count: 2 }); // the office sees every ticket; the open one is not waiting on the school
    expect(card(d.cards, 'fees-overdue')).toBeUndefined();
  });

  it('principal: the things that need a principal, and "N things need you"', async () => {
    const d = await day('principal', principal);
    // Past due and unpaid, whatever its status says: one marked overdue, one still "pending". Paid and not-yet-due are not counted.
    expect(card(d.cards, 'fees-overdue')).toMatchObject({ count: 2 });
    expect(card(d.cards, 'consent-waiting')).toMatchObject({ count: 1 });
    expect(card(d.cards, 'messages-held')).toBeUndefined(); // none held today: no card, not a zero
    expect(d.waiting).toBe(d.cards.filter((c) => c.state === 'todo').length);
  });

  it('accountant: fees only, and no ticket that is not theirs', async () => {
    const d = await day('accountant', accountant);
    expect(d.cards.map((c) => c.type).sort()).toEqual(['fees-due-today', 'fees-overdue']);
  });

  it('promises to pay due today or gone by, still open, are on the fee office’s day; later or closed ones are not (C180)', async () => {
    await db.platform((q) => q.query(`insert into fee_followups (school_id, kind, status, promise_date) values
      ('${A}', 'promise', 'open', (now() at time zone 'Asia/Kolkata')::date), ('${A}', 'promise', 'open', (now() at time zone 'Asia/Kolkata')::date - 3),
      ('${A}', 'promise', 'open', (now() at time zone 'Asia/Kolkata')::date + 2), ('${A}', 'promise', 'closed', (now() at time zone 'Asia/Kolkata')::date), ('${A}', 'hardship', 'open', null)`));
    expect(card((await day('accountant', accountant)).cards, 'promises-due')).toMatchObject({ count: 2, state: 'todo', href: '/app/fees' });
    expect(card((await day('teacher', teacher)).cards, 'promises-due')).toBeUndefined();
    await db.platform((q) => q.query(`delete from fee_followups`));
    expect(card((await day('accountant', accountant)).cards, 'promises-due')).toBeUndefined();
  });

  it('with nothing waiting there are no cards: an honest empty day', async () => {
    const d = await day('academic_coordinator', coordinator);
    expect(d).toMatchObject({ cards: [], waiting: 0, failed: 0 });
  });

  it('another school’s rows are never counted', async () => {
    const principalB = randomUUID();
    const d = await day('principal', principalB, { ...ents(), schoolId: B }, B);
    expect(card(d.cards, 'consent-waiting')).toMatchObject({ count: 1 });
    expect(card(d.cards, 'fees-overdue')).toBeUndefined();
    expect(card(d.cards, 'tickets-waiting')).toBeUndefined();
    // And asked about school A from a session of school B: row-level security gives nothing.
    const asked = await db.tenant({ role: 'principal' as any, sub: principalB, schoolId: B }, (sql) => loadMyDay(sql, { schoolId: A, userId: principalB, role: 'principal' }, ents()));
    expect(asked.cards).toEqual([]);
  });

  it('on a Sunday there is no attendance card, for the teacher or the office', async () => {
    expect((await day('teacher', teacher, ents(), A, true)).cards.some((c) => c.type === 'attendance-class')).toBe(false);
    const office = await day('school_admin', admin, ents(), A, true);
    expect(office.cards.some((c) => c.type === 'attendance-school')).toBe(false);
    expect(card(office.cards, 'consent-waiting')).toMatchObject({ count: 1 }); // the rest of the day is still there
  });

  it('a student moved to another class after being marked counts where they are now, as the Attendance screen shows', async () => {
    // students[3] is the one active student of 6-A; marked there, then moved into 5-A.
    await db.platform(async (q) => {
      await q.query(`insert into attendance (school_id, student_id, class_id, date, status) values ($1, $2, $3, (now() at time zone 'Asia/Kolkata')::date, 'present')`, [A, students[3], classOther]);
      await q.query(`update students set class_id = $2 where student_id = $1`, [students[3], classOwn]);
    });
    try {
      // The office: 5-A has four students, all marked today; 6-A keeps its student who waits for consent, unmarked.
      expect(card((await day('school_admin', admin)).cards, 'attendance-school')).toMatchObject({ state: 'todo', count: 1, total: 2 });
      // The 5-A teacher cannot see a mark made in a class they do not teach (teacher_scope_attendance), on
      // the card or on their Attendance screen: both show this one student as still to mark.
      expect(card((await day('teacher', teacher)).cards, 'attendance-class')).toMatchObject({ state: 'todo', count: 1, total: 4 });
      // 6-A is left with that one student to mark: not a false "done" from the moved student's mark.
      expect((await day('teacher', otherTeacher)).cards.filter((c) => c.type === 'attendance-class')).toMatchObject([{ state: 'todo', count: 1, total: 1 }]);
    } finally {
      await db.platform((q) => q.query(`update students set class_id = $2 where student_id = $1`, [students[3], classOther]));
    }
  });

  it('messages held back today are counted only for consent, hours and budget, and only today', async () => {
    await db.platform((q) =>
      q.query(
        `insert into communication_log (school_id, status, created_at) values
           ($1, 'blocked_consent', now()), ($1, 'blocked_budget', now()), ($1, 'blocked_pilot', now()), ($1, 'blocked_no_template', now()),
           ($1, 'blocked_consent', now() - interval '3 days'), ($1, 'delivered', now())`,
        [A]
      )
    );
    expect(card((await day('principal', principal)).cards, 'messages-held')).toMatchObject({ count: 2 });
  });

  it('a card whose query fails in the database is left out and reported; the cards after it still come', async () => {
    const original = console.error;
    console.error = () => undefined;
    try {
      const broken = { type: 'fees-overdue' as const, moduleId: 'fees' as const, roles: ['principal'] as const, load: async (sql: any) => (await sql.query('select * from a_table_that_does_not_exist')).rows };
      const d = await db.tenant({ role: 'principal' as any, sub: principal, schoolId: A }, (sql) =>
        loadMyDay(sql, { schoolId: A, userId: principal, role: 'principal' }, ents(), { sunday: false, providers: [broken, ...TODAY_PROVIDERS.filter((p) => p.type === 'consent-waiting' || p.type === 'tickets-waiting')] })
      );
      // The failed statement did not end the transaction: the two cards after it were still counted.
      expect(d.failed).toBe(1);
      expect(card(d.cards, 'consent-waiting')).toMatchObject({ count: 1 });
      expect(card(d.cards, 'tickets-waiting')).toMatchObject({ count: 2 });
    } finally {
      console.error = original;
    }
  });
});

describe('the screen', () => {
  const cards: TodayCard[] = [
    { id: 'attendance-class:1', type: 'attendance-class', moduleId: 'attendance', state: 'todo', count: 2, total: 24, subject: '5-A', href: '/app/attendance?class=1' },
    { id: 'tickets-waiting', type: 'tickets-waiting', moduleId: 'raise-ticket', state: 'todo', count: 1, href: '/app/help/ticket' },
    { id: 'attendance-class:2', type: 'attendance-class', moduleId: 'attendance', state: 'done', count: 30, total: 30, subject: '6-B', href: '/app/attendance?class=2' },
  ];
  const render = (lang: 'en' | 'hi', list = cards, failed = 0) => renderToStaticMarkup(h(MyDayView, { day: arrangeMyDay(list), lang, failed }));

  it('English: one tap per card, the count in words, why it is there', () => {
    const html = render('en');
    expect(html).toContain('2 things need you today');
    expect(html).toContain('Mark attendance: 5-A');
    expect(html).toContain('2 of 24 students not marked yet');
    expect(html).toContain('1 ticket is waiting for your reply');
    expect(html).toContain('Attendance saved: 6-B');
    expect(html).toContain('30 students marked');
    expect(html).toContain('href="/app/attendance?class=1"');
    expect(html).toContain('Why this?');
    expect(html.indexOf('5-A')).toBeLessThan(html.indexOf('6-B'));
  });

  it('Hindi counts with the right form: one student left out of many', () => {
    const one: TodayCard = { ...cards[0], count: 1 };
    expect(render('hi', [one])).toContain('24 में से 1 विद्यार्थी की हाज़िरी बाकी है');
    expect(render('en', [one])).toContain('1 of 24 student not marked yet');
  });

  it('Hindi: the same day in Hindi, marked as Hindi', () => {
    const html = render('hi');
    expect(html).toContain('lang="hi"');
    expect(html).toContain('हाज़िरी लगाएँ: 5-A');
    expect(html).toContain('24 में से 2 विद्यार्थियों की हाज़िरी बाकी है');
    expect(html).not.toContain('Mark attendance');
  });

  it('an empty day says so and what to do; nothing is made up', () => {
    const html = render('en', []);
    expect(html).toContain('Nothing is waiting for you today.');
    expect(html).not.toMatch(/\d+ things? needs? you/);
  });

  it('a day that could not be fully worked out says that, and does not claim to be empty', () => {
    const html = render('en', [], 1);
    expect(html).toContain('could not be worked out');
    expect(html).not.toContain('Nothing is waiting for you today.');
  });

  it('everything done: says the day is done', () => {
    expect(render('en', [cards[2]])).toContain('Everything for today is done.');
  });
});
