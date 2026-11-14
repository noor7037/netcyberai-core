// node reader/scripts/diagram-render.mjs <patch.json | patchDir> <out.png> [en|hi]: a diagram patch (or every patch in a folder, as one sheet) drawn at phone width with its labels filled, after its motion has played (C527)
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [p, out, lang = 'en'] = process.argv.slice(2);
const files = fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter((f) => f.endsWith('.json')).sort().map((f) => `${p}/${f}`) : [p];
const steps = files.flatMap((f) => { const raw = JSON.parse(fs.readFileSync(f, 'utf8')); return (Array.isArray(raw) ? raw : [raw]).map((s) => ({ ...s, from: f.split('/').pop() })); });
const sheet = files.length > 1;
const html = `<body style="margin:0;background:#fff;display:flex;flex-wrap:wrap;align-items:flex-start;font-family:system-ui,'Noto Sans Devanagari',sans-serif">${steps.map((s, i) => `<div data-i="${i}" style="width:360px;padding:8px">${sheet ? `<b style="font-size:12px">${s.from}</b>` : ''}${s.svg}<script>document.querySelectorAll('[data-i="${i}"] [data-t]').forEach(e=>{const t=${JSON.stringify(s.texts)}[e.getAttribute('data-t')];e.textContent=t?t['${lang}']:'??'})</script></div>`).join('')}</body>`;
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: sheet ? 752 : 376, height: 400 }, deviceScaleFactor: sheet ? 1 : 2 });
await pg.setContent(html);
await pg.waitForTimeout(Number(process.env.WAIT ?? 5200));
await pg.screenshot({ path: out, fullPage: true });
await b.close();
