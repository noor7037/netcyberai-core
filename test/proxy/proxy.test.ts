import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { helpArticle } from '@/content/help/articles';
import { moduleById } from '@/lib/contracts/modules';
import { TOURS } from '@/lib/contracts/tours';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { workingModules } from '@/lib/frameworks/plans';
import { readModuleFor, writeModuleFor } from '@/lib/frameworks/write-guard';
import { t, tCount } from '@/lib/i18n';
import { assignCover, coversBetween, coversFor, coversReleasedBetween, coverWork, dayOff, isoWeek, isoWeekday, needsCover, periodsToCover, PROXY_AHEAD_DAYS, PROXY_ARRANGERS, PROXY_ROLES, proxyDay, suggest, suggestFor, undoCover, type DayFacts, type ProxyDay } from '@/lib/proxy/proxy';
import { addDays, askLeave, decideLeave, onLeave, recordLeave, withdrawLeave } from '@/lib/staff/leave';
import { indiaDate } from '@/lib/time/india';
import { TODAY_PROVIDERS } from '@/lib/today/cards';

// Proxy Auto (docs/26 slice 8c, C202). The acceptance test: "Every suggested teacher is free that period, not on
// leave and not already covering. A period is covered once and a teacher covers one class a period (the database
// refuses a second). Nothing is assigned without a person's tap." Proven on the whole schema as the app's own
// database role, through the app's code and by going to the database directly. Every name is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, tenant: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));
vi.mock('@/lib/i18n/server', () => ({ getLang: () => ({ lang: 'en' }) }));

import { GET as getProxy, POST as postProxy } from '@/app/api/app/proxy/route';
import { POST as stepProxy } from '@/app/api/app/proxy/[substitutionId]/route';
import { POST as stepLeave } from '@/app/api/app/staff/leave/[leaveId]/route';
import { GET as listLeave } from '@/app/api/app/staff/leave/route';
import ProxyPage from '@/app/(school)/app/proxy/page';
import TimetablePage from '@/app/(school)/app/timetable/page';
import { LangProvider } from '@/components/app-shell/LangContext';
import { ModuleComingPage } from '@/components/app-shell/ModuleComingPage';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { ProxyArranger, ProxyMine, ProxyView } from '@/components/proxy/ProxyView';
import { coversReleasedIn } from '@/components/staff/leave-parts';
import { TimetableView } from '@/components/timetable/TimetableView';

const A = 'cf000000-0000-4000-8000-000000000001';
const B = 'cf000000-0000-4000-8000-000000000002';
const C = 'cf000000-0000-4000-8000-000000000003';
const id = (n: number) => `cf000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, COORDINATOR, ACCOUNTANT] = [id(11), id(12), id(13), id(14)];
// The teachers of school A. Asha and Gita go on leave; Hari only asks. Lata has left (an account switched off).
const [ASHA, BINA, CHAND, DEV, FALAK, GITA, HARI, LATA] = [id(21), id(22), id(23), id(24), id(25), id(26), id(27), id(28)];
const [B_PRINCIPAL, B_TEACHER] = [id(41), id(42)];
// Accounts made at school C that also sign in to school A through a membership there.
const [VISITING_PRINCIPAL, VISITING_TEACHER] = [id(51), id(52)];
const [C5A, C5B, C6A, B_CLASS] = [id(61), id(62), id(63), id(64)];
const [MATHS, ENGLISH, SCIENCE, B_SUBJECT] = [id(71), id(72), id(73), id(74)];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const asha: Who = { role: 'teacher', user: ASHA };
const bina: Who = { role: 'teacher', user: BINA };
const chand: Who = { role: 'teacher', user: CHAND };
const dev: Who = { role: 'teacher', user: DEV };
const falak: Who = { role: 'teacher', user: FALAK };
const gita: Who = { role: 'teacher', user: GITA };
const hari: Who = { role: 'teacher', user: HARI };
const elsewhere: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
const visitingPrincipal: Who = { role: 'principal', user: VISITING_PRINCIPAL };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school ?? A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school ?? A, userId: who.user, role: who.role as never });

// THE DAY: India's today, so My Day's cards (which always mean today) see the same day as everything else. The
// school works all seven days here, so the tests mean the same thing whatever day of the week they run on; the
// tests of a holiday and of a day the school does not work change that themselves.
const D = indiaDate();
const W = isoWeekday(D);
// Another weekday (a period there is not a period of D), and another day in D's own week.
const OTHER_W = (W % 7) + 1;
const SAME_WEEK = W < 7 ? addDays(D, 1) : addDays(D, -1);
const ALL_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

// The timetable of weekday W in school A:
//   period 1   5-A Maths: Asha      5-B English: Bina     6-A English: Gita
//   period 2   5-B Maths: Asha      6-A Maths: Chand
//   period 3   5-A English: Bina
//   period 4   6-A Science: Asha
// On the other weekday: Dev teaches 5-A Maths (so Dev "teaches Maths"), and Asha has a period that is not D's.
// Falak and Hari have no period at all.
const TIMETABLE: [string, number, number, string, string][] = [
  [C5A, W, 1, MATHS, ASHA], [C5B, W, 1, ENGLISH, BINA], [C6A, W, 1, ENGLISH, GITA],
  [C5B, W, 2, MATHS, ASHA], [C6A, W, 2, MATHS, CHAND],
  [C5A, W, 3, ENGLISH, BINA],
  [C6A, W, 4, SCIENCE, ASHA],
  [C5A, OTHER_W, 1, MATHS, DEV], [C5B, OTHER_W, 6, MATHS, ASHA],
];

type Count = { rows: { n: number }[] };
const count = async (sql: string, params: unknown[] = []) => ((await db.pg.query(`select count(*)::int as n from ${sql}`, params)) as Count).rows[0].n;
const sees = async (who: Who, where = 'true') => (await as<Count>(who, (c) => c.query(`select count(*)::int as n from substitutions where ${where}`))).rows[0].n;
const row = async (substitutionId: string) => (await db.pg.query(`select status, substitute_user_id, absent_user_id, assigned_by, undone_by, period::int as period, class_id, on_date::text as on_date from substitutions where substitution_id = $1`, [substitutionId])).rows[0];
const wipe = () =>
  db.pg.exec(`set session_replication_role = replica; delete from substitutions; delete from staff_leave; delete from school_holidays; delete from audit_log where event_action like 'cover.%' or event_action like 'leave.%'; set session_replication_role = origin;`);
const reasonFor = (who: Who) => ({ kind: 'sick', reason: `Unwell, phoned in (${who.user.slice(-2)}).` });
// Approved leave, recorded by the school admin for someone who phoned in (slice 8b).
const onLeaveFor = async (who: Who, from = D, to = D) => {
  const r = await as(admin, (c) => recordLeave(c, actor(admin), { userId: who.user, fromDate: from, toDate: to, ...reasonFor(who) }));
  if (!r.ok) throw new Error(`leave not recorded: ${r.reason}`);
  return r.leaveId;
};
// A cover put straight into the table by the owner of the database, for a day the app would not assign.
const seedCover = (date: string, period: number, classId: string, subject: string, absent: string, substitute: string, status = 'assigned') =>
  db.pg.exec(
    `set session_replication_role = replica;
     insert into substitutions (school_id, on_date, period, class_id, subject_id, absent_user_id, substitute_user_id, status, assigned_by, undone_by, undone_at)
     values ('${A}', '${date}', ${period}, '${classId}', '${subject}', '${absent}', '${substitute}', '${status}', '${PRINCIPAL}', ${status === 'undone' ? `'${PRINCIPAL}', now()` : 'null, null'});
     set session_replication_role = origin;`
  );
// The scene most tests start from: Asha and Gita are on approved leave on D; Hari has only asked; Dev already
// holds one cover on another day of the same week.
const scene = async () => {
  await wipe();
  await onLeaveFor(asha);
  await onLeaveFor(gita);
  const asked = await as(hari, (c) => askLeave(c, actor(hari), { fromDate: D, toDate: D, kind: 'casual', reason: 'A family function.' }));
  if (!asked.ok) throw new Error(asked.reason);
  await seedCover(SAME_WEEK, 5, C6A, SCIENCE, ASHA, DEV);
};
const assign = (who: Who, period: number, classId: string, substituteUserId: string, date = D) => as(who, (c) => assignCover(c, actor(who), { date, period, classId, substituteUserId }));
const assigned = async (who: Who, period: number, classId: string, substituteUserId: string) => {
  const r = await assign(who, period, classId, substituteUserId);
  if (!r.ok) throw new Error(`not assigned: ${r.reason}`);
  return r.substitutionId;
};
const dayFor = async (who: Who, date = D) => (await as(who, (c) => proxyDay(c, actor(who), date)))!;
const names = (day: ProxyDay, period: number, classId: string) => day.periods.find((p) => p.period === period && p.class_id === classId)!.suggestions.map((s) => s.name);
const slots = (list: { period: number; class_name: string; absent_name: string }[]) => list.map((p) => `${p.period} ${p.class_name} ${p.absent_name}`);
// Found by the end of its name: the first part is the version the database recorded.
const MIGRATIONS_DIR = path.join(__dirname, '../../supabase/migrations');
const MIGRATION = path.join(MIGRATIONS_DIR, readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith('_p5_substitutions.sql'))!);
// My Day's cards, loaded as the person's own session.
const card = (type: string) => TODAY_PROVIDERS.find((p) => p.type === type)!;
const load = (type: string, who: Who) => as(who, (c) => card(type).load(c, { schoolId: who.school ?? A, userId: who.user, role: who.role as never, sunday: false }));
// A row put straight into the table from a person's own session, past the app: what the database itself holds.
type RowValues = Partial<Record<'period' | 'class_id' | 'subject_id' | 'absent' | 'substitute' | 'by' | 'date' | 'school' | 'status', string | number>>;
const putRow = (who: Who, values: RowValues = {}) => {
  const v = { school: who.school ?? A, date: D, period: 1, class_id: C5A, subject_id: MATHS, absent: ASHA, substitute: DEV, by: who.user, status: 'assigned', ...values };
  return as(who, (c) => c.query(`insert into substitutions (school_id, on_date, period, class_id, subject_id, absent_user_id, substitute_user_id, assigned_by, status) values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9)`, [v.school, v.date, v.period, v.class_id, v.subject_id, v.absent, v.substitute, v.by, v.status]));
};
// The arranging screen as it is drawn for a day.
const drawDay = (lang: 'en' | 'hi', day: ProxyDay, mayRecordLeave = true) =>
  renderToStaticMarkup(h(LangProvider, { lang, children: h(ProxyArranger, { data: { arranger: true as const, today: D, tomorrow: addDays(D, 1), last: addDays(D, PROXY_AHEAD_DAYS), mayRecordLeave, day }, busy: false, note: null, onPick: () => undefined, onAssign: () => undefined, onUndo: () => undefined }) }));

describe('the rule that orders the free teachers', () => {
  const facts = (over: Partial<DayFacts> = {}): DayFacts => ({
    teachers: [{ user_id: 'a', name: 'Anu' }, { user_id: 'b', name: 'Bala' }, { user_id: 'c', name: 'Charu' }, { user_id: 'd', name: 'Deep' }],
    away: new Set(), own: [], teaches: [], covers: [], coversThatWeek: new Map(), ...over,
  });

  it('leaves out a teacher with a class of their own then, one on leave, and one already covering then', () => {
    const got = suggestFor(facts({ own: [{ teacher_user_id: 'a', period: 2 }], away: new Set(['b']), covers: [{ substitute_user_id: 'c', period: 2 }] }), { period: 2, subjectId: 's' });
    expect(got.map((s) => s.name)).toEqual(['Deep']);
    expect(got[0]).toEqual({ user_id: 'd', name: 'Deep', freeThisPeriod: true, teachesSubject: false, periodsThatDay: 0, coversThatWeek: 0 });
    // A class or a cover in another period does not make them busy in this one: it only counts toward their day.
    const other = suggestFor(facts({ own: [{ teacher_user_id: 'a', period: 1 }], covers: [{ substitute_user_id: 'c', period: 3 }] }), { period: 2, subjectId: 's' });
    expect(other.map((s) => [s.name, s.periodsThatDay])).toEqual([['Bala', 0], ['Deep', 0], ['Anu', 1], ['Charu', 1]]);
  });

  it('orders by: teaches the subject, then fewest periods that day, then fewest covers that week, then name', () => {
    const got = suggestFor(
      facts({
        teaches: [{ teacher_user_id: 'd', subject_id: 's' }, { teacher_user_id: 'c', subject_id: 's' }, { teacher_user_id: 'a', subject_id: 'other' }],
        own: [{ teacher_user_id: 'c', period: 1 }, { teacher_user_id: 'c', period: 5 }, { teacher_user_id: 'd', period: 1 }],
        covers: [{ substitute_user_id: 'd', period: 6 }],
        coversThatWeek: new Map([['a', 2], ['d', 1]]),
      }),
      { period: 2, subjectId: 's' }
    );
    // Charu and Deep teach the subject and both have two periods that day; Charu holds no cover that week.
    expect(got.map((s) => [s.name, s.teachesSubject, s.periodsThatDay, s.coversThatWeek])).toEqual([['Charu', true, 2, 0], ['Deep', true, 2, 1], ['Bala', false, 0, 0], ['Anu', false, 0, 2]]);
    // With everything else equal, by name.
    expect(suggestFor(facts(), { period: 1, subjectId: 's' }).map((s) => s.name)).toEqual(['Anu', 'Bala', 'Charu', 'Deep']);
  });

  it('the week is Monday to Sunday, and the weekday is the timetable’s (1 is Monday)', () => {
    expect(isoWeekday('2026-11-16')).toBe(1);
    expect(isoWeekday('2026-11-22')).toBe(7);
    expect(isoWeek('2026-11-18')).toEqual({ from: '2026-11-16', to: '2026-11-22' });
    expect(isoWeek('2026-11-22')).toEqual({ from: '2026-11-16', to: '2026-11-22' });
    expect(isoWeek('2026-11-16')).toEqual({ from: '2026-11-16', to: '2026-11-22' });
    expect(isoWeek('2027-01-01')).toEqual({ from: '2026-12-28', to: '2027-01-03' });
  });
});

describe('the module and its words', () => {
  it('Proxy Auto is partly live, in the standard plan, and says what goes when it is switched off', () => {
    expect(moduleById('proxy')).toMatchObject({ status: 'partial', phase: 'P5', roles: ['principal', 'school_admin', 'teacher', 'academic_coordinator'] });
    expect(moduleById('proxy').phaseNote).toContain('not by a message');
    expect(workingModules()).toContain('proxy'); // what a plan of "every module that works" gives (plans are rows now, C204)
    for (const lang of ['en', 'hi'] as const) expect(t(lang, 'moduleOff.proxy').length, lang).toBeLessThanOrEqual(200);
    for (const words of ['assign or undo a cover', 'My Day', 'Covers on record are kept']) expect(t('en', 'moduleOff.proxy')).toContain(words);
    expect(t('hi', 'moduleOff.proxy')).toMatch(/[ऀ-ॿ]/);
    expect([...PROXY_ROLES].sort()).toEqual([...moduleById('proxy').roles].sort());
    expect(PROXY_ARRANGERS).toEqual(['principal', 'school_admin', 'academic_coordinator']);
  });

  it('its routes belong to Proxy Auto, its tours and its guide exist', () => {
    const some = '9b2e7c1a-5d43-4f0e-8a6b-1c2d3e4f5a6b';
    expect(writeModuleFor('/api/app/proxy')).toBe('proxy');
    expect(writeModuleFor(`/api/app/proxy/${some}`)).toBe('proxy');
    expect(readModuleFor('/api/app/proxy')).toBe('proxy');
    expect(TOURS.proxy.steps).toHaveLength(3);
    expect(TOURS['proxy-covers'].steps).toHaveLength(2);
    const guide = helpArticle('cover-a-class')!;
    expect(guide.start?.href).toBe('/app/proxy');
    expect(guide.related).toEqual(['staff-leave', 'timetable']);
    // The guide says the two things the acceptance sentence rests on.
    expect(guide.summary.en).toContain('nothing is assigned by itself');
    expect(guide.tips!.map((x) => x.en).join(' ')).toContain('A period is covered once, and a teacher covers one class in a period');
  });

  it('every refusal the server can give has its words, in both languages', () => {
    for (const code of ['date', 'day_off', 'not_needed', 'already_covered', 'substitute', 'on_leave', 'not_free', 'already_covering', 'changed', 'elsewhere', 'undone', 'past', 'other']) {
      for (const lang of ['en', 'hi'] as const) expect(t(lang, `px.err.${code}` as never, { days: PROXY_AHEAD_DAYS }), `${lang} ${code}`).not.toMatch(/px\.err|\{days\}/);
    }
    expect(t('en', 'px.err.already_covered')).toContain('already covered');
    expect(t('en', 'px.err.already_covering')).toContain('already covering');
  });

  it('covers are for running the day: no total by person is kept, no order of who covers most, and nothing that judges staff reads them', () => {
    const src = path.join(__dirname, '../../src');
    const files = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? files(path.join(dir, n)) : [path.join(dir, n)])) : []);
    const read = (f: string) => readFileSync(f, 'utf8');
    // Teacher Copilot, the AI door, recognition and the Teacher Impact screens.
    const judging = [...files(path.join(src, 'lib/copilot')), ...files(path.join(src, 'lib/ai')), path.join(src, 'lib/recognition.ts'), ...files(src).filter((f) => /impact/i.test(f))];
    expect(judging.length).toBeGreaterThan(3);
    for (const f of judging) expect(read(f), path.relative(src, f)).not.toMatch(/substitutions|lib\/proxy|teachers_away_on/);
    // The proxy code: nothing is added up in the database, and every list is in the order of the day or of names.
    const lib = read(path.join(src, 'lib/proxy/proxy.ts'));
    expect(lib).not.toMatch(/group by|count\(|sum\(|rank\(|\bdesc\b/i);
    const orders = [...lib.matchAll(/order by ([^`]+?)`/g)].map((m) => m[1].trim());
    expect(orders).toEqual([
      'u.display_name, a.user_id', 'x.period, c.name, c.section, x.class_id', 'e.period, c.name, c.section, e.class_id', 'x.on_date, x.period, c.name, c.section, x.class_id',
      // C210: the covers one withdrawal released, and a teacher's released covers.
      'x.on_date, x.period, x.class_id', 'x.on_date, x.period, c.name, c.section, x.substitution_id',
    ]);
    // The number of covers a person holds exists in one place only: as a fact beside a suggestion, for one week.
    const mentions = files(src).filter((f) => /\.(ts|tsx)$/.test(f) && /coversThatWeek/.test(read(f))).map((f) => path.relative(src, f)).sort();
    expect(mentions).toEqual(['components/proxy/ProxyView.tsx', 'lib/proxy/proxy.ts', 'lib/proxy/rules.ts']);
  });
});

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    const setup = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'setup')!;
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL'), ('${C}', 'School C', 'IN-UP');
      insert into users (user_id, school_id, email, role, display_name, is_active) values
        ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'admin@school-a.example', 'school_admin', 'Asif Admin', true),
        ('${COORDINATOR}', '${A}', 'coordinator@school-a.example', 'academic_coordinator', 'Chitra Coordinator', true), ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant', true),
        ('${ASHA}', '${A}', 'asha@school-a.example', 'teacher', 'Asha', true), ('${BINA}', '${A}', 'bina@school-a.example', 'teacher', 'Bina', true),
        ('${CHAND}', '${A}', 'chand@school-a.example', 'teacher', 'Chand', true), ('${DEV}', '${A}', 'dev@school-a.example', 'teacher', 'Dev', true),
        ('${FALAK}', '${A}', 'falak@school-a.example', 'teacher', 'Falak', true), ('${GITA}', '${A}', 'gita@school-a.example', 'teacher', 'Gita', true),
        ('${HARI}', '${A}', 'hari@school-a.example', 'teacher', 'Hari', true), ('${LATA}', '${A}', 'lata@school-a.example', 'teacher', 'Lata Left', false),
        ('${B_PRINCIPAL}', '${B}', 'principal@school-b.example', 'principal', 'Bela Principal', true), ('${B_TEACHER}', '${B}', 'teacher@school-b.example', 'teacher', 'Bharat Elsewhere', true),
        ('${VISITING_PRINCIPAL}', '${C}', 'parul@school-c.example', 'principal', 'Parul Visiting', true), ('${VISITING_TEACHER}', '${C}', 'vani@school-c.example', 'teacher', 'Vani Visiting', true);
      insert into memberships (user_id, school_id, role, is_active) values ('${VISITING_PRINCIPAL}', '${A}', 'principal', true), ('${VISITING_TEACHER}', '${A}', 'teacher', true) on conflict (user_id, school_id) do nothing;
      insert into classes (class_id, school_id, name, grade, section) values ('${C5A}', '${A}', '5-A', '5', 'A'), ('${C5B}', '${A}', '5-B', '5', 'B'), ('${C6A}', '${A}', '6-A', '6', 'A'), ('${B_CLASS}', '${B}', '9-Z', '9', 'Z');
      insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Maths'), ('${ENGLISH}', '${A}', 'English'), ('${SCIENCE}', '${A}', 'Science'), ('${B_SUBJECT}', '${B}', 'History');
      insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values
        ${TIMETABLE.map(([c, w, p, s, u]) => `('${A}', '${c}', ${w}, ${p}, '${s}', '${u}')`).join(', ')},
        ('${B}', '${B_CLASS}', ${W}, 1, '${B_SUBJECT}', '${B_TEACHER}');
      insert into school_settings (school_id, module_id, schema_version, setting_values, revision) values ('${A}', 'setup', ${setup.version}, '${JSON.stringify({ working_days: ALL_DAYS })}', 1);
      insert into school_module_entitlements (school_id, module_id, enabled, source)
        select s, m, true, 'plan' from unnest(array['${A}', '${B}']::uuid[]) s, unnest(array['proxy', 'staff', 'timetable']) m on conflict (school_id, module_id) do update set enabled = true;
    `);
    state.tenant = (claims: { role: string; sub: string; schoolId: string }, fn: (c: unknown) => Promise<unknown>) => as({ role: claims.role, user: claims.sub, school: claims.schoolId }, fn);
  }, 120_000);
  afterAll(async () => db?.stop());

  describe('what needs cover', () => {
    it('every period the timetable gives a teacher on approved leave that day, in the order of the day, and nobody else’s', async () => {
      await scene();
      for (const who of [principal, admin, coordinator]) {
        const periods = await as(who, (c) => periodsToCover(c, A, D));
        expect(slots(periods), who.role).toEqual(['1 5-A Asha', '1 6-A Gita', '2 5-B Asha', '4 6-A Asha']);
        expect(periods.map((p) => p.subject_name)).toEqual(['Maths', 'English', 'Maths', 'Science']);
        expect(periods.every((p) => p.cover === null && p.on_date === D)).toBe(true);
      }
      // Bina and Chand teach that day and are not on leave; Hari only asked; Asha's period on the other weekday is not D's.
      const day = await dayFor(principal);
      expect(day).toMatchObject({ date: D, weekday: W, dayOff: null, open: true, noLongerNeeded: [] });
      expect(day.away.map((p) => p.name)).toEqual(['Asha', 'Gita']);
    });

    it('a day is covered only while its leave is approved: asked, refused and cancelled leave need no cover', async () => {
      await wipe();
      const asked = await as(asha, (c) => askLeave(c, actor(asha), { fromDate: D, toDate: D, kind: 'casual', reason: 'A family function.' }));
      if (!asked.ok) throw new Error(asked.reason);
      expect(await as(principal, (c) => periodsToCover(c, A, D))).toEqual([]);
      await as(principal, (c) => decideLeave(c, actor(principal), asked.leaveId, 'approve', ''));
      expect(slots(await as(principal, (c) => periodsToCover(c, A, D)))).toEqual(['1 5-A Asha', '2 5-B Asha', '4 6-A Asha']);
      await as(principal, (c) => withdrawLeave(c, actor(principal), asked.leaveId, 'She came in after all.'));
      expect(await as(principal, (c) => periodsToCover(c, A, D))).toEqual([]);
      const refused = await as(gita, (c) => askLeave(c, actor(gita), { fromDate: D, toDate: D, kind: 'casual', reason: 'A journey.' }));
      if (!refused.ok) throw new Error(refused.reason);
      await as(admin, (c) => decideLeave(c, actor(admin), refused.leaveId, 'refuse', 'Two teachers are away already.'));
      expect(await as(admin, (c) => periodsToCover(c, A, D))).toEqual([]);
      // Leave on another day covers nothing on D.
      await onLeaveFor(asha, addDays(D, 2), addDays(D, 3));
      expect(await as(admin, (c) => periodsToCover(c, A, D))).toEqual([]);
    });

    it('the academic coordinator is told which teachers are away, and nothing else about anyone’s leave', async () => {
      await scene();
      // An accountant on approved leave is nobody's period to cover: not a teacher.
      await onLeaveFor(accountant);
      const away = (who: Who, date = D) => as(who, async (c) => ((await c.query(`select user_id from teachers_away_on($1::date) order by 1`, [date])).rows as { user_id: string }[]).map((r) => r.user_id));
      for (const who of [principal, admin, coordinator]) expect(await away(who), who.role).toEqual([ASHA, GITA]);
      // The same teachers the office reads from leave itself (slice 8b's onLeave), so the two cannot disagree.
      const fromLeave = (await as(principal, (c) => onLeave(c, A, D))).map((p) => p.user_id).filter((u) => u !== ACCOUNTANT).sort();
      expect(fromLeave).toEqual([ASHA, GITA]);
      expect(await away(principal, addDays(D, 1))).toEqual([]);
      // Nobody else is answered: a teacher (even one on leave), an accountant, another school's principal.
      for (const who of [asha, bina, accountant, elsewhere]) expect(await away(who), who.role).toEqual([]);
      // The coordinator is answered only for the days cover can still be arranged for: today and the days ahead
      // up to PROXY_AHEAD_DAYS. Not a day gone by, and not leave planned further ahead. The office reads leave
      // itself, so it is answered for any day.
      await onLeaveFor(chand, addDays(D, -2), addDays(D, -1));
      await onLeaveFor(bina, addDays(D, PROXY_AHEAD_DAYS), addDays(D, PROXY_AHEAD_DAYS + 1));
      expect(await away(coordinator, addDays(D, -1))).toEqual([]);
      expect(await away(coordinator, addDays(D, PROXY_AHEAD_DAYS))).toEqual([BINA]);
      expect(await away(coordinator, addDays(D, PROXY_AHEAD_DAYS + 1))).toEqual([]);
      for (const who of [principal, admin]) {
        expect(await away(who, addDays(D, -1)), who.role).toEqual([CHAND]);
        expect(await away(who, addDays(D, PROXY_AHEAD_DAYS + 1)), who.role).toEqual([BINA]);
      }
      // The number of days is the app's own (one rule, written in two languages), and the database writes it once.
      const sql = readFileSync(MIGRATION, 'utf8');
      expect(sql).toContain(`(now() at time zone 'Asia/Kolkata')::date + ${PROXY_AHEAD_DAYS}\n`);
      expect(sql.replace(/--[^\n]*/g, '').match(/::date \+ \d+/g)).toEqual([`::date + ${PROXY_AHEAD_DAYS}`]);
      // The coordinator still reads no leave row: only the fact above reaches them.
      expect((await as<Count>(coordinator, (c) => c.query(`select count(*)::int as n from staff_leave`))).rows[0].n).toBe(0);
      expect((await as(coordinator, (c) => onLeave(c, A, D))).length).toBe(0);
      // And the platform's other roles cannot call it at all.
      await expect(db.pg.transaction(async (tx: { query: (q: string) => Promise<unknown> }) => { await tx.query('set local role anon'); return tx.query(`select * from teachers_away_on(current_date)`); })).rejects.toThrow(/permission denied/);
    });

    it('a school holiday, or a day the school does not work, has nothing to cover', async () => {
      await scene();
      try {
        await db.pg.query(`insert into school_holidays (school_id, holiday_date, name, created_by) values ($1, $2::date, 'Founders’ Day', $3)`, [A, D, PRINCIPAL]);
        expect(await as(principal, (c) => dayOff(c, A, D))).toEqual({ kind: 'holiday', name: 'Founders’ Day' });
        expect(await as(principal, (c) => periodsToCover(c, A, D))).toEqual([]);
        const closed = await dayFor(coordinator);
        expect(closed).toMatchObject({ dayOff: { kind: 'holiday', name: 'Founders’ Day' }, periods: [] });
        expect(closed.away.map((p) => p.name)).toEqual(['Asha', 'Gita']);
        expect(await assign(principal, 1, C5A, DEV)).toEqual({ ok: false, reason: 'day_off' });
      } finally {
        await db.pg.query(`delete from school_holidays where school_id = $1`, [A]);
      }
      const working = (days: string[]) => db.pg.query(`update school_settings set setting_values = $2::jsonb where school_id = $1 and module_id = 'setup'`, [A, JSON.stringify({ working_days: days })]);
      try {
        await working(ALL_DAYS.filter((_, i) => i + 1 !== W));
        expect(await as(principal, (c) => dayOff(c, A, D))).toEqual({ kind: 'not_working' });
        expect(await as(principal, (c) => periodsToCover(c, A, D))).toEqual([]);
        expect(await assign(admin, 1, C5A, DEV)).toEqual({ ok: false, reason: 'day_off' });
      } finally {
        await working(ALL_DAYS);
      }
      expect((await as(principal, (c) => periodsToCover(c, A, D))).length).toBe(4);
      // A school that has never set its working days works Monday to Saturday: a Sunday is not a working day.
      expect(await as(elsewhere, (c) => dayOff(c, B, '2026-11-22'))).toEqual({ kind: 'not_working' });
      expect(await as(elsewhere, (c) => dayOff(c, B, '2026-11-23'))).toBeNull();
      expect(await count('substitutions where status = $1 and on_date = $2', ['assigned', D])).toBe(0);
    });
  });

  describe('every suggested teacher is free that period, not on leave and not already covering', () => {
    it('the suggestions for each period, in the order of the rule, with the facts behind each place', async () => {
      await scene();
      const day = await dayFor(principal);
      // Period 1, 5-A Maths: Bina teaches then; Gita and Asha are away; Lata has left. Dev and Chand teach Maths;
      // Dev has no period that day. Hari only asked for leave, so Hari is still free.
      expect(names(day, 1, C5A)).toEqual(['Dev', 'Chand', 'Falak', 'Hari']);
      expect(day.periods[0].suggestions[0]).toEqual({ user_id: DEV, name: 'Dev', freeThisPeriod: true, teachesSubject: true, periodsThatDay: 0, coversThatWeek: 1 });
      expect(day.periods[0].suggestions[1]).toMatchObject({ name: 'Chand', teachesSubject: true, periodsThatDay: 1, coversThatWeek: 0 });
      // Period 1, 6-A English: the one English teacher (Bina) teaches then, so nobody offered teaches it. Falak and
      // Hari hold no cover that week; Dev holds one; Chand has a period that day.
      expect(names(day, 1, C6A)).toEqual(['Falak', 'Hari', 'Dev', 'Chand']);
      // Period 2, 5-B Maths: Chand teaches then. Bina is free, with two periods that day.
      expect(names(day, 2, C5B)).toEqual(['Dev', 'Falak', 'Hari', 'Bina']);
      // Period 4, 6-A Science: nobody else teaches Science.
      expect(names(day, 4, C6A)).toEqual(['Falak', 'Hari', 'Dev', 'Chand', 'Bina']);
      // suggest() for one period is the same list.
      for (const who of [principal, admin, coordinator]) {
        expect((await as(who, (c) => suggest(c, actor(who), D, { period: 1, subjectId: MATHS }))).map((s) => s.name), who.role).toEqual(['Dev', 'Chand', 'Falak', 'Hari']);
      }
    });

    it('proven for every period against the database itself: no suggestion has a class then, is on leave, or is covering', async () => {
      await scene();
      await assigned(principal, 1, C5A, DEV);
      const day = await dayFor(admin);
      const open = day.periods.filter((p) => !p.cover);
      expect(open.length).toBe(3);
      let checked = 0;
      for (const p of open) {
        expect(p.suggestions.length, `${p.period} ${p.class_name}`).toBeGreaterThan(0);
        for (const s of p.suggestions) {
          checked += 1;
          const where = `${p.period} ${p.class_name} ← ${s.name}`;
          expect(s.freeThisPeriod, where).toBe(true);
          expect(await count(`users where school_id = $1 and user_id = $2 and role = 'teacher' and is_active`, [A, s.user_id]), where).toBe(1);
          expect(await count(`timetable_entries where school_id = $1 and teacher_user_id = $2 and weekday = $3 and period = $4`, [A, s.user_id, W, p.period]), where).toBe(0);
          expect(await count(`staff_leave where school_id = $1 and user_id = $2 and status = 'approved' and $3::date between from_date and to_date`, [A, s.user_id, D]), where).toBe(0);
          expect(await count(`substitutions where school_id = $1 and substitute_user_id = $2 and on_date = $3::date and period = $4 and status = 'assigned'`, [A, s.user_id, D, p.period]), where).toBe(0);
          expect(s.user_id, where).not.toBe(p.absent_user_id);
          // The facts shown beside the name are the school's own rows.
          const own = await count(`timetable_entries where school_id = $1 and teacher_user_id = $2 and weekday = $3`, [A, s.user_id, W]);
          const coversThatDay = await count(`substitutions where school_id = $1 and substitute_user_id = $2 and on_date = $3::date and status = 'assigned'`, [A, s.user_id, D]);
          expect(s.periodsThatDay, where).toBe(own + coversThatDay);
          const week = isoWeek(D);
          expect(s.coversThatWeek, where).toBe(await count(`substitutions where school_id = $1 and substitute_user_id = $2 and on_date between $3::date and $4::date and status = 'assigned'`, [A, s.user_id, week.from, week.to]));
          expect(s.teachesSubject, where).toBe((await count(`timetable_entries where school_id = $1 and teacher_user_id = $2 and subject_id = $3`, [A, s.user_id, p.subject_id])) > 0);
        }
      }
      expect(checked).toBeGreaterThanOrEqual(10);
      // Dev now covers period 1: not offered for the other class of period 1, and that cover counts in Dev's day.
      expect(names(day, 1, C6A)).toEqual(['Falak', 'Hari', 'Chand']);
      expect(day.periods.find((p) => p.period === 2)!.suggestions.find((s) => s.name === 'Dev')).toMatchObject({ periodsThatDay: 1, coversThatWeek: 2 });
      // A covered period carries its cover and no suggestions.
      expect(day.periods[0]).toMatchObject({ suggestions: [], cover: { substitute_user_id: DEV, substitute_name: 'Dev', assigned_by: 'Priya Principal', problem: null } });
      expect(needsCover(day.periods[0])).toBe(false);
    });

    it('a teacher of another school, a visiting account and someone who has left are never suggested', async () => {
      await scene();
      const offered = new Set((await dayFor(principal)).periods.flatMap((p) => p.suggestions.map((s) => s.user_id)));
      for (const never of [B_TEACHER, VISITING_TEACHER, LATA, ASHA, GITA, PRINCIPAL, ADMIN, COORDINATOR, ACCOUNTANT]) expect(offered.has(never), never).toBe(false);
      expect([...offered].sort()).toEqual([BINA, CHAND, DEV, FALAK, HARI]);
    });

    it('a teacher is offered nothing and told nothing: the lists are for the people who arrange cover', async () => {
      await scene();
      expect(await as(bina, (c) => suggest(c, actor(bina), D, { period: 1, subjectId: MATHS }))).toEqual([]);
      expect(await as(bina, (c) => proxyDay(c, actor(bina), D))).toBeNull();
      expect(await as(accountant, (c) => proxyDay(c, actor(accountant), D))).toBeNull();
      expect(await as(bina, (c) => periodsToCover(c, A, D))).toEqual([]);
      // Another school's principal sees their own school: nobody is on leave there.
      expect((await dayFor(elsewhere)).periods).toEqual([]);
    });
  });

  describe('a period is covered once, and a teacher covers one class a period', () => {
    it('the app checks every rule again when the tap arrives, and says plainly why not', async () => {
      await scene();
      const first = await assigned(coordinator, 1, C5A, DEV);
      expect(await row(first)).toMatchObject({ status: 'assigned', substitute_user_id: DEV, absent_user_id: ASHA, assigned_by: COORDINATOR, period: 1, class_id: C5A, on_date: D });
      // The same period again, by anyone, for anyone.
      expect(await assign(principal, 1, C5A, CHAND)).toEqual({ ok: false, reason: 'already_covered' });
      expect(await assign(coordinator, 1, C5A, DEV)).toEqual({ ok: false, reason: 'already_covered' });
      // The same teacher for the other class of that period.
      expect(await assign(admin, 1, C6A, DEV)).toEqual({ ok: false, reason: 'already_covering' });
      // A teacher with a class of their own then; one on leave; the absent teacher; one who has left; not a teacher.
      expect(await assign(principal, 1, C6A, BINA)).toEqual({ ok: false, reason: 'not_free' });
      expect(await assign(principal, 2, C5B, GITA)).toEqual({ ok: false, reason: 'on_leave' });
      expect(await assign(principal, 2, C5B, ASHA)).toEqual({ ok: false, reason: 'substitute' });
      for (const who of [LATA, ACCOUNTANT, B_TEACHER, VISITING_TEACHER]) expect(await assign(principal, 2, C5B, who), who).toEqual({ ok: false, reason: 'substitute' });
      // A period nobody needs covered: its teacher is not on leave, or there is no such period.
      expect(await assign(principal, 3, C5A, DEV)).toEqual({ ok: false, reason: 'not_needed' });
      expect(await assign(principal, 6, C5A, DEV)).toEqual({ ok: false, reason: 'not_needed' });
      expect(await assign(principal, 1, B_CLASS, DEV)).toEqual({ ok: false, reason: 'not_needed' });
      // A day gone by, a day too far ahead, a day that is no day.
      for (const date of [addDays(D, -1), addDays(D, PROXY_AHEAD_DAYS + 1), '2027-02-31', '']) expect(await assign(principal, 2, C5B, FALAK, date), date).toEqual({ ok: false, reason: 'date' });
      expect(await as(principal, (c) => assignCover(c, actor(principal), { date: D, period: 1.5, classId: C5B, substituteUserId: FALAK }))).toEqual({ ok: false, reason: 'date' });
      // Only the three roles assign; an account made at another school is told why it cannot.
      for (const who of [bina, dev, accountant]) expect(await assign(who, 2, C5B, FALAK), who.role).toEqual({ ok: false, reason: 'not_allowed' });
      expect(await assign(visitingPrincipal, 2, C5B, FALAK)).toEqual({ ok: false, reason: 'elsewhere' });
      // After all that, one cover on the day: the first.
      expect(await count(`substitutions where on_date = $1::date`, [D])).toBe(1);
      // The other class of period 1 goes to someone else, and Dev takes a different period.
      expect(await assign(admin, 1, C6A, FALAK)).toMatchObject({ ok: true });
      expect(await assign(principal, 2, C5B, DEV)).toMatchObject({ ok: true });
      expect(slots((await as(principal, (c) => periodsToCover(c, A, D))).filter((p) => !p.cover))).toEqual(['4 6-A Asha']);
    });

    it('the database refuses a second cover of a period, and a second class for a teacher in a period', async () => {
      await scene();
      await assigned(principal, 1, C5A, DEV);
      const put = (who: Who, values: Partial<Record<'period' | 'class_id' | 'subject_id' | 'absent' | 'substitute' | 'by' | 'date' | 'school' | 'status', string | number>>) => {
        const v = { school: A, date: D, period: 1, class_id: C5A, subject_id: MATHS, absent: ASHA, substitute: CHAND, by: who.user, status: 'assigned', ...values };
        return as(who, (c) => c.query(`insert into substitutions (school_id, on_date, period, class_id, subject_id, absent_user_id, substitute_user_id, assigned_by, status) values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9)`, [v.school, v.date, v.period, v.class_id, v.subject_id, v.absent, v.substitute, v.by, v.status]));
      };
      // A period is covered once: Chand is free, the row is otherwise right, and the unique index refuses it.
      await expect(put(principal, {})).rejects.toThrow(/substitutions_one_cover_a_period/);
      await expect(put(coordinator, { substitute: FALAK })).rejects.toThrow(/substitutions_one_cover_a_period/);
      // A teacher covers one class a period: Dev again, for Gita's class in the same period.
      await expect(put(admin, { class_id: C6A, subject_id: ENGLISH, absent: GITA, substitute: DEV })).rejects.toThrow(/substitutions_one_class_a_substitute/);
      expect(await count(`substitutions where on_date = $1::date and status = 'assigned'`, [D])).toBe(1);
      // Another class of the same period, another teacher: nothing stands in its way.
      await put(admin, { class_id: C6A, subject_id: ENGLISH, absent: GITA, substitute: FALAK });
      expect(await count(`substitutions where on_date = $1::date and status = 'assigned'`, [D])).toBe(2);
    });

    it('two people tapping at the same moment: the index is the last guard, and the second is answered in plain words', async () => {
      await scene();
      await assigned(principal, 1, C5A, DEV);
      // The second person's screen was drawn, and their request looked, an instant before the first cover was
      // written: their own look at the covers finds none, and only the database's index stands in the way.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lookedTooEarly = (c: any) => ({ query: (text: string, params?: unknown[]) => (/^\s*select[\s\S]*from substitutions/i.test(text) ? Promise.resolve({ rows: [] }) : c.query(text, params)) });
      const second = await as(admin, async (c) => {
        const answer = await assignCover(lookedTooEarly(c) as never, actor(admin), { date: D, period: 1, classId: C5A, substituteUserId: CHAND });
        // The refusal did not break the caller's transaction: it goes on.
        return { answer, stillWorks: (await c.query(`select 1 as ok`)).rows[0].ok };
      });
      expect(second).toEqual({ answer: { ok: false, reason: 'already_covered' }, stillWorks: 1 });
      const third = await as(coordinator, (c) => assignCover(lookedTooEarly(c) as never, actor(coordinator), { date: D, period: 1, classId: C6A, substituteUserId: DEV }));
      expect(third).toEqual({ ok: false, reason: 'already_covering' });
      expect(await count(`substitutions where on_date = $1::date`, [D])).toBe(1);
      expect(await count(`audit_log where event_action = 'cover.assigned'`)).toBe(1);
    });

    it('leave approved in the same instant: the database’s own rule refuses, and the answer is plain', async () => {
      await scene();
      await onLeaveFor(dev);
      // The request's own look at who is away happened before Dev's leave was approved.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const beforeTheLeave = (c: any) => ({
        query: async (text: string, params?: unknown[]) => {
          const got = await c.query(text, params);
          return /teachers_away_on/.test(text) ? { ...got, rows: got.rows.filter((r: { user_id: string }) => r.user_id !== DEV) } : got;
        },
      });
      expect(await as(principal, (c) => assignCover(beforeTheLeave(c) as never, actor(principal), { date: D, period: 1, classId: C5A, substituteUserId: DEV }))).toEqual({ ok: false, reason: 'changed' });
      expect(await assign(principal, 1, C5A, DEV)).toEqual({ ok: false, reason: 'on_leave' });
      expect(await count(`substitutions where on_date = $1::date`, [D])).toBe(0);
    });

    it('the database holds the rest too: who may assign, in whose name, and only a free teacher for a real period of a teacher on leave', async () => {
      await scene();
      const put = (who: Who, values: Partial<Record<'period' | 'class_id' | 'subject_id' | 'absent' | 'substitute' | 'by' | 'date' | 'school' | 'status', string | number>>) => {
        const v = { school: who.school ?? A, date: D, period: 1, class_id: C5A, subject_id: MATHS, absent: ASHA, substitute: DEV, by: who.user, status: 'assigned', ...values };
        return as(who, (c) => c.query(`insert into substitutions (school_id, on_date, period, class_id, subject_id, absent_user_id, substitute_user_id, assigned_by, status) values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9)`, [v.school, v.date, v.period, v.class_id, v.subject_id, v.absent, v.substitute, v.by, v.status]));
      };
      // Never the absent teacher; a cover starts assigned.
      await expect(put(principal, { substitute: ASHA })).rejects.toThrow(/substitutions_not_the_absent|teaches a class of their own|on leave that day/);
      // The check itself, with the trigger out of the way (the owner of the database, as when rows are restored).
      await expect(
        db.pg.exec(`set session_replication_role = replica; insert into substitutions (school_id, on_date, period, class_id, subject_id, absent_user_id, substitute_user_id, assigned_by) values ('${A}', '${D}', 1, '${C5A}', '${MATHS}', '${ASHA}', '${ASHA}', '${PRINCIPAL}');`)
      ).rejects.toThrow(/substitutions_not_the_absent/);
      await db.pg.exec(`set session_replication_role = origin;`);
      await expect(put(principal, { status: 'undone' })).rejects.toThrow(/substitutions_undone|starts as assigned/);
      // The substitute: teaches then; on leave; has left; is not a teacher; is another school's.
      await expect(put(principal, { class_id: C6A, subject_id: ENGLISH, absent: GITA, substitute: BINA })).rejects.toThrow(/teaches a class of their own in that period/);
      await expect(put(principal, { period: 2, class_id: C5B, substitute: GITA })).rejects.toThrow(/on leave that day/);
      await expect(put(principal, { substitute: LATA })).rejects.toThrow(/active teacher of the school/);
      await expect(put(principal, { substitute: ACCOUNTANT })).rejects.toThrow(/active teacher of the school/);
      await expect(put(principal, { substitute: B_TEACHER })).rejects.toThrow(/active teacher of the school|foreign key/);
      // The period: its teacher is not on leave; no such period; the wrong subject; another weekday's period.
      await expect(put(principal, { period: 3, subject_id: ENGLISH, absent: BINA })).rejects.toThrow(/whose leave is approved for that day/);
      await expect(put(principal, { period: 6 })).rejects.toThrow(/a period the timetable gives the absent teacher/);
      await expect(put(principal, { subject_id: SCIENCE })).rejects.toThrow(/a period the timetable gives the absent teacher/);
      await expect(put(principal, { date: addDays(D, (OTHER_W - W + 7) % 7), period: 6, class_id: C5B })).rejects.toThrow(/whose leave is approved for that day/);
      // In one's own name, from a session of one of the three roles, of the row's own school.
      await expect(put(principal, { by: ADMIN })).rejects.toThrow(/row-level security/);
      for (const who of [dev, bina, asha, accountant]) await expect(put(who, {}), who.role).rejects.toThrow(/assigned by the principal, the school admin or the academic coordinator|row-level security/);
      await expect(put(elsewhere, { school: A })).rejects.toThrow(/assigned by the principal, the school admin or the academic coordinator|row-level security/);
      await expect(put(elsewhere, {})).rejects.toThrow(/a period the timetable gives the absent teacher|foreign key/);
      // An account made at another school cannot be the name on a cover.
      await expect(put(visitingPrincipal, {})).rejects.toThrow(/foreign key/);
      expect(await count(`substitutions where on_date = $1::date`, [D])).toBe(0);
      // A right row goes in, from each of the three roles.
      await put(principal, {});
      await put(admin, { class_id: C6A, subject_id: ENGLISH, absent: GITA, substitute: FALAK });
      await put(coordinator, { period: 2, class_id: C5B, substitute: HARI });
      expect(await count(`substitutions where on_date = $1::date and status = 'assigned'`, [D])).toBe(3);
    });

    it('the database holds the days too: no cover for a day gone by or further ahead than cover is arranged for, and its refusal says nothing about leave on those days', async () => {
      await wipe();
      // Three days of the same weekday as D: one gone by, one inside the days cover is arranged for, one beyond.
      const [gone, inside, beyond] = [addDays(D, -7), addDays(D, 28), addDays(D, 35)];
      expect(PROXY_AHEAD_DAYS).toBe(31);
      // Asha's leave is approved for all three; Gita has none.
      await onLeaveFor(asha, gone, gone);
      await onLeaveFor(asha, inside, beyond);
      const forGita = { class_id: C6A, subject_id: ENGLISH, absent: GITA, substitute: FALAK };
      const notADay = /a cover is arranged for today or one of the 31 days after/;
      for (const who of [coordinator, principal, admin]) {
        for (const date of [gone, beyond]) {
          // The coordinator is not told who is away on such a day, and the database's refusal does not tell either:
          // the same words for the teacher on leave and for the one who is not.
          if (who === coordinator) expect((await as<{ rows: unknown[] }>(who, (c) => c.query(`select user_id from teachers_away_on($1::date)`, [date]))).rows, date).toEqual([]);
          await expect(putRow(who, { date }), `${who.role} ${date}`).rejects.toThrow(notADay);
          await expect(putRow(who, { date, ...forGita }), `${who.role} ${date}`).rejects.toThrow(notADay);
        }
      }
      // The first and the last day: yesterday and the day after the last are refused for the day; today and the
      // last day pass that rule (and are refused here only because there is no such period).
      for (const date of [addDays(D, -1), addDays(D, PROXY_AHEAD_DAYS + 1)]) await expect(putRow(principal, { date, period: 9 }), date).rejects.toThrow(notADay);
      for (const date of [D, addDays(D, PROXY_AHEAD_DAYS)]) await expect(putRow(principal, { date, period: 9 }), date).rejects.toThrow(/a period the timetable gives the absent teacher/);
      expect(await count('substitutions')).toBe(0);
      // A day inside goes in, and through the app the same days are refused before the database is asked.
      await putRow(coordinator, { date: inside });
      expect(await count(`substitutions where on_date = $1::date and status = 'assigned'`, [inside])).toBe(1);
      for (const date of [gone, beyond]) expect(await assign(coordinator, 2, C5B, FALAK, date), date).toEqual({ ok: false, reason: 'date' });
      // The words and the number are the app's own, and no role of the app calls the day rule by itself.
      expect(readFileSync(MIGRATION, 'utf8')).toContain(`'a cover is arranged for today or one of the ${PROXY_AHEAD_DAYS} days after'`);
      await expect(as(coordinator, (c) => c.query(`select public.cover_day_open(current_date)`))).rejects.toThrow(/permission denied/);
    });

    it('"on leave on a day" is written once: the database’s own function, which onLeave(), the list of who is away and the guard on a new cover all ask', async () => {
      await scene();
      await onLeaveFor(accountant);
      const asks = (who: Who, user: string, date = D, school = A) => as(who, async (c) => (await c.query(`select public.staff_on_leave($1, $2, $3::date) as away`, [school, user, date])).rows[0].away as boolean);
      // Approved leave covering the day, and nothing else: not a request that only waits, not another day.
      for (const who of [principal, admin]) {
        expect([await asks(who, ASHA), await asks(who, GITA), await asks(who, ACCOUNTANT)], who.role).toEqual([true, true, true]);
        expect([await asks(who, HARI), await asks(who, BINA), await asks(who, ASHA, addDays(D, 1)), await asks(who, ASHA, addDays(D, -1))], who.role).toEqual([false, false, false, false]);
      }
      // It answers with the caller's own rights: a person about themself, and nobody about anyone else. The
      // academic coordinator, a colleague and another school learn nothing from it.
      expect(await asks(asha, ASHA)).toBe(true);
      expect(await asks(accountant, ACCOUNTANT)).toBe(true);
      for (const who of [coordinator, bina, dev, gita, accountant]) expect(await asks(who, ASHA), `${who.role} ${who.user}`).toBe(false);
      expect(await asks(elsewhere, ASHA)).toBe(false);
      expect(await asks(elsewhere, ASHA, D, B)).toBe(false);
      await expect(db.pg.transaction(async (tx: { query: (q: string) => Promise<unknown> }) => { await tx.query('set local role anon'); return tx.query(`select public.staff_on_leave('${A}', '${ASHA}', current_date)`); })).rejects.toThrow(/permission denied/);
      // The three readers agree, because they ask the same function: staff leave's own onLeave() (everyone on
      // leave, as the office reads it), the teachers away (teachers only), and the guard on a new cover.
      expect((await as(principal, (c) => onLeave(c, A, D))).map((x) => x.name)).toEqual(['Anil Accountant', 'Asha', 'Gita']);
      expect((await as(asha, (c) => onLeave(c, A, D))).map((x) => x.name)).toEqual(['Asha']);
      for (const who of [coordinator, bina]) expect(await as(who, (c) => onLeave(c, A, D)), who.role).toEqual([]);
      expect((await as<{ rows: { user_id: string }[] }>(coordinator, (c) => c.query(`select user_id from teachers_away_on($1::date) order by 1`, [D]))).rows.map((r) => r.user_id)).toEqual([ASHA, GITA]);
      await expect(putRow(coordinator, { period: 3, subject_id: ENGLISH, absent: BINA })).rejects.toThrow(/whose leave is approved for that day/);
      await expect(putRow(coordinator, { period: 2, class_id: C5B, substitute: GITA })).rejects.toThrow(/the substitute is on leave that day/);
      // One written copy: the migration states the rule in the function and asks it three times; the app's
      // onLeave() asks it; and Proxy Auto's own code never writes it again.
      const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
      expect(sql.match(/status = 'approved'/g)).toHaveLength(1);
      expect(sql.match(/between l\.from_date and l\.to_date/g)).toHaveLength(1);
      expect(sql.match(/public\.staff_on_leave\((?:new|u)\./g)).toHaveLength(3);
      const src = path.join(__dirname, '../../src');
      const leaveLib = readFileSync(path.join(src, 'lib/staff/leave.ts'), 'utf8');
      const onLeaveBody = leaveLib.slice(leaveLib.indexOf('export async function onLeave'), leaveLib.indexOf('// Is this person the only one'));
      expect(onLeaveBody).toContain('public.staff_on_leave(u.school_id, u.user_id, $2::date)');
      expect(onLeaveBody).not.toMatch(/staff_leave l|status = 'approved'/);
      expect(leaveLib).not.toContain('Proxy Auto reads this');
      for (const f of ['lib/proxy/proxy.ts', 'lib/proxy/rules.ts', 'lib/today/cards.ts']) expect(readFileSync(path.join(src, f), 'utf8'), f).not.toMatch(/status = 'approved'/);
    });
  });

  describe('undo', () => {
    it('one of the three roles takes a cover back in their own name; the period needs cover again and can be assigned again', async () => {
      await scene();
      const first = await assigned(principal, 1, C5A, DEV);
      for (const who of [dev, asha, accountant]) expect(await as(who, (c) => undoCover(c, actor(who), first)), who.role).toEqual({ ok: false, reason: 'not_allowed' });
      expect(await as(visitingPrincipal, (c) => undoCover(c, actor(visitingPrincipal), first))).toEqual({ ok: false, reason: 'elsewhere' });
      expect(await as(elsewhere, (c) => undoCover(c, actor(elsewhere), first))).toEqual({ ok: false, reason: 'not_found' });
      expect(await as(coordinator, (c) => undoCover(c, actor(coordinator), id(99)))).toEqual({ ok: false, reason: 'not_found' });
      expect(await as(coordinator, (c) => undoCover(c, actor(coordinator), first))).toEqual({ ok: true });
      expect(await row(first)).toMatchObject({ status: 'undone', undone_by: COORDINATOR, substitute_user_id: DEV, assigned_by: PRINCIPAL });
      expect(await as(principal, (c) => undoCover(c, actor(principal), first))).toEqual({ ok: false, reason: 'undone' });
      // The period is open again, with Dev offered again, and is assigned as a new row.
      const day = await dayFor(principal);
      expect(day.periods[0].cover).toBeNull();
      expect(names(day, 1, C5A)).toEqual(['Dev', 'Chand', 'Falak', 'Hari']);
      const second = await assigned(admin, 1, C5A, CHAND);
      expect(second).not.toBe(first);
      expect(await count(`substitutions where on_date = $1::date and class_id = $2 and period = 1`, [D, C5A])).toBe(2);
      // Both taps and the undo are in the audit log, each in its person's name.
      const audit = (await db.pg.query(`select event_action, actor_user_id, target_id from audit_log where event_action like 'cover.%' order by created_at, audit_id`)).rows;
      expect(audit.map((a: { event_action: string; actor_user_id: string }) => [a.event_action, a.actor_user_id])).toEqual([['cover.assigned', PRINCIPAL], ['cover.undone', COORDINATOR], ['cover.assigned', ADMIN]]);
    });

    it('a cover of a day gone by is left as it was', async () => {
      await wipe();
      await seedCover(addDays(D, -3), 1, C5A, MATHS, ASHA, DEV);
      const past = (await db.pg.query(`select substitution_id from substitutions`)).rows[0].substitution_id as string;
      expect(await as(principal, (c) => undoCover(c, actor(principal), past))).toEqual({ ok: false, reason: 'past' });
      expect((await row(past)).status).toBe('assigned');
      // A day gone by is closed: nothing about it is read or said, to anyone.
      await db.pg.exec(`set session_replication_role = replica; insert into staff_leave (school_id, user_id, from_date, to_date, kind, reason, status, recorded_by, decided_by, decided_at) values ('${A}', '${ASHA}', '${addDays(D, -3)}', '${addDays(D, -3)}', 'sick', 'Was unwell.', 'approved', '${ADMIN}', '${ADMIN}', now()); set session_replication_role = origin;`);
      for (const who of [principal, coordinator]) {
        expect(await dayFor(who, addDays(D, -3)), who.role).toEqual({ date: addDays(D, -3), weekday: isoWeekday(addDays(D, -3)), dayOff: null, away: [], periods: [], noLongerNeeded: [], open: false });
        expect(await dayFor(who, addDays(D, PROXY_AHEAD_DAYS + 1)), who.role).toMatchObject({ open: false, away: [], periods: [] });
        expect(await as(who, (c) => suggest(c, actor(who), addDays(D, -3), { period: 2, subjectId: MATHS })), who.role).toEqual([]);
      }
    });

    it('in the database: what was assigned never changes, an undone cover stays undone, undoing is in one’s own name, and nothing is deleted', async () => {
      await scene();
      const first = await assigned(principal, 1, C5A, DEV);
      const change = (who: Who, set: string, params: unknown[] = []) => as(who, (c) => c.query(`update substitutions set ${set} where substitution_id = $1`, [first, ...params]) as Promise<unknown>);
      for (const set of [`substitute_user_id = '${CHAND}'`, `period = 2`, `on_date = on_date + 1`, `class_id = '${C6A}'`, `absent_user_id = '${GITA}'`, `assigned_by = '${ADMIN}'`, `assigned_at = now() - interval '1 day'`]) {
        await expect(change(principal, set), set).rejects.toThrow(/what was assigned is never changed/);
      }
      // Undone in someone else's name: refused. By a teacher, even the substitute: no row is theirs to change.
      await expect(change(principal, `status = 'undone', undone_by = $2, undone_at = now()`, [ADMIN])).rejects.toThrow(/row-level security/);
      for (const who of [dev, asha, accountant]) {
        await change(who, `status = 'undone', undone_by = $2, undone_at = now()`, [who.user]);
        expect((await row(first)).status, who.role).toBe('assigned');
      }
      expect((await row(first)).status).toBe('assigned');
      // Half an undo is not one.
      await expect(change(principal, `status = 'undone'`)).rejects.toThrow(/substitutions_undone/);
      await change(admin, `status = 'undone', undone_by = $2, undone_at = now()`, [ADMIN]);
      expect(await row(first)).toMatchObject({ status: 'undone', undone_by: ADMIN });
      await expect(change(admin, `status = 'assigned', undone_by = null, undone_at = null`)).rejects.toThrow(/an undone cover stays undone/);
      await expect(change(principal, `undone_by = $2`, [PRINCIPAL])).rejects.toThrow(/an undone cover stays undone/);
      for (const who of [principal, admin, coordinator, dev]) await expect(as(who, (c) => c.query(`delete from substitutions where substitution_id = $1`, [first])), who.role).rejects.toThrow(/permission denied/);
      await expect(platform((c) => c.query(`select 1 from substitutions`))).rejects.toThrow(/permission denied/);
      await expect(platform((c) => c.query(`select * from teachers_away_on(current_date)`))).rejects.toThrow(/permission denied/);
    });
  });

  describe('who reads a cover', () => {
    it('the three roles read every cover; a teacher only those where they are the substitute or the absent teacher; nobody else any', async () => {
      await scene();
      const forAsha = await assigned(principal, 1, C5A, DEV);
      await assigned(principal, 1, C6A, FALAK);
      // In all: these two, and the one Dev holds on another day of the week (for Asha's class).
      for (const who of [principal, admin, coordinator]) expect(await sees(who), who.role).toBe(3);
      expect(await sees(dev)).toBe(2);
      expect(await sees(dev, `substitute_user_id <> '${DEV}'`)).toBe(0);
      expect(await sees(asha)).toBe(2);
      expect(await sees(asha, `absent_user_id <> '${ASHA}'`)).toBe(0);
      expect(await sees(gita)).toBe(1);
      for (const who of [bina, chand, hari, accountant, elsewhere]) expect(await sees(who), `${who.role} ${who.user}`).toBe(0);
      // A teacher's own covers, through the app: Dev's for the day, and for the days ahead. Each is the day, the
      // period, the class and the subject, and nothing else: not who is away (docs/26 section 5).
      expect(await as(dev, (c) => coversFor(c, A, DEV, D))).toEqual([{ substitution_id: forAsha, on_date: D, period: 1, class_id: C5A, class_name: '5-A', subject_name: 'Maths' }]);
      const lib = readFileSync(path.join(__dirname, '../../src/lib/proxy/proxy.ts'), 'utf8');
      const mineQuery = lib.slice(lib.indexOf('export async function coversBetween'), lib.indexOf('export const coversFor'));
      expect(mineQuery).toContain('from substitutions x');
      expect(mineQuery).not.toMatch(/users|display_name|absent|\$\{COVERS\}/);
      expect((await as(dev, (c) => coversFor(c, A, DEV))).length).toBe(1); // unless given, the date is today
      // Asking for someone else's covers gives nothing: the database decides, not the argument.
      expect(await as(bina, (c) => coversFor(c, A, DEV, D))).toEqual([]);
      expect(await as(chand, (c) => coversBetween(c, A, FALAK, addDays(D, -7), addDays(D, 7)))).toEqual([]);
      expect(await as(dev, (c) => coversBetween(c, A, DEV, D, addDays(D, -1)))).toEqual([]);
      // An undone cover is no longer the teacher's.
      await as(principal, (c) => undoCover(c, actor(principal), forAsha));
      expect(await as(dev, (c) => coversFor(c, A, DEV, D))).toEqual([]);
    });

    it('a cover does not widen what the substitute can read: the class’s students and marks stay closed, and the helper is untouched', async () => {
      await scene();
      // Dev is nobody's class teacher and teaches no subject through teacher_subjects: no class is "own".
      const own = () => as(dev, async (c) => (await c.query(`select public.teacher_own_class_ids() as ids`)).rows[0].ids as string[]);
      const before = await own();
      await db.pg.query(`insert into students (school_id, admission_no, name, class_id, status) values ($1, 'A-5A-1', 'A Child Of Five A', $2, 'active')`, [A, C5A]);
      try {
        const seen = async () => (await as<Count>(dev, (c) => c.query(`select count(*)::int as n from students where class_id = $1`, [C5A]))).rows[0].n;
        expect(await seen()).toBe(0);
        await assigned(principal, 1, C5A, DEV);
        expect(await own()).toEqual(before);
        expect(await seen()).toBe(0);
      } finally {
        await db.pg.exec(`set session_replication_role = replica; delete from students where admission_no = 'A-5A-1'; set session_replication_role = origin;`);
      }
      // The migration creates no other function than its four, and replaces or drops nothing that was there.
      const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
      expect([...sql.matchAll(/create (?:or replace )?function (public\.\w+)/g)].map((m) => m[1])).toEqual(['public.staff_on_leave', 'public.cover_day_open', 'public.substitutions_rules', 'public.teachers_away_on']);
      // Only the two that must see past the caller's own rows run with the owner's rights.
      expect(sql.match(/security definer/g)).toHaveLength(2);
      expect(sql).not.toMatch(/drop policy|alter policy|create or replace|drop function|teacher_own_class_ids|alter table (?!substitutions)/);
      expect([...sql.matchAll(/create policy (\w+) on (\w+)/g)].map((m) => `${m[2]}.${m[1]}`)).toEqual([
        'substitutions.substitutions_tenant_isolation', 'substitutions.substitutions_arrangers_or_own', 'substitutions.substitutions_assigned_as_self', 'substitutions.substitutions_undone_as_self', 'audit_log.audit_cover_rows_arrangers_or_actor',
      ]);
    });

    it('the audit rows of a cover say who was away, so they follow the cover', async () => {
      await scene();
      await assigned(principal, 1, C5A, DEV);
      const reads = async (who: Who) => (await as<Count>(who, (c) => c.query(`select count(*)::int as n from audit_log where event_action like 'cover.%'`))).rows[0].n;
      for (const who of [principal, admin, coordinator]) expect(await reads(who), who.role).toBe(1);
      for (const who of [dev, asha, bina, accountant, elsewhere]) expect(await reads(who), who.role).toBe(0);
      const kept = (await db.pg.query(`select after_state from audit_log where event_action = 'cover.assigned'`)).rows[0].after_state;
      expect(kept).toEqual({ date: D, period: 1, classId: C5A, subjectId: MATHS, absentUserId: ASHA, substituteUserId: DEV });
    });
  });

  describe('when leave or the timetable changes after a cover was assigned', () => {
    const waitingFor = async (who: Who) => ({ open: (await load('periods-uncovered', who))[0]?.count ?? 0, notNeeded: (await load('covers-not-needed', who))[0]?.count ?? 0 });

    // A cover as the database holds it, with why it was undone (C210).
    const undoneRow = async (substitutionId: string) => (await db.pg.query(`select status, undone_by, undone_reason, undone_at is not null as undone_at from substitutions where substitution_id = $1`, [substitutionId])).rows[0];

    it('cancelled leave releases its covers from today on, in the canceller’s name; the covering teacher sees it on My Day, and the office’s card does not count it again', async () => {
      await wipe();
      // Asha is away from three days ago to a week ahead; Gita is away today. Dev covers Asha's first period today,
      // Falak the same period a week ahead, and a cover of three days ago is on record. Hari covers Gita's period.
      const next = addDays(D, 7);
      const leave = await onLeaveFor(asha, addDays(D, -3), next);
      await onLeaveFor(gita);
      await seedCover(addDays(D, -3), 1, C5A, MATHS, ASHA, DEV);
      const past = (await db.pg.query(`select substitution_id from substitutions where on_date < $1::date`, [D])).rows[0].substitution_id as string;
      const todays = await assigned(principal, 1, C5A, DEV);
      const later = await assign(principal, 1, C5A, FALAK, next);
      if (!later.ok) throw new Error(later.reason);
      const gitas = await assigned(admin, 1, C6A, HARI);
      const sent = { jobs: await count('jobs'), messages: await count('communication_log') };
      for (const who of [principal, admin, coordinator]) expect(await waitingFor(who), who.role).toEqual({ open: 2, notNeeded: 0 });
      // The office cancels Asha's leave. By that one tap both covers from today on are undone, in its name.
      expect(await as(admin, (c) => withdrawLeave(c, actor(admin), leave, 'She came in after all.'))).toEqual({ ok: true, coversReleased: 2 });
      for (const x of [todays, later.substitutionId]) expect(await undoneRow(x), x).toEqual({ status: 'undone', undone_by: ADMIN, undone_reason: 'leave_cancelled', undone_at: true });
      // A day gone by stays as it was, and another teacher's cover is untouched.
      expect(await undoneRow(past)).toEqual({ status: 'assigned', undone_by: null, undone_reason: null, undone_at: false });
      expect((await row(gitas)).status).toBe('assigned');
      // One audit row a cover, in the canceller's name, saying why; never the kind or the reason of the leave.
      const audit = (await db.pg.query(`select actor_user_id, target_id, after_state from audit_log where event_action = 'cover.released'`)).rows as { actor_user_id: string; target_id: string; after_state: Record<string, unknown> }[];
      expect(audit.map((a) => a.target_id).sort()).toEqual([todays, later.substitutionId].sort());
      for (const a of audit) expect(a).toMatchObject({ actor_user_id: ADMIN, after_state: { absentUserId: ASHA, status: 'undone', undoneReason: 'leave_cancelled', leaveId: leave } });
      expect(JSON.stringify(audit)).not.toMatch(/Unwell|sick|came in/);
      // The covering teachers are told in the app, from today on: Dev of today's, Falak of next week's.
      expect(card('covers-released')).toMatchObject({ moduleId: 'proxy', roles: ['teacher'] });
      expect(await load('covers-today', dev)).toEqual([]);
      expect(await load('covers-released', dev)).toEqual([{ id: 'covers-released', type: 'covers-released', moduleId: 'proxy', state: 'todo', count: 1, href: '/app/proxy' }]);
      expect((await load('covers-released', falak))[0]).toMatchObject({ count: 1 });
      expect(await as(dev, (c) => coversReleasedBetween(c, A, DEV, D, addDays(D, PROXY_AHEAD_DAYS)))).toEqual([{ substitution_id: todays, on_date: D, period: 1, class_id: C5A, class_name: '5-A', subject_name: 'Maths' }]);
      // Nobody else: not Hari, whose cover stands; not the absent teacher; not a colleague asking for Dev's.
      for (const who of [hari, asha, bina]) expect(await load('covers-released', who), who.role).toEqual([]);
      expect(await as(bina, (c) => coversReleasedBetween(c, A, DEV, D, next))).toEqual([]);
      // The office's own card does not count them again: they are undone, not "no longer needed".
      for (const who of [principal, admin, coordinator]) expect(await waitingFor(who), who.role).toEqual({ open: 0, notNeeded: 0 });
      expect((await dayFor(coordinator)).noLongerNeeded).toEqual([]);
      expect((await dayFor(principal, next)).noLongerNeeded).toEqual([]);
      // Told in the app only: no job and no message.
      expect({ jobs: await count('jobs'), messages: await count('communication_log') }).toEqual(sent);
      // Asha is away again today after all, and Dev is given the same period again: the release is no longer said.
      await onLeaveFor(asha);
      await assigned(coordinator, 1, C5A, DEV);
      expect(await load('covers-released', dev)).toEqual([]);
      expect((await load('covers-released', falak))[0]).toMatchObject({ count: 1 });
      expect(t('en', 'today.covers-released.todo.one')).toBe('A cover you had was released: the teacher is back');
      for (const lang of ['en', 'hi'] as const) for (const part of ['todo.one', 'todo.other', 'action', 'why']) expect(t(lang, `today.covers-released.${part}` as never), `${lang} ${part}`).not.toMatch(/today\.covers|^$/);
    });

    it('the database holds it: the person’s own withdrawal and a cancellation past the app release the covers too, and a release is never marked while the leave stands', async () => {
      await wipe();
      // Bina asks for a day next week and the principal approves it; the coordinator gives her period 3 to Dev.
      const next = addDays(D, 7);
      const asked = await as(bina, (c) => askLeave(c, actor(bina), { fromDate: next, toDate: next, kind: 'casual', reason: 'A family function.' }));
      if (!asked.ok) throw new Error(asked.reason);
      await as(principal, (c) => decideLeave(c, actor(principal), asked.leaveId, 'approve', ''));
      const forBina = await assign(coordinator, 3, C5A, DEV, next);
      if (!forBina.ok) throw new Error(forBina.reason);
      // A teacher changes no cover row herself...
      const tried = await as<{ affectedRows?: number }>(bina, (c) => c.query(`update substitutions set status = 'undone', undone_by = $2, undone_at = now(), undone_reason = 'leave_cancelled' where substitution_id = $1`, [forBina.substitutionId, BINA]));
      expect(tried.affectedRows ?? 0).toBe(0);
      expect((await row(forBina.substitutionId)).status).toBe('assigned');
      // ...but withdrawing her own leave before its day releases it, in her own name.
      expect(await as(bina, (c) => withdrawLeave(c, actor(bina), asked.leaveId, ''))).toEqual({ ok: true, coversReleased: 1 });
      expect(await undoneRow(forBina.substitutionId)).toEqual({ status: 'undone', undone_by: BINA, undone_reason: 'leave_cancelled', undone_at: true });
      expect((await db.pg.query(`select actor_user_id from audit_log where event_action = 'cover.released' and target_id = $1`, [forBina.substitutionId])).rows).toEqual([{ actor_user_id: BINA }]);
      expect((await load('covers-released', dev))[0]).toMatchObject({ count: 1 });
      // Past the app: the office cancels approved leave with a plain update, and the database releases the cover.
      await wipe();
      const leave = await onLeaveFor(asha);
      const first = await assigned(principal, 1, C5A, DEV);
      await as(principal, (c) => c.query(`update staff_leave set status = 'withdrawn', withdrawn_by = $2, withdrawn_at = now(), withdrawn_note = 'Back after all.' where leave_id = $1`, [leave, PRINCIPAL]));
      expect(await undoneRow(first)).toEqual({ status: 'undone', undone_by: PRINCIPAL, undone_reason: 'leave_cancelled', undone_at: true });
      // A cover is never marked released for cancelled leave while its leave stands, and that is the one reason.
      await onLeaveFor(gita);
      const gitas = await assigned(principal, 1, C6A, HARI);
      const mark = (set: string) => as(principal, (c) => c.query(`update substitutions set ${set} where substitution_id = $1`, [gitas, PRINCIPAL]));
      await expect(mark(`status = 'undone', undone_by = $2, undone_at = now(), undone_reason = 'leave_cancelled'`)).rejects.toThrow(/released for cancelled leave only/);
      await expect(mark(`status = 'undone', undone_by = $2, undone_at = now(), undone_reason = 'changed_mind'`)).rejects.toThrow(/substitutions_undone_reason/);
      await expect(as(principal, (c) => c.query(`update substitutions set undone_reason = 'leave_cancelled' where substitution_id = $1`, [gitas]))).rejects.toThrow(/released for cancelled leave only|substitutions_undone_reason/);
      // A person's own undo stays a plain undo, with no reason written; and a released cover stays as it is.
      expect(await as(principal, (c) => undoCover(c, actor(principal), gitas))).toEqual({ ok: true });
      expect(await undoneRow(gitas)).toEqual({ status: 'undone', undone_by: PRINCIPAL, undone_reason: null, undone_at: true });
      await expect(as(admin, (c) => c.query(`update substitutions set undone_reason = null where substitution_id = $1`, [first]))).rejects.toThrow(/an undone cover stays undone/);
      // The migration: its two functions run with the owner's rights, and it adds no job and sends nothing.
      const sql = readFileSync(path.join(MIGRATIONS_DIR, readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith('_c210_leave_rules.sql'))!), 'utf8');
      expect(sql).not.toMatch(/jobs_enqueue|insert into jobs|communication_log/);
      expect(sql.match(/staff_leave:' \|\| new\.school_id::text \|\| ':' \|\| new\.(absent_)?user_id::text/g)).toHaveLength(3);
    });

    it('a holiday entered after the tap: the teacher is no longer told to cover on a day the school is closed, and the office is told to undo it', async () => {
      await wipe();
      // Asha is away today and on the same weekday next week; Dev covers her first period on both days.
      const next = addDays(D, 7);
      await onLeaveFor(asha);
      await onLeaveFor(asha, next, next);
      const today = await assigned(principal, 1, C5A, DEV);
      const later = await assign(principal, 1, C5A, DEV, next);
      if (!later.ok) throw new Error(later.reason);
      const mine = async () => (await as(dev, (c) => coversBetween(c, A, DEV, D, addDays(D, PROXY_AHEAD_DAYS)))).map((x) => x.on_date);
      expect(await mine()).toEqual([D, next]);
      expect((await load('covers-today', dev))[0]).toMatchObject({ count: 1 });
      try {
        await db.pg.query(`insert into school_holidays (school_id, holiday_date, name, created_by) values ($1, $2::date, 'Founders’ Day', $3)`, [A, D, PRINCIPAL]);
        // Today is closed: no period to take, so no card and no line for today; next week's cover is still theirs.
        expect(await load('covers-today', dev)).toEqual([]);
        expect(await as(dev, (c) => coversFor(c, A, DEV))).toEqual([]);
        expect(await mine()).toEqual([next]);
        // The cover itself stands until a person undoes it, and the people who arrange cover are told.
        expect((await row(today)).status).toBe('assigned');
        expect((await dayFor(principal)).noLongerNeeded.map((x) => `${x.period} ${x.class_name} ${x.substitute_name}`)).toEqual(['1 5-A Dev']);
        for (const who of [principal, admin, coordinator]) expect(await waitingFor(who), who.role).toEqual({ open: 0, notNeeded: 1 });
      } finally {
        await db.pg.query(`delete from school_holidays where school_id = $1`, [A]);
      }
      expect(await mine()).toEqual([D, next]);
      for (const who of [principal, admin, coordinator]) expect(await waitingFor(who), who.role).toEqual({ open: 2, notNeeded: 0 });
      // The same when the school stops working on that weekday: both days are closed.
      const working = (days: string[]) => db.pg.query(`update school_settings set setting_values = $2::jsonb where school_id = $1 and module_id = 'setup'`, [A, JSON.stringify({ working_days: days })]);
      try {
        await working(ALL_DAYS.filter((_, i) => i + 1 !== W));
        expect(await mine()).toEqual([]);
        expect(await load('covers-today', dev)).toEqual([]);
        expect(await waitingFor(coordinator)).toEqual({ open: 0, notNeeded: 1 });
      } finally {
        await working(ALL_DAYS);
      }
      expect((await row(later.substitutionId)).status).toBe('assigned');
    });

    it('a cover whose teacher cannot take it any more counts as a period with no teacher: now on leave, no longer active, or given a class of their own', async () => {
      const start = async () => {
        await wipe();
        await onLeaveFor(asha);
        const made = await assigned(principal, 4, C6A, DEV);
        // The cover is sound: two of Asha's three periods are open, and the fourth is badged as covered.
        const day = await dayFor(principal);
        expect(day.periods.find((p) => p.period === 4)!.cover).toMatchObject({ substitute_name: 'Dev', problem: null });
        expect(day.periods.filter(needsCover).length).toBe(2);
        expect(await waitingFor(principal)).toEqual({ open: 2, notNeeded: 0 });
        expect(drawDay('en', day).match(/data-covered="yes"/g)).toHaveLength(1);
        return made;
      };
      const flagged = async (problem: string, words: string) => {
        for (const who of [principal, admin, coordinator]) {
          const day = await dayFor(who);
          const fourth = day.periods.find((p) => p.period === 4)!;
          expect(fourth.cover, `${problem} ${who.role}`).toMatchObject({ substitute_user_id: DEV, problem });
          expect(needsCover(fourth)).toBe(true);
          // One period, one cover: it is undone before anyone else is offered.
          expect(fourth.suggestions).toEqual([]);
          // My Day's number is the number of "Needs cover" badges on the screen.
          const html = drawDay('en', day);
          expect(html.match(/data-covered="no"/g), `${problem} ${who.role}`).toHaveLength(3);
          expect(html).not.toContain('data-covered="yes"');
          expect(html).not.toContain('>Covered<');
          expect(await waitingFor(who), `${problem} ${who.role}`).toEqual({ open: 3, notNeeded: 0 });
          // The period says why, in the cover's own words, with its Undo.
          expect(html).toContain(`data-proxy-problem="${problem}"`);
          expect(html).toContain(words);
          expect(html).toContain('Dev was given this period by Priya Principal');
          expect(html).not.toContain('Dev covers this period');
          expect(html.match(/data-proxy-undo/g)).toHaveLength(1);
          const hindi = drawDay('hi', day);
          expect(hindi).toContain(`data-proxy-problem="${problem}"`);
          expect(hindi).not.toMatch(/Undo this cover|\{\w+\}|px\./);
        }
      };

      // 1. The substitute's own leave is approved for the day.
      const first = await start();
      await onLeaveFor(dev);
      await flagged('on_leave', 'Dev is now on leave that day too, so this class has no teacher. Undo this cover and choose someone else.');
      const day = await dayFor(principal);
      expect(day.away.map((p) => p.name)).toEqual(['Asha', 'Dev']);
      expect(day.periods.filter((p) => !p.cover).every((p) => !p.suggestions.some((s) => s.user_id === DEV))).toBe(true);
      // A person undoes it and gives the period to someone who is there: it is covered again.
      expect(await assign(principal, 4, C6A, FALAK)).toEqual({ ok: false, reason: 'already_covered' });
      expect(await as(principal, (c) => undoCover(c, actor(principal), first))).toEqual({ ok: true });
      expect(names(await dayFor(principal), 4, C6A)).not.toContain('Dev');
      await assigned(principal, 4, C6A, FALAK);
      expect(await waitingFor(principal)).toEqual({ open: 2, notNeeded: 0 });

      // 2. The substitute's account is switched off.
      await start();
      try {
        await db.pg.query(`update users set is_active = false where user_id = $1`, [DEV]);
        await flagged('not_active', 'Dev is no longer an active teacher of the school, so this class has no teacher.');
      } finally {
        await db.pg.query(`update users set is_active = true where user_id = $1`, [DEV]);
      }
      expect(await waitingFor(principal)).toEqual({ open: 2, notNeeded: 0 });

      // 3. The timetable now gives the substitute a class of their own in that period.
      await start();
      try {
        await db.pg.query(`insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values ($1, $2, $3, 4, $4, $5)`, [A, C5A, W, MATHS, DEV]);
        await flagged('own_class', 'The timetable now gives Dev a class of their own in this period, so this class has no teacher.');
      } finally {
        await db.pg.query(`delete from timetable_entries where school_id = $1 and class_id = $2 and weekday = $3 and period = 4`, [A, C5A, W]);
      }
      expect(await waitingFor(principal)).toEqual({ open: 2, notNeeded: 0 });
      // A class of their own in another period, or on another weekday, is no problem for this cover.
      expect((await dayFor(principal)).periods.find((p) => p.period === 4)!.cover).toMatchObject({ problem: null });
    });

    it('the timetable changed so that the period is no longer the absent teacher’s: the cover is listed as no longer needed', async () => {
      await wipe();
      await onLeaveFor(asha);
      await assigned(principal, 4, C6A, DEV);
      try {
        await db.pg.query(`update timetable_entries set teacher_user_id = $4 where school_id = $1 and class_id = $2 and weekday = $3 and period = 4`, [A, C6A, W, FALAK]);
        expect((await dayFor(admin)).noLongerNeeded.map((x) => `${x.period} ${x.class_name} ${x.substitute_name}`)).toEqual(['4 6-A Dev']);
        expect(await waitingFor(admin)).toEqual({ open: 2, notNeeded: 1 });
      } finally {
        await db.pg.query(`update timetable_entries set teacher_user_id = $4 where school_id = $1 and class_id = $2 and weekday = $3 and period = 4`, [A, C6A, W, ASHA]);
      }
    });
  });

  describe('the academic coordinator: away or present, and nothing more (docs/26 section 3 rule 4, C210)', () => {
    it('reads who is away and never a leave kind or reason: in the database, through the routes and cards, and on the screen', async () => {
      await scene();
      // Chand is away today and tomorrow, with a kind and a reason easy to look for. The office cancels Gita's
      // leave after Hari was given her period, so the coordinator can read cover audit rows of every kind too.
      const PRIVATE = 'A private matter, Zephyr forty-one';
      const chands = await as(admin, (c) => recordLeave(c, actor(admin), { userId: CHAND, fromDate: D, toDate: addDays(D, 1), kind: 'other', reason: PRIVATE }));
      if (!chands.ok) throw new Error(chands.reason);
      const gitaLeave = (await db.pg.query(`select leave_id from staff_leave where user_id = $1 and status = 'approved'`, [GITA])).rows[0].leave_id as string;
      await assigned(coordinator, 1, C6A, HARI);
      await as(admin, (c) => withdrawLeave(c, actor(admin), gitaLeave, 'Back after all.'));
      await assigned(coordinator, 1, C5A, DEV);
      const secret = new RegExp(`Zephyr|${PRIVATE}|Unwell|family function|Back after all|"(sick|casual|other)"|"reason"|"kind"`);
      // In the database, as the app's own role: there are leave rows and leave audit rows, and the coordinator reads none.
      expect(await count(`staff_leave where status = 'approved'`)).toBe(2);
      expect(await count(`audit_log where event_action like 'leave.%'`)).toBeGreaterThan(3);
      expect((await as<Count>(coordinator, (c) => c.query(`select count(*)::int as n from staff_leave`))).rows[0].n).toBe(0);
      expect((await as<{ rows: unknown[] }>(coordinator, (c) => c.query(`select kind, reason, decision_note, withdrawn_note from staff_leave`))).rows).toEqual([]);
      expect((await as<Count>(coordinator, (c) => c.query(`select count(*)::int as n from audit_log where event_action like 'leave.%'`))).rows[0].n).toBe(0);
      // The one fact they are given: who is away, as ids and nothing else.
      const away = await as<{ fields: { name: string }[]; rows: { user_id: string }[] }>(coordinator, (c) => c.query(`select * from teachers_away_on($1::date)`, [D]));
      expect(away.fields.map((f) => f.name)).toEqual(['user_id']);
      expect(away.rows.map((r) => r.user_id).sort()).toEqual([ASHA, CHAND].sort());
      // "On leave on a day" answers them from the rows they read, which are none: no way round to the leave itself.
      expect((await as<{ rows: { on: boolean }[] }>(coordinator, (c) => c.query(`select public.staff_on_leave($1, $2, $3::date) as on`, [A, CHAND, D]))).rows[0].on).toBe(false);
      // The cover audit rows they do read (assigned, undone, released) say who was away, and nothing of why.
      const coverAudit = (await as<{ rows: { event_action: string }[] }>(coordinator, (c) => c.query(`select event_action, after_state, before_state from audit_log where event_action like 'cover.%'`))).rows;
      expect(coverAudit.map((a) => a.event_action).sort()).toEqual(['cover.assigned', 'cover.assigned', 'cover.released']);
      expect(JSON.stringify(coverAudit)).not.toMatch(secret);
      // Through the app: the day's reading, a suggestion list, My Day's cards and the leave route.
      expect(JSON.stringify(await dayFor(coordinator))).not.toMatch(secret);
      expect((await dayFor(coordinator)).away.map((p) => p.name)).toEqual(['Asha', 'Chand']);
      expect(JSON.stringify(await as(coordinator, (c) => suggest(c, actor(coordinator), D, { period: 2, subjectId: MATHS })))).not.toMatch(secret);
      for (const provider of TODAY_PROVIDERS.filter((p) => p.roles.includes('academic_coordinator'))) {
        expect(JSON.stringify(await as(coordinator, (c) => provider.load(c, { schoolId: A, userId: COORDINATOR, role: 'academic_coordinator', sunday: false }))), provider.type).not.toMatch(secret);
      }
      const claims = { sub: COORDINATOR, role: 'academic_coordinator', schoolId: A, membershipId: id(90), tokenVersion: 0, aal: 'aal1', sessionId: id(91) };
      const read = async (fn: () => Promise<Response>) => {
        state.claims = claims;
        const res = await fn();
        return { status: res.status, body: await res.json() };
      };
      for (const date of [D, addDays(D, 1)]) {
        const got = await read(() => getProxy(new NextRequest(`http://localhost/api/app/proxy?date=${date}`)));
        expect(got.status, date).toBe(200);
        expect(JSON.stringify(got.body), date).not.toMatch(secret);
        expect(got.body.day.away.map((p: { name: string }) => p.name), date).toContain('Chand');
        // And on the screen the coordinator is shown.
        expect(drawDay('en', got.body.day, false), date).not.toMatch(/Zephyr|Unwell|Sick|Casual|Kind of leave|Reason/);
      }
      const ownLeave = await read(() => listLeave(new NextRequest('http://localhost/api/app/staff/leave')));
      expect(ownLeave).toMatchObject({ status: 200, body: { mine: [] } });
      expect(JSON.stringify(ownLeave.body)).not.toMatch(secret);
      expect(await read(() => listLeave(new NextRequest('http://localhost/api/app/staff/leave?view=office')))).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
      // The office, for comparison, reads both: the rule is about who reads, not about what is kept.
      expect((await as<{ rows: { reason: string }[] }>(admin, (c) => c.query(`select reason from staff_leave where user_id = $1`, [CHAND]))).rows).toEqual([{ reason: PRIVATE }]);
    });
  });

  describe('nothing is assigned without a person’s tap', () => {
    it('reading the day, the suggestions, the cards and the screens writes no cover, no job and no message', async () => {
      await scene();
      const before = { covers: await count('substitutions'), jobs: await count('jobs'), messages: await count('communication_log'), audit: await count(`audit_log where event_action like 'cover.%'`) };
      for (const who of [principal, admin, coordinator]) {
        await as(who, (c) => periodsToCover(c, A, D));
        await dayFor(who);
        await dayFor(who, addDays(D, 1));
        await as(who, (c) => suggest(c, actor(who), D, { period: 1, subjectId: MATHS }));
        for (const card of TODAY_PROVIDERS.filter((p) => p.moduleId === 'proxy' && p.roles.includes(who.role as never))) await as(who, (c) => card.load(c, { schoolId: A, userId: who.user, role: who.role as never, sunday: false }));
      }
      await as(dev, (c) => coversFor(c, A, DEV, D));
      expect({ covers: await count('substitutions'), jobs: await count('jobs'), messages: await count('communication_log'), audit: await count(`audit_log where event_action like 'cover.%'`) }).toEqual(before);
      // Every period of the day is still open: suggestions are offers, and none became a cover.
      expect((await as(principal, (c) => periodsToCover(c, A, D))).every((p) => p.cover === null)).toBe(true);
      // One tap is one cover, in that person's name, and still no job and no message: the teacher is told in the app.
      await assigned(admin, 1, C5A, DEV);
      expect({ covers: await count('substitutions'), jobs: await count('jobs'), messages: await count('communication_log') }).toEqual({ covers: before.covers + 1, jobs: before.jobs, messages: before.messages });
      expect((await db.pg.query(`select distinct assigned_by from substitutions where on_date = $1::date`, [D])).rows).toEqual([{ assigned_by: ADMIN }]);
    });

    it('only one function writes a cover, only a person’s request calls it, and no job, schedule or message code touches covers', () => {
      const src = path.join(__dirname, '../../src');
      const files = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? files(path.join(dir, n)) : [path.join(dir, n)])) : []);
      const code = files(src).filter((f) => /\.(ts|tsx)$/.test(f));
      const read = (f: string) => readFileSync(f, 'utf8');
      const rel = (list: string[]) => list.map((f) => path.relative(src, f)).sort();
      // The table is written in one file.
      expect(rel(code.filter((f) => /insert into substitutions|update substitutions|delete from substitutions/.test(read(f))))).toEqual(['lib/proxy/proxy.ts']);
      const lib = read(path.join(src, 'lib/proxy/proxy.ts'));
      expect(lib.match(/insert into substitutions/g)).toHaveLength(1);
      expect(lib.match(/update substitutions/g)).toHaveLength(1);
      // assignCover and undoCover are called from the two POST handlers and nowhere else.
      expect(rel(code.filter((f) => /\bassignCover\(/.test(read(f))))).toEqual(['app/api/app/proxy/route.ts', 'lib/proxy/proxy.ts']);
      expect(rel(code.filter((f) => /\bundoCover\(/.test(read(f))))).toEqual(['app/api/app/proxy/[substitutionId]/route.ts', 'lib/proxy/proxy.ts']);
      const post = read(path.join(src, 'app/api/app/proxy/route.ts'));
      expect(post.slice(post.indexOf('export async function GET'), post.indexOf('export async function POST'))).not.toMatch(/assignCover|undoCover/);
      // My Day reads, and only reads.
      const cards = read(path.join(src, 'lib/today/cards.ts'));
      expect(cards).not.toMatch(/assignCover|undoCover/);
      // Nothing that runs without a person (jobs, schedules, webhooks) knows about covers, and the proxy code
      // adds no job and writes no message.
      const unattended = code.filter((f) => /lib\/jobs\/|\/api\/jobs\/|\/api\/cron\/|\/api\/webhooks\/|lib\/whatsapp\//.test(f));
      expect(unattended.length).toBeGreaterThan(5);
      for (const f of unattended) expect(read(f), path.relative(src, f)).not.toMatch(/substitutions|lib\/proxy|assignCover/);
      for (const f of files(path.join(src, 'lib/proxy')).concat(files(path.join(src, 'app/api/app/proxy')))) expect(read(f), path.relative(src, f)).not.toMatch(/jobQueue|enqueue|communication_log|whatsapp|sendTemplate/i);
      // And the migration adds no job type.
      expect(readFileSync(MIGRATION, 'utf8')).not.toMatch(/jobs_enqueue|insert into jobs/);
    });
  });

  describe('My Day', () => {
    it('the people who arrange cover are told how many of today’s periods still have no teacher: the screen’s own number', async () => {
      await scene();
      expect(card('periods-uncovered')).toMatchObject({ moduleId: 'proxy', roles: ['principal', 'school_admin', 'academic_coordinator'] });
      for (const who of [principal, admin, coordinator]) {
        expect(await load('periods-uncovered', who), who.role).toEqual([{ id: 'periods-uncovered', type: 'periods-uncovered', moduleId: 'proxy', state: 'todo', count: 4, href: '/app/proxy' }]);
      }
      await assigned(principal, 1, C5A, DEV);
      await assigned(principal, 2, C5B, FALAK);
      const onScreen = (await dayFor(coordinator)).periods.filter(needsCover).length;
      expect(onScreen).toBe(2);
      expect((await load('periods-uncovered', coordinator))[0]).toMatchObject({ count: onScreen });
      await assigned(admin, 1, C6A, HARI);
      await assigned(admin, 4, C6A, CHAND);
      expect(await load('periods-uncovered', principal)).toEqual([]);
      // Another school has nobody on leave, and counts nothing of this school's.
      expect(await load('periods-uncovered', elsewhere)).toEqual([]);
    });

    it('a teacher is told the periods they cover today, in order; nobody else’s, and none that was undone', async () => {
      await scene();
      expect(card('covers-today')).toMatchObject({ moduleId: 'proxy', roles: ['teacher'] });
      expect(await load('covers-today', dev)).toEqual([]);
      const late = await assigned(principal, 4, C6A, DEV);
      await assigned(principal, 1, C5A, DEV);
      await assigned(principal, 2, C5B, FALAK);
      expect(await load('covers-today', dev)).toEqual([{ id: 'covers-today', type: 'covers-today', moduleId: 'proxy', state: 'todo', count: 2, subject: '1. 5-A Maths · 4. 6-A Science', href: '/app/proxy' }]);
      expect(await load('covers-today', chand)).toEqual([]);
      expect(await load('covers-today', asha)).toEqual([]); // the absent teacher covers nothing
      await as(admin, (c) => undoCover(c, actor(admin), late));
      expect((await load('covers-today', dev))[0]).toMatchObject({ count: 1, subject: '1. 5-A Maths' });
      for (const lang of ['en', 'hi'] as const) {
        for (const type of ['covers-today', 'periods-uncovered', 'covers-not-needed']) for (const part of ['todo.one', 'todo.other', 'action', 'why']) expect(t(lang, `today.${type}.${part}` as never), `${lang} ${type} ${part}`).toBeTruthy();
      }
    });
  });

  describe('the routes and the screens', () => {
    const claims = (who: Who) => ({ sub: who.user, role: who.role, schoolId: who.school ?? A, membershipId: id(90), tokenVersion: 0, aal: 'aal1', sessionId: id(91) });
    const req = (method: string, url: string, body?: unknown) => new NextRequest(`http://localhost${url}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
    const call = async (who: Who, fn: () => Promise<Response>) => {
      state.claims = claims(who);
      const res = await fn();
      return { status: res.status, body: await res.json() };
    };
    const get = (who: Who, query = '') => call(who, () => getProxy(req('GET', `/api/app/proxy${query}`)));
    const post = (who: Who, body: unknown) => call(who, () => postProxy(req('POST', '/api/app/proxy', body)));
    const step = (who: Who, substitutionId: string, body: unknown) => call(who, () => stepProxy(req('POST', `/api/app/proxy/${substitutionId}`, body), { params: { substitutionId } }));
    const proxyModule = (enabled: boolean, school = A) => db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source) values ($1, 'proxy', $2, 'plan') on conflict (school_id, module_id) do update set enabled = excluded.enabled`, [school, enabled]);
    const tap = { date: D, period: 1, classId: C5A, substituteUserId: DEV };

    it('the migration switches Proxy Auto on for every school there is, and keeps a founder’s own choice', async () => {
      const sql = readFileSync(MIGRATION, 'utf8');
      const last = sql.slice(sql.lastIndexOf('insert into school_module_entitlements'));
      expect(last).toContain(`'proxy', true, 'plan'`);
      expect(sql.trimEnd().endsWith(last.trimEnd())).toBe(true);
      await db.pg.query(`delete from school_module_entitlements where module_id = 'proxy' and school_id = $1`, [C]);
      await db.pg.exec(last);
      expect(await count(`school_module_entitlements where module_id = 'proxy' and enabled and school_id in ($1, $2, $3)`, [A, B, C])).toBe(3);
      await db.pg.query(`update school_module_entitlements set enabled = false, source = 'founder_override' where school_id = $1 and module_id = 'proxy'`, [C]);
      await db.pg.exec(last);
      expect((await db.pg.query(`select enabled from school_module_entitlements where module_id = 'proxy' and school_id = $1`, [C])).rows[0].enabled).toBe(false);
    });

    it('the office and the coordinator are given the day; a teacher their own covers; an accountant nothing', async () => {
      await scene();
      await proxyModule(true);
      for (const who of [principal, admin, coordinator]) {
        const got = await get(who);
        expect(got.status, who.role).toBe(200);
        expect(got.body).toMatchObject({ arranger: true, today: D, tomorrow: addDays(D, 1), last: addDays(D, PROXY_AHEAD_DAYS), mayRecordLeave: who !== coordinator });
        expect(slots(got.body.day.periods)).toEqual(['1 5-A Asha', '1 6-A Gita', '2 5-B Asha', '4 6-A Asha']);
        expect(got.body.day.periods[0].suggestions.map((s: { name: string }) => s.name)).toEqual(['Dev', 'Chand', 'Falak', 'Hari']);
      }
      expect((await get(principal, `?date=${addDays(D, 1)}`)).body.day).toMatchObject({ date: addDays(D, 1), periods: [], away: [] });
      expect(await get(principal, '?date=2027-02-31')).toMatchObject({ status: 400, body: { code: 'not_sent_properly' } });
      expect(await get(accountant)).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
      // A teacher: their own covers and the days, and not a word about who is on leave or who is free.
      const mine = await get(dev, `?date=${D}`);
      expect(mine).toMatchObject({ status: 200, body: { arranger: false, today: D, tomorrow: addDays(D, 1) } });
      expect(Object.keys(mine.body).sort()).toEqual(['arranger', 'last', 'mine', 'released', 'today', 'tomorrow']);
      expect(mine.body.released).toEqual([]);
      // Dev's cover on another day of the week shows if that day is still ahead.
      expect(mine.body.mine.map((x: { on_date: string }) => x.on_date)).toEqual(SAME_WEEK > D ? [SAME_WEEK] : []);
      // One tap by the coordinator; the same tap again is answered plainly; then Dev sees it.
      expect(await post(dev, tap)).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
      expect(await post(accountant, tap)).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
      for (const bad of [{ ...tap, period: '1' }, { ...tap, classId: 'x' }, { ...tap, substituteUserId: null }, { ...tap, date: 20261116 }]) expect(await post(coordinator, bad)).toMatchObject({ status: 400, body: { code: 'not_sent_properly' } });
      expect(await post(coordinator, { ...tap, date: addDays(D, -1) })).toMatchObject({ status: 400, body: { code: 'date' } });
      const made = await post(coordinator, tap);
      expect(made.status).toBe(201);
      expect(await post(principal, { ...tap, substituteUserId: CHAND })).toMatchObject({ status: 409, body: { code: 'already_covered' } });
      expect(await post(admin, { ...tap, classId: C6A })).toMatchObject({ status: 409, body: { code: 'already_covering' } });
      expect(await post(visitingPrincipal, { ...tap, period: 2, classId: C5B })).toMatchObject({ status: 409, body: { code: 'elsewhere' } });
      // Dev is given the period, the class and the subject of the cover: not whose class it was, by name or by id.
      const devs = await get(dev);
      const todays = devs.body.mine.filter((x: { on_date: string }) => x.on_date === D);
      expect(todays).toEqual([{ substitution_id: made.body.substitutionId, on_date: D, period: 1, class_id: C5A, class_name: '5-A', subject_name: 'Maths' }]);
      expect(JSON.stringify(devs.body)).not.toMatch(new RegExp(`Asha|${ASHA}|absent|substitute|assigned_by`));
      expect((await get(bina)).body.mine).toEqual([]);
      // Undo: the three roles; a teacher may not; a made-up id is not found.
      const substitutionId = made.body.substitutionId as string;
      expect(await step(dev, substitutionId, { action: 'undo' })).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
      expect(await step(principal, substitutionId, { action: 'remove' })).toMatchObject({ status: 400, body: { code: 'not_sent_properly' } });
      expect(await step(principal, id(98), { action: 'undo' })).toMatchObject({ status: 404, body: { code: 'not_found' } });
      expect(await step(principal, 'not-an-id', { action: 'undo' })).toMatchObject({ status: 400 });
      expect(await step(admin, substitutionId, { action: 'undo' })).toMatchObject({ status: 200, body: { ok: true } });
      expect(await step(admin, substitutionId, { action: 'undo' })).toMatchObject({ status: 409, body: { code: 'undone' } });
      expect((await get(dev)).body.mine.filter((x: { on_date: string }) => x.on_date === D)).toEqual([]);
    });

    it('cancelling approved leave on Staff releases its covers and says how many; each teacher finds theirs under "Covers released"', async () => {
      await wipe();
      await proxyModule(true);
      const leaveStep = (who: Who, leaveId: string, body: unknown) => call(who, () => stepLeave(req('POST', `/api/app/staff/leave/${leaveId}`, body), { params: { leaveId } }));
      // Asha is away today and through the same weekday next week. Dev covers a period today, Falak one next
      // week, and a third cover was assigned and undone by a person before.
      const next = addDays(D, 7);
      const leave = await onLeaveFor(asha, D, next);
      const todays = await assigned(principal, 1, C5A, DEV);
      const later = await assign(principal, 1, C5A, FALAK, next);
      if (!later.ok) throw new Error(later.reason);
      const undone = await assigned(principal, 2, C5B, DEV);
      await as(principal, (c) => undoCover(c, actor(principal), undone));
      const cancelled = await leaveStep(admin, leave, { action: 'withdraw', note: 'She came in after all.' });
      expect(cancelled).toEqual({ status: 200, body: { ok: true, coversReleased: 2 } });
      // Both covers were undone by that tap, in the canceller's name; the one a person undid before keeps its own undo.
      expect(await count(`substitutions where status = 'assigned'`)).toBe(0);
      expect(await count(`substitutions where undone_reason = 'leave_cancelled' and undone_by = $1`, [ADMIN])).toBe(2);
      expect(await count(`substitutions where substitution_id = $1 and undone_reason is null and undone_by = $2`, [undone, PRINCIPAL])).toBe(1);
      // What the office reads under "Cancelled": how many were released, and that their teachers are told.
      expect(coversReleasedIn(cancelled.body)).toBe(2);
      expect([coversReleasedIn({ ok: true }), coversReleasedIn({ ok: true, coversReleased: 0 }), coversReleasedIn({ coversReleased: '2' }), coversReleasedIn(null)]).toEqual([0, 0, 0, 0]);
      expect(tCount('en', 'leave.office.coversReleased', 1)).toBe('1 cover assigned for those days was released, and its teacher is told on My Day.');
      expect(tCount('en', 'leave.office.coversReleased', 2)).toContain('2 covers assigned for those days were released');
      expect(tCount('hi', 'leave.office.coversReleased', 2)).toMatch(/2[^{}]*[ऀ-ॿ]/);
      expect(tCount('en', 'leave.my.coversReleased', 1)).toContain('was released');
      const office = readFileSync(path.join(__dirname, '../../src/components/staff/StaffLeaveOffice.tsx'), 'utf8');
      expect(office).toContain(`tCount('leave.office.coversReleased', released)`);
      expect(office).toContain('coversReleasedIn(answer)');
      expect(readFileSync(path.join(__dirname, '../../src/components/account/MyLeavePanel.tsx'), 'utf8')).toContain(`tCount('leave.my.coversReleased', released)`);
      // The teachers: Dev's cover today is gone from his covers and is under "Covers released"; Falak's next week's
      // likewise. Each is the day, the period, the class and the subject; nothing says whose leave or why.
      const devs = await get(dev);
      expect(devs.body.mine.filter((x: { on_date: string }) => x.on_date === D)).toEqual([]);
      expect(devs.body.released).toEqual([{ substitution_id: todays, on_date: D, period: 1, class_id: C5A, class_name: '5-A', subject_name: 'Maths' }]);
      expect(JSON.stringify(devs.body)).not.toMatch(new RegExp(`Asha|${ASHA}|absent|Unwell|sick|came in`));
      expect((await get(falak)).body.released.map((x: { on_date: string }) => x.on_date)).toEqual([next]);
      expect((await get(bina)).body.released).toEqual([]);
      // A cover of a day gone by is neither released nor counted.
      await wipe();
      const ran = await onLeaveFor(asha, addDays(D, -7), D);
      await seedCover(addDays(D, -7), 1, C5A, MATHS, ASHA, DEV);
      await assigned(principal, 1, C5A, DEV);
      expect((await leaveStep(principal, ran, { action: 'withdraw', note: 'Recorded for the wrong week.' })).body).toEqual({ ok: true, coversReleased: 1 });
      expect(await count(`substitutions where status = 'assigned' and on_date < $1::date`, [D])).toBe(1);
      // The person's own withdrawal releases the covers of their own periods, in their own session; a decision
      // carries no count.
      await wipe();
      const asked = await as(bina, (c) => askLeave(c, actor(bina), { fromDate: next, toDate: next, kind: 'casual', reason: 'A family function.' }));
      if (!asked.ok) throw new Error(asked.reason);
      expect(await leaveStep(principal, asked.leaveId, { action: 'approve' })).toEqual({ status: 200, body: { ok: true } });
      const forBina = await assign(coordinator, 3, C5A, DEV, next);
      expect(forBina).toMatchObject({ ok: true });
      expect(await leaveStep(bina, asked.leaveId, { action: 'withdraw' })).toEqual({ status: 200, body: { ok: true, coversReleased: 1 } });
      // With Proxy Auto switched off the covers are released all the same: no teacher keeps a class whose own
      // teacher is back.
      await wipe();
      const gitas = await onLeaveFor(gita);
      await assigned(admin, 1, C6A, FALAK);
      await proxyModule(false);
      try {
        expect(await leaveStep(admin, gitas, { action: 'withdraw', note: 'She came in after all.' })).toEqual({ status: 200, body: { ok: true, coversReleased: 1 } });
      } finally {
        await proxyModule(true);
      }
    });

    it('Proxy Auto switched off: nobody reads, assigns or undoes, and the page says so', async () => {
      await scene();
      const first = await assigned(principal, 1, C5A, DEV);
      await proxyModule(false);
      try {
        for (const who of [principal, coordinator, dev]) expect(await get(who), who.role).toMatchObject({ status: 403, body: { code: 'module_off' } });
        expect(await post(principal, { ...tap, period: 2, classId: C5B })).toMatchObject({ status: 403, body: { code: 'module_off' } });
        expect(await step(principal, first, { action: 'undo' })).toMatchObject({ status: 403, body: { code: 'module_off' } });
        expect((await row(first)).status).toBe('assigned');
        state.claims = claims(principal);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const off: any = await ProxyPage({});
        expect(off.type).toBe(ModuleOffPage);
        expect(off.props).toMatchObject({ moduleId: 'proxy', reason: 'module_off' });
      } finally {
        await proxyModule(true);
      }
    });

    it('the page: the three roles arrange, a teacher sees their covers with a tour of their own, an accountant has no part', async () => {
      await proxyModule(true);
      for (const who of [principal, admin, coordinator]) {
        state.claims = claims(who);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const page: any = await ProxyPage({});
        expect(page.type, who.role).toBe(ModulePage);
        expect(page.props).toMatchObject({ moduleId: 'proxy', help: 'cover-a-class', tour: 'proxy', title: 'Proxy Auto', purpose: t('en', 'px.page.purpose.arranger') });
        expect(page.props.children.type).toBe(ProxyView);
      }
      state.claims = claims(dev);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mine: any = await ProxyPage({});
      expect(mine.props).toMatchObject({ moduleId: 'proxy', help: 'cover-a-class', tour: 'proxy-covers', purpose: t('en', 'px.page.purpose.teacher') });
      state.claims = claims(accountant);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const none: any = await ProxyPage({});
      expect(none.type).toBe(ModuleComingPage);
    });

    it('Timetable shows a teacher their covers for today only when the school has Proxy Auto on, and asks nothing for anyone else', async () => {
      const covers = async (who: Who) => {
        state.claims = claims(who);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const page: any = await TimetablePage();
        expect(page.props.children.type, who.role).toBe(TimetableView);
        return page.props.children.props.covers as boolean;
      };
      await proxyModule(true);
      expect(await covers(dev)).toBe(true);
      for (const who of [principal, admin, coordinator]) expect(await covers(who), who.role).toBe(false);
      await proxyModule(false);
      try {
        expect(await covers(dev)).toBe(false);
      } finally {
        await proxyModule(true);
      }
      // The view asks Proxy Auto only then, and only reads.
      const view = readFileSync(path.join(__dirname, '../../src/components/timetable/TimetableView.tsx'), 'utf8');
      expect(view).toContain(`if (!mine || !showCovers) return;`);
      expect(view.match(/\/api\/app\/proxy/g)).toHaveLength(1);
      expect(view).not.toMatch(/api\/app\/proxy[^']*'[^)]*method/);
    });

    it('the arranging screen as it is drawn: each name with its reason and its own button, and an empty day that teaches', async () => {
      await scene();
      const first = await assigned(principal, 1, C5A, DEV);
      const day = await dayFor(principal);
      const data = { arranger: true as const, today: D, tomorrow: addDays(D, 1), last: addDays(D, PROXY_AHEAD_DAYS), mayRecordLeave: true, day };
      const nothing = () => undefined;
      const draw = (lang: 'en' | 'hi', given: typeof data) => renderToStaticMarkup(h(LangProvider, { lang, children: h(ProxyArranger, { data: given, busy: false, note: null, onPick: nothing, onAssign: nothing, onUndo: nothing }) }));
      const html = draw('en', data);
      // The covered period: who covers, who assigned, and its Undo. The others: a button a name, nothing pressed.
      expect(html).toContain('Dev covers this period. Assigned by Priya Principal');
      expect(html.match(/data-proxy-undo/g)).toHaveLength(1);
      expect(html.match(/data-covered="yes"/g)).toHaveLength(1);
      expect(html.match(/data-covered="no"/g)).toHaveLength(3);
      // Three names a period at first, each with "Assign"; the rest behind "Show more".
      expect(html.match(/data-proxy-assign/g)).toHaveLength(9);
      expect(html.match(/data-proxy-suggestion/g)).toHaveLength(9);
      expect(html).toContain('Show 1 more free teacher');
      expect(html).toContain('Show 2 more free teachers');
      // The reason beside a name is that period's own facts.
      expect(html).toContain('Free this period · Teaches Maths · 1 period that day · 2 covers that week');
      expect(html).toContain('Free this period · No period that day · No cover that week');
      expect(html).toContain('In place of Asha, who is on leave');
      expect(html).toContain('On leave: Asha, Gita');
      expect(html).toContain('Nothing is assigned until you press “Assign”');
      expect(html).not.toMatch(/undefined|NaN|\{\w+\}|px\./);
      // Every button is a full-height tap target.
      for (const button of html.match(/<button[^>]*>/g) ?? []) expect(button).toContain('min-h-[44px]');
      // Hindi: the same screen, in Hindi.
      const hindi = draw('hi', data);
      expect(hindi).toMatch(/[ऀ-ॿ]/);
      expect(hindi).not.toMatch(/Assign<|Undo<|Needs cover|Free teachers|\{\w+\}|px\./);
      expect(hindi.match(/data-proxy-assign/g)).toHaveLength(9);
      // Nobody on leave: where leave is recorded, and for the office a way there. The coordinator is told who records it.
      await as(principal, (c) => undoCover(c, actor(principal), first));
      await wipe();
      const empty = { ...data, day: await dayFor(principal) };
      const office = draw('en', empty);
      expect(office).toContain('data-proxy-empty="nobody"');
      for (const words of ['No teacher is on leave on', '“My account”', '“Staff”', '“Record leave for a member of staff”', 'Open Staff', 'href="/app/staff"']) expect(office, words).toContain(words);
      expect(office).not.toContain('data-proxy-assign');
      const forCoordinator = draw('en', { ...empty, mayRecordLeave: false });
      expect(forCoordinator).toContain('The principal or the school admin approves it on “Staff”');
      expect(forCoordinator).not.toContain('href="/app/staff"');
      // The label the guide and the empty state quote is the Staff screen's own.
      expect(t('en', 'leave.office.record')).toBe('Record leave for a member of staff');
      // A day gone by, or one too far ahead, says only that: never that nobody was on leave, and never that the
      // day is shown (the server gives nothing for it, to anyone).
      const gone = await dayFor(principal, addDays(D, -1));
      expect(gone).toMatchObject({ open: false, periods: [], away: [], noLongerNeeded: [] });
      const closedDay = { ...empty, day: gone };
      expect(draw('en', closedDay)).toContain('Days gone by are not shown here. Choose today or a day ahead.');
      expect(draw('en', closedDay)).not.toMatch(/data-proxy-empty|No teacher is on leave|shown as it was|data-proxy-period/);
      expect(draw('hi', closedDay)).not.toMatch(/Days gone by|px\./);
      expect(draw('en', { ...closedDay, day: { ...closedDay.day, date: addDays(D, PROXY_AHEAD_DAYS + 5) } })).toContain(`up to ${PROXY_AHEAD_DAYS} days ahead`);
      // A holiday, and a teacher on leave who has no period that day.
      expect(draw('en', { ...empty, day: { ...empty.day, dayOff: { kind: 'holiday', name: 'Founders’ Day' } } })).toContain('Founders’ Day. There is nothing to cover.');
      expect(draw('en', { ...empty, day: { ...empty.day, away: [{ user_id: HARI, name: 'Hari' }] } })).toContain('data-proxy-empty="no-periods"');
      // No teacher free: the screen says what to do next, and offers no button.
      const stuck = { ...data, day: { ...day, periods: day.periods.map((p) => ({ ...p, cover: null, suggestions: [] })) } };
      expect(draw('en', stuck)).toContain('No teacher is free in this period');
      expect(draw('en', stuck)).not.toContain('data-proxy-assign');
    });

    it('a teacher’s screen: today, tomorrow and the days after, and what a cover does not give', async () => {
      await wipe();
      const base = { arranger: false as const, today: D, tomorrow: addDays(D, 1), last: addDays(D, PROXY_AHEAD_DAYS) };
      const cover = (on_date: string, period: number) => ({ substitution_id: `${on_date}-${period}`, on_date, period, class_id: C5A, class_name: '5-A', subject_name: 'Maths' });
      const draw = (lang: 'en' | 'hi', mine: ReturnType<typeof cover>[], released: ReturnType<typeof cover>[] = []) => renderToStaticMarkup(h(LangProvider, { lang, children: h(ProxyMine, { data: { ...base, mine, released } }) }));
      const none = draw('en', []);
      expect(none).toContain('You have no cover today. Your own periods are on “Timetable”.');
      expect(none).toContain('Nothing for tomorrow yet');
      expect(none).not.toContain('The days after');
      // Covers released because the leave behind them was cancelled (C210): listed under their own heading, each
      // with its day, and never whose leave it was or why. Nothing at all when there is none.
      expect(none).not.toContain('data-proxy-released');
      const released = draw('en', [], [cover(D, 3), cover(addDays(D, 2), 1)]);
      expect(released.match(/data-proxy-released-row="/g)).toHaveLength(2);
      expect(released).toContain('Covers released');
      expect(released).toContain('Period 3 · 5-A · Maths: released');
      expect(released).toContain('The teacher you were to cover is back');
      expect(released).not.toMatch(/Asha|sick|casual|<button|\{\w+\}|px\./);
      expect(draw('hi', [], [cover(D, 3)])).toContain('हटाई गई');
      const some = draw('en', [cover(D, 2), cover(addDays(D, 1), 1), cover(addDays(D, 3), 4)]);
      expect(some.match(/data-proxy-mine="/g)).toHaveLength(3);
      expect(some).toContain('Period 2 · 5-A · Maths');
      // The class and the subject, and not whose class it was.
      expect(some).not.toMatch(/In place of|Asha/);
      expect(t('en', 'px.tt.line', { period: 2, class: '5-A', subject: 'Maths' })).toBe('Period 2 · 5-A · Maths');
      for (const lang of ['en', 'hi'] as const) expect(t(lang, 'px.tt.line'), lang).not.toContain('{name}');
      expect(readFileSync(path.join(__dirname, '../../src/components/timetable/TimetableView.tsx'), 'utf8')).not.toMatch(/absent_name|absent_user_id/);
      expect(some).toContain('The days after');
      expect(some).toContain('stay with the class’s own teacher and the office');
      expect(some).not.toMatch(/<button|undefined|\{\w+\}|px\./);
      expect(draw('hi', [cover(D, 2)])).toMatch(/[ऀ-ॿ]/);
    });
  });
});
