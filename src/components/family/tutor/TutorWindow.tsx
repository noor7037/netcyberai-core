'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import type { Block } from '@/lib/family/blocks';
import { fill, type Words } from '@/lib/family/fill';
import { subjectTheme } from '@/lib/family/subject-theme';
import type { Subject } from '@/lib/family/subjects';
import { TUTOR_FILE_MAX_BYTES, TUTOR_FILES_PER_TURN, TUTOR_FILE_TYPES, TUTOR_TEXT_MAX, TUTOR_TEXT_MIN, sniffTutorFile, type TutorFileType, type TutorTurn } from '@/lib/family/tutor-shape';
import { DiagramView, EnglishMomentView, ExplanationView, KeyPointsView, SourcesView, WorkedExampleView } from '../blocks/BlockViews';
import { UnderstandView, type UnderstandInput } from '../UnderstandView';
import { VoiceInput } from '../VoiceInput';

// The shared tutor window (S2, C375; docs/37 §4 Wave 2): one window for every question a child types, on the Study page
// and in the chapter reader's doubt drawer. An input rail (the question, the microphone when the parent said yes to
// voice, Attach file when the parent said yes to photo questions, Send) and two tabs: Ask, the answer being drawn
// (through Understand: the same consent, module switch, safety check and daily cap), and Conversation, this child's
// earlier questions and answers in this subject, read from the server (the child is the one this phone chose).
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
};

type Attached = { key: string; name: string; mime: TutorFileType; state: 'sending' | 'checking' | 'ready'; id: string | null };

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

export function TutorWindow({ w, subject, tone, voice = null, files = false, homework = false, reader = null, idPrefix = 'fam-tutor' }: Props) {
  const [tab, setTab] = useState<'ask' | 'conversation'>('ask');
  const [text, setText] = useState('');
  const [asked, setAsked] = useState<{ n: number; input: UnderstandInput } | null>(null);
  const [attached, setAttached] = useState<Attached[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [turns, setTurns] = useState<TutorTurn[] | null>(null);
  const [turnsError, setTurnsError] = useState(false);
  const stale = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const uid = useId().replace(/:/g, '');
  const ids = { tabs: `${idPrefix}-${uid}`, ask: `${idPrefix}-${uid}-ask`, conv: `${idPrefix}-${uid}-conv`, q: `${idPrefix}-${uid}-q` };

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
    if (tab === 'conversation' && stale.current) void loadTurns();
  }, [tab, loadTurns]);

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
    setTab('ask');
  };

  const tabClass = (on: boolean) => `fam-press flex min-h-[44px] flex-1 items-center justify-center rounded-2xl px-3 text-sm font-bold ${on ? 'bg-royal-deep text-white shadow-md' : 'bg-white text-slate hover:bg-off-white'}`;

  return (
    <section data-tutor-window data-subject={subject} aria-labelledby={`${ids.tabs}-title`} className="flex flex-col gap-3">
      <h2 id={`${ids.tabs}-title`} className="sr-only">
        {w['fam.tutor.title']}
      </h2>
      <div role="tablist" aria-label={w['fam.tutor.tabs']} className="fam-card flex gap-2 bg-white p-2">
        <button type="button" role="tab" id={`${ids.ask}-tab`} aria-controls={ids.ask} aria-selected={tab === 'ask'} onClick={() => setTab('ask')} className={tabClass(tab === 'ask')} data-tutor-tab="ask">
          {w['fam.tutor.tabAsk']}
        </button>
        <button type="button" role="tab" id={`${ids.conv}-tab`} aria-controls={ids.conv} aria-selected={tab === 'conversation'} onClick={() => setTab('conversation')} className={tabClass(tab === 'conversation')} data-tutor-tab="conversation">
          {w['fam.tutor.tabConversation']}
        </button>
      </div>

      <div role="tabpanel" id={ids.ask} aria-labelledby={`${ids.ask}-tab`} hidden={tab !== 'ask'} className={`${tab === 'ask' ? 'flex' : 'hidden'} flex-col gap-3`}>
        {reader && (
          <p data-tutor-context className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate ring-1 ring-slate/10">
            {fill(w['fam.tutor.doubtAbout'], { section: reader.section })}
          </p>
        )}
        {asked && <UnderstandView key={asked.n} w={w} input={asked.input} tone={tone} onDone={onAnswered} />}
        <form
          data-tutor-rail
          className="fam-card flex flex-col gap-3 bg-white p-4 sm:p-5"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <Textarea id={ids.q} label={w['fam.tutor.question']} helperText={w['fam.tutor.questionHelp']} maxLength={TUTOR_TEXT_MAX} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          {attached.length > 0 && (
            <ul data-tutor-files className="flex flex-col gap-2">
              {attached.map((a) => (
                <li key={a.key} data-tutor-file={a.state} className="flex min-h-[44px] items-center gap-2 rounded-2xl bg-off-white px-3 text-sm text-slate">
                  <span className="font-bold">{a.mime === 'application/pdf' ? w['fam.tutor.filePdf'] : w['fam.tutor.filePhoto']}</span>
                  <span className="min-w-0 flex-1 truncate">{a.state === 'sending' ? w['fam.tutor.fileSending'] : a.state === 'checking' ? w['fam.tutor.fileChecking'] : a.name}</span>
                  <button type="button" onClick={() => remove(a)} aria-label={w['fam.tutor.removeFile']} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate hover:bg-white">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {fileError && (
            <p role="alert" data-tutor-file-error className="rounded-2xl bg-off-white px-3 py-2 text-sm font-semibold text-slate">
              {fileError}
            </p>
          )}
          {voice && <VoiceInput w={w} secondsLeft={voice.secondsLeft} onText={(heard) => setText((t) => (t.trim() ? `${t.trim()} ${heard}` : heard).slice(0, TUTOR_TEXT_MAX))} />}
          <div className="flex flex-wrap items-center gap-2">
            {files && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept={TUTOR_FILE_TYPES.join(',')}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void attach(f);
                  }}
                />
                <button
                  type="button"
                  data-tutor-attach
                  onClick={() => fileInput.current?.click()}
                  disabled={attached.length >= TUTOR_FILES_PER_TURN}
                  aria-describedby={`${ids.q}-attach-help`}
                  className="fam-press flex min-h-[48px] items-center gap-2 rounded-2xl bg-white px-4 text-sm font-bold text-royal-deep ring-1 ring-royal/20 hover:bg-off-white disabled:opacity-50"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.5 3.5 0 0 1 5 5l-8.6 8.6a2 2 0 0 1-2.8-2.8l7.9-7.9" />
                  </svg>
                  {w['fam.tutor.attach']}
                </button>
              </>
            )}
            <Button type="submit" disabled={!canSend} data-tutor-send className={`fam-cta fam-press ml-auto min-h-[48px] rounded-2xl bg-royal-deep px-6 font-extrabold text-white ${subjectTheme(subject).tile}`}>
              {w['fam.tutor.send']}
            </Button>
          </div>
          {files && (
            <p id={`${ids.q}-attach-help`} className="text-xs text-slate/80">
              {w['fam.tutor.attachHelp']}
            </p>
          )}
        </form>
        {homework && (
          <p data-tutor-homework className="flex flex-wrap items-center gap-x-2 rounded-2xl bg-white px-4 py-3 text-sm text-slate ring-1 ring-slate/10">
            <span>{w['fam.tutor.homeworkNote']}</span>
            <Link href="/family/study/homework" className="inline-flex min-h-[44px] items-center font-bold text-royal-deep underline-offset-4 hover:underline">
              {w['fam.tutor.homeworkOpen']} <span aria-hidden="true">→</span>
            </Link>
          </p>
        )}
      </div>

      <div role="tabpanel" id={ids.conv} aria-labelledby={`${ids.conv}-tab`} hidden={tab !== 'conversation'} className={`${tab === 'conversation' ? 'flex' : 'hidden'} flex-col gap-3`} aria-busy={turns === null && !turnsError}>
        {turnsError && (
          <p role="status" className="fam-card bg-white p-4 text-sm text-slate">
            {w['fam.err.network']}
          </p>
        )}
        {turns === null && !turnsError && <p className="fam-card bg-white p-4 text-sm text-slate">{w['fam.tutor.loading']}</p>}
        {turns && turns.length === 0 && (
          <p data-tutor-empty className="fam-card bg-white p-4 text-base text-slate">
            {w['fam.tutor.empty']}
          </p>
        )}
        {turns && turns.length > 0 && (
          <ol data-tutor-turns className="flex flex-col gap-3">
            {turns.map((t) => (
              <li key={t.id} data-turn={t.role}>
                {t.role === 'child' ? (
                  <div className="ml-6 flex flex-col gap-2 rounded-3xl rounded-br-md bg-royal-deep p-4 text-white sm:ml-16">
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
                              className="inline-flex min-h-[44px] items-center gap-1 rounded-2xl bg-white px-3 text-sm font-bold text-royal-deep"
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
