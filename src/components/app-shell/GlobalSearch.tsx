'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, type IconName } from '@/components/visual/Icons';
import { ModuleIcon } from '@/components/app-ui/ModuleIcon';
import { GLOBAL_SEARCH_MIN_CHARS, type GlobalSearchKind, type GlobalSearchResponse, type GlobalSearchResult } from '@/lib/contracts/global-search';
import type { ColorToken } from '@/lib/contracts/modules';
import { explainError } from '@/lib/errors/catalogue';
import { tOr, type Lang, type MessageKey } from '@/lib/i18n';
import { useT } from './LangContext';

// The one search box of the shell (docs/19 rule 6, C135). Type a name, an
// admission number, a parent's phone or a ticket number; results appear as
// you type, grouped by kind. Built as a combobox: the arrow keys move
// through the results, Enter opens one, Escape clears; "/" jumps to the box
// from anywhere on the page. A screen reader hears how many were found.

const LOOK: Record<GlobalSearchKind, [IconName, ColorToken]> = {
  student: ['student', 'sapphire'],
  staff: ['staff', 'royal'],
  ticket: ['ticket', 'gold'],
  school: ['school', 'sapphire'],
  user: ['users', 'azure'],
};
const KIND_ORDER: readonly GlobalSearchKind[] = ['student', 'staff', 'school', 'user', 'ticket'];

// The line under a result's title, in the person's language.
function describe(r: GlobalSearchResult, lang: Lang, t: (k: MessageKey, p?: Record<string, string | number>) => string): string {
  const d = r.detail;
  const parts: (string | null | undefined | false)[] =
    d.kind === 'student'
      ? [d.className && t('search.student.class', { class: d.className }), d.admissionNo && t('search.student.admission', { number: d.admissionNo }), d.guardianPhoneLast4 && t('search.student.phone', { digits: d.guardianPhoneLast4 })]
      : d.kind === 'staff'
        ? [tOr(lang, `role.${d.role}`, d.role), !d.active && t('search.staff.inactive')]
        : d.kind === 'ticket'
          ? [d.ref, t(`search.ticket.status.${d.status}`), d.schoolName]
          : d.kind === 'school'
            ? [d.testFixture && t('search.school.test')]
            : [tOr(lang, `role.${d.role}`, d.role), d.schoolName, d.email];
  return parts.filter(Boolean).join(' · ');
}

type State = { phase: 'idle' } | { phase: 'short' } | { phase: 'loading' } | { phase: 'done'; results: readonly GlobalSearchResult[]; query: string } | { phase: 'failed'; message: string };

export function GlobalSearch({ scope }: { scope: 'school' | 'control' }) {
  const { lang, t, tCount } = useT();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [state, setState] = useState<State>({ phase: 'idle' });
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const listId = useId();
  const endpoint = scope === 'control' ? '/api/control/search' : '/api/app/search';

  // Ask as the person types: a short pause, and an older answer never
  // replaces a newer one.
  useEffect(() => {
    const term = q.trim();
    setAt(-1);
    if (!term) return setState({ phase: 'idle' });
    if (term.length < GLOBAL_SEARCH_MIN_CHARS) return setState({ phase: 'short' });
    const stop = new AbortController();
    setState({ phase: 'loading' });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${endpoint}?q=${encodeURIComponent(term)}`, { signal: stop.signal });
        const body = await res.json().catch(() => null);
        // The person typed on: this answer is no longer wanted, and is not a failure.
        if (stop.signal.aborted) return;
        if (!res.ok) return setState({ phase: 'failed', message: explainError(body, t('search.failed'), lang, res.status) });
        const found = (body as GlobalSearchResponse | null)?.results;
        if (!Array.isArray(found)) return setState({ phase: 'failed', message: t('search.failed') });
        setState({ phase: 'done', results: found, query: term });
      } catch {
        if (!stop.signal.aborted) setState({ phase: 'failed', message: t('search.failed') });
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      stop.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the words follow `lang`
  }, [q, endpoint, lang]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
      if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', away);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', away);
    };
  }, []);

  const results = state.phase === 'done' ? [...state.results].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)) : [];
  const optionId = (i: number) => `${listId}-o${i}`;

  function go(r: GlobalSearchResult) {
    setOpen(false);
    setQ('');
    router.push(r.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      if (q) setQ('');
      else input.current?.blur();
      setOpen(false);
      return;
    }
    if (!results.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setAt((i) => (e.key === 'ArrowDown' ? (i + 1) % results.length : (i <= 0 ? results.length : i) - 1));
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing && results[at >= 0 ? at : 0]) {
      // (Enter that finishes typing a Hindi word in an input method is not a choice.)
      e.preventDefault();
      go(results[at >= 0 ? at : 0]);
    }
  }

  const status =
    state.phase === 'short'
      ? t('search.tooShort')
      : state.phase === 'loading'
        ? t('search.searching')
        : state.phase === 'failed'
          ? state.message
          : state.phase === 'done'
            ? results.length
              ? tCount('search.count', results.length)
              : t(scope === 'control' ? 'search.none.control' : 'search.none', { query: state.query })
            : '';
  const showPanel = open && state.phase !== 'idle';

  return (
    <div
      ref={wrap}
      className="relative w-full min-w-0 md:w-auto md:flex-1"
      role="search"
      onBlur={(e) => {
        // Focus left the box by keyboard: the results do not stay over the page.
        if (!wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label className="sr-only" htmlFor={`${listId}-in`}>
        {t('search.label')}
      </label>
      <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate/70">
        <Icon name="search" className="h-5 w-5" />
      </span>
      <input
        ref={input}
        id={`${listId}-in`}
        type="search"
        role="combobox"
        aria-expanded={showPanel && results.length > 0}
        aria-controls={showPanel && results.length > 0 ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={at >= 0 && results[at] ? optionId(at) : undefined}
        aria-describedby={`${listId}-hint`}
        autoComplete="off"
        enterKeyHint="search"
        value={q}
        placeholder={t(scope === 'control' ? 'search.placeholder.control' : 'search.placeholder.school')}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-11 w-full rounded-md border border-slate/20 bg-white pl-10 pr-3 text-base text-slate placeholder:text-slate/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-royal"
      />
      <span id={`${listId}-hint`} className="sr-only">
        {t(scope === 'control' ? 'search.hint.control' : 'search.hint')}
      </span>
      <span role="status" className="sr-only">
        {status}
      </span>
      {showPanel && (
        <div className="absolute inset-x-0 z-40 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-slate/10 bg-white p-1 shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate">{status}</p>
          ) : (
            <ul id={listId} role="listbox" aria-label={t('search.label')}>
              {results.map((r, i) => {
                const first = i === 0 || results[i - 1].kind !== r.kind;
                const [icon, tone] = LOOK[r.kind];
                const line = describe(r, lang, t);
                return (
                  <li key={`${r.kind}-${r.id}`} role="presentation">
                    {first && (
                      <p aria-hidden="true" className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wider text-slate/70">
                        {t(`search.group.${r.kind}`)}
                      </p>
                    )}
                    <div
                      id={optionId(i)}
                      role="option"
                      aria-selected={i === at}
                      aria-label={[t(`search.group.${r.kind}`), r.title, line].filter(Boolean).join(', ')}
                      onMouseEnter={() => setAt(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go(r)}
                      className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-md px-2 py-1 ${i === at ? 'bg-royal/10' : ''}`}
                    >
                      <ModuleIcon name={icon} tone={tone} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate">{r.title}</span>
                        {line && <span className="block truncate text-xs text-slate/70">{line}</span>}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
