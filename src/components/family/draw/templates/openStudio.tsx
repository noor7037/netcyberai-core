'use client';

// The one place the templates open the drawing studio (C514, joined with the studio in C513). It is given the
// contract's StudioOpen (the template and where the child came from) and an onEvent for its events: a template's Done
// reaches us as { t: 'done' }. Send to tutor is the page's own path when it has one; the studio marks the question.
import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import type { StudioEvent, StudioOpen } from '@/lib/family/draw-contract';
import type { Words } from '@/lib/family/fill';
import { toStudioTemplate, type DrawLang, type DrawTemplateEntry } from '@/lib/family/draw-template-entry';
import { outlineOf } from './template-cache';
import { engageMode } from '@/lib/family/draw-engage';

const Studio = lazy(() => import('@/components/family/draw/Studio').then((m) => ({ default: m.Studio })));

// What a card asks for: the template (by id), the subject its class studies it under, and where the child came from.
export type OpenAsk = { template: DrawTemplateEntry; subject: string; from: StudioOpen['from'] };

export function useTemplateStudio({ lang, classLevel, w, onEvent, onSend, child }: { lang: DrawLang; classLevel: number; w: Words; child?: string; onEvent: (e: StudioEvent) => void; onSend?: (file: File, question: string) => Promise<string | null> }) {
  const [open, setOpen] = useState<StudioOpen | null>(null);
  const [failed, setFailed] = useState(false);
  const start = useCallback(
    async (ask: OpenAsk) => {
      const t = ask.template;
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
      {/* Without a send path of its own (a card in Study) the child is told where to send it. */}
      <Studio w={w} open={open} onEvent={onEvent} onClose={close} engage={engageMode(classLevel)} lang={lang} child={child} onSend={onSend ?? (async () => w['fam.draw.t.sendLater'] ?? '')} />
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
