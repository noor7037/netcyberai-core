'use client';

import { useState } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import { subjectTheme } from '@/lib/family/subject-theme';
import { CHAPTER_GROUP } from './chapter-group';
import { UnderstandView, type UnderstandInput } from './UnderstandView';

// The school's own syllabus for this subject (C230-AA), for a child matched to a connected school's student: the
// school's chapters and topics, read as the guardian. A topic is asked as the child's own question would be (the same
// typed-question path and its checks), so nothing new is sent and nothing is kept in the shared library. W6-A (C395):
// the chapters are accordion rows like the other chapters on Study (one open at a time, in the same group).
export function SchoolSyllabus({ w, chapters, tone }: { w: Words; chapters: { title: string; topics: string[] }[]; tone: string }) {
  const [asked, setAsked] = useState<UnderstandInput | null>(null);
  const theme = subjectTheme(tone);
  return (
    <section data-school-syllabus aria-labelledby="fam-school-syllabus" className="flex flex-col gap-2">
      <h2 id="fam-school-syllabus" className="px-1 text-lg font-extrabold text-slate">
        {w['fam.school.syllabusTitle']}
      </h2>
      <ol className="flex flex-col gap-2">
        {chapters.map((c, i) => (
          <li key={`${c.title}-${i}`} className="fam-surface bg-white">
            <details name={CHAPTER_GROUP} className="fam-acc">
              <summary className="flex min-h-[60px] items-center gap-3 rounded-2xl px-3 py-2">
                <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-base font-black text-white shadow-sm ${theme.tile}`}>
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 text-base font-bold text-slate">{c.title}</span>
                <svg aria-hidden="true" viewBox="0 0 24 24" className={`fam-acc-chev h-5 w-5 shrink-0 ${theme.ink}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </summary>
              <ul className="fam-acc-body flex flex-col border-t border-slate/10 p-2">
                {c.topics.map((topic, j) => (
                  <li key={`${topic}-${j}`}>
                    <button
                      type="button"
                      onClick={() => setAsked({ kind: 'question', text: fill(w['fam.school.syllabusAsk'], { topic, chapter: c.title }).slice(0, 500) })}
                      className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-2 text-left text-sm text-slate hover:bg-off-white"
                    >
                      <span aria-hidden="true" className={`ml-1 h-2 w-2 shrink-0 rounded-full ${theme.chip}`} />
                      {topic}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ol>
      {asked && asked.kind === 'question' && <UnderstandView key={asked.text} w={w} input={asked} tone={tone} />}
    </section>
  );
}
