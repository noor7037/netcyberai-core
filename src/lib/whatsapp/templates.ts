import type { PoolClient } from 'pg';

// Task 2c point 5: refuse to send against an unapproved/unknown
// template rather than attempting it and hoping Meta accepts it.
// School-specific row (if any) always wins over the platform default,
// same override shape as school_whatsapp_configs itself.
export async function isTemplateApproved(client: PoolClient, schoolId: string, templateName: string): Promise<boolean> {
  const { rows } = await client.query(
    `select status from whatsapp_templates
     where template_name = $2 and (school_id = $1 or school_id is null)
     order by school_id nulls last
     limit 1`,
    [schoolId, templateName]
  );
  return rows[0]?.status === 'approved';
}
