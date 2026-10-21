#!/usr/bin/env node
// The Android shell's launcher icons and splash (M1-8, C254), drawn from our own logo mark
// (public/brand/logo-mark.svg) on the brand's navy, with Playwright's Chromium (already used by the harness). Run once
// after the logo changes: node scripts/android/brand-assets.mjs. Writes into android/app/src/main/res/.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RES = path.join(ROOT, 'android/app/src/main/res');
const NAVY = '#002357';
const svg = readFileSync(path.join(ROOT, 'public/brand/logo-mark.svg'), 'utf8');
const logo = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const page = (w, h, bg, mark, radius = '0') =>
  `<html><body style="margin:0"><div style="width:${w}px;height:${h}px;background:${bg};display:flex;align-items:center;justify-content:center;border-radius:${radius};overflow:hidden">` +
  `<img src="${logo}" style="width:${mark}px;height:${mark}px"></div></body></html>`;

const browser = await chromium.launch();
const tab = await browser.newPage();
async function shot(file, w, h, html, transparent = false) {
  await tab.setViewportSize({ width: w, height: h });
  await tab.setContent(html);
  await tab.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
}
for (const [d, k] of Object.entries(DENSITY)) {
  const icon = Math.round(48 * k);
  await shot(path.join(RES, `mipmap-${d}/ic_launcher.png`), icon, icon, page(icon, icon, NAVY, Math.round(icon * 0.62), '18%'), true);
  await shot(path.join(RES, `mipmap-${d}/ic_launcher_round.png`), icon, icon, page(icon, icon, NAVY, Math.round(icon * 0.6), '50%'), true);
  // Adaptive icon foreground: a 108 dp canvas whose safe zone is the middle 66 dp.
  const fg = Math.round(108 * k);
  await shot(path.join(RES, `mipmap-${d}/ic_launcher_foreground.png`), fg, fg, page(fg, fg, 'transparent', Math.round(fg * 0.5)), true);
}
// Splash: every size the template ships, the mark centred on navy.
for (const dir of readdirSync(RES).filter((x) => x.startsWith('drawable'))) {
  const file = path.join(RES, dir, 'splash.png');
  try {
    statSync(file);
  } catch {
    continue;
  }
  const png = readFileSync(file);
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  await shot(file, w, h, page(w, h, NAVY, Math.round(Math.min(w, h) * 0.32)));
}
await browser.close();
console.log('android: launcher icons and splash written from public/brand/logo-mark.svg');
