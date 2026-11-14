// node reader/scripts/diagram-render.mjs <patch.json> <out.png> [en|hi]: a diagram patch drawn at phone width with its labels filled, after its motion has played (C527)
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [p, out, lang = 'en'] = process.argv.slice(2);
const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
const steps = Array.isArray(raw) ? raw : [raw];
const html = `<body style="margin:0;background:#fff;font-family:system-ui,'Noto Sans Devanagari',sans-serif">${steps.map((s, i) => `<div data-i="${i}" style="width:360px;padding:8px">${s.svg}<script>document.querySelectorAll('[data-i="${i}"] [data-t]').forEach(e=>{const t=${JSON.stringify(s.texts)}[e.getAttribute('data-t')];e.textContent=t?t['${lang}']:'??'})</script></div>`).join('')}</body>`;
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 376, height: 400 }, deviceScaleFactor: 2 });
await pg.setContent(html);
await pg.waitForTimeout(Number(process.env.WAIT ?? 5200));
await pg.screenshot({ path: out, fullPage: true });
await b.close();
