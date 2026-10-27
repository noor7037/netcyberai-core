import type { SchoolExamPaper } from '@/lib/contracts/school-link';
import { fill, type Words } from '@/lib/family/fill';
import { SchoolText } from './SchoolText';

// The child's exam timetable (C351): the coming papers of the child's class, day by day, with the child's own exam
// number when the exam uses them. Read only, as the school published it; nothing about any other child.
const day = (iso: string, lang: 'en' | 'hi') =>
  new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

export function ExamTimetable({ w, lang, papers, heading = 'p' }: { w: Words; lang: 'en' | 'hi'; papers: SchoolExamPaper[]; heading?: 'p' | 'h2' }) {
  const Title = heading;
  const seats = Array.from(new Set(papers.map((p) => p.seatNo).filter((s): s is string => !!s)));
  return (
    <div className="flex flex-col gap-2" data-exam-timetable>
      <Title className={heading === 'h2' ? 'text-lg font-extrabold text-slate' : 'text-sm font-semibold text-slate'}>{w['fam.marks.timetable']}</Title>
      {papers.length === 0 ? (
        <p className="text-sm text-slate">{w['fam.marks.timetableNone']}</p>
      ) : (
        <>
          {seats.length > 0 && (
            <p className="text-sm font-semibold text-slate" data-exam-seat>
              {seats.map((s) => fill(w['fam.marks.seat'], { seat: s })).join(' · ')}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {papers.map((p, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl bg-off-white px-3 py-2 text-sm text-slate">
                <span className="w-24 shrink-0 font-bold">{day(p.date, lang)}</span>
                <span className="min-w-0 flex-1">
                  <SchoolText text={p.subject} className="block font-semibold" />
                  <SchoolText text={p.exam} className="block text-slate/80" />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
