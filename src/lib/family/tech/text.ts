// Language helpers for Tech Lab lessons (en / hi / hinglish). Shared by the server and the phone.

export type TechLang = 'en' | 'hi' | 'hinglish';

export const TECH_LANGS: readonly { id: TechLang; label: string }[] = [
  { id: 'hinglish', label: 'Hinglish' },
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिंदी' },
];

const ORDER: Record<TechLang, readonly TechLang[]> = {
  hinglish: ['hinglish', 'en', 'hi'],
  en: ['en', 'hinglish', 'hi'],
  hi: ['hi', 'hinglish', 'en'],
};

export function isTechLang(v: unknown): v is TechLang {
  return v === 'en' || v === 'hi' || v === 'hinglish';
}

// The lesson language the parent chose for this child. Hinglish when that is the style, or when nothing was chosen.
export function langForChild(style: string | null | undefined): TechLang {
  return isTechLang(style) ? style : 'hinglish';
}

// The Study reader's voice only has English and Hindi. Roman Hinglish is read with the Indian English voice.
export function voiceLang(lang: TechLang): 'en' | 'hi' {
  return lang === 'hi' ? 'hi' : 'en';
}

export function pick(lang: TechLang, value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value !== 'object') return '';
  const row = value as Record<string, unknown>;
  for (const key of ORDER[lang]) {
    const text = row[key];
    if (typeof text === 'string' && text.trim()) return text;
  }
  return typeof row.text === 'string' ? row.text : '';
}

export function fill(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole));
}
