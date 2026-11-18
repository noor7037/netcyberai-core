'use client';

import dynamic from 'next/dynamic';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { unfilled, type Block, type Explanation } from '@/lib/family/blocks';
import { fill, type Words } from '@/lib/family/fill';
import { isSubject, type Subject } from '@/lib/family/subjects';
import { attachPlan, preparePhoto } from '@/lib/family/photo-shrink';
import { TUTOR_FILE_MAX_BYTES, TUTOR_FILES_PER_TURN, TUTOR_TEXT_MAX, TUTOR_TEXT_MIN, sniffTutorFile, type FeedTurn, type TutorFile } from '@/lib/family/tutor-shape';
import { boxFarFromEnd, indiaWhen, newestBelow, qaGroups, questionChips } from '@/lib/family/tutor-feed-view';
import { QuestionPuck } from './QuestionPuck';
import { useFocusReading } from './useFocusReading';
import { CitationChip } from '../blocks/CitationChip';
import { citationOf } from '@/lib/family/citation';
import { AnswerBlock, DirectAnswerCard, UnderstandView, type TutorAsk, type UnderstandInput } from '../UnderstandView';
import { Composer, type ComposerFile } from './Composer';
import { StickyTutorFace, TutorFace } from '../avatar/TutorFace';
import { setAvatarMood } from '@/lib/family/avatar-state';

import { spokenSentences } from '@/lib/family/call';
import { typedCheckIntentLight } from '@/lib/family/check-intent';
import { readChildSettings } from '@/lib/family/child-settings';
import { speakLine, unlockVoice } from '../voice/lineVoice';
// The speaker and Teach me load with the first answer drawn, off the Study page's first load (the family budget, W18).
import type { Reading } from '../voice/AnswerSpeaker';
import { WordTapLayer } from '../words/WordTapLayer';
import { sendErrorKey, sendWithRetry, type UploadAnswer } from '@/lib/family/draw-send';
const AnswerSpeaker = dynamic(() => import('../voice/AnswerSpeaker').then((m) => m.AnswerSpeaker));
const TeachMe = dynamic(() => import('../voice/AnswerSpeaker').then((m) => m.TeachMe));

// The shared tutor window (S2, C375; docs/37 §4 Wave 2): one window for every question a child types, on the Study page
// and in the chapter reader's doubt drawer. W6-A (C395): one composer (Composer.tsx) pinned at the foot. Study passes
// its chapters as `children`, between the feed and the composer, so the composer stays pinned while the chapters
// scroll. W10-4 (C413; docs/39 §5 "Chat, final rule"): above them, the subject's feed, like the chat products: every
// question and answer of the subject in order, newest at the bottom, scrolled to the newest on opening, then each new
// question and its answer drawn as it streams (through Understand: the same consent, module switch, safety check and
// daily cap). The list of chats is the history sheet (Conversation, below); the server keeps the subject's last 30 child turns and a question continues the
// subject's newest open chat. When the server decides a question belongs to another subject, the feed says so ("Moved
// to Science") and, on Study (`follow`), the subject tab follows it.
// 17 Nov 2026 (founder): one question and its answer are one bounded card, the answer opened by its "Question #N" chip
// (N counts the feed, the oldest #1), each turn with its time; a sticky header names the subject and, in a chapter, the
// place; under it the navigator strip of the last 30 questions (tap one to jump to it); a "Jump to latest" arrow while
// the newest answer is out of sight below; and Conversation in the composer lists every conversation of this child.
// A file goes straight to the private store (the server gives a link for it, then reads and checks what arrived); it is
// shown only through the app's own address, which answers with a link that works for one minute.

// The shape only (type import: no server code reaches the phone).
export type TutorWhere = { kind: 'book_topic' | 'book_chapter' | 'lab' | 'study_subject' | 'topic'; key: string; topicId?: string; labId?: string };
const chapterScope = (w: TutorWhere | null): string | null => (w && (w.kind === 'book_topic' || w.kind === 'book_chapter' || w.kind === 'lab') ? w.key : null);
export type TutorReaderContext = { chapterKey: string; blockId: string; section: string };
type Props = {
  w: Words;
  subject: Subject;
  tone: string;
  voice?: { secondsLeft: number } | null;
  // The parent's photo consent: without it there is no Attach button (the server refuses too).
  files?: boolean;
  homework?: boolean;
  reader?: TutorReaderContext | null;
  idPrefix?: string;
  // Where the composer is pinned: above the tab dock (Study) or at the foot of the doubt drawer.
  pinned?: 'dock' | 'sheet';
  // Study: the subject tab follows a question the server kept in another subject.
  follow?: boolean;
  // W24 (founder): the Study page scrolls as one page: the answers and then the chapters below them, with no inner box
  // of its own. Off (the chapter's tutor sheet), the feed keeps its own scrolling box.
  pageScroll?: boolean;
  // W16-A3: the tutor chosen in the Tutor Hall; every question carries its key, and the window says who is answering.
  tutor?: { key: string; name: string } | null;
  // W16-B5: the call affordance in the composer (Study, while the call is switched on and the child may speak).
  call?: { href: string; label: string } | null;
  // W17-B2: the server voice is set up, so a tutor answer's speaker button uses it (else the phone's own voice).
  serverVoice?: boolean;
  // W22-S2: the book page's context (the chapter and topic the child is on, a short line): shown as the chip and put in front of
  // every question sent; and `ask`: a question made elsewhere on the page (a lab's tutor drawer), asked once per `n`.
  about?: string | null;
  // W23-C: where the window was opened, sent with every question; the server checks it against what this child may open
  // and reads the content itself (src/lib/family/tutor-context.ts). In a book chapter (book_topic, book_chapter, lab:
  // `key` is the chapter) the feed is that chapter's own: a fresh conversation, never another chapter's or subject's.
  // Absent on Study: the window says it is the subject's own Study page.
  where?: TutorWhere | null;
  ask?: { n: number; text: string } | null;
  // C513: a drawing from the Draw tab's studio, sent through this window's own path once per `n`; `done` hears the
  // words of an error, or null once it was asked.
  sketchFirst?: { n: number; file: File; question: string; done: (error: string | null) => void } | null;
  children?: ReactNode;
};

type Attached = ComposerFile;
// A question asked on this screen, drawn live below the feed read from the server. `moved`: the subject the server kept
// it in, when not the tab's; `chatId`: the chat it was kept in.
export type FeedAsk = { n: number; subject: Subject; text: string; input: UnderstandInput; moved: Subject | null; chatId: string | null; at?: string };

const postJson = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) }).catch(() => null);
const errorOf = async (res: Response | null) => (res ? String(((await res.json().catch(() => ({}))) as { error?: unknown }).error ?? 'network') : 'network');
const stillMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function sendToStore(url: string, file: File, contentType: string): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = xhr.onabort = xhr.ontimeout = () => resolve(false);
    xhr.send(file);
  });
}

// The file door's three steps (ask for a link, send the file to it, confirm): shared by Attach and the sketch pad, so both
// meet the same checks on the server. `step` lets Attach show where it is. Resolves with the attachment's id, or the code
// of what refused.
// C513: a refusal after the ticket was given carries the attachment's id, so the sketch pad can take it back.
async function uploadTutorFile(subject: string, file: File, mime: string, step?: { ticket?: (id: string) => void; stored?: () => void }): Promise<UploadAnswer> {
  const askRes = await postJson('/api/family/tutor/files', { subject, mime, size: file.size, name: file.name });
  if (!askRes?.ok) return { code: await errorOf(askRes) };
  const ticket = (await askRes.json().catch(() => null)) as { attachmentId?: string; uploadUrl?: string; contentType?: string } | null;
  if (!ticket?.attachmentId || !ticket.uploadUrl) return { code: 'network' };
  step?.ticket?.(ticket.attachmentId);
  if (!(await sendToStore(ticket.uploadUrl, file, ticket.contentType ?? mime))) return { code: 'storage_unavailable', id: ticket.attachmentId };
  step?.stored?.();
  const confirmed = await postJson(`/api/family/tutor/files/${encodeURIComponent(ticket.attachmentId)}`, {});
  if (!confirmed?.ok) return { code: await errorOf(confirmed), id: ticket.attachmentId };
  return { id: ticket.attachmentId };
}

// Takes an unsent attachment back (C513); true when it is gone, a 404 included.
async function removeTutorFile(id: string): Promise<boolean> {
  return fetch(`/api/family/tutor/files/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => r.ok || r.status === 404, () => false);
}

// The feed read from the server, less the turn a carried question already draws live (the question the tab followed:
// its turn was kept before the new subject's feed was read).
export function withoutCarried(turns: FeedTurn[], carried: Pick<FeedAsk, 'text' | 'chatId'> | null): FeedTurn[] {
  if (!carried) return turns;
  let i = -1;
  turns.forEach((t, k) => {
    if (t.role === 'child' && t.text === carried.text && (!carried.chatId || t.chatId === carried.chatId)) i = k;
  });
  if (i < 0) return turns;
  const answer = turns[i + 1]?.role === 'tutor' ? i + 1 : -1;
  return turns.filter((_, k) => k !== i && k !== answer);
}

// C508: the kept questions with no answer yet: a child turn whose next turn in its chat is not the tutor's (an answer
// that failed on our side). Each shows "No answer yet" and Try again.
export function unansweredIds(turns: FeedTurn[]): Set<string> {
  const out = new Set<string>();
  turns.forEach((t, k) => {
    if (t.role !== 'child') return;
    const next = turns.slice(k + 1).find((x) => x.chatId === t.chatId);
    if (!next || next.role !== 'tutor') out.add(t.id);
  });
  return out;
}

// What a kept answer does to the asks on screen: the chat it was kept in, and the subject it moved to when that is not
// the tab's (the feed's "Moved to Science" line).
export function answered(asks: FeedAsk[], n: number, chat: { chatId: string; subject: Subject }): FeedAsk[] {
  return asks.map((a) => (a.n === n ? { ...a, chatId: chat.chatId, moved: chat.subject !== a.subject ? chat.subject : null } : a));
}

// A question the tab followed to its subject: kept on screen while the new subject's feed is read. Held outside the
// window, so it is there whether the page keeps the window or draws it anew for the new subject.
const carry: { ask: FeedAsk | null } = { ask: null };

// Where Study goes when the tab follows a moved question (null: it stays): the moved question's subject.
export function followHref(ask: FeedAsk | undefined, follow: boolean, tutorKey: string | null = null): string | null {
  return follow && ask?.moved ? `/family/study?subject=${encodeURIComponent(ask.moved)}${tutorKey ? `&tutor=${encodeURIComponent(tutorKey)}` : ''}` : null;
}

export function TutorWindow({ w, subject, tone, voice = null, files = false, homework = false, reader = null, idPrefix = 'fam-tutor', pinned = 'dock', follow = false, pageScroll = false, tutor: chosen = null, call = null, serverVoice = false, about = null, where: placed = null, ask = null, sketchFirst = null, children }: Props) {
  const router = useRouter();
  // The conversation history sheet (Conversation in the composer).
  // The Conversation button (data-tutor-history) is a view toggle, as before 17 Nov: one tap shows the chat, the next shows the
  // chapters again (the `children`, below the feed). Restored 18 Nov 2026 from 1e666aae.
  const [open, setOpen] = useState(true);
  const [speakingIds, setSpeakingIds] = useState<string[]>([]);
  // The question the navigator jumped to, lit for a moment; whether the newest answer is out of sight below.
  const [lit, setLit] = useState<number | null>(null);
  const [jump, setJump] = useState(false);
  const [lang, setLang] = useState<'en' | 'hi'>('en');
  const root = useRef<HTMLElement>(null);
  const [text, setText] = useState('');
  const [asks, setAsks] = useState<FeedAsk[]>([]);
  const [attached, setAttached] = useState<Attached[]>([]);
  const sketchLeftovers = useRef(new Set<string>());
  // W16-B2: the attached photo is the child's own working, to be checked ("Check my work"), not asked about.
  const [checking, setChecking] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [turns, setTurns] = useState<FeedTurn[] | null>(null);
  const [turnsError, setTurnsError] = useState(false);
  const feed = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, '');
  const ids = { title: `${idPrefix}-${uid}-title`, feed: `${idPrefix}-${uid}-feed`, q: `${idPrefix}-${uid}-q` };
  const subjectName = (s: string) => w[`fam.subject.${s}`] ?? s;
  // W23-C: where it was opened; on Study the subject's own page. The old showcase reader's drawer names its chapter in `reader`.
  const where: TutorWhere | null = placed ?? (reader ? null : { kind: 'study_subject', key: subject });
  const scope = chapterScope(where);

  // The newest at the bottom: the feed box is scrolled to its end (the page itself does not move).
  // A question asked here at the top of the feed box (a moved one after the tab followed), its answer below it.
  const toAsk = (n: number) =>
    requestAnimationFrame(() => {
      const box = feed.current;
      const ask = box?.querySelector<HTMLElement>(`[data-tutor-ask="${n}"]`);
      if (pageScroll) ask?.scrollIntoView({ block: 'start', behavior: stillMotion() ? 'auto' : 'smooth' });
      else if (box && ask) box.scrollTop = ask.offsetTop - 8;
    });
  const toNewest = () =>
    requestAnimationFrame(() => {
      const box = feed.current;
      // On one page scroll the page stays where the child is: the chapters stay reachable below the answers.
      if (box && !pageScroll) box.scrollTop = box.scrollHeight;
    });

  // The subject's feed, read again whenever the subject changes; a question the tab followed stays below it.
  useEffect(() => {
    let live = true;
    const carried = carry.ask && carry.ask.moved === subject ? carry.ask : null;
    carry.ask = null;
    setAsks(carried ? [carried] : []);
    setTurns(null);
    setTurnsError(false);
    void (async () => {
      const res = await fetch(`/api/family/tutor?subject=${encodeURIComponent(subject)}${scope ? `&chapterKey=${encodeURIComponent(scope)}` : ''}`, { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
      const data = res?.ok ? ((await res.json().catch(() => null)) as { turns?: FeedTurn[] } | null) : null;
      if (!live) return;
      if (!data || !Array.isArray(data.turns)) return setTurnsError(true);
      setTurns(withoutCarried(data.turns, carried));
      if (carried) toAsk(carried.n);
      else toNewest();
    })();
    return () => {
      live = false;
    };
  }, [subject, scope]);

  // An answer kept: the server names the chat and its subject. Another subject than the tab's is said in the feed, and
  // on Study the tab follows it (the page is read again for that subject; this question stays on screen).
  const asksNow = useRef(asks);
  asksNow.current = asks;
  const onAnswered = useCallback(
    (n: number, chat?: { chatId: string; subject: string }) => {
      if (!chat || !isSubject(chat.subject)) return;
      const next = answered(asksNow.current, n, { chatId: chat.chatId, subject: chat.subject });
      setAsks(next);
      const ask = next.find((a) => a.n === n);
      const href = followHref(ask, follow, chosen?.key ?? null);
      if (ask && href) {
        carry.ask = ask;
        router.replace(href, { scroll: false });
      }
    },
    [follow, router, chosen]
  );

  const busy = attached.some((a) => a.state !== 'ready');
  // Check my work needs only the photo: the words are optional.
  const canSend = !busy && (checking ? attached.length === 1 : text.trim().length >= TUTOR_TEXT_MIN);

  const attach = async (file: File, check = false) => {
    setFileError(null);
    if (attached.length >= TUTOR_FILES_PER_TURN || (check && attached.length > 0) || checking) return setFileError(w['fam.tutor.err.too_many_files']);
    // C525: a photo (an iPhone HEIC too) is drawn again on the phone at 1600 px as a JPEG before it is sent
    // (src/lib/family/photo-shrink.ts); a PDF goes as it is. Every refusal says what to do next.
    const plan = attachPlan(new Uint8Array(await file.slice(0, 16).arrayBuffer()), file.size);
    if (!plan.ok) return setFileError(w[`fam.tutor.err.${plan.code}`] ?? w['fam.err.network']);
    const key = `${Date.now()}-${Math.random()}`;
    const update = (patch: Partial<Attached>) => setAttached((list) => list.map((a) => (a.key === key ? { ...a, ...patch } : a)));
    const drop = (code: string) => {
      if (check) setChecking(false);
      setAttached((list) => list.filter((a) => a.key !== key));
      setFileError(w[`fam.tutor.err.${code}`] ?? w['fam.err.network']);
    };
    if (check && plan.mime === 'application/pdf') return setFileError(w['fam.check.err.photo_only']);
    if (check) setChecking(true);
    setAttached((list) => [...list, { key, name: file.name, mime: plan.mime === 'image/heic' ? 'image/jpeg' : plan.mime, state: 'sending', id: null }]);
    const ready = plan.shrink ? await preparePhoto(file, plan.mime) : { ok: true as const, file, mime: plan.mime };
    if (!ready.ok) return drop(ready.code);
    update({ mime: ready.mime });
    const up = await uploadTutorFile(subject, ready.file, ready.mime, { ticket: (id) => update({ id }), stored: () => update({ state: 'checking' }) });
    if ('code' in up) return drop(up.code);
    update({ state: 'ready' });
  };

  const remove = (a: Attached) => {
    setAttached((list) => list.filter((x) => x.key !== a.key));
    setChecking(false);
    if (a.id) void fetch(`/api/family/tutor/files/${encodeURIComponent(a.id)}`, { method: 'DELETE' }).catch(() => null);
  };

  // A question continues the subject's newest open chat (the server finds it; the first answer opens one).
  const submit = (asked: string, tutor: TutorAsk) => {
    const n = (asks.at(-1)?.n ?? 0) + 1;
    setAsks((list) => [...list, { n, subject, text: asked, input: { kind: 'question', text: asked, tutor }, moved: null, chatId: null, at: new Date().toISOString() }]);
    setText('');
    setAttached([]);
    setChecking(false);
    setFileError(null);
    setOpen(true);
    // The new question at the top of the feed box, its answer drawing below it.
    requestAnimationFrame(() => document.getElementById(`${ids.feed}-ask-${n}`)?.scrollIntoView({ block: 'start', behavior: stillMotion() ? 'auto' : 'smooth' }));
  };
  const base = { subject, ...(where ? { where } : {}), ...(chosen ? { tutorKey: chosen.key } : {}), ...(reader ? { chapterKey: reader.chapterKey, blockId: reader.blockId } : {}) };
  const askSeen = useRef(0);
  useEffect(() => {
    if (!ask || ask.n === askSeen.current || ask.text.trim().length < TUTOR_TEXT_MIN) return;
    askSeen.current = ask.n;
    submit(ask.text.trim(), { ...base, files: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask?.n]);
  const send = () => {
    if (!canSend) return;
    // C508: inside the tap, so a young child's answer may be read aloud by itself when it comes.
    unlockVoice();
    const asked = checking && text.trim().length < TUTOR_TEXT_MIN ? w['fam.check.sent'] : text.trim();
    // W18-Q3: typed working ("Check my work: 2+3×4=14", no file) is marked, not taught: the same mode as the photo.
    const typedCheck = !checking && attached.length === 0 && typedCheckIntentLight(asked);
    submit(asked, { ...base, files: attached.flatMap((a) => (a.id ? [a.id] : [])), ...(checking || typedCheck ? { mode: 'check' as const } : {}) });
  };

  // W18-P3: the sketch pad's PNG goes through the same file door as Attach, then is asked about with `sketch: true`: the
  // tutor answers with a board that marks up the drawing. The words are what the child typed, else a fixed line. Resolves
  // with the words of an error to show in the pad, or null once asked.
  // C510: the studio's own question box (prefilled with what the composer held) comes with the picture; a PNG or a JPEG.
  const sendSketch = async (file: File, question = ''): Promise<string | null> => {
    if (attached.length > 0 || checking) return w['fam.tutor.err.too_many_files'];
    if (file.size === 0) return w['fam.tutor.err.file_empty'];
    if (file.size > TUTOR_FILE_MAX_BYTES) return w['fam.tutor.err.file_too_large'];
    const mime = sniffTutorFile(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
    if (mime !== 'image/png' && mime !== 'image/jpeg') return w['fam.tutor.err.file_type'];
    // C513: a failed try takes its file back; "too many files" takes back this window's leftovers and tries again.
    const up = await sendWithRetry({ upload: () => uploadTutorFile(subject, file, mime), remove: removeTutorFile, leftovers: sketchLeftovers.current });
    if (!up.ok) return w[sendErrorKey(up.code)] ?? w['fam.err.network'];
    const asked = question.trim().slice(0, TUTOR_TEXT_MAX);
    submit(asked.length >= TUTOR_TEXT_MIN ? asked : w['fam.sketch.ask'], { ...base, files: [up.id], sketch: true });
    return null;
  };
  // C513: a drawing sent from the Draw tab opens this window (in its drawer) to ask about it, once per `n`.
  const sketchSeen = useRef(0);
  useEffect(() => {
    if (!sketchFirst || sketchFirst.n === sketchSeen.current) return;
    sketchSeen.current = sketchFirst.n;
    void sendSketch(sketchFirst.file, sketchFirst.question).then(sketchFirst.done, () => sketchFirst.done(w['fam.err.network']));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sketchFirst?.n]);

  // C508: Try again on a kept question with no answer yet: the same words asked again in its chat, drawn live below;
  // the kept one leaves the feed (the server's answer takes its place).
  const tryAgain = (t: Extract<FeedTurn, { role: 'child' }>) => {
    unlockVoice();
    setTurns((list) => (list ?? []).filter((x) => x.id !== t.id));
    submit(t.text, { ...base, chatId: t.chatId, retryOf: t.id, files: [] });
  };
  const noAnswer = turns ? unansweredIds(turns) : new Set<string>();

  const shown = (turns?.length ?? 0) + asks.length > 0 || turnsError;
  const groups = turns ? qaGroups(turns) : [];
  const chips = questionChips(groups, asks);
  // The place the header names: in a chapter (or the reader) its chapter and topic line; on Study the subject alone.
  const place = reader?.section ?? (scope ? about : null);

  useEffect(() => {
    const l = root.current?.closest('[lang]')?.getAttribute('lang');
    setLang(l === 'hi' ? 'hi' : 'en');
  }, []);
  // W19-A: the window closed or left, the tutor rests.
  useEffect(() => {
    if (!open) setAvatarMood('idle');
  }, [open]);
  useEffect(() => () => setAvatarMood('idle'), []);
  // Focus Reading: which answers are being read aloud (AnswerSpeaker tells the window).
  useEffect(() => {
    const on = (e: Event) => {
      const { id, speaking } = (e as CustomEvent<{ id: string; speaking: boolean }>).detail;
      setSpeakingIds((list) => (speaking ? (list.includes(id) ? list : [...list, id]) : list.filter((x) => x !== id)));
    };
    window.addEventListener('fam-reading', on);
    return () => window.removeEventListener('fam-reading', on);
  }, []);
  const focus = useFocusReading({ enabled: pageScroll && open && shown, reading: speakingIds.length > 0 });

  // "Jump to latest": shown while the newest question-and-answer is out of sight below (the page on Study: above the
  // composer; the feed's own box in a drawer), hidden at the end.
  useEffect(() => {
    const box = feed.current;
    if (!box || !shown) return setJump(false);
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const all = box.querySelectorAll<HTMLElement>('[data-qa]');
        const last = all[all.length - 1];
        if (!last) return setJump(false);
        if (!pageScroll) return setJump(boxFarFromEnd(box.scrollHeight, box.scrollTop, box.clientHeight));
        const dock = root.current?.querySelector<HTMLElement>('[data-tutor-composer]');
        const visibleBottom = dock ? dock.getBoundingClientRect().top : window.innerHeight;
        setJump(newestBelow(last.getBoundingClientRect().bottom, visibleBottom));
      });
    };
    const scroller: Window | HTMLElement = pageScroll ? window : box;
    scroller.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    const grows = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check);
    grows?.observe(box);
    check();
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      grows?.disconnect();
    };
  }, [pageScroll, shown]);

  const motion = (): ScrollBehavior => (stillMotion() ? 'auto' : 'smooth');
  const toLatest = () => {
    const box = feed.current;
    const all = box?.querySelectorAll<HTMLElement>('[data-qa]');
    const last = all?.[all.length - 1];
    if (pageScroll) last?.scrollIntoView({ block: 'end', behavior: motion() });
    else box?.scrollTo({ top: box.scrollHeight, behavior: motion() });
  };
  // The navigator: to that question's card, lit for a moment.
  const lightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toQuestion = (n: number) => {
    const el = feed.current?.querySelector<HTMLElement>(`[data-qa="${n}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'start', behavior: motion() });
    el.focus({ preventScroll: true });
    setLit(n);
    if (lightTimer.current) clearTimeout(lightTimer.current);
    lightTimer.current = setTimeout(() => setLit(null), 2200);
  };
  useEffect(() => () => void (lightTimer.current && clearTimeout(lightTimer.current)), []);

  // 18 Nov 2026: one surface. On a phone a question and its answer are the page itself (no card, no ring, no gutter of their own),
  // divided from the next by a line; from 1024 px up a card on the wide column.
  const card = (n: number) => `fam-qa flex scroll-mb-[calc(var(--fam-bottom,0px)+11rem)] scroll-mt-4 flex-col gap-3 border-t border-ink/10 py-4 outline-none first:border-t-0 lg:rounded-3xl lg:border-0 lg:bg-white lg:p-4 ${lit === n ? 'rounded-2xl bg-sunshine/25 ring-2 ring-saffron-deep' : 'lg:ring-1 lg:ring-ink/10'}`;
  return (
    <section ref={root} data-tutor-window data-subject={subject} data-listed={subject} aria-labelledby={ids.title} className="flex flex-col gap-4">
      <h2 id={ids.title} className="sr-only">
        {w['fam.tutor.title']}
      </h2>
      {chosen && (
        <p data-tutor-chosen={chosen.key} className="flex flex-wrap items-center gap-x-3 self-start rounded-3xl bg-white px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-ink/10">
          <TutorFace size="sm" tutorKey={chosen.key} subject={subject} />
          <span>{fill(w['fam.tutors.chattingWith'], { name: chosen.name })}</span>
          <Link href="/family/tutors" className="fam-press inline-flex min-h-[44px] items-center font-bold text-saffron-deep underline">
            {w['fam.tutors.change']}
          </Link>
        </p>
      )}
      <div
        id={ids.feed}
        ref={feed}
        data-tutor-feed
        role="log"
        aria-label={fill(w['fam.chat.feed'], { subject: subjectName(subject) })}
        aria-busy={turns === null && !turnsError}
        className={`fam-feed relative flex-col gap-4 scroll-mb-[calc(var(--fam-bottom,0px)+9rem)] ${pageScroll ? '' : 'max-h-[70vh] overflow-y-auto overscroll-contain'} ${open && (shown || place) ? 'flex' : 'hidden'}`}
      >
        <div data-chat-header className="flex flex-col gap-2">
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm font-extrabold text-ink">
            <span data-chat-subject>{subjectName(subject)}</span>
            {place && (
              <>
                <span aria-hidden="true">·</span>
                <span data-tutor-context className="min-w-0 font-semibold">
                  {place}
                </span>
              </>
            )}
          </p>
        </div>
        {turnsError && (
          <p role="status" className="fam-surface bg-white p-4 text-sm text-ink">
            {w['fam.err.network']}
          </p>
        )}
        {groups.length > 0 && (
          <>
            <p data-feed-kept className="text-center text-xs font-semibold text-ink">
              {w['fam.chat.kept']}
            </p>
            <ol data-tutor-turns className="flex flex-col gap-4">
              {groups.map((g) => (
                <li key={g.key} data-qa={g.n} data-chat={g.chatId} tabIndex={-1} className={card(g.n)}>
                  {g.ask && (
                    <div data-turn="child" className="flex flex-col">
                      <Question w={w} text={g.ask.text} lang={g.ask.lang} fromReader={!!g.ask.chapterKey} files={g.ask.files} at={g.ask.at} uiLang={lang} />
                      {noAnswer.has(g.ask.id) && <NoAnswerYet w={w} id={g.ask.id} onTry={() => g.ask && tryAgain(g.ask)} />}
                    </div>
                  )}
                  {g.answers.map((t) => (
                    <div key={t.id} data-turn="tutor" className="flex flex-col gap-2">
                      <ReplyHead w={w} n={g.n} at={t.at} uiLang={lang} />
                      <KeptAnswer b={t.blocks} w={w} tone={tone} lang={t.lang} speak={{ id: t.id, serverVoice }} tutorKey={chosen?.key ?? null} subject={subject} />
                    </div>
                  ))}
                </li>
              ))}
            </ol>
          </>
        )}
        {asks.map((a, i) => {
          const n = groups.length + i + 1;
          return (
            <div key={a.n} id={`${ids.feed}-ask-${a.n}`} data-tutor-ask={a.n} data-qa={n} tabIndex={-1} className={card(n)}>
              <Question w={w} text={a.text} at={a.at} uiLang={lang} />
              {a.moved && (
                <p role="status" data-feed-moved={a.moved} className="fam-acc-in self-center rounded-full bg-emerald px-4 py-1.5 text-sm font-bold text-white">
                  {fill(w['fam.chat.moved'], { subject: subjectName(a.moved) })}
                </p>
              )}
              <ReplyHead w={w} n={n} uiLang={lang} />
              <UnderstandView w={w} input={a.input} tone={tone} onDone={(chat) => onAnswered(a.n, chat)} speak={{ serverVoice }} tutorKey={chosen?.key ?? null} onTap={unlockVoice} />
            </div>
          );
        })}
      </div>
      {children}
      <Composer
        w={w}
        id={ids.q}
        value={text}
        onChange={setText}
        onSend={send}
        canSend={canSend}
        pinned={pinned}
        files={files}
        homework={homework}
        attached={attached}
        onAttach={(f) => void attach(f)}
        onCheck={(f) => void attach(f, true)}
        checking={checking}
        onRemove={remove}
        fileError={fileError}
        voice={voice}
        // W19-B (the lead): a spoken question is answered like a person answers: the tutor's sealed acknowledgement
        // ("You asked about X, let's look at it") is spoken at once with the server voice, when read-aloud is on, and the
        // question goes without a tap. The phone's own voice is not used for the ack: the ack is a sealed server line.
        onHeard={(heard, ack) => {
          if (ack && serverVoice) {
            void readChildSettings().then((s) => {
              if (!s.readAloud) return;
              const lang = typeof document !== 'undefined' && document.documentElement.lang === 'hi' ? 'hi' : 'en';
              void speakLine('server', { kind: 'call_line', token: ack.token }, { text: ack.text, lang, rate: s.voiceSpeed === 'slow' ? 0.8 : 0.95 });
            });
          }
          const asked = heard.trim();
          if (asked.length === 0 || checking || attached.length > 0) return;
          submit(asked, { ...base, ...(typedCheckIntentLight(asked) ? { mode: 'check' as const } : {}) });
        }}
        call={call}
        historyOpen={open && shown}
        historyFor={ids.feed}
        onHistory={() => {
          setOpen((o) => !o);
          if (!open) toNewest();
        }}
        above={
          jump ? (
            <button type="button" data-tutor-jump onClick={toLatest} aria-label={w['fam.tutor.jumpLatest']} title={w['fam.tutor.jumpLatest']} className="fam-press pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white shadow-lg">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </button>
          ) : null
        }
      />
      {pageScroll && open && <QuestionPuck w={w} chips={chips} feed={feed} pageScroll={pageScroll} onGo={toQuestion} />}
      {pageScroll && focus.reduced && open && shown && (
        <button type="button" data-focus-toggle aria-pressed={focus.hidden} onClick={focus.toggle} style={{ bottom: focus.hidden ? 'calc(var(--fam-bottom,0px) + 0.75rem)' : 'calc(var(--fam-dock-h, 4.5rem) + 4.5rem)' }} className="fam-press fixed left-3 z-30 flex min-h-[44px] items-center rounded-full bg-ink px-4 text-sm font-bold text-white shadow-lg">
          {focus.hidden ? w['fam.focus.off'] : w['fam.focus.on']}
        </button>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {focus.said === 'on' ? w['fam.focus.hidden'] : focus.said === 'off' ? w['fam.focus.shown'] : ''}
      </p>
    </section>
  );
}

// C508: under a kept question whose answer failed: the plain state and Try again (44 px), no error words.
function NoAnswerYet({ w, id, onTry }: { w: Words; id: string; onTry: () => void }) {
  return (
    <div data-no-answer={id} className="mt-2 flex flex-wrap items-center gap-3 self-start rounded-2xl bg-white px-4 py-2 ring-1 ring-ink/10">
      <p className="text-sm font-bold text-ink">{w['fam.tutor.noAnswerYet']}</p>
      <button type="button" data-try-again onClick={onTry} className="fam-press min-h-[44px] min-w-[44px] rounded-2xl bg-saffron px-4 text-sm font-bold text-ink">
        {w['fam.tutor.tryAgain']}
      </button>
    </div>
  );
}

// A question in the feed: the child's words, on the right, in ink.
function Question({ w, text, lang, fromReader = false, files = [], at, uiLang = 'en' }: { w: Words; text: string; lang?: string; fromReader?: boolean; files?: TutorFile[]; at?: string; uiLang?: string }) {
  return (
    <div data-feed-question className="ml-6 flex flex-col gap-2 self-end rounded-2xl rounded-br-md bg-ink p-4 text-white sm:ml-16">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs font-bold text-white">
        <span className="uppercase tracking-wide">{w['fam.tutor.you']}</span>
        {at && <time dateTime={at} className="font-semibold">{indiaWhen(at, uiLang, true)}</time>}
      </p>
      <p lang={lang} className="whitespace-pre-wrap break-words text-base">
        {text}
      </p>
      {fromReader && <p className="text-xs font-semibold text-white">{w['fam.tutor.fromReader']}</p>}
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f) => (
            <li key={f.id}>
              <a href={`/api/family/tutor/files/${encodeURIComponent(f.id)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1 rounded-xl bg-white px-3 text-sm font-bold text-ink">
                {f.mime === 'application/pdf' ? w['fam.tutor.filePdf'] : w['fam.tutor.filePhoto']}
                <span className="sr-only">: {w['fam.tutor.openFile']}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The head of every reply: its "Question #N" chip (the same N as the navigator's), and when it was answered.
function ReplyHead({ w, n, at, uiLang }: { w: Words; n: number; at?: string; uiLang: string }) {
  return (
    <p data-reply-head className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span data-question-chip={n} className="rounded-full bg-sunshine px-3 py-1 text-sm font-extrabold text-slate">
        {fill(w['fam.tutor.questionN'], { n })}
      </span>
      {at && (
        <time dateTime={at} className="text-xs font-semibold text-slate">
          {indiaWhen(at, uiLang, true)}
        </time>
      )}
    </p>
  );
}

// A kept answer in the feed, in the lesson look (W10-4): the direct answer first, under its heading, then its
// sections, numbered. W18-P1: each block is drawn by the lesson page's own renderer (UnderstandView's AnswerBlock), so a
// saved answer keeps its board, scene, simulation, chart, timeline, figure, 3D model, image and videos exactly as when it
// was fresh. A check or practice is never kept (tutor.ts keptTutorBlocks), and one that somehow is stays out, as before.
// The answer owns which sentence its voice is speaking: the read-aloud button and "Teach me" report it, and its boards
// draw up to the step that sentence reaches.
export function KeptAnswer({ b, w, tone, lang, speak, tutorKey = null, subject = null }: { b: Block[]; w: Words; tone: string; lang: string; speak: { id: string; serverVoice: boolean }; tutorKey?: string | null; subject?: string | null }) {
  const [sentence, setSentence] = useState<number | undefined>(undefined);
  // W22-S3: the tutor's face stays on screen while this answer is read aloud.
  const [reading, setReading] = useState<Reading>({ speaking: false, percent: 0 });
  const root = useRef<HTMLDivElement>(null);
  const lead = b.find((x): x is Explanation => x.type === 'explanation');
  // W16-B2: a marked working names its chapter in a chip first (a general answer says nothing here).
  const cited = citationOf(b, false);
  const shown = b.filter((x): x is Exclude<Block, { type: 'check' } | { type: 'practice' }> => x.type !== 'check' && x.type !== 'practice' && !unfilled(x));
  // The same words the server voice speaks; an answer with nothing to say aloud (a picture alone) has no button.
  const sentences = spokenSentences(b, Infinity);
  const voice = { messageId: speak.id, sentences, lang: lang === 'hi' ? ('hi' as const) : ('en' as const), serverVoice: speak.serverVoice, onSentence: setSentence, onReading: setReading };
  return (
    <div ref={root} lang={lang} data-feed-answer className="fam-lesson flex flex-col gap-3">
      {(reading.speaking || reading.started) && (
        <StickyTutorFace tutorKey={tutorKey} subject={subject} label={w[reading.speaking ? 'fam.tutor.readingNow' : 'fam.tutor.resume']} percent={reading.percent} speaking={reading.speaking} onToggle={reading.toggle} toggleLabel={w[reading.speaking ? 'fam.tutor.pause' : 'fam.tutor.resume']} />
      )}
      <WordTapLayer root={root} w={w} lang={lang === 'hi' ? 'hi' : 'en'} sentences={sentences} onReadFrom={reading.from} />
      {cited && <CitationChip w={w} c={cited} />}
      {lead && <DirectAnswerCard w={w} b={lead} />}
      {sentences.length > 0 && <TeachMe w={w} {...voice} root={root} />}
      {shown.map((x, i) => (
        <AnswerBlock key={i} b={x} w={w} tone={tone} lead={x === lead} onRetry={noRetry} sentence={sentence} sentences={sentences} />
      ))}
      {sentences.length > 0 && <AnswerSpeaker w={w} {...voice} root={root} />}
    </div>
  );
}

// A kept answer has no questions to answer again.
const noRetry = () => {};
