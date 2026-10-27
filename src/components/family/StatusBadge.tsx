import { STUDY_STATUS_KEY, type StudyStatus } from '@/lib/family/study-status';
import { t } from '@/lib/i18n';

// A small status word with a mark on white (it sits on light and dark tabs alike), never colour alone: Received (outline), Digitizing (sun), Published (green).
const LOOK: Record<StudyStatus, string> = {
  received: 'bg-white text-slate ring-1 ring-slate/40',
  digitizing: 'bg-white text-gold-deep ring-1 ring-gold-deep/40',
  published: 'bg-white text-emerald-text ring-1 ring-emerald/40',
};
const MARK: Record<StudyStatus, string> = { received: 'M5 12h14', digitizing: 'M12 5v7l4 2', published: 'M5 12l4 4 10-10' };

export function StatusBadge({ status, lang }: { status: StudyStatus; lang: 'en' | 'hi' }) {
  return (
    <span data-study-status={status} className={`inline-flex min-h-[24px] shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${LOOK[status]}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d={MARK[status]} />
      </svg>
      {t(lang, STUDY_STATUS_KEY[status])}
    </span>
  );
}
