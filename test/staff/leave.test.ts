import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { Children, createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { helpArticle } from '@/content/help/articles';
import { moduleById } from '@/lib/contracts/modules';
import { planById, DEFAULT_PLAN_ID } from '@/lib/frameworks/plans';
import { readModuleFor, writeModuleFor } from '@/lib/frameworks/write-guard';
import { t } from '@/lib/i18n';
import { addDays, askLeave, decideLeave, isLeaveDate, leaveByToday, leaveCalendar, leaveStaff, leaveWaiting, myLeave, officeAlone, onLeave, recordLeave, withdrawLeave, LEAVE_BACK_DAYS, LEAVE_KINDS, LEAVE_LIST_MAX, LEAVE_MAX_DAYS } from '@/lib/staff/leave';
import { indiaDate } from '@/lib/time/india';
import { TODAY_PROVIDERS } from '@/lib/today/cards';

// Staff leave (docs/26 slice 8b, C201). The acceptance test: "A request is decided by the principal or school
// admin, never by the person who asked. Only that person and the office can read it (row level security). A day
// is "on leave" only while a request covering it is approved." Proven on the whole schema as the app's own
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

import { GET as listLeave, POST as postLeave } from '@/app/api/app/staff/leave/route';
import { POST as stepLeave } from '@/app/api/app/staff/leave/[leaveId]/route';
import AccountPage from '@/app/(school)/app/account/page';
import StaffPage from '@/app/(school)/app/staff/page';
import { MyLeavePanel } from '@/components/account/MyLeavePanel';
import { StaffAccounts } from '@/components/account/StaffAccounts';
import { StaffInvitations } from '@/components/account/StaffInvitations';
import { ModuleComingPage } from '@/components/app-shell/ModuleComingPage';
import { LangProvider } from '@/components/app-shell/LangContext';
import { LeaveSummary, myLeaveHow, ownRequestLine } from '@/components/staff/leave-parts';
import { StaffLeaveOffice } from '@/components/staff/StaffLeaveOffice';
import type { LeaveRow } from '@/lib/staff/leave-rules';

const A = 'ce000000-0000-4000-8000-000000000001';
const B = 'ce000000-0000-4000-8000-000000000002';
const C = 'ce000000-0000-4000-8000-000000000003';
const u = (n: number) => `ce000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, TARA, TARUN, ACCOUNTANT, COORDINATOR, LEFT, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(15), u(16), u(17), u(21)];
// Two accounts made at school C that also sign in to school A through a membership there (an approved
// application attaches an account that already exists; its home school stays as it was).
const [VISITING_TEACHER, VISITING_PRINCIPAL] = [u(31), u(32)];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const tara: Who = { role: 'teacher', user: TARA };
const tarun: Who = { role: 'teacher', user: TARUN };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR };
const elsewhere: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
const visitingTeacher: Who = { role: 'teacher', user: VISITING_TEACHER };
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
type Count = { rows: { n: number }[]; rowCount: number };
const sees = async (who: Who, where = 'true') => (await as<Count>(who, (c) => c.query(`select count(*)::int as n from staff_leave where ${where}`))).rows[0].n;
// The row as it is, read by the owner of the database (no role, no policy).
const row = async (id: string) => (await db.pg.query(`select status, user_id, recorded_by, decided_by, decision_note, withdrawn_by, withdrawn_note from staff_leave where leave_id = $1`, [id])).rows[0];
const away = async (who: Who, date: string) => (await as(who, (c) => onLeave(c, A, date))).map((p) => p.name);
// India's day, and days counted from it: the database's own rule uses the same day.
const today = indiaDate();
const day = (n: number) => addDays(today, n);
const wants = (from: number, to: number, more: Partial<{ kind: string; reason: string }> = {}) => ({ fromDate: day(from), toDate: day(to), kind: 'casual', reason: 'A family function in another town.', ...more });
const ask = async (who: Who, from: number, to: number, more: Partial<{ kind: string; reason: string }> = {}) => {
  const r = await as(who, (c) => askLeave(c, actor(who), wants(from, to, more)));
  if (!r.ok) throw new Error(r.reason);
  return r.leaveId;
};
const wipe = () => db.pg.exec(`set session_replication_role = replica; delete from staff_leave; delete from audit_log where event_action like 'leave.%'; set session_replication_role = origin;`);

describe('the day and the words', () => {
  it('a leave day is a real day of the calendar', () => {
    expect(isLeaveDate('2026-11-16')).toBe(true);
    for (const bad of ['2026-02-31', '2026-13-01', '16-11-2026', '2026-11-16T00:00:00Z', '', null, 20261116]) expect(isLeaveDate(bad), String(bad)).toBe(false);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('Staff is partly live, in the standard plan, and says what goes when it is switched off', () => {
    expect(moduleById('staff')).toMatchObject({ status: 'partial', phase: 'P5' });
    expect(moduleById('staff').phaseNote).toContain('leave');
    expect(planById(DEFAULT_PLAN_ID)!.modules).toContain('staff');
    for (const lang of ['en', 'hi'] as const) expect(t(lang, 'moduleOff.staff').length, lang).toBeLessThanOrEqual(200);
    expect(t('en', 'moduleOff.staff')).toContain('leave');
    expect(t('hi', 'moduleOff.staff')).toMatch(/[ऀ-ॿ]/);
  });

  it('leave routes belong to Staff; inviting colleagues stays the account’s own', () => {
    const id = '9b2e7c1a-5d43-4f0e-8a6b-1c2d3e4f5a6b';
    expect(writeModuleFor('/api/app/staff/leave')).toBe('staff');
    expect(writeModuleFor(`/api/app/staff/leave/${id}`)).toBe('staff');
    expect(readModuleFor('/api/app/staff/leave')).toBe('staff');
    expect(writeModuleFor('/api/app/staff/invitations')).toBe('any-module');
    expect(writeModuleFor(`/api/app/staff/invitations/${id}/resend`)).toBe('any-module');
    expect(readModuleFor('/api/app/staff/invitations')).toBe('any-module');
  });

  it('leave is for running the day: it is never counted by person or put in an order of people, and nothing that judges staff reads it', () => {
    const src = path.join(__dirname, '../../src');
    const files = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? files(path.join(dir, n)) : [path.join(dir, n)])) : []);
    // Teacher Copilot, the AI door, recognition and the Teacher Impact screens.
    const judging = [...files(path.join(src, 'lib/copilot')), ...files(path.join(src, 'lib/ai')), path.join(src, 'lib/recognition.ts'), ...files(src).filter((f) => /impact/i.test(f))];
    expect(judging.length).toBeGreaterThan(3);
    for (const f of judging) expect(readFileSync(f, 'utf8'), path.relative(src, f)).not.toMatch(/staff_leave|staff\/leave/);
    // The leave code itself: no totals by person, and every list is in the order of days, of asking, or of names.
    const lib = readFileSync(path.join(src, 'lib/staff/leave.ts'), 'utf8');
    expect(lib).not.toMatch(/group by|count\(|sum\(|rank\(/i);
    const orders = [...lib.matchAll(/order by ([^`]+?)(?: limit|`)/g)].map((m) => m[1].trim());
    expect(orders).toEqual(['l.from_date desc, l.asked_at desc', 'l.asked_at, l.leave_id', 'l.from_date, u.display_name, l.leave_id', 'u.display_name, u.user_id', 'display_name, user_id']);
    // My Day's card counts the requests waiting in the whole school, not anyone's leave.
    const card = readFileSync(path.join(src, 'lib/today/cards.ts'), 'utf8');
    expect(card.match(/from staff_leave[^`]*`/g)).toEqual(["from staff_leave where school_id = $1 and status = 'waiting' and user_id <> $2`"]);
  });

  it('leave has its guide, for everyone, and both screens link to it', () => {
    const guide = helpArticle('staff-leave');
    expect(guide).toMatchObject({ audience: 'everyone', start: { href: '/app/account' } });
    const parts = readFileSync(path.join(__dirname, '../../src/components/staff/leave-parts.tsx'), 'utf8');
    expect(parts).toContain('/app/help/staff-leave');
    for (const screen of ['components/account/MyLeavePanel.tsx', 'components/staff/StaffLeaveOffice.tsx']) expect(readFileSync(path.join(__dirname, '../../src', screen), 'utf8'), screen).toContain('<LeaveGuideLink />');
  });

  it('a request is drawn with its answer: who decided and when, the note, and a cancellation by the office', () => {
    const base: LeaveRow = {
      leave_id: 'l', user_id: 'u', name: 'Tara Teacher', role: 'teacher', from_date: '2026-11-16', to_date: '2026-11-17', days: 2, kind: 'sick', reason: 'A small operation.', status: 'waiting',
      asked_at: '2026-11-10T04:00:00.000Z', byOffice: false, recorded_by: 'Tara Teacher', decided_by: null, decided_at: null, decision_note: null, withdrawn_at: null, withdrawnByOffice: false, withdrawn_note: null,
      mine: true, mayDecide: false, mayWithdraw: true, mayCancel: false,
    };
    const draw = (r: LeaveRow, lang: 'en' | 'hi' = 'en', showName = false) => renderToStaticMarkup(h(LangProvider, { lang, children: h(LeaveSummary, { r, showName }) }));
    const waiting = draw(base);
    expect(waiting).toContain('Waiting for the principal or the school admin to decide.');
    expect(waiting).toContain('2 days · Sick');
    expect(waiting).toMatch(/16 Nov(ember)?,? 2026 to .*17 Nov/);
    expect(waiting).not.toContain('Tara Teacher'); // "My leave" does not name its own person
    expect(draw(base, 'en', true)).toContain('Tara Teacher');
    const refused = draw({ ...base, status: 'refused', decided_by: 'Asif Admin', decided_at: '2026-11-11T05:00:00.000Z', decision_note: 'Exams that week.' });
    expect(refused).toContain('Refused by Asif Admin on 11 Nov.');
    expect(refused).toContain('Note: Exams that week.');
    expect(refused).not.toContain('Waiting for');
    const approved = draw({ ...base, status: 'approved', decided_by: 'Priya Principal', decided_at: '2026-11-11T05:00:00.000Z' });
    expect(approved).toContain('Approved by Priya Principal on 11 Nov.');
    const phoned = draw({ ...base, status: 'approved', byOffice: true, recorded_by: 'Asif Admin', decided_by: 'Asif Admin', decided_at: '2026-11-16T03:00:00.000Z' });
    expect(phoned).toContain('Recorded by Asif Admin in the office, and approved at once.');
    const cancelled = draw({ ...base, status: 'withdrawn', decided_by: 'Priya Principal', decided_at: '2026-11-11T05:00:00.000Z', withdrawn_at: '2026-11-16T05:00:00.000Z', withdrawnByOffice: true, withdrawn_note: 'She came in after all.' });
    expect(cancelled).toContain('Cancelled by the office on 16 Nov. Note: She came in after all.');
    expect(draw({ ...base, status: 'withdrawn', withdrawn_at: '2026-11-12T05:00:00.000Z' })).toContain('Withdrawn on 12 Nov.');
    // One day is said as one day, and Hindi is Hindi.
    expect(draw({ ...base, to_date: '2026-11-16', days: 1 })).toContain('1 day · Sick');
    const hindi = draw({ ...base, status: 'refused', decided_by: 'Asif Admin', decided_at: '2026-11-11T05:00:00.000Z', decision_note: 'Exams that week.' }, 'hi');
    expect(hindi).toContain('नामंज़ूर');
    expect(hindi).toContain('Asif Admin ने');
    expect(hindi).toContain('टिप्पणी: Exams that week.');
  });

  it('approved leave is read as what is running or ahead and what has ended, in the order it came', () => {
    const rows = [{ id: 'ended', to_date: '2026-11-14' }, { id: 'ends today', to_date: '2026-11-15' }, { id: 'ahead', to_date: '2027-03-01' }];
    expect(leaveByToday(rows, '2026-11-15')).toEqual({ ahead: [rows[1], rows[2]], ended: [rows[0]] });
    expect(leaveByToday([], '2026-11-15')).toEqual({ ahead: [], ended: [] });
  });

  it('the only person in a school’s office is told that nobody can decide their own request yet, in both languages', () => {
    expect(myLeaveHow({ office: false, alone: false })).toBe('leave.my.how');
    expect(myLeaveHow({ office: true, alone: false })).toBe('leave.my.howOffice');
    expect(myLeaveHow({ office: true, alone: true })).toBe('leave.my.howAlone');
    expect(ownRequestLine(false)).toBe('leave.office.own');
    expect(ownRequestLine(true)).toBe('leave.office.ownAlone');
    for (const key of ['leave.my.howAlone', 'leave.office.ownAlone'] as const) {
      // It says why (nobody decides their own), that it waits, and what changes it: a school admin, invited on Staff.
      expect(t('en', key), key).toMatch(/Nobody decides their own/);
      expect(t('en', key), key).toMatch(/waits/);
      expect(t('en', key), key).toMatch(/school admin with “Invite staff”/);
      expect(t('en', key), key).not.toMatch(/other person in the office/);
      expect(t('hi', key), key).toMatch(/[ऀ-ॿ]/);
      expect(t('hi', key), key).toContain('“Invite staff”');
    }
    // The label the words point at is on the Staff screen, word for word.
    expect(readFileSync(path.join(__dirname, '../../src/components/account/StaffInvitations.tsx'), 'utf8')).toContain('>Invite staff<');
  });

  it('every kind and every refusal the screens can show has its words in both languages', () => {
    const keys = [
      ...LEAVE_KINDS.map((k) => `leave.kind.${k}`),
      ...['waiting', 'approved', 'refused', 'withdrawn'].map((s) => `leave.status.${s}`),
      ...['dates', 'past', 'too_far', 'too_long', 'kind', 'reason', 'overlap', 'person', 'elsewhere', 'own', 'decided', 'note', 'begun', 'not_approved', 'closed', 'other'].map((e) => `leave.err.${e}`),
    ];
    for (const key of keys) {
      expect(t('en', key as never), key).not.toBe(undefined);
      expect(t('hi', key as never), key).toMatch(/[ऀ-ॿ]/);
    }
  });
});

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL'), ('${C}', 'School C', 'IN-UP');
      insert into users (user_id, school_id, email, role, display_name, is_active) values
        ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'admin@school-a.example', 'school_admin', 'Asif Admin', true),
        ('${TARA}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Teacher', true), ('${TARUN}', '${A}', 'tarun@school-a.example', 'teacher', 'Tarun Teacher', true),
        ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant', true), ('${COORDINATOR}', '${A}', 'coordinator@school-a.example', 'academic_coordinator', 'Chitra Coordinator', true),
        ('${LEFT}', '${A}', 'left@school-a.example', 'teacher', 'Lata Left', false), ('${B_PRINCIPAL}', '${B}', 'principal@school-b.example', 'principal', 'Bela Principal', true),
        ('${VISITING_TEACHER}', '${C}', 'vani@school-c.example', 'teacher', 'Vani Visiting', true), ('${VISITING_PRINCIPAL}', '${C}', 'parul@school-c.example', 'principal', 'Parul Visiting', true);
      insert into memberships (user_id, school_id, role, is_active) values ('${VISITING_TEACHER}', '${A}', 'teacher', true), ('${VISITING_PRINCIPAL}', '${A}', 'principal', true) on conflict (user_id, school_id) do nothing;
    `);
    state.tenant = (claims: { role: string; sub: string; schoolId: string }, fn: (c: unknown) => Promise<unknown>) => as({ role: claims.role, user: claims.sub, school: claims.schoolId }, fn);
  }, 120_000);
  afterAll(async () => db?.stop());

  describe('asking', () => {
    it('anyone on the staff asks for their own leave, and it waits; what is asked is checked', async () => {
      await wipe();
      for (const who of [tara, accountant, coordinator, admin, principal]) expect(await as(who, (c) => askLeave(c, actor(who), wants(20, 21))), who.role).toMatchObject({ ok: true });
      expect((await db.pg.query(`select count(*)::int as n from staff_leave where status = 'waiting' and recorded_by = user_id and decided_by is null`)).rows[0].n).toBe(5);
      const bad = async (input: Parameters<typeof askLeave>[2]) => as(tarun, (c) => askLeave(c, actor(tarun), input));
      expect(await bad(wants(3, 2))).toEqual({ ok: false, reason: 'dates' });
      expect(await bad({ ...wants(3, 3), fromDate: '2027-02-31' })).toEqual({ ok: false, reason: 'dates' });
      expect(await bad(wants(-1, 2))).toEqual({ ok: false, reason: 'past' });
      expect(await bad(wants(400, 401))).toEqual({ ok: false, reason: 'too_far' });
      expect(await bad(wants(3, 3 + LEAVE_MAX_DAYS))).toEqual({ ok: false, reason: 'too_long' });
      expect(await bad(wants(3, 3, { kind: 'holiday' }))).toEqual({ ok: false, reason: 'kind' });
      expect(await bad(wants(3, 3, { reason: '   ' }))).toEqual({ ok: false, reason: 'reason' });
      expect(await bad(wants(3, 3, { reason: 'x'.repeat(301) }))).toEqual({ ok: false, reason: 'reason' });
      expect(await bad(wants(3, 2 + LEAVE_MAX_DAYS))).toMatchObject({ ok: true }); // sixty days, the longest
      expect(await sees(tarun)).toBe(1);
    });

    it('two requests of one person never overlap while waiting or approved: not through the app, and not in the database', async () => {
      await wipe();
      const first = await ask(tara, 10, 12);
      for (const [from, to] of [[12, 14], [8, 10], [11, 11], [9, 13]]) expect(await as(tara, (c) => askLeave(c, actor(tara), wants(from, to))), `${from}-${to}`).toEqual({ ok: false, reason: 'overlap' });
      expect(await as(tara, (c) => askLeave(c, actor(tara), wants(13, 14)))).toMatchObject({ ok: true }); // the day after is free
      expect(await as(tarun, (c) => askLeave(c, actor(tarun), wants(10, 12)))).toMatchObject({ ok: true }); // someone else, the same days
      await expect(as(tara, (c) => c.query(`insert into staff_leave (school_id, user_id, from_date, to_date, kind, reason, recorded_by) values ($1, $2, $3, $4, 'sick', 'Fever.', $2)`, [A, TARA, day(12), day(12)]))).rejects.toThrow(/already has leave waiting or approved/);
      // Refused or withdrawn, its days are free again.
      expect(await as(principal, (c) => decideLeave(c, actor(principal), first, 'refuse', 'Exams that week.'))).toEqual({ ok: true });
      expect(await as(tara, (c) => askLeave(c, actor(tara), wants(10, 12)))).toMatchObject({ ok: true });
    });

    it('the database refuses a longer span, a last day before the first, an unknown kind and an empty reason', async () => {
      const put = (cols: string) => as(tara, (c) => c.query(`insert into staff_leave (school_id, user_id, recorded_by, ${cols.split('|')[0]}) values ('${A}', '${TARA}', '${TARA}', ${cols.split('|')[1]})`));
      await expect(put(`from_date, to_date, kind, reason|'${day(100)}', '${day(160)}', 'casual', 'x'`)).rejects.toThrow(/staff_leave_dates/);
      await expect(put(`from_date, to_date, kind, reason|'${day(100)}', '${day(99)}', 'casual', 'x'`)).rejects.toThrow(/staff_leave_dates/);
      await expect(put(`from_date, to_date, kind, reason|'${day(100)}', '${day(100)}', 'holiday', 'x'`)).rejects.toThrow(/check constraint/);
      await expect(put(`from_date, to_date, kind, reason|'${day(100)}', '${day(100)}', 'casual', '  '`)).rejects.toThrow(/check constraint/);
    });
  });

  describe('a request is decided by the principal or school admin, never by the person who asked', () => {
    it('the office approves or refuses; a teacher, an accountant and a coordinator cannot', async () => {
      await wipe();
      const one = await ask(tara, 5, 6);
      const two = await ask(tarun, 5, 5, { kind: 'sick', reason: 'A doctor’s appointment.' });
      for (const who of [tara, tarun, accountant, coordinator]) {
        expect(await as(who, (c) => decideLeave(c, actor(who), one, 'approve', '')), who.role).toEqual({ ok: false, reason: 'not_allowed' });
      }
      expect(await as(principal, (c) => decideLeave(c, actor(principal), one, 'approve', ''))).toEqual({ ok: true });
      expect(await row(one)).toMatchObject({ status: 'approved', decided_by: PRINCIPAL, decision_note: null });
      expect(await as(admin, (c) => decideLeave(c, actor(admin), two, 'refuse', '   '))).toEqual({ ok: false, reason: 'note' }); // refusing needs words
      expect(await as(admin, (c) => decideLeave(c, actor(admin), two, 'refuse', 'Two\nteachers are already away that day.'))).toEqual({ ok: true });
      expect(await row(two)).toMatchObject({ status: 'refused', decided_by: ADMIN, decision_note: 'Two teachers are already away that day.' });
      // Once decided, it is decided.
      expect(await as(admin, (c) => decideLeave(c, actor(admin), one, 'refuse', 'Changed my mind.'))).toEqual({ ok: false, reason: 'decided' });
      expect(await as(principal, (c) => decideLeave(c, actor(principal), two, 'approve', ''))).toEqual({ ok: false, reason: 'decided' });
      expect(await as(principal, (c) => decideLeave(c, actor(principal), u(99), 'approve', ''))).toEqual({ ok: false, reason: 'not_found' });
      // What the person reads.
      const [mine] = await as(tarun, (c) => myLeave(c, actor(tarun)));
      expect(mine).toMatchObject({ status: 'refused', decided_by: 'Asif Admin', decision_note: 'Two teachers are already away that day.', days: 1, kind: 'sick', mine: true, mayWithdraw: false, mayDecide: false });
      // Each decision is in the audit log, without the kind or the reason.
      const audit = (await db.pg.query(`select event_action, actor_user_id, after_state from audit_log where event_action like 'leave.%' order by occurred_at, audit_id`)).rows;
      expect(audit.map((a: { event_action: string }) => a.event_action)).toEqual(['leave.asked', 'leave.asked', 'leave.approved', 'leave.refused']);
      expect(audit[2]).toMatchObject({ actor_user_id: PRINCIPAL, after_state: { userId: TARA, status: 'approved' } });
      expect(JSON.stringify(audit)).not.toMatch(/doctor|family function|sick|casual/);
    });

    it('nobody decides their own: the principal’s is the school admin’s to decide, and the other way round', async () => {
      await wipe();
      const hers = await ask(principal, 7, 8);
      const his = await ask(admin, 7, 7);
      expect(await as(principal, (c) => decideLeave(c, actor(principal), hers, 'approve', ''))).toEqual({ ok: false, reason: 'own' });
      expect(await as(admin, (c) => decideLeave(c, actor(admin), his, 'approve', ''))).toEqual({ ok: false, reason: 'own' });
      expect(await as(principal, (c) => decideLeave(c, actor(principal), hers, 'refuse', 'No.'))).toEqual({ ok: false, reason: 'own' });
      expect((await row(hers)).status).toBe('waiting');
      const waiting = await as(principal, (c) => leaveWaiting(c, actor(principal)));
      expect(waiting.map((w) => [w.name, w.mine, w.mayDecide])).toEqual([['Priya Principal', true, false], ['Asif Admin', false, true]]);
      expect(await as(admin, (c) => decideLeave(c, actor(admin), hers, 'approve', ''))).toEqual({ ok: true });
      expect(await as(principal, (c) => decideLeave(c, actor(principal), his, 'approve', 'Enjoy the day.'))).toEqual({ ok: true });
      expect(await row(hers)).toMatchObject({ status: 'approved', decided_by: ADMIN });
      expect(await row(his)).toMatchObject({ status: 'approved', decided_by: PRINCIPAL, decision_note: 'Enjoy the day.' });
    });

    it('the database holds it: no decision on one’s own request, none in another’s name, none from outside the office', async () => {
      await wipe();
      const hers = await ask(tara, 5, 6);
      const his = await ask(admin, 9, 9);
      const approve = (who: Who, id: string, by: string) => as<{ affectedRows?: number }>(who, (c) => c.query(`update staff_leave set status = 'approved', decided_by = $2, decided_at = now() where leave_id = $1`, [id, by]));
      // A teacher on her own request: the policy refuses her, in her own name or in the principal's.
      await expect(approve(tara, hers, TARA)).rejects.toThrow(/row-level security/);
      await expect(approve(tara, hers, PRINCIPAL)).rejects.toThrow(/row-level security/);
      // The school admin on his own request: in his own name the check refuses, in the principal's the policy.
      await expect(approve(admin, his, ADMIN)).rejects.toThrow(/staff_leave_not_own_decision/);
      await expect(approve(admin, his, PRINCIPAL)).rejects.toThrow(/row-level security/);
      // The check holds whoever writes: as the owner of the database, with no policy in the way.
      await expect(db.pg.query(`update staff_leave set status = 'approved', decided_by = user_id, decided_at = now() where leave_id = $1`, [hers])).rejects.toThrow(/staff_leave_not_own_decision/);
      // The office, on someone else's, but in another person's name.
      await expect(approve(admin, hers, PRINCIPAL)).rejects.toThrow(/row-level security/);
      // Anyone else does not even see the row, so changes nothing.
      for (const who of [tarun, accountant, coordinator, elsewhere]) expect((await approve(who, hers, who.user)).affectedRows ?? 0, who.role).toBe(0);
      // Asking for someone else, or asking with the answer already filled in.
      const put = (who: Who, forUser: string, status: string, decidedBy: string | null) => as(who, (c) => c.query(`insert into staff_leave (school_id, user_id, from_date, to_date, kind, reason, status, recorded_by, decided_by, decided_at) values ($1, $2, $3, $3, 'casual', 'x', $4, $5, $6, case when $6::uuid is not null then now() end)`, [A, forUser, day(40), status, who.user, decidedBy]));
      await expect(put(tara, TARUN, 'waiting', null)).rejects.toThrow(/row-level security/);
      await expect(put(tara, TARA, 'approved', PRINCIPAL)).rejects.toThrow(/row-level security/);
      await expect(put(tara, TARA, 'approved', TARA)).rejects.toThrow(/staff_leave_not_own_decision|row-level security/);
      await expect(put(coordinator, TARA, 'approved', COORDINATOR)).rejects.toThrow(/row-level security/);
      await expect(put(admin, ADMIN, 'approved', PRINCIPAL)).rejects.toThrow(/row-level security/);
      await expect(as(tara, (c) => c.query(`insert into staff_leave (school_id, user_id, from_date, to_date, kind, reason, recorded_by) values ($1, $2, $3, $3, 'casual', 'x', $4)`, [A, TARA, day(40), PRINCIPAL]))).rejects.toThrow(/row-level security/);
      // Refusing without a note.
      await expect(as(principal, (c) => c.query(`update staff_leave set status = 'refused', decided_by = $2, decided_at = now() where leave_id = $1`, [hers, PRINCIPAL]))).rejects.toThrow(/staff_leave_refused_with_note/);
      expect((await row(hers)).status).toBe('waiting');
      expect((await row(his)).status).toBe('waiting');
    });

    it('the database holds it: a decision is written only by approving or refusing a waiting request, never while withdrawing', async () => {
      await wipe();
      // The person who asked withdraws their own waiting request and, in the same change, writes an answer in the
      // principal's name: a teacher, a coordinator and an office person, each on their own request.
      for (const who of [tara, coordinator, admin]) {
        const own = await ask(who, 5, 6);
        const forged = (set: string) => as(who, (c) => c.query(`update staff_leave set status = 'withdrawn', withdrawn_by = $2, withdrawn_at = now(), ${set} where leave_id = $1`, [own, who.user]));
        await expect(forged(`decided_by = '${PRINCIPAL}', decided_at = now(), decision_note = 'Approved, enjoy.'`), who.role).rejects.toThrow(/decision is written only/);
        await expect(forged(`decided_by = '${PRINCIPAL}', decided_at = now()`), who.role).rejects.toThrow(/decision is written only/);
        expect(await row(own), who.role).toMatchObject({ status: 'waiting', decided_by: null, decision_note: null, withdrawn_by: null });
        // So what the person reads never names a decider who did not decide.
        expect((await as(who, (c) => myLeave(c, actor(who))))[0], who.role).toMatchObject({ status: 'waiting', decided_by: null, decided_at: null, decision_note: null });
        // The honest withdrawal still goes through, with no answer on it.
        expect(await as(who, (c) => withdrawLeave(c, actor(who), own, '')), who.role).toEqual({ ok: true });
        expect(await row(own), who.role).toMatchObject({ status: 'withdrawn', decided_by: null, decision_note: null, withdrawn_by: who.user });
      }
      // Nor is a real answer rewritten on the way out: by the person withdrawing approved leave, or the office cancelling it.
      await wipe();
      const hers = await ask(tara, 9, 10);
      await as(admin, (c) => decideLeave(c, actor(admin), hers, 'approve', 'Enjoy.'));
      const leaving = (who: Who, set: string) => as(who, (c) => c.query(`update staff_leave set status = 'withdrawn', withdrawn_by = $2, withdrawn_at = now(), withdrawn_note = 'x', ${set} where leave_id = $1`, [hers, who.user]));
      await expect(leaving(tara, `decided_by = '${PRINCIPAL}'`)).rejects.toThrow(/decision is written only/);
      await expect(leaving(tara, `decision_note = 'Refused: exams.'`)).rejects.toThrow(/decision is written only/);
      await expect(leaving(principal, `decided_by = '${PRINCIPAL}', decided_at = now()`)).rejects.toThrow(/decision is written only/);
      await expect(leaving(principal, `decided_by = null, decided_at = null, decision_note = null`)).rejects.toThrow(/decision is written only/);
      expect(await row(hers)).toMatchObject({ status: 'approved', decided_by: ADMIN, decision_note: 'Enjoy.' });
      // The office's own cancellation keeps the answer as it was given.
      expect(await as(principal, (c) => withdrawLeave(c, actor(principal), hers, 'The trip was called off.'))).toEqual({ ok: true });
      expect(await row(hers)).toMatchObject({ status: 'withdrawn', decided_by: ADMIN, decision_note: 'Enjoy.', withdrawn_by: PRINCIPAL });
    });

    it('what was asked never changes, a decision is recorded once, and a refused or withdrawn request is never approved later', async () => {
      await wipe();
      const approved = await ask(tara, 5, 6);
      const refused = await ask(tarun, 5, 6);
      const withdrawn = await ask(accountant, 5, 6);
      const waiting = await ask(coordinator, 5, 6);
      await as(principal, (c) => decideLeave(c, actor(principal), approved, 'approve', ''));
      await as(principal, (c) => decideLeave(c, actor(principal), refused, 'refuse', 'Not that week.'));
      await as(accountant, (c) => withdrawLeave(c, actor(accountant), withdrawn, ''));
      const change = (who: Who, id: string, set: string) => as(who, (c) => c.query(`update staff_leave set ${set} where leave_id = '${id}'`));
      for (const id of [approved, waiting]) {
        for (const set of [`to_date = '${day(9)}'`, `from_date = '${day(4)}'`, `kind = 'sick'`, `reason = 'Something else.'`, `user_id = '${TARUN}'`, `recorded_by = '${ADMIN}'`, `asked_at = now() - interval '1 day'`]) {
          await expect(change(principal, id, set), set).rejects.toThrow(/never changed/);
        }
      }
      await expect(change(tara, approved, `reason = 'Something else.'`)).rejects.toThrow(/never changed|row-level security/);
      // A decision is recorded once.
      await expect(change(principal, approved, `decision_note = 'A note added later.'`)).rejects.toThrow(/recorded once/);
      await expect(change(admin, approved, `decided_by = '${ADMIN}'`)).rejects.toThrow(/recorded once/);
      await expect(change(principal, approved, `status = 'refused', decision_note = 'No after all.'`)).rejects.toThrow(/only be withdrawn|recorded once/);
      await expect(change(principal, approved, `status = 'waiting', decided_by = null, decided_at = null`)).rejects.toThrow(/only be withdrawn/);
      // Refused or withdrawn: never approved later, by anyone.
      for (const who of [principal, admin]) {
        await expect(change(who, refused, `status = 'approved', decided_by = '${who.user}', decided_at = now(), decision_note = null`), who.role).rejects.toThrow(/stays as it is/);
        await expect(change(who, withdrawn, `status = 'approved', decided_by = '${who.user}', decided_at = now(), withdrawn_by = null, withdrawn_at = null`), who.role).rejects.toThrow(/stays as it is/);
        await expect(change(who, withdrawn, `status = 'waiting', withdrawn_by = null, withdrawn_at = null`), who.role).rejects.toThrow(/stays as it is/);
      }
      expect(await as(principal, (c) => decideLeave(c, actor(principal), refused, 'approve', ''))).toEqual({ ok: false, reason: 'decided' });
      expect(await as(principal, (c) => decideLeave(c, actor(principal), withdrawn, 'approve', ''))).toEqual({ ok: false, reason: 'decided' });
      expect((await row(refused)).status).toBe('refused');
      expect((await row(withdrawn)).status).toBe('withdrawn');
      // Nobody deletes a request, and the platform role has no hand in the table at all.
      for (const who of [principal, admin, tara]) await expect(as(who, (c) => c.query(`delete from staff_leave where leave_id = '${approved}'`)), who.role).rejects.toThrow(/permission denied/);
      await expect(platform((c) => c.query(`select count(*) from staff_leave`))).rejects.toThrow(/permission denied/);
      await expect(platform((c) => c.query(`update staff_leave set status = 'approved' where leave_id = '${refused}'`))).rejects.toThrow(/permission denied/);
    });
  });

  describe('only that person and the office can read it', () => {
    it('row level security: the person their own, the principal and school admin all, nobody else any row', async () => {
      await wipe();
      await ask(tara, 5, 6, { kind: 'sick', reason: 'A small operation.' });
      await ask(tarun, 12, 12);
      await ask(principal, 20, 20);
      expect(await sees(tara)).toBe(1);
      expect(await sees(tara, `user_id = '${TARA}'`)).toBe(1);
      expect(await sees(tarun, `user_id = '${TARA}'`)).toBe(0);
      expect(await sees(tarun)).toBe(1);
      expect(await sees(accountant)).toBe(0);
      expect(await sees(coordinator)).toBe(0);
      expect(await sees(principal)).toBe(3);
      expect(await sees(admin)).toBe(3);
      expect(await sees(elsewhere)).toBe(0); // another school's principal
      // A session with no role or person set reads nothing.
      expect(await sees({ role: '', user: '' })).toBe(0);
      // The reason cannot be reached through any other column either.
      expect((await as<{ rows: { reason: string }[] }>(coordinator, (c) => c.query(`select reason from staff_leave`))).rows).toEqual([]);
      // The app's lists say the same.
      expect((await as(tara, (c) => myLeave(c, actor(tara)))).map((r) => r.name)).toEqual(['Tara Teacher']);
      expect(await as(accountant, (c) => myLeave(c, actor(accountant)))).toEqual([]);
      for (const who of [tara, accountant, coordinator]) {
        expect(await as(who, (c) => leaveWaiting(c, actor(who))), who.role).toEqual([]);
        expect(await as(who, (c) => leaveCalendar(c, actor(who), day(0), day(30))), who.role).toEqual([]);
        expect(await as(who, (c) => leaveStaff(c, actor(who))), who.role).toEqual([]);
      }
      expect((await as(admin, (c) => leaveWaiting(c, actor(admin)))).map((r) => r.name)).toEqual(['Tara Teacher', 'Tarun Teacher', 'Priya Principal']);
      // Nor can anyone else withdraw it or see that it exists.
      const hers = (await db.pg.query(`select leave_id from staff_leave where user_id = $1`, [TARA])).rows[0].leave_id;
      expect(await as(tarun, (c) => withdrawLeave(c, actor(tarun), hers, 'x'))).toEqual({ ok: false, reason: 'not_found' });
      expect(await as(coordinator, (c) => withdrawLeave(c, actor(coordinator), hers, 'x'))).toEqual({ ok: false, reason: 'not_found' });
      expect(await as(elsewhere, (c) => decideLeave(c, actor(elsewhere), hers, 'approve', ''))).toEqual({ ok: false, reason: 'not_found' });
    });

    it('the audit rows of leave follow the leave: the office, or the person who acted', async () => {
      const audit = async (who: Who) => (await as<Count>(who, (c) => c.query(`select count(*)::int as n from audit_log where event_action like 'leave.%'`))).rows[0].n;
      expect(await audit(principal)).toBe(3);
      expect(await audit(admin)).toBe(3);
      expect(await audit(tara)).toBe(1); // her own asking
      expect(await audit(accountant)).toBe(0);
      expect(await audit(coordinator)).toBe(0);
      expect(await audit(elsewhere)).toBe(0);
      // Other audit rows are read as before.
      await db.pg.query(`insert into audit_log (school_id, actor_user_id, actor_role, event_action) values ($1, $2, 'principal', 'student.created')`, [A, PRINCIPAL]);
      expect((await as<Count>(accountant, (c) => c.query(`select count(*)::int as n from audit_log where event_action = 'student.created'`))).rows[0].n).toBe(1);
    });
  });

  describe('a day is "on leave" only while a request covering it is approved', () => {
    it('waiting is not on leave; approved is, on each of its days and no other; refused never is', async () => {
      await wipe();
      const hers = await ask(tara, 3, 5);
      const his = await ask(tarun, 4, 4);
      for (const d of [3, 4, 5]) expect(await away(principal, day(d)), `day ${d}`).toEqual([]);
      await as(principal, (c) => decideLeave(c, actor(principal), hers, 'approve', ''));
      await as(principal, (c) => decideLeave(c, actor(principal), his, 'refuse', 'Tara is away that day.'));
      expect(await away(principal, day(2))).toEqual([]);
      for (const d of [3, 4, 5]) expect(await away(principal, day(d)), `day ${d}`).toEqual(['Tara Teacher']);
      expect(await away(admin, day(4))).toEqual(['Tara Teacher']);
      expect(await away(principal, day(6))).toEqual([]);
      expect(await away(principal, 'not a date')).toEqual([]);
      // Read in the caller's own session: a colleague is not told who is away, the person sees themself.
      expect(await away(tara, day(4))).toEqual(['Tara Teacher']);
      expect(await away(tarun, day(4))).toEqual([]);
      expect(await away(coordinator, day(4))).toEqual([]);
      // The calendar shows the same rows: approved leave with a day inside the range.
      expect((await as(admin, (c) => leaveCalendar(c, actor(admin), day(0), day(30)))).map((r) => [r.name, r.from_date, r.to_date, r.status])).toEqual([['Tara Teacher', day(3), day(5), 'approved']]);
      expect(await as(admin, (c) => leaveCalendar(c, actor(admin), day(6), day(30)))).toEqual([]);
      expect((await as(admin, (c) => leaveCalendar(c, actor(admin), day(5), day(5)))).length).toBe(1);
    });

    it('withdrawn by the person before the first day, those days are no longer on leave', async () => {
      await wipe();
      const hers = await ask(tara, 3, 5);
      expect((await as(tara, (c) => myLeave(c, actor(tara))))[0]).toMatchObject({ status: 'waiting', mayWithdraw: true });
      await as(admin, (c) => decideLeave(c, actor(admin), hers, 'approve', ''));
      expect(await away(principal, day(4))).toEqual(['Tara Teacher']);
      expect((await as(tara, (c) => myLeave(c, actor(tara))))[0]).toMatchObject({ status: 'approved', mayWithdraw: true });
      expect(await as(tara, (c) => withdrawLeave(c, actor(tara), hers, ''))).toEqual({ ok: true });
      expect(await row(hers)).toMatchObject({ status: 'withdrawn', withdrawn_by: TARA, withdrawn_note: null, decided_by: ADMIN });
      for (const d of [3, 4, 5]) expect(await away(principal, day(d)), `day ${d}`).toEqual([]);
      expect(await as(tara, (c) => withdrawLeave(c, actor(tara), hers, ''))).toEqual({ ok: false, reason: 'closed' });
      // A waiting request is withdrawn too, and was never on leave.
      const again = await ask(tara, 3, 5);
      expect(await as(tara, (c) => withdrawLeave(c, actor(tara), again, ''))).toEqual({ ok: true });
      expect(await row(again)).toMatchObject({ status: 'withdrawn', decided_by: null });
      expect((await as(tara, (c) => myLeave(c, actor(tara)))).map((r) => [r.status, r.withdrawnByOffice, r.mayWithdraw])).toEqual([['withdrawn', false, false], ['withdrawn', false, false]]);
    });

    it('leave that has begun is not the person’s to withdraw: the office cancels it, with a note, and the day is free', async () => {
      await wipe();
      // Tara phoned in this morning: the office records it, approved at once in the office person's name.
      const made = await as(admin, (c) => recordLeave(c, actor(admin), { userId: TARA, ...wants(0, 1, { kind: 'sick', reason: 'Phoned in with a fever.' }) }));
      expect(made).toMatchObject({ ok: true });
      const id = (made as { leaveId: string }).leaveId;
      expect(await row(id)).toMatchObject({ status: 'approved', user_id: TARA, recorded_by: ADMIN, decided_by: ADMIN });
      expect(await away(principal, today)).toEqual(['Tara Teacher']);
      expect((await as(tara, (c) => myLeave(c, actor(tara))))[0]).toMatchObject({ byOffice: true, decided_by: 'Asif Admin', mayWithdraw: false });
      expect(await as(tara, (c) => withdrawLeave(c, actor(tara), id, ''))).toEqual({ ok: false, reason: 'begun' });
      await expect(as(tara, (c) => c.query(`update staff_leave set status = 'withdrawn', withdrawn_by = $2, withdrawn_at = now() where leave_id = $1`, [id, TARA]))).rejects.toThrow(/has begun/);
      // In the office's name it needs a note; in the person's name the office cannot do it.
      expect(await as(principal, (c) => withdrawLeave(c, actor(principal), id, '  '))).toEqual({ ok: false, reason: 'note' });
      await expect(as(principal, (c) => c.query(`update staff_leave set status = 'withdrawn', withdrawn_by = $2, withdrawn_at = now() where leave_id = $1`, [id, PRINCIPAL]))).rejects.toThrow(/staff_leave_cancel_with_note/);
      await expect(as(principal, (c) => c.query(`update staff_leave set status = 'withdrawn', withdrawn_by = $2, withdrawn_at = now() where leave_id = $1`, [id, TARA]))).rejects.toThrow(/has begun/);
      // Nor before it begins: a withdrawal is written in the name of whoever withdraws.
      const later = (await as(admin, (c) => recordLeave(c, actor(admin), { userId: TARA, ...wants(20, 20) }))) as { leaveId: string };
      await expect(as(principal, (c) => c.query(`update staff_leave set status = 'withdrawn', withdrawn_by = $2, withdrawn_at = now() where leave_id = $1`, [later.leaveId, TARA]))).rejects.toThrow(/row-level security/);
      await expect(as(tara, (c) => c.query(`update staff_leave set status = 'withdrawn', withdrawn_by = $2, withdrawn_at = now(), withdrawn_note = 'x' where leave_id = $1`, [later.leaveId, PRINCIPAL]))).rejects.toThrow(/row-level security/);
      expect(await as(tara, (c) => withdrawLeave(c, actor(tara), later.leaveId, ''))).toEqual({ ok: true });
      expect(await as(principal, (c) => withdrawLeave(c, actor(principal), id, 'She came in after all.'))).toEqual({ ok: true });
      expect(await row(id)).toMatchObject({ status: 'withdrawn', withdrawn_by: PRINCIPAL, withdrawn_note: 'She came in after all.' });
      expect(await away(principal, today)).toEqual([]);
      expect((await as(tara, (c) => myLeave(c, actor(tara)))).find((r) => r.leave_id === id)).toMatchObject({ status: 'withdrawn', withdrawnByOffice: true, withdrawn_note: 'She came in after all.' });
      const actions = (await db.pg.query(`select event_action from audit_log where event_action like 'leave.%' order by occurred_at, audit_id`)).rows.map((r: { event_action: string }) => r.event_action);
      expect(actions).toEqual(['leave.recorded', 'leave.recorded', 'leave.withdrawn', 'leave.cancelled']);
    });

    it('the office records leave only for someone else, on the staff, and cancels only what is approved', async () => {
      await wipe();
      const base = { userId: TARUN, ...wants(0, 0) };
      for (const who of [tara, accountant, coordinator]) expect(await as(who, (c) => recordLeave(c, actor(who), base)), who.role).toEqual({ ok: false, reason: 'not_allowed' });
      expect(await as(admin, (c) => recordLeave(c, actor(admin), { ...base, userId: ADMIN }))).toEqual({ ok: false, reason: 'own' });
      expect(await as(admin, (c) => recordLeave(c, actor(admin), { ...base, userId: LEFT }))).toEqual({ ok: false, reason: 'person' }); // no longer active
      expect(await as(admin, (c) => recordLeave(c, actor(admin), { ...base, userId: B_PRINCIPAL }))).toEqual({ ok: false, reason: 'person' }); // another school's
      expect(await as(admin, (c) => recordLeave(c, actor(admin), { ...base, ...wants(-40, -39) }))).toEqual({ ok: false, reason: 'past' });
      expect(await as(admin, (c) => recordLeave(c, actor(admin), { ...base, ...wants(-3, -2) }))).toMatchObject({ ok: true }); // written down a few days late
      expect(await away(admin, day(-2))).toEqual(['Tarun Teacher']);
      expect(await as(admin, (c) => recordLeave(c, actor(admin), { ...base, ...wants(-2, 0) }))).toEqual({ ok: false, reason: 'overlap' });
      expect((await as(principal, (c) => leaveStaff(c, actor(principal)))).map((s) => s.name)).toEqual(['Anil Accountant', 'Asif Admin', 'Chitra Coordinator', 'Tara Teacher', 'Tarun Teacher']);
      // A waiting request is approved or refused, not cancelled: through the app and in the database.
      const waiting = await ask(tara, 9, 9);
      expect(await as(principal, (c) => withdrawLeave(c, actor(principal), waiting, 'Not needed.'))).toEqual({ ok: false, reason: 'not_approved' });
      await expect(as(principal, (c) => c.query(`update staff_leave set status = 'withdrawn', withdrawn_by = $2, withdrawn_at = now(), withdrawn_note = 'Not needed.' where leave_id = $1`, [waiting, PRINCIPAL]))).rejects.toThrow(/approved leave only/);
      expect((await row(waiting)).status).toBe('waiting');
    });
  });

  describe('the office can find, and so cancel, every approved leave', () => {
    const office = (who: Who, from: string, to: string | null = null) => as(who, (c) => leaveCalendar(c, actor(who), from, to));
    // An approved request as the database holds it, however long ago: written by the owner of the database.
    const longAgo = (user: string, from: number, to: number) =>
      db.pg.exec(`set session_replication_role = replica;
        insert into staff_leave (school_id, user_id, from_date, to_date, kind, reason, status, recorded_by, decided_by, decided_at)
          values ('${A}', '${user}', '${day(from)}', '${day(to)}', 'casual', 'A wedding in the family.', 'approved', '${user}', '${PRINCIPAL}', now());
        set session_replication_role = origin;`);

    it('leave recorded for days that have passed, and leave approved far ahead, are both on the list, and each can be cancelled', async () => {
      await wipe();
      // Written down late, and for the wrong teacher: the office may record up to LEAVE_BACK_DAYS back.
      const late = (await as(admin, (c) => recordLeave(c, actor(admin), { userId: TARUN, ...wants(-5, -3, { kind: 'sick', reason: 'Was unwell last week.' }) }))) as { leaveId: string };
      const oldest = (await as(admin, (c) => recordLeave(c, actor(admin), { userId: ACCOUNTANT, ...wants(-LEAVE_BACK_DAYS, -LEAVE_BACK_DAYS) }))) as { leaveId: string };
      // Asked well ahead, and approved: it leaves the waiting list.
      const far = await ask(tara, 45, 46);
      const year = await ask(coordinator, 300, 301);
      for (const id of [far, year]) expect(await as(admin, (c) => decideLeave(c, actor(admin), id, 'approve', ''))).toEqual({ ok: true });
      expect(await as(admin, (c) => leaveWaiting(c, actor(admin)))).toEqual([]);
      expect(await away(admin, day(-4))).toEqual(['Tarun Teacher']);
      // What the screen is given when it asks for nothing in particular: from LEAVE_BACK_DAYS back, with no last day.
      const start = day(-LEAVE_BACK_DAYS);
      const list = await office(principal, start);
      expect(list.map((r) => [r.name, r.from_date, r.to_date, r.mayCancel])).toEqual([
        ['Anil Accountant', start, start, true],
        ['Tarun Teacher', day(-5), day(-3), true],
        ['Tara Teacher', day(45), day(46), true],
        ['Chitra Coordinator', day(300), day(301), true],
      ]);
      const split = leaveByToday(list, today);
      expect(split.ended.map((r) => r.name)).toEqual(['Anil Accountant', 'Tarun Teacher']);
      expect(split.ahead.map((r) => r.name)).toEqual(['Tara Teacher', 'Chitra Coordinator']);
      // The first day moves later and earlier; a last day closes the range when one is given.
      expect((await office(principal, day(47))).map((r) => r.name)).toEqual(['Chitra Coordinator']);
      expect((await office(principal, day(46))).map((r) => r.name)).toEqual(['Tara Teacher', 'Chitra Coordinator']);
      expect((await office(principal, day(-3), day(44))).map((r) => r.name)).toEqual(['Tarun Teacher']);
      expect((await office(principal, day(0), day(30))).map((r) => r.name)).toEqual([]);
      expect(await office(principal, day(5), day(4))).toEqual([]);
      expect(await office(principal, 'soon')).toEqual([]);
      // The wrong teacher's leave is cancelled after its days, and the far one before them: neither is "on leave" any more.
      expect(await as(principal, (c) => withdrawLeave(c, actor(principal), late.leaveId, 'Recorded for the wrong teacher.'))).toEqual({ ok: true });
      expect(await as(principal, (c) => withdrawLeave(c, actor(principal), far, 'The training was moved.'))).toEqual({ ok: true });
      expect(await away(admin, day(-4))).toEqual([]);
      expect(await away(admin, day(45))).toEqual([]);
      expect((await office(principal, start)).map((r) => r.leave_id)).toEqual([oldest.leaveId, year]);
    });

    it('leave that ended before the list begins is reached by moving its first day earlier', async () => {
      await wipe();
      await longAgo(TARA, -90, -88);
      expect(await office(admin, day(-LEAVE_BACK_DAYS))).toEqual([]);
      const found = await office(admin, day(-120));
      expect(found.map((r) => [r.name, r.from_date, r.mayCancel])).toEqual([['Tara Teacher', day(-90), true]]);
      expect(await as(admin, (c) => withdrawLeave(c, actor(admin), found[0].leave_id, 'She was in school those days.'))).toEqual({ ok: true });
      expect(await away(admin, day(-89))).toEqual([]);
    });

    it('a list too long to carry says that it was cut, and a later first day reaches the rest', async () => {
      await wipe();
      // One day of leave on each of the days ahead, more than a list carries (written by the owner of the database).
      await db.pg.exec(`set session_replication_role = replica;
        insert into staff_leave (school_id, user_id, from_date, to_date, kind, reason, status, recorded_by, decided_by, decided_at)
          select '${A}', '${TARA}', '${today}'::date + g, '${today}'::date + g, 'casual', 'x', 'approved', '${TARA}', '${PRINCIPAL}', now() from generate_series(1, ${LEAVE_LIST_MAX + 5}) g;
        set session_replication_role = origin;`);
      expect(await office(admin, today)).toHaveLength(LEAVE_LIST_MAX);
      state.claims = { sub: ADMIN, role: 'school_admin', schoolId: A, membershipId: u(90), tokenVersion: 0, aal: 'aal1', sessionId: u(91) };
      await db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source) values ($1, 'staff', true, 'plan') on conflict (school_id, module_id) do update set enabled = true`, [A]);
      const cut = await (await listLeave(new NextRequest('http://localhost/api/app/staff/leave?view=office'))).json();
      expect(cut.calendarMore).toBe(true);
      expect(cut.calendar).toHaveLength(LEAVE_LIST_MAX);
      expect(cut.calendar.at(-1).from_date).toBe(day(LEAVE_LIST_MAX));
      const rest = await (await listLeave(new NextRequest(`http://localhost/api/app/staff/leave?view=office&from=${day(LEAVE_LIST_MAX + 1)}`))).json();
      expect(rest.calendarMore).toBe(false);
      expect(rest.calendar.map((r: { from_date: string }) => r.from_date)).toEqual([1, 2, 3, 4, 5].map((n) => day(LEAVE_LIST_MAX + n)));
      for (const lang of ['en', 'hi'] as const) expect(t(lang, 'leave.office.more', { count: LEAVE_LIST_MAX }), lang).toContain(String(LEAVE_LIST_MAX));
    });

    it('how far back the list starts is said in one place: the route and the office’s recording share the limit', () => {
      const route = readFileSync(path.join(__dirname, '../../src/app/api/app/staff/leave/route.ts'), 'utf8');
      expect(route).toContain('addDays(today, -LEAVE_BACK_DAYS)');
      expect(route).not.toMatch(/addDays\(today, -?\d/);
      for (const file of ['app/api/app/staff/leave/route.ts', 'components/staff/StaffLeaveOffice.tsx', 'lib/staff/leave.ts']) {
        expect(readFileSync(path.join(__dirname, '../../src', file), 'utf8'), file).not.toMatch(/LEAVE_CALENDAR_DAYS/);
      }
    });
  });

  describe('a school with one person in its office', () => {
    it('that person is told nobody can decide their own request yet; with a second office person it is theirs to decide', async () => {
      await wipe();
      // School B has its principal and nobody else. School A has a principal and a school admin.
      expect(await as(elsewhere, (c) => officeAlone(c, actor(elsewhere)))).toBe(true);
      for (const who of [principal, admin]) expect(await as(who, (c) => officeAlone(c, actor(who))), who.role).toBe(false);
      // Only the office is asked: a teacher's request goes to the office whoever is in it.
      for (const who of [tara, accountant, coordinator]) expect(await as(who, (c) => officeAlone(c, actor(who))), who.role).toBe(false);
      // The request is taken and waits: nothing decides it, and the person cannot.
      const hers = await as(elsewhere, (c) => askLeave(c, actor(elsewhere), wants(5, 5)));
      expect(hers).toMatchObject({ ok: true });
      const id = (hers as { leaveId: string }).leaveId;
      expect(await as(elsewhere, (c) => decideLeave(c, actor(elsewhere), id, 'approve', ''))).toEqual({ ok: false, reason: 'own' });
      expect((await as(elsewhere, (c) => leaveWaiting(c, actor(elsewhere)))).map((r) => [r.mine, r.mayDecide])).toEqual([[true, false]]);
      // A school admin joins: the principal is no longer alone, and the school admin decides the request.
      const B_ADMIN = u(22);
      await db.pg.query(`insert into users (user_id, school_id, email, role, display_name, is_active) values ($1, $2, 'admin@school-b.example', 'school_admin', 'Bina Admin', true)`, [B_ADMIN, B]);
      try {
        expect(await as(elsewhere, (c) => officeAlone(c, actor(elsewhere)))).toBe(false);
        const joined: Who = { role: 'school_admin', user: B_ADMIN, school: B };
        expect(await as(joined, (c) => decideLeave(c, actor(joined), id, 'approve', ''))).toEqual({ ok: true });
        // Someone whose account is switched off is not there to decide.
        await db.pg.query(`update users set is_active = false where user_id = $1`, [B_ADMIN]);
        expect(await as(elsewhere, (c) => officeAlone(c, actor(elsewhere)))).toBe(true);
      } finally {
        await wipe();
        await db.pg.query(`delete from users where user_id = $1`, [B_ADMIN]);
      }
    });
  });

  describe('an account made at another school', () => {
    it('leave says so plainly, to the person asking and to an office person deciding, and nothing is written', async () => {
      await wipe();
      // Asking with it.
      expect(await as(visitingTeacher, (c) => askLeave(c, actor(visitingTeacher), wants(5, 5)))).toEqual({ ok: false, reason: 'elsewhere' });
      // The office cannot record for it either, and it is not on the list to choose from.
      expect(await as(admin, (c) => recordLeave(c, actor(admin), { userId: VISITING_TEACHER, ...wants(0, 0) }))).toEqual({ ok: false, reason: 'person' });
      expect((await as(admin, (c) => leaveStaff(c, actor(admin)))).map((p) => p.user_id)).not.toContain(VISITING_TEACHER);
      // Deciding, recording and cancelling with it: refused in words, where the database would have refused the row.
      const hers = await ask(tara, 5, 6);
      for (const decision of ['approve', 'refuse'] as const) {
        expect(await as(visitingPrincipal, (c) => decideLeave(c, actor(visitingPrincipal), hers, decision, 'No.')), decision).toEqual({ ok: false, reason: 'elsewhere' });
      }
      expect(await as(visitingPrincipal, (c) => recordLeave(c, actor(visitingPrincipal), { userId: TARUN, ...wants(0, 0) }))).toEqual({ ok: false, reason: 'elsewhere' });
      await expect(as(visitingPrincipal, (c) => c.query(`update staff_leave set status = 'approved', decided_by = $2, decided_at = now() where leave_id = $1`, [hers, VISITING_PRINCIPAL]))).rejects.toThrow(/foreign key/);
      expect(await row(hers)).toMatchObject({ status: 'waiting', decided_by: null });
      await as(admin, (c) => decideLeave(c, actor(admin), hers, 'approve', ''));
      expect(await as(visitingPrincipal, (c) => withdrawLeave(c, actor(visitingPrincipal), hers, 'Not needed.'))).toEqual({ ok: false, reason: 'elsewhere' });
      expect(await row(hers)).toMatchObject({ status: 'approved', withdrawn_by: null });
      expect((await db.pg.query(`select count(*)::int as n from staff_leave where $1 in (user_id, recorded_by, decided_by, withdrawn_by) or $2 in (user_id, recorded_by, decided_by, withdrawn_by)`, [VISITING_TEACHER, VISITING_PRINCIPAL])).rows[0].n).toBe(0);
      // The words name the cause, in both languages.
      expect(t('en', 'leave.err.elsewhere')).toMatch(/made at another school/);
      expect(t('hi', 'leave.err.elsewhere')).toMatch(/[ऀ-ॿ]/);
    });
  });

  describe('My Day', () => {
    const card = TODAY_PROVIDERS.find((p) => p.type === 'leave-waiting')!;
    const cards = (who: Who) => as(who, (c) => card.load(c, { schoolId: A, userId: who.user, role: who.role as never, sunday: false }));

    it('the principal and the school admin are told of requests waiting that are not their own', async () => {
      await wipe();
      expect(card).toMatchObject({ moduleId: 'staff', roles: ['principal', 'school_admin'] });
      expect(await cards(principal)).toEqual([]);
      await ask(tara, 5, 5);
      await ask(tarun, 6, 6);
      const hers = await ask(principal, 7, 7);
      expect(await cards(principal)).toEqual([{ id: 'leave-waiting', type: 'leave-waiting', moduleId: 'staff', state: 'todo', count: 2, href: '/app/staff' }]);
      expect((await cards(admin))[0]).toMatchObject({ count: 3 }); // the principal's own request is the school admin's to decide
      await as(admin, (c) => decideLeave(c, actor(admin), hers, 'approve', ''));
      expect((await cards(admin))[0]).toMatchObject({ count: 2 });
      for (const lang of ['en', 'hi'] as const) for (const part of ['todo.one', 'todo.other', 'action', 'why']) expect(t(lang, `today.leave-waiting.${part}` as never), `${lang} ${part}`).toBeTruthy();
    });
  });

  describe('the routes and the screens', () => {
    const claims = (who: Who) => ({ sub: who.user, role: who.role, schoolId: who.school ?? A, membershipId: u(90), tokenVersion: 0, aal: 'aal1', sessionId: u(91) });
    const req = (method: string, url: string, body?: unknown) => new NextRequest(`http://localhost${url}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
    const call = async (who: Who, fn: () => Promise<Response>) => {
      state.claims = claims(who);
      const res = await fn();
      return { status: res.status, body: await res.json() };
    };
    const step = (who: Who, id: string, body: unknown) => call(who, () => stepLeave(req('POST', `/api/app/staff/leave/${id}`, body), { params: { leaveId: id } }));
    const staffModule = (enabled: boolean, school = A) => db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source) values ($1, 'staff', $2, 'plan') on conflict (school_id, module_id) do update set enabled = excluded.enabled`, [school, enabled]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts = (page: any) => Children.toArray(page.props.children).map((k: any) => k.type);

    it('the migration switches Staff on for every school there is', async () => {
      // The file is found by its name's end: its first part is the version the database recorded.
      const dir = path.join(__dirname, '../../supabase/migrations');
      const sql = readFileSync(path.join(dir, readdirSync(dir).find((f) => f.endsWith('_p5_staff_leave.sql'))!), 'utf8');
      const last = sql.slice(sql.lastIndexOf('insert into school_module_entitlements'));
      expect(last).toContain(`'staff', true, 'plan'`);
      await db.pg.exec(last);
      expect((await db.pg.query(`select count(*)::int as n from school_module_entitlements where module_id = 'staff' and enabled and school_id in ($1, $2)`, [A, B])).rows[0].n).toBe(2);
      // A school that had it switched off by hand keeps that choice.
      await db.pg.query(`update school_module_entitlements set enabled = false, source = 'founder_override' where school_id = $1 and module_id = 'staff'`, [B]);
      await db.pg.exec(last);
      expect((await db.pg.query(`select enabled from school_module_entitlements where module_id = 'staff' and school_id = $1`, [B])).rows[0].enabled).toBe(false);
    });

    it('a teacher asks, sees only their own, and cannot open the office’s lists; the office decides', async () => {
      await wipe();
      await staffModule(true);
      const asked = await call(tara, () => postLeave(req('POST', '/api/app/staff/leave', wants(5, 6))));
      expect(asked.status).toBe(201);
      const id = asked.body.leaveId as string;
      expect(await call(tara, () => postLeave(req('POST', '/api/app/staff/leave', wants(6, 7))))).toMatchObject({ status: 400, body: { code: 'overlap' } });
      expect(await call(tara, () => postLeave(req('POST', '/api/app/staff/leave', { ...wants(8, 8), reason: 7 })))).toMatchObject({ status: 400, body: { code: 'not_sent_properly' } });
      expect(await call(tara, () => postLeave(req('POST', '/api/app/staff/leave', { ...wants(8, 8), userId: TARUN })))).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
      const mine = await call(tara, () => listLeave(req('GET', '/api/app/staff/leave')));
      expect(mine.body).toMatchObject({ me: TARA, office: false, today });
      expect(mine.body.mine.map((r: { leave_id: string }) => r.leave_id)).toEqual([id]);
      expect(Object.keys(mine.body).sort()).toEqual(['alone', 'me', 'mine', 'office', 'today']);
      expect((await call(tarun, () => listLeave(req('GET', '/api/app/staff/leave')))).body.mine).toEqual([]);
      for (const who of [tara, accountant, coordinator]) expect(await call(who, () => listLeave(req('GET', '/api/app/staff/leave?view=office'))), who.role).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
      expect(await step(tara, id, { action: 'approve' })).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
      expect(await step(tarun, id, { action: 'withdraw' })).toMatchObject({ status: 404, body: { code: 'not_found' } });
      expect(await step(principal, id, { action: 'refuse' })).toMatchObject({ status: 409, body: { code: 'note' } });
      expect(await step(principal, id, { action: 'promote' })).toMatchObject({ status: 400, body: { code: 'not_sent_properly' } });
      const office = await call(principal, () => listLeave(req('GET', '/api/app/staff/leave?view=office')));
      expect(office.status).toBe(200);
      expect(office.body.waiting.map((r: { name: string; mayDecide: boolean }) => [r.name, r.mayDecide])).toEqual([['Tara Teacher', true]]);
      expect(office.body.calendar).toEqual([]);
      // Unless asked otherwise: from as far back as the office may record leave, with no last day.
      expect(office.body).toMatchObject({ from: day(-LEAVE_BACK_DAYS), to: null, calendarMore: false, alone: false });
      expect(office.body.staff.some((s: { user_id: string }) => s.user_id === PRINCIPAL)).toBe(false);
      expect(await step(principal, id, { action: 'approve' })).toMatchObject({ status: 200, body: { ok: true } });
      expect((await call(admin, () => listLeave(req('GET', `/api/app/staff/leave?view=office&from=${day(6)}&to=${day(6)}`)))).body.calendar.map((r: { name: string }) => r.name)).toEqual(['Tara Teacher']);
      expect(await call(admin, () => listLeave(req('GET', `/api/app/staff/leave?view=office&from=${day(6)}&to=${day(2)}`)))).toMatchObject({ status: 400 });
      // The office records for someone who phoned, and its own request waits for the other.
      const phoned = await call(admin, () => postLeave(req('POST', '/api/app/staff/leave', { ...wants(0, 0, { kind: 'sick', reason: 'Phoned in unwell.' }), userId: TARUN })));
      expect(phoned.status).toBe(201);
      expect(await row(phoned.body.leaveId)).toMatchObject({ status: 'approved', decided_by: ADMIN });
      const own = await call(admin, () => postLeave(req('POST', '/api/app/staff/leave', wants(15, 15))));
      expect(await step(admin, own.body.leaveId, { action: 'approve' })).toMatchObject({ status: 409, body: { code: 'own' } });
      expect(await step(admin, own.body.leaveId, { action: 'withdraw' })).toMatchObject({ status: 200 });
    });

    it('the screens are told when the caller is alone in the office, and a visiting account gets its own refusal', async () => {
      await wipe();
      await staffModule(true);
      await staffModule(true, B);
      try {
        for (const view of ['', '?view=office']) {
          expect((await call(elsewhere, () => listLeave(req('GET', `/api/app/staff/leave${view}`)))).body, view).toMatchObject({ office: true, alone: true });
          expect((await call(principal, () => listLeave(req('GET', `/api/app/staff/leave${view}`)))).body, view).toMatchObject({ office: true, alone: false });
        }
        expect((await call(tara, () => listLeave(req('GET', '/api/app/staff/leave')))).body).toMatchObject({ office: false, alone: false });
      } finally {
        await db.pg.query(`update school_module_entitlements set enabled = false where school_id = $1 and module_id = 'staff'`, [B]);
      }
      expect(await call(visitingTeacher, () => postLeave(req('POST', '/api/app/staff/leave', wants(5, 5))))).toMatchObject({ status: 400, body: { code: 'elsewhere' } });
      const id = await ask(tara, 5, 5);
      expect(await step(visitingPrincipal, id, { action: 'approve' })).toMatchObject({ status: 409, body: { code: 'elsewhere' } });
      expect((await row(id)).status).toBe('waiting');
    });

    it('Staff switched off: nobody asks, reads or decides leave; inviting colleagues is untouched', async () => {
      await wipe();
      const id = await ask(tara, 5, 5);
      await staffModule(false);
      try {
        expect(await call(tara, () => listLeave(req('GET', '/api/app/staff/leave')))).toMatchObject({ status: 403, body: { code: 'module_off' } });
        expect(await call(principal, () => listLeave(req('GET', '/api/app/staff/leave?view=office')))).toMatchObject({ status: 403, body: { code: 'module_off' } });
        expect(await call(tarun, () => postLeave(req('POST', '/api/app/staff/leave', wants(5, 5))))).toMatchObject({ status: 403, body: { code: 'module_off' } });
        expect(await step(principal, id, { action: 'approve' })).toMatchObject({ status: 403, body: { code: 'module_off' } });
        expect((await row(id)).status).toBe('waiting');
        expect(await sees(tarun)).toBe(0);
        // The screens: "My leave" is hidden, and the Staff page keeps accounts and invitations without leave.
        state.claims = claims(tara);
        expect(parts(await AccountPage())).not.toContain(MyLeavePanel);
        state.claims = claims(principal);
        expect(parts(await StaffPage())).toEqual([StaffInvitations, StaffAccounts]);
      } finally {
        await staffModule(true);
      }
      for (const who of [tara, accountant, coordinator, admin, principal]) {
        state.claims = claims(who);
        expect(parts(await AccountPage())[0], who.role).toBe(MyLeavePanel);
      }
      state.claims = claims(principal);
      expect(parts(await StaffPage())).toEqual([StaffLeaveOffice, StaffInvitations, StaffAccounts]);
      state.claims = claims(admin);
      expect(parts(await StaffPage())[0]).toBe(StaffLeaveOffice);
      // Staff stays the office's screen: a teacher is shown no part of it.
      state.claims = claims(tara);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const forTeacher: any = await StaffPage();
      expect(forTeacher.type).toBe(ModuleComingPage);
    });
  });
});
