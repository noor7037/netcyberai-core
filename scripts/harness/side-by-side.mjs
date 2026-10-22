// D1-3 (C295): the mockup's phone (cropped from the board) beside our screen at 390 px, for the design pass's
// side-by-side check (docs/family-app/07). Usage: node scripts/harness/side-by-side.mjs <harness pictures> <out dir>
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const [, , shots, out] = process.argv;
const board = 'docs/family-app/mockups/2-part1-home-study-adaptive-learning.webp';
const b64 = (p, t) => `data:${t};base64,${readFileSync(p).toString('base64')}`;
// Phone boxes in the board's 1312-wide frame.
const PAIRS = [
  ['study', [243, 63, 445, 622], 'family-study-catalog-en-still-390.png'],
  ['understand', [885, 63, 1087, 622], 'family-understand-en-still-390.png'],
  ['worksheet', [458, 668, 660, 1172], 'family-worksheet-en-still-390.png'],
];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
for (const [name, box, ours] of PAIRS) {
  await page.setContent(`<body style="margin:0;background:#F8FAFC;font:16px sans-serif;display:flex;gap:24px;padding:16px;align-items:flex-start">
    <figure style="margin:0"><figcaption>Mockup (look only)</figcaption><div id="m" style="width:390px;overflow:hidden;position:relative"><img id="mi" src="${b64(board, 'image/webp')}" style="position:absolute"></div></figure>
    <figure style="margin:0"><figcaption>Ours, 390 px</figcaption><img src="${b64(path.join(shots, ours), 'image/png')}" style="width:390px;display:block"></figure></body>`);
  await page.evaluate(
    ([x0, y0, x1, y1]) =>
      new Promise((r) => {
        const i = document.getElementById('mi');
        const go = () => {
          const s = i.naturalWidth / 1312;
          const k = 390 / ((x1 - x0) * s);
          document.getElementById('m').style.height = `${(y1 - y0) * s * k}px`;
          i.style.cssText = `position:absolute;left:${-x0 * s * k}px;top:${-y0 * s * k}px;width:${i.naturalWidth * k}px;max-width:none`;
          r();
        };
        if (i.complete) go();
        else i.onload = go;
      }),
    box
  );
  const png = path.join(out, `side-by-side-${name}.png`);
  await page.screenshot({ path: png, fullPage: true });
  execFileSync('cwebp', ['-q', '80', '-quiet', png, '-o', png.replace(/\.png$/, '.webp')]);
}
await browser.close();
