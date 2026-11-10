'use client';

import { useEffect, useRef, useState } from 'react';
import type { Words } from '@/lib/family/fill';
import type { SearchHit, SearchKind } from '@/lib/family/search';
import { familyApi } from './client';
import { SaverLink } from './offline/SaverLink';

// The search bar at the top of Study (W22-S1): any subject, chapter or topic, in English or Hindi, across every subject of
// the child's class. The server matches (GET /api/family/search); this draws the box and its results, 250 ms after the
// last key, and ignores an answer that a newer word has replaced. Nothing is kept on the phone.

const KIND_KEY: Record<SearchKind, string> = {
  subject: 'fam.search.kind.subject',
  book_chapter: 'fam.search.kind.chapter',
  chapter: 'fam.search.kind.chapter',
  book_topic: 'fam.search.kind.topic',
  topic: 'fam.search.kind.topic',
};

export function StudySearch({ w }: { w: Words }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState<{ q: string; hits: SearchHit[] | null; failed: boolean }>({ q: '', hits: null, failed: false });
  const latest = useRef('');
  const typed = q.trim();
  useEffect(() => {
    latest.current = typed;
    if (typed.length < 2) return;
    const timer = setTimeout(async () => {
      const res = await familyApi<{ hits: SearchHit[] }>(`/api/family/search?q=${encodeURIComponent(typed)}`, 'GET');
      if (latest.current !== typed) return;
      setState(res.ok ? { q: typed, hits: res.data.hits, failed: false } : { q: typed, hits: null, failed: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [typed]);
  const show = typed.length >= 2 && state.q === typed;
  return (
    <section data-study-search aria-label={w['fam.search.label']} className="flex flex-col gap-2">
      <div className="fam-surface relative flex items-center bg-white">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-3 h-5 w-5 text-slate" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
        <input
          type="text"
          inputMode="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={60}
          enterKeyHint="search"
          autoComplete="off"
          aria-label={w['fam.search.label']}
          placeholder={w['fam.search.placeholder']}
          data-study-search-input
          className="min-h-[48px] w-full min-w-0 rounded-2xl bg-transparent pl-10 pr-12 text-base text-slate placeholder:text-slate/70 focus:outline-none focus:ring-2 focus:ring-ink/30"
        />
        {q && (
          <button type="button" aria-label={w['fam.search.clear']} onClick={() => setQ('')} className="fam-press absolute right-1 flex h-11 w-11 items-center justify-center rounded-xl text-slate">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>
      <div role="status" aria-live="polite">
        {show && state.failed && <p className="fam-surface bg-white p-4 text-sm font-semibold text-slate">{w['fam.search.failed']}</p>}
        {show && state.hits && state.hits.length === 0 && <p data-search-none className="fam-surface bg-white p-4 text-sm font-semibold text-slate">{w['fam.search.none']}</p>}
      </div>
      {show && state.hits && state.hits.length > 0 && (
        <ul data-search-results aria-label={w['fam.search.results']} className="fam-surface flex flex-col bg-white p-1">
          {state.hits.map((h, i) => (
            <li key={`${h.kind}:${h.href}:${i}`}>
              <SaverLink href={h.href} data-search-hit={h.kind} className="flex min-h-[52px] flex-col justify-center rounded-xl px-3 py-1.5 hover:bg-off-white">
                <span className="text-base font-bold text-slate" lang={/[ऀ-ॿ]/.test(h.title) ? 'hi' : 'en'}>
                  {h.title}
                </span>
                <span className="text-xs font-semibold text-slate/80">
                  {w[KIND_KEY[h.kind]]}
                  {h.context ? ` · ${h.context}` : ''}
                </span>
              </SaverLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
