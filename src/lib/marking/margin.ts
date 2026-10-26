// Where a question's mark sits in the margin of the scanned page (C347): at the answer's place on its page, a fraction of
// the page's height from the top. Pure, so the placement, the colour and the stacking of badges are tested
// (test/marking/margin.test.ts); src/components/marking/PagesPane.tsx draws what this says.

export type BadgeKind = 'full' | 'part' | 'none' | 'unmarked' | 'out';

// full: the question's marks; part: some; none: nothing; unmarked: no mark yet; out: internal choice left it out.
export function badgeKind(final: number | null, max: number, counted: boolean): BadgeKind {
  if (!counted) return 'out';
  if (final === null || final === undefined) return 'unmarked';
  if (final >= max) return 'full';
  if (final <= 0) return 'none';
  return 'part';
}

const one = (n: number) => String(Math.round(n * 10) / 10);

// "3/4", "3.5/4"; "–/4" with no mark yet.
export function badgeText(final: number | null, max: number): string {
  return `${final === null || final === undefined ? '–' : one(final)}/${one(max)}`;
}

export type BadgeIn = {
  questionId: string;
  place: { pageId: string; yFrom: number; yTo: number } | null;
  final: number | null;
  max: number;
  counted: boolean;
};
export type BadgePlacement = {
  questionId: string;
  pageId: string;
  top: number; // percent of the page's height, where the answer starts
  height: number; // percent of the page's height the answer takes
  slot: number; // 0 is next to the page; a second badge for the same place sits one step further out
  kind: BadgeKind;
  text: string;
};

// Badges closer than this (a fraction of the page's height) would cover each other.
export const BADGE_GAP = 0.04;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// A place on the page, kept within it and the right way up; null if it is not a place.
export function cleanPlace(place: BadgeIn['place']): { pageId: string; yFrom: number; yTo: number } | null {
  if (!place || typeof place.pageId !== 'string' || !Number.isFinite(place.yFrom) || !Number.isFinite(place.yTo)) return null;
  const a = clamp01(place.yFrom);
  const b = clamp01(place.yTo);
  return { pageId: place.pageId, yFrom: Math.min(a, b), yTo: Math.max(a, b) };
}

export function layoutBadges(questions: readonly BadgeIn[]): BadgePlacement[] {
  const placed = questions
    .map((q, order) => ({ q, order, place: cleanPlace(q.place) }))
    .filter((x): x is typeof x & { place: NonNullable<typeof x.place> } => x.place !== null);
  const byPage = new Map<string, typeof placed>();
  for (const x of placed) byPage.set(x.place.pageId, [...(byPage.get(x.place.pageId) ?? []), x]);
  const out: BadgePlacement[] = [];
  for (const items of byPage.values()) {
    // From the top of the page down (the question's own order breaks a tie); each badge takes the first column
    // next to the page where the one above has cleared it.
    const sorted = [...items].sort((a, b) => a.place.yFrom - b.place.yFrom || a.order - b.order);
    const lastTop: number[] = [];
    for (const x of sorted) {
      let slot = lastTop.findIndex((top) => x.place.yFrom - top >= BADGE_GAP);
      if (slot < 0) slot = lastTop.length;
      lastTop[slot] = x.place.yFrom;
      out.push({
        questionId: x.q.questionId,
        pageId: x.place.pageId,
        top: x.place.yFrom * 100,
        height: Math.max(0, x.place.yTo - x.place.yFrom) * 100,
        slot,
        kind: badgeKind(x.q.final, x.q.max, x.q.counted),
        text: badgeText(x.q.final, x.q.max),
      });
    }
  }
  return out;
}
