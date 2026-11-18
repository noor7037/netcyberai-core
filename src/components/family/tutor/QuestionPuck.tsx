'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import type { QuestionChip } from '@/lib/family/tutor-feed-view';

// The question puck (founder, 18 Nov 2026; replaces the frozen top strip of chips): a small round control at the middle
// right of the page that shows only while the chat is scrolling. It names the question being read; a tap opens a
// compact list inside the same round shape (the latest three numbers show, the older ones scroll inside), and a tap on
// a number goes to that question. Nothing is pinned at the top.
const IDLE_MS = 1600;
const ROW = 44;

export function QuestionPuck({ w, chips, feed, pageScroll, onGo }: { w: Words; chips: QuestionChip[]; feed: RefObject<HTMLElement | null>; pageScroll: boolean; onGo: (n: number) => void }) {
  const [active, setActive] = useState(false);
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const many = chips.length > 1;

  useEffect(() => {
    const box = feed.current;
    if (!box || !many) return;
    const scroller: Window | HTMLElement = pageScroll ? window : box;
    const onScroll = () => {
      setActive(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setActive(false), IDLE_MS);
      // The question being read: the last card whose top has passed the upper part of the screen.
      const line = (pageScroll ? window.innerHeight : box.getBoundingClientRect().height) * 0.4;
      let at = 0;
      box.querySelectorAll<HTMLElement>('[data-qa]').forEach((el) => {
        if (el.getBoundingClientRect().top <= line) at = Number(el.dataset.qa);
      });
      setCur(at || Number(box.querySelector<HTMLElement>('[data-qa]')?.dataset.qa) || 0);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [feed, pageScroll, many]);

  useEffect(() => {
    if (!open) return;
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!many || (!active && !open)) return null;
  const shown = cur || chips.at(-1)?.n || 0;
  return (
    <div ref={wrap} data-question-puck className="fixed right-2 top-[42%] z-20 flex flex-col items-center rounded-full bg-ink p-1 text-white shadow-lg">
      {open && (
        <nav aria-label={w['fam.tutor.navigator']} data-question-nav>
          <ol ref={list} style={{ maxHeight: ROW * 3 }} className="flex flex-col overflow-y-auto overscroll-contain [scrollbar-width:none]">
            {chips.map((c) => (
              <li key={c.n}>
                <button
                  type="button"
                  data-nav-chip={c.n}
                  onClick={() => {
                    setOpen(false);
                    onGo(c.n);
                  }}
                  aria-label={fill(w['fam.tutor.goToQuestion'], { n: c.n, text: c.text })}
                  aria-current={c.n === shown ? 'true' : undefined}
                  title={c.text}
                  className={`fam-press flex h-11 w-11 items-center justify-center rounded-full text-sm font-extrabold ${c.n === shown ? 'bg-sunshine text-ink' : 'text-white'}`}
                >
                  {c.n}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <button
        type="button"
        data-puck-toggle
        aria-expanded={open}
        aria-label={fill(w['fam.tutor.puck'], { n: shown })}
        onClick={() => setOpen((o) => !o)}
        className={`fam-press flex h-11 w-11 items-center justify-center rounded-full text-sm font-extrabold ${open ? 'text-white' : 'bg-sunshine text-ink'}`}
      >
        {open ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          shown
        )}
      </button>
    </div>
  );
}
