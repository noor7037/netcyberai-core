import { findCertDef, missingRequired, type CertDef, type CertValues } from '@/lib/certificates/definitions';
import type { SettingValue } from '@/lib/contracts/settings';
import type { Band } from '@/lib/exams/scheme';
import { hasAadhaarNumber } from '@/lib/privacy/aadhaar';

// Merit and participation certificates from a published result (C230-AJ part 5, slice E). Pure: no database, no browser,
// so the server, the screen and the tests read the same rules.
//
// The school sets the rules in its Documents settings (src/lib/frameworks/settings-schemas.ts, the 'documents' block), and
// they are read with their defaults here:
//   - Merit: off; or the overall GRADE a child reached (that grade or better, by the bands of the scheme kept with the
//     publication); or the overall PERCENT (that or more, as the report card prints it).
//   - Participation: off; or for everyone who sat the exam; or only for those who did not earn a merit certificate.
// A child "sat" the exam when at least one of their marks in it is a score (absent and exempt are not marks, as in every
// percent). Nobody is ranked or compared: each child meets the rule by their own result, whatever any other child scored.
//
// The certificate is the documents studio's own layout (src/lib/certificates/render.ts: the achievement certificate,
// "Certificate of Merit" or "Certificate of Participation"), made into the school's register like the other certificates
// (numbers, seal, signature, QR check), by src/lib/documents/result-certificates.ts. What it prints names the exam, never a
// mark, a grade or a percent.

export const RESULT_CERT_TYPES = ['merit', 'participation'] as const;
export type ResultCertType = (typeof RESULT_CERT_TYPES)[number];
export const isResultCertType = (v: unknown): v is ResultCertType => (RESULT_CERT_TYPES as readonly unknown[]).includes(v);
// The studio draws both with its achievement certificate; its `kind` field says which.
export const resultCertDef = (): CertDef => findCertDef('achievement') as CertDef;
export const RESULT_KIND_WORD: Record<ResultCertType, string> = { merit: 'Merit', participation: 'Participation' };

export const MERIT_BASES = ['off', 'grade', 'percent'] as const;
export type MeritBasis = (typeof MERIT_BASES)[number];
export const PARTICIPATION_FOR = ['everyone', 'others'] as const;
export type ParticipationFor = (typeof PARTICIPATION_FOR)[number];

export const RESULT_RULE_KEYS = { basis: 'merit_basis', grade: 'merit_grade', percent: 'merit_percent', participation: 'participation_for' } as const;
export const RESULT_RULE_DEFAULTS = { basis: 'off' as MeritBasis, grade: 'A', percent: 90, participation: 'off' as 'off' | ParticipationFor };

export type ResultCertRules = {
  merit: { basis: 'off' } | { basis: 'grade'; grade: string } | { basis: 'percent'; percent: number };
  participation: 'off' | ParticipationFor;
};

// The rules in force, from the Documents settings' effective values; a value that is not one of the choices reads as its
// default.
export function readRules(effective: Readonly<Record<string, SettingValue | undefined>>): ResultCertRules {
  const basis = effective[RESULT_RULE_KEYS.basis];
  const grade = effective[RESULT_RULE_KEYS.grade];
  const percent = effective[RESULT_RULE_KEYS.percent];
  const part = effective[RESULT_RULE_KEYS.participation];
  const gradeWord = typeof grade === 'string' && grade.trim() ? grade.trim() : RESULT_RULE_DEFAULTS.grade;
  const percentNo = typeof percent === 'number' && Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : RESULT_RULE_DEFAULTS.percent;
  return {
    merit: basis === 'grade' ? { basis: 'grade', grade: gradeWord } : basis === 'percent' ? { basis: 'percent', percent: percentNo } : { basis: 'off' },
    participation: part === 'everyone' || part === 'others' ? part : 'off',
  };
}

// What one child's result gives the rules: their overall grade and percent as the report card prints them, and whether
// they sat the exam.
export type ResultChild = { studentId: string; sat: boolean; grade: string | null; percent: number | null };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
// A grade's place: the lowest "from" of the bands that carry its name (a higher number is a better grade). null: the
// scheme has no such grade.
export function gradeFloor(bands: readonly Band[], grade: string): number | null {
  const froms = bands.filter((b) => same(b.grade, grade) && b.from !== null).map((b) => b.from as number);
  return froms.length ? Math.min(...froms) : null;
}

export type Recipients = { merit: string[]; participation: string[]; noSuchGrade: boolean };

// Who gets what, in the order the children were given (the roll). `bands` are those of the scheme kept with the
// publication, so the grade the card shows is the grade the rule reads.
export function recipientsOf(rules: ResultCertRules, bands: readonly Band[], children: readonly ResultChild[]): Recipients {
  const merit = new Set<string>();
  let noSuchGrade = false;
  if (rules.merit.basis === 'grade') {
    const want = gradeFloor(bands, rules.merit.grade);
    if (want === null) noSuchGrade = true;
    else
      for (const c of children) {
        const own = c.sat && c.grade ? gradeFloor(bands, c.grade) : null;
        if (own !== null && own >= want) merit.add(c.studentId);
      }
  } else if (rules.merit.basis === 'percent') {
    for (const c of children) if (c.sat && c.percent !== null && c.percent >= rules.merit.percent) merit.add(c.studentId);
  }
  const participation =
    rules.participation === 'off' ? [] : children.filter((c) => c.sat && (rules.participation === 'everyone' || !merit.has(c.studentId))).map((c) => c.studentId);
  return { merit: children.filter((c) => merit.has(c.studentId)).map((c) => c.studentId), participation, noSuchGrade };
}

// What a certificate prints, by the studio's own field ids. The register's number, day and signer are the database's
// (certificates_issued_insert). `studentName` rides beside `recipientName`: the register's list, the public check page and
// the family message read the child's name from it.
export type ResultCertInput = { kind: ResultCertType; child: string; className: string | null; exam: string; term: string | null; session: string | null; school: string; address: string | null };
export type ResultCertComposed = { ok: true; printed: CertValues; purpose: string } | { ok: false; reason: 'incomplete' | 'aadhaar' };

// A purpose is at most 90 characters (the register's rule): the exam's words, shortened.
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

export function composeResultCertificate(i: ResultCertInput): ResultCertComposed {
  const event = clip(i.term ? `${i.exam} · ${i.term}` : i.exam, 90);
  const values: CertValues = {
    schoolName: i.school,
    address: i.address ?? '',
    kind: RESULT_KIND_WORD[i.kind],
    recipientName: i.child,
    studentName: i.child,
    recipientRole: 'Student',
    className: i.className ?? '',
    // The studio words a participation certificate itself ("for outstanding participation in ..."); merit names the work.
    award: i.kind === 'merit' ? 'outstanding academic performance' : '',
    event,
    level: 'School',
    year: i.session ?? '',
    organizer: i.school,
  };
  const printed: CertValues = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ''));
  const def = resultCertDef();
  if (missingRequired({ def, template: def.templates[0], values: { ...printed, issueDate: '2000-01-01' }, rows: {}, images: {}, options: { stampBox: false, qr: false } }).length) return { ok: false, reason: 'incomplete' };
  if (Object.values(printed).some((v) => hasAadhaarNumber(v))) return { ok: false, reason: 'aadhaar' };
  return { ok: true, printed, purpose: event };
}
