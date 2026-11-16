// The tutor's name for a topic, checked (free of server code: the answer block's reader uses it).
const LATIN_PHRASE = /^[A-Za-z][A-Za-z0-9 '-]{2,59}$/;

// The model's English topic as a clean phrase, or null (anything that is not plain English letters is not trusted as the English term).
export const cleanEnglish = (v: unknown): string | null => {
  const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return LATIN_PHRASE.test(t) ? t.toLowerCase() : null;
};
export const cleanLocal = (v: unknown): string | null => {
  const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  return t.length >= 2 ? t : null;
};

