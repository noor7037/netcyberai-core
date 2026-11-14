'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import { FILE_PICK_ACCEPT } from '@/lib/family/photo-shrink';
import { TUTOR_FILES_PER_TURN, TUTOR_TEXT_MAX, type TutorFileType } from '@/lib/family/tutor-shape';
import { useVoiceRecorder, type VoiceAck } from '../voice/useVoiceRecorder';
import { PhotoSheet } from './PhotoSheet';
import { useKeyboardInset } from './useKeyboardInset';

// The tutor's composer (W6-A, C395): one rounded field for every question a child types, on Study and in the chapter
// reader's doubt drawer. Inside the field: Attach on the left (only when the photo gate lets photos through: the page
// decides with photoGate, the server checks again), the microphone (only with the parent's voice consent and the
// module on; the day's seconds still cap it) and Send on the right. Beside it, Conversation opens the earlier
// questions. No helper paragraphs: a limit (a file too big, the day's speaking time used up) is one short line, shown
// only when it is hit. With homework on, the photo action in the Attach menu offers two things: "Ask about this" (a photo
// of a question, hints first; the homework helper) and "Check my work" (W16-B2: a photo of the child's own answer,
// marked step by step). C510: each of those two opens the photo sheet (Take a photo, the camera; Choose from gallery),
// since a child photographs the notebook; "Ask about this" attaches the photo to this question. The textarea grows with the question; Enter sends on a keyboard with a mouse, and makes a new
// line on a phone. Pinned above the tab dock on Study, at the drawer's foot in the reader.

export type ComposerFile = { key: string; name: string; mime: TutorFileType; state: 'sending' | 'checking' | 'ready'; id: string | null };

type Props = {
  w: Words;
  id: string;
  value: string;
  onChange: (next: string | ((prev: string) => string)) => void;
  onSend: () => void;
  canSend: boolean;
  // W19-B: the words the microphone heard, and the tutor's sealed acknowledgement of them, for a window that wants to
  // react at once (speak the ack, or send the question without waiting for a tap). The words still fill the box.
  onHeard?: (text: string, ack?: VoiceAck) => void;
  // `dock`: sticky above the Family tab dock (Study); `sheet`: sticky at the foot of the doubt drawer.
  pinned: 'dock' | 'sheet';
  files: boolean;
  homework: boolean;
  attached: ComposerFile[];
  onAttach: (file: File) => void;
  // W16-B2: "Check my work" in the attach menu: a photo of the child's own working, marked step by step. `checking`: the
  // attached photo is going to be checked, not asked about.
  onCheck: (file: File) => void;
  checking: boolean;
  onRemove: (file: ComposerFile) => void;
  // W18-P3: Draw: the drawing studio's picture (and the child's optional question) goes to the tutor through the file
  // door. Resolves with the words of an error, or null once sent. Absent: no Draw button.
  onSketch?: (file: File, question: string) => Promise<string | null>;
  fileError: string | null;
  voice: { secondsLeft: number } | null;
  // W16-B5: "Call <tutor>": the same composer, a second way in. Opens the call on this subject, keeping the chat.
  call?: { href: string; label: string } | null;
  historyOpen: boolean;
  historyFor: string;
  onHistory: () => void;
  // W9-A (C406): the chat is full; nothing can be typed, attached or said until a new chat is started.
  locked?: boolean;
  // Shown above the field, inside the pinned composer (the full chat's message and its action).
  notice?: ReactNode;
};

// W18-P3: the sketch pad is loaded only when a child opens it, so the Study bundle does not carry it.
// C513: the studio lives with the Draw tab (src/components/family/draw/Studio.tsx), still its own chunk.
const SketchPad = dynamic(() => import('../draw/Studio').then((m) => m.Studio), { ssr: false });

const ICON = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const ROUND = 'fam-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full';

export function Composer(p: Props) {
  const { w, id } = p;
  const box = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const menuWrap = useRef<HTMLDivElement>(null);
  const clip = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  // C510: the photo sheet open from the menu: for Check my work, or for Ask about this.
  const [sheet, setSheet] = useState<'check' | 'ask' | null>(null);
  const [sketching, setSketching] = useState(false);
  const drawButton = useRef<HTMLButtonElement>(null);
  // Stable, so the studio's own effects (focus, Escape) do not run again each time the composer draws.
  const closeSketch = useCallback(() => {
    setSketching(false);
    requestAnimationFrame(() => drawButton.current?.focus());
  }, []);
  const voice = useVoiceRecorder({
    w,
    secondsLeft: p.voice?.secondsLeft,
    onText: (heard, ack) => {
      p.onChange((prev) => (prev.trim() ? `${prev.trim()} ${heard}` : heard).slice(0, TUTOR_TEXT_MAX));
      box.current?.focus();
      p.onHeard?.(heard, ack);
    },
  });

  // The field grows with the question, up to about six lines, then scrolls.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 152)}px`;
  }, [p.value]);

  // While the keyboard is open the field is kept in view: when the keyboard opens under it, and when it is tapped again.
  const keyboard = useKeyboardInset();
  const keepInView = () => {
    if (keyboard > 0 && box.current && document.activeElement === box.current) box.current.scrollIntoView({ block: 'nearest' });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(keepInView, [keyboard]);

  // The attach menu closes on Escape (focus back on the clip) and on a tap outside it.
  useEffect(() => {
    if (!menu && !sheet) return;
    const away = (e: PointerEvent) => {
      if (!menuWrap.current?.contains(e.target as Node)) {
        setMenu(false);
        setSheet(null);
      }
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [menu, sheet]);

  const pick = () => {
    setMenu(false);
    fileInput.current?.click();
  };
  const openSheet = (which: 'check' | 'ask') => {
    setMenu(false);
    setSheet(which);
  };
  const full = p.attached.length >= TUTOR_FILES_PER_TURN;

  // One short line at a time, only when something needs saying.
  const line =
    voice.state === 'recording'
      ? { alert: false, text: fill(w['fam.voice.recording'], { s: voice.elapsed, max: voice.max }) }
      : voice.state === 'sending'
        ? { alert: false, text: w['fam.voice.sending'] }
        : voice.error
          ? { alert: true, text: voice.error }
          : p.fileError
            ? { alert: true, text: p.fileError }
            : null;

  // W11-A (C416): where the page keeps its height under the keyboard (the Android app, iOS), the dock rises with it: it
  // sits at the foot of the page and its bottom padding is the keyboard's height, so the field is just above the keys
  // and, scrolled to the end, the last message is still above the dock. The tab bar is under the keyboard then, so its
  // room is not added.
  const lifted = keyboard > 0;
  const dockStyle = { '--fam-keyboard': `${keyboard}px`, ...(lifted ? { paddingBottom: 'calc(var(--fam-keyboard) + 0.25rem)' } : {}) } as CSSProperties;

  return (
    <div
      data-tutor-composer
      style={dockStyle}
      className={`fam-composer-dock sticky z-20 -mx-2 px-2 pb-1 pt-4 ${lifted ? 'bottom-0' : p.pinned === 'dock' ? 'bottom-[calc(var(--fam-bottom,0px)+5.25rem)]' : 'bottom-0'}`}
    >
      <form
        data-tutor-rail
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          p.onSend();
        }}
      >
        {p.notice}
        {line && (
          <p role={line.alert ? 'alert' : 'status'} data-tutor-notice={line.alert ? 'alert' : 'status'} className="fam-acc-in mx-1 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate shadow-sm ring-1 ring-slate/10">
            {voice.state === 'recording' && <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-coral-deep motion-reduce:animate-none" />}
            {line.text}
          </p>
        )}
        {p.files && p.onSketch && !p.locked && p.attached.length === 0 && (
          <div className="mx-1 flex">
            <button
              ref={drawButton}
              type="button"
              data-sketch-open
              aria-haspopup="dialog"
              onClick={() => setSketching(true)}
              className="fam-press flex min-h-[44px] items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-ink shadow-sm ring-1 ring-ink/15"
            >
              <svg aria-hidden="true" className="h-5 w-5" {...ICON}>
                <path d="M4 20l1-4L16 5l3 3L8 19z" />
              </svg>
              {w['fam.sketch.open']}
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="fam-composer flex min-w-0 flex-1 flex-col rounded-2xl bg-white">
            {p.attached.length > 0 && (
              <ul data-tutor-files className="flex flex-wrap gap-1.5 px-2 pt-2">
                {p.attached.map((a) => (
                  <li key={a.key} data-tutor-file={a.state} data-tutor-check={p.checking || undefined} className="flex min-h-[44px] max-w-full items-center gap-1 rounded-xl bg-off-white pl-3 text-sm text-slate">
                    <span className="font-bold">{p.checking ? w['fam.check.menu'] : a.mime === 'application/pdf' ? w['fam.tutor.filePdf'] : w['fam.tutor.filePhoto']}</span>
                    <span className="min-w-0 max-w-[9rem] truncate">{a.state === 'sending' ? w['fam.tutor.fileSending'] : a.state === 'checking' ? w['fam.tutor.fileChecking'] : a.name}</span>
                    <button type="button" onClick={() => p.onRemove(a)} aria-label={w['fam.tutor.removeFile']} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate hover:bg-white">
                      <svg aria-hidden="true" className="h-4 w-4" {...ICON} strokeWidth={2.5}>
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-end gap-0.5 p-1">
              {p.files && (
                <div ref={menuWrap} className="relative shrink-0" onKeyDown={(e) => {
                  if (e.key === 'Escape' && (menu || sheet)) {
                    e.stopPropagation();
                    setMenu(false);
                    setSheet(null);
                    clip.current?.focus();
                  }
                }}>
                  <input
                    ref={fileInput}
                    type="file"
                    accept={FILE_PICK_ACCEPT}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) p.onAttach(f);
                    }}
                  />
                  <button
                    ref={clip}
                    type="button"
                    data-tutor-attach
                    aria-label={p.homework ? w['fam.tutor.attachMenu'] : w['fam.tutor.attach']}
                    aria-expanded={p.homework ? menu : undefined}
                    aria-controls={p.homework ? `${id}-attach-menu` : undefined}
                    disabled={p.locked || (!p.homework && full)}
                    onClick={() => {
                      if (!p.homework) return pick();
                      setSheet(null);
                      setMenu((m) => !m);
                    }}
                    className={`${ROUND} text-ink hover:bg-off-white disabled:opacity-50`}
                  >
                    <svg aria-hidden="true" className="h-[22px] w-[22px]" {...ICON}>
                      <path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.5 3.5 0 0 1 5 5l-8.6 8.6a2 2 0 0 1-2.8-2.8l7.9-7.9" />
                    </svg>
                  </button>
                  {menu && (
                    <div id={`${id}-attach-menu`} data-tutor-attach-menu className="fam-acc-in absolute bottom-full left-0 z-30 mb-3 flex w-[17rem] max-w-[calc(100vw-3rem)] flex-col gap-1 rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-slate/10">
                      <button type="button" onClick={pick} disabled={full} data-tutor-pick className="flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-left text-base font-bold text-slate hover:bg-off-white disabled:opacity-50">
                        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-saffron/10 text-ink">
                          <svg className="h-5 w-5" {...ICON}>
                            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                            <path d="M14 3v5h5M9 14h6M9 17h4" />
                          </svg>
                        </span>
                        {w['fam.tutor.attach']}
                      </button>
                      <button type="button" onClick={() => openSheet('check')} disabled={p.attached.length > 0} data-tutor-check-pick aria-haspopup="dialog" className="flex min-h-[48px] items-center gap-3 rounded-xl px-3 py-1.5 text-left hover:bg-off-white disabled:opacity-50">
                        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald/15 text-ink">
                          <svg className="h-5 w-5" {...ICON}>
                            <path d="M4 5h16v14H4z" />
                            <path d="M8 12l3 3 5-6" />
                          </svg>
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="text-base font-bold text-slate">{w['fam.check.menu']}</span>
                          <span className="text-xs text-slate">{w['fam.check.menuLead']}</span>
                        </span>
                      </button>
                      <button type="button" data-homework-link data-tutor-ask-pick aria-haspopup="dialog" onClick={() => openSheet('ask')} disabled={full || p.checking} className="flex min-h-[48px] items-center gap-3 rounded-xl px-3 py-1.5 text-left hover:bg-off-white disabled:opacity-50">
                        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sunshine/30 text-gold-deep">
                          <svg className="h-5 w-5" {...ICON}>
                            <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
                            <circle cx="12" cy="13" r="3.5" />
                          </svg>
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="text-base font-bold text-slate">{w['fam.homework.studyLink']}</span>
                          <span className="text-xs text-slate">{w['fam.photo.askLead']}</span>
                        </span>
                      </button>
                    </div>
                  )}
                  {sheet && (
                    <PhotoSheet
                      w={w}
                      id={`${id}-photo-sheet`}
                      title={sheet === 'check' ? w['fam.check.menu'] : w['fam.homework.studyLink']}
                      lead={sheet === 'check' ? w['fam.check.menuLead'] : w['fam.photo.askLead']}
                      onClose={() => {
                        setSheet(null);
                        clip.current?.focus();
                      }}
                      onPick={(f) => {
                        const which = sheet;
                        setSheet(null);
                        if (which === 'check') p.onCheck(f);
                        else p.onAttach(f);
                      }}
                    />
                  )}
                </div>
              )}
              <label htmlFor={id} className="sr-only">
                {w['fam.tutor.question']}
              </label>
              <textarea
                ref={box}
                id={id}
                rows={1}
                disabled={p.locked}
                maxLength={TUTOR_TEXT_MAX}
                value={p.value}
                placeholder={p.call ? w['fam.tutor.askShort'] : w['fam.tutor.title']}
                onChange={(e) => p.onChange(e.target.value)}
                onFocus={keepInView}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) {
                    e.preventDefault();
                    p.onSend();
                  }
                }}
                className={`block min-h-[44px] min-w-0 flex-1 resize-none bg-transparent disabled:cursor-not-allowed py-[0.625rem] text-base leading-6 text-slate placeholder:text-slate/80 focus:outline-none ${p.files ? 'px-1' : 'px-3'}`}
              />
              {p.voice && (
                <button
                  type="button"
                  data-voice-input
                  data-voice-state={voice.state}
                  onClick={() => (voice.state === 'recording' ? voice.stop() : void voice.start())}
                  disabled={p.locked || voice.state === 'sending'}
                  aria-busy={voice.state === 'sending' || undefined}
                  aria-label={voice.state === 'recording' ? w['fam.voice.stop'] : w['fam.voice.speak']}
                  className={`${ROUND} disabled:opacity-60 ${voice.state === 'recording' ? 'bg-coral-deep text-white shadow-md' : 'text-ink hover:bg-off-white'}`}
                >
                  {voice.state === 'recording' ? (
                    <span aria-hidden="true" className="h-3.5 w-3.5 rounded-sm bg-white" />
                  ) : (
                    <svg aria-hidden="true" className={`h-[22px] w-[22px] ${voice.state === 'sending' ? 'animate-pulse motion-reduce:animate-none' : ''}`} {...ICON}>
                      <rect x="9" y="3" width="6" height="11" rx="3" />
                      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                    </svg>
                  )}
                </button>
              )}
              {p.call && !p.locked && (
                <Link href={p.call.href} data-tutor-call-link aria-label={p.call.label} title={p.call.label} className={`${ROUND} text-ink hover:bg-off-white`}>
                  <svg aria-hidden="true" className="h-[22px] w-[22px]" {...ICON}>
                    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
                  </svg>
                </Link>
              )}
              <button type="submit" disabled={!p.canSend} data-tutor-send aria-label={w['fam.tutor.send']} className={`${ROUND} fam-cta bg-saffron text-ink shadow-md disabled:opacity-50`}>
                <svg aria-hidden="true" className="h-5 w-5" {...ICON} strokeWidth={2.5}>
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </div>
          </div>
          <button
            type="button"
            data-tutor-history
            aria-label={w['fam.tutor.tabConversation']}
            aria-expanded={p.historyOpen}
            aria-controls={p.historyFor}
            onClick={p.onHistory}
            className={`fam-surface fam-press flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl ${p.historyOpen ? 'bg-ink text-white' : 'bg-white text-ink'}`}
          >
            <svg aria-hidden="true" className="h-6 w-6" {...ICON}>
              <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
              <path d="M12 8v4l2.5 1.5" />
            </svg>
          </button>
        </div>
      </form>
      {sketching && p.onSketch && (
        <SketchPad
          w={w}
          onSend={p.onSketch}
          question={p.value}
          onClose={closeSketch}
        />
      )}
    </div>
  );
}
