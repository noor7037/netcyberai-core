import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { admit, deleteEnquiry, deleteFamilyEnquiries, enquirySteps, familyEnquiries, listEnquiries, recordEnquiry, recordOutcome } from '@/lib/admissions/admissions';
import { pseudonymizeStudent } from '@/lib/consent/dsr';
import { hasAadhaarNumber } from '@/lib/students/data-check-rules';

// C224 (C223-A answers 3, 6 and 7): the erasure of a child's data blanks the child's admission enquiry and keeps it;
// the office deletes an enquiry that was not admitted, and every such enquiry of a family that never joined, by
// phone; the database holds every part of it; the audit rows hold ids and counts, never a name or a phone; the
// free-text columns of Admissions use the one Aadhaar rule. Every name and number here is made up.

const A = 'ae240000-0000-4000-8000-000000000001';
const B = 'ae240000-0000-4000-8000-000000000002';
const u = (n: number) => `ae240000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, TARA, ACCOUNTANT, COORD, PRINCIPAL_B] = [u(11), u(12), u(13), u(14), u(15), u(21)];
const [C5A, C6A, C5B] = [u(51), u(52), u(53)];
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
const actor = (who: Who) => ({ schoolId: who.school ?? A, userId: who.user, role: who.role as never });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rows = { rows: any[]; rowCount: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const owner = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows as any[];
const base = { childName: 'Riya Example', guardianName: 'Sunita Example', phone: '98000 00301', classId: C5A, source: 'walk_in', ownerId: ADMIN, followUp: null as string | null, nextStep: 'Show her the classrooms' as string | null, note: 'Mother came in with Riya.' as string | null };
const record = async (input: Partial<typeof base> = {}) => {
  const r = await as(admin, (c) => recordEnquiry(c, actor(admin), { ...base, ...input }));
  if (!r.ok) throw new Error(r.reason);
  return r.enquiryId;
};
const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};
const auditOf = (action: string) => owner(`select target_id, before_state, after_state from audit_log where school_id = $1 and event_action = $2 order by audit_id`, [A, action]);

describe('on the real schema, as the app’s own role', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false), ('${B}', 'School B', 'IN-DL', false);
      insert into users (user_id, school_id, email, role, display_name, is_active) values
        ('${PRINCIPAL}', '${A}', 'principal@er-a.example', 'principal', 'Priya Principal', true),
        ('${ADMIN}', '${A}', 'admin@er-a.example', 'school_admin', 'Asif Admin', true),
        ('${TARA}', '${A}', 'tara@er-a.example', 'teacher', 'Tara Teacher', true),
        ('${ACCOUNTANT}', '${A}', 'accounts@er-a.example', 'accountant', 'Anil Accountant', true),
        ('${COORD}', '${A}', 'coord@er-a.example', 'academic_coordinator', 'Chitra Coordinator', true),
        ('${PRINCIPAL_B}', '${B}', 'principal@er-b.example', 'principal', 'Pooja B', true);
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5A}', '${A}', '5-A', '${TARA}'), ('${C6A}', '${A}', '6-A', null), ('${C5B}', '${B}', '5-B', null);
    `);
  }, 120_000);
  afterAll(async () => db?.stop());

  describe('the erasure of the child’s data blanks the child’s admission enquiry, and keeps it with its steps', () => {
    let RIYA = '';
    let STUDENT = '';
    it('every name, the phone, each note and next step are blanked; the stage, class, source, owner and steps stay', async () => {
      RIYA = await record({ followUp: null });
      ok(await as(admin, (c) => recordOutcome(c, actor(admin), RIYA, { note: 'Sunita called about the bus.', stage: 'visited', nextStep: 'Collect the form from Sunita', followUp: '', reason: '' })));
      ok(await as(admin, (c) => recordOutcome(c, actor(admin), RIYA, { note: '', stage: 'not_joining', nextStep: '', followUp: '', reason: 'Riya may go to her cousin’s school' })));
      ok(await as(admin, (c) => recordOutcome(c, actor(admin), RIYA, { note: 'They came back.', stage: 'form_submitted', nextStep: 'Admit Riya', followUp: '', reason: '' })));
      STUDENT = ok(await as(admin, (c) => admit(c, actor(admin), RIYA, { admissionNo: 'R-1', dob: '2019-06-01' }))).studentId;
      const before = (await as(principal, (c) => enquirySteps(c, A, RIYA)))!;
      expect(before.some((s) => s.note !== null || s.next_step !== null)).toBe(true);

      const done = await as(principal, (c) => pseudonymizeStudent(c, A, STUDENT));
      const wordy = before.filter((s) => s.note !== null || s.next_step !== null).length;
      expect([done.admissionEnquiriesErased, done.admissionStepsErased]).toEqual([1, wordy]);

      const [row] = await owner(`select child_name, guardian_name, phone, next_step, closed_reason, stage, class_id, source, owner_id, student_id, erased_at from admission_enquiries where enquiry_id = $1`, [RIYA]);
      expect(row).toMatchObject({ child_name: null, guardian_name: null, phone: null, next_step: null, closed_reason: null, stage: 'admitted', class_id: C5A, source: 'walk_in', owner_id: ADMIN, student_id: STUDENT });
      expect(row.erased_at).not.toBeNull();
      const after = (await as(principal, (c) => enquirySteps(c, A, RIYA)))!;
      // Every step is kept, in order, with no words; one more says the erasure was carried out, and by whom.
      expect(after.slice(0, before.length).map((s) => [s.kind, s.stage_from, s.stage_to, s.by])).toEqual(before.map((s) => [s.kind, s.stage_from, s.stage_to, s.by]));
      expect(after.every((s) => s.note === null && s.next_step === null)).toBe(true);
      expect(after.slice(before.length).map((s) => [s.kind, s.by])).toEqual([['erased', 'Priya Principal']]);
      // The screen lists it with no name, and says when.
      const listed = (await as(admin, (c) => listEnquiries(c, A))).find((r) => r.enquiry_id === RIYA)!;
      expect([listed.child_name, listed.guardian_name, listed.phone, listed.stage]).toEqual([null, null, null, 'admitted']);
      expect(listed.erased_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Nothing of the family is left in the database's rows about the enquiry.
      const kept = JSON.stringify(await owner(`select e.*, (select json_agg(v) from admission_events v where v.enquiry_id = e.enquiry_id) as steps from admission_enquiries e where e.enquiry_id = $1`, [RIYA]));
      for (const word of ['Riya', 'Sunita', '9800000301', 'cousin', 'bus']) expect(kept, word).not.toContain(word);
      // A second erasure finds nothing left to blank.
      expect((await as(principal, async (c) => (await c.query(`select enquiries, steps from public.erase_admission_enquiries($1)`, [STUDENT])).rows[0]))).toEqual({ enquiries: 0, steps: 0 });
    });

    it('an erased enquiry never changes again, and nobody but the erasure blanks one', async () => {
      await expect(as(admin, (c) => c.query(`update admission_enquiries set source = 'other' where enquiry_id = $1`, [RIYA]))).rejects.toThrow(/erased enquiry stays/);
      await expect(as(admin, (c) => c.query(`update admission_enquiries set erased_at = null, child_name = 'Back', guardian_name = 'Back', phone = '+919800000399' where enquiry_id = $1`, [RIYA]))).rejects.toThrow(/erased enquiry stays/);
      // The office cannot erase an enquiry by hand: only the database's own function does, as its owner.
      const other = await record({ childName: 'Kabir Example', phone: '9800000302' });
      await expect(as(admin, (c) => c.query(`update admission_enquiries set erased_at = now(), child_name = null, guardian_name = null, phone = null, next_step = null where enquiry_id = $1`, [other]))).rejects.toThrow(/only by the erasure of a data request/);
      // Names and phone are empty only when erased (the database's check).
      await expect(as(admin, (c) => c.query(`update admission_enquiries set child_name = null where enquiry_id = $1`, [other]))).rejects.toThrow(/admission_enquiries_erased/);
      await expect(as(admin, (c) => c.query(`insert into admission_enquiries (school_id, child_name, guardian_name, phone, class_id, source, owner_id, created_by, erased_at) values ($1, null, null, null, $2, 'other', $3, $3, now())`, [A, C5A, ADMIN]))).rejects.toThrow(/only the erasure/);
      // A note may lose its words only through an erasure: the steps are append-only for the app.
      await expect(as(admin, (c) => c.query(`update admission_events set note = null, erased_at = now() where enquiry_id = $1`, [other]))).rejects.toThrow(/permission denied/);
      await expect(owner(`insert into admission_events (school_id, enquiry_id, kind, by_user) values ($1, $2, 'note', $3)`, [A, other, ADMIN])).rejects.toThrow(/admission_events_note_says_something/);
      ok(await as(admin, (c) => deleteEnquiry(c, actor(admin), other)));
    });

    it('the erasure function answers the principal and the school admin of the child’s school only', async () => {
      const erase = (who: Who) => as(who, async (c) => (await c.query(`select enquiries, steps from public.erase_admission_enquiries($1)`, [STUDENT])).rows[0]);
      for (const who of [tara, accountant, coordinator]) await expect(erase(who), who.role).rejects.toThrow(/principal or the school admin/);
      // Another school's principal reaches nothing of school A's.
      expect(await erase(principalB)).toEqual({ enquiries: 0, steps: 0 });
      // The platform role may not call it at all.
      await expect(platform((c) => c.query(`select * from public.erase_admission_enquiries($1)`, [STUDENT]))).rejects.toThrow(/permission denied/);
      const unknown = await as(admin, async (c) => (await c.query(`select enquiries, steps from public.erase_admission_enquiries($1)`, [u(99)])).rows[0]);
      expect(unknown).toEqual({ enquiries: 0, steps: 0 });
    });
  });

  describe('the office deletes an enquiry, with its steps; never an admitted one', () => {
    it('one enquiry: deleted with its steps, audited with ids and counts; an admitted one is refused, by the app and the database', async () => {
      const zoya = await record({ childName: 'Zoya Example', guardianName: 'Nadia Example', phone: '9800000303', note: 'Nadia asked on WhatsApp.' });
      ok(await as(admin, (c) => recordOutcome(c, actor(admin), zoya, { note: 'Called Nadia back.', stage: 'visit_booked', nextStep: 'Visit on Saturday', followUp: '', reason: '' })));
      const steps = (await owner(`select count(*)::int as n from admission_events where enquiry_id = $1`, [zoya]))[0].n;
      for (const who of [tara, accountant, coordinator]) expect(await as(who, (c) => deleteEnquiry(c, actor(who), zoya)), who.role).toEqual({ ok: false, reason: 'not_allowed' });
      expect(await as(principalB, (c) => deleteEnquiry(c, actor(principalB), zoya))).toEqual({ ok: false, reason: 'not_found' });
      expect(await as(principal, (c) => deleteEnquiry(c, actor(principal), zoya))).toEqual({ ok: true, enquiryId: zoya, steps });
      expect(await owner(`select 1 from admission_enquiries where enquiry_id = $1 union all select 1 from admission_events where enquiry_id = $1`, [zoya])).toEqual([]);
      const audit = (await auditOf('admissions.deleted')).find((r) => r.target_id === zoya);
      expect(audit).toEqual({ target_id: zoya, before_state: { stage: 'visit_booked', classId: C5A }, after_state: { steps } });
      expect(await as(principal, (c) => deleteEnquiry(c, actor(principal), zoya))).toEqual({ ok: false, reason: 'not_found' });

      // An admitted enquiry is the child's record: refused by the app, and by the database's function.
      const admitted = await record({ childName: 'Meher Example', phone: '9800000304' });
      ok(await as(admin, (c) => admit(c, actor(admin), admitted, { admissionNo: null, dob: null })));
      expect(await as(admin, (c) => deleteEnquiry(c, actor(admin), admitted))).toEqual({ ok: false, reason: 'admitted' });
      await expect(as(admin, (c) => c.query(`select public.delete_admission_enquiry($1)`, [admitted]))).rejects.toThrow(/child's record/);
      expect((await owner(`select stage from admission_enquiries where enquiry_id = $1`, [admitted]))[0].stage).toBe('admitted');
    });

    it('the database holds it: no DELETE for the app’s role; the function answers the office of the school only; nothing for the platform role', async () => {
      const ishaan = await record({ childName: 'Ishaan Example', phone: '9800000305' });
      await expect(as(admin, (c) => c.query(`delete from admission_events where enquiry_id = $1`, [ishaan]))).rejects.toThrow(/permission denied/);
      await expect(as(admin, (c) => c.query(`delete from admission_enquiries where enquiry_id = $1`, [ishaan]))).rejects.toThrow(/permission denied/);
      for (const who of [tara, accountant, coordinator]) {
        await expect(as(who, (c) => c.query(`select public.delete_admission_enquiry($1)`, [ishaan])), who.role).rejects.toThrow(/principal or the school admin/);
        await expect(as(who, (c) => c.query(`select * from public.delete_family_enquiries('+919800000305', '{}')`)), who.role).rejects.toThrow(/principal or the school admin/);
      }
      // Another school's principal: no such enquiry there, and none of school A's found by its phone.
      expect((await as<Rows>(principalB, (c) => c.query(`select public.delete_admission_enquiry($1) as n`, [ishaan]))).rows[0].n).toBeNull();
      expect((await as<Rows>(principalB, (c) => c.query(`select * from public.delete_family_enquiries('+919800000305', '{}')`))).rows).toEqual([]);
      await expect(platform((c) => c.query(`select public.delete_admission_enquiry($1)`, [ishaan]))).rejects.toThrow(/permission denied/);
      await expect(platform((c) => c.query(`select * from public.delete_family_enquiries('+919800000305', '{}')`))).rejects.toThrow(/permission denied/);
      // The phone as the enquiries keep it, nothing else.
      await expect(as(admin, (c) => c.query(`select * from public.delete_family_enquiries('98000 00305', '{}')`))).rejects.toThrow(/\+ and digits/);
      expect((await owner(`select count(*)::int as n from admission_enquiries where enquiry_id = $1`, [ishaan]))[0].n).toBe(1);
      ok(await as(admin, (c) => deleteEnquiry(c, actor(admin), ishaan)));
    });
  });

  describe('review of C224: the erasure of a child also deletes the family’s other enquiries that were not admitted', () => {
    it('by the admitted enquiry’s phone; a sibling who was admitted and another family are kept', async () => {
      const meera = await record({ childName: 'Meera Example', guardianName: 'Lata Example', phone: '98000 00330' });
      const meeraStudent = ok(await as(admin, (c) => admit(c, actor(admin), meera, { admissionNo: null, dob: null }))).studentId;
      const sister = await record({ childName: 'Neha Example', guardianName: 'Lata Example', phone: '9800000330', note: 'Lata asked about class 6 for Neha.' });
      const brother = await record({ childName: 'Om Example', guardianName: 'Lata Example', phone: '+91 98000 00330' });
      const brotherStudent = ok(await as(admin, (c) => admit(c, actor(admin), brother, { admissionNo: null, dob: null }))).studentId;
      const other = await record({ childName: 'Pia Example', guardianName: 'Rina Example', phone: '9800000331' });
      const got = (await as(principal, async (c) => (await c.query(`select enquiries, steps, family_enquiries from public.erase_admission_enquiries($1)`, [meeraStudent])).rows[0]));
      expect(got).toMatchObject({ enquiries: 1, family_enquiries: 1 });
      const left = await owner(`select enquiry_id, child_name, erased_at is not null as erased from admission_enquiries where enquiry_id = any($1::uuid[]) order by created_at`, [[meera, sister, brother, other]]);
      expect(left).toEqual([
        { enquiry_id: meera, child_name: null, erased: true },
        { enquiry_id: brother, child_name: 'Om Example', erased: false },
        { enquiry_id: other, child_name: 'Pia Example', erased: false },
      ]);
      expect((await owner(`select count(*)::int as n from admission_events where enquiry_id = $1`, [sister]))[0].n).toBe(0);
      expect(brotherStudent).toBeTruthy();
    });
  });

  describe('a parent’s erasure request about a family that never joined: every not-admitted enquiry with the phone', () => {
    it('finds them by what the office types, deletes those it showed with their steps, keeps the admitted one and another family’s', async () => {
      const first = await record({ childName: 'Aarav Example', guardianName: 'Kavita Example', phone: '+91 98000 00310', note: 'Kavita asked about class 5.' });
      const second = await record({ childName: 'Anya Example', guardianName: 'Kavita Example', phone: '98000-00310', classId: C6A, nextStep: 'Call Kavita on Monday' });
      ok(await as(admin, (c) => recordOutcome(c, actor(admin), second, { note: '', stage: 'not_joining', nextStep: '', followUp: '', reason: 'Kavita chose another school' })));
      const joined = await record({ childName: 'Ayaan Example', guardianName: 'Kavita Example', phone: '9800000310' });
      const joinedStudent = ok(await as(admin, (c) => admit(c, actor(admin), joined, { admissionNo: null, dob: null }))).studentId;
      const neighbour = await record({ childName: 'Dev Example', guardianName: 'Rekha Example', phone: '9800000311' });

      // Typed as the office types it: read as the enquiries keep it.
      for (const typed of ['98000 00310', '+919800000310', '09800000310', '919800000310']) {
        const found = ok(await as(admin, (c) => familyEnquiries(c, actor(admin), typed))).family;
        expect(found.phone, typed).toBe('+919800000310');
        expect(found.enquiries.map((e) => e.enquiry_id).sort(), typed).toEqual([first, second].sort());
        expect(found.admitted, typed).toBe(1);
      }
      expect(await as(admin, (c) => familyEnquiries(c, actor(admin), '12345'))).toEqual({ ok: false, reason: 'phone' });
      for (const who of [tara, accountant]) expect(await as(who, (c) => familyEnquiries(c, actor(who), '9800000310')), who.role).toEqual({ ok: false, reason: 'not_allowed' });
      expect(ok(await as(principalB, (c) => familyEnquiries(c, actor(principalB), '9800000310'))).family.enquiries).toEqual([]);

      // The list confirmed is the list deleted, or nothing is.
      expect(await as(admin, (c) => deleteFamilyEnquiries(c, actor(admin), '9800000310', [first]))).toEqual({ ok: false, reason: 'changed' });
      // Review of C224: the database itself deletes only the list it is given, under a lock, and only if it is still
      // exactly the family's: a shorter list, or one with an id that is not the family's, deletes nothing.
      for (const ids of [[first], [first, second, neighbour], [first, second, joined]]) {
        expect((await as<Rows>(admin, (c) => c.query(`select * from public.delete_family_enquiries('+919800000310', $1::uuid[])`, [ids]))).rows, ids.join()).toEqual([]);
      }
      expect((await owner(`select count(*)::int as n from admission_enquiries where enquiry_id = any($1::uuid[])`, [[first, second, joined, neighbour]]))[0].n).toBe(4);
      expect(await as(admin, (c) => deleteFamilyEnquiries(c, actor(admin), '9800000310', 'all'))).toEqual({ ok: false, reason: 'changed' });
      expect(await as(tara, (c) => deleteFamilyEnquiries(c, actor(tara), '9800000310', [first, second]))).toEqual({ ok: false, reason: 'not_allowed' });
      const steps = (await owner(`select count(*)::int as n from admission_events where enquiry_id = any($1::uuid[])`, [[first, second]]))[0].n;
      const done = ok(await as(principal, (c) => deleteFamilyEnquiries(c, actor(principal), '98000 00310', [second, first])));
      expect([done.enquiryIds.sort(), done.steps]).toEqual([[first, second].sort(), steps]);
      expect(await owner(`select enquiry_id from admission_enquiries where enquiry_id = any($1::uuid[]) order by child_name`, [[first, second, joined, neighbour]])).toEqual([{ enquiry_id: joined }, { enquiry_id: neighbour }]);
      expect((await owner(`select count(*)::int as n from admission_events where enquiry_id = any($1::uuid[])`, [[first, second]]))[0].n).toBe(0);
      // The admitted child's record is untouched, and erased only with that child's data.
      expect((await owner(`select child_name, phone, student_id from admission_enquiries where enquiry_id = $1`, [joined]))[0]).toEqual({ child_name: 'Ayaan Example', phone: '+919800000310', student_id: joinedStudent });
      // Nothing left to delete.
      expect(await as(principal, (c) => deleteFamilyEnquiries(c, actor(principal), '9800000310', []))).toEqual({ ok: false, reason: 'nothing' });

      const [audit] = await auditOf('admissions.family_deleted');
      expect(audit.after_state.enquiryIds.sort()).toEqual([first, second].sort());
      expect(audit.after_state).toMatchObject({ enquiries: 2, steps, admittedKept: 1 });
      expect(audit.target_id).toBeNull();
    });
  });

  it('the audit rows of Admissions, its deletions and its erasures hold no name and no phone', async () => {
    const rows = await owner(`select event_action, before_state, after_state from audit_log where school_id = $1 and (event_action like 'admissions.%' or event_action like 'student.%')`, [A]);
    expect(rows.length).toBeGreaterThan(10);
    const said = JSON.stringify(rows);
    for (const word of ['Example', 'Riya', 'Sunita', 'Kavita', 'Nadia', 'Zoya', '98000', '+91', 'bus', 'WhatsApp', '2019-06-01', 'R-1']) expect(said, word).not.toContain(word);
    // Admit's own record of the student made: its class and state, never the child's name or date of birth.
    const made = rows.filter((r: { event_action: string }) => r.event_action === 'student.create');
    expect(made.length).toBeGreaterThan(0);
    for (const r of made) expect(Object.keys(r.after_state).sort()).toEqual(['classId', 'fromEnquiry', 'status', 'withAdmissionNo', 'withDob']);
  });

  it('one Aadhaar rule (C223-A answer 6): every free-text column of Admissions refuses what hasAadhaarNumber refuses, and keeps what it keeps', async () => {
    const refused = ['1234 5678 9012', 'card 2345-6789-0123 seen', 'ref 1234567890123', '१२३४ ५६७८ ९०१२'];
    const kept = ['Call 98000 00320 after 5', 'Visit on 14/10/2026', 'Class 5-A, roll 12'];
    for (const s of refused) expect(hasAadhaarNumber(s), s).toBe(true);
    for (const s of kept) expect(hasAadhaarNumber(s), s).toBe(false);
    for (const s of refused) expect((await owner(`select public.no_aadhaar_number($1) as ok`, [s]))[0].ok, s).toBe(false);
    for (const s of kept) expect((await owner(`select public.no_aadhaar_number($1) as ok`, [s]))[0].ok, s).toBe(true);
    // The app refuses first ...
    expect(await as(admin, (c) => recordEnquiry(c, actor(admin), { ...base, phone: '9800000320', note: 'ref 1234567890123' }))).toEqual({ ok: false, reason: 'aadhaar' });
    expect(await as(admin, (c) => recordEnquiry(c, actor(admin), { ...base, phone: '9800000320', childName: 'Riya १२३४ ५६७८ ९०१२' }))).toEqual({ ok: false, reason: 'aadhaar' });
    // ... and the database refuses too, in every column, where the 4-4-4 pattern of C221 let these through.
    const insert = (cols: string, vals: string) => as(admin, (c) => c.query(`insert into admission_enquiries (school_id, class_id, source, owner_id, created_by, phone, ${cols}) values ($1, $2, 'other', $3, $3, '+919800000320', ${vals})`, [A, C5A, ADMIN]));
    await expect(insert('child_name, guardian_name', `'Z 1234567890123', 'Z'`)).rejects.toThrow(/admission_enquiries_child_name_check/);
    await expect(insert('child_name, guardian_name', `'Z', 'Z १२३४ ५६७८ ९०१२'`)).rejects.toThrow(/admission_enquiries_guardian_name_check/);
    await expect(insert('child_name, guardian_name, next_step', `'Z', 'Z', 'ref 1234567890123'`)).rejects.toThrow(/admission_enquiries_next_step_check/);
    const open = await record({ childName: 'Tara Example', phone: '9800000321' });
    await expect(as(admin, (c) => c.query(`update admission_enquiries set stage = 'not_joining', closed_reason = 'ref 1234567890123', next_step = null where enquiry_id = $1`, [open]))).rejects.toThrow(/admission_enquiries_closed_reason_check/);
    await expect(as(admin, (c) => c.query(`insert into admission_events (school_id, enquiry_id, kind, note, by_user) values ($1, $2, 'note', 'ref 1234567890123', $3)`, [A, open, ADMIN]))).rejects.toThrow(/admission_events_note_check/);
    await expect(owner(`insert into admission_events (school_id, enquiry_id, kind, follow_up, next_step, by_user) values ($1, $2, 'follow_up', null, 'ref 1234567890123', $3)`, [A, open, ADMIN])).rejects.toThrow(/admission_events_next_step_check/);
  });
});

describe('the migration checks every existing row against the one rule before it changes a check', () => {
  it('stops, naming the column, when a row holds what the one rule refuses (and never shows the value)', async () => {
    const S = 'ae240000-0000-4000-8000-0000000000a1';
    const before = `
      set session_replication_role = replica;
      insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${S}', 'School M', 'IN-HR', false);
      insert into users (user_id, school_id, email, role, display_name, is_active) values ('${u(81)}', '${S}', 'p@m.example', 'principal', 'P', true);
      insert into classes (class_id, school_id, name) values ('${u(82)}', '${S}', '5-A');
      insert into admission_enquiries (school_id, child_name, guardian_name, phone, class_id, source, owner_id, created_by, next_step)
      values ('${S}', 'Old Row', 'Old Guardian', '+919800000399', '${u(82)}', 'other', '${u(81)}', '${u(81)}', 'ref 1234567890123');
      set session_replication_role = origin;`;
    let failed: Error | null = null;
    try {
      const other = await startHarnessDb({ port: 0, before: { migration: '_c224_closeout.sql', sql: before } });
      await other.stop();
    } catch (err) {
      failed = err as Error;
    }
    expect(failed?.message).toMatch(/admission_enquiries\.next_step holds a value that public\.no_aadhaar_number refuses/);
    expect(failed?.message).not.toContain('1234567890123');
  }, 120_000);
});
