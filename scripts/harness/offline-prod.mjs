#!/usr/bin/env node
// The service worker, checked on a PRODUCTION build (C146). The screenshot
// harness runs `next dev`, where the service worker is off; this script is
// the one place it is exercised for real, on this machine only:
//
//   1. `next build`, then `next start` on 127.0.0.1, against the same
//      throwaway database and seed as the harness.
//   2. A teacher opens Attendance once with the network on, and their class.
//   3. The network goes (the server is stopped, so the service worker gets
//      no answer either). The page is reloaded: it must still open (from the
//      service worker), show the class kept on the phone, and take a
//      submission into the outbox. A page that is not kept must say "offline".
//   4. The network returns: the submission is sent, each student holds
//      exactly one mark, and nothing was saved while offline.
//
//   node scripts/harness/offline-prod.mjs [--port 3220] [--skip-build]
//
// Like run.mjs it is a local tool: it refuses a production shell, gives the
// app a clean environment and a secret made up for this run, and talks to
// 127.0.0.1 only. It leaves `.next` holding this local build.

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SignJWT } from 'jose';
import { startHarnessDb } from './db.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const APP_PORT = Number(arg('--port') ?? 3220);

if (process.env.NODE_ENV === 'production' || process.env.VERCEL || process.env.CI_DEPLOY) {
  console.error('offline check: refusing to run: this is a local development tool.');
  process.exit(2);
}

const SCHOOL = 'a0000000-0000-4000-8000-000000000001';
const CLASS_5A = '00000000-0000-4000-8000-0000000c0051';
const TEACHER = { sub: '00000000-0000-4000-8000-00000000a003', role: 'teacher', schoolId: SCHOOL, membershipId: '00000000-0000-4000-8000-0000000a1003' };
const TODAY_SQL = `(now() at time zone 'Asia/Kolkata')::date`;
const TOUR_IDS = [...readFileSync(path.join(ROOT, 'src/lib/contracts/tours.ts'), 'utf8').matchAll(/^  '?([a-z-]+)'?: \{ steps:/gm)].map((m) => m[1]);

const db = await startHarnessDb({ port: APP_PORT + 1, seedSql: readFileSync(path.join(ROOT, 'src/demo-fixture/harness-seed.sql'), 'utf8') });
const secret = randomBytes(32).toString('hex');
const base = `http://127.0.0.1:${APP_PORT}`;
const childEnv = {
  PATH: process.env.PATH ?? '',
  HOME: process.env.HOME ?? '',
  TMPDIR: process.env.TMPDIR ?? '',
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
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
  // The build asks for the public contact number; the same one CI builds with.
  NEXT_PUBLIC_WHATSAPP_NUMBER: '919817707037',
};
const next = path.join(ROOT, 'node_modules/next/dist/bin/next');
let app = null;
const isUp = () => fetch(`${base}/login`, { redirect: 'manual' }).then((r) => r.status < 500, () => false);
async function startApp() {
  app = spawn(process.execPath, [next, 'start', '-p', String(APP_PORT), '-H', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore', env: childEnv });
  for (let i = 0; !(await isUp()); i++) {
    if (i > 120) throw new Error('the app did not start');
    await new Promise((r) => setTimeout(r, 500));
  }
}
// "No network" must be true for the service worker too, and the browser's
// own offline switch does not reach a service worker's requests. So the
// server itself is stopped: nothing answers, whoever asks.
async function stopApp() {
  const gone = new Promise((r) => app.once('exit', r));
  app.kill('SIGTERM');
  await gone;
  app = null;
  for (let i = 0; await isUp(); i++) {
    if (i > 40) throw new Error('the app did not stop');
    await new Promise((r) => setTimeout(r, 250));
  }
}
let failed = null;
const steps = [];
const step = (text) => {
  steps.push(text);
  console.log(`offline check: ${text}`);
};

try {
  if (!process.argv.includes('--skip-build')) {
    step('building for production');
    const built = spawnSync(process.execPath, [next, 'build'], { cwd: ROOT, env: childEnv, encoding: 'utf8' });
    if (built.status !== 0) throw new Error(`the build failed:\n${(built.stdout + built.stderr).slice(-1500)}`);
  }
  await startApp();

  const marks = async () => (await db.pg.query(`select count(*)::int as n, count(distinct student_id)::int as students, count(*) filter (where status = 'absent')::int as absent from attendance where school_id = $1 and class_id = $2 and date = ${TODAY_SQL}`, [SCHOOL, CLASS_5A])).rows[0];
  await db.pg.query(`delete from attendance where school_id = $1 and class_id = $2 and date = ${TODAY_SQL}`, [SCHOOL, CLASS_5A]);

  const token = await new SignJWT({ typ: 'access', role: TEACHER.role, schoolId: TEACHER.schoolId, membershipId: TEACHER.membershipId, tv: 0, aal: 'aal2', sid: randomUUID() })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(TEACHER.sub)
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(secret));
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await context.addCookies([
    { name: 'nca_access', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' },
    { name: 'nca_tours', value: `${TEACHER.sub}.${TOUR_IDS.join(',')}`, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' },
  ]);
  const page = await context.newPage();
  const chooseClass = async () => {
    await page.selectOption('#attendance-class', { label: '5-A' });
    await page.locator('[data-student-row]').first().waitFor({ timeout: 20000 });
    return page.locator('[data-student-row]').count();
  };

  step('online: opening Attendance once, so the service worker takes the page');
  await page.goto(`${base}/app/attendance`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30000 });
  // Once more under the service worker, so the page and its files are kept.
  await page.reload({ waitUntil: 'networkidle' });
  const students = await chooseClass();
  if (students === 0) throw new Error('the class has no students to mark');

  step('offline (the server is stopped too): reloading the page');
  await stopApp();
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 1, name: 'Attendance' }).waitFor({ timeout: 20000 });
  await page.locator('[data-sync="offline"]').waitFor({ timeout: 20000 });
  if ((await chooseClass()) !== students) throw new Error('offline, the class kept on the phone is not the class that was loaded');
  await page.locator('[data-attendance-offline]').waitFor({ timeout: 10000 });

  step('offline: one student absent, submit');
  await page.locator('[data-student-row]').first().getByRole('button', { name: 'Absent' }).click();
  await page.locator('[data-submit-attendance]').click();
  await page.locator('[data-sync="waiting"]').waitFor({ timeout: 15000 });
  if ((await marks()).n !== 0) throw new Error('offline, yet marks reached the database');

  step('offline: a page that is not kept says so');
  const other = await context.newPage();
  await other.goto(`${base}/app/students`, { waitUntil: 'domcontentloaded' });
  const shown = await other.content();
  if (!shown.includes('You are offline')) throw new Error(`a page that is not kept did not show the offline page; it showed: ${shown.replace(/\s+/g, ' ').slice(0, 300)}`);
  await other.close();

  step('offline: reloading again; the submission is still waiting');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-sync="waiting"]').waitFor({ timeout: 20000 });

  step('online again: the submission is sent');
  await startApp();
  await context.setOffline(false);
  await page.locator('[data-sync="saved"]').waitFor({ timeout: 30000 });
  const saved = await marks();
  if (saved.n !== students || saved.students !== students || saved.absent !== 1) throw new Error(`after reconnecting: ${saved.n} marks for ${saved.students} students (${saved.absent} absent); expected ${students} marks, one each, 1 absent`);
  step(`PASS: ${students} students, one mark each, 1 absent; nothing was saved while offline`);
  await browser.close();
} catch (err) {
  failed = err;
  console.error(`offline check: FAILED after "${steps[steps.length - 1] ?? 'start'}": ${err.message.split('\n').slice(0, 12).join('\n')}`);
} finally {
  if (app) app.kill('SIGTERM');
  await db.stop();
}
process.exit(failed ? 1 : 0);
