// Words the school wrote (an exam's name, a subject, a teacher's note, a topic), shown as written. They are in the
// school's own language, not the app's, so they carry their own `lang`: Hindi when written in Devanagari, else English,
// for a screen reader to say them right on a screen in the other language.
export const schoolLang = (text: string): 'hi' | 'en' => (/[ऀ-ॿ]/.test(text) ? 'hi' : 'en');

export function SchoolText({ text, className }: { text: string; className?: string }) {
  return (
    <span lang={schoolLang(text)} className={className}>
      {text}
    </span>
  );
}
