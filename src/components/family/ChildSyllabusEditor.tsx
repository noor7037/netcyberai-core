'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fill, type Words } from '@/lib/family/fill';
import type { StoredSyllabus } from '@/lib/family/child-syllabus';
import { errorWords, familyApi } from './client';
import { FamIcon } from './FamIcon';

// A parent adds their child's own syllabus (C230-AB), in the parent area (parent mode). For a child and one of the
// class's subjects: photos of the book's contents pages (each made smaller here, sent once, read for the chapter names,
// and not kept), or the parent types the chapters. Either way the result is a draft list the parent checks: rename,
// remove, move up or down, add a chapter or a topic. Nothing reaches the child until Save; a saved syllabus can be
// edited or deleted later. Every change is the parent's own tap; nothing here uses a browser dialog.

type EditorChild = { childId: string; firstName: string; subjects: string[] };
type Line = { key: number; title: string };
type EditChapter = Line & { topics: Line[] };
type Editing = { syllabusId: string | null; chapters: EditChapter[] };

const MAX_PHOTOS = 5;
const MAX_CHAPTERS = 60;
const MAX_TOPICS = 40;
const MAX_SIDE = 2000;

// D1's call to action and quiet button (as in the homework helper), and the small icon buttons of a line.
const CTA = 'fam-cta fam-press flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-royal-deep bg-gradient-to-r from-royal to-violet px-4 text-base font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60';
const QUIET = 'fam-press flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-off-white px-4 text-base font-bold text-slate ring-1 ring-slate/15 hover:bg-slate/5 disabled:cursor-not-allowed disabled:opacity-60';
const ICON_BUTTON = 'fam-press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate hover:bg-slate/5 disabled:cursor-not-allowed disabled:opacity-40';
const LINK_BUTTON = 'fam-press min-h-[44px] self-start rounded-xl px-2 text-sm font-semibold text-royal underline-offset-4 hover:underline';
const FIELD = 'min-h-[44px] w-full min-w-0 flex-1 rounded-xl border border-slate/20 bg-white px-3 text-base text-slate focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/30';

const PATH = { up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6', remove: 'M6 6l12 12M18 6L6 18', add: 'M12 5v14M5 12h14' } as const;
function Glyph({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

// A JPEG no larger than 2000 px on its longer side, as base64: small print stays readable, and the request stays under
// the server's limit.
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('no image');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const swap = <T,>(list: T[], i: number, by: -1 | 1): T[] => {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const copy = [...list];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
};

export function ChildSyllabusEditor({ w, childList, syllabi: initial, studyCore }: { w: Words; childList: EditorChild[]; syllabi: StoredSyllabus[]; studyCore: boolean }) {
  const router = useRouter();
  const [childId, setChildId] = useState(childList[0]?.childId ?? '');
  const child = childList.find((c) => c.childId === childId) ?? childList[0];
  const [subject, setSubject] = useState(child?.subjects[0] ?? '');
  const [syllabi, setSyllabi] = useState(initial);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [justAdded, setJustAdded] = useState<number | null>(null);
  const nextKey = useRef(1);
  const photoInput = useRef<HTMLInputElement>(null);
  if (!child) return null;

  const mine = syllabi.filter((s) => s.childId === child.childId && s.subject === subject);
  const draft = mine.find((s) => s.status === 'draft') ?? null;
  const saved = mine.find((s) => s.status === 'confirmed') ?? null;
  const errorText = (code: string) => w[`fam.syllabus.err.${code}`] ?? errorWords(w, code);
  const key = () => nextKey.current++;
  const toLines = (chapters: StoredSyllabus['chapters']): EditChapter[] => chapters.map((c) => ({ key: key(), title: c.title, topics: c.topics.map((t) => ({ key: key(), title: t.title })) }));
  const toEditing = (s: StoredSyllabus): Editing => ({ syllabusId: s.syllabusId, chapters: toLines(s.chapters) });
  const keep = (s: StoredSyllabus, replacesAll: boolean) =>
    setSyllabi((list) => [...list.filter((x) => !(x.childId === s.childId && x.subject === s.subject && (replacesAll || x.status === s.status))), s]);
  const choose = (nextChild: string, nextSubject: string) => {
    setChildId(nextChild);
    setSubject(nextSubject);
    setError('');
    setNote('');
    setConfirmDelete(false);
  };

  // Each photo in its own request, in order; the first starts a draft (or joins the end of the draft being checked),
  // the next ones join its end. What the parent already changed in the open draft is kept: only the new chapters are
  // added to it.
  const readPhotos = async (files: FileList | null) => {
    const into = editing && draft && editing.syllabusId === draft.syllabusId ? draft : null;
    const all = Array.from(files ?? []);
    if (photoInput.current) photoInput.current.value = '';
    if (all.length === 0) return;
    const room = Math.max(0, MAX_PHOTOS - (into?.photos ?? 0));
    const list = all.slice(0, room);
    setError(all.length > room ? w['fam.syllabus.err.too_many_photos'] : '');
    setNote('');
    let id = into?.syllabusId ?? null;
    let latest: StoredSyllabus | null = null;
    for (let i = 0; i < list.length; i++) {
      setBusy(fill(w['fam.syllabus.reading'], { n: i + 1, total: list.length }));
      let photo: string;
      try {
        photo = await shrink(list[i]);
      } catch {
        setError(w['fam.syllabus.err.not_a_photo']);
        break;
      }
      const r = await familyApi<{ syllabus: StoredSyllabus }>('/api/family/syllabus/read', 'POST', { childId: child.childId, subject, photo, syllabusId: id ?? undefined });
      if (!r.ok) {
        setError(errorText(r.error));
        break;
      }
      latest = r.data.syllabus;
      id = latest.syllabusId;
    }
    setBusy(null);
    if (latest) {
      const got = latest;
      keep(got, false);
      setEditing((e) => (into && e ? { syllabusId: got.syllabusId, chapters: [...e.chapters, ...toLines(got.chapters.slice(into.chapters.length))] } : toEditing(got)));
      router.refresh();
    }
  };

  const save = async () => {
    if (!editing) return;
    setError('');
    setBusy(w['fam.syllabus.saving']);
    const chapters = editing.chapters.map((c) => ({ title: c.title.trim(), topics: c.topics.map((t) => ({ title: t.title.trim() })) }));
    const r = await familyApi<{ syllabus: StoredSyllabus }>('/api/family/syllabus', 'POST', { childId: child.childId, subject, syllabusId: editing.syllabusId ?? undefined, chapters });
    setBusy(null);
    if (!r.ok) return setError(errorText(r.error));
    keep(r.data.syllabus, true);
    setEditing(null);
    setNote(w['fam.syllabus.savedNote']);
    router.refresh();
  };

  const remove = async (s: StoredSyllabus) => {
    setError('');
    const r = await familyApi('/api/family/syllabus', 'DELETE', { syllabusId: s.syllabusId });
    if (!r.ok && r.error !== 'not_found') return setError(errorText(r.error));
    setSyllabi((list) => list.filter((x) => x.syllabusId !== s.syllabusId));
    setConfirmDelete(false);
    setEditing(null);
    router.refresh();
  };

  const setChapters = (fn: (c: EditChapter[]) => EditChapter[]) => setEditing((e) => (e ? { ...e, chapters: fn(e.chapters) } : e));
  const setTopics = (ci: number, fn: (t: Line[]) => Line[]) => setChapters((cs) => cs.map((c, i) => (i === ci ? { ...c, topics: fn(c.topics) } : c)));
  const ready = !!editing && editing.chapters.length > 0 && editing.chapters.every((c) => c.title.trim() && c.topics.every((t) => t.title.trim()));
  const topicCount = (s: StoredSyllabus) => s.chapters.reduce((n, c) => n + c.topics.length, 0);

  return (
    <section data-child-syllabus aria-labelledby="fam-child-syllabus" className="fam-card fam-rise mt-4 flex flex-col gap-3 bg-white p-4 sm:p-5">
      <h2 id="fam-child-syllabus" className="text-lg font-extrabold text-slate">
        {w['fam.syllabus.title']}
      </h2>
      <p className="text-sm text-slate">{w['fam.syllabus.lead']}</p>

      {childList.length > 1 && (
        <div role="group" aria-label={w['fam.syllabus.child']} className="flex flex-wrap items-center gap-2 text-sm text-slate">
          <span>{w['fam.syllabus.child']}</span>
          {childList.map((c) => (
            <button
              key={c.childId}
              type="button"
              aria-pressed={c.childId === child.childId}
              disabled={!!editing || !!busy}
              onClick={() => choose(c.childId, c.subjects[0] ?? '')}
              className={`fam-press min-h-[44px] rounded-full px-4 font-bold disabled:cursor-not-allowed disabled:opacity-60 ${c.childId === child.childId ? 'bg-royal text-white' : 'bg-white text-slate ring-1 ring-slate/15'}`}
            >
              {c.firstName}
            </button>
          ))}
        </div>
      )}
      <div role="group" aria-label={w['fam.syllabus.subject']} className="flex flex-wrap items-center gap-2 text-sm text-slate">
        <span>{w['fam.syllabus.subject']}</span>
        {child.subjects.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={s === subject}
            disabled={!!editing || !!busy}
            onClick={() => choose(child.childId, s)}
            className={`fam-press min-h-[44px] rounded-full px-4 font-bold disabled:cursor-not-allowed disabled:opacity-60 ${s === subject ? 'bg-royal text-white' : 'bg-white text-slate ring-1 ring-slate/15'}`}
          >
            {w[`fam.subject.${s}`] ?? s}
          </button>
        ))}
      </div>

      {!studyCore && <p className="rounded-2xl bg-off-white px-3 py-2 text-sm text-slate">{w['fam.syllabus.consent']}</p>}

      {!editing && saved && (
        <div data-syllabus-saved className="flex flex-col gap-2 rounded-2xl bg-off-white p-3">
          <p className="text-base font-bold text-slate">{fill(w['fam.syllabus.count'], { chapters: saved.chapters.length, topics: topicCount(saved) })}</p>
          <ol className="flex list-decimal flex-col gap-1 pl-6 text-sm text-slate">
            {saved.chapters.map((c) => (
              <li key={c.itemId}>
                {c.title}
                {c.topics.length > 0 && <span className="text-slate/80"> · {c.topics.map((t) => t.title).join(', ')}</span>}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-1">
            {studyCore && (
              <button type="button" className={LINK_BUTTON} onClick={() => setEditing(toEditing(saved))}>
                {w['fam.syllabus.edit']}
              </button>
            )}
            <button type="button" className={LINK_BUTTON} onClick={() => setConfirmDelete(true)}>
              {w['fam.syllabus.delete']}
            </button>
          </div>
          {confirmDelete && (
            <div className="flex flex-col gap-2 rounded-xl bg-white p-3 ring-1 ring-red-200">
              <p className="text-sm text-slate">{fill(w['fam.syllabus.deleteConfirm'], { subject: w[`fam.subject.${subject}`] ?? subject })}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={QUIET} onClick={() => void remove(saved)}>
                  {w['fam.syllabus.deleteYes']}
                </button>
                <button type="button" className={QUIET} onClick={() => setConfirmDelete(false)}>
                  {w['fam.common.cancel']}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!editing && draft && (
        <div data-syllabus-draft className="flex flex-col gap-2 rounded-2xl bg-sunshine/30 p-3">
          <p className="text-sm font-semibold text-slate">{w['fam.syllabus.draftWaiting']}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={CTA} onClick={() => setEditing(toEditing(draft))}>
              {w['fam.syllabus.check']}
            </button>
            <button type="button" className={QUIET} onClick={() => void remove(draft)}>
              {w['fam.syllabus.discard']}
            </button>
          </div>
        </div>
      )}

      {!editing && !draft && studyCore && (
        <div className="flex flex-col gap-2">
          {!saved && <p className="text-sm text-slate">{w['fam.syllabus.none']}</p>}
          <p className="text-base font-bold text-slate">{saved ? w['fam.syllabus.replace'] : w['fam.syllabus.add']}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" disabled={!!busy} onClick={() => photoInput.current?.click()} className={CTA}>
              <FamIcon name="camera" className="h-5 w-5" />
              {w['fam.syllabus.fromPhotos']}
            </button>
            {!saved && (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => {
                  const k = key();
                  setEditing({ syllabusId: null, chapters: [{ key: k, title: '', topics: [] }] });
                  setJustAdded(k);
                  setNote('');
                }}
                className={QUIET}
              >
                {w['fam.syllabus.typeIt']}
              </button>
            )}
          </div>
          <p className="flex items-start gap-2 text-sm text-slate">
            <span className="mt-0.5 shrink-0 text-emerald-text">
              <FamIcon name="shield" className="h-4 w-4" />
            </span>
            {w['fam.syllabus.privacy']}
          </p>
        </div>
      )}
      <input
        ref={photoInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void readPhotos(e.target.files)}
      />

      {editing && (
        <div data-syllabus-editor className="flex flex-col gap-3">
          <p className="rounded-2xl bg-off-white px-3 py-2 text-sm text-slate">{w['fam.syllabus.draftNote']}</p>
          <ol className="flex flex-col gap-3">
            {editing.chapters.map((c, ci) => (
              <li key={c.key} className="flex flex-col gap-2 rounded-2xl bg-off-white p-3">
                <div className="flex items-center gap-1">
                  <input
                    aria-label={fill(w['fam.syllabus.chapter'], { n: ci + 1 })}
                    placeholder={fill(w['fam.syllabus.chapter'], { n: ci + 1 })}
                    value={c.title}
                    maxLength={200}
                    autoFocus={c.key === justAdded}
                    onChange={(e) => setChapters((cs) => cs.map((x, i) => (i === ci ? { ...x, title: e.target.value } : x)))}
                    className={`${FIELD} font-bold`}
                  />
                  <button type="button" className={ICON_BUTTON} disabled={ci === 0} aria-label={fill(w['fam.syllabus.moveUp'], { title: c.title || fill(w['fam.syllabus.chapter'], { n: ci + 1 }) })} onClick={() => setChapters((cs) => swap(cs, ci, -1))}>
                    <Glyph d={PATH.up} />
                  </button>
                  <button
                    type="button"
                    className={ICON_BUTTON}
                    disabled={ci === editing.chapters.length - 1}
                    aria-label={fill(w['fam.syllabus.moveDown'], { title: c.title || fill(w['fam.syllabus.chapter'], { n: ci + 1 }) })}
                    onClick={() => setChapters((cs) => swap(cs, ci, 1))}
                  >
                    <Glyph d={PATH.down} />
                  </button>
                  <button type="button" className={ICON_BUTTON} aria-label={fill(w['fam.syllabus.removeItem'], { title: c.title || fill(w['fam.syllabus.chapter'], { n: ci + 1 }) })} onClick={() => setChapters((cs) => cs.filter((_, i) => i !== ci))}>
                    <Glyph d={PATH.remove} />
                  </button>
                </div>
                {c.topics.length > 0 && (
                  <ul className="flex flex-col gap-2 pl-4">
                    {c.topics.map((tp, ti) => {
                      const name = tp.title || fill(w['fam.syllabus.topic'], { n: ti + 1 });
                      return (
                        <li key={tp.key} className="flex items-center gap-1">
                          <input
                            aria-label={fill(w['fam.syllabus.topicOf'], { n: ti + 1, chapter: ci + 1 })}
                            placeholder={fill(w['fam.syllabus.topic'], { n: ti + 1 })}
                            value={tp.title}
                            maxLength={200}
                            autoFocus={tp.key === justAdded}
                            onChange={(e) => setTopics(ci, (ts) => ts.map((x, i) => (i === ti ? { ...x, title: e.target.value } : x)))}
                            className={FIELD}
                          />
                          <button type="button" className={ICON_BUTTON} disabled={ti === 0} aria-label={fill(w['fam.syllabus.moveUp'], { title: name })} onClick={() => setTopics(ci, (ts) => swap(ts, ti, -1))}>
                            <Glyph d={PATH.up} />
                          </button>
                          <button type="button" className={ICON_BUTTON} disabled={ti === c.topics.length - 1} aria-label={fill(w['fam.syllabus.moveDown'], { title: name })} onClick={() => setTopics(ci, (ts) => swap(ts, ti, 1))}>
                            <Glyph d={PATH.down} />
                          </button>
                          <button type="button" className={ICON_BUTTON} aria-label={fill(w['fam.syllabus.removeItem'], { title: name })} onClick={() => setTopics(ci, (ts) => ts.filter((_, i) => i !== ti))}>
                            <Glyph d={PATH.remove} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {c.topics.length < MAX_TOPICS && (
                  <button
                    type="button"
                    className={`${LINK_BUTTON} flex items-center gap-1`}
                    onClick={() => {
                      const k = key();
                      setTopics(ci, (ts) => [...ts, { key: k, title: '' }]);
                      setJustAdded(k);
                    }}
                  >
                    <Glyph d={PATH.add} />
                    {w['fam.syllabus.addTopic']}
                  </button>
                )}
              </li>
            ))}
          </ol>
          {editing.chapters.length < MAX_CHAPTERS && (
            <button
              type="button"
              className={QUIET}
              onClick={() => {
                const k = key();
                setChapters((cs) => [...cs, { key: k, title: '', topics: [] }]);
                setJustAdded(k);
              }}
            >
              <Glyph d={PATH.add} />
              {w['fam.syllabus.addChapter']}
            </button>
          )}
          {draft && editing.syllabusId === draft.syllabusId && draft.photos < MAX_PHOTOS && (
            <button type="button" disabled={!!busy} className={QUIET} onClick={() => photoInput.current?.click()}>
              <FamIcon name="camera" className="h-5 w-5" />
              {w['fam.syllabus.morePhotos']}
            </button>
          )}
          {!ready && <p className="text-sm text-slate">{editing.chapters.length === 0 ? w['fam.syllabus.err.empty'] : w['fam.syllabus.fillAll']}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" disabled={!ready || !!busy} className={CTA} onClick={() => void save()}>
              {w['fam.syllabus.save']}
            </button>
            <button
              type="button"
              disabled={!!busy}
              className={QUIET}
              onClick={() => {
                setEditing(null);
                setError('');
              }}
            >
              {w['fam.common.cancel']}
            </button>
          </div>
        </div>
      )}

      {busy && (
        <p role="status" className="animate-pulse text-base font-semibold text-royal motion-reduce:animate-none">
          {busy}
        </p>
      )}
      {note && (
        <p role="status" className="rounded-2xl bg-emerald/10 px-3 py-2 text-sm font-semibold text-emerald-text">
          {note}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-2xl bg-coral/10 px-3 py-2 text-sm font-semibold text-slate">
          {error}
        </p>
      )}
    </section>
  );
}
