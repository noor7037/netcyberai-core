import type { Words } from '@/lib/family/fill';
import { fill } from '@/lib/family/fill';
import type { KeyRow, PrintItem } from '@/lib/family/worksheet';

const optionLetter = (i: number) => String.fromCharCode(65 + i);

// The printed worksheet (M2-4, C278): A4, dark on white (the page setting comes from usePrint), the child's first name
// and the topic at the top, numbered questions with lettered options and a line to write on. The child's printout has
// no answers; the parent's has the answer key as its last page (break-before-page), nothing else. The browser's own
// "Save as PDF" makes the PDF.
export function WorksheetSheet({ w, name, title, items, keyRows }: { w: Words; name: string; title: string; items: PrintItem[]; keyRows?: KeyRow[] }) {
  return (
    <div data-worksheet-sheet className="bg-white text-slate">
      <header className="mb-4 border-b-2 border-slate pb-2">
        <h1 className="text-2xl font-extrabold">{fill(w['fam.worksheet.sheetFor'], { name })}</h1>
        <p className="text-lg font-bold">{fill(w['fam.worksheet.topic'], { topic: title })}</p>
        <p className="mt-3 flex gap-8 text-base">
          <span className="flex-1 border-b border-slate">{w['fam.worksheet.nameLine']}</span>
          <span className="w-40 border-b border-slate">{w['fam.worksheet.dateLine']}</span>
        </p>
      </header>
      <ol className="flex flex-col gap-5">
        {items.map((q, n) => (
          <li key={n} className="break-inside-avoid">
            <p className="text-base font-bold">
              {n + 1}. {q.question}
            </p>
            <ul className="mt-1 grid grid-cols-1 gap-x-6 gap-y-1 pl-6 text-base sm:grid-cols-2">
              {q.options.map((o, i) => (
                <li key={i}>
                  {optionLetter(i)}) {o}
                </li>
              ))}
            </ul>
            <p className="mt-4 border-b border-slate pb-4 text-sm">{w['fam.worksheet.answerLine']}</p>
          </li>
        ))}
      </ol>
      {keyRows && (
        <section data-worksheet-key className="break-before-page pt-2">
          <h2 className="text-2xl font-extrabold">{w['fam.worksheet.keyTitle']}</h2>
          <p className="text-lg font-bold">{fill(w['fam.worksheet.topic'], { topic: title })}</p>
          <p className="mb-4 text-base">{fill(w['fam.worksheet.keyFor'], { name })}</p>
          <ol className="flex flex-col gap-2">
            {keyRows.map((r) => (
              <li key={r.n} className="border-b border-slate/40 pb-1 text-base">
                <span className="font-bold">{r.n}.</span> {r.letter}) {r.option}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
