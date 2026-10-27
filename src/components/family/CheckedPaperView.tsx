import type { SchoolCheckedPaper, SchoolMarkedQuestion } from '@/lib/contracts/school-link';
import { fill, type Words } from '@/lib/family/fill';
import { MISTAKE_KEYS } from '@/lib/family/marks-words';
import { CheckedPaperPdf } from './CheckedPaperPdf';
import { ScriptPages } from './ScriptPages';
import { SchoolText } from './SchoolText';

// A child's checked paper in the Family app (C351): the part totals first, then the checked pages with each mark in
// the margin beside its answer, then the questions one by one (marks, the kind of mistake, the topic, the note for the
// child), and what went well, what to work on and what to practise next. The same paper in the parent area and in the
// child's own view; the child's words are a little warmer. Nothing compares the child with anyone (docs/family-app/09
// §6 rule 10): no class average, no rank, no position.

const shown = (n: number | null) => (n === null ? '–' : Number.isInteger(n) ? String(n) : n.toFixed(1));

function QuestionRow({ q, w }: { q: SchoolMarkedQuestion; w: Words }) {
  const full = q.counted && q.marks !== null && q.marks >= q.max;
  return (
    <li data-question={q.label} className={`flex flex-col gap-1 rounded-2xl px-3 py-3 ${q.counted ? 'bg-off-white' : 'bg-white ring-1 ring-slate/15'}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-base font-bold text-slate">{fill(w['fam.marks.question'], { label: q.label })}</p>
        <p className={`shrink-0 text-base font-extrabold ${full ? 'text-emerald-text' : 'text-slate'}`}>
          {q.marks === null ? w['fam.marks.noMark'] : fill(w['fam.marks.markOf'], { marks: shown(q.marks), max: shown(q.max) })}
        </p>
      </div>
      {q.question && (
        <p className="whitespace-pre-line text-sm text-slate/80">
          <SchoolText text={q.question} />
        </p>
      )}
      {!q.counted && <p className="text-sm font-semibold text-slate">{w['fam.marks.notCounted']}</p>}
      {(q.mistake && q.mistake !== 'none') || q.topic ? (
        <div className="flex flex-wrap gap-2">
          {q.mistake && q.mistake !== 'none' && <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate ring-1 ring-slate/15">{w[MISTAKE_KEYS[q.mistake]]}</span>}
          {q.topic && (
            <span className="rounded-full bg-royal/10 px-3 py-1 text-xs font-bold text-royal-deep">
              <SchoolText text={q.chapter ? `${q.chapter} · ${q.topic}` : q.topic} />
            </span>
          )}
        </div>
      ) : null}
      {q.note && (
        <p className="whitespace-pre-line text-sm text-slate">
          <SchoolText text={q.note} />
        </p>
      )}
    </li>
  );
}

export function CheckedPaperView({ paper, w, childView }: { paper: SchoolCheckedPaper; w: Words; childView: boolean }) {
  return (
    <div data-checked-paper={paper.paperId} className="flex flex-col gap-4">
      {childView && <p className="fam-card bg-white p-4 text-sm font-semibold text-slate">{w['fam.marks.childLead']}</p>}
      <section aria-label={paper.subject} className="fam-card fam-rise flex flex-col gap-3 bg-white p-4 sm:p-5">
        <p className="text-base font-bold text-slate">
          <SchoolText text={paper.term ? `${paper.exam} · ${paper.term}` : paper.exam} />
        </p>
        <ul className="flex flex-wrap gap-3" data-part-totals>
          {paper.parts.map((p) => (
            <li key={p.component} className="flex min-w-[8rem] flex-1 flex-col rounded-2xl bg-off-white px-4 py-3">
              <SchoolText text={p.name} className="text-sm font-semibold text-slate" />
              <span className="text-3xl font-black text-slate">{fill(w['fam.marks.partScore'], { score: shown(p.score), max: shown(p.max) })}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate">{w['fam.marks.approved']}</p>
        {/* The same PDF the school sends on WhatsApp (C366), made on this phone from this paper. */}
        <CheckedPaperPdf paper={paper} w={w} />
      </section>

      {paper.pages.length > 0 && (
        <section aria-labelledby="fam-marks-pages" className="fam-card flex flex-col gap-3 bg-white p-4 sm:p-5">
          <h2 id="fam-marks-pages" className="text-lg font-extrabold text-slate">
            {w['fam.marks.pagesTitle']}
          </h2>
          <p className="text-sm text-slate">{w['fam.marks.pagesLead']}</p>
          <ScriptPages pages={paper.pages} marks={paper.questions.map((q) => ({ label: q.label, marks: q.marks, max: q.max, counted: q.counted, place: q.place }))} w={w} />
        </section>
      )}
      {/* The school's days for keeping the pictures have passed (C230-AG): the marks stay. */}
      {paper.pages.length === 0 && <p data-no-pages className="text-sm text-slate">{w['fam.marks.noPages']}</p>}

      <section aria-labelledby="fam-marks-questions" className="fam-card flex flex-col gap-3 bg-white p-4 sm:p-5">
        <h2 id="fam-marks-questions" className="text-lg font-extrabold text-slate">
          {w['fam.marks.questionsTitle']}
        </h2>
        <ol className="flex flex-col gap-2">
          {paper.questions.map((q) => (
            <QuestionRow key={q.label} q={q} w={w} />
          ))}
        </ol>
      </section>

      {(paper.strengths || paper.improve || paper.practice.length > 0) && (
        <section className="fam-card flex flex-col gap-4 bg-white p-4 sm:p-5" data-paper-advice>
          {paper.strengths && (
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-extrabold text-emerald-text">{childView ? w['fam.marks.childStrengths'] : w['fam.marks.strengths']}</h2>
              <p className="whitespace-pre-line text-base text-slate">
                <SchoolText text={paper.strengths} />
              </p>
            </div>
          )}
          {paper.improve && (
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-extrabold text-slate">{childView ? w['fam.marks.childImprove'] : w['fam.marks.improve']}</h2>
              <p className="whitespace-pre-line text-base text-slate">
                <SchoolText text={paper.improve} />
              </p>
            </div>
          )}
          {paper.practice.length > 0 && (
            <div className="flex flex-col gap-2" data-practice-next>
              <h2 className="text-lg font-extrabold text-royal-deep">{w['fam.marks.practice']}</h2>
              <ul className="flex flex-col gap-2">
                {paper.practice.map((p, i) => (
                  <li key={i} className="flex flex-col gap-1 rounded-2xl bg-royal/5 px-3 py-3">
                    {p.topic && (
                      <span className="text-xs font-bold text-royal-deep">
                        <SchoolText text={p.chapter ? `${p.chapter} · ${p.topic}` : p.topic} />
                      </span>
                    )}
                    <SchoolText text={p.text} className="text-sm text-slate" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
