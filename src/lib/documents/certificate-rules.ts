import { findCertDef, missingRequired, type CertDef, type CertValues } from '@/lib/certificates/definitions';
import { hasAadhaarNumber } from '@/lib/privacy/aadhaar';

// The rules of certificates issued from the student record (docs/28 row 10e, C228). Pure: no database, no browser,
// so the server, the screen and the tests read the same rules.
//
// The words a certificate prints are the website studio's own (src/lib/certificates/definitions.ts and render.ts,
// imported, never copied): the same fields, filled here from the school's record and from what the office typed for
// the batch. The four the school issues from the record: transfer (TC), bonafide, character and study.

export const CERT_TYPES = ['transfer', 'bonafide', 'character', 'study'] as const;
export type CertificateType = (typeof CERT_TYPES)[number];
export const isCertificateType = (v: unknown): v is CertificateType => (CERT_TYPES as readonly unknown[]).includes(v);
export const certDef = (type: CertificateType): CertDef => findCertDef(type) as CertDef;

// The number the register gives: per school and per type, in sequence. The twin of the generated column
// certificates_issued.number (supabase/migrations/*_p7_certificates.sql).
export const NUMBER_PREFIX: Record<CertificateType, string> = { transfer: 'TC', bonafide: 'BC', character: 'CC', study: 'SC' };
export const certificateNumber = (type: CertificateType, seq: number): string => `${NUMBER_PREFIX[type]}/${String(seq).padStart(4, '0')}`;
// A file name with the number only: never a child's name.
export const certificateFileName = (number: string): string => `certificate-${number.replace(/[^A-Za-z0-9]+/g, '-')}.pdf`;
export const BATCH_PDF_NAME = 'certificates.pdf';

// What the office types once for a batch, per type, by the studio's own field ids. Everything else comes from the
// record. A batch is at most this many children (a class).
export const BATCH_MAX = 100;
export type TypedField = { id: string; required: boolean };
export const TYPED_FIELDS: Record<CertificateType, readonly TypedField[]> = {
  transfer: [
    { id: 'reason', required: true },
    { id: 'conduct', required: false },
    { id: 'lastAttendance', required: false },
    { id: 'remarks', required: false },
  ],
  bonafide: [{ id: 'purpose', required: true }],
  study: [{ id: 'purpose', required: true }],
  character: [
    { id: 'period', required: true },
    { id: 'conduct', required: true },
    { id: 'purpose', required: false },
    { id: 'discipline', required: false },
  ],
};

// The choices a select field offers, as the studio lists them (blank left out).
export function fieldOptions(type: CertificateType, id: string): string[] {
  return (certDef(type).fields.find((f) => f.id === id)?.options ?? []).filter(Boolean);
}

export type TypedProblem = 'missing' | 'too_long' | 'option' | 'date' | 'aadhaar';
export type TypedResult = { ok: true; values: Record<string, string> } | { ok: false; reason: TypedProblem; field: string };
const clean = (s: string) => s.trim().replace(/\s+/g, ' ');

// The batch's typed values, checked against the studio's own limits and choices, and the one Aadhaar rule. A date is
// a day that has come (India's today, given by the caller).
export function readTyped(type: CertificateType, raw: Record<string, unknown>, today: string): TypedResult {
  const def = certDef(type);
  const values: Record<string, string> = {};
  for (const want of TYPED_FIELDS[type]) {
    const field = def.fields.find((f) => f.id === want.id);
    if (!field) continue;
    const given = raw[want.id];
    if (given !== undefined && given !== null && typeof given !== 'string') return { ok: false, reason: 'missing', field: want.id };
    const v = clean(typeof given === 'string' ? given : '');
    if (!v) {
      if (want.required) return { ok: false, reason: 'missing', field: want.id };
      continue;
    }
    if (field.kind === 'select') {
      if (!fieldOptions(type, want.id).includes(v)) return { ok: false, reason: 'option', field: want.id };
    } else if (field.kind === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || v > today) return { ok: false, reason: 'date', field: want.id };
    } else if (field.max && v.length > field.max) {
      return { ok: false, reason: 'too_long', field: want.id };
    }
    if (hasAadhaarNumber(v)) return { ok: false, reason: 'aadhaar', field: want.id };
    values[want.id] = v;
  }
  return { ok: true, values };
}

// A principal's words: why the fee clearance is waived, or why a certificate is withdrawn.
export const REASON_MAX = 300;
export function readReason(raw: unknown): { ok: true; value: string } | { ok: false; reason: 'reason' | 'aadhaar' } {
  const v = typeof raw === 'string' ? clean(raw) : '';
  if (!v || v.length > REASON_MAX) return { ok: false, reason: 'reason' };
  if (hasAadhaarNumber(v)) return { ok: false, reason: 'aadhaar' };
  return { ok: true, value: v };
}

// The child as the school's record has it, and the school's details, when the certificate is issued.
export type ChildRecord = {
  name: string;
  admissionNo: string | null;
  dob: string | null; // YYYY-MM-DD
  gender: string; // male, female, transgender, not_given
  status: string; // active, pending_consent, inactive, transferred
  className: string | null;
  guardians: readonly { name: string; relation: string | null }[];
};
export type IssueContext = { schoolName: string; address: string | null; year: string | null; signName: string | null; owesNothing: boolean };

const GENDER: Record<string, string> = { male: 'Male', female: 'Female', transgender: 'Transgender' };
const RELATION: Record<string, string> = { male: 'son', female: 'daughter' };
const still = (status: string) => status === 'active' || status === 'pending_consent';

// The father's (or else the first) guardian's name, and the mother's when she is a separate guardian.
function parents(guardians: ChildRecord['guardians']): { father: string; mother: string } {
  const by = (re: RegExp) => guardians.find((g) => re.test(g.relation ?? ''));
  const father = by(/father/i) ?? guardians.find((g) => !/mother/i.test(g.relation ?? '')) ?? guardians[0];
  const mother = by(/mother/i);
  return { father: father?.name ?? '', mother: mother && mother !== father ? mother.name : '' };
}

export type ComposeResult = { ok: true; printed: CertValues } | { ok: false; reason: 'incomplete'; fields: string[] } | { ok: false; reason: 'aadhaar' };

// What the certificate prints, by the studio's own field ids, from the record and the batch's typed values. A field
// the record does not have is left out (the studio prints a dash), unless the studio requires it: then the
// certificate is not issued and the missing fields are named, for the office to complete the record first.
export function composePrinted(type: CertificateType, child: ChildRecord, typed: Record<string, string>, ctx: IssueContext): ComposeResult {
  const { father, mother } = parents(child.guardians);
  const base: CertValues = {
    schoolName: ctx.schoolName,
    address: ctx.address ?? '',
    studentName: child.name,
    admissionNo: child.admissionNo ?? '',
    signName: ctx.signName ?? '',
    signTitle: 'Principal',
  };
  let values: CertValues;
  if (type === 'transfer') {
    values = { ...base, fatherName: father, motherName: mother, dob: child.dob ?? '', gender: GENDER[child.gender] ?? '', lastClass: child.className ?? '', dues: ctx.owesNothing ? 'Yes' : 'No', ...typed };
  } else if (type === 'character') {
    values = { ...base, parentName: father, className: child.className ?? '', ...typed };
  } else {
    const status = type === 'bonafide' ? (still(child.status) ? 'is a bonafide student' : 'was a bonafide student') : still(child.status) ? 'is studying' : 'studied';
    values = { ...base, dob: child.dob ?? '', parentName: father, relation: RELATION[child.gender] ?? 'ward', className: child.className ?? '', year: ctx.year ?? '', status, ...typed };
  }
  const printed: CertValues = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ''));
  // The number and the day are the register's: stand-ins here only to ask the studio what else is missing.
  const def = certDef(type);
  const missing = missingRequired({ def, template: def.templates[0], values: { ...printed, [def.numberField]: '-', issueDate: '2000-01-01' }, rows: {}, images: {}, options: { stampBox: false, qr: false } });
  if (missing.length) {
    const ids = [...def.fields.filter((f) => missing.includes(f.label)).map((f) => f.id), ...(missing.includes('School name') ? ['schoolName'] : [])];
    return { ok: false, reason: 'incomplete', fields: ids };
  }
  if (Object.values(printed).some((v) => hasAadhaarNumber(v))) return { ok: false, reason: 'aadhaar' };
  return { ok: true, printed };
}
