'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePrintSheet } from './usePrintSheet';
import type { Words } from '@/lib/family/fill';
import { fill } from '@/lib/family/fill';
import { subjectTheme } from '@/lib/family/subject-theme';
import type { KeyRow, ScreenWorksheet } from '@/lib/family/worksheet';
import { QuizView } from './blocks/QuizView';
import { AiNotice } from './AiNotice';
import { FamIcon, rise } from './FamIcon';
import { SubjectGlyph } from './ui/SubjectGlyph';
import { WorksheetSheet } from './WorksheetSheet';

// A worksheet on screen (M2-4, C278): the items one under another, answered with the same hint-first flow as any
// practice (QuizView, the server checks every answer). "Print" opens the browser's print window with the A4 sheet,
// which has no answers; the answer key is printed only from the parent's page (parent PIN).
// F2 on D1 (C230-Q): the screen is D1's (a card in the subject's colour, the print button as D1's call to action, the
// parent's key link with a lock); the printed sheet itself stays plain dark on white, for paper (WorksheetSheet).
const PRINT = 'fam-cta fam-press flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-saffron px-5 py-2 text-base font-extrabold text-ink';

export function WorksheetScreen({ w, ws, name, tone }: { w: Words; ws: ScreenWorksheet; name: string; tone: string }) {
  const router = useRouter();
  const { print, portal } = usePrintSheet();
  return (
    <div className="flex flex-col gap-3">
      <section className="fam-card fam-rise flex flex-col gap-4 bg-white p-5">
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-lg ${subjectTheme(tone).chip}`}>
            <SubjectGlyph subject={tone} className="h-6 w-6" />
          </span>
          <div className="flex min-w-0 flex-col items-start gap-2">
            <span data-label={ws.label} className={`rounded-full px-3 py-1 text-xs font-bold ${ws.label === 'checked' ? 'bg-white text-emerald-text ring-1 ring-emerald-text/40' : 'bg-white text-slate ring-1 ring-slate/20'}`}>
              {ws.label === 'checked' ? w['fam.label.checked'] : w['fam.label.aiMade']}
            </span>
            <AiNotice w={w} made={ws.label} />
            <p className="bg-white text-base text-slate">{fill(w['fam.worksheet.lead'], { n: ws.items.length })}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => print(<WorksheetSheet w={w} name={name} title={ws.title} items={ws.items.map((i) => ({ question: i.question, options: i.options }))} />)} className={PRINT}>
            <FamIcon name="printer" className="h-5 w-5" />
            {w['fam.worksheet.print']}
          </button>
          <Link
            href={`/family/parent/worksheet/${encodeURIComponent(ws.topicKey)}`}
            className="fam-press flex min-h-[48px] items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-bold text-ink ring-1 ring-ink/25 hover:bg-off-white"
          >
            <FamIcon name="lock" className="h-5 w-5 shrink-0" />
            {w['fam.worksheet.printParent']}
          </Link>
        </div>
        <p className="bg-white text-sm text-slate">{w['fam.worksheet.printHelp']}</p>
      </section>
      <QuizView kind="practice" items={ws.items} w={w} tone={tone} onRetry={() => router.push(`/family/understand?kind=topic&key=${encodeURIComponent(ws.topicKey)}`)} />
      {portal}
    </div>
  );
}

// The parent's page: the same sheet with the answer key as its last page, and the key shown on screen to the parent.
export function ParentWorksheet({ w, sheetW, name, title, items, keyRows }: { w: Words; sheetW: Words; name: string; title: string; items: { question: string; options: string[] }[]; keyRows: KeyRow[] }) {
  const { print, portal } = usePrintSheet();
  return (
    <div className="flex flex-col gap-3">
      <section className="fam-card fam-rise flex flex-col gap-4 bg-white p-5">
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-ink text-white shadow-lg">
            <FamIcon name="sheet" className="h-6 w-6" />
          </span>
          <p className="min-w-0 bg-white text-base text-slate">{fill(w['fam.worksheet.parentLead'], { name, n: items.length })}</p>
        </div>
        <button type="button" onClick={() => print(<WorksheetSheet w={sheetW} name={name} title={title} items={items} keyRows={keyRows} />)} className={`${PRINT} sm:self-start`}>
          <FamIcon name="printer" className="h-5 w-5" />
          {w['fam.worksheet.printWithKey']}
        </button>
        <p className="bg-white text-sm text-slate">{w['fam.worksheet.printHelp']}</p>
      </section>
      <section aria-labelledby="ws-key" className="fam-card fam-rise bg-white p-5" style={rise(80)}>
        <h2 id="ws-key" className="flex items-center gap-2 bg-white text-lg font-extrabold text-slate">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lesson-sky text-ink">
            <FamIcon name="lock" className="h-5 w-5" />
          </span>
          {w['fam.worksheet.keyTitle']}
        </h2>
        <p className="mb-2 mt-1 bg-white text-sm text-slate">{w['fam.worksheet.keyNote']}</p>
        <ol className="flex flex-col gap-1">
          {keyRows.map((r) => (
            <li key={r.n} className="flex min-h-[44px] items-center gap-3 border-b border-slate/10 bg-white py-2 text-base text-slate last:border-b-0">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">{r.n}</span>
              <span className="min-w-0">
                <span className="font-bold">{r.letter})</span> {r.option}
              </span>
            </li>
          ))}
        </ol>
      </section>
      {portal}
    </div>
  );
}
