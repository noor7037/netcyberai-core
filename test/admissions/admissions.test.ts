import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import {
  AADHAAR_LIKE,
  CLOSED_STAGE_IDS,
  SOURCE_CODES,
  SOURCE_IDS,
  STAGE_CODES,
  STAGE_IDS,
  admit,
  correctDetails,
  enquirySteps,
  followUpLists,
  followUpsDue,
  giveEnquiry,
  listEnquiries,
  loadPipeline,
  quietDays,
  recordEnquiry,
  recordOutcome,
  waitingForConsent,
} from '@/lib/admissions/admissions';
import { raiseDues } from '@/lib/fees/dues';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { CLOSED_STAGES, QUIET_DAYS_DEFAULT, SOURCES, STAGES } from '@/lib/free-tools/admissions-tracker';
import { looksLikeAadhaarNumber } from '@/lib/free-tools/student-data-check';
import { indiaDate } from '@/lib/time/india';
import { TODAY_PROVIDERS } from '@/lib/today/cards';

// The admissions pipeline (docs/28 slice 10a, C221). The acceptance test: an enquiry moves through the stages with
// each step kept; one with no contact for the setting's days is on "gone quiet"; "Admit" makes exactly one student
// record, on the class's fee structure, and the enquiry says admitted; a teacher and an accountant are refused by
// the app and the database. Every name and number is made up.

describe('one rule in one place: the website tracker’s', () => {
  it('every source and stage of the tool has a code, in the tool’s order, and the closed ones are the tool’s', () => {
    expect(Object.keys(SOURCE_CODES)).toEqual([...SOURCES]);
    expect(Object.keys(STAGE_CODES)).toEqual([...STAGES]);
    expect(SOURCE_IDS).toEqual(['walk_in', 'phone_call', 'whatsapp', 'website', 'referral', 'newspaper', 'other']);
    expect(STAGE_IDS).toEqual(['enquiry', 'visit_booked', 'visited', 'form_taken', 'form_submitted', 'admitted', 'not_joining']);
    expect(CLOSED_STAGE_IDS).toEqual(CLOSED_STAGES.map((s) => STAGE_CODES[s]));
  });

  it('"gone quiet" is a setting of Admissions whose default is the tool’s QUIET_DAYS_DEFAULT', () => {
    const schema = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'admissions')!;
    expect(schema.fields.map((f) => [f.key, f.default])).toEqual([['quiet_days', QUIET_DAYS_DEFAULT]]);
  });

  it('an Aadhaar number as it is printed is found in any text; a phone number or a date is not', () => {
    for (const s of ['1234 5678 9012', 'called, number 2345-6789-0123', '234567890123', 'Aadhaar:234567890123.']) expect(AADHAAR_LIKE.test(s), s).toBe(true);
    for (const s of ['98765 43210', '+91 98765 43210', 'Visit on 14/10/2026', 'Class 5-A, roll 12', '1234567890123']) expect(AADHAAR_LIKE.test(s), s).toBe(false);
    // Whatever the website's own check calls an Aadhaar number, this finds too.
    for (const s of ['1234 5678 9012', '1234-5678-9012', '123456789012']) expect(looksLikeAadhaarNumber(s) && AADHAAR_LIKE.test(s), s).toBe(true);
  });
});

const A = 'ad000000-0000-4000-8000-000000000001';
const B = 'ad000000-0000-4000-8000-000000000002';
const u = (n: number) => `ad000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, TARA, ACCOUNTANT, COORD, GONE_ADMIN, PRINCIPAL_B] = [u(11), u(12), u(13), u(14), u(15), u(16), u(21)];
const [C5A, C6A, C5B_OTHER_SCHOOL] = [u(51), u(52), u(53)];
const OLD_STUDENT = u(31);
const [SESSION, HEAD, STRUCTURE] = [u(61), u(62), u(63)];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const tara: Who = { role: 'teacher', user: TARA };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const coordinator: Who = { role: 'academic_coordinator', user: COORD };
const principalB: Who = { role: 'principal', user: PRINCIPAL_B, school: B };
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rows = { rows: any[] };
const actor = (who: Who) => ({ schoolId: who.school ?? A, userId: who.user, role: who.role as never });
const TODAY = indiaDate();
const day = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const base: { childName: string; guardianName: string; phone: string; classId: string; source: string; ownerId: string; followUp: string | null; nextStep: string | null; note: string | null } = { childName: 'Riya Example', guardianName: 'Sunita Example', phone: '98000 00101', classId: C5A, source: 'walk_in', ownerId: ADMIN, followUp: null, nextStep: 'Show her the classrooms', note: null };
const record = async (who: Who, input: Partial<typeof base> = {}) => {
  const r = await as(who, (c) => recordEnquiry(c, actor(who), { ...base, ...input }));
  if (!r.ok) throw new Error(r.reason);
  return r.enquiryId;
};
const steps = async (id: string) => (await as(principal, (c) => enquirySteps(c, A, id)))!.map((s) => [s.kind, s.stage_from, s.stage_to]);
const studentsNamed = async (name: string) => (await db.pg.query(`select student_id, class_id, status::text as status, admission_no from students where school_id = $1 and name = $2`, [A, name])).rows;
// Moves an enquiry's whole history back by `days`, as if it was recorded and last touched then (as the owner of the
// database: the steps are append-only for the app).
const age = (id: string, days: number) =>
  db.pg.exec(`set session_replication_role = replica;
    update admission_events set at = at - interval '${days} days' where enquiry_id = '${id}';
    update admission_enquiries set created_at = created_at - interval '${days} days' where enquiry_id = '${id}';
    set session_replication_role = origin;`);
let RIYA = '';

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false), ('${B}', 'School B', 'IN-DL', false);
      insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'admissions', true, 'plan'), ('${A}', 'fees', true, 'plan'), ('${B}', 'admissions', true, 'plan') on conflict do nothing;
      insert into users (user_id, school_id, email, role, display_name, is_active) values
        ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal', true),
        ('${ADMIN}', '${A}', 'admin@school-a.example', 'school_admin', 'Asif Admin', true),
        ('${TARA}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Teacher', true),
        ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant', true),
        ('${COORD}', '${A}', 'coord@school-a.example', 'academic_coordinator', 'Chitra Coordinator', true),
        ('${GONE_ADMIN}', '${A}', 'gone@school-a.example', 'school_admin', 'Gita Gone', false),
        ('${PRINCIPAL_B}', '${B}', 'principal@school-b.example', 'principal', 'Pooja B', true);
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5A}', '${A}', '5-A', '${TARA}'), ('${C6A}', '${A}', '6-A', null), ('${C5B_OTHER_SCHOOL}', '${B}', '5-B', null);
      insert into students (student_id, school_id, admission_no, name, status, class_id, created_at) values ('${OLD_STUDENT}', '${A}', 'A-1', 'Asha Example', 'active', '${C5A}', now() - interval '200 days');
      insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', '2026-27', '${day(-30)}', '${day(300)}', true);
      insert into fee_heads (head_id, school_id, name, is_mandatory) values ('${HEAD}', '${A}', 'Tuition', true);
      insert into fee_structures (structure_id, school_id, class_id, academic_year, session_id, effective_from, created_by) values ('${STRUCTURE}', '${A}', '${C5A}', '2026-27', '${SESSION}', '${day(-30)}', '${PRINCIPAL}');
      insert into fee_structure_items (school_id, structure_id, head_id, amount_minor, frequency) values ('${A}', '${STRUCTURE}', '${HEAD}', 150000, 'monthly');
    `);
  }, 120_000);
  afterAll(async () => db?.stop());

  describe('an enquiry moves through the stages, with each step kept', () => {
    it('is recorded by the office with an owner, a follow-up date and a stage; what a person types is checked', async () => {
      const bad = (input: Partial<typeof base>) => as(admin, (c) => recordEnquiry(c, actor(admin), { ...base, ...input }));
      expect(await bad({ childName: '  ' })).toEqual({ ok: false, reason: 'child_name' });
      expect(await bad({ phone: '12345' })).toEqual({ ok: false, reason: 'phone' });
      expect(await bad({ source: 'billboard' })).toEqual({ ok: false, reason: 'source' });
      expect(await bad({ classId: C5B_OTHER_SCHOOL })).toEqual({ ok: false, reason: 'class' }); // another school's class
      expect(await bad({ ownerId: TARA })).toEqual({ ok: false, reason: 'owner' }); // the office follows it up
      expect(await bad({ ownerId: GONE_ADMIN })).toEqual({ ok: false, reason: 'owner' }); // not someone who has left
      expect(await bad({ followUp: day(-1) })).toEqual({ ok: false, reason: 'follow_up' });
      RIYA = await record(admin, { followUp: TODAY, note: 'Mother came in on foot with Riya.' });
      const [row] = (await as(principal, (c) => listEnquiries(c, A))).filter((r) => r.enquiry_id === RIYA);
      expect(row).toMatchObject({ child_name: 'Riya Example', guardian_name: 'Sunita Example', phone: '+919800000101', class_name: '5-A', source: 'walk_in', stage: 'enquiry', owner: 'Asif Admin', next_follow_up: TODAY, next_step: 'Show her the classrooms', last_contact_on: TODAY });
      expect(await steps(RIYA)).toEqual([['recorded', null, 'enquiry'], ['note', null, null]]);
    });

    it('"Record what happened" moves the stage and sets the next follow-up; every change is a step, in order', async () => {
      expect(await as(admin, (c) => recordOutcome(c, actor(admin), RIYA, { note: '', stage: 'enquiry', nextStep: 'Show her the classrooms', followUp: TODAY, reason: '' }))).toEqual({ ok: false, reason: 'nothing' });
      expect(await as(admin, (c) => recordOutcome(c, actor(admin), RIYA, { note: 'x', stage: 'admitted', nextStep: '', followUp: '', reason: '' }))).toEqual({ ok: false, reason: 'stage' }); // only Admit admits
      expect(await as(admin, (c) => recordOutcome(c, actor(admin), RIYA, { note: '', stage: 'not_joining', nextStep: '', followUp: '', reason: '  ' }))).toEqual({ ok: false, reason: 'reason' });
      expect(await as(admin, (c) => recordOutcome(c, actor(admin), RIYA, { note: 'Booked a visit.', stage: 'visit_booked', nextStep: 'Visit on Saturday', followUp: day(2), reason: '' }))).toEqual({ ok: true, enquiryId: RIYA });
      expect(await as(principal, (c) => recordOutcome(c, actor(principal), RIYA, { note: 'They saw the classrooms.', stage: 'visited', nextStep: 'Collect the form', followUp: day(3), reason: '' }))).toMatchObject({ ok: true });
      expect(await as(admin, (c) => recordOutcome(c, actor(admin), RIYA, { note: '', stage: 'form_taken', nextStep: 'Collect the form', followUp: day(3), reason: '' }))).toMatchObject({ ok: true });
      expect(await steps(RIYA)).toEqual([
        ['recorded', null, 'enquiry'], ['note', null, null],
        ['note', null, null], ['stage', 'enquiry', 'visit_booked'], ['follow_up', null, null],
        ['note', null, null], ['stage', 'visit_booked', 'visited'], ['follow_up', null, null],
        ['stage', 'visited', 'form_taken'],
      ]);
      const kept = await as(principal, (c) => enquirySteps(c, A, RIYA));
      expect(kept!.filter((s) => s.kind === 'stage').map((s) => s.by)).toEqual(['Asif Admin', 'Priya Principal', 'Asif Admin']);
      // Not joining says why, and a family that comes back is moved on again.
      expect(await as(admin, (c) => recordOutcome(c, actor(admin), RIYA, { note: '', stage: 'not_joining', nextStep: 'x', followUp: day(4), reason: 'Moved to another city' }))).toMatchObject({ ok: true });
      const closed = (await as(admin, (c) => listEnquiries(c, A))).find((r) => r.enquiry_id === RIYA)!;
      expect([closed.stage, closed.closed_reason, closed.next_follow_up, closed.next_step]).toEqual(['not_joining', 'Moved to another city', null, null]);
      expect(await as(admin, (c) => giveEnquiry(c, actor(admin), RIYA, PRINCIPAL))).toEqual({ ok: false, reason: 'closed' });
      expect(await as(admin, (c) => recordOutcome(c, actor(admin), RIYA, { note: 'They are staying after all.', stage: 'form_submitted', nextStep: 'Admit', followUp: TODAY, reason: '' }))).toMatchObject({ ok: true });
      expect((await steps(RIYA)).slice(-4)).toEqual([['stage', 'form_taken', 'not_joining'], ['note', null, null], ['stage', 'not_joining', 'form_submitted'], ['follow_up', null, null]]);
      // Given to someone else in the office, and a detail corrected: each a step.
      expect(await as(admin, (c) => giveEnquiry(c, actor(admin), RIYA, TARA))).toEqual({ ok: false, reason: 'owner' });
      expect(await as(admin, (c) => giveEnquiry(c, actor(admin), RIYA, PRINCIPAL))).toMatchObject({ ok: true });
      expect(await as(admin, (c) => correctDetails(c, actor(admin), RIYA, { childName: 'Riya Example', guardianName: 'Sunita Example', phone: '+91 98000 00102', classId: C5A, source: 'referral' }))).toMatchObject({ ok: true });
      const last = (await as(principal, (c) => enquirySteps(c, A, RIYA)))!.slice(-2);
      expect(last.map((s) => [s.kind, s.owner, s.changed])).toEqual([['owner', 'Priya Principal', null], ['details', null, ['phone', 'source']]]);
    });

    it('the database keeps every change itself; nobody writes a step that did not happen, or changes or removes one', async () => {
      const before = (await steps(RIYA)).length;
      // A change made straight in the database, as the office: the step is still kept.
      await as(admin, (c) => c.query(`update admission_enquiries set stage = 'visited' where enquiry_id = $1`, [RIYA]));
      expect((await steps(RIYA)).slice(before)).toEqual([['stage', 'form_submitted', 'visited']]);
      // A note may be written by hand; a stage the enquiry never took may not.
      await as(admin, (c) => c.query(`insert into admission_events (school_id, enquiry_id, kind, note, by_user) values ($1, $2, 'note', 'Phoned again.', $3)`, [A, RIYA, ADMIN]));
      await expect(as(admin, (c) => c.query(`insert into admission_events (school_id, enquiry_id, kind, stage_from, stage_to, by_user) values ($1, $2, 'stage', 'visited', 'admitted', $3)`, [A, RIYA, ADMIN]))).rejects.toThrow(/row-level security/);
      await expect(as(admin, (c) => c.query(`insert into admission_events (school_id, enquiry_id, kind, note, by_user) values ($1, $2, 'note', 'In her name.', $3)`, [A, RIYA, PRINCIPAL]))).rejects.toThrow(/row-level security/);
      await expect(as(admin, (c) => c.query(`update admission_events set note = 'changed' where enquiry_id = $1`, [RIYA]))).rejects.toThrow(/permission denied/);
      await expect(as(admin, (c) => c.query(`delete from admission_events where enquiry_id = $1`, [RIYA]))).rejects.toThrow(/permission denied/);
      await expect(as(admin, (c) => c.query(`delete from admission_enquiries where enquiry_id = $1`, [RIYA]))).rejects.toThrow(/permission denied/);
      await expect(as(admin, (c) => c.query(`update admission_enquiries set created_by = $2 where enquiry_id = $1`, [RIYA, PRINCIPAL]))).rejects.toThrow(/never changed/);
      // Not joining without a reason, a closed one with a follow-up, an owner outside the office: refused by the database too.
      await expect(as(admin, (c) => c.query(`update admission_enquiries set stage = 'not_joining' where enquiry_id = $1`, [RIYA]))).rejects.toThrow(/check constraint/);
      await expect(as(admin, (c) => c.query(`update admission_enquiries set owner_id = $2 where enquiry_id = $1`, [RIYA, TARA]))).rejects.toThrow(/office/);
      await expect(as(admin, (c) => c.query(`update admission_enquiries set owner_id = $2 where enquiry_id = $1`, [RIYA, GONE_ADMIN]))).rejects.toThrow(/office/);
      await expect(as(admin, (c) => c.query(`insert into admission_enquiries (school_id, child_name, guardian_name, phone, class_id, source, stage, owner_id, created_by) values ($1, 'Z', 'Z', '+919800000109', $2, 'other', 'admitted', $3, $3)`, [A, C5A, ADMIN]))).rejects.toThrow(/check constraint|recorded open/);
      await expect(as(admin, (c) => c.query(`insert into admission_enquiries (school_id, child_name, guardian_name, phone, class_id, source, owner_id, created_by) values ($1, 'Z', 'Z', '+919800000109', $2, 'other', $3, $4)`, [A, C5A, ADMIN, PRINCIPAL]))).rejects.toThrow(/row-level security/); // in one's own name
    });

    it('never an Aadhaar number: refused by the app and by the database, in every field', async () => {
      expect(await as(admin, (c) => recordEnquiry(c, actor(admin), { ...base, note: 'Aadhaar 2345 6789 0123 shown' }))).toEqual({ ok: false, reason: 'aadhaar' });
      expect(await as(admin, (c) => recordEnquiry(c, actor(admin), { ...base, nextStep: 'check 234567890123' }))).toEqual({ ok: false, reason: 'aadhaar' });
      expect(await as(admin, (c) => recordEnquiry(c, actor(admin), { ...base, phone: '234567890123' }))).toEqual({ ok: false, reason: 'phone' });
      expect(await as(admin, (c) => recordOutcome(c, actor(admin), RIYA, { note: 'her number is 2345-6789-0123', stage: 'visited', nextStep: '', followUp: '', reason: '' }))).toEqual({ ok: false, reason: 'aadhaar' });
      expect(await as(admin, (c) => admit(c, actor(admin), RIYA, { admissionNo: '234567890123', dob: null }))).toEqual({ ok: false, reason: 'admission_no' });
      const insert = (col: string, v: string) => as(admin, (c) => c.query(`insert into admission_enquiries (school_id, child_name, guardian_name, phone, class_id, source, owner_id, created_by, ${col}) values ($1, 'Z', 'Z', '+919800000109', $2, 'other', $3, $3, $4)`, [A, C5A, ADMIN, v]));
      await expect(insert('next_step', 'card 2345 6789 0123')).rejects.toThrow(/check constraint/);
      await expect(as(admin, (c) => c.query(`insert into admission_enquiries (school_id, child_name, guardian_name, phone, class_id, source, owner_id, created_by) values ($1, 'Z 234567890123', 'Z', '+919800000109', $2, 'other', $3, $3)`, [A, C5A, ADMIN]))).rejects.toThrow(/check constraint/);
      await expect(as(admin, (c) => c.query(`insert into admission_enquiries (school_id, child_name, guardian_name, phone, class_id, source, owner_id, created_by) values ($1, 'Z', 'Z', '234567890123', $2, 'other', $3, $3)`, [A, C5A, ADMIN]))).rejects.toThrow(/check constraint/);
      await expect(as(admin, (c) => c.query(`insert into admission_events (school_id, enquiry_id, kind, note, by_user) values ($1, $2, 'note', 'number 2345 6789 0123', $3)`, [A, RIYA, ADMIN]))).rejects.toThrow(/check constraint/);
      expect((await db.pg.query(`select count(*)::int as n from admission_events where note ~ '[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}'`)).rows[0].n).toBe(0);
    });
  });

  describe('"Follow up today" and "gone quiet", by the tool’s rule and the school’s number of days', () => {
    let QUIET = '';
    let DUE = '';
    it('one with no contact for the setting’s days is on "gone quiet"; one due today or before is on "follow up today"', async () => {
      QUIET = await record(admin, { childName: 'Kabir Example', phone: '9800000103', classId: C6A, source: 'phone_call' });
      DUE = await record(admin, { childName: 'Anaya Example', phone: '9800000104', followUp: TODAY });
      // Recorded twenty days ago with a follow-up two days ago: overdue, and long without contact.
      await age(DUE, 20);
      await db.pg.exec(`set session_replication_role = replica; update admission_enquiries set next_follow_up = '${day(-2)}' where enquiry_id = '${DUE}'; set session_replication_role = origin;`);
      expect(await as(admin, (c) => quietDays(c, A))).toBe(QUIET_DAYS_DEFAULT);
      await age(QUIET, QUIET_DAYS_DEFAULT - 1);
      let p = await as(admin, (c) => loadPipeline(c, A, TODAY));
      expect(p.lists.quiet.map((q) => q.enquiryId)).not.toContain(QUIET);
      await age(QUIET, 1); // now exactly the setting's days without contact
      p = await as(admin, (c) => loadPipeline(c, A, TODAY));
      expect(p.lists.quiet.find((q) => q.enquiryId === QUIET)).toEqual({ enquiryId: QUIET, quietDays: QUIET_DAYS_DEFAULT });
      // Overdue by two days: on "follow up today", the most overdue first, and not also on "gone quiet".
      expect(p.lists.due[0]).toEqual({ enquiryId: DUE, overdueDays: 2 });
      expect(p.lists.quiet.map((q) => q.enquiryId)).not.toContain(DUE);
      // The same lists the tool itself makes from the same rows.
      expect(followUpLists(p.enquiries, TODAY, QUIET_DAYS_DEFAULT)).toEqual(p.lists);
    });

    it('the school’s own number of days is used; a contact, not a change of owner, takes it off the list', async () => {
      await db.pg.query(`insert into school_settings (school_id, module_id, schema_version, setting_values, revision) values ($1, 'admissions', 1, '{"quiet_days": 20}', 1)`, [A]);
      expect(await as(admin, (c) => quietDays(c, A))).toBe(20);
      expect((await as(admin, (c) => loadPipeline(c, A, TODAY))).lists.quiet.map((q) => q.enquiryId)).not.toContain(QUIET);
      await db.pg.query(`update school_settings set setting_values = '{"quiet_days": 10}' where school_id = $1 and module_id = 'admissions'`, [A]);
      expect((await as(admin, (c) => loadPipeline(c, A, TODAY))).lists.quiet.map((q) => q.enquiryId)).toContain(QUIET);
      expect(await as(admin, (c) => giveEnquiry(c, actor(admin), QUIET, PRINCIPAL))).toMatchObject({ ok: true });
      expect((await as(admin, (c) => loadPipeline(c, A, TODAY))).lists.quiet.map((q) => q.enquiryId)).toContain(QUIET); // giving it on is not a contact
      expect(await as(admin, (c) => recordOutcome(c, actor(admin), QUIET, { note: 'Called: they will visit next week.', stage: 'enquiry', nextStep: '', followUp: '', reason: '' }))).toMatchObject({ ok: true });
      expect((await as(admin, (c) => loadPipeline(c, A, TODAY))).lists.quiet.map((q) => q.enquiryId)).not.toContain(QUIET);
      await db.pg.query(`delete from school_settings where school_id = $1 and module_id = 'admissions'`, [A]);
    });

    it('My Day: the office’s card counts the "follow up today" list; nobody else has the card', async () => {
      const provider = TODAY_PROVIDERS.find((p) => p.type === 'admissions-follow-up')!;
      expect([provider.moduleId, [...provider.roles]]).toEqual(['admissions', ['principal', 'school_admin']]);
      const due = (await as(admin, (c) => loadPipeline(c, A, TODAY))).lists.due.length;
      expect(due).toBeGreaterThanOrEqual(2); // Anaya, overdue, and Riya, due today
      for (const who of [principal, admin]) {
        const cards = await as(who, (c) => provider.load(c, { schoolId: A, userId: who.user, role: who.role as never, sunday: false }));
        expect(cards, who.role).toEqual([{ id: 'admissions-follow-up', type: 'admissions-follow-up', moduleId: 'admissions', state: 'todo', count: due, href: '/app/admissions' }]);
      }
      // Even if a teacher's day asked for it, the database shows a teacher no enquiry to count.
      expect(await as(tara, (c) => followUpsDue(c, A))).toBe(0);
    });
  });

  describe('"Admit" makes exactly one student record, on the class’s fee structure, and the enquiry says admitted', () => {
    it('one new student, waiting for consent, in the class sought, on the structure in force; the enquiry is admitted and for good', async () => {
      expect(await as(admin, (c) => admit(c, actor(admin), RIYA, { admissionNo: 'A-1', dob: null }))).toEqual({ ok: false, reason: 'admission_no_taken' });
      expect(await as(admin, (c) => admit(c, actor(admin), RIYA, { admissionNo: null, dob: day(1) }))).toEqual({ ok: false, reason: 'dob' });
      expect(await studentsNamed('Riya Example')).toEqual([]); // a refusal leaves nothing behind
      const done = await as(admin, (c) => admit(c, actor(admin), RIYA, { admissionNo: 'A-2', dob: '2019-06-01' }));
      expect(done).toMatchObject({ ok: true, className: '5-A', fees: { structure_id: STRUCTURE, academic_year: '2026-27', heads: 1 }, monthRaised: false });
      const made = await studentsNamed('Riya Example');
      expect(made).toEqual([{ student_id: (done as { studentId: string }).studentId, class_id: C5A, status: 'pending_consent', admission_no: 'A-2' }]);
      const row = (await as(admin, (c) => listEnquiries(c, A))).find((r) => r.enquiry_id === RIYA)!;
      expect([row.stage, row.student_id, row.next_follow_up, row.next_step]).toEqual(['admitted', made[0].student_id, null, null]);
      expect((await db.pg.query(`select admitted_structure_id from admission_enquiries where enquiry_id = $1`, [RIYA])).rows[0].admitted_structure_id).toBe(STRUCTURE);
      const last = (await as(admin, (c) => enquirySteps(c, A, RIYA)))!.at(-1)!;
      expect([last.kind, last.stage_to, last.student_id, last.by]).toEqual(['stage', 'admitted', made[0].student_id, 'Asif Admin']);
      // Pressed again: no second record.
      expect(await as(admin, (c) => admit(c, actor(admin), RIYA, { admissionNo: null, dob: null }))).toEqual({ ok: false, reason: 'admitted' });
      expect(await studentsNamed('Riya Example')).toHaveLength(1);
      // Audited: the decision, and the record made.
      const audit = (await db.pg.query(`select event_action, actor_user_id from audit_log where school_id = $1 and (target_id = $2 or target_id = $3) order by event_action`, [A, RIYA, made[0].student_id])).rows.map((r: { event_action: string }) => r.event_action);
      expect(audit).toContain('admissions.admitted');
      expect(audit).toContain('student.create');
      // The child is on the list of children waiting for consent.
      expect((await as(admin, (c) => waitingForConsent(c, A))).rows.map((s) => s.name)).toContain('Riya Example');
    });

    it('the database holds it: one record per enquiry, made in the same step, in the class sought; nothing changes after', async () => {
      const kabir = (await as(admin, (c) => listEnquiries(c, A))).find((r) => r.child_name === 'Kabir Example')!.enquiry_id;
      const riyaStudent = (await studentsNamed('Riya Example'))[0].student_id;
      // An existing pupil cannot be claimed as an admission, nor Riya's record a second time.
      await expect(as(admin, (c) => c.query(`update admission_enquiries set stage = 'admitted', class_id = $3, student_id = $2 where enquiry_id = $1`, [kabir, OLD_STUDENT, C5A]))).rejects.toThrow(/same step/);
      await expect(as(admin, (c) => c.query(`update admission_enquiries set stage = 'admitted', class_id = $3, student_id = $2 where enquiry_id = $1`, [kabir, riyaStudent, C5A]))).rejects.toThrow(/same step|duplicate key/);
      // A new record in another class than the one sought (Kabir's is 6-A).
      await expect(as(admin, async (c) => {
        const s = (await c.query(`insert into students (school_id, name, class_id, status) values ($1, 'Kabir Example', $2, 'pending_consent') returning student_id`, [A, C5A])).rows[0].student_id;
        await c.query(`update admission_enquiries set stage = 'admitted', student_id = $2 where enquiry_id = $1`, [kabir, s]);
      })).rejects.toThrow(/class sought/);
      await expect(as(admin, (c) => c.query(`update admission_enquiries set stage = 'admitted' where enquiry_id = $1`, [kabir]))).rejects.toThrow(/check constraint/);
      await expect(as(admin, (c) => c.query(`update admission_enquiries set next_step = 'again' where enquiry_id = $1`, [RIYA]))).rejects.toThrow(/stays as it is/);
      expect(await as(admin, (c) => recordOutcome(c, actor(admin), RIYA, { note: 'x', stage: 'enquiry', nextStep: '', followUp: '', reason: '' }))).toEqual({ ok: false, reason: 'admitted' });
      expect(await studentsNamed('Kabir Example')).toEqual([]);
    });

    it('on the class’s fee structure: raising the class’s month charges the child from that structure; admitted after the raise, the month raised again adds only the child’s lines', async () => {
      const riya = (await studentsNamed('Riya Example'))[0].student_id;
      const raise = () => as(principal, (c) => raiseDues(c, actor(principal), { classId: C5A, sessionId: SESSION, month: TODAY.slice(0, 7), dueDate: TODAY }));
      expect(await raise()).toMatchObject({ ok: true, raised: 2 }); // Asha and Riya
      const line = (await db.pg.query(`select structure_id, gross_minor from fees_ledger where student_id = $1`, [riya])).rows;
      expect(line.map((l: { structure_id: string; gross_minor: unknown }) => [l.structure_id, Number(l.gross_minor)])).toEqual([[STRUCTURE, 150000]]);
      const later = await record(admin, { childName: 'Meher Example', phone: '9800000105' });
      const done = await as(principal, (c) => admit(c, actor(principal), later, { admissionNo: null, dob: null }));
      expect(done).toMatchObject({ ok: true, fees: { structure_id: STRUCTURE }, monthRaised: true });
      expect(await raise()).toMatchObject({ ok: true, raised: 1, alreadyThere: 2 });
      // A class with no structure in force: admitted all the same, and the screen is told so.
      const sixA = await record(admin, { childName: 'Ishaan Example', phone: '9800000106', classId: C6A });
      expect(await as(admin, (c) => admit(c, actor(admin), sixA, { admissionNo: null, dob: null }))).toMatchObject({ ok: true, className: '6-A', fees: null, monthRaised: false });
      expect((await db.pg.query(`select admitted_structure_id from admission_enquiries where enquiry_id = $1`, [sixA])).rows[0].admitted_structure_id).toBeNull();
    });
  });

  describe('a teacher and an accountant are refused, by the app and by the database', () => {
    it('the app refuses every step to anyone outside the office', async () => {
      const kabir = (await as(admin, (c) => listEnquiries(c, A))).find((r) => r.child_name === 'Kabir Example')!.enquiry_id;
      for (const who of [tara, accountant, coordinator]) {
        expect(await as(who, (c) => recordEnquiry(c, actor(who), base)), who.role).toEqual({ ok: false, reason: 'not_allowed' });
        expect(await as(who, (c) => recordOutcome(c, actor(who), kabir, { note: 'x', stage: 'visited', nextStep: '', followUp: '', reason: '' })), who.role).toEqual({ ok: false, reason: 'not_allowed' });
        expect(await as(who, (c) => giveEnquiry(c, actor(who), kabir, ADMIN)), who.role).toEqual({ ok: false, reason: 'not_allowed' });
        expect(await as(who, (c) => correctDetails(c, actor(who), kabir, { ...base })), who.role).toEqual({ ok: false, reason: 'not_allowed' });
        expect(await as(who, (c) => admit(c, actor(who), kabir, { admissionNo: null, dob: null })), who.role).toEqual({ ok: false, reason: 'not_allowed' });
      }
      expect(await studentsNamed('Kabir Example')).toEqual([]);
    });

    it('the database shows them no enquiry, no step and no audit row, and takes no write; nor does it for another school or the platform role', async () => {
      const kabir = (await as(admin, (c) => listEnquiries(c, A))).find((r) => r.child_name === 'Kabir Example')!.enquiry_id;
      const office = (await as<Rows>(principal, (c) => c.query(`select count(*)::int as n from admission_enquiries`))).rows[0].n;
      expect(office).toBeGreaterThanOrEqual(5);
      expect((await as<Rows>(principal, (c) => c.query(`select count(*)::int as n from audit_log where event_action like 'admissions.%'`))).rows[0].n).toBeGreaterThan(0);
      for (const who of [tara, accountant, coordinator, principalB]) {
        const n = async (sql: string) => (await as<Rows>(who, (c) => c.query(sql))).rows[0].n;
        expect(await n(`select count(*)::int as n from admission_enquiries`), who.role).toBe(0);
        expect(await n(`select count(*)::int as n from admission_events`), who.role).toBe(0);
        expect(await as(who, (c) => listEnquiries(c, A)), who.role).toEqual([]);
        expect(await as(who, (c) => enquirySteps(c, A, kabir)), who.role).toBeNull();
        const updated = await as<Rows>(who, (c) => c.query(`update admission_enquiries set next_step = 'mine now' where enquiry_id = $1 returning enquiry_id`, [kabir]));
        expect(updated.rows, who.role).toEqual([]);
        await expect(as(who, (c) => c.query(`insert into admission_enquiries (school_id, child_name, guardian_name, phone, class_id, source, owner_id, created_by) values ($1, 'Z', 'Z', '+919800000109', $2, 'other', $3, $4)`, [A, C5A, ADMIN, who.user])), who.role).rejects.toThrow(/row-level security|violates foreign key|followed up by the office/); // (another school's session cannot even see school A's office)
        await expect(as(who, (c) => c.query(`insert into admission_events (school_id, enquiry_id, kind, note, by_user) values ($1, $2, 'note', 'x', $3)`, [A, kabir, who.user])), who.role).rejects.toThrow(/row-level security|violates foreign key/);
      }
      for (const who of [tara, accountant, coordinator]) {
        expect((await as<Rows>(who, (c) => c.query(`select count(*)::int as n from audit_log where event_action like 'admissions.%'`))).rows[0].n, who.role).toBe(0);
      }
      // Another school's principal cannot act on this school's enquiry through the app either.
      expect(await as(principalB, (c) => admit(c, actor(principalB), kabir, { admissionNo: null, dob: null }))).toEqual({ ok: false, reason: 'not_found' });
      // The platform role holds no right on either table.
      await expect(platform((c) => c.query(`select count(*) from admission_enquiries`))).rejects.toThrow(/permission denied/);
      await expect(platform((c) => c.query(`select count(*) from admission_events`))).rejects.toThrow(/permission denied/);
      expect((await db.pg.query(`select next_step from admission_enquiries where enquiry_id = $1`, [kabir])).rows[0].next_step).not.toBe('mine now');
    });
  });
});
