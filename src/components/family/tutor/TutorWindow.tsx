'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Block, Explanation } from '@/lib/family/blocks';
import { fill, type Words } from '@/lib/family/fill';
import { isSubject, type Subject } from '@/lib/family/subjects';
import { TUTOR_FILE_MAX_BYTES, TUTOR_FILES_PER_TURN, TUTOR_TEXT_MIN, sniffTutorFile, type FeedTurn, type TutorFile } from '@/lib/family/tutor-shape';
import { DiagramView, EnglishMomentView, ExplanationView, KeyPointsView, SourcesView, WorkedExampleView } from '../blocks/BlockViews';
import { MindMapView } from '../blocks/MindMapView';
import { DirectAnswerCard, UnderstandView, type UnderstandInput } from '../UnderstandView';
import { Composer, type ComposerFile } from './Composer';

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

const InteractiveView = dynamic(() => import('../blocks/InteractiveViews').then((m) => m.InteractiveView));

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
export function followHref(ask: FeedAsk | undefined, follow: boolean): string | null {
  return follow && ask?.moved ? `/family/study?subject=${encodeURIComponent(ask.moved)}` : null;
}

export function TutorWindow({ w, subject, tone, voice = null, files = false, homework = false, reader = null, idPrefix = 'fam-tutor', pinned = 'dock', follow = false, children }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [text, setText] = useState('');
  const [asks, setAsks] = useState<FeedAsk[]>([]);
  const [attached, setAttached] = useState<Attached[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [turns, setTurns] = useState<FeedTurn[] | null>(null);
  const [turnsError, setTurnsError] = useState(false);
  const feed = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, '');
  const ids = { title: `${idPrefix}-${uid}-title`, feed: `${idPrefix}-${uid}-feed`, q: `${idPrefix}-${uid}-q` };
  const subjectName = (s: string) => w[`fam.subject.${s}`] ?? s;

  // The newest at the bottom: the feed box is scrolled to its end (the page itself does not move).
  // A question asked here at the top of the feed box (a moved one after the tab followed), its answer below it.
  const toAsk = (n: number) =>
    requestAnimationFrame(() => {
      const box = feed.current;
      const ask = box?.querySelector<HTMLElement>(`[data-tutor-ask="${n}"]`);
      if (box && ask) box.scrollTop = ask.offsetTop - 8;
    });
  const toNewest = () =>
    requestAnimationFrame(() => {
      const box = feed.current;
      if (box) box.scrollTop = box.scrollHeight;
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
      const res = await fetch(`/api/family/tutor?subject=${encodeURIComponent(subject)}`, { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
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
  }, [subject]);

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
      const href = followHref(ask, follow);
      if (ask && href) {
        carry.ask = ask;
        router.replace(href, { scroll: false });
      }
    },
    [follow, router]
  );

  const busy = attached.some((a) => a.state !== 'ready');
  const canSend = text.trim().length >= TUTOR_TEXT_MIN && !busy;

  const attach = async (file: File) => {
    setFileError(null);
    if (attached.length >= TUTOR_FILES_PER_TURN) return setFileError(w['fam.tutor.err.too_many_files']);
    if (file.size === 0) return setFileError(w['fam.tutor.err.file_empty']);
    if (file.size > TUTOR_FILE_MAX_BYTES) return setFileError(w['fam.tutor.err.file_too_large']);
    const mime = sniffTutorFile(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
    if (!mime) return setFileError(w['fam.tutor.err.file_type']);
    const key = `${Date.now()}-${Math.random()}`;
    const update = (patch: Partial<Attached>) => setAttached((list) => list.map((a) => (a.key === key ? { ...a, ...patch } : a)));
    const drop = (code: string) => {
      setAttached((list) => list.filter((a) => a.key !== key));
      setFileError(w[`fam.tutor.err.${code}`] ?? w['fam.err.network']);
    };
    setAttached((list) => [...list, { key, name: file.name, mime, state: 'sending', id: null }]);
    const askRes = await postJson('/api/family/tutor/files', { subject, mime, size: file.size, name: file.name });
    if (!askRes?.ok) return drop(await errorOf(askRes));
    const ticket = (await askRes.json().catch(() => null)) as { attachmentId?: string; uploadUrl?: string; contentType?: string } | null;
    if (!ticket?.attachmentId || !ticket.uploadUrl) return drop('network');
    update({ id: ticket.attachmentId });
    if (!(await sendToStore(ticket.uploadUrl, file, ticket.contentType ?? mime))) return drop('storage_unavailable');
    update({ state: 'checking' });
    const confirmed = await postJson(`/api/family/tutor/files/${encodeURIComponent(ticket.attachmentId)}`, {});
    if (!confirmed?.ok) return drop(await errorOf(confirmed));
    update({ state: 'ready' });
  };

  const remove = (a: Attached) => {
    setAttached((list) => list.filter((x) => x.key !== a.key));
    if (a.id) void fetch(`/api/family/tutor/files/${encodeURIComponent(a.id)}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => null);
  };

  // A question continues the subject's newest open chat (the server finds it; the first answer opens one).
  const send = () => {
    if (!canSend) return;
    const asked = text.trim();
    const tutor = { subject, ...(reader ? { chapterKey: reader.chapterKey, blockId: reader.blockId } : {}), files: attached.flatMap((a) => (a.id ? [a.id] : [])) };
    const n = (asks.at(-1)?.n ?? 0) + 1;
    setAsks((list) => [...list, { n, subject, text: asked, input: { kind: 'question', text: asked, tutor }, moved: null, chatId: null }]);
    setText('');
    setAttached([]);
    setFileError(null);
    setOpen(true);
    // The new question at the top of the feed box, its answer drawing below it.
    requestAnimationFrame(() => document.getElementById(`${ids.feed}-ask-${n}`)?.scrollIntoView({ block: 'start', behavior: stillMotion() ? 'auto' : 'smooth' }));
  };

  const shown = (turns?.length ?? 0) + asks.length > 0 || turnsError;

  return (
    <section data-tutor-window data-subject={subject} data-listed={subject} aria-labelledby={ids.title} className="flex flex-col gap-4">
      <h2 id={ids.title} className="sr-only">
        {w['fam.tutor.title']}
      </h2>
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
        className={`fam-feed relative max-h-[70vh] flex-col gap-4 overflow-y-auto overscroll-contain ${open && shown ? 'flex' : 'hidden'}`}
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
                  {t.role === 'child' ? <Question w={w} text={t.text} lang={t.lang} fromReader={!!t.chapterKey} files={t.files} /> : <KeptAnswer b={t.blocks} w={w} tone={tone} lang={t.lang} />}
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
            <UnderstandView w={w} input={a.input} tone={tone} onDone={(chat) => onAnswered(a.n, chat)} />
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
        onRemove={remove}
        fileError={fileError}
        voice={voice}
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
// sections, numbered.
function KeptAnswer({ b, w, tone, lang }: { b: Block[]; w: Words; tone: string; lang: string }) {
  const lead = b.find((x): x is Explanation => x.type === 'explanation');
  return (
    <div lang={lang} data-feed-answer className="fam-lesson flex flex-col gap-3">
      {lead && <DirectAnswerCard w={w} b={lead} />}
      {b.map((x, i) => (
        <TurnBlock key={i} b={x} w={w} tone={tone} lead={x === lead} />
      ))}
    </div>
  );
}

// A kept answer's block, drawn by the block renderer's own views (a check or practice is never kept).
function TurnBlock({ b, w, tone, lead = false }: { b: Block; w: Words; tone: string; lead?: boolean }) {
  switch (b.type) {
    case 'explanation':
      return <ExplanationView b={b} w={w} tone={tone} lead={lead} />;
    case 'worked_example':
      return <WorkedExampleView b={b} w={w} tone={tone} />;
    case 'key_points':
      return <KeyPointsView b={b} w={w} tone={tone} />;
    case 'diagram':
      return <DiagramView b={b} tone={tone} />;
    case 'mind_map':
      return <MindMapView b={b} w={w} tone={tone} />;
    case 'graph':
    case 'number_line':
    case 'fraction_model':
    case 'geometry':
    case 'simulation':
      return <InteractiveView b={b} w={w} tone={tone} />;
    case 'english_moment':
      return <EnglishMomentView b={b} w={w} tone={tone} />;
    case 'sources':
      return <SourcesView b={b} w={w} tone={tone} />;
    default:
      return null;
  }
}
