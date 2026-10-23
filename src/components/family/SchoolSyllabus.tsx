'use client';

import { useState } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import { UnderstandView, type UnderstandInput } from './UnderstandView';

// The school's own syllabus for this subject (C230-AA), for a child matched to a connected school's student: the
// school's chapters and topics, read as the guardian. A topic is asked as the child's own question would be (the same
// typed-question path and its checks), so nothing new is sent and nothing is kept in the shared library.
export function SchoolSyllabus({ w, chapters, tone }: { w: Words; chapters: { title: string; topics: string[] }[]; tone: string }) {
  const [asked, setAsked] = useState<UnderstandInput | null>(null);
  return (
    <section data-school-syllabus className="fam-card flex flex-col gap-3 bg-white p-4 sm:p-5">
      <h2 className="text-lg font-extrabold text-slate">{w['fam.school.syllabusTitle']}</h2>
      <ol className="flex flex-col gap-3">
        {chapters.map((c, i) => (
          <li key={`${c.title}-${i}`} className="flex flex-col gap-1">
            <p className="text-base font-bold text-slate">{c.title}</p>
            <ul className="flex flex-col">
              {c.topics.map((topic, j) => (
                <li key={`${topic}-${j}`}>
                  <button
                    type="button"
                    onClick={() => setAsked({ kind: 'question', text: fill(w['fam.school.syllabusAsk'], { topic, chapter: c.title }).slice(0, 500) })}
                    className="fam-press flex min-h-[44px] w-full items-center rounded-xl px-2 text-left text-sm text-slate hover:bg-off-white"
                  >
                    {topic}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {asked && asked.kind === 'question' && <UnderstandView key={asked.text} w={w} input={asked} tone={tone} />}
    </section>
  );
}
