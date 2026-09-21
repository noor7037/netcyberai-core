import type { PoolClient } from 'pg';
import { REQUIRED_CONSENT_PURPOSES } from './stages';

export interface ConsentSummary {
  totalStudents: number;
  // Per purpose: how many students' MOST RECENT consent_ledger row for
  // that purpose has granted=true. consent_ledger is append-only
  // (PRD §3.5: "withdrawal is a new row, never a mutation"), so "current
  // state" always means the latest row per (student, purpose), never a
  // simple count of granted=true rows ever written.
  grantedByPurpose: Record<string, number>;
  requiredComplete: boolean;
}

// Shared by the stage-advance gate (must re-check before leaving
// consent_collection) and the onboarding UI's completion meter -- one
// definition of "complete", not two that could drift apart.
export async function computeConsentSummary(client: PoolClient, schoolId: string): Promise<ConsentSummary> {
  const { rows: totalRows } = await client.query(`select count(*)::int as total from students where school_id = $1`, [
    schoolId,
  ]);
  const totalStudents: number = totalRows[0]?.total ?? 0;

  const { rows: latestRows } = await client.query(
    `select distinct on (cl.student_id, cl.purpose) cl.purpose, cl.granted
     from consent_ledger cl
     join students s on s.student_id = cl.student_id
     where s.school_id = $1
     order by cl.student_id, cl.purpose, cl.created_at desc`,
    [schoolId]
  );

  const grantedByPurpose: Record<string, number> = {};
  for (const purpose of REQUIRED_CONSENT_PURPOSES) grantedByPurpose[purpose] = 0;
  for (const row of latestRows) {
    if (row.granted && Object.prototype.hasOwnProperty.call(grantedByPurpose, row.purpose)) {
      grantedByPurpose[row.purpose] += 1;
    }
  }

  const requiredComplete =
    totalStudents > 0 && REQUIRED_CONSENT_PURPOSES.every((p) => grantedByPurpose[p] === totalStudents);

  return { totalStudents, grantedByPurpose, requiredComplete };
}
