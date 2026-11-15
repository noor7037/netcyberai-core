import type { CareerCard, CareerLevel, StreamSlug } from './types';

export type CareerQuery = {
  q?: string;
  field?: string;
  level?: string;
  stream?: string;
};

// In-memory filter over the approved cards the loader already kept. Search looks at both languages.
export function filterCareers(cards: readonly CareerCard[], query: CareerQuery): CareerCard[] {
  const q = (query.q ?? '').trim().toLowerCase();
  return cards.filter((c) => {
    if (query.field && c.fieldId !== query.field) return false;
    if (query.level && c.level !== query.level) return false;
    if (query.stream && !c.streams.includes(query.stream as StreamSlug)) return false;
    if (!q) return true;
    return [c.title.en, c.title.hi, c.summary.en, c.summary.hi, c.fieldName.en, c.fieldName.hi].some((s) => s.toLowerCase().includes(q));
  });
}

export function isLevel(v: string | undefined): v is CareerLevel {
  return v === 'entry' || v === 'skilled' || v === 'supervisor' || v === 'professional' || v === 'senior' || v === 'top';
}
