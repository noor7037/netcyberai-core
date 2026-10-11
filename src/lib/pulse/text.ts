// The words of a Daily Pulse draft (docs/20 5f, C151): fixed templates, no
// AI. Three languages: English, Hindi and Hinglish (Hindi in Latin letters,
// as the website shows it). The same input always gives the same words.
//
// A lesson that was not taught produces nothing: parents are never told a
// lesson happened when it did not.

export const PULSE_LANGS = ['en', 'hi', 'hinglish'] as const;
export type PulseLang = (typeof PULSE_LANGS)[number];
export type PulseInput = {
  className: string;
  subjectName: string;
  topic: string;
  status: 'taught' | 'partial' | 'delayed' | 'not_taught';
  homework: { title: string; dueDate: string }[];
};
export type PulseBodies = Record<PulseLang, string>;
export const MAX_PULSE_BODY = 1000;

const MONTHS: Record<PulseLang, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  hi: ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'],
  hinglish: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
// "2026-10-14" → "14 October"
export function pulseDate(iso: string, lang: PulseLang): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[lang][m - 1] ?? ''}`.trim();
}

const LESSON: Record<Exclude<PulseInput['status'], 'not_taught'>, Record<PulseLang, (i: PulseInput) => string>> = {
  taught: {
    en: (i) => `${i.className}, ${i.subjectName}: today the class learned “${i.topic}”.`,
    hi: (i) => `${i.className}, ${i.subjectName}: आज कक्षा में “${i.topic}” पढ़ाया गया।`,
    hinglish: (i) => `${i.className}, ${i.subjectName}: aaj class mein “${i.topic}” padhaya gaya.`,
  },
  partial: {
    en: (i) => `${i.className}, ${i.subjectName}: today the class began “${i.topic}”. It will be completed in the next class.`,
    hi: (i) => `${i.className}, ${i.subjectName}: आज कक्षा में “${i.topic}” शुरू हुआ। यह अगली कक्षा में पूरा होगा।`,
    hinglish: (i) => `${i.className}, ${i.subjectName}: aaj class mein “${i.topic}” shuru hua. Yeh agli class mein poora hoga.`,
  },
  delayed: {
    en: (i) => `${i.className}, ${i.subjectName}: today’s lesson “${i.topic}” was moved to the next class.`,
    hi: (i) => `${i.className}, ${i.subjectName}: आज का पाठ “${i.topic}” अगली कक्षा के लिए टल गया।`,
    hinglish: (i) => `${i.className}, ${i.subjectName}: aaj ka lesson “${i.topic}” agli class ke liye tal gaya.`,
  },
};
const HOMEWORK: Record<PulseLang, (title: string, due: string) => string> = {
  en: (title, due) => `Homework: ${title}. Due on ${due}.`,
  hi: (title, due) => `गृहकार्य: ${title}। ${due} तक जमा करना है।`,
  hinglish: (title, due) => `Homework: ${title}. ${due} tak jama karna hai.`,
};

// The three bodies, or null when there is nothing to tell parents.
export function pulseBodies(input: PulseInput): PulseBodies | null {
  if (input.status === 'not_taught') return null;
  const body = (lang: PulseLang) => [LESSON[input.status as 'taught'][lang](input), ...input.homework.map((h) => HOMEWORK[lang](h.title, pulseDate(h.dueDate, lang)))].join('\n').slice(0, MAX_PULSE_BODY);
  return { en: body('en'), hi: body('hi'), hinglish: body('hinglish') };
}
