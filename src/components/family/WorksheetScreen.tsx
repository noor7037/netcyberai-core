'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePrintSheet } from './usePrintSheet';
import type { Words } from '@/lib/family/fill';
import { fill } from '@/lib/family/fill';
import type { KeyRow, ScreenWorksheet } from '@/lib/family/worksheet';
import { QuizView } from './blocks/QuizView';
import { WorksheetSheet } from './WorksheetSheet';

// A worksheet on screen (M2-4, C278): the items one under another, answered with the same hint-first flow as any
// practice (QuizView, the server checks every answer). "Print" opens the browser's print window with the A4 sheet,
// which has no answers; the answer key is printed only from the parent's page (parent PIN).
export function WorksheetScreen({ w, ws, name, tone }: { w: Words; ws: ScreenWorksheet; name: string; tone: string }) {
  const router = useRouter();
  const { print, portal } = usePrintSheet();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span data-label={ws.label} className={`rounded-full px-3 py-1 text-xs font-bold ${ws.label === 'checked' ? 'bg-white text-emerald-text ring-1 ring-emerald-text/40' : 'bg-white text-slate ring-1 ring-slate/20'}`}>
          {ws.label === 'checked' ? w['fam.label.checked'] : w['fam.label.aiMade']}
        </span>
      </div>
      <p className="rounded-2xl bg-white p-4 text-base text-slate shadow-sm ring-1 ring-slate/10">{fill(w['fam.worksheet.lead'], { n: ws.items.length })}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => print(<WorksheetSheet w={w} name={name} title={ws.title} items={ws.items.map((i) => ({ question: i.question, options: i.options }))} />)}
          className="min-h-[44px] rounded-2xl bg-royal px-5 py-2 text-base font-bold text-white"
        >
          {w['fam.worksheet.print']}
        </button>
        <Link href={`/family/parent/worksheet/${encodeURIComponent(ws.topicKey)}`} className="flex min-h-[44px] items-center rounded-2xl bg-white px-4 py-2 text-sm font-bold text-royal-deep shadow-sm ring-1 ring-slate/10">
          {w['fam.worksheet.printParent']}
        </Link>
      </div>
      <p className="px-1 text-sm text-slate">{w['fam.worksheet.printHelp']}</p>
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
      <p className="rounded-2xl bg-white p-4 text-base text-slate shadow-sm ring-1 ring-slate/10">{fill(w['fam.worksheet.parentLead'], { name, n: items.length })}</p>
      <button
        type="button"
        onClick={() => print(<WorksheetSheet w={sheetW} name={name} title={title} items={items} keyRows={keyRows} />)}
        className="min-h-[44px] self-start rounded-2xl bg-royal px-5 py-2 text-base font-bold text-white"
      >
        {w['fam.worksheet.printWithKey']}
      </button>
      <p className="px-1 text-sm text-slate">{w['fam.worksheet.printHelp']}</p>
      <section aria-labelledby="ws-key" className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate/10">
        <h2 id="ws-key" className="text-lg font-extrabold text-slate">
          {w['fam.worksheet.keyTitle']}
        </h2>
        <p className="mb-2 text-sm text-slate">{w['fam.worksheet.keyNote']}</p>
        <ol className="flex flex-col gap-1">
          {keyRows.map((r) => (
            <li key={r.n} className="min-h-[44px] border-b border-slate/10 py-2 text-base text-slate">
              <span className="font-bold">{r.n}.</span> {r.letter}) {r.option}
            </li>
          ))}
        </ol>
      </section>
      {portal}
    </div>
  );
}
