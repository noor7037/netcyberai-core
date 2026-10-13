import { NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import type { SessionClaims } from '@/lib/auth/types';
import { canWrite, isAlwaysOn, isModuleEnabled, type SchoolEntitlements } from '@/lib/contracts/entitlements';
import type { ModuleId } from '@/lib/contracts/modules';
import { validationError, type ErrorRule } from '@/lib/errors/catalogue';
import { loadEntitlements } from '@/lib/frameworks/entitlements';

// The access guard (docs/19 rule 7, C137; reads added in C140). Every request under /api/app that
// changes something (POST, PUT, PATCH, DELETE) passes through
// requireAppSession, which calls this before the route's own code runs. A
// change is refused when the school's account is suspended or read-only, or
// when the module the route belongs to is switched off for the school. The
// role is still each route's own check; this adds the school's side of it,
// in one place, so a route cannot forget.
//
// Which module a route belongs to is written here once, by its path. A
// write route that is not in this table is refused (and
// test/frameworks/write-guard.test.ts fails): a new route must say where it
// belongs before it can change anything.
//
// Reads (C140): a GET is refused when its module is switched off for the
// school, or the school's account is paused. A read-only school reads as
// before. READ_ROUTES says which module a read belongs to; a list several
// modules draw on (classes, subjects, staff accounts) belongs to none.

export const WRITE_METHODS: readonly string[] = ['POST', 'PUT', 'PATCH', 'DELETE'];

// 'checks-itself': the module is named in the request, not in the path, and
// the route calls checkModuleAccess(..., { write: true }) with it.
// 'any-module': tied to no module's switch (staff accounts, a person's saved
// views): only the account's own state is checked.
export type WriteModule = ModuleId | 'checks-itself' | 'any-module';

// Path under /api/app → module. `*` is one segment, a trailing `**` is the
// rest. The first match wins, so the more exact paths come first.
// 'even-read-only' (C140): a read-only school may still do this. Resetting
// a colleague's password keeps people able to sign in, and looking up an ID
// card changes nothing a person can see (it writes a scan log). A paused
// school stays blocked.
export const WRITE_ROUTES: readonly (readonly [string, WriteModule, 'even-read-only'?])[] = [
  // What is recorded about a guardian sits with Parents (17 §3: guardians,
  // verification, consent, data requests), wherever its button is drawn.
  ['students/*/consent', 'parents'],
  ['students/*/guardians', 'parents'],
  ['students/*/dsr', 'parents'],
  ['guardians/**', 'parents'],
  ['dsr/**', 'parents'],
  // The student's own record, documents, family and ID card.
  ['students/**', 'students'],
  ['students', 'students'],
  ['families/**', 'students'],
  // A scanned document being read into a student's record (Students: "document
  // scan with OCR autofill"), not the Documents & Certificates module.
  ['documents/**', 'students'],
  ['qr-tokens/**', 'students'],
  // Looking up an ID card writes the scan log, so it counts as a change.
  ['scan', 'students', 'even-read-only'],
  ['attendance/**', 'attendance'],
  ['attendance', 'attendance'],
  ['timetable/**', 'timetable'],
  ['timetable', 'timetable'],
  ['homework/**', 'homework'],
  ['homework', 'homework'],
  ['recovery', 'recovery'],
  ['fees/**', 'fees'],
  // Has its own switch (C154): off unless the module, the founder's monthly limit and a provider are all there; copilotState also refuses a paused or read-only school.
  ['copilot/**', 'checks-itself'],
  ['followups/**', 'pulse'],
  ['followups', 'pulse'],
  ['pulse-drafts/**', 'pulse'],
  ['syllabus/**', 'academics'],
  ['syllabus', 'academics'],
  // Classes, subjects and who teaches what are the school's Setup.
  ['classes', 'setup'],
  ['subjects/**', 'setup'],
  ['subjects', 'setup'],
  ['compliance/**', 'compliance'],
  // Inviting colleagues and resetting their passwords is running the
  // account itself: every school must be able to, whatever its plan (the
  // first thing a new principal does). Only the account's state is checked.
  ['staff/**', 'any-module'],
  ['users/*/send-reset', 'any-module', 'even-read-only'],
  ['users/**', 'any-module'],
  ['whatsapp-config', 'communication'],
  ['communication/**', 'communication'],
  ['ptm/**', 'ptm'],
  ['ptm', 'ptm'],
  ['events/**', 'events'],
  ['events', 'events'],
  ['complaints/**', 'complaints'],
  ['complaints', 'complaints'],
  ['parent-ai/**', 'parent-ai'],
  ['parent-ai', 'parent-ai'],
  // Always on: a school can ask for help whatever its account's state.
  ['tickets/**', 'raise-ticket'],
  ['tickets', 'raise-ticket'],
  ['views/**', 'any-module'],
  ['views', 'any-module'],
  ['bulk/**', 'checks-itself'],
  ['custom-fields/**', 'checks-itself'],
  ['custom-fields', 'checks-itself'],
  ['settings/*', 'checks-itself'],
];

// Path under /api/app → the module a READ belongs to. Same patterns.
export const READ_ROUTES: readonly (readonly [string, WriteModule])[] = [
  ['students/*/consent', 'parents'],
  ['students/*/guardians', 'parents'],
  ['students/*/dsr', 'parents'],
  ['guardians/**', 'parents'],
  ['guardians', 'parents'],
  ['students/**', 'students'],
  ['students', 'students'],
  ['attendance/**', 'attendance'],
  ['attendance', 'attendance'],
  ['timetable', 'timetable'],
  ['homework/**', 'homework'],
  ['homework', 'homework'],
  ['recovery', 'recovery'],
  ['fees/**', 'fees'],
  // Has its own switch (C154): off unless the module, the founder's monthly limit and a provider are all there; copilotState also refuses a paused or read-only school.
  ['copilot/**', 'checks-itself'],
  ['followups', 'pulse'],
  ['pulse-drafts', 'pulse'],
  ['syllabus', 'academics'],
  ['compliance/**', 'compliance'],
  ['whatsapp-config', 'communication'],
  ['communication/**', 'communication'],
  ['ptm/**', 'ptm'],
  ['ptm', 'ptm'],
  ['events', 'events'],
  ['complaints', 'complaints'],
  ['parent-ai', 'parent-ai'],
  // Has its own switch (the school's daily_pulse flag) and its own session check.
  ['pulse/**', 'checks-itself'],
  ['tickets/**', 'raise-ticket'],
  ['tickets', 'raise-ticket'],
  // Drawn on by several modules' screens (the class chooser in Attendance,
  // staff names, a person's saved views, what the school has switched on).
  ['classes', 'any-module'],
  ['subjects', 'any-module'],
  ['staff/**', 'any-module'],
  ['users', 'any-module'],
  ['views', 'any-module'],
  ['entitlements', 'any-module'],
  ['bulk/actions', 'any-module'],
  ['bulk/*', 'any-module'],
  // The module is named in the request and the route checks it.
  ['search', 'checks-itself'],
  ['lists/*', 'checks-itself'],
  ['custom-fields/**', 'checks-itself'],
  ['custom-fields', 'checks-itself'],
  ['settings/*', 'checks-itself'],
];

function matches(pattern: string, segments: readonly string[]): boolean {
  const want = pattern.split('/');
  for (let i = 0; i < want.length; i++) {
    if (want[i] === '**') return segments.length > i;
    if (i >= segments.length) return false;
    if (want[i] !== '*' && want[i] !== segments[i]) return false;
  }
  return want.length === segments.length;
}

// The module of a path such as /api/app/students/123/guardians, or null
// when the path is not in the table.
export function writeModuleFor(pathname: string): WriteModule | null {
  const at = pathname.indexOf('/api/app/');
  if (at < 0) return null;
  const segments = pathname
    .slice(at + '/api/app/'.length)
    .split('/')
    .filter(Boolean);
  return WRITE_ROUTES.find(([pattern]) => matches(pattern, segments))?.[1] ?? null;
}

const segmentsOf = (pathname: string): string[] | null => {
  const at = pathname.indexOf('/api/app/');
  return at < 0 ? null : pathname.slice(at + '/api/app/'.length).split('/').filter(Boolean);
};

// May a read-only school still make this change?
export function allowedWhenReadOnly(pathname: string): boolean {
  const segments = segmentsOf(pathname);
  return !!segments && WRITE_ROUTES.find(([pattern]) => matches(pattern, segments))?.[2] === 'even-read-only';
}

export function readModuleFor(pathname: string): WriteModule | null {
  const segments = segmentsOf(pathname);
  return segments ? (READ_ROUTES.find(([pattern]) => matches(pattern, segments))?.[1] ?? null) : null;
}

// Why a read is refused, or null. A read-only school reads as before.
export function readRefusal(entitlements: SchoolEntitlements, module: WriteModule): ErrorRule | null {
  if (module === 'checks-itself') return null;
  if (module !== 'any-module' && isAlwaysOn(module)) return null;
  if (entitlements.accessMode === 'suspended') return 'account_paused';
  if (module !== 'any-module' && !isModuleEnabled(entitlements, module)) return 'module_off';
  return null;
}

// Why a change is refused, or null when it may go ahead. Pure: the rule itself.
export function writeRefusal(entitlements: SchoolEntitlements, module: WriteModule, evenReadOnly = false): ErrorRule | null {
  if (module === 'checks-itself') return null;
  if (module !== 'any-module' && isAlwaysOn(module)) return null;
  if (entitlements.accessMode === 'suspended') return 'account_paused';
  if (module !== 'any-module' && !isModuleEnabled(entitlements, module)) return 'module_off';
  if (!canWrite(entitlements) && !evenReadOnly) return 'read_only';
  return null;
}

const refuse = (rule: ErrorRule, status = 403) => NextResponse.json(validationError(rule), { status });

// Called by requireAppSession for every changing request. Returns the
// refusal to send, or null. One short read in the caller's own tenant
// context; a path missing from the table is refused, never waved through.
export async function guardWrite(claims: SessionClaims & { schoolId: string }, pathname: string): Promise<NextResponse | null> {
  const module = writeModuleFor(pathname);
  if (module === null) {
    console.error('[write-guard] a write route is not in WRITE_ROUTES', pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '*'));
    return refuse('not_saved', 500); // our omission, not the person's: say only that it was not saved
  }
  if (module === 'checks-itself' || (module !== 'any-module' && isAlwaysOn(module))) return null;
  try {
    const entitlements = await withTenantContext(claims, (db) => loadEntitlements(db, claims.schoolId));
    const rule = writeRefusal(entitlements, module, allowedWhenReadOnly(pathname));
    return rule ? refuse(rule) : null;
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

// The same for a read, inside a transaction the caller already has (C143):
// appRoute runs it at the start of the route's own transaction, so a read
// costs no extra round of database work. Returns the refusal, or null.
export async function checkRead(db: Parameters<typeof loadEntitlements>[0], schoolId: string, pathname: string): Promise<NextResponse | null> {
  const module = readModuleFor(pathname);
  if (module === null) {
    console.error('[access-guard] a read route is not in READ_ROUTES', pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '*'));
    return refuse('not_sent_properly', 500);
  }
  if (module === 'checks-itself' || (module !== 'any-module' && isAlwaysOn(module))) return null;
  const rule = readRefusal(await loadEntitlements(db, schoolId), module);
  return rule ? refuse(rule) : null;
}

// For a route that opens its own transaction later (the older routes): one
// short read in the caller's own tenant context, before the route's work.
export async function guardRead(claims: SessionClaims & { schoolId: string }, pathname: string): Promise<NextResponse | null> {
  try {
    return await withTenantContext(claims, (db) => checkRead(db, claims.schoolId, pathname));
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
