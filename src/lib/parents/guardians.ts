import type { PoolClient } from 'pg';
import { ALL_CONSENT_PURPOSES, getConsentEligibility, type ConsentPurpose } from '@/lib/consent/gate';
import { languageFor } from '@/lib/whatsapp/gate';
import { normalizePhone } from '@/lib/whatsapp/phone';

// Parents (docs/25 slice 7j, C192): one screen a guardian. Their children, consent by purpose, the phone and its
// state, whether they have written to the school, and data requests.
//
//   - WHO SEES WHOM is the database's rule, not this file's: a teacher's session reads only the guardians of children
//     in their own classes, and of those guardians only the children in their own classes (teacher_scope_parents,
//     teacher_scope_parent_student_map). The office reads every guardian. Nobody else is let in.
//   - A teacher sees the last four digits of a number, never the whole number or the email, and no data requests.
//   - Nothing here is a second copy: consent is read from the ledger the send-gate reads, so what this screen shows
//     is what the next message will meet.

export const PARENT_SCREEN_ROLES: readonly string[] = ['principal', 'school_admin', 'teacher'];
const OFFICE: readonly string[] = ['principal', 'school_admin'];
type Viewer = { schoolId: string; role: string };
const digits = (text: string) => text.replace(/[^0-9]/g, '');

export type GuardianRow = { parent_id: string; name: string; relation: string | null; phone_last4: string; children: { student_id: string; name: string; class_name: string | null }[] };

export async function listGuardians(db: PoolClient, viewer: Viewer, search: string): Promise<GuardianRow[]> {
  if (!PARENT_SCREEN_ROLES.includes(viewer.role)) return [];
  const q = search.trim().slice(0, 80);
  const number = digits(q);
  // A number is searched by the office only, and by at least four digits; a teacher searches by name.
  const byNumber = OFFICE.includes(viewer.role) && number.length >= 4 && number.length === q.replace(/[\s+()-]/g, '').length ? number : null;
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { rows } = await db.query(
    `select p.parent_id, p.name, p.relation, right(regexp_replace(p.phone, '[^0-9]', '', 'g'), 4) as phone_last4,
            coalesce((select json_agg(json_build_object('student_id', s.student_id, 'name', s.name, 'class_name', c.name) order by s.name, s.student_id)
                        from parent_student_map m join students s on s.school_id = m.school_id and s.student_id = m.student_id
                        left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
                       where m.school_id = p.school_id and m.parent_id = p.parent_id), '[]'::json) as children
       from parents p
      where p.school_id = $1 and p.merged_into is null
        and ($2 = '' or ($3::text is not null and regexp_replace(p.phone, '[^0-9]', '', 'g') like '%' || $3 || '%')
             or ($3::text is null and (p.name ilike $4 or exists (select 1 from parent_student_map m join students s on s.school_id = m.school_id and s.student_id = m.student_id
                                                              where m.school_id = p.school_id and m.parent_id = p.parent_id and s.name ilike $4))))
      order by p.name, p.parent_id limit 50`,
    [viewer.schoolId, q, byNumber, like]
  );
  return rows;
}

export type GuardianDetail = {
  guardian: { parent_id: string; name: string; relation: string | null; phone: string | null; phone_last4: string; email: string | null; preferred_language: 'en' | 'hi' | null; message_language: 'en' | 'hi' };
  phone: { usable: boolean; stopped: boolean; stopped_at: string | null; last_message: { status: string; at: string } | null; wrote_at: string | null; unread: number };
  children: { student_id: string; name: string; class_name: string | null; verification: string; consent: Record<ConsentPurpose, boolean> }[];
  requests: { request_id: string; child: string; type: string; status: string; created_at: string }[] | null;
  mayEdit: boolean;
};

export async function guardianDetail(db: PoolClient, viewer: Viewer, parentId: string): Promise<GuardianDetail | null> {
  if (!PARENT_SCREEN_ROLES.includes(viewer.role)) return null;
  const office = OFFICE.includes(viewer.role);
  const g = (await db.query(`select parent_id, name, relation, phone, email, preferred_language from parents where school_id = $1 and parent_id = $2 and merged_into is null`, [viewer.schoolId, parentId])).rows[0];
  if (!g) return null;
  const kids = (await db.query(
    `select s.student_id, s.name, c.name as class_name, m.verification_status::text as verification
       from parent_student_map m join students s on s.school_id = m.school_id and s.student_id = m.student_id
       left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
      where m.school_id = $1 and m.parent_id = $2 order by s.name, s.student_id`,
    [viewer.schoolId, parentId]
  )).rows as { student_id: string; name: string; class_name: string | null; verification: string }[];
  const children = [];
  for (const k of kids) children.push({ ...k, consent: await getConsentEligibility(db, viewer.schoolId, k.student_id) });
  const number = normalizePhone(String(g.phone ?? ''));
  const stop = number ? (await db.query(`select stopped_at from whatsapp_opt_outs where school_id = $1 and phone = $2 and lifted_at is null`, [viewer.schoolId, number])).rows[0] : null;
  const last = (await db.query(`select status::text as status, created_at from communication_log where school_id = $1 and parent_id = $2 order by created_at desc limit 1`, [viewer.schoolId, parentId])).rows[0];
  const thread = (await db.query(`select last_inbound_at, unread from message_threads where school_id = $1 and parent_id = $2 order by last_inbound_at desc limit 1`, [viewer.schoolId, parentId])).rows[0];
  const requests = office && kids.length
    ? (await db.query(
        `select r.request_id, s.name as child, r.request_type::text as type, r.status::text as status, r.created_at from data_subject_requests r join students s on s.school_id = r.school_id and s.student_id = r.student_id
          where r.school_id = $1 and r.student_id = any($2::uuid[]) order by r.created_at desc limit 20`,
        [viewer.schoolId, kids.map((k) => k.student_id)]
      )).rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() }))
    : office ? [] : null;
  return {
    guardian: { parent_id: g.parent_id, name: g.name, relation: g.relation, phone: office ? g.phone : null, phone_last4: digits(String(g.phone ?? '')).slice(-4), email: office ? g.email : null, preferred_language: g.preferred_language ?? null, message_language: await languageFor(db, viewer.schoolId, parentId) },
    phone: { usable: Boolean(number), stopped: Boolean(stop), stopped_at: stop ? new Date(stop.stopped_at).toISOString() : null, last_message: last ? { status: last.status, at: new Date(last.created_at).toISOString() } : null, wrote_at: thread ? new Date(thread.last_inbound_at).toISOString() : null, unread: thread?.unread ?? 0 },
    children,
    requests,
    mayEdit: office,
  };
}
export { ALL_CONSENT_PURPOSES };
