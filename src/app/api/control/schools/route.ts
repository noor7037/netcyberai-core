import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { applyDefaultPlan } from '@/lib/frameworks/plans';

const BOARD_TYPES = ['CBSE', 'ICSE', 'STATE', 'IB', 'OTHER'] as const;
const TENANT_TYPES = ['school', 'coaching', 'college'] as const;
// ISO-style country-subdivision code (IN-HR, IN-MH, AE-DU) -- Pre-F
// Architecture Hardening: schools.jurisdiction has no column default on
// purpose (a default here would silently mislabel every school, exactly
// the bug this replaces -- see the migration and Decision Log). Captured
// explicitly at onboarding instead.
const JURISDICTION_RE = /^[A-Z]{2}-[A-Z]{2,3}$/;

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
  const jurisdiction = typeof body?.jurisdiction === 'string' ? body.jurisdiction.trim().toUpperCase() : '';
  if (!name || !board || !tenantType || !JURISDICTION_RE.test(jurisdiction)) {
    return NextResponse.json(
      { error: 'name, board, tenantType, and jurisdiction (e.g. IN-HR) are required' },
      { status: 400 }
    );
  }

  try {
    const school = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(
        `insert into schools (name, board, tenant_type, jurisdiction)
         values ($1, $2, $3, $4)
         returning school_id, name, board, tenant_type, jurisdiction, onboarding_stage, is_pilot, pilot_allow_outbound`,
        [name, board, tenantType, jurisdiction]
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
      // The plan new schools get (a platform setting, C204), in the same transaction (C114).
      await applyDefaultPlan(client, row.school_id, { userId: guard.claims.sub, role: guard.claims.role }, 'school created in Control');
      return row;
    });
    return NextResponse.json({ school }, { status: 201 });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
