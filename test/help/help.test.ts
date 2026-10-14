import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HelpArticleView } from '@/components/help/HelpArticleView';
import { HelpIndex } from '@/components/help/HelpIndex';
import { helpHrefs } from '@/components/help/help-routes';
import { HELP_ARTICLES, HELP_CATEGORIES, HELP_TEXT, HINDI_REVIEWED, helpArticle, type L } from '@/content/help/articles';
import { normalise, searchHelp } from '@/content/help/search';

// The Help Center (C129): the guides' rules, that they still match the
// real screens, search in three ways of writing, and what the pages show.

const DEVANAGARI = /[ऀ-ॿ]/;
const texts = (a: (typeof HELP_ARTICLES)[number]): L[] => [a.title, a.summary, ...a.steps, ...(a.tips ?? []), ...(a.start ? [a.start.label] : [])];

describe('the guides', () => {
  it('cover every live flow the brief lists, one task each', () => {
    expect(HELP_ARTICLES.map((a) => a.slug)).toEqual([
      'sign-in', 'forgot-password', 'set-up-authenticator', 'send-staff-reset-code',
      'add-a-student', 'import-students-csv', 'link-siblings', 'student-id-cards',
      'mark-attendance', 'use-my-day', 'student-page', 'taught-today', 'timetable', 'daily-pulse-message', 'needs-help-queue', 'set-homework', 'homework-recovery', 'teacher-copilot', 'fee-structures', 'raise-fee-dues', 'take-fee-payment', 'compliance-screen', 'fees-overdue-late-fee', 'verify-upi-payment', 'upload-bank-statement', 'follow-up-unpaid-fees', 'see-a-guardian', 'message-states', 'send-a-notice', 'plan-a-ptm', 'invite-to-an-event', 'handle-a-complaint', 'what-to-do-at-home', 'answer-a-parent', 'whatsapp-settings', 'make-a-certificate', 'raise-a-ticket', 'register-your-school',
      // --- P5 (docs/26): one block a slice. A slice's lines go between its own two marker lines, nowhere else. ---
      // p5-8a begin
      // p5-8a end
      // p5-8b begin
      'staff-leave',
      // p5-8b end
      // p5-8c begin
      'cover-a-class',
      // p5-8c end
      // p5-8d begin
      'read-the-dashboard',
      // p5-8d end
      // p5-8e begin
      // p5-8e end
      // p5-8f begin
      // p5-8f end
      // p5-8g begin
      // p5-8g end
      // p5-8h begin
      'run-a-report',
      // p5-8h end
      // p5-8i begin
      'school-check-up',
      // p5-8i end
      // p5-8j begin
      'early-warning-flags',
      // p5-8j end
      // c210-rls begin
      // c210-rls end
      // c210-leave begin
      // c210-leave end
      // c210-jobs begin
      // c210-jobs end
      // c210-ui begin
      // c210-ui end
      // p6-9a begin
      'set-up-grading-scheme',
      // p6-9a end
      // p6-9b begin
      'enter-exam-marks',
      // p6-9b end
      // p6-9c begin
      // p6-9c end
      // p6-9d begin
      // p6-9d end
      // p6-9e begin
      // p6-9e end
      // p6-9f begin
      // p6-9f end
      // c212-pricing begin
      // c212-pricing end
    ]);
    expect(new Set(HELP_ARTICLES.map((a) => a.slug)).size).toBe(HELP_ARTICLES.length);
    expect(HELP_ARTICLES.every((a) => /^[a-z][a-z0-9-]+$/.test(a.slug) && a.slug !== 'ticket')).toBe(true); // /app/help/ticket is Raise Ticket
  });

  it('have 3 to 7 steps, both languages everywhere, and related guides that exist', () => {
    for (const a of HELP_ARTICLES) {
      expect(a.steps.length, a.slug).toBeGreaterThanOrEqual(3);
      expect(a.steps.length, a.slug).toBeLessThanOrEqual(7);
      for (const t of texts(a)) {
        expect(t.en.trim().length, `${a.slug} en`).toBeGreaterThan(2);
        expect(t.hi.trim().length, `${a.slug} hi`).toBeGreaterThan(2);
      }
      // Real Hindi, not English copied across: every step and the title are in Devanagari.
      for (const t of [a.title, a.summary, ...a.steps]) expect(DEVANAGARI.test(t.hi), `${a.slug}: ${t.hi}`).toBe(true);
      expect(a.related.length, a.slug).toBeGreaterThanOrEqual(2);
      for (const r of a.related) expect(helpArticle(r), `${a.slug} → ${r}`).not.toBeNull();
      expect(a.related).not.toContain(a.slug);
      expect(HELP_CATEGORIES.some((c) => c.id === a.category)).toBe(true);
    }
    for (const c of HELP_CATEGORIES) expect(HELP_ARTICLES.some((a) => a.category === c.id), c.id).toBe(true);
  });

  it('quote button and field names that exist on the real screens, and keep them in the Hindi text', () => {
    const read = (dir: string): string =>
      readdirSync(dir)
        .map((f) => path.join(dir, f))
        .map((p) => (statSync(p).isDirectory() ? (p.includes('content/help') || p.includes('components/help') ? '' : read(p)) : /\.(tsx?|json)$/.test(p) && !/\.test\./.test(p) ? readFileSync(p, 'utf8') : ''))
        .join('\n');
    // Apostrophes are written &apos; or ’ in JSX; compare without them.
    const flat = (s: string) => s.replace(/&apos;|&#39;|['’]/g, '').replace(/&amp;/g, '&');
    const source = flat(read(path.resolve(__dirname, '../../src')));
    const missing: string[] = [];
    for (const a of HELP_ARTICLES) {
      for (const t of [...a.steps, ...(a.tips ?? [])]) {
        for (const m of t.en.matchAll(/“([^”]+)”/g)) {
          const label = m[1];
          if (!source.includes(flat(label))) missing.push(`${a.slug}: “${label}”`);
          // The Hindi sentence names the same button, in the screen's own words.
          expect(t.hi, `${a.slug}: Hindi step should quote “${label}”`).toContain(`“${label}”`);
        }
      }
      if (a.start) expect(a.start.href).toMatch(/^\/(app|login|register-school|free-tools)/);
    }
    expect(missing).toEqual([]);
  });

  it('link only to pages that exist', () => {
    const exists = (href: string) => {
      const p = href.replace(/^\//, '');
      const roots = [`src/app/${p}/page.tsx`, `src/app/(school)/${p}/page.tsx`];
      return roots.some((r) => {
        try {
          return statSync(path.resolve(__dirname, '../..', r)).isFile();
        } catch {
          return false;
        }
      });
    };
    for (const a of HELP_ARTICLES) if (a.start) expect(exists(a.start.href), `${a.slug} → ${a.start.href}`).toBe(true);
    expect(exists('/app/help/ticket/new')).toBe(true);
  });
});

describe('search', () => {
  const slugs = (q: string) => searchHelp(q).map((a) => a.slug);

  it('finds a guide in English, Hindi and Hinglish, best match first', () => {
    expect(slugs('attendance')[0]).toBe('mark-attendance');
    expect(slugs('haziri')[0]).toBe('mark-attendance');
    expect(slugs('हाज़िरी')[0]).toBe('mark-attendance');
    expect(slugs('हाजिरी')[0]).toBe('mark-attendance'); // typed without the nukta
    expect(slugs('forgot password')[0]).toBe('forgot-password');
    expect(slugs('PASSWORD')).toContain('send-staff-reset-code');
    expect(slugs('csv')[0]).toBe('import-students-csv');
    expect(slugs('excel upload')[0]).toBe('import-students-csv');
    expect(slugs('bhai behen')[0]).toBe('link-siblings');
    expect(slugs('tc')).toContain('make-a-certificate');
    expect(slugs('लॉगिन')[0]).toBe('sign-in');
  });

  it('needs every word to match, treats punctuation as spaces, and gives everything for an empty search', () => {
    expect(slugs('attendance zebra')).toEqual([]);
    expect(slugs('xyzzy')).toEqual([]);
    expect(slugs('  ')).toEqual(HELP_ARTICLES.map((a) => a.slug));
    expect(slugs('id-card, qr!')[0]).toBe('student-id-cards');
    expect(normalise('  Forgot   PASSWORD?? ')).toBe('forgot password');
    expect(searchHelp('<script>alert(1)</script>')).toEqual([]);
  });
});

describe('the pages', () => {
  it('the front page lists every guide by topic, with search and the way to a ticket', () => {
    const html = renderToStaticMarkup(h(HelpIndex, { lang: 'en', mode: 'app' }));
    for (const a of HELP_ARTICLES) {
      expect(html).toContain(`href="/app/help/${a.slug}"`);
      expect(html).toContain(a.title.en.replace(/’/g, '’'));
    }
    for (const c of HELP_CATEGORIES) expect(html).toContain(c.label.en);
    expect(html).toContain('role="search"');
    expect(html).toContain('Still stuck?');
    expect(html).toContain('href="/app/help/ticket/new"');
    expect(html).toContain('href="/app/help?lang=hi"');
    expect(html).not.toContain(HELP_TEXT.unreviewed.hi); // only on Hindi screens
  });

  it('Hindi is marked as not reviewed on every Hindi screen, keeps the language in its links, and is tagged lang="hi"', () => {
    expect(HINDI_REVIEWED).toBe(false);
    const index = renderToStaticMarkup(h(HelpIndex, { lang: 'hi', mode: 'app' }));
    const article = renderToStaticMarkup(h(HelpArticleView, { article: helpArticle('mark-attendance')!, lang: 'hi', mode: 'app' }));
    for (const html of [index, article]) {
      expect(html).toContain(HELP_TEXT.unreviewed.hi);
      expect(html).toContain(HELP_TEXT.unreviewed.en);
      expect(html).toContain('lang="hi"');
    }
    expect(index).toContain('href="/app/help/mark-attendance?lang=hi"');
    expect(index).toContain('सहायता');
    expect(article).toContain('कक्षा की उपस्थिति दर्ज करें');
    expect(article).toContain('href="/app/help/student-id-cards?lang=hi"');
    expect(article).toContain('href="/app/help/mark-attendance"'); // switch back to English
  });

  it('a guide shows its numbered steps, tips, where to start, related guides and the ticket link', () => {
    const a = helpArticle('send-staff-reset-code')!;
    const html = renderToStaticMarkup(h(HelpArticleView, { article: a, lang: 'en', mode: 'app' }));
    expect(html).toContain(a.title.en);
    expect((html.match(/<li class="flex gap-3/g) ?? []).length).toBe(a.steps.length);
    expect(html).toContain('For the principal and school admin');
    expect(html).toContain('href="/app/staff"');
    expect(html).toContain('Good to know');
    for (const r of a.related) expect(html).toContain(`href="/app/help/${r}"`);
    expect(html).toContain('href="/app/help/ticket/new"');
    expect(html).toContain('href="/app/help"');
  });

  it('the preview uses its own links', () => {
    const p = helpHrefs('preview');
    expect(p.article('sign-in', 'hi')).toBe('/design-system/shell/help?article=sign-in&lang=hi');
    expect(p.index('en')).toBe('/design-system/shell/help');
    expect(helpHrefs('app').index('hi')).toBe('/app/help?lang=hi');
  });
});
