'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import { FILE_PICK_ACCEPT } from '@/lib/family/photo-shrink';
import { TUTOR_FILES_PER_TURN, TUTOR_TEXT_MAX, type TutorFileType } from '@/lib/family/tutor-shape';
import { useVoiceRecorder, type VoiceAck } from '../voice/useVoiceRecorder';
import { PhotoSheet } from './PhotoSheet';
import { RESET_EVENT, useKeyboardLift } from './keyboard-lift';
import { useBackClose } from '../useBackClose';

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
// 18 Nov 2026 (founder): on Study the composer is the Ask pill: one slim row (the field's "Ask…", the microphone, a chevron, and
// the Conversation button) docked right on the tab bar as one cluster. A tap on the field or the chevron opens it into the full
// composer (attach, Call, Send): the same surface, not a second panel. A tap outside, Send or the chevron shrinks it again.
// The drawer's composer is always open. Focus Reading (useFocusReading) tucks the cluster away while the child reads.

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
  // Drawn just above the composer, at its right (the feed's "Jump to latest"): it moves with the dock, so it never covers
  // the field or the tab dock.
  above?: ReactNode;
};

// 17 Nov 2026 (founder): no Draw button in the Ask bar; drawing lives in the Draw tab and its studio
// (src/components/family/draw/Studio.tsx), which still sends its picture through the tutor window's own path.

const ICON = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const ROUND = 'fam-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full';

export function Composer(p: Props) {
  const { w, id } = p;
  const box = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const menuWrap = useRef<HTMLDivElement>(null);
  const clip = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const dock = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  // C510: the photo sheet open from the menu: for Check my work, or for Ask about this.
  const [sheet, setSheet] = useState<'check' | 'ask' | null>(null);
  const voice = useVoiceRecorder({
    w,
    secondsLeft: p.voice?.secondsLeft,
    onText: (heard, ack) => {
      p.onChange((prev) => (prev.trim() ? `${prev.trim()} ${heard}` : heard).slice(0, TUTOR_TEXT_MAX));
      box.current?.focus();
      p.onHeard?.(heard, ack);
    },
  });

  // The field grows with the question, up to five lines, then scrolls.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [p.value]);

  // While the keyboard is open the field is kept in view: when the keyboard opens under it, and when it is tapped again.
  const kb = useKeyboardLift();
  const keyboard = kb.lift;
  const keepInView = () => {
    if (kb.open && box.current && document.activeElement === box.current) box.current.scrollIntoView({ block: 'nearest' });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(keepInView, [kb.open, kb.lift]);
  // The dock is fixed (below), so the page keeps its room for it with a spacer as tall as the dock is.
  const [dockH, setDockH] = useState(112);
  useEffect(() => {
    const el = dock.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setDockH(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  // The phone's Back closes the attach menu or the photo sheet before it leaves the page.
  useBackClose(menu || sheet !== null, () => {
    setMenu(false);
    setSheet(null);
  });

  const pick = () => {
    setMenu(false);
    fileInput.current?.click();
  };
  const openSheet = (which: 'check' | 'ask') => {
    setMenu(false);
    setSheet(which);
  };
  const full = p.attached.length >= TUTOR_FILES_PER_TURN;
  // The pill only on Study (the dock); the drawer's composer is always the full one. A file, a recording or a notice keeps it open.
  const pill = p.pinned === 'dock';
  // 19 Nov 2026 (founder): the side buttons (attach, microphone, Call, the chevron, Conversation) never step aside while the
  // field has the focus. They used to, and came back the moment it lost the focus: a tap on Send blurred the field first, the
  // row re-laid out under the finger (Send moved about 50 px left), the pill dropped, and the tap landed on the Study tab.
  // A row that never changes shape under a finger is the fix at its root; `keepFocus` below stays as a second guard.
  const open = !pill || expanded || p.attached.length > 0 || voice.state !== 'idle' || !!p.notice || !!p.locked;
  useEffect(() => {
    if (!expanded) return;
    const away = (e: PointerEvent) => {
      if (!dock.current?.contains(e.target as Node)) setExpanded(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [expanded]);
  // 19 Nov 2026 (founder: "after the keyboard closes the bar STAYS up"). Where the phone reports nothing about the keyboard
  // (the Android app before APK 3), Back closes the keys and leaves the focus in the field, so nothing says they closed. A tap
  // or a scroll outside the bar now lets go of the field: the keys close (if they were still up) and the bar returns to the tab
  // bar. A tap on a button there still lands (the drop waits for its click, keyboard-lift.ts PRESS_GRACE_MS).
  useEffect(() => {
    if (!pill || !kb.open) return;
    const letGo = (e: Event) => {
      if (document.activeElement === box.current && !dock.current?.contains(e.target as Node)) box.current?.blur();
    };
    document.addEventListener('pointerdown', letGo, true);
    document.addEventListener('touchmove', letGo, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', letGo, true);
      document.removeEventListener('touchmove', letGo, true);
    };
  }, [pill, kb.open]);
  // A tap on a button here must not take the focus from the field: the keys would close, the dock drop and the page shift under
  // the finger, so the tap would land on the tab bar (Send needed two taps). The click still fires.
  const keepFocus = (e: { target: EventTarget; preventDefault: () => void }) => {
    if (document.activeElement === box.current && (e.target as HTMLElement).closest?.('button, a')) e.preventDefault();
  };
  const send = () => {
    if (!p.canSend) return;
    p.onSend();
    // After a send the pill shrinks so the new answer has the room.
    setExpanded(false);
    box.current?.blur();
    // The keyboard's lift is cleared at once, not after the page has settled.
    window.dispatchEvent(new Event(RESET_EVENT));
  };

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

  // 18 Nov 2026 (third report): the Study dock is FIXED to the layout viewport, never sticky, and the keyboard's measured height
  // (keyboard-lift.ts: the visual viewport, a shrunk page, or a phone's typical keyboard) raises it by exactly that (the
  // stylesheet, html[data-fam-kb]), with the tab bar tucked away, so the field is just above the keys and comes back to the
  // tab bar when they close. The doubt drawer's sheet stays at its own foot and pads by the keyboard as before.
  const fixed = p.pinned === 'dock';
  const lifted = kb.open;
  const dockStyle = { '--fam-keyboard': `${keyboard}px`, ...(!fixed && lifted ? { paddingBottom: 'calc(var(--fam-keyboard) + 0.25rem)' } : {}) } as CSSProperties;

  return (
    <>
    {fixed && <div aria-hidden="true" data-composer-spacer style={{ height: dockH + (lifted ? keyboard : 0) }} />}
    <div
      ref={dock}
      data-tutor-composer
      data-pinned={p.pinned}
      data-open={open || undefined}
      data-lifted={lifted || undefined}
      style={dockStyle}
      onPointerDown={keepFocus}
      onMouseDown={keepFocus}
      className={`fam-composer-dock z-20 px-1 pb-0.5 pt-1.5 ${fixed ? 'fixed inset-x-0 bottom-[var(--fam-dock-h,calc(var(--fam-bottom,0px)+4.5rem))] mx-auto w-full lg:max-w-[68rem]' : 'sticky bottom-0 -mx-1'}`}
    >
      {p.above && <div className="pointer-events-none absolute bottom-full right-2 mb-1 flex justify-end">{p.above}</div>}
      <form
        data-tutor-rail
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {p.notice}
        {line && (
          <p role={line.alert ? 'alert' : 'status'} data-tutor-notice={line.alert ? 'alert' : 'status'} className="fam-acc-in mx-1 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate shadow-sm ring-1 ring-slate/10">
            {voice.state === 'recording' && <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-coral-deep motion-reduce:animate-none" />}
            {line.text}
          </p>
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
            {/* 19 Nov 2026: open, the field takes the whole top line and the buttons sit on the line below it (attach, microphone and
                Call on the left; the chevron and Send on the right), so no button hides and the field is never a thin column. The
                shape changes only when the bar opens, never on Send's tap. */}
            <div data-composer-rows={open || undefined} className={`flex items-end gap-0.5 p-1 ${open ? 'flex-wrap' : ''}`}>
              {open && p.files && (
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
                placeholder={p.call || !open ? w['fam.tutor.askShort'] : w['fam.tutor.title']}
                onChange={(e) => p.onChange(e.target.value)}
                onFocus={() => {
                  if (pill) setExpanded(true);
                  keepInView();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) {
                    e.preventDefault();
                    send();
                  }
                }}
                className={`block min-h-[44px] min-w-0 flex-1 resize-none bg-transparent disabled:cursor-not-allowed py-[0.625rem] text-base leading-6 text-slate placeholder:text-slate/80 focus:outline-none px-3 ${open ? 'order-first basis-full' : 'max-h-11 overflow-hidden'}`}
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
              {open && p.call && !p.locked && (
                <Link href={p.call.href} data-tutor-call-link aria-label={p.call.label} title={p.call.label} className={`${ROUND} text-ink hover:bg-off-white`}>
                  <svg aria-hidden="true" className="h-[22px] w-[22px]" {...ICON}>
                    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
                  </svg>
                </Link>
              )}
              {open && <span aria-hidden="true" className="flex-1" />}
              {pill && (
                <button type="button" data-tutor-pill-toggle aria-expanded={open} aria-label={open ? w['fam.tutor.askClose'] : w['fam.tutor.askOpen']} onClick={() => (open ? (setExpanded(false), box.current?.blur()) : (setExpanded(true), box.current?.focus()))} className={`${ROUND} text-ink hover:bg-off-white`}>
                  <svg aria-hidden="true" className="h-5 w-5" {...ICON} strokeWidth={2.5}>
                    <path d={open ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'} />
                  </svg>
                </button>
              )}
              {open && (
                <button type="submit" disabled={!p.canSend} data-tutor-send aria-label={w['fam.tutor.send']} className={`${ROUND} fam-cta bg-saffron text-ink shadow-md disabled:opacity-50`}>
                  <svg aria-hidden="true" className="h-5 w-5" {...ICON} strokeWidth={2.5}>
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              )}
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
    </div>
    </>
  );
}
