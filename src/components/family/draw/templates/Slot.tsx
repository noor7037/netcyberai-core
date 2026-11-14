'use client';

// "Draw what you are learning" on the Draw tab (C514): the drawing templates of the child's class, in the subjects the
// class has, grouped by subject, as big cards with the outline's thumbnail. A finished one shows a Done tick; one that
// needs a parent shows locked ("Ask a parent") until the parent allows drawing activities. Tapping a card opens the
// studio with the template (from: 'lesson'). The outlines of the class are kept on the phone when the tab opens online,
// and a Done made offline is sent when the phone is back online. Nothing here scores a drawing.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StudioEvent } from '@/lib/family/draw-contract';
import type { Words } from '@/lib/family/fill';
import { DRAW_CATEGORY_LABEL, groupBySubject, isLocked, templateSrc, templatesFor, type DrawCategory, type DrawLang, type DrawTemplateEntry } from '@/lib/family/draw-templates';
import { familyApi } from '../../client';
import { flushDone, sendDone, waitingFor } from './done-queue';
import { useOnline, useTemplateStudio } from './openStudio';
import { keepForOffline } from './template-cache';

export type DrawTemplatesSlotProps = {
  // The child the phone has chosen (a Done made offline waits under this child).
  childId: string;
  classLevel: number;
  lang: DrawLang;
  // The subjects the child's class has (src/lib/family/subjects.ts subjectsOfClass / catalog classSubjects).
  subjects: readonly string[];
  // familyWords(lang, DRAW_TEMPLATE_KEYS) from src/lib/family/draw-template-words.ts.
  w: Words;
  // The page's own Send to tutor, when this child may send a picture.
  onSend?: (file: File, question: string) => Promise<string | null>;
};

const STATE_KEY = (childId: string) => `ncf.draw.state.${childId}`;
type Known = { done: string[]; allowed: boolean };

function readKnown(childId: string): Known {
  try {
    const v = JSON.parse(localStorage.getItem(STATE_KEY(childId)) ?? 'null') as Known | null;
    return v && Array.isArray(v.done) ? { done: v.done.filter((x) => typeof x === 'string'), allowed: v.allowed === true } : { done: [], allowed: false };
  } catch {
    return { done: [], allowed: false };
  }
}
function writeKnown(childId: string, k: Known) {
  try {
    localStorage.setItem(STATE_KEY(childId), JSON.stringify(k));
  } catch {
    // Not kept: read again next time.
  }
}

export function DrawTemplatesSlot(props: Partial<DrawTemplatesSlotProps>) {
  // Rendered with no props until the Draw tab passes them: nothing to show yet.
  if (!props.childId || props.classLevel === undefined || !props.lang || !props.subjects || !props.w) return null;
  return <TemplatesSection {...(props as DrawTemplatesSlotProps)} />;
}
export default DrawTemplatesSlot;

export function TemplatesSection({ childId, classLevel, lang, subjects, w, onSend }: DrawTemplatesSlotProps) {
  const online = useOnline();
  const list = useMemo(() => templatesFor(classLevel, subjects), [classLevel, subjects]);
  const groups = useMemo(() => groupBySubject(list, subjects), [list, subjects]);
  const subjectOf = useMemo(() => new Map(list.map((x) => [x.template.id, x.subject])), [list]);
  const [known, setKnown] = useState<Known>({ done: [], allowed: false });
  const [note, setNote] = useState<string | null>(null);

  const markDone = useCallback(
    (id: string) =>
      setKnown((k) => {
        const next = k.done.includes(id) ? k : { ...k, done: [...k.done, id] };
        writeKnown(childId, next);
        return next;
      }),
    [childId]
  );

  useEffect(() => {
    setKnown({ ...readKnown(childId), done: [...new Set([...readKnown(childId).done, ...waitingFor(childId)])] });
    if (!online) return;
    let live = true;
    void (async () => {
      await flushDone(childId);
      const r = await familyApi<{ done: string[]; allowed: boolean }>('/api/family/draw/done', 'GET');
      if (live && r.ok) {
        const next = { done: [...new Set([...r.data.done, ...waitingFor(childId)])], allowed: r.data.allowed === true };
        writeKnown(childId, next);
        setKnown(next);
      }
      await keepForOffline(list.map((x) => x.template.id));
    })();
    return () => {
      live = false;
    };
  }, [childId, online, list]);

  const onEvent = useCallback(
    (e: StudioEvent) => {
      if (e.t !== 'done' || !subjectOf.has(e.templateId)) return;
      markDone(e.templateId);
      void sendDone(childId, e.templateId);
    },
    [childId, markDone, subjectOf]
  );
  const studio = useTemplateStudio({ lang, classLevel, w, onEvent, onSend, child: childId });

  const open = (t: DrawTemplateEntry) => {
    if (isLocked(t, known.allowed)) return setNote(w['fam.draw.t.lockedNote']);
    setNote(null);
    void studio.start({ templateId: t.id, subject: subjectOf.get(t.id) ?? t.subject, from: 'lesson' });
  };

  return (
    <section data-draw-templates aria-labelledby="draw-templates-title" className="flex flex-col gap-3">
      <div>
        <h2 id="draw-templates-title" className="text-xl font-extrabold text-ink">
          {w['fam.draw.t.title']}
        </h2>
        <p className="text-sm text-slate">{w['fam.draw.t.lead']}</p>
      </div>
      {!online && (
        <p data-draw-offline role="status" className="rounded-xl bg-white p-3 text-sm font-semibold text-slate ring-1 ring-ink/15">
          {w['fam.draw.t.offline']}
        </p>
      )}
      {(note || studio.failed) && (
        <p role="status" className="rounded-xl bg-white p-3 text-sm font-semibold text-ink ring-1 ring-ink/15">
          {studio.failed ? w['fam.draw.t.loadFailed'] : note}
        </p>
      )}
      {groups.length === 0 && <p className="text-sm text-slate">{w['fam.draw.t.none']}</p>}
      {groups.map((g) => (
        <div key={g.subject} data-draw-subject={g.subject} className="flex flex-col gap-2">
          <h3 className="px-1 text-base font-bold text-slate">{DRAW_CATEGORY_LABEL[g.subject as DrawCategory]?.[lang] ?? w[`fam.subject.${g.subject}`] ?? g.subject}</h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {g.templates.map((t) => (
              <li key={t.id}>
                <TemplateCard t={t} lang={lang} done={known.done.includes(t.id)} locked={isLocked(t, known.allowed)} w={w} onOpen={() => open(t)} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      {studio.node}
    </section>
  );
}

export function TemplateCard({ t, lang, done, locked, w, onOpen }: { t: DrawTemplateEntry; lang: DrawLang; done: boolean; locked: boolean; w: Words; onOpen: () => void }) {
  return (
    <button
      type="button"
      data-draw-template={t.id}
      data-done={done ? '' : undefined}
      data-locked={locked ? '' : undefined}
      onClick={onOpen}
      className="fam-card fam-press relative flex min-h-[44px] w-full flex-col gap-2 bg-white p-2 text-left"
    >
      <span className="relative block aspect-square w-full overflow-hidden rounded-xl bg-paper">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static outline, kept on the phone for offline use */}
        <img src={templateSrc(t.id)} alt="" loading="lazy" className={`h-full w-full object-contain p-2 ${locked ? 'opacity-40' : ''}`} />
        <span aria-hidden="true" className="absolute left-2 top-2 flex gap-1">
          {t.palette.slice(0, 4).map((c) => (
            <span key={c} className="h-3 w-3 rounded-full ring-1 ring-ink/20" style={{ background: c }} />
          ))}
        </span>
        {done && (
          <span aria-hidden="true" className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-emerald text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5 9-10" />
            </svg>
          </span>
        )}
        {locked && (
          <span className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1 rounded-full bg-ink px-2 py-1 text-xs font-bold text-white">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 018 0v3" />
            </svg>
            {w['fam.draw.t.locked']}
          </span>
        )}
      </span>
      <span lang={lang} className="px-1 pb-1 text-sm font-bold leading-snug text-ink">
        {t.title[lang]}
      </span>
      {/* The name is what the card shows (its lock line, then its title); a Done tick is said, not only drawn. */}
      {done && <span className="sr-only">{w['fam.draw.t.done']}</span>}
    </button>
  );
}
