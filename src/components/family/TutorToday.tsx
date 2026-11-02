import type { Lang } from '@/lib/i18n';
import { t } from '@/lib/i18n';

// "Today: 7 of 40 questions, 3 of 20 voice minutes, 1 of 5 photos" in the parent area (W16-B4): what each child has used
// of the tutor today against the family's plan, in the parent's language. Counts only (src/lib/family/tutor-meter.ts).
// uncapped: testing mode lifts every cap (C404), so the line shows the counts alone (2 Nov: the section was missing then).
export type TutorTodayRow = { childId: string; firstName: string; text: number; textMax: number; voice: number; voiceMax: number; photo: number; photoMax: number; multiplier: number; uncapped: boolean };

export function TutorToday({ rows, lang }: { rows: TutorTodayRow[]; lang: Lang }) {
  if (rows.length === 0) return null;
  return (
    <section data-tutor-today className="fam-card flex flex-col gap-3 bg-white p-4">
      {rows.map((r) => (
        <div key={r.childId} data-tutor-today-child={r.childId} className="flex flex-col gap-1">
          <h3 className="text-base font-bold text-slate">{t(lang, 'fam.tutor.today.title', { name: r.firstName })}</h3>
          <p className="text-base text-slate">
            {r.uncapped
              ? t(lang, 'fam.tutor.today.free', { text: r.text, voice: r.voice, photo: r.photo })
              : t(lang, 'fam.tutor.today.line', { text: r.text, textMax: r.textMax, voice: r.voice, voiceMax: r.voiceMax, photo: r.photo, photoMax: r.photoMax })}
          </p>
          {!r.uncapped && r.multiplier > 1 && <p className="text-sm text-slate/80">{t(lang, 'fam.tutor.today.plus', { n: r.multiplier })}</p>}
        </div>
      ))}
    </section>
  );
}
