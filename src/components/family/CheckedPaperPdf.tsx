'use client';

import { useRef, useState } from 'react';
import type { SchoolCheckedPaper } from '@/lib/contracts/school-link';
import { fill, type Words } from '@/lib/family/fill';
import { downloadPdf, makeFittedCheckedPdf, pageFrom, pdfFileName } from '@/lib/marking/checked-pdf';
import { familyPageSrc } from './ScriptPages';

// "Download as PDF" on a checked paper (C366): the same PDF the school sends on WhatsApp, made in this browser from
// what this screen already shows: the paper, its marks and its pages, fetched through the family's own picture route
// (which checks, as the guardian, that the page is this child's). Nothing is sent anywhere; the file is saved on the
// device. In the screen's language.
export function CheckedPaperPdf({ paper, w }: { paper: SchoolCheckedPaper; w: Words }) {
  const [state, setState] = useState<'idle' | 'making' | 'failed'>('idle');
  const here = useRef<HTMLDivElement>(null);
  const make = async () => {
    setState('making');
    const lang = here.current?.closest('[lang]')?.getAttribute('lang') === 'hi' ? 'hi' : 'en';
    const made = await makeFittedCheckedPdf(
      { school: '', child: '', className: '', rollNo: null, exam: paper.term ? `${paper.exam} · ${paper.term}` : paper.exam, publishedOn: paper.publishedOn, lang, papers: [paper] },
      (key, params) => fill(w[key], params),
      pageFrom(familyPageSrc)
    ).catch(() => null);
    if (!made) return setState('failed');
    downloadPdf(made.blob, pdfFileName(paper.exam, paper.subject, null));
    setState('idle');
  };
  return (
    <div ref={here} className="flex flex-col items-start gap-2" data-paper-pdf>
      <button type="button" onClick={() => void make()} disabled={state === 'making'} className="fam-press inline-flex min-h-[44px] items-center rounded-xl bg-saffron px-4 text-sm font-bold text-ink disabled:opacity-60">
        {state === 'making' ? w['fam.marks.pdfMaking'] : w['fam.marks.pdf']}
      </button>
      {state === 'failed' && (
        <p role="alert" className="text-sm font-semibold text-slate">
          {w['fam.marks.pdfFailed']}
        </p>
      )}
    </div>
  );
}
