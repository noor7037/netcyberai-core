// The one Hindi month the browsers spell two ways is written one way (as src/lib/family/day-text.ts does).
const sameInkOnBothSides = (text: string): string => text.replace(/अक्टू/g, 'अक्तू');

// How a parent-teacher meeting's day and time read in the Family app (W20-E): "Sat, 14 Nov" and "10:30 am", in the
// parent's language. A calendar day (yyyy-mm-dd) and a clock time (hh:mm) as the school set them: no time zone moves them.
export const ptmDay = (iso: string, lang: 'en' | 'hi') =>
  sameInkOnBothSides(new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)));

export const ptmTime = (hhmm: string, lang: 'en' | 'hi') =>
  sameInkOnBothSides(new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }).format(new Date(`1970-01-01T${hhmm}:00Z`)));
