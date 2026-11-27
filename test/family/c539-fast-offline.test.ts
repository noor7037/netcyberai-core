import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FRESH, QuestionBody, answered } from '@/components/family/blocks/QuizView';
import { AUTO_BUDGET_BYTES, AUTO_MAX, AUTO_RENEW_MS, autoSaveWhen, chapterKeyOf, chaptersToSave, storageRoom, triedToday } from '@/lib/family/auto-pack';
import { NAV_PENDING_MAX_MS, startsNavigation } from '@/lib/family/nav-pending';
import { OFFLINE_KEYS } from '@/lib/family/offline-words';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';
import type { PublicItem } from '@/lib/family/items';
import { familyWords } from '@/lib/family/words';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// C539: the Family app on the founder's phone: taps that show at once, screens that open on a weak network, and today's
// plan saved for offline by itself.
const ROOT = path.join(__dirname, '../..');
const SRC = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const APP = 'src/app/(family)/family/(app)';

describe('a tap shows at once', () => {
  const here = 'https://www.example.org/family/study?subject=science';
  const tap = { button: 0 };
  it('a plain tap on a link to another Family screen starts the bar', () => {
    expect(startsNavigation({ href: '/family' }, tap, here)).toBe(true);
    expect(startsNavigation({ href: '/family/study?subject=maths' }, tap, here)).toBe(true);
    expect(startsNavigation({ href: 'https://www.example.org/family/draw', target: '_self' }, tap, here)).toBe(true);
  });
  it('not for the same screen, a #part, another site or app, a new tab, a download, or a tap with a key held', () => {
    expect(startsNavigation({ href: '/family/study?subject=science' }, tap, here)).toBe(false);
    expect(startsNavigation({ href: '#top' }, tap, here)).toBe(false);
    expect(startsNavigation({ href: 'https://www.youtube-nocookie.com/family' }, tap, here)).toBe(false);
    expect(startsNavigation({ href: '/app/my-day' }, tap, here)).toBe(false);
    expect(startsNavigation({ href: '/family/draw', target: '_blank' }, tap, here)).toBe(false);
    expect(startsNavigation({ href: '/family/results/1.pdf', download: true }, tap, here)).toBe(false);
    expect(startsNavigation({ href: '/family/draw' }, { button: 0, ctrlKey: true }, here)).toBe(false);
    expect(startsNavigation({ href: '/family/draw' }, { button: 1 }, here)).toBe(false);
    expect(startsNavigation({ href: null }, tap, here)).toBe(false);
  });
  it('the bar is on every signed-in screen, says nothing to a screen reader, and stops by itself', () => {
    expect(NAV_PENDING_MAX_MS).toBeGreaterThan(5000);
    expect(SRC(`${APP}/layout.tsx`)).toMatch(/<FamilyNavStatus offlineText=\{t\(lang, 'fam\.offline\.net'\)\} \/>/);
    const bar = SRC('src/components/family/FamilyNavStatus.tsx');
    expect(bar).toContain('aria-hidden="true" data-fam-nav-pending');
    expect(bar).toContain("document.addEventListener('click', onTap, true)");
    const css = SRC('src/app/(family)/family/family.css');
    expect(css).toMatch(/\.fam-nav-bar \{[^}]*pointer-events: none;/);
    expect(css).toMatch(/\[data-fam-motion='off'\] \.fam-nav-bar \{\s*animation: none;/);
  });
  it('the tapped tab lights up before its screen is there; aria-current stays on the open screen', async () => {
    const tabs = SRC('src/components/family/FamilyTabs.tsx');
    expect(tabs).toContain("data-pending={pending === t ? '' : undefined} onClick={() => !open && setPending(t)}");
    expect(tabs).toContain('useEffect(() => setPending(null), [path]);');
    const { FamilyTabs } = await import('@/components/family/FamilyTabs');
    const html = renderToStaticMarkup(h(FamilyTabs, { tabs: ['home', 'study'], navLabel: 'Main menu', labels: { home: 'Home', study: 'Study', english: 'English', tech: 'Tech Lab', draw: 'Draw', future: 'Future' } }));
    expect(html.match(/class="fam-press fam-tab"/g)?.length).toBe(2);
    expect(html).not.toContain('data-pending');
    expect(SRC('src/app/(family)/family/family.css')).toMatch(/\.fam-tab\[aria-current='page'\],\s*\.fam-tab\[data-pending\] \{/);
  });
  it('with movement off a tap still shows (a dimming), where it used to show nothing', () => {
    const css = SRC('src/app/(family)/family/family.css');
    expect(css).toMatch(/\[data-fam-motion='off'\] \.fam-press:active,\s*\[data-fam-motion='off'\] \.fam-lift:active \{\s*opacity: 0\.8;/);
    expect(css).toMatch(/\.fam-press:active,\s*\.fam-lift:active \{\s*opacity: 0\.8;/);
  });
  it('a screen under Study, Understand, English, Future, the parent area and results has its own skeleton', () => {
    for (const d of ['study', 'understand', 'english', 'future', 'parent', 'results']) {
      const f = `${APP}/${d}/loading.tsx`;
      expect(existsSync(path.join(ROOT, f)), f).toBe(true);
      expect(SRC(f), f).toContain("export { default } from '../loading';");
    }
  });
  it('the router keeps a screen 30 s and a skeleton 5 minutes, pinned', () => {
    expect(SRC('next.config.js')).toContain('staleTimes: { dynamic: 30, static: 300 }');
  });
});

describe('an answer tapped shows at once', () => {
  const w = familyWords('en', UNDERSTAND_KEYS);
  const pub = { token: 'tok', question: 'Which of these is a fruit?', options: ['a brick', 'a mango', 'a spoon'] } as PublicItem;
  const body = (s: typeof FRESH) => renderToStaticMarkup(h(QuestionBody, { item: pub, s, w, tone: 'science', onPick: () => {}, onHint: () => {}, onRetry: () => {} }));
  it('the option tapped is marked while it is checked', () => {
    const html = body({ ...FRESH, picked: 1, busy: true });
    expect(html.match(/data-checking=""/g)?.length).toBe(1);
    expect(html).toMatch(/aria-busy="true" data-checking=""[^>]*ring-2 ring-ink/);
  });
  it('after a wrong answer, the next tap is not drawn in the last answer’s red while it is checked', () => {
    const wrong = answered(FRESH, 2, { correct: false, explanation: 'Not a fruit.' });
    const html = body({ ...wrong, picked: 1, busy: true });
    expect(html).not.toContain('ring-coral-deep bg-coral/10');
    expect(html).toContain('data-checking=""');
  });
  it('a worksheet answer made with no connection goes to the phone’s queue, like Understand’s', () => {
    expect(SRC('src/components/family/WorksheetScreen.tsx')).toContain('onOffline={offline ? queueAnswer : undefined}');
    const page = SRC(`${APP}/study/worksheet/[topic]/page.tsx`);
    expect(page).toContain("offline: await familyModuleOn(db, 'offline', page.session.accountId)");
    expect(page).toContain("'fam.offline.pack.answerSaved'");
    expect(SRC('src/components/family/offline/OfflineSync.tsx')).toContain("document.addEventListener('visibilitychange', send)");
  });
});

describe("today's plan saved for offline by itself", () => {
  const NOW = Date.parse('2026-11-22T10:00:00Z');
  it('on Wi-Fi at once; where the phone does not say, once idle; never on mobile data, 2G, the data-saver or offline', () => {
    expect(autoSaveWhen({ online: true, type: 'wifi' }, false)).toBe('now');
    expect(autoSaveWhen({ online: true, type: 'ethernet' }, false)).toBe('now');
    expect(autoSaveWhen({ online: true }, false)).toBe('idle');
    expect(autoSaveWhen({ online: true, type: 'unknown' }, false)).toBe('idle');
    expect(autoSaveWhen({ online: true, type: 'cellular' }, false)).toBe('never');
    expect(autoSaveWhen({ online: true, type: 'wifi', effectiveType: '2g' }, false)).toBe('never');
    expect(autoSaveWhen({ online: true, type: 'wifi', saveData: true }, false)).toBe('never');
    expect(autoSaveWhen({ online: true, type: 'wifi' }, true)).toBe('never');
    expect(autoSaveWhen({ online: false, type: 'wifi' }, false)).toBe('never');
  });
  it('a topic’s chapter is its key without ".t<n>"', () => {
    expect(chapterKeyOf('cbse.c6.mathematics.ch01.t01')).toBe('cbse.c6.mathematics.ch01');
    expect(chapterKeyOf('cbse.c6.science.ch01')).toBe('cbse.c6.science.ch01');
  });
  it('the plan’s chapters, still-to-do first, once each, not saved or tried, at most a few a day', () => {
    const items = [
      { topicKey: 'b.ch02.t01', done: true },
      { topicKey: 'a.ch01.t01', done: false },
      { topicKey: 'a.ch01.t02', done: false },
      { topicKey: 'c.ch03', done: false },
      { topicKey: 'd.ch04.t03', done: false },
      { topicKey: 'e.ch05.t01', done: false },
    ];
    expect(chaptersToSave(items, [], 0, [], NOW)).toEqual(['a.ch01', 'c.ch03', 'd.ch04'].slice(0, AUTO_MAX));
    const saved = [{ chapterKey: 'a.ch01', expiresAt: new Date(NOW + 10 * 86400000).toISOString() }];
    expect(chaptersToSave(items, saved, 0, ['c.ch03'], NOW)).toEqual(['d.ch04', 'e.ch05', 'b.ch02'].slice(0, AUTO_MAX));
    // A saved pack about to end is fetched again.
    const ending = [{ chapterKey: 'a.ch01', expiresAt: new Date(NOW + AUTO_RENEW_MS - 1000).toISOString() }];
    expect(chaptersToSave(items, ending, 0, [], NOW)[0]).toBe('a.ch01');
    // The phone's packs at the budget: nothing more.
    expect(chaptersToSave(items, [], AUTO_BUDGET_BYTES, [], NOW)).toEqual([]);
  });
  it('the day’s note counts only for this child and this day', () => {
    const note = JSON.stringify({ day: '2026-11-22', child: 'c1', tried: ['a.ch01', 7] });
    expect(triedToday(note, '2026-11-22', 'c1')).toEqual(['a.ch01']);
    expect(triedToday(note, '2026-11-23', 'c1')).toEqual([]);
    expect(triedToday(note, '2026-11-22', 'c2')).toEqual([]);
    expect(triedToday('{broken', '2026-11-22', 'c1')).toEqual([]);
    expect(triedToday(null, '2026-11-22', 'c1')).toEqual([]);
  });
  it('only while the browser’s storage has room', () => {
    expect(storageRoom(50, 100)).toBe(true);
    expect(storageRoom(85, 100)).toBe(false);
    expect(storageRoom(undefined, undefined)).toBe(true);
  });
  it('the home screen does it with the offline module on, through the one pack download', () => {
    const home = SRC(`${APP}/page.tsx`);
    expect(home).toContain("offlineOn: await familyModuleOn(db, 'offline', page.session.accountId)");
    expect(home).toMatch(/\{plan && offlineOn && plan\.items\.length > 0 && <PlanAutoSave childId=\{child\.childId\}/);
    const auto = SRC('src/components/family/offline/PlanAutoSave.tsx');
    expect(auto).toContain('await downloadPack(childId, key)');
    expect(SRC('src/components/family/offline/PackButton.tsx')).toContain('await downloadPack(childId, chapterKey)');
    expect(SRC('src/components/family/offline/store.ts')).toMatch(/export async function downloadPack[\s\S]{0,400}\/api\/family\/pack\?chapter=[\s\S]{0,200}keepShell\(true\)/);
  });
  it('the offline shelf names the practice saved with each topic and how chapters get there, in English and Hindi', () => {
    for (const k of ['fam.offline.pack.questions', 'fam.offline.pack.autoLead', 'fam.offline.net'] as const) {
      expect(en[k], k).toBeTruthy();
      expect(hi[k], k).toBeTruthy();
      expect(hi[k], k).not.toBe(en[k]);
    }
    expect(en['fam.offline.pack.questions']).toContain('{n}');
    expect(hi['fam.offline.pack.questions']).toContain('{n}');
    expect(OFFLINE_KEYS).toEqual(expect.arrayContaining(['fam.offline.pack.questions', 'fam.offline.pack.autoLead']));
    const shelf = SRC('src/components/family/offline/OfflineShelf.tsx');
    expect(shelf).toContain("fill(w['fam.offline.pack.questions'], { n: topic.check.length + topic.practice.length })");
    expect(shelf).toContain("{w['fam.offline.pack.autoLead']}");
  });
});
