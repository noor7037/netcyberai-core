#!/usr/bin/env node
// School day rehearsal: one school day, end to end, across NetCyberAI's apps, on the harness's throwaway database.
//
//   node scripts/pilot/school_day.mjs            run the day, print PASS / FAIL / SKIP per step, exit 1 on any FAIL
//   node scripts/pilot/school_day.mjs --port N   the app server's port (default 3400; the database takes N + 1)
//   node scripts/pilot/school_day.mjs --fees     leave the fees module on (the default plan's); step 5 then says so
//   node scripts/pilot/school_day.mjs --release-ai   AI testing mode off, as the release ships (default: on, as the
//                                                    TEST database and the screenshot harness have it)
//   node scripts/pilot/school_day.mjs --help
//
// What it proves: that the routes the screens call carry one pilot school through a day. Control makes the school and
// switches on the pilot modules; the office imports a Class 10 section with guardians; the principal adds a teacher and
// sets the timetable; the teacher marks attendance, sets homework, posts a class notice and enters marks; the office
// makes a School Link code; a Family account redeems it, matches the child and reads the school's part (attendance,
// homework, the notice, the marks, the timetable); the child asks the tutor a Class 10 maths question and a follow-up;
// the parent area and Control's AI ledger show it. Each step calls the real HTTP routes (src/app/api/**) and reports
// PASS, FAIL or SKIP with one reason and the routes it called. It MEASURES: a failing step is a finding, nothing in
// src/ is changed or patched from here.
//
// Why it never reaches production (marker: NCA_SCREENSHOT_HARNESS, scripts/harness/run.mjs's rules): it starts its
// own database (scripts/harness/db.mjs: the real migrations plus the harness seed, in memory on 127.0.0.1, gone when
// the process ends), starts `next dev` pointed only at it with a clean environment (no real database, email, WhatsApp,
// payment or AI key: the AI and payments answer from the stand-ins), and signs session cookies with a secret made up
// for this run, worthless against any deployment. It refuses to start outside a local development run. Nothing under
// src/ imports it. Each run is a fresh database and a school with a unique name, so it can run any number of times.
//
// Where the harness has no stand-in (Supabase Auth: making a sign-in account), the step first calls the real route and
// records its answer, then writes the person's users and membership rows exactly as that route would after Supabase,
// and says so in the step's reason. The database is otherwise only READ here, to verify what a route wrote.
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SignJWT } from 'jose';
import { HARNESS_MARKER, startHarnessDb } from '../harness/db.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1).filter((l, i, all) => all.slice(0, i + 1).every((x) => x.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}
const arg = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const APP_PORT = Number(arg('--port') ?? 3400);
if (!Number.isInteger(APP_PORT) || APP_PORT < 1024 || APP_PORT > 65000) {
  console.error('school_day: --port must be a number between 1024 and 65000.');
  process.exit(2);
}
if (process.env.NODE_ENV === 'production' || process.env.VERCEL || process.env.CI_DEPLOY) {
  console.error('school_day: refusing to run: this is a local development tool.');
  process.exit(2);
}
const STARTED = Date.now();
const DEADLINE_MS = 10 * 60 * 1000;
const STAMP = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12) + '-' + randomBytes(2).toString('hex');
const FOUNDER = { sub: '00000000-0000-4000-8000-00000000f001', role: 'super_admin', schoolId: null, membershipId: null };
// A seeded family with consent and a PIN and no children yet (src/demo-fixture/harness-seed.sql).
const FAMILY_ACCOUNT = 'f0000000-0000-4000-8000-0000000f0003';
const PILOT_MODULES = ['students', 'parents', 'attendance', 'homework', 'timetable', 'communication', 'exams', 'academics'];
const CLASS_NAME = '10-A';
const KEEP_FEES = argv.includes('--fees');
const TESTING_MODE = argv.includes('--release-ai') ? 'off' : 'on';

// ---- the harness: database, app, sessions ------------------------------------------------------------------------
const portInUse = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
  });
if ((await portInUse(APP_PORT)) || (await portInUse(APP_PORT + 1))) {
  console.error(`school_day: port ${APP_PORT} or ${APP_PORT + 1} is in use. Stop it, or pass --port.`);
  process.exit(2);
}
console.log(`school_day: starting the harness database (real migrations, in memory) on 127.0.0.1:${APP_PORT + 1} ...`);
const db = await startHarnessDb({ port: APP_PORT + 1, seedSql: readFileSync(path.join(ROOT, 'src/demo-fixture/harness-seed.sql'), 'utf8'), testingMode: TESTING_MODE });
const secret = randomBytes(32).toString('hex');
const base = `http://127.0.0.1:${APP_PORT}`;
const childEnv = {
  PATH: process.env.PATH ?? '',
  HOME: process.env.HOME ?? '',
  TMPDIR: process.env.TMPDIR ?? '',
  NODE_ENV: 'development',
  NEXT_TELEMETRY_DISABLED: '1',
  NCA_HARNESS: HARNESS_MARKER,
  AI_PROVIDER: 'stand-in',
  // The platform AI's stand-in adapter (src/lib/ai/adapters/index.ts standInAllowed): development only, answers from
  // the request alone and sends nothing anywhere. Control offers it as a provider only with this set.
  AI_PLATFORM_STAND_IN: 'on',
  PAYMENT_PROVIDER: 'stand-in',
  PAYMENT_CREDENTIALS_KEY: randomBytes(32).toString('base64'),
  AI_CREDENTIALS_KEY: randomBytes(32).toString('base64'),
  PAYMENT_STANDIN_SECRET: `${secret}-payments-stand-in-secret-0123456789`,
  WHATSAPP_STANDIN_SECRET: `${secret}-whatsapp-stand-in-secret-0123456789`,
  DATABASE_URL: db.url,
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
let appExited = null;
let appLog = '';
const app = spawn(process.execPath, [path.join(ROOT, 'node_modules/next/dist/bin/next'), 'dev', '-p', String(APP_PORT), '-H', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: childEnv });
const keep = (d) => (appLog = (appLog + d).slice(-100000));
app.stdout.on('data', keep);
app.stderr.on('data', keep);
app.on('exit', (code) => (appExited = code ?? 1));
const shutdown = async (code) => {
  if (appExited === null) app.kill('SIGTERM');
  await db.stop().catch(() => undefined);
  process.exit(code);
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => shutdown(130));
process.on('exit', () => {
  if (appExited === null) app.kill('SIGKILL');
});
const watchdog = setTimeout(() => {
  console.error('school_day: over 10 minutes; stopping.');
  shutdown(1);
}, DEADLINE_MS + 60000);
watchdog.unref();

async function waitFor(url, ms = 180000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (appExited !== null) throw new Error(`the app stopped before it was ready (exit ${appExited}): ${appLog.slice(-1500)}`);
    try {
      const r = await fetch(url, { redirect: 'manual' });
      if (r.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not answer`);
}

const staffCookie = (p) =>
  new SignJWT({ typ: 'access', role: p.role, schoolId: p.schoolId, membershipId: p.membershipId, tv: 0, aal: 'aal2', sid: randomUUID() })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(secret))
    .then((t) => `nca_access=${t}`);
const famSign = (typ, sub, claims) =>
  new SignJWT({ ...claims, typ }).setProtectedHeader({ alg: 'HS256' }).setSubject(sub).setAudience('nca-family').setIssuedAt().setExpirationTime('2h').sign(new TextEncoder().encode(secret));
async function familyCookie(accountId, { parent = false, child = null } = {}) {
  const sid = randomUUID();
  const parts = [`ncf_session=${await famSign('family', accountId, { tv: 0, sid })}`];
  if (parent) parts.push(`ncf_parent=${await famSign('family_parent', accountId, { sid })}`);
  if (child) parts.push(`ncf_child=${child}`);
  return parts.join('; ');
}

// One HTTP call as a person. Every route a step calls is recorded for its line in the report.
let calledRoutes = [];
async function call(cookie, method, route, body, { form = null, accept = 'application/json' } = {}) {
  calledRoutes.push(`${method} ${route.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ':id').split('?')[0]}`);
  const headers = { cookie, accept, origin: base };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${base}${route}`, { method, headers, body: payload, redirect: 'manual' });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, json, text, location: res.headers.get('location') };
}
// A 500 carries the app's own last error line, so the report says where it broke.
const lastError = () => (appLog.split('\n').filter((l) => /error/i.test(l)).slice(-2).join(' / ').replace(/\s+/g, ' ').slice(0, 300) || 'no error line in the app log');
const short = (r) => `${r.status} ${(r.json ? JSON.stringify(r.json) : r.text).replace(/\s+/g, ' ').slice(0, 220)}${r.status >= 500 ? ` [app log: ${lastError()}]` : ''}`;
const q = async (sql, params = []) => (await db.pg.query(sql, params)).rows;

// The users and membership rows the logins route writes after Supabase Auth has made the account
// (src/app/api/control/schools/[schoolId]/logins/route.ts): only where the harness has no Supabase to make it.
async function harnessPerson(schoolId, role, name, email) {
  const userId = randomUUID();
  await q(`insert into users (user_id, school_id, email, role, display_name, is_active, token_version) values ($1, $2, $3, $4, $5, true, 0)`, [userId, schoolId, email, role, name]);
  const m = await q(`insert into memberships (user_id, school_id, role) values ($1, $2, $3) returning membership_id`, [userId, schoolId, role]);
  return { sub: userId, role, schoolId, membershipId: m[0].membership_id };
}

// ---- the steps ---------------------------------------------------------------------------------------------------
const results = [];
const ctx = {};
class Skip extends Error {}
async function step(n, title, fn) {
  calledRoutes = [];
  const t0 = Date.now();
  let status = 'PASS';
  let reason = '';
  try {
    if (Date.now() - STARTED > DEADLINE_MS) throw new Skip('the 10-minute budget is spent');
    reason = (await fn()) ?? 'ok';
  } catch (e) {
    if (e instanceof Skip) status = 'SKIP';
    else status = 'FAIL';
    reason = e.message;
  }
  const routes = [...new Set(calledRoutes)];
  results.push({ n, title, status, reason, routes });
  console.log(`\n[${status}] ${n}. ${title}  (${((Date.now() - t0) / 1000).toFixed(1)} s)\n  reason: ${reason}\n  routes: ${routes.join(', ') || '(none)'}`);
}
const need = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const needCtx = (...keys) => {
  for (const k of keys) if (!ctx[k]) throw new Skip(`depends on an earlier step that did not finish (${k} missing)`);
};

// A plausible, made-up Class 10 section: Indian first and family names, synthetic numbers (98765 0xxxx, 9000000xxx).
const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan', 'Ananya', 'Diya', 'Aadhya', 'Saanvi', 'Pari', 'Anika', 'Navya', 'Myra', 'Kiara', 'Riya'];
const LAST = ['Sharma', 'Verma', 'Gupta', 'Yadav', 'Singh', 'Patel', 'Kumar', 'Mishra', 'Joshi', 'Reddy'];
const PARENT_FIRST = ['Suresh', 'Ramesh', 'Sunita', 'Kavita', 'Rajesh', 'Meena', 'Anil', 'Pooja', 'Vikas', 'Neha'];
const PUPILS = Array.from({ length: 40 }, (_, i) => ({
  name: `${FIRST[i % 20]} ${LAST[(i * 3) % 10]}`,
  admissionNo: `SD${STAMP.slice(-4)}-${String(i + 1).padStart(3, '0')}`,
  roll: String(i + 1),
  dob: `2011-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
  guardian: `${PARENT_FIRST[i % 10]} ${LAST[(i * 3) % 10]}`,
  phone: `90000${String(10001 + i).padStart(5, '0')}`,
  relation: i % 2 ? 'father' : 'mother',
}));
const csvOf = (rows) =>
  ['name,admission_no,class_name,roll_no,dob,guardian_name,guardian_phone,guardian_relation', ...rows.map((p) => [p.name, p.admissionNo, CLASS_NAME, p.roll, p.dob, p.guardian, p.phone, p.relation].join(','))].join('\n') + '\n';

const TOKEN = STAMP.slice(-4);
const HOMEWORK_TITLE = `Quadratic equations: exercise 4.2, questions 1 to 6 (${TOKEN})`;
const NOTICE_BODY = `Class 10-A: bring your geometry box tomorrow for the constructions practical (${TOKEN}).`;
const EXAM_NAME = `Unit Test 1 ${TOKEN}`;
const TUTOR_QUESTION = 'How do I solve the quadratic equation x^2 - 5x + 6 = 0 by factorisation?';
const FOLLOW_UP = 'samajh nahi aaya';

try {
  console.log(`school_day: starting next dev on ${base} (first compile takes a while) ...`);
  await waitFor(`${base}/login`);
  const founder = await staffCookie(FOUNDER);

  await step(1, 'Control: create a school and switch on the pilot modules', async () => {
    const made = await call(founder, 'POST', '/api/control/schools', { name: `School Day Rehearsal ${STAMP}`, board: 'CBSE', tenantType: 'school', jurisdiction: 'IN-UP' });
    need(made.status === 201 && made.json?.school?.school_id, `create school: ${short(made)}`);
    ctx.schoolId = made.json.school.school_id;
    const off = [];
    for (const moduleId of PILOT_MODULES) {
      const r = await call(founder, 'PUT', `/api/control/schools/${ctx.schoolId}/entitlements`, { moduleId, enabled: true, reason: 'school day rehearsal: pilot module' });
      if (r.status !== 200) off.push(`${moduleId}: ${short(r)}`);
    }
    need(!off.length, `switching on: ${off.join('; ')}`);
    const ent = await call(founder, 'GET', `/api/control/schools/${ctx.schoolId}/entitlements`);
    need(ent.status === 200, `read entitlements: ${short(ent)}`);
    const mods = ent.json?.entitlements?.modules ?? {};
    const on = (id) => mods[id]?.enabled === true;
    const notOn = PILOT_MODULES.filter((m) => !on(m));
    need(!notOn.length, `entitlements read back with these off: ${notOn.join(', ')}`);
    // The default plan for a new school switches fees on; the pilot runs with fees off unless --fees.
    const feesByPlan = on('fees');
    if (feesByPlan && !KEEP_FEES) {
      const r = await call(founder, 'PUT', `/api/control/schools/${ctx.schoolId}/entitlements`, { moduleId: 'fees', enabled: false, reason: 'school day rehearsal: fees off for the pilot' });
      need(r.status === 200, `switching fees off: ${short(r)}`);
    }
    ctx.feesOn = feesByPlan && KEEP_FEES;
    // The school's first people. The real route first; the harness has no Supabase Auth to make the account.
    const login = await call(founder, 'POST', `/api/control/schools/${ctx.schoolId}/logins`, { role: 'principal', name: 'Kavita Rao', signIn: `principal.${STAMP}@example.org` });
    ctx.principal = await harnessPerson(ctx.schoolId, 'principal', 'Kavita Rao', `principal.${STAMP}@example.org`);
    ctx.office = await harnessPerson(ctx.schoolId, 'school_admin', 'Rahul Office', `office.${STAMP}@example.org`);
    const how = login.status === 201 ? 'logins route made the principal' : `logins route answered ${login.status} ${login.json?.code ?? ''} (no Supabase Auth in the harness), so the principal and office rows were written as that route writes them`;
    return `school ${ctx.schoolId.slice(0, 8)} made; ${PILOT_MODULES.length} pilot modules on (fees ${ctx.feesOn ? 'on' : `off${feesByPlan ? ', switched off: the default plan had it on' : ''}`}); ${how}`;
  });

  await step(2, 'Office: import 40 Class 10 students with guardians from a CSV', async () => {
    needCtx('office');
    const office = await staffCookie(ctx.office);
    const cls = await call(office, 'POST', '/api/app/classes', { name: CLASS_NAME });
    need(cls.status === 201, `make class ${CLASS_NAME}: ${short(cls)}`);
    ctx.classId = cls.json.class?.class_id ?? cls.json.class?.classId ?? cls.json.class?.id;
    need(ctx.classId, `class id not in the answer: ${short(cls)}`);
    const subs = await call(office, 'GET', '/api/app/subjects');
    let maths = (subs.json?.subjects ?? []).find((s) => /^math/i.test(s.name));
    if (!maths) {
      const made = await call(office, 'POST', '/api/app/subjects', { name: 'Mathematics' });
      need(made.status === 201, `make subject Mathematics: ${short(made)}`);
      maths = made.json.subject;
    }
    ctx.subjectId = maths.subject_id ?? maths.subjectId ?? maths.id;
    need(ctx.subjectId, `subject id not in the answer: ${JSON.stringify(maths)}`);
    const form = new FormData();
    form.append('file', new Blob([csvOf(PUPILS)], { type: 'text/csv' }), `class10a-${STAMP}.csv`);
    const imp = await call(office, 'POST', '/api/app/students/import', undefined, { form });
    need(imp.status === 201, `import: ${short(imp)}`);
    need(imp.json.importedCount === 40, `imported ${imp.json.importedCount} of 40: ${JSON.stringify(imp.json.errors ?? []).slice(0, 300)}`);
    const studs = await q(`select student_id, name, roll_no from students where school_id = $1 and class_id = $2 order by roll_no::int`, [ctx.schoolId, ctx.classId]);
    need(studs.length === 40, `the database holds ${studs.length} students in ${CLASS_NAME}`);
    ctx.students = studs;
    ctx.child = studs[0];
    // Guardians come from the CSV's own guardian columns: every student must have its guardian linked by the import,
    // unverified and with no consent recorded (the import never records consent; the office does, below, by hand).
    need(imp.json.guardians?.created === 40 && imp.json.guardians?.linked === 40, `the import's guardian columns: ${JSON.stringify(imp.json.guardians ?? null)} (want 40 added, 40 linked)`);
    const links = await q(`select sp.student_id, sp.parent_id, p.name, p.phone, p.relation from parent_student_map sp join students s on s.student_id = sp.student_id join parents p on p.parent_id = sp.parent_id where s.school_id = $1 and s.class_id = $2`, [ctx.schoolId, ctx.classId]);
    const linkOf = new Map(links.map((l) => [l.student_id, l]));
    const wrong = studs.filter((st) => {
      const p = PUPILS[Number(st.roll_no) - 1];
      const l = linkOf.get(st.student_id);
      return !l || l.name !== p.guardian || l.phone !== p.phone || l.relation !== p.relation;
    });
    need(!wrong.length, `${40 - wrong.length} of 40 students have their CSV guardian linked by the import; first missing roll ${wrong[0]?.roll_no}`);
    const fromCsv = links.length;
    const consentByImport = Number((await q(`select count(*)::int as n from consent_ledger where school_id = $1 and student_id = any($2::uuid[])`, [ctx.schoolId, studs.map((st) => st.student_id)]))[0].n);
    need(consentByImport === 0, `the import recorded ${consentByImport} consent rows (it must record none)`);
    // The guardian's consent, as the office records it from the paper form: until then the student is pending_consent,
    // and the Family app shows nothing of the child (src/lib/parent-home/home.ts reads core_records).
    const refusedConsent = [];
    for (let i = 0; i < studs.length; i++) {
      const parentId = linkOf.get(studs[i].student_id).parent_id;
      if (i === 0) ctx.parentId = parentId;
      // The guardian is verified first (the "Verify" button: the office attests from the admission form), then consent.
      const v0 = await call(office, 'POST', `/api/app/guardians/${parentId}/students/${studs[i].student_id}/verification`, { action: 'start' });
      const v1 = await call(office, 'POST', `/api/app/guardians/${parentId}/students/${studs[i].student_id}/verification`, { action: 'verify_direct', method: 'school_attested', evidenceRef: 'admission form on file' });
      if (v1.status !== 200 && v1.status !== 201) {
        refusedConsent.push(`${studs[i].roll_no} verify: start ${v0.status}, ${short(v1)}`);
        continue;
      }
      // The two purposes required for service (PRD §3.5; student_required_consents_granted): then the student is active.
      for (const purpose of ['core_records', 'operational_communication']) {
        const c = await call(office, 'POST', `/api/app/students/${studs[i].student_id}/consent`, { purpose, granted: true, parentId });
        if (c.status !== 200 && c.status !== 201) refusedConsent.push(`${studs[i].roll_no} ${purpose}: ${short(c)}`);
      }
    }
    need(!refusedConsent.length, `recording consent: ${refusedConsent.length} refused, first ${refusedConsent[0]}`);
    const active = Number((await q(`select count(*)::int as n from students where school_id = $1 and class_id = $2 and status = 'active'`, [ctx.schoolId, ctx.classId]))[0].n);
    const linked = Number((await q(`select count(distinct sp.student_id)::int as n from parent_student_map sp join students s on s.student_id = sp.student_id where s.school_id = $1 and s.class_id = $2`, [ctx.schoolId, ctx.classId]))[0].n);
    need(linked === 40, `${linked} of 40 students have a guardian after the import`);
    need(active === 40, `${active} of 40 students are active after their guardian's consent`);
    return `40 students imported into ${CLASS_NAME}; ${fromCsv} guardians added and linked by the import (no consent recorded by it); then verified and consent recorded by the office, 40 active`;
  });

  await step(3, 'Principal: add a teacher, set the Class 10-A timetable', async () => {
    needCtx('principal', 'classId', 'subjectId');
    const principal = await staffCookie(ctx.principal);
    const email = `teacher.${STAMP}@example.org`;
    const inv = await call(principal, 'POST', '/api/app/staff/invitations', { email, displayName: 'Sanjay Mehta', role: 'teacher' });
    need(inv.status === 201, `invite the teacher: ${short(inv)}`);
    // The invitation's job asks Supabase Auth for the account and then writes the person; the harness has no Supabase.
    ctx.teacher = await harnessPerson(ctx.schoolId, 'teacher', 'Sanjay Mehta', email);
    const ct = await call(principal, 'PATCH', `/api/app/classes/${ctx.classId}`, { classTeacherId: ctx.teacher.sub });
    need(ct.status === 200, `make the teacher class teacher: ${short(ct)}`);
    const as = await call(principal, 'POST', '/api/app/subjects/assignments', { teacherUserId: ctx.teacher.sub, subjectId: ctx.subjectId, classId: ctx.classId });
    need(as.status === 200 || as.status === 201, `assign Mathematics in ${CLASS_NAME}: ${short(as)}`);
    // A new school has no grading scheme, and a class cannot be published without one: the principal starts it from
    // the board's preset, as the scheme screen does (src/lib/exams/scheme.ts schemeFromPreset).
    const sch = await call(principal, 'GET', '/api/app/exams/scheme');
    need(sch.status === 200, `read the grading scheme: ${short(sch)}`);
    let schemeNote = 'scheme already in force';
    if (!sch.json.current) {
      const board = (sch.json.boards ?? []).find((b) => b.boardId === (sch.json.board?.boardId ?? sch.json.board)) ?? (sch.json.boards ?? []).find((b) => /cbse/i.test(b.name));
      const preset = board?.presets?.find((p) => /10|secondary/i.test(p.level)) ?? board?.presets?.[0];
      need(preset, `no board preset to start from (board ${JSON.stringify(sch.json.board)}, ${(sch.json.boards ?? []).length} boards)`);
      const copy = (v) => JSON.parse(JSON.stringify(v));
      const scheme = { bands: copy(preset.bands), decimals: 0, passMark: preset.passMark, components: copy(preset.components).map((c) => ({ ...c, passMark: c.passMark ?? null, parts: c.parts ?? [] })), terms: [], layout: { components: true, total: true, percent: true, grade: true, attendance: true, remarks: true, coScholastic: preset.coScholastic !== null }, coScholastic: preset.coScholastic ? copy(preset.coScholastic) : null };
      const saved = await call(principal, 'POST', '/api/app/exams/scheme', { action: 'save', scheme, fromPresetId: preset.presetId, basedOn: 0 });
      need(saved.status === 200 || saved.status === 201, `save the grading scheme from the ${board.name} ${preset.level} preset: ${short(saved)}`);
      schemeNote = `grading scheme saved from the ${board.name} ${preset.level} preset`;
    }
    const placed = [];
    const refused = [];
    for (let weekday = 1; weekday <= 7; weekday++) {
      const r = await call(principal, 'PUT', '/api/app/timetable', { classId: ctx.classId, weekday, period: 1, subjectId: ctx.subjectId, teacherUserId: ctx.teacher.sub });
      if (r.status === 200 || r.status === 201) placed.push(weekday);
      else refused.push(`day ${weekday}: ${short(r)}`);
    }
    need(placed.length >= 5, `timetable: ${placed.length} days placed; ${refused.join('; ')}`);
    const rows = await q(`select count(*)::int as n from timetable_entries where school_id = $1 and class_id = $2`, [ctx.schoolId, ctx.classId]).catch((e) => [{ n: `unread (${e.message})` }]);
    return `${schemeNote}; invitation made; teacher is class teacher and teaches Mathematics; period 1 Mathematics on weekdays ${placed.join(',')} (database: ${rows[0].n} entries)${refused.length ? `; refused: ${refused.map((x) => x.split(':')[0]).join(', ')}` : ''}`;
  });

  await step(4, 'Teacher: attendance, homework, class notice, marks for one paper', async () => {
    needCtx('teacher', 'students', 'principal');
    const teacher = await staffCookie(ctx.teacher);
    const principal = await staffCookie(ctx.principal);
    const problems = [];
    const done = [];
    const entries = ctx.students.map((s, i) => ({ studentId: s.student_id, status: i === 39 ? 'absent' : 'present' }));
    const att = await call(teacher, 'POST', '/api/app/attendance', { classId: ctx.classId, entries, operationId: randomUUID() });
    if (att.status === 201 || att.status === 200) done.push('attendance (39 present, 1 absent)');
    else problems.push(`attendance: ${short(att)}`);
    ctx.today = (await q(`select (now() at time zone 'Asia/Kolkata')::date::text as d`))[0].d;
    const hw = await call(teacher, 'POST', '/api/app/homework', { subjectId: ctx.subjectId, title: HOMEWORK_TITLE, dueDate: ctx.today, classIds: [ctx.classId] });
    if (hw.status === 201) done.push('homework');
    else problems.push(`homework: ${short(hw)}`);
    const nt = await call(teacher, 'POST', '/api/app/communication/notices', { classId: ctx.classId, body: NOTICE_BODY });
    if (nt.status === 201 || nt.status === 200) {
      // A teacher's notice waits for the principal; approving it is what sends it (notices/[noticeId]/route.ts).
      const noticeId = nt.json?.noticeId ?? (await q(`select notice_id from class_notices where school_id = $1 and class_id = $2 order by created_at desc limit 1`, [ctx.schoolId, ctx.classId]))[0]?.notice_id;
      const ok = await call(principal, 'POST', `/api/app/communication/notices/${noticeId}`, { action: 'approve' });
      if (ok.status === 200 || ok.status === 201) done.push('notice (approved by the principal)');
      else problems.push(`approve the notice (principal): ${short(ok)}`);
    } else problems.push(`notice: ${short(nt)}`);
    // An exam with one Mathematics paper for 10-A is the office's to make (exams.ts EXAM_RUNNERS); the teacher enters it.
    const ex = await call(principal, 'GET', '/api/app/exams');
    const parts = ex.json?.scheme?.parts?.length ? ex.json.scheme.parts : [{ key: 'marks' }];
    const maxima = Object.fromEntries(parts.map((p) => [p.key, 80]));
    const made = await call(principal, 'POST', '/api/app/exams', { name: EXAM_NAME, sessionId: null, term: null, papers: [{ classId: ctx.classId, subjectId: ctx.subjectId, date: ctx.today, unitIds: [], maxima }] });
    if (made.status !== 201) problems.push(`make exam (principal): ${short(made)}`);
    else {
      ctx.examId = made.json.examId;
      const paper = (await q(`select paper_id from exam_papers where school_id = $1 and exam_id = $2`, [ctx.schoolId, ctx.examId]))[0];
      const entry = paper ? await call(teacher, 'GET', `/api/app/exams/papers/${paper.paper_id}`) : null;
      if (!entry || entry.status !== 200) problems.push(`open the paper as the teacher: ${entry ? short(entry) : 'no paper row'}`);
      else {
        const comps = (entry.json.components ?? entry.json.paper?.components ?? parts).map((c) => c.key);
        const marks = ctx.students.flatMap((s, i) => comps.map((component) => (i === 39 ? { studentId: s.student_id, component, kind: 'absent', score: null } : { studentId: s.student_id, component, kind: 'score', score: 40 + ((i * 7) % 40) })));
        const saved = await call(teacher, 'POST', `/api/app/exams/papers/${paper.paper_id}`, { marks });
        if (saved.status === 200 || saved.status === 201) {
          done.push(`marks for 40 (${comps.join('+')})`);
          ctx.childScore = 40;
          // The family sees results only once the class is published (the principal's step in the exam screen).
          const pub = await call(principal, 'POST', `/api/app/exams/${ctx.examId}/classes/${ctx.classId}/report-cards`, { action: 'publish' });
          if (pub.status === 200 || pub.status === 201) done.push('published by the principal');
          else problems.push(`publish (principal): ${short(pub)}`);
        } else problems.push(`marks: ${short(saved)}`);
      }
    }
    const check = (await q(
      `select (select count(*)::int from attendance where school_id = $1 and class_id = $2 and date = $3::date) as att,
              (select count(*)::int from homework_targets where school_id = $1 and class_id = $2) as hw`,
      [ctx.schoolId, ctx.classId, ctx.today]
    ))[0];
    need(!problems.length, `${problems.join(' | ')} (done: ${done.join(', ') || 'nothing'})`);
    return `${done.join(', ')}; database: ${check.att} attendance marks today, ${check.hw} homework target(s)`;
  });

  await step(5, 'Office: raise a fee and a receipt (only if fees is on)', async () => {
    needCtx('schoolId');
    if (!ctx.feesOn) throw new Skip('the fees module is off for this school (the pilot default)');
    throw new Skip('fees is on for this school, but this rehearsal covers the fees-off pilot only (raise and receipt not rehearsed)');
  });

  await step(6, "Principal: make a School Link code for the first child's guardian", async () => {
    needCtx('principal', 'parentId');
    const principal = await staffCookie(ctx.principal);
    const r = await call(principal, 'POST', `/api/app/guardians/${ctx.parentId}/family-code`);
    need(r.status === 200 || r.status === 201, `family code: ${short(r)}`);
    ctx.code = r.json?.code ?? r.json?.connectCode;
    need(typeof ctx.code === 'string' && ctx.code.length >= 4, `no code in the answer: ${Object.keys(r.json ?? {}).join(', ')}`);
    return `a single-use code made for guardian ${ctx.parentId.slice(0, 8)} (shown once; not printed here)`;
  });

  await step(7, 'Family: redeem the code, match the child, read the school feed', async () => {
    needCtx('code', 'child');
    const parent = await familyCookie(FAMILY_ACCOUNT, { parent: true });
    const kid = await call(parent, 'POST', '/api/family/children', { firstName: ctx.child.name.split(' ')[0], classLevel: 10, board: 'CBSE', language: 'en', style: 'hinglish', stateCode: 'IN-UP' });
    need(kid.status === 201, `add the family child: ${short(kid)}`);
    ctx.familyChildId = kid.json.child.childId;
    const con = await call(parent, 'POST', '/api/family/school/connect', { code: ctx.code });
    need(con.status === 200, `redeem the code: ${short(con)}`);
    ctx.linkId = con.json.linkId;
    const match = await call(parent, 'POST', '/api/family/school/children', { linkId: ctx.linkId, pairs: [{ studentId: ctx.child.student_id, childId: ctx.familyChildId }] });
    need(match.status === 200, `match the child: ${short(match)}`);
    // What the family reads: the school tab on the child's home, the parent area, the results tab, homework.
    const both = await familyCookie(FAMILY_ACCOUNT, { parent: true, child: ctx.familyChildId });
    const pages = {};
    for (const route of ['/family', '/family/parent', '/family/results', '/family/study/homework']) {
      const r = await call(both, 'GET', route, undefined, { accept: 'text/html' });
      pages[route] = r.status === 200 ? r.text : `(${r.status}${r.location ? ` to ${r.location}` : ''})`;
    }
    const all = Object.values(pages).join('\n');
    const where = (needle) => Object.entries(pages).filter(([, html]) => html.includes(needle)).map(([p]) => p);
    const checks = {
      attendance: where('1/1').filter((p) => p === '/family/parent'),
      homework: where(HOMEWORK_TITLE.split(' (')[0]),
      notice: where(NOTICE_BODY.split(' (')[0]),
      marks: where(EXAM_NAME),
      timetable: where('Mathematics').filter((p) => p === '/family'),
    };
    const missing = Object.entries(checks).filter(([, at]) => !at.length).map(([k]) => k);
    const found = Object.entries(checks).filter(([, at]) => at.length).map(([k, at]) => `${k} on ${at.join(',')}`);
    const statuses = Object.entries(pages).filter(([, h]) => h.startsWith('(')).map(([p, h]) => `${p} ${h}`);
    need(!missing.length, `linked and matched, but the feed lacks: ${missing.join(', ')}${found.length ? `; found ${found.join('; ')}` : ''}${statuses.length ? `; pages not 200: ${statuses.join(', ')}` : ''}${all.length < 2000 ? '; pages nearly empty' : ''}`);
    return `linked to "${con.json.schoolName}", child matched; ${found.join('; ')}`;
  });

  await step(8, 'Family child: ask the tutor a Class 10 maths question, then "samajh nahi aaya"', async () => {
    needCtx('familyChildId');
    // The Family app's tutor ("understand") is a platform switch: the founder turns it on for the pilot school's families.
    const apps = await call(founder, 'GET', '/api/control/apps');
    const flag = (apps.json?.flags ?? []).find((f) => f.app === 'family' && f.module === 'understand');
    let flagNote = `understand flag ${flag ? (flag.enabled ? `on for ${flag.audience}` : 'off') : 'not listed'}`;
    if (!flag || !flag.enabled || flag.audience !== 'everyone') {
      const set = await call(founder, 'POST', '/api/control/apps/flags', { app: 'family', module: 'understand', enabled: true, audience: 'schools', audienceSchools: [ctx.schoolId], reason: 'school day rehearsal: the pilot school' });
      need(set.status === 200 || set.status === 201, `switch the Family tutor on for the pilot school: ${short(set)}`);
      flagNote += ', switched on for the pilot school';
    }
    // No AI key in the harness: Control routes the tutor's profile to the stand-in (offered in development only,
    // src/lib/ai/control.ts providerChoices), as the founder would route it to a real provider.
    const ai = await call(founder, 'GET', '/api/control/ai');
    need(ai.status === 200, `Control → AI: ${short(ai)}`);
    const resolver = (ai.json?.profiles ?? []).find((p) => p.profileId === 'family.resolver');
    const standIn = (ai.json?.providerChoices ?? []).includes('stand-in');
    if (resolver && standIn && resolver.providerId !== 'stand-in') {
      const set = await call(founder, 'POST', '/api/control/ai', { action: 'profile', profileId: 'family.resolver', providerId: 'stand-in', model: 'stand-in', promptVersion: resolver.promptVersion, enabled: true, fallback: [] });
      flagNote += set.status === 200 ? '; family.resolver routed to the stand-in' : `; routing family.resolver to the stand-in answered ${short(set)}`;
    } else flagNote += `; family.resolver ${resolver ? `on ${resolver.providerId}` : 'not listed'}, stand-in ${standIn ? 'offered' : 'not offered'}`;
    ctx.ledgerBefore = Number((await q(`select count(*)::int as n from control.ai_usage_ledger`))[0].n);
    const child = await familyCookie(FAMILY_ACCOUNT, { child: ctx.familyChildId });
    const ask = async (text) => {
      const r = await call(child, 'POST', '/api/family/understand', { kind: 'question', text, tutor: { subject: 'mathematics' } }, { accept: 'application/x-ndjson' });
      const lines = r.text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      return { r, lines, done: lines.find((l) => l.t === 'done'), refused: lines.find((l) => l.t === 'refused' || l.t === 'error'), blocks: lines.filter((l) => l.t === 'block' || l.t === 'blocks').length };
    };
    const first = await ask(TUTOR_QUESTION);
    const noKey = (x) => /not_set_up|no_provider|unavailable|provider|key|ai_off|failed/i.test(JSON.stringify(x.refused ?? {})) || x.r.status === 503;
    if (first.r.status !== 200 || first.refused || !first.done) {
      const why = first.refused ? JSON.stringify(first.refused).slice(0, 200) : short(first.r);
      if (noKey(first) || /not_switched_on/.test(why)) throw new Skip(`no AI key in the harness (AI testing mode ${TESTING_MODE}; ${flagNote}): the tutor did not answer (${why})`);
      throw new Error(`the first question: ${why}`);
    }
    ctx.tutorAnswered = true;
    const second = await ask(FOLLOW_UP);
    if (second.r.status !== 200 || second.refused || !second.done) throw new Error(`answered the question (${first.blocks} blocks), but the follow-up: ${second.refused ? JSON.stringify(second.refused).slice(0, 200) : short(second.r)}`);
    return `answered the question (${first.blocks} blocks) and the follow-up (${second.blocks} blocks), AI testing mode ${TESTING_MODE}; ${flagNote}`;
  });

  await step(9, "Parent area: the child's progress / vault shows the question", async () => {
    if (!ctx.tutorAnswered) throw new Skip('step 8 did not get an answer, so there is no question to find');
    const both = await familyCookie(FAMILY_ACCOUNT, { parent: true, child: ctx.familyChildId });
    const seen = [];
    for (const route of [`/family/parent/progress/${ctx.familyChildId}`, '/family/parent/vault', '/family/parent']) {
      const r = await call(both, 'GET', route, undefined, { accept: 'text/html' });
      if (r.status === 200 && r.text.includes('quadratic equation')) seen.push(route.replace(ctx.familyChildId, ':childId'));
    }
    need(seen.length, 'the question is not on the progress, vault or parent pages');
    return `the question shows on ${seen.join(', ')}`;
  });

  await step(10, "Control: the AI usage ledger shows the run's attempts", async () => {
    if (ctx.ledgerBefore === undefined) throw new Skip('step 8 made no tutor call');
    const r = await call(founder, 'GET', '/api/control/ai');
    need(r.status === 200, `Control → AI: ${short(r)}`);
    const after = Number((await q(`select count(*)::int as n from control.ai_usage_ledger`))[0].n);
    const since = new Date(STARTED).toISOString();
    const shown = (r.json?.routing?.ledger ?? []).filter((e) => String(e.at ?? '') >= since);
    if (after === ctx.ledgerBefore && !shown.length) {
      if (!ctx.tutorAnswered) throw new Skip('step 8 got no answer and no attempt reached a provider, so the ledger has nothing of this run');
      throw new Error('the tutor answered but the ledger holds no attempt for it');
    }
    need(shown.length > 0, `the database holds ${after - ctx.ledgerBefore} new attempts, but Control → AI's ledger shows none since the run began`);
    return `${after - ctx.ledgerBefore} new attempt(s) in the ledger; Control → AI shows ${shown.length} (outcomes: ${[...new Set(shown.map((e) => e.outcome))].join(', ')})`;
  });
} catch (e) {
  console.error(`school_day: the harness failed: ${e.message}`);
  results.push({ n: 0, title: 'harness', status: 'FAIL', reason: e.message, routes: [] });
}

const count = (s) => results.filter((r) => r.status === s).length;
console.log(`\nschool_day: ${count('PASS')} pass, ${count('FAIL')} fail, ${count('SKIP')} skip  (${((Date.now() - STARTED) / 1000).toFixed(0)} s, school stamp ${STAMP})`);
await shutdown(count('FAIL') ? 1 : 0);
