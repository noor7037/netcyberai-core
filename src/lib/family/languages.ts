// W23-B: the languages word help (the tap menu) speaks: Hindi and English with the major Indian regional languages. One
// list for the route's check, the Settings picker and the voice (the BCP-47 tag a phone's speech uses). Each language
// carries its own name in its own script, so a child finds theirs without reading English.

export const LANG_CODES = ['en', 'hi', 'bn', 'te', 'mr', 'ta', 'ur', 'gu', 'kn', 'ml', 'or', 'pa', 'as'] as const;
export type LangCode = (typeof LANG_CODES)[number];

export type LanguageInfo = { code: LangCode; native: string; english: string; voice: string };

export const LANGUAGES: readonly LanguageInfo[] = [
  { code: 'en', native: 'English', english: 'English', voice: 'en-IN' },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi', voice: 'hi-IN' },
  { code: 'bn', native: 'বাংলা', english: 'Bengali', voice: 'bn-IN' },
  { code: 'te', native: 'తెలుగు', english: 'Telugu', voice: 'te-IN' },
  { code: 'mr', native: 'मराठी', english: 'Marathi', voice: 'mr-IN' },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil', voice: 'ta-IN' },
  { code: 'ur', native: 'اردو', english: 'Urdu', voice: 'ur-IN' },
  { code: 'gu', native: 'ગુજરાતી', english: 'Gujarati', voice: 'gu-IN' },
  { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada', voice: 'kn-IN' },
  { code: 'ml', native: 'മലയാളം', english: 'Malayalam', voice: 'ml-IN' },
  { code: 'or', native: 'ଓଡ଼ିଆ', english: 'Odia', voice: 'or-IN' },
  { code: 'pa', native: 'ਪੰਜਾਬੀ', english: 'Punjabi', voice: 'pa-IN' },
  { code: 'as', native: 'অসমীয়া', english: 'Assamese', voice: 'as-IN' },
];

export const isLangCode = (v: unknown): v is LangCode => typeof v === 'string' && (LANG_CODES as readonly string[]).includes(v);

export function languageInfo(code: LangCode): LanguageInfo {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

// The voice tag to speak a language with (ta-IN for Tamil).
export const voiceTagOf = (code: LangCode): string => languageInfo(code).voice;
