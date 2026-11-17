'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import { conversationHref, groupConversations, indiaWhen, type ConversationGroup, type TutorConversation } from '@/lib/family/tutor-feed-view';

// The child's conversation history (founder, 17 Nov 2026), opened by Conversation in the composer: every tutor
// conversation of this child, grouped by subject and chapter, newest first, each dated in India time. A tap opens that
// conversation's feed (the subject's Study page, or the book chapter's own page); the one on screen just closes the
// list. A sheet over the page: Escape or Close shuts it and the focus goes back to Conversation. The parent's Learning
// Vault is a different screen (VaultList.tsx) and is not this.

type Props = { w: Words; id: string; lang: string; here: string; onClose: () => void; onHere: () => void };

export function ConversationList({ w, id, lang, here, onClose, onHere }: Props) {
  const [list, setList] = useState<TutorConversation[] | null>(null);
  const [failed, setFailed] = useState(false);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await fetch('/api/family/tutor?conversations=1', { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
      const data = res?.ok ? ((await res.json().catch(() => null)) as { conversations?: TutorConversation[] } | null) : null;
      if (!live) return;
      if (!data || !Array.isArray(data.conversations)) return setFailed(true);
      setList(data.conversations);
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" data-tutor-history-sheet>
      <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 h-full w-full cursor-default bg-slate/60" onClick={onClose} />
      <div id={id} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} className="relative flex max-h-[85vh] w-full max-w-xl flex-col gap-3 overflow-y-auto overscroll-contain rounded-t-[1.5rem] bg-off-white p-4 pb-[calc(var(--fam-bottom,0px)+1rem)] shadow-xl sm:rounded-[1.5rem]">
        <div className="flex items-center justify-between gap-2">
          <h2 id={`${id}-title`} className="text-lg font-extrabold text-slate">
            {w['fam.tutor.history.title']}
          </h2>
          <button ref={close} type="button" onClick={onClose} data-tutor-history-close className="flex min-h-[44px] items-center gap-1 rounded-full bg-white px-4 text-sm font-bold text-slate ring-1 ring-slate/15">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
            {w['fam.tutor.close']}
          </button>
        </div>
        <ConversationGroups w={w} lang={lang} here={here} onHere={onHere} list={list} failed={failed} />
      </div>
    </div>
  );
}

// The list itself (rendered on its own in the tests).
export function ConversationGroups({ w, lang, here, onHere, list, failed }: { w: Words; lang: string; here: string; onHere: () => void; list: TutorConversation[] | null; failed: boolean }) {
  if (failed)
    return (
      <p role="status" className="rounded-2xl bg-white p-4 text-base text-slate">
        {w['fam.err.network']}
      </p>
    );
  if (!list)
    return (
      <p role="status" aria-busy="true" className="rounded-2xl bg-white p-4 text-base text-slate">
        {w['fam.tutor.history.loading']}
      </p>
    );
  const groups = groupConversations(list);
  if (groups.length === 0)
    return (
      <p role="status" data-tutor-history-empty className="rounded-2xl bg-white p-4 text-base text-slate">
        {w['fam.tutor.history.empty']}
      </p>
    );
  return (
    <ul data-tutor-history-list className="flex flex-col gap-4">
      {groups.map((g) => (
        <li key={g.key} data-history-group={g.key} className="flex flex-col gap-2">
          <h3 className="flex flex-wrap items-baseline gap-x-2 px-1 text-sm font-extrabold text-ink">
            <span>{w[`fam.subject.${g.subject}`] ?? g.subject}</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold">{groupPlace(w, g, lang)}</span>
          </h3>
          <ul className="flex flex-col gap-2">
            {g.items.map((c) => {
              const href = conversationHref(c);
              const now = href === here;
              return (
                <li key={c.chatId}>
                  <Link
                    href={href}
                    data-history-chat={c.chatId}
                    aria-current={now ? 'true' : undefined}
                    onClick={(e) => {
                      if (!now) return;
                      e.preventDefault();
                      onHere();
                    }}
                    className={`fam-press flex min-h-[56px] flex-col justify-center gap-0.5 rounded-2xl bg-white px-4 py-2 ${now ? 'ring-2 ring-saffron-deep' : 'ring-1 ring-ink/10'}`}
                  >
                    <span className="line-clamp-2 text-base font-bold text-slate">{c.title ?? w['fam.tutor.history.untitled']}</span>
                    <span className="flex flex-wrap gap-x-2 text-sm text-slate">
                      <time dateTime={c.lastAt}>{indiaWhen(c.lastAt, lang)}</time>
                      <span aria-hidden="true">·</span>
                      <span>{fill(w['fam.tutor.history.questions'], { n: c.questions })}</span>
                      {now && <span className="font-bold text-ink">{w['fam.tutor.history.here']}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

const groupPlace = (w: Words, g: ConversationGroup, lang: string) => (g.chapterTitle ? (lang === 'hi' ? g.chapterTitle.hi || g.chapterTitle.en : g.chapterTitle.en) : w['fam.tutor.history.study']);
