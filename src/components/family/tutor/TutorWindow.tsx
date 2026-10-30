'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Block } from '@/lib/family/blocks';
import { fill, type Words } from '@/lib/family/fill';
import type { Subject } from '@/lib/family/subjects';
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
  const stale = useRef(true);
  const slot = useRef<HTMLDivElement>(null);
  const historyHead = useRef<HTMLHeadingElement>(null);
  const uid = useId().replace(/:/g, '');
  const ids = { title: `${idPrefix}-${uid}-title`, slot: `${idPrefix}-${uid}-slot`, q: `${idPrefix}-${uid}-q` };

  // Bring the answer or the conversation into view (the composer may be far below, pinned over the chapters).
  const reveal = (focus?: HTMLElement | null) =>
    requestAnimationFrame(() => {
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      slot.current?.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
      focus?.focus({ preventScroll: true });
    });

  const loadTurns = useCallback(async () => {
    stale.current = false;
    setTurnsError(false);
    const res = await fetch(`/api/family/tutor?subject=${encodeURIComponent(subject)}`, { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
    const data = res?.ok ? ((await res.json().catch(() => null)) as { turns?: TutorTurn[] } | null) : null;
    if (!data || !Array.isArray(data.turns)) {
      stale.current = true;
      setTurnsError(true);
      return;
    }
    setTurns(data.turns);
  }, [subject]);

  useEffect(() => {
    if (view === 'history' && stale.current) void loadTurns();
  }, [view, loadTurns]);

  const onAnswered = useCallback(() => {
    stale.current = true;
  }, []);

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

  const send = () => {
    if (!canSend) return;
    const tutor = { subject, ...(reader ? { chapterKey: reader.chapterKey, blockId: reader.blockId } : {}), files: attached.flatMap((a) => (a.id ? [a.id] : [])) };
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
    <section data-tutor-window data-subject={subject} aria-labelledby={ids.title} className="flex flex-col gap-4">
      <h2 id={ids.title} className="sr-only">
        {w['fam.tutor.title']}
      </h2>
      {reader && (
        <p data-tutor-context className="self-start rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate ring-1 ring-slate/10">
          {fill(w['fam.tutor.doubtAbout'], { section: reader.section })}
        </p>
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
