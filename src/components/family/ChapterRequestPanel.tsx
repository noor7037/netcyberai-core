'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SOURCE_MODES, requestStudyStatus, type ChapterRequest, type SourceMode } from '@/lib/family/chapter-request-types';
import type { Words } from '@/lib/family/fill';
import { errorWords, familyApi } from './client';
import { StatusBadge } from './StatusBadge';
import { STUDY_STATUS_KEY } from '@/lib/family/study-status';

// Asking for a chapter, and choosing the source (S3, C376), in the parent area (parent mode). The parent names the
// chapter the catalog does not have and may add the book's chapter as a PDF; it is kept private for the NetCyberAI
// reviewer, who turns it into a chapter the child opens in Study once it has been reviewed and published. While it
// waits, Study shows Received, then Digitizing. Also: for each child and subject, which source Study reads (the board's
// catalog, the school's, or the parent's own). Every change is the parent's own tap.

type PanelChild = { childId: string; firstName: string; subjects: string[] };
const MAX_BYTES = 3 * 1024 * 1024;
const CTA = 'fam-cta fam-press flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-ink px-4 text-base font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60';
const QUIET = 'fam-press flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-off-white px-4 text-base font-bold text-slate ring-1 ring-slate/15 hover:bg-slate/5 disabled:cursor-not-allowed disabled:opacity-60';
const FIELD = 'min-h-[44px] w-full min-w-0 rounded-xl border border-slate/20 bg-white px-3 text-base text-slate focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/30';

export function ChapterRequestPanel({
  w,
  childList,
  requests: initial,
  modes: initialModes,
}: {
  w: Words;
  childList: PanelChild[];
  requests: ChapterRequest[];
  modes: Record<string, Record<string, SourceMode>>;
}) {
  const router = useRouter();
  const [childId, setChildId] = useState(childList[0]?.childId ?? '');
  const child = childList.find((c) => c.childId === childId) ?? childList[0];
  const [subject, setSubject] = useState(child?.subjects[0] ?? '');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [requests, setRequests] = useState(initial);
  const [modes, setModes] = useState(initialModes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  if (!child) return null;

  const errorText = (code: string) => w[`fam.request.err.${code}`] ?? errorWords(w, code);
  const mine = requests.filter((r) => r.childId === child.childId);
  const mode = modes[child.childId]?.[subject] ?? null;

  const choose = (nextChild: string) => {
    setChildId(nextChild);
    setSubject(childList.find((c) => c.childId === nextChild)?.subjects[0] ?? '');
    setError('');
    setNote('');
  };

  const send = async () => {
    setError('');
    setNote('');
    if (file && file.size > MAX_BYTES) return setError(errorText('too_big'));
    setBusy(true);
    let pdf: string | undefined;
    if (file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      pdf = btoa(binary);
    }
    const r = await familyApi<{ request: ChapterRequest }>('/api/family/chapter-request', 'POST', { childId: child.childId, subject, title, ...(pdf ? { pdf } : {}) });
    setBusy(false);
    if (!r.ok) return setError(errorText(r.error));
    setRequests((list) => [r.data.request, ...list]);
    setTitle('');
    setFile(null);
    if (fileInput.current) fileInput.current.value = '';
    setNote(w['fam.request.sent']);
    router.refresh();
  };

  const withdraw = async (requestId: string) => {
    setBusy(true);
    setError('');
    const r = await familyApi('/api/family/chapter-request', 'DELETE', { requestId });
    setBusy(false);
    if (!r.ok) return setError(errorText(r.error));
    setRequests((list) => list.filter((x) => x.requestId !== requestId));
    router.refresh();
  };

  const setMode = async (next: SourceMode | null) => {
    setBusy(true);
    setError('');
    const r = await familyApi('/api/family/subject-source', 'POST', { childId: child.childId, subject, mode: next });
    setBusy(false);
    if (!r.ok) return setError(errorText(r.error));
    setModes((m) => {
      const forChild = { ...(m[child.childId] ?? {}) };
      if (next === null) delete forChild[subject];
      else forChild[subject] = next;
      return { ...m, [child.childId]: forChild };
    });
    router.refresh();
  };

  return (
    <section data-chapter-request aria-labelledby="fam-chapter-request" className="fam-card fam-section fam-rise bg-white">
      <h2 id="fam-chapter-request" className="fam-h2 text-slate">
        {w['fam.request.title']}
      </h2>
      <p className="text-sm text-slate">{w['fam.request.lead']}</p>

      {childList.length > 1 && (
        <div role="group" aria-label={w['fam.request.child']} className="flex flex-wrap items-center gap-2 text-sm text-slate">
          <span>{w['fam.request.child']}</span>
          {childList.map((c) => (
            <button
              key={c.childId}
              type="button"
              aria-pressed={c.childId === child.childId}
              disabled={busy}
              onClick={() => choose(c.childId)}
              className={`fam-press min-h-[44px] rounded-full px-4 font-bold disabled:cursor-not-allowed disabled:opacity-60 ${c.childId === child.childId ? 'bg-ink text-white' : 'bg-white text-slate ring-1 ring-slate/15'}`}
            >
              {c.firstName}
            </button>
          ))}
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm font-semibold text-slate">
        {w['fam.request.subject']}
        <select value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy} className={FIELD}>
          {child.subjects.map((s) => (
            <option key={s} value={s}>
              {w[`fam.subject.${s}`] ?? s}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold text-slate">
        {w['fam.request.chapterName']}
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} disabled={busy} className={FIELD} />
      </label>

      <div className="flex flex-col gap-1 text-sm text-slate">
        <span className="font-semibold">{w['fam.request.pdf']}</span>
        <input ref={fileInput} type="file" accept="application/pdf" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label={w['fam.request.pdf']} className="min-h-[44px] text-sm" />
        <span>{w['fam.request.privacy']}</span>
      </div>

      <button type="button" onClick={send} disabled={busy || title.trim().length === 0} className={CTA} data-request-send>
        {w['fam.request.send']}
      </button>
      {error && (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger-text">
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="rounded-xl bg-emerald/10 px-3 py-2 text-sm font-semibold text-emerald-text">
          {note}
        </p>
      )}

      <h3 className="mt-1 text-base font-extrabold text-slate">{w['fam.request.yours']}</h3>
      {mine.length === 0 ? (
        <p className="text-sm text-slate">{w['fam.request.none']}</p>
      ) : (
        <ul data-request-list className="flex flex-col gap-2">
          {mine.map((r) => {
            const st = requestStudyStatus(r.status);
            return (
              <li key={r.requestId} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-off-white px-3 py-2">
                <span className="flex min-w-0 flex-col text-base font-bold text-slate">
                  <span>{r.title}</span>
                  <span className="text-sm font-semibold text-slate/80">{w[`fam.subject.${r.subject}`] ?? r.subject}</span>
                </span>
                <span className="flex items-center gap-2">
                  {st ? <StatusBadge status={st} label={w[STUDY_STATUS_KEY[st]]} /> : <span className="text-sm font-semibold text-slate/80">{w['fam.request.declined']}</span>}
                  {r.status === 'received' && (
                    <button type="button" onClick={() => withdraw(r.requestId)} disabled={busy} className={`${QUIET} !min-h-[44px] !px-3 text-sm`}>
                      {w['fam.request.withdraw']}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div role="group" aria-label={w['fam.request.sourceTitle']} data-source-mode className="mt-1 flex flex-col gap-2">
        <h3 className="text-base font-extrabold text-slate">{w['fam.request.sourceTitle']}</h3>
        <p className="text-sm text-slate">{w['fam.request.sourceLead']}</p>
        <div className="flex flex-wrap gap-2">
          {([null, ...SOURCE_MODES] as (SourceMode | null)[]).map((m) => (
            <button
              key={m ?? 'all'}
              type="button"
              aria-pressed={mode === m}
              disabled={busy}
              onClick={() => setMode(m)}
              className={`fam-press min-h-[44px] rounded-full px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 ${mode === m ? 'bg-ink text-white' : 'bg-white text-slate ring-1 ring-slate/15'}`}
            >
              {w[`fam.request.source.${m ?? 'all'}`]}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
