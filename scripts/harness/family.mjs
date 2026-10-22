// The Family app's pictures (M1-2, C248; the M1 gate, docs/family-app/07 §3): every family screen at 360, 390 and
// 1440 px, in English and Hindi, with reduced motion on and off. Same isolation as run.mjs: nothing under src/ imports
// this, and the cookies are signed with the run's own secret, worthless anywhere else.
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { SignJWT } from 'jose';

// axe-core checks every picture against WCAG 2.1 A and AA; a serious or critical finding fails the run (07 §3).
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

export const FAMILY = {
  fresh: 'f0000000-0000-4000-8000-0000000f0001',
  consented: 'f0000000-0000-4000-8000-0000000f0002',
  pinned: 'f0000000-0000-4000-8000-0000000f0003',
  full: 'f0000000-0000-4000-8000-0000000f0004',
  english: 'f0000000-0000-4000-8000-0000000f0005',
  // d1-3: the empty states' families.
  empty: 'f0000000-0000-4000-8000-0000000f0031',
  nochild: 'f0000000-0000-4000-8000-0000000f0032',
};

// [account (null: no session), picture name, address, { parent: parent mode open }]
export const FAMILY_SCREENS = [
  [null, 'family-sign-in', '/family/sign-in', {}],
  [null, 'family-offline', '/family/offline', {}],
  ['fresh', 'family-welcome', '/family/welcome', {}],
  ['consented', 'family-pin-setup', '/family/welcome/pin', {}],
  ['pinned', 'family-first-child', '/family/welcome/child', { parent: true }],
  ['full', 'family-home', '/family', {}],
  ['full', 'family-parent-gate', '/family/parent', {}],
  ['full', 'family-parent-area', '/family/parent', { parent: true }],
  ['full', 'family-home-progress', '/family', { child: 'f0000000-0000-4000-8000-0000000fc002' }],
  ['full', 'family-study', '/family/study', {}],
  ['full', 'family-study-catalog', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002' }],
  ['full', 'family-understand', '/family/understand?kind=topic&key=cbse.c9.mathematics.u1.ch01.t01', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-block="practice"]' }],
  // M2-5 (C279): the honest player under the response, before and after the tap that loads the embed.
  ['full', 'family-video', '/family/understand?kind=topic&key=cbse.c9.mathematics.u1.ch01.t01', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-video-play]' }],
  ['full', 'family-video-playing', '/family/understand?kind=topic&key=cbse.c9.mathematics.u1.ch01.t01', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-video-play]', tap: '[data-video-play]' }],
  // m2-6: the homework helper's start screen, and its link in Study (C280).
  ['full', 'family-homework', '/family/study/homework', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-homework-start]' }],
  ['full', 'family-study-homework-link', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-homework-link]' }],
  // m2-7: the microphone beside the typed question, and the recording state (C281; a fake microphone, see `mic`).
  ['full', 'family-study-voice', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-voice-input]' }],
  ['full', 'family-study-voice-recording', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-voice-input]', mic: true }],
  ['full', 'family-parent-area-voice', '/family/parent', { parent: true, settle: '[data-consent-voice]' }],
  // Worksheets (M2-4, C278): the worksheet on screen, and the parent's print with the answer key.
  ['full', 'family-worksheet', '/family/study/worksheet/cbse.c9.mathematics.u1.ch01.t01', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-block="practice"]' }],
  ['full', 'family-worksheet-parent', '/family/parent/worksheet/cbse.c9.mathematics.u1.ch01.t01', { parent: true, child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-worksheet-key], #ws-key' }],
  // m2-2: today's plan first on the home (C276).
  ['full', 'family-home-plan', '/family', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-family-plan]' }],
  // m2-9: "Save for offline" with the pack's size, and Understand with the data-saver on (C283).
  ['full', 'family-study-offline', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-pack-size]' }],
  ['full', 'family-understand-saver', '/family/understand?kind=topic&key=cbse.c9.mathematics.u1.ch01.t01', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-saver-note]', storage: { 'ncf.dataSaver': '1' } }],
  // m2-3: the week, the badges and the reward jar on the home; the parent's habit section (C277).
  ['full', 'family-home-habit', '/family', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-family-jar]' }],
  ['full', 'family-parent-habit', '/family/parent', { parent: true, settle: '[data-habit-child]' }],
  // The English course (C274): the course map, and a lesson's first card.
  ['english', 'family-english', '/family/english', { settle: 'ol[aria-label] li' }],
  ['english', 'family-english-lesson', '/family/english/lesson/b.u01.l1', { settle: '[role=progressbar]' }],
  ['english', 'family-english-l1-words', '/family/english/lesson/b.u01.l1?at=1', { settle: '[role=progressbar]' }],
  ['english', 'family-english-l1-match', '/family/english/lesson/b.u01.l1?at=2', { settle: '[role=progressbar]' }],
  ['english', 'family-english-l1-check', '/family/english/lesson/b.u01.l1?at=5', { settle: '[role=progressbar]' }],
  ['english', 'family-english-l2-pattern', '/family/english/lesson/b.u01.l2', { settle: '[role=progressbar]' }],
  ['english', 'family-english-l3-story', '/family/english/lesson/b.u01.l3', { settle: '[role=progressbar]' }],
  ['english', 'family-english-l4-roleplay', '/family/english/lesson/b.u01.l4', { settle: '[role=progressbar]' }],
  // m2-8 begin: the interactive blocks (C282), each from an illustrative cached response in harness-seed.sql.
  ...[['graph', 't01', 'graph'], ['number-line', 't02', 'number_line'], ['fraction', 't03', 'fraction_model'], ['geometry', 't04', 'geometry'], ['pendulum', 't05', 'simulation'], ['refraction', 't06', 'simulation']].map(
    ([name, t, block]) => ['full', `family-interactive-${name}`, `/family/understand?kind=topic&key=cbse.c9.mathematics.u1.ch90.${t}`, { child: 'f0000000-0000-4000-8000-0000000fc002', settle: `[data-block="${block}"]` }]
  ),
  // m2-8 end
  // d1-3 begin: the designed empty states and the subject colours (C295).
  ['empty', 'family-d13-study-no-catalog', '/family/study', { child: 'f0000000-0000-4000-8000-0000000fc031', settle: '[data-family-no-catalog]' }],
  ['empty', 'family-d13-study-pre-primary', '/family/study', { child: 'f0000000-0000-4000-8000-0000000fc032', settle: '[data-pre-primary]' }],
  ['full', 'family-d13-study-locked', '/family/study?subject=science', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-family-locked]' }],
  ['full', 'family-d13-worksheet-none', '/family/study/worksheet/cbse.c9.mathematics.u1.ch01.t02', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-worksheet-empty]' }],
  ['nochild', 'family-d13-parent-no-children', '/family/parent', { parent: true, settle: '[data-parent-no-children]' }],
  [null, 'family-d13-offline-empty', '/family/offline', { settle: '[data-offline-empty]' }],
  // d1-3 end
];

export const FAMILY_WIDTHS = [360, 390, 1440];
export const FAMILY_LANGS = ['en', 'hi'];
export const FAMILY_MOTIONS = ['reduce', 'no-preference'];

const sign = (typ, sub, claims, secret) =>
  new SignJWT({ ...claims, typ }).setProtectedHeader({ alg: 'HS256' }).setSubject(sub).setAudience('nca-family').setIssuedAt().setExpirationTime('2h').sign(new TextEncoder().encode(secret));

async function familyCookies(accountId, parent, secret, child) {
  const sid = randomUUID();
  const out = [{ name: 'ncf_session', value: await sign('family', accountId, { tv: 0, sid }, secret) }];
  if (parent) out.push({ name: 'ncf_parent', value: await sign('family_parent', accountId, { sid }, secret) });
  if (child) out.push({ name: 'ncf_child', value: child });
  return out;
}

// The video finder's picks for the understand screen's topic, in English and Hindi, with videos switched on (M2-5, C279).
// Made-up video and channel ids: the cards show without any search; the embed loads only after the tap.
export async function seedVideos(db) {
  await db.pg.query(`insert into control.app_flags (app, module, enabled, reason) values ('family', 'videos', true, 'harness') on conflict (app, module) do update set enabled = true`);
  const topic = 'cbse.c9.mathematics.u1.ch01.t01';
  for (const lang of ['en', 'hi']) {
    await db.pg.query(
      `insert into content.video_picks (topic_key, language, video_id, channel_id, channel_title, title, duration_s, start_s, captions, score, status, reviewed_by, reviewed_at) values
         ($1, $2, 'hrnsVideo01', 'UCharnessChannel0001', 'Made-up Maths Channel', 'Rational numbers on the number line', 545, 95, true, 71, 'pinned', '00000000-0000-4000-8000-00000000f001', now()),
         ($1, $2, 'hrnsVideo02', 'UCharnessChannel0002', 'Made-up Learning', 'Rational numbers: worked examples', 812, 0, true, 63, 'auto', null, null),
         ($1, $2, 'hrnsVideo03', 'UCharnessChannel0002', 'Made-up Learning', 'Is it rational? Practice questions', 1260, 0, false, 40, 'rejected', '00000000-0000-4000-8000-00000000f001', now())
       on conflict do nothing`,
      [topic, lang]
    );
  }
  await db.pg.query(`insert into content.video_channels (channel_id, title, kind, added_by) values ('UCharnessChannel0001', 'Made-up Maths Channel', 'official', '00000000-0000-4000-8000-00000000f001') on conflict do nothing`);
}

// The English course's track B lesson files, loaded as a published version (the harness only; C274).
async function seedEnglish(db) {
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '../../data/english/b');
  const units = readdirSync(dir).filter((f) => /^unit-\d{2}\.json$/.test(f)).sort().map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
  const v = 'f0000000-0000-4000-8000-00000000e001';
  await db.pg.query(`insert into content.english_versions (version_id, track, version_no, status, audience, import_source, import_ref, approved_by, approved_at, released_at) values ($1, 'b', 1, 'published', 'everyone', 'repository', 'harness', '00000000-0000-4000-8000-00000000f001', now(), now()) on conflict do nothing`, [v]);
  for (const u of units) {
    await db.pg.query(`insert into content.english_units (version_id, unit_key, position, title_en, title_hi, can_do_en, can_do_hi, pic) values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict do nothing`, [v, u.key, u.unit, u.title.en, u.title.hi, u.can_do.en, u.can_do.hi, u.pic]);
    for (const [i, l] of u.lessons.entries()) {
      await db.pg.query(`insert into content.english_lessons (version_id, lesson_key, unit_key, position, kind, title_en, title_hi, minutes, body) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict do nothing`, [v, l.key, u.key, i + 1, l.kind, l.title.en, l.title.hi, l.minutes, JSON.stringify(l)]);
    }
  }
}

export async function runFamilyMatrix({ browser, base, db, secret, out, only }) {
  await seedEnglish(db);
  // The English child has done the first three lessons of unit 1, so the map shows progress and lesson 4 is open.
  await db.pg.query(`insert into family.english_enrolments (account_id, child_id, track, started_on) values ($1, $2, 'b', (now() at time zone 'Asia/Kolkata')::date - 3) on conflict do nothing`, [FAMILY.english, 'f0000000-0000-4000-8000-0000000fc005']);
  for (const [k, s] of [['b.u01.l1', 3], ['b.u01.l2', 2], ['b.u01.l3', 3]]) {
    await db.pg.query(`insert into family.english_lessons_done (account_id, child_id, lesson_key, tries, best_score, stars, done_on, last_on) values ($1, $2, $3, 1, 100, $4, (now() at time zone 'Asia/Kolkata')::date - 1, (now() at time zone 'Asia/Kolkata')::date - 1) on conflict do nothing`, [FAMILY.english, 'f0000000-0000-4000-8000-0000000fc005', k, s]);
  }
  const rows = [];
  const screens = FAMILY_SCREENS.filter(([, name]) => !only.length || only.some((w) => name.includes(w)));
  for (const lang of FAMILY_LANGS) {
    await db.pg.query(`update family.accounts set ui_language = $1`, [lang]);
    await db.pg.query(`update family.children set language = $1`, [lang]);
    for (const motion of FAMILY_MOTIONS) {
      for (const width of FAMILY_WIDTHS) {
        for (const [who, name, route, opts] of screens) {
          const context = await browser.newContext({ viewport: { width, height: width < 768 ? 800 : 900 }, reducedMotion: motion, deviceScaleFactor: 1, ...(opts.mic ? { permissions: ['microphone'] } : {}) });
          const cookies = who ? await familyCookies(FAMILY[who], opts.parent, secret, opts.child) : [];
          cookies.push({ name: 'ncf_lang', value: lang });
          await context.addCookies(cookies.map((c) => ({ ...c, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' })));
          // A device setting the screen reads from the phone's storage (the data-saver, M2-9).
          if (opts.storage) await context.addInitScript((s) => Object.entries(s).forEach(([k, v]) => window.localStorage.setItem(k, v)), opts.storage);
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
          page.on('response', (r) => {
            if (r.url().includes('/api/') && r.status() >= 400) errors.push(`${r.request().method()} ${new URL(r.url()).pathname} answered ${r.status()}`);
          });
          const response = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 90000 }).catch((e) => ({ status: () => 0, error: e.message }));
          if (opts.settle) await page.locator(opts.settle).first().waitFor({ timeout: 20000 }).catch(() => errors.push(`${opts.settle} never appeared`));
          // `mic`: start a recording on Chromium's fake microphone (the browser is launched with it), so the recording
          // state can be pictured. Nothing is sent: the context closes while it records.
          if (opts.mic) {
            await page.locator('[data-voice-input] button').first().click();
            await page.locator('[data-voice-state="recording"]').waitFor({ timeout: 10000 }).catch(() => errors.push('the recording never started'));
            await page.waitForTimeout(1600);
          }
          if (opts.tap) await page.locator(opts.tap).first().click().catch(() => errors.push(`${opts.tap} could not be tapped`));
          await page.waitForTimeout(400);
          const seen = await page.evaluate(() => {
            const main = document.querySelector('main') ?? document.body;
            const small = [...document.querySelectorAll('a, button, select, input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, summary')]
              .filter((e) => {
                const r = e.getBoundingClientRect();
                return r.width > 2 && r.height > 2 && r.height < 43.5;
              })
              .map((e) => `${(e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 24)}:${Math.round(e.getBoundingClientRect().height)}`);
            // Words marked as English on purpose (lang="en": English terms beside their Hindi, the English moment, catalog
            // titles printed only in English) are not counted as English left on a Hindi screen.
            const copy = main.cloneNode(true);
            copy.querySelectorAll('[lang="en"]').forEach((e) => e.remove());
            document.body.appendChild(copy);
            copy.style.position = 'absolute';
            copy.style.left = '-99999px';
            const text = copy.innerText;
            copy.remove();
            return {
              path: location.pathname,
              lang: document.querySelector('[lang]')?.getAttribute('lang') ?? null,
              h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
              horizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
              smallTargets: small,
              running: document.getAnimations().filter((a) => a.playState === 'running').length,
              devanagari: /[ऀ-ॿ]/.test(text),
              // Words left in English on a Hindi screen. Product names (NetCyberAI, Family Plus), the language names and the seeded children's
              // first names (data, not words of the app) do not count.
              latinWords: (text.match(/\b[A-Za-z]{4,}\b/g) ?? []).filter((w) => !['netcyberai', 'cbse', 'english', 'hinglish', 'delete', 'asha', 'kabir', 'family', 'plus'].includes(w.toLowerCase())),
            };
          });
          await page.addScriptTag({ path: AXE });
          const axe = await page.evaluate(async () => {
            const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
            return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} (${v.nodes.length}) at ${v.nodes[0].target.join(' ')}: ${(v.nodes[0].any[0]?.message ?? '').slice(0, 140)}`);
          });
          const file = `${name}-${lang}-${motion === 'reduce' ? 'still' : 'motion'}-${width}.png`;
          await page.screenshot({ path: path.join(out, file), fullPage: true });
          const problems = [];
          if (response.status() !== 200) problems.push(`answered ${response.status()}`);
          if (seen.path !== route.split('?')[0]) problems.push(`landed on ${seen.path}`);
          if (seen.horizontalScroll) problems.push('sideways scroll');
          if (seen.smallTargets.length) problems.push(`targets under 44 px: ${seen.smallTargets.join(', ')}`);
          if (motion === 'reduce' && seen.running) problems.push(`${seen.running} animations run under reduced motion`);
          if (axe.length) problems.push(`axe: ${axe.join(', ')}`);
          if (lang === 'hi' && (!seen.devanagari || seen.latinWords.length > 3)) problems.push(`Hindi incomplete (${seen.latinWords.length} English words: ${seen.latinWords.slice(0, 8).join(' ')})`);
          problems.push(...errors);
          rows.push({ name, lang, motion, width, route, file, h1: seen.h1, axe, problems });
          console.log(`${width} ${lang} ${motion} ${name}: ${problems.length ? problems.join('; ') : 'ok'}`);
          await context.close();
        }
      }
    }
  }
  writeFileSync(path.join(out, 'family-report.json'), JSON.stringify(rows, null, 2));
  return rows;
}
