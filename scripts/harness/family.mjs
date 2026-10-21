// The Family app's pictures (M1-2, C248; the M1 gate, docs/family-app/07 §3): every family screen at 360, 390 and
// 1440 px, in English and Hindi, with reduced motion on and off. Same isolation as run.mjs: nothing under src/ imports
// this, and the cookies are signed with the run's own secret, worthless anywhere else.
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { SignJWT } from 'jose';

export const FAMILY = {
  fresh: 'f0000000-0000-4000-8000-0000000f0001',
  consented: 'f0000000-0000-4000-8000-0000000f0002',
  pinned: 'f0000000-0000-4000-8000-0000000f0003',
  full: 'f0000000-0000-4000-8000-0000000f0004',
};

// [account (null: no session), picture name, address, { parent: parent mode open }]
export const FAMILY_SCREENS = [
  [null, 'family-sign-in', '/family/sign-in', {}],
  ['fresh', 'family-welcome', '/family/welcome', {}],
  ['consented', 'family-pin-setup', '/family/welcome/pin', {}],
  ['pinned', 'family-first-child', '/family/welcome/child', { parent: true }],
  ['full', 'family-home', '/family', {}],
  ['full', 'family-parent-gate', '/family/parent', {}],
  ['full', 'family-parent-area', '/family/parent', { parent: true }],
  ['full', 'family-study', '/family/study', {}],
  ['full', 'family-study-catalog', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002' }],
  ['full', 'family-understand', '/family/understand?kind=topic&key=cbse.c9.mathematics.u1.ch01.t01', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-block="practice"]' }],
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

export async function runFamilyMatrix({ browser, base, db, secret, out, only }) {
  const rows = [];
  const screens = FAMILY_SCREENS.filter(([, name]) => !only.length || only.some((w) => name.includes(w)));
  for (const lang of FAMILY_LANGS) {
    await db.pg.query(`update family.accounts set ui_language = $1`, [lang]);
    await db.pg.query(`update family.children set language = $1`, [lang]);
    for (const motion of FAMILY_MOTIONS) {
      for (const width of FAMILY_WIDTHS) {
        for (const [who, name, route, opts] of screens) {
          const context = await browser.newContext({ viewport: { width, height: width < 768 ? 800 : 900 }, reducedMotion: motion, deviceScaleFactor: 1 });
          const cookies = who ? await familyCookies(FAMILY[who], opts.parent, secret, opts.child) : [];
          cookies.push({ name: 'ncf_lang', value: lang });
          await context.addCookies(cookies.map((c) => ({ ...c, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' })));
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
          page.on('response', (r) => {
            if (r.url().includes('/api/') && r.status() >= 400) errors.push(`${r.request().method()} ${new URL(r.url()).pathname} answered ${r.status()}`);
          });
          const response = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 90000 }).catch((e) => ({ status: () => 0, error: e.message }));
          if (opts.settle) await page.locator(opts.settle).first().waitFor({ timeout: 20000 }).catch(() => errors.push(`${opts.settle} never appeared`));
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
              // Words left in English on a Hindi screen. Product names, the language names and the seeded children's
              // first names (data, not words of the app) do not count.
              latinWords: (text.match(/\b[A-Za-z]{4,}\b/g) ?? []).filter((w) => !['netcyberai', 'cbse', 'english', 'hinglish', 'delete', 'asha', 'kabir'].includes(w.toLowerCase())).length,
            };
          });
          const file = `${name}-${lang}-${motion === 'reduce' ? 'still' : 'motion'}-${width}.png`;
          await page.screenshot({ path: path.join(out, file), fullPage: true });
          const problems = [];
          if (response.status() !== 200) problems.push(`answered ${response.status()}`);
          if (seen.path !== route.split('?')[0]) problems.push(`landed on ${seen.path}`);
          if (seen.horizontalScroll) problems.push('sideways scroll');
          if (seen.smallTargets.length) problems.push(`targets under 44 px: ${seen.smallTargets.join(', ')}`);
          if (motion === 'reduce' && seen.running) problems.push(`${seen.running} animations run under reduced motion`);
          if (lang === 'hi' && (!seen.devanagari || seen.latinWords > 3)) problems.push(`Hindi incomplete (${seen.latinWords} English words)`);
          problems.push(...errors);
          rows.push({ name, lang, motion, width, route, file, h1: seen.h1, problems });
          console.log(`${width} ${lang} ${motion} ${name}: ${problems.length ? problems.join('; ') : 'ok'}`);
          await context.close();
        }
      }
    }
  }
  writeFileSync(path.join(out, 'family-report.json'), JSON.stringify(rows, null, 2));
  return rows;
}
