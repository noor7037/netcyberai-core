'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { setAvatarMood } from '@/lib/family/avatar-state';
import type { Words } from '@/lib/family/fill';
import type { Subject } from '@/lib/family/subjects';
import { TutorFace } from '../avatar/TutorFace';
import { TutorWindowLazy } from '../tutor/TutorWindowLazy';
import type { TutorWhere } from '../tutor/TutorWindow';
import { NO_VOICE_EVENT } from '../english/speech';
import { speakLine, stopLine } from '../voice/lineVoice';
import { WordMenu, type Tap } from '../words/WordMenu';
import { readWordSettings } from '../words/settings';
import { aboutLine, cleanSpeak, cleanState, cleanTap, wordAt, type FromReader } from './messages';

// The book chapter page (W22-S2): the chapter reader framed under a slim bar that always shows the tutor's face, and the
// Family voice for the reader. The reader (reader/reader.js) is plain files in a frame; it posts the sentences of what
// is on screen, and this page says them one by one with the Family voice (the phone's own, or the Android app's text to
// speech: the web view there has no speech engine of its own), answering with the sentence and word being said so the
// reader can highlight and scroll. Messages go only between this page and its own frame, origin and window checked both
// ways. The tutor opens over the chapter with the chapter and topic as its context; a lab's question arrives here from
// the reader and is asked in it. Nothing here keeps anything: the reader keeps the place and the progress on the device.

type Props = {
  src: string;
  title: string;
  chapterKey: string;
  subject: Subject;
  back: { href: string; label: string };
  w: Words;
  // The tutor's gates, decided on the server (the same as the chapter page's); null: no tutor here.
  tutor: { voice: { secondsLeft: number } | null; files: boolean; homework: boolean } | null;
  // The child's first name: "Teach me" greets the child by it (founder, 12 Nov 2026). Sent to our own reader only.
  childName?: string;
};

const SRC = { kind: 'chapter' as const, chapterKey: '', blockId: '', sentence: 0 };

export function BookChapter({ src, title, chapterKey, subject, back, w, tutor, childName }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const run = useRef(0);
  const last = useRef(0);
  const [open, setOpen] = useState(false);
  const [where, setWhere] = useState<{ chapter: string; topic: string; topicId: string; lab: string } | null>(null);
  // W23-A: the reader's reading state (for the bar's Play and Pause and percent) and the tap menu for a word tapped in it.
  const [reader, setReader] = useState<{ playing: boolean; percent: number; can: boolean }>({ playing: false, percent: 0, can: false });
  const [tap, setTap] = useState<Tap | null>(null);
  const [ask, setAsk] = useState<{ n: number; text: string } | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const to = useCallback((m: Record<string, unknown>) => {
    frame.current?.contentWindow?.postMessage({ source: 'nca-book', ...m }, window.location.origin);
  }, []);
  const stop = useCallback(() => {
    run.current++;
    stopLine();
    setAvatarMood('idle');
  }, []);

  const play = useCallback(
    async (id: number, sentences: string[], offset: number, lang: 'en' | 'hi') => {
      const mine = ++run.current;
      last.current = id;
      for (let k = 0; k < sentences.length; k++) {
        if (run.current !== mine) return;
        const text = sentences[k];
        to({ type: 'now', id, i: offset + k, word: null });
        const spoken = await speakLine('phone', SRC, {
          text,
          lang,
          rate: 0.95,
          onWord: (c) => {
            if (run.current === mine) to({ type: 'now', id, i: offset + k, word: wordAt(text, c) });
          },
        });
        if (run.current !== mine || spoken.cancelled) return;
      }
      if (run.current === mine) {
        to({ type: 'end', id });
        setAvatarMood('idle');
      }
    },
    [to]
  );

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const m = e.data as FromReader | null;
      if (!m || m.source !== 'nca-reader') return;
      if (m.type === 'ready') to({ type: 'hello', tutor: !!tutor, name: childName ?? '' });
      else if (m.type === 'where') setWhere({ chapter: String(m.chapter ?? '').slice(0, 100), topic: String(m.topic ?? '').slice(0, 100), topicId: String(m.topicId ?? '').slice(0, 40), lab: '' });
      else if (m.type === 'stop') stop();
      else if (m.type === 'state') setReader(cleanState(m));
      else if (m.type === 'tap') {
        const t = cleanTap(m);
        if (!t) return;
        // The frame's own coordinates become this page's.
        const f = frame.current?.getBoundingClientRect();
        void readWordSettings().then((s) => {
          if (!s.tapToRead && !s.wordHelp) return;
          const at = t.at;
          setTap({ text: t.text, context: t.context, lang: t.lang, rect: { ...t.rect, left: t.rect.left + (f?.left ?? 0), top: t.rect.top + (f?.top ?? 0) }, read: at ? () => to({ type: 'readfrom', step: at.step, sent: at.sent }) : undefined });
        });
      }
      else if (m.type === 'speak') {
        const say = cleanSpeak(m);
        if (say) void play(say.id, say.sentences, say.offset, say.lang);
      } else if (m.type === 'ask' && tutor) {
        stop();
        const q = String(m.question ?? '').trim();
        const ctx = String(m.context ?? '').trim();
        // A question typed in the lab is asked at once; a bare tap on the lab's tutor button opens the tutor about that lab.
        setWhere({ chapter: String(m.chapter ?? '').slice(0, 100), topic: q || !ctx ? String(m.topic ?? '').slice(0, 100) : `${String(m.topic ?? '').slice(0, 40)} / ${ctx.slice(0, 60)}`, topicId: String(m.topicId ?? '').slice(0, 40), lab: String(m.lab ?? '').slice(0, 120) });
        if (q.length >= 3) setAsk({ n: Date.now(), text: (ctx ? `${q} [${ctx}]` : q).slice(0, 380) });
        opener.current = document.activeElement as HTMLElement | null;
        setOpen(true);
      }
    };
    window.addEventListener('message', onMessage);
    // A phone with nothing to read aloud: the reader stops and says so instead of racing through the topic.
    const onNoVoice = () => {
      run.current++;
      setAvatarMood('idle');
      to({ type: 'novoice', id: last.current });
    };
    window.addEventListener(NO_VOICE_EVENT, onNoVoice);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener(NO_VOICE_EVENT, onNoVoice);
      run.current++;
      stopLine();
      setAvatarMood('idle');
    };
  }, [play, stop, to, tutor, childName]);

  const show = () => {
    opener.current = document.activeElement as HTMLElement | null;
    // The tutor and the reader do not talk at once.
    stop();
    to({ type: 'stopped', id: last.current });
    // A tap on the tutor's face is about the topic the child is on, not the lab a question came from earlier.
    setWhere((p) => (p && p.lab ? { ...p, lab: '' } : p));
    setOpen(true);
  };
  const hide = useCallback(() => {
    setOpen(false);
    setAvatarMood('idle');
    opener.current?.focus?.();
  }, []);
  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, hide]);

  const about = aboutLine(where?.chapter || title, where?.topic ?? '');
  // W23-C: where the tutor is opened, as ids (the server reads the content itself and checks the child may open it): the
  // topic the reader is on, or the lab the question came from. Nothing the reader says as text is sent.
  const place: TutorWhere = where?.lab ? { kind: 'lab', key: chapterKey, labId: where.lab, ...(where.topicId ? { topicId: where.topicId } : {}) } : where?.topicId ? { kind: 'book_topic', key: chapterKey, topicId: where.topicId } : { kind: 'book_chapter', key: chapterKey };
  const face = <TutorFace size="xl" subject={subject} confetti={false} />;

  return (
    <div data-book-chapter={chapterKey} className="fixed inset-0 z-30 flex flex-col bg-paper">
      <div data-book-bar className="flex min-h-[76px] shrink-0 items-center gap-2 px-3 pb-1 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link href={back.href} className="fam-press flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-emerald pl-3 pr-4 text-sm font-bold text-white">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {back.label}
        </Link>
        <h1 className="hidden min-w-0 flex-1 truncate px-2 text-base font-extrabold text-ink sm:block">{title}</h1>
        <span className="flex-1 sm:hidden" />
        {reader.can && (
          <>
            {(reader.playing || reader.percent > 0) && (
              <span data-book-percent className="shrink-0 text-sm font-bold tabular-nums text-ink">
                {reader.percent}%
              </span>
            )}
            <button
              type="button"
              data-book-toggle
              aria-pressed={reader.playing}
              aria-label={w[reader.playing ? 'fam.tutor.pause' : 'fam.tutor.readAloud']}
              onClick={() => to({ type: 'toggle' })}
              className="fam-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-grape-deep text-white"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                {reader.playing ? (
                  <>
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </>
                ) : (
                  <path d="M7 5v14l12-7z" />
                )}
              </svg>
            </button>
          </>
        )}
        {tutor ? (
          <>
            <button type="button" onClick={show} data-book-ask className="fam-press hidden min-h-[44px] shrink-0 items-center rounded-full sm:flex bg-white px-4 text-sm font-bold text-ink ring-1 ring-ink/15">
              {w['fam.book.ask']}
            </button>
            <button type="button" onClick={show} aria-label={w['fam.book.ask']} data-book-face className="fam-press flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-ink/15">
              {face}
            </button>
          </>
        ) : (
          <span data-book-face className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-ink/15">
            {face}
          </span>
        )}
      </div>
      <iframe ref={frame} title={title} src={src} className="min-h-0 w-full flex-1 border-0 bg-white" allow="fullscreen" />
      {tap && <WordMenu tap={tap} w={w} onClose={() => setTap(null)} />}
      {open && tutor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" data-tutor-drawer>
          <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 h-full w-full cursor-default bg-slate/60" onClick={hide} />
          <div role="dialog" aria-modal="true" aria-label={w['fam.tutor.doubt']} className="relative flex max-h-[92dvh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-t-[1.5rem] bg-off-white p-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] shadow-xl sm:rounded-[1.5rem] sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-ink/15">{face}</span>
                <h2 className="text-lg font-extrabold text-slate">{w['fam.tutor.doubt']}</h2>
              </span>
              <button ref={closeButton} type="button" onClick={hide} data-tutor-close className="flex min-h-[44px] items-center gap-1 rounded-full bg-white px-4 text-sm font-bold text-slate ring-1 ring-slate/15">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
                {w['fam.tutor.close']}
              </button>
            </div>
            <TutorWindowLazy w={w} subject={subject} tone={subject} voice={tutor.voice} files={tutor.files} homework={tutor.homework} idPrefix="fam-book" pinned="sheet" about={about} where={place} ask={ask} />
          </div>
        </div>
      )}
    </div>
  );
}
