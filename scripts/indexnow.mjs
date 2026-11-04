#!/usr/bin/env node
// IndexNow (C471): tells Bing, Yandex, Seznam, Naver and the other IndexNow engines which public pages changed, so
// they fetch them now instead of on their next crawl (Bing's index also feeds Copilot and ChatGPT search).
//
//   node scripts/indexnow.mjs <before-sha> <after-sha>   the pages whose sitemap date moved between two commits
//   node scripts/indexnow.mjs --all                      every page in the live sitemap (a first submission)
//   node scripts/indexnow.mjs --dry-run ...               print the list, send nothing
//
// The pages come from src/content/page-dates.json (scripts/page_dates.py): a page is sent only when its recorded day
// changed or it is new, so an unchanged page is never resubmitted. The key is public by design: IndexNow checks
// that https://www.netcyberai.com/<key>.txt holds it, which proves the site asked.
import { execFileSync } from 'node:child_process';

const HOST = 'www.netcyberai.com';
const KEY = 'f7024dd6da490150dcafc3ea5d26b65a';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const rest = args.filter((a) => a !== '--dry-run');

const datesAt = (sha) => {
  try {
    return JSON.parse(execFileSync('git', ['show', `${sha}:src/content/page-dates.json`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return {}; // the file did not exist yet at that commit: every page is new
  }
};

async function liveSitemap() {
  const res = await fetch(`https://${HOST}/sitemap.xml`);
  if (!res.ok) throw new Error(`sitemap.xml answered ${res.status}`);
  return [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function changedUrls() {
  if (rest[0] === '--all') return liveSitemap();
  const [before, after] = rest;
  if (!before || !after) {
    console.error('usage: node scripts/indexnow.mjs [--dry-run] <before-sha> <after-sha> | --all');
    process.exit(2);
  }
  const was = datesAt(before);
  const now = datesAt(after);
  return Object.keys(now)
    .filter((route) => was[route] !== now[route])
    .map((route) => `https://${HOST}${route === '/' ? '' : route}`);
}

const urls = await changedUrls();
if (!urls.length) {
  console.log('indexnow: no page changed; nothing to send.');
  process.exit(0);
}
console.log(`indexnow: ${urls.length} page(s):\n  ${urls.join('\n  ')}`);
if (dryRun) process.exit(0);

// One request holds up to 10,000 addresses.
const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls.slice(0, 10000) }),
});
// 200 and 202 are both accepted; anything else is a failure the run shows.
console.log(`indexnow: the endpoint answered ${res.status}`);
if (res.status !== 200 && res.status !== 202) process.exit(1);
