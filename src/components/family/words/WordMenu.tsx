'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Words } from '@/lib/family/fill';
import { LANGS, type LangCode } from './languages';
import { sayWord } from './sayWord';
import { readWordSettings, WORD_DEFAULTS, type WordSettings } from './settings';
import { fetchWordHelp, saveLang, savedLang, type WordHelp, type WordHelpError } from './wordHelp';

// The one tap menu (W23-A): a small popover under the tapped word, a bottom sheet on a narrow phone. Read from here (when
// the surface reads aloud), Say it, Meaning, Translate (with a language picker that remembers the choice). Every surface
// a child reads uses this one component: the tutor's answers, the chapter reader (through its frame) and the older chapter
// reader. The switches (tap to read, word help) come from the child's settings; a missing one is on.

export type Tap = {
  text: string;
  context: string;
  rect: { left: number; top: number; width: number; height: number };
  // The language of the text itself ('hi' text is spoken in Hindi).
  lang: 'en' | 'hi';
  // Starts the surface's reading at the tapped sentence; absent when the surface does not read aloud.
  read?: () => void;
};

type Look = { status: 'idle' } | { status: 'loading' } | { status: 'done'; help: WordHelp } | { status: 'error'; error: WordHelpError };

const WIDE = 640;
const POP = { w: 320, h: 300 };

export function WordMenu({ tap, w, onClose }: { tap: Tap; w: Words; onClose: () => void }) {
  const [settings, setSettings] = useState<WordSettings>(WORD_DEFAULTS);
  const [ready, setReady] = useState(false);
  const [section, setSection] = useState<'meaning' | 'translate' | null>(null);
  const [lang, setLang] = useState<LangCode>(() => savedLang() ?? (tap.lang === 'hi' ? 'hi' : 'en'));
  const [look, setLook] = useState<Look>({ status: 'idle' });
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    void readWordSettings().then((s) => {
      if (!live) return;
      setSettings(s);
      // The child's own meaning language, unless they have picked one in the menu before.
      if (s.meaningLang && !savedLang()) setLang(s.meaningLang);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    first.current?.focus();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  // A look-up starts when a section opens or the language changes.
  useEffect(() => {
    if (!section) return;
    const ctl = new AbortController();
    setLook({ status: 'loading' });
    void fetchWordHelp(tap.text, tap.context, lang, ctl.signal).then((r) => {
      if (!ctl.signal.aborted) setLook(r.ok ? { status: 'done', help: r.help } : { status: 'error', error: r.error });
    });
    return () => ctl.abort();
  }, [section, lang, tap.text, tap.context]);

  if (typeof document === 'undefined') return null;
  const wide = typeof window !== 'undefined' && window.innerWidth >= WIDE;
  const style = wide
    ? (() => {
        const left = Math.min(Math.max(8, tap.rect.left), Math.max(8, window.innerWidth - POP.w - 8));
        const below = tap.rect.top + tap.rect.height + 8;
        const top = below + POP.h > window.innerHeight ? Math.max(8, tap.rect.top - POP.h - 8) : below;
        return { left, top, width: POP.w };
      })()
    : undefined;
  const canRead = !!tap.read && settings.tapToRead;
  const help = ready && settings.wordHelp;
  const open = (s: 'meaning' | 'translate') => setSection((c) => (c === s ? null : s));
  const btn = 'fam-press flex min-h-[44px] items-center justify-center gap-2 rounded-full px-4 text-sm font-bold';

  const answer = (field: 'meaning' | 'translation') => {
    if (look.status === 'loading') return <p className="text-sm text-slate/80">{w['fam.word.loading']}</p>;
    if (look.status === 'error') return <p className="text-sm text-slate/80">{w[`fam.word.err.${look.error === 'bad_request' ? 'failed' : look.error}`]}</p>;
    if (look.status === 'done') {
      const text = look.help[field];
      return text ? (
        <p data-word-answer={field} lang={field === 'translation' ? lang : undefined} className="text-base font-semibold text-ink">
          {text}
        </p>
      ) : (
        <p className="text-sm text-slate/80">{w['fam.word.none']}</p>
      );
    }
    return null;
  };

  return createPortal(
    <div className="fixed inset-0 z-[70]" data-word-menu-root>
      <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 h-full w-full cursor-default bg-transparent" onClick={onClose} />
      <div
        role="dialog"
        aria-label={w['fam.word.menu']}
        data-word-menu
        style={style}
        className={`absolute flex flex-col gap-2 bg-off-white p-3 shadow-xl ring-1 ring-ink/15 ${wide ? 'rounded-2xl' : 'inset-x-0 bottom-0 max-h-[70dvh] overflow-y-auto rounded-t-[1.5rem] p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]'}`}
      >
        <div className="flex items-center justify-between gap-2">
          <p lang={tap.lang} data-word-text className="min-w-0 flex-1 truncate text-lg font-extrabold text-ink">
            {tap.text}
          </p>
          <button type="button" onClick={onClose} aria-label={w['fam.word.close']} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-slate/15">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRead && (
            <button
              ref={first}
              type="button"
              data-word-read
              onClick={() => {
                tap.read?.();
                onClose();
              }}
              className={`${btn} bg-grape-deep text-white`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M7 5v14l12-7z" />
              </svg>
              {w['fam.word.readFrom']}
            </button>
          )}
          <button ref={canRead ? undefined : first} type="button" data-word-say onClick={() => void sayWord(tap.text, tap.lang)} className={`${btn} bg-saffron text-ink`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 9v6h4l5 4V5L8 9H4z" />
              <path d="M16 9a3 3 0 0 1 0 6" />
            </svg>
            {w['fam.word.say']}
          </button>
          {help && (
            <>
              <button type="button" data-word-meaning aria-pressed={section === 'meaning'} onClick={() => open('meaning')} className={`${btn} bg-white text-ink ring-1 ring-ink/15 aria-pressed:bg-ink aria-pressed:text-white`}>
                {w['fam.word.meaning']}
              </button>
              <button type="button" data-word-translate aria-pressed={section === 'translate'} onClick={() => open('translate')} className={`${btn} bg-white text-ink ring-1 ring-ink/15 aria-pressed:bg-ink aria-pressed:text-white`}>
                {w['fam.word.translate']}
              </button>
              {/* The language for the meaning and the translation, its own control beside them (founder, 10 Nov): changing it
                  asks again in the new language when an answer is open. */}
              <select
                  data-word-lang
                  value={lang}
                  onChange={(e) => {
                    const l = e.target.value as LangCode;
                    setLang(l);
                    saveLang(l);
                  }}
                  aria-label={w['fam.word.into']}
                  className="min-h-[44px] rounded-full bg-white px-3 text-sm font-bold text-ink ring-1 ring-ink/15"
                >
                  {LANGS.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
            </>
          )}
        </div>
        {help && section && (
          <div className="flex flex-col gap-2 rounded-2xl bg-white p-3 ring-1 ring-ink/10" aria-live="polite">
            {answer(section === 'translate' ? 'translation' : 'meaning')}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
