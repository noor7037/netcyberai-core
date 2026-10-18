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
import { visibleWords } from './visible-words.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const SERVE = process.argv.includes('--serve');
const OUT = path.resolve(arg('--out') ?? path.join(ROOT, 'harness-output'));
const ONLY = arg('--only');
const KEEP = arg('--keep') ? path.resolve(arg('--keep')) : null;
const KEEP_SCREENS = (arg('--screens') ?? '').split(',').filter(Boolean);
const KEEP_LIMIT_BYTES = 1.5 * 1024 * 1024;
// Screens whose set-up ends on another page by design (C242): the receipt screen opens the receipt it just made, at
// its own address. The landing is checked against this instead of the route.
const EXPECTED_LANDING = { 'app-fees-receipt': /^\/app\/fees\/receipts\/[0-9a-f-]{36}$/ };
const landedWhereExpected = (name, route, landedOn) => (EXPECTED_LANDING[name] ? EXPECTED_LANDING[name].test(landedOn) : landedOn === route.split('?')[0]);
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
  // A parent (C230-D): the family app only.
  parent: { sub: '00000000-0000-4000-8000-0000000e0001', role: 'parent', schoolId: SCHOOL, membershipId: '00000000-0000-4000-8000-0000000e1001' },
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
  // The two secrets are hidden; the verify token is not a secret and is shown (C230-B).
  const secretsHidden = await page.locator('#wa-accessToken, #wa-appSecret').evaluateAll((els) => els.every((e) => e.type === 'password'));
  const verifyShown = await page.locator('#wa-verifyToken').evaluate((e) => e.type === 'text');
  // Each field says it looks right while typed, and a made verify token passes the same rule.
  await page.locator('[data-wa-make-token]').click();
  const madeTokenOk = /^[A-Za-z0-9_-]{32}$/.test(await page.locator('#wa-verifyToken').inputValue());
  const rightFields = await page.locator('[data-whatsapp-account] [id^="wa-"][id$="-message"] .text-emerald-text').count();
  const hook = `${base}/api/public/whatsapp/webhook/meta`;
  const get = (await fetch(`${hook}?hub.mode=subscribe&hub.verify_token=anything&hub.challenge=1`)).status;
  const post = (await fetch(hook, { method: 'POST', headers: { 'x-hub-signature-256': 'sha256=00' }, body: '{}' })).status;
  whatsappSeen = { noKey, saveDisabled, secretsHidden, verifyShown, madeTokenOk, rightFields, get, post };
};
const whatsappAccountDone = async () => {
  const saved = (await db.pg.query(`select count(*)::int as n from whatsapp_credentials`)).rows[0].n;
  const want = { noKey: 1, saveDisabled: true, secretsHidden: true, verifyShown: true, madeTokenOk: true, rightFields: 5, get: 404, post: 404 };
  if (JSON.stringify(whatsappSeen) !== JSON.stringify(want) || saved !== 0) throw new Error(`the WhatsApp account screen without a key: ${JSON.stringify(whatsappSeen)}, ${saved} saved`);
};
// The family app (C230-D): Rajesh's two children, each with today's mark and what is owed; a parent opening the staff
// app is sent to the family app, and a staff API refuses a parent's session.
let familySeen = null;
const familyHome = async (page) => {
  await page.locator('[data-family-child]').first().waitFor({ timeout: 20000 });
  const children = await page.locator('[data-family-child] h2').allInnerTexts();
  const ownChildren = (await db.pg.query(`select s.name from parent_student_map m join students s on s.student_id = m.student_id where m.parent_id = $1 order by s.name`, [PEOPLE.parent.sub])).rows.map((r) => r.name);
  const cookie = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
  const staffApi = (await fetch(`${base}/api/app/students`, { headers: { cookie } })).status;
  // Next.js writes 127.0.0.1 as "localhost" in the address it redirects to, so the session goes to both names here.
  const sameSession = (await page.context().cookies()).filter((c) => c.domain === '127.0.0.1');
  await page.context().addCookies(sameSession.map(({ name, value, path: p, expires, httpOnly, secure, sameSite }) => ({ name, value, domain: 'localhost', path: p, expires, httpOnly, secure, sameSite })));
  const toApp = await page.context().newPage();
  await toApp.goto(`${base}/app/my-day`);
  const landed = new URL(toApp.url()).pathname;
  await toApp.close();
  familySeen = { children: [...children].sort().join(','), own: ownChildren.join(','), staffApi, landed };
};
const familyHomeDone = async () => {
  if (!familySeen || familySeen.children !== familySeen.own || familySeen.staffApi !== 401 || familySeen.landed !== '/family') throw new Error(`the family app: ${JSON.stringify(familySeen)}`);
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
  // A guardian with their own number, and preferably one the school has not messaged yet in this run: the thread shows
  // everything sent to the number, so an earlier screen's reminder would sit in it as another outgoing message (C242).
  const guardians = (await db.pg.query(
    `select p.phone, count(*) over (partition by regexp_replace(p.phone, '[^0-9]', '', 'g')) as shared,
            (select count(*) from communication_log l where l.school_id = p.school_id and right(regexp_replace(l.to_phone, '[^0-9]', '', 'g'), 10) = right(regexp_replace(p.phone, '[^0-9]', '', 'g'), 10)) as messaged
       from parents p where p.school_id = $1 order by messaged, p.created_at, p.parent_id`,
    [SCHOOL]
  )).rows;
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
  // Messages already in the thread (anything sent to this number earlier in the run), then the reply adds one more.
  const outBefore = await page.locator('[data-thread-message="out"]').count();
  await page.locator('#thread-reply').fill('Yes, the school is open on Saturday until 12:30.');
  await page.locator('[data-thread-send]').click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-thread-message="out"]').length === n + 1, outBefore, { timeout: 20000 });
  // The thread ends with the parent's message and the reply, and holds the parent's one message only.
  const shown = await page.locator('[data-thread-message]').evaluateAll((els) => els.map((e) => e.getAttribute('data-thread-message')));
  const threadShows = shown.filter((d) => d === 'in').length === 1 && shown.slice(-2).join() === 'in,out' ? 'in,out' : shown.join();
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
// Each row gets its own asked_at, a second after the one before: the lists are ordered by it, and rows put in
// within the same millisecond would otherwise fall back to the order of their random ids.
let leaveRows = 0;
const putLeave = (user, from, to, kind, reason, decidedBy = null) =>
  db.pg.query(
    `insert into staff_leave (school_id, user_id, from_date, to_date, kind, reason, status, recorded_by, decided_by, decided_at, asked_at)
     values ($1, $2, ${TODAY_SQL} + $3::int, ${TODAY_SQL} + $4::int, $5, $6, case when $7::uuid is null then 'waiting' else 'approved' end, $2, $7::uuid, case when $7::uuid is not null then now() end,
             now() - interval '1 hour' + make_interval(secs => $8::int))`,
    [SCHOOL, user, from, to, kind, reason, decidedBy, (leaveRows += 1) % 3000]
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
  proxyMineSeen = { rows: await page.locator('[data-proxy-mine]').count(), none: await page.locator('[data-proxy-mine-none]').count(), buttons: await mine.locator('button:not([data-info-tip])').count(), today: words.includes('Period 4 · 6-A · English'), namesWhoIsAway: words.includes('Tanvi') || words.includes('In place of'), later: words.includes('The days after') };
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
  // On a phone My Day shows a row's action as a chevron (C230-D), so its words are in the text, not on screen. The
  // "Why this?" answer is left out: it explains the rule, not this cover.
  const words = `${await block.innerText()} ${await block.evaluate((el) => { const c = el.cloneNode(true); c.querySelectorAll('details').forEach((d) => d.remove()); return c.textContent; })}`;
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
// complaint past its time, a notice waiting, an event to come, a draft answer, a monthly budget; and for slice
// 8d-2 a meeting to come, a leave request waiting, and a teacher on approved leave today whose one period nobody
// covers). Then EVERY tile is followed in the same browser and what its screen lists is counted: the number on
// the tile must be the rows of the screen it opens (or, for a sum or a figure, what those rows or that screen
// say). No tile is without a link any more: complaints, meetings, leave and covers open their rows like the rest,
// and the cover tile opens Proxy Auto on the periods that still need cover, counted like any other list.
// Afterwards some tiles are compared with the database, and every added row is taken away.
const indiaDay = (back = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() - back * 86400000));
const H8D = '00000000-0000-4000-8000-0000008d000';
const clearDashboardRows = async () => {
  // The complaint may have been closed on the screen (the check of "app-complaints-rows" does it): what closing
  // wrote goes with it, the message to the parent that the gate held or queued and its job included.
  await db.pg.exec(`set session_replication_role = replica;
    delete from homework_status where target_id = '${H8D}2'; delete from homework_targets where target_id = '${H8D}2'; delete from homework where homework_id = '${H8D}1';
    delete from jobs where type = 'whatsapp.send' and payload->>'logId' in (select log_id::text from communication_log where dedupe_key like 'complaint:${H8D}3:%');
    delete from communication_log where dedupe_key like 'complaint:${H8D}3:%'; delete from complaint_events where complaint_id = '${H8D}3';
    delete from receipts where receipt_no = 'H8D-1'; delete from complaints where complaint_id = '${H8D}3';
    delete from class_notices where notice_id = '${H8D}4'; delete from school_events where event_id = '${H8D}5'; delete from parent_ai_answers where answer_id = '${H8D}6';
    delete from ptm_events where ptm_id = '${H8D}7';
    set session_replication_role = origin;`);
};
// Slice 8d-2. A complaint whose due time passed two hours ago, and a meeting in five days: a row for each of
// the lists /app/complaints?show=… and /app/ptm?show=coming open on.
const addComplaint = async () => {
  const guardian = (await db.pg.query(`select parent_id from parent_student_map where school_id = $1 and student_id = $2 limit 1`, [SCHOOL, STUDENT])).rows[0].parent_id;
  await db.pg.query(`insert into complaints (complaint_id, school_id, parent_id, student_id, source, summary, status, owner_id, due_at, created_by) values ($1, $2, $3, $4, 'office', 'Harness 8d: the gate opens late.', 'open', $5, now() - interval '2 hours', $5)`, [`${H8D}3`, SCHOOL, guardian, STUDENT, PEOPLE.principal.sub]);
};
const addMeeting = () => db.pg.query(`insert into ptm_events (ptm_id, school_id, title, held_on, starts_at, ends_at, slot_minutes, class_ids, created_by) values ($1, $2, 'Harness 8d term meeting', ${TODAY_SQL} + 5, '10:00', '11:00', 30, array[$3]::uuid[], $4)`, [`${H8D}7`, SCHOOL, CLASS_5A, PEOPLE.principal.sub]);
// Leave and covers: Tanvi's request for later in the week waits for the office; Tejas, a teacher added for the
// run with one period a day (as Proxy Auto's own screen adds him), is on approved leave today, and nobody covers
// his period. clearProxy() takes all of it away. On a Sunday the school is closed and no period needs cover.
const addLeaveAndCover = async () => {
  await clearProxy();
  await db.pg.query(`insert into users (user_id, school_id, email, role, display_name) values ($1, $2, 'tejas@example.invalid', 'teacher', 'Tejas Example')`, [PROXY_TEACHERS.tejas, SCHOOL]);
  await db.pg.query(`insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) select $1, $2, d, 4, $3, $4 from generate_series(1, 6) d`, [SCHOOL, PROXY_CLASS_6A, PROXY_MATHS, PROXY_TEACHERS.tejas]);
  await putLeave(PROXY_TEACHERS.tejas, 0, 0, 'sick', 'Harness 8d: unwell this morning.', PEOPLE.principal.sub);
  await putLeave(LEAVE_OTHER_TEACHER, 3, 4, 'casual', 'Harness 8d: a family function.');
};
const isSundayInIndia = async () => (await db.pg.query(`select extract(isodow from ${TODAY_SQL})::int as dow`)).rows[0].dow === 7;
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
  const two = (await db.pg.query(`select student_id from students where school_id = $1 and class_id = $2 and status = 'active' order by student_id limit 2`, [SCHOOL, CLASS_5A])).rows.map((r) => r.student_id);
  await db.pg.query(`insert into homework (homework_id, school_id, subject_id, title, due_date, created_by) values ($1, $2, $3, 'Harness 8d sums', ${TODAY_SQL}, $4)`, [`${H8D}1`, SCHOOL, subject, PEOPLE.teacher.sub]);
  await db.pg.query(`insert into homework_targets (target_id, school_id, homework_id, class_id, title, due_date) values ($1, $2, $3, $4, 'Harness 8d sums', ${TODAY_SQL})`, [`${H8D}2`, SCHOOL, `${H8D}1`, CLASS_5A]);
  await db.pg.query(`insert into homework_status (school_id, target_id, class_id, student_id, done, checked_by) values ($1, $2, $3, $4, true, $6), ($1, $2, $3, $5, false, $6)`, [SCHOOL, `${H8D}2`, CLASS_5A, two[0], two[1], PEOPLE.teacher.sub]);
  await db.pg.query(`insert into receipts (school_id, receipt_no, student_id, total_minor, method, issued_by) values ($1, 'H8D-1', $2, 150000, 'cash', $3)`, [SCHOOL, STUDENT, PEOPLE.principal.sub]);
  await addComplaint();
  await addMeeting();
  await addLeaveAndCover();
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
  // Where each attention item's one button goes (some numbers are an attention item and not a tile).
  const attentionLinks = Object.fromEntries(await page.locator('[data-attention]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-attention'), e.querySelector('a')?.getAttribute('href')])));
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
      rows[id] = { kind: 'rows', tile: tile.value, said: counted ? Number(await page.locator('[data-students-count]').getAttribute('data-students-count')) : 0, listed: counted ? await page.locator(url.pathname === '/app/admissions' ? '[data-adm-waiting] [data-shown-row]' : 'tbody tr').count() : 0 }; // Admissions (C221): its list of the children waiting for consent
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
      // Every other tile opens a list of exactly its rows, in one frame: a title that says how many, and the rows.
      // Proxy Auto too (/app/proxy?show=needs-cover): it lists the periods that still need cover and no others,
      // so its rows are counted here like any list, with no filter of this harness's own.
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
  dashboardSeen = { tiles, attention, attentionLinks, needsYou, why, charts, exportHref, rows, tableLinks, feeBars, feesTitle };
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
  const sunday = await isSundayInIndia();
  await clearProxy();
  const s = dashboardSeen;
  const problems = [];
  const tile = (id) => s.tiles.find((t) => t.id === id);
  // Every tile that was counted was followed, and none is without a link: complaints, meetings, leave and covers
  // open their rows like the rest (slice 8d-2).
  const followed = Object.keys(s.rows).length;
  if (followed < 30) problems.push(`only ${followed} tiles were followed`);
  const noLink = Object.entries(s.rows).filter(([, r]) => r.kind === 'no-link').map(([id]) => id);
  if (noLink.length) problems.push(`tiles with no link: ${noLink.join()}`);
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
  // Slice 8d-2, the rows this run wrote. The complaint is open and past its time: it is the one row of the open
  // list, badged "Overdue"; its words are read in the list below, not in this one. (The list of the ones past
  // their time is the "app-complaints-rows" screen; on the dashboard that number is an attention item, whose
  // button must go to that list.) The meeting in five days is the one meeting to come.
  if (s.rows['complaints.open']?.listed !== 1 || !/Overdue/.test(s.rows['complaints.open'].text) || s.rows['complaints.open'].text.includes('Harness 8d')) problems.push(`complaints.open: its screen lists ${s.rows['complaints.open']?.listed}: "${String(s.rows['complaints.open']?.text).slice(0, 120)}"`);
  for (const [id, href] of Object.entries({ 'complaints.overdue': '/app/complaints?show=overdue', 'staff.leave_waiting': '/app/staff?show=leave-waiting', ...(sunday ? {} : { 'proxy.uncovered_today': '/app/proxy?show=needs-cover' }) })) if (s.attentionLinks[id] !== href) problems.push(`${id}: its attention button opens ${s.attentionLinks[id]}`);
  if (s.rows['ptm.coming']?.listed !== 1 || !s.rows['ptm.coming'].text.includes('Harness 8d term meeting')) problems.push(`ptm.coming: its screen lists ${s.rows['ptm.coming']?.listed}: "${String(s.rows['ptm.coming']?.text).slice(0, 120)}"`);
  // One leave request waits (its reason is not repeated in the list); one teacher is on leave today.
  if (s.rows['staff.leave_waiting']?.listed !== 1 || !s.rows['staff.leave_waiting'].text.includes('Tanvi Example') || s.rows['staff.leave_waiting'].text.includes('Harness 8d')) problems.push(`staff.leave_waiting: its screen lists ${s.rows['staff.leave_waiting']?.listed}: "${String(s.rows['staff.leave_waiting']?.text).slice(0, 120)}"`);
  if (s.rows['staff.on_leave_today']?.listed !== 1 || !s.rows['staff.on_leave_today'].text.includes('Tejas Example')) problems.push(`staff.on_leave_today: its screen lists ${s.rows['staff.on_leave_today']?.listed}: "${String(s.rows['staff.on_leave_today']?.text).slice(0, 120)}"`);
  // His one period today has no cover: "1 of 1" on the tile. The tile opens Proxy Auto on the periods that still
  // need cover: one period listed, under a title that ends with the tile's own words. On a Sunday the school is
  // closed: nothing to cover, the tile says a plain 0, and so does the list.
  const cover = s.rows['proxy.uncovered_today'];
  const coverSays = sunday ? '0' : '1 of 1';
  if (tile('proxy.uncovered_today')?.href !== '/app/proxy?show=needs-cover' || tile('proxy.uncovered_today')?.value !== coverSays || cover?.listed !== (sunday ? 0 : 1) || cover?.title !== `Periods that still need cover: ${coverSays}`) problems.push(`proxy.uncovered_today: the tile says ${tile('proxy.uncovered_today')?.value} and opens ${tile('proxy.uncovered_today')?.href}, its screen says "${cover?.title}" and lists ${cover?.listed}`);
  for (const id of ['staff.leave_waiting', ...(sunday ? [] : ['proxy.uncovered_today'])]) if (!s.attention.includes(id)) problems.push(`not on the attention list: ${id}`);
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
// Slice 8d-2: the same for complaints, meetings and leave. `add` writes the rows, the page is opened again, and
// the list must hold exactly `rows` rows, say each of `words` and none of `never`.
const shownWith = (add, { rows, words = [], never = [] }) => async (page) => {
  await clearDashboardRows();
  await add();
  await page.reload({ waitUntil: 'networkidle', timeout: 90000 });
  await shownRows(page);
  const text = (await page.locator('[data-shown]').textContent()) ?? '';
  const listed = await page.locator('[data-shown-row]').count();
  if (listed !== rows || !words.every((w) => text.includes(w)) || never.some((w) => text.includes(w))) throw new Error(`the list holds ${listed} rows: "${text.slice(0, 160)}"`);
};
// The rows above are drawn on the server and the list below is the browser's. After a change made in the list
// below, the rows above must say what is true NOW, with no reload: a complaint just closed is not "past its due
// time", a request just approved does not wait (C203, fixes from the check). `act` does one change the way a
// person does it; the title above must then say `words` over an empty list, in the page that was already open.
const changeBelow = async (page, act, words) => {
  await page.evaluate(() => (window.h8dStays = true));
  await act();
  try {
    await page.waitForFunction((want) => document.querySelector('[data-shown-title]')?.textContent?.trim() === want && document.querySelectorAll('[data-shown-row]').length === 0, words, { timeout: 20000 });
  } catch {
    throw new Error(`after the change below, the list above still says "${((await page.locator('[data-shown-title]').textContent()) ?? '').trim()}" with ${await page.locator('[data-shown-row]').count()} rows; it should say "${words}"`);
  }
  if (!(await page.evaluate(() => window.h8dStays === true))) throw new Error('the page was loaded again: the list above must be read again without that');
};
// Opening the filtered Complaints screen is the principal really looking: the screen's own list, loaded by the
// browser below the rows, marks the complaint as seen. (The dashboard's number, and the rows above, never do.)
// Then the principal closes the complaint in the list below, with what was done: the list above says none is past
// its due time any more.
const complaintShownDone = async (page) => {
  try {
    const seen = (await db.pg.query(`select principal_seen_at is not null as seen from complaints where complaint_id = $1`, [`${H8D}3`])).rows[0]?.seen;
    if (seen !== true) throw new Error(`the complaint the principal opened is marked seen: ${seen}`);
    await changeBelow(page, async () => {
      await page.locator(`#complaint-text-${H8D}3`).fill('The gate now opens at seven.');
      await page.locator('li[data-complaint="open"]', { has: page.locator(`#complaint-text-${H8D}3`) }).locator('[data-complaint-close]').click();
    }, 'Complaints past their due time: 0');
    const status = (await db.pg.query(`select status from complaints where complaint_id = $1`, [`${H8D}3`])).rows[0]?.status;
    if (status !== 'closed') throw new Error(`the complaint closed on the screen is ${status} in the database`);
  } finally {
    await clearDashboardRows();
  }
};
// The office calls the meeting off in the list below: the list above says no meeting is coming.
const ptmShownDone = async (page) => {
  try {
    await changeBelow(page, async () => {
      await page.locator('[data-ptm-meeting]', { hasText: 'Harness 8d term meeting' }).click();
      await page.locator('[data-ptm-cancel]').click();
    }, 'Meetings coming: 0');
  } finally {
    await clearDashboardRows();
  }
};
const clearDashboardAndProxy = async () => {
  await clearDashboardRows();
  await clearProxy();
};
// Leave. On "on leave today": the principal cancels Tejas's leave under "Approved leave" below (with the note a
// cancelled leave needs), and the list above says nobody is on leave today. Then the other list, "requests
// waiting": the principal approves Tanvi's request in the list below, and the list above says none waits.
const staffLeaveShownDone = async (page) => {
  try {
    await changeBelow(page, async () => {
      const row = page.locator('[data-leave-calendar-row]', { hasText: 'Tejas Example' });
      await row.locator('[data-leave-cancel-open]').click();
      await row.locator('input').fill('Recorded for the wrong day.');
      await row.locator('[data-leave-cancel]').click();
    }, 'Staff on leave today: 0');
    await page.goto(`${base}/app/staff?show=leave-waiting`, { waitUntil: 'networkidle', timeout: 90000 });
    await shownRows(page);
    if (((await page.locator('[data-shown]').textContent()) ?? '').includes('Tanvi Example') !== true) throw new Error('the request waiting is not on the list above');
    await changeBelow(page, () => page.locator('[data-leave-waiting-row="theirs"] [data-leave-approve]').first().click(), 'Leave requests waiting: 0');
  } finally {
    await clearDashboardAndProxy();
  }
};
// Proxy Auto opened on the periods that still need cover (/app/proxy?show=needs-cover; C203, fixes from the
// check). The scene is Proxy Auto's own: Tara is on approved leave today with her three periods, and Tejas and
// Tripti, added for the run, are free. The list holds the three periods and its title says "3 of 3"; no covered
// period, no day picker. The principal gives the first period to the first name offered: the period leaves the
// list at once and the title says "2 of 3", in the page that was already open, because the list is the screen's
// own reading. The picture is taken then. On a Sunday the school is closed: the list says 0 and holds nothing.
let proxyRowsSeen = null;
const proxyRows = async (page) => {
  await clearProxy();
  const sunday = await isSundayInIndia();
  await db.pg.query(`insert into users (user_id, school_id, email, role, display_name) values ($1, $3, 'tejas@example.invalid', 'teacher', 'Tejas Example'), ($2, $3, 'tripti@example.invalid', 'teacher', 'Tripti Example')`, [PROXY_TEACHERS.tejas, PROXY_TEACHERS.tripti, SCHOOL]);
  await db.pg.query(`insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) select $1, $2, d, 4, $3, $4 from generate_series(1, 6) d`, [SCHOOL, PROXY_CLASS_6A, PROXY_MATHS, PROXY_TEACHERS.tejas]);
  await putLeave(PEOPLE.teacher.sub, 0, 1, 'sick', 'Unwell, phoned in this morning.', PEOPLE.principal.sub);
  await page.reload({ waitUntil: 'networkidle', timeout: 90000 });
  await page.locator('[data-shown="proxy-needs-cover"]').waitFor({ timeout: 30000 });
  const read = async () => ({
    title: ((await page.locator('[data-shown-title]').textContent()) ?? '').trim(),
    rows: await page.locator('[data-shown-row]').count(),
    periods: await page.locator('[data-proxy-period]').count(),
    covered: await page.locator('[data-proxy-period][data-covered="yes"]').count(),
    dayPicker: await page.locator('[data-proxy-days]').count(),
    back: await page.locator('[data-shown-back]').getAttribute('href'),
  });
  const atFirst = await read();
  let after = null;
  if (!sunday) {
    await page.evaluate(() => (window.h8dStays = true));
    await page.locator('[data-shown-row] [data-proxy-assign]').first().click();
    await page.waitForFunction(() => document.querySelectorAll('[data-shown-row]').length === 2 && document.querySelector('[data-proxy-note]'), null, { timeout: 20000 });
    after = { ...(await read()), note: await page.locator('[data-proxy-note]').getAttribute('data-proxy-note'), stayed: await page.evaluate(() => window.h8dStays === true) };
  }
  // Back to the top for the picture: the tap scrolled the page to the period.
  await page.evaluate(() => window.scrollTo(0, 0));
  proxyRowsSeen = { sunday, atFirst, after };
};
const proxyRowsDone = async () => {
  const assigned = (await db.pg.query(`select count(*)::int as n from substitutions where school_id = $1 and on_date = ${TODAY_SQL} and status = 'assigned'`, [SCHOOL])).rows[0].n;
  await clearProxy();
  const list = (title, rows) => ({ title: `Periods that still need cover: ${title}`, rows, periods: rows, covered: 0, dayPicker: 0, back: '/app/proxy' });
  const want = proxyRowsSeen?.sunday
    ? { sunday: true, atFirst: list('0', 0), after: null }
    : { sunday: false, atFirst: list('3 of 3', 3), after: { ...list('2 of 3', 2), note: 'ok', stayed: true } };
  if (JSON.stringify(proxyRowsSeen) !== JSON.stringify(want) || assigned !== (want.sunday ? 0 : 1)) throw new Error(`Proxy Auto on the periods that need cover: ${JSON.stringify(proxyRowsSeen)}, ${assigned} covers assigned today`);
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
  // The seed's school is recorded on the first plan, which is for test schools only (C219): Control has put this real
  // school on a plan for schools, so a payment has a plan to be for.
  await db.pg.query(`insert into school_subscriptions (school_id, plan_id) values ($1, 'growth')`, [SCHOOL]);
  // Grace set by hand, to the end of the day three days from now in India (Control stores 23:59:59 of that day).
  await db.pg.exec(`update school_entitlements set access_mode = 'grace', grace_ends_at = (((now() at time zone 'Asia/Kolkata')::date + 4)::timestamp at time zone 'Asia/Kolkata') - interval '1 second' where school_id = '${SCHOOL}';`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-billing-plan-add]').click();
  await page.locator('#plan-name').fill('Harness Made-up Plan');
  await page.locator('#plan-price-month').fill('1,250'); // C212: per student; the yearly price is filled in as ten months
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
    `select (select count(*)::int from plans where plan_id = $2 and name = 'Harness Made-up Plan' and price_month_minor = 125000 and price_year_minor = 1250000 and grace_days = 10 and all_working_modules and retired_at is null) as plans,
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
    values ('${SCHOOL}', 'compass', (now() at time zone 'Asia/Kolkata')::date - 1, 'grace', (((now() at time zone 'Asia/Kolkata')::date + 15)::timestamp at time zone 'Asia/Kolkata'), (now() at time zone 'Asia/Kolkata')::date);
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
// Control → Messaging & Cost by month (C205): the founder sets the school's limit, steps to last month and back by
// the links, picks last month in the month switch and downloads its list. Messages are put into the seeded school's
// log with made-up prices: four delivered in last month (one of them at 23:50 India time on its last day), one ten
// minutes later (this month's, so it must not be counted), one on its way and one held back. The record of limit
// changes says last month's limit was 7 rupees; the founder sets 9 rupees today, on the screen: the moment the screen
// says it is set, this month's list above the form must already show it, and last month must still be judged against
// the 7 rupees in force at its end (6.50 of it is counted, and it held a message back). The check compares the row
// on the screen, the downloaded file and the sums counted from the log, then puts everything back.
let costMonthSeen = null;
let costMonthLimitBefore;
const lastIndiaMonth = () => {
  const d = new Date(Date.now() + 5.5 * 3600_000);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};
const clearCostMonth = async () => {
  await db.pg.exec(`set session_replication_role = replica;
    delete from communication_log where dedupe_key like 'harness-8f-%';
    delete from audit_log where event_action = 'whatsapp.budget_set' and school_id = '${SCHOOL}' and after_state ->> 'reason' = 'harness-8f: the limit of last month.';
    set session_replication_role = origin;`);
};
const costMonth = async (page) => {
  await clearCostMonth();
  costMonthSeen = null;
  const month = lastIndiaMonth();
  if (costMonthLimitBefore === undefined) costMonthLimitBefore = (await db.pg.query(`select monthly_budget_paise from schools where school_id = $1`, [SCHOOL])).rows[0].monthly_budget_paise;
  // 110 paise and 20 of GST a message: made up. Four delivered in last month: 520 paise spent; with the one on its
  // way, 650 counted against that month's limit of 700.
  const thisMonthStarts = `date_trunc('month', (now() at time zone 'Asia/Kolkata'))`;
  const at = (expr) => `(${expr}) at time zone 'Asia/Kolkata'`;
  // A limit change of last month, as the app records one. An audit row's time is stamped by the database's own
  // trigger, so a row of the past can only be put in with the triggers off, as the harness's superuser.
  await db.pg.exec(`set session_replication_role = replica;
    insert into audit_log (school_id, actor_user_id, actor_role, event_action, target_type, target_id, before_state, after_state, occurred_at, created_at)
    values ('${SCHOOL}', '${PEOPLE.founder.sub}', 'super_admin', 'whatsapp.budget_set', 'schools', '${SCHOOL}', '{"budgetPaise": null}', '{"budgetPaise": 700, "reason": "harness-8f: the limit of last month."}', ${at(`${thisMonthStarts} - interval '20 days'`)}, ${at(`${thisMonthStarts} - interval '20 days'`)});
    set session_replication_role = origin;`);
  const row = (n, status, billable, when) =>
    `('${SCHOOL}', '+919000000001', 'whatsapp', 'class_notice', 'utility', ${billable}, 110, 20, 'rate_table', '${status}', 'harness-8f-${n}', 'platform_default', 'operational_communication', 'meta', ${when})`;
  await db.pg.exec(`
    insert into communication_log (school_id, to_phone, channel, template_name, billing_category, billable, est_cost_paise, gst_paise, cost_basis, status, dedupe_key, provider_used, purpose, provider, created_at) values
      ${row(1, 'delivered', true, at(`${thisMonthStarts} - interval '12 days'`))},
      ${row(2, 'read', true, at(`${thisMonthStarts} - interval '9 days'`))},
      ${row(3, 'delivered', true, at(`${thisMonthStarts} - interval '3 days'`))},
      ${row(4, 'delivered', true, at(`${thisMonthStarts} - interval '10 minutes'`))},
      ${row(5, 'delivered', true, at(`${thisMonthStarts} + interval '10 minutes'`))},
      ${row(6, 'sent', false, at(`${thisMonthStarts} - interval '2 days'`))};
    insert into communication_log (school_id, to_phone, channel, template_name, billing_category, billable, est_cost_paise, gst_paise, cost_basis, status, dedupe_key, provider_used, purpose, created_at) values
      ('${SCHOOL}', '+919000000001', 'whatsapp', 'class_notice', 'utility', false, 0, 0, 'not_billable', 'blocked_budget', 'harness-8f-7', 'platform_default', 'operational_communication', ${at(`${thisMonthStarts} - interval '1 day'`)});`);
  await page.reload({ waitUntil: 'networkidle' });
  const form = page.locator('[data-cost-school]').filter({ hasText: 'Illustrative Public School' });
  await form.locator('input').nth(0).fill('9');
  await form.locator('input').nth(1).fill('harness-8f: a made-up limit.');
  await form.locator('[data-cost-budget-save]').click();
  await page.waitForFunction(() => /limit is set/.test(document.querySelector('[data-cost-note]')?.textContent ?? ''), null, { timeout: 20000 });
  // Read at once, with no waiting: the list drawn on the server and the line beside the form.
  const limitAbove = await page.locator(`[data-cost-list-row="${SCHOOL}"] td`).first().textContent();
  const limitBelow = await form.locator('p').nth(1).textContent();
  // One step back and one forward by the links, which change the month without loading the page afresh: each time the
  // month switch must name the month now shown, or "Show month" would jump back to the month it still names.
  const thisMonth = await page.locator('[data-cost-month]').getAttribute('data-cost-month');
  await page.locator('[data-cost-month-earlier]').click();
  await page.locator(`[data-cost-month="${month}"]`).waitFor({ timeout: 20000 });
  const pickerEarlier = [new URL(page.url()).search, await page.locator('#cost-month').inputValue()];
  await page.locator('[data-cost-month-later]').click();
  await page.locator(`[data-cost-month="${thisMonth}"]`).waitFor({ timeout: 20000 });
  const pickerLater = [new URL(page.url()).search, await page.locator('#cost-month').inputValue()];
  await page.locator('#cost-month').selectOption(month);
  await page.locator('[data-cost-month-show]').click();
  await page.locator(`[data-cost-month="${month}"]`).waitFor({ timeout: 20000 });
  await page.waitForLoadState('networkidle');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.locator('[data-cost-export]').click()]);
  costMonthSeen = {
    month,
    limitAbove,
    limitBelow,
    thisMonth,
    pickerEarlier,
    pickerLater,
    address: new URL(page.url()).search,
    rows: await page.locator('[data-cost-list-row]').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('th, td')].map((c) => c.textContent.trim()))),
    flags: await page.locator('[data-cost-flag]').evaluateAll((els) => els.map((e) => e.getAttribute('data-cost-flag'))),
    sentences: await page.locator('[data-cost-counts]').count(),
    limitNote: await page.locator('[data-cost-limit-then]').count(),
    history: await page.locator(`[data-cost-history-row="${SCHOOL}"] td`).allTextContents(),
    later: await page.locator('[data-cost-month-later]').count(),
    fileName: download.suggestedFilename(),
    file: readFileSync(await download.path(), 'utf8'),
  };
};
const costMonthDone = async () => {
  const month = lastIndiaMonth();
  const { rows } = await db.pg.query(
    `select (select coalesce(sum(est_cost_paise + gst_paise), 0)::int from communication_log where school_id = $1 and channel = 'whatsapp' and billable and cost_basis = 'rate_table' and status::text in ('delivered', 'read') and to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM') = $2) as spent,
            (select coalesce(sum(est_cost_paise + gst_paise), 0)::int from communication_log where school_id = $1 and channel = 'whatsapp' and cost_basis = 'rate_table' and (billable or status = 'sent') and to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM') = $2) as counted,
            (select monthly_budget_paise::int from schools where school_id = $1) as limit_now,
            (select count(*)::int from schools where is_test_fixture = false) as live_schools,
            (select count(*)::int from audit_log where event_action = 'messaging_cost.exported' and actor_user_id = $3 and school_id is null and target_id = $2 and after_state ->> 'month' = $2 and not (after_state::text ~ 'Illustrative')) as audited`,
    [SCHOOL, month, PEOPLE.founder.sub]
  );
  await clearCostMonth();
  if (costMonthLimitBefore !== undefined) await db.pg.query(`update schools set monthly_budget_paise = $2 where school_id = $1`, [SCHOOL, costMonthLimitBefore]);
  const r = rows[0];
  const seen = costMonthSeen ?? {};
  // Counted by hand: four delivered messages of last month at 130 paise each. The one at ten past midnight is this
  // month's. With the one on its way, 650 paise counts against the limit. The limit set now is the 9 rupees typed.
  if (r.spent !== 520 || r.counted !== 650 || r.limit_now !== 900 || r.audited < 1) throw new Error(`messaging cost by month, in the database: ${JSON.stringify(r)}`);
  // Last month's row: judged against the 7 rupees in force at its end, not the 9 set today. 6.50 of it is counted
  // (5.20 spent and 1.30 on its way), and it held one message back.
  const mine = (seen.rows ?? []).find((cells) => cells[0] === 'Illustrative Public School');
  if (JSON.stringify(mine) !== JSON.stringify(['Illustrative Public School', '₹7.00', '₹5.20', '4', '1', '₹1.30', '₹6.50', '1', '0', 'Limit held messages back'])) throw new Error(`messaging cost by month, the school's row on the screen: ${JSON.stringify(seen.rows)}`);
  // The limit set on the screen was in this month's list above the form the moment the screen said so.
  if (seen.limitAbove !== '₹9.00' || !/^Limit ₹9\.00\./.test(seen.limitBelow ?? '')) throw new Error(`messaging cost by month, the limit in the two halves of the page: ${JSON.stringify({ above: seen.limitAbove, below: seen.limitBelow })}`);
  // After a step by a link, the month switch names the month in the address.
  if (JSON.stringify([seen.pickerEarlier, seen.pickerLater]) !== JSON.stringify([[`?month=${month}`, month], [`?month=${seen.thisMonth}`, seen.thisMonth]])) throw new Error(`messaging cost by month, the month switch after "Earlier month" and "Later month": ${JSON.stringify({ earlier: seen.pickerEarlier, later: seen.pickerLater })}`);
  if (seen.address !== `?month=${month}` || JSON.stringify(seen.flags) !== '["held"]' || seen.sentences !== 1 || seen.limitNote !== 1 || seen.later !== 1 || seen.history?.[5] !== '₹5.20') throw new Error(`messaging cost by month, on the screen: ${JSON.stringify({ ...seen, file: undefined })}`);
  // The file has the rows on the screen: the same schools in the same order, each amount the same number.
  const lines = (seen.file ?? '').replace(/^﻿/, '').split('\r\n').filter(Boolean).slice(1);
  const onScreen = (seen.rows ?? []).map((cells) => [month, ...cells.map((c) => c.replace(/[₹,]/g, ''))].join(','));
  if (seen.fileName !== `messaging-cost-${month}.csv` || lines.length !== r.live_schools || JSON.stringify(lines) !== JSON.stringify(onScreen) || !lines.includes(`${month},Illustrative Public School,7.00,5.20,4,1,1.30,6.50,1,0,Limit held messages back`)) throw new Error(`messaging cost by month, the file: ${JSON.stringify({ fileName: seen.fileName, lines, onScreen })}`);
};
// p5-8f end
// p5-8g begin
// Control → Monitoring (C206): the page is read as it stands; then one of each thing that can stop is put in for the
// seeded school (a dead job whose error carries the guardian's address and number and quotes a message, a stuck
// job, a job due 25 minutes ago, a refused notice, an uncertain send, a failed one whose reason carries the number,
// a message held for want of a template, a reply held past its day, and a due on record for six days with no fee
// run yesterday) and it is read again: each must be on the page, by count, by school and by reason, with no name,
// number, address or message words anywhere on it. The founder then retries the dead job on the screen. The check
// reads the database, compares, and takes every row out again.
let monitoringSeen = null;
const MONITORING_KEY = 'harness-8g';
const MONITORING_OTHER_SCHOOL = 'b0000000-0000-4000-8000-000000000002';
const MONITORING_GUARDIAN = '00000000-0000-4000-8000-0000000e0001';
const clearMonitoring = async () => {
  await db.pg.exec(`set session_replication_role = replica;
    delete from audit_log where event_action = 'job.retry' and target_id::text in (select job_id::text from jobs where idempotency_key like '${MONITORING_KEY}-%');
    delete from jobs where idempotency_key like '${MONITORING_KEY}-%';
    delete from webhook_events where payload_hash like '${MONITORING_KEY}-%';
    delete from communication_log where dedupe_key like '${MONITORING_KEY}-%';
    delete from held_inbound where provider_message_id like '${MONITORING_KEY}-%';
    delete from fees_ledger where gateway_order_id = '${MONITORING_KEY}-due';
    set session_replication_role = origin;`);
};
const readMonitoring = async (page) => ({
  facts: Object.fromEntries(await page.locator('[data-monitoring-fact]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-monitoring-fact'), Number(e.querySelector('dd').textContent.replace(/,/g, ''))]))),
  states: Object.fromEntries(await page.locator('[data-monitoring-section]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-monitoring-section'), e.getAttribute('data-monitoring-state')]))),
  groups: Object.fromEntries(await page.locator('[data-monitoring-group]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-monitoring-group'), e.textContent]))),
  missing: await page.locator('[data-monitoring-missing-school]').allTextContents(),
  todo: await page.locator('[data-monitoring-do]').evaluateAll((els) => els.map((e) => e.getAttribute('data-monitoring-do'))),
  text: await page.locator('[data-monitoring]').innerText(),
});
const monitoringProblems = async (page) => {
  await clearMonitoring();
  monitoringSeen = null;
  await page.reload({ waitUntil: 'networkidle' });
  const before = await readMonitoring(page);
  const message = (n, status, code, reason, ago) =>
    `('${SCHOOL}', '+919800000001', 'whatsapp', 'class_notice', 'utility', false, 0, 0, 'not_billable', '${status}', '${MONITORING_KEY}-${n}', 'platform_default', 'operational_communication', 'meta', '${STUDENT}', '${MONITORING_GUARDIAN}',
      '{"guardian": "Rajesh Example", "child": "Aarav Example A", "note": "harness-8g words: please bring the notebook"}', ${code}, '${reason}', now() - interval '${ago}')`;
  await db.pg.exec(`
    insert into jobs (type, idempotency_key, status, attempts, max_attempts, last_error, completed_at, updated_at) values
      ('harness.probe', '${MONITORING_KEY}-dead', 'dead', 8, 8, 'Mailbox rajesh@example.invalid rejected "Aarav was absent"; try +91 98000 00001', now() - interval '2 hours', now() - interval '2 hours');
    insert into jobs (type, idempotency_key, status, attempts, locked_until, updated_at) values ('harness.probe', '${MONITORING_KEY}-stuck', 'running', 1, now() - interval '20 minutes', now() - interval '25 minutes');
    insert into jobs (type, idempotency_key, status, next_run_at) values ('harness.probe', '${MONITORING_KEY}-late', 'pending', now() - interval '25 minutes');
    insert into webhook_events (provider, payload_hash, payload, signature_ok, outcome, processed_at, created_at) values
      ('whatsapp', '${MONITORING_KEY}-refused', '{"provider": "meta", "bytes": 412}', false, 'refused: bad signature', now(), now() - interval '3 hours');
    insert into communication_log (school_id, to_phone, channel, template_name, billing_category, billable, est_cost_paise, gst_paise, cost_basis, status, dedupe_key, provider_used, purpose, provider, student_id, parent_id,
                                   template_params, failure_code, reason, created_at) values
      ${message(1, 'uncertain', 'null', 'the send was interrupted and nobody knows whether it went; it is not sent again, so that a parent is never messaged twice', '1 hour')},
      ${message(2, 'failed', `'131026'`, 'Recipient +91 98000 00001 (rajesh@example.invalid) is not on WhatsApp', '2 hours')},
      ${message(3, 'blocked_no_template', 'null', 'template "class_notice" is not an approved template for this school', '3 hours')};
    insert into held_inbound (provider, provider_message_id, phone_digest, school_ids, ciphertext, iv, tag, key_version, received_at, expires_at, status) values
      ('meta', '${MONITORING_KEY}-held', repeat('a', 64), array['${SCHOOL}', '${MONITORING_OTHER_SCHOOL}']::uuid[], 'aGFybmVzcy04Zy1zZWFsZWQ=', repeat('A', 16), repeat('B', 24), 1, now() - interval '30 hours', now() - interval '6 hours', 'held');
    insert into fees_ledger (school_id, student_id, gross_minor, concession_minor, amount_minor, due_date, gateway_order_id, created_at) values
      ('${SCHOOL}', '${STUDENT}', 100000, 0, 100000, (now() at time zone 'Asia/Kolkata')::date + 30, '${MONITORING_KEY}-due', now() - interval '6 days');`);
  await page.reload({ waitUntil: 'networkidle' });
  const after = await readMonitoring(page);
  const dead = (await db.pg.query(`select job_id from jobs where idempotency_key = $1`, [`${MONITORING_KEY}-dead`])).rows[0].job_id;
  const line = page.locator(`[data-monitoring-job="${dead}"]`);
  const errorShown = await line.locator('[data-monitoring-job-error]').textContent();
  // Retry: the job runs again at once. Nothing handles this made-up type, so it is dead again, one attempt later.
  await line.locator('[data-job-retry]').click();
  await page.waitForFunction((id) => /9 of 9/.test(document.querySelector(`[data-monitoring-job="${id}"]`)?.textContent ?? ''), dead, { timeout: 20000 });
  monitoringSeen = { before, after, dead, errorShown, afterRetry: await line.textContent() };
  await page.evaluate(() => window.scrollTo(0, 0));
};
const monitoringProblemsDone = async () => {
  const seen = monitoringSeen ?? {};
  const { rows } = await db.pg.query(
    `select (select status || ':' || attempts || ':' || max_attempts from jobs where idempotency_key = $1) as dead_job,
            (select count(*)::int from audit_log where event_action = 'job.retry' and target_id::text = $2 and actor_user_id = $3) as retried`,
    [`${MONITORING_KEY}-dead`, seen.dead ?? '', PEOPLE.founder.sub]
  );
  await clearMonitoring();
  const r = rows[0];
  const { before = { facts: {}, missing: [] }, after = { facts: {}, states: {}, groups: {}, missing: [], todo: [], text: '' } } = seen;
  // Each thing put in is on the page: one more than before, whatever other screens left behind.
  const more = Object.fromEntries(['jobs.dead', 'jobs.stuck', 'jobs.due', 'notices.received', 'notices.refused', 'replies.held', 'replies.past'].map((k) => [k, after.facts[k] - before.facts[k]]));
  if (Object.values(more).some((d) => d !== 1)) throw new Error(`monitoring, the counts on the screen: ${JSON.stringify({ more, before: before.facts, after: after.facts })}`);
  const school = 'Illustrative Public School';
  const bySchool = new RegExp(`${school}: \\d+ message`);
  if (!bySchool.test(after.groups.uncertain ?? '') || !after.groups['failed:131026']?.includes('Recipient <phone> (<email>) is not on WhatsApp') || !bySchool.test(after.groups['held:blocked_no_template'] ?? ''))
    throw new Error(`monitoring, the messages that did not go: ${JSON.stringify(after.groups)}`);
  if (before.missing.includes(school) || !after.missing.includes(school)) throw new Error(`monitoring, the school with no fee run yesterday: ${JSON.stringify({ before: before.missing, after: after.missing })}`);
  const flagged = ['health', 'jobs', 'notices', 'sends', 'replies', 'nightly'].filter((s) => after.states[s] !== 'look');
  const told = ['health', 'jobs.dead', 'jobs.stuck', 'notices.refused', 'sends.uncertain', 'sends.failed', 'sends.blocked_no_template', 'replies.past', 'nightly.missing'].filter((d) => !after.todo.includes(d));
  if (flagged.length || told.length) throw new Error(`monitoring, sections not flagged: ${JSON.stringify(flagged)}; no line on what to do for: ${JSON.stringify(told)}`);
  // The error is shown only after the address, the number and the quoted words are cut out of it.
  if (seen.errorShown !== 'Mailbox <email> rejected "<value>"; try <phone>') throw new Error(`monitoring, the dead job's error: ${JSON.stringify(seen.errorShown)}`);
  // Nothing of the family is anywhere on the page: not the names, the number, the address, the words, the sealed reply.
  const shown = ['Rajesh', 'Aarav', '9800000001', '98000 00001', 'example.invalid', 'please bring', 'harness-8g words', 'aGFybmVzcy04Zy1zZWFsZWQ='].filter((s) => after.text.includes(s));
  if (shown.length || !after.text.includes(school)) throw new Error(`monitoring, on the page: ${JSON.stringify(shown)}`);
  // The founder's Retry ran the job again (it died again: no handler for a made-up type) and was audited.
  if (r.dead_job !== 'dead:9:9' || r.retried !== 1 || !/9 of 9/.test(seen.afterRetry ?? '')) throw new Error(`monitoring, the retry: ${JSON.stringify({ ...r, afterRetry: seen.afterRetry })}`);
};
// p5-8g end
// p5-8h begin
// Reports (docs/26 slice 8h, C207). The principal opens Reports on the seeded school after four receipts are
// added (the seed has none): the list must hold all eight reports; "Daily collection" is opened and its CSV asked
// for over HTTP; then "Attendance by class" for 30 days, which is the picture. What the screen said is kept and
// the check compares it with the database: the totals of both reports, the file's lines against the rows on the
// screen, and one audit row for the one download. The receipts and the audit row are then taken out again.
// "Days marked" in the total row must be the days the school has a mark on, not the classes' days added up.
// The harness has no accountant, so the second screen adds one for its own run: an accountant's account is put
// in, the same browser is signed in as that person, and the list must hold the two fee reports and nothing about
// learning; a learning report asked for by its address must be refused. Then the account is removed and the
// principal's session put back.
const R8H = '00000000-0000-4000-8000-00000081800';
const reportNumber = (text) => Number(String(text ?? '').replace(/[^\d.]/g, ''));
const reportTotals = (page) => page.locator('[data-report-total] [data-total-cell]').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.getAttribute('data-total-cell'), (e.querySelector('span:last-child') ?? e).textContent.trim()])));
const reportOpen = async (page, id) => {
  await page.locator(`[data-report-item="${id}"]`).click();
  await page.locator(`[data-report="${id}"][data-report-state="shown"]`).waitFor({ timeout: 30000 });
};
const clearReportRows = async () => {
  await db.pg.exec(`set session_replication_role = replica;
    delete from receipts where receipt_no like 'H8H-%';
    delete from audit_log where event_action = 'report.exported';
    delete from memberships where membership_id = '${R8H}2'; delete from users where user_id = '${R8H}1';
    set session_replication_role = origin;`);
};
let reportsSeen = null;
const reportsScreen = async (page) => {
  await clearReportRows();
  // Today 1,200.50 in cash; two days ago 800 by UPI; five days ago 2,500 by cheque; three days ago 300 in cash, reversed since.
  const receipt = (no, minor, method, back, reversed) => db.pg.query(
    `insert into receipts (school_id, receipt_no, student_id, total_minor, method, issued_by, issued_at, reversed_at, reversed_by, reversal_reason)
     values ($1, $2, $3, $4, $5, $6, now() - $7 * interval '1 day', ${reversed ? `now(), $6, 'Harness 8h: entered twice.'` : 'null, null, null'})`,
    [SCHOOL, no, STUDENT, minor, method, PEOPLE.principal.sub, back]
  );
  await receipt('H8H-1', 120050, 'cash', 0, false);
  await receipt('H8H-2', 80000, 'upi', 2, false);
  await receipt('H8H-3', 250000, 'cheque', 5, false);
  await receipt('H8H-4', 30000, 'cash', 3, true);
  await page.reload({ waitUntil: 'networkidle', timeout: 90000 });
  await page.locator('[data-report-list] [data-report-item]').first().waitFor({ timeout: 30000 });
  const listed = await page.locator('[data-report-item]').evaluateAll((els) => els.map((e) => e.getAttribute('data-report-item')));
  const groups = await page.locator('[data-report-group]').evaluateAll((els) => els.map((e) => e.getAttribute('data-report-group')));
  const choose = await page.locator('[data-report-choose]').count();
  // The collection report, for 30 days (the range the screen opens on), and its file.
  await reportOpen(page, 'daily-collection');
  const collection = { range: await page.locator('[data-report-range-id="30d"]').getAttribute('aria-pressed'), days: await page.locator('[data-report-days]').getAttribute('data-report-days'), rows: await page.locator('[data-report-row]').count(), said: Number(await page.locator('[data-report-row-count]').getAttribute('data-report-row-count')), total: await reportTotals(page), href: await page.locator('[data-report-export]').getAttribute('href') };
  const before = Number((await db.pg.query(`select count(*)::int as n from audit_log where school_id = $1 and event_action = 'report.exported'`, [SCHOOL])).rows[0].n);
  const res = await page.request.get(base + collection.href);
  const file = { status: res.status(), type: res.headers()['content-type'] ?? '', lines: (await res.text()).trim().split('\r\n') };
  const audit = (await db.pg.query(`select actor_role::text as role, after_state from audit_log where school_id = $1 and event_action = 'report.exported' order by audit_id`, [SCHOOL])).rows;
  // Seven days, by its button: the table is worked out again and the address says so.
  const daysShown = (same) => page.waitForFunction(([month, want]) => document.querySelector('[data-report="daily-collection"]')?.getAttribute('data-report-state') === 'shown' && (document.querySelector('[data-report-days]')?.getAttribute('data-report-days') === month) === want, [collection.days, same], { timeout: 30000 });
  await page.locator('[data-report-range-id="7d"]').click();
  await daysShown(false);
  const week = { pressed: await page.locator('[data-report-range-id="7d"]').getAttribute('aria-pressed'), address: page.url().replace(base, ''), rows: await page.locator('[data-report-row]').count(), total: await reportTotals(page) };
  // Attendance by class, back on 30 days: the picture.
  await page.locator('[data-report-range-id="30d"]').click();
  await daysShown(true);
  await reportOpen(page, 'attendance-by-class');
  const attendance = { days: await page.locator('[data-report-days]').getAttribute('data-report-days'), classes: await page.locator('[data-report-row] th').allTextContents(), total: await reportTotals(page), address: page.url().replace(base, '') };
  await page.locator('[data-report-why] summary').click();
  const why = (await page.locator('[data-report-why]').textContent()) ?? '';
  reportsSeen = { listed, groups, choose, collection, file, audits: audit.length - before, audit: audit[audit.length - 1], week, attendance, why };
};
const reportsScreenDone = async () => {
  const s = reportsSeen;
  const days = (back) => `(issued_at at time zone 'Asia/Kolkata')::date between ${TODAY_SQL} - ${back} and ${TODAY_SQL}`;
  const money = async (back) => (await db.pg.query(`select count(*) filter (where reversed_at is null)::int as receipts, coalesce(sum(total_minor) filter (where reversed_at is null), 0)::bigint as minor, count(*) filter (where reversed_at is not null)::int as reversed, count(distinct (issued_at at time zone 'Asia/Kolkata')::date)::int as days from receipts where school_id = $1 and ${days(back)}`, [SCHOOL])).rows[0];
  const [month, week] = [await money(29), await money(6)];
  const marks = (await db.pg.query(`select count(*) filter (where status = 'present')::int as present, count(*) filter (where status = 'late')::int as late, count(*) filter (where status = 'absent')::int as absent, count(*) filter (where status = 'leave')::int as leave, count(*)::int as marks, count(distinct class_id)::int as classes, count(distinct date)::int as days, (select coalesce(sum(d), 0)::int from (select count(distinct date) as d from attendance where school_id = $1 and date between ${TODAY_SQL} - 29 and ${TODAY_SQL} group by class_id) x) as class_days from attendance where school_id = $1 and date between ${TODAY_SQL} - 29 and ${TODAY_SQL}`, [SCHOOL])).rows[0];
  await clearReportRows();
  if (!s) throw new Error('the reports screen was not read');
  const problems = [];
  if (s.listed.join() !== 'daily-collection,dues,attendance-by-class,absentees,homework-coverage,pulse-coverage,messages-by-state,staff-leave') problems.push(`the principal's list: ${s.listed.join()}`);
  if (s.groups.join() !== 'money,learning,parents,staff' || s.choose !== 1) problems.push(`groups ${s.groups.join()}, "choose a report" shown ${s.choose} times`);
  // Daily collection against the receipts table: 4,500.50 in three receipts over three days, and one reversed (a day of its own).
  const c = s.collection;
  if (c.range !== 'true' || c.rows !== c.said || c.rows !== Number(month.days)) problems.push(`collection: ${c.rows} rows on screen, ${c.said} said, ${month.days} days with a receipt (30 days pressed: ${c.range})`);
  if (reportNumber(c.total.receipts) !== month.receipts || Math.round(reportNumber(c.total.amount) * 100) !== Number(month.minor) || reportNumber(c.total.reversed) !== month.reversed) problems.push(`collection total on screen ${c.total.receipts} receipts, ${c.total.amount}, ${c.total.reversed} reversed; the database has ${month.receipts}, ${month.minor} paise, ${month.reversed}`);
  if (month.receipts !== 3 || Number(month.minor) !== 450050 || month.reversed !== 1) problems.push(`the receipts added are not the ones counted: ${JSON.stringify(month)}`);
  if (Math.round((reportNumber(c.total.cash) + reportNumber(c.total.upi) + reportNumber(c.total.cheque) + reportNumber(c.total.card) + reportNumber(c.total.netbanking) + reportNumber(c.total.online)) * 100) !== Number(month.minor)) problems.push(`the methods do not add up to the amount: ${JSON.stringify(c.total)}`);
  // The file: the heading, one line a row on the screen, the total; asked for with the very days on the screen.
  if (s.file.status !== 200 || !/text\/csv/.test(s.file.type) || s.file.lines.length !== c.rows + 2) problems.push(`the file answered ${s.file.status} ${s.file.type} with ${s.file.lines.length} lines for ${c.rows} rows`);
  if (!s.file.lines[s.file.lines.length - 1]?.startsWith(`Total,${month.receipts},${Number(month.minor) / 100},`)) problems.push(`the file's total line: ${s.file.lines[s.file.lines.length - 1]}`);
  if (c.href !== `/api/app/reports/daily-collection/export?from=${c.days.split('/')[0]}&to=${c.days.split('/')[1]}`) problems.push(`export link ${c.href} for the days ${c.days}`);
  if (s.audits !== 1 || s.audit?.role !== 'principal' || s.audit?.after_state?.report !== 'daily-collection' || s.audit?.after_state?.rows !== c.rows || Object.keys(s.audit?.after_state ?? {}).sort().join() !== 'from,language,period,report,rows,to') problems.push(`${s.audits} audit rows for one download: ${JSON.stringify(s.audit?.after_state)}`);
  if (s.week.pressed !== 'true' || s.week.address !== '/app/reports?report=daily-collection&range=7d') problems.push(`7 days pressed: ${s.week.pressed}, the address is ${s.week.address}`);
  if (s.week.rows !== Number(week.days) || Math.round(reportNumber(s.week.total.amount) * 100) !== Number(week.minor)) problems.push(`7 days: ${s.week.rows} rows and ${s.week.total.amount} on screen; the database has ${week.days} days and ${week.minor} paise`);
  // Attendance by class against the attendance table.
  const a = s.attendance;
  const rate = Math.round(((marks.present + marks.late) / marks.marks) * 1000) / 10;
  if (a.classes.join() !== '5-A,5-B,6-A' || a.classes.length !== marks.classes) problems.push(`classes on screen: ${a.classes.join()} (${marks.classes} have marks)`);
  for (const k of ['present', 'late', 'absent', 'leave']) if (reportNumber(a.total[k]) !== marks[k]) problems.push(`${k}: ${a.total[k]} on screen, ${marks[k]} in the database`);
  if (reportNumber(a.total.rate) !== rate) problems.push(`in school ${a.total.rate} on screen, ${rate} by the rule`);
  // "Days marked" in the total row is the days the school has a mark on (a day three classes were marked on is one
  // day), never the classes' days added up. The seed marks its classes on the same days, so the two differ.
  if (reportNumber(a.total.days) !== marks.days || marks.days === 0 || marks.class_days <= marks.days) problems.push(`days marked: ${a.total.days} in the total row; the school has marks on ${marks.days} days (the classes' days add up to ${marks.class_days})`);
  if (!/“Days marked” in the total row is not the classes added up/.test(s.why)) problems.push(`"Why this?" does not say how the days are counted: ${s.why.slice(0, 300)}`);
  if (!a.address.startsWith('/app/reports?report=attendance-by-class&range=30d')) problems.push(`the address is ${a.address}`);
  if (!/Rule version 1\./.test(s.why) || !/Read from: attendance marks, classes\./.test(s.why)) problems.push(`"Why this?" says: ${s.why.slice(0, 200)}`);
  reportsSeen = null;
  if (problems.length) throw new Error(`reports: ${problems.join('; ')}`);
};
let accountantSeen = null;
let principalCookies = [];
const reportsAsAccountant = async (page) => {
  await clearReportRows();
  await db.pg.query(`insert into users (user_id, school_id, email, role, display_name) values ($1, $2, 'accounts@example.invalid', 'accountant', 'Anil Example')`, [`${R8H}1`, SCHOOL]);
  await db.pg.query(`insert into memberships (membership_id, user_id, school_id, role) values ($1, $2, $3, 'accountant')`, [`${R8H}2`, `${R8H}1`, SCHOOL]);
  principalCookies = (await page.context().cookies()).filter((c) => c.name === 'nca_access' || c.name === 'nca_tours');
  const cookie = await cookieFor({ sub: `${R8H}1`, role: 'accountant', schoolId: SCHOOL, membershipId: `${R8H}2` }, secret);
  await page.context().addCookies([
    { name: 'nca_access', value: cookie, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' },
    { name: 'nca_tours', value: `${R8H}1.${TOUR_IDS.join(',')}`, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' },
  ]);
  await page.goto(`${base}/app/reports`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.locator('[data-report-list] [data-report-item]').first().waitFor({ timeout: 30000 });
  const listed = await page.locator('[data-report-item]').evaluateAll((els) => els.map((e) => e.getAttribute('data-report-item')));
  const groups = await page.locator('[data-report-group]').evaluateAll((els) => els.map((e) => e.getAttribute('data-report-group')));
  // By their addresses: a learning report's rows and its file are refused; a fee report is answered.
  const asked = {};
  for (const address of ['absentees', 'attendance-by-class', 'homework-coverage', 'staff-leave', 'absentees/export', 'dues']) asked[address] = (await page.request.get(`${base}/api/app/reports/${address}`)).status();
  await reportOpen(page, 'dues');
  const dues = { rows: await page.locator('[data-report-row]').count(), total: await reportTotals(page), now: await page.locator('[data-report-now]').count(), range: await page.locator('[data-report-range]').count(), text: (await page.locator('[data-report="dues"]').textContent()) ?? '' };
  accountantSeen = { listed, groups, asked, dues };
};
const reportsAsAccountantDone = async (page) => {
  const s = accountantSeen;
  // Overdue by the rule (its date has passed in India and something is still owed), counted here by hand: the seed keeps no payments.
  const owed = (await db.pg.query(`select count(*)::int as entries, coalesce(sum(amount_minor), 0)::bigint as minor, count(distinct student_id)::int as students from fees_ledger where school_id = $1 and (status::text = 'overdue' or (status::text in ('pending', 'partial') and due_date < ${TODAY_SQL}))`, [SCHOOL])).rows[0];
  const exported = Number((await db.pg.query(`select count(*)::int as n from audit_log where school_id = $1 and event_action = 'report.exported'`, [SCHOOL])).rows[0].n);
  // The principal is signed in again, and the accountant's account is removed.
  await page.context().addCookies(principalCookies.map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, httpOnly: c.httpOnly, sameSite: c.sameSite })));
  await clearReportRows();
  if (!s) throw new Error('the accountant’s reports screen was not read');
  const problems = [];
  if (s.listed.join() !== 'daily-collection,dues' || s.groups.join() !== 'money') problems.push(`the accountant's list: ${s.listed.join()} in ${s.groups.join()}`);
  if (s.asked.absentees !== 403 || s.asked['attendance-by-class'] !== 403 || s.asked['homework-coverage'] !== 403 || s.asked['staff-leave'] !== 403 || s.asked['absentees/export'] !== 403 || s.asked.dues !== 200) problems.push(`asked by address: ${JSON.stringify(s.asked)}`);
  if (exported !== 0) problems.push(`${exported} audit rows though no file was given`);
  if (s.dues.rows !== owed.students || reportNumber(s.dues.total.entries) !== owed.entries || Math.round(reportNumber(s.dues.total.owed) * 100) !== Number(owed.minor) || owed.entries === 0) problems.push(`dues on screen: ${s.dues.rows} rows, ${s.dues.total.entries} entries, ${s.dues.total.owed}; the database has ${owed.students} students, ${owed.entries} entries, ${owed.minor} paise`);
  if (s.dues.now !== 1 || s.dues.range !== 0) problems.push(`a report about now shows its days chooser ${s.dues.range} times`);
  if (/attendance|homework|present|absent/i.test(s.dues.text)) problems.push('the dues report says something about learning');
  accountantSeen = null;
  if (problems.length) throw new Error(`reports as the accountant: ${problems.join('; ')}`);
};
// The same screen in Hindi, opened straight on a report by its address (a report can be bookmarked): the absentees
// of 30 days. The rows on the screen must be the students marked absent, in the order of class and name, with
// the days of each; never in the order of the days.
let absenteesSeen = null;
const reportsHindi = async (page) => {
  await speak('हिन्दी')(page);
  await page.locator('[data-report="absentees"][data-report-state="shown"] [data-report-total]').waitFor({ timeout: 30000 });
  absenteesSeen = {
    title: ((await page.locator('[data-report="absentees"] h2').textContent()) ?? '').trim(),
    download: ((await page.locator('[data-report-export]').textContent()) ?? '').trim(),
    pressed: await page.locator('[data-report-item="absentees"]').getAttribute('aria-pressed'),
    total: await reportTotals(page),
    rows: await page.locator('[data-report-row]').evaluateAll((els) => els.map((e) => [e.querySelector('th').textContent.trim(), e.querySelector('[data-cell="student"] span:last-child').textContent.trim(), Number(e.querySelector('[data-cell="days"] span:last-child').textContent)])),
  };
};
const reportsHindiDone = async (page) => {
  const s = absenteesSeen;
  const absent = (await db.pg.query(
    `select c.name as class, st.name as student, count(*)::int as days
       from attendance a join students st on st.student_id = a.student_id join classes c on c.class_id = a.class_id
      where a.school_id = $1 and a.status = 'absent' and a.date between ${TODAY_SQL} - 29 and ${TODAY_SQL}
      group by c.name, c.section, a.class_id, st.name, a.student_id order by c.name, c.section, a.class_id, st.name, a.student_id`,
    [SCHOOL]
  )).rows.map((r) => [r.class, r.student, r.days]);
  await backToEnglish(page);
  if (!s) throw new Error('the Hindi reports screen was not read');
  const problems = [];
  if (s.title !== 'अनुपस्थित विद्यार्थी' || s.download !== 'CSV डाउनलोड करें' || s.pressed !== 'true') problems.push(`in Hindi the report is "${s.title}", its button "${s.download}", chosen in the list: ${s.pressed}`);
  if (JSON.stringify(s.rows) !== JSON.stringify(absent) || absent.length === 0) problems.push(`absentees on screen ${JSON.stringify(s.rows).slice(0, 200)}; the database, by class and name, has ${JSON.stringify(absent).slice(0, 200)}`);
  if (reportNumber(s.total.days) !== absent.reduce((n, r) => n + r[2], 0)) problems.push(`the total says ${s.total.days} days absent; the rows add up to ${absent.reduce((n, r) => n + r[2], 0)}`);
  absenteesSeen = null;
  if (problems.length) throw new Error(`reports in Hindi: ${problems.join('; ')}`);
};
// p5-8h end
// p5-8i begin
// School Health Auditor v1 (C208). A brand-new school's first visit: no check-up yet, and what one does. Then the
// principal runs the day's first check-up on the illustrative school, sees the checks that need attention with their
// counts, follows the consent check to the list of the students waiting for consent (exactly those it counted) and
// comes back. The check reads the day's row in school_health_runs, holds it to what the screen said and to the
// school's own rows, and takes it away; the audit row stays (the log is never cut) and is counted from where it stood.
const AUDITOR_WAITING = ['Dev Example B', 'Kiara Example B', 'Neel Example B'];
const clearHealthRuns = () => db.pg.query(`delete from school_health_runs where school_id = $1`, [SCHOOL]);
const auditorAudit = async () => (await db.pg.query(`select count(*)::int as n from audit_log where event_action = 'school_health.checked'`)).rows[0].n;
let auditorAuditBefore = 0;
let auditorSeen = null;
const auditorFirst = async (page) => {
  await clearHealthRuns();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-auditor="empty"] [data-auditor-run]').waitFor({ timeout: 20000 });
};
const auditorRun = async (page) => {
  await clearHealthRuns();
  auditorAuditBefore = await auditorAudit();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-auditor="empty"] [data-auditor-run]').click();
  await page.locator('[data-auditor="run"] [data-auditor-result]').waitFor({ timeout: 30000 });
  const result = (await page.locator('[data-auditor-result]').textContent()).trim();
  const attention = await page.locator('[data-auditor-section="attention"] [data-check]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-check'), Number(e.getAttribute('data-count'))]));
  // The consent check opens the students waiting for consent: the list of exactly the rows it counted.
  await page.locator('[data-check-fix="consent"]').click();
  // (Allow for the development server building Admissions the first time it is opened.)
  await page.waitForURL('**/app/admissions', { timeout: 90000 });
  await page.waitForLoadState('networkidle');
  // The list is drawn as a table on a wide screen and as cards on a phone: wait for the one that is shown.
  await page.waitForFunction((name) => document.body.innerText.includes(name), AUDITOR_WAITING[0], { timeout: 90000 });
  const opened = new URL(page.url()).pathname;
  const listed = await page.evaluate((names) => names.filter((n) => document.body.innerText.includes(n)).length, AUDITOR_WAITING);
  await page.goBack({ waitUntil: 'networkidle' });
  await page.locator('[data-auditor="run"] [data-auditor-result]').waitFor({ timeout: 30000 });
  // "Why this?" of the first check that needs attention, open for the picture.
  await page.locator('[data-auditor-section="attention"] [data-why] summary').first().click();
  auditorSeen = { result, attention, opened, listed, back: (await page.locator('[data-auditor-result]').textContent()).trim() };
};
const auditorRunDone = async () => {
  const { rows } = await db.pg.query(`select run_date = ${TODAY_SQL} as today, rule_version, passed, applicable, results, recorded_by from school_health_runs where school_id = $1`, [SCHOOL]);
  const held = (await db.pg.query(
    `select count(*)::int as n from communication_log where school_id = $1 and channel = 'whatsapp' and status::text like 'blocked_%' and created_at >= ((${TODAY_SQL} - 6)::timestamp at time zone 'Asia/Kolkata')`,
    [SCHOOL]
  )).rows[0].n;
  const audited = (await auditorAudit()) - auditorAuditBefore;
  await clearHealthRuns();
  const r = rows[0];
  if (rows.length !== 1 || !r.today || r.rule_version !== 1 || r.recorded_by !== PEOPLE.principal.sub || audited !== 1) throw new Error(`the check-up in the database: ${JSON.stringify({ rows: rows.length, ...r, audited })}`);
  const attention = r.results.filter((x) => x.state === 'needs_attention').map((x) => [x.id, x.count]);
  const count = (id) => attention.find(([x]) => x === id)?.[1] ?? 0;
  if (JSON.stringify(attention) !== JSON.stringify(auditorSeen.attention)) throw new Error(`what needs attention, on the screen ${JSON.stringify(auditorSeen.attention)} and kept ${JSON.stringify(attention)}`);
  if (auditorSeen.result !== `${r.passed} of ${r.applicable} checks pass` || auditorSeen.back !== auditorSeen.result) throw new Error(`the result: ${JSON.stringify(auditorSeen)} against ${r.passed} of ${r.applicable}`);
  // The illustrative school's own rows: 6-A has no class teacher; three students wait for consent, the three the
  // list showed; the message log holds the held messages of these seven days. No fee structure and no budget.
  const states = Object.fromEntries(r.results.map((x) => [x.id, x.state]));
  if (count('class_teacher') !== 1 || count('consent') !== AUDITOR_WAITING.length || auditorSeen.listed !== AUDITOR_WAITING.length || auditorSeen.opened !== '/app/admissions' || count('messages_held') !== held) throw new Error(`the counts: ${JSON.stringify({ attention, held, seen: auditorSeen })}`);
  if (states.fee_structure !== 'not_set_up' || states.message_budget !== 'not_set_up' || r.results.length !== 12) throw new Error(`not set up: ${JSON.stringify(states)}`);
};
// p5-8i end
// p5-8j begin
// Early Warning (C209). One child of 5-A was away on most days three weeks ago: the principal presses "Check now",
// the flag appears with what it rests on, "Why this?" is opened and what was done is written down. The numbers
// on the flag are compared with the child's own marks in the database. The child's guardians have numbers, the
// school's switch for telling parents is on and consent for it is given: still no message and no job is
// written. Then a teacher's screen: of two flags in the school she is shown the one of her own class, with no
// "Check now", and adds what she did. Everything put in is taken away after; the audit rows stay (the log is
// never cut) and are counted from where they stood.
// The check also says for how many students attendance could be used (those with ten counted days in the last
// thirty), which is compared with a count made in the database. And on the teacher's screen her own class's flag
// carries an attendance reason that a later check could not work out again: the flag says so, with its numbers.
const EW_CHILD_5B = '00000000-0000-4000-8000-000000500002';
const EW_CLASS_5B = '00000000-0000-4000-8000-0000000c0052';
const EW_OTHER_TEACHER = '00000000-0000-4000-8000-00000000a004';
const EW_FOLLOWUPS = ['00000000-0000-4000-8000-00000e5a0001', '00000000-0000-4000-8000-00000e5a0002'];
const clearEarlyWarning = () =>
  db.pg.exec(`set session_replication_role = replica;
    delete from early_warning_actions; delete from early_warning_flags;
    delete from attendance where school_id = '${SCHOOL}' and student_id = '${STUDENT}' and date < ${TODAY_SQL} - 10;
    delete from pulse_followups where followup_id in ('${EW_FOLLOWUPS.join("', '")}');
    delete from consent_ledger where school_id = '${SCHOOL}' and student_id = '${STUDENT}' and purpose = 'at_risk';
    update schools set at_risk_parent_dispatch_enabled = false where school_id = '${SCHOOL}';
    set session_replication_role = origin;`);
const earlyWarningAudit = async () => (await db.pg.query(`select count(*)::int as n from audit_log where event_action like 'early_warning.%'`)).rows[0].n;
let earlyWarningBefore = null;
let earlyWarningSeen = null;
const earlyWarningScreen = async (page) => {
  await clearEarlyWarning();
  // Eleven to twenty-two days back (before the seeded marks begin): away on eight days, on recorded leave on two,
  // in school on two. The parents could be written to, and everything that would let a message go is switched on.
  await db.pg.exec(`set session_replication_role = replica;
    insert into attendance (school_id, student_id, class_id, date, status, marked_by, leave_code)
      select '${SCHOOL}', '${STUDENT}', '${CLASS_5A}', ${TODAY_SQL} - g, case when g in (13, 14) then 'leave' when g in (11, 22) then 'present' else 'absent' end, '${PEOPLE.teacher.sub}', case when g in (13, 14) then 'sick' end
        from generate_series(11, 22) g;
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select '${SCHOOL}', '${STUDENT}', 'at_risk', true, (enum_range(null::consent_method))[1], 'v1';
    update schools set at_risk_parent_dispatch_enabled = true where school_id = '${SCHOOL}';
    set session_replication_role = origin;`);
  earlyWarningBefore = { sending: await sendingRows(), audit: await earlyWarningAudit() };
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-ew-check-now]').waitFor({ timeout: 20000 });
  const openBeforeCheck = await page.locator('[data-ew-flag="open"]').count();
  await page.locator('[data-ew-check-now]').click();
  const flag = page.locator('[data-ew-flag="open"]', { hasText: 'Aarav Example A' });
  await flag.waitFor({ timeout: 20000 });
  const checkNote = await page.locator('[data-ew-note]').getAttribute('data-ew-note');
  // Why this: what the flag rests on, the rule and its version.
  await flag.locator('[data-ew-why] summary').click();
  const why = await flag.locator('[data-ew-why]').innerText();
  // What was done, written by the principal.
  await flag.locator('[data-ew-add-open]').click();
  const saveNeedsAKind = await flag.locator('[data-ew-save]').isDisabled();
  await flag.locator('[data-ew-kind]').selectOption('spoke_to_guardian');
  await flag.locator('[data-ew-add] input').nth(0).fill('Spoke to his father at the school gate.');
  await flag.locator('[data-ew-add] input').nth(1).fill('He was unwell; he is back from Monday.');
  await flag.locator('[data-ew-save]').click();
  await flag.locator('[data-ew-action="spoke_to_guardian"]').waitFor({ timeout: 20000 });
  earlyWarningSeen = {
    openBeforeCheck,
    checkNote,
    reasons: await flag.getAttribute('data-ew-reasons'),
    line: await flag.locator('[data-ew-line="attendance"]').count(),
    whyHasEvidence: await flag.locator('[data-ew-evidence="attendance"]').count(),
    whySaysRule: why.includes('rule version 2') && why.includes('no AI model'),
    whySaysLeave: why.includes('Days on recorded leave, left out of the count: 2.'),
    saveNeedsAKind,
    logged: await flag.locator('[data-ew-action]').count(),
    openOnScreen: await page.locator('[data-ew-flag="open"]').count(),
    countedByClass: await page.locator('[data-ew-class-count]').evaluateAll((els) => els.reduce((n, e) => n + Number(e.getAttribute('data-ew-class-count')), 0)),
    lastCheck: await page.locator('[data-ew-last-check]').getAttribute('data-ew-last-check'),
    saysStaffOnly: (await page.locator('[data-ew-what]').innerText()).includes('Nothing on this page is sent to a parent'),
    attendanceUsed: await page.locator('[data-ew-attendance-used]').getAttribute('data-ew-attendance-used'),
  };
};
const earlyWarningScreenDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from early_warning_flags where school_id = $1 and resolved_at is null) as open,
            (select count(*)::int from early_warning_flags where school_id = $1 and student_id = $2 and class_id = $4 and resolved_at is null and reasons = '{attendance}' and rule_version = 2 and opened_by = $3 and not notified_parent) as flag,
            (select (evidence -> 'attendance') - 'absentDates' - 'from' - 'to' from early_warning_flags where school_id = $1 and student_id = $2 and resolved_at is null) as evidence,
            (select jsonb_build_object('present', count(*) filter (where status = 'present'), 'late', count(*) filter (where status = 'late'), 'absent', count(*) filter (where status = 'absent'), 'leave', count(*) filter (where status = 'leave'))
               from attendance where school_id = $1 and student_id = $2 and date between ${TODAY_SQL} - 29 and ${TODAY_SQL}) as marks,
            (select count(*)::int from early_warning_actions a join early_warning_flags f on f.flag_id = a.flag_id
              where f.student_id = $2 and a.kind = 'spoke_to_guardian' and a.by_user = $3 and a.note = 'Spoke to his father at the school gate.' and a.outcome = 'He was unwell; he is back from Monday.') as steps,
            (select count(*)::int from early_warning_actions) as steps_in_all,
            (select count(*)::int from early_warning_flags where notified_parent) as parents_told,
            (select count(*)::int from parents p join parent_student_map m on m.parent_id = p.parent_id where m.student_id = $2 and p.phone is not null) as guardians_with_a_number,
            (select at_risk_parent_dispatch_enabled from schools where school_id = $1) as switch_on,
            (select count(*)::int from consent_ledger where school_id = $1 and student_id = $2 and purpose = 'at_risk' and granted) as consent,
            (select count(*)::int from students where school_id = $1 and status = 'active' and class_id is not null) as active,
            (select count(*)::int from (select a.student_id from attendance a join students s on s.school_id = a.school_id and s.student_id = a.student_id
               where a.school_id = $1 and s.status = 'active' and s.class_id is not null and a.status <> 'leave' and a.date between ${TODAY_SQL} - 29 and ${TODAY_SQL}
               group by a.student_id having count(*) >= 10) judged) as attendance_used`,
    [SCHOOL, STUDENT, PEOPLE.principal.sub, CLASS_5A]
  );
  const after = { sending: await sendingRows(), audit: await earlyWarningAudit() };
  await clearEarlyWarning();
  const r = rows[0];
  const m = r.marks;
  const counted = m.present + m.late + m.absent;
  // The flag's own numbers are the child's marks of the last 30 days, with the days on leave left out.
  const evidence = { present: m.present, late: m.late, absent: m.absent, leave: m.leave, counted, rate: Math.round(((m.present + m.late) / counted) * 1000) / 10, below: 75, minDays: 10 };
  const same = (a, b) => JSON.stringify(Object.entries(a ?? {}).sort()) === JSON.stringify(Object.entries(b).sort());
  if (r.flag !== 1 || r.steps !== 1 || r.steps_in_all !== 1 || r.parents_told !== 0 || m.leave !== 2 || m.absent < 8 || !same(r.evidence, evidence)) throw new Error(`the flag in the database: ${JSON.stringify(r)}, by hand ${JSON.stringify(evidence)}`);
  // Everything that would let a message go was in place, and none was written: no message, no job.
  if (r.guardians_with_a_number < 1 || r.switch_on !== true || r.consent !== 1) throw new Error(`the parents could not have been written to anyway: ${JSON.stringify(r)}`);
  if (after.sending !== earlyWarningBefore.sending) throw new Error(`Early Warning wrote a message or queued a job: ${earlyWarningBefore.sending} before, ${after.sending} after`);
  // One check and one step, each on the record.
  if (after.audit - earlyWarningBefore.audit !== 2) throw new Error(`${after.audit - earlyWarningBefore.audit} audit rows for one check and one step`);
  // For how many students attendance could be used: the screen's own sentence against the count made above. The
  // flagged child is one of them, and it is not everyone (the other classes have fewer than ten days marked).
  if (r.attendance_used < 1 || r.active < 2) throw new Error(`attendance could be used for ${r.attendance_used} of ${r.active}: the screen has nothing to prove`);
  const seen = { openBeforeCheck: 0, checkNote: 'ok', reasons: 'attendance', line: 1, whyHasEvidence: 1, whySaysRule: true, whySaysLeave: true, saveNeedsAKind: true, logged: 1, openOnScreen: r.open, countedByClass: r.open, lastCheck: 'yes', saysStaffOnly: true, attendanceUsed: `${r.attendance_used}/${r.active}` };
  if (JSON.stringify(earlyWarningSeen) !== JSON.stringify(seen)) throw new Error(`Early Warning on the screen: ${JSON.stringify(earlyWarningSeen)}, wanted ${JSON.stringify(seen)}`);
};
// A teacher: the office's check has flagged a child of her class (5-A) and a child of 5-B. Each has an open
// follow-up in the needs-help queue, which is what the flags rest on.
let earlyWarningTeacherSeen = null;
const earlyWarningTeacher = async (page) => {
  await clearEarlyWarning();
  await db.pg.exec(`
    insert into pulse_followups (followup_id, school_id, student_id, class_id, kind, reason, created_by) values
      ('${EW_FOLLOWUPS[0]}', '${SCHOOL}', '${STUDENT}', '${CLASS_5A}', 'did_not_understand', 'Fractions on the number line', '${PEOPLE.teacher.sub}'),
      ('${EW_FOLLOWUPS[1]}', '${SCHOOL}', '${EW_CHILD_5B}', '${EW_CLASS_5B}', 'homework_help', 'Long division', '${EW_OTHER_TEACHER}');
    insert into early_warning_flags (school_id, student_id, class_id, reasons, evidence, rule_version, opened_by)
      select f.school_id, f.student_id, f.class_id, '{needs_help}', jsonb_build_object('needs_help', jsonb_build_object('open', jsonb_build_array(jsonb_build_object('kind', f.kind, 'since', (f.created_at at time zone 'Asia/Kolkata')::date::text, 'source', f.source)))), 1, '${PEOPLE.principal.sub}'
        from pulse_followups f where f.followup_id in ('${EW_FOLLOWUPS.join("', '")}');
    -- Her own class's flag also has an attendance reason from forty days back, which today's check could not work
    -- out again: nine counted days in the last thirty, and the rule needs ten. The reason is held, and says so.
    update early_warning_flags set reasons = '{attendance,needs_help}',
           evidence = evidence || jsonb_build_object('attendance', jsonb_build_object('from', (${TODAY_SQL} - 40)::text, 'to', (${TODAY_SQL} - 11)::text, 'present', 6, 'late', 1, 'absent', 5, 'leave', 0, 'counted', 12,
             'rate', 58.3, 'below', 75, 'minDays', 10, 'absentDates', jsonb_build_array((${TODAY_SQL} - 20)::text), 'held', jsonb_build_object('on', (${TODAY_SQL})::text, 'from', (${TODAY_SQL} - 29)::text, 'counted', 9, 'minDays', 10)))
     where school_id = '${SCHOOL}' and student_id = '${STUDENT}';`);
  earlyWarningBefore = { sending: await sendingRows(), audit: await earlyWarningAudit() };
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-early-warning="teacher"]').waitFor({ timeout: 20000 });
  const flag = page.locator('[data-ew-flag="open"]').first();
  await flag.waitFor({ timeout: 20000 });
  await flag.locator('[data-ew-why] summary').click();
  await flag.locator('[data-ew-add-open]').click();
  await flag.locator('[data-ew-kind]').selectOption('extra_help');
  await flag.locator('[data-ew-add] input').nth(0).fill('Ten minutes after class on the number line.');
  await flag.locator('[data-ew-save]').click();
  await flag.locator('[data-ew-action="extra_help"]').waitFor({ timeout: 20000 });
  const words = await page.locator('[data-early-warning]').innerText();
  earlyWarningTeacherSeen = {
    flags: await page.locator('[data-ew-flag="open"]').count(),
    own: words.includes('Aarav Example A'),
    otherClass: words.includes('Diya Example A'),
    checkNow: await page.locator('[data-ew-check-now]').count(),
    countedByClass: await page.locator('[data-ew-class-count]').evaluateAll((els) => els.map((e) => e.getAttribute('data-ew-class-count')).join()),
    whyHasEvidence: await flag.locator('[data-ew-evidence="needs_help"]').count(),
    logged: await flag.locator('[data-ew-action]').count(),
    // The held attendance reason: the days its numbers are from, and that it could not be checked again, with why.
    heldLines: await flag.locator('[data-ew-line="attendance"], [data-ew-line="attendance-held"]').count(),
    heldSaysWhy: /could not be checked again/.test(words) && /Days marked since [^:]+: 9; the rule needs 10\./.test(words) && words.includes('In school on 7 of 12 days marked from'),
  };
};
const earlyWarningTeacherDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from early_warning_flags where school_id = $1 and resolved_at is null) as flags,
            (select count(*)::int from early_warning_actions a join early_warning_flags f on f.flag_id = a.flag_id where f.student_id = $2 and a.kind = 'extra_help' and a.by_user = $3 and a.note = 'Ten minutes after class on the number line.' and a.outcome is null) as steps,
            (select count(*)::int from early_warning_actions) as steps_in_all`,
    [SCHOOL, STUDENT, PEOPLE.teacher.sub]
  );
  const after = { sending: await sendingRows(), audit: await earlyWarningAudit() };
  await clearEarlyWarning();
  if (JSON.stringify(rows[0]) !== JSON.stringify({ flags: 2, steps: 1, steps_in_all: 1 }) || after.sending !== earlyWarningBefore.sending || after.audit - earlyWarningBefore.audit !== 1) throw new Error(`a teacher's step in the database: ${JSON.stringify(rows[0])}, sending ${earlyWarningBefore.sending} then ${after.sending}, ${after.audit - earlyWarningBefore.audit} audit rows`);
  const seen = { flags: 1, own: true, otherClass: false, checkNow: 0, countedByClass: '1', whyHasEvidence: 1, logged: 1, heldLines: 2, heldSaysWhy: true };
  if (JSON.stringify(earlyWarningTeacherSeen) !== JSON.stringify(seen)) throw new Error(`Early Warning on a teacher's screen: ${JSON.stringify(earlyWarningTeacherSeen)}`);
};
// p5-8j end
// c210-rls begin
// A subject teacher's meeting (C210): Tara teaches 5-B in the timetable but is not its class teacher and has no
// subject of 5-B in her record, so 5-B's guardians are not hers to read. A meeting for 5-B that includes subject
// teachers gives her times; the office has booked a 5-B guardian with her. Her slot shows that guardian's name and
// the child's (ptm_booked_with_me), not "a guardian outside your classes' records"; she still reads no guardian's
// row. Everything is put back.
const C210_PTM = '00000000-0000-4000-8000-0000002100e1';
const C210_GUARDIAN = '00000000-0000-4000-8000-0000002100a1';
const C210_CLASS_5B = '00000000-0000-4000-8000-0000000c0052';
const C210_TANVI = '00000000-0000-4000-8000-00000000a004';
const clearSubjectPtm = async () => {
  await db.pg.exec(`set session_replication_role = replica; delete from ptm_bookings where ptm_id = '${C210_PTM}'; delete from ptm_slots where ptm_id = '${C210_PTM}'; delete from ptm_events where ptm_id = '${C210_PTM}'; delete from parent_student_map where parent_id = '${C210_GUARDIAN}'; delete from parents where parent_id = '${C210_GUARDIAN}'; set session_replication_role = origin;`);
};
let subjectPtmSeen = null;
const ptmSubjectTeacher = async (page) => {
  await clearSubjectPtm();
  const heldOn = new Date(Date.now() + 5.5 * 3600000 + 3 * 86400000).toISOString().slice(0, 10);
  await db.pg.query(`insert into parents (parent_id, school_id, name, phone, relation) values ($1, $2, 'Kavita Example', '9800000021', 'Mother')`, [C210_GUARDIAN, SCHOOL]);
  await db.pg.query(`insert into parent_student_map (school_id, parent_id, student_id) values ($1, $2, $3)`, [SCHOOL, C210_GUARDIAN, STUDENT_NO_GUARDIAN]);
  await db.pg.query(
    `insert into ptm_events (ptm_id, school_id, title, held_on, starts_at, ends_at, slot_minutes, class_ids, status, created_by, invited_by, invited_at, with_subject_teachers)
     values ($1, $2, 'Term meeting, 5-B', $3, '10:00', '10:30', 15, array[$4::uuid], 'invited', $5, $5, now(), true)`,
    [C210_PTM, SCHOOL, heldOn, C210_CLASS_5B, PEOPLE.principal.sub]
  );
  await db.pg.query(`insert into ptm_slots (school_id, ptm_id, teacher_id, starts_at) select $1, $2, t, s::time from unnest(array[$3::uuid, $4::uuid]) t cross join unnest(array['10:00', '10:15']) s`, [SCHOOL, C210_PTM, PEOPLE.teacher.sub, C210_TANVI]);
  await db.pg.query(
    `insert into ptm_bookings (school_id, ptm_id, slot_id, teacher_id, parent_id, booked_via, booked_by)
     select $1, $2, s.slot_id, s.teacher_id, $3, 'staff', $4 from ptm_slots s where s.ptm_id = $2 and s.teacher_id = $5 and s.starts_at = '10:00'`,
    [SCHOOL, C210_PTM, C210_GUARDIAN, PEOPLE.principal.sub, PEOPLE.teacher.sub]
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-ptm-meeting]').first().click();
  await page.locator('[data-ptm-slot="booked"]').waitFor({ timeout: 20000 });
  const booked = (await page.locator('[data-ptm-slot="booked"]').textContent()) ?? '';
  subjectPtmSeen = {
    teachers: await page.locator('[data-ptm-teacher]').count(),
    slots: await page.locator('[data-ptm-slot]').count(),
    named: booked.includes('Kavita Example') && booked.includes('Diya Example A'),
    hidden: booked.includes('outside your classes'),
    number: /[0-9]{7,}/.test(booked.replace(/\s/g, '')),
  };
};
const ptmSubjectTeacherDone = async () => {
  // In the teacher's own database session: the guardian's row is still not hers to read.
  const readable = await db.pg.transaction(async (tx) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', SCHOOL], ['app.current_role', 'teacher'], ['app.current_user_id', PEOPLE.teacher.sub]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return (await tx.query(`select count(*)::int as n from parents where parent_id = $1`, [C210_GUARDIAN])).rows[0].n;
  });
  const { rows } = await db.pg.query(`select count(*)::int as bookings, (count(*) filter (where attended is not null))::int as marked from ptm_bookings where ptm_id = $1`, [C210_PTM]);
  await clearSubjectPtm();
  if (readable !== 0 || rows[0].bookings !== 1 || rows[0].marked !== 0) throw new Error(`the subject teacher's meeting in the database: guardian rows she reads ${readable}, ${JSON.stringify(rows[0])}`);
  if (JSON.stringify(subjectPtmSeen) !== JSON.stringify({ teachers: 1, slots: 2, named: true, hidden: false, number: false })) throw new Error(`the subject teacher's meeting on the screen: ${JSON.stringify(subjectPtmSeen)}`);
};
// c210-rls end
// c210-leave begin
// Leave in a small office, and cancelled leave releasing its covers (C210). Four screens:
//   - the principal of a school with no active school admin (the school admin's account is switched off for the
//     run) records their own leave on "My leave": approved at once and marked as recorded by them, with the words
//     saying why. The account is switched back on after, whatever happened.
//   - the principal cancels a teacher's approved leave on Staff: the two covers assigned for today and tomorrow are
//     released by that tap, in the principal's name, and the line under "Cancelled" says so; the cover of
//     yesterday stays as it was.
//   - the covering teacher is told: a card on My Day, and "Covers released" on Proxy Auto. Never whose leave it was.
// Every row put in is taken away after; the audit rows stay (the log is never cut) and are counted from where they
// stood.
const countWhere = async (sql, params = []) => (await db.pg.query(`select count(*)::int as n from ${sql}`, params)).rows[0].n;
let ownLeaveSeen = null;
let ownLeaveAuditBefore = 0;
const accountLeaveSelf = async (page) => {
  await clearLeave();
  ownLeaveAuditBefore = await countWhere(`audit_log where event_action = 'leave.self_recorded'`);
  await db.pg.query(`update users set is_active = false where user_id = $1`, [PEOPLE.office.sub]);
  await page.reload({ waitUntil: 'networkidle' });
  const button = page.locator('[data-my-leave-self]');
  await button.waitFor({ timeout: 20000 });
  const why = await page.locator('[data-my-leave-self-why]').innerText();
  const disabledAtFirst = await button.isDisabled();
  await page.locator('#my-leave-from').fill(await leaveDay(0));
  await page.locator('#my-leave-to').fill(await leaveDay(1));
  await page.selectOption('#my-leave-kind', 'other');
  await page.locator('#my-leave-reason').fill('A meeting at the district education office.');
  await button.click();
  await page.locator('[data-my-leave-row="approved"] [data-leave-self]').waitFor({ timeout: 20000 });
  ownLeaveSeen = {
    disabledAtFirst,
    saysWhy: why.includes('no school admin') && why.includes('“Record my own leave”'),
    note: await page.locator('[data-leave-note]').getAttribute('data-leave-note'),
    how: await page.locator('[data-my-leave-how]').getAttribute('data-my-leave-how'),
    askToo: await page.locator('[data-my-leave-send]').count(),
    marked: (await page.locator('[data-leave-self]').innerText()).includes('You recorded this leave yourself'),
    // It has begun, and there is nobody yet to cancel it: the line says so, and does not send them to themself.
    begun: await page.locator('[data-my-leave-row="approved"]').innerText().then((w) => w.includes('Once the school has a school admin') && !w.includes('ask the principal')),
  };
};
const accountLeaveSelfDone = async () => {
  await db.pg.query(`update users set is_active = true where user_id = $1`, [PEOPLE.office.sub]);
  const { rows } = await db.pg.query(
    `select (select count(*)::int from staff_leave where school_id = $1 and user_id = $2 and recorded_by = $2 and decided_by = $2 and status = 'approved' and self_recorded
               and from_date = ${TODAY_SQL} and to_date = ${TODAY_SQL} + 1 and kind = 'other') as recorded,
            (select count(*)::int from staff_leave) as in_all`,
    [SCHOOL, PEOPLE.principal.sub]
  );
  const audited = (await countWhere(`audit_log where event_action = 'leave.self_recorded' and actor_user_id = $1`, [PEOPLE.principal.sub])) - ownLeaveAuditBefore;
  await clearLeave();
  if (JSON.stringify(rows[0]) !== JSON.stringify({ recorded: 1, in_all: 1 }) || audited !== 1) throw new Error(`the principal's own leave in the database: ${JSON.stringify(rows[0])}, ${audited} audit rows`);
  const seen = { disabledAtFirst: true, saysWhy: true, note: 'ok', how: 'alone', askToo: 1, marked: true, begun: true };
  if (JSON.stringify(ownLeaveSeen) !== JSON.stringify(seen)) throw new Error(`"Record my own leave": ${JSON.stringify(ownLeaveSeen)}`);
};
let releaseSeen = null;
let releaseAuditBefore = 0;
const staffLeaveReleases = async (page) => {
  await clearProxy();
  releaseAuditBefore = await countWhere(`audit_log where event_action = 'cover.released'`);
  await db.pg.query(`insert into users (user_id, school_id, email, role, display_name) values ($1, $2, 'tejas@example.invalid', 'teacher', 'Tejas Example')`, [PROXY_TEACHERS.tejas, SCHOOL]);
  // Tara has been away since yesterday, until the day after tomorrow. Tejas covers her first period yesterday, today
  // and tomorrow: rows, as the office's taps on Proxy Auto would have made them.
  await putLeave(PEOPLE.teacher.sub, -1, 2, 'sick', 'Unwell, phoned in.', PEOPLE.principal.sub);
  await db.pg.exec(`set session_replication_role = replica;
    insert into substitutions (school_id, on_date, period, class_id, subject_id, absent_user_id, substitute_user_id, assigned_by)
      select '${SCHOOL}', ${TODAY_SQL} + d, 1, '${CLASS_5A}', '${PROXY_MATHS}', '${PEOPLE.teacher.sub}', '${PROXY_TEACHERS.tejas}', '${PEOPLE.principal.sub}' from generate_series(-1, 1) d;
    set session_replication_role = origin;`);
  await page.reload({ waitUntil: 'networkidle' });
  const row = page.locator('[data-leave-ahead] [data-leave-calendar-row]').first();
  await row.waitFor({ timeout: 20000 });
  await row.locator('[data-leave-cancel-open]').click();
  await row.locator('input').fill('She came in after all.');
  await row.locator('[data-leave-cancel]').click();
  await page.waitForFunction(() => /released/.test(document.querySelector('[data-leave-note]')?.textContent ?? ''), null, { timeout: 20000 });
  releaseSeen = { says: (await page.locator('[data-leave-note]').innerText()).includes('2 covers assigned for those days were released, and their teachers are told on My Day.') };
};
const staffLeaveReleasesDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from substitutions where status = 'undone' and undone_reason = 'leave_cancelled' and undone_by = $1 and on_date >= ${TODAY_SQL}) as released,
            (select count(*)::int from substitutions where status = 'assigned' and on_date < ${TODAY_SQL}) as yesterday_stands,
            (select count(*)::int from substitutions where status = 'assigned') as still_assigned,
            (select count(*)::int from staff_leave where status = 'withdrawn' and withdrawn_by = $1 and withdrawn_note = 'She came in after all.') as cancelled`,
    [PEOPLE.principal.sub]
  );
  const audited = (await countWhere(`audit_log where event_action = 'cover.released'`)) - releaseAuditBefore;
  await clearProxy();
  if (JSON.stringify(rows[0]) !== JSON.stringify({ released: 2, yesterday_stands: 1, still_assigned: 1, cancelled: 1 }) || audited !== 2) throw new Error(`cancelled leave and its covers: ${JSON.stringify(rows[0])}, ${audited} audit rows`);
  if (!releaseSeen?.says) throw new Error(`the line under "Cancelled": ${JSON.stringify(releaseSeen)}`);
};
// Two covers the teacher had, today and tomorrow, for Tanvi, released when her leave was cancelled: rows.
const putReleasedCovers = () =>
  db.pg.exec(`set session_replication_role = replica;
    insert into substitutions (school_id, on_date, period, class_id, subject_id, absent_user_id, substitute_user_id, assigned_by, status, undone_by, undone_at, undone_reason) values
      ('${SCHOOL}', ${TODAY_SQL}, 4, '${PROXY_CLASS_6A}', '${PROXY_ENGLISH}', '${LEAVE_OTHER_TEACHER}', '${PEOPLE.teacher.sub}', '${PEOPLE.office.sub}', 'undone', '${PEOPLE.office.sub}', now(), 'leave_cancelled'),
      ('${SCHOOL}', ${TODAY_SQL} + 1, 5, '${PROXY_CLASS_6A}', '${PROXY_MATHS}', '${LEAVE_OTHER_TEACHER}', '${PEOPLE.teacher.sub}', '${PEOPLE.office.sub}', 'undone', '${PEOPLE.office.sub}', now(), 'leave_cancelled');
    set session_replication_role = origin;`);
let releasedSeen = null;
const releasedShownAt = (selector, wanted) => async (page) => {
  await clearProxy();
  await proxyWorkAllWeek();
  await putReleasedCovers();
  await page.reload({ waitUntil: 'networkidle' });
  const block = page.locator(selector);
  await block.waitFor({ timeout: 20000 });
  // On a phone My Day shows a row's action as a chevron (C230-D), so its words are in the text, not on screen. The
  // "Why this?" answer is left out: it explains the rule, not this cover.
  const words = `${await block.innerText()} ${await block.evaluate((el) => { const c = el.cloneNode(true); c.querySelectorAll('details').forEach((d) => d.remove()); return c.textContent; })}`;
  // The day, the period, the class and the subject; never whose leave it was or why.
  releasedSeen = { selector, says: wanted.every((w) => words.includes(w)) && !words.includes('Tanvi') && !words.includes('Unwell'), words: words.replace(/\s+/g, ' ').slice(0, 240) };
};
const releasedShownDone = (selector) => async () => {
  const left = await countWhere(`substitutions where status = 'undone' and undone_reason = 'leave_cancelled' and substitute_user_id = $1`, [PEOPLE.teacher.sub]);
  await clearProxy();
  if (left !== 2 || releasedSeen?.selector !== selector || !releasedSeen.says) throw new Error(`a teacher's released covers at ${selector}: ${JSON.stringify(releasedSeen)}, ${left} rows`);
};
// c210-leave end
// c210-jobs begin
// The schools' own scheduled checks (C210), run for real: the job runner of the running app is called the way the
// scheduler calls it (POST /api/jobs/run with the runner's credential; the harness skips the migration that keeps
// that credential in Vault, so a screen puts in the same function and a secret for this run, and takes both away).
// The first call is the deployed code saying which job types it runs; then the database's own enqueue function
// queues one job a school with the module on; the second call runs them, each in its school's own session with no
// person. Other jobs waiting in the queue are held back meanwhile and put back after. Everything is taken away
// after each screen; audit rows stay (the log is never cut).
const SCHOOL_JOB_TYPES = ['early_warning.nightly', 'auditor.weekly'];
const RUNNER_TOKEN = randomBytes(32).toString('hex');
let schoolJobsHeld = [];
let schoolJobsHandlersBefore = null;
const schoolJobsOpen = async () => {
  schoolJobsHandlersBefore = (await db.pg.query(`select value from platform_settings where key = 'jobs.handlers'`)).rows[0]?.value ?? null;
  schoolJobsHeld = (await db.pg.query(`update jobs set next_run_at = next_run_at + interval '1000 years' where status = 'pending' and type <> all($1::text[]) returning job_id`, [SCHOOL_JOB_TYPES])).rows.map((r) => r.job_id);
  await db.pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations/20260930064359_b2_jobs_runner_secret_digest.sql'), 'utf8'));
  await db.pg.query(`delete from vault.secrets where name = 'jobs_runner_secret'`);
  await db.pg.query(`insert into vault.secrets (name, secret) values ('jobs_runner_secret', $1)`, [RUNNER_TOKEN]);
};
const schoolJobsClose = async () => {
  await db.pg.exec(`set session_replication_role = replica; delete from jobs where type in ('early_warning.nightly', 'auditor.weekly'); set session_replication_role = origin;`);
  if (schoolJobsHeld.length) await db.pg.query(`update jobs set next_run_at = next_run_at - interval '1000 years' where job_id = any($1::uuid[])`, [schoolJobsHeld]);
  schoolJobsHeld = [];
  await db.pg.exec(`delete from vault.secrets where name = 'jobs_runner_secret'; drop function if exists public.jobs_runner_secret_digest();`);
  await db.pg.query(`update platform_settings set value = coalesce($1::jsonb, '[]'::jsonb) where key = 'jobs.handlers'`, [schoolJobsHandlersBefore === null ? null : JSON.stringify(schoolJobsHandlersBefore)]);
};
// One round of the runner, as the scheduler calls it every minute.
const runnerRound = async () => {
  const res = await fetch(`${base}/api/jobs/run`, { method: 'POST', headers: { authorization: `Bearer ${RUNNER_TOKEN}` } });
  if (res.status !== 200) throw new Error(`the job runner answered ${res.status}`);
  return res.json();
};
// The night's (or the week's) check for every school with the module on: the runner says what it runs, the database
// queues, the runner runs. Returns what the second round did.
const runSchoolCheck = async (enqueue) => {
  await schoolJobsOpen();
  const first = await runnerRound();
  const handled = (await db.pg.query(`select value from platform_settings where key = 'jobs.handlers'`)).rows[0]?.value ?? [];
  if (!SCHOOL_JOB_TYPES.every((t) => handled.includes(t)) || first.claimed !== 0) throw new Error(`the runner's first round: ${JSON.stringify({ first, handled })}`);
  await db.pg.query(`select public.${enqueue}()`);
  return runnerRound();
};

// Early Warning, by the nightly check. Aarav (5-A) was away on most days three weeks ago, as on the screen of
// "Check now" (C209). Nobody presses anything: the nightly job opens his flag, and the screen says the nightly check
// opened it and was the last check. The flag is compared with the database: no person, the nightly check's name.
let ewNightlySeen = null;
let ewNightlyRound = null;
const earlyWarningNightly = async (page) => {
  await clearEarlyWarning();
  await db.pg.exec(`set session_replication_role = replica;
    insert into attendance (school_id, student_id, class_id, date, status, marked_by, leave_code)
      select '${SCHOOL}', '${STUDENT}', '${CLASS_5A}', ${TODAY_SQL} - g, case when g in (11, 22) then 'present' else 'absent' end, '${PEOPLE.teacher.sub}', null
        from generate_series(11, 22) g;
    set session_replication_role = origin;`);
  ewNightlyRound = await runSchoolCheck('early_warning_nightly_enqueue');
  await page.reload({ waitUntil: 'networkidle' });
  const flag = page.locator('[data-ew-flag="open"]', { hasText: 'Aarav Example A' });
  await flag.waitFor({ timeout: 20000 });
  await flag.locator('[data-ew-why] summary').click();
  ewNightlySeen = {
    lastCheckBy: await page.locator('[data-ew-last-check]').getAttribute('data-ew-last-check-by'),
    lastCheckSays: /Last checked .+, by the nightly check\./.test(await page.locator('[data-ew-last-check]').innerText()),
    whySays: (await flag.locator('[data-ew-why]').innerText()).includes(', by the nightly check.'),
    howSays: (await page.locator('[data-ew-check]').innerText()).includes('It runs by itself each night just after midnight'),
    open: await page.locator('[data-ew-flag="open"]').count(),
  };
};
const earlyWarningNightlyDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from early_warning_flags where school_id = $1 and resolved_at is null) as open,
            (select count(*)::int from early_warning_flags where school_id = $1 and student_id = $2 and resolved_at is null and opened_by is null and opened_by_job = 'early_warning.nightly' and reasons = '{attendance}') as by_nightly,
            (select count(*)::int from early_warning_flags where opened_by is not null) as by_a_person,
            (select string_agg(status, ',' order by status) from jobs where type = 'early_warning.nightly' and school_id = $1) as job,
            (select count(*)::int from audit_log where school_id = $1 and event_action = 'early_warning.checked' and actor_user_id is null and after_state ->> 'by' = 'early_warning.nightly' and occurred_at > now() - interval '10 minutes') as audited`,
    [SCHOOL, STUDENT]
  );
  await clearEarlyWarning();
  await schoolJobsClose();
  const r = rows[0];
  // The seeded school and the test school both have Early Warning on: two jobs, both done.
  if (ewNightlyRound?.claimed !== 2 || ewNightlyRound?.succeeded !== 2) throw new Error(`the runner's second round: ${JSON.stringify(ewNightlyRound)}`);
  if (r.by_nightly !== 1 || r.by_a_person !== 0 || r.job !== 'succeeded' || r.audited < 1) throw new Error(`the nightly check in the database: ${JSON.stringify(r)}`);
  const seen = { lastCheckBy: 'nightly', lastCheckSays: true, whySays: true, howSays: true, open: r.open };
  if (JSON.stringify(ewNightlySeen) !== JSON.stringify(seen)) throw new Error(`the nightly check on the screen: ${JSON.stringify(ewNightlySeen)}, wanted ${JSON.stringify(seen)}`);
};

// The School Health Auditor, by the weekly check-up: nobody presses anything; the week's check-up is on the screen,
// recorded by the weekly check-up, with the same "N of M" and the same checks needing attention as the row the job
// kept.
let auditorWeeklySeen = null;
let auditorWeeklyRound = null;
const clearAllHealthRuns = () => db.pg.exec(`set session_replication_role = replica; delete from school_health_runs; set session_replication_role = origin;`);
const auditorWeekly = async (page) => {
  await clearAllHealthRuns();
  auditorWeeklyRound = await runSchoolCheck('auditor_weekly_enqueue');
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-auditor="run"] [data-auditor-result]').waitFor({ timeout: 30000 });
  auditorWeeklySeen = {
    result: (await page.locator('[data-auditor-result]').textContent()).trim(),
    by: await page.locator('[data-auditor-recorded-by]').getAttribute('data-auditor-recorded-by'),
    says: /run at .+ by the weekly check-up\.$/.test((await page.locator('[data-auditor-recorded-by]').innerText()).trim()),
    weeklyNote: await page.locator('[data-auditor="run"] [data-auditor-weekly]').count(),
    attention: await page.locator('[data-auditor-section="attention"] [data-check]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-check'), Number(e.getAttribute('data-count'))])),
  };
};
const auditorWeeklyDone = async () => {
  const { rows } = await db.pg.query(`select school_id, run_date = ${TODAY_SQL} as today, passed, applicable, results, recorded_by, recorded_by_job from school_health_runs order by school_id`);
  const audited = (await db.pg.query(`select count(*)::int as n from audit_log where event_action = 'school_health.checked' and actor_user_id is null and after_state ->> 'by' = 'auditor.weekly' and occurred_at > now() - interval '10 minutes'`)).rows[0].n;
  await clearAllHealthRuns();
  await schoolJobsClose();
  const mine = rows.find((r) => r.school_id === SCHOOL);
  if (auditorWeeklyRound?.claimed !== 2 || auditorWeeklyRound?.succeeded !== 2 || rows.length !== 2 || audited < 2) throw new Error(`the weekly check-ups: ${JSON.stringify({ round: auditorWeeklyRound, rows: rows.length, audited })}`);
  if (!mine?.today || mine.recorded_by !== null || mine.recorded_by_job !== 'auditor.weekly') throw new Error(`the weekly check-up in the database: ${JSON.stringify(mine)}`);
  const attention = mine.results.filter((x) => x.state === 'needs_attention').map((x) => [x.id, x.count]);
  const seen = { result: `${mine.passed} of ${mine.applicable} checks pass`, by: 'weekly', says: true, weeklyNote: 1, attention };
  if (JSON.stringify(auditorWeeklySeen) !== JSON.stringify(seen)) throw new Error(`the weekly check-up on the screen: ${JSON.stringify(auditorWeeklySeen)}, wanted ${JSON.stringify(seen)}`);
};

// My Day of the school admin: before the week's check-up, a prompt to run one; after the weekly job, the number of
// checks that need attention, as the kept check-up counts them.
let myDayCheckupSeen = null;
const myDayCheckup = async (page) => {
  await clearAllHealthRuns();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-today-card="checkup-not-run"]').waitFor({ timeout: 20000 });
  const prompt = (await page.locator('[data-today-card="checkup-not-run"]').innerText()).includes('No check-up has been run this week');
  await runSchoolCheck('auditor_weekly_enqueue');
  await page.reload({ waitUntil: 'networkidle' });
  const card = page.locator('[data-today-card="checkup-attention"]');
  await card.waitFor({ timeout: 20000 });
  const words = await card.innerText();
  myDayCheckupSeen = {
    prompt,
    promptGone: await page.locator('[data-today-card="checkup-not-run"]').count(),
    state: await card.getAttribute('data-state'),
    count: Number(/(\d+) checks? needs? attention in this week’s check-up/.exec(words)?.[1] ?? -1),
    href: await card.locator('a').getAttribute('href'),
  };
};
const myDayCheckupDone = async () => {
  const { rows } = await db.pg.query(`select results from school_health_runs where school_id = $1 and run_date = ${TODAY_SQL} and recorded_by_job = 'auditor.weekly'`, [SCHOOL]);
  await clearAllHealthRuns();
  await schoolJobsClose();
  const attention = rows[0]?.results.filter((x) => x.state === 'needs_attention').length ?? 0;
  const seen = { prompt: true, promptGone: 0, state: 'todo', count: attention, href: '/app/school-auditor' };
  if (rows.length !== 1 || attention < 1 || JSON.stringify(myDayCheckupSeen) !== JSON.stringify(seen)) throw new Error(`the check-up on My Day: ${JSON.stringify(myDayCheckupSeen)}, wanted ${JSON.stringify(seen)}`);
};

// Control → Monitoring: last night's Early Warning jobs (one done for the seeded school; one given up for the test
// school, which is not counted) and no check-up job for the week. The section shows the states and the counts, and
// names no school.
const SCHOOL_CHECKS_NIGHT = `((now() at time zone 'Asia/Kolkata')::date - 1)::text`;
let schoolChecksSeen = null;
const monitoringSchoolChecks = async (page) => {
  await db.pg.exec(`set session_replication_role = replica; delete from jobs where type in ('early_warning.nightly', 'auditor.weekly');
    insert into jobs (type, payload, idempotency_key, school_id, status, attempts, max_attempts, completed_at, last_error) values
      ('early_warning.nightly', '{}', 'early_warning.nightly:${SCHOOL}:' || ${SCHOOL_CHECKS_NIGHT}, '${SCHOOL}', 'succeeded', 1, 5, now() - interval '9 hours', null),
      ('early_warning.nightly', '{}', 'early_warning.nightly:b0000000-0000-4000-8000-000000000002:' || ${SCHOOL_CHECKS_NIGHT}, 'b0000000-0000-4000-8000-000000000002', 'dead', 5, 5, now() - interval '8 hours', 'early_warning.nightly: the check was refused (not_allowed)');
    set session_replication_role = origin;`);
  await page.reload({ waitUntil: 'networkidle' });
  const block = page.locator('[data-monitoring-school-checks]');
  await block.waitFor({ timeout: 20000 });
  await block.scrollIntoViewIfNeeded();
  schoolChecksSeen = {
    states: Object.fromEntries(await block.locator('[data-monitoring-school-check]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-monitoring-school-check'), e.getAttribute('data-monitoring-school-check-state')]))),
    counts: await block.locator('[data-monitoring-school-check="earlyWarning"] [data-monitoring-school-check-counts]').getAttribute('data-monitoring-school-check-counts'),
    text: await block.innerText(),
  };
};
const monitoringSchoolChecksDone = async () => {
  await db.pg.exec(`set session_replication_role = replica; delete from jobs where type in ('early_warning.nightly', 'auditor.weekly'); set session_replication_role = origin;`);
  const seen = schoolChecksSeen ?? {};
  // The week yesterday was in has no check-up job here: not queued, though the seeded school has the auditor on.
  if (JSON.stringify(seen.states) !== JSON.stringify({ earlyWarning: 'ran', auditor: 'not_queued' }) || seen.counts !== '1/1') throw new Error(`the schools' own checks on Monitoring: ${JSON.stringify({ states: seen.states, counts: seen.counts })}`);
  const named = ['Illustrative Public School', 'Illustrative Test School'].filter((n) => (seen.text ?? '').includes(n));
  if (named.length || !/Schools with a job: 1\. Finished: 1\. Last finished: 9 hours ago\./.test(seen.text ?? '')) throw new Error(`the schools' own checks, the words: ${JSON.stringify({ named, text: seen.text })}`);
};
// c210-jobs end
// c210-ui begin
// The class teacher of a class (C210). The principal runs a check-up on the School Health Auditor: 6-A has no class
// teacher, and the check's button opens the list of classes on Students (/app/students?classes=1). There the
// principal chooses Tanvi for 6-A; the picture shows the list. The check reads the database (the class teacher and
// an audit row in the principal's name), then clears 6-A's class teacher on the same list and reads it again. 6-A
// ends as the seed has it, with no class teacher; the check-up is taken away (its audit rows stay: the log is never
// cut).
const CLASS_6A = '00000000-0000-4000-8000-0000000c0061';
const TANVI = '00000000-0000-4000-8000-00000000a004';
let classTeacherSeen = null;
const classTeacherAudits = async () => (await db.pg.query(`select count(*)::int as n from audit_log where event_action = 'class.class_teacher' and target_id = $1 and actor_user_id = $2`, [CLASS_6A, PEOPLE.principal.sub])).rows[0].n;
const classTeacherOf6A = async () => (await db.pg.query(`select class_teacher_id from classes where class_id = $1`, [CLASS_6A])).rows[0].class_teacher_id;
const classTeacherSaved = (page, want) =>
  page.waitForFunction(([id, value]) => {
    const select = document.querySelector(`[data-class-teacher="${id}"]`);
    return select && !select.disabled && select.value === value;
  }, [CLASS_6A, want], { timeout: 20000 });
const classTeacherFromAuditor = async (page) => {
  await clearHealthRuns();
  await db.pg.query(`update classes set class_teacher_id = null where class_id = $1`, [CLASS_6A]);
  classTeacherSeen = { auditsBefore: await classTeacherAudits() };
  await page.goto(`${base}/app/school-auditor`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.locator('[data-auditor="empty"] [data-auditor-run]').click();
  const fix = page.locator('[data-check-fix="class_teacher"]');
  await fix.waitFor({ timeout: 30000 });
  classTeacherSeen.href = await fix.getAttribute('href');
  classTeacherSeen.button = ((await fix.textContent()) ?? '').trim();
  await fix.click();
  await page.waitForURL('**/app/students?classes=1', { timeout: 90000 });
  const select = page.locator(`[data-class-teacher="${CLASS_6A}"]`);
  await select.waitFor({ timeout: 30000 });
  classTeacherSeen.options = await select.locator('option').allTextContents();
  await select.selectOption(TANVI);
  await classTeacherSaved(page, TANVI);
  classTeacherSeen.saved = await classTeacherOf6A();
  classTeacherSeen.auditsAfterSet = await classTeacherAudits();
};
const classTeacherFromAuditorDone = async (page) => {
  try {
    const seen = classTeacherSeen;
    if (seen?.href !== '/app/students?classes=1' || seen.button !== 'Choose class teachers') throw new Error(`the auditor's check opens ${seen?.href} with "${seen?.button}"`);
    // Active teachers of the school, and "no class teacher": never the principal or the office.
    if (!seen.options.includes('No class teacher') || !seen.options.includes('Tanvi Example') || !seen.options.includes('Tara Example') || seen.options.some((o) => /Priya|Arjun|Bela/.test(o))) throw new Error(`the choices for 6-A: ${JSON.stringify(seen.options)}`);
    if (seen.saved !== TANVI || seen.auditsAfterSet !== seen.auditsBefore + 1) throw new Error(`6-A after choosing Tanvi: ${JSON.stringify(seen)}`);
    // Cleared on the same list, with no reload.
    await page.locator(`[data-class-teacher="${CLASS_6A}"]`).selectOption('');
    await classTeacherSaved(page, '');
    const cleared = await classTeacherOf6A();
    const audits = await classTeacherAudits();
    if (cleared !== null || audits !== seen.auditsBefore + 2) throw new Error(`6-A after clearing: ${cleared}, ${audits - seen.auditsBefore} audit rows`);
  } finally {
    await db.pg.query(`update classes set class_teacher_id = null where class_id = $1`, [CLASS_6A]);
    await clearHealthRuns();
  }
};
// Dashboard lists that follow a change below them (C210), on three more screens: the screen is opened from the
// dashboard number with one row behind it (shownAfterAdding), the picture is taken, then the principal changes that
// row in the list below the way a person does, and the list above must say 0 in the page that was already open
// (changeBelow: no reload). The database is read after, and every added row is taken away.
const shownRowStatus = async (sql, id) => (await db.pg.query(sql, [id])).rows[0]?.status;
const noticeShownChange = async (page) => {
  try {
    await changeBelow(page, async () => {
      const notice = page.locator('[data-notice="waiting"]', { hasText: 'Harness 8d' });
      await notice.locator('[data-notice-reject]').click();
      await notice.locator('#notice-reject-reason').fill('Harness 8d: the date is wrong.');
      await notice.locator('[data-notice-reject-save]').click();
    }, 'Notices waiting for approval: 0');
    const status = await shownRowStatus(`select status::text as status from class_notices where notice_id = $1`, `${H8D}4`);
    if (status !== 'rejected') throw new Error(`the notice rejected on the screen is ${status} in the database`);
  } finally {
    await clearDashboardRows();
  }
};
const eventShownChange = async (page) => {
  try {
    await changeBelow(page, () => page.locator('[data-event="draft"]', { hasText: 'Harness 8d science fair' }).locator('[data-event-cancel]').click(), 'Events coming: 0');
    const status = await shownRowStatus(`select status::text as status from school_events where event_id = $1`, `${H8D}5`);
    if (status !== 'cancelled') throw new Error(`the event cancelled on the screen is ${status} in the database`);
  } finally {
    await clearDashboardRows();
  }
};
const answerShownChange = async (page) => {
  try {
    await changeBelow(page, () => page.locator('[data-answer="draft"]').first().locator('[data-answer-discard]').click(), 'Draft answers waiting for approval: 0');
    const status = await shownRowStatus(`select status::text as status from parent_ai_answers where answer_id = $1`, `${H8D}6`);
    if (status !== 'discarded') throw new Error(`the draft discarded on the screen is ${status} in the database`);
  } finally {
    await clearDashboardRows();
  }
};
// Control → Monitoring never sends a member of staff's full email to the browser (C210). An invitation that waits
// for NetCyberAI is put in; the page is opened again, and both what the server sent and the page drawn are read:
// the invitation shows "h…@staff.example" and the full address is in neither. The invitation is taken away after.
const MASKED_INVITE = '00000000-0000-4000-8000-0000000c2101';
const MASKED_EMAIL = 'harness.staff.c210@staff.example';
let maskedSeen = null;
const removeMaskedInvite = () => db.pg.exec(`set session_replication_role = replica; delete from staff_invitations where invitation_id = '${MASKED_INVITE}'; set session_replication_role = origin;`);
const monitoringMasked = async (page) => {
  await removeMaskedInvite();
  await db.pg.query(`insert into staff_invitations (invitation_id, school_id, email, email_key, display_name, role, status, source, invited_by) values ($1, $2, $3, $3, 'Harness Staff', 'teacher', 'needs_founder', 'staff', $4)`, [MASKED_INVITE, SCHOOL, MASKED_EMAIL, PEOPLE.principal.sub]);
  const res = await page.reload({ waitUntil: 'networkidle', timeout: 90000 });
  const sent = res ? await res.text() : '';
  const line = page.locator('[data-monitoring-invitation]', { hasText: 'h…@staff.example' });
  await line.first().waitFor({ timeout: 30000 });
  await line.first().scrollIntoViewIfNeeded();
  maskedSeen = { line: ((await line.first().textContent()) ?? '').trim(), inSent: sent.includes('harness.staff'), inPage: (await page.content()).includes('harness.staff'), sentBytes: sent.length };
};
const monitoringMaskedDone = async () => {
  try {
    if (!maskedSeen?.line.includes('invited h…@staff.example as Teacher') || maskedSeen.inSent || maskedSeen.inPage || maskedSeen.sentBytes === 0) throw new Error(`the invitation on Monitoring: ${JSON.stringify(maskedSeen)}`);
  } finally {
    await removeMaskedInvite();
  }
};
// c210-ui end
// c235-a begin
// The standard classes (C235-A). The principal opens "Manage classes" and presses "Add the standard classes": the
// seed's classes stay as they are, every other class of LKG to 12 with sections A, B and C is added, and the list
// shows the 42 in the class order (LKG, UKG, 1 … 12; 2-A before 10-A). The picture is the whole list: the dialog is
// drawn at its full height for it. The check reads the database; then the added classes are taken away (the audit
// row of the press stays: the log is never cut).
const STANDARD_NAMES = ['LKG', 'UKG', ...Array.from({ length: 12 }, (_, i) => String(i + 1))].flatMap((g) => ['A', 'B', 'C'].map((s) => `${g}-${s}`));
let standardSeen = null;
const classesStandard = async (page) => {
  standardSeen = { before: (await db.pg.query(`select class_id from classes where school_id = $1`, [SCHOOL])).rows.map((r) => r.class_id) };
  await page.locator('[data-classes-standard]').click();
  await page.waitForFunction((n) => Number(document.querySelector('[data-classes-count]')?.getAttribute('data-classes-count')) >= n, standardSeen.before.length + 39, { timeout: 30000 });
  standardSeen.names = await page.locator('[data-classes] [data-class-name]').allTextContents();
  standardSeen.saved = (await db.pg.query(`select count(*)::int as n from classes where school_id = $1 and name = any($2::text[])`, [SCHOOL, STANDARD_NAMES])).rows[0].n;
  await page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]');
    if (dialog) Object.assign(dialog.style, { maxHeight: 'none', position: 'absolute', top: '0', marginTop: '16px' });
  });
};
const classesStandardDone = async () => {
  try {
    const shown = (standardSeen?.names ?? []).filter((n) => STANDARD_NAMES.includes(n));
    if (JSON.stringify(shown) !== JSON.stringify(STANDARD_NAMES)) throw new Error(`the list after "Add the standard classes": ${JSON.stringify(standardSeen?.names)}`);
    if (standardSeen.saved !== 42) throw new Error(`${standardSeen.saved} standard classes saved, expected 42`);
  } finally {
    if (standardSeen?.before) await db.pg.query(`delete from classes where school_id = $1 and not (class_id = any($2::uuid[]))`, [SCHOOL, standardSeen.before]);
  }
};
// c235-a end
// p6-9a begin
// Boards and the grading scheme builder (C213). The seeded school records no board and has no scheme; Exams is
// switched on for it here (the seed predates the module), and every row made is taken away afterwards.
const CBSE_DOC = 'https://cbseacademic.nic.in/web_material/CurriculumMain26/Sec/Curriculum_Sec_2025-26.pdf';
let examsEntitlementBefore = null;
const examsOn = async () => {
  examsEntitlementBefore = (await db.pg.query(`select enabled, source from school_module_entitlements where school_id = $1 and module_id = 'exams'`, [SCHOOL])).rows[0] ?? null;
  await db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source) values ($1, 'exams', true, 'plan') on conflict (school_id, module_id) do update set enabled = true`, [SCHOOL]);
};
const clearGrading = async () => {
  await db.pg.exec(`set session_replication_role = replica;
    delete from grading_schemes where school_id = '${SCHOOL}';
    update schools set board_id = null, board_set_by = null, board_set_at = null where school_id = '${SCHOOL}';
    delete from audit_log where event_action in ('grading_scheme.saved', 'school.board_set') and school_id = '${SCHOOL}';
    delete from audit_log where event_action in ('board.added', 'board_preset.added') and (target_id = 'harness-state' or target_id in (select preset_id::text from board_presets where board_id = 'harness-state'));
    delete from board_presets where board_id = 'harness-state';
    delete from boards where board_id = 'harness-state';
    set session_replication_role = origin;`);
  if (examsEntitlementBefore === null) await db.pg.query(`delete from school_module_entitlements where school_id = $1 and module_id = 'exams'`, [SCHOOL]);
  else await db.pg.query(`update school_module_entitlements set enabled = $2, source = $3 where school_id = $1 and module_id = 'exams'`, [SCHOOL, examsEntitlementBefore.enabled, examsEntitlementBefore.source]);
};
// NetCyberAI has recorded CBSE in Control (C219: the board is changed in Control only); the principal sees it, read
// only, with the words that say who records it; starts from its preset and sees its source and the gap the document
// prints (41 to 44, as printed); moves C2 down to 41, which closes it; tries 42 (now C2) and saves version 1.
let gradingSeen = null;
const gradingScheme = async (page) => {
  await clearGrading();
  await examsOn();
  await db.pg.query(`update schools set board_id = 'cbse' where school_id = $1`, [SCHOOL]); // as Control records it
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-scheme-empty]').waitFor({ timeout: 20000 });
  const boardName = await page.locator('[data-scheme-board-name]').textContent();
  const boardControl = await page.locator('[data-scheme-board-control]').textContent();
  const boardPickers = await page.locator('#scheme-board, [data-scheme-board-save]').count();
  await page.locator('[data-scheme-start-preset="Classes IX-X"]').click();
  await page.locator('[data-scheme-editor]').waitFor({ timeout: 20000 });
  const printed = await page.locator('[data-gap="41-44"][data-as-printed="yes"]').count();
  const documentSays = await page.locator('[data-scheme-editor] [data-scheme-document-says]').count();
  const source = await page.locator('[data-scheme-editor] [data-scheme-source] a').getAttribute('href');
  await page.locator('#scheme-band-5-from').fill('41');
  await page.locator('[data-gap="41-44"]').waitFor({ state: 'detached', timeout: 10000 });
  const gapsAfter = await page.locator('[data-scheme-editor] [data-gap]').evaluateAll((els) => els.map((e) => e.getAttribute('data-gap')).join());
  await page.locator('[data-scheme-save]').click();
  await page.locator('[data-scheme-current="1"]').waitFor({ timeout: 20000 });
  await page.locator('#scheme-try').fill('42');
  const tried = await page.locator('[data-scheme-try-line="grade"]').textContent();
  const passLine = await page.locator('[data-scheme-try-line="pass"]').textContent();
  await page.evaluate(() => window.scrollTo(0, 0));
  gradingSeen = { printed, documentSays, source, gapsAfter, tried, passLine, boardName, boardControl, boardPickers };
};
const gradingSchemeDone = async () => {
  const { rows } = await db.pg.query(
    `select g.version, g.made_by, g.from_preset_id = (select preset_id from board_presets where board_id = 'cbse' and level = 'Classes IX-X') as from_cbse,
            (select b ->> 'from' from jsonb_array_elements(g.scheme -> 'bands') b where b ->> 'grade' = 'C2') as c2_from, s.board_id, s.board_set_by,
            (select count(*)::int from audit_log a where a.school_id = g.school_id and a.event_action in ('grading_scheme.saved', 'school.board_set')) as audits
       from grading_schemes g join schools s on s.school_id = g.school_id where g.school_id = $1`,
    [SCHOOL]
  );
  await clearGrading();
  // The board is the one Control recorded (no school person's name on it); the principal saved the scheme only.
  const want = [{ version: 1, made_by: PEOPLE.principal.sub, from_cbse: true, c2_from: '41', board_id: 'cbse', board_set_by: null, audits: 1 }];
  if (JSON.stringify(rows) !== JSON.stringify(want)) throw new Error(`the grading scheme in the database: ${JSON.stringify(rows)}`);
  const seen = gradingSeen ?? {};
  if (seen.printed !== 1 || seen.documentSays < 1 || seen.source !== CBSE_DOC || seen.gapsAfter !== '0-32' || !/is rounded to 42: grade C2\./.test(seen.tried ?? '') || !/pass mark of 33: passed/.test(seen.passLine ?? '')) throw new Error(`the grading scheme on the screen: ${JSON.stringify(seen)}`);
  if (!/CBSE/.test(seen.boardName ?? '') || !/NetCyberAI records your school’s board, in Control/.test(seen.boardControl ?? '') || seen.boardPickers !== 0) throw new Error(`the board on the screen: ${JSON.stringify(seen)}`);
};
// A CISCE school starts from the ICSE preset: the grades and pass mark of the Regulations, and it is asked for the
// mark ranges they do not give. Nothing is saved.
let cisceSeen = null;
const gradingCisce = async (page) => {
  await clearGrading();
  await examsOn();
  await db.pg.query(`update schools set board_id = 'cisce' where school_id = $1`, [SCHOOL]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-scheme-start-preset="ICSE (Class X)"]').click();
  await page.locator('[data-scheme-ask-ranges]').waitFor({ timeout: 20000 });
  await page.locator('#scheme-try').fill('72');
  cisceSeen = {
    unranged: await page.locator('[data-scheme-unranged]').textContent(),
    passMark: await page.locator('#scheme-pass').inputValue(),
    tried: await page.locator('[data-scheme-try-line="grade"]').textContent(),
    co: await page.locator('#scheme-area-0').inputValue(),
  };
  await page.evaluate(() => window.scrollTo(0, 0));
};
const gradingCisceDone = async () => {
  const saved = (await db.pg.query(`select count(*)::int as n from grading_schemes where school_id = $1`, [SCHOOL])).rows[0].n;
  await clearGrading();
  const seen = cisceSeen ?? {};
  if (saved !== 0 || !/1, 2, 3, 4, 5, 6, 7, 8, 9/.test(seen.unranged ?? '') || seen.passMark !== '33' || !/no mark ranges yet/.test(seen.tried ?? '') || seen.co !== 'SUPW and Community Service') throw new Error(`the CISCE start: saved ${saved}, ${JSON.stringify(seen)}`);
};
// Control: the founder adds a state board and its preset, copied from a (made-up) circular with its address.
let boardsSeen = null;
const HARNESS_CIRCULAR = 'https://example.invalid/harness/circular-7-of-2026.pdf';
const controlBoards = async (page) => {
  await clearGrading();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#board-id').fill('harness-state');
  await page.locator('#board-name').fill('Harness State Board (made up)');
  await page.locator('[data-board-add]').click();
  await page.locator('[data-board="harness-state"]').waitFor({ timeout: 20000 });
  await page.locator('[data-add="preset"]').click();
  await page.locator('#preset-board').selectOption('harness-state');
  await page.locator('#preset-level').fill('Classes IX-X');
  await page.locator('#preset-title').fill('Circular 7 of 2026: grading in secondary classes (made up)');
  await page.locator('#preset-url').fill(HARNESS_CIRCULAR);
  await page.locator('#preset-pass').fill('33');
  await page.locator('#preset-band-0-from').fill('33');
  await page.locator('#preset-band-0-to').fill('100');
  await page.locator('#preset-band-0-grade').fill('Pass');
  await page.locator('[data-preset-form] [data-add="band"]').click();
  await page.locator('#preset-band-1-from').fill('0');
  await page.locator('#preset-band-1-to').fill('32');
  await page.locator('#preset-band-1-grade').fill('Not yet');
  await page.locator('[data-preset-form] button', { hasText: 'Add a note' }).click();
  await page.locator('#preset-note-0').fill('Made up for the harness: the circular gives no meanings.');
  await page.locator('[data-preset-save]').click();
  await page.locator('[data-board="harness-state"] [data-preset="Classes IX-X"]').waitFor({ timeout: 20000 });
  boardsSeen = { link: await page.locator('[data-board="harness-state"] [data-preset="Classes IX-X"] a').getAttribute('href'), presets: await page.locator('[data-preset]').count() };
  await page.evaluate(() => window.scrollTo(0, 0));
};
const controlBoardsDone = async () => {
  const { rows } = await db.pg.query(
    `select b.added_by as board_by, p.added_by as preset_by, p.source_url, p.pass_mark::text as pass_mark, jsonb_array_length(p.bands) as bands, jsonb_array_length(p.notes) as notes,
            (select count(*)::int from audit_log where event_action in ('board.added', 'board_preset.added') and actor_user_id = $1 and (target_id = 'harness-state' or target_id = p.preset_id::text)) as audits
       from boards b join board_presets p on p.board_id = b.board_id where b.board_id = 'harness-state'`,
    [PEOPLE.founder.sub]
  );
  await clearGrading();
  const want = [{ board_by: PEOPLE.founder.sub, preset_by: PEOPLE.founder.sub, source_url: HARNESS_CIRCULAR, pass_mark: '33.00', bands: 2, notes: 1, audits: 2 }];
  if (JSON.stringify(rows) !== JSON.stringify(want)) throw new Error(`the state board in the database: ${JSON.stringify(rows)}`);
  if (boardsSeen?.link !== HARNESS_CIRCULAR || boardsSeen?.presets !== 4) throw new Error(`the state board on the screen: ${JSON.stringify(boardsSeen)}`);
};
// Control → a school → Exams: the founder records the school's board.
const controlSchoolBoard = async (page) => {
  await clearGrading();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Exams' }).click();
  await page.locator('[data-school-board]').waitFor({ timeout: 15000 });
  await page.locator('#school-board').selectOption('cisce');
  await page.locator('[data-school-board-save]').click();
  await page.waitForFunction(() => /board is recorded/.test(document.querySelector('[data-school-board] [role="status"]')?.textContent ?? ''), null, { timeout: 20000 });
  // Read back: who recorded it and when, and nothing left to save.
  await page.locator('[data-school-board] p', { hasText: 'Recorded by Illustrative Founder' }).waitFor({ timeout: 20000 });
  await page.locator('[data-school-board-save]:disabled').waitFor({ timeout: 10000 });
};
const controlSchoolBoardDone = async () => {
  const { rows } = await db.pg.query(
    `select s.board_id, s.board_set_by, (select count(*)::int from audit_log a where a.school_id = s.school_id and a.event_action = 'school.board_set' and a.actor_user_id = $2) as audits from schools s where s.school_id = $1`,
    [SCHOOL, PEOPLE.founder.sub]
  );
  await clearGrading();
  if (JSON.stringify(rows) !== JSON.stringify([{ board_id: 'cisce', board_set_by: PEOPLE.founder.sub, audits: 1 }])) throw new Error(`the school's board set in Control: ${JSON.stringify(rows)}`);
};
// p6-9a end
// p6-9b begin
// Exams and marks entry (C214). A fixture with fixed ids, so the paper and result screens have an address: a grading
// scheme (made up: Written 80 and Oral 20 of a subject, four bands, two terms), the exam "Unit test 1 (harness)" with
// 5-A Mathematics (6 of the 9 children entered) and 5-A English (all 9: one absent, one exempt). Exams is switched on
// for the school (the seed predates the module). Every row is taken away by the last screen of the block.
const X_EXAM = '00000000-0000-4000-8000-00000009be01';
const X_MATHS = '00000000-0000-4000-8000-00000009bf01';
const X_ENGLISH = '00000000-0000-4000-8000-00000009bf02';
const X_5A = '00000000-0000-4000-8000-0000000c0051';
const X_KIDS = [1, 4, 7, 10, 13, 16, 19, 22, 25]; // 5-A in the seed: roll 1 to 9; the last waits for consent
const xKid = (g) => `00000000-0000-4000-8000-0000005${String(g).padStart(5, '0')}`;
let xEntitlementBefore;
const clearExams = async () => {
  await db.pg.exec(`set session_replication_role = replica;
    delete from marks where school_id = '${SCHOOL}';
    delete from exam_papers where school_id = '${SCHOOL}';
    delete from exams where school_id = '${SCHOOL}';
    delete from grading_schemes where school_id = '${SCHOOL}';
    delete from audit_log where school_id = '${SCHOOL}' and split_part(event_action, '.', 1) in ('exam', 'exam_paper');
    set session_replication_role = origin;`);
};
const examsFixture = async () => {
  await clearExams();
  if (xEntitlementBefore === undefined) xEntitlementBefore = (await db.pg.query(`select enabled, source from school_module_entitlements where school_id = $1 and module_id = 'exams'`, [SCHOOL])).rows[0] ?? null;
  await db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source) values ($1, 'exams', true, 'plan') on conflict (school_id, module_id) do update set enabled = true`, [SCHOOL]);
  const scheme = {
    bands: [{ from: 75, to: 100, grade: 'A', meaning: null }, { from: 50, to: 74, grade: 'B', meaning: null }, { from: 33, to: 49, grade: 'C', meaning: null }, { from: 0, to: 32, grade: 'D', meaning: null }],
    decimals: 0, passMark: 33,
    components: [{ key: 'written', kind: 'theory', name: 'Written', share: 80, passMark: null, parts: [] }, { key: 'oral', kind: 'other', name: 'Oral', share: 20, passMark: null, parts: [] }],
    terms: [{ name: 'Term 1' }, { name: 'Term 2' }],
    layout: { components: true, total: true, percent: true, grade: true, attendance: true, remarks: true, coScholastic: false },
    coScholastic: null,
  };
  const parts = JSON.stringify([{ key: 'written', name: 'Written', max: 40, share: 80 }, { key: 'oral', name: 'Oral', max: 10, share: 20 }]);
  await db.pg.query(`insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 1, $2::jsonb, $3)`, [SCHOOL, JSON.stringify(scheme), PEOPLE.principal.sub]);
  // In the school's current session when it has one (earlier set-ups leave a 'Harness session' current), since the exams
  // list shows the current session's exams by default (C242): with no session it stays as the exams with none.
  await db.pg.query(
    `insert into exams (exam_id, school_id, name, term, created_by, session_id)
     values ($1, $2, 'Unit test 1 (harness)', 'Term 1', $3, (select session_id from academic_sessions where school_id = $2 and is_current))`,
    [X_EXAM, SCHOOL, PEOPLE.principal.sub]
  );
  await db.pg.query(
    `insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, paper_date, components, created_by) values
       ($1, $3, $4, $5, '00000000-0000-4000-8000-0000000d0001', $6::date, $7::jsonb, $8), ($2, $3, $4, $5, '00000000-0000-4000-8000-0000000d0002', $6::date, $7::jsonb, $8)`,
    [X_MATHS, X_ENGLISH, SCHOOL, X_EXAM, X_5A, indiaDay(1), parts, PEOPLE.principal.sub]
  );
  // English: every child of 5-A; Mathematics: the first six. Entered by Tara, the class teacher.
  const rows = [];
  for (const g of X_KIDS) {
    rows.push([X_ENGLISH, g, 'written', g === 10 ? 'absent' : 'score', g === 10 ? null : 20 + (g % 17)]);
    rows.push([X_ENGLISH, g, 'oral', g === 13 ? 'exempt' : 'score', g === 13 ? null : 5 + (g % 5)]);
    if (g <= 16) {
      rows.push([X_MATHS, g, 'written', 'score', 18 + ((g * 7) % 22)]);
      rows.push([X_MATHS, g, 'oral', 'score', 4 + (g % 6)]);
    }
  }
  for (const [paperId, g, component, kind, score] of rows) {
    await db.pg.query(
      `insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score, entered_by)
       select $1, p.exam_id, p.subject_id, p.paper_id, $3, $4, $5, $6, 0, $7 from exam_papers p where p.paper_id = $2`,
      [SCHOOL, paperId, component, xKid(g), kind, score, PEOPLE.teacher.sub]
    );
  }
  await db.pg.query(`update exam_papers set entered_by = $2 where paper_id = $1`, [X_ENGLISH, PEOPLE.teacher.sub]);
};
const examsPutBack = async () => {
  await clearExams();
  if (xEntitlementBefore === null) await db.pg.query(`delete from school_module_entitlements where school_id = $1 and module_id = 'exams'`, [SCHOOL]);
  else if (xEntitlementBefore) await db.pg.query(`update school_module_entitlements set enabled = $2, source = $3 where school_id = $1 and module_id = 'exams'`, [SCHOOL, xEntitlementBefore.enabled, xEntitlementBefore.source]);
  xEntitlementBefore = undefined;
};
// The principal makes "Half-yearly (harness)" for Term 1: 5-B Mathematics (Written 80, Oral 20) and 6-A English
// (Written 80 only). The fixture stays for the screens after this one; the exam made here is taken away.
let examsMadeSeen = null;
const examsMake = async (page) => {
  await examsFixture();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-exam-make]').waitFor({ timeout: 20000 });
  await page.locator('#exam-name').fill('Half-yearly (harness)');
  await page.locator('#exam-term').selectOption('Term 1');
  await page.locator('#exam-paper-0-class').selectOption({ label: '5-B' });
  await page.locator('#exam-paper-0-subject').selectOption({ label: 'Mathematics' });
  await page.locator('#exam-paper-0-date').fill(indiaDay(0));
  await page.locator('#exam-paper-0-max-written').fill('80');
  await page.locator('#exam-paper-0-max-oral').fill('20');
  await page.locator('[data-exam-add-paper]').click();
  await page.locator('#exam-paper-1-class').selectOption({ label: '6-A' });
  await page.locator('#exam-paper-1-subject').selectOption({ label: 'English' });
  await page.locator('#exam-paper-1-max-oral').fill('');
  await page.locator('[data-exam-make-save]').click();
  await page.locator('[data-exams-note="ok"]').waitFor({ timeout: 20000 });
  await page.locator('[data-exam] h3', { hasText: 'Half-yearly (harness)' }).waitFor({ timeout: 20000 });
  examsMadeSeen = {
    exams: await page.locator('[data-exam]').count(),
    waiting: await page.locator('[data-to-enter]').count(),
    englishEntered: await page.locator(`[data-paper="${X_ENGLISH}"]`).getAttribute('data-paper-entered'),
  };
  await page.evaluate(() => window.scrollTo(0, 0));
};
const examsMakeDone = async () => {
  const { rows } = await db.pg.query(
    `select e.name, e.term, e.created_by, c.name as class, s.name as subject, p.components, p.paper_date::text as day,
            (select count(*)::int from audit_log a where a.school_id = e.school_id and a.event_action = 'exam.made' and a.target_id = e.exam_id::text and a.actor_user_id = e.created_by) as audits
       from exams e join exam_papers p on p.exam_id = e.exam_id join classes c on c.class_id = p.class_id join subjects s on s.subject_id = p.subject_id
      where e.school_id = $1 and e.name = 'Half-yearly (harness)' order by c.name`,
    [SCHOOL]
  );
  await db.pg.exec(`set session_replication_role = replica;
    delete from exam_papers where exam_id in (select exam_id from exams where school_id = '${SCHOOL}' and name = 'Half-yearly (harness)');
    delete from exams where school_id = '${SCHOOL}' and name = 'Half-yearly (harness)';
    delete from audit_log where school_id = '${SCHOOL}' and event_action = 'exam.made';
    set session_replication_role = origin;`);
  const want = [
    { name: 'Half-yearly (harness)', term: 'Term 1', created_by: PEOPLE.principal.sub, class: '5-B', subject: 'Mathematics', components: [{ key: 'written', max: 80, name: 'Written', share: 80 }, { key: 'oral', max: 20, name: 'Oral', share: 20 }], day: indiaDay(0), audits: 1 },
    { name: 'Half-yearly (harness)', term: 'Term 1', created_by: PEOPLE.principal.sub, class: '6-A', subject: 'English', components: [{ key: 'written', max: 80, name: 'Written', share: 80 }], day: indiaDay(0), audits: 1 },
  ];
  if (JSON.stringify(rows) !== JSON.stringify(want)) throw new Error(`the exam made in the database: ${JSON.stringify(rows)}`);
  // Two exams listed; waiting: 5-A Mathematics and the two new papers (5-A English is entered).
  if (JSON.stringify(examsMadeSeen) !== JSON.stringify({ exams: 2, waiting: 3, englishEntered: 'yes' })) throw new Error(`the exams on the screen: ${JSON.stringify(examsMadeSeen)}`);
};
// The class result of 5-A: in roll order, with each subject's percent and grade by the scheme. Roll 1: English
// Written 21 of 40 and Oral 6 of 10, 54 percent, B; Mathematics 25 of 40 and 5 of 10, 60 percent, B; overall 57, B.
// Mathematics is not entered yet for rolls 7 to 9, so they have no percent there and no overall.
let resultSeen = null;
const examsResult = async (page) => {
  if (!(await db.pg.query(`select 1 from exams where exam_id = $1`, [X_EXAM])).rows.length) await examsFixture();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-class-result-view]').waitFor({ timeout: 20000 });
  const order = await page.locator('[data-result-cards] [data-result-child]').evaluateAll((els) => els.map((e) => e.getAttribute('data-result-child')));
  const wide = (await page.viewportSize()).width >= 768;
  const first = wide ? page.locator('[data-result-table] tbody tr').first() : page.locator('[data-result-cards] > li').first();
  resultSeen = { order, first: (await first.innerText()).replace(/\s+/g, ' '), ranked: /\brank|position|topper/i.test((await page.locator('[data-module-page]').innerText()).replace(/No child is ranked/g, '')), last: (wide ? await page.locator('[data-result-table] tbody tr').last().innerText() : await page.locator('[data-result-cards] > li').last().innerText()).replace(/\s+/g, ' ') };
};
const examsResultDone = async () => {
  const seen = resultSeen ?? {};
  const want = X_KIDS.map(xKid);
  if (JSON.stringify(seen.order) !== JSON.stringify(want)) throw new Error(`the result is not in roll order: ${JSON.stringify(seen.order)}`);
  if (!/54%/.test(seen.first ?? '') || !/60%/.test(seen.first ?? '') || !/57%/.test(seen.first ?? '') || !/Grade B/.test(seen.first ?? '')) throw new Error(`roll 1 on the screen: ${seen.first}`);
  if (!/not entered yet/.test(seen.last ?? '')) throw new Error(`roll 9 on the screen: ${seen.last}`);
  if (seen.ranked !== false) throw new Error('the result screen says rank, position or topper');
};
// A teacher's exams: the paper waiting for her marks (5-A Mathematics), not the one that is entered.
let teacherExamsSeen = null;
const examsTeacher = async (page) => {
  if (!(await db.pg.query(`select 1 from exams where exam_id = $1`, [X_EXAM])).rows.length) await examsFixture();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-exams-to-enter]').waitFor({ timeout: 20000 });
  teacherExamsSeen = { waiting: await page.locator('[data-to-enter]').evaluateAll((els) => els.map((e) => e.getAttribute('data-to-enter'))), make: await page.locator('[data-exam-make]').count() };
};
const examsTeacherDone = async () => {
  if (JSON.stringify(teacherExamsSeen) !== JSON.stringify({ waiting: [X_MATHS], make: 0 })) throw new Error(`the teacher's exams: ${JSON.stringify(teacherExamsSeen)}`);
};
// Tara enters the last three children of 5-A Mathematics on her phone: a mark above the maximum is shown as wrong and
// cannot be saved; roll 8 is absent in Written. Saved, the paper is entered. Then every row is taken away.
let entrySeen = null;
const examsEntry = async (page) => {
  if (!(await db.pg.query(`select 1 from exams where exam_id = $1`, [X_EXAM])).rows.length) await examsFixture();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-paper-entry]').waitFor({ timeout: 20000 });
  const cell = (g, part) => page.locator(`#mark-${xKid(g)}-${part}`);
  await cell(19, 'written').fill('45');
  const wrongShown = await page.locator(`[data-entry-child="${xKid(19)}"] [role="alert"]`).count();
  const saveDisabled = await page.locator('[data-marks-save]').first().isDisabled();
  await cell(19, 'written').fill('33');
  await cell(19, 'oral').fill('7');
  await page.locator(`[data-entry-child="${xKid(22)}"] [data-mark-cell="written"] [data-mark-kind="absent"]`).click();
  await cell(22, 'oral').fill('9');
  await cell(25, 'written').fill('25.5');
  await cell(25, 'oral').fill('6');
  await page.locator('[data-marks-save]').first().click();
  await page.locator('[data-entry-state="entered"]').waitFor({ timeout: 20000 });
  entrySeen = { wrongShown, saveDisabled, note: await page.locator('[data-entry-note]').textContent() };
  await page.evaluate(() => window.scrollTo(0, 0));
};
const examsEntryDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from marks where paper_id = $1) as marks,
            (select count(*)::int from marks where paper_id = $1 and entered_by = $2) as hers,
            (select kind || ':' || coalesce(score::text, '-') from marks where paper_id = $1 and student_id = $3 and component = 'written') as absent,
            (select score::text from marks where paper_id = $1 and student_id = $4 and component = 'written') as decimal,
            (select entered_by = $2 and entered_at is not null from exam_papers where paper_id = $1) as entered,
            (select count(*)::int from audit_log where event_action = 'exam_paper.marks_saved' and target_id = $1::text and actor_user_id = $2) as audits`,
    [X_MATHS, PEOPLE.teacher.sub, xKid(22), xKid(25)]
  );
  await examsPutBack();
  const want = [{ marks: 18, hers: 18, absent: 'absent:-', decimal: '25.5', entered: true, audits: 1 }];
  if (JSON.stringify(rows) !== JSON.stringify(want)) throw new Error(`the marks in the database: ${JSON.stringify(rows)}`);
  if (entrySeen?.wrongShown !== 1 || entrySeen?.saveDisabled !== true || !/the paper is entered/.test(entrySeen?.note ?? '')) throw new Error(`the marks on the screen: ${JSON.stringify(entrySeen)}`);
};
// p6-9b end
// p6-9c begin
// Publish and report cards (C215), on C214's fixture: "Unit test 1 (harness)" for 5-A with every paper entered (the
// fixture's last three children get their Mathematics marks here), in a session made for these screens so the card
// counts attendance from the seed. Each screen's check takes away every row it made and puts C214's fixture back as
// it was before the screen: there when C214's screens made it (they run first for the same person), gone otherwise.
// The screen's address needs the fixture: a run of these screens alone starts with C214's app-exams-list, which
// makes it.
const RC_SESSION = '00000000-0000-4000-8000-00000009c5e1';
const RC_EARLIER = '00000000-0000-4000-8000-00000009ce01';
const rcRoute = `/api/app/exams/${X_EXAM}/classes/${X_5A}/report-cards`;
let rcSubscriptionBefore;
let rcHadFixture;
const clearReportCards = async () => {
  await db.pg.exec(`set session_replication_role = replica;
    delete from report_remarks where school_id = '${SCHOOL}';
    delete from co_scholastic_grades where school_id = '${SCHOOL}';
    delete from exam_publications where school_id = '${SCHOOL}';
    delete from audit_log where school_id = '${SCHOOL}' and event_action in ('exam.published', 'exam.reopened', 'exam.remarks_saved', 'exam.co_scholastic_saved');
    set session_replication_role = origin;`);
};
const rcFixture = async ({ earlier }) => {
  if (rcHadFixture === undefined) rcHadFixture = (await db.pg.query(`select 1 from exams where exam_id = $1`, [X_EXAM])).rows.length > 0;
  await clearReportCards();
  await examsFixture();
  await db.pg.query(`delete from academic_sessions where session_id = $1`, [RC_SESSION]);
  await db.pg.query(`insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ($1, $2, '2026-27 (harness)', $3::date, $4::date, false)`, [RC_SESSION, SCHOOL, indiaDay(150), indiaDayFromNow(200)]);
  await db.pg.query(`update exams set session_id = $2 where exam_id = $1`, [X_EXAM, RC_SESSION]);
  for (const g of X_KIDS.filter((k) => k > 16)) {
    for (const [component, score] of [['written', 20 + (g % 9)], ['oral', 5 + (g % 4)]]) {
      await db.pg.query(
        `insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score, entered_by)
         select $1, p.exam_id, p.subject_id, p.paper_id, $3, $4, 'score', $5, 0, $6 from exam_papers p where p.paper_id = $2`,
        [SCHOOL, X_MATHS, component, xKid(g), score, PEOPLE.teacher.sub]
      );
    }
  }
  await db.pg.query(`update exam_papers set entered_by = $2 where paper_id = $1`, [X_MATHS, PEOPLE.teacher.sub]);
  if (rcSubscriptionBefore === undefined) rcSubscriptionBefore = (await db.pg.query(`select plan_id from school_subscriptions where school_id = $1`, [SCHOOL])).rows[0] ?? null;
  await db.pg.query(`insert into school_subscriptions (school_id, plan_id) values ($1, 'compass') on conflict (school_id) do update set plan_id = 'compass'`, [SCHOOL]);
  if (!earlier) return;
  // An earlier exam, "Unit test 0 (harness)", forty days ago: every child Mathematics 16 and 4 (40 percent) and English
  // 20 and 5 (50). Published through the app as the principal, so each child's own history is real.
  await db.pg.query(`insert into exams (exam_id, school_id, name, term, session_id, created_by) values ($1, $2, 'Unit test 0 (harness)', 'Term 1', $3, $4)`, [RC_EARLIER, SCHOOL, RC_SESSION, PEOPLE.principal.sub]);
  const parts = JSON.stringify([{ key: 'written', name: 'Written', max: 40, share: 80 }, { key: 'oral', name: 'Oral', max: 10, share: 20 }]);
  for (const [subject, written, oral] of [['00000000-0000-4000-8000-0000000d0001', 16, 4], ['00000000-0000-4000-8000-0000000d0002', 20, 5]]) {
    const paper = (await db.pg.query(`insert into exam_papers (school_id, exam_id, class_id, subject_id, paper_date, components, created_by) values ($1, $2, $3, $4, $5::date, $6::jsonb, $7) returning paper_id`, [SCHOOL, RC_EARLIER, X_5A, subject, indiaDay(40), parts, PEOPLE.principal.sub])).rows[0].paper_id;
    for (const g of X_KIDS) {
      for (const [component, score] of [['written', written], ['oral', oral]]) {
        await db.pg.query(`insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score, entered_by) values ($1, $2, $3, $4, $5, $6, 'score', $7, 0, $8)`, [SCHOOL, RC_EARLIER, subject, paper, component, xKid(g), score, PEOPLE.teacher.sub]);
      }
    }
    await db.pg.query(`update exam_papers set entered_by = $2 where paper_id = $1`, [paper, PEOPLE.teacher.sub]);
  }
  await rcAs(PEOPLE.principal, `/api/app/exams/${RC_EARLIER}/classes/${X_5A}/report-cards`, { action: 'publish' });
};
// A write through the app, as that person.
const rcAs = async (person, route, body) => {
  const res = await fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: `nca_access=${await cookieFor(person, secret)}` }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${route} answered ${res.status}: ${await res.text()}`);
};
const rcPutBack = async () => {
  await clearReportCards();
  if (rcHadFixture) await examsFixture();
  else await examsPutBack();
  rcHadFixture = undefined;
  await db.pg.query(`delete from academic_sessions where session_id = $1`, [RC_SESSION]);
  if (rcSubscriptionBefore === null) await db.pg.query(`delete from school_subscriptions where school_id = $1`, [SCHOOL]);
  else if (rcSubscriptionBefore) await db.pg.query(`update school_subscriptions set plan_id = $2 where school_id = $1`, [SCHOOL, rcSubscriptionBefore.plan_id]);
  rcSubscriptionBefore = undefined;
};
// The principal publishes 5-A: the marks are then frozen, by the database too. She reopens it with a reason; the
// picture shows the reopened result with its history, ready to be published again.
const RC_REASON = 'Roll 3’s English oral was entered as 6; the paper says 8.';
let rcPublishSeen = null;
const rcPublish = async (page) => {
  await rcFixture({ earlier: false });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-report-cards]').waitFor({ timeout: 20000 });
  await page.locator('[data-rc-publish-button]').click();
  await page.locator('[data-report-cards][data-published="1"]').waitFor({ timeout: 20000 });
  const downloadAll = await page.locator('[data-rc-download-all]').count();
  const frozen = await db.pg.query(`update marks set score = 1 where paper_id = $1 and kind = 'score'`, [X_MATHS]).then(() => false, (e) => /frozen/.test(e.message));
  await page.locator('#rc-reason').fill(RC_REASON);
  await page.locator('[data-rc-reopen-button]').click();
  await page.locator('[data-report-cards][data-published="no"] [data-rc-reopened]').waitFor({ timeout: 20000 });
  rcPublishSeen = { downloadAll, frozen, publishReady: await page.locator('[data-rc-publish-button]').isEnabled(), history: await page.locator('[data-rc-history] li').count() };
  await page.evaluate(() => window.scrollTo(0, 0));
};
const rcPublishDone = async () => {
  const { rows } = await db.pg.query(
    `select x.version, x.scheme_version, x.published_by, x.reopened_by, x.reopen_reason, x.reopened_at is not null as reopened,
            (select count(*)::int from audit_log a where a.school_id = x.school_id and a.event_action = 'exam.published' and a.actor_user_id = x.published_by) as published_audits,
            (select count(*)::int from audit_log a where a.school_id = x.school_id and a.event_action = 'exam.reopened' and a.actor_user_id = x.reopened_by and a.target_id = x.publication_id::text and a.after_state ->> 'reasoned' = 'true') as reopened_audits
       from exam_publications x where x.school_id = $1 and x.exam_id = $2 and x.class_id = $3`,
    [SCHOOL, X_EXAM, X_5A]
  );
  await rcPutBack();
  const p = PEOPLE.principal.sub;
  const want = [{ version: 1, scheme_version: 1, published_by: p, reopened_by: p, reopen_reason: RC_REASON, reopened: true, published_audits: 1, reopened_audits: 1 }];
  if (JSON.stringify(rows) !== JSON.stringify(want)) throw new Error(`the publication in the database: ${JSON.stringify(rows)}`);
  if (JSON.stringify(rcPublishSeen) !== JSON.stringify({ downloadAll: 1, frozen: true, publishReady: true, history: 1 })) throw new Error(`the publish screen: ${JSON.stringify(rcPublishSeen)}`);
};
// Tara, the class teacher, writes roll 1's remark and the principal publishes, both through the app (so each child's
// own progress is kept). The school admin shows roll 1's card and downloads it as a PDF: Unit test 0 had Mathematics
// 40 and English 50; now 60 and 54. Personal Best in Mathematics (60 against her own 40); English's 4 points are under
// the floor; Most Improved, Mathematics. The plan is Compass for these screens.
const RC_REMARK = 'Reads aloud with confidence and helps her group with sums.';
// The database keeps a record's keys in its own order: compared with the keys sorted.
const rcCanon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
let rcCardSeen = null;
const rcCard = async (page) => {
  await rcFixture({ earlier: true });
  await rcAs(PEOPLE.teacher, rcRoute, { action: 'remarks', remarks: [{ studentId: xKid(1), remark: RC_REMARK }] });
  await rcAs(PEOPLE.principal, rcRoute, { action: 'publish' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-report-cards][data-published="1"]').waitFor({ timeout: 20000 });
  const first = page.locator(`[data-rc-child="${xKid(1)}"]`);
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), first.locator('[data-rc-download]').click()]);
  const bytes = readFileSync(await download.path());
  await first.locator('[data-rc-show]').click();
  await first.locator('[data-rc-card]').waitFor({ timeout: 20000 });
  const card = (await first.locator('[data-rc-card]').innerText()).replace(/\s+/g, ' ');
  rcCardSeen = {
    pdf: bytes.subarray(0, 5).toString('latin1') === '%PDF-' && bytes.length > 20000,
    file: download.suggestedFilename(),
    remarkEditable: await page.locator('[data-rc-remark]').count(),
    order: await page.locator('[data-rc-child]').evaluateAll((els) => els.map((e) => e.getAttribute('data-rc-child'))),
    card,
  };
  await first.scrollIntoViewIfNeeded();
};
const rcCardDone = async () => {
  const { rows } = await db.pg.query(
    `select r.remark, r.written_by, x.recognition -> $3 as own
       from report_remarks r join exam_publications x on x.school_id = r.school_id and x.exam_id = r.exam_id and x.class_id = r.class_id and x.reopened_at is null
      where r.school_id = $1 and r.exam_id = $2`,
    [SCHOOL, X_EXAM, xKid(1)]
  );
  await rcPutBack();
  const seen = rcCardSeen ?? {};
  const want = [{ remark: RC_REMARK, written_by: PEOPLE.teacher.sub, own: { first: false, personalBest: [{ subjectId: '00000000-0000-4000-8000-0000000d0001', now: 60, best: 40 }], mostImproved: { subjectId: '00000000-0000-4000-8000-0000000d0001', now: 60, before: 40, examId: RC_EARLIER } } }];
  if (rcCanon(rows) !== rcCanon(want)) throw new Error(`the remark and the kept progress: ${JSON.stringify(rows[0]?.own ?? rows)}`);
  if (!seen.pdf || !/^report-card_Unit_test_1_harness_5-A_1\.pdf$/.test(seen.file ?? '') || seen.remarkEditable !== 0) throw new Error(`the download: ${JSON.stringify({ pdf: seen.pdf, file: seen.file, remarkEditable: seen.remarkEditable })}`);
  if (JSON.stringify(seen.order) !== JSON.stringify(X_KIDS.map(xKid))) throw new Error(`the children are not in roll order: ${JSON.stringify(seen.order)}`);
  for (const words of ['Mathematics | ', 'Personal Best: Mathematics, 60%, above their own earlier best of 40%.', 'Most Improved: Mathematics, from 40% in Unit test 0 (harness) to 60%.', 'Reads aloud with confidence', 'Attendance this session: present on', 'Publication 1 of this result']) {
    if (!(seen.card ?? '').includes(words.replace(' | ', ''))) throw new Error(`roll 1's card lacks "${words}": ${seen.card}`);
  }
  if (/\b(rank\w*|position\w*|topper\w*|merit\w*|percentile\w*)\b/i.test(seen.card ?? '')) throw new Error(`roll 1's card names a rank: ${seen.card}`);
};
// p6-9c end
// p6-9d begin
// The Curriculum Gap Detector (C216). A fixture on the seed's syllabus map of 5-A Mathematics (five units, none taught):
// lessons marked "Taught" for unit 1 (30 and 25 days ago) and unit 3 (20 days ago), and the exam "Unit test (harness
// 9d)" whose 5-A Mathematics paper, 15 days ago, assesses units 1 and 4. So: 1 taught and assessed, 2 skipped, 3 taught
// not assessed, 4 assessed before it was taught, 5 not taught yet. The module is switched on for the school (the seed
// predates it). Each screen's check takes every row away and puts the switch back as it was. The screen is for one
// academic session (C219): the exam belongs to the school's current session (one is made for the fixture when the
// school has none), and the lessons fall on its days.
const G_EXAM = '00000000-0000-4000-8000-00000009de01';
const G_SESSION = '00000000-0000-4000-8000-00000009dc01';
const G_PAPER = '00000000-0000-4000-8000-00000009df01';
const G_LESSONS = ['00000000-0000-4000-8000-00000009dd01', '00000000-0000-4000-8000-00000009dd02', '00000000-0000-4000-8000-00000009dd03'];
const G_5A = '00000000-0000-4000-8000-0000000c0051';
const G_MATHS = '00000000-0000-4000-8000-0000000d0001';
const G_TARA = '00000000-0000-4000-8000-0000000a2003';
let gEntitlementBefore;
const gapClear = async () => {
  await db.pg.query(`delete from exam_papers where paper_id = $1`, [G_PAPER]);
  await db.pg.query(`delete from exams where exam_id = $1`, [G_EXAM]);
  await db.pg.query(`delete from syllabus_progress where progress_id = any ($1::uuid[])`, [G_LESSONS]);
  await db.pg.query(`delete from academic_sessions where session_id = $1`, [G_SESSION]);
};
const gapUnit = async (topic) => (await db.pg.query(`select unit_id from syllabus_units where school_id = $1 and class_id = $2 and subject_id = $3 and topic = $4`, [SCHOOL, G_5A, G_MATHS, topic])).rows[0].unit_id;
const gapFixture = async () => {
  await gapClear();
  if (gEntitlementBefore === undefined) gEntitlementBefore = (await db.pg.query(`select enabled, source from school_module_entitlements where school_id = $1 and module_id = 'curriculum-gap'`, [SCHOOL])).rows[0] ?? null;
  await db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source) values ($1, 'curriculum-gap', true, 'plan') on conflict (school_id, module_id) do update set enabled = true`, [SCHOOL]);
  const [u1, u3, u4] = [await gapUnit('Halves and quarters'), await gapUnit('Fractions on the number line'), await gapUnit('Tenths')];
  for (const [id, unit, back] of [[G_LESSONS[0], u1, 30], [G_LESSONS[1], u1, 25], [G_LESSONS[2], u3, 20]]) {
    await db.pg.query(
      `insert into syllabus_progress (progress_id, school_id, teacher_id, class_id, subject_id, topic, status, date, unit_id) values ($1, $2, $3, $4, $5, 'Fractions (harness 9d)', 'taught', $6::date, $7)`,
      [id, SCHOOL, G_TARA, G_5A, G_MATHS, indiaDay(back), unit]
    );
  }
  const current = (await db.pg.query(`select session_id from academic_sessions where school_id = $1 and is_current`, [SCHOOL])).rows[0]?.session_id ?? null;
  if (!current) await db.pg.query(`insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ($1, $2, 'Harness session 9d', $3::date, $4::date, true)`, [G_SESSION, SCHOOL, indiaDay(60), indiaDayFromNow(300)]);
  await db.pg.query(`insert into exams (exam_id, school_id, name, created_by, session_id) values ($1, $2, 'Unit test (harness 9d)', $3, $4)`, [G_EXAM, SCHOOL, PEOPLE.principal.sub, current ?? G_SESSION]);
  await db.pg.query(
    `insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, paper_date, unit_ids, components, created_by)
     values ($1, $2, $3, $4, $5, $6::date, $7::uuid[], $8::jsonb, $9)`,
    [G_PAPER, SCHOOL, G_EXAM, G_5A, G_MATHS, indiaDay(15), [u1, u4], JSON.stringify([{ key: 'marks', name: 'Marks', max: 25, share: null }]), PEOPLE.principal.sub]
  );
};
const gapPutBack = async () => {
  await gapClear();
  if (gEntitlementBefore === null) await db.pg.query(`delete from school_module_entitlements where school_id = $1 and module_id = 'curriculum-gap'`, [SCHOOL]);
  else if (gEntitlementBefore) await db.pg.query(`update school_module_entitlements set enabled = $2, source = $3 where school_id = $1 and module_id = 'curriculum-gap'`, [SCHOOL, gEntitlementBefore.enabled, gEntitlementBefore.source]);
  gEntitlementBefore = undefined;
};
// The rows the screen read are still exactly the fixture's: a read changes nothing.
const gapUntouched = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from syllabus_progress where school_id = $1 and progress_id = any ($5::uuid[]) and unit_id is not null and status = 'taught') as lessons,
            (select count(*)::int from exam_papers where paper_id = $2 and cardinality(unit_ids) = 2) as papers,
            (select count(*)::int from syllabus_units where school_id = $1 and class_id = $3 and subject_id = $4) as units`,
    [SCHOOL, G_PAPER, G_5A, G_MATHS, G_LESSONS]
  );
  return rows[0];
};
// The principal: 5-A Mathematics, every unit once in the map's order, one in each state, and a count of each.
let gapSeen = null;
const gapPrincipal = async (page) => {
  await gapFixture();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-gap-units]').waitFor({ timeout: 20000 });
  gapSeen = {
    states: await page.locator('[data-gap-state]').evaluateAll((els) => els.map((e) => e.getAttribute('data-gap-state'))),
    counts: await page.locator('[data-gap-count]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-gap-count')}:${e.querySelector('span')?.textContent}`)),
    classes: await page.locator('#gap-class option').evaluateAll((els) => els.map((e) => e.textContent)),
    skipped: (await page.locator('[data-gap-state="skipped"] [data-gap-later]').textContent()) ?? '',
    session: (await page.locator('#gap-session').evaluate((e) => e.options[e.selectedIndex]?.textContent ?? '')) ?? '',
  };
};
const gapPrincipalDone = async () => {
  const untouched = await gapUntouched();
  await gapPutBack();
  if (JSON.stringify(untouched) !== JSON.stringify({ lessons: 3, papers: 1, units: 5 })) throw new Error(`the fixture in the database: ${JSON.stringify(untouched)}`);
  const want = {
    states: ['taught-assessed', 'skipped', 'taught-not-assessed', 'assessed-before-taught', 'not-yet-taught'],
    counts: ['assessed-before-taught:1', 'taught-assessed:1', 'taught-not-assessed:1', 'skipped:1', 'not-yet-taught:1'],
    classes: ['5-A', '5-B', '6-A'],
  };
  const { skipped, session, ...rest } = gapSeen ?? {};
  if (JSON.stringify(rest) !== JSON.stringify(want)) throw new Error(`the gaps on the screen: ${JSON.stringify(gapSeen)}`);
  if (!/Fractions on the number line/.test(skipped)) throw new Error(`the skipped unit does not say which later unit was taught: ${skipped}`);
  if (!/\(current\)$/.test(session ?? '')) throw new Error(`the session shown is not the current one: ${session}`);
};
// Tara, a teacher: only her own class is offered; English has no map in 5-A, so it says "Not set up", never zeros.
let gapTeacherSeen = null;
const gapTeacher = async (page) => {
  await gapFixture();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-gap-units]').waitFor({ timeout: 20000 });
  const states = await page.locator('[data-gap-state]').evaluateAll((els) => els.map((e) => e.getAttribute('data-gap-state')));
  await page.locator('#gap-subject').selectOption({ label: 'English (no syllabus map yet)' });
  await page.locator('[data-gap-not-set-up]').waitFor({ timeout: 20000 });
  gapTeacherSeen = {
    classes: await page.locator('#gap-class option').evaluateAll((els) => els.map((e) => e.textContent)),
    states,
    counts: await page.locator('[data-gap-count]').count(),
    notSetUp: (await page.locator('[data-gap-not-set-up]').innerText()).includes('Not set up'),
  };
};
const gapTeacherDone = async () => {
  await gapPutBack();
  const want = { classes: ['5-A'], states: ['taught-assessed', 'skipped', 'taught-not-assessed', 'assessed-before-taught', 'not-yet-taught'], counts: 0, notSetUp: true };
  if (JSON.stringify(gapTeacherSeen) !== JSON.stringify(want)) throw new Error(`the teacher's gaps on the screen: ${JSON.stringify(gapTeacherSeen)}`);
};
// p6-9d end
// p6-9e begin
// Learning Genome v1 (C217). A fixture for Aarav (5-A, roll 1), made up: two exams with their 5-A Mathematics and
// English papers entered (Mathematics 27 then 33 of 50, English 30 then 20 of 50), six Mathematics homeworks of which
// he did two and three English ones he did, and Tara's Fractions and Decimals lessons with his parent's Daily Pulse
// replies ("needs help" twice and "understood" once to Fractions; "understood" three times to Decimals). The module
// and a grading scheme are switched on for the school if it has none. Every row is taken away by each screen's check.
const GN = (n) => `00000000-0000-4000-8000-0000009e${n.toString(16).padStart(4, '0')}`;
const GN_5A = '00000000-0000-4000-8000-0000000c0051';
const GN_5B_KID = '00000000-0000-4000-8000-000000500002'; // Diya Example A, 5-B: not one of Tara's
const GN_5B = '00000000-0000-4000-8000-0000000c0052';
const GN_MATHS = '00000000-0000-4000-8000-0000000d0001';
const GN_ENGLISH = '00000000-0000-4000-8000-0000000d0002';
const GN_TARA = '00000000-0000-4000-8000-0000000a2003'; // her teachers row
const GN_PARENT = '00000000-0000-4000-8000-0000000e0001'; // Aarav's guardian in the seed
const GN_KIDS = [1, 4, 7, 10, 13, 16, 19, 22, 25]; // 5-A in the seed, roll 1 to 9
const gnKid = (g) => `00000000-0000-4000-8000-0000005${String(g).padStart(5, '0')}`;
const GN_CHILD = gnKid(1);
const GN_TOPIC = 'Genome (harness)';
let gnEntitlementBefore;
const clearGenome = async () => {
  await db.pg.exec(`set session_replication_role = replica;
    delete from pulse_response_log where pulse_id in (select pulse_id from pulse_messages where topic = '${GN_TOPIC}');
    delete from pulse_messages where topic = '${GN_TOPIC}';
    delete from syllabus_progress where topic = '${GN_TOPIC}';
    delete from homework_status where target_id in (select target_id from homework_targets where title like 'Genome worksheet %');
    delete from homework_targets where title like 'Genome worksheet %';
    delete from homework where title like 'Genome worksheet %';
    delete from exam_publications where exam_id in ('${GN(1)}', '${GN(2)}');
    delete from marks where paper_id in (select paper_id from exam_papers where exam_id in ('${GN(1)}', '${GN(2)}'));
    delete from exam_papers where exam_id in ('${GN(1)}', '${GN(2)}');
    delete from exams where exam_id in ('${GN(1)}', '${GN(2)}');
    delete from grading_schemes where scheme_id = '${GN(9)}';
    set session_replication_role = origin;`);
};
const genomeFixture = async () => {
  await clearGenome();
  if (gnEntitlementBefore === undefined) gnEntitlementBefore = (await db.pg.query(`select enabled, source from school_module_entitlements where school_id = $1 and module_id = 'learning-genome'`, [SCHOOL])).rows[0] ?? null;
  await db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source) values ($1, 'learning-genome', true, 'plan') on conflict (school_id, module_id) do update set enabled = true`, [SCHOOL]);
  if (!(await db.pg.query(`select 1 from grading_schemes where school_id = $1`, [SCHOOL])).rows.length) {
    const scheme = {
      bands: [{ from: 75, to: 100, grade: 'A', meaning: null }, { from: 50, to: 74, grade: 'B', meaning: null }, { from: 33, to: 49, grade: 'C', meaning: null }, { from: 0, to: 32, grade: 'D', meaning: null }],
      decimals: 0, passMark: 33, components: [], terms: [{ name: 'Term 1' }],
      layout: { components: true, total: true, percent: true, grade: true, attendance: true, remarks: true, coScholastic: false }, coScholastic: null,
    };
    await db.pg.query(`insert into grading_schemes (scheme_id, school_id, version, scheme, made_by) values ($1, $2, 1, $3::jsonb, $4)`, [GN(9), SCHOOL, JSON.stringify(scheme), PEOPLE.principal.sub]);
  }
  await db.pg.query(`insert into exams (exam_id, school_id, name, created_by) values ($1, $3, 'Unit test 1 (genome)', $4), ($2, $3, 'Half-yearly (genome)', $4)`, [GN(1), GN(2), SCHOOL, PEOPLE.principal.sub]);
  const parts = JSON.stringify([{ key: 'marks', name: 'Marks', max: 50, share: null }]);
  // [paper, exam, subject, days back, Aarav's mark]; the other children's marks are made up from their number.
  const papers = [[GN(11), GN(1), GN_MATHS, 60, 27], [GN(12), GN(1), GN_ENGLISH, 59, 30], [GN(13), GN(2), GN_MATHS, 10, 33], [GN(14), GN(2), GN_ENGLISH, 10, 20]];
  for (const [paperId, examId, subjectId, back, his] of papers) {
    await db.pg.query(`insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, paper_date, components, created_by) values ($1, $2, $3, $4, $5, $6::date, $7::jsonb, $8)`, [paperId, SCHOOL, examId, GN_5A, subjectId, indiaDay(back), parts, PEOPLE.principal.sub]);
    for (const g of GN_KIDS) {
      await db.pg.query(
        `insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score, entered_by) values ($1, $2, $3, $4, 'marks', $5, 'score', $6, 50, $7)`,
        [SCHOOL, examId, subjectId, paperId, gnKid(g), g === 1 ? his : 20 + ((g * 7 + back) % 25), PEOPLE.teacher.sub]
      );
    }
  }
  await db.pg.query(`update exam_papers set entered_by = $2 where exam_id = any ($1::uuid[])`, [[GN(1), GN(2)], PEOPLE.teacher.sub]);
  // Both exams are published for 5-A (C219: an exam counts once it is published), by the scheme in force.
  for (const examId of [GN(1), GN(2)]) {
    await db.pg.query(
      `insert into exam_publications (school_id, exam_id, class_id, version, scheme_version, scheme, published_by)
       select $1, $2, $3, 1, g.version, g.scheme, $4 from grading_schemes g where g.school_id = $1 order by g.version desc limit 1`,
      [SCHOOL, examId, GN_5A, PEOPLE.principal.sub]
    );
  }
  // Homework: Mathematics due 25 to 30 days ago (he did the first two), English 6 to 8 days ago (he did all three).
  const work = [...[0, 1, 2, 3, 4, 5].map((i) => [GN_MATHS, 25 + i, i < 2]), ...[0, 1, 2].map((i) => [GN_ENGLISH, 6 + i, true])];
  for (const [i, [subjectId, back, done]] of work.entries()) {
    const [homeworkId, targetId] = [GN(100 + i), GN(200 + i)];
    await db.pg.query(`insert into homework (homework_id, school_id, subject_id, title, due_date, created_by) values ($1, $2, $3, $4, $5::date, $6)`, [homeworkId, SCHOOL, subjectId, `Genome worksheet ${i + 1}`, indiaDay(back), PEOPLE.teacher.sub]);
    await db.pg.query(`insert into homework_targets (target_id, school_id, homework_id, class_id, title, due_date) values ($1, $2, $3, $4, $5, $6::date)`, [targetId, SCHOOL, homeworkId, GN_5A, `Genome worksheet ${i + 1}`, indiaDay(back)]);
    for (const g of GN_KIDS) await db.pg.query(`insert into homework_status (school_id, target_id, class_id, student_id, done, checked_by) values ($1, $2, $3, $4, $5, $6)`, [SCHOOL, targetId, GN_5A, gnKid(g), g === 1 ? done : true, PEOPLE.teacher.sub]);
  }
  // Tara's lessons of the seed's syllabus map (Mathematics, 5-A) and the parent's replies (1 understood, 2 needs help).
  const lessons = [[1, 20, [2]], [2, 19, [2, 1]], [4, 5, [1, 1, 1]]];
  for (const [i, [position, back, tiers]] of lessons.entries()) {
    const [progressId, pulseId] = [GN(300 + i), GN(400 + i)];
    await db.pg.query(
      `insert into syllabus_progress (progress_id, school_id, teacher_id, class_id, subject_id, topic, status, date, unit_id)
       select $1, $2, $3, $4, $5, $6, 'taught', $7::date, u.unit_id from syllabus_units u where u.school_id = $2 and u.class_id = $4 and u.subject_id = $5 and u.position = $8`,
      [progressId, SCHOOL, GN_TARA, GN_5A, GN_MATHS, GN_TOPIC, indiaDay(back), position]
    );
    await db.pg.query(`insert into pulse_messages (pulse_id, school_id, class_id, subject_id, topic, exception_state, sent_on, status, source_progress_id) values ($1, $2, $3, $4, $5, 'taught', $6::date, 'draft', $7)`, [pulseId, SCHOOL, GN_5A, GN_MATHS, GN_TOPIC, indiaDay(back), progressId]);
    for (const tier of tiers) await db.pg.query(`insert into pulse_response_log (school_id, pulse_id, student_id, parent_id, tier, responded_at) values ($1, $2, $3, $4, $5, now() - $6::int * interval '1 day')`, [SCHOOL, pulseId, GN_CHILD, GN_PARENT, tier, back]);
  }
};
const genomePutBack = async () => {
  await clearGenome();
  if (gnEntitlementBefore === null) await db.pg.query(`delete from school_module_entitlements where school_id = $1 and module_id = 'learning-genome'`, [SCHOOL]);
  else if (gnEntitlementBefore) await db.pg.query(`update school_module_entitlements set enabled = $2, source = $3 where school_id = $1 and module_id = 'learning-genome'`, [SCHOOL, gnEntitlementBefore.enabled, gnEntitlementBefore.source]);
  gnEntitlementBefore = undefined;
};
// What the screen shows of a genome, read from the page.
const genomeSeen = async (page) => {
  const texts = (sel) => page.locator(sel).evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  return {
    strengths: await page.locator('[data-genome-findings="strengths"] [data-genome-finding]').evaluateAll((els) => els.map((e) => e.getAttribute('data-genome-finding'))),
    gaps: await page.locator('[data-genome-findings="gaps"] [data-genome-finding]').evaluateAll((els) => els.map((e) => e.getAttribute('data-genome-finding'))),
    mathsPercents: await texts(`[data-genome-subject="${GN_MATHS}"] [data-genome-percent]`),
    mathsHomework: (await texts(`[data-genome-subject="${GN_MATHS}"] [data-genome-homework]`))[0] ?? '',
    chapters: await page.locator('[data-genome-chapter]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-genome-chapter')}: ${e.querySelector('[data-genome-replies]').textContent}`)),
    overall: (await texts('[data-genome-overall]'))[0] ?? '',
    // The screen's own sentence that no child is ranked is not a ranking.
    ranked: /\brank|position|topper|percentile/i.test((await page.locator('[data-module-page]').innerText()).replace(/never ranked/g, '')),
  };
};
// The same numbers, from the rows themselves: each paper's percent, his homework in Mathematics in the last 90 days,
// and the replies to each chapter's lessons.
const genomeFromRows = async () => {
  const percents = (await db.pg.query(
    `select round(100.0 * m.score / m.max_score)::int as pct from marks m join exam_papers p on p.paper_id = m.paper_id
      where m.student_id = $1 and p.subject_id = $2 and p.exam_id in ($3, $4)
        and exists (select 1 from exam_publications x where x.exam_id = p.exam_id and x.class_id = p.class_id and x.reopened_at is null) order by p.paper_date`,
    [GN_CHILD, GN_MATHS, GN(1), GN(2)]
  )).rows.map((r) => r.pct);
  const hw = (await db.pg.query(
    `select count(*)::int as checked, (count(*) filter (where st.done))::int as done from homework_status st join homework_targets t on t.target_id = st.target_id join homework h on h.homework_id = t.homework_id
      where st.student_id = $1 and h.subject_id = $2 and t.due_date > (now() at time zone 'Asia/Kolkata')::date - 90`,
    [GN_CHILD, GN_MATHS]
  )).rows[0];
  const chapters = (await db.pg.query(
    `select u.chapter, (count(*) filter (where r.tier = 2))::int as help, (count(*) filter (where r.tier = 1))::int as ok from pulse_response_log r join pulse_messages pm on pm.pulse_id = r.pulse_id
       join syllabus_progress sp on sp.progress_id = pm.source_progress_id join syllabus_units u on u.unit_id = sp.unit_id where r.student_id = $1 group by u.chapter order by min(u.position)`,
    [GN_CHILD]
  )).rows.map((r) => `${r.chapter}: Needs help: ${r.help} · Understood: ${r.ok}`);
  return { percents, hw, chapters };
};
// The principal opens Aarav's genome from a link: the strengths and gaps, each paper's percent from his marks, his
// homework and the replies to each chapter, all equal to the rows they come from.
let genomeOfficeSeen = null;
const genomeOffice = async (page) => {
  await genomeFixture();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator(`[data-genome="${GN_CHILD}"]`).waitFor({ timeout: 20000 });
  genomeOfficeSeen = await genomeSeen(page);
};
const genomeOfficeDone = async () => {
  const rows = await genomeFromRows();
  await genomePutBack();
  const seen = genomeOfficeSeen ?? {};
  const want = {
    strengths: ['rising', 'above_own', 'understood'],
    gaps: ['falling', 'below_own', 'needs_help', 'homework'],
    mathsPercents: rows.percents.map((p) => `${p}% · Grade B`),
    homework: `Homework: ${rows.hw.done} done of ${rows.hw.checked} checked`,
    chapters: rows.chapters,
  };
  if (JSON.stringify(rows.percents) !== '[54,66]' || rows.hw.done !== 2 || rows.hw.checked !== 6) throw new Error(`the fixture: ${JSON.stringify(rows)}`);
  if (JSON.stringify([seen.strengths, seen.gaps, seen.mathsPercents, seen.chapters]) !== JSON.stringify([want.strengths, want.gaps, want.mathsPercents, want.chapters])) throw new Error(`the genome on the screen: ${JSON.stringify(seen)} against ${JSON.stringify(want)}`);
  if (!seen.mathsHomework?.startsWith(want.homework) || !/Half-yearly \(genome\): 53%/.test(seen.overall ?? '') || seen.ranked !== false) throw new Error(`the genome on the screen: ${JSON.stringify(seen)}`);
};
// Tara picks her class, then Aarav, on her phone: only her own class is offered; a 5-B child and 5-B itself are
// "not found" for her (asked straight of the API); she sees the replies to the lessons she taught.
let genomeTeacherSeen = null;
const genomeTeacher = async (page) => {
  await genomeFixture();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-genome-picker]').waitFor({ timeout: 20000 });
  const classes = await page.locator('#genome-class option').evaluateAll((els) => els.filter((e) => e.value).map((e) => e.textContent));
  await page.selectOption('#genome-class', GN_5A);
  await page.locator('#genome-child').waitFor({ timeout: 20000 });
  await page.selectOption('#genome-child', GN_CHILD);
  await page.locator(`[data-genome="${GN_CHILD}"]`).waitFor({ timeout: 20000 });
  const origin = new URL(page.url()).origin;
  const refused = [(await page.request.get(`${origin}/api/app/learning-genome/${GN_5B_KID}`)).status(), (await page.request.get(`${origin}/api/app/learning-genome?class=${GN_5B}`)).status()];
  genomeTeacherSeen = { classes, refused, remembered: new URL(page.url()).search, ownLessons: await page.locator('[data-genome-chapters]').innerText(), ...(await genomeSeen(page)) };
  await page.evaluate(() => window.scrollTo(0, 0));
};
const genomeTeacherDone = async () => {
  const rows = await genomeFromRows();
  await genomePutBack();
  const seen = genomeTeacherSeen ?? {};
  if (JSON.stringify(seen.classes) !== JSON.stringify(['5-A']) || JSON.stringify(seen.refused) !== JSON.stringify([404, 404])) throw new Error(`the teacher's genome: ${JSON.stringify(seen)}`);
  // A teacher of the child's class reads every chapter's replies, as the office does (C217, at integration): the
  // chapters are checked against the rows below; the screen no longer says "lessons you taught yourself".
  if (seen.remembered !== `?class=${GN_5A}&child=${GN_CHILD}` || !/Chapters/.test(seen.ownLessons ?? '') || seen.ranked !== false) throw new Error(`the teacher's genome: ${JSON.stringify(seen)}`);
  if (JSON.stringify(seen.chapters) !== JSON.stringify(rows.chapters) || JSON.stringify(seen.mathsPercents) !== JSON.stringify(rows.percents.map((p) => `${p}% · Grade B`))) throw new Error(`the teacher's genome: ${JSON.stringify(seen)} against ${JSON.stringify(rows)}`);
};
// p6-9e end
// p6-9f begin
// Early Warning v2, the marks reason (C218). Two exams of 5-A, each with a Mathematics and an English paper of 50 for
// every child on the roll, all entered: "Unit test 1 (harness 9f)" made a month ago and "Half-yearly (harness 9f)"
// two days ago, with a grading scheme (made up: whole percents, a pass mark of 33). Aarav (roll 1) has 42 and 42
// (84) then 14 and 15 (29): a fall of 55 points, and below the pass mark in both subjects. Meera (roll 2) has 40 and
// 40 (80) then 33 and 33 (66): a fall of 14, under the line of 15. Everyone else has 35 and 35, then 34 and 34. Every
// row is taken away after each screen; audit rows stay (the log is never cut).
const EWM_UT = '00000000-0000-4000-8000-00000009f001';
const EWM_HY = '00000000-0000-4000-8000-00000009f002';
const EWM_PAPERS = { utM: '00000000-0000-4000-8000-00000009f011', utE: '00000000-0000-4000-8000-00000009f012', hyM: '00000000-0000-4000-8000-00000009f021', hyE: '00000000-0000-4000-8000-00000009f022' };
const EWM_MATHS = '00000000-0000-4000-8000-0000000d0001';
const EWM_ENGLISH = '00000000-0000-4000-8000-0000000d0002';
const EWM_KIDS = [1, 4, 7, 10, 13, 16, 19, 22, 25]; // 5-A in the seed: Aarav is 1, Meera 4; the last waits for consent
const ewmKid = (g) => `00000000-0000-4000-8000-0000005${String(g).padStart(5, '0')}`;
const EWM_MEERA = ewmKid(4);
const ewmMark = (g, paper) => {
  const hy = paper === 'hyM' || paper === 'hyE';
  if (g === 1) return hy ? (paper === 'hyM' ? 14 : 15) : 42;
  if (g === 4) return hy ? 33 : 40;
  return hy ? 34 : 35;
};
const clearEarlyWarningMarks = async () => {
  await db.pg.exec(`set session_replication_role = replica;
    delete from exam_publications where school_id = '${SCHOOL}' and exam_id in ('${EWM_UT}', '${EWM_HY}');
    delete from marks where school_id = '${SCHOOL}' and exam_id in ('${EWM_UT}', '${EWM_HY}');
    delete from exam_papers where school_id = '${SCHOOL}' and exam_id in ('${EWM_UT}', '${EWM_HY}');
    delete from exams where school_id = '${SCHOOL}' and exam_id in ('${EWM_UT}', '${EWM_HY}');
    delete from grading_schemes where school_id = '${SCHOOL}';
    set session_replication_role = origin;`);
  await clearEarlyWarning();
};
const earlyWarningMarksFixture = async () => {
  await clearEarlyWarningMarks();
  const scheme = {
    bands: [{ from: 75, to: 100, grade: 'A', meaning: null }, { from: 50, to: 74, grade: 'B', meaning: null }, { from: 33, to: 49, grade: 'C', meaning: null }, { from: 0, to: 32, grade: 'D', meaning: null }],
    decimals: 0, passMark: 33, components: [], terms: [],
    layout: { components: true, total: true, percent: true, grade: true, attendance: true, remarks: true, coScholastic: false },
    coScholastic: null,
  };
  const parts = JSON.stringify([{ key: 'marks', name: 'Marks', max: 50, share: null }]);
  const papers = [['utM', EWM_UT, EWM_MATHS, 30], ['utE', EWM_UT, EWM_ENGLISH, 30], ['hyM', EWM_HY, EWM_MATHS, 2], ['hyE', EWM_HY, EWM_ENGLISH, 2]];
  const marks = papers.flatMap(([key, exam, subject]) => EWM_KIDS.map((g) => `('${SCHOOL}', '${exam}', '${subject}', '${EWM_PAPERS[key]}', 'marks', '${ewmKid(g)}', 'score', ${ewmMark(g, key)}, 50, '${PEOPLE.teacher.sub}')`));
  await db.pg.query(`insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 1, $2::jsonb, $3)`, [SCHOOL, JSON.stringify(scheme), PEOPLE.principal.sub]);
  await db.pg.exec(`set session_replication_role = replica;
    insert into exams (exam_id, school_id, name, status, created_by, created_at) values
      ('${EWM_UT}', '${SCHOOL}', 'Unit test 1 (harness 9f)', 'open', '${PEOPLE.principal.sub}', now() - interval '30 days'),
      ('${EWM_HY}', '${SCHOOL}', 'Half-yearly (harness 9f)', 'open', '${PEOPLE.principal.sub}', now() - interval '2 days');
    insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, components, created_by, entered_by, entered_at) values
      ${papers.map(([key, exam, subject, back]) => `('${EWM_PAPERS[key]}', '${SCHOOL}', '${exam}', '${CLASS_5A}', '${subject}', '${parts}'::jsonb, '${PEOPLE.principal.sub}', '${PEOPLE.teacher.sub}', now() - interval '${back - 1} days')`).join(',\n      ')};
    insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score, entered_by) values
      ${marks.join(',\n      ')};
    -- Both published for 5-A (C219: an exam counts for Early Warning once it is published).
    insert into exam_publications (school_id, exam_id, class_id, version, scheme_version, scheme, published_by) values
      ('${SCHOOL}', '${EWM_UT}', '${CLASS_5A}', 1, 1, '${JSON.stringify(scheme)}'::jsonb, '${PEOPLE.principal.sub}'),
      ('${SCHOOL}', '${EWM_HY}', '${CLASS_5A}', 1, 1, '${JSON.stringify(scheme)}'::jsonb, '${PEOPLE.principal.sub}');
    set session_replication_role = origin;`);
};
// What Aarav's marks reason must say, by hand from the marks above.
const ewmEvidence = () => ({
  exam: { examId: EWM_HY, name: 'Half-yearly (harness 9f)', className: '5-A', percent: 29, papers: [{ paperId: EWM_PAPERS.hyE, subject: 'English', percent: 30 }, { paperId: EWM_PAPERS.hyM, subject: 'Mathematics', percent: 28 }] },
  previous: { examId: EWM_UT, name: 'Unit test 1 (harness 9f)', className: '5-A', percent: 84, papers: [{ paperId: EWM_PAPERS.utE, subject: 'English', percent: 84 }, { paperId: EWM_PAPERS.utM, subject: 'Mathematics', percent: 84 }] },
  fell: { by: 55, points: 15 },
  belowPass: { subjects: [{ paperId: EWM_PAPERS.hyE, subject: 'English', part: null, percent: 30, passMark: 33 }, { paperId: EWM_PAPERS.hyM, subject: 'Mathematics', part: null, percent: 28, passMark: 33 }], atLeast: 2 },
  scheme: 1,
});
// The same object whatever order its keys are in.
const ewmSame = (a, b) => {
  const norm = (v) => (Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])])) : v);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
};
// The principal presses "Check now": Aarav's flag opens for marks, with the exams, papers and percents; Meera, who
// fell 14, is not flagged. Nothing is written for a parent.
let ewmBefore = null;
let ewmSeen = null;
const earlyWarningMarks = async (page) => {
  await earlyWarningMarksFixture();
  ewmBefore = { sending: await sendingRows() };
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-ew-check-now]').waitFor({ timeout: 20000 });
  await page.locator('[data-ew-check-now]').click();
  const flag = page.locator('[data-ew-flag="open"]', { hasText: 'Aarav Example A' });
  await flag.waitFor({ timeout: 20000 });
  await flag.locator('[data-ew-why] summary').click();
  await page.locator('[data-ew-rule-now] summary').click();
  const why = await flag.locator('[data-ew-evidence="marks"]').innerText();
  ewmSeen = {
    reasons: await flag.getAttribute('data-ew-reasons'),
    lines: await flag.locator('[data-ew-line="marks-fell"], [data-ew-line="marks-below"]').count(),
    fellLine: (await flag.locator('[data-ew-line="marks-fell"]').innerText()).includes('Half-yearly (harness 9f): 29 percent, down 55 points from 84 in Unit test 1 (harness 9f).'),
    fell: await flag.locator('[data-ew-marks-fell]').getAttribute('data-ew-marks-fell'),
    below: await flag.locator('[data-ew-marks-below]').getAttribute('data-ew-marks-below'),
    papers: await flag.locator('[data-ew-marks-paper]').count(),
    whySays: why.includes('Mathematics: 28 percent, pass mark 33') && why.includes('version 1') && why.includes('compared only with themselves'),
    ruleNow: (await page.locator('[data-ew-rule-marks]').innerText()).includes('fell by 15 points or more'),
    meera: await page.locator('[data-ew-flag="open"]', { hasText: 'Meera Example A' }).count(),
  };
};
const earlyWarningMarksDone = async () => {
  const { rows } = await db.pg.query(
    `select f.student_id, f.reasons, f.evidence, f.rule_version, f.opened_by, f.notified_parent from early_warning_flags f where f.school_id = $1 and f.resolved_at is null and 'marks' = any (f.reasons)`,
    [SCHOOL]
  );
  const after = { sending: await sendingRows() };
  await clearEarlyWarningMarks();
  const aarav = rows.find((r) => r.student_id === STUDENT);
  if (rows.length !== 1 || !aarav || JSON.stringify(aarav.reasons) !== '["marks"]' || aarav.rule_version !== 2 || aarav.opened_by !== PEOPLE.principal.sub || aarav.notified_parent) throw new Error(`the marks flags in the database: ${JSON.stringify(rows.map((r) => ({ ...r, evidence: undefined })))}`);
  if (!ewmSame(aarav.evidence.marks, ewmEvidence())) throw new Error(`Aarav's marks evidence: ${JSON.stringify(aarav.evidence.marks)}`);
  if (after.sending !== ewmBefore.sending) throw new Error(`a message was written or a job queued: ${ewmBefore.sending} then ${after.sending}`);
  const seen = { reasons: 'marks', lines: 2, fellLine: true, fell: '55', below: '2', papers: 4, whySays: true, ruleNow: true, meera: 0 };
  if (JSON.stringify(ewmSeen) !== JSON.stringify(seen)) throw new Error(`the marks flag on the screen: ${JSON.stringify(ewmSeen)}, wanted ${JSON.stringify(seen)}`);
};
// Tara, the class teacher of 5-A: the nightly check (the real job runner, as C210's screens run it) opens the flag
// with no person; she reads it and why. She cannot run the check.
let ewmTeacherSeen = null;
let ewmRound = null;
const earlyWarningMarksTeacher = async (page) => {
  await earlyWarningMarksFixture();
  ewmRound = await runSchoolCheck('early_warning_nightly_enqueue');
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-early-warning="teacher"]').waitFor({ timeout: 20000 });
  const flag = page.locator('[data-ew-flag="open"]', { hasText: 'Aarav Example A' });
  await flag.waitFor({ timeout: 20000 });
  await flag.locator('[data-ew-why] summary').click();
  const why = await flag.locator('[data-ew-why]').innerText();
  ewmTeacherSeen = {
    reasons: await flag.getAttribute('data-ew-reasons'),
    evidence: await flag.locator('[data-ew-evidence="marks"]').count(),
    byNightly: why.includes(', by the nightly check.'),
    checkNow: await page.locator('[data-ew-check-now]').count(),
    meera: await page.locator('[data-ew-flag="open"]', { hasText: 'Meera Example A' }).count(),
  };
};
const earlyWarningMarksTeacherDone = async () => {
  const { rows } = await db.pg.query(
    `select f.student_id, f.reasons, f.evidence, f.opened_by, f.opened_by_job from early_warning_flags f where f.school_id = $1 and f.resolved_at is null and 'marks' = any (f.reasons)`,
    [SCHOOL]
  );
  await clearEarlyWarningMarks();
  await schoolJobsClose();
  // The seeded school and the test school both have Early Warning on: two jobs, both done.
  if (ewmRound?.claimed !== 2 || ewmRound?.succeeded !== 2) throw new Error(`the runner's round: ${JSON.stringify(ewmRound)}`);
  const aarav = rows.find((r) => r.student_id === STUDENT);
  if (rows.length !== 1 || !aarav || aarav.opened_by !== null || aarav.opened_by_job !== 'early_warning.nightly' || !ewmSame(aarav.evidence.marks, ewmEvidence())) throw new Error(`the nightly check's marks flags: ${JSON.stringify(rows)}`);
  if (rows.some((r) => r.student_id === EWM_MEERA)) throw new Error('Meera, who fell 14 points, was flagged');
  const seen = { reasons: 'marks', evidence: 1, byNightly: true, checkNow: 0, meera: 0 };
  if (JSON.stringify(ewmTeacherSeen) !== JSON.stringify(seen)) throw new Error(`the marks flag on Tara's screen: ${JSON.stringify(ewmTeacherSeen)}, wanted ${JSON.stringify(seen)}`);
};
// p6-9f end
// c212-pricing begin
// Control → Billing & Plans, priced per enrolled student (C212, C219). Two screens.
// 1. The plan form: the founder opens Growth (a plan the migration seeds as data) and types a new price a month per
//    student; the yearly price is filled in as ten months. Nothing is saved: the check finds the plan as it was.
// 2. A school's terms and its amount due: the seeded school is billed on Growth for this screen (a subscription row
//    only; its modules stay as the seed left them). The founder chooses a year, adds a minimum of 30 students, a
//    discount of 10 percent and Parent AI complimentary for 30 days, each with a reason. The check works the amount
//    out again from the rows (max(enrolled students, minimum) x the yearly price, less the discount rounded half up),
//    compares it with the screen, and puts everything back. A reason's words are never in an audit row (C224): a
//    term's are on the term itself, the period's in the founder-only entitlement_change_reasons (C124).
const PRICING_REASON = 'harness-c212 agreed with the school';
const PRICING_FREE_DAYS = 30;
let pricingFormSeen = null;
let pricingGrowthBefore = null;
let pricingTermsSeen = null;
let pricingParentAiBefore = null;
const growthPlanRow = async () => (await db.pg.query(`select name, price_month_minor, price_year_minor, features, module_ids, whatsapp_messages_per_student_month, updated_by, updated_at from plans where plan_id = 'growth'`)).rows[0];
const pricingMoney = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pricingForm = async (page) => {
  pricingGrowthBefore = await growthPlanRow();
  const plan = page.locator('[data-billing-plan="growth"]');
  await plan.locator('[data-billing-plan-edit]').click();
  await page.locator('[data-billing-plan-form]').waitFor({ timeout: 20000 });
  const yearBefore = await page.locator('#plan-price-year').inputValue();
  await page.locator('#plan-price-month').fill('32');
  pricingFormSeen = {
    yearBefore,
    year: await page.locator('#plan-price-year').inputValue(),
    price: await plan.locator('[data-billing-price]').textContent(),
    messages: await page.locator('#plan-messages').inputValue(),
    messagesLine: await plan.locator('[data-billing-messages]').textContent(),
    features: await page.locator('[data-billing-feature]').evaluateAll((els) => els.filter((e) => e.checked).map((e) => e.getAttribute('data-billing-feature')).join()),
    examsListed: await page.locator('[data-billing-module="exams"]').evaluate((e) => e.checked),
  };
  await page.locator('[data-billing-plan-form]').scrollIntoViewIfNeeded();
};
const pricingFormDone = async () => {
  const after = await growthPlanRow();
  if (JSON.stringify(after) !== JSON.stringify(pricingGrowthBefore)) throw new Error(`the Growth plan changed though nothing was saved: ${JSON.stringify(after)}`);
  const seen = pricingFormSeen ?? {};
  // The form opens on the stored prices, and the yearly one follows the monthly one as ten months.
  if (seen.yearBefore !== '300' || seen.year !== '320' || !/₹30\.00 a month or ₹300\.00 a year, per enrolled student/.test(seen.price ?? '')) throw new Error(`the plan form's prices: ${JSON.stringify(seen)}`);
  // The messages included are left empty by the seed; the features and a module not built yet are listed as stored.
  if (seen.messages !== '' || !/not set yet/.test(seen.messagesLine ?? '') || seen.features !== 'principal-dashboard,staff-leave,rte-claim-desk,compliance-desk,timetable-generator' || seen.examsListed !== true) throw new Error(`the plan form's other fields: ${JSON.stringify(seen)}`);
};
const clearPricing = async () => {
  const freeAudits = `select audit_id from audit_log where school_id = '${SCHOOL}' and event_action = 'entitlement.module_changed' and target_id = 'parent-ai' and (after_state ->> 'source' = 'complimentary' or before_state ->> 'source' = 'complimentary')`;
  const termAudits = `select audit_id from audit_log where school_id = '${SCHOOL}' and event_action like 'billing.terms.%'`;
  await db.pg.exec(`set session_replication_role = replica;
    delete from entitlement_change_reasons where audit_id in (${freeAudits}) or audit_id in (${termAudits});
    delete from audit_log where audit_id in (${freeAudits});
    delete from audit_log where audit_id in (${termAudits});
    delete from school_billing_terms where school_id = '${SCHOOL}';
    delete from school_subscriptions where school_id = '${SCHOOL}';
    set session_replication_role = origin;`);
  // Parent AI back as the seed left it: on, from the plan.
  await db.pg.query(`update school_module_entitlements set enabled = true, source = 'plan', updated_at = now() where school_id = $1 and module_id = 'parent-ai' and source = 'complimentary'`, [SCHOOL]);
};
const pricingTerms = async (page) => {
  await clearPricing();
  pricingParentAiBefore = (await db.pg.query(`select enabled, source from school_module_entitlements where school_id = $1 and module_id = 'parent-ai'`, [SCHOOL])).rows[0] ?? null;
  await db.pg.query(`insert into school_subscriptions (school_id, plan_id) values ($1, 'growth')`, [SCHOOL]);
  await page.reload({ waitUntil: 'networkidle' });
  const school = page.locator(`[data-billing-school="${SCHOOL}"]`);
  await school.locator('[data-billing-terms]').click();
  await school.locator('[data-billing-working]').waitFor({ timeout: 20000 });
  const before = await school.locator('[data-billing-amount-due]').textContent();
  await page.locator(`#period-${SCHOOL}`).selectOption('year');
  await page.locator(`#period-why-${SCHOOL}`).fill(PRICING_REASON);
  await school.locator('[data-billing-period-save]').click();
  await page.waitForFunction(() => /period is saved/.test(document.querySelector('[data-billing-note]')?.textContent ?? ''), null, { timeout: 20000 });
  const addTerm = async (kind, fill, count) => {
    await school.locator('[data-billing-term-add]').click();
    await page.locator(`#term-kind-${SCHOOL}`).selectOption(kind);
    await fill();
    await page.locator(`#term-why-${SCHOOL}`).fill(PRICING_REASON);
    await school.locator('[data-billing-term-save]').click();
    await page.waitForFunction((n) => document.querySelectorAll('[data-billing-term]').length === n && !document.querySelector('[data-billing-term-form]'), count, { timeout: 20000 });
  };
  await addTerm('minimum', () => page.locator(`#term-minimum-${SCHOOL}`).fill('30'), 1);
  await addTerm('discount', () => page.locator(`#term-percent-${SCHOOL}`).fill('10'), 2);
  await addTerm('complimentary', async () => {
    await page.locator(`#term-module-${SCHOOL}`).selectOption('parent-ai');
    await page.locator(`#term-to-${SCHOOL}`).fill(indiaDayFromNow(PRICING_FREE_DAYS));
  }, 3);
  await school.locator('[data-billing-complimentary="parent-ai"]').waitFor({ timeout: 20000 });
  pricingTermsSeen = {
    before,
    period: await school.locator('[data-billing-period]').textContent(),
    schoolAmount: await school.locator('[data-billing-amount]').textContent(),
    enrolled: await school.locator('[data-billing-enrolled]').textContent(),
    amountDue: await school.locator('[data-billing-amount-due]').textContent(),
    working: await school.locator('[data-billing-working]').textContent(),
    terms: await school.locator('[data-billing-term]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-billing-term')}:${e.getAttribute('data-billing-term-state')}`).sort().join()),
  };
  await school.locator('[data-billing-terms-panel]').scrollIntoViewIfNeeded();
};
const pricingTermsDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from students where school_id = $1 and status = 'active') as enrolled,
            (select price_year_minor from plans where plan_id = 'growth') as year_price,
            (select billing_period from school_subscriptions where school_id = $1) as period,
            (select count(*)::int from school_billing_terms where school_id = $1 and created_by = $2 and reason = $3 and starts_on = $4::date) as terms,
            (select minimum_students from school_billing_terms where school_id = $1 and kind = 'minimum') as minimum,
            (select discount_bp from school_billing_terms where school_id = $1 and kind = 'discount') as discount,
            (select ends_on::text from school_billing_terms where school_id = $1 and kind = 'complimentary' and module_id = 'parent-ai') as free_until,
            (select count(*)::int from audit_log where school_id = $1 and event_action = 'billing.terms.added' and actor_user_id = $2 and after_state ->> 'reasoned' = 'true' and strpos(after_state::text, $3) = 0) as term_audits,
            (select count(*)::int from audit_log a join entitlement_change_reasons w on w.audit_id = a.audit_id where a.school_id = $1 and a.event_action = 'billing.terms.period_changed' and a.actor_user_id = $2 and w.reason = $3 and strpos(a.after_state::text, $3) = 0) as period_audits,
            (select enabled::text || ' ' || source from school_module_entitlements where school_id = $1 and module_id = 'parent-ai') as parent_ai`,
    [SCHOOL, PEOPLE.founder.sub, PRICING_REASON, indiaDayFromNow(0)]
  );
  await clearPricing();
  const back = (await db.pg.query(`select enabled, source from school_module_entitlements where school_id = $1 and module_id = 'parent-ai'`, [SCHOOL])).rows[0] ?? null;
  const r = rows[0];
  if (JSON.stringify(back) !== JSON.stringify(pricingParentAiBefore)) throw new Error(`Parent AI was not put back: ${JSON.stringify(back)}`);
  // Only the wrong fields are named: the report keeps the first 160 characters of a message.
  const stored = { period: 'year', terms: 3, minimum: 30, discount: 1000, free_until: indiaDayFromNow(PRICING_FREE_DAYS), term_audits: 3, period_audits: 1, parent_ai: 'true complimentary' };
  const off = Object.entries(stored).filter(([k, v]) => r[k] !== v);
  if (off.length) throw new Error(`a school's terms, in the database: ${JSON.stringify(off.map(([k, v]) => [k, r[k], v]))}`);
  // The amount, worked out here again from the rows, to the paisa.
  const billed = Math.max(r.enrolled, r.minimum);
  const gross = billed * Number(r.year_price);
  const amount = gross - Math.floor((gross * r.discount + 5000) / 10000);
  const seen = pricingTermsSeen ?? {};
  const want = {
    before: 'Choose a month or a year first',
    period: 'A year',
    schoolAmount: `${pricingMoney(amount)} for a year`,
    enrolled: `Enrolled students: ${r.enrolled}`,
    amountDue: `Amount due for a year: ${pricingMoney(amount)}`,
    terms: 'complimentary:in_force,discount:in_force,minimum:in_force',
  };
  const wrong = Object.entries(want).filter(([k, v]) => (seen[k] ?? '').trim() !== v);
  if (wrong.length) throw new Error(`a school's amount due, on the screen: ${JSON.stringify(wrong.map(([k, v]) => [k, seen[k], v]))}`);
  // The working shows each part: the minimum, the students billed, the plan's yearly price, the discount, and the free module.
  for (const words of [`Minimum billed students: ${r.minimum}`, `Billed for ${billed} students`, `${pricingMoney(Number(r.year_price))} a year, from the plan`, 'Discount of 10.00%', 'Complimentary, not charged']) {
    if (!(seen.working ?? '').includes(words)) throw new Error(`a school's amount due, the working lacks "${words}": ${seen.working}`);
  }
};
// c212-pricing end
// p7-10a begin
// Admissions (C221). Two enquiries are there first: one overdue (on "Follow up today") and one with no contact for
// twenty days (on "Gone quiet"). The principal records an enquiry for 5-A from WhatsApp, records the visit (the stage
// moves and the next follow-up is set) and admits the child: exactly one student record, waiting for consent, in
// 5-A, on 5-A's fee structure, and the enquiry says admitted with every step kept. The check reads the database and
// puts everything back (the audit rows stay: the log is never cut).
const ADM_CHILD = 'Riya Example N';
const ADM_DUE = 'e0000000-0000-4000-8000-0000000ad001';
const ADM_QUIET = 'e0000000-0000-4000-8000-0000000ad002';
const clearAdmissions = async () => {
  await db.pg.exec(`set session_replication_role = replica;
    delete from admission_events where school_id = '${SCHOOL}';
    delete from admission_enquiries where school_id = '${SCHOOL}';
    delete from students where school_id = '${SCHOOL}' and name = '${ADM_CHILD}';
    delete from fee_structure_items where structure_id in (select structure_id from fee_structures where school_id = '${SCHOOL}' and created_by = '${PEOPLE.principal.sub}');
    delete from fee_structures where school_id = '${SCHOOL}' and created_by = '${PEOPLE.principal.sub}';
    delete from fee_heads where school_id = '${SCHOOL}' and name = 'Harness admissions fee';
    set session_replication_role = origin;`);
};
let admissionsSeen = null;
let admissionsStructure = null;
const admissionsPipeline = async (page) => {
  await clearAdmissions();
  // Two enquiries recorded earlier, with their first step, as the database's owner (the steps are the app's to write).
  await db.pg.exec(`set session_replication_role = replica;
    insert into admission_enquiries (enquiry_id, school_id, child_name, guardian_name, phone, class_id, source, stage, owner_id, next_follow_up, next_step, created_by, created_at) values
      ('${ADM_DUE}', '${SCHOOL}', 'Anaya Example D', 'Kavita Example D', '+919800000102', '00000000-0000-4000-8000-0000000c0061', 'phone_call', 'visit_booked', '${PEOPLE.office.sub}', ${TODAY_SQL} - 1, 'Call to fix the visit', '${PEOPLE.office.sub}', now() - interval '3 days'),
      ('${ADM_QUIET}', '${SCHOOL}', 'Kabir Example Q', 'Meera Example Q', '+919800000101', '00000000-0000-4000-8000-0000000c0052', 'walk_in', 'visited', '${PEOPLE.principal.sub}', null, null, '${PEOPLE.principal.sub}', now() - interval '20 days');
    insert into admission_events (school_id, enquiry_id, kind, stage_to, owner_id, by_user, at, n) values
      ('${SCHOOL}', '${ADM_DUE}', 'recorded', 'visit_booked', '${PEOPLE.office.sub}', '${PEOPLE.office.sub}', now() - interval '3 days', 1),
      ('${SCHOOL}', '${ADM_QUIET}', 'recorded', 'visited', '${PEOPLE.principal.sub}', '${PEOPLE.principal.sub}', now() - interval '20 days', 1);
    set session_replication_role = origin;`);
  // 5-A's fee structure, set through the app's own fees API.
  await db.pg.query(`insert into academic_sessions (school_id, label, start_date, end_date, is_current) select $1, 'Harness session', ${TODAY_SQL} - 30, ${TODAY_SQL} + 300, not exists (select 1 from academic_sessions where school_id = $1 and is_current) where not exists (select 1 from academic_sessions where school_id = $1 and label = 'Harness session')`, [SCHOOL]);
  const session = (await db.pg.query(`select session_id, start_date::text as start_date from academic_sessions where school_id = $1 and label = 'Harness session'`, [SCHOOL])).rows[0];
  const made = await page.evaluate(async ({ session, classId }) => {
    const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
    const head = await post('/api/app/fees/heads', { name: 'Harness admissions fee' });
    const structure = await post('/api/app/fees/structures', { classId, sessionId: session.session_id, effectiveFrom: session.start_date, items: [{ headId: head.body.head?.head_id, amountMinor: 120000, frequency: 'monthly' }] });
    return [head.status, structure.status];
  }, { session, classId: CLASS_5A });
  if (made.join() !== '201,201') throw new Error(`the fee head or structure was not saved: ${made}`);
  // The screen's first-visit tour is not in the way of the clicks below.
  await db.pg.query(`update users set tours_seen = array_append(tours_seen, 'admissions') where user_id = $1 and not ('admissions' = any (tours_seen))`, [PEOPLE.principal.sub]);
  admissionsStructure = (await db.pg.query(`select structure_id from fee_structures where school_id = $1 and class_id = $2 and created_by = $3`, [SCHOOL, CLASS_5A, PEOPLE.principal.sub])).rows[0]?.structure_id ?? null;
  const day = (n) => db.pg.query(`select (${TODAY_SQL} + $1::int)::text as d`, [n]).then((r) => r.rows[0].d);
  await page.reload({ waitUntil: 'networkidle' });
  // Record an enquiry.
  await page.locator('[data-adm-new-open]').click();
  await page.locator('[data-adm-new]').waitFor({ timeout: 20000 });
  await page.locator('#adm-child').fill(ADM_CHILD);
  await page.selectOption('#adm-class', { label: '5-A' });
  await page.locator('#adm-guardian').fill('Sunita Example N');
  await page.locator('#adm-phone').fill('98000 00103');
  await page.selectOption('#adm-source', 'whatsapp');
  await page.locator('#adm-follow-up').fill(await day(0));
  await page.locator('#adm-next-step').fill('Visit on Saturday');
  await page.locator('[data-adm-record]').click();
  const card = () => page.locator('[data-adm-open] [data-enquiry]', { hasText: ADM_CHILD });
  await card().waitFor({ timeout: 20000 });
  // What happened: the family visited; the next follow-up is tomorrow.
  await card().locator('[data-adm-act] summary').click();
  await card().locator('[data-adm-act-note]').fill('Came with her father and saw the classrooms.');
  await card().locator('[data-adm-stage]').selectOption('visited');
  await card().locator('[data-adm-act-follow-up]').fill(await day(1));
  await card().locator('[data-adm-act-next-step]').fill('Bring the birth certificate');
  await card().locator('[data-adm-save]').click();
  await page.locator('[data-adm-open] [data-enquiry][data-stage="visited"]', { hasText: ADM_CHILD }).waitFor({ timeout: 20000 });
  // Admit.
  await card().locator('[data-adm-admit]').click();
  await card().locator('[data-adm-admit-form] input').first().fill('H-0103');
  await card().locator('[data-adm-admit-confirm]').click();
  await page.locator('[data-adm-note]', { hasText: 'is admitted' }).waitFor({ timeout: 20000 });
  await page.locator('[data-adm-waiting] [data-shown-row]', { hasText: ADM_CHILD }).waitFor({ timeout: 30000 });
  // The admitted enquiry and its steps, open for the picture.
  await page.locator('[data-adm-closed] > summary').click();
  const closed = page.locator('[data-adm-closed] [data-enquiry]', { hasText: ADM_CHILD });
  await closed.locator('[data-adm-steps] summary').click();
  await closed.locator('[data-adm-step]').nth(4).waitFor({ timeout: 20000 });
  admissionsSeen = {
    due: await page.locator('[data-adm-due]').getAttribute('data-count'),
    quiet: await page.locator('[data-adm-quiet]').getAttribute('data-count'),
    quietRow: (await page.locator('[data-adm-row="quiet"]').allTextContents()).join(' | '),
    note: (await page.locator('[data-adm-note]').textContent()) ?? '',
    steps: (await closed.locator('[data-adm-step]').evaluateAll((els) => els.map((e) => e.getAttribute('data-adm-step')))).join(),
  };
};
const admissionsPipelineDone = async () => {
  const enquiry = (await db.pg.query(`select enquiry_id, stage, student_id, admitted_structure_id, source, created_by from admission_enquiries where school_id = $1 and child_name = $2`, [SCHOOL, ADM_CHILD])).rows;
  const students = (await db.pg.query(`select student_id, class_id, status::text as status, admission_no from students where school_id = $1 and name = $2`, [SCHOOL, ADM_CHILD])).rows;
  const steps = enquiry[0] ? (await db.pg.query(`select kind, stage_from, stage_to from admission_events where enquiry_id = $1 order by n`, [enquiry[0].enquiry_id])).rows.map((r) => r.kind).join() : '';
  const seen = admissionsSeen;
  const structure = admissionsStructure;
  await clearAdmissions();
  const e = enquiry[0];
  if (enquiry.length !== 1 || e.stage !== 'admitted' || e.source !== 'whatsapp' || e.created_by !== PEOPLE.principal.sub || !structure || e.admitted_structure_id !== structure) throw new Error(`the enquiry in the database: ${JSON.stringify({ enquiry, structure })}`);
  if (students.length !== 1 || students[0].student_id !== e.student_id || students[0].class_id !== CLASS_5A || students[0].status !== 'pending_consent' || students[0].admission_no !== 'H-0103') throw new Error(`exactly one student record, waiting for consent, in 5-A: ${JSON.stringify(students)}`);
  if (steps !== 'recorded,note,stage,follow_up,stage') throw new Error(`the steps kept: ${steps}`);
  if (!seen || seen.due !== '1' || seen.quiet !== '1' || !seen.quietRow.includes('Kabir Example Q') || !seen.quietRow.includes('20 days') || !seen.note.includes('5-A’s fee structure') || seen.steps !== 'recorded,note,stage,follow_up,stage') throw new Error(`the screen: ${JSON.stringify(seen)}`);
};
// p7-10a end
// p7-10b begin
// The student data check (C222). The principal types what Aadhaar prints for a child of 5-A (an Aadhaar number is
// refused on the screen first, and nothing is saved), asks a parent about another child's differences (the draft is
// read, then sent through the send-gate), the parent's reply arrives in the conversation and is kept with the
// request, and the principal corrects the record. The class teacher of 5-A sees her own class only, and no button.
// Everything is put back: the rows, the child's gender, the school's sending settings and the consent added.
const DC_AARAV = '00000000-0000-4000-8000-000000500001';
const DC_MEERA = '00000000-0000-4000-8000-000000500004';
const DC_VIHAAN = '00000000-0000-4000-8000-000000500007';
const DC_DIYA_5B = '00000000-0000-4000-8000-000000500002';
const DC_RAJESH = '00000000-0000-4000-8000-0000000e0001';
let dcSchoolBefore = null;
let dcThreadExisted = false;
let dcSeen = null;
const clearDataCheck = async () => {
  await db.pg.exec(`set session_replication_role = replica;
    delete from data_check_requests where school_id = '${SCHOOL}'; delete from student_id_as_printed where school_id = '${SCHOOL}';
    delete from communication_log where template_name = 'data_check_request'; delete from jobs where type = 'whatsapp.send';
    delete from inbound_messages where provider_message_id like 'harness-10b-%';
    delete from consent_ledger where school_id = '${SCHOOL}' and student_id = '${DC_MEERA}' and notice_version = 'harness-10b';
    delete from whatsapp_templates where meta_template_id = 'harness-10b';
    update students set gender = 'not_given' where school_id = '${SCHOOL}';
    set session_replication_role = origin;`);
  if (!dcThreadExisted) await db.pg.query(`delete from message_threads where school_id = $1 and phone = '+919800000001'`, [SCHOOL]);
  if (dcSchoolBefore) await db.pg.query(`update schools set pilot_allow_outbound = $2, monthly_budget_paise = $3, quiet_hours_start = $4, quiet_hours_end = $5 where school_id = $1`, [SCHOOL, dcSchoolBefore.pilot_allow_outbound, dcSchoolBefore.monthly_budget_paise, dcSchoolBefore.quiet_hours_start, dcSchoolBefore.quiet_hours_end]);
};
// Two children of the school with what Aadhaar prints already typed: Meera (5-A: day and month swapped, no gender on
// the school record) and Vihaan (5-A) or Diya (5-B).
const typeTwo = async (second) => {
  await db.pg.query(
    `insert into student_id_as_printed (school_id, student_id, printed_name, printed_dob, printed_gender, typed_by)
     select s.school_id, s.student_id, case when s.student_id = $2 then s.name else 'Vihan Example' end,
            case when s.student_id = $2 then to_date(to_char(s.dob, 'YYYY-DD-MM'), 'YYYY-MM-DD') else s.dob end, 'female', $4
       from students s where s.school_id = $1 and s.student_id = any(array[$2, $3]::uuid[])`,
    [SCHOOL, DC_MEERA, second, PEOPLE.principal.sub]
  );
};
const dataCheckScreen = async (page) => {
  if (!dcSchoolBefore) dcSchoolBefore = (await db.pg.query(`select pilot_allow_outbound, monthly_budget_paise, quiet_hours_start::text, quiet_hours_end::text from schools where school_id = $1`, [SCHOOL])).rows[0];
  dcThreadExisted = (await db.pg.query(`select 1 from message_threads where school_id = $1 and phone = '+919800000001'`, [SCHOOL])).rows.length > 0;
  await clearDataCheck();
  await db.pg.query(`update schools set pilot_allow_outbound = true, monthly_budget_paise = 500000, quiet_hours_start = '00:00', quiet_hours_end = '00:00' where school_id = $1`, [SCHOOL]);
  await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, 'operational_communication', true, (enum_range(null::consent_method))[1], 'harness-10b'`, [SCHOOL, DC_MEERA]);
  await db.pg.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status, meta_template_id) values (null, 'data_check_request', 1, 'en', $1, '{school,child,details}', 'utility', 2880, 'approved', 'harness-10b')`, ['{{school}}: For UDISE+ and APAAR, {{child}}’s details in the school record must match Aadhaar. These differ: {{details}}. Please reply here with the correct details, or tell the school office. Please do not send the Aadhaar number.']);
  await typeTwo(DC_VIHAAN);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-data-check]').waitFor({ timeout: 20000 });
  // Typing what Aadhaar prints for Aarav, a child of 5-A not typed yet. An Aadhaar number is refused on the screen.
  await page.selectOption('#dc-class', { label: '5-A' });
  await page.selectOption('#dc-show', 'untyped');
  const aarav = page.locator(`[data-dc-child="${DC_AARAV}"]`);
  await aarav.locator('[data-dc-type]').click();
  await page.locator(`#dc-name-${DC_AARAV}`).fill('1234 5678 9012');
  const refused = (await aarav.locator('[data-dc-save]').isDisabled()) && (await aarav.getByText('That looks like an Aadhaar number').count()) > 0;
  await page.locator(`#dc-name-${DC_AARAV}`).fill('Aarav Example');
  await page.locator(`#dc-dob-${DC_AARAV}`).fill('2015-04-18');
  await page.selectOption(`#dc-gender-${DC_AARAV}`, 'male');
  await aarav.locator('[data-dc-save]').click();
  await aarav.waitFor({ state: 'detached', timeout: 20000 });
  // Asking Meera's parent: the draft is read, then sent.
  await page.selectOption('#dc-show', 'attention');
  const meera = page.locator(`[data-dc-child="${DC_MEERA}"]`);
  await meera.locator('[data-dc-ask]').click();
  await meera.locator('[data-dc-draft-button]').click();
  const words = (await meera.locator('[data-dc-words]').textContent({ timeout: 20000 })) ?? '';
  await meera.locator('[data-dc-send]').click();
  await meera.locator('[data-dc-request]').nth(1).waitFor({ timeout: 20000 });
  // The parent answers in the conversation (the stand-in provider delivered the message; no phone is reached).
  await db.pg.query(`update communication_log set status = 'sent' where template_name = 'data_check_request' and status = 'queued'`);
  const thread = (await db.pg.query(
    `insert into message_threads (school_id, phone, parent_id, last_inbound_at, unread) values ($1, '+919800000001', $2, now(), 1)
     on conflict (school_id, phone) do update set last_inbound_at = now() returning thread_id`,
    [SCHOOL, DC_RAJESH]
  )).rows[0].thread_id;
  await db.pg.query(`insert into inbound_messages (school_id, thread_id, provider, provider_message_id, body, is_stop, received_at) values ($1, $2, 'stand-in', 'harness-10b-' || $3, 'Aadhaar is right: born 6 August 2015. She is a girl.', false, now())`, [SCHOOL, thread, String(Date.now())]);
  await page.reload({ waitUntil: 'networkidle' });
  await meera.locator('[data-dc-reply]').first().waitFor({ timeout: 20000 });
  // The principal corrects the gender from the answer.
  const gender = meera.locator('[data-dc-request-field="gender"]');
  await gender.locator('select').selectOption('female');
  await gender.locator('[data-dc-correct]').click();
  await meera.locator('[data-dc-request="corrected"]').waitFor({ timeout: 20000 });
  dcSeen = {
    refused,
    words: words.startsWith('Illustrative Public School: For UDISE+ and APAAR, Meera Example A’s details') && words.includes('Date of birth: school record 08-06-2015, Aadhaar 06-08-2015'),
    replies: await meera.locator('[data-dc-reply]').count(),
    states: (await meera.locator('[data-dc-request]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-dc-request-field')}:${e.getAttribute('data-dc-request')}`).sort().join())),
  };
};
const dataCheckScreenDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from student_id_as_printed where student_id = $1 and printed_name = 'Aarav Example' and printed_gender = 'male' and typed_by = $3) as aarav,
            (select count(*)::int from student_id_as_printed where printed_name ~ '[0-9]') as digits,
            (select count(*)::int from data_check_requests r join communication_log l on l.log_id = r.message_log_id and l.template_name = 'data_check_request' and l.student_id = r.student_id
              where r.student_id = $2 and r.reply_message_id is not null) as answered,
            (select count(*)::int from data_check_requests where student_id = $2 and field = 'gender' and outcome = 'corrected' and corrected_to = 'female' and decided_by = $3) as corrected,
            (select gender from students where student_id = $2) as gender,
            (select count(*)::int from audit_log where event_action = 'student.data_check_corrected' and target_id = $2::text and actor_user_id = $3) as audited`,
    [DC_AARAV, DC_MEERA, PEOPLE.principal.sub]
  );
  await clearDataCheck();
  const r = rows[0];
  if (r.aarav !== 1 || r.digits !== 0 || r.answered !== 2 || r.corrected !== 1 || r.gender !== 'female' || r.audited < 1) throw new Error(`the data check in the database: ${JSON.stringify(r)}`);
  if (JSON.stringify(dcSeen) !== JSON.stringify({ refused: true, words: true, replies: 2, states: 'dob:answered,gender:corrected' })) throw new Error(`the data check on the screen: ${JSON.stringify(dcSeen)}`);
};
let dcTeacherSeen = null;
const dataCheckTeacher = async (page) => {
  dcThreadExisted = true;
  await clearDataCheck();
  await typeTwo(DC_DIYA_5B);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-data-check]').waitFor({ timeout: 20000 });
  await page.locator('[data-dc-child]').first().waitFor({ timeout: 20000 });
  dcTeacherSeen = {
    children: await page.locator('[data-dc-child]').evaluateAll((els) => els.map((e) => e.getAttribute('data-dc-child')).join()),
    classes: await page.locator('#dc-class option').evaluateAll((els) => els.map((e) => e.textContent).join()),
    buttons: await page.locator('[data-dc-type], [data-dc-ask], [data-dc-correct], [data-dc-close], [data-dc-attach]').count(),
    note: await page.locator('[data-dc-teacher]').count(),
  };
};
const dataCheckTeacherDone = async () => {
  await clearDataCheck();
  if (JSON.stringify(dcTeacherSeen) !== JSON.stringify({ children: DC_MEERA, classes: 'All classes,5-A', buttons: 0, note: 1 })) throw new Error(`the class teacher's data check: ${JSON.stringify(dcTeacherSeen)}`);
};
// p7-10b end
// p7-10c begin
// The RTE claim desk (C223): two children of 5-A are marked RTE and 5-A has a tuition of 1,200 a month in the
// harness session. On the page the principal types the state's rate (12,500) with its source, raises every ready
// claim, marks one paid with the state's reference, and adds a captured document with a note to a child's evidence.
// Each claim must be the lower of the rate and the year's fee, to the paisa; every change audited. Put back after.
const RTE_DOC = '00000000-0000-4000-8000-0000000c2231';
const RTE_HEAD = 'Harness RTE tuition';
let rteTagged = [];
let rteSeen = null;
let rteFrom = null;
const clearRte = async () => {
  await db.pg.exec(`set session_replication_role = replica;
    delete from rte_evidence where school_id = '${SCHOOL}'; delete from rte_claim_receipts where school_id = '${SCHOOL}'; delete from rte_claims where school_id = '${SCHOOL}'; delete from rte_rates where school_id = '${SCHOOL}';
    delete from captured_documents where document_id = '${RTE_DOC}';
    with gone as (delete from fee_structure_items where head_id in (select head_id from fee_heads where school_id = '${SCHOOL}' and name = '${RTE_HEAD}') returning structure_id)
    delete from fee_structures where structure_id in (select structure_id from gone);
    delete from fee_heads where school_id = '${SCHOOL}' and name = '${RTE_HEAD}';
    set session_replication_role = origin;`);
  // The RTE mark as it was (the trigger that guards it is for the app's role only).
  for (const s of rteTagged) await db.pg.query(`update students set rte_admission = $2, rte_entry_class = $3, rte_admitted_on = $4 where student_id = $1`, [s.student_id, s.rte_admission, s.rte_entry_class, s.rte_admitted_on]);
  rteTagged = [];
};
const rteDesk = async (page) => {
  await clearRte();
  rteFrom = (await db.pg.query(`select coalesce(max(audit_id), 0)::bigint as id from audit_log`)).rows[0].id;
  await db.pg.query(`insert into academic_sessions (school_id, label, start_date, end_date, is_current) select $1, 'Harness session', ${TODAY_SQL} - 30, ${TODAY_SQL} + 300, not exists (select 1 from academic_sessions where school_id = $1 and is_current) where not exists (select 1 from academic_sessions where school_id = $1 and label = 'Harness session')`, [SCHOOL]);
  const session = (await db.pg.query(`select session_id, start_date::text as start_date from academic_sessions where school_id = $1 order by is_current desc, (label = 'Harness session') desc limit 1`, [SCHOOL])).rows[0];
  const head = (await db.pg.query(`insert into fee_heads (school_id, name, is_mandatory) values ($1, $2, true) returning head_id`, [SCHOOL, RTE_HEAD])).rows[0].head_id;
  const structure = (await db.pg.query(`insert into fee_structures (school_id, class_id, academic_year, session_id, effective_from, created_by) select $1, $2, label, session_id, start_date, $3 from academic_sessions where session_id = $4 returning structure_id`, [SCHOOL, CLASS_5A, PEOPLE.principal.sub, session.session_id])).rows[0].structure_id;
  await db.pg.query(`insert into fee_structure_items (school_id, structure_id, head_id, amount_minor, frequency) values ($1, $2, $3, 120000, 'monthly')`, [SCHOOL, structure, head]);
  rteTagged = (await db.pg.query(`select student_id, rte_admission, rte_entry_class, rte_admitted_on::text as rte_admitted_on from students where school_id = $1 and class_id = $2 and status = 'active' order by name limit 2`, [SCHOOL, CLASS_5A])).rows;
  await db.pg.query(`update students set rte_admission = true, rte_entry_class = '5-A', rte_admitted_on = $2 where student_id = any($1::uuid[])`, [rteTagged.map((s) => s.student_id), session.start_date]);
  await db.pg.query(`insert into captured_documents (document_id, school_id, student_id, doc_type, storage_path, mime_type, size_bytes, uploaded_by) values ($1, $2, $3, 'birth_certificate', 'harness/rte/birth.pdf', 'application/pdf', 1000, $4)`, [RTE_DOC, SCHOOL, rteTagged[0].student_id, PEOPLE.principal.sub]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-rte-rate-none]').waitFor({ timeout: 20000 });
  await page.locator('#rte-rate').fill('12500');
  await page.locator('#rte-rate-source').fill('State RTE reimbursement notification for this year, as typed by the office');
  await page.locator('[data-rte-rate-save]').click();
  await page.locator('[data-rte-rate-now]').waitFor({ timeout: 20000 });
  await page.locator('[data-rte-raise-all]').click();
  await page.locator('[data-rte-state="raised"]').nth(1).waitFor({ timeout: 20000 });
  const first = page.locator(`[data-rte-child="${rteTagged[0].student_id}"]`);
  await first.locator('[data-rte-open-paid]').click();
  await first.locator('input[id^="rte-reference-"]').fill('PFMS/HARNESS/0001');
  await first.locator('[data-rte-paid-save]').click();
  await page.locator(`[data-rte-child="${rteTagged[0].student_id}"][data-rte-state="paid"]`).waitFor({ timeout: 20000 });
  await first.locator('[data-rte-evidence] summary').click();
  await first.locator('[data-rte-evidence-open]').click();
  await first.locator('select[id^="rte-kind-"]').selectOption('lottery');
  await first.locator('select[id^="rte-doc-"]').selectOption(RTE_DOC);
  await first.locator('input[id^="rte-note-"]').fill('Lottery list 3, number 14');
  await first.locator('[data-rte-evidence-add]').click();
  await first.locator('[data-rte-evidence-item="lottery"]').waitFor({ timeout: 20000 });
  rteSeen = {
    raised: await page.locator('[data-rte-state="raised"]').count(),
    paid: await page.locator('[data-rte-state="paid"]').count(),
    ageingYears: await page.locator('[data-rte-age-year]').count(),
  };
};
const rteDeskDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from rte_rates where school_id = $1 and rate_minor = 1250000 and typed_by = $2) as rates,
            (select count(*)::int from rte_claims where school_id = $1 and raised_by = $2) as claims,
            (select count(*)::int from rte_claims c where c.school_id = $1 and c.amount_minor = least(c.rate_minor, c.fee_minor) and c.rate_minor = 1250000
                and c.fee_minor = 120000 * (select (extract(year from age(date_trunc('month', s.end_date), date_trunc('month', s.start_date))) * 12 + extract(month from age(date_trunc('month', s.end_date), date_trunc('month', s.start_date))) + 1)::int from academic_sessions s where s.session_id = c.session_id)) as to_the_paisa,
            (select count(*)::int from rte_claims where school_id = $1 and state = 'paid' and reference = 'PFMS/HARNESS/0001' and settled_by = $2) as paid,
            (select count(*)::int from rte_evidence where school_id = $1 and document_id = $3 and kind = 'lottery' and note = 'Lottery list 3, number 14') as evidence,
            (select string_agg(event_action, ',' order by audit_id) from audit_log where audit_id > $4 and event_action like 'rte.%') as audited`,
    [SCHOOL, PEOPLE.principal.sub, RTE_DOC, rteFrom]
  );
  await clearRte();
  const r = rows[0];
  const want = { rates: 1, claims: 2, to_the_paisa: 2, paid: 1, evidence: 1, audited: 'rte.rate_typed,rte.claim_raised,rte.claim_raised,rte.claim_paid,rte.evidence_added' };
  if (JSON.stringify(r) !== JSON.stringify(want)) throw new Error(`the RTE desk in the database: ${JSON.stringify(r)}`);
  if (JSON.stringify(rteSeen) !== JSON.stringify({ raised: 1, paid: 1, ageingYears: 1 })) throw new Error(`the RTE desk on the screen: ${JSON.stringify(rteSeen)}`);
};
// p7-10c end
// p7-10d begin
// The compliance desk (C227). Tanvi's State TET is put to end in 20 days: the alert. On the page the principal records
// Tara's qualifications on the form (primary, CTET paper I, certificate 2022: no end date, so nothing ends), adds a
// disclosure item with where it comes from, and tags a typed note to SQAAF standard 2.8.1. The database must hold each,
// in the principal's name, audited (ids and codes only). The printable disclosure shows exactly the items in force.
// Put back after (the audit rows stay: the audit log is append-only).
const CDK_TARA = '00000000-0000-4000-8000-00000000a003';
const CDK_TANVI = '00000000-0000-4000-8000-00000000a004';
let cdkFrom = null;
let cdkSeen = null;
const clearComplianceDesk = async () => {
  await db.pg.exec(`set session_replication_role = replica;
    delete from sqaaf_evidence where school_id = '${SCHOOL}'; delete from disclosure_entries where school_id = '${SCHOOL}'; delete from staff_qualifications where school_id = '${SCHOOL}';
    set session_replication_role = origin;`);
};
const complianceDesk = async (page) => {
  await clearComplianceDesk();
  cdkFrom = (await db.pg.query(`select coalesce(max(audit_id), 0)::bigint as id from audit_log`)).rows[0].id;
  await db.pg.query(`insert into staff_qualifications (school_id, user_id, stage, degree, professional_qualification, tet_type, tet_paper, tet_certificate_date, tet_valid_until, updated_by) values ($1, $2, 'upper', 'B.Sc.', 'B.Ed', 'State TET', 'II', ${TODAY_SQL} - 700, ${TODAY_SQL} + 20, $3)`, [SCHOOL, CDK_TANVI, PEOPLE.principal.sub]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-compliance-desk]').waitFor({ timeout: 20000 });
  const tara = page.locator(`[data-cdk-staff="${CDK_TARA}"]`);
  await tara.locator('[data-cdk-edit]').click();
  await page.locator('#cdk-q-stage').selectOption('primary');
  await page.locator('#cdk-q-degree').fill('B.A.');
  await page.locator('#cdk-q-professional_qualification').fill('D.El.Ed');
  await page.locator('#cdk-q-tet_type').selectOption('CTET');
  await page.locator('#cdk-q-tet_paper').selectOption('I');
  await page.locator('#cdk-q-tet_certificate_date').fill('2022-06-01');
  await tara.locator('[data-cdk-save]').click();
  await page.locator(`[data-cdk-staff="${CDK_TARA}"][data-cdk-gaps="0"]`).waitFor({ timeout: 20000 });
  await page.locator('#cdk-dis-heading').fill('Affiliation number');
  await page.locator('#cdk-dis-value').fill('530000, valid until 31-03-2029');
  await page.locator('#cdk-dis-source').fill('Board affiliation letter on the office file');
  await page.locator('[data-cdk-dis-save]').click();
  await page.locator('[data-cdk-item]').first().waitFor({ timeout: 20000 });
  await page.locator('[data-cdk-domain="2"] summary').click();
  const std = page.locator('[data-cdk-standard="2.8.1"]');
  await std.locator('[data-cdk-sq-add]').click();
  await std.locator('textarea').fill('Fire drill held each term; the register is in the office.');
  await std.locator('[data-cdk-sq-save]').click();
  await page.locator('[data-cdk-standard="2.8.1"][data-cdk-pieces="1"]').waitFor({ timeout: 20000 });
  await page.locator('[data-cdk-domain="2"] summary').click();
  await page.locator('[data-cdk-form6-state]').waitFor({ timeout: 20000 });
  cdkSeen = {
    endings: await page.locator('[data-cdk-ending-row="ending"]').count(),
    items: await page.locator('[data-cdk-item]').count(),
    withEvidence: (await page.locator('[data-cdk-sq-total]').textContent()).trim(),
    form6: await page.locator('[data-cdk-form6-state]').getAttribute('data-cdk-form6-state'),
  };
};
const complianceDeskDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from staff_qualifications where school_id = $1 and user_id = $2 and stage = 'primary' and tet_type = 'CTET' and tet_paper = 'I'
               and tet_certificate_date = '2022-06-01' and tet_valid_until is null and degree = 'B.A.' and updated_by = $3) as tara,
            (select count(*)::int from disclosure_entries where school_id = $1 and heading = 'Affiliation number' and source = 'Board affiliation letter on the office file' and changed_by = $3) as disclosure,
            (select count(*)::int from sqaaf_evidence where school_id = $1 and standard_code = '2.8.1' and storage_key is null and added_by = $3) as evidence,
            (select string_agg(event_action, ',' order by audit_id) from audit_log where audit_id > $4 and event_action like 'compliance_desk.%') as audited,
            (select count(*)::int from audit_log where audit_id > $4 and event_action like 'compliance_desk.%' and (after_state::text like '%B.A.%' or after_state::text like '%Fire drill%' or after_state::text like '%530000%')) as words_in_audit`,
    [SCHOOL, CDK_TARA, PEOPLE.principal.sub, cdkFrom]
  );
  await clearComplianceDesk();
  const want = { tara: 1, disclosure: 1, evidence: 1, audited: 'compliance_desk.qualification_saved,compliance_desk.disclosure_saved,compliance_desk.sqaaf_evidence_added', words_in_audit: 0 };
  if (JSON.stringify(rows[0]) !== JSON.stringify(want)) throw new Error(`the compliance desk in the database: ${JSON.stringify(rows[0])}`);
  if (JSON.stringify(cdkSeen) !== JSON.stringify({ endings: 1, items: 1, withEvidence: '1 of 84 standards have evidence', form6: 'haryana' })) throw new Error(`the compliance desk on the screen: ${JSON.stringify(cdkSeen)}`);
};
// The three screens C232 left unphotographed (wave C236, C241): the accountant's Form 6 card on Fees, the line that
// erases a former member of staff's qualification row, and Settings → Documents. Each puts back what it added.
const C241 = '00000000-0000-4000-8000-00000024100';
let c241Cookies = [];
const clearC241 = () => db.pg.exec(`set session_replication_role = replica;
    delete from staff_qualifications where user_id in ('${C241}3');
    delete from memberships where membership_id in ('${C241}2'); delete from users where user_id in ('${C241}1', '${C241}3');
    set session_replication_role = origin;`);
const form6AsAccountant = async (page) => {
  await clearC241();
  await db.pg.query(`insert into users (user_id, school_id, email, role, display_name) values ($1, $2, 'accounts.c241@example.invalid', 'accountant', 'Anil Example')`, [`${C241}1`, SCHOOL]);
  await db.pg.query(`insert into memberships (membership_id, user_id, school_id, role) values ($1, $2, $3, 'accountant')`, [`${C241}2`, `${C241}1`, SCHOOL]);
  c241Cookies = (await page.context().cookies()).filter((c) => c.name === 'nca_access' || c.name === 'nca_tours');
  const cookie = await cookieFor({ sub: `${C241}1`, role: 'accountant', schoolId: SCHOOL, membershipId: `${C241}2` }, secret);
  await page.context().addCookies([
    { name: 'nca_access', value: cookie, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' },
    { name: 'nca_tours', value: `${C241}1.${TOUR_IDS.join(',')}`, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' },
  ]);
  await page.goto(`${base}/app/fees`, { waitUntil: 'networkidle', timeout: 90000 });
  // Read-only for the accountant: the card is there, with no "enter" button.
  await page.locator('[data-cdk-form6="fees"]').waitFor({ timeout: 30000 });
  if (await page.locator('[data-cdk-form6="fees"] [data-cdk-f6-enter]').count()) throw new Error('the accountant is offered to enter a Form 6 figure');
};
const form6AsAccountantDone = async (page) => {
  await page.context().addCookies(c241Cookies.map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, httpOnly: c.httpOnly, sameSite: c.sameSite })));
  await clearC241();
};
const formerStaffErase = async (page) => {
  await clearC241();
  // A teacher who has left (the account is switched off), whose qualification row is still kept.
  await db.pg.query(`insert into users (user_id, school_id, email, role, display_name, is_active) values ($1, $2, 'leela.c241@example.invalid', 'teacher', 'Leela Example', false)`, [`${C241}3`, SCHOOL]);
  await db.pg.query(`insert into staff_qualifications (school_id, user_id, stage, degree, professional_qualification, updated_by) values ($1, $2, 'primary', 'B.A.', 'D.El.Ed', $3)`, [SCHOOL, `${C241}3`, PEOPLE.principal.sub]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator(`[data-cdk-former-row="${C241}3"]`).waitFor({ timeout: 30000 });
  await page.locator(`[data-cdk-erase="${C241}3"]`).click();
  await page.locator('[data-cdk-erase-confirm]').waitFor({ timeout: 10000 });
  // A full-page picture taken while scrolled draws the sticky menu half way down: back to the top first.
  await page.evaluate(() => window.scrollTo(0, 0));
};
const formerStaffEraseDone = async () => {
  // Nothing was erased: the confirmation was only opened.
  const { rows } = await db.pg.query(`select count(*)::int as n from staff_qualifications where user_id = $1`, [`${C241}3`]);
  await clearC241();
  if (rows[0].n !== 1) throw new Error(`the former teacher's row: ${rows[0].n}`);
};
const settingsDocuments = async (page) => {
  const documents = page.locator('[data-settings-module="documents"]');
  await documents.waitFor({ timeout: 20000 });
  // The transfer certificate's legal note is on the screen, never folded (C230-A, C240).
  if (!(await documents.locator('[data-setting-legal]').first().isVisible())) throw new Error('the TC fee note is not on the screen');
  await page.evaluate(() => window.scrollTo(0, 0));
};

// The printable disclosure: two items, one changed once and one removed; the page must show the two in force, the newer
// version of the changed one, and nothing of the removed one.
const disclosurePrint = async (page) => {
  await clearComplianceDesk();
  const by = PEOPLE.office.sub;
  const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
  for (const [item, heading, value, source] of [
    [a, 'Name of the school', 'Illustrative Public School', 'Registration certificate'],
    [b, 'Number of teachers', '24', 'Staff register, April'],
    [c, 'Withdrawn item', 'Not in force', 'Old letter'],
    [b, 'Number of teachers', '26', 'Staff register, October'],
  ]) await db.pg.query(`insert into disclosure_entries (school_id, item_id, heading, value, source, changed_by) values ($1, $2, $3, $4, $5, $6)`, [SCHOOL, item, heading, value, source, by]);
  await db.pg.query(`insert into disclosure_entries (school_id, item_id, heading, removed, changed_by) values ($1, $2, 'Withdrawn item', true, $3)`, [SCHOOL, c, by]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-cdk-print-page]').waitFor({ timeout: 20000 });
  cdkSeen = {
    items: await page.locator('[data-cdk-print-item]').count(),
    newest: (await page.locator('[data-cdk-print-page]').textContent()).includes('Staff register, October'),
    older: (await page.locator('[data-cdk-print-page]').textContent()).includes('Staff register, April'),
    removed: (await page.locator('[data-cdk-print-page]').textContent()).includes('Withdrawn item'),
  };
};
const disclosurePrintDone = async () => {
  await clearComplianceDesk();
  if (JSON.stringify(cdkSeen) !== JSON.stringify({ items: 2, newest: true, older: false, removed: false })) throw new Error(`the printable disclosure: ${JSON.stringify(cdkSeen)}`);
};
// p7-10d end
// p7-10e begin
// Certificates (C228). The principal issues transfer certificates for 5-A from the record: a child the fee counter
// let through and a child with nothing owed are cleared, a child who owes is held until the principal waives it with
// a reason, and a child whose record lacks a guardian's name is not issued one. The batch downloads as one PDF made in
// the browser. The principal withdraws one with a reason; the QR page, opened with no session at all, says valid for
// the other and withdrawn for it, with nothing but the type, school, number, day and a first name with an initial.
const CERT_AARAV = '00000000-0000-4000-8000-000000500001'; // owes; the fee counter lets him through (an override)
const CERT_MEERA = '00000000-0000-4000-8000-000000500004'; // owes; the principal waives it
const CERT_KIARA = '00000000-0000-4000-8000-000000500025'; // owes nothing; no guardian on record
const CERT_REASON = 'The family has moved to another city.';
const CERT_WAIVER = 'The family has asked for time; a trust pays the fees next month.';
const CERT_WITHDRAW = 'Issued with the wrong reason for leaving.';
const VERIFY_TOKEN = 'harness-10e-verify-token-0000001';
const clearCertificates = async () => {
  await db.pg.exec(`set session_replication_role = replica;
    delete from certificate_copies; delete from certificates_issued; delete from certificate_marks;
    delete from certificate_signatures; delete from certificate_signatories; delete from certificate_numbering;
    delete from school_setting_changes where module_id = 'documents'; delete from school_settings where module_id = 'documents';
    delete from fee_clearance_overrides where reason = 'Harness 10e: let through at the fee counter.';
    delete from audit_log where event_action like 'certificate.%';
    set session_replication_role = origin;`);
};
// What the QR page shows to someone with no session: its state, and each fact by name.
const verifyAsAStranger = async (page, token) => {
  const stranger = await page.context().browser().newContext();
  try {
    const p = await stranger.newPage();
    const res = await p.goto(`${new URL(page.url()).origin}/verify/${token}`, { waitUntil: 'networkidle' });
    return {
      status: res.status(),
      state: await p.locator('[data-verify-state]').getAttribute('data-verify-state'),
      facts: await p.locator('[data-verify-fact]').evaluateAll((els) => els.map((e) => e.getAttribute('data-verify-fact')).join()),
      name: (await p.locator('[data-verify-fact="name"] dd').count()) ? (await p.locator('[data-verify-fact="name"] dd').textContent()).trim() : null,
      robots: await p.locator('meta[name="robots"]').getAttribute('content'),
      text: await p.locator('body').innerText(),
    };
  } finally {
    await stranger.close();
  }
};
let certificatesSeen = null;
let aaravFeeStatus = [];
const certificatesScreen = async (page) => {
  await clearCertificates();
  // Aarav owes his fee: the seed marks it paid, and since C232 part A a fee stored as paid owes nothing (the fees
  // summary's own rule), so it is made unpaid for this screen and put back after it.
  aaravFeeStatus = (await db.pg.query(`select fee_id, status::text as status from fees_ledger where school_id = $1 and student_id = $2`, [SCHOOL, CERT_AARAV])).rows;
  await db.pg.query(`update fees_ledger set status = 'pending' where school_id = $1 and student_id = $2`, [SCHOOL, CERT_AARAV]);
  await db.pg.query(`insert into fee_clearance_overrides (school_id, student_id, owed_minor, reason, decided_by) values ($1, $2, 450000, 'Harness 10e: let through at the fee counter.', $3)`, [SCHOOL, CERT_AARAV, PEOPLE.principal.sub]);
  // The school has switched the fee clearance on for the TC (off by default, C232 part A), so the screen shows the hold
  // and the principal's waiver.
  await db.pg.query(`insert into school_settings (school_id, module_id, schema_version, setting_values, revision) values ($1, 'documents', 1, '{"clearance_transfer": true}', 1)`, [SCHOOL]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-certificates-issue]').waitFor({ timeout: 20000 });
  await page.selectOption('#crt-type', 'transfer');
  await page.selectOption('#crt-class', { label: '5-A' });
  await page.locator('[data-certificates-roster]').waitFor({ timeout: 20000 });
  await page.locator('#crt-reason').fill(CERT_REASON);
  await page.locator('[data-certificates-select-all]').click();
  const meera = page.locator('[data-certificate-child="held"]', { hasText: 'Meera Example A' });
  await meera.locator('[data-certificate-waive]').click();
  await page.locator(`#crt-waive-${CERT_MEERA}`).fill(CERT_WAIVER);
  const button = (await page.locator('[data-certificates-issue-button]').textContent()).trim();
  await page.locator('[data-certificates-issue-button]').click();
  await page.locator('[data-certificates-outcome] [data-certificates-batch-pdf]').waitFor({ timeout: 30000 });
  const incomplete = (await page.locator('[data-certificate-incomplete]').allTextContents()).map((s) => s.trim());
  // The batch, one PDF made on this device.
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('[data-certificates-batch-pdf]').click()]);
  const pdf = readFileSync(await download.path());
  // The principal withdraws TC/0001, with a reason.
  const first = page.locator('[data-certificate-number="TC/0001"]');
  await first.locator('[data-certificate-withdraw]').click();
  await first.locator('input[id^="crt-withdraw-"]').fill(CERT_WITHDRAW);
  await first.locator('[data-certificate-withdraw-confirm]').click();
  await page.locator('[data-certificate-number="TC/0001"][data-certificate-row="withdrawn"]').waitFor({ timeout: 20000 });
  const tokens = Object.fromEntries((await db.pg.query(`select number, verify_token from certificates_issued where school_id = $1`, [SCHOOL])).rows.map((r) => [r.number, r.verify_token]));
  certificatesSeen = {
    button,
    incomplete,
    pdf: { name: download.suggestedFilename(), head: pdf.subarray(0, 5).toString('latin1'), pages: (pdf.toString('latin1').match(/\/Type \/Page \/Parent/g) ?? []).length },
    rows: await page.locator('[data-certificate-row]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-certificate-number')}:${e.getAttribute('data-certificate-row')}`).join()),
    valid: tokens['TC/0002'] ? await verifyAsAStranger(page, tokens['TC/0002']) : null,
    withdrawn: tokens['TC/0001'] ? await verifyAsAStranger(page, tokens['TC/0001']) : null,
  };
  await page.evaluate(() => window.scrollTo(0, 0));
};
const certificatesScreenDone = async () => {
  const { rows } = await db.pg.query(
    `select number, student_id, clearance, owed_minor::int as owed, waived_by, waiver_reason, withdrawn_by, withdraw_reason, issued_by, printed ->> 'studentName' as name
       from certificates_issued where school_id = $1 order by cert_type, seq`,
    [SCHOOL]
  );
  const audited = (await db.pg.query(`select string_agg(event_action, ',' order by audit_id) as a from audit_log where event_action like 'certificate.%'`)).rows[0].a;
  await clearCertificates();
  for (const f of aaravFeeStatus) await db.pg.query(`update fees_ledger set status = $3::fee_status where school_id = $1 and fee_id = $2`, [SCHOOL, f.fee_id, f.status]);
  const p = PEOPLE.principal.sub;
  const want = [
    { number: 'TC/0001', student_id: CERT_AARAV, clearance: 'fee_override', owed: 450000, waived_by: null, waiver_reason: null, withdrawn_by: p, withdraw_reason: CERT_WITHDRAW, issued_by: p, name: 'Aarav Example A' },
    { number: 'TC/0002', student_id: CERT_MEERA, clearance: 'waived', owed: 450000, waived_by: p, waiver_reason: CERT_WAIVER, withdrawn_by: null, withdraw_reason: null, issued_by: p, name: 'Meera Example A' },
  ];
  if (JSON.stringify(rows) !== JSON.stringify(want)) throw new Error(`the certificates in the database: ${JSON.stringify(rows)}`);
  if (audited !== 'certificate.issued,certificate.issued,certificate.withdrawn') throw new Error(`the certificates' audit rows: ${audited}`);
  const s = certificatesSeen;
  // Since C232 part A a fee the seed stores as paid owes nothing, so five children of 5-A are clear (Aarav is let
  // through, Meera waived): seven can be issued, and the five whose record has no father's or guardian's name are listed
  // as incomplete, not issued.
  if (s.button !== 'Issue 7 certificates') throw new Error(`the issue button said: ${s.button}`);
  const incompleteNames = ['Vihaan Example A', 'Anaya Example A', 'Kabir Example B', 'Ishaan Example B', 'Kiara Example B'];
  if (s.incomplete.length !== 5 || !s.incomplete.every((line, i) => line.startsWith(`${incompleteNames[i]}: no father’s or guardian’s name on the record.`))) throw new Error(`the incomplete children: ${JSON.stringify(s.incomplete)}`);
  if (JSON.stringify(s.pdf) !== JSON.stringify({ name: 'certificates.pdf', head: '%PDF-', pages: 2 })) throw new Error(`the batch PDF: ${JSON.stringify(s.pdf)}`);
  if (s.rows !== 'TC/0002:valid,TC/0001:withdrawn') throw new Error(`the register on the screen: ${s.rows}`);
  for (const [seen, state, name] of [[s.valid, 'valid', 'Meera A.'], [s.withdrawn, 'withdrawn', 'Aarav A.']]) {
    if (!seen || seen.status !== 200 || seen.state !== state || seen.facts !== 'type,school,number,date,name' || seen.name !== name || !/noindex/.test(seen.robots ?? '')) throw new Error(`the QR page, signed out, for a ${state} certificate: ${JSON.stringify({ ...seen, text: undefined })}`);
    for (const never of ['Example A', 'Rajesh', 'Sunita', '5-A', 'ILL-0', '2015', CERT_REASON, CERT_WAIVER, CERT_WITHDRAW, '450']) if (seen.text.includes(never)) throw new Error(`the QR page shows "${never}"`);
  }
};
// The QR page itself, as anyone sees it: a certificate of the register, made directly in the database.
let verifySeen = null;
const verifyScreen = async (page) => {
  await clearCertificates();
  // Made as the database's owner with the triggers held, so its token is the known one this screen's address uses.
  await db.pg.exec('set session_replication_role = replica');
  try {
    await db.pg.query(
      `insert into certificates_issued (school_id, cert_type, seq, number, student_id, class_id, issued_on, issued_by, printed, clearance, owed_minor, verify_token)
       values ($1, 'transfer', 1, 'TC/0001', $2, $3, ${TODAY_SQL}, $4, '{"studentName": "Aarav Example A", "dob": "2015-04-18", "fatherName": "Rajesh Example", "lastClass": "5-A"}', 'nothing_owed', 0, $5)`,
      [SCHOOL, CERT_AARAV, CLASS_5A, PEOPLE.principal.sub, VERIFY_TOKEN]
    );
  } finally {
    await db.pg.exec('set session_replication_role = origin');
  }
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-verify-state="valid"]').waitFor({ timeout: 20000 });
  verifySeen = { stranger: await verifyAsAStranger(page, VERIFY_TOKEN), unknown: await verifyAsAStranger(page, 'harness-10e-verify-token-0000002') };
};
const verifyScreenDone = async () => {
  await clearCertificates();
  const { stranger, unknown } = verifySeen;
  if (stranger.status !== 200 || stranger.state !== 'valid' || stranger.facts !== 'type,school,number,date,name' || stranger.name !== 'Aarav A.') throw new Error(`the QR page, signed out: ${JSON.stringify({ ...stranger, text: undefined })}`);
  for (const never of ['Example A', 'Rajesh', '5-A', '2015']) if (stranger.text.includes(never)) throw new Error(`the QR page shows "${never}"`);
  if (unknown.status !== 200 || unknown.state !== 'unknown' || unknown.facts !== '') throw new Error(`the QR page for a token that does not exist: ${JSON.stringify({ ...unknown, text: undefined })}`);
};
// p7-10e end
// p7-10f begin
// The timetable generator (C229), as the principal uses it. Screen 1: the principal adds a subject to 5-A on the page
// (Mathematics, 6 a week, Tara) and marks Tanvi unable to teach on Saturdays; the other three subjects are typed in
// the database; then "Make a proposal", and one period of 5-A moved by two taps. The picture shows the proposal beside
// the timetable now. The timetable itself must not have changed. Screen 2: the same constraints, proposed and
// published on the page, then one publish read back. The two classes must hold exactly the proposal, kept as a
// version. Everything is put back after each, the seeded timetable included.
const TTG_5A = '00000000-0000-4000-8000-0000000c0051';
const TTG_5B = '00000000-0000-4000-8000-0000000c0052';
const TTG_MATHS = '00000000-0000-4000-8000-0000000d0001';
const TTG_ENGLISH = '00000000-0000-4000-8000-0000000d0002';
const TTG_TARA = '00000000-0000-4000-8000-00000000a003';
const TTG_TANVI = '00000000-0000-4000-8000-00000000a004';
// Their teachers rows (the seed's), for who teaches what (C231).
const TTG_TARA_T = '00000000-0000-4000-8000-0000000a2003';
const TTG_TANVI_T = '00000000-0000-4000-8000-0000000a2004';
let ttgTimetable = null;
let ttgSeen = null;
let ttgFrom = null;
const ttgSlots = (rows) => rows.map((e) => `${e.classId}:${e.weekday}:${e.period}:${e.subjectId}:${e.teacherUserId}`).sort().join('|');
const ttgEntries = async () =>
  (await db.pg.query(`select class_id as "classId", weekday::int as weekday, period::int as period, subject_id as "subjectId", teacher_user_id as "teacherUserId" from timetable_entries where school_id = $1`, [SCHOOL])).rows;
const clearTtgPlans = () =>
  db.pg.exec(`set session_replication_role = replica;
    delete from timetable_versions where school_id = '${SCHOOL}'; delete from timetable_proposals where school_id = '${SCHOOL}';
    delete from timetable_loads where school_id = '${SCHOOL}'; delete from timetable_unavailable where school_id = '${SCHOOL}';
    delete from school_settings where school_id = '${SCHOOL}' and module_id = 'timetable';
    delete from teacher_subjects where school_id = '${SCHOOL}' and ((teacher_id = '${TTG_TANVI_T}' and subject_id = '${TTG_ENGLISH}' and class_id = '${TTG_5A}') or (teacher_id = '${TTG_TARA_T}' and subject_id = '${TTG_MATHS}' and class_id = '${TTG_5B}'));
    set session_replication_role = origin;`);
const clearTtg = async () => {
  await clearTtgPlans();
  // The timetable as it was before the screen.
  if (ttgTimetable) {
    await db.pg.query(`delete from timetable_entries where school_id = $1`, [SCHOOL]);
    for (const e of ttgTimetable) await db.pg.query(`insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values ($1, $2, $3, $4, $5, $6)`, [SCHOOL, e.classId, e.weekday, e.period, e.subjectId, e.teacherUserId]);
  }
  ttgTimetable = null;
};
const ttgStart = async (page, { typedOnPage }) => {
  await clearTtgPlans();
  // C231: the most periods in a row has no default; for these screens the school has set it to 12 (no limit, as they
  // were made). Who teaches what: the loads below give 5-A English to Tanvi and 5-B Mathematics to Tara, which Setup
  // gives them for these screens (the seed gives those two to the other teacher), so the generator takes them.
  await db.pg.query(`insert into school_settings (school_id, module_id, schema_version, setting_values, revision) values ($1, 'timetable', 3, '{"max_consecutive": 12}', 1)`, [SCHOOL]);
  await db.pg.query(`insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ($1, $2, $3, $4), ($1, $5, $6, $7) on conflict do nothing`, [SCHOOL, TTG_TANVI_T, TTG_ENGLISH, TTG_5A, TTG_TARA_T, TTG_MATHS, TTG_5B]);
  ttgTimetable = await ttgEntries();
  ttgFrom = (await db.pg.query(`select coalesce(max(audit_id), 0)::bigint as id from audit_log`)).rows[0].id;
  const typed = [[TTG_5A, TTG_ENGLISH, 5, TTG_TANVI], [TTG_5B, TTG_MATHS, 6, TTG_TARA], [TTG_5B, TTG_ENGLISH, 5, TTG_TANVI], ...(typedOnPage ? [] : [[TTG_5A, TTG_MATHS, 6, TTG_TARA]])];
  for (const [c, s, n, t] of typed) await db.pg.query(`insert into timetable_loads (school_id, class_id, subject_id, periods_per_week, teacher_user_id, updated_by) values ($1, $2, $3, $4, $5, $6)`, [SCHOOL, c, s, n, t, PEOPLE.principal.sub]);
  if (!typedOnPage) await db.pg.query(`insert into timetable_unavailable (school_id, teacher_user_id, weekday, period, updated_by) values ($1, $2, 6, null, $3)`, [SCHOOL, TTG_TANVI, PEOPLE.principal.sub]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-ttg-loads]').waitFor({ timeout: 20000 });
};
const ttgPropose = async (page) => {
  await page.locator('[data-ttg-propose-go]').click();
  await page.locator('[data-ttg-draft]').waitFor({ timeout: 30000 });
};
const ttgReview = async (page) => {
  await ttgStart(page, { typedOnPage: true });
  await page.selectOption('#ttg-class', TTG_5A);
  await page.selectOption('#ttg-subject', TTG_MATHS);
  await page.locator('#ttg-periods').fill('6');
  await page.selectOption('#ttg-teacher', TTG_TARA);
  await page.locator('[data-ttg-load-save]').click();
  await page.locator(`[data-ttg-load="${TTG_MATHS}"]`).waitFor({ timeout: 20000 });
  await page.selectOption('#ttg-away-teacher', TTG_TANVI);
  await page.locator('[data-ttg-away-whole="6"]').click();
  const reloaded = page.waitForResponse((r) => r.url().endsWith('/api/app/timetable/generator') && r.request().method() === 'GET', { timeout: 20000 });
  await page.locator('[data-ttg-away-save]').click();
  await reloaded;
  await ttgPropose(page);
  // One period of 5-A moved to a free period of the same day where its teacher is free.
  const draft = (await db.pg.query(`select entries from timetable_proposals where school_id = $1 and state = 'draft'`, [SCHOOL])).rows[0].entries;
  let move = null;
  for (const e of draft.filter((x) => x.classId === TTG_5A)) {
    for (let p = 1; p <= 8 && !move; p++) {
      const busy = draft.some((x) => (x.classId === TTG_5A || x.teacherUserId === e.teacherUserId) && x.weekday === e.weekday && x.period === p);
      if (!busy) move = { from: e, to: { weekday: e.weekday, period: p } };
    }
    if (move) break;
  }
  await page.locator(`[data-ttg-week="${TTG_5A}"] [data-ttg-pick="${move.from.weekday}-${move.from.period}"]`).click();
  await page.locator(`[data-ttg-week="${TTG_5A}"] [data-ttg-pick="${move.to.weekday}-${move.to.period}"]`).click();
  await page.waitForFunction(() => document.querySelector('[data-ttg-draft]') && !document.querySelector('[aria-pressed="true"][data-ttg-pick]'), null, { timeout: 20000 });
  await page.waitForTimeout(800);
  ttgSeen = {
    move,
    placed: await page.locator('[data-ttg-placed]').getAttribute('data-ttg-placed'),
    unplaced: await page.locator('[data-ttg-unplaced]').count(),
    marked: await page.locator(`[data-ttg-week="${TTG_5A}"] [data-change]`).count(),
    publishEnabled: await page.locator('[data-ttg-publish]').isEnabled(),
  };
};
const ttgReviewDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from timetable_proposals where school_id = $1 and state = 'draft' and swaps = 1 and proposed_by = $2 and unplaced = '[]'::jsonb) as drafts,
            (select count(*)::int from timetable_loads where school_id = $1) as loads,
            (select count(*)::int from timetable_loads where school_id = $1 and class_id = $3 and subject_id = $4 and periods_per_week = 6 and teacher_user_id = $5) as typed,
            (select count(*)::int from timetable_unavailable where school_id = $1 and teacher_user_id = $6 and weekday = 6 and period is null and updated_by = $2) as away,
            (select string_agg(event_action, ',' order by audit_id) from audit_log where audit_id > $7 and event_action like 'timetable.%') as audited`,
    [SCHOOL, PEOPLE.principal.sub, TTG_5A, TTG_MATHS, TTG_TARA, TTG_TANVI, ttgFrom]
  );
  const draft = (await db.pg.query(`select entries from timetable_proposals where school_id = $1 and state = 'draft'`, [SCHOOL])).rows[0]?.entries ?? [];
  const moved = draft.find((e) => e.classId === TTG_5A && e.weekday === ttgSeen?.move?.to.weekday && e.period === ttgSeen?.move?.to.period);
  // Nothing reaches the timetable until a person publishes.
  const untouched = ttgSlots(await ttgEntries()) === ttgSlots(ttgTimetable);
  await clearTtg();
  const r = rows[0];
  const want = { drafts: 1, loads: 4, typed: 1, away: 1, audited: 'timetable.plan.load_set,timetable.plan.unavailable_set,timetable.plan.proposed,timetable.plan.swapped' };
  if (JSON.stringify(r) !== JSON.stringify(want)) throw new Error(`the generator in the database: ${JSON.stringify(r)}`);
  if (!untouched) throw new Error('the timetable changed before anything was published');
  if (moved?.subjectId !== ttgSeen.move.from.subjectId || moved?.teacherUserId !== ttgSeen.move.from.teacherUserId) throw new Error(`the swap: ${JSON.stringify({ moved, seen: ttgSeen })}`);
  if (ttgSeen.placed !== '22' || ttgSeen.unplaced !== 0 || ttgSeen.marked < 1 || ttgSeen.publishEnabled !== true) throw new Error(`the proposal on the screen: ${JSON.stringify(ttgSeen)}`);
};
const ttgPublish = async (page) => {
  await ttgStart(page, { typedOnPage: false });
  await ttgPropose(page);
  await page.locator('[data-ttg-publish]').click();
  await page.locator('[data-ttg-publish-confirm]').click();
  await page.locator('[data-ttg-version]').waitFor({ timeout: 30000 });
  await page.locator('[data-ttg-version-open]').first().click();
  await page.locator('[data-ttg-version-detail]').waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  ttgSeen = { versions: await page.locator('[data-ttg-version]').count(), draftLeft: await page.locator('[data-ttg-draft]').count(), marked: await page.locator('[data-ttg-version-detail] [data-change]').count() };
};
const ttgPublishDone = async () => {
  const proposal = (await db.pg.query(`select state, entries, decided_by from timetable_proposals where school_id = $1`, [SCHOOL])).rows;
  const version = (await db.pg.query(`select published_by, before_entries, added, changed, removed from timetable_versions where school_id = $1`, [SCHOOL])).rows;
  const now = await ttgEntries();
  const audited = (await db.pg.query(`select count(*)::int as n from audit_log where audit_id > $1 and event_action = 'timetable.plan.published' and actor_user_id = $2`, [ttgFrom, PEOPLE.principal.sub])).rows[0].n;
  const before = ttgTimetable;
  await clearTtg();
  const planned = new Set([TTG_5A, TTG_5B]);
  const p = proposal[0];
  const v = version[0];
  const exact = p && ttgSlots(now.filter((e) => planned.has(e.classId))) === ttgSlots(p.entries) && ttgSlots(now.filter((e) => !planned.has(e.classId))) === ttgSlots(before.filter((e) => !planned.has(e.classId)));
  const r = { proposals: proposal.length, state: p?.state, decidedBy: p?.decided_by === PEOPLE.principal.sub, versions: version.length, by: v?.published_by === PEOPLE.principal.sub, keptBefore: v ? ttgSlots(v.before_entries) === ttgSlots(before) : false, exact, audited };
  const want = { proposals: 1, state: 'published', decidedBy: true, versions: 1, by: true, keptBefore: true, exact: true, audited: 1 };
  if (JSON.stringify(r) !== JSON.stringify(want)) throw new Error(`the publish in the database: ${JSON.stringify(r)}`);
  if (ttgSeen.versions !== 1 || ttgSeen.draftLeft !== 0 || ttgSeen.marked < 1) throw new Error(`the publish on the screen: ${JSON.stringify(ttgSeen)}`);
};
// p7-10f end
// p7-10g begin
// Who teaches what (C231), on Staff: a proposal from Tara waits (Mathematics in 6-A); the principal gives Tanvi English
// in 6-A with the form. The check reads the database: the assignment written in the principal's name, the proposal
// still waiting, the audit rows with ids only. Then a teacher's own page: Tara proposes English in 6-A, which waits for
// the office. Both put back after (6-A has no assignment in the seed).
const TS_6A = '00000000-0000-4000-8000-0000000c0061';
const TS_REQUEST = '00000000-0000-4000-8000-0000000c2311';
const TS_IDS = ['teacherId', 'teacherUserId', 'subjectId', 'classId'];
let tsSeen = null;
let tsFrom = null;
const clearTeacherSubjects = () =>
  db.pg.exec(`delete from teacher_subject_requests where school_id = '${SCHOOL}'; delete from teacher_subjects where school_id = '${SCHOOL}' and class_id = '${TS_6A}';`);
const tsAudit = async () =>
  (
    await db.pg.query(
      `select string_agg(event_action, ',' order by audit_id) as actions,
              count(*) filter (where exists (select 1 from jsonb_object_keys(coalesce(after_state, '{}'::jsonb) || coalesce(before_state, '{}'::jsonb)) k where k <> all ($2::text[])))::int as wordy
         from audit_log where audit_id > $1 and event_action like 'teacher%'`,
      [tsFrom, TS_IDS]
    )
  ).rows[0];
const staffSubjects = async (page) => {
  await clearTeacherSubjects();
  tsFrom = (await db.pg.query(`select coalesce(max(audit_id), 0)::bigint as id from audit_log`)).rows[0].id;
  await db.pg.query(`insert into teacher_subject_requests (request_id, school_id, teacher_user_id, class_id, subject_id) values ($1, $2, $3, $4, $5)`, [TS_REQUEST, SCHOOL, TTG_TARA, TS_6A, TTG_MATHS]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator(`[data-subject-request="${TS_REQUEST}"]`).waitFor({ timeout: 20000 });
  await page.selectOption('#ts-teacher', TTG_TANVI);
  await page.selectOption('#ts-class', TS_6A);
  await page.selectOption('#ts-subject', TTG_ENGLISH);
  await page.locator('[data-assign-save]').click();
  await page.locator(`[data-teacher-line="${TTG_TANVI}"] [data-assignment="${TS_6A}:${TTG_ENGLISH}"]`).waitFor({ timeout: 20000 });
  await page.locator('#teacher-subjects').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  tsSeen = { waiting: await page.locator('[data-subject-request]').count(), teachers: await page.locator('[data-teacher-line]').count() };
};
const staffSubjectsDone = async () => {
  const { rows } = await db.pg.query(
    `select (select state from teacher_subject_requests where request_id = $2) as request,
            (select count(*)::int from teacher_subjects ts join teachers t on t.school_id = ts.school_id and t.teacher_id = ts.teacher_id
              where ts.school_id = $1 and t.user_id = $3 and ts.class_id = $4 and ts.subject_id = $5) as assigned,
            (select count(*)::int from audit_log where audit_id > $6 and event_action = 'teacher_subject.assign' and actor_user_id = $7) as byPrincipal`,
    [SCHOOL, TS_REQUEST, TTG_TANVI, TS_6A, TTG_ENGLISH, tsFrom, PEOPLE.principal.sub]
  );
  const audit = await tsAudit();
  await clearTeacherSubjects();
  const r = { ...rows[0], actions: audit.actions, wordy: audit.wordy };
  const want = { request: 'pending', assigned: 1, byprincipal: 1, actions: 'teacher_subject.assign', wordy: 0 };
  if (JSON.stringify(r) !== JSON.stringify(want)) throw new Error(`who teaches what in the database: ${JSON.stringify(r)}`);
  if (tsSeen.waiting !== 1 || tsSeen.teachers < 2) throw new Error(`who teaches what on the screen: ${JSON.stringify(tsSeen)}`);
};
const mySubjects = async (page) => {
  await clearTeacherSubjects();
  tsFrom = (await db.pg.query(`select coalesce(max(audit_id), 0)::bigint as id from audit_log`)).rows[0].id;
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-my-subjects-form]').waitFor({ timeout: 20000 });
  await page.selectOption('#ms-class', TS_6A);
  await page.selectOption('#ms-subject', TTG_ENGLISH);
  await page.locator('[data-my-subjects-send]').click();
  await page.locator('[data-my-request="pending"]').waitFor({ timeout: 20000 });
  await page.locator('[data-my-subjects]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  tsSeen = { mine: await page.locator('[data-my-subject]').count(), waiting: await page.locator('[data-my-request="pending"]').count() };
};
const mySubjectsDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from teacher_subject_requests where school_id = $1 and teacher_user_id = $2 and class_id = $3 and subject_id = $4 and state = 'pending') as waiting,
            (select count(*)::int from teacher_subjects where school_id = $1 and class_id = $3) as assigned`,
    [SCHOOL, PEOPLE.teacher.sub, TS_6A, TTG_ENGLISH]
  );
  const audit = await tsAudit();
  await clearTeacherSubjects();
  const r = { ...rows[0], actions: audit.actions, wordy: audit.wordy };
  const want = { waiting: 1, assigned: 0, actions: 'teacher_subject.requested', wordy: 0 };
  if (JSON.stringify(r) !== JSON.stringify(want)) throw new Error(`a teacher's proposal in the database: ${JSON.stringify(r)}`);
  // Tara teaches Mathematics and English in 5-A (the seed).
  if (tsSeen.mine !== 2 || tsSeen.waiting !== 1) throw new Error(`a teacher's proposal on the screen: ${JSON.stringify(tsSeen)}`);
};
// Periods a week per teacher (C231), from the published timetable: every teacher for the principal, the most first;
// a teacher's own count for the teacher. The numbers on the screen must be the database's own count of the periods
// on the school's working days (Monday to Saturday here) within its periods a day (8).
let wlSeen = null;
const wlCounts = async () =>
  (
    await db.pg.query(
      `select u.user_id, count(e.entry_id)::int as n from users u left join timetable_entries e on e.school_id = u.school_id and e.teacher_user_id = u.user_id and e.weekday between 1 and 6 and e.period <= 8
        where u.school_id = $1 and u.role = 'teacher' group by u.user_id, u.is_active having u.is_active or count(e.entry_id) > 0 order by count(e.entry_id) desc`,
      [SCHOOL]
    )
  ).rows;
const workloadOffice = async (page) => {
  await page.locator('[data-workload="office"] [data-workload-line]').first().waitFor({ timeout: 20000 });
  await page.locator('[data-workload="office"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  wlSeen = await page.locator('[data-workload-line]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-workload-line'))));
};
const workloadOfficeDone = async () => {
  const want = (await wlCounts()).map((r) => r.n);
  if (JSON.stringify(wlSeen) !== JSON.stringify(want)) throw new Error(`periods a week per teacher: ${JSON.stringify({ seen: wlSeen, want })}`);
};
const workloadTeacher = async (page) => {
  await page.locator('[data-workload="mine"]').waitFor({ timeout: 20000 });
  await page.locator('[data-workload="mine"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  wlSeen = { mine: Number(await page.locator('[data-workload-mine]').getAttribute('data-workload-mine')), others: await page.locator('[data-workload-line]').count() };
};
const workloadTeacherDone = async () => {
  const mine = (await wlCounts()).find((r) => r.user_id === PEOPLE.teacher.sub)?.n ?? 0;
  if (wlSeen.mine !== mine || wlSeen.others !== 0) throw new Error(`a teacher's periods a week: ${JSON.stringify({ seen: wlSeen, mine })}`);
};
// The generator with no limit of periods in a row set (C231): the screen says so before the button, links to the
// setting, and makes no proposal.
const ttgLimit = async (page) => {
  await clearTtgPlans();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-ttg-limit-unset]').waitFor({ timeout: 20000 });
  await page.locator('[data-ttg-propose]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  ttgSeen = { disabled: await page.locator('[data-ttg-propose-go]').isDisabled(), link: await page.locator('[data-ttg-limit-link]').getAttribute('href'), rule: await page.locator('[data-ttg-limit]').getAttribute('data-ttg-limit') };
};
const ttgLimitDone = async () => {
  const proposals = (await db.pg.query(`select count(*)::int as n from timetable_proposals where school_id = $1`, [SCHOOL])).rows[0].n;
  if (proposals !== 0 || JSON.stringify(ttgSeen) !== JSON.stringify({ disabled: true, link: '/app/settings#set-timetable-max_consecutive', rule: 'unset' })) throw new Error(`the generator with no limit set: ${JSON.stringify({ proposals, seen: ttgSeen })}`);
};
// p7-10g end
// c224 begin
// C224 (C223-A answers 3 and 7). The principal deletes one enquiry after reading what goes, then a parent's erasure
// request: every enquiry of a family that never joined, found by the phone as the office types it. An admitted
// enquiry erased with the child's data shows no names, and its steps say it was erased. A number with only an
// admitted enquiry finds nothing to delete. The check reads the database (the rows gone, the admitted and erased ones
// kept, the audit rows with ids and counts only) and puts every row back (the audit rows stay: the log is never cut).
const X_ENQ = (n) => `e0000000-0000-4000-8000-00000c224${String(n).padStart(3, '0')}`;
const X_STUDENT = (n) => `e0000000-0000-4000-8000-00000c224${String(100 + n).padStart(3, '0')}`;
const X_ROWS = [1, 2, 3, 4, 5].map(X_ENQ);
let xSeen = null;
const clearC224Admissions = async () => {
  await db.pg.exec(`set session_replication_role = replica;
    delete from admission_events where enquiry_id in (${X_ROWS.map((r) => `'${r}'`).join(', ')});
    delete from admission_enquiries where enquiry_id in (${X_ROWS.map((r) => `'${r}'`).join(', ')});
    delete from students where student_id in ('${X_STUDENT(1)}', '${X_STUDENT(2)}');
    set session_replication_role = origin;`);
};
const admissionsErasure = async (page) => {
  await clearC224Admissions();
  const [o, p, c5, c6] = [PEOPLE.office.sub, PEOPLE.principal.sub, CLASS_5A, '00000000-0000-4000-8000-0000000c0061'];
  await db.pg.exec(`set session_replication_role = replica;
    insert into students (student_id, school_id, name, class_id, status) values
      ('${X_STUDENT(1)}', '${SCHOOL}', 'Redacted Student ${X_STUDENT(1).slice(0, 8)}', '${c5}', 'pending_consent'),
      ('${X_STUDENT(2)}', '${SCHOOL}', 'Ojas Example X', '${c6}', 'pending_consent');
    insert into admission_enquiries (enquiry_id, school_id, child_name, guardian_name, phone, class_id, source, stage, owner_id, next_step, closed_reason, student_id, created_by, created_at, erased_at) values
      ('${X_ENQ(1)}', '${SCHOOL}', 'Ira Example X', 'Lata Example X', '+919800000201', '${c5}', 'walk_in', 'enquiry', '${o}', 'Call back on Monday', null, null, '${o}', now() - interval '2 days', null),
      ('${X_ENQ(2)}', '${SCHOOL}', 'Om Example X', 'Kavita Example X', '+919800000202', '${c5}', 'phone_call', 'visit_booked', '${p}', 'Visit on Saturday', null, null, '${p}', now() - interval '6 days', null),
      ('${X_ENQ(3)}', '${SCHOOL}', 'Uma Example X', 'Kavita Example X', '+919800000202', '${c6}', 'whatsapp', 'not_joining', '${p}', null, 'Chose a school nearer home', null, '${p}', now() - interval '9 days', null),
      ('${X_ENQ(4)}', '${SCHOOL}', null, null, null, '${c5}', 'referral', 'admitted', '${p}', null, null, '${X_STUDENT(1)}', '${p}', now() - interval '40 days', now() - interval '1 day'),
      ('${X_ENQ(5)}', '${SCHOOL}', 'Ojas Example X', 'Ravi Example X', '+919800000203', '${c6}', 'walk_in', 'admitted', '${o}', null, null, '${X_STUDENT(2)}', '${o}', now() - interval '30 days', null);
    insert into admission_events (school_id, enquiry_id, kind, stage_from, stage_to, note, owner_id, by_user, at, n, erased_at) values
      ('${SCHOOL}', '${X_ENQ(1)}', 'recorded', null, 'enquiry', null, '${o}', '${o}', now() - interval '2 days', 1, null),
      ('${SCHOOL}', '${X_ENQ(2)}', 'recorded', null, 'visit_booked', null, '${p}', '${p}', now() - interval '6 days', 1, null),
      ('${SCHOOL}', '${X_ENQ(2)}', 'note', null, null, 'Kavita asked about the bus.', null, '${p}', now() - interval '5 days', 2, null),
      ('${SCHOOL}', '${X_ENQ(3)}', 'recorded', null, 'enquiry', null, '${p}', '${p}', now() - interval '9 days', 1, null),
      ('${SCHOOL}', '${X_ENQ(3)}', 'stage', 'enquiry', 'not_joining', 'Chose a school nearer home', null, '${p}', now() - interval '8 days', 2, null),
      ('${SCHOOL}', '${X_ENQ(4)}', 'recorded', null, 'enquiry', null, '${p}', '${p}', now() - interval '40 days', 1, null),
      ('${SCHOOL}', '${X_ENQ(4)}', 'note', null, null, null, null, '${p}', now() - interval '39 days', 2, now() - interval '1 day'),
      ('${SCHOOL}', '${X_ENQ(4)}', 'erased', null, null, null, null, '${p}', now() - interval '1 day', 3, null),
      ('${SCHOOL}', '${X_ENQ(5)}', 'recorded', null, 'enquiry', null, '${o}', '${o}', now() - interval '30 days', 1, null);
    set session_replication_role = origin;`);
  await db.pg.query(`update users set tours_seen = array_append(tours_seen, 'admissions') where user_id = $1 and not ('admissions' = any (tours_seen))`, [PEOPLE.principal.sub]);
  await page.reload({ waitUntil: 'networkidle' });
  // One enquiry: the confirmation says what goes, then it is gone.
  const ira = page.locator('[data-adm-open] [data-enquiry]', { hasText: 'Ira Example X' });
  await ira.waitFor({ timeout: 20000 });
  await ira.locator('[data-adm-delete]').click();
  const asked = (await ira.locator('[data-adm-delete-confirm]').textContent()) ?? '';
  await ira.locator('[data-adm-delete-yes]').click();
  await page.locator('[data-adm-note]', { hasText: 'deleted' }).waitFor({ timeout: 20000 });
  await ira.waitFor({ state: 'detached', timeout: 20000 });
  // A family that never joined: found by the phone as typed, then deleted as shown.
  await page.locator('[data-adm-family] > summary').click();
  await page.locator('#adm-family-phone').fill('98000 00202');
  await page.locator('[data-adm-family-find]').click();
  const found = page.locator('[data-adm-family-found]');
  await found.waitFor({ timeout: 20000 });
  const familyCount = await found.getAttribute('data-count');
  await page.locator('[data-adm-family-delete]').click();
  await page.locator('[data-adm-note]', { hasText: 'enquiries deleted' }).waitFor({ timeout: 20000 });
  // A number with only an admitted enquiry: nothing can be deleted, and the screen says why (left open for the picture).
  await page.locator('#adm-family-phone').fill('9800000203');
  await page.locator('[data-adm-family-find]').click();
  await page.locator('[data-adm-family-found][data-count="0"]').waitFor({ timeout: 20000 });
  const admittedOnly = (await page.locator('[data-adm-family-found]').textContent()) ?? '';
  // The erased enquiry, with its steps open.
  await page.locator('[data-adm-closed] > summary').click();
  const erased = page.locator('[data-adm-closed] [data-enquiry][data-erased]');
  await erased.locator('[data-adm-steps] summary').click();
  await erased.locator('[data-adm-step="erased"]').waitFor({ timeout: 20000 });
  xSeen = { asked, familyCount, admittedOnly, erasedCards: await erased.count(), erasedText: (await erased.textContent()) ?? '', deleteOnAdmitted: await page.locator('[data-adm-closed] [data-enquiry][data-stage="admitted"] [data-adm-delete]').count() };
};
const admissionsErasureDone = async () => {
  const left = (await db.pg.query(`select enquiry_id, stage, child_name, phone, erased_at is not null as erased from admission_enquiries where enquiry_id = any($1::uuid[]) order by enquiry_id`, [X_ROWS])).rows;
  const steps = (await db.pg.query(`select enquiry_id, count(*)::int as n from admission_events where enquiry_id = any($1::uuid[]) group by enquiry_id order by enquiry_id`, [X_ROWS])).rows;
  const audit = (await db.pg.query(`select event_action, target_id, before_state, after_state from audit_log where school_id = $1 and event_action in ('admissions.deleted', 'admissions.family_deleted') and occurred_at > now() - interval '10 minutes' order by audit_id desc limit 2`, [SCHOOL])).rows;
  const seen = xSeen;
  await clearC224Admissions();
  const kept = left.map((r) => r.enquiry_id).join();
  if (kept !== [X_ENQ(4), X_ENQ(5)].join() || !left[0].erased || left[0].child_name !== null || left[1].child_name !== 'Ojas Example X') throw new Error(`the enquiries left: ${JSON.stringify(left)}`);
  if (steps.map((s) => `${s.enquiry_id}:${s.n}`).join() !== `${X_ENQ(4)}:3,${X_ENQ(5)}:1`) throw new Error(`the steps left: ${JSON.stringify(steps)}`);
  const family = audit.find((a) => a.event_action === 'admissions.family_deleted');
  const one = audit.find((a) => a.event_action === 'admissions.deleted');
  if (!family || [...family.after_state.enquiryIds].sort().join() !== [X_ENQ(2), X_ENQ(3)].join() || family.after_state.steps !== 4 || !one || one.target_id !== X_ENQ(1) || one.after_state.steps !== 1) throw new Error(`the audit rows: ${JSON.stringify(audit)}`);
  if (/Example X|98000|\+91|Kavita|bus/.test(JSON.stringify(audit))) throw new Error(`an audit row holds a name or a phone: ${JSON.stringify(audit)}`);
  // (The staff of the seed are "... Example"; the families here are "... Example X".)
  if (!seen || !seen.asked.includes('Ira Example X') || seen.familyCount !== '2' || !seen.admittedOnly.includes('1 admitted enquiry') || seen.erasedCards !== 1 || !seen.erasedText.includes('Details erased') || !seen.erasedText.includes('A note, erased with the child’s data') || seen.erasedText.includes('Example X') || seen.deleteOnAdmitted !== 0) throw new Error(`the screen: ${JSON.stringify({ ...seen, asked: seen?.asked.slice(0, 30) })}`);
};

// C224: the Students screen offers the office a child's gender and the student data check; a teacher gets neither.
const X_GENDER_CHILD = 'Gauri Example X';
let xStudentsSeen = null;
const clearC224Students = async () => {
  await db.pg.exec(`set session_replication_role = replica; delete from students where school_id = '${SCHOOL}' and name = '${X_GENDER_CHILD}'; set session_replication_role = origin;`);
};
const studentsOffice = async (page) => {
  await clearC224Students();
  await db.pg.query(`update users set tours_seen = array_append(tours_seen, 'students') where user_id = $1 and not ('students' = any (tours_seen))`, [PEOPLE.principal.sub]);
  await page.reload({ waitUntil: 'networkidle' });
  const link = page.locator('[data-students-data-check]');
  await link.waitFor({ timeout: 20000 });
  await page.locator('[data-slot="primary"] button, button', { hasText: '+ Add student' }).first().click();
  await page.locator('#name').fill(X_GENDER_CHILD);
  await page.selectOption('#classId', { label: '5-A' });
  await page.selectOption('#gender', 'female');
  await page.locator('form button[type="submit"]', { hasText: 'Save' }).first().click();
  await page.locator('tbody tr', { hasText: X_GENDER_CHILD }).waitFor({ state: 'attached', timeout: 20000 }); // the table is drawn as cards on a phone
  // The form again, open for the picture, with the gender the office records.
  await page.locator('[data-slot="primary"] button, button', { hasText: '+ Add student' }).first().click();
  await page.locator('#gender').waitFor({ timeout: 20000 });
  xStudentsSeen = { href: await link.getAttribute('href'), options: await page.locator('#gender option').evaluateAll((els) => els.map((e) => e.getAttribute('value')).join()) };
};
const studentsOfficeDone = async () => {
  const made = (await db.pg.query(`select student_id, gender, status::text as status from students where school_id = $1 and name = $2`, [SCHOOL, X_GENDER_CHILD])).rows;
  const audit = made[0] ? (await db.pg.query(`select after_state from audit_log where event_action = 'student.create' and target_id = $1`, [made[0].student_id])).rows : [];
  const seen = xStudentsSeen;
  await clearC224Students();
  if (made.length !== 1 || made[0].gender !== 'female' || made[0].status !== 'pending_consent') throw new Error(`the student made: ${JSON.stringify(made)}`);
  if (audit.length !== 1 || JSON.stringify(audit).includes('Gauri') || audit[0].after_state.withGender !== true) throw new Error(`the audit row: ${JSON.stringify(audit)}`);
  if (!seen || seen.href !== '/app/students/data-check' || seen.options !== 'not_given,female,male,transgender') throw new Error(`the screen: ${JSON.stringify(seen)}`);
};
const studentsTeacher = async (page) => {
  await page.locator('[data-students-count], table').first().waitFor({ timeout: 20000 });
  await page.waitForLoadState('networkidle');
  await page.locator('button', { hasText: '+ Add student' }).first().click();
  await page.locator('#name').waitFor({ timeout: 20000 });
  xStudentsSeen = { link: await page.locator('[data-students-data-check]').count(), gender: await page.locator('#gender').count() };
};
const studentsTeacherDone = async () => {
  const seen = xStudentsSeen;
  if (!seen || seen.link !== 0 || seen.gender !== 0) throw new Error(`a teacher was offered the office's own: ${JSON.stringify(seen)}`);
};
// c224 end
// c225 begin
// The RTE desk's close-out (C225). Screen app-fees-rte-parts, the principal: two children of 5-A marked RTE, the
// year's rate typed in the database (12,500), and 5-A's tuition of 1,200 a month (the p7-10c fixture's head, so its
// clearRte removes it). On the page both claims are raised; the state pays the first in two parts (5,000, then the
// rest, which the form fills in): it is paid. The second gets 4,000, the rest is written off with a note, then the
// principal reopens it with a reason. The check reads the receipts, the states and the audit rows (never a reference
// or a note in them) and puts everything back. Screen app-fees-rte-plan, the school admin, on a plan without the
// desk: the page says so plainly and the desk's route refuses; the subscription is put back.
const C225_REFS = ['PFMS/HARNESS/0101', 'PFMS/HARNESS/0102', 'PFMS/HARNESS/0103'];
const C225_NOTE = 'The district paid four thousand only.';
const C225_REASON = 'The district will pay the rest by its new order.';
let c225Tagged = [];
let c225From = null;
let c225Seen = null;
let c225SubBefore;
let c225PlanSeen = null;
const c225Clear = async () => {
  await clearRte();
  for (const s of c225Tagged) await db.pg.query(`update students set rte_admission = $2, rte_entry_class = $3, rte_admitted_on = $4 where student_id = $1`, [s.student_id, s.rte_admission, s.rte_entry_class, s.rte_admitted_on]);
  c225Tagged = [];
};
const rteParts = async (page) => {
  await c225Clear();
  c225From = (await db.pg.query(`select coalesce(max(audit_id), 0)::bigint as id from audit_log`)).rows[0].id;
  await db.pg.query(`insert into academic_sessions (school_id, label, start_date, end_date, is_current) select $1, 'Harness session', ${TODAY_SQL} - 30, ${TODAY_SQL} + 300, not exists (select 1 from academic_sessions where school_id = $1 and is_current) where not exists (select 1 from academic_sessions where school_id = $1 and label = 'Harness session')`, [SCHOOL]);
  const session = (await db.pg.query(`select session_id, start_date::text as start_date from academic_sessions where school_id = $1 order by is_current desc, (label = 'Harness session') desc limit 1`, [SCHOOL])).rows[0];
  const head = (await db.pg.query(`insert into fee_heads (school_id, name, is_mandatory) values ($1, $2, true) returning head_id`, [SCHOOL, RTE_HEAD])).rows[0].head_id;
  const structure = (await db.pg.query(`insert into fee_structures (school_id, class_id, academic_year, session_id, effective_from, created_by) select $1, $2, label, session_id, start_date, $3 from academic_sessions where session_id = $4 returning structure_id`, [SCHOOL, CLASS_5A, PEOPLE.principal.sub, session.session_id])).rows[0].structure_id;
  await db.pg.query(`insert into fee_structure_items (school_id, structure_id, head_id, amount_minor, frequency) values ($1, $2, $3, 120000, 'monthly')`, [SCHOOL, structure, head]);
  c225Tagged = (await db.pg.query(`select student_id, rte_admission, rte_entry_class, rte_admitted_on::text as rte_admitted_on from students where school_id = $1 and class_id = $2 and status = 'active' order by name limit 2`, [SCHOOL, CLASS_5A])).rows;
  await db.pg.query(`update students set rte_admission = true, rte_entry_class = '5-A', rte_admitted_on = $2 where student_id = any($1::uuid[])`, [c225Tagged.map((s) => s.student_id), session.start_date]);
  await db.pg.query(`insert into rte_rates (school_id, session_id, rate_minor, source, typed_by) values ($1, $2, 1250000, 'State RTE notification for this year, as typed by the office', $3)`, [SCHOOL, session.session_id, PEOPLE.principal.sub]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-rte-rate-now]').waitFor({ timeout: 20000 });
  await page.locator('[data-rte-raise-all]').click();
  await page.locator('[data-rte-state="raised"]').nth(1).waitFor({ timeout: 20000 });
  const [one, two] = c225Tagged.map((s) => page.locator(`[data-rte-child="${s.student_id}"]`));
  await one.locator('[data-rte-open-paid]').click();
  await one.locator('input[id^="rte-amount-"]').fill('5000');
  await one.locator('input[id^="rte-reference-"]').fill(C225_REFS[0]);
  await one.locator('[data-rte-paid-save]').click();
  await one.locator('[data-rte-receipts="1"]').waitFor({ timeout: 20000 });
  await one.locator('[data-rte-open-paid]').click();
  await one.locator('input[id^="rte-reference-"]').fill(C225_REFS[1]);
  await one.locator('[data-rte-paid-save]').click();
  await page.locator(`[data-rte-child="${c225Tagged[0].student_id}"][data-rte-state="paid"]`).waitFor({ timeout: 20000 });
  await two.locator('[data-rte-open-paid]').click();
  await two.locator('input[id^="rte-amount-"]').fill('4000');
  await two.locator('input[id^="rte-reference-"]').fill(C225_REFS[2]);
  await two.locator('[data-rte-paid-save]').click();
  await two.locator('[data-rte-receipts="1"]').waitFor({ timeout: 20000 });
  await two.locator('[data-rte-open-write-off]').click();
  await two.locator('input[id^="rte-write-off-"]').fill(C225_NOTE);
  await two.locator('[data-rte-write-off-save]').click();
  await page.locator(`[data-rte-child="${c225Tagged[1].student_id}"][data-rte-state="written_off"]`).waitFor({ timeout: 20000 });
  await two.locator('[data-rte-open-reopen]').click();
  await two.locator('input[id^="rte-reopen-"]').fill(C225_REASON);
  await two.locator('[data-rte-reopen-save]').click();
  await two.locator('[data-rte-reopened]').waitFor({ timeout: 20000 });
  c225Seen = {
    paid: await page.locator('[data-rte-state="paid"]').count(),
    raised: await page.locator('[data-rte-state="raised"]').count(),
    receipts: await page.locator('[data-rte-receipt="receipt"]').count(),
    reopened: await page.locator('[data-rte-reopened]').count(),
    counting: await page.locator('[data-rte-counting="rte_covered"]').count(),
  };
};
const rtePartsDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from rte_claim_receipts where school_id = $1) as receipts,
            (select count(*)::int from rte_claims where school_id = $1 and state = 'paid' and settled_by = $2 and reference = $5) as paid,
            (select count(*)::int from rte_claims where school_id = $1 and state = 'raised' and reopened_by = $2 and reopen_reason = $3 and write_off_note is null) as reopened,
            (select (select sum(amount_minor) from rte_claim_receipts where school_id = $1) = (select amount_minor from rte_claims where school_id = $1 and state = 'paid') + 400000) as received,
            (select string_agg(event_action, ',' order by audit_id) from audit_log where audit_id > $4 and event_action like 'rte.%') as audited,
            (select count(*)::int from audit_log where audit_id > $4 and event_action like 'rte.%' and (coalesce(before_state::text, '') || coalesce(after_state::text, '')) ~ 'HARNESS|district') as free_text`,
    [SCHOOL, PEOPLE.principal.sub, C225_REASON, c225From, C225_REFS[1]]
  );
  await c225Clear();
  const r = rows[0];
  const want = { receipts: 3, paid: 1, reopened: 1, received: true, audited: 'rte.claim_raised,rte.claim_raised,rte.receipt_recorded,rte.claim_paid,rte.receipt_recorded,rte.claim_written_off,rte.claim_reopened', free_text: 0 };
  if (JSON.stringify(r) !== JSON.stringify(want)) throw new Error(`the RTE payments in the database: ${JSON.stringify(r)}`);
  if (JSON.stringify(c225Seen) !== JSON.stringify({ paid: 1, raised: 1, receipts: 3, reopened: 1, counting: 1 })) throw new Error(`the RTE payments on the screen: ${JSON.stringify(c225Seen)}`);
};
const rtePlan = async (page) => {
  if (c225SubBefore === undefined) c225SubBefore = (await db.pg.query(`select plan_id from school_subscriptions where school_id = $1`, [SCHOOL])).rows[0] ?? null;
  await db.pg.query(`insert into school_subscriptions (school_id, plan_id) values ($1, 'starter') on conflict (school_id) do update set plan_id = 'starter'`, [SCHOOL]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-rte-not-in-plan]').waitFor({ timeout: 20000 });
  c225PlanSeen = {
    notInPlan: await page.locator('[data-rte-not-in-plan]').count(),
    desk: await page.locator('[data-rte-desk]').count(),
    route: (await page.request.get(new URL('/api/app/fees/rte/desk', page.url()).href)).status(),
  };
};
const rtePlanDone = async () => {
  if (c225SubBefore === null) await db.pg.query(`delete from school_subscriptions where school_id = $1`, [SCHOOL]);
  else if (c225SubBefore) await db.pg.query(`update school_subscriptions set plan_id = $2 where school_id = $1`, [SCHOOL, c225SubBefore.plan_id]);
  if (JSON.stringify(c225PlanSeen) !== JSON.stringify({ notInPlan: 1, desk: 0, route: 403 })) throw new Error(`the RTE desk on a plan without it: ${JSON.stringify(c225PlanSeen)}`);
};
// c225 end
// c226 begin
// The free month (C226, docs/30). Control: the founder opens the school's "Free month", starts it with Growth as the
// plan after it (the last day comes prefilled as day 30), then extends it to day 40 with a reason; the list above the
// schools and the school's card show it, and the history shows each reason. Growth's card shows C226's placement
// (Admissions; the RTE claim desk, the compliance desk and the timetable generator). The database is checked and
// everything is put back as it was: the school's switches, its plan, its subscription and the audit rows.
const TRIAL_REASON = 'harness-c226 agreed at the demo';
const TRIAL_EXTEND_REASON = 'harness-c226 the trust meets next week';
let trialBefore = null;
let trialSeen = null;
const trialSnapshot = async () => {
  const { rows } = await db.pg.query(
    `select (select coalesce(max(audit_id), 0) from audit_log) as audit_from,
            (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from school_module_entitlements m where m.school_id = $1) as switches,
            (select to_jsonb(s) from school_subscriptions s where s.school_id = $1) as subscription,
            (select plan from school_entitlements where school_id = $1) as plan`,
    [SCHOOL]
  );
  return rows[0];
};
const trialPutBack = async (before) => {
  await db.pg.exec(`set session_replication_role = replica;
    delete from entitlement_change_reasons where audit_id in (select audit_id from audit_log where audit_id > ${Number(before.audit_from)} and school_id = '${SCHOOL}' and event_action like 'entitlement.%');
    delete from audit_log where audit_id > ${Number(before.audit_from)} and school_id = '${SCHOOL}' and event_action like 'entitlement.%';
    delete from school_trials where school_id = '${SCHOOL}';
    delete from school_subscriptions where school_id = '${SCHOOL}';
    delete from school_module_entitlements where school_id = '${SCHOOL}';
    set session_replication_role = origin;`);
  await db.pg.query(`set session_replication_role = replica`);
  try {
    await db.pg.query(`insert into school_module_entitlements select * from jsonb_populate_recordset(null::school_module_entitlements, $1::jsonb)`, [JSON.stringify(before.switches)]);
    if (before.subscription) await db.pg.query(`insert into school_subscriptions select * from jsonb_populate_record(null::school_subscriptions, $1::jsonb)`, [JSON.stringify(before.subscription)]);
    await db.pg.query(`update school_entitlements set plan = $2 where school_id = $1`, [SCHOOL, before.plan]);
  } finally {
    await db.pg.query(`set session_replication_role = origin`);
  }
};
const trialControl = async (page) => {
  trialBefore = await trialSnapshot();
  await db.pg.exec(`set session_replication_role = replica; delete from school_trials where school_id = '${SCHOOL}'; set session_replication_role = origin;`);
  await page.reload({ waitUntil: 'networkidle' });
  const school = page.locator(`[data-billing-school="${SCHOOL}"]`);
  await school.locator('[data-billing-trial-open]').click();
  await school.locator('[data-billing-trial-start]').waitFor({ timeout: 20000 });
  const prefilled = await page.locator(`#trial-ends-${SCHOOL}`).inputValue();
  await page.selectOption(`#trial-plan-${SCHOOL}`, 'growth');
  await page.locator(`#trial-why-${SCHOOL}`).fill(TRIAL_REASON);
  await school.locator('[data-billing-trial-start-save]').click();
  await page.waitForFunction(() => /free month has started/.test(document.querySelector('[data-billing-note]')?.textContent ?? ''), null, { timeout: 20000 });
  await school.locator('[data-billing-trial-extend]').waitFor({ timeout: 20000 });
  await page.locator(`#trial-extend-${SCHOOL}`).fill(indiaDayFromNow(40));
  await page.locator(`#trial-extend-why-${SCHOOL}`).fill(TRIAL_EXTEND_REASON);
  await school.locator('[data-billing-trial-extend-save]').click();
  await page.waitForFunction(() => /free month is extended/.test(document.querySelector('[data-billing-note]')?.textContent ?? ''), null, { timeout: 20000 });
  await school.locator('[data-billing-trial-event="extended"]').waitFor({ timeout: 20000 });
  const growth = page.locator('[data-billing-plan="growth"]');
  trialSeen = {
    prefilled,
    listLine: await page.locator(`[data-billing-trial="${SCHOOL}"] [data-billing-trial-line]`).textContent(),
    cardLine: await school.locator('[data-billing-school-trial]').textContent(),
    events: await school.locator('[data-billing-trial-event]').evaluateAll((els) => els.map((e) => e.getAttribute('data-billing-trial-event')).join()),
    panel: await school.locator('[data-billing-trial-panel]').textContent(),
    growthFeatures: await growth.locator('[data-billing-features]').textContent(),
    growthCard: await growth.textContent(),
  };
  await school.locator('[data-billing-trial-panel]').scrollIntoViewIfNeeded();
};
const trialControlDone = async () => {
  const { rows } = await db.pg.query(
    `select (select count(*)::int from school_trials where school_id = $1 and starts_on = ${TODAY_SQL} and ends_on = $2::date and started_by = $3 and ended_at is null) as trials,
            (select plan_id from school_subscriptions where school_id = $1) as plan_after,
            (select count(*)::int from school_module_entitlements where school_id = $1 and source = 'trial' and enabled) as trial_switches,
            (select count(*)::int from school_module_entitlements where school_id = $1 and module_id = 'early-warning' and source = 'trial' and enabled) as early_warning,
            (select count(*)::int from audit_log where school_id = $1 and event_action in ('entitlement.trial_started', 'entitlement.trial_extended') and actor_user_id = $3
               and (coalesce(before_state::text, '') || after_state::text) not ilike '%harness-c226%') as audits,
            (select count(*)::int from entitlement_change_reasons r join audit_log a on a.audit_id = r.audit_id
              where a.school_id = $1 and a.event_action in ('entitlement.trial_started', 'entitlement.trial_extended') and r.reason in ($4, $5)) as reasons`,
    [SCHOOL, indiaDayFromNow(40), PEOPLE.founder.sub, TRIAL_REASON, TRIAL_EXTEND_REASON]
  );
  await trialPutBack(trialBefore);
  const r = rows[0];
  if (r.trials !== 1 || r.plan_after !== 'growth' || r.trial_switches < 20 || r.early_warning !== 1 || r.audits !== 2 || r.reasons !== 2) throw new Error(`the free month, in the database: ${JSON.stringify(r)}`);
  const seen = trialSeen ?? {};
  if (seen.prefilled !== indiaDayFromNow(30) || !/\(40 days left\), then Growth/.test(seen.listLine ?? '') || !/\(40 days left\), then Growth/.test(seen.cardLine ?? '')) throw new Error(`the free month, on the screen: ${JSON.stringify(seen)}`);
  if (seen.events !== 'extended,started' || !seen.panel?.includes(TRIAL_REASON) || !seen.panel?.includes(TRIAL_EXTEND_REASON)) throw new Error(`the free month's history: ${JSON.stringify(seen)}`);
  // C226's placement, shown plainly on Growth's card.
  if (!/RTE claim desk/.test(seen.growthFeatures ?? '') || !/compliance desk/.test(seen.growthFeatures ?? '') || !/timetable generator/.test(seen.growthFeatures ?? '') || !/Admissions/.test(seen.growthCard ?? '')) throw new Error(`Growth's placement: ${JSON.stringify(seen)}`);
};
// The school's office in its free month (the state put in place as Control leaves it; the move itself is proven in
// test/billing/trial.test.ts): the quiet line with the days left, then from 7 days before the end the notice naming the
// plan; a teacher of the same school sees neither. Never an amount. Put back afterwards.
let trialLineSeen = null;
const putTrial = async (daysLeft) => {
  trialBefore = await trialSnapshot();
  await db.pg.exec(`set session_replication_role = replica;
    delete from school_trials where school_id = '${SCHOOL}';
    delete from school_subscriptions where school_id = '${SCHOOL}';
    insert into school_subscriptions (school_id, plan_id) values ('${SCHOOL}', 'growth');
    insert into school_trials (school_id, starts_on, ends_on, started_by) values ('${SCHOOL}', ${TODAY_SQL} - ${30 - daysLeft}, ${TODAY_SQL} + ${daysLeft}, '${PEOPLE.founder.sub}');
    set session_replication_role = origin;`);
};
const trialLine = (daysLeft) => async (page) => {
  await putTrial(daysLeft);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const line = page.locator('[data-trial-notice]');
  trialLineSeen = (await line.count()) ? { kind: await line.getAttribute('data-trial-notice'), text: await line.textContent() } : { kind: null, text: null };
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
};
const trialLineDone = (expected) => async () => {
  await trialPutBack(trialBefore);
  const seen = trialLineSeen ?? {};
  if (seen.kind !== expected.kind || (expected.text && !expected.text.test(seen.text ?? '')) || /₹|rupee/i.test(seen.text ?? '')) throw new Error(`the free month's line: ${JSON.stringify(seen)}`);
};
// c226 end
// c219 begin
// Co-scholastic grades (C219), on C215's fixture. The school saves a scheme version with two co-scholastic areas (made
// up) graded A to C, shown on the report card. Tara, the class teacher of 5-A, chooses roll 1's grades on the report
// cards screen and saves them through the app. The check reads them back, then takes away the grades, the scheme
// version and the audit row, and puts C215's fixture back.
const RC_CO = { areas: ['Work Education', 'Art Education'], grades: [{ grade: 'A', meaning: 'Outstanding', pass: true }, { grade: 'B', meaning: null, pass: true }, { grade: 'C', meaning: null, pass: true }] };
let rcCoSchemeBefore;
let rcCoSeen = null;
const rcCoScholastic = async (page) => {
  await rcFixture({ earlier: false });
  rcCoSchemeBefore = Number((await db.pg.query(`select coalesce(max(version), 0) as v from grading_schemes where school_id = $1`, [SCHOOL])).rows[0].v);
  await db.pg.query(
    `insert into grading_schemes (school_id, version, scheme, made_by)
     select school_id, version + 1, jsonb_set(jsonb_set(scheme, '{coScholastic}', $2::jsonb), '{layout,coScholastic}', 'true'::jsonb), $3
       from grading_schemes where school_id = $1 order by version desc limit 1`,
    [SCHOOL, JSON.stringify(RC_CO), PEOPLE.principal.sub]
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-rc-co-child]').first().waitFor({ timeout: 20000 });
  const first = page.locator(`[data-rc-child="${xKid(1)}"]`);
  await first.locator('[data-rc-co="Work Education"]').selectOption('A');
  await first.locator('[data-rc-co="Art Education"]').selectOption('B');
  await page.locator('[data-rc-co-save]').click();
  await page.locator('[data-rc-note="ok"]').waitFor({ timeout: 20000 });
  rcCoSeen = {
    note: await page.locator('[data-rc-note="ok"]').textContent(),
    how: await page.locator('[data-rc-co-how]').textContent(),
    options: await first.locator('[data-rc-co="Work Education"] option').evaluateAll((els) => els.map((e) => e.textContent)),
    chosen: await first.locator('[data-rc-co]').evaluateAll((els) => els.map((e) => e.value)),
    saveNow: await page.locator('[data-rc-co-save]').textContent(),
  };
  await first.scrollIntoViewIfNeeded();
};
const rcCoScholasticDone = async () => {
  const { rows } = await db.pg.query(
    `select g.student_id, g.area, g.grade, g.written_by,
            (select count(*)::int from audit_log a where a.school_id = g.school_id and a.event_action = 'exam.co_scholastic_saved' and a.actor_user_id = g.written_by and (a.after_state ->> 'saved')::int = 2) as audits
       from co_scholastic_grades g where g.school_id = $1 and g.exam_id = $2 order by g.area`,
    [SCHOOL, X_EXAM]
  );
  await db.pg.exec(`set session_replication_role = replica;
    delete from co_scholastic_grades where school_id = '${SCHOOL}';
    delete from grading_schemes where school_id = '${SCHOOL}' and version > ${Number(rcCoSchemeBefore ?? 0)};
    set session_replication_role = origin;`);
  rcCoSchemeBefore = undefined;
  await rcPutBack();
  const t = PEOPLE.teacher.sub;
  const want = [{ student_id: xKid(1), area: 'Art Education', grade: 'B', written_by: t, audits: 1 }, { student_id: xKid(1), area: 'Work Education', grade: 'A', written_by: t, audits: 1 }];
  if (JSON.stringify(rows) !== JSON.stringify(want)) throw new Error(`the co-scholastic grades in the database: ${JSON.stringify(rows)}`);
  const seen = rcCoSeen ?? {};
  const wantSeen = { note: 'Co-scholastic grades saved.', options: ['Not graded', 'A (Outstanding)', 'B', 'C'], chosen: ['A', 'B'], saveNow: 'No co-scholastic grade has changed.' };
  const { how, ...rest } = seen;
  if (JSON.stringify(rest) !== JSON.stringify(wantSeen) || !/frozen with the marks/.test(how ?? '')) throw new Error(`the co-scholastic grades on the screen: ${JSON.stringify(seen)}`);
};
// c219 end
// c235d begin
// Papers on a record and the list exports (C235-D). A paper with two versions goes on Tara's staff record and one on the
// seeded student's record, straight in the database (the harness keeps no files, so nothing is uploaded); the screen is
// read again and the earlier versions opened. The list screens open their Download menu, and each export is asked for
// over HTTP as the principal: an .xlsx (a ZIP) and a CSV. Everything is taken away after.
const C235D_STAFF_DOC = '00000000-0000-4000-8000-0000000d2351';
const C235D_STUDENT_DOC = '00000000-0000-4000-8000-0000000d2352';
const c235dGone = () => db.pg.exec(`delete from record_document_versions where document_id in ('${C235D_STAFF_DOC}', '${C235D_STUDENT_DOC}');
  delete from record_documents where document_id in ('${C235D_STAFF_DOC}', '${C235D_STUDENT_DOC}');`);
const c235dPapers = async () => {
  await c235dGone();
  const add = `insert into record_document_versions (school_id, document_id, version_no, storage_key, mime_type, size_bytes, uploaded_by) values ($1, $2, 1, $3, $4, $5, $6)`;
  await db.pg.query(`insert into record_documents (document_id, school_id, staff_user_id, kind, title, created_by) values ($1, $2, $3, 'academic_certificate', 'B.Ed. degree certificate', $4)`, [C235D_STAFF_DOC, SCHOOL, PEOPLE.teacher.sub, PEOPLE.principal.sub]);
  await db.pg.query(add, [SCHOOL, C235D_STAFF_DOC, `${SCHOOL}/record-documents/staff/${PEOPLE.teacher.sub}/${C235D_STAFF_DOC}/v1.jpg`, 'image/jpeg', 412000, PEOPLE.principal.sub]);
  await db.pg.query(add, [SCHOOL, C235D_STAFF_DOC, `${SCHOOL}/record-documents/staff/${PEOPLE.teacher.sub}/${C235D_STAFF_DOC}/v2.pdf`, 'application/pdf', 1830000, PEOPLE.office.sub]);
  // The first upload was some weeks ago (the database dates each version when it is written).
  await db.pg.query(`update record_document_versions set uploaded_at = now() - interval '40 days' where document_id = $1 and version_no = 1`, [C235D_STAFF_DOC]);
  await db.pg.query(`insert into record_documents (document_id, school_id, student_id, kind, title, created_by) values ($1, $2, $3, 'academic_certificate', 'Transfer certificate from the previous school', $4)`, [C235D_STUDENT_DOC, SCHOOL, STUDENT, PEOPLE.office.sub]);
  await db.pg.query(add, [SCHOOL, C235D_STUDENT_DOC, `${SCHOOL}/record-documents/student/${STUDENT}/${C235D_STUDENT_DOC}/v1.pdf`, 'application/pdf', 96000, PEOPLE.office.sub]);
};
let c235dSeen = null;
const staffPapers = async (page) => {
  await c235dPapers();
  await page.reload({ waitUntil: 'networkidle' });
  const doc = page.locator(`[data-record-document="${C235D_STAFF_DOC}"]`);
  await doc.waitFor({ timeout: 20000 });
  await doc.locator('[data-earlier-versions] summary').click();
  c235dSeen = { versions: await doc.getAttribute('data-versions'), earlier: await doc.locator('[data-record-version]').count(), upload: await page.getByRole('button', { name: '+ Add a document' }).count() };
  await page.evaluate(() => window.scrollTo(0, 0)); // the whole page is photographed from the top
  await page.waitForTimeout(300);
};
const staffPapersDone = async () => {
  await c235dGone();
  if (JSON.stringify(c235dSeen) !== JSON.stringify({ versions: '2', earlier: 1, upload: 1 })) throw new Error(`the staff paper on the screen: ${JSON.stringify(c235dSeen)}`);
};
const studentPapers = async (page) => {
  await c235dPapers();
  await page.reload({ waitUntil: 'networkidle' });
  const doc = page.locator(`[data-record-document="${C235D_STUDENT_DOC}"]`);
  await doc.waitFor({ timeout: 20000 });
  await page.evaluate(() => window.scrollTo(0, 0)); // the whole page is photographed from the top
  await page.waitForTimeout(300);
};
// C235-D2: a paper sent straight to the file store. The harness keeps no file store, so the browser's ask, its send
// and the confirmation are stood in for in the page (the routes themselves: test/documents/record-direct-upload.test.ts),
// and the confirmation is held, so the screen is photographed while the server "checks" a 6 MB file. The second screen
// is the browser's own refusal of a file over 10 MB, before anything is sent.
const pngOf = (size) => {
  const b = Buffer.alloc(size);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  return b;
};
let c235d2Seen = null;
let c235d2Held = null;
const openAddPaper = async (page) => {
  await c235dGone();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '+ Add a document' }).click();
  await page.locator('[data-record-document-form] input[name="title"]').fill('Relieving letter from the previous school');
};
const directChecking = async (page) => {
  await openAddPaper(page);
  const ticket = { pendingId: 'harness.pending', uploadUrl: `${base}/__harness-store/letter.png`, contentType: 'image/png', maxBytes: 10485760, expiresAt: new Date(Date.now() + 600000).toISOString() };
  await page.route('**/record-documents/upload', (r) => r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(ticket) }));
  await page.route('**/__harness-store/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  // Held: the screen stays on "Checking the file" (and the request is dropped after, never sent on to the server).
  await page.route('**/record-documents/confirm', (r) => {
    c235d2Held = r;
  });
  await page.locator('[data-record-document-form] input[type=file]').setInputFiles({ name: 'relieving-letter.png', mimeType: 'image/png', buffer: pngOf(6 * 1024 * 1024) });
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await page.locator('[data-upload-progress="checking"]').waitFor({ timeout: 20000 });
  c235d2Seen = { phase: await page.locator('[data-upload-progress]').getAttribute('data-upload-progress'), bar: await page.locator('[role=progressbar]').getAttribute('aria-valuenow'), busy: await page.getByRole('button', { name: 'Uploading…' }).isDisabled() };
};
const directCheckingDone = async (page) => {
  await c235d2Held?.abort().catch(() => undefined);
  c235d2Held = null;
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  if (JSON.stringify(c235d2Seen) !== JSON.stringify({ phase: 'checking', bar: '100', busy: true })) throw new Error(`the upload on the screen: ${JSON.stringify(c235d2Seen)}`);
};
const directTooLarge = async (page) => {
  await openAddPaper(page);
  let asked = 0;
  await page.route('**/record-documents/upload', (r) => ((asked += 1), r.abort()));
  await page.locator('[data-record-document-form] input[type=file]').setInputFiles({ name: 'service-book.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 0x25) });
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await page.locator('[data-upload-failed]').waitFor({ timeout: 20000 });
  c235d2Seen = { said: (await page.locator('[data-upload-failed]').textContent())?.trim(), asked };
};
const directTooLargeDone = async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  if (JSON.stringify(c235d2Seen) !== JSON.stringify({ said: 'The file is larger than 10 MB. Choose a smaller one.', asked: 0 })) throw new Error(`the refusal on the screen: ${JSON.stringify(c235d2Seen)}`);
};
const listExportOpen = (list) => async (page) => {
  await page.locator('[data-list-export] summary').click();
  const asked = {};
  for (const format of ['xlsx', 'csv']) {
    const res = await page.request.get(`${base}/api/app/${list}/export?format=${format}`);
    const body = await res.body();
    asked[format] = { status: res.status(), type: res.headers()['content-type'], zip: body.subarray(0, 2).toString('latin1') === 'PK' };
  }
  c235dSeen = { asked, links: await page.locator('[data-export-link]').count(), profiles: await page.locator('[data-staff-profile-link]').count() };
};
const listExportDone = (list) => async () => {
  const s = c235dSeen ?? {};
  const xlsxOk = s.asked?.xlsx?.status === 200 && s.asked.xlsx.zip && /spreadsheetml/.test(s.asked.xlsx.type ?? '');
  const csvOk = s.asked?.csv?.status === 200 && /text\/csv/.test(s.asked.csv.type ?? '');
  const wantLinks = list === 'students' ? 4 : 2;
  if (!xlsxOk || !csvOk || s.links !== wantLinks || (list === 'staff' && !(s.profiles > 0))) throw new Error(`the ${list} export: ${JSON.stringify(s)}`);
};
// c235d end
// c238 begin
// C238: the staff profile's tabs, with a profile the office has filled in for the harness's teacher (no photo: the
// harness keeps no file store, so the header shows the initials). Put back after each picture.
const c238Gone = () => db.pg.query(`delete from staff_profiles where school_id = $1 and user_id = $2`, [SCHOOL, PEOPLE.teacher.sub]);
const c238Profile = async () => {
  await c238Gone();
  await db.pg.query(
    `insert into staff_profiles (school_id, user_id, staff_code, designation, employment_type, joining_date, date_of_birth, address, emergency_contact, updated_by)
     values ($1, $2, 'T-0007', 'TGT Science', 'permanent', '2021-06-01', '1988-04-12', $3, 'Meena Example +91 90000 22222', $4)`,
    [SCHOOL, PEOPLE.teacher.sub, '14 Example Road\nExample Nagar', PEOPLE.principal.sub]
  );
};
let c238Seen = null;
const c238Tab = (tab) => async (page) => {
  await c238Profile();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator(`#staff-profile-tabpanel-${tab}`).waitFor({ timeout: 20000 });
  c238Seen = {
    ok: (await page.locator(`#staff-profile-tab-${tab}`).getAttribute('aria-selected')) === 'true' && (await page.locator(`#staff-profile-tabpanel-${tab}`).isVisible()),
    code: (await page.locator('[data-staff-code]').textContent())?.trim(),
  };
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
};
const c238Edit = async (page) => {
  await c238Profile();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-staff-edit]').click();
  const form = page.locator('[data-staff-profile-form]');
  await form.waitFor({ timeout: 20000 });
  c238Seen = { ok: (await form.locator('input[name=staff_code]').inputValue()) === 'T-0007', code: (await page.locator('[data-staff-code]').textContent())?.trim() };
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
};
const c238Done = async () => {
  await c238Gone();
  if (!c238Seen?.ok || c238Seen.code !== 'T-0007') throw new Error(`the staff profile on the screen: ${JSON.stringify(c238Seen)}`);
};
// c238 end
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
  await page.locator('[data-module-off]').first().waitFor({ state: 'attached', timeout: 15000 });
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
// C235-B: the branded bar, the school's menu, and the school's own name and logo. The harness has no storage, so a
// logo is shown by giving the school a logo key (as the app would after an upload) and answering the logo's address
// in the browser with a picture drawn here; everything else is the app's own.
const BRAND_KEY = `${SCHOOL}/branding/logo-00000000-0000-4000-8000-00000000b235.png`;
const BRAND_NAME = 'Illustrative Public School';
const drawnLogo = (page) =>
  page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d');
    const fill = g.createLinearGradient(0, 0, 256, 256);
    fill.addColorStop(0, '#002357');
    fill.addColorStop(1, '#1D4ED8');
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(128, 10);
    g.lineTo(236, 50);
    g.lineTo(236, 132);
    g.quadraticCurveTo(228, 212, 128, 246);
    g.quadraticCurveTo(28, 212, 20, 132);
    g.lineTo(20, 50);
    g.closePath();
    g.fill();
    g.fillStyle = '#F5B90A';
    g.fillRect(70, 150, 116, 14);
    g.beginPath();
    g.moveTo(128, 58);
    g.lineTo(186, 136);
    g.lineTo(70, 136);
    g.closePath();
    g.fill();
    return c.toDataURL('image/png').split(',')[1];
  });
const showLogo = async (page) => {
  const body = Buffer.from(await drawnLogo(page), 'base64');
  await page.route('**/api/branding/logo**', (route) => route.fulfill({ status: 200, contentType: 'image/png', headers: { 'cache-control': 'private, max-age=86400' }, body }));
  await db.pg.query(`update schools set logo_path = $2 where school_id = $1`, [SCHOOL, BRAND_KEY]);
  await page.reload({ waitUntil: 'networkidle' });
};
const hideLogo = async (page) => {
  await page.unroute('**/api/branding/logo**');
  await db.pg.query(`update schools set logo_path = null, name = $2 where school_id = $1`, [SCHOOL, BRAND_NAME]);
};
// The bar: the logo (loaded), the school's name, the person's name and role; still at the top after scrolling.
const brandBar = async (page, { name, role }) => {
  const phone = page.viewportSize().width < 768;
  const seen = await page.evaluate(() => {
    const logo = document.querySelector('[data-shell-brand] [data-school-logo]');
    return {
      logo: logo?.getAttribute('data-school-logo') ?? null,
      loaded: logo instanceof HTMLImageElement ? logo.complete && logo.naturalWidth > 0 : null,
      school: document.querySelector('[data-shell-school]')?.textContent?.trim() ?? null,
      line: document.querySelector('[data-shell-person-line]')?.textContent?.trim() ?? null,
      person: document.querySelector('[data-shell-person]')?.getAttribute('aria-label') ?? null,
    };
  });
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(300);
  const top = await page.locator(phone ? '[data-shell-brand]' : '[data-shell-header]').evaluate((e) => Math.round(e.getBoundingClientRect().top));
  await page.mouse.wheel(0, -3000);
  await page.waitForTimeout(300);
  return { ...seen, top, phone, want: { name, role } };
};
const checkBar = (seen, { school = BRAND_NAME, logo = 'picture' } = {}) => {
  const { name, role } = seen.want;
  if (seen.logo !== logo || (logo === 'picture' && seen.loaded !== true)) throw new Error(`the bar does not show the school's ${logo}: ${JSON.stringify(seen)}`);
  if (seen.school !== school) throw new Error(`the bar does not show the school's name: ${seen.school}`);
  if (seen.phone ? seen.line !== `${name} · ${role}` : seen.person !== `My account: ${name}, ${role}`) throw new Error(`the bar does not show who is signed in: ${JSON.stringify(seen)}`);
  if (seen.top !== 0) throw new Error(`the bar did not stay at the top when the page scrolled: ${seen.top}`);
};
let brandSeen = null;
const brandedShell = async (page) => {
  await showLogo(page);
  brandSeen = await brandBar(page, { name: 'Priya Example', role: 'Principal' });
  brandSeen.parts = page.viewportSize().width < 768 ? [] : await page.locator('aside nav').evaluate((nav) => [...nav.querySelectorAll('[data-nav-part]')].map((e) => e.getAttribute('data-nav-part')));
};
const brandedShellDone = async (page) => {
  await hideLogo(page);
  checkBar(brandSeen);
  if (page.viewportSize().width >= 768 && brandSeen.parts.join() !== 'home,frequent,all') throw new Error(`the menu is not Home, Frequent work, All modules: ${brandSeen.parts}`);
};
// The menu, as a phone opens it: Home, Frequent work, then All modules with the page's group open.
let menuSeen = null;
const brandedMenu = async (page) => {
  if (page.viewportSize().width < 768) await page.getByRole('button', { name: 'Open menu' }).first().click();
  const nav = page.locator(page.viewportSize().width < 768 ? '[role="dialog"] nav' : 'aside nav');
  await nav.locator('[data-nav-part="all"]').waitFor({ timeout: 15000 });
  menuSeen = await nav.evaluate((n) => ({
    parts: [...n.querySelectorAll('[data-nav-part]')].map((e) => e.getAttribute('data-nav-part')),
    frequent: [...n.querySelectorAll('[data-nav-part="frequent"] a')].map((a) => a.textContent.trim()),
    open: [...n.querySelectorAll('[data-nav-group] button[aria-expanded="true"]')].map((b) => b.textContent.trim()),
    groups: n.querySelectorAll('[data-nav-group]').length,
    current: [...n.querySelectorAll('a[aria-current="page"]')].map((a) => a.textContent.trim()),
  }));
};
const brandedMenuDone = async (page) => {
  if (page.viewportSize().width < 768) await page.keyboard.press('Escape');
  const want = { parts: ['home', 'frequent', 'all'], frequent: ['Students', 'Staff', 'Attendance', 'Fees', 'Leave approval'], open: ['Teaching & Learning›'], groups: 7 };
  const got = { parts: menuSeen.parts, frequent: menuSeen.frequent, open: menuSeen.open, groups: menuSeen.groups };
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`the menu: ${JSON.stringify(menuSeen)}`);
  if (!menuSeen.current.includes('Attendance')) throw new Error(`the page is not marked in the menu: ${menuSeen.current}`);
};
// Settings, as the principal: the school's name changed and saved (the bar follows with no reload, one audit row by
// ids only), and an SVG chosen as the logo: drawn on this device and shown, waiting to be saved.
const BRAND_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><rect width="120" height="60" rx="10" fill="#0F766E"/><circle cx="30" cy="30" r="16" fill="#FFD23F"/><rect x="56" y="20" width="50" height="8" rx="4" fill="#fff"/><rect x="56" y="34" width="36" height="8" rx="4" fill="#fff"/></svg>';
let brandingSeen = null;
const settingsBranding = async (page) => {
  await hideLogo(page).catch(() => undefined);
  await page.reload({ waitUntil: 'networkidle' });
  const card = page.locator('[data-branding]');
  await card.waitFor({ timeout: 15000 });
  await card.getByLabel('School’s official name').fill('Illustrative Public School, Sector 5');
  await card.locator('[data-branding-save]').click();
  await card.locator('[data-branding-note="ok"]').waitFor({ timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('[data-shell-school]')?.textContent?.trim() === 'Illustrative Public School, Sector 5', null, { timeout: 20000 });
  await card.locator('[data-branding-file]').setInputFiles({ name: 'school-logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(BRAND_SVG) });
  await card.locator('[data-branding-preview] img[data-school-logo="picture"]').waitFor({ timeout: 15000 });
  brandingSeen = {
    note: (await card.locator('[data-branding-note]').textContent()).trim(),
    preview: await card.locator('[data-branding-preview] img').evaluate((img) => ({ blob: img.src.startsWith('blob:'), w: img.naturalWidth, h: img.naturalHeight })),
    row: (await db.pg.query(`select name, logo_path from schools where school_id = $1`, [SCHOOL])).rows[0],
    audit: (await db.pg.query(`select actor_role::text as role, target_id, after_state from audit_log where school_id = $1 and event_action = 'school.branding_updated' order by audit_id desc limit 1`, [SCHOOL])).rows[0],
  };
  await page.evaluate(() => window.scrollTo(0, 0));
};
const settingsBrandingDone = async (page) => {
  await hideLogo(page);
  const s = brandingSeen ?? {};
  if (s.row?.name !== 'Illustrative Public School, Sector 5' || s.row?.logo_path !== null) throw new Error(`the name was not saved: ${JSON.stringify(s.row)}`);
  if (s.audit?.role !== 'principal' || s.audit?.target_id !== SCHOOL || JSON.stringify(s.audit?.after_state) !== JSON.stringify({ logo: 'kept', nameChanged: true })) throw new Error(`the change is not audited by ids only: ${JSON.stringify(s.audit)}`);
  // The SVG never leaves the device as an SVG: it is drawn, 512 pixels on its long side.
  if (!s.preview?.blob || s.preview.w !== 512 || s.preview.h !== 256 || s.note !== 'New logo chosen. Save to use it.') throw new Error(`the chosen SVG was not drawn as a 512-pixel picture: ${JSON.stringify(s)}`);
};
// A teacher's Settings: no branding card; the bar shows the teacher.
let teacherBrandSeen = null;
const teacherNoBranding = async (page) => {
  await page.locator('[data-settings-module]').first().waitFor({ timeout: 15000 });
  teacherBrandSeen = { cards: await page.locator('[data-branding]').count(), bar: await brandBar(page, { name: 'Tara Example', role: 'Teacher' }) };
};
const teacherNoBrandingDone = async () => {
  if (teacherBrandSeen.cards !== 0) throw new Error('a teacher is shown the school profile and branding card');
  checkBar(teacherBrandSeen.bar, { logo: 'initials' });
};
// Control: the founder's bar, and the school's name and logo while onboarding it.
let controlBrandSeen = null;
const controlBranding = async (page) => {
  await showLogo(page);
  const card = page.locator('[data-branding]');
  await card.locator('[data-branding-preview] img[data-school-logo="picture"]').waitFor({ timeout: 20000 });
  controlBrandSeen = {
    name: await card.getByLabel('School’s official name').inputValue(),
    logo: await card.locator('[data-branding-preview] img').evaluate((img) => ({ src: new URL(img.src).search, w: img.naturalWidth })),
    remove: await card.locator('[data-branding-remove]').count(),
    bar: await brandBar(page, { name: 'Illustrative Founder', role: 'Platform admin' }),
  };
};
const controlBrandingDone = async (page) => {
  await hideLogo(page);
  const s = controlBrandSeen;
  if (s.name !== BRAND_NAME || !s.logo.src.startsWith(`?school=${SCHOOL}&v=`) || s.logo.w !== 256 || s.remove !== 1) throw new Error(`Control's branding card: ${JSON.stringify(s)}`);
  checkBar(s.bar, { school: 'NetCyberAI Control' });
};
// The family app: the school's logo and name at the top.
let familyBrandSeen = null;
const familyBranded = async (page) => {
  await showLogo(page);
  const top = page.locator('[data-family-school]');
  await top.locator('img[data-school-logo="picture"]').waitFor({ timeout: 15000 });
  familyBrandSeen = { name: (await top.textContent()).trim(), loaded: await top.locator('img').evaluate((img) => img.complete && img.naturalWidth > 0) };
};
const familyBrandedDone = async (page) => {
  await hideLogo(page);
  if (familyBrandSeen.name !== BRAND_NAME || !familyBrandSeen.loaded) throw new Error(`the family app's top: ${JSON.stringify(familyBrandSeen)}`);
};

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
  ['parent', 'family-home', '/family', familyHome, familyHomeDone],
  ['founder', 'control-schools', '/control/schools'],
  ['founder', 'control-school', `/control/schools/${SCHOOL}`],
  ['founder', 'control-view-as', `/control/schools/${SCHOOL}`, viewAs, viewAsDone],
  ['founder', 'control-users', '/control/users'],
  ['founder', 'control-onboarding', '/control/onboarding'],
  ['founder', 'control-applications', '/control/onboarding/applications'],
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
  // Slice 8d-2 (C203): complaints, meetings and leave each open on a dashboard number's filter. After the
  // picture, each check makes one change in the list below and the rows above must follow it with no reload.
  ['principal', 'app-complaints-rows', '/app/complaints?show=overdue', shownWith(addComplaint, { rows: 1, words: ['Complaints past their due time: 1', 'Overdue'], never: ['Harness 8d'] }), complaintShownDone],
  ['principal', 'app-ptm-rows', '/app/ptm?show=coming', shownWith(addMeeting, { rows: 1, words: ['Meetings coming: 1', 'Harness 8d term meeting'] }), ptmShownDone],
  ['principal', 'app-staff-leave-rows', '/app/staff?show=on-leave-today', shownWith(addLeaveAndCover, { rows: 1, words: ['Staff on leave today: 1', 'Tejas Example'], never: ['Tanvi Example ·', 'Harness 8d'] }), staffLeaveShownDone],
  // Proxy Auto opened on the periods that still need cover: those periods and no others, and one tap takes one away.
  ['principal', 'app-proxy-rows', '/app/proxy?show=needs-cover', proxyRows, proxyRowsDone],
  // p5-8d end
  // p5-8e begin
  ['founder', 'control-billing-plans', '/control/billing-plans', billingPlans, billingPlansDone],
  ['principal', 'app-paid-until', '/app/my-day', schoolInGrace, schoolInGraceDone],
  // p5-8e end
  // p5-8f begin
  ['founder', 'control-cost-month', '/control/messaging-cost', costMonth, costMonthDone],
  // p5-8f end
  // p5-8g begin
  ['founder', 'control-monitoring', '/control/monitoring', monitoringProblems, monitoringProblemsDone],
  // p5-8g end
  // p5-8h begin
  // Reports (C207): the principal's eight reports, the collection report with its CSV and audit row, and attendance
  // by class for 30 days checked against the database; the same screen as an accountant the screen adds; and in
  // Hindi, opened on the absentees report by its address.
  ['principal', 'app-reports', '/app/reports', reportsScreen, reportsScreenDone],
  ['principal', 'app-reports-accountant', '/app/reports', reportsAsAccountant, reportsAsAccountantDone],
  ['principal', 'app-reports-hindi', '/app/reports?report=absentees&range=30d', reportsHindi, reportsHindiDone],
  // p5-8h end
  // p5-8i begin
  ['principal', 'app-school-auditor-first', '/app/school-auditor', auditorFirst],
  ['principal', 'app-school-auditor', '/app/school-auditor', auditorRun, auditorRunDone],
  // p5-8i end
  // p5-8j begin
  ['principal', 'app-early-warning', '/app/early-warning', earlyWarningScreen, earlyWarningScreenDone],
  ['teacher', 'teacher-early-warning', '/app/early-warning', earlyWarningTeacher, earlyWarningTeacherDone],
  // p5-8j end
  // c210-rls begin
  ['teacher', 'teacher-ptm-subject', '/app/ptm', ptmSubjectTeacher, ptmSubjectTeacherDone],
  // c210-rls end
  // c210-leave begin
  ['principal', 'app-account-leave-self', '/app/account', accountLeaveSelf, accountLeaveSelfDone],
  ['principal', 'app-staff-leave-releases', '/app/staff', staffLeaveReleases, staffLeaveReleasesDone],
  ['teacher', 'teacher-my-day-released', '/app/my-day', releasedShownAt('[data-today-card="covers-released"]', ['2 covers you had were released: the teacher is back', 'See your covers']), releasedShownDone('[data-today-card="covers-released"]')],
  ['teacher', 'teacher-proxy-released', '/app/proxy', releasedShownAt('[data-proxy-released]', ['Covers released', 'Period 4 · 6-A · English: released', 'Period 5 · 6-A · Mathematics: released']), releasedShownDone('[data-proxy-released]')],
  // c210-leave end
  // c210-jobs begin
  // The schools' own checks, run by the job runner as the scheduler calls it: Early Warning's nightly check, the
  // auditor's weekly check-up, this week's check-up on the school admin's My Day, and both on Monitoring.
  ['principal', 'app-early-warning-nightly', '/app/early-warning', earlyWarningNightly, earlyWarningNightlyDone],
  ['principal', 'app-school-auditor-weekly', '/app/school-auditor', auditorWeekly, auditorWeeklyDone],
  ['office', 'office-my-day-checkup', '/app/my-day', myDayCheckup, myDayCheckupDone],
  ['founder', 'control-monitoring-school-checks', '/control/monitoring', monitoringSchoolChecks, monitoringSchoolChecksDone],
  // c210-jobs end
  // c210-ui begin
  // C210: the class teacher chosen and cleared on the list of classes the auditor's check opens; three more screens
  // opened from a dashboard number whose list above follows a change below with no reload; Monitoring's invitations
  // with the staff email masked.
  ['principal', 'app-classes-class-teacher', '/app/students?classes=1', classTeacherFromAuditor, classTeacherFromAuditorDone],
  ['principal', 'app-classes-standard', '/app/students?classes=1', classesStandard, classesStandardDone],
  ['principal', 'app-notices-rows-change', '/app/communication?show=notices', shownAfterAdding(true), noticeShownChange],
  ['principal', 'app-events-rows-change', '/app/events?show=coming', shownAfterAdding(true), eventShownChange],
  ['principal', 'app-answers-rows-change', '/app/parent-ai?show=drafts', shownAfterAdding(false), answerShownChange],
  ['founder', 'control-monitoring-masked', '/control/monitoring', monitoringMasked, monitoringMaskedDone],
  // c210-ui end
  // p6-9a begin
  ['principal', 'app-exams-scheme', '/app/exams/scheme', gradingScheme, gradingSchemeDone],
  ['principal', 'app-exams-scheme-cisce', '/app/exams/scheme', gradingCisce, gradingCisceDone],
  ['founder', 'control-boards', '/control/boards', controlBoards, controlBoardsDone],
  ['founder', 'control-school-board', `/control/schools/${SCHOOL}`, controlSchoolBoard, controlSchoolBoardDone],
  // p6-9a end
  // p6-9b begin
  ['principal', 'app-exams-list', '/app/exams', examsMake, examsMakeDone],
  ['principal', 'app-exams-result', `/app/exams/${X_EXAM}/classes/${X_5A}`, examsResult, examsResultDone],
  ['teacher', 'app-exams-teacher', '/app/exams', examsTeacher, examsTeacherDone],
  ['teacher', 'app-exams-entry', `/app/exams/papers/${X_MATHS}`, examsEntry, examsEntryDone],
  // p6-9b end
  // p6-9c begin
  ['principal', 'app-exams-publish', `/app/exams/${X_EXAM}/classes/${X_5A}/report-cards`, rcPublish, rcPublishDone],
  ['office', 'app-exams-report-card', `/app/exams/${X_EXAM}/classes/${X_5A}/report-cards`, rcCard, rcCardDone],
  // p6-9c end
  // p6-9d begin
  ['principal', 'app-curriculum-gap', '/app/curriculum-gap', gapPrincipal, gapPrincipalDone],
  ['teacher', 'app-curriculum-gap-teacher', '/app/curriculum-gap', gapTeacher, gapTeacherDone],
  // p6-9d end
  // p6-9e begin
  ['principal', 'app-genome', `/app/learning-genome?class=${GN_5A}&child=${GN_CHILD}`, genomeOffice, genomeOfficeDone],
  ['teacher', 'app-genome-teacher', '/app/learning-genome', genomeTeacher, genomeTeacherDone],
  // p6-9e end
  // p6-9f begin
  ['principal', 'app-early-warning-marks', '/app/early-warning', earlyWarningMarks, earlyWarningMarksDone],
  ['teacher', 'teacher-early-warning-marks', '/app/early-warning', earlyWarningMarksTeacher, earlyWarningMarksTeacherDone],
  // p6-9f end
  // c212-pricing begin
  ['founder', 'control-billing-plan-form', '/control/billing-plans', pricingForm, pricingFormDone],
  ['founder', 'control-billing-terms', '/control/billing-plans', pricingTerms, pricingTermsDone],
  // c212-pricing end
  // p7-10a begin
  ['principal', 'app-admissions-pipeline', '/app/admissions', admissionsPipeline, admissionsPipelineDone],
  // p7-10a end
  // p7-10b begin
  ['principal', 'app-data-check', '/app/students/data-check', dataCheckScreen, dataCheckScreenDone],
  ['teacher', 'app-data-check-teacher', '/app/students/data-check', dataCheckTeacher, dataCheckTeacherDone],
  // p7-10b end
  // p7-10c begin
  ['principal', 'app-fees-rte', '/app/fees/rte', rteDesk, rteDeskDone],
  // p7-10c end
  // p7-10d begin
  ['principal', 'app-compliance-desk', '/app/compliance/desk', complianceDesk, complianceDeskDone],
  // C232's three, photographed in the C236 wave (C241).
  ['principal', 'app-fees-form6-accountant', '/app/fees', form6AsAccountant, form6AsAccountantDone],
  ['principal', 'app-compliance-former-staff', '/app/compliance/desk', formerStaffErase, formerStaffEraseDone],
  ['principal', 'app-settings-documents', '/app/settings', settingsDocuments],
  ['principal', 'app-compliance-disclosure', '/app/compliance/desk/disclosure', disclosurePrint, disclosurePrintDone],
  // p7-10d end
  // p7-10e begin
  ['principal', 'app-certificates', '/app/documents-id-cards', certificatesScreen, certificatesScreenDone],
  ['principal', 'verify-certificate', `/verify/${VERIFY_TOKEN}`, verifyScreen, verifyScreenDone],
  // p7-10e end
  // p7-10f begin
  ['principal', 'app-timetable-generator', '/app/timetable/generator', ttgReview, ttgReviewDone],
  ['principal', 'app-timetable-generator-publish', '/app/timetable/generator', ttgPublish, ttgPublishDone],
  // p7-10f end
  // p7-10g begin
  ['principal', 'app-staff-teacher-subjects', '/app/staff', staffSubjects, staffSubjectsDone],
  ['teacher', 'app-account-my-subjects', '/app/account', mySubjects, mySubjectsDone],
  ['principal', 'app-timetable-workload', '/app/timetable', workloadOffice, workloadOfficeDone],
  ['teacher', 'teacher-timetable-workload', '/app/timetable', workloadTeacher, workloadTeacherDone],
  ['principal', 'app-timetable-generator-limit', '/app/timetable/generator', ttgLimit, ttgLimitDone],
  // p7-10g end
  // c224 begin
  ['principal', 'app-admissions-erasure', '/app/admissions', admissionsErasure, admissionsErasureDone],
  ['principal', 'app-students-office', '/app/students', studentsOffice, studentsOfficeDone],
  ['teacher', 'app-students-teacher', '/app/students', studentsTeacher, studentsTeacherDone],
  // c224 end
  // c225 begin
  ['principal', 'app-fees-rte-parts', '/app/fees/rte', rteParts, rtePartsDone],
  ['office', 'app-fees-rte-plan', '/app/fees/rte', rtePlan, rtePlanDone],
  // c225 end
  // c226 begin
  ['founder', 'control-billing-trial', '/control/billing-plans', trialControl, trialControlDone],
  ['principal', 'app-trial-days-left', '/app/my-day', trialLine(20), trialLineDone({ kind: 'days_left', text: /^Free month: 20 days left, to the end of \d{1,2} \w+ \d{4}\.$/ })],
  ['principal', 'app-trial-ending', '/app/dashboard', trialLine(5), trialLineDone({ kind: 'ending', text: /^Your free month ends with \d{1,2} \w+ \d{4}: 5 days left\. From \d{1,2} \w+ \d{4} the school is on the Growth plan, and modules that plan does not include switch off\. To talk about your plan, raise a ticket\.$/ })],
  ['teacher', 'teacher-trial-no-line', '/app/my-day', trialLine(5), trialLineDone({ kind: null })],
  // c226 end
  // c219 begin
  ['teacher', 'app-exams-co-scholastic', `/app/exams/${X_EXAM}/classes/${X_5A}/report-cards`, rcCoScholastic, rcCoScholasticDone],
  // c219 end
  // c235-b begin
  ['principal', 'brand-app-header', '/app/students', brandedShell, brandedShellDone],
  ['principal', 'brand-app-menu', '/app/attendance', brandedMenu, brandedMenuDone],
  ['principal', 'brand-app-settings', '/app/settings', settingsBranding, settingsBrandingDone],
  ['teacher', 'brand-teacher-settings', '/app/settings', teacherNoBranding, teacherNoBrandingDone],
  ['founder', 'brand-control-school', `/control/schools/${SCHOOL}`, controlBranding, controlBrandingDone],
  ['parent', 'brand-family', '/family', familyBranded, familyBrandedDone],
  // c235-b end
  // c235d begin
  ['principal', 'app-staff-profile', `/app/staff/${PEOPLE.teacher.sub}`],
  ['principal', 'app-staff-profile-documents', `/app/staff/${PEOPLE.teacher.sub}?tab=documents`, staffPapers, staffPapersDone],
  ['teacher', 'teacher-staff-profile-own', `/app/staff/${PEOPLE.teacher.sub}`],
  ['principal', 'app-student-record-docs', `/app/students/${STUDENT}`, studentPapers, c235dGone],
  ['principal', 'app-students-list-export', '/app/students', listExportOpen('students'), listExportDone('students')],
  ['principal', 'app-staff-list-export', '/app/staff', listExportOpen('staff'), listExportDone('staff')],
  // c235d end
  // c235d2 begin
  ['principal', 'app-staff-doc-direct-checking', `/app/staff/${PEOPLE.teacher.sub}?tab=documents`, directChecking, directCheckingDone],
  ['principal', 'app-staff-doc-direct-too-large', `/app/staff/${PEOPLE.teacher.sub}?tab=documents`, directTooLarge, directTooLargeDone],
  // c235d2 end
  // c238 begin
  ['principal', 'app-staff-profile-employment', `/app/staff/${PEOPLE.teacher.sub}?tab=employment`, c238Tab('employment'), c238Done],
  ['principal', 'app-staff-profile-id-card', `/app/staff/${PEOPLE.teacher.sub}?tab=id-card`, c238Tab('id-card'), c238Done],
  ['principal', 'app-staff-profile-biodata', `/app/staff/${PEOPLE.teacher.sub}?tab=biodata`, c238Tab('biodata'), c238Done],
  ['principal', 'app-staff-profile-edit', `/app/staff/${PEOPLE.teacher.sub}`, c238Edit, c238Done],
  ['teacher', 'teacher-staff-profile-attendance', `/app/staff/${PEOPLE.teacher.sub}?tab=attendance`, c238Tab('attendance'), c238Done],
  // c238 end
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
        const prepared = prepare ? await prepare(page).then(() => null, (e) => e.message.split('\n')[0].slice(0, 600)) : null;
        if (prepared) errors.push(`could not prepare the screen: ${prepared}`);
        // A part still loading is photographed (and its words counted) once it has loaded, five seconds at most (C235-C).
        await page.waitForFunction(() => !/Loading…/.test(document.querySelector('main')?.innerText ?? ''), null, { timeout: 5000 }).catch(() => undefined);
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
        // The words on the screen (C235-C): scripts/harness/word-count.mjs compares two runs.
        const words = await page.evaluate(visibleWords).catch(() => []);
        writeFileSync(path.join(OUT, `${name}-${width}.words.txt`), words.join(' '));
        // Put things back (the language), and say so if that failed: the
        // screens after this one would otherwise be photographed wrongly.
        const undone = after ? await after(page).then(() => null, (e) => e.message.split('\n')[0].slice(0, 600)) : null;
        if (undone) errors.push(`could not put the screen back: ${undone}`);
        // A server error: keep what the app printed, so the report says why.
        const failedOnServer = response.status() >= 500 || errors.some((e) => / answered 5\d\d$/.test(e));
        const serverSaid = failedOnServer ? appLog.slice(logFrom).split('\n').filter((l) => /error|Error|⨯/.test(l)).slice(-4).map((l) => l.trim().slice(0, 300)) : [];
        const row = { name, width, route, status: response.status(), serverSaid, landedOn: seen.path, h1: seen.h1, modulePage: seen.modulePage, horizontalScroll: seen.horizontalScroll, smallTargets: seen.smallTargets, words: words.length, pageErrors: [...errors] };
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
        console.log(`${width} ${name}: ${row.status} h1=${JSON.stringify(row.h1)} modulePage=${row.modulePage} hscroll=${row.horizontalScroll} small=${row.smallTargets.length} errors=${row.pageErrors.length}${landedWhereExpected(name, route, row.landedOn) ? '' : ` LANDED ON ${row.landedOn}`}${row.firstTry ? ' (after a retry)' : ''}`);
      }
      await context.close();
    }
  }
  await browser.close();
  writeFileSync(path.join(OUT, 'app.log'), appLog);
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ migrationsApplied: db.applied.length, migrationsSkipped: db.skipped, searchP95Ms, screens: report }, null, 2));
  const bad = report.filter((r) => r.status !== 200 || !landedWhereExpected(r.name, r.route, r.landedOn) || r.horizontalScroll || r.smallTargets.length || r.pageErrors.length);
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
