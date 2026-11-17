import { sameInkOnBothSides } from './day-text';
import type { FeedTurn } from './tutor-shape';

// How the tutor window lays out its feed and the child's conversations (founder, 17 Nov 2026). Pure, so the phone and
// the tests share it: one question and its answer make one bounded group, numbered in the feed (the oldest is #1); the
// navigator strip lists the last 30 of those numbers; the history lists every conversation, grouped by subject and
// chapter, newest first, dated in India time.

type ChildTurn = Extract<FeedTurn, { role: 'child' }>;
type AnswerTurn = Extract<FeedTurn, { role: 'tutor' }>;
export type QaGroup = { n: number; key: string; chatId: string; ask: ChildTurn | null; answers: AnswerTurn[] };

// The kept turns as question-and-answer groups, oldest first. An answer joins the newest question of its own chat; an
// answer whose question is no longer kept stands alone (still numbered, so every reply carries its chip).
export function qaGroups(turns: readonly FeedTurn[]): QaGroup[] {
  const out: QaGroup[] = [];
  const newestOf = new Map<string, QaGroup>();
  for (const t of turns) {
    if (t.role === 'child') {
      const g: QaGroup = { n: out.length + 1, key: t.id, chatId: t.chatId, ask: t, answers: [] };
      out.push(g);
      newestOf.set(t.chatId, g);
      continue;
    }
    const g = newestOf.get(t.chatId);
    if (g) g.answers.push(t);
    else {
      const lone: QaGroup = { n: out.length + 1, key: t.id, chatId: t.chatId, ask: null, answers: [t] };
      out.push(lone);
      newestOf.set(t.chatId, lone);
    }
  }
  return out;
}

export const NAVIGATOR_MAX = 30;
export type QuestionChip = { n: number; text: string };

// The navigator's chips: the kept groups then the questions asked on this screen, numbered on from the kept ones; the
// last 30 only.
export function questionChips(groups: readonly QaGroup[], live: readonly { text: string }[]): QuestionChip[] {
  const kept = groups.map((g) => ({ n: g.n, text: g.ask?.text ?? '' }));
  const asked = live.map((a, i) => ({ n: groups.length + i + 1, text: a.text }));
  return [...kept, ...asked].slice(-NAVIGATOR_MAX);
}

// "Jump to latest" shows only while the newest answer is out of sight below. An inner box: more than `slack` px left to
// scroll. The page itself: the newest group's bottom more than `slack` px under the visible bottom (scrolled past it, to
// the chapters below, the newest is above and the arrow stays hidden).
export const JUMP_SLACK = 96;
export const boxFarFromEnd = (scrollHeight: number, scrollTop: number, clientHeight: number, slack = JUMP_SLACK): boolean => scrollHeight - scrollTop - clientHeight > slack;
export const newestBelow = (newestBottom: number, visibleBottom: number, slack = JUMP_SLACK): boolean => newestBottom - visibleBottom > slack;

// ---- the conversation history ------------------------------------------------------------------------------------

export type ChapterTitle = { en: string; hi: string };
export type TutorConversation = { chatId: string; subject: string; chapterKey: string | null; chapterTitle: ChapterTitle | null; title: string | null; questions: number; lastAt: string };
export type ConversationGroup = { key: string; subject: string; chapterKey: string | null; chapterTitle: ChapterTitle | null; lastAt: string; items: TutorConversation[] };

const newestFirst = (a: { lastAt: string }, b: { lastAt: string }) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0);

// Grouped by subject and chapter (a subject's own Study chats are one group, each book chapter its own), the group with
// the newest conversation first, and inside a group the newest first.
export function groupConversations(list: readonly TutorConversation[]): ConversationGroup[] {
  const groups = new Map<string, ConversationGroup>();
  for (const c of [...list].sort(newestFirst)) {
    const key = `${c.subject}|${c.chapterKey ?? ''}`;
    const g = groups.get(key) ?? { key, subject: c.subject, chapterKey: c.chapterKey, chapterTitle: c.chapterTitle, lastAt: c.lastAt, items: [] };
    g.items.push(c);
    groups.set(key, g);
  }
  return [...groups.values()];
}

// Where a conversation opens: its book chapter's page (the chapter's own feed), else the subject's Study feed.
export function conversationHref(c: Pick<TutorConversation, 'subject' | 'chapterKey'>): string {
  return c.chapterKey ? `/family/study/book/${encodeURIComponent(c.chapterKey)}` : `/family/study?subject=${encodeURIComponent(c.subject)}`;
}

// A day (and, for a turn, its time) in India time, in the child's language.
export function indiaWhen(iso: string, lang: string, time = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return sameInkOnBothSides(new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(time ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(d));
}
