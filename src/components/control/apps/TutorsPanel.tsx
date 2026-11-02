import type { ControlTutor } from '@/lib/control/family-settings';
import { t, type Lang, type MessageKey } from '@/lib/i18n';

// Control → Family: the platform's tutors, read only (W16-A3). Server-rendered, no script. Each row: the tutor's name, its
// subject, the language it speaks, how it teaches, and "Off" when it is switched off for every family.
export function TutorsPanel({ tutors, lang }: { tutors: readonly ControlTutor[]; lang: Lang }) {
  return (
    <section data-control-tutors className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate/10 bg-white p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-extrabold text-slate">{t(lang, 'control.family.tutors.title')}</h2>
        <p className="text-sm text-slate">{t(lang, 'control.family.tutors.lead')}</p>
      </div>
      {tutors.length === 0 ? (
        <p className="text-sm text-slate">{t(lang, 'control.family.tutors.none')}</p>
      ) : (
        <ul className="flex list-none flex-col gap-2 p-0">
          {tutors.map((x) => (
            <li key={x.key} data-control-tutor={x.key} className="flex min-w-0 flex-col gap-1 rounded-lg border border-slate/10 p-3 text-sm text-slate">
              <p className="break-words text-base font-bold">
                {lang === 'hi' ? x.nameHi : x.nameEn}
                {!x.enabled && <span className="ml-2 rounded-full bg-slate/10 px-2.5 py-0.5 text-sm font-medium">{t(lang, 'control.family.tutors.off')}</span>}
              </p>
              <p className="break-words">{lang === 'hi' ? x.styleHi : x.styleEn}</p>
              <p className="text-slate/80">
                {x.subject ? t(lang, `fam.subject.${x.subject}` as MessageKey) : t(lang, 'control.family.tutors.all')} · {t(lang, `aitutors.lang.${x.language}` as MessageKey)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
