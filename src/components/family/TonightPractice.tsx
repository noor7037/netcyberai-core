'use client';

import { useState } from 'react';
import type { SchoolTaught } from '@/lib/contracts/school-link';
import { fill, type Words } from '@/lib/family/fill';
import { UnderstandView, type UnderstandInput } from './UnderstandView';

// Tonight's practice (C335, L10): what the child's class covered today in this subject, as the teacher recorded it, for
// a child matched to a connected school's student. A topic is asked as the child's own question would be (the same
// typed-question path and its checks, as the school's syllabus is), so nothing new is sent and nothing is kept.
export function TonightPractice({ w, topics, tone }: { w: Words; topics: SchoolTaught[]; tone: string }) {
  const [asked, setAsked] = useState<UnderstandInput | null>(null);
  return (
    <section data-school-tonight className="fam-card flex flex-col gap-3 bg-white p-4 sm:p-5">
      <h2 className="text-lg font-extrabold text-slate">{w['fam.school.tonightTitle']}</h2>
      <p className="text-sm text-slate">{w['fam.school.tonightLead']}</p>
      <ul className="flex flex-col">
        {topics.map((t, i) => (
          <li key={`${t.topic}-${i}`}>
            <button
              type="button"
              onClick={() =>
                setAsked({
                  kind: 'question',
                  text: (t.chapter ? fill(w['fam.school.syllabusAsk'], { topic: t.topic, chapter: t.chapter }) : fill(w['fam.school.tonightAsk'], { topic: t.topic })).slice(0, 500),
                })
              }
              className="fam-press flex min-h-[44px] w-full items-center rounded-xl px-2 text-left text-sm font-semibold text-slate hover:bg-off-white"
            >
              {t.topic}
            </button>
          </li>
        ))}
      </ul>
      {asked && asked.kind === 'question' && <UnderstandView key={asked.text} w={w} input={asked} tone={tone} />}
    </section>
  );
}
