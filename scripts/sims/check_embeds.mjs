// Opens one sample address of every simulation host in a sandboxed iframe, on a blank page served with the Family app's
// production Content-Security-Policy frame-src (read from next.config.js), in headless Chromium, and says whether the frame
// loaded or was blocked. Run on purpose:  node scripts/sims/check_embeds.mjs
// A frame the browser refuses ends on chrome-error://, or logs "Refused to display"/"Refused to frame".
import { readFileSync } from 'node:fs';

const cfg = readFileSync(new URL('../../next.config.js', import.meta.url), 'utf8');
const list = /const FAMILY_FRAME_HOSTS = \[([\s\S]*?)\];/.exec(cfg)?.[1] ?? '';
const frameHosts = [...list.matchAll(/'([a-z0-9.-]+)'/g)].map((m) => m[1]);
const csp = `frame-src 'self' blob: data: ${frameHosts.map((h) => `https://${h}`).join(' ')}`;

const SAMPLES = [
  ['phet', 'https://phet.colorado.edu/sims/html/energy-forms-and-changes/latest/energy-forms-and-changes_en.html'],
  ['phet (hi)', 'https://phet.colorado.edu/sims/html/energy-forms-and-changes/latest/energy-forms-and-changes_hi.html'],
  ['nasa_eyes', 'https://eyes.nasa.gov/apps/solar-system/'],
  ['vlabs', 'https://vlab.amrita.edu/?sub=1&brch=74&sim=191&cnt=1'],
  ['olabs', 'https://www.olabs.edu.in/?sub=96&brch=50&sim=1&cnt=1'],
];
const only = process.argv[2];
const { chromium } = await import('playwright');
const browser = await chromium.launch();
const results = [];
for (const [name, url] of SAMPLES.filter(([n]) => !only || n.startsWith(only))) {
  const page = await browser.newPage();
  const refused = [];
  page.on('console', (m) => /refused to (display|frame)|frame-ancestors|X-Frame-Options/i.test(m.text()) && refused.push(m.text().slice(0, 160)));
  await page.route('https://app.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', headers: { 'content-security-policy': csp }, body: '<!doctype html><title>blank</title><body></body>' }));
  await page.goto('https://app.test/');
  const host = new URL(url).hostname;
  const state = await page
    .evaluate(
      ([src]) =>
        new Promise((resolve) => {
          const f = document.createElement('iframe');
          f.sandbox = 'allow-scripts allow-same-origin allow-popups allow-forms';
          f.referrerPolicy = 'no-referrer';
          f.width = '600';
          f.height = '400';
          f.onload = () => resolve('load');
          f.src = src;
          document.body.appendChild(f);
          setTimeout(() => resolve('timeout'), 40000);
        }),
      [url],
    )
    .catch((e) => `error ${e.message}`);
  await page.waitForTimeout(2500);
  const frame = page.frames().find((f) => f !== page.mainFrame());
  const landed = frame?.url() ?? '';
  const blocked = !frame || landed.startsWith('chrome-error:') || refused.length > 0 || !landed.includes(host.split('.').slice(-2).join('.'));
  results.push({ name, host, state, landed: landed.slice(0, 90), verdict: blocked ? 'BLOCKED' : 'LOADED', refused: refused[0] ?? '' });
  await page.close();
}
await browser.close();
console.log(`CSP frame-src used: ${frameHosts.length} hosts`);
for (const r of results) console.log(`${r.verdict.padEnd(8)} ${r.name.padEnd(10)} ${r.host}  onload=${r.state}  landed=${r.landed}${r.refused ? `  | ${r.refused}` : ''}`);
