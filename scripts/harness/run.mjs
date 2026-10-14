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
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
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
// Sending the day's message (C189): the same message, marked ready, then "Send to parents" by the teacher. Each
// guardian's message goes through the send-gate (here it is held or queued; nothing reaches a phone), the message
// is marked sent with who sent it, and the screen says how many went and how many were held.
const clearPulseSends = () => db.pg.exec(`set session_replication_role = replica; delete from communication_log where dedupe_key like 'pulse:%'; delete from jobs where type = 'whatsapp.send'; set session_replication_role = origin;`);
let pulseSent = null;
const pulseSend = async (page) => {
  await clearPulseSends();
  await pulseMessage(page);
  await page.locator('[data-send-pulse]').first().click();
  pulseSent = (await page.locator('[data-pulse-sent]').first().textContent({ timeout: 20000 })).trim();
};
const pulseSendDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from pulse_messages where status = 'sent' and sent_by = $1 and sent_at is not null) as sent,
            (select count(*)::int from communication_log where dedupe_key like 'pulse:%') as messages,
            (select count(*)::int from communication_log where dedupe_key like 'pulse:%' and purpose = 'daily_pulse' and template_name = 'daily_pulse') as as_pulse,
            (select count(*)::int from communication_log where dedupe_key like 'pulse:%' and status::text in ('sent', 'delivered', 'read')) as reached_a_provider`,
    [PEOPLE.teacher.sub]
  );
  await clearPulseSends();
  await clearHomework();
  await clearTaught();
  const r = rows[0];
  if (r.sent !== 1 || r.messages < 1 || r.as_pulse !== r.messages || r.reached_a_provider !== 0) throw new Error(`sending the Pulse: ${JSON.stringify(r)}`);
  if (!/^Sent\./.test(pulseSent ?? '')) throw new Error(`the screen does not say what was sent: ${pulseSent}`);
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
// A receipt and its evidence point at each other, and evidence is never edited: the harness puts the
// screen back as the database's owner, with triggers and references set aside for these statements only.
const dropEvidence = async (where) => {
  await db.pg.query(`set session_replication_role = replica`);
  await db.pg.query(`delete from payment_evidence where school_id = $1 and receipt_id in (select receipt_id from receipts where school_id = $1 and ${where})`, [SCHOOL]);
  await db.pg.query(`delete from payment_evidence where school_id = $1 and receipt_id is null`, [SCHOOL]);
  await db.pg.query(`set session_replication_role = origin`);
};
const clearPayments = async () => {
  // By receipt, not by due: the money goes to the student's oldest dues first, and those are the seed's.
  // The status trigger runs on the delete and puts each due's status back.
  await dropEvidence(`issued_by = '${PEOPLE.principal.sub}'`);
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
// Overdue (C163): the totals box shows as overdue exactly the unpaid balance
// of the dues past their date, and says the nightly check has not run here.
const clearLateFee = async () => {
  await db.pg.query(`delete from school_setting_changes where school_id = $1 and module_id = 'fees'`, [SCHOOL]);
  await db.pg.query(`delete from school_settings where school_id = $1 and module_id = 'fees'`, [SCHOOL]);
};
const feesOverdue = async (page) => {
  await page.locator('[data-fee-overdue]').waitFor({ timeout: 15000 });
};
const feesOverdueDone = async (page) => {
  const shown = Math.round(Number((await page.locator('[data-fee-overdue]').textContent()).replace(/[^0-9.]/g, '')) * 100);
  const nightly = await page.locator('[data-fee-nightly]').textContent();
  const { rows } = await db.pg.query(
    `select coalesce(sum(l.amount_minor - coalesce((select sum(p.amount_minor) from payments p where p.fee_id = l.fee_id), 0)), 0)::bigint as overdue from fees_ledger l
      where l.school_id = $1 and (l.status::text = 'overdue' or (l.status::text in ('pending', 'partial') and l.due_date < ${TODAY_SQL}))`,
    [SCHOOL]
  );
  if (Number(rows[0].overdue) !== shown) throw new Error(`the page shows ${shown} paise overdue; the unpaid balance past its date is ${rows[0].overdue}`);
  if (!/first check has not run/.test(nightly ?? '')) throw new Error(`the nightly line is wrong: ${nightly}`);
};
// Online payment on the stand-in provider (C169). The office makes the
// family's link at the counter; the link's page is opened as a parent would
// (no session) and paid; the provider's signed notice is applied. The page
// then says "Paid" with the receipt number, the money is credited once, and
// paying the same link again is refused.
const clearOnline = async () => {
  await db.pg.query(`delete from payment_events where school_id = $1 or link_id in (select link_id from payment_links where school_id = $1)`, [SCHOOL]);
  await dropEvidence(`method = 'online'`);
  await db.pg.query(`delete from payments where school_id = $1 and method = 'online'`, [SCHOOL]);
  await db.pg.query(`update payment_links set receipt_id = null, status = 'cancelled', closed_at = coalesce(closed_at, now()) where school_id = $1`, [SCHOOL]);
  await db.pg.query(`delete from receipts where school_id = $1 and method = 'online'`, [SCHOOL]);
  await db.pg.query(`delete from payment_link_lines where school_id = $1`, [SCHOOL]);
  await db.pg.query(`delete from payment_links where school_id = $1`, [SCHOOL]);
};
let onlinePaid = null;
// The stand-in is test money, and only a test school takes test payments (C173): for this one screen the
// harness school is marked as a test school, and put back afterwards.
const asTestSchool = (on) => db.pg.query(`update schools set is_test_fixture = $2 where school_id = $1`, [SCHOOL, on]);
const payOnline = async (page) => {
  await asTestSchool(true);
  await clearOnline();
  await clearPayments();
  await feesDues(page);
  await page.selectOption('#pay-class', { label: '5-A' });
  await page.waitForFunction(() => document.querySelectorAll('#pay-student option').length > 1, null, { timeout: 15000 });
  await page.selectOption('#pay-student', { index: 1 });
  await page.locator('[data-make-link]').click();
  const url = (await page.locator('[data-pay-url]').textContent({ timeout: 20000 })).trim();
  // As a parent: a fresh browser with no session at all.
  const parent = await page.context().browser().newContext();
  const pay = await parent.newPage();
  await pay.goto(url, { waitUntil: 'networkidle' });
  const before = await pay.locator('[data-pay-state]').getAttribute('data-pay-state');
  await pay.locator('[data-standin-pay]').click();
  await pay.locator('[data-pay-state="paid"]').waitFor({ timeout: 20000 });
  const text = await pay.locator('[data-pay-state="paid"]').textContent();
  const again = await pay.evaluate(async (token) => (await fetch('/api/public/payments/standin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })).status, url.split('/pay/')[1]);
  const forged = await pay.evaluate(async () => (await fetch('/api/public/payments/webhook/stand-in', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-standin-signature': 'f'.repeat(64) }, body: JSON.stringify({ id: 'evt_forged', type: 'payment.captured', order: 'x', payment: 'y', amount: 1 }) })).status);
  await parent.close();
  onlinePaid = { before, text, again, forged };
  await page.reload({ waitUntil: 'networkidle' });
};
const payOnlineDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from receipts where school_id = $1 and method = 'online') as receipts,
            (select coalesce(sum(total_minor), 0)::int from receipts where school_id = $1 and method = 'online') as receipt_total,
            (select coalesce(sum(amount_minor), 0)::int from payments where school_id = $1 and method = 'online') as credited,
            (select amount_minor::int from payment_links where school_id = $1 and status = 'paid') as link_amount,
            (select receipt_no from receipts where school_id = $1 and method = 'online') as receipt_no,
            (select count(*)::int from payment_events where outcome = 'applied') as applied,
            (select count(*)::int from payment_events where outcome = 'refused') as refused`,
    [SCHOOL]
  );
  await clearOnline();
  await clearPayments();
  await clearDues();
  await asTestSchool(false);
  const r = rows[0];
  const p = onlinePaid ?? {};
  if (p.before !== 'open' || !String(p.text).includes(r.receipt_no)) throw new Error(`the parent's page did not go from open to paid with the receipt number: ${JSON.stringify(p)} ${r.receipt_no}`);
  if (r.receipts !== 1 || r.applied !== 1 || r.link_amount === null || r.receipt_total !== r.link_amount || r.credited !== r.link_amount) throw new Error(`the link was not credited exactly once: ${JSON.stringify(r)}`);
  if (p.again !== 409) throw new Error(`paying the same link again must be refused, got ${p.again}`);
  if (p.forged !== 401 || r.refused !== 1) throw new Error(`a notice with a bad signature must be refused and recorded: ${p.forged}, ${r.refused}`);
};
// The gateway's keys (C171): the principal types made-up Razorpay test keys
// and saves. The page then shows only the last four characters of the key
// id; nothing typed is anywhere in the page or, as typed, in the database;
// and Razorpay still cannot be switched on (not allowed, not tested).
const HARNESS_KEYS = { id: 'rzp_test_HARNESSFICTION01', secret: 'harness-fictional-key-part-0001', hook: 'harness-fictional-hook-0001' };
const clearRails = async () => {
  await db.pg.query(`delete from payment_credentials where school_id = $1`, [SCHOOL]);
  await db.pg.query(`delete from payment_methods where school_id = $1`, [SCHOOL]);
};
let railsSeen = null;
const saveGatewayKeys = async (page) => {
  await clearRails();
  await page.reload({ waitUntil: 'networkidle' });
  const rails = page.locator('[data-payment-rails]');
  await rails.locator('#rails-key-id').fill(HARNESS_KEYS.id);
  await rails.locator('#rails-key-secret').fill(HARNESS_KEYS.secret);
  await rails.locator('#rails-webhook-secret').fill(HARNESS_KEYS.hook);
  await rails.locator('[data-save-keys]').click();
  await rails.locator('[data-saved-keys="test"]').waitFor({ timeout: 20000 });
  railsSeen = { saved: await rails.locator('[data-saved-keys="test"]').textContent(), html: await page.content(), fields: await rails.locator('#rails-key-secret').inputValue() };
};
const saveGatewayKeysDone = async () => {
  const { rows } = await db.pg.query(`select c.ciphertext, c.key_last4, c.saved_from, (select enabled from payment_methods where school_id = $1 and method = 'razorpay') as on, (select string_agg(after_state::text, ' ') from audit_log where school_id = $1 and event_action = 'payments.credentials_saved') as audit from payment_credentials c where c.school_id = $1`, [SCHOOL]);
  await clearRails();
  const r = rows[0];
  const s = railsSeen ?? {};
  if (!r || r.key_last4 !== 'ON01' || r.saved_from !== 'school' || !String(s.saved).includes('ON01')) throw new Error(`the keys were not saved with their last four characters shown: ${JSON.stringify({ last4: r?.key_last4, saved: s.saved })}`);
  for (const secret of [HARNESS_KEYS.secret, HARNESS_KEYS.hook, HARNESS_KEYS.id]) {
    if (String(s.html).includes(secret)) throw new Error('a key is still in the page after saving');
    if (String(r.ciphertext).includes(secret) || String(r.audit).includes(secret)) throw new Error('a key is in the database as typed');
  }
  if (s.fields !== '') throw new Error('the form still holds the key secret after saving');
};
// Direct UPI (C174), the founder's flow end to end. The school has its UPI ID set up. The office makes the
// family's link; a parent with no session opens it, sees "Pay with UPI" and a QR carrying the reference, enters
// the UTR, and is told the payment is initiated, never that it is paid. Nothing is credited. The principal then
// finds it "in the bank", ticks the box and confirms: one receipt, and the parent's page says paid.
const UPI_SETUP = { upiId: 'illustrative.fees@examplebank', payeeName: 'Illustrative Public School', bankName: 'An Example Bank', accountLast4: '4821', ifsc: 'EXMP0001234', verifiers: ['accountant', 'principal'], principalLimitMinor: 0, notify: 'digest' };
const clearUpi = async () => {
  await db.pg.query(`delete from payment_reports where school_id = $1`, [SCHOOL]);
  await dropEvidence(`method = 'upi' and payment_link_id is not null`);
  await db.pg.query(`delete from payments where school_id = $1 and receipt_id in (select receipt_id from receipts where school_id = $1 and method = 'upi' and payment_link_id is not null)`, [SCHOOL]);
  await db.pg.query(`update payment_links set receipt_id = null, status = 'cancelled', closed_at = coalesce(closed_at, now()) where school_id = $1`, [SCHOOL]);
  await db.pg.query(`delete from receipts where school_id = $1 and method = 'upi' and payment_link_id is not null`, [SCHOOL]);
  await db.pg.query(`delete from payment_link_lines where school_id = $1`, [SCHOOL]);
  await db.pg.query(`delete from payment_links where school_id = $1`, [SCHOOL]);
  await db.pg.query(`delete from payment_methods where school_id = $1 and method = 'direct_upi'`, [SCHOOL]);
};
// Bank statements (C176): the principal adds the account, gives a FICTIONAL statement (written here, labelled as
// such), is shown the count and the total, confirms, and the credit rows are kept. Nothing is credited.
const BANK_CSV = `FICTIONAL TEST STATEMENT - An Example Bank - not a real bank
Txn Date,Description,Ref No,Debit,Credit,Balance
01/04/2099,UPI/CR/409912345678/A PARENT/NCA-7K3Q9MPD,,,"2,300.50","1,02,300.50"
02/04/2099,NEFT TO A SUPPLIER,N123,"10,000.00",,"92,300.50"
03-Apr-2099,UPI/CR/409912345679/ANOTHER PARENT,,,"1,00,000.00","1,92,300.50"
`;
const clearBank = async () => {
  await db.pg.exec(`set session_replication_role = replica; delete from bank_credit_rows where school_id = '${SCHOOL}'; delete from bank_statement_imports where school_id = '${SCHOOL}'; delete from bank_accounts where school_id = '${SCHOOL}'; set session_replication_role = origin;`);
};
let bankSeen = null;
const bankStatement = async (page) => {
  await clearBank();
  await page.reload({ waitUntil: 'networkidle' });
  const bank = page.locator('[data-bank]');
  const empty = await bank.locator('[data-bank-empty]').count();
  await bank.locator('#bank-label').fill('Fees account');
  await bank.locator('#bank-name').fill('An Example Bank');
  await bank.locator('#bank-last4').fill('4821');
  await bank.locator('#bank-ifsc').fill('EXMP0001234');
  await bank.locator('[data-bank-add]').click();
  await bank.locator('[data-bank-upload]').waitFor({ timeout: 20000 });
  await bank.locator('#bank-from').fill('2099-04-01');
  await bank.locator('#bank-to').fill('2099-04-30');
  await bank.locator('#bank-file').setInputFiles({ name: 'fictional-statement.csv', mimeType: 'text/csv', buffer: Buffer.from(BANK_CSV) });
  await bank.locator('[data-bank-read]:not([disabled])').click();
  const preview = (await bank.locator('[data-bank-preview] p').first().textContent({ timeout: 20000 })).trim();
  const savedBeforeConfirm = (await db.pg.query(`select count(*)::int as n from bank_credit_rows where school_id = $1`, [SCHOOL])).rows[0].n;
  await bank.locator('[data-bank-keep]').click();
  const done = (await bank.locator('[data-bank-done]').textContent({ timeout: 20000 })).trim();
  await bank.locator('[data-bank-uploads] li').first().waitFor({ timeout: 20000 });
  // Neither credit carries a reference or a UTR anyone reported: both wait for a person. One is set aside as not a fee.
  const waitingRows = await bank.locator('[data-bank-row]').count();
  await bank.locator('[data-bank-row-open]').first().click();
  await bank.locator('[data-bank-row] input').first().fill('A donation from an old student');
  await bank.locator('[data-bank-row-not-fee]').click();
  await bank.locator('[data-bank-row-done]').waitFor({ timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-bank-row]').length === 1, null, { timeout: 20000 });
  bankSeen = { empty, preview, savedBeforeConfirm, done, waitingRows };
};
const bankStatementDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from bank_credit_rows where school_id = $1) as kept, (select coalesce(sum(amount_minor), 0)::int from bank_credit_rows where school_id = $1) as total,
            (select count(*)::int from bank_credit_rows where school_id = $1 and match_status = 'not_a_fee') as set_aside, (select count(*)::int from bank_credit_rows where school_id = $1 and evidence_id is not null) as credited,
            (select statement_profile is not null from bank_accounts where school_id = $1) as remembered,
            (select count(*)::int from audit_log where school_id = $1 and event_action = 'bank.statement_uploaded' and occurred_at > now() - interval '5 minutes') > 0 as audited`,
    [SCHOOL]
  );
  await clearBank();
  const want = { kept: 2, total: 10230050, set_aside: 1, credited: 0, remembered: true, audited: true };
  if (JSON.stringify(rows[0]) !== JSON.stringify(want)) throw new Error(`bank statement: ${JSON.stringify(rows[0])}`);
  const seen = { empty: 1, preview: '2 payments came in, ₹1,02,300.50 in all', savedBeforeConfirm: 0, done: 'Kept. 2 new rows; 0 were already here. From this statement: 0 payments confirmed and receipts issued; 0 already-recorded payments seen in the bank; 0 need a person; 2 matched nothing.', waitingRows: 2 };
  if (JSON.stringify(bankSeen) !== JSON.stringify(seen)) throw new Error(`bank statement screen: ${JSON.stringify(bankSeen)}`);
};
// Holidays on the Settings screen (C176): the principal adds one, it is listed and audited.
const addHoliday = async (page) => {
  await db.pg.query(`delete from school_holidays where school_id = $1`, [SCHOOL]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#holiday-date').fill('2099-08-15');
  await page.locator('#holiday-name').fill('Independence Day');
  await page.locator('[data-holiday-add]').click();
  await page.locator('[data-holiday="2099-08-15"]').waitFor({ timeout: 20000 });
};
const addHolidayDone = async () => {
  const { rows } = await db.pg.query(`select (select count(*)::int from school_holidays where school_id = $1) as n, (select count(*)::int from audit_log where school_id = $1 and event_action = 'settings.holiday_added' and occurred_at > now() - interval '5 minutes') > 0 as audited`, [SCHOOL]);
  await db.pg.query(`delete from school_holidays where school_id = $1`, [SCHOOL]);
  if (rows[0].n !== 1 || rows[0].audited !== true) throw new Error(`holiday: ${JSON.stringify(rows[0])}`);
};
// Fee recovery (C178): the follow-up list from the fixture school's overdue dues; the principal notes a call and a
// promise to pay on the first family. Both are put back afterwards.
const clearFollowUps = async () => {
  await db.pg.exec(`set session_replication_role = replica; delete from fee_followups where school_id = '${SCHOOL}'; set session_replication_role = origin;`);
};
let recoverySeen = null;
const feeRecovery = async (page) => {
  await clearFollowUps();
  await page.reload({ waitUntil: 'networkidle' });
  const rec = page.locator('[data-recovery]');
  await rec.locator('[data-followup]').first().waitFor({ timeout: 20000 });
  const families = await rec.locator('[data-followup]').count();
  const first = rec.locator('[data-followup]').first();
  await first.locator('[data-followup-call]').click();
  await first.locator('input').first().fill('Spoke to the mother; she will come on Monday');
  await first.locator('[data-followup-save]').click();
  await first.locator('[data-followup-promise]').waitFor({ timeout: 20000 });
  await first.locator('[data-followup-promise]').click();
  await first.locator('input').first().fill('Will pay after salary');
  await first.locator('input[type="date"]').fill(new Date(Date.now() + 5.5 * 3600_000 + 3 * 86400_000).toISOString().slice(0, 10));
  await first.locator('[data-followup-save]').click();
  await page.waitForFunction(() => /Promised by/.test(document.querySelector('[data-followup]')?.textContent ?? ''), null, { timeout: 20000 });
  recoverySeen = { families: families > 0, refundsShown: await rec.locator('[data-refunds]').count() };
};
const feeRecoveryDone = async () => {
  const { rows } = await db.pg.query(`select (select count(*)::int from fee_followups where school_id = $1 and kind = 'call') as calls, (select count(*)::int from fee_followups where school_id = $1 and kind = 'promise' and status = 'open') as promises`, [SCHOOL]);
  await clearFollowUps();
  if (rows[0].calls < 1 || rows[0].promises !== 1 || !recoverySeen?.families || recoverySeen.refundsShown !== 1) throw new Error(`fee recovery: ${JSON.stringify({ ...rows[0], ...recoverySeen })}`);
};
// Fee clearance (C179): the principal picks a student who owes at the fee counter, sees the certificate is held,
// and lets it through with a reason. The override is one audited row; it is removed afterwards.
const feeClearanceScreen = async (page) => {
  await db.pg.query(`delete from fee_clearance_overrides where school_id = $1`, [SCHOOL]);
  const owing = (await db.pg.query(`select s.name, c.name as class_name from fees_ledger l join students s on s.student_id = l.student_id join classes c on c.class_id = s.class_id where l.school_id = $1 and l.amount_minor > coalesce((select sum(p.amount_minor) from payments p where p.fee_id = l.fee_id), 0) order by s.name limit 1`, [SCHOOL])).rows[0];
  if (!owing) throw new Error('no student of the fixture school owes a fee');
  await page.reload({ waitUntil: 'networkidle' });
  await page.selectOption('#pay-class', { label: owing.class_name });
  await page.waitForFunction(() => document.querySelectorAll('#pay-student option').length > 1, null, { timeout: 15000 });
  await page.selectOption('#pay-student', { label: owing.name });
  await page.locator('[data-clearance="held"]').waitFor({ timeout: 20000 });
  await page.locator('#clearance-reason').fill('The family is moving city; the trust has agreed');
  await page.locator('[data-clearance-override]').click();
  await page.locator('[data-clearance="cleared"]').waitFor({ timeout: 20000 });
};
const feeClearanceScreenDone = async () => {
  const { rows } = await db.pg.query(`select (select count(*)::int from fee_clearance_overrides where school_id = $1) as n, (select count(*)::int from audit_log where school_id = $1 and event_action = 'fees.clearance_overridden' and occurred_at > now() - interval '5 minutes') > 0 as audited`, [SCHOOL]);
  await db.pg.query(`delete from fee_clearance_overrides where school_id = $1`, [SCHOOL]);
  if (rows[0].n !== 1 || rows[0].audited !== true) throw new Error(`fee clearance: ${JSON.stringify(rows[0])}`);
};
// The Fees page opens with one call for its data (C180, docs/19 rule 10): every /api/app/fees/ request made
// while it loads is counted, and only the summary may be among them.
let feesCalls = null;
const feesOneCall = async (page) => {
  const seen = [];
  const note = (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/app/fees/') && r.method() === 'GET') seen.push(u.pathname);
  };
  page.on('request', note);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-fee-overdue]').waitFor({ timeout: 20000 });
  await page.locator('[data-recovery]').waitFor({ timeout: 20000 });
  await page.locator('[data-bank]').waitFor({ timeout: 20000 });
  page.off('request', note);
  feesCalls = seen;
};
const feesOneCallDone = async () => {
  // Development runs each effect twice; the second run shares the first one's request.
  if (feesCalls.length !== 1 || feesCalls[0] !== '/api/app/fees/summary') throw new Error(`the Fees page should open with one data call; it made ${JSON.stringify(feesCalls)}`);
};
// Communication (C183): three messages of the school are in the log as the stand-in "sent" them. The stand-in's
// own signed notices arrive at the public webhook: one is delivered, one read, one failed. A forged notice is
// refused and changes nothing, and the same notice twice changes nothing. The principal's list shows each state.
const MSG_KEY = 'harness-7b-';
const clearMessages = async () => {
  await db.pg.exec(`set session_replication_role = replica; delete from communication_log where dedupe_key like '${MSG_KEY}%'; delete from webhook_events where provider = 'whatsapp'; set session_replication_role = origin;`);
};
let messagesSeen = null;
const messageStates = async (page) => {
  await clearMessages();
  const who = (await db.pg.query(`select m.student_id, m.parent_id, p.phone from parent_student_map m join parents p on p.parent_id = m.parent_id where m.school_id = $1 order by m.student_id limit 1`, [SCHOOL])).rows[0];
  if (!who) throw new Error('the fixture school has no guardian');
  for (const n of [1, 2, 3, 4])
    await db.pg.query(
      `insert into communication_log (school_id, to_phone, channel, template_name, billing_category, billable, est_cost_paise, gst_paise, cost_basis, status, provider_message_id, dedupe_key, provider_used, student_id, parent_id, purpose, provider, reason)
       values ($1, $2, 'whatsapp', 'attendance_absence_notification', 'utility', false, 0, 0, 'not_billable', $3, $4, $5, 'platform_default', $6, $7, 'operational_communication', $8, $9)`,
      [SCHOOL, who.phone, n === 4 ? 'blocked_consent' : 'sent', n === 4 ? null : `standin-harness-${n}`, `${MSG_KEY}${n}`, who.student_id, who.parent_id, n === 4 ? null : 'stand-in', n === 4 ? 'consent for purpose "operational_communication" is not currently granted' : null]
    );
  const signingSecret = childEnv.WHATSAPP_STANDIN_SECRET;
  const post = async (notices, key = signingSecret) => {
    const rawBody = JSON.stringify({ provider: 'stand-in', notices });
    const res = await fetch(`${base}/api/public/whatsapp/webhook/stand-in`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-standin-signature': createHmac('sha256', key).update(rawBody).digest('hex') }, body: rawBody });
    return res.status;
  };
  const at = new Date().toISOString();
  const note = (n, status, extra = {}) => ({ kind: 'status', providerMessageId: `standin-harness-${n}`, status, at, ...extra });
  const forged = await post([note(1, 'read')], `${signingSecret}-not-the-secret`);
  const first = await post([note(1, 'delivered'), note(2, 'read'), note(3, 'failed', { failureCode: 'not_on_whatsapp' })]);
  const again = await post([note(1, 'delivered'), note(2, 'read'), note(3, 'failed', { failureCode: 'not_on_whatsapp' })]);
  const backwards = await post([note(2, 'delivered')]);
  const noSuchProvider = (await fetch(`${base}/api/public/whatsapp/webhook/meta`, { method: 'POST', body: '{}' })).status;
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-messages]').waitFor({ timeout: 20000 });
  const states = await page.locator('[data-message]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-message')))].filter((x) => x !== 'sent').sort());
  const standInNote = await page.locator('[data-messages-standin]').count();
  await page.locator('[data-state="failed"]').click();
  await page.waitForFunction(() => document.querySelector('[data-state="failed"]')?.getAttribute('aria-pressed') === 'true' && [...document.querySelectorAll('[data-message]')].every((e) => e.getAttribute('data-message') === 'failed') && document.querySelectorAll('[data-message]').length > 0, null, { timeout: 20000 });
  const onlyFailed = 'failed';
  await page.locator('[data-state-all]').click();
  await page.waitForFunction(() => new Set([...document.querySelectorAll('[data-message]')].map((e) => e.getAttribute('data-message'))).size >= 4, null, { timeout: 20000 });
  messagesSeen = { forged, first, again, backwards, noSuchProvider, states: states.join(), standInNote, onlyFailed };
};
const messageStatesDone = async () => {
  const rows = (await db.pg.query(`select status::text as s from communication_log where dedupe_key like '${MSG_KEY}%' order by dedupe_key`)).rows.map((r) => r.s).join();
  const kept = (await db.pg.query(`select signature_ok, outcome from webhook_events where provider = 'whatsapp' order by created_at, event_id`)).rows.map((r) => `${r.signature_ok}:${r.outcome}`);
  await clearMessages();
  const want = { forged: 401, first: 200, again: 200, backwards: 200, noSuchProvider: 404, states: 'delivered,failed,held,read', standInNote: 1, onlyFailed: 'failed' };
  if (JSON.stringify(messagesSeen) !== JSON.stringify(want)) throw new Error(`message states on the screen: ${JSON.stringify(messagesSeen)}`);
  if (rows !== 'delivered,read,failed,blocked_consent') throw new Error(`message states in the log: ${rows}`);
  if (kept.join(' | ') !== 'false:refused: bad_signature | true:applied 3, stale 0, unknown 0, replies 0 | true:applied 0, stale 1, unknown 0, replies 0') throw new Error(`the notices kept: ${kept.join(' | ')}`);
};
// Control → message templates (C184): the founder brings in the versions written in the code, reads one and
// approves it, and records Meta's decision on it. Everything is put back afterwards.
const TEMPLATE_BEFORE = `select coalesce(json_agg(json_build_object('id', id, 'name', template_name, 'language', language, 'version', version)), '[]'::json) as rows from whatsapp_templates`;
let templatesBefore = [];
let templatesSeen = null;
const clearTemplates = async () => {
  const keep = templatesBefore.map((r) => `'${r.id}'`).join(',') || `'00000000-0000-0000-0000-000000000000'`;
  await db.pg.exec(`set session_replication_role = replica; delete from whatsapp_templates where id not in (${keep}); update whatsapp_templates set body = null, variables = '{}', stale_after_minutes = null, status = 'approved', approved_by = null, approved_at = null, meta_status = 'not_submitted', meta_template_id = null, meta_decided_at = null where id in (${keep}); set session_replication_role = origin;`);
};
const messageTemplates = async (page) => {
  templatesBefore = (await db.pg.query(TEMPLATE_BEFORE)).rows[0].rows;
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-templates-sync]').click();
  await page.locator('[data-template="fee_receipt"]').waitFor({ timeout: 20000 });
  const versions = await page.locator('[data-template-version]').count();
  const firstLines = await page.locator('[data-template-version] p[lang]').evaluateAll((els) => els.map((e) => e.textContent.startsWith('{{school}}: ')));
  const card = page.locator('[data-template="fee_receipt"] [data-template-version="en-1"]');
  await card.locator('[data-template-approve]').click();
  await page.locator('[data-templates-note]').waitFor({ timeout: 20000 });
  await page.waitForFunction(() => /one sent/.test(document.querySelector('[data-template="fee_receipt"] [data-template-version="en-1"]')?.textContent ?? ''), null, { timeout: 20000 });
  await card.locator('[data-template-meta]').click();
  await card.locator('select').selectOption('pending');
  await card.locator('input').fill('made-up-meta-id');
  await card.locator('[data-template-meta-save]').click();
  await page.waitForFunction(() => /With Meta/.test(document.querySelector('[data-template="fee_receipt"] [data-template-version="en-1"]')?.textContent ?? ''), null, { timeout: 20000 });
  templatesSeen = { versions, allNameSchoolFirst: firstLines.length > 0 && firstLines.every(Boolean) };
};
const messageTemplatesDone = async () => {
  const row = (await db.pg.query(`select status::text as status, approved_by, meta_status, meta_template_id from whatsapp_templates where template_name = 'fee_receipt' and language = 'en' and version = 1`)).rows[0];
  const total = (await db.pg.query(`select count(*)::int as n from whatsapp_templates where school_id is null`)).rows[0].n;
  await clearTemplates();
  if (row?.status !== 'approved' || row.approved_by !== PEOPLE.founder.sub || row.meta_status !== 'pending' || row.meta_template_id !== 'made-up-meta-id') throw new Error(`the template was not approved and Meta's decision recorded: ${JSON.stringify(row)}`);
  if (!templatesSeen?.allNameSchoolFirst || templatesSeen.versions !== total || total < 10) throw new Error(`the templates on the screen: ${JSON.stringify(templatesSeen)} of ${total}`);
};
// Control → WhatsApp account (C186). The harness gives the app NO messaging key, as a server without one: the
// screen says so in plain words, nothing can be saved, and Meta's webhook address does not exist yet.
let whatsappSeen = null;
const whatsappAccount = async (page) => {
  await page.locator('[data-whatsapp-account]').waitFor({ timeout: 20000 });
  const noKey = await page.locator('[data-wa-no-key]').count();
  await page.locator('#wa-phoneNumberId').fill('106540352242922');
  await page.locator('#wa-wabaId').fill('102290129340398');
  await page.locator('#wa-accessToken').fill('made-up-token-for-the-harness-0123456789');
  await page.locator('#wa-appSecret').fill('madeupappsecret0123456789abcdef');
  await page.locator('#wa-verifyToken').fill('made-up-verify-token-0123456789');
  const saveDisabled = await page.locator('[data-wa-save]').isDisabled();
  const secretsHidden = await page.locator('#wa-accessToken, #wa-appSecret, #wa-verifyToken').evaluateAll((els) => els.every((e) => e.type === 'password'));
  const hook = `${base}/api/public/whatsapp/webhook/meta`;
  const get = (await fetch(`${hook}?hub.mode=subscribe&hub.verify_token=anything&hub.challenge=1`)).status;
  const post = (await fetch(hook, { method: 'POST', headers: { 'x-hub-signature-256': 'sha256=00' }, body: '{}' })).status;
  whatsappSeen = { noKey, saveDisabled, secretsHidden, get, post };
};
const whatsappAccountDone = async () => {
  const saved = (await db.pg.query(`select count(*)::int as n from whatsapp_credentials`)).rows[0].n;
  const want = { noKey: 1, saveDisabled: true, secretsHidden: true, get: 404, post: 404 };
  if (JSON.stringify(whatsappSeen) !== JSON.stringify(want) || saved !== 0) throw new Error(`the WhatsApp account screen without a key: ${JSON.stringify(whatsappSeen)}, ${saved} saved`);
};
// Parents' replies (C187): a guardian of the fixture school writes to the platform number (the stand-in's signed
// notice at the public webhook). The principal sees the conversation, answers in their own words, and the reply
// waits its turn. The guardian then writes STOP: the thread says so and the reply box is gone.
const clearReplies = async () => {
  await db.pg.exec(`set session_replication_role = replica; delete from communication_log where thread_id is not null; delete from jobs where type = 'whatsapp.send'; delete from inbound_messages; delete from whatsapp_opt_outs; delete from message_threads; delete from webhook_events where provider = 'whatsapp'; set session_replication_role = origin;`);
};
let repliesSeen = null;
let pilotBefore = null;
const parentReplies = async (page) => {
  await clearReplies();
  pilotBefore = (await db.pg.query(`select is_pilot, pilot_allow_outbound from schools where school_id = $1`, [SCHOOL])).rows[0];
  await db.pg.query(`update schools set pilot_allow_outbound = true where school_id = $1`, [SCHOOL]);
  const guardians = (await db.pg.query(`select p.phone, count(*) over (partition by regexp_replace(p.phone, '[^0-9]', '', 'g')) as shared from parents p where p.school_id = $1 order by p.created_at, p.parent_id`, [SCHOOL])).rows;
  const digits = (guardians.find((g) => Number(g.shared) === 1 && /^[6-9][0-9]{9}$/.test(g.phone.replace(/[^0-9]/g, '').slice(-10))) ?? {}).phone?.replace(/[^0-9]/g, '').slice(-10);
  if (!digits) throw new Error('the fixture school has no guardian with a usable number');
  const from = `+91${digits}`;
  const post = async (text) => {
    const rawBody = JSON.stringify({ provider: 'stand-in', notices: [{ kind: 'inbound', providerMessageId: `standin-in-${randomUUID()}`, fromPhone: from, text, at: new Date().toISOString() }] });
    return (await fetch(`${base}/api/public/whatsapp/webhook/stand-in`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-standin-signature': createHmac('sha256', childEnv.WHATSAPP_STANDIN_SECRET).update(rawBody).digest('hex') }, body: rawBody })).status;
  };
  const first = await post('Will the school be open on Saturday?');
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-thread]').first().click();
  await page.locator('[data-thread-open]').waitFor({ timeout: 20000 });
  await page.locator('#thread-reply').fill('Yes, the school is open on Saturday until 12:30.');
  await page.locator('[data-thread-send]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-thread-message="out"]').length === 1, null, { timeout: 20000 });
  const threadShows = await page.locator('[data-thread-message]').evaluateAll((els) => els.map((e) => e.getAttribute('data-thread-message')).join());
  const stop = await post('STOP');
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-thread]').first().click();
  await page.locator('[data-thread-stopped]').waitFor({ timeout: 20000 });
  repliesSeen = { first, stop, threadShows, replyBoxAfterStop: await page.locator('#thread-reply').count() };
};
const parentRepliesDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from message_threads where school_id = $1) as threads, (select count(*)::int from inbound_messages where school_id = $1) as inbound,
            (select count(*)::int from communication_log where school_id = $1 and thread_id is not null and sent_by = $2 and status = 'queued') as replies_waiting,
            (select count(*)::int from whatsapp_opt_outs where school_id = $1 and lifted_at is null) as stopped,
            (select count(*)::int from inbound_messages where school_id is distinct from $1) as elsewhere`,
    [SCHOOL, PEOPLE.principal.sub]
  );
  await clearReplies();
  await db.pg.query(`update schools set pilot_allow_outbound = $2 where school_id = $1`, [SCHOOL, pilotBefore.pilot_allow_outbound]);
  const want = { threads: 1, inbound: 2, replies_waiting: 1, stopped: 1, elsewhere: 0 };
  if (JSON.stringify(rows[0]) !== JSON.stringify(want)) throw new Error(`parents' replies in the database: ${JSON.stringify(rows[0])}`);
  if (JSON.stringify(repliesSeen) !== JSON.stringify({ first: 200, stop: 200, threadShows: 'in,out', replyBoxAfterStop: 0 })) throw new Error(`parents' replies on the screen: ${JSON.stringify(repliesSeen)}`);
};
// Notices to parents (C191): the principal writes a notice for a class. Writing it sends nothing. Approving it is
// what sends it: one message a guardian of that class, through the gate, as the notice template.
const clearNotices = async () => {
  await db.pg.exec(`set session_replication_role = replica; delete from communication_log where dedupe_key like 'notice:%'; delete from jobs where type = 'whatsapp.send'; delete from class_notices; delete from whatsapp_templates where template_name = 'class_notice' and meta_template_id = 'harness-7i'; set session_replication_role = origin;`);
};
let noticesSeen = null;
let noticePilotBefore = null;
const classNotice = async (page) => {
  await clearNotices();
  noticePilotBefore = (await db.pg.query(`select pilot_allow_outbound from schools where school_id = $1`, [SCHOOL])).rows[0];
  await db.pg.query(`update schools set pilot_allow_outbound = true where school_id = $1`, [SCHOOL]);
  await db.pg.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status, meta_template_id) values (null, 'class_notice', 1, 'en', '{{school}}: Notice for {{class}}. {{notice}}', '{school,class,notice}', 'utility', 1440, 'approved', 'harness-7i')`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-notices]').waitFor({ timeout: 20000 });
  await page.selectOption('#notice-class', { label: '5-A' });
  await page.locator('#notice-body').fill('The parent meeting is on Saturday at 10 am in the school hall.');
  await page.locator('[data-notice-write]').click();
  await page.locator('[data-notice="waiting"]').waitFor({ timeout: 20000 });
  const sentBeforeApproval = (await db.pg.query(`select count(*)::int as n from communication_log where dedupe_key like 'notice:%'`)).rows[0].n;
  await page.locator('[data-notice-approve]').click();
  await page.locator('[data-notice="sent"] [data-notice-counts]').waitFor({ timeout: 20000 });
  noticesSeen = { sentBeforeApproval, waitingLeft: await page.locator('[data-notice="waiting"]').count() };
};
const classNoticeDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from class_notices where school_id = $1 and status = 'sent' and decided_by = $2) as sent_notices,
            (select count(*)::int from communication_log l where l.dedupe_key like 'notice:%') as messages,
            (select count(*)::int from communication_log l where l.dedupe_key like 'notice:%' and (l.template_name <> 'class_notice' or l.purpose <> 'operational_communication')) as not_as_notice,
            (select count(*)::int from communication_log l join students s on s.student_id = l.student_id join classes c on c.class_id = s.class_id where l.dedupe_key like 'notice:%' and c.name <> '5-A') as other_classes,
            (select count(*)::int from (select to_phone from communication_log where dedupe_key like 'notice:%' group by to_phone having count(*) > 1) d) as told_twice`,
    [SCHOOL, PEOPLE.principal.sub]
  );
  await clearNotices();
  await db.pg.query(`update schools set pilot_allow_outbound = $2 where school_id = $1`, [SCHOOL, noticePilotBefore.pilot_allow_outbound]);
  const r = rows[0];
  if (r.sent_notices !== 1 || r.messages < 1 || r.not_as_notice !== 0 || r.other_classes !== 0 || r.told_twice !== 0) throw new Error(`the notice in the database: ${JSON.stringify(r)}`);
  if (JSON.stringify(noticesSeen) !== JSON.stringify({ sentBeforeApproval: 0, waitingLeft: 0 })) throw new Error(`the notice on the screen: ${JSON.stringify(noticesSeen)}`);
};
// Parents (C192): the principal finds a guardian, opens them, and chooses Hindi for their messages; the screen and
// the database both say so, and the choice is put back. A teacher opens a guardian of their own class and gets no
// way to change anything, and never the whole number.
let parentsSeen = null;
let parentTouched = null;
const parentsScreen = async (page) => {
  await page.locator('[data-guardian]').first().waitFor({ timeout: 20000 });
  await page.locator('[data-guardian]').first().click();
  await page.locator('[data-guardian-open] [data-guardian-phone]').waitFor({ timeout: 20000 });
  const name = (await page.locator('[data-guardian-open] h2').textContent()).trim();
  parentTouched = (await db.pg.query(`select parent_id, preferred_language from parents where school_id = $1 and name = $2 order by parent_id limit 1`, [SCHOOL, name])).rows[0];
  await page.selectOption('#guardian-language', 'hi');
  await page.locator('[data-guardian-language="hi"]').waitFor({ timeout: 20000 });
  parentsSeen = { purposes: await page.locator('[data-guardian-child]').first().locator('[data-consent]').count(), requests: await page.locator('[data-guardian-requests]').count() };
};
const parentsScreenDone = async () => {
  const now = (await db.pg.query(`select preferred_language from parents where parent_id = $1`, [parentTouched.parent_id])).rows[0].preferred_language;
  await db.pg.query(`update parents set preferred_language = $2 where parent_id = $1`, [parentTouched.parent_id, parentTouched.preferred_language]);
  if (now !== 'hi' || parentsSeen.purposes !== 6 || parentsSeen.requests !== 1) throw new Error(`the Parents screen: language ${now}, ${JSON.stringify(parentsSeen)}`);
};
let parentsTeacherSeen = null;
const parentsTeacher = async (page) => {
  await page.locator('[data-guardian]').first().waitFor({ timeout: 20000 });
  const listed = await page.locator('[data-guardian]').count();
  await page.locator('[data-guardian]').first().click();
  await page.locator('[data-guardian-open] [data-guardian-phone]').waitFor({ timeout: 20000 });
  const text = await page.locator('[data-guardian-open]').textContent();
  parentsTeacherSeen = { listed, canChange: (await page.locator('[data-consent-change]').count()) + (await page.locator('#guardian-language').count()) + (await page.locator('[data-guardian-requests]').count()), wholeNumber: /[0-9]{7,}/.test(text.replace(/\s/g, '')) };
};
const parentsTeacherDone = async () => {
  const all = (await db.pg.query(`select count(*)::int as n from parents where school_id = $1 and merged_into is null`, [SCHOOL])).rows[0].n;
  const t = parentsTeacherSeen;
  if (t.listed < 1 || t.listed > all || t.canChange !== 0 || t.wholeNumber) throw new Error(`the teacher's Parents screen: ${JSON.stringify(t)} of ${all} guardians`);
};
// Parent-teacher meetings (C193): the principal plans a day for 5-A, invites the parents (one message a guardian's
// number and teacher, through the gate), and books a time for a parent who phoned. Everything is put back.
const PTM_TEMPLATES = { ptm_invitation: '{school,date,teacher,children,from,to}', ptm_booked: '{school,date,time,teacher}', ptm_cancelled: '{school,date,teacher}' };
const clearPtm = async () => {
  await db.pg.exec(`set session_replication_role = replica; delete from communication_log where dedupe_key like 'ptm:%'; delete from jobs where type in ('whatsapp.send', 'ptm.remind'); delete from ptm_bookings; delete from ptm_slots; delete from ptm_events; delete from whatsapp_templates where meta_template_id = 'harness-7k'; set session_replication_role = origin;`);
};
let ptmSeen = null;
let ptmPilotBefore = null;
const ptmScreen = async (page) => {
  await clearPtm();
  ptmPilotBefore = (await db.pg.query(`select pilot_allow_outbound from schools where school_id = $1`, [SCHOOL])).rows[0];
  await db.pg.query(`update schools set pilot_allow_outbound = true where school_id = $1`, [SCHOOL]);
  for (const [name, variables] of Object.entries(PTM_TEMPLATES)) await db.pg.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status, meta_template_id) values (null, $1, 1, 'en', '{{school}}: ' || $1, $2, 'utility', 1440, 'approved', 'harness-7k')`, [name, variables]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-ptm-new]').waitFor({ timeout: 20000 });
  await page.locator('#ptm-title').fill('Term meeting');
  await page.locator('#ptm-date').fill(new Date(Date.now() + 5.5 * 3600000 + 3 * 86400000).toISOString().slice(0, 10));
  await page.locator('#ptm-from').fill('10:00');
  await page.locator('#ptm-to').fill('11:00');
  await page.locator('label', { hasText: '5-A' }).locator('[data-ptm-class]').check();
  await page.locator('[data-ptm-make]').click();
  await page.locator('[data-ptm-open="draft"]').waitFor({ timeout: 20000 });
  const sentAsDraft = (await db.pg.query(`select count(*)::int as n from communication_log where dedupe_key like 'ptm:%'`)).rows[0].n;
  await page.locator('[data-ptm-invite]').click();
  await page.locator('[data-ptm-open="invited"]').waitFor({ timeout: 20000 });
  const slot = page.locator('[data-ptm-slot="free"]').first();
  await slot.locator('select').selectOption({ index: 1 });
  await slot.locator('[data-ptm-book]').click();
  await page.locator('[data-ptm-slot="booked"]').waitFor({ timeout: 20000 });
  ptmSeen = { sentAsDraft, slots: await page.locator('[data-ptm-slot]').count(), booked: await page.locator('[data-ptm-slot="booked"]').count() };
};
const ptmScreenDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from ptm_events where school_id = $1 and status = 'invited') as invited, (select count(*)::int from ptm_bookings where booked_via = 'staff' and booked_by = $2) as booked,
            (select count(*)::int from communication_log where dedupe_key like 'ptm:%:inv:%') as invitations,
            (select count(*)::int from (select to_phone from communication_log where dedupe_key like 'ptm:%:inv:%' group by to_phone, split_part(dedupe_key, ':', 4) having count(*) > 1) d) as twice,
            (select count(*)::int from jobs where type = 'ptm.remind') as reminders`,
    [SCHOOL, PEOPLE.principal.sub]
  );
  await clearPtm();
  await db.pg.query(`update schools set pilot_allow_outbound = $2 where school_id = $1`, [SCHOOL, ptmPilotBefore.pilot_allow_outbound]);
  const r = rows[0];
  if (r.invited !== 1 || r.booked !== 1 || r.invitations < 1 || r.twice !== 0 || r.reminders !== 1) throw new Error(`the meeting in the database: ${JSON.stringify(r)}`);
  if (JSON.stringify(ptmSeen) !== JSON.stringify({ sentAsDraft: 0, slots: 4, booked: 1 })) throw new Error(`the meeting on the screen: ${JSON.stringify(ptmSeen)}`);
};
// Events (C194): the principal adds an event for 5-A and invites: the guardians of 5-A are told, once each,
// through the gate. Then cancels it: those invited are told. Everything is put back.
const clearEvents = async () => {
  await db.pg.exec(`set session_replication_role = replica; delete from communication_log where dedupe_key like 'event:%'; delete from jobs where type in ('whatsapp.send', 'event.remind'); delete from event_replies; delete from school_events; delete from whatsapp_templates where meta_template_id = 'harness-7l'; set session_replication_role = origin;`);
};
let eventsSeen = null;
let eventPilotBefore = null;
const eventsScreen = async (page) => {
  await clearEvents();
  eventPilotBefore = (await db.pg.query(`select pilot_allow_outbound from schools where school_id = $1`, [SCHOOL])).rows[0];
  await db.pg.query(`update schools set pilot_allow_outbound = true where school_id = $1`, [SCHOOL]);
  for (const [name, variables] of Object.entries({ event_invitation: '{school,title,when,details}', event_cancelled: '{school,title,when}' })) await db.pg.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status, meta_template_id) values (null, $1, 1, 'en', '{{school}}: ' || $1, $2, 'utility', 1440, 'approved', 'harness-7l')`, [name, variables]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-event-new]').waitFor({ timeout: 20000 });
  await page.locator('#event-title').fill('Sports day');
  await page.locator('#event-date').fill(new Date(Date.now() + 5.5 * 3600000 + 4 * 86400000).toISOString().slice(0, 10));
  await page.locator('#event-time').fill('09:30');
  await page.locator('#event-details').fill('On the school ground. Please send a water bottle.');
  await page.locator('[data-event-all]').uncheck();
  await page.locator('label', { hasText: '5-A' }).locator('[data-event-class]').check();
  await page.locator('[data-event-make]').click();
  await page.locator('[data-event="draft"]').waitFor({ timeout: 20000 });
  const sentAsDraft = (await db.pg.query(`select count(*)::int as n from communication_log where dedupe_key like 'event:%'`)).rows[0].n;
  await page.locator('[data-event-invite]').click();
  await page.locator('[data-event="invited"] [data-event-counts]').waitFor({ timeout: 20000 });
  eventsSeen = { sentAsDraft };
};
const eventsScreenDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from school_events where school_id = $1 and status = 'invited' and invited_by = $2) as invited,
            (select count(*)::int from communication_log where dedupe_key like 'event:%:inv:%') as invitations,
            (select count(*)::int from communication_log l join students s on s.student_id = l.student_id join classes c on c.class_id = s.class_id where l.dedupe_key like 'event:%' and c.name <> '5-A') as other_classes,
            (select count(*)::int from (select to_phone from communication_log where dedupe_key like 'event:%:inv:%' group by to_phone having count(*) > 1) d) as twice,
            (select count(*)::int from jobs where type = 'event.remind') as reminders`,
    [SCHOOL, PEOPLE.principal.sub]
  );
  await clearEvents();
  await db.pg.query(`update schools set pilot_allow_outbound = $2 where school_id = $1`, [SCHOOL, eventPilotBefore.pilot_allow_outbound]);
  const r = rows[0];
  if (r.invited !== 1 || r.invitations < 1 || r.other_classes !== 0 || r.twice !== 0 || r.reminders !== 1 || eventsSeen.sentAsDraft !== 0) throw new Error(`the event: ${JSON.stringify(r)} ${JSON.stringify(eventsSeen)}`);
};
// Complaints (C195): the principal records a guardian's complaint and gives it to a member of staff; then closes it
// with what was done. Closing without words is not possible on the screen or in the database. Put back afterwards.
const clearComplaints = async () => {
  await db.pg.exec(`set session_replication_role = replica; delete from communication_log where dedupe_key like 'complaint:%'; delete from jobs where type in ('whatsapp.send', 'complaint.escalate'); delete from complaint_events; delete from complaints; delete from whatsapp_templates where meta_template_id = 'harness-7m'; set session_replication_role = origin;`);
};
let complaintsSeen = null;
const complaintsScreen = async (page) => {
  await clearComplaints();
  for (const [name, variables] of Object.entries({ complaint_received: '{school,ref,owner,due}', complaint_closed: '{school,ref,note}' })) await db.pg.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status, meta_template_id) values (null, $1, 1, 'en', '{{school}}: ' || $1, $2, 'utility', 1440, 'approved', 'harness-7m')`, [name, variables]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-complaint-new]').waitFor({ timeout: 20000 });
  await page.locator('#complaint-guardian').fill('Example');
  await page.locator('[data-complaint-guardian]').first().click();
  await page.selectOption('#complaint-child', { index: 1 });
  await page.selectOption('#complaint-owner', { index: 1 });
  await page.locator('#complaint-summary').fill('The school bus reached late three days this week.');
  await page.locator('[data-complaint-open]').click();
  await page.locator('[data-complaint="open"]').waitFor({ timeout: 20000 });
  const closeDisabledWithoutWords = await page.locator('[data-complaint-close]').first().isDisabled();
  await page.locator('[data-complaint="open"] input').first().fill('The bus now leaves ten minutes earlier.');
  await page.locator('[data-complaint-close]').first().click();
  await page.locator('[data-complaint="closed"]').waitFor({ timeout: 20000 });
  complaintsSeen = { closeDisabledWithoutWords, steps: await page.locator('[data-complaint="closed"] [data-complaint-step]').evaluateAll((els) => els.map((e) => e.getAttribute('data-complaint-step')).join()) };
};
const complaintsScreenDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from complaints where school_id = $1 and status = 'closed' and closing_note = 'The bus now leaves ten minutes earlier.' and closed_by = $2 and principal_seen_at is not null) as closed,
            (select count(*)::int from complaint_events) as steps, (select count(*)::int from jobs where type = 'complaint.escalate') as escalations`,
    [SCHOOL, PEOPLE.principal.sub]
  );
  await clearComplaints();
  const r = rows[0];
  if (r.closed !== 1 || r.steps !== 2 || r.escalations !== 1) throw new Error(`the complaint in the database: ${JSON.stringify(r)}`);
  if (JSON.stringify(complaintsSeen) !== JSON.stringify({ closeDisabledWithoutWords: true, steps: 'opened,closed' })) throw new Error(`the complaint on the screen: ${JSON.stringify(complaintsSeen)}`);
};
// Parent AI v1 (C196): the principal drafts "what to do at home" for a guardian of 5-A from a topic taught today.
// The draft sends nothing and shows what it used; approving it is what sends it. Everything is put back.
const clearParentAi = async () => {
  await db.pg.exec(`set session_replication_role = replica; delete from communication_log where dedupe_key like 'parent-ai:%'; delete from jobs where type = 'whatsapp.send'; delete from parent_ai_answers; delete from ai_usage where kind = 'home_help'; delete from pulse_messages where topic = 'Fractions (harness 7n)'; delete from whatsapp_templates where meta_template_id = 'harness-7n'; set session_replication_role = origin;`);
};
let parentAiSeen = null;
let parentAiPilotBefore = null;
const parentAiScreen = async (page) => {
  await clearParentAi();
  parentAiPilotBefore = (await db.pg.query(`select pilot_allow_outbound from schools where school_id = $1`, [SCHOOL])).rows[0];
  await db.pg.query(`update schools set pilot_allow_outbound = true where school_id = $1`, [SCHOOL]);
  await db.pg.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status, meta_template_id) values (null, 'home_help', 1, 'en', '{{school}}: What you can do at home for {{child}}. {{answer}}', '{school,child,answer}', 'utility', 1440, 'approved', 'harness-7n')`);
  await db.pg.query(`insert into pulse_messages (school_id, class_id, topic, body_en, body_hi, body_hinglish, sent_on, status, created_by) select $1, c.class_id, 'Fractions (harness 7n)', 'x', 'हिन्दी', 'x', (now() at time zone 'Asia/Kolkata')::date, 'ready', $2 from classes c where c.school_id = $1 and c.name = '5-A'`, [SCHOOL, PEOPLE.principal.sub]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-parent-ai-new]').waitFor({ timeout: 20000 });
  await page.locator('#parent-ai-guardian').fill('Example');
  await page.locator('[data-parent-ai-guardian]').first().click();
  await page.locator('[data-parent-ai-draft]').click();
  await page.locator('[data-answer="draft"]').waitFor({ timeout: 20000 });
  const sentAsDraft = (await db.pg.query(`select count(*)::int as n from communication_log where dedupe_key like 'parent-ai:%'`)).rows[0].n;
  const cited = await page.locator('[data-answer="draft"] [data-answer-sources] li').count();
  await page.locator('[data-answer-approve]').click();
  await page.locator('[data-answer="sent"]').waitFor({ timeout: 20000 });
  parentAiSeen = { sentAsDraft, cited: cited > 0 };
};
const parentAiScreenDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from parent_ai_answers where school_id = $1 and status = 'sent' and approved_by = $2 and jsonb_array_length(sources) >= 1) as sent,
            (select count(*)::int from communication_log where dedupe_key like 'parent-ai:%' and template_name = 'home_help') as messages, (select count(*)::int from ai_usage where kind = 'home_help') as model_calls, (select count(*)::int from parent_ai_answers where ai_assisted) as with_ai`,
    [SCHOOL, PEOPLE.principal.sub]
  );
  await clearParentAi();
  await db.pg.query(`update schools set pilot_allow_outbound = $2 where school_id = $1`, [SCHOOL, parentAiPilotBefore.pilot_allow_outbound]);
  const r = rows[0];
  // The harness runs with the stand-in AI door open for the fixture school: a tip that came through it is metered, once.
  if (r.sent !== 1 || r.messages !== 1 || r.model_calls !== r.with_ai) throw new Error(`the answer in the database: ${JSON.stringify(r)}`);
  if (JSON.stringify(parentAiSeen) !== JSON.stringify({ sentAsDraft: 0, cited: true })) throw new Error(`the answer on the screen: ${JSON.stringify(parentAiSeen)}`);
};
// Control → Messaging & Cost (C197): the founder adds a rate with Meta's page and today's date (a made-up number,
// taken away afterwards), and sets a school's monthly limit with a reason (put back afterwards).
let costSeen = null;
let budgetsBefore = [];
const clearCost = async () => {
  await db.pg.exec(`set session_replication_role = replica; delete from message_rate_table where verified_source like '%harness-7o%'; set session_replication_role = origin;`);
};
const messagingCost = async (page) => {
  await clearCost();
  budgetsBefore = (await db.pg.query(`select school_id, monthly_budget_paise from schools`)).rows;
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-cost-rate-form]').waitFor({ timeout: 20000 });
  await page.locator('#rate-rupees').fill('0.11');
  await page.locator('#rate-source').fill('https://developers.facebook.com/docs/whatsapp/pricing?harness-7o');
  await page.locator('[data-cost-rate-add]').click();
  await page.waitForFunction(() => /Added/.test(document.querySelector('[data-cost-note]')?.textContent ?? ''), null, { timeout: 20000 });
  const school = page.locator('[data-cost-school]').first();
  await school.locator('input').nth(0).fill('500');
  await school.locator('input').nth(1).fill('Agreed with the principal.');
  await school.locator('[data-cost-budget-save]').click();
  await page.waitForFunction(() => /limit is set/.test(document.querySelector('[data-cost-note]')?.textContent ?? ''), null, { timeout: 20000 });
  costSeen = { schools: await page.locator('[data-cost-school]').count() };
};
const messagingCostDone = async () => {
  const { rows } = await db.pg.query(`select (select count(*)::int from message_rate_table where verified_source like '%harness-7o%' and rate_paise = 11 and billing_category = 'utility') as rates, (select count(*)::int from schools where monthly_budget_paise = 50000) as budgets, (select count(*)::int from audit_log where event_action in ('whatsapp.rate_added', 'whatsapp.budget_set')) as audited`);
  await clearCost();
  for (const b of budgetsBefore) await db.pg.query(`update schools set monthly_budget_paise = $2 where school_id = $1`, [b.school_id, b.monthly_budget_paise]);
  const r = rows[0];
  if (r.rates < 1 || r.budgets < 1 || r.audited < 2 || costSeen.schools < 1) throw new Error(`messaging cost: ${JSON.stringify(r)} ${JSON.stringify(costSeen)}`);
};
// --- P5 (docs/26): one block a slice. A slice's lines go between its own two marker lines, nowhere else. ---
// p5-8a begin
// p5-8a end
// p5-8b begin
// Staff leave (C201). On Staff the principal approves one request, refuses another with a note and records leave
// for someone who phoned in; the principal's own request is there with nothing to press. Approved leave far ahead
// and leave that has ended are on the screen too: the principal cancels one that ended last week, and reaches one
// that ended long ago by moving the list's first day back. On the account page a teacher puts in a request and
// sees it waiting beside an earlier answer; a principal who is the only person in the office is told that nobody
// can decide theirs yet. Every leave row is taken away after; the audit rows stay (the log is never cut) and are
// counted from where they stood.
const LEAVE_OTHER_TEACHER = '00000000-0000-4000-8000-00000000a004';
const clearLeave = () => db.pg.exec(`set session_replication_role = replica; delete from staff_leave; set session_replication_role = origin;`);
const leaveAudit = async () => (await db.pg.query(`select count(*)::int as n from audit_log where event_action like 'leave.%'`)).rows[0].n;
const leaveDay = async (n) => (await db.pg.query(`select (${TODAY_SQL} + $1::int)::text as d`, [n])).rows[0].d;
const putLeave = (user, from, to, kind, reason, decidedBy = null) =>
  db.pg.query(
    `insert into staff_leave (school_id, user_id, from_date, to_date, kind, reason, status, recorded_by, decided_by, decided_at)
     values ($1, $2, ${TODAY_SQL} + $3::int, ${TODAY_SQL} + $4::int, $5, $6, case when $7::uuid is null then 'waiting' else 'approved' end, $2, $7::uuid, case when $7::uuid is not null then now() end)`,
    [SCHOOL, user, from, to, kind, reason, decidedBy]
  );
let leaveAuditBefore = 0;
let staffLeaveSeen = null;
const staffLeave = async (page) => {
  await clearLeave();
  leaveAuditBefore = await leaveAudit();
  await putLeave(PEOPLE.teacher.sub, 3, 4, 'casual', 'A family function in another town.');
  await putLeave(LEAVE_OTHER_TEACHER, 6, 6, 'sick', 'An appointment with the doctor.');
  await putLeave(PEOPLE.principal.sub, 10, 10, 'other', 'A meeting at the education office.');
  // Approved leave the office must still be able to find and cancel: far ahead, ended last week, ended long ago.
  await putLeave(PEOPLE.teacher.sub, 45, 46, 'casual', 'A wedding in the family.', PEOPLE.principal.sub);
  await putLeave(LEAVE_OTHER_TEACHER, -5, -3, 'sick', 'Was unwell for three days.', PEOPLE.principal.sub);
  await putLeave(PEOPLE.office.sub, -9, -9, 'casual', 'A day at the district office.', PEOPLE.principal.sub);
  await putLeave(PEOPLE.teacher.sub, -80, -79, 'other', 'An examination duty at another school.', PEOPLE.principal.sub);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-leave-waiting-row="theirs"]').first().waitFor({ timeout: 20000 });
  const rows = (part) => page.locator(`[data-leave-${part}] [data-leave-calendar-row]`).count();
  const rowsBecome = (part, n) => page.waitForFunction(([p, want]) => document.querySelectorAll(`[data-leave-${p}] [data-leave-calendar-row]`).length === want, [part, n], { timeout: 20000 });
  // As the screen opens: the leave far ahead, and the two that ended in the last weeks, each with its button.
  const atFirst = { ahead: await rows('ahead'), ended: await rows('ended'), cancelButtons: await page.locator('[data-leave-cancel-open]').count() };
  const refuseNeedsNote = await page.locator('[data-leave-refuse]').first().isDisabled();
  const ownButtons = await page.locator('[data-leave-waiting-row="own"] button').count();
  // The first request (the teacher's) is approved: it moves to the days ahead.
  await page.locator('[data-leave-approve]').first().click();
  await rowsBecome('ahead', 2);
  await page.waitForFunction(() => document.querySelectorAll('[data-leave-waiting-row="theirs"]').length === 1, null, { timeout: 20000 });
  // The second is refused, with the note its person will read.
  await page.locator('[data-leave-waiting-row="theirs"] input').first().fill('Two teachers are already away that day.');
  await page.locator('[data-leave-refuse]').first().click();
  await page.waitForFunction(() => document.querySelectorAll('[data-leave-waiting-row="theirs"]').length === 0, null, { timeout: 20000 });
  // The school admin phoned in this morning: recorded, and approved at once in the principal's name.
  await page.selectOption('#leave-record-who', PEOPLE.office.sub);
  await page.locator('#leave-record-from').fill(await leaveDay(0));
  await page.locator('#leave-record-reason').fill('Phoned in unwell this morning.');
  await page.locator('[data-leave-record-send]').click();
  await rowsBecome('ahead', 3);
  // The school admin's day last week was written down by mistake: cancelled after its day, with a note.
  const ended = page.locator('[data-leave-ended] [data-leave-calendar-row]');
  await ended.first().locator('[data-leave-cancel-open]').click();
  await ended.first().locator('input').fill('He was in school that day.');
  await ended.first().locator('[data-leave-cancel]').click();
  await rowsBecome('ended', 1);
  const note = await page.locator('[data-leave-note]').getAttribute('data-leave-note');
  // Leave that ended long ago is reached by moving the first day of the list back.
  await page.locator('#leave-calendar-from').fill(await leaveDay(-90));
  await rowsBecome('ended', 2);
  staffLeaveSeen = { atFirst, refuseNeedsNote, ownButtons, stillWaiting: await page.locator('[data-leave-waiting-row]').count(), note, ownLine: await page.locator('[data-leave-own]').getAttribute('data-leave-own'), aheadAtLast: await rows('ahead') };
};
const staffLeaveDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from staff_leave where school_id = $1 and user_id = $2 and status = 'approved' and decided_by = $3 and recorded_by = $2 and from_date = ${TODAY_SQL} + 3) as approved,
            (select count(*)::int from staff_leave where school_id = $1 and user_id = $4 and status = 'refused' and decided_by = $3 and decision_note = 'Two teachers are already away that day.') as refused,
            (select count(*)::int from staff_leave where school_id = $1 and user_id = $5 and status = 'approved' and decided_by = $3 and recorded_by = $3 and from_date = ${TODAY_SQL} and to_date = ${TODAY_SQL}) as recorded,
            (select count(*)::int from staff_leave where school_id = $1 and user_id = $3 and status = 'waiting' and decided_by is null) as own_waiting,
            (select count(*)::int from staff_leave where school_id = $1 and user_id = $5 and status = 'withdrawn' and withdrawn_by = $3 and withdrawn_note = 'He was in school that day.' and decided_by = $3 and to_date = ${TODAY_SQL} - 9) as cancelled_after,
            (select count(*)::int from staff_leave where school_id = $1 and status = 'approved') as still_approved,
            (select count(*)::int from staff_leave where decided_by = user_id) as decided_own,
            (select count(*)::int from staff_leave) as in_all`,
    [SCHOOL, PEOPLE.teacher.sub, PEOPLE.principal.sub, LEAVE_OTHER_TEACHER, PEOPLE.office.sub]
  );
  const audited = (await leaveAudit()) - leaveAuditBefore;
  await clearLeave();
  const want = { approved: 1, refused: 1, recorded: 1, own_waiting: 1, cancelled_after: 1, still_approved: 5, decided_own: 0, in_all: 8 };
  if (JSON.stringify(rows[0]) !== JSON.stringify(want) || audited !== 4) throw new Error(`leave in the database: ${JSON.stringify(rows[0])}, ${audited} audit rows`);
  const seen = { atFirst: { ahead: 1, ended: 2, cancelButtons: 3 }, refuseNeedsNote: true, ownButtons: 0, stillWaiting: 1, note: 'ok', ownLine: 'decided', aheadAtLast: 3 };
  if (JSON.stringify(staffLeaveSeen) !== JSON.stringify(seen)) throw new Error(`leave on the Staff screen: ${JSON.stringify(staffLeaveSeen)}`);
};
let accountLeaveSeen = null;
const accountLeave = async (page) => {
  await clearLeave();
  leaveAuditBefore = await leaveAudit();
  // An earlier request, already answered by the principal.
  await putLeave(PEOPLE.teacher.sub, 20, 21, 'casual', 'A wedding in the family.', PEOPLE.principal.sub);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-my-leave]').waitFor({ timeout: 20000 });
  const sendNeedsDaysAndReason = await page.locator('[data-my-leave-send]').isDisabled();
  await page.locator('#my-leave-from').fill(await leaveDay(5));
  await page.locator('#my-leave-to').fill(await leaveDay(6));
  await page.selectOption('#my-leave-kind', 'sick');
  await page.locator('#my-leave-reason').fill('A small operation, and a day of rest after it.');
  await page.locator('[data-my-leave-send]').click();
  await page.locator('[data-my-leave-row="waiting"]').waitFor({ timeout: 20000 });
  accountLeaveSeen = {
    sendNeedsDaysAndReason,
    rows: await page.locator('[data-my-leave-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-my-leave-row')).join()),
    answers: await page.locator('[data-my-leave-row="approved"] [data-leave-answer]').count(),
    withdraw: await page.locator('[data-my-leave-withdraw]').count(),
    how: await page.locator('[data-my-leave-how]').getAttribute('data-my-leave-how'),
  };
};
const accountLeaveDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from staff_leave where school_id = $1 and user_id = $2 and status = 'waiting' and recorded_by = $2 and decided_by is null and kind = 'sick'
               and from_date = ${TODAY_SQL} + 5 and to_date = ${TODAY_SQL} + 6 and reason = 'A small operation, and a day of rest after it.') as asked,
            (select count(*)::int from staff_leave where school_id = $1 and user_id = $2 and status = 'approved' and decided_by = $3) as answered,
            (select count(*)::int from staff_leave) as in_all`,
    [SCHOOL, PEOPLE.teacher.sub, PEOPLE.principal.sub]
  );
  const audited = (await leaveAudit()) - leaveAuditBefore;
  await clearLeave();
  if (JSON.stringify(rows[0]) !== JSON.stringify({ asked: 1, answered: 1, in_all: 2 }) || audited !== 1) throw new Error(`the teacher's leave in the database: ${JSON.stringify(rows[0])}, ${audited} audit rows`);
  if (JSON.stringify(accountLeaveSeen) !== JSON.stringify({ sendNeedsDaysAndReason: true, rows: 'approved,waiting', answers: 1, withdraw: 2, how: 'decided' })) throw new Error(`leave on the account page: ${JSON.stringify(accountLeaveSeen)}`);
};
// A school with one person in its office: for this screen the school admin's account is switched off, so the
// principal is the only one who decides leave, and nobody decides their own. "My leave" must say so, and say what
// changes it. The account is switched back on after, whatever happened.
let aloneLeaveSeen = null;
const accountLeaveAlone = async (page) => {
  await clearLeave();
  await db.pg.query(`update users set is_active = false where user_id = $1`, [PEOPLE.office.sub]);
  await page.reload({ waitUntil: 'networkidle' });
  const how = page.locator('[data-my-leave-how]');
  await how.waitFor({ timeout: 20000 });
  const words = await how.innerText();
  aloneLeaveSeen = { how: await how.getAttribute('data-my-leave-how'), saysWhy: words.includes('Nobody decides their own'), saysWhatNext: words.includes('“Invite staff”'), namesAnother: words.includes('the other person in the office') };
};
const accountLeaveAloneDone = async () => {
  await db.pg.query(`update users set is_active = true where user_id = $1`, [PEOPLE.office.sub]);
  const left = (await db.pg.query(`select count(*)::int as n from staff_leave`)).rows[0].n;
  await clearLeave();
  if (left !== 0 || JSON.stringify(aloneLeaveSeen) !== JSON.stringify({ how: 'alone', saysWhy: true, saysWhatNext: true, namesAnother: false })) throw new Error(`"My leave" for the only person in the office: ${JSON.stringify(aloneLeaveSeen)}, ${left} leave rows`);
};
// p5-8b end
// p5-8c begin
// Proxy Auto (C202). Tara is on approved leave today and tomorrow. The seeded two teachers teach each other's
// classes in every period, so two more who are free are added for the run: Tejas, who teaches Mathematics in 6-A
// in period 4, and Tripti, who has no period. The principal opens the day, reads the free teachers of each
// period and the reason beside each name, and gives the first period to the first suggestion with one tap. On a
// Sunday the school is closed, so the day worked on is tomorrow. Nothing is sent and no job is added. Everything
// put in is taken away after; the audit rows stay (the log is never cut) and are counted from where they stood.
const PROXY_TEACHERS = { tejas: '00000000-0000-4000-8000-00000000a0c1', tripti: '00000000-0000-4000-8000-00000000a0c2' };
const PROXY_CLASS_6A = '00000000-0000-4000-8000-0000000c0061';
const PROXY_MATHS = '00000000-0000-4000-8000-0000000d0001';
const PROXY_ENGLISH = '00000000-0000-4000-8000-0000000d0002';
// A cover on a day the school is closed is not shown to its teacher, and the seeded school does not work on a
// Sunday. So that a teacher's three screens below mean the same thing on every day of the week, the school works
// all seven days while they are drawn; the setting is put in only if the school has none, and taken away after.
let proxyWorksAllWeek = false;
const proxyWorkAllWeek = async () => {
  const put = await db.pg.query(
    `insert into school_settings (school_id, module_id, schema_version, setting_values, revision) values ($1, 'setup', 2, '{"working_days": ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]}', 1)
     on conflict (school_id, module_id) do nothing returning module_id`,
    [SCHOOL]
  );
  proxyWorksAllWeek = put.rows.length > 0;
};
const clearProxy = async () => {
  await db.pg.exec(`set session_replication_role = replica; delete from substitutions; delete from staff_leave; delete from timetable_entries where period > 3; delete from users where user_id in ('${PROXY_TEACHERS.tejas}', '${PROXY_TEACHERS.tripti}'); set session_replication_role = origin;`);
  if (proxyWorksAllWeek) await db.pg.query(`delete from school_settings where school_id = $1 and module_id = 'setup'`, [SCHOOL]);
  proxyWorksAllWeek = false;
};
const proxyAudit = async () => (await db.pg.query(`select count(*)::int as n from audit_log where event_action like 'cover.%'`)).rows[0].n;
const proxySentOrQueued = async () => (await db.pg.query(`select (select count(*)::int from jobs) as jobs, (select count(*)::int from communication_log) as messages`)).rows[0];
let proxyBefore = null;
let proxyDate = '';
let proxySeen = null;
const proxyScreen = async (page) => {
  await clearProxy();
  proxyBefore = { audit: await proxyAudit(), ...(await proxySentOrQueued()) };
  const sunday = (await db.pg.query(`select extract(isodow from ${TODAY_SQL})::int as dow`)).rows[0].dow === 7;
  proxyDate = await leaveDay(sunday ? 1 : 0);
  await db.pg.query(`insert into users (user_id, school_id, email, role, display_name) values ($1, $3, 'tejas@example.invalid', 'teacher', 'Tejas Example'), ($2, $3, 'tripti@example.invalid', 'teacher', 'Tripti Example')`, [PROXY_TEACHERS.tejas, PROXY_TEACHERS.tripti, SCHOOL]);
  await db.pg.query(`insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) select $1, $2, d, 4, $3, $4 from generate_series(1, 6) d`, [SCHOOL, PROXY_CLASS_6A, PROXY_MATHS, PROXY_TEACHERS.tejas]);
  await putLeave(PEOPLE.teacher.sub, 0, 1, 'sick', 'Unwell, phoned in this morning.', PEOPLE.principal.sub);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-proxy="arranger"]').waitFor({ timeout: 20000 });
  if (sunday) await page.locator('[data-proxy-day="tomorrow"]').click();
  const periods = page.locator(`[data-proxy-date="${proxyDate}"] [data-proxy-period]`);
  await periods.first().waitFor({ timeout: 20000 });
  const atFirst = { periods: await periods.count(), covered: await page.locator('[data-proxy-period][data-covered="yes"]').count(), away: (await page.locator('[data-proxy-away]').innerText()).includes('Tara Example') };
  const first = periods.first();
  const title = await first.locator('h3').innerText();
  const offered = await first.locator('[data-proxy-suggestion] p:first-child').allInnerTexts();
  const why = await first.locator('[data-proxy-why]').allInnerTexts();
  // Tanvi teaches the other class in every period, and Tara is the one away: neither is ever offered.
  const offersSomeoneBusy = (await page.locator(`[data-proxy-suggestion="${LEAVE_OTHER_TEACHER}"], [data-proxy-suggestion="${PEOPLE.teacher.sub}"]`).count()) > 0;
  await first.locator('[data-proxy-assign]').first().click();
  await page.locator('[data-proxy-period][data-covered="yes"]').waitFor({ timeout: 20000 });
  proxySeen = {
    atFirst, title, offered: offered.join(), why: why.join(' | '), offersSomeoneBusy,
    note: await page.locator('[data-proxy-note]').getAttribute('data-proxy-note'),
    covered: await page.locator('[data-proxy-period][data-covered="yes"]').count(),
    cover: (await page.locator('[data-proxy-cover]').innerText()).includes('Tejas Example covers this period'),
    undo: await page.locator('[data-proxy-undo]').count(),
    assignButtonsOnTheCovered: await page.locator('[data-proxy-period][data-covered="yes"] [data-proxy-assign]').count(),
  };
};
const proxyScreenDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from substitutions) as in_all,
            (select count(*)::int from substitutions where school_id = $1 and on_date = $2::date and period = 1 and class_id = $3 and subject_id = $4 and absent_user_id = $5 and substitute_user_id = $6
                and status = 'assigned' and assigned_by = $7 and undone_by is null) as assigned`,
    [SCHOOL, proxyDate, CLASS_5A, PROXY_MATHS, PEOPLE.teacher.sub, PROXY_TEACHERS.tejas, PEOPLE.principal.sub]
  );
  const audited = (await proxyAudit()) - proxyBefore.audit;
  const after = await proxySentOrQueued();
  await clearProxy();
  if (JSON.stringify(rows[0]) !== JSON.stringify({ in_all: 1, assigned: 1 }) || audited !== 1) throw new Error(`the cover in the database: ${JSON.stringify(rows[0])}, ${audited} audit rows`);
  if (after.jobs !== proxyBefore.jobs || after.messages !== proxyBefore.messages) throw new Error(`a cover must add no job and no message: ${JSON.stringify(after)} after ${JSON.stringify(proxyBefore)}`);
  const seen = {
    atFirst: { periods: 3, covered: 0, away: true }, title: 'Period 1 · 5-A · Mathematics', offered: 'Tejas Example,Tripti Example',
    why: 'Free this period · Teaches Mathematics · 1 period that day · No cover that week | Free this period · No period that day · No cover that week',
    offersSomeoneBusy: false, note: 'ok', covered: 1, cover: true, undo: 1, assignButtonsOnTheCovered: 0,
  };
  if (JSON.stringify(proxySeen) !== JSON.stringify(seen)) throw new Error(`Proxy Auto on the screen: ${JSON.stringify(proxySeen)}`);
};
// A teacher's own covers (C202): Tara holds a cover today, one tomorrow and one later in the week, for Tanvi. They
// are put in as rows, because assigning is the office's tap (the screen above). "Your covers" shows the three, each
// as its period, class and subject and never whose class it was, and has nothing to press. The rows are taken
// away after.
let proxyMineSeen = null;
const proxyMine = async (page) => {
  await clearProxy();
  await proxyWorkAllWeek();
  await db.pg.exec(`set session_replication_role = replica;
    insert into substitutions (school_id, on_date, period, class_id, subject_id, absent_user_id, substitute_user_id, assigned_by) values
      ('${SCHOOL}', ${TODAY_SQL}, 4, '${PROXY_CLASS_6A}', '${PROXY_ENGLISH}', '${LEAVE_OTHER_TEACHER}', '${PEOPLE.teacher.sub}', '${PEOPLE.office.sub}'),
      ('${SCHOOL}', ${TODAY_SQL} + 1, 5, '${PROXY_CLASS_6A}', '${PROXY_MATHS}', '${LEAVE_OTHER_TEACHER}', '${PEOPLE.teacher.sub}', '${PEOPLE.office.sub}'),
      ('${SCHOOL}', ${TODAY_SQL} + case when extract(isodow from ${TODAY_SQL} + 3) = 7 then 4 else 3 end, 4, '${PROXY_CLASS_6A}', '${PROXY_ENGLISH}', '${LEAVE_OTHER_TEACHER}', '${PEOPLE.teacher.sub}', '${PEOPLE.office.sub}');
    set session_replication_role = origin;`);
  await page.reload({ waitUntil: 'networkidle' });
  const mine = page.locator('[data-proxy="teacher"]');
  await mine.waitFor({ timeout: 20000 });
  await page.locator('[data-proxy-mine]').first().waitFor({ timeout: 20000 });
  const words = await mine.innerText();
  proxyMineSeen = { rows: await page.locator('[data-proxy-mine]').count(), none: await page.locator('[data-proxy-mine-none]').count(), buttons: await mine.locator('button').count(), today: words.includes('Period 4 · 6-A · English'), namesWhoIsAway: words.includes('Tanvi') || words.includes('In place of'), later: words.includes('The days after') };
};
const proxyMineDone = async () => {
  const left = (await db.pg.query(`select count(*)::int as n from substitutions where status = 'assigned' and substitute_user_id = $1`, [PEOPLE.teacher.sub])).rows[0].n;
  await clearProxy();
  if (left !== 3 || JSON.stringify(proxyMineSeen) !== JSON.stringify({ rows: 3, none: 0, buttons: 0, today: true, namesWhoIsAway: false, later: true })) throw new Error(`a teacher's covers: ${JSON.stringify(proxyMineSeen)}, ${left} rows`);
};
// The same cover where a teacher already looks (C202): above their week on Timetable, and as a card on My Day.
// One cover today is put in as a row, and taken away after.
const proxyCoverToday = () =>
  db.pg.exec(`set session_replication_role = replica;
    insert into substitutions (school_id, on_date, period, class_id, subject_id, absent_user_id, substitute_user_id, assigned_by) values
      ('${SCHOOL}', ${TODAY_SQL}, 4, '${PROXY_CLASS_6A}', '${PROXY_ENGLISH}', '${LEAVE_OTHER_TEACHER}', '${PEOPLE.teacher.sub}', '${PEOPLE.office.sub}');
    set session_replication_role = origin;`);
let proxyCoverSeen = null;
const proxyCoverShownAt = (selector, wanted) => async (page) => {
  await clearProxy();
  await proxyWorkAllWeek();
  await proxyCoverToday();
  await page.reload({ waitUntil: 'networkidle' });
  const block = page.locator(selector);
  await block.waitFor({ timeout: 20000 });
  const words = await block.innerText();
  // The period, the class and the subject; never whose class it was.
  proxyCoverSeen = { selector, says: wanted.every((w) => words.includes(w)) && !words.includes('Tanvi') && !words.includes('in place of'), words: words.replace(/\s+/g, ' ').slice(0, 200) };
};
const proxyCoverShownDone = (selector) => async () => {
  const left = (await db.pg.query(`select count(*)::int as n from substitutions`)).rows[0].n;
  await clearProxy();
  if (left !== 1 || proxyCoverSeen?.selector !== selector || !proxyCoverSeen.says) throw new Error(`a teacher's cover at ${selector}: ${JSON.stringify(proxyCoverSeen)}, ${left} rows`);
};
// p5-8c end
// p5-8d begin
// The principal's dashboard on school facts (docs/26 slice 8d, C203). The dashboard is opened on 30 days after a
// few rows the seed does not have are added (a homework due today with one student not done, a receipt, a
// complaint past its time, a notice waiting, an event to come, a draft answer, a monthly budget). Then EVERY tile
// that is a link is followed in the same browser and what its screen lists is counted: the number on the tile
// must be the rows of the screen it opens (or, for a sum or a figure, what those rows or that screen say). A tile
// with no link must be one of the two whose screen has no such list yet. Afterwards some tiles are compared with
// the database, and every added row is taken away.
const indiaDay = (back = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() - back * 86400000));
const H8D = '00000000-0000-4000-8000-0000008d000';
const clearDashboardRows = async () => {
  await db.pg.exec(`set session_replication_role = replica;
    delete from homework_status where target_id = '${H8D}2'; delete from homework_targets where target_id = '${H8D}2'; delete from homework where homework_id = '${H8D}1';
    delete from receipts where receipt_no = 'H8D-1'; delete from complaints where complaint_id = '${H8D}3';
    delete from class_notices where notice_id = '${H8D}4'; delete from school_events where event_id = '${H8D}5'; delete from parent_ai_answers where answer_id = '${H8D}6';
    set session_replication_role = origin;`);
};
// A notice waiting for approval, an event in three days and a draft answer: the rows of three of the lists.
const addParentsRows = async () => {
  const guardian = (await db.pg.query(`select parent_id from parent_student_map where school_id = $1 and student_id = $2 limit 1`, [SCHOOL, STUDENT])).rows[0].parent_id;
  await db.pg.query(`insert into class_notices (notice_id, school_id, class_id, body, written_by) values ($1, $2, $3, 'Harness 8d: bring a water bottle on Friday.', $4)`, [`${H8D}4`, SCHOOL, CLASS_5A, PEOPLE.teacher.sub]);
  await db.pg.query(`insert into school_events (event_id, school_id, title, held_on, details, created_by) values ($1, $2, 'Harness 8d science fair', ${TODAY_SQL} + 3, 'In the school hall.', $3)`, [`${H8D}5`, SCHOOL, PEOPLE.principal.sub]);
  await db.pg.query(`insert into parent_ai_answers (answer_id, school_id, student_id, parent_id, body, sources, ai_assisted, drafted_by) values ($1, $2, $3, $4, 'Harness 8d: read together for ten minutes.', '[{"kind":"followup"}]', false, $5)`, [`${H8D}6`, SCHOOL, STUDENT, guardian, PEOPLE.teacher.sub]);
};
const firstNumber = (text) => Number(String(text ?? '').replace(/,/g, '').match(/\d+/)?.[0] ?? NaN);
let dashboardBudget = null;
let dashboardSeen = null;
const dashboardRows = async (page) => {
  await clearDashboardRows();
  const subject = (await db.pg.query(`select subject_id from subjects where school_id = $1 order by name limit 1`, [SCHOOL])).rows[0].subject_id;
  const guardian = (await db.pg.query(`select parent_id from parent_student_map where school_id = $1 and student_id = $2 limit 1`, [SCHOOL, STUDENT])).rows[0].parent_id;
  const two = (await db.pg.query(`select student_id from students where school_id = $1 and class_id = $2 and status = 'active' order by student_id limit 2`, [SCHOOL, CLASS_5A])).rows.map((r) => r.student_id);
  await db.pg.query(`insert into homework (homework_id, school_id, subject_id, title, due_date, created_by) values ($1, $2, $3, 'Harness 8d sums', ${TODAY_SQL}, $4)`, [`${H8D}1`, SCHOOL, subject, PEOPLE.teacher.sub]);
  await db.pg.query(`insert into homework_targets (target_id, school_id, homework_id, class_id, title, due_date) values ($1, $2, $3, $4, 'Harness 8d sums', ${TODAY_SQL})`, [`${H8D}2`, SCHOOL, `${H8D}1`, CLASS_5A]);
  await db.pg.query(`insert into homework_status (school_id, target_id, class_id, student_id, done, checked_by) values ($1, $2, $3, $4, true, $6), ($1, $2, $3, $5, false, $6)`, [SCHOOL, `${H8D}2`, CLASS_5A, two[0], two[1], PEOPLE.teacher.sub]);
  await db.pg.query(`insert into receipts (school_id, receipt_no, student_id, total_minor, method, issued_by) values ($1, 'H8D-1', $2, 150000, 'cash', $3)`, [SCHOOL, STUDENT, PEOPLE.principal.sub]);
  await db.pg.query(`insert into complaints (complaint_id, school_id, parent_id, student_id, source, summary, status, owner_id, due_at, created_by) values ($1, $2, $3, $4, 'office', 'Harness 8d: the gate opens late.', 'open', $5, now() - interval '2 hours', $5)`, [`${H8D}3`, SCHOOL, guardian, STUDENT, PEOPLE.principal.sub]);
  await addParentsRows();
  dashboardBudget = (await db.pg.query(`select monthly_budget_paise from schools where school_id = $1`, [SCHOOL])).rows[0].monthly_budget_paise;
  await db.pg.query(`update schools set monthly_budget_paise = 500000 where school_id = $1`, [SCHOOL]);
  const open = async () => {
    await page.goto(`${base}/app/dashboard?range=30d`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.locator('[data-dashboard="30d"] [data-fact]').first().waitFor({ timeout: 30000 });
  };
  await open();
  const tiles = await page.locator('[data-fact]').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-fact'), state: e.getAttribute('data-state'), value: e.querySelector('[data-fact-value]')?.textContent.trim(), href: e.querySelector('a')?.getAttribute('href') })));
  const attention = await page.locator('[data-attention]').evaluateAll((els) => els.map((e) => e.getAttribute('data-attention')));
  const needsYou = Number(await page.locator('[data-needs-you]').getAttribute('data-needs-you'));
  const why = await page.locator('[data-why]').count();
  const charts = await page.locator('[data-chart]').evaluateAll((els) => els.map((e) => e.getAttribute('data-chart')));
  const exportHref = await page.locator('[data-dashboard-export]').getAttribute('href');
  // In the fees chart each bar's name opens that bar's own rows.
  const feeBars = await page.locator('[data-chart="fees-owed"] [data-chart-row-open]').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  // Its title says no total: the two bars added together would be a number with no rule and no list of its own.
  const feesTitle = { plain: await page.getByText('Fees still to come in', { exact: true }).count(), withTotal: await page.getByText(/Fees still to come in:/).count() };
  // Tile by tile, every one: follow the tile's link and count what is listed there.
  const rows = {};
  for (const tile of tiles) {
    const id = tile.id;
    if (tile.state === 'not_set_up') continue;
    if (!tile.href) {
      rows[id] = { kind: 'no-link', tile: tile.value };
      continue;
    }
    const url = new URL(base + tile.href);
    const q = url.searchParams;
    await page.goto(url.href, { waitUntil: 'networkidle', timeout: 90000 });
    if (url.pathname === '/app/students' || url.pathname === '/app/admissions') {
      // Nobody waiting for consent: the screen says so with its own empty state and no count line.
      await page.locator('[data-students-count], [data-empty]').first().waitFor({ timeout: 30000 });
      const counted = await page.locator('[data-students-count]').count();
      rows[id] = { kind: 'rows', tile: tile.value, said: counted ? Number(await page.locator('[data-students-count]').getAttribute('data-students-count')) : 0, listed: counted ? await page.locator('tbody tr').count() : 0 };
    } else if (url.pathname === '/app/communication' && (q.has('from') || q.has('state'))) {
      await page.locator('[data-messages]:not([data-messages-range="last"])').waitFor({ timeout: 30000 });
      rows[id] = { kind: 'rows', tile: tile.value, said: firstNumber(await page.locator('[data-state-all]').textContent()), listed: await page.locator('[data-message]').count() };
    } else if (url.pathname === '/app/communication' && !q.has('show')) {
      // The month's spend: the screen says the figure itself.
      await page.locator('[data-budget]').waitFor({ timeout: 30000 });
      rows[id] = { kind: 'figure', tile: tile.value, text: (await page.locator('[data-budget]').textContent()) ?? '' };
    } else if (url.pathname === '/app/pulse' && !q.has('show')) {
      // The needs-help queue is the screen's own list: its heading says how many, and that many are listed.
      const heading = page.locator('h2', { hasText: /needs? help$/ }).first();
      await heading.waitFor({ timeout: 30000 });
      rows[id] = { kind: 'rows', tile: tile.value, said: firstNumber(await heading.textContent()), listed: await page.locator('[data-followup]').count() };
    } else {
      await page.locator('[data-shown]').waitFor({ timeout: 30000 });
      const title = (await page.locator('[data-shown-title]').textContent()).trim();
      const texts = await page.locator('[data-shown-row]').allTextContents();
      rows[id] = { kind: 'rows', tile: tile.value, title, said: firstNumber(title.split(':').pop()), listed: texts.length, texts, text: (await page.locator('[data-shown]').textContent()) ?? '' };
    }
    rows[id].state = tile.state;
  }
  // Back on the dashboard for the picture, with one chart shown as its table.
  await open();
  await page.locator('[data-chart-view="table"]').first().click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const tableLinks = await page.locator('[data-chart="attendance-today"] tbody a').count();
  dashboardSeen = { tiles, attention, needsYou, why, charts, exportHref, rows, tableLinks, feeBars, feesTitle };
};
// What each row of a list carries, for the tiles that are a sum of it; and the tiles that say a rate.
const SUM_IN_ROWS = { 'pulse.understood': /Answers: (\d+) understood/, 'pulse.needs_help': /understood, (\d+) needs help/, 'homework.not_done': /not done (\d+)\./ };
const amountsIn = (text) => [...String(text ?? '').matchAll(/₹([\d,]+(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, '')));
const dashboardRowsDone = async () => {
  const truth = (await db.pg.query(
    `select (select count(*)::int from students where school_id = $1 and status = 'active') as active,
            (select count(*)::int from students where school_id = $1 and status = 'pending_consent') as waiting,
            (select count(*)::int from communication_log where school_id = $1 and channel = 'whatsapp' and created_at >= ((${TODAY_SQL} - 29)::timestamp at time zone 'Asia/Kolkata')) as messages,
            (select count(*)::int from attendance a join students s on s.student_id = a.student_id where a.school_id = $1 and a.date = ${TODAY_SQL} and a.status = 'present' and s.status in ('active', 'pending_consent') and s.class_id is not null) as present,
            (select count(*)::int from fees_ledger l where l.school_id = $1 and (l.status::text = 'overdue' or (l.status::text in ('pending', 'partial') and l.due_date < ${TODAY_SQL})) and l.amount_minor > coalesce((select sum(p.amount_minor) from payments p where p.fee_id = l.fee_id), 0)) as overdue`,
    [SCHOOL]
  )).rows[0];
  await clearDashboardRows();
  await db.pg.query(`update schools set monthly_budget_paise = $2 where school_id = $1`, [SCHOOL, dashboardBudget]);
  const s = dashboardSeen;
  const problems = [];
  const tile = (id) => s.tiles.find((t) => t.id === id);
  // Every tile that was counted was followed; the only tiles with no link are the two whose screen has no list
  // of exactly their rows yet (Complaints and PTM).
  const followed = Object.keys(s.rows).length;
  if (followed < 24) problems.push(`only ${followed} tiles were followed`);
  const noLink = Object.entries(s.rows).filter(([, r]) => r.kind === 'no-link').map(([id]) => id);
  if (noLink.join() !== 'complaints.open,ptm.coming') problems.push(`tiles with no link: ${noLink.join() || 'none'}`);
  // Each tile is what its screen lists or says.
  for (const [id, r] of Object.entries(s.rows)) {
    const tileSays = String(r.tile ?? '');
    if (r.kind === 'no-link') continue;
    if (r.kind === 'figure') {
      // The month's spend and its budget: the amounts on the tile are amounts the screen says.
      const there = amountsIn(r.text);
      const missing = amountsIn(tileSays).filter((a) => !there.includes(a));
      if (!amountsIn(tileSays).length || missing.length) problems.push(`${id}: the tile says ${tileSays}, its screen says "${r.text.slice(0, 80)}"`);
      continue;
    }
    if (r.said !== r.listed) problems.push(`${id}: its screen says ${r.said} and lists ${r.listed}`);
    else if (r.state === 'no_data') {
      // Nothing recorded in the days: the tile says so, and its list is empty.
      if (r.listed !== 0) problems.push(`${id}: the tile says nothing was recorded, its screen lists ${r.listed}`);
    } else if (id === 'attendance.present_rate') {
      // A rate: the list's own line says the same rate, above the days it is worked out from.
      if (!r.text.includes(`In school (present or late): ${tileSays} of`)) problems.push(`${id}: the tile says ${tileSays}, its screen lists ${r.listed} days and says "${r.text.slice(0, 120)}"`);
    } else if (SUM_IN_ROWS[id]) {
      // A sum: what the rows carry adds up to the tile.
      const sum = r.texts.reduce((a, text) => a + Number(SUM_IN_ROWS[id].exec(text)?.[1] ?? NaN), 0);
      if (sum !== firstNumber(tileSays)) problems.push(`${id}: the tile says ${tileSays}, its rows add up to ${sum}`);
    } else if (/^\d/.test(tileSays) && firstNumber(tileSays) !== r.listed) problems.push(`${id}: the tile says ${tileSays}, its screen lists ${r.listed}`);
    else if (!/^\d/.test(tileSays) && !String(r.title ?? '').includes(tileSays)) problems.push(`${id}: the tile says ${tileSays}, its screen says "${r.title}"`);
  }
  // The three lists added for the rows this run wrote: one notice waiting, one event to come, one draft answer.
  // (A draft's words are not repeated in its list: the row names the child and who drafted it.)
  for (const id of ['notices.waiting', 'events.coming', 'parent_ai.drafts']) if (s.rows[id]?.listed !== 1 || s.rows[id].text.includes('Harness 8d') !== (id !== 'parent_ai.drafts')) problems.push(`${id}: its screen lists ${s.rows[id]?.listed}: "${String(s.rows[id]?.text).slice(0, 120)}"`);
  if ((s.rows['tickets.open']?.listed ?? 0) < 1) problems.push(`tickets.open: its screen lists ${s.rows['tickets.open']?.listed}`);
  if (s.feeBars.join() !== '/app/fees?show=owed,/app/fees?show=overdue') problems.push(`the fees chart's bars open: ${s.feeBars.join() || 'nothing'}`);
  if (s.feesTitle.plain < 1 || s.feesTitle.withTotal > 0) problems.push(`the fees chart's title: ${JSON.stringify(s.feesTitle)}`);
  // And the tiles are the database's own counts.
  const want = { 'students.active': truth.active, 'students.waiting_consent': truth.waiting, 'messages.total': truth.messages, 'attendance.present': truth.present };
  for (const [id, n] of Object.entries(want)) if (firstNumber(tile(id)?.value) !== n) problems.push(`${id}: the tile says ${tile(id)?.value}, the database has ${n}`);
  if (s.rows['fees.overdue']?.listed !== truth.overdue) problems.push(`fees.overdue: its screen lists ${s.rows['fees.overdue']?.listed} entries, the database has ${truth.overdue}`);
  if (tile('attendance.classes_marked')?.value !== '1 of 3') problems.push(`classes marked: ${tile('attendance.classes_marked')?.value}`);
  if (!/1,500/.test(tile('fees.collected')?.value ?? '')) problems.push(`fees received: ${tile('fees.collected')?.value}`);
  if (tile('homework.checked')?.value !== '0 of 1' || tile('homework.not_done')?.value !== '1') problems.push(`homework: ${tile('homework.checked')?.value}, not done ${tile('homework.not_done')?.value}`);
  if (tile('whatsapp.spend')?.state !== 'ok') problems.push(`the budget tile is ${tile('whatsapp.spend')?.state}`);
  for (const id of ['attendance.classes_unmarked', 'complaints.overdue', 'fees.overdue', 'students.waiting_consent', 'messages.held']) if (!s.attention.includes(id)) problems.push(`not on the attention list: ${id}`);
  if (s.needsYou !== s.attention.length) problems.push(`the band says ${s.needsYou} things, the list has ${s.attention.length}`);
  if (s.why !== s.tiles.length + s.attention.length + s.charts.length) problems.push(`"Why this?" ${s.why} times for ${s.tiles.length} tiles, ${s.attention.length} attention items and ${s.charts.length} charts`);
  if (s.charts.join() !== 'attendance-today,present-rate,fees-owed,messages-by-state,homework-checked') problems.push(`charts: ${s.charts.join()}`);
  if (s.exportHref !== '/api/app/dashboard/export?range=30d') problems.push(`export link: ${s.exportHref}`);
  if (s.tableLinks < 4) problems.push(`the chart's table has ${s.tableLinks} links to rows`);
  if (problems.length) throw new Error(`dashboard: ${problems.join('; ')}`);
};
// The CSV over HTTP, as the signed-in principal: a file with the tiles in it, and one audit row for it.
const dashboardExport = async (page) => {
  await page.locator('[data-dashboard="7d"] [data-fact]').first().waitFor({ timeout: 30000 });
  const before = Number((await db.pg.query(`select count(*)::int as n from audit_log where school_id = $1 and event_action = 'dashboard.exported'`, [SCHOOL])).rows[0].n);
  const res = await page.request.get(`${base}/api/app/dashboard/export?range=7d`);
  const text = await res.text();
  const after = Number((await db.pg.query(`select count(*)::int as n from audit_log where school_id = $1 and event_action = 'dashboard.exported'`, [SCHOOL])).rows[0].n);
  const tiles = await page.locator('[data-fact]').count();
  if (res.status() !== 200 || !/text\/csv/.test(res.headers()['content-type'] ?? '')) throw new Error(`the export answered ${res.status()} ${res.headers()['content-type']}`);
  if (!text.includes('Active students') || text.trim().split('\r\n').length <= tiles) throw new Error(`the export has ${text.trim().split('\r\n').length} lines for ${tiles} tiles`);
  if (after !== before + 1) throw new Error(`${after - before} audit rows for one export`);
};
// A screen opened on a dashboard number's filter: its title says how many rows, and that many are listed.
const shownRows = async (page) => {
  await page.locator('[data-shown]').waitFor({ timeout: 30000 });
  const title = (await page.locator('[data-shown-title]').textContent()).trim();
  const listed = await page.locator('[data-shown-row]').count();
  const said = firstNumber(title.split(':').pop());
  if (said !== listed || listed === 0) throw new Error(`"${title}" lists ${listed} rows`);
};
// The same, for a list whose rows this run writes first (a notice waiting, an event to come, a draft answer):
// the rows go in, the page is opened again, and the list must hold exactly the one row. `words`: whether the
// row's own words are in the list (a notice's and an event's are; a draft answer's are not repeated there).
const shownAfterAdding = (words) => async (page) => {
  await clearDashboardRows();
  await addParentsRows();
  await page.reload({ waitUntil: 'networkidle', timeout: 90000 });
  await shownRows(page);
  const text = (await page.locator('[data-shown]').textContent()) ?? '';
  const listed = await page.locator('[data-shown-row]').count();
  if (listed !== 1 || text.includes('Harness 8d') !== words) throw new Error(`the list holds ${listed} rows: "${text.slice(0, 120)}"`);
};
// The days behind the present rate: the title's count is the rows, and the line above them says the rate.
const attendanceDays = async (page) => {
  await shownRows(page);
  const text = (await page.locator('[data-shown]').textContent()) ?? '';
  if (!/In school \(present or late\): [\d.]+% of the \d+ marks saved in these days\./.test(text)) throw new Error(`no rate above the days: "${text.slice(0, 160)}"`);
};
const heldMessages = async (page) => {
  await page.locator('[data-messages]:not([data-messages-range="last"])').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('[data-state="held"]')?.getAttribute('aria-pressed') === 'true' && document.querySelectorAll('[data-message]').length > 0, null, { timeout: 20000 });
  const states = await page.locator('[data-message]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-message')))].join());
  const said = firstNumber((await page.locator('[data-state="held"]').textContent()).split('·').pop());
  const listed = await page.locator('[data-message]').count();
  if (states !== 'held' || said !== listed) throw new Error(`held messages: the button says ${said}, ${listed} are listed, states ${states}`);
};
// p5-8d end
// p5-8e begin
// Control → Billing & Plans (C204): the founder adds a plan with a made-up name and price, records a payment for the
// seeded school and opens its payments. The rows are checked, then everything is put back as the seed left it (the
// seeded school has no subscription row: recording a payment makes it). The school starts in a grace period set by
// hand, as the founder would have set it for a late payment: the payment brings it up to date, so it must end that
// grace period and say so on the screen.
let billingSeen = null;
const BILLING_PLAN = 'harness-made-up-plan';
const indiaDayFromNow = (days) => new Date(Date.now() + 5.5 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);
const clearBilling = async () => {
  await db.pg.exec(`set session_replication_role = replica;
    delete from subscription_payments where school_id = '${SCHOOL}';
    delete from school_subscriptions where school_id = '${SCHOOL}';
    delete from plans where plan_id = '${BILLING_PLAN}';
    update school_entitlements set access_mode = 'full', grace_ends_at = null where school_id = '${SCHOOL}';
    set session_replication_role = origin;`);
};
const billingPlans = async (page) => {
  await clearBilling();
  // Grace set by hand, to the end of the day three days from now in India (Control stores 23:59:59 of that day).
  await db.pg.exec(`update school_entitlements set access_mode = 'grace', grace_ends_at = (((now() at time zone 'Asia/Kolkata')::date + 4)::timestamp at time zone 'Asia/Kolkata') - interval '1 second' where school_id = '${SCHOOL}';`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-billing-plan-add]').click();
  await page.locator('#plan-name').fill('Harness Made-up Plan');
  await page.locator('#plan-price').fill('12,500');
  await page.locator('#plan-period').selectOption('year');
  await page.locator('#plan-grace').fill('10');
  await page.locator('[data-billing-plan-save]').click();
  await page.waitForFunction(() => /plan is added/.test(document.querySelector('[data-billing-note]')?.textContent ?? ''), null, { timeout: 20000 });
  const school = page.locator(`[data-billing-school="${SCHOOL}"]`);
  await school.locator('[data-billing-pay]').click();
  await page.locator(`#pay-amount-${SCHOOL}`).fill('12500');
  await page.locator(`#pay-until-${SCHOOL}`).fill(indiaDayFromNow(365));
  await page.locator(`#pay-ref-${SCHOOL}`).fill('harness-8e cheque 000118');
  await school.locator('[data-billing-pay-save]').click();
  await page.waitForFunction(() => /payment is recorded/.test(document.querySelector('[data-billing-note]')?.textContent ?? ''), null, { timeout: 20000 });
  const paidNote = await page.locator('[data-billing-note]').textContent();
  await school.locator('[data-billing-history]').click();
  await school.locator('[data-billing-payment]').first().waitFor({ timeout: 20000 });
  billingSeen = {
    paidNote,
    access: await school.locator('dd', { hasText: /^Full access$/ }).count(),
    price: await page.locator(`[data-billing-plan="${BILLING_PLAN}"] [data-billing-price]`).textContent(),
    state: await school.locator('[data-billing-state]').getAttribute('data-billing-state'),
    payments: await school.locator('[data-billing-payment]').count(),
    payment: await school.locator('[data-billing-payment]').first().textContent(),
  };
};
const billingPlansDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from plans where plan_id = $2 and name = 'Harness Made-up Plan' and price_minor = 1250000 and period = 'year' and grace_days = 10 and all_working_modules and retired_at is null) as plans,
            (select count(*)::int from subscription_payments where school_id = $1 and amount_minor = 1250000 and reference = 'harness-8e cheque 000118' and covers_until = $3::date and recorded_by = $4) as payments,
            (select count(*)::int from school_subscriptions where school_id = $1 and paid_until = $3::date and billing_access is null) as subscriptions,
            (select access_mode from school_entitlements where school_id = $1) as access,
            (select grace_ends_at is null from school_entitlements where school_id = $1) as grace_gone,
            (select count(*)::int from audit_log where event_action = 'entitlement.access_changed' and school_id = $1 and actor_user_id = $4 and before_state ->> 'access_mode' = 'grace' and after_state ->> 'access_mode' = 'full' and after_state ->> 'by' = 'billing.payment') as grace_audits,
            (select count(*)::int from audit_log where event_action = 'billing.plan_created' and target_id = $2) as plan_audits,
            (select count(*)::int from audit_log where event_action = 'billing.payment_recorded' and school_id = $1 and (after_state ? 'amount_minor' or after_state ? 'reference') = false) as payment_audits`,
    [SCHOOL, BILLING_PLAN, indiaDayFromNow(365), PEOPLE.founder.sub]
  );
  await clearBilling();
  const r = rows[0];
  const seen = billingSeen ?? {};
  // The payment brought the school up to date, so the grace period set by hand is gone, audited as the payment's doing by the founder.
  if (r.plans !== 1 || r.payments !== 1 || r.subscriptions !== 1 || r.access !== 'full' || r.grace_gone !== true || r.grace_audits < 1 || r.plan_audits < 1 || r.payment_audits < 1) throw new Error(`billing plans, in the database: ${JSON.stringify(r)}`);
  // The price and the amount on the screen come from the stored paise.
  if (!/12,500\.00 a year/.test(seen.price ?? '') || seen.state !== 'paid' || seen.payments !== 1 || !/12,500\.00/.test(seen.payment ?? '') || !/harness-8e cheque 000118/.test(seen.payment ?? '')) throw new Error(`billing plans, on the screen: ${JSON.stringify(seen)}`);
  // And the screen said what the payment did to the grace period, and shows full access.
  if (!/grace period set by hand: that has ended/.test(seen.paidNote ?? '') || seen.access !== 1) throw new Error(`billing plans, the grace period set by hand: ${JSON.stringify(seen)}`);
};
// The school's own screen while it is in grace for billing (C204): the dated line, with no amount. The state is
// put in place as the nightly check leaves it (the check itself is proven in test/control/billing-plans.test.ts).
let paidUntilSeen = null;
const schoolInGrace = async (page) => {
  await clearBilling();
  await db.pg.exec(`
    insert into school_subscriptions (school_id, plan_id, paid_until, billing_access, billing_grace_ends_at, billing_access_since)
    values ('${SCHOOL}', 'standard', (now() at time zone 'Asia/Kolkata')::date - 1, 'grace', (((now() at time zone 'Asia/Kolkata')::date + 15)::timestamp at time zone 'Asia/Kolkata'), (now() at time zone 'Asia/Kolkata')::date);
    update school_entitlements e set access_mode = 'grace', grace_ends_at = s.billing_grace_ends_at from school_subscriptions s where s.school_id = e.school_id and e.school_id = '${SCHOOL}';`);
  await page.reload({ waitUntil: 'networkidle' });
  const line = page.locator('[data-access-notice="grace"]');
  await line.waitFor({ timeout: 20000 });
  paidUntilSeen = await line.textContent();
  // The line sits just under the search bar, which stays at the top of the window: photographed from the top of the page.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
};
const schoolInGraceDone = async () => {
  await clearBilling();
  if (!/subscription was paid until \d{1,2} \w+ \d{4}\. Everything keeps working until the end of \d{1,2} \w+ \d{4}\./.test(paidUntilSeen ?? '') || /₹|rupee/i.test(paidUntilSeen ?? '')) throw new Error(`the school's paid-until line: ${JSON.stringify(paidUntilSeen)}`);
};
// p5-8e end
// p5-8f begin
// p5-8f end
// p5-8g begin
// p5-8g end
// p5-8h begin
// p5-8h end
// p5-8i begin
// p5-8i end
// p5-8j begin
// p5-8j end
let upiSeen = null;
const payByUpi = async (page) => {
  await clearUpi();
  await db.pg.query(`insert into payment_methods (school_id, method, enabled, sort_order, settings, updated_by) values ($1, 'direct_upi', true, 1, $2, $3)`, [SCHOOL, JSON.stringify(UPI_SETUP), PEOPLE.principal.sub]);
  await feesDues(page);
  await page.selectOption('#pay-class', { label: '5-A' });
  await page.waitForFunction(() => document.querySelectorAll('#pay-student option').length > 1, null, { timeout: 15000 });
  await page.selectOption('#pay-student', { index: 1 });
  await page.locator('[data-make-link]').click();
  const url = (await page.locator('[data-pay-url]').textContent({ timeout: 20000 })).trim();
  const parent = await page.context().browser().newContext();
  const pay = await parent.newPage();
  await pay.goto(url, { waitUntil: 'networkidle' });
  const href = await pay.locator('[data-upi-pay]').getAttribute('href');
  const reference = (await pay.locator('[data-upi-reference]').textContent()).trim();
  const qr = await pay.locator('[data-upi-qr] svg').count();
  const fileFields = await pay.locator('input[type="file"]').count();
  await pay.locator('#utr').fill('412345678901');
  await pay.locator('[data-utr-send]').click();
  await pay.locator('[data-upi-initiated]').waitFor({ timeout: 20000 });
  const initiated = await pay.locator('[data-upi-initiated]').textContent();
  const stateWhileWaiting = await pay.locator('[data-pay-state]').getAttribute('data-pay-state');
  const creditedWhileWaiting = (await db.pg.query(`select count(*)::int as n from payments where school_id = $1 and method = 'upi' and receipt_id in (select receipt_id from receipts where payment_link_id is not null)`, [SCHOOL])).rows[0].n;
  // The school: the waiting payment is on the Fees page; the principal finds it in the bank and confirms.
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-verify] [data-found]').first().click();
  await page.locator('[data-verify] [data-checked]').check();
  await page.locator('[data-verify] [data-found-confirm]').click();
  await page.locator('[data-verify]').waitFor({ state: 'detached', timeout: 20000 });
  await pay.reload({ waitUntil: 'networkidle' });
  const paid = await pay.locator('[data-pay-state="paid"]').textContent({ timeout: 20000 });
  await parent.close();
  upiSeen = { href, reference, qr, fileFields, initiated, stateWhileWaiting, creditedWhileWaiting, paid };
};
const payByUpiDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from receipts where school_id = $1 and method = 'upi' and payment_link_id is not null) as receipts,
            (select receipt_no from receipts where school_id = $1 and method = 'upi' and payment_link_id is not null) as receipt_no,
            (select coalesce(sum(total_minor), 0)::int from receipts where school_id = $1 and method = 'upi' and payment_link_id is not null) as total,
            (select amount_minor::int from payment_links where school_id = $1 and status = 'paid') as link_amount,
            (select json_build_object('source', v.source, 'rule', v.rule, 'by', v.decided_by, 'utr', r.utr, 'status', r.status) from payment_reports r join payment_evidence v on v.evidence_id = r.evidence_id where r.school_id = $1) as proof`,
    [SCHOOL]
  );
  await clearUpi();
  await clearPayments();
  await clearDues();
  const r = rows[0];
  const s = upiSeen ?? {};
  const q = new URLSearchParams(String(s.href).split('?')[1] ?? '');
  if (!String(s.href).startsWith('upi://pay?') || q.get('pa') !== UPI_SETUP.upiId || q.get('pn') !== UPI_SETUP.payeeName || q.get('cu') !== 'INR' || !/^NCA-[A-HJKMNP-Z2-9]{8}$/.test(q.get('tr') ?? '') || q.get('tn') !== q.get('tr') || q.get('tr') !== s.reference || Number(q.get('am')) * 100 !== r.link_amount) throw new Error(`the UPI link is not right: ${s.href}`);
  if (s.qr !== 1 || s.fileFields !== 0) throw new Error(`the page must show one QR and no file field: ${JSON.stringify({ qr: s.qr, fileFields: s.fileFields })}`);
  if (!/Payment initiated\. The school will verify it/.test(String(s.initiated)) || s.stateWhileWaiting !== 'open' || s.creditedWhileWaiting !== 0) throw new Error(`a reported UTR must credit nothing and never say paid: ${JSON.stringify(s)}`);
  if (r.receipts !== 1 || r.total !== r.link_amount || !String(s.paid).includes(r.receipt_no)) throw new Error(`"Found in bank" must issue one receipt and tell the parent: ${JSON.stringify(r)} ${s.paid}`);
  if (r.proof?.source !== 'school_confirmed' || r.proof?.rule !== 'A' || r.proof?.by !== PEOPLE.principal.sub || r.proof?.utr !== '412345678901' || r.proof?.status !== 'verified') throw new Error(`the receipt did not go through the evidence table as a named confirmation: ${JSON.stringify(r.proof)}`);
};
// The sibling rule (C168): with the rule on and two children of 5-A linked as
// one family, "Check sibling concessions" proposes one concession, for the
// younger child, marked as coming from the rule and waiting for approval.
const SIBLING_FAMILY = '00000000-0000-4000-8000-0000000fa168';
const clearSiblings = async () => {
  await db.pg.query(`delete from fee_concessions where school_id = $1 and source = 'rule'`, [SCHOOL]);
  await db.pg.query(`alter table students disable trigger user`);
  await db.pg.query(`update students set family_id = null where school_id = $1 and family_id = $2`, [SCHOOL, SIBLING_FAMILY]);
  await db.pg.query(`alter table students enable trigger user`);
  await db.pg.query(`delete from families where family_id = $1`, [SIBLING_FAMILY]);
  await clearLateFee();
};
const siblingRule = async (page) => {
  await clearSiblings();
  await db.pg.query(`insert into families (family_id, school_id, family_code, created_by) values ($1, $2, 'HARNESS-FAM', $3)`, [SIBLING_FAMILY, SCHOOL, PEOPLE.principal.sub]);
  await db.pg.query(`alter table students disable trigger user`);
  await db.pg.query(`update students set family_id = $2 where student_id in (select student_id from students where school_id = $1 and class_id = $3 and status = 'active' and family_id is null order by name limit 2)`, [SCHOOL, SIBLING_FAMILY, CLASS_5A]);
  await db.pg.query(`alter table students enable trigger user`);
  await db.pg.query(`insert into academic_sessions (school_id, label, start_date, end_date, is_current) select $1, 'Harness session', ${TODAY_SQL} - 30, ${TODAY_SQL} + 300, not exists (select 1 from academic_sessions where school_id = $1 and is_current) where not exists (select 1 from academic_sessions where school_id = $1 and label = 'Harness session')`, [SCHOOL]);
  await db.pg.query(`insert into school_settings (school_id, module_id, schema_version, setting_values, revision, updated_by) values ($1, 'fees', 3, '{"sibling_enabled": true, "sibling_percent": 10}', 1, $2)`, [SCHOOL, PEOPLE.principal.sub]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-sibling-check]').click();
  await page.locator('[data-concession="proposed"]').first().waitFor({ timeout: 20000 });
};
const siblingRuleDone = async (page) => {
  const badge = await page.locator('[data-concessions]').textContent();
  const { rows } = await db.pg.query(`select c.status, c.source, c.percent_off::float8 as percent, c.mandatory_only, (select count(*)::int from students s where s.family_id = c.family_id) as in_family from fee_concessions c where c.school_id = $1 and c.source = 'rule'`, [SCHOOL]);
  await clearSiblings();
  if (rows.length !== 1 || rows[0].status !== 'proposed' || rows[0].percent !== 10 || rows[0].mandatory_only !== true || rows[0].in_family !== 2) throw new Error(`expected one proposal, for the younger of two linked children: ${JSON.stringify(rows)}`);
  if (!/From the sibling rule/.test(badge ?? '') || !/Waiting for approval/.test(badge ?? '')) throw new Error('the proposal is not shown as from the rule and waiting for approval');
};
// The school's Settings screen, generated from the module settings schemas
// (C166). The principal switches the late fee on with an amount and saves;
// it is stored with its history and audited, and raises no due by itself.
// Then one value is put back with "Reset to default".
let swatches = 0;
let historyRows = [];
const settingsLateFee = async (page) => {
  await db.pg.query(`delete from school_setting_changes where school_id = $1 and module_id = 'setup'`, [SCHOOL]);
  await db.pg.query(`delete from school_settings where school_id = $1 and module_id = 'setup'`, [SCHOOL]);
  await clearLateFee();
  await page.reload({ waitUntil: 'networkidle' });
  const fees = page.locator('[data-settings-module="fees"]');
  await fees.locator('#set-fees-late_fee_enabled').check();
  await fees.locator('#set-fees-late_fee_rupees').fill('50');
  await fees.locator('#set-fees-late_fee_grace_days').fill('3');
  await fees.locator('[data-save-settings]').click();
  await fees.locator('[data-setting="late_fee_enabled"] [data-reset]').waitFor({ timeout: 20000 });
  // The accent colour is chosen from swatches, and each part shows its own change history (C180).
  const setup = page.locator('[data-settings-module="setup"]');
  swatches = await setup.locator('[data-swatch]').count();
  await setup.locator('[data-swatch="grape"]').click();
  await setup.locator('[data-save-settings]').click();
  await setup.locator('[data-setting="accent_color"] [data-reset]').waitFor({ timeout: 20000 });
  await page.locator('[data-settings-module="fees"] [data-settings-history] summary').click();
  await page.locator('[data-settings-module="fees"] [data-history-row]').first().waitFor({ timeout: 20000 });
  historyRows = await page.locator('[data-settings-module="fees"] [data-history-row]').allTextContents();
};
const settingsLateFeeDone = async (page) => {
  const read = async () => (await db.pg.query(
    `select (select setting_values from school_settings where school_id = $1 and module_id = 'fees') as saved,
            (select count(*)::int from school_setting_changes where school_id = $1 and module_id = 'fees') as changes,
            (select count(*)::int from audit_log where school_id = $1 and event_action = 'settings.changed' and target_id = 'fees' and occurred_at > now() - interval '5 minutes') as audited,
            (select count(*)::int from fees_ledger where school_id = $1 and late_fee_for is not null) as late_lines`,
    [SCHOOL]
  )).rows[0];
  const saved = await read();
  const modules = await page.locator('[data-settings-module]').evaluateAll((els) => els.map((e) => e.getAttribute('data-settings-module')));
  const fees = page.locator('[data-settings-module="fees"]');
  await fees.locator('[data-setting="late_fee_rupees"] [data-reset]').click();
  await fees.locator('[data-setting="late_fee_rupees"] [data-is-default]').waitFor({ timeout: 20000 });
  const reset = await read();
  const accent = (await db.pg.query(`select setting_values->>'accent_color' as c from school_settings where school_id = $1 and module_id = 'setup'`, [SCHOOL])).rows[0]?.c;
  await db.pg.query(`delete from school_setting_changes where school_id = $1 and module_id = 'setup'`, [SCHOOL]);
  await db.pg.query(`delete from school_settings where school_id = $1 and module_id = 'setup'`, [SCHOOL]);
  await clearLateFee();
  if (swatches < 10 || accent !== 'grape') throw new Error(`the accent colour was not chosen from the swatches: ${swatches} swatches, saved ${accent}`);
  if (historyRows.length !== 3 || !historyRows.some((r) => /Charge a late fee: default → On/.test(r))) throw new Error(`the change history is not right: ${JSON.stringify(historyRows)}`);
  if (saved.saved?.late_fee_enabled !== true || saved.saved?.late_fee_rupees !== 50 || saved.saved?.late_fee_grace_days !== 3 || saved.changes !== 3 || saved.audited < 1) throw new Error(`the late fee was not saved with its history and audit row: ${JSON.stringify(saved)}`);
  if (saved.late_lines !== 0) throw new Error('saving the setting raised a due; only the nightly job may');
  if ('late_fee_rupees' in (reset.saved ?? {}) || reset.saved?.late_fee_enabled !== true || reset.changes !== 4) throw new Error(`"Reset to default" did not put one value back and keep the rest: ${JSON.stringify(reset)}`);
  for (const m of ['setup', 'students', 'attendance', 'fees', 'timetable']) if (!modules.includes(m)) throw new Error(`the Settings screen has no card for ${m}: ${modules}`);
};
// A teacher sees the settings of the modules they can open, and can change none.
const settingsReadOnly = async (page) => {
  const state = await page.evaluate(() => ({
    cards: document.querySelectorAll('[data-settings-module]').length,
    open: document.querySelectorAll('[data-settings-module] input:not([disabled]), [data-settings-module] select:not([disabled])').length,
    buttons: document.querySelectorAll('[data-save-settings], [data-reset]').length,
  }));
  if (state.cards === 0 || state.open !== 0 || state.buttons !== 0) throw new Error(`a teacher must see settings and be able to change none: ${JSON.stringify(state)}`);
};
// The founder's "View as" (C165): from the school's page in Control, open the
// app as its principal. The reason is prefilled, the app opens as that person
// in THIS school with the banner on the page, and "End" puts the founder back.
const clearViewAs = () => db.pg.query(`delete from impersonation_sessions where actor_user_id = $1`, [PEOPLE.founder.sub]);
let viewLeft = null;
let viewedRow = null;
const viewAs = async (page) => {
  await clearViewAs();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-person="principal"] [data-view-as]').first().click();
  const reason = await page.locator('#view-as-reason').inputValue();
  if (reason !== 'Founder review') throw new Error(`the reason is not prefilled: "${reason}"`);
  await page.locator('[data-view-as-start]').click();
  await page.waitForURL(/\/app\/my-day/, { timeout: 30000 });
  await page.locator('[data-view-as-banner]').waitFor({ timeout: 20000 });
  // The countdown (C180), and one change made during the view: the school's own Compliance page marks it.
  viewLeft = Number(await page.locator('[data-view-as-left]').getAttribute('data-view-as-left'));
  await db.pg.query(`delete from school_holidays where school_id = $1`, [SCHOOL]);
  const added = await page.evaluate(() => fetch('/api/app/settings/holidays', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: '2099-08-15', name: 'Independence Day' }) }).then((r) => r.status));
  if (added !== 201) throw new Error(`a change during the view was not saved: ${added}`);
  await page.goto(new URL("/app/compliance", page.url()).href, { waitUntil: 'networkidle' });
  viewedRow = await page.locator('[data-viewed-row]').first().textContent({ timeout: 20000 });
};
const viewAsDone = async (page) => {
  const banner = await page.locator('[data-view-as-banner]').textContent();
  const started = (await db.pg.query(`select i.target_user_id, i.target_school_id, i.reason, i.ended_at, u.display_name from impersonation_sessions i join users u on u.user_id = i.target_user_id where i.actor_user_id = $1`, [PEOPLE.founder.sub])).rows;
  await page.locator('[data-view-as-end]').click();
  await page.waitForURL(/\/control\/schools\//, { timeout: 30000 });
  await page.locator('[data-school-people]').waitFor({ timeout: 20000 });
  const ended = (await db.pg.query(`select ended_at from impersonation_sessions where actor_user_id = $1`, [PEOPLE.founder.sub])).rows;
  const audit = (await db.pg.query(`select event_action from audit_log where school_id = $1 and event_action in ('ImpersonationStarted', 'ImpersonationEnded') and occurred_at > now() - interval '5 minutes' order by audit_id desc limit 2`, [SCHOOL])).rows.map((r) => r.event_action);
  await clearViewAs();
  await db.pg.query(`delete from school_holidays where school_id = $1`, [SCHOOL]);
  const marked = (await db.pg.query(`select impersonated_by from audit_log where school_id = $1 and event_action = 'settings.holiday_added' order by audit_id desc limit 1`, [SCHOOL])).rows[0];
  if (!(viewLeft > 60 && viewLeft <= 900)) throw new Error(`the banner does not count down the time left: ${viewLeft}`);
  if (marked?.impersonated_by !== PEOPLE.founder.sub || !/Viewed by founder/.test(viewedRow ?? '') || !/settings\.holiday_added/.test(viewedRow ?? '')) throw new Error(`a change made during the view is not marked for the school: ${viewedRow}`);
  if (started.length !== 1 || started[0].target_user_id !== PEOPLE.principal.sub || started[0].target_school_id !== SCHOOL || started[0].reason !== 'Founder review' || started[0].ended_at !== null) throw new Error(`the view was not started as this school's principal: ${JSON.stringify(started)}`);
  if (!banner.includes(started[0].display_name) || !/Principal/.test(banner) || !/ends/.test(banner)) throw new Error(`the banner does not say who, what role and until when: ${banner}`);
  if (ended.length !== 1 || ended[0].ended_at === null) throw new Error('"End" did not end the view');
  if (audit.join() !== 'ImpersonationEnded,ImpersonationStarted') throw new Error(`the start and the end are not both in the school's audit trail: ${audit}`);
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
  ['founder', 'control-messaging-cost', '/control/messaging-cost', messagingCost, messagingCostDone],
  ['founder', 'control-whatsapp', '/control/whatsapp', whatsappAccount, whatsappAccountDone],
  ['founder', 'control-templates', '/control/templates', messageTemplates, messageTemplatesDone],
  ['principal', 'app-dashboard', '/app/dashboard'],
  ['principal', 'app-students', '/app/students'],
  ['principal', 'app-student-profile', `/app/students/${STUDENT}`],
  ['principal', 'app-student-id-card', `/app/students/${STUDENT}/id-card`],
  ['principal', 'app-admissions', '/app/admissions'],
  ['principal', 'app-attendance', '/app/attendance', chooseClass],
  ['principal', 'app-fees', '/app/fees', feesSetup, feesSetupDone],
  ['principal', 'app-fees-dues', '/app/fees', feesDues, feesDuesDone],
  ['principal', 'app-fees-receipt', '/app/fees', feesPay, feesPayDone],
  ['principal', 'app-fees-overdue', '/app/fees', feesOverdue, feesOverdueDone],
  ['principal', 'app-fees-sibling', '/app/fees', siblingRule, siblingRuleDone],
  ['principal', 'app-fees-pay-online', '/app/fees', payOnline, payOnlineDone],
  ['principal', 'app-fees-pay-upi', '/app/fees', payByUpi, payByUpiDone],
  ['principal', 'app-fees-recovery', '/app/fees', feeRecovery, feeRecoveryDone],
  ['principal', 'app-fees-clearance', '/app/fees', feeClearanceScreen, feeClearanceScreenDone],
  ['principal', 'app-fees-one-call', '/app/fees', feesOneCall, feesOneCallDone],
  ['principal', 'app-fees-bank', '/app/fees', bankStatement, bankStatementDone],
  ['principal', 'app-attendance-corrections', '/app/attendance', officeCorrections, officeCorrectionsDone],
  ['principal', 'app-timetable', '/app/timetable', chooseClass],
  ['principal', 'app-timetable-clash', '/app/timetable', timetableClash],
  ['principal', 'app-staff', '/app/staff'],
  ['principal', 'app-compliance', '/app/compliance'],
  ['principal', 'app-communication', '/app/communication', messageStates, messageStatesDone],
  ['principal', 'app-communication-replies', '/app/communication', parentReplies, parentRepliesDone],
  ['principal', 'app-communication-notices', '/app/communication', classNotice, classNoticeDone],
  ['principal', 'app-parents', '/app/parents', parentsScreen, parentsScreenDone],
  ['principal', 'app-ptm', '/app/ptm', ptmScreen, ptmScreenDone],
  ['principal', 'app-events', '/app/events', eventsScreen, eventsScreenDone],
  ['principal', 'app-complaints', '/app/complaints', complaintsScreen, complaintsScreenDone],
  ['principal', 'app-parent-ai', '/app/parent-ai', parentAiScreen, parentAiScreenDone],
  ['teacher', 'app-parents-teacher', '/app/parents', parentsTeacher, parentsTeacherDone],
  ['principal', 'app-taught-today', '/app/syllabus'],
  ['principal', 'app-settings', '/app/settings', settingsLateFee, settingsLateFeeDone],
  ['teacher', 'app-settings-teacher', '/app/settings', settingsReadOnly],
  ['principal', 'app-settings-holidays', '/app/settings', addHoliday, addHolidayDone],
  ['principal', 'app-settings-payments', '/app/settings', saveGatewayKeys, saveGatewayKeysDone],
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
  ['teacher', 'teacher-pulse-send', '/app/pulse', pulseSend, pulseSendDone],
  ['teacher', 'teacher-taught-one-tap', '/app/syllabus', oneTapTaught, oneTapTaughtDone],
  ['teacher', 'teacher-tickets', '/app/help/ticket'],
  ['founder', 'control-dashboard', '/control'],
  ['founder', 'control-schools', '/control/schools'],
  ['founder', 'control-school', `/control/schools/${SCHOOL}`],
  ['founder', 'control-view-as', `/control/schools/${SCHOOL}`, viewAs, viewAsDone],
  ['founder', 'control-users', '/control/users'],
  ['founder', 'control-onboarding', '/control/onboarding'],
  ['founder', 'control-applications', '/control/onboarding/applications'],
  ['founder', 'control-pipeline', '/control/monitoring'],
  ['founder', 'control-tickets', '/control/tickets'],
  ['founder', 'control-ticket', `/control/tickets/${TICKET}`],
  ['founder', 'control-account', '/control/account'],
  ['founder', 'control-search', '/control', typeInSearch('ill')],
  ['founder', 'control-hindi', '/control/schools', hindiWithMenu, backToEnglish],
  // --- P5 (docs/26): one block a slice. A slice's lines go between its own two marker lines, nowhere else. ---
  // p5-8a begin
  // p5-8a end
  // p5-8b begin
  ['principal', 'app-staff-leave', '/app/staff', staffLeave, staffLeaveDone],
  ['teacher', 'app-account-leave', '/app/account', accountLeave, accountLeaveDone],
  ['principal', 'app-account-leave-alone', '/app/account', accountLeaveAlone, accountLeaveAloneDone],
  // p5-8b end
  // p5-8c begin
  ['principal', 'app-proxy', '/app/proxy', proxyScreen, proxyScreenDone],
  ['teacher', 'teacher-proxy', '/app/proxy', proxyMine, proxyMineDone],
  ['teacher', 'teacher-timetable-covers', '/app/timetable', proxyCoverShownAt('[data-timetable-covers]', ['You cover today', 'Period 4 · 6-A · English', 'See your covers']), proxyCoverShownDone('[data-timetable-covers]')],
  ['teacher', 'teacher-my-day-cover', '/app/my-day', proxyCoverShownAt('[data-today-card="covers-today"]', ['You cover 1 period today', '4. 6-A English', 'See your covers']), proxyCoverShownDone('[data-today-card="covers-today"]')],
  // p5-8c end
  // p5-8d begin
  // The principal's dashboard on school facts (C203): 30 days with every tile's link followed and its rows counted;
  // the CSV; Hindi; the first-visit tour; and the screens a dashboard number opens, each on that number's filter.
  ['principal', 'app-dashboard-30-days', '/app/dashboard?range=30d', dashboardRows, dashboardRowsDone],
  ['principal', 'app-dashboard-export', '/app/dashboard?range=7d', dashboardExport],
  ['principal', 'app-dashboard-hindi', '/app/dashboard?range=7d', speak('हिन्दी'), backToEnglish],
  ['principal', 'app-dashboard-first-visit', '/app/dashboard', firstVisit, skipAndCheck('principal')],
  ['principal', 'app-attendance-rows', '/app/attendance?show=unmarked', shownRows],
  ['principal', 'app-attendance-days', `/app/attendance?show=days&from=${indiaDay(29)}&to=${indiaDay(0)}`, attendanceDays],
  ['principal', 'app-fees-rows', '/app/fees?show=overdue', shownRows],
  ['principal', 'app-communication-rows', `/app/communication?state=held&from=${indiaDay(29)}&to=${indiaDay(0)}`, heldMessages],
  ['principal', 'app-notices-rows', '/app/communication?show=notices', shownAfterAdding(true), clearDashboardRows],
  ['principal', 'app-events-rows', '/app/events?show=coming', shownAfterAdding(true), clearDashboardRows],
  ['principal', 'app-answers-rows', '/app/parent-ai?show=drafts', shownAfterAdding(false), clearDashboardRows],
  ['principal', 'app-tickets-rows', '/app/help/ticket?show=open', shownRows],
  // p5-8d end
  // p5-8e begin
  ['founder', 'control-billing-plans', '/control/billing-plans', billingPlans, billingPlansDone],
  ['principal', 'app-paid-until', '/app/my-day', schoolInGrace, schoolInGraceDone],
  // p5-8e end
  // p5-8f begin
  // p5-8f end
  // p5-8g begin
  // p5-8g end
  // p5-8h begin
  // p5-8h end
  // p5-8i begin
  // p5-8i end
  // p5-8j begin
  // p5-8j end
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
  // Online payments answer from the stand-in provider, never a real gateway (C169).
  PAYMENT_PROVIDER: 'stand-in',
  // A key for this run only, so saving a gateway's keys can be shown (C171). It is made here, used here and never written anywhere.
  PAYMENT_CREDENTIALS_KEY: randomBytes(32).toString('base64'),
  PAYMENT_STANDIN_SECRET: `${secret}-payments-stand-in-secret-0123456789`,
  // The WhatsApp stand-in signs its delivery notices with this (C183). No phone is reached, with or without it.
  WHATSAPP_STANDIN_SECRET: `${secret}-whatsapp-stand-in-secret-0123456789`,
  DATABASE_URL: db.url,
  // One connection: the in-memory database is one session, so requests take turns (see src/lib/auth/db.ts).
  DB_POOL_MAX: '1',
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
