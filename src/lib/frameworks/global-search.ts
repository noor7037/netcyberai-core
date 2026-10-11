import type { StaffRole } from '@/lib/auth/types';
import { isModuleEnabled, type SchoolEntitlements } from '@/lib/contracts/entitlements';
import { GLOBAL_SEARCH_MIN_CHARS, GLOBAL_SEARCH_PER_KIND, type GlobalSearchKind, type GlobalSearchResult } from '@/lib/contracts/global-search';
import { moduleById, type ModuleId, type SchoolRole } from '@/lib/contracts/modules';
import { isTicketStatus, ticketRef } from '@/lib/contracts/tickets';
import type { Sql } from '@/lib/jobs/types';
import { likeEscape, parseStudentSearch, searchStudents, STUDENT_SEARCH_ROLES } from './student-search';

// Global search (docs/19 rule 6, C135). Runs inside the caller's tenant
// context, so row-level security decides which rows exist for them: a
// teacher finds only students of their own classes and only tickets they
// raised; one school never finds another's. This file decides only which
// KINDS are searched, from the role and the school's modules (rule 7).

// Which module a kind belongs to, and who may search it. Students follow
// Student 360 search (teachers may search their own classes). Staff
// accounts are listed by the office only (C89).
const SCHOOL_KINDS: readonly { kind: GlobalSearchKind; moduleId: ModuleId; roles: readonly SchoolRole[] }[] = [
  { kind: 'student', moduleId: 'students', roles: STUDENT_SEARCH_ROLES },
  { kind: 'staff', moduleId: 'staff', roles: ['principal', 'school_admin'] },
  { kind: 'ticket', moduleId: 'raise-ticket', roles: moduleById('raise-ticket').roles },
];

export function searchableKinds(role: StaffRole, entitlements: SchoolEntitlements): GlobalSearchKind[] {
  return SCHOOL_KINDS.filter((k) => (k.roles as readonly string[]).includes(role) && isModuleEnabled(entitlements, k.moduleId)).map((k) => k.kind);
}

export function parseGlobalSearch(q: unknown): string | null {
  if (typeof q !== 'string') return null;
  const term = q.trim().replace(/\s+/g, ' ').slice(0, 100);
  return term.length >= GLOBAL_SEARCH_MIN_CHARS ? term : null;
}

// "T-1A2B3C4D", "#T-1A2B", "t1a2b": the start of a ticket's reference, as
// the hex it is made from; null when the text is not one. Written with its
// hyphen or a #, two characters are enough; without, four, so that "tea" or
// "Ted" is read as a word and not as a reference.
export function ticketRefPrefix(term: string): string | null {
  const s = term.trim();
  const m = /^(?:#t?-?|t-)([0-9a-f]{2,8})$/i.exec(s) ?? /^t([0-9a-f]{4,8})$/i.exec(s);
  return m ? m[1].toLowerCase() : null;
}

const iso = (v: unknown) => (isTicketStatus(v) ? v : 'open');

// Two fixed statements (a school's own tickets; every school's, for the
// founder). Parameters in order: the words, the start of a reference or
// null, the limit, and for a school its id.
const TICKETS_OF_SCHOOL_SQL = `
     select t.ticket_id, t.subject, t.status::text as status
     from support_tickets t
     where t.school_id = $4 and (
         ($2::text is not null and replace(t.ticket_id::text, '-', '') like $2::text || '%')
         or lower(t.subject) like '%' || lower($1) || '%' escape '\\'
       )
     order by case when $2::text is not null and replace(t.ticket_id::text, '-', '') like $2::text || '%' then 0 else 1 end, t.last_activity_at desc
     limit $3`;
const TICKETS_OF_ALL_SQL = `
     select t.ticket_id, t.subject, t.status::text as status, s.name as school_name
     from support_tickets t
     join schools s on s.school_id = t.school_id
     where (
         ($2::text is not null and replace(t.ticket_id::text, '-', '') like $2::text || '%')
         or lower(t.subject) like '%' || lower($1) || '%' escape '\\'
       )
     order by case when $2::text is not null and replace(t.ticket_id::text, '-', '') like $2::text || '%' then 0 else 1 end, t.last_activity_at desc
     limit $3`;

async function searchTickets(db: Sql, term: string, scope: { schoolId: string } | { allSchools: true }): Promise<GlobalSearchResult[]> {
  const all = 'allSchools' in scope;
  const params: unknown[] = [likeEscape(term), ticketRefPrefix(term), GLOBAL_SEARCH_PER_KIND];
  const { rows } = all ? await db.query(TICKETS_OF_ALL_SQL, params) : await db.query(TICKETS_OF_SCHOOL_SQL, [...params, scope.schoolId]);
  return rows.map((r) => ({
    kind: 'ticket' as const,
    id: r.ticket_id,
    title: r.subject,
    href: all ? `/control/tickets/${r.ticket_id}` : `/app/help/ticket/${r.ticket_id}`,
    detail: { kind: 'ticket' as const, ref: ticketRef(r.ticket_id), status: iso(r.status), ...(all ? { schoolName: r.school_name as string } : {}) },
  }));
}

async function searchStaff(db: Sql, schoolId: string, term: string): Promise<GlobalSearchResult[]> {
  const { rows } = await db.query(
    `select u.user_id, u.display_name, m.role::text as role, (m.is_active and u.is_active) as active
     from memberships m
     join users u on u.user_id = m.user_id
     where m.school_id = $1
       and u.role <> 'super_admin' -- platform accounts are never listed from a school (as the staff list, C89)
       and (lower(u.display_name) like '%' || lower($2) || '%' escape '\\' or lower(u.email) like lower($2) || '%' escape '\\')
     order by (lower(u.display_name) like lower($2) || '%' escape '\\') desc, lower(u.display_name), u.user_id
     limit $3`,
    [schoolId, likeEscape(term), GLOBAL_SEARCH_PER_KIND]
  );
  return rows.map((r) => ({
    kind: 'staff' as const,
    id: r.user_id,
    title: r.display_name,
    href: '/app/staff',
    detail: { kind: 'staff' as const, role: r.role, active: r.active === true },
  }));
}

// "5" + "A" is "5-A"; a class already named "5-A" stays "5-A".
export function classLabel(name: string | null, section: string | null): string | null {
  if (!name) return null;
  return section && !name.toUpperCase().endsWith(section.toUpperCase()) ? `${name}-${section}` : name;
}

// The school app's search. `kinds` comes from searchableKinds: a kind that
// is not in it is not queried at all.
export async function searchSchool(db: Sql, schoolId: string, term: string, kinds: readonly GlobalSearchKind[]): Promise<GlobalSearchResult[]> {
  const out: GlobalSearchResult[] = [];
  if (kinds.includes('student')) {
    const parsed = parseStudentSearch(term, GLOBAL_SEARCH_PER_KIND);
    const students = parsed ? await searchStudents(db, schoolId, parsed) : [];
    out.push(
      ...students.map((s) => ({
        kind: 'student' as const,
        id: s.studentId,
        title: s.displayName,
        href: s.href,
        detail: {
          kind: 'student' as const,
          className: classLabel(s.className, s.section),
          admissionNo: s.admissionNo,
          rollNo: s.rollNo,
          ...(s.guardianPhoneLast4 ? { guardianPhoneLast4: s.guardianPhoneLast4 } : {}),
        },
      }))
    );
  }
  if (kinds.includes('staff')) out.push(...(await searchStaff(db, schoolId, term)));
  if (kinds.includes('ticket')) out.push(...(await searchTickets(db, term, { schoolId })));
  return out;
}

// Control's search (the founder, as nca_super): schools, people, tickets.
export async function searchControl(db: Sql, term: string): Promise<GlobalSearchResult[]> {
  const like = likeEscape(term);
  const schools = await db.query(
    `select school_id, name, is_test_fixture from schools
     where lower(name) like '%' || lower($1) || '%' escape '\\'
     order by (lower(name) like lower($1) || '%' escape '\\') desc, lower(name), school_id limit $2`,
    [like, GLOBAL_SEARCH_PER_KIND]
  );
  const users = await db.query(
    `select u.user_id, u.display_name, u.email, u.role::text as role, s.name as school_name
     from users u left join schools s on s.school_id = u.school_id
     where lower(u.display_name) like '%' || lower($1) || '%' escape '\\' or lower(u.email) like lower($1) || '%' escape '\\'
     order by (lower(u.display_name) like lower($1) || '%' escape '\\') desc, lower(u.display_name), u.user_id limit $2`,
    [like, GLOBAL_SEARCH_PER_KIND]
  );
  return [
    ...schools.rows.map((r) => ({ kind: 'school' as const, id: r.school_id, title: r.name, href: `/control/schools/${r.school_id}`, detail: { kind: 'school' as const, testFixture: r.is_test_fixture === true } })),
    ...users.rows.map((r) => ({ kind: 'user' as const, id: r.user_id, title: r.display_name, href: '/control/users', detail: { kind: 'user' as const, role: r.role, email: r.email ?? null, schoolName: r.school_name ?? null } })),
    ...(await searchTickets(db, term, { allSchools: true })),
  ];
}
