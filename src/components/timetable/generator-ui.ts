import type { MessageKey } from '@/lib/i18n';
import type { Change, Unplaced, WeekProblem } from '@/lib/timetable/generator';
import { WEEKDAYS, type Slot } from '@/lib/timetable/plan';

// What the timetable generator's screen reads (GET /api/app/timetable/generator and /api/app/timetable/history),
// and the small helpers its parts share (C229).

// maxConsecutive: null while the school has not set it (C231): no proposal is made until it does.
export type Rules = { days: number[]; periods: number; maxConsecutive: number | null };
export type DraftRules = { days: number[]; periods: number; maxConsecutive: number };
export type Names = { classes: { id: string; name: string }[]; subjects: { id: string; name: string }[]; teachers: { id: string; name: string; active: boolean }[] };
export type Draft = {
  proposalId: string;
  proposedBy: string;
  proposedByName: string;
  proposedAt: string;
  rules: DraftRules;
  classIds: string[];
  entries: Slot[];
  unplaced: Unplaced[];
  swaps: number;
  current: Slot[];
  changes: Change[];
  stale: boolean;
  rulesChanged: boolean;
  problems: WeekProblem[];
  teachersGone: string[];
  notAssigned: { classId: string; subjectId: string; teacherUserId: string }[];
};
export type GeneratorData = {
  rules: Rules;
  loads: { classId: string; subjectId: string; periods: number; teacherUserId: string }[];
  unavailable: { teacherUserId: string; weekday: number; period: number | null }[];
  assigned: { classId: string; subjectId: string; teacherUserId: string }[];
  names: Names;
  draft: Draft | null;
  mayEditSettings: boolean;
};

export const dayKey = (weekday: number) => `tt.day.${WEEKDAYS[weekday - 1]}` as MessageKey;
export const TAP = 'min-h-[44px] rounded-md border px-3 text-sm font-semibold';
export const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
export const SECONDARY = 'min-h-[44px] rounded-md border border-slate/20 bg-white px-4 text-sm font-semibold text-slate disabled:opacity-60';
export const CARD = 'flex flex-col gap-3 rounded-xl border border-slate/10 bg-white p-3 sm:p-4';

// Names for ids, from what the screen was given. An id with no name (removed since) shows as nothing.
export function namer(names: Names) {
  const classes = new Map(names.classes.map((c) => [c.id, c.name]));
  const subjects = new Map(names.subjects.map((s) => [s.id, s.name]));
  const teachers = new Map(names.teachers.map((p) => [p.id, p.name]));
  return { cls: (id: string) => classes.get(id) ?? '', subject: (id: string) => subjects.get(id) ?? '', teacher: (id: string | null) => (id ? teachers.get(id) ?? '' : '') };
}

export async function send(url: string, method: 'POST' | 'PUT' | 'DELETE', body: unknown): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const json = ((await res?.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  return { ok: Boolean(res?.ok), body: json };
}

export function when(iso: string, lang: string): string {
  return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso));
}

// Where the most periods in a row for one teacher is set: the timetable's card on the Settings page, at that field
// (C231). The field's own id, as the settings screen gives it.
export const CONSECUTIVE_SETTING_HREF = '/app/settings#set-timetable-max_consecutive';
