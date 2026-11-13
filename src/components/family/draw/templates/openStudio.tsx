'use client';

// The one place the templates open the drawing studio (C514). Today the studio is the tutor window's sketch pad
// (src/components/family/tutor/SketchPad.tsx); when the studio moves, only the import below changes. It is given the
// contract's StudioOpen (the template and where the child came from) and an onEvent for its events, which today's pad
// does not read yet: a template's Done reaches us as { t: 'done' } once the studio sends it.
import { Suspense, lazy, useCallback, useEffect, useState, type ComponentType } from 'react';
import type { StudioEvent, StudioOpen } from '@/lib/family/draw-contract';
import type { Words } from '@/lib/family/fill';
import { drawTemplate, toStudioTemplate, type DrawLang } from '@/lib/family/draw-templates';
import { outlineOf } from './template-cache';

type StudioProps = {
  w: Words;
  onSend: (file: File, question: string) => Promise<string | null>;
  onClose: () => void;
  open?: StudioOpen;
  onEvent?: (e: StudioEvent) => void;
};

const Studio = lazy(() => import('@/components/family/tutor/SketchPad').then((m) => ({ default: m.SketchPad as unknown as ComponentType<StudioProps> })));

// What a card asks for: the template (by id), the subject its class studies it under, and where the child came from.
export type OpenAsk = { templateId: string; subject: string; from: StudioOpen['from'] };

export function useTemplateStudio({ lang, classLevel, w, onEvent }: { lang: DrawLang; classLevel: number; w: Words; onEvent: (e: StudioEvent) => void }) {
  const [open, setOpen] = useState<StudioOpen | null>(null);
  const [failed, setFailed] = useState(false);
  const start = useCallback(
    async (ask: OpenAsk) => {
      const t = drawTemplate(ask.templateId);
      if (!t) return;
      setFailed(false);
      const svg = await outlineOf(t.id);
      if (!svg) return setFailed(true);
      setOpen({ template: toStudioTemplate(t, lang, svg, ask.subject, classLevel), from: ask.from, subject: ask.subject, chapterKey: t.chapterKey });
    },
    [lang, classLevel]
  );
  const close = useCallback(() => {
    setOpen(null);
    onEvent({ t: 'closed' });
  }, [onEvent]);
  const node = open ? (
    <Suspense fallback={null}>
      {/* Today's pad sends to the tutor only from inside the tutor window; from here the child is told where to send it. */}
      <Studio w={w} open={open} onEvent={onEvent} onClose={close} onSend={async () => w['fam.draw.t.sendLater'] ?? ''} />
    </Suspense>
  ) : null;
  return { start, node, failed, isOpen: open !== null };
}

// Keeps a page's state when the phone goes on or off line.
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine !== false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
