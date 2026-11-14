'use client';

// "Draw it" inside a lesson (C514): the one template of this chapter, opening the studio in context (from: 'lesson', the
// lesson's subject and chapter). A card under the chapter reader; a small pill in the book reader's bar. Locked
// ("Ask a parent") when the template needs a parent who has not allowed drawing activities. The outline is kept on the
// phone when the lesson opens online.
import { useCallback, useEffect, useState } from 'react';
import type { StudioEvent } from '@/lib/family/draw-contract';
import type { Words } from '@/lib/family/fill';
import { drawTemplate, isLocked, templateSrc, type DrawLang } from '@/lib/family/draw-templates';
import { sendDone } from './done-queue';
import { useTemplateStudio } from './openStudio';
import { keepForOffline } from './template-cache';

const OPEN_BTN = 'fam-press min-h-[44px] rounded-full bg-grape-deep px-4 text-base font-bold text-white';
const LOCKED_BTN = 'fam-press min-h-[44px] rounded-full bg-ink px-4 text-base font-bold text-white';

type Props = { childId: string; classLevel: number; lang: DrawLang; templateId: string; subject: string; allowed: boolean; w: Words; variant?: 'card' | 'pill' };

export function DrawItCard({ childId, classLevel, lang, templateId, subject, allowed, w, variant = 'card' }: Props) {
  const t = drawTemplate(templateId);
  const [note, setNote] = useState<string | null>(null);
  const onEvent = useCallback(
    (e: StudioEvent) => {
      if (e.t === 'done' && e.templateId === templateId) void sendDone(childId, templateId);
    },
    [childId, templateId]
  );
  const studio = useTemplateStudio({ lang, classLevel, w, onEvent, child: childId });
  useEffect(() => {
    void keepForOffline([templateId]);
  }, [templateId]);
  if (!t) return null;
  const locked = isLocked(t, allowed);
  const open = () => {
    if (locked) return setNote(w['fam.draw.t.lockedNote']);
    setNote(null);
    void studio.start({ templateId, subject, from: 'lesson' });
  };
  const said = note ?? (studio.failed ? w['fam.draw.t.loadFailed'] : null);

  if (variant === 'pill')
    return (
      <>
        <button
          type="button"
          data-draw-it={templateId}
          onClick={open}
          aria-label={`${w['fam.draw.t.drawIt']}: ${t.title[lang]}${locked ? `, ${w['fam.draw.t.locked']}` : ''}`}
          title={said ?? t.title[lang]}
          className="fam-press flex min-h-[44px] shrink-0 items-center gap-1 rounded-full bg-white px-3 text-sm font-bold text-ink ring-1 ring-ink/15"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20l4-1 11-11-3-3L5 16z" />
            <path d="M14 6l3 3" />
          </svg>
          <span className="hidden sm:inline">{w['fam.draw.t.drawIt']}</span>
        </button>
        {studio.node}
      </>
    );

  return (
    <section data-draw-it={templateId} aria-label={w['fam.draw.t.drawIt']} className="fam-card flex flex-col gap-2 bg-white p-3">
      <div className="flex items-center gap-3">
        <span className="block h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-paper">
          {/* eslint-disable-next-line @next/next/no-img-element -- a small static outline, kept on the phone for offline use */}
          <img src={templateSrc(t.id)} alt="" className={`h-full w-full object-contain p-1 ${locked ? 'opacity-40' : ''}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p lang={lang} className="text-base font-bold leading-snug text-ink">
            {t.title[lang]}
          </p>
          <p className="text-sm text-slate">{w['fam.draw.t.drawItLead']}</p>
        </div>
      </div>
      <button type="button" onClick={open} className={locked ? LOCKED_BTN : OPEN_BTN}>
        {locked ? w['fam.draw.t.locked'] : w['fam.draw.t.drawIt']}
      </button>
      {said && (
        <p role="status" className="text-sm font-semibold text-slate">
          {said}
        </p>
      )}
      {studio.node}
    </section>
  );
}
