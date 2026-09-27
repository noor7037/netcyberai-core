import { isRealIsoDate } from '@/lib/import/rules';

// Input rules for "taught today" (syllabus_progress), shared by the API
// and its tests. Status values match the live check constraint
// (taught | partial | delayed | not_taught, Decision Log A1).

export const SYLLABUS_STATUSES = ['taught', 'partial', 'delayed', 'not_taught'] as const;
export type SyllabusStatus = (typeof SYLLABUS_STATUSES)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_TOPIC = 200;
// How far back a lesson can be recorded: covers a weekend plus a missed
// day, without letting weeks-old entries rewrite what parents were told.
export const MAX_BACKDATE_DAYS = 7;

export interface SyllabusInput {
  classId: string;
  subjectId: string;
  topic: string;
  status: SyllabusStatus;
  date: string; // YYYY-MM-DD
  teacherId: string | null; // only honoured for non-teacher roles
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

export function parseSyllabusInput(body: unknown, today: string): Parsed<SyllabusInput> {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (!isUuid(b.classId)) return { ok: false, error: 'classId is required' };
  if (!isUuid(b.subjectId)) return { ok: false, error: 'subjectId is required' };
  const topic = typeof b.topic === 'string' ? b.topic.trim().replace(/\s+/g, ' ') : '';
  if (!topic) return { ok: false, error: 'topic is required, e.g. "Fractions: comparing 3/4 and 5/8"' };
  if (topic.length > MAX_TOPIC) return { ok: false, error: `topic must be ${MAX_TOPIC} characters or fewer` };
  const status = (b.status ?? 'taught') as string;
  if (!(SYLLABUS_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: `status must be one of: ${SYLLABUS_STATUSES.join(', ')}` };
  }
  const date = typeof b.date === 'string' && b.date ? b.date : today;
  if (!isRealIsoDate(date)) return { ok: false, error: 'date must be a real date as YYYY-MM-DD' };
  const age = daysBetween(today, date);
  if (age < 0) return { ok: false, error: 'date cannot be in the future' };
  if (age > MAX_BACKDATE_DAYS) return { ok: false, error: `lessons can be recorded up to ${MAX_BACKDATE_DAYS} days back` };
  const teacherId = b.teacherId === undefined || b.teacherId === null ? null : b.teacherId;
  if (teacherId !== null && !isUuid(teacherId)) return { ok: false, error: 'teacherId must be a valid id' };
  return { ok: true, value: { classId: b.classId, subjectId: b.subjectId, topic, status: status as SyllabusStatus, date, teacherId } };
}

export function parseSubjectName(body: unknown): Parsed<string> {
  const raw = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).name : undefined;
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (!name) return { ok: false, error: 'name is required, e.g. "Mathematics"' };
  if (name.length > 80) return { ok: false, error: 'name must be 80 characters or fewer' };
  return { ok: true, value: name };
}

// Today's date in India, where every NetCyberAI school operates today
// (schools.timezone is Asia/Kolkata for all current schools).
export function todayInIndia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
