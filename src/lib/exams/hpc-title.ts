import type { Sql } from '@/lib/jobs/types';

// The Holistic Progress Card's name (W21-M4): the school's own when it set one in its Exams settings ("hpc_title"), or
// null for the standard words in the reader's language (also when it is left as the standard English). Its own small
// file so the Family app's reads do not load the PDF writer.
export const HPC_DEFAULT_TITLE = 'Holistic Progress Card';

export async function hpcTitleOf(db: Sql, schoolId: string): Promise<string | null> {
  const v = (await db.query(`select setting_values ->> 'hpc_title' as title from school_settings where school_id = $1 and module_id = 'exams'`, [schoolId])).rows[0]?.title;
  const s = typeof v === 'string' ? v.trim() : '';
  return s && s !== HPC_DEFAULT_TITLE ? s.slice(0, 60) : null;
}
