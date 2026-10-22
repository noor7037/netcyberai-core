import { subjectTheme } from '@/lib/family/subject-theme';

// A subject's mark (D1, C230-Q): a line icon, or for a language its own letters. Decorative: the subject's name is
// always written beside it.
export function SubjectGlyph({ subject, className = 'h-6 w-6' }: { subject: string; className?: string }) {
  const g = subjectTheme(subject).glyph;
  if (g.text) {
    return (
      <span aria-hidden="true" className={`flex items-center justify-center text-lg font-black leading-none ${className}`}>
        {g.text}
      </span>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={g.path} />
    </svg>
  );
}
