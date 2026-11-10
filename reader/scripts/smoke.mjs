#!/usr/bin/env node
// Headless check of the chapter reader in Chromium (Playwright from the repo's node_modules). For every chapter in
// the book index (SMOKE_BOOK=c10/science, the default) it opens the chapter page and every topic (read-all mode, every topic opened as a parent
// would) and the chapter test, at 390 px and 1280 px, in English and Hindi, and reports page errors, failed requests,
// images that did not load, and sideways scroll. Screenshots of each chapter page and its first topic go to
// reader/.smoke/. Usage: node reader/scripts/smoke.mjs [chapter number …]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const READER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(READER, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/reader/`;
const idx = JSON.parse(fs.readFileSync(path.join(READER, 'content', process.env.SMOKE_BOOK || 'c10/science', 'index.json'), 'utf8'));
const want = process.argv.slice(2).map(Number);
const chapters = idx.chapters.filter((c) => c.file && (!want.length || want.includes(c.number)));
fs.mkdirSync(path.join(READER, '.smoke'), { recursive: true });
const browser = await chromium.launch();
let failed = 0;
for (const c of chapters) {
  const ch = JSON.parse(fs.readFileSync(path.join(READER, 'content', c.file), 'utf8'));
  const slug = c.file.replace(/\.json$/, '');
  const issues = [];
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    for (const lang of ['en', 'hi']) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      page.setDefaultTimeout(15000);
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED/.test(m.text())) errs.push(m.text()); });
      page.on('requestfailed', (q) => { if (!/fonts\.(googleapis|gstatic)/.test(q.url())) errs.push('request failed: ' + q.url()); });
      page.on('response', (r) => { if (r.status() >= 400) errs.push(`${r.status()} ${r.url()}`); });
      await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      await page.addInitScript(() => { try { localStorage.setItem('nca.reader.v1.parentOpen', '1'); } catch (e) {} });
      const views = [['home', ''], ...ch.topics.map((t) => [t.id, '~' + t.id]), ['test', '~test']];
      for (const [name, suffix] of views) {
        await page.goto('about:blank');
        await page.goto(`${base}?lang=${lang}#${slug}${suffix}`, { timeout: 20000 }).catch((e) => errs.push('load: ' + e.message.slice(0, 120)));
        await page.waitForTimeout(500);
        if (suffix && suffix !== '~test') { await page.click('[data-mode="read"]').catch(() => {}); await page.waitForTimeout(250); }
        await page.evaluate(async () => { for (const im of document.querySelectorAll('img')) { im.loading = 'eager'; } window.scrollTo(0, document.body.scrollHeight); await new Promise((r) => setTimeout(r, 400)); });
        const r = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          broken: [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')),
          steps: document.querySelectorAll('.step, .item').length,
          empty: !document.getElementById('app').innerText.trim(),
        }));
        const tag = `${w}px ${lang} ${name}`;
        if (r.overflow) issues.push(`${tag}: the page scrolls sideways`);
        if (r.broken.length) issues.push(`${tag}: images not loaded: ${r.broken.join(', ')}`);
        if (r.empty) issues.push(`${tag}: empty page`);
        if (name === 'home' || name === ch.topics[0].id) await page.screenshot({ path: path.join(READER, '.smoke', `ch${String(c.number).padStart(2, '0')}-${name}-${w}-${lang}.png`), fullPage: false });
      }
      [...new Set(errs)].forEach((e) => issues.push(`${w}px ${lang}: error: ${e.slice(0, 240)}`));
      await page.close();
    }
  }
  if (issues.length) failed++;
  console.log(`ch${c.number}: ${issues.length ? '\n  - ' + issues.slice(0, 30).join('\n  - ') : 'ok'} (${ch.topics.length} topics + test, 2 widths × 2 languages)`);
}
await browser.close();
server.close();
console.log('screenshots in reader/.smoke/');
process.exit(failed ? 1 : 0);
