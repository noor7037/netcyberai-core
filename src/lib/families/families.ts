import { writeAuditLog } from '@/lib/audit/log';
import { MAX_FAMILY_LINK, type FamilyMember, type FamilyView, type GuardianMergeRecord, type SiblingSuggestion } from '@/lib/contracts/families';
import type { SchoolRole } from '@/lib/contracts/modules';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { nextNumber } from '@/lib/frameworks/numbering';
import { settingsSchemaFor } from '@/lib/frameworks/settings-schemas';
import { readSettings } from '@/lib/frameworks/settings-store';
import type { Sql } from '@/lib/jobs/types';

// Sibling mapping (C116). Every function runs inside the caller's tenant
// context, so RLS decides what a teacher sees; every write is for the
// office (the API checks the role, RLS refuses the rest). Explicit links
// only: suggestions read, they never write (05_BUSINESS_LOGIC §2).

export type Actor = { schoolId: string; userId: string | null; role: SchoolRole | null };
export type FamilyError = { ok: false; status: 400 | 404 | 409; error: string };

export const OFFICE: readonly SchoolRole[] = ['principal', 'school_admin'];

// The last ten digits of a phone number: +91 98765 43210 and 098765-43210
// are the same number.
export function phoneKey(phone: unknown): string | null {
  if (typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

export function emailKey(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 254 ? e : null;
}

// ---- Suggestions (read only) ----------------------------------------------------------

type SuggestInput = { key: string; phone: string | null; email: string | null };

// Guardians matching each input by phone (last ten digits) or email, with
// the students they are linked to and their family. Never writes.
export async function suggestSiblingsFor(
  db: Sql,
  schoolId: string,
  inputs: readonly SuggestInput[],
  excludeStudentIds: readonly string[] = []
): Promise<Map<string, SiblingSuggestion[]>> {
  const out = new Map<string, SiblingSuggestion[]>();
  const phones = [...new Set(inputs.map((i) => i.phone).filter((p): p is string => !!p))];
  const emails = [...new Set(inputs.map((i) => i.email).filter((e): e is string => !!e))];
  if (!phones.length && !emails.length) return out;

  // The matching guardians first, then their children (C235-A). With thousands of phones from one CSV file and no
  // guardian matching, the second query is never planned: right after a big import, planning a join over thousands of
  // freshly written students costs seconds until the database has caught up with them.
  const matched = (
    await db.query(
      `select p.parent_id from parents p
        where p.school_id = $1 and p.merged_into is null
          and (right(regexp_replace(p.phone, '[^0-9]', '', 'g'), 10) = any($2::text[]) or lower(p.email) = any($3::text[]))`,
      [schoolId, phones, emails]
    )
  ).rows.map((r: { parent_id: string }) => r.parent_id);
  if (!matched.length) return out;
  const { rows } = await db.query(
    `select p.parent_id, p.name, p.relation, p.phone, lower(p.email) as email,
            right(regexp_replace(p.phone, '[^0-9]', '', 'g'), 10) as phone_key,
            s.student_id, s.name as student_name, s.status::text as status, c.name as class_name,
            f.family_id, f.family_code
     from parents p
     join parent_student_map m on m.school_id = p.school_id and m.parent_id = p.parent_id
     join students s on s.school_id = m.school_id and s.student_id = m.student_id
     left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
     left join families f on f.school_id = s.school_id and f.family_id = s.family_id
     where p.school_id = $1 and p.parent_id = any($2::uuid[])
       and not (s.student_id = any($3::uuid[]))
     order by p.name, s.name`,
    [schoolId, matched, excludeStudentIds]
  );

  type Entry = { row: Record<string, any>; students: SiblingSuggestion['students'][number][]; families: Map<string, string> };
  const byParent = new Map<string, Entry>();
  for (const r of rows) {
    const entry: Entry = byParent.get(r.parent_id) ?? { row: r, students: [], families: new Map() };
    entry.students.push({ studentId: r.student_id, displayName: r.student_name, className: r.class_name, status: r.status });
    if (r.family_id) entry.families.set(r.family_id, r.family_code);
    byParent.set(r.parent_id, entry);
  }
  // Each input looks up only the guardians with its phone or email, in the order above: a file of 10,000 students
  // against a school of thousands of guardians stays one pass (C235-A), not every input against every guardian.
  const entries = [...byParent.values()];
  const byPhone = new Map<string, number[]>();
  const byEmail = new Map<string, number[]>();
  entries.forEach((e, i) => {
    if (e.row.phone_key) byPhone.set(e.row.phone_key, [...(byPhone.get(e.row.phone_key) ?? []), i]);
    if (e.row.email) byEmail.set(e.row.email, [...(byEmail.get(e.row.email) ?? []), i]);
  });
  for (const input of inputs) {
    const list: SiblingSuggestion[] = [];
    const at = [...new Set([...((input.phone && byPhone.get(input.phone)) || []), ...((input.email && byEmail.get(input.email)) || [])])].sort((a, b) => a - b);
    for (const { row, students, families } of at.map((i) => entries[i])) {
      const matchedOn = input.phone && row.phone_key === input.phone ? 'phone' : input.email && row.email === input.email ? 'email' : null;
      if (!matchedOn) continue;
      const [fam] = [...families.entries()];
      list.push({
        parentId: row.parent_id,
        guardianName: row.name,
        relation: row.relation,
        matchedOn,
        phoneLast4: matchedOn === 'phone' ? row.phone_key.slice(-4) : null,
        // A guardian whose children are split across families shows none:
        // the office decides with the family view, not a guess.
        family: families.size === 1 && fam ? { familyId: fam[0], familyCode: fam[1] } : null,
        students,
      });
    }
    if (list.length) out.set(input.key, list);
  }
  return out;
}

// ---- Linking --------------------------------------------------------------------------

async function familyCodePattern(db: Sql, schoolId: string): Promise<string> {
  const schema = settingsSchemaFor('students')!;
  const view = await readSettings(db, schoolId, schema);
  return String(view.effective.family_code_format);
}

async function createFamily(db: Sql, actor: Actor & { userId: string }): Promise<{ familyId: string; familyCode: string }> {
  const code = await nextNumber(db, actor.schoolId, 'family_code', await familyCodePattern(db, actor.schoolId));
  const { rows } = await db.query(
    `insert into families (school_id, family_code, created_by) values ($1, $2, $3) returning family_id, family_code`,
    [actor.schoolId, code, actor.userId]
  );
  return { familyId: rows[0].family_id, familyCode: rows[0].family_code };
}

export type LinkResult = { ok: true; familyId: string; familyCode: string; changed: { studentId: string; from: string | null }[] };

// Puts the students into one family: the one some of them are already in,
// or a new one. Refused when they are already in different families (the
// office moves them one at a time, deliberately).
export async function linkSiblings(db: Sql, actor: Actor & { userId: string }, studentIds: unknown): Promise<LinkResult | FamilyError> {
  if (!Array.isArray(studentIds) || !studentIds.every(isUuid) || new Set(studentIds).size !== studentIds.length) {
    return { ok: false, status: 400, error: 'studentIds must be distinct student ids' };
  }
  if (studentIds.length < 2 || studentIds.length > MAX_FAMILY_LINK) return { ok: false, status: 400, error: `link 2 to ${MAX_FAMILY_LINK} students at a time` };
  const { rows } = await db.query(
    `select s.student_id, s.family_id, f.family_code from students s
     left join families f on f.school_id = s.school_id and f.family_id = s.family_id
     where s.school_id = $1 and s.student_id = any($2::uuid[]) for update of s`,
    [actor.schoolId, studentIds]
  );
  if (rows.length !== studentIds.length) return { ok: false, status: 404, error: 'student not found' };
  const families = new Map(rows.filter((r) => r.family_id).map((r) => [r.family_id as string, r.family_code as string]));
  if (families.size > 1) return { ok: false, status: 409, error: 'these students are in different families; move them one at a time' };
  const target = families.size === 1 ? { familyId: [...families.keys()][0], familyCode: [...families.values()][0] } : await createFamily(db, actor);
  const changed = rows.filter((r) => r.family_id !== target.familyId).map((r) => ({ studentId: r.student_id as string, from: (r.family_id as string | null) ?? null }));
  if (changed.length) {
    await db.query(`update students set family_id = $3, updated_at = now() where school_id = $1 and student_id = any($2::uuid[])`, [
      actor.schoolId,
      changed.map((c) => c.studentId),
      target.familyId,
    ]);
    await db.query(`update families set updated_at = now() where school_id = $1 and family_id = $2`, [actor.schoolId, target.familyId]);
  }
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'family.linked',
    targetType: 'families',
    targetId: target.familyId,
    afterState: { studentIds: changed.map((c) => c.studentId), created: families.size === 0 },
  });
  return { ok: true, ...target, changed };
}

// The office confirms a suggestion: the student is linked to that guardian
// and joins the family of the guardian's other children.
export async function confirmSuggestion(
  db: Sql,
  actor: Actor & { userId: string },
  studentId: unknown,
  parentId: unknown
): Promise<{ ok: true; family: { familyId: string; familyCode: string } | null } | FamilyError> {
  if (!isUuid(studentId) || !isUuid(parentId)) return { ok: false, status: 400, error: 'studentId and parentId are required' };
  const { rows: st } = await db.query(`select 1 from students where school_id = $1 and student_id = $2`, [actor.schoolId, studentId]);
  if (!st[0]) return { ok: false, status: 404, error: 'student not found' };
  const { rows: par } = await db.query(`select merged_into from parents where school_id = $1 and parent_id = $2`, [actor.schoolId, parentId]);
  if (!par[0]) return { ok: false, status: 404, error: 'guardian not found' };
  if (par[0].merged_into) return { ok: false, status: 409, error: 'this guardian was merged into another record' };

  // Every check runs before anything is written: a refused confirm leaves
  // no guardian link behind (a /code-review finding).
  const { rows: kids } = await db.query(`select student_id from parent_student_map where school_id = $1 and parent_id = $2`, [actor.schoolId, parentId]);
  const ids = [...new Set([studentId, ...kids.map((k) => k.student_id as string)])];
  if (ids.length > MAX_FAMILY_LINK) return { ok: false, status: 400, error: `a guardian with more than ${MAX_FAMILY_LINK} children is linked one at a time` };
  if (ids.length >= 2) {
    const { rows: fams } = await db.query(
      `select count(distinct family_id)::int as n from students where school_id = $1 and student_id = any($2::uuid[]) and family_id is not null`,
      [actor.schoolId, ids]
    );
    if (fams[0].n > 1) return { ok: false, status: 409, error: 'this student and the guardian’s children are in different families; move them first' };
  }

  await db.query(`insert into parent_student_map (school_id, parent_id, student_id) values ($1, $2, $3) on conflict do nothing`, [actor.schoolId, parentId, studentId]);
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'family.suggestion_confirmed',
    targetType: 'parent_student_map',
    targetId: `${parentId}:${studentId}`,
    afterState: { parentId, studentId },
  });
  if (ids.length < 2) return { ok: true, family: null };
  const linked = await linkSiblings(db, actor, ids);
  if (!linked.ok) return linked;
  return { ok: true, family: { familyId: linked.familyId, familyCode: linked.familyCode } };
}

// Moves one student to another family, or out of any family (familyId null).
export async function setStudentFamily(
  db: Sql,
  actor: Actor & { userId: string },
  studentId: unknown,
  familyId: unknown
): Promise<{ ok: true; from: string | null; to: string | null } | FamilyError> {
  if (!isUuid(studentId)) return { ok: false, status: 404, error: 'student not found' };
  if (familyId !== null && !isUuid(familyId)) return { ok: false, status: 400, error: 'familyId must be a family id or null' };
  const { rows } = await db.query(`select family_id from students where school_id = $1 and student_id = $2 for update`, [actor.schoolId, studentId]);
  if (!rows[0]) return { ok: false, status: 404, error: 'student not found' };
  if (familyId) {
    const { rows: fam } = await db.query(`select 1 from families where school_id = $1 and family_id = $2`, [actor.schoolId, familyId]);
    if (!fam[0]) return { ok: false, status: 404, error: 'family not found' };
  }
  const from = (rows[0].family_id as string | null) ?? null;
  if (from === familyId) return { ok: true, from, to: from };
  await db.query(`update students set family_id = $3, updated_at = now() where school_id = $1 and student_id = $2`, [actor.schoolId, studentId, familyId]);
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: familyId ? 'family.moved' : 'family.removed',
    targetType: 'students',
    targetId: studentId,
    beforeState: { familyId: from },
    afterState: { familyId },
  });
  return { ok: true, from, to: familyId as string | null };
}

// ---- Guardian merge -------------------------------------------------------------------

// Merges `mergeId` into `keepId`: the merged guardian's links move to the
// kept one (a link the kept guardian already has is dropped and recorded),
// and the merged record is marked, never deleted.
export async function mergeGuardians(
  db: Sql,
  actor: Actor & { userId: string },
  keepId: unknown,
  mergeId: unknown
): Promise<{ ok: true; mergeId: string; linksMoved: number; linksDropped: number } | FamilyError> {
  if (!isUuid(keepId) || !isUuid(mergeId)) return { ok: false, status: 400, error: 'keepParentId and mergeParentId are required' };
  if (keepId === mergeId) return { ok: false, status: 400, error: 'choose two different guardians' };
  const { rows } = await db.query(
    `select parent_id, merged_into from parents where school_id = $1 and parent_id = any($2::uuid[]) order by parent_id for update`,
    [actor.schoolId, [keepId, mergeId]]
  );
  if (rows.length !== 2) return { ok: false, status: 404, error: 'guardian not found' };
  if (rows.some((r) => r.merged_into)) return { ok: false, status: 409, error: 'one of these guardians was already merged' };

  const { rows: links } = await db.query(
    `select m.student_id, m.verification_status::text as verification_status, m.verification_method::text as verification_method,
            exists (select 1 from parent_student_map k where k.school_id = m.school_id and k.parent_id = $2 and k.student_id = m.student_id) as kept_has
     from parent_student_map m where m.school_id = $1 and m.parent_id = $3 for update`,
    [actor.schoolId, keepId, mergeId]
  );
  const moved = links.filter((l) => !l.kept_has).map((l) => l.student_id as string);
  const dropped = links.filter((l) => l.kept_has).map((l) => ({ studentId: l.student_id, verificationStatus: l.verification_status, verificationMethod: l.verification_method }));
  if (dropped.length) {
    await db.query(`delete from parent_student_map where school_id = $1 and parent_id = $2 and student_id = any($3::uuid[])`, [
      actor.schoolId,
      mergeId,
      dropped.map((d) => d.studentId),
    ]);
  }
  if (moved.length) {
    await db.query(`update parent_student_map set parent_id = $2, updated_at = now() where school_id = $1 and parent_id = $3 and student_id = any($4::uuid[])`, [
      actor.schoolId,
      keepId,
      mergeId,
      moved,
    ]);
  }
  await db.query(`update parents set merged_into = $3, merged_at = now() where school_id = $1 and parent_id = $2`, [actor.schoolId, mergeId, keepId]);
  const { rows: rec } = await db.query(
    `insert into guardian_merges (school_id, kept_parent_id, merged_parent_id, links_moved, links_dropped, merged_by)
     values ($1, $2, $3, $4, $5, $6) returning merge_id`,
    [actor.schoolId, keepId, mergeId, moved, JSON.stringify(dropped), actor.userId]
  );
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'guardian.merged',
    targetType: 'guardian_merges',
    targetId: rec[0].merge_id,
    afterState: { keptParentId: keepId, mergedParentId: mergeId, linksMoved: moved.length, linksDropped: dropped.length },
  });
  return { ok: true, mergeId: rec[0].merge_id, linksMoved: moved.length, linksDropped: dropped.length };
}

// What was merged into (or out of) a guardian, with the merged record's
// details as they still stand.
export async function guardianMerges(db: Sql, schoolId: string, parentId: string): Promise<GuardianMergeRecord[]> {
  const { rows } = await db.query(
    `select g.merge_id, g.kept_parent_id, g.merged_parent_id, cardinality(g.links_moved) as moved, jsonb_array_length(g.links_dropped) as dropped,
            g.merged_by, g.merged_at, p.name, p.relation, p.phone, p.email
     from guardian_merges g
     join parents p on p.school_id = g.school_id and p.parent_id = g.merged_parent_id
     where g.school_id = $1 and (g.kept_parent_id = $2 or g.merged_parent_id = $2)
     order by g.merged_at desc`,
    [schoolId, parentId]
  );
  return rows.map((r) => ({
    mergeId: r.merge_id,
    keptParentId: r.kept_parent_id,
    mergedParentId: r.merged_parent_id,
    merged: { name: r.name, relation: r.relation, phoneLast4: phoneKey(r.phone)?.slice(-4) ?? null, hasEmail: !!r.email },
    linksMoved: r.moved,
    linksDropped: r.dropped,
    mergedBy: r.merged_by,
    mergedAt: new Date(r.merged_at).toISOString(),
  }));
}

// ---- Family view ----------------------------------------------------------------------

// The order key for sibling order: date of birth (unknown last), then name.
// The same rule as the students list's sibling_order field (lists.ts).
export const SIBLING_ORDER_SQL = `row_number() over (order by coalesce(s.dob, 'infinity'::date), lower(s.name), s.student_id)`;

export async function getFamilyView(db: Sql, schoolId: string, studentId: string, role: SchoolRole): Promise<FamilyView | null> {
  const { rows: self } = await db.query(
    `select s.family_id, f.family_code from students s
     left join families f on f.school_id = s.school_id and f.family_id = s.family_id
     where s.school_id = $1 and s.student_id = $2`,
    [schoolId, studentId]
  );
  if (!self[0]) return null;
  const familyId: string | null = self[0].family_id;
  const wholeFamily = role !== 'teacher'; // a teacher sees only siblings in their own classes (RLS)

  const { rows: members } = await db.query(
    `with fam as (
       select s.student_id, s.name, s.status::text as status, s.dob, c.name as class_name, c.section
       from students s left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
       where s.school_id = $1 and (s.student_id = $2 or ($3::uuid is not null and s.family_id = $3))
     ),
     ordered as (
       select s.student_id, ${SIBLING_ORDER_SQL} as sibling_order from fam s where s.status = 'active'
     )
     select fam.*, ordered.sibling_order from fam left join ordered using (student_id)
     order by (fam.student_id <> $2), ordered.sibling_order nulls last, lower(fam.name)`,
    [schoolId, studentId, familyId]
  );
  const memberIds = members.map((m) => m.student_id as string);
  const { rows: guardians } = await db.query(
    `select p.parent_id, p.name, p.relation, p.phone, array_agg(m.student_id order by m.student_id) as child_ids
     from parent_student_map m join parents p on p.school_id = m.school_id and p.parent_id = m.parent_id
     where m.school_id = $1 and m.student_id = any($2::uuid[]) and p.merged_into is null
     group by p.parent_id, p.name, p.relation, p.phone
     order by p.name`,
    [schoolId, memberIds]
  );
  return {
    family: familyId ? { familyId, familyCode: self[0].family_code } : null,
    members: members.map(
      (m): FamilyMember => ({
        studentId: m.student_id,
        displayName: m.name,
        className: m.class_name,
        section: m.section,
        status: m.status,
        siblingOrder: wholeFamily && m.sibling_order != null ? Number(m.sibling_order) : null,
        isSelf: m.student_id === studentId,
      })
    ),
    guardians: guardians.map((g) => ({
      parentId: g.parent_id,
      name: g.name,
      relation: g.relation,
      phoneLast4: phoneKey(g.phone)?.slice(-4) ?? null,
      childIds: g.child_ids,
    })),
    canManage: OFFICE.includes(role),
  };
}
