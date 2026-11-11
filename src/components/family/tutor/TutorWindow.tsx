'use client';

import dynamic from 'next/dynamic';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { unfilled, type Block, type Explanation } from '@/lib/family/blocks';
import { fill, type Words } from '@/lib/family/fill';
import { isSubject, type Subject } from '@/lib/family/subjects';
import { TUTOR_FILE_MAX_BYTES, TUTOR_FILES_PER_TURN, TUTOR_TEXT_MIN, sniffTutorFile, type FeedTurn, type TutorFile } from '@/lib/family/tutor-shape';
import { CitationChip } from '../blocks/CitationChip';
import { citationOf } from '@/lib/family/citation';
import { AnswerBlock, DirectAnswerCard, UnderstandView, type TutorAsk, type UnderstandInput } from '../UnderstandView';
import { Composer, type ComposerFile } from './Composer';
import { StickyTutorFace, TutorFace } from '../avatar/TutorFace';
import { setAvatarMood } from '@/lib/family/avatar-state';

import { spokenSentences } from '@/lib/family/call';
import { typedCheckIntentLight } from '@/lib/family/check-intent';
import { readChildSettings } from '@/lib/family/child-settings';
import { speakLine } from '../voice/lineVoice';
// The speaker and Teach me load with the first answer drawn, off the Study page's first load (the family budget, W18).
import type { Reading } from '../voice/AnswerSpeaker';
import { WordTapLayer } from '../words/WordTapLayer';
const AnswerSpeaker = dynamic(() => import('../voice/AnswerSpeaker').then((m) => m.AnswerSpeaker));
const TeachMe = dynamic(() => import('../voice/AnswerSpeaker').then((m) => m.TeachMe));

// The shared tutor window (S2, C375; docs/37 §4 Wave 2): one window for every question a child types, on the Study page
// and in the chapter reader's doubt drawer. W6-A (C395): one composer (Composer.tsx) pinned at the foot. Study passes
// its chapters as `children`, between the feed and the composer, so the composer stays pinned while the chapters
// scroll. W10-4 (C413; docs/39 §5 "Chat, final rule"): above them, the subject's feed, like the chat products: every
// question and answer of the subject in order, newest at the bottom, scrolled to the newest on opening, then each new
// question and its answer drawn as it streams (through Understand: the same consent, module switch, safety check and
// daily cap). No list of chats: the server keeps the subject's last 30 child turns and a question continues the
// subject's newest open chat. When the server decides a question belongs to another subject, the feed says so ("Moved
// to Science") and, on Study (`follow`), the subject tab follows it.
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
  children?: ReactNode;
};

type Attached = ComposerFile;
// A question asked on this screen, drawn live below the feed read from the server. `moved`: the subject the server kept
// it in, when not the tab's; `chatId`: the chat it was kept in.
export type FeedAsk = { n: number; subject: Subject; text: string; input: UnderstandInput; moved: Subject | null; chatId: string | null };

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
async function uploadTutorFile(subject: string, file: File, mime: string, step?: { ticket?: (id: string) => void; stored?: () => void }): Promise<{ id: string } | { code: string }> {
  const askRes = await postJson('/api/family/tutor/files', { subject, mime, size: file.size, name: file.name });
  if (!askRes?.ok) return { code: await errorOf(askRes) };
  const ticket = (await askRes.json().catch(() => null)) as { attachmentId?: string; uploadUrl?: string; contentType?: string } | null;
  if (!ticket?.attachmentId || !ticket.uploadUrl) return { code: 'network' };
  step?.ticket?.(ticket.attachmentId);
  if (!(await sendToStore(ticket.uploadUrl, file, ticket.contentType ?? mime))) return { code: 'storage_unavailable' };
  step?.stored?.();
  const confirmed = await postJson(`/api/family/tutor/files/${encodeURIComponent(ticket.attachmentId)}`, {});
  if (!confirmed?.ok) return { code: await errorOf(confirmed) };
  return { id: ticket.attachmentId };
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

export function TutorWindow({ w, subject, tone, voice = null, files = false, homework = false, reader = null, idPrefix = 'fam-tutor', pinned = 'dock', follow = false, pageScroll = false, tutor: chosen = null, call = null, serverVoice = false, about = null, where: placed = null, ask = null, children }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [text, setText] = useState('');
  const [asks, setAsks] = useState<FeedAsk[]>([]);
  const [attached, setAttached] = useState<Attached[]>([]);
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
    if (file.size === 0) return setFileError(w['fam.tutor.err.file_empty']);
    if (file.size > TUTOR_FILE_MAX_BYTES) return setFileError(w['fam.tutor.err.file_too_large']);
    const mime = sniffTutorFile(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
    if (!mime) return setFileError(w['fam.tutor.err.file_type']);
    const key = `${Date.now()}-${Math.random()}`;
    const update = (patch: Partial<Attached>) => setAttached((list) => list.map((a) => (a.key === key ? { ...a, ...patch } : a)));
    const drop = (code: string) => {
      if (check) setChecking(false);
      setAttached((list) => list.filter((a) => a.key !== key));
      setFileError(w[`fam.tutor.err.${code}`] ?? w['fam.err.network']);
    };
    if (check && mime === 'application/pdf') return setFileError(w['fam.check.err.photo_only']);
    if (check) setChecking(true);
    setAttached((list) => [...list, { key, name: file.name, mime, state: 'sending', id: null }]);
    const up = await uploadTutorFile(subject, file, mime, { ticket: (id) => update({ id }), stored: () => update({ state: 'checking' }) });
    if ('code' in up) return drop(up.code);
    update({ state: 'ready' });
  };

  const remove = (a: Attached) => {
    setAttached((list) => list.filter((x) => x.key !== a.key));
    setChecking(false);
    if (a.id) void fetch(`/api/family/tutor/files/${encodeURIComponent(a.id)}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => null);
  };

  // A question continues the subject's newest open chat (the server finds it; the first answer opens one).
  const submit = (asked: string, tutor: TutorAsk) => {
    const n = (asks.at(-1)?.n ?? 0) + 1;
    setAsks((list) => [...list, { n, subject, text: asked, input: { kind: 'question', text: asked, tutor }, moved: null, chatId: null }]);
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
    const asked = checking && text.trim().length < TUTOR_TEXT_MIN ? w['fam.check.sent'] : text.trim();
    // W18-Q3: typed working ("Check my work: 2+3×4=14", no file) is marked, not taught: the same mode as the photo.
    const typedCheck = !checking && attached.length === 0 && typedCheckIntentLight(asked);
    submit(asked, { ...base, files: attached.flatMap((a) => (a.id ? [a.id] : [])), ...(checking || typedCheck ? { mode: 'check' as const } : {}) });
  };

  // W18-P3: the sketch pad's PNG goes through the same file door as Attach, then is asked about with `sketch: true`: the
  // tutor answers with a board that marks up the drawing. The words are what the child typed, else a fixed line. Resolves
  // with the words of an error to show in the pad, or null once asked.
  const sendSketch = async (file: File): Promise<string | null> => {
    if (attached.length > 0 || checking) return w['fam.tutor.err.too_many_files'];
    if (file.size === 0) return w['fam.tutor.err.file_empty'];
    if (file.size > TUTOR_FILE_MAX_BYTES) return w['fam.tutor.err.file_too_large'];
    const mime = sniffTutorFile(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
    if (mime !== 'image/png') return w['fam.tutor.err.file_type'];
    const up = await uploadTutorFile(subject, file, mime);
    if ('code' in up) return w[`fam.tutor.err.${up.code}`] ?? w['fam.err.network'];
    submit(text.trim().length >= TUTOR_TEXT_MIN ? text.trim() : w['fam.sketch.ask'], { ...base, files: [up.id], sketch: true });
    return null;
  };

  const shown = (turns?.length ?? 0) + asks.length > 0 || turnsError;
  // W19-A: the window closed or left, the tutor rests.
  useEffect(() => {
    if (!open) setAvatarMood('idle');
  }, [open]);
  useEffect(() => () => setAvatarMood('idle'), []);
  return (
    <section data-tutor-window data-subject={subject} data-listed={subject} aria-labelledby={ids.title} className="flex flex-col gap-4">
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
      {about && !reader && (
        <p data-tutor-context className="self-start rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink ring-1 ring-ink/10">
          {fill(w['fam.tutor.doubtAbout'], { section: about })}
        </p>
      )}
      {reader && (
        <p data-tutor-context className="self-start rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink ring-1 ring-ink/10">
          {fill(w['fam.tutor.doubtAbout'], { section: reader.section })}
        </p>
      )}
      <div
        id={ids.feed}
        ref={feed}
        data-tutor-feed
        role="log"
        aria-label={fill(w['fam.chat.feed'], { subject: subjectName(subject) })}
        aria-busy={turns === null && !turnsError}
        className={`fam-feed relative flex-col gap-4 ${pageScroll ? '' : 'max-h-[70vh] overflow-y-auto overscroll-contain'} ${open && shown ? 'flex' : 'hidden'}`}
      >
        {turnsError && (
          <p role="status" className="fam-surface bg-white p-4 text-sm text-ink">
            {w['fam.err.network']}
          </p>
        )}
        {turns && turns.length > 0 && (
          <>
            <p data-feed-kept className="text-center text-xs font-semibold text-ink">
              {w['fam.chat.kept']}
            </p>
            <ol data-tutor-turns className="flex flex-col gap-4">
              {turns.map((t) => (
                <li key={t.id} data-turn={t.role} data-chat={t.chatId} className="flex flex-col">
                  {t.role === 'child' ? <Question w={w} text={t.text} lang={t.lang} fromReader={!!t.chapterKey} files={t.files} /> : <KeptAnswer b={t.blocks} w={w} tone={tone} lang={t.lang} speak={{ id: t.id, serverVoice }} tutorKey={chosen?.key ?? null} subject={subject} />}
                </li>
              ))}
            </ol>
          </>
        )}
        {asks.map((a) => (
          <div key={a.n} id={`${ids.feed}-ask-${a.n}`} data-tutor-ask={a.n} className="flex scroll-mt-2 flex-col gap-3">
            <Question w={w} text={a.text} />
            {a.moved && (
              <p role="status" data-feed-moved={a.moved} className="fam-acc-in self-center rounded-full bg-emerald px-4 py-1.5 text-sm font-bold text-white">
                {fill(w['fam.chat.moved'], { subject: subjectName(a.moved) })}
              </p>
            )}
            <UnderstandView w={w} input={a.input} tone={tone} onDone={(chat) => onAnswered(a.n, chat)} speak={{ serverVoice }} tutorKey={chosen?.key ?? null} />
          </div>
        ))}
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
        onSketch={sendSketch}
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
      />
    </section>
  );
}

// A question in the feed: the child's words, on the right, in ink.
function Question({ w, text, lang, fromReader = false, files = [] }: { w: Words; text: string; lang?: string; fromReader?: boolean; files?: TutorFile[] }) {
  return (
    <div data-feed-question className="ml-6 flex flex-col gap-2 self-end rounded-2xl rounded-br-md bg-ink p-4 text-white sm:ml-16">
      <p className="text-xs font-bold uppercase tracking-wide text-white">{w['fam.tutor.you']}</p>
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
