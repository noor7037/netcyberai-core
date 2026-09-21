import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';

const BOARD_TYPES = ['CBSE', 'ICSE', 'STATE', 'IB', 'OTHER'] as const;
const TENANT_TYPES = ['school', 'coaching', 'college'] as const;

// Task 1, "Tenant Created" -- the only step of PRD §7.2's workflow this
// prompt can create a row for (Lead/Approved are pre-tenant). Every new
// school starts at onboarding_stage='tenant_created' and
// pilot_allow_outbound=false by column default -- this route writes
// neither column, on purpose: see Task 3 and stages.ts.
export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const board = BOARD_TYPES.includes(body?.board) ? body.board : null;
  const tenantType = TENANT_TYPES.includes(body?.tenantType) ? body.tenantType : null;
  if (!name || !board || !tenantType) {
    return NextResponse.json({ error: 'name, board, and tenantType are required' }, { status: 400 });
  }

  try {
    const school = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(
        `insert into schools (name, board, tenant_type)
         values ($1, $2, $3)
         returning school_id, name, board, tenant_type, onboarding_stage, is_pilot, pilot_allow_outbound`,
        [name, board, tenantType]
      );
      const row = rows[0];
      await writeAuditLog(client, {
        schoolId: row.school_id,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'school.create',
        targetType: 'schools',
        targetId: row.school_id,
        afterState: row,
      });
      return row;
    });
    return NextResponse.json({ school }, { status: 201 });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
