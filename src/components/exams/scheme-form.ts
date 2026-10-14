import { COMPONENT_KINDS, type ComponentKind, type GradingScheme, type Layout } from '@/lib/exams/scheme';

// What the scheme builder's fields hold while a person types (numbers as text), and the scheme they make. The
// scheme is then checked by validateScheme, the same rules the server and the database hold.

export type BandForm = { from: string; to: string; grade: string; meaning: string };
export type PartForm = { name: string; share: string };
export type ComponentForm = { key: string; kind: ComponentKind; name: string; share: string; passMark: string; parts: PartForm[] };
export type CoGradeForm = { grade: string; meaning: string; pass: boolean };
export type SchemeForm = { bands: BandForm[]; decimals: 0 | 1; passMark: string; components: ComponentForm[]; terms: string[]; layout: Layout; areas: string[]; coGrades: CoGradeForm[] };

const str = (n: number | null) => (n === null ? '' : String(n));
// Empty is none; anything else must be a number (a comma is read as a decimal point).
const numOrNull = (s: string): number | null => (s.trim() === '' ? null : Number(s.trim().replace(',', '.')));
const numOrNaN = (s: string): number => (s.trim() === '' ? Number.NaN : Number(s.trim().replace(',', '.')));

export function schemeToForm(s: GradingScheme): SchemeForm {
  return {
    bands: s.bands.map((b) => ({ from: str(b.from), to: str(b.to), grade: b.grade, meaning: b.meaning ?? '' })),
    decimals: s.decimals,
    passMark: str(s.passMark),
    components: s.components.map((c) => ({ key: c.key, kind: COMPONENT_KINDS.includes(c.kind) ? c.kind : 'other', name: c.name, share: String(c.share), passMark: str(c.passMark), parts: c.parts.map((p) => ({ name: p.name, share: String(p.share) })) })),
    terms: s.terms.map((x) => x.name),
    layout: { ...s.layout },
    areas: s.coScholastic?.areas.slice() ?? [],
    coGrades: s.coScholastic?.grades.map((g) => ({ grade: g.grade, meaning: g.meaning ?? '', pass: g.pass })) ?? [],
  };
}

export function formToScheme(f: SchemeForm): GradingScheme {
  return {
    bands: f.bands.map((b) => ({ from: numOrNull(b.from), to: numOrNull(b.to), grade: b.grade, meaning: b.meaning.trim() ? b.meaning : null })),
    decimals: f.decimals,
    passMark: numOrNull(f.passMark),
    components: f.components.map((c) => ({ key: c.key, kind: c.kind, name: c.name, share: numOrNaN(c.share), passMark: numOrNull(c.passMark), parts: c.parts.map((p) => ({ name: p.name, share: numOrNaN(p.share) })) })),
    terms: f.terms.map((name) => ({ name })),
    layout: { ...f.layout },
    coScholastic: f.areas.length || f.coGrades.length ? { areas: f.areas.slice(), grades: f.coGrades.map((g) => ({ grade: g.grade, meaning: g.meaning.trim() ? g.meaning : null, pass: g.pass })) } : null,
  };
}
