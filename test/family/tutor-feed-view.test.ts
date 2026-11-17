import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { boxFarFromEnd, conversationHref, groupConversations, indiaWhen, NAVIGATOR_MAX, newestBelow, qaGroups, questionChips, type TutorConversation } from '@/lib/family/tutor-feed-view';
import { conversationOf, listConversations } from '@/lib/family/tutor-conversations';
import type { FeedTurn } from '@/lib/family/tutor-shape';
import { TUTOR_KEYS } from '@/lib/family/tutor-words';
import { familyWords } from '@/lib/family/words';

vi.mock('next/navigation', () => ({ usePathname: () => '/family/study', useRouter: () => ({ replace: () => undefined, push: () => undefined }) }));

// 17 Nov 2026 (founder): the tutor's feed as bounded question-and-answer cards numbered #1 up, the navigator strip, Jump
// to latest, and the conversation history grouped by subject and chapter. Every name is made up.
const ROOT = path.resolve(__dirname, '../..');
const SRC = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

const child = (id: string, chatId: string, text = `Q ${id}`): FeedTurn => ({ id, role: 'child', lang: 'en', text, chapterKey: null, blockId: null, files: [], at: '2026-11-16T10:00:00.000Z', chatId, subject: 'science' });
const tutor = (id: string, chatId: string): FeedTurn => ({ id, role: 'tutor', lang: 'en', blocks: [], at: '2026-11-16T10:01:00.000Z', chatId, subject: 'science' });

describe('question-and-answer groups', () => {
  it('pairs each question with its answer in its own chat, numbered from #1 for the oldest', () => {
    const g = qaGroups([child('a', 'c1'), tutor('b', 'c1'), child('c', 'c2'), child('d', 'c1'), tutor('e', 'c2'), tutor('f', 'c1')]);
    expect(g.map((x) => [x.n, x.ask?.id, x.answers.map((a) => a.id)])).toEqual([
      [1, 'a', ['b']],
      [2, 'c', ['e']],
      [3, 'd', ['f']],
    ]);
  });
  it('keeps an answer whose question is gone as its own numbered card, and a question with no answer yet', () => {
    const g = qaGroups([tutor('x', 'c1'), child('y', 'c1')]);
    expect(g.map((x) => [x.n, x.ask?.id ?? null, x.answers.length])).toEqual([
      [1, null, 1],
      [2, 'y', 0],
    ]);
    expect(qaGroups([])).toEqual([]);
  });
});

describe('the question navigator', () => {
  it('numbers the questions asked on screen on from the kept ones, the same N as the chips', () => {
    const groups = qaGroups([child('a', 'c1', 'Why is the sky blue?'), tutor('b', 'c1')]);
    expect(questionChips(groups, [{ text: 'And at sunset?' }])).toEqual([
      { n: 1, text: 'Why is the sky blue?' },
      { n: 2, text: 'And at sunset?' },
    ]);
  });
  it('lists the last 30 only', () => {
    const turns = Array.from({ length: 34 }, (_, i) => child(`t${i}`, 'c1'));
    const chips = questionChips(qaGroups(turns), [{ text: 'new' }]);
    expect(chips).toHaveLength(NAVIGATOR_MAX);
    expect(chips[0].n).toBe(6);
    expect(chips.at(-1)).toEqual({ n: 35, text: 'new' });
  });
});

describe('Jump to latest', () => {
  it('shows in a box only while more than the slack is left to scroll', () => {
    expect(boxFarFromEnd(2000, 0, 600)).toBe(true);
    expect(boxFarFromEnd(2000, 1400, 600)).toBe(false);
    expect(boxFarFromEnd(2000, 1350, 600)).toBe(false);
    expect(boxFarFromEnd(2000, 1200, 600)).toBe(true);
  });
  it('shows on the page only while the newest card ends below the composer, never once scrolled past it', () => {
    expect(newestBelow(1500, 600)).toBe(true);
    expect(newestBelow(640, 600)).toBe(false);
    expect(newestBelow(-200, 600)).toBe(false);
  });
  it('scrolls smoothly, instantly under reduced motion, and sits above the composer at 44 px', () => {
    const win = SRC('src/components/family/tutor/TutorWindow.tsx');
    expect(win).toContain("stillMotion() ? 'auto' : 'smooth'");
    expect(win).toMatch(/data-tutor-jump[^>]*className="[^"]*h-11 w-11/);
    expect(SRC('src/components/family/tutor/Composer.tsx')).toMatch(/\{p\.above && <div className="pointer-events-none absolute bottom-full/);
  });
});

describe('the conversation history', () => {
  const c = (chatId: string, subject: string, lastAt: string, chapterKey: string | null = null): TutorConversation => ({ chatId, subject, chapterKey, chapterTitle: chapterKey ? { en: 'Light', hi: 'प्रकाश' } : null, title: `Chat ${chatId}`, questions: 2, lastAt });
  it('groups by subject and chapter, the group with the newest conversation first, the newest first inside', () => {
    const groups = groupConversations([
      c('a', 'science', '2026-11-10T00:00:00.000Z'),
      c('b', 'maths', '2026-11-15T00:00:00.000Z'),
      c('d', 'science', '2026-11-12T00:00:00.000Z', 'u.c10.science.jesc1.ch01'),
      c('e', 'science', '2026-11-14T00:00:00.000Z'),
    ]);
    expect(groups.map((g) => [g.key, g.items.map((i) => i.chatId)])).toEqual([
      ['maths|', ['b']],
      ['science|', ['e', 'a']],
      ['science|u.c10.science.jesc1.ch01', ['d']],
    ]);
  });
  it("opens a chapter's conversation on its book page, a subject's on Study", () => {
    expect(conversationHref({ subject: 'science', chapterKey: null })).toBe('/family/study?subject=science');
    expect(conversationHref({ subject: 'science', chapterKey: 'u.c10.science.jesc1.ch01' })).toBe('/family/study/book/u.c10.science.jesc1.ch01');
  });
  it('dates in India time', () => {
    // 20:00 UTC on the 16th is 01:30 on the 17th in India.
    expect(indiaWhen('2026-11-16T20:00:00.000Z', 'en')).toMatch(/17/);
    expect(indiaWhen('2026-11-16T20:00:00.000Z', 'en', true)).toMatch(/1:30/);
    expect(indiaWhen('not a date', 'en')).toBe('');
  });
  it("names a book chapter from the registry, never a key that is not a book's", () => {
    const row = { conversation_id: 'c1', subject: 'english', title: ' Hands? ', turn_count: 3, last_at: '2026-11-16T10:00:00.000Z' };
    expect(conversationOf({ ...row, chapter_key: 'u.c01.english.aemr1.ch01' })).toMatchObject({ chapterKey: 'u.c01.english.aemr1.ch01', chapterTitle: { en: 'Two Little Hands' }, title: 'Hands?', questions: 3 });
    expect(conversationOf({ ...row, chapter_key: 'cbse.c6.science.ch01' })).toMatchObject({ chapterKey: null, chapterTitle: null });
    expect(conversationOf({ ...row, chapter_key: 'u.c99.none.ch01' })).toMatchObject({ chapterKey: null });
    expect(conversationOf({ ...row, subject: 'astrology', chapter_key: null })).toBeNull();
  });
  it("reads only this child's listed chats, and a missing table reads as none", async () => {
    const seen: { sql: string; params?: unknown[] }[] = [];
    const db = { query: async (sql: string, params?: unknown[]) => (seen.push({ sql, params }), { rows: [] }) };
    expect(await listConversations(db, 'acc', 'kid')).toEqual([]);
    const q = seen.find((s) => s.sql.includes('tutor_conversations'))!;
    expect(q.sql).toMatch(/c\.account_id = \$1 and c\.child_id = \$2 and c\.status in \('open', 'full'\)/);
    expect(q.params?.slice(0, 2)).toEqual(['acc', 'kid']);
    const missing = { query: async (sql: string) => { if (sql.includes('tutor_conversations')) throw Object.assign(new Error('x'), { code: '42P01' }); return { rows: [] }; } };
    expect(await listConversations(missing, 'acc', 'kid')).toEqual([]);
  });
  it('the route answers ?conversations=1 for the child the server chose, before the subject check', () => {
    const route = SRC('src/app/api/family/tutor/route.ts');
    expect(route.indexOf("get('conversations') === '1'")).toBeLessThan(route.indexOf("get('subject')"));
    expect(route).toContain('listConversations(db, g.session.accountId, who.child.childId)');
  });
  it('lists the groups with their dates, marks the one open now, and has an empty state', async () => {
    const { ConversationGroups } = await import('@/components/family/tutor/ConversationList');
    const w = familyWords('en', TUTOR_KEYS);
    const list = [c('a', 'science', '2026-11-16T05:00:00.000Z'), c('d', 'science', '2026-11-15T05:00:00.000Z', 'u.c10.science.jesc1.ch01')];
    const html = renderToStaticMarkup(h(ConversationGroups, { w, lang: 'en', here: '/family/study?subject=science', onHere: () => undefined, list, failed: false }));
    expect(html.match(/data-history-group=/g)?.length).toBe(2);
    expect(html).toContain('Study page');
    expect(html).toContain('Light');
    expect(html).toContain('href="/family/study/book/u.c10.science.jesc1.ch01"');
    expect(html).toMatch(/aria-current="true"[^>]*>|data-history-chat="a"[^>]*aria-current="true"/);
    expect(html).toContain('<time dateTime="2026-11-16T05:00:00.000Z">');
    expect(html).toContain('2 questions');
    const empty = renderToStaticMarkup(h(ConversationGroups, { w, lang: 'en', here: '', onHere: () => undefined, list: [], failed: false }));
    expect(empty).toContain('data-tutor-history-empty');
    expect(empty).toContain(w['fam.tutor.history.empty']);
  });
});

describe('the feed cards and words', () => {
  it('draws each question and answer as one card, the reply opened by its Question #N chip, under a sticky header', () => {
    const win = SRC('src/components/family/tutor/TutorWindow.tsx');
    expect(win).toMatch(/data-qa=\{g\.n\}/);
    expect(win).toMatch(/data-qa=\{n\}/);
    expect(win).toContain("fill(w['fam.tutor.questionN'], { n })");
    expect(win).toMatch(/data-chat-header className=\{`sticky/);
    expect(win).toContain('<QuestionNavigator');
    expect(win).toMatch(/overflow-x-auto/);
  });
  it('has every new word in English and Hindi, and on the phone', async () => {
    const { en } = await import('@/lib/i18n/messages/en');
    const { hi } = await import('@/lib/i18n/messages/hi');
    for (const k of ['fam.tutor.history.title', 'fam.tutor.history.loading', 'fam.tutor.history.empty', 'fam.tutor.history.questions', 'fam.tutor.history.untitled', 'fam.tutor.history.here', 'fam.tutor.history.study', 'fam.tutor.questionN', 'fam.tutor.jumpLatest', 'fam.tutor.navigator', 'fam.tutor.goToQuestion'] as const) {
      expect(en[k], k).toBeTruthy();
      expect(hi[k], k).toMatch(/[ऀ-ॿ]/);
      expect(TUTOR_KEYS).toContain(k);
    }
  });
});
