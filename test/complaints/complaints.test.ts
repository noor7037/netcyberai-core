import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { addNote, assignComplaint, closeComplaint, complaintEscalateHandler, listComplaints, openComplaint, reference } from '@/lib/complaints/complaints';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { TEMPLATE_REGISTRY, definitionProblem } from '@/lib/whatsapp/templates';

// Complaints (docs/25 slice 7m, C195). The acceptance test: nothing closes without a note; an overdue complaint
// reaches the principal; a teacher never sees a complaint about themselves before the principal does. Every name
// and number is made up.

describe('the words', () => {
  it('every complaint template names the school first', () => {
    const mine = TEMPLATE_REGISTRY.filter((t) => t.name.startsWith('complaint_'));
    expect(mine.map((t) => t.name)).toEqual(['complaint_received', 'complaint_escalated', 'complaint_closed']);
    for (const t of mine) expect(definitionProblem(t), t.name).toBeNull();
  });
});

const A = 'cd000000-0000-4000-8000-000000000001';
const u = (n: number) => `cd000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, TARA, TARUN, ACCOUNTANT] = [u(11), u(12), u(13), u(14), u(15)];
const [CLASS_5A, CLASS_6B] = [u(51), u(52)];
const [ASHA, FARAH] = [u(31), u(36)];
const [G_ASHA, G_FARAH, G_NO_NUMBER] = [u(41), u(46), u(48)];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
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
type Out = { rows: { n: number }[]; rowCount: number };
const actor = (who: Who) => ({ schoolId: A, userId: who.user, role: who.role as never });
const refs = (rows: { ref: string }[]) => rows.map((r) => r.ref).sort();
const told = async (id: string) => (await db.pg.query(`select template_name as t, template_params as p, status::text as status from communication_log where dedupe_key like $1 order by created_at, log_id`, [`complaint:${id}:%`])).rows;
const escalate = (id: string, at: Date) => complaintEscalateHandler({ platform, queue, now: () => at })({ jobId: 'j', type: 'complaint.escalate', payload: { complaintId: id }, attempts: 1, maxAttempts: 3, schoolId: A, idempotencyKey: 'k' });
const open = async (who: Who, input: Partial<Parameters<typeof openComplaint>[3]>) => {
  const r = await as(who, (c) => openComplaint(c, queue, actor(who), { parentId: G_ASHA, studentId: ASHA, aboutUserId: null, ownerId: who.user, summary: 'The bus reached school late three days this week.', dueHours: 48, source: 'office', ...input }));
  if (!r.ok) throw new Error(r.reason);
  return r.complaintId;
};
let BUS = '';
let ABOUT_TARA = '';

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end) values ('${A}', 'School A', 'IN-HR', false, false, true, 100000, '00:00', '00:00');
      insert into users (user_id, school_id, email, role, display_name) values ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'admin@school-a.example', 'school_admin', 'Asif Admin'),
        ('${TARA}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Teacher'), ('${TARUN}', '${A}', 'tarun@school-a.example', 'teacher', 'Tarun Teacher'), ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant');
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${CLASS_5A}', '${A}', '5-A', '${TARA}'), ('${CLASS_6B}', '${A}', '6-B', '${TARUN}');
      insert into students (student_id, school_id, admission_no, name, status, class_id) values ('${ASHA}', '${A}', 'A-1', 'Asha', 'active', '${CLASS_5A}'), ('${FARAH}', '${A}', 'A-6', 'Farah', 'active', '${CLASS_6B}');
      insert into parents (parent_id, school_id, name, phone) values ('${G_ASHA}', '${A}', 'Anita Sharma', '9000000001'), ('${G_FARAH}', '${A}', 'Fatima Ali', '9000000006'), ('${G_NO_NUMBER}', '${A}', 'Nikhil Nanda', 'not given');
      insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${G_ASHA}', '${ASHA}'), ('${A}', '${G_FARAH}', '${FARAH}'), ('${A}', '${G_NO_NUMBER}', '${FARAH}');
    `);
    for (const t of TEMPLATE_REGISTRY.filter((x) => x.name.startsWith('complaint_'))) await db.pg.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status) values (null, $1, 1, 'en', $2, $3, 'utility', $4, 'approved')`, [t.name, t.body.en, [...t.variables], t.staleAfterMinutes]);
    for (const s of [ASHA, FARAH]) await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1'`, [A, s]);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('a complaint has an owner and a due time, and the parent is told it was noted and by when', async () => {
    expect(await as({ role: 'accountant', user: ACCOUNTANT }, (c) => openComplaint(c, queue, { schoolId: A, userId: ACCOUNTANT, role: 'accountant' as never }, { parentId: G_ASHA, studentId: ASHA, aboutUserId: null, ownerId: ADMIN, summary: 'x', dueHours: 48, source: 'office' }))).toEqual({ ok: false, reason: 'not_allowed' });
    const base = { parentId: G_ASHA, studentId: ASHA, aboutUserId: null, ownerId: ADMIN, summary: 'The bus reached school late three days this week.', dueHours: 48, source: 'office' as const };
    expect(await as(admin, (c) => openComplaint(c, queue, actor(admin), { ...base, summary: '  ' }))).toEqual({ ok: false, reason: 'summary' });
    expect(await as(admin, (c) => openComplaint(c, queue, actor(admin), { ...base, dueHours: 500 }))).toEqual({ ok: false, reason: 'due' });
    expect(await as(admin, (c) => openComplaint(c, queue, actor(admin), { ...base, ownerId: ACCOUNTANT }))).toEqual({ ok: false, reason: 'owner' });
    expect(await as(admin, (c) => openComplaint(c, queue, actor(admin), { ...base, studentId: FARAH }))).toEqual({ ok: false, reason: 'child' });
    expect(await as(admin, (c) => openComplaint(c, queue, actor(admin), { ...base, aboutUserId: TARA, ownerId: TARA }))).toEqual({ ok: false, reason: 'owner_is_about' });
    // A teacher takes one for themselves; one about a member of staff, or for someone else, goes through the office.
    expect(await as(tara, (c) => openComplaint(c, queue, actor(tara), { ...base, ownerId: ADMIN }))).toEqual({ ok: false, reason: 'for_the_office' });
    expect(await as(tara, (c) => openComplaint(c, queue, actor(tara), { ...base, ownerId: TARA, aboutUserId: TARUN }))).toEqual({ ok: false, reason: 'for_the_office' });
    expect(await as(tara, (c) => openComplaint(c, queue, actor(tara), { ...base, ownerId: TARA, parentId: G_FARAH, studentId: FARAH }))).toEqual({ ok: false, reason: 'guardian' }); // not her class's guardian
    const t0 = new Date();
    const made = await as(admin, (c) => openComplaint(c, queue, actor(admin), base, t0));
    expect(made).toMatchObject({ ok: true, parentTold: true });
    BUS = (made as { complaintId: string }).complaintId;
    const said = await told(BUS);
    expect(said.map((r: { t: string; status: string }) => [r.t, r.status])).toEqual([['complaint_received', 'queued']]);
    expect(said[0].p).toMatchObject({ ref: reference(BUS), owner: 'Asif Admin' });
    const job = (await db.pg.query(`select next_run_at from jobs where type = 'complaint.escalate'`)).rows;
    expect(job).toHaveLength(1);
    expect(new Date(job[0].next_run_at).getTime()).toBe(t0.getTime() + 48 * 3600_000);
    const [row] = await as(admin, (c) => listComplaints(c, actor(admin)));
    expect(row).toMatchObject({ guardian: 'Anita Sharma', child: 'Asha', owner: 'Asif Admin', status: 'open', overdue: false, escalated: false, mayChange: true });
    expect(row.events.map((e) => [e.kind, e.by, e.parent_told])).toEqual([['opened', 'Asif Admin', true]]);
  });

  it('nothing closes without a note: not through the app, and not in the database', async () => {
    expect(await as(admin, (c) => closeComplaint(c, queue, actor(admin), BUS, '   '))).toEqual({ ok: false, reason: 'note' });
    await expect(as(admin, (c) => c.query(`update complaints set status = 'closed', closed_by = '${ADMIN}', closed_at = now() where complaint_id = '${BUS}'`))).rejects.toThrow(/check constraint/);
    await expect(as(admin, (c) => c.query(`update complaints set status = 'closed', closed_by = '${ADMIN}', closed_at = now(), closing_note = '  ' where complaint_id = '${BUS}'`))).rejects.toThrow(/check constraint/);
    await expect(as(admin, (c) => c.query(`update complaints set summary = 'something else' where complaint_id = '${BUS}'`))).rejects.toThrow(/never changed/);
    await expect(as(admin, (c) => c.query(`delete from complaints where complaint_id = '${BUS}'`))).rejects.toThrow(/permission denied/);
    await expect(as(admin, (c) => c.query(`update complaint_events set note = 'x' where complaint_id = '${BUS}'`))).rejects.toThrow(/permission denied/);
    expect((await as(admin, (c) => listComplaints(c, actor(admin))))[0].status).toBe('open');
    // Someone who is neither its owner nor the office cannot close or add to it, even if they can see it.
    expect(await as(tara, (c) => closeComplaint(c, queue, actor(tara), BUS, 'Done.'))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(tara, (c) => addNote(c, actor(tara), BUS, 'x'))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(tarun, (c) => closeComplaint(c, queue, actor(tarun), BUS, 'Done.'))).toEqual({ ok: false, reason: 'not_found' }); // not his class's child
  });

  it('an overdue complaint reaches the principal: at its due time it becomes the principal’s, and the parent is told', async () => {
    await expect(escalate(BUS, new Date(Date.now() + 47 * 3600_000))).rejects.toThrow(/not due yet/);
    expect((await as(principal, (c) => listComplaints(c, actor(principal))))[0]).toMatchObject({ owner: 'Asif Admin', escalated: false });
    const late = new Date(Date.now() + 49 * 3600_000);
    await escalate(BUS, late);
    const [row] = await as(principal, (c) => listComplaints(c, actor(principal), late));
    expect(row).toMatchObject({ owner: 'Priya Principal', escalated: true, overdue: true, mayChange: true });
    expect(row.events.map((e) => [e.kind, e.by, e.parent_told])).toEqual([['opened', 'Asif Admin', true], ['escalated', null, true]]);
    expect((await told(BUS)).map((r: { t: string }) => r.t)).toEqual(['complaint_received', 'complaint_escalated']);
    // Once: a second run changes nothing.
    await escalate(BUS, new Date(late.getTime() + 3600_000));
    expect((await as(principal, (c) => listComplaints(c, actor(principal), late)))[0].events).toHaveLength(2);
    // The principal's My Day counts it.
    expect((await as<Out>(principal, (c) => c.query(`select count(*)::int as n from complaints where school_id = $1 and status = 'open' and due_at <= $2`, [A, late]))).rows[0].n).toBe(1);
  });

  it('closed with a note, the note is what the parent is told; a closed complaint stays closed and is never escalated', async () => {
    expect(await as(principal, (c) => addNote(c, actor(principal), BUS, 'Spoke to the transport contractor.'))).toEqual({ ok: true });
    expect(await as(principal, (c) => closeComplaint(c, queue, actor(principal), BUS, 'The bus now leaves\nten minutes earlier.'))).toEqual({ ok: true, parentTold: true });
    const said = await told(BUS);
    expect(said.map((r: { t: string }) => r.t)).toEqual(['complaint_received', 'complaint_escalated', 'complaint_closed']);
    expect(said[2].p).toEqual({ ref: reference(BUS), note: 'The bus now leaves ten minutes earlier.' });
    const [row] = await as(admin, (c) => listComplaints(c, actor(admin)));
    expect(row).toMatchObject({ status: 'closed', closing_note: 'The bus now leaves ten minutes earlier.', overdue: false, mayChange: false });
    expect(row.events.map((e) => e.kind).sort()).toEqual(['closed', 'escalated', 'note', 'opened']); // in time order on the screen; the test escalated it with a clock set ahead
    expect(await as(principal, (c) => closeComplaint(c, queue, actor(principal), BUS, 'Again.'))).toEqual({ ok: false, reason: 'closed' });
    await expect(as(principal, (c) => c.query(`update complaints set status = 'open', closed_by = null, closed_at = null, closing_note = null where complaint_id = '${BUS}'`))).rejects.toThrow(/stays closed/);
    const quick = await open(admin, { summary: 'Homework was not checked.' });
    expect(await as(admin, (c) => closeComplaint(c, queue, actor(admin), quick, 'The teacher has checked it now.'))).toMatchObject({ ok: true });
    await escalate(quick, new Date(Date.now() + 100 * 3600_000));
    expect((await as(principal, (c) => listComplaints(c, actor(principal)))).find((r) => r.complaint_id === quick)).toMatchObject({ status: 'closed', escalated: false, owner: 'Asif Admin' });
  });

  it('a teacher never sees a complaint about themselves before the principal does', async () => {
    // About Tara, from the guardian of a child in her own class, given to the admin to look into.
    ABOUT_TARA = await open(admin, { aboutUserId: TARA, ownerId: ADMIN, summary: 'The teacher spoke harshly to my daughter in front of the class.' });
    const hers = async () => refs(await as(tara, (c) => listComplaints(c, actor(tara))));
    expect(await hers()).not.toContain(reference(ABOUT_TARA));
    // Not by its id, not its events, not by trying to change it.
    expect((await as<Out>(tara, (c) => c.query(`select count(*)::int as n from complaints where complaint_id = '${ABOUT_TARA}'`))).rows[0].n).toBe(0);
    expect((await as<Out>(tara, (c) => c.query(`select count(*)::int as n from complaint_events where complaint_id = '${ABOUT_TARA}'`))).rows[0].n).toBe(0);
    expect((await as<Out>(tara, (c) => c.query(`update complaints set principal_seen_at = now() where complaint_id = '${ABOUT_TARA}'`))).rowCount).toBe(0);
    expect(await as(tara, (c) => addNote(c, actor(tara), ABOUT_TARA, 'x'))).toEqual({ ok: false, reason: 'not_found' });
    // The admin sees it (it is not about him) but cannot say the principal has seen it, and cannot give it to Tara.
    expect(refs(await as(admin, (c) => listComplaints(c, actor(admin))))).toContain(reference(ABOUT_TARA));
    await expect(as(admin, (c) => c.query(`update complaints set principal_seen_at = now() where complaint_id = '${ABOUT_TARA}'`))).rejects.toThrow(/only the principal/);
    expect(await as(admin, (c) => assignComplaint(c, actor(admin), ABOUT_TARA, TARA))).toEqual({ ok: false, reason: 'owner_is_about' });
    expect(await hers()).not.toContain(reference(ABOUT_TARA));
    // The principal looks. From then on Tara may see it: it is about a child of her class.
    expect(refs(await as(principal, (c) => listComplaints(c, actor(principal))))).toContain(reference(ABOUT_TARA));
    expect(await hers()).toContain(reference(ABOUT_TARA));
    expect((await as(tara, (c) => listComplaints(c, actor(tara)))).find((r) => r.complaint_id === ABOUT_TARA)).toMatchObject({ about: 'Tara Teacher', mayChange: false });
    // The same rule holds for the school admin: one about him is hidden from him until the principal has seen it.
    expect(await as(admin, (c) => openComplaint(c, queue, actor(admin), { parentId: G_FARAH, studentId: FARAH, aboutUserId: ADMIN, ownerId: TARUN, summary: 'About the admin.', dueHours: 24, source: 'office' }))).toEqual({ ok: false, reason: 'about' });
    const made = await as(tarun, (c) => openComplaint(c, queue, actor(tarun), { parentId: G_FARAH, studentId: FARAH, aboutUserId: null, ownerId: TARUN, summary: 'The office did not return my call.', dueHours: 24, source: 'thread' }));
    const aboutAdmin = (made as { complaintId: string }).complaintId;
    // (Recorded as about the admin by the owner of the database, as a principal's session would have written it.)
    await db.pg.exec(`set session_replication_role = replica; update complaints set about_user_id = '${ADMIN}' where complaint_id = '${aboutAdmin}'; set session_replication_role = origin;`);
    expect(refs(await as(admin, (c) => listComplaints(c, actor(admin))))).not.toContain(reference(aboutAdmin));
    expect(refs(await as(principal, (c) => listComplaints(c, actor(principal))))).toContain(reference(aboutAdmin));
    expect(refs(await as(admin, (c) => listComplaints(c, actor(admin))))).toContain(reference(aboutAdmin));
  });

  it('a teacher sees the complaints they own and those of their own classes’ children; a parent with no number is recorded as not told', async () => {
    expect(refs(await as(tarun, (c) => listComplaints(c, actor(tarun))))).toHaveLength(1); // his own, about Farah; nothing of 5-A
    const quiet = await as(tarun, (c) => openComplaint(c, queue, actor(tarun), { parentId: G_NO_NUMBER, studentId: FARAH, aboutUserId: null, ownerId: TARUN, summary: 'The classroom fan does not work.', dueHours: 72, source: 'office' }));
    expect(quiet).toMatchObject({ ok: true, parentTold: false });
    expect(await told((quiet as { complaintId: string }).complaintId)).toEqual([]);
    expect(await as(admin, (c) => assignComplaint(c, actor(admin), (quiet as { complaintId: string }).complaintId, ADMIN))).toEqual({ ok: true });
    const row = (await as(tarun, (c) => listComplaints(c, actor(tarun)))).find((r) => r.complaint_id === (quiet as { complaintId: string }).complaintId)!;
    expect(row).toMatchObject({ owner: 'Asif Admin', mayChange: false });
    expect(row.events.map((e) => [e.kind, e.note, e.parent_told])).toEqual([['opened', null, false], ['assigned', 'Asif Admin', false]]);
  });
});
