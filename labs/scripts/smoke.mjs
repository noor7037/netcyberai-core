#!/usr/bin/env node
// Headless smoke test of templates in Chromium (Playwright from the repo's node_modules): mounts each template with
// its demo config at 390 px and 1280 px, in English and Hindi, and reports page errors, an empty stage, sideways
// scroll, controls without data-key, and declared targets that are missing from the page. Screenshots go to
// labs/.smoke/<id>-<width>-<lang>.png so a builder can look at them.
// Usage: node labs/scripts/smoke.mjs [template ids…]   (default: every template in labs/templates)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const LABS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ids = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(LABS, 'templates')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(LABS, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(LABS) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
fs.mkdirSync(path.join(LABS, '.smoke'), { recursive: true });
const browser = await chromium.launch();
let failed = 0;
for (const id of ids) {
  const issues = [];
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    for (const lang of ['en', 'hi']) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|fonts\.g/.test(m.text())) errs.push(m.text()); });
      page.on('requestfailed', (q) => { if (!/fonts\.(googleapis|gstatic)\.com/.test(q.url())) errs.push('request failed: ' + q.url()); });
      await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      await page.goto(`http://localhost:${port}/smoke.html?t=${id}&lang=${lang}`);
      await page.waitForTimeout(2500);
      const r = await page.evaluate(() => {
        const s = window.__smoke || {};
        const stage = document.getElementById('stage');
        const keys = s.keys || { targets: [] };
        const present = [...stage.querySelectorAll('[data-key]')].map((e) => e.dataset.key);
        const missing = keys.targets.filter((t) => !t.includes('<') && !t.endsWith('*') && !present.some((p) => p === t));
        const unkeyed = [...stage.querySelectorAll('button')].filter((b) => !b.closest('[data-key]') && !b.dataset.key).length;
        return { mounted: !!s.mounted, errors: s.errors || [], empty: !stage.innerHTML.trim(), height: stage.getBoundingClientRect().height, overflow: document.documentElement.scrollWidth > window.innerWidth + 1, missing, present: present.length, unkeyed };
      });
      await page.screenshot({ path: path.join(LABS, '.smoke', `${id}-${w}-${lang}.png`), fullPage: true });
      const tag = `${w}px ${lang}`;
      if (!r.mounted) issues.push(`${tag}: did not mount`);
      r.errors.concat(errs).forEach((e) => issues.push(`${tag}: error: ${e.slice(0, 300)}`));
      if (r.empty || r.height < 120) issues.push(`${tag}: stage is empty or tiny (${Math.round(r.height)} px)`);
      if (r.overflow) issues.push(`${tag}: the page scrolls sideways`);
      if (w === 1280 && lang === 'en' && r.missing.length) issues.push(`${tag}: declared targets not on the page at start: ${r.missing.join(', ')} (fine only if they appear after an action)`);
      if (w === 1280 && lang === 'en' && !r.present) issues.push(`${tag}: no element has data-key`);
      await page.close();
    }
  }
  if (issues.some((i) => !i.includes('fine only if'))) failed++;
  console.log(`${id}: ${issues.length ? '\n  - ' + issues.join('\n  - ') : 'ok'}`);
}
await browser.close();
server.close();
console.log(`screenshots in labs/.smoke/`);
process.exit(failed ? 1 : 0);
