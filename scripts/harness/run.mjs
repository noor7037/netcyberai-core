#!/usr/bin/env node
// The screenshot harness (C133): shows the REAL signed-in screens of /app and
// /control on a throwaway local database, and photographs them.
//
//   node scripts/harness/run.mjs                 screenshots into ./harness-output
//   node scripts/harness/run.mjs --serve         leave the app running, print sign-in links
//   node scripts/harness/run.mjs --out <dir> --only <substring>
//   node scripts/harness/run.mjs --keep docs/screenshots/<pr-slug> --screens app-hindi,control-hindi
//       also saves those screens as compressed WebP for the PR (C134: no
//       full-size PNG in git, only screens the PR changes, 1.5 MB per PR at most)
//
// What it does: (1) starts the harness database (db.mjs: the real
// migrations plus src/demo-fixture/harness-seed.sql), (2) starts `next dev`
// pointed at it, with a session secret made up for this run, (3) signs
// session cookies for the seeded people with that secret, (4) opens each
// screen at 1440 and 390 with Playwright, checks it, and saves a picture.
//
// Why this cannot reach production (marker: NCA_SCREENSHOT_HARNESS):
// nothing under src/ imports this folder, so none of it is in a build; it
// adds no route to the app; the cookie is signed with a secret that exists
// only in this process, so it is worthless against any other deployment;
// and it refuses to start outside a local development run.
// scripts/check_harness_isolation.py enforces the first three in CI.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SignJWT } from 'jose';
import { HARNESS_MARKER, startHarnessDb } from './db.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const SERVE = process.argv.includes('--serve');
const OUT = path.resolve(arg('--out') ?? path.join(ROOT, 'harness-output'));
const ONLY = arg('--only');
const KEEP = arg('--keep') ? path.resolve(arg('--keep')) : null;
const KEEP_SCREENS = (arg('--screens') ?? '').split(',').filter(Boolean);
const KEEP_LIMIT_BYTES = 1.5 * 1024 * 1024;
if (KEEP && !KEEP_SCREENS.length) {
  console.error('harness: --keep needs --screens name1,name2 (only the screens the PR changes).');
  process.exit(2);
}
const APP_PORT = Number(arg('--port') ?? 3210);
if (!Number.isInteger(APP_PORT) || APP_PORT < 1024 || APP_PORT > 65000) {
  console.error('harness: --port must be a number between 1024 and 65000.');
  process.exit(2);
}
const DB_PORT = APP_PORT + 1;

// Local development only.
if (process.env.NODE_ENV === 'production' || process.env.VERCEL || process.env.CI_DEPLOY) {
  console.error('harness: refusing to run: this is a local development tool.');
  process.exit(2);
}

const SCHOOL = 'a0000000-0000-4000-8000-000000000001';
const STUDENT = '00000000-0000-4000-8000-000000500001';
const STUDENT_NO_GUARDIAN = '00000000-0000-4000-8000-000000500002';
const TICKET = '00000000-0000-4000-8000-0000000f0001';
const PEOPLE = {
  principal: { sub: '00000000-0000-4000-8000-00000000a001', role: 'principal', schoolId: SCHOOL, membershipId: '00000000-0000-4000-8000-0000000a1001' },
  office: { sub: '00000000-0000-4000-8000-00000000a002', role: 'school_admin', schoolId: SCHOOL, membershipId: '00000000-0000-4000-8000-0000000a1002' },
  teacher: { sub: '00000000-0000-4000-8000-00000000a003', role: 'teacher', schoolId: SCHOOL, membershipId: '00000000-0000-4000-8000-0000000a1003' },
  founder: { sub: '00000000-0000-4000-8000-00000000f001', role: 'super_admin', schoolId: null, membershipId: null },
};

// Every screen moved onto ModulePage in P1c-2, plus the two dashboards.
// `prepare` runs in the page before the picture (choose a class, and so on).
const chooseClass = async (page) => {
  await page.selectOption('select', { label: '5-A' }).catch(() => undefined);
  await page.waitForTimeout(800);
};
// Marking with no network (C144), the way a teacher does it: open the class,
// lose the network, tap one student absent, submit. The picture is taken with
// the submission waiting on the phone. Then the network returns: the sync
// line must say saved, and every student of the class must hold exactly one
// mark for today. The day's seeded marks are put back after, so the screens that follow see the same school.
const TODAY_SQL = `(now() at time zone 'Asia/Kolkata')::date`;
const CLASS_5A = '00000000-0000-4000-8000-0000000c0051';
const marksToday = async () => (await db.pg.query(`select count(*)::int as n, count(distinct student_id)::int as students, count(*) filter (where status = 'absent')::int as absent from attendance where school_id = $1 and class_id = $2 and date = ${TODAY_SQL}`, [SCHOOL, CLASS_5A])).rows[0];
const clearMarksToday = () => db.pg.query(`delete from attendance where school_id = $1 and class_id = $2 and date = ${TODAY_SQL}`, [SCHOOL, CLASS_5A]);
let rosterSize = 0;
let seededMarks = [];
const markOffline = async (page) => {
  seededMarks = (await db.pg.query(`select student_id, status, marked_by from attendance where school_id = $1 and class_id = $2 and date = ${TODAY_SQL}`, [SCHOOL, CLASS_5A])).rows;
  await clearMarksToday();
  await page.reload({ waitUntil: 'networkidle' });
  await chooseClass(page);
  await page.locator('[data-student-row]').first().waitFor({ timeout: 15000 });
  rosterSize = await page.locator('[data-student-row]').count();
  await page.context().setOffline(true);
  await page.locator('[data-sync="offline"]').waitFor({ timeout: 15000 });
  await page.locator('[data-student-row]').first().getByRole('button', { name: 'Absent' }).click();
  await page.locator('[data-submit-attendance]').click();
  await page.locator('[data-sync="waiting"]').waitFor({ timeout: 15000 });
  await page.locator('[data-waiting]').first().waitFor({ timeout: 15000 });
  const before = await marksToday();
  if (before.n !== 0) throw new Error(`offline, yet ${before.n} marks reached the database`);
};
const backOnline = async (page) => {
  await page.context().setOffline(false);
  await page.locator('[data-sync="saved"]').waitFor({ timeout: 30000 });
  const saved = await marksToday();
  await clearMarksToday();
  for (const m of seededMarks) await db.pg.query(`insert into attendance (school_id, class_id, date, student_id, status, marked_by) values ($1, $2, ${TODAY_SQL}, $3, $4, $5)`, [SCHOOL, CLASS_5A, m.student_id, m.status, m.marked_by]);
  if (saved.n !== rosterSize || saved.students !== rosterSize || saved.absent !== 1) throw new Error(`after reconnecting: ${saved.n} marks for ${saved.students} students (${saved.absent} absent), expected ${rosterSize} marks, one each, 1 absent`);
};
// One tap "taught today" (C147), offline: the network goes, the teacher taps
// the next syllabus topic, the tap waits; the network returns and there is
// exactly one classwork log row and one Pulse draft for it.
const taughtRows = async () => (await db.pg.query(`select (select count(*)::int from syllabus_progress where school_id = $1 and date = ${TODAY_SQL}) as log, (select count(*)::int from pulse_messages where school_id = $1 and sent_on = ${TODAY_SQL} and status = 'draft') as drafts, (select count(*)::int from usage_events where school_id = $1 and kind = 'taught.tap' and day = ${TODAY_SQL}) as taps`, [SCHOOL])).rows[0];
const clearTaught = () => db.pg.exec(`delete from pulse_messages; delete from syllabus_progress; delete from usage_events where kind = 'taught.tap';`);
const oneTapTaught = async (page) => {
  await clearTaught();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-one-tap]').first().waitFor({ timeout: 15000 });
  await page.context().setOffline(true);
  await page.locator('[data-sync="offline"]').waitFor({ timeout: 15000 });
  await page.locator('[data-one-tap]').first().click();
  await page.locator('[data-sync="waiting"]').waitFor({ timeout: 15000 });
  await page.locator('[data-lesson] [data-waiting]').first().waitFor({ timeout: 15000 });
  const before = await taughtRows();
  if (before.log !== 0) throw new Error('offline, yet the lesson reached the database');
};
const oneTapTaughtDone = async (page) => {
  await page.context().setOffline(false);
  await page.locator('[data-sync="saved"]').waitFor({ timeout: 30000 });
  const after = await taughtRows();
  await clearTaught();
  if (after.log !== 1 || after.drafts !== 1 || after.taps !== 1) throw new Error(`after reconnecting: ${after.log} log rows, ${after.drafts} drafts, ${after.taps} measurements; expected one of each`);
};
// Homework (C150), as a teacher does it: set one for today, open it, lose the
// network, mark everyone done, save. The picture is taken with the check
// waiting. Network back: each student of the section holds one answer.
const clearHomework = () => db.pg.exec(`delete from homework_status; delete from homework_attachments; delete from homework_targets; delete from homework;`);
let homeworkStudents = 0;
const homeworkFlow = async (page) => {
  await clearHomework();
  await page.reload({ waitUntil: 'networkidle' });
  const today = (await db.pg.query(`select ${TODAY_SQL}::text as d`)).rows[0].d;
  await page.selectOption('#hw-subject', { label: 'Mathematics' });
  await page.locator('#hw-due').fill(today);
  await page.locator('#hw-title').fill('Fractions: questions 1 to 5, page 42');
  await page.locator('[data-set-homework] input[type=checkbox]').first().check();
  await page.locator('[data-set-go]').click();
  await page.locator('[data-assignment]').first().waitFor({ timeout: 15000 });
  await page.locator('[data-check]').first().click();
  await page.locator('[data-check-row]').first().waitFor({ timeout: 15000 });
  homeworkStudents = await page.locator('[data-check-row]').count();
  await page.context().setOffline(true);
  await page.locator('[data-sync="offline"]').waitFor({ timeout: 15000 });
  await page.locator('[data-all-done]').click();
  await page.locator('[data-save-check]').click();
  await page.locator('[data-sync="waiting"]').waitFor({ timeout: 15000 });
  const { rows } = await db.pg.query(`select count(*)::int as n from homework_status`);
  if (rows[0].n !== 0) throw new Error('offline, yet the check reached the database');
};
const homeworkFlowDone = async (page) => {
  await page.context().setOffline(false);
  await page.locator('[data-sync="saved"]').waitFor({ timeout: 30000 });
  const { rows } = await db.pg.query(`select count(*)::int as n, count(*) filter (where done)::int as done, (select count(*)::int from homework_targets) as targets from homework_status`);
  await clearHomework();
  if (rows[0].targets !== 1 || rows[0].n !== homeworkStudents || rows[0].done !== homeworkStudents) throw new Error(`after reconnecting: ${rows[0].n} answers (${rows[0].done} done) for ${homeworkStudents} students in ${rows[0].targets} assignment(s)`);
};
// Today's message to parents (C151): a lesson is recorded and homework set
// through the app's own API, the message appears with both, the teacher
// marks it ready, and nothing is sent.
let loggedBefore = 0;
const sendingRows = async () => (await db.pg.query(`select (select count(*)::int from communication_log) + (select count(*)::int from jobs) as n`)).rows[0].n;
const pulseMessage = async (page) => {
  loggedBefore = await sendingRows();
  await clearHomework();
  await clearTaught();
  const today = (await db.pg.query(`select ${TODAY_SQL}::text as d`)).rows[0].d;
  const sent = await page.evaluate(async (today) => {
    const json = (method, url, body) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.status);
    const taught = await json('PUT', '/api/app/syllabus', { classId: '00000000-0000-4000-8000-0000000c0051', subjectId: '00000000-0000-4000-8000-0000000d0001', topic: 'Fractions: halves and quarters', status: 'taught' });
    const homework = await json('POST', '/api/app/homework', { subjectId: '00000000-0000-4000-8000-0000000d0001', title: 'Questions 1 to 5, page 42', dueDate: today, classIds: ['00000000-0000-4000-8000-0000000c0051'] });
    return [taught, homework];
  }, today);
  if (sent.join() !== '201,201') throw new Error(`the lesson or the homework was not saved: ${sent}`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-pulse-draft]').first().waitFor({ timeout: 15000 });
  const words = await page.locator('[data-pulse-draft] textarea').first().inputValue();
  if (!words.includes('Fractions: halves and quarters') || !words.includes('Questions 1 to 5, page 42')) throw new Error(`the message does not hold the lesson and the homework: ${words}`);
  await page.locator('[data-mark-ready]').first().click();
  await page.locator('[data-pulse-draft]').getByText('Ready', { exact: true }).first().waitFor({ timeout: 15000 });
  await page.getByRole('tab', { name: 'Hinglish' }).first().click();
};
const pulseMessageDone = async () => {
  const { rows } = await db.pg.query(`select (select count(*)::int from pulse_messages where status = 'ready') as ready, (select count(*)::int from pulse_messages where status = 'sent') as sent, $1::int as logged`, [(await sendingRows()) - loggedBefore]);
  await clearHomework();
  await clearTaught();
  if (rows[0].ready !== 1 || rows[0].sent !== 0 || rows[0].logged !== 0) throw new Error(`expected one ready message and nothing sent: ${JSON.stringify(rows[0])}`);
};
// Homework Recovery (C152): one student marked "not done" for three
// homeworks in the last days is listed with a plan; the teacher approves it;
// the card leaves the list and nothing is sent.
const recoveryList = async (page) => {
  await db.pg.exec(`delete from recovery_plans;`);
  await clearHomework();
  for (let i = 1; i <= 3; i++) {
    const { rows } = await db.pg.query(`insert into homework (school_id, subject_id, title, due_date, created_by) values ($1, '00000000-0000-4000-8000-0000000d0001', $2, ${TODAY_SQL} - $3::int, $4) returning homework_id`, [SCHOOL, `Fractions worksheet ${i}`, i, PEOPLE.teacher.sub]);
    const target = await db.pg.query(`insert into homework_targets (school_id, homework_id, class_id, title, due_date) values ($1, $2, $3, $4, ${TODAY_SQL} - $5::int) returning target_id`, [SCHOOL, rows[0].homework_id, CLASS_5A, `Fractions worksheet ${i}`, i]);
    await db.pg.query(`insert into homework_status (school_id, target_id, class_id, student_id, done, checked_by) values ($1, $2, $3, $4, false, $5)`, [SCHOOL, target.rows[0].target_id, CLASS_5A, STUDENT, PEOPLE.teacher.sub]);
  }
  loggedBefore = await sendingRows();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-candidate]').first().waitFor({ timeout: 15000 });
};
const recoveryApprove = async (page) => {
  await page.locator('[data-approve]').first().click();
  await page.locator('[data-empty="recovery"]').waitFor({ timeout: 15000 });
  const { rows } = await db.pg.query(`select status, jsonb_array_length(items) as items from recovery_plans`);
  const grew = (await sendingRows()) - loggedBefore;
  await db.pg.exec(`delete from recovery_plans;`);
  await clearHomework();
  if (rows.length !== 1 || rows[0].status !== 'approved' || rows[0].items !== 3 || grew !== 0) throw new Error(`expected one approved plan of 3 homeworks and nothing sent: ${JSON.stringify(rows)} sent ${grew}`);
};
// Teacher Copilot (C154) on the stand-in: a draft appears, the teacher
// changes it and approves; one note is saved under the teacher's name and
// one use is metered.
const copilotDraft = async (page) => {
  await db.pg.exec(`delete from teaching_notes; delete from ai_usage;`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.selectOption('#cp-pair', { index: 1 });
  const pairs = await page.locator('#cp-pair option').allTextContents();
  await page.selectOption('#cp-pair', { label: pairs.find((p) => p.includes('Mathematics')) });
  await page.selectOption('#cp-topic', { index: 1 });
  await page.locator('[data-draft]').click();
  await page.locator('[data-copilot-draft] textarea').waitFor({ timeout: 15000 });
  if ((await db.pg.query(`select count(*)::int as n from teaching_notes`)).rows[0].n !== 0) throw new Error('a draft was saved before approval');
  await page.locator('[data-copilot-draft] textarea').press('End');
  await page.locator('[data-copilot-draft] textarea').pressSequentially(' (checked)');
};
const copilotApprove = async (page) => {
  await page.locator('[data-approve]').click();
  await page.locator('[data-notes]').waitFor({ timeout: 15000 });
  const { rows } = await db.pg.query(`select (select count(*)::int from teaching_notes where ai_assisted and approved_by = $1 and body like '%(checked)%') as notes, (select count(*)::int from ai_usage where user_id = $1) as uses`, [PEOPLE.teacher.sub]);
  await db.pg.exec(`delete from teaching_notes; delete from ai_usage;`);
  if (rows[0].notes !== 1 || rows[0].uses !== 1) throw new Error(`expected one approved note and one metered use: ${JSON.stringify(rows[0])}`);
};
// Fees (C157): the office adds a head and sets a class's structure; then a
// second version from a later date. Both versions must be on the page and in
// the database, the first untouched.
const feeRows = async () => (await db.pg.query(`select f.effective_from::text as from_date, (select sum(i.amount_minor)::int from fee_structure_items i where i.structure_id = f.structure_id) as total from fee_structures f where f.school_id = $1 and f.class_id = $2 and f.created_by = $3 order by f.effective_from`, [SCHOOL, CLASS_5A, PEOPLE.principal.sub])).rows;
const clearFees = async () => {
  await db.pg.query(`delete from fee_structure_items where structure_id in (select structure_id from fee_structures where school_id = $1 and created_by = $2)`, [SCHOOL, PEOPLE.principal.sub]);
  await db.pg.query(`delete from fee_structures where school_id = $1 and created_by = $2`, [SCHOOL, PEOPLE.principal.sub]);
  await db.pg.query(`delete from fee_heads where school_id = $1 and name = 'Harness activity fee'`, [SCHOOL]);
};
const feesSetup = async (page) => {
  await clearFees();
  await db.pg.query(`insert into academic_sessions (school_id, label, start_date, end_date, is_current) select $1, 'Harness session', ${TODAY_SQL} - 30, ${TODAY_SQL} + 300, not exists (select 1 from academic_sessions where school_id = $1 and is_current) where not exists (select 1 from academic_sessions where school_id = $1 and label = 'Harness session')`, [SCHOOL]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#fee-head-name').fill('Harness activity fee');
  await page.locator('[data-add-head]').click();
  await page.getByText('Harness activity fee').first().waitFor({ timeout: 15000 });
  await page.selectOption('#fee-class', { label: '5-A' });
  await page.selectOption('#fee-session', { label: 'Harness session' });
  const day = (n) => db.pg.query(`select (${TODAY_SQL} + $1::int)::text as d`, [n]).then((r) => r.rows[0].d);
  const saveVersion = async (date, amount) => {
    await page.locator('#fee-from').fill(date);
    const box = page.locator('[data-new-version] input[inputmode="decimal"]').last();
    await box.fill(amount);
    await page.locator('[data-save-version]').click();
    await page.locator(`[data-version="${date}"]`).waitFor({ timeout: 15000 });
  };
  await saveVersion(await day(-10), '1500.50');
  await saveVersion(await day(20), '1650');
};
const feesSetupDone = async () => {
  const rows = await feeRows();
  await clearFees();
  if (rows.length !== 2 || rows[0].total !== 150050 || rows[1].total !== 165000) throw new Error(`expected two versions, 1,500.50 then 1,650, the first untouched: ${JSON.stringify(rows)}`);
};
// Dues (C159): a head and a structure are set through the app's own API,
// then the office raises this month for 5-A on the page, twice. Each student
// on the rolls (active or waiting for consent, C162) must hold exactly one line, and every line must add up.
let duesStudents = 0;
const clearDues = async () => {
  await db.pg.query(`delete from fees_ledger where school_id = $1 and structure_id in (select structure_id from fee_structures where school_id = $1 and created_by = $2)`, [SCHOOL, PEOPLE.principal.sub]);
  await clearFees();
};
const feesDues = async (page) => {
  await clearDues();
  await db.pg.query(`insert into academic_sessions (school_id, label, start_date, end_date, is_current) select $1, 'Harness session', ${TODAY_SQL} - 30, ${TODAY_SQL} + 300, not exists (select 1 from academic_sessions where school_id = $1 and is_current) where not exists (select 1 from academic_sessions where school_id = $1 and label = 'Harness session')`, [SCHOOL]);
  const session = (await db.pg.query(`select session_id, start_date::text as start_date from academic_sessions where school_id = $1 and label = 'Harness session'`, [SCHOOL])).rows[0];
  const made = await page.evaluate(async ({ session, classId }) => {
    const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
    const head = await post('/api/app/fees/heads', { name: 'Harness activity fee' });
    const structure = await post('/api/app/fees/structures', { classId, sessionId: session.session_id, effectiveFrom: session.start_date, items: [{ headId: head.body.head?.head_id, amountMinor: 150050, frequency: 'monthly' }] });
    return [head.status, structure.status];
  }, { session, classId: CLASS_5A });
  if (made.join() !== '201,201') throw new Error(`the head or the structure was not saved: ${made}`);
  duesStudents = (await db.pg.query(`select count(*)::int as n from students where school_id = $1 and class_id = $2 and status in ('active', 'pending_consent')`, [SCHOOL, CLASS_5A])).rows[0].n;
  await page.reload({ waitUntil: 'networkidle' });
  await page.selectOption('#due-class', { label: '5-A' });
  await page.selectOption('#due-session', { label: 'Harness session' });
  await page.locator('#due-date').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('#due-date')?.value !== '', null, { timeout: 15000 });
  await page.locator('[data-raise]').click();
  await page.locator('[data-due-line]').first().waitFor({ timeout: 15000 });
  await page.locator('[data-raise]').click();
  await page.waitForTimeout(1500);
};
const feesDuesDone = async () => {
  const { rows } = await db.pg.query(`select count(*)::int as n, count(distinct student_id)::int as students, sum(amount_minor)::bigint as net, count(*) filter (where gross_minor - concession_minor <> amount_minor)::int as wrong from fees_ledger where school_id = $1 and structure_id in (select structure_id from fee_structures where school_id = $1 and created_by = $2)`, [SCHOOL, PEOPLE.principal.sub]);
  await clearDues();
  const r = rows[0];
  if (r.n !== duesStudents || r.students !== duesStudents || Number(r.net) !== duesStudents * 150050 || r.wrong !== 0) throw new Error(`expected ${duesStudents} lines, one per active student, 1,500.50 each, all adding up: ${JSON.stringify(r)}`);
};
// A payment at the counter (C160): dues are raised as above, the office takes
// a part payment for the first student, pressing the button twice, and opens
// the receipt. One receipt, one credit, and the school's figures reconcile.
const clearPayments = async () => {
  // By receipt, not by due: the money goes to the student's oldest dues first, and those are the seed's.
  // The status trigger runs on the delete and puts each due's status back.
  await db.pg.query(`delete from payments where receipt_id in (select receipt_id from receipts where school_id = $1 and issued_by = $2)`, [SCHOOL, PEOPLE.principal.sub]);
  await db.pg.query(`delete from receipts where school_id = $1 and issued_by = $2`, [SCHOOL, PEOPLE.principal.sub]);
};
const feesPay = async (page) => {
  await clearPayments();
  await feesDues(page);
  await page.selectOption('#pay-class', { label: '5-A' });
  await page.waitForFunction(() => document.querySelectorAll('#pay-student option').length > 1, null, { timeout: 15000 });
  await page.selectOption('#pay-student', { index: 1 });
  await page.locator('[data-open-due]').first().waitFor({ timeout: 15000 });
  await page.locator('#pay-amount').fill('1000');
  await page.selectOption('#pay-method', 'upi');
  await page.locator('#pay-reference').fill('UPI 4411');
  await page.locator('[data-take]').dblclick();
  await page.locator('[data-last-receipt] a').waitFor({ timeout: 15000 });
  await page.locator('[data-last-receipt] a').click();
  await page.locator('[data-receipt]').waitFor({ timeout: 20000 });
};
const feesPayDone = async () => {
  const { rows } = await db.pg.query(`select (select count(*)::int from receipts where school_id = $1 and issued_by = $2) as receipts, (select coalesce(sum(total_minor), 0)::int from receipts where school_id = $1 and issued_by = $2) as received, (select coalesce(sum(p.amount_minor), 0)::int from payments p join receipts r on r.receipt_id = p.receipt_id where r.school_id = $1 and r.issued_by = $2) as credited`, [SCHOOL, PEOPLE.principal.sub]);
  await clearPayments();
  await clearDues();
  const r = rows[0];
  if (r.receipts !== 1 || r.received !== 100000 || r.credited !== 100000) throw new Error(`expected one receipt of 1,000 credited once: ${JSON.stringify(r)}`);
};
// Sign-out through the shell's own button (C161): the cookies go, and the
// app sends the next visit to the sign-in page.
const signOut = async (page) => {
  if (page.viewportSize().width < 768) await page.getByRole('button', { name: 'Open menu' }).first().click();
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await page.waitForURL(/\/login/, { timeout: 20000 });
  await page.goto(page.url().replace(/\/login.*$/, '/app/my-day'), { waitUntil: 'networkidle' });
  if (!/\/login/.test(page.url())) throw new Error(`after signing out, /app/my-day still opened: ${page.url()}`);
  if ((await page.context().cookies()).some((c) => c.name === 'nca_access')) throw new Error('the session cookie is still there after signing out');
};
// The "needs help" queue (C148): one student waiting, then the outcome is
// recorded and the card leaves the queue.
const needsHelp = async (page) => {
  await db.pg.query(`delete from pulse_followups where school_id = $1`, [SCHOOL]);
  await db.pg.query(`insert into pulse_followups (school_id, student_id, class_id, kind, reason, created_by) values ($1, $2, $3, 'did_not_understand', 'Fractions on the number line', $4)`, [SCHOOL, STUDENT, CLASS_5A, PEOPLE.teacher.sub]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-followup]').first().waitFor({ timeout: 15000 });
};
const needsHelpDone = async (page) => {
  await page.locator('[data-followup] input').first().fill('Sat with the student for five minutes after class');
  await page.locator('[data-followup]').first().getByRole('button', { name: 'Done' }).click();
  await page.locator('[data-empty="needs-help"]').waitFor({ timeout: 15000 });
  const { rows } = await db.pg.query(`select status, outcome, decided_by from pulse_followups where school_id = $1`, [SCHOOL]);
  await db.pg.query(`delete from pulse_followups where school_id = $1`, [SCHOOL]);
  if (rows.length !== 1 || rows[0].status !== 'done' || !rows[0].outcome || rows[0].decided_by !== PEOPLE.teacher.sub) throw new Error(`the outcome was not recorded: ${JSON.stringify(rows)}`);
};
// The office's correction path (C146): a teacher's late marks wait at the top
// of the screen, and yesterday is open for entry with a reason.
const officeCorrections = async (page) => {
  await db.pg.query(`delete from attendance_correction_requests where school_id = $1`, [SCHOOL]);
  await db.pg.query(
    `insert into attendance_correction_requests (school_id, class_id, for_date, requested_by, entries)
     select $1, $2, ${TODAY_SQL} - 1, $3, jsonb_agg(jsonb_build_object('studentId', student_id, 'status', 'present', 'leaveCode', null)) from students where school_id = $1 and class_id = $2`,
    [SCHOOL, CLASS_5A, PEOPLE.teacher.sub]
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-request]').first().waitFor({ timeout: 15000 });
  const yesterday = (await db.pg.query(`select (${TODAY_SQL} - 1)::text as d`)).rows[0].d;
  await page.locator('[data-attendance-day]').fill(yesterday);
  await chooseClass(page);
  await page.locator('[data-past-day]').waitFor({ timeout: 15000 });
};
const officeCorrectionsDone = () => db.pg.query(`delete from attendance_correction_requests where school_id = $1`, [SCHOOL]);
// The clash guard, as the office meets it (C145): in 5-B, period 1 on Monday,
// choose the teacher who is teaching 5-A at that time. The period is not saved.
const timetableClash = async (page) => {
  await page.selectOption('#timetable-class', { label: '5-B' });
  await page.locator('[data-slot="1-1"]').click();
  await page.selectOption('#timetable-teacher', { label: 'Tara Example' });
  await page.getByRole('button', { name: 'Save period' }).click();
  await page.locator('[data-clash]').waitFor({ timeout: 15000 });
  const { rows } = await db.pg.query(`select u.display_name from timetable_entries e join users u on u.user_id = e.teacher_user_id where e.school_id = $1 and e.class_id = '00000000-0000-4000-8000-0000000c0052' and e.weekday = 1 and e.period = 1`, [SCHOOL]);
  if (rows[0]?.display_name !== 'Tanvi Example') throw new Error(`the clash was saved: 5-B Monday period 1 is now ${rows[0]?.display_name}`);
};
// The shell's own tools (C134, C135), used the way a person uses them.
const typeInSearch = (text) => async (page) => {
  await page.getByRole('combobox', { name: /Search|खोजें/ }).fill(text);
  await page.getByRole('option').first().waitFor({ timeout: 15000 });
};
const openNew = async (page) => {
  await page.getByRole('button', { name: /^\+?\s*(New|नया)$/ }).click();
  await page.getByRole('menuitem').first().waitFor({ timeout: 5000 });
};
const speak = (language) => async (page) => {
  await page.getByRole('button', { name: language, exact: true }).click();
  await page.locator(`[data-shell-lang="${language === 'English' ? 'en' : 'hi'}"]`).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);
};
// First-visit tours (C138). Every other screen is photographed as a person
// who has seen the tours (the cookie below), so the pictures show the screen
// itself. These screens are opened as a first visit: the cookie is dropped,
// the app asks the account (which has seen none) and the tour appears.
// Afterwards the tour is skipped with its own button and the page reloaded,
// to prove the account remembers it; then the cookie is put back.
const TOUR_IDS = [...readFileSync(path.join(ROOT, 'src/lib/contracts/tours.ts'), 'utf8').matchAll(/^  '?([a-z-]+)'?: \{ steps:/gm)].map((m) => m[1]);
if (TOUR_IDS.length < 14) throw new Error('harness: could not read the tour ids from src/lib/contracts/tours.ts');
const seenAllCookie = (who) => ({ name: 'nca_tours', value: `${PEOPLE[who].sub}.${TOUR_IDS.join(',')}`, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' });
const firstVisit = async (page) => {
  await page.context().clearCookies({ name: 'nca_tours' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-tour]').waitFor({ timeout: 15000 });
};
const firstVisitInHindi = async (page) => {
  await firstVisit(page);
  await speak('हिन्दी')(page);
  await page.locator('[data-tour][lang="hi"]').waitFor({ timeout: 15000 });
};
const skipAndCheck = (who, thenEnglish = false) => async (page) => {
  await page.locator('[data-tour]').getByRole('button', { name: /^(Skip|छोड़ें)$/ }).click();
  await page.locator('[data-tour]').waitFor({ state: 'detached', timeout: 10000 });
  await page.context().clearCookies({ name: 'nca_tours' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  if (await page.locator('[data-tour]').count()) throw new Error('the tour came back after it was skipped: the account did not remember it');
  if (thenEnglish) await speak('English')(page);
  await page.context().addCookies([seenAllCookie(who)]);
};
const openModulesTab = async (page) => {
  await page.getByRole('tab', { name: 'Modules & access' }).click();
  await page.locator('[data-module-off]').first().waitFor({ timeout: 15000 });
};
// A module switched off for the school (C140): its page shows the "module off" state.
const attendanceOff = async (page) => {
  await db.pg.query(`update school_module_entitlements set enabled = false where school_id = $1 and module_id = 'attendance'`, [SCHOOL]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-module-off-page]').waitFor({ timeout: 15000 });
};
const attendanceOn = async () => {
  await db.pg.query(`update school_module_entitlements set enabled = true where school_id = $1 and module_id = 'attendance'`, [SCHOOL]);
};
// On a phone the menu is closed, so the Hindi would not be in the picture: open it.
const hindiWithMenu = async (page) => {
  await speak('हिन्दी')(page);
  if (page.viewportSize().width < 768) await page.getByRole('button', { name: 'मेनू खोलें' }).first().click();
};
const backToEnglish = async (page) => {
  await page.keyboard.press('Escape');
  await speak('English')(page);
};
const hindiThenSearch = async (page) => {
  await speak('हिन्दी')(page);
  await typeInSearch('aar')(page);
};
// [who, name, route, prepare (before the picture), after (put things back)]
const SCREENS = [
  ['principal', 'app-my-day', '/app/my-day'],
  ['principal', 'app-my-day-hindi', '/app/my-day', speak('हिन्दी'), backToEnglish],
  ['office', 'office-my-day', '/app/my-day'],
  // Last for this person: after it they are signed out.
  ['office', 'office-sign-out', '/app/my-day', signOut],
  ['teacher', 'teacher-my-day', '/app/my-day'],
  ['principal', 'app-students-first-visit', '/app/students', firstVisit, skipAndCheck('principal')],
  ['principal', 'app-attendance-first-visit-hindi', '/app/attendance', firstVisitInHindi, skipAndCheck('principal', true)],
  ['teacher', 'teacher-my-day-first-visit', '/app/my-day', firstVisit, skipAndCheck('teacher')],
  // Empty states that teach, and the module switches' sentences (C139).
  ['principal', 'app-student-empty', `/app/students/${STUDENT_NO_GUARDIAN}`],
  ['principal', 'app-student-empty-hindi', `/app/students/${STUDENT_NO_GUARDIAN}`, speak('हिन्दी'), backToEnglish],
  ['principal', 'app-settings-hindi', '/app/settings', speak('हिन्दी'), backToEnglish],
  ['founder', 'control-modules', `/control/schools/${SCHOOL}`, openModulesTab],
  ['principal', 'app-module-off', '/app/attendance', attendanceOff, attendanceOn],
  ['founder', 'control-messaging-cost', '/control/messaging-cost'],
  ['principal', 'app-dashboard', '/app/dashboard'],
  ['principal', 'app-students', '/app/students'],
  ['principal', 'app-student-profile', `/app/students/${STUDENT}`],
  ['principal', 'app-student-id-card', `/app/students/${STUDENT}/id-card`],
  ['principal', 'app-admissions', '/app/admissions'],
  ['principal', 'app-attendance', '/app/attendance', chooseClass],
  ['principal', 'app-fees', '/app/fees', feesSetup, feesSetupDone],
  ['principal', 'app-fees-dues', '/app/fees', feesDues, feesDuesDone],
  ['principal', 'app-fees-receipt', '/app/fees', feesPay, feesPayDone],
  ['principal', 'app-attendance-corrections', '/app/attendance', officeCorrections, officeCorrectionsDone],
  ['principal', 'app-timetable', '/app/timetable', chooseClass],
  ['principal', 'app-timetable-clash', '/app/timetable', timetableClash],
  ['principal', 'app-staff', '/app/staff'],
  ['principal', 'app-compliance', '/app/compliance'],
  ['principal', 'app-taught-today', '/app/syllabus'],
  ['principal', 'app-settings', '/app/settings'],
  ['principal', 'app-account', '/app/account'],
  ['principal', 'app-help', '/app/help'],
  ['principal', 'app-tickets', '/app/help/ticket'],
  ['principal', 'app-ticket-new', '/app/help/ticket/new'],
  ['principal', 'app-ticket', `/app/help/ticket/${TICKET}`],
  ['principal', 'app-search', '/app/students', typeInSearch('aar')],
  ['principal', 'app-new-menu', '/app/dashboard', openNew],
  ['principal', 'app-new-student', '/app/students?new=1'],
  ['principal', 'app-hindi', '/app/dashboard', hindiWithMenu, backToEnglish],
  ['principal', 'app-hindi-search', '/app/students', hindiThenSearch, backToEnglish],
  ['teacher', 'teacher-new-menu', '/app/attendance', openNew],
  ['teacher', 'teacher-search', '/app/attendance', typeInSearch('aar')],
  ['teacher', 'teacher-attendance', '/app/attendance', chooseClass],
  ['teacher', 'teacher-timetable', '/app/timetable'],
  ['teacher', 'teacher-attendance-offline', '/app/attendance', markOffline, backOnline],
  ['teacher', 'teacher-taught-today', '/app/syllabus'],
  ['teacher', 'teacher-homework', '/app/homework', homeworkFlow, homeworkFlowDone],
  ['teacher', 'teacher-copilot', '/app/teacher-copilot', copilotDraft, copilotApprove],
  ['teacher', 'teacher-recovery', '/app/recovery', recoveryList, recoveryApprove],
  ['teacher', 'teacher-needs-help', '/app/pulse', needsHelp, needsHelpDone],
  ['teacher', 'teacher-pulse-message', '/app/pulse', pulseMessage, pulseMessageDone],
  ['teacher', 'teacher-taught-one-tap', '/app/syllabus', oneTapTaught, oneTapTaughtDone],
  ['teacher', 'teacher-tickets', '/app/help/ticket'],
  ['founder', 'control-dashboard', '/control'],
  ['founder', 'control-schools', '/control/schools'],
  ['founder', 'control-school', `/control/schools/${SCHOOL}`],
  ['founder', 'control-users', '/control/users'],
  ['founder', 'control-onboarding', '/control/onboarding'],
  ['founder', 'control-applications', '/control/onboarding/applications'],
  ['founder', 'control-pipeline', '/control/monitoring'],
  ['founder', 'control-tickets', '/control/tickets'],
  ['founder', 'control-ticket', `/control/tickets/${TICKET}`],
  ['founder', 'control-account', '/control/account'],
  ['founder', 'control-search', '/control', typeInSearch('ill')],
  ['founder', 'control-hindi', '/control/schools', hindiWithMenu, backToEnglish],
];

// The same claims the app's own sign-in writes (src/lib/auth/jwt.ts), signed
// with this run's secret only.
async function cookieFor(person, secret) {
  return new SignJWT({ typ: 'access', role: person.role, schoolId: person.schoolId, membershipId: person.membershipId, tv: 0, aal: 'aal2', sid: randomUUID() })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(person.sub)
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(secret));
}

// Is something already listening on this port? (An earlier run left behind
// would otherwise be photographed in place of this one.)
function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
  });
}

async function waitFor(url, ms = 120000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (appExited !== null) throw new Error(`harness: the app stopped before it was ready (exit ${appExited}).`);
    try {
      const r = await fetch(url, { redirect: 'manual' });
      if (r.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`harness: ${url} did not answer`);
}

if (await portInUse(APP_PORT)) {
  console.error(`harness: something is already running on port ${APP_PORT}. Stop it, or pass --port.`);
  process.exit(2);
}
const db = await startHarnessDb({ port: DB_PORT, seedSql: readFileSync(path.join(ROOT, 'src/demo-fixture/harness-seed.sql'), 'utf8') });
const secret = randomBytes(32).toString('hex');
const base = `http://127.0.0.1:${APP_PORT}`;
// The app gets a clean environment: nothing from this shell (a real email key,
// an error-reporting address, a real database) can leak into the run. Next
// reads .env files only for names not already set, so the names the app would
// use to reach outside are set here, to nothing.
const childEnv = {
  PATH: process.env.PATH ?? '',
  HOME: process.env.HOME ?? '',
  TMPDIR: process.env.TMPDIR ?? '',
  NODE_ENV: 'development',
  NEXT_TELEMETRY_DISABLED: '1',
  NCA_HARNESS: HARNESS_MARKER,
  // Teacher Copilot answers from the stand-in, never a real model (C154).
  AI_PROVIDER: 'stand-in',
  DATABASE_URL: db.url,
  APP_SESSION_SECRET: secret,
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'harness-not-a-key',
  SUPABASE_SERVICE_ROLE_KEY: '',
  RESEND_API_KEY: '',
  EMAIL_FROM: '',
  ONBOARDING_NOTIFY_EMAIL: '',
  SENTRY_DSN: '',
  NEXT_PUBLIC_SENTRY_DSN: '',
  TURNSTILE_SECRET_KEY: '',
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: '',
  AUTH_EMAIL_STEP: '',
  WHATSAPP_ACCESS_TOKEN: '',
  N8N_WEBHOOK_URL: '',
  RAZORPAY_KEY_SECRET: '',
};
const app = spawn(process.execPath, [path.join(ROOT, 'node_modules/next/dist/bin/next'), 'dev', '-p', String(APP_PORT), '-H', '127.0.0.1'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: childEnv,
});
let appLog = '';
let appExited = null;
const keep = (d) => (appLog = (appLog + d).slice(-200000));
app.stdout.on('data', keep);
app.stderr.on('data', keep);
app.on('exit', (code) => (appExited = code ?? 1));
let stopping = false;
const stop = async (code) => {
  if (stopping) return;
  stopping = true;
  if (appExited === null) app.kill('SIGTERM');
  await db.stop().catch(() => undefined);
  process.exit(code);
};
// However this process ends, the app it started ends with it.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => stop(130));
process.on('exit', () => {
  if (appExited === null) app.kill('SIGKILL');
});

try {
  await waitFor(`${base}/login`);
  const cookies = {};
  for (const [name, person] of Object.entries(PEOPLE)) cookies[name] = await cookieFor(person, secret);

  if (SERVE) {
    console.log(`harness: the app is running on ${base} with illustrative data.`);
    console.log('Set this cookie on 127.0.0.1 to be signed in (it works only for this run):');
    for (const [name, value] of Object.entries(cookies)) console.log(`  ${name}: nca_access=${value}`); // never paste these anywhere
    console.log('Ctrl+C stops it and discards the database.');
    await new Promise(() => undefined);
  }

  // Search over HTTP on the seeded school, as the principal (docs/19 rule 6:
  // found within two seconds at the 95th percentile). One call first, so the
  // development server's own compile time is not counted.
  const ask = (q) => fetch(`${base}/api/app/search?q=${encodeURIComponent(q)}`, { headers: { cookie: `nca_access=${cookies.principal}` } });
  await ask('warm up');
  const searchTimes = [];
  for (const q of ['aar', 'ILL-0001', '9800000001', 'example', 'T-0000', 'zz', 'priya', 'attendance', '5-A', 'kumar']) {
    for (let i = 0; i < 2; i++) {
      const started = performance.now();
      const res = await ask(q);
      await res.text();
      if (res.status !== 200) throw new Error(`harness: search answered ${res.status} for "${q}"`);
      searchTimes.push(performance.now() - started);
    }
  }
  searchTimes.sort((a, b) => a - b);
  const searchP95Ms = Math.round(searchTimes[Math.ceil(searchTimes.length * 0.95) - 1]);
  console.log(`harness: search over HTTP, ${searchTimes.length} calls: median ${Math.round(searchTimes[searchTimes.length >> 1])} ms, p95 ${searchP95Ms} ms (budget 2000 ms).`);

  const { chromium } = await import('playwright');
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const report = [];
  // --only takes one or more parts of screen names, separated by commas; --screens (the
  // pictures to keep) is enough on its own: then only those screens are opened.
  const wanted = ONLY ? ONLY.split(',').filter(Boolean) : KEEP_SCREENS;
  const screens = SCREENS.filter(([, name]) => !wanted.length || wanted.some((w) => (ONLY ? name.includes(w) : name === w)));
  for (const width of [1440, 390]) {
    // Each width starts with people who have chosen no language and seen no tour.
    await db.pg.query(`update users set tours_seen = '{}', ui_language = null`);
    for (const who of Object.keys(PEOPLE)) {
      const mine = screens.filter(([w]) => w === who);
      if (!mine.length) continue;
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
      await context.addCookies([{ name: 'nca_access', value: cookies[who], domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }, seenAllCookie(who)]);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
      // An API call the screen made that did not succeed: named, so a page error has its cause beside it.
      page.on('response', (r) => {
        // The timetable's clash guard answers 409 on purpose (the clash screen shows it).
        if (r.status() === 409 && r.url().includes('/api/app/timetable')) return;
        if (r.url().includes('/api/') && r.status() >= 400) errors.push(`${r.request().method()} ${new URL(r.url()).pathname} answered ${r.status()}`);
      });
      for (const [, name, route, prepare, after] of mine) {
        const shoot = async () => {
        const logFrom = appLog.length;
        const response = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 90000 }).catch((e) => ({ status: () => 0, error: e.message }));
        await page.waitForTimeout(600);
        const prepared = prepare ? await prepare(page).then(() => null, (e) => e.message.split('\n')[0].slice(0, 160)) : null;
        if (prepared) errors.push(`could not prepare the screen: ${prepared}`);
        const seen = await page.evaluate(() => {
          const main = document.querySelector('main') ?? document.body;
          const small = [...main.querySelectorAll('a, button, select, input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, summary')]
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && r.height < 43.5;
            })
            .map((e) => `${(e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 24)}:${Math.round(e.getBoundingClientRect().height)}`);
          return {
            path: location.pathname,
            h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
            modulePage: document.querySelectorAll('[data-module-page]').length,
            horizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
            smallTargets: small,
          };
        });
        await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`), fullPage: true });
        // Put things back (the language), and say so if that failed: the
        // screens after this one would otherwise be photographed wrongly.
        const undone = after ? await after(page).then(() => null, (e) => e.message.split('\n')[0].slice(0, 160)) : null;
        if (undone) errors.push(`could not put the screen back: ${undone}`);
        // A server error: keep what the app printed, so the report says why.
        const failedOnServer = response.status() >= 500 || errors.some((e) => / answered 5\d\d$/.test(e));
        const serverSaid = failedOnServer ? appLog.slice(logFrom).split('\n').filter((l) => /error|Error|⨯/.test(l)).slice(-4).map((l) => l.trim().slice(0, 300)) : [];
        const row = { name, width, route, status: response.status(), serverSaid, landedOn: seen.path, h1: seen.h1, modulePage: seen.modulePage, horizontalScroll: seen.horizontalScroll, smallTargets: seen.smallTargets, pageErrors: [...errors] };
        errors.length = 0;
        return row;
        };
        // The throwaway database answers one query at a time, and now and
        // then an API call made while the page loads gets a 500 from it. Up to
        // two more tries tell that apart from a real fault; the first try's
        // errors stay in the report either way.
        let row = await shoot();
        for (let again = 0; again < 2 && row.pageErrors.some((e) => / answered 5\d\d$|Unexpected end of JSON/.test(e)); again++) {
          const first = row.firstTry ?? { pageErrors: row.pageErrors, serverSaid: row.serverSaid };
          row = { ...(await shoot()), firstTry: first };
        }
        const serverSaid = row.serverSaid;
        report.push(row);
        if (serverSaid.length) console.log('   server: ' + serverSaid.join(' | '));
        console.log(`${width} ${name}: ${row.status} h1=${JSON.stringify(row.h1)} modulePage=${row.modulePage} hscroll=${row.horizontalScroll} small=${row.smallTargets.length} errors=${row.pageErrors.length}${row.landedOn !== route.split('?')[0] ? ` LANDED ON ${row.landedOn}` : ''}${row.firstTry ? ' (after a retry)' : ''}`);
      }
      await context.close();
    }
  }
  await browser.close();
  writeFileSync(path.join(OUT, 'app.log'), appLog);
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ migrationsApplied: db.applied.length, migrationsSkipped: db.skipped, searchP95Ms, screens: report }, null, 2));
  const bad = report.filter((r) => r.status !== 200 || r.landedOn !== r.route.split('?')[0] || r.horizontalScroll || r.smallTargets.length || r.pageErrors.length);
  console.log(`harness: ${report.length} pictures in ${OUT}; ${bad.length} need a look.`);
  let overSize = false;
  if (KEEP && KEEP_SCREENS.length) {
    mkdirSync(KEEP, { recursive: true });
    let total = 0;
    for (const name of KEEP_SCREENS) {
      for (const width of [390, 1440]) {
        const to = path.join(KEEP, `${name}-${width}.webp`);
        const made = spawnSync('cwebp', ['-quiet', '-q', '55', '-m', '6', path.join(OUT, `${name}-${width}.png`), '-o', to]);
        if (made.error || made.status !== 0) throw new Error(`harness: could not write ${to} (cwebp is needed: brew install webp). ${made.error?.message ?? made.stderr}`);
        total += statSync(to).size;
      }
    }
    overSize = total > KEEP_LIMIT_BYTES;
    console.log(`harness: ${KEEP_SCREENS.length * 2} WebP pictures in ${KEEP}, ${(total / 1024).toFixed(0)} KB in all${overSize ? ' -- OVER the 1.5 MB a PR may carry' : ''}.`);
  }
  if (searchP95Ms > 2000) console.log('harness: search is over its two-second budget.');
  await stop(bad.length || overSize || searchP95Ms > 2000 ? 1 : 0);
} catch (err) {
  console.error(err.message);
  console.error(appLog.split('\n').slice(-15).join('\n'));
  await stop(1);
}
