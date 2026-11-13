'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import type { StudioOpen } from '@/lib/family/draw-contract';
import { canStartNew, dayKey, placesLeft } from '@/lib/family/draw-daily';
import { newestFirst } from '@/lib/family/sketch';
import { listDrawings, readDayCount, type SavedDrawing } from '@/lib/family/sketch-store';
import { isSubject } from '@/lib/family/subjects';
import { TutorDrawer } from '../tutor/TutorDrawer';
import { DrawLimit } from './DrawLimit';
import { DrawTemplatesSlot } from './templates/Slot';
import { engageMode } from '@/lib/family/draw-engage';
import type { DrawLang } from '@/lib/family/draw-templates';

// The Draw tab's page (C513): the "Start drawing" hero, the templates' slot, and My drawings from this phone as a grid
// (newest first; a tap opens one). The studio is its own chunk, loaded when the child opens it, so the page's first load
// stays small. At the day's limit a new drawing waits for tomorrow (a kind full-screen card); every drawing already made
// still opens. Send to tutor, where this child may send a picture, opens the tutor's drawer and sends it through the
// window's own path (the file door, the retries, the answer drawn there).

const Studio = dynamic(() => import('./Studio').then((m) => m.Studio), { ssr: false });

type Tutor = { subject: string; tone: string; homework: boolean };
type Open = { n: number; open: StudioOpen; startWith: SavedDrawing | null };
type Ask = { n: number; file: File; question: string; done: (error: string | null) => void };

export function DrawHome({ w, limit, child, tutor, classLevel = 0, childId = '', lang = 'en', subjects = [] }: { w: Words; limit: number; child: string; tutor: Tutor | null; classLevel?: number; childId?: string; lang?: DrawLang; subjects?: readonly string[] }) {
  const [list, setList] = useState<SavedDrawing[] | null>(null);
  const [noStore, setNoStore] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [studio, setStudio] = useState<Open | null>(null);
  const [limitHit, setLimitHit] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);

  const load = useCallback(async () => {
    const [r, c] = await Promise.all([listDrawings().catch(() => null), readDayCount(dayKey(child)).catch(() => null)]);
    setNoStore(!r || !r.ok);
    setList(r && r.ok ? newestFirst(r.value) : []);
    setCount(c && c.ok ? c.value : null);
  }, [child]);
  useEffect(() => {
    void load();
  }, [load]);

  // A new drawing (free, or a template from the slot): under the day's limit only, read fresh from the phone.
  const start = async (open: StudioOpen) => {
    const c = await readDayCount(dayKey(child)).catch(() => null);
    const now = c && c.ok ? c.value : null;
    if (!canStartNew(now, limit)) return setLimitHit(true);
    setStudio({ n: Date.now(), open, startWith: null });
  };
  const reopen = (d: SavedDrawing) => setStudio({ n: Date.now(), open: { from: d.from === 'lesson' || d.from === 'homework' ? d.from : 'free' }, startWith: d });
  const scrollToMine = () => {
    setLimitHit(false);
    document.getElementById('draw-mine')?.scrollIntoView({ block: 'start' });
  };

  const onSend =
    tutor && isSubject(tutor.subject)
      ? (file: File, question: string) =>
          new Promise<string | null>((resolve) => {
            setAsk({
              n: Date.now(),
              file,
              question,
              done: (error) => {
                if (error) setAsk(null);
                resolve(error);
              },
            });
          })
      : undefined;
  const left = placesLeft(count, limit);

  return (
    <div data-draw-home className="flex flex-col gap-5">
      <section aria-labelledby="draw-hero" data-draw-hero className="draw-table draw-sheet fam-rise relative overflow-hidden rounded-[1.75rem] p-5 text-ink">
        <svg aria-hidden="true" viewBox="0 0 120 80" className="absolute right-2 top-2 h-16 w-24 opacity-90">
          <circle cx="30" cy="30" r="16" fill="#FFB4A2" />
          <circle cx="62" cy="22" r="13" fill="#A9D6F5" />
          <circle cx="90" cy="38" r="15" fill="#B8E6CF" />
          <circle cx="58" cy="56" r="12" fill="#FFE7A3" />
          <circle cx="28" cy="62" r="10" fill="#D9CCF6" />
        </svg>
        <h2 id="draw-hero" className="relative pr-24 text-2xl font-extrabold leading-tight text-ink">
          {w['fam.draw.heroTitle']}
        </h2>
        <p className="relative mt-2 text-base text-ink">{w['fam.draw.heroLead']}</p>
        <button type="button" data-draw-start onClick={() => void start({ from: 'free' })} className="draw-tool fam-press fam-cta relative mt-4 w-full gap-2 bg-saffron px-5 text-lg font-extrabold text-ink sm:w-auto">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 4.5l5 5-7.5 7.5-5-5zM7 12l-2.6 2.6a2.5 2.5 0 0 0 0 3.5l1 1a2.5 2.5 0 0 0 3.5 0L11.5 16.5" />
          </svg>
          {w['fam.draw.start']}
        </button>
        {left !== null && <p data-draw-left className="relative mt-2 text-sm font-semibold text-ink">{fill(w['fam.draw.left'], { n: left })}</p>}
      </section>

      <DrawTemplatesSlot childId={childId} classLevel={classLevel} lang={lang} subjects={subjects} w={w} onSend={onSend} />

      <section aria-labelledby="draw-mine" data-draw-mine className="flex flex-col gap-3">
        <h2 id="draw-mine" className="text-xl font-extrabold text-ink">
          {w['fam.draw.mine']}
        </h2>
        {noStore && <p className="text-sm text-ink">{w['fam.sketch.noStore']}</p>}
        {list && list.length === 0 && !noStore && <p data-draw-mine-empty className="fam-card bg-white p-4 text-base text-ink">{w['fam.draw.mineEmpty']}</p>}
        {list && list.length > 0 && (
          <ul data-draw-gallery className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {list.map((d, i) => (
              <li key={d.id} className="fam-rise" style={{ ['--d' as string]: `${Math.min(i, 8) * 40}ms` } as React.CSSProperties}>
                <button type="button" data-draw-open={d.id} aria-label={fill(w['fam.draw.open'], { name: d.name })} onClick={() => reopen(d)} className="fam-press draw-sheet flex w-full flex-col gap-2 rounded-2xl bg-white p-2 text-left">
                  <Thumb blob={d.thumb} />
                  <span className="w-full truncate px-1 text-sm font-bold text-ink">{d.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-ink">{w['fam.draw.deviceNote']}</p>
      </section>

      {studio && (
        <Studio
          key={studio.n}
          w={w}
          open={studio.open}
          startWith={studio.startWith}
          daily={{ limit, child }}
          keepOnClose
          engage={engageMode(classLevel)}
          lang={lang}
          onSend={onSend}
          onClose={() => {
            setStudio(null);
            void load();
          }}
        />
      )}
      {ask && tutor && isSubject(tutor.subject) && (
        <TutorDrawer open onClose={() => setAsk(null)} w={w} subject={tutor.subject} tone={tutor.tone} files homework={tutor.homework} sketchFirst={ask} />
      )}
      {limitHit && <DrawLimit w={w} onOpenMine={scrollToMine} onClose={() => setLimitHit(false)} />}
    </div>
  );
}

// A saved drawing's small picture (an object URL, let go when it leaves the screen).
function Thumb({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    try {
      u = URL.createObjectURL(blob);
      setUrl(u);
    } catch {
      setUrl(null);
    }
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [blob]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" className="aspect-[4/3] w-full rounded-xl bg-paper object-contain" /> : <span className="aspect-[4/3] w-full rounded-xl bg-paper" />;
}
