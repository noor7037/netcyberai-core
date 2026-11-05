import { writeAuditLog } from '@/lib/audit/log';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { PICTURES_SWEEP_JOB } from '@/lib/marking/retention';
import { RESULT_PDFS_SWEEP_JOB } from '@/lib/marking/checked-pdf-store';
import { AI_UPKEEP_JOB } from '@/lib/ai/gateway/upkeep';
import type { Sql } from '@/lib/jobs/types';

// Control → Compliance (W21-M6): the data-request desk across schools. Every open data request (and the last 50
// closed), with how many days it has been open; the consent ledger's counts as they stand (each child's latest
// answer per purpose); and the retention jobs' last runs. No child's name, no requester's description and no note:
// ids, types, states, counts and times only. "Mark done" closes an access or correction request with the founder's
// note on the request row (where a data request's own erasure reaches it), and writes one audit row in that school.
// A deletion request is never closed here: it closes only through its authorised erasure, as in the school app.

export const RETENTION_JOBS = [PICTURES_SWEEP_JOB, RESULT_PDFS_SWEEP_JOB, AI_UPKEEP_JOB] as const;
export const DSR_NOTE_MIN = 3;
export const DSR_NOTE_MAX = 500;

export type DeskRequest = { requestId: string; schoolId: string; schoolName: string; type: string; status: string; createdAt: string; daysOpen: number; authorized: boolean; closable: boolean };
export type ConsentCount = { purpose: string; granted: number; withdrawn: number };
export type RetentionRun = { type: string; lastSucceededAt: string | null; lastStatus: string | null; lastRunAt: string | null; dead: number };
export type ComplianceDesk = { requests: DeskRequest[]; consent: ConsentCount[]; retention: RetentionRun[] };

const OPEN = `('logged', 'in_progress')`;

export async function loadComplianceDesk(db: Sql): Promise<ComplianceDesk> {
  const requests = (
    await db.query(
      `(select d.request_id, d.school_id, s.name as school_name, d.request_type::text as type, d.status::text as status, d.created_at, d.authorized_at,
               floor(extract(epoch from (coalesce(case when d.status::text in ${OPEN} then null else d.updated_at end, now()) - d.created_at)) / 86400)::int as days_open
          from data_subject_requests d join schools s on s.school_id = d.school_id
         where d.status::text in ${OPEN}
         order by d.created_at)
       union all
       (select d.request_id, d.school_id, s.name, d.request_type::text, d.status::text, d.created_at, d.authorized_at,
               floor(extract(epoch from (d.updated_at - d.created_at)) / 86400)::int
          from data_subject_requests d join schools s on s.school_id = d.school_id
         where d.status::text not in ${OPEN}
         order by d.updated_at desc limit 50)`
    )
  ).rows.map((r: Record<string, unknown>): DeskRequest => {
    const open = r.status === 'logged' || r.status === 'in_progress';
    return {
      requestId: String(r.request_id),
      schoolId: String(r.school_id),
      schoolName: String(r.school_name),
      type: String(r.type),
      status: String(r.status),
      createdAt: new Date(r.created_at as string).toISOString(),
      daysOpen: Number(r.days_open),
      authorized: r.authorized_at !== null,
      closable: open && r.type !== 'deletion',
    };
  });
  const consent = (
    await db.query(
      `select purpose, count(*) filter (where granted)::int as granted, count(*) filter (where not granted)::int as withdrawn
         from (select distinct on (school_id, student_id, purpose) purpose::text as purpose, granted
                 from consent_ledger order by school_id, student_id, purpose, created_at desc) latest
        group by purpose order by purpose`
    )
  ).rows.map((r: Record<string, unknown>) => ({ purpose: String(r.purpose), granted: Number(r.granted), withdrawn: Number(r.withdrawn) }));
  const runs = (
    await db.query(
      `select type, max(completed_at) filter (where status = 'succeeded') as last_ok, count(*) filter (where status = 'dead')::int as dead,
              (array_agg(status order by updated_at desc))[1] as last_status, max(updated_at) as last_run
         from jobs where type = any($1::text[]) group by type`,
      [RETENTION_JOBS as unknown as string[]]
    )
  ).rows as Record<string, unknown>[];
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  const retention = RETENTION_JOBS.map((type) => {
    const r = runs.find((x) => x.type === type);
    return { type, lastSucceededAt: iso(r?.last_ok), lastStatus: (r?.last_status as string | undefined) ?? null, lastRunAt: iso(r?.last_run), dead: Number(r?.dead ?? 0) };
  });
  return { requests, consent, retention };
}

export type MarkDoneResult = { ok: true } | { ok: false; code: 'not_found' | 'note_required' | 'deletion_requires_execute' | 'closed' };

export async function markDsrDone(db: Sql, by: { userId: string }, raw: { requestId?: unknown; note?: unknown }): Promise<MarkDoneResult> {
  const note = typeof raw.note === 'string' ? raw.note.trim() : '';
  if (note.length < DSR_NOTE_MIN || note.length > DSR_NOTE_MAX) return { ok: false, code: 'note_required' };
  if (!isUuid(raw.requestId)) return { ok: false, code: 'not_found' };
  const r = (await db.query(`select school_id, request_type::text as type, status::text as status from data_subject_requests where request_id = $1::uuid for update`, [raw.requestId])).rows[0];
  if (!r) return { ok: false, code: 'not_found' };
  if (r.type === 'deletion') return { ok: false, code: 'deletion_requires_execute' };
  if (r.status !== 'logged' && r.status !== 'in_progress') return { ok: false, code: 'closed' };
  await db.query(
    `update data_subject_requests set status = 'completed', notes = concat_ws(E'\\n', notes, $2::text), updated_at = now() where request_id = $1::uuid`,
    [raw.requestId, `NetCyberAI: ${note}`]
  );
  await writeAuditLog(db, {
    schoolId: r.school_id,
    actorUserId: by.userId,
    actorRole: 'super_admin',
    eventAction: 'dsr.status_updated',
    targetType: 'data_subject_requests',
    targetId: raw.requestId as string,
    beforeState: { status: r.status },
    afterState: { status: 'completed', by_platform: true },
  });
  return { ok: true };
}
