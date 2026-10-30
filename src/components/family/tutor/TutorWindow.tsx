'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Block } from '@/lib/family/blocks';
import { fill, type Words } from '@/lib/family/fill';
import { isSubject, type Subject } from '@/lib/family/subjects';
import { TUTOR_FILE_MAX_BYTES, TUTOR_FILES_PER_TURN, TUTOR_TEXT_MIN, sniffTutorFile, type TutorTurn } from '@/lib/family/tutor-shape';
import { DiagramView, EnglishMomentView, ExplanationView, KeyPointsView, SourcesView, WorkedExampleView } from '../blocks/BlockViews';
import { MindMapView } from '../blocks/MindMapView';
import { UnderstandView, type UnderstandInput } from '../UnderstandView';
import { Composer, type ComposerFile } from './Composer';

// The shared tutor window (S2, C375; docs/37 §4 Wave 2): one window for every question a child types, on the Study page
// and in the chapter reader's doubt drawer. W6-A (C395): one composer (Composer.tsx) pinned at the foot, and above it
// one place for what the composer brings: the answer being drawn (through Understand: the same consent, module switch,
// safety check and daily cap), or, from the composer's Conversation button, this child's earlier questions and
// answers in this subject, read from the server (the child is the one this phone chose). Study passes its chapters as
// `children`, between that place and the composer, so the composer stays pinned while the chapters scroll.
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
  children?: ReactNode;
};

type Attached = ComposerFile;
// A chat as the list shows it (src/lib/family/tutor.ts TutorChat).
type ChatRow = { chatId: string; title: string | null; turnCount: number; status: 'open' | 'full'; lastAt: string };
// The child turns a chat takes (CHAT_TURNS on the server).
const CHAT_TURNS = 30;

const postJson = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) }).catch(() => null);
const errorOf = async (res: Response | null) => (res ? String(((await res.json().catch(() => ({}))) as { error?: unknown }).error ?? 'network') : 'network');

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

export function TutorWindow({ w, subject, tone, voice = null, files = false, homework = false, reader = null, idPrefix = 'fam-tutor', pinned = 'dock', children }: Props) {
  const [view, setView] = useState<'ask' | 'history'>('ask');
  const [text, setText] = useState('');
  const [asked, setAsked] = useState<{ n: number; input: UnderstandInput } | null>(null);
  const [attached, setAttached] = useState<Attached[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [turns, setTurns] = useState<TutorTurn[] | null>(null);
  const [turnsError, setTurnsError] = useState(false);
  // W9-A (C406): the child's chats in this subject and the one asked in (null: none yet; the first answer opens one).
  const [chats, setChats] = useState<ChatRow[] | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  // W10 (C411): a chat whose first answer the server decided is in another subject moved there; the window then lists
  // that subject's chats with this chat open, until the subject tab changes. The next question still goes to this chat.
  const [moved, setMoved] = useState<{ from: Subject; to: Subject } | null>(null);
  const listed: Subject = moved && moved.from === subject ? moved.to : subject;
  const reopen = useRef<string | null>(null);
  const stale = useRef(true);
  const root = useRef<HTMLElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const historyHead = useRef<HTMLHeadingElement>(null);
  const uid = useId().replace(/:/g, '');
  const ids = { title: `${idPrefix}-${uid}-title`, slot: `${idPrefix}-${uid}-slot`, q: `${idPrefix}-${uid}-q`, chats: `${idPrefix}-${uid}-chats` };
  const subjectName = w[`fam.subject.${listed}`] ?? listed;
  const current = chats?.find((c) => c.chatId === chatId) ?? null;
  const full = current?.status === 'full';

  // Bring the answer or the conversation into view (the composer may be far below, pinned over the chapters).
  const reveal = (focus?: HTMLElement | null) =>
    requestAnimationFrame(() => {
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      slot.current?.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
      focus?.focus({ preventScroll: true });
    });

  // The chats (and, with `withTurns`, the turns of the chat shown). The server answers for the chat named when it is
  // this child's own, else the most recently used one.
  const fetchChats = useCallback(
    async (chat: string | null, withTurns: boolean) => {
      const q = `subject=${encodeURIComponent(listed)}${chat ? `&chat=${encodeURIComponent(chat)}` : ''}${withTurns ? '' : '&turns=0'}`;
      const res = await fetch(`/api/family/tutor?${q}`, { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
      const data = res?.ok ? ((await res.json().catch(() => null)) as { chats?: ChatRow[]; chatId?: string | null; turns?: TutorTurn[] } | null) : null;
      if (!data || !Array.isArray(data.chats)) return null;
      setChats(data.chats);
      setChatId(data.chatId ?? null);
      return data;
    },
    [listed]
  );

  const loadTurns = useCallback(
    async (chat: string | null) => {
      stale.current = false;
      setTurnsError(false);
      const data = await fetchChats(chat, true);
      if (!data || !Array.isArray(data.turns)) {
        stale.current = true;
        setTurnsError(true);
        return;
      }
      setTurns(data.turns);
    },
    [fetchChats]
  );

  // The list (and whether the chat is full) as the window opens.
  useEffect(() => {
    const keep = reopen.current;
    reopen.current = null;
    void fetchChats(keep, false);
  }, [fetchChats]);

  useEffect(() => {
    if (view === 'history' && stale.current) void loadTurns(chatId);
  }, [view, loadTurns, chatId]);

  // An answer kept (or refused because the chat filled up): the list and the chat's state are read again. W10 (C411):
  // the answer names the chat it was kept in and that chat's subject; another subject's chat is listed under it.
  const onAnswered = useCallback(
    (chat?: { chatId: string; subject: string }) => {
      stale.current = true;
      if (chat && chat.subject !== listed && isSubject(chat.subject)) {
        reopen.current = chat.chatId;
        setChatId(chat.chatId);
        setMoved({ from: subject, to: chat.subject });
        return;
      }
      void fetchChats(chat?.chatId ?? chatId, false);
    },
    [fetchChats, chatId, listed, subject]
  );

  const pickChat = (id: string) => {
    if (!id) return;
    if (id !== chatId) {
      setChatId(id);
      setTurns(null);
      setAsked(null);
      stale.current = true;
    }
    setView('history');
    reveal(historyHead.current);
  };

  const startNew = async () => {
    // A new chat opens in the subject tab's own subject (a moved chat's list is left).
    const res = await postJson('/api/family/tutor', { subject });
    const made = res?.ok ? ((await res.json().catch(() => null)) as { chatId?: string } | null) : null;
    if (!made?.chatId) return;
    setAsked(null);
    setTurns([]);
    stale.current = false;
    setView('ask');
    if (listed !== subject) {
      reopen.current = made.chatId;
      setChatId(made.chatId);
      setMoved(null);
    } else await fetchChats(made.chatId, false);
    document.getElementById(ids.q)?.focus();
  };

  // A locale for the chats' dates: the language of the page around the window.
  const locale = () => (root.current?.closest('[lang]')?.getAttribute('lang') === 'hi' ? 'hi-IN' : 'en-IN');
  const when = (iso: string) => new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  const titleOf = (c: ChatRow) => c.title ?? w['fam.chat.new'];

  const busy = attached.some((a) => a.state !== 'ready');
  const canSend = text.trim().length >= TUTOR_TEXT_MIN && !busy && !full;

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

  const send = () => {
    if (!canSend) return;
    const tutor = { subject, ...(chatId ? { chatId } : {}), ...(reader ? { chapterKey: reader.chapterKey, blockId: reader.blockId } : {}), files: attached.flatMap((a) => (a.id ? [a.id] : [])) };
    setAsked((prev) => ({ n: (prev?.n ?? 0) + 1, input: { kind: 'question', text: text.trim(), tutor } }));
    setText('');
    setAttached([]);
    setFileError(null);
    setView('ask');
    reveal();
  };

  const toggleHistory = () => {
    if (view === 'history') return setView('ask');
    setView('history');
    reveal(historyHead.current);
  };

  return (
    <section ref={root} data-tutor-window data-subject={subject} data-listed={listed} aria-labelledby={ids.title} className="flex flex-col gap-4">
      <h2 id={ids.title} className="sr-only">
        {w['fam.tutor.title']}
      </h2>
      {reader && (
        <p data-tutor-context className="self-start rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate ring-1 ring-slate/10">
          {fill(w['fam.tutor.doubtAbout'], { section: reader.section })}
        </p>
      )}
      {chats && chats.length > 0 && (
        <div data-tutor-chats className="fam-surface flex flex-col gap-2 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 id={ids.chats} className="min-w-0 px-1 text-base font-extrabold text-slate">
              {fill(w['fam.chat.list'], { subject: subjectName })}
            </h3>
            <button type="button" onClick={() => void startNew()} data-chat-new className="fam-press flex min-h-[44px] shrink-0 items-center gap-1 rounded-full bg-royal-deep px-4 text-sm font-bold text-white shadow-md">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {w['fam.chat.new']}
            </button>
          </div>
          {/* Under 480 px the list is a drop-down; wider, a list of titles and dates. */}
          <label className="flex flex-col min-[480px]:hidden">
            <span className="sr-only">{w['fam.chat.pick']}</span>
            <select value={chatId ?? ''} onChange={(e) => pickChat(e.target.value)} data-chat-select className="min-h-[44px] w-full rounded-xl bg-off-white px-3 text-base text-slate ring-1 ring-slate/15">
              {chatId === null && <option value="">{w['fam.chat.pick']}</option>}
              {chats.map((c) => (
                <option key={c.chatId} value={c.chatId}>
                  {`${titleOf(c)} · ${when(c.lastAt)}${c.status === 'full' ? ` · ${w['fam.chat.fullBadge']}` : ''}`}
                </option>
              ))}
            </select>
          </label>
          <ul aria-labelledby={ids.chats} data-chat-list className="hidden max-h-64 flex-col gap-1 overflow-y-auto min-[480px]:flex">
            {chats.map((c) => {
              const on = c.chatId === chatId;
              return (
                <li key={c.chatId}>
                  <button
                    type="button"
                    onClick={() => pickChat(c.chatId)}
                    aria-current={on ? 'true' : undefined}
                    data-chat={c.status}
                    className={`fam-press flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-base ${on ? 'bg-royal-deep text-white' : 'text-slate hover:bg-off-white'}`}
                  >
                    <span className="min-w-0 truncate font-bold">{titleOf(c)}</span>
                    <span className="flex shrink-0 items-center gap-2 text-sm">
                      {c.status === 'full' && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${on ? 'bg-white text-royal-deep' : 'bg-off-white text-slate'}`}>{w['fam.chat.fullBadge']}</span>}
                      <span className="sr-only">{fill(w['fam.chat.questions'], { n: String(c.turnCount), max: String(CHAT_TURNS) })}, </span>
                      <time dateTime={c.lastAt}>{when(c.lastAt)}</time>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div id={ids.slot} ref={slot} data-tutor-slot={view} className={`scroll-mt-4 flex-col gap-3 ${(view === 'ask' && !asked) ? 'hidden' : 'flex'}`}>
        {asked && (
          <div hidden={view !== 'ask'} className={view === 'ask' ? 'flex flex-col gap-3' : 'hidden'}>
            <UnderstandView key={asked.n} w={w} input={asked.input} tone={tone} onDone={onAnswered} />
          </div>
        )}
        {view === 'history' && (
          <div data-tutor-history-panel className="fam-acc-in flex flex-col gap-3" aria-busy={turns === null && !turnsError}>
            <div className="flex items-center justify-between gap-2">
              <h3 ref={historyHead} tabIndex={-1} className="px-1 text-lg font-extrabold text-slate focus:outline-none">
                {w['fam.tutor.tabConversation']}
              </h3>
              <button type="button" onClick={() => setView('ask')} data-tutor-history-close className="fam-press flex min-h-[44px] items-center rounded-full bg-white px-4 text-sm font-bold text-slate ring-1 ring-slate/15 hover:bg-off-white">
                {w['fam.tutor.close']}
              </button>
            </div>
            {turnsError && (
              <p role="status" className="fam-surface bg-white p-4 text-sm text-slate">
                {w['fam.err.network']}
              </p>
            )}
            {turns === null && !turnsError && <p className="fam-surface bg-white p-4 text-sm text-slate">{w['fam.tutor.loading']}</p>}
            {turns && turns.length === 0 && (
              <p data-tutor-empty className="fam-surface bg-white p-4 text-base text-slate">
                {w['fam.tutor.empty']}
              </p>
            )}
            {turns && turns.length > 0 && (
              <ol data-tutor-turns className="flex flex-col gap-3">
                {turns.map((t) => (
                  <li key={t.id} data-turn={t.role}>
                    {t.role === 'child' ? (
                      <div className="ml-6 flex flex-col gap-2 rounded-2xl rounded-br-md bg-royal-deep p-4 text-white sm:ml-16">
                        <p className="text-xs font-bold uppercase tracking-wide text-white">{w['fam.tutor.you']}</p>
                        <p lang={t.lang} className="whitespace-pre-wrap break-words text-base">
                          {t.text}
                        </p>
                        {t.chapterKey && <p className="text-xs font-semibold text-white">{w['fam.tutor.fromReader']}</p>}
                        {t.files.length > 0 && (
                          <ul className="flex flex-wrap gap-2">
                            {t.files.map((f) => (
                              <li key={f.id}>
                                <a
                                  href={`/api/family/tutor/files/${encodeURIComponent(f.id)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex min-h-[44px] items-center gap-1 rounded-xl bg-white px-3 text-sm font-bold text-royal-deep"
                                >
                                  {f.mime === 'application/pdf' ? w['fam.tutor.filePdf'] : w['fam.tutor.filePhoto']}
                                  <span className="sr-only">: {w['fam.tutor.openFile']}</span>
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <p className="px-1 text-xs font-bold uppercase tracking-wide text-slate">{w['fam.tutor.tutorSaid']}</p>
                        <div lang={t.lang} className="flex flex-col gap-2">
                          {t.blocks.map((b, i) => (
                            <TurnBlock key={i} b={b} w={w} tone={tone} />
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
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
        historyOpen={view === 'history'}
        historyFor={ids.slot}
        onHistory={toggleHistory}
        locked={full}
        notice={
          full ? (
            <div role="status" data-chat-full className="flex flex-col gap-2 rounded-2xl bg-white p-3 text-base font-semibold text-slate shadow-sm ring-1 ring-slate/10 min-[480px]:flex-row min-[480px]:items-center min-[480px]:justify-between">
              <p>{fill(w['fam.chat.full'], { subject: subjectName })}</p>
              <button type="button" onClick={() => void startNew()} data-chat-start-new className="fam-press flex min-h-[44px] shrink-0 items-center justify-center rounded-full bg-royal-deep px-4 text-sm font-bold text-white shadow-md">
                {w['fam.chat.startNew']}
              </button>
            </div>
          ) : null
        }
      />
    </section>
  );
}

// A kept answer's block, drawn by the block renderer's own views (a check or practice is never kept).
function TurnBlock({ b, w, tone }: { b: Block; w: Words; tone: string }) {
  switch (b.type) {
    case 'explanation':
      return <ExplanationView b={b} w={w} tone={tone} />;
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
