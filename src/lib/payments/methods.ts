import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { readUpiSettings, upiSettingsProblem, type UpiSettings } from './upi';

// Which ways of paying a school offers (docs/24 §3.2, C171): each on or off,
// in the school's order. The counter is always there. A gateway can be
// switched on only when NetCyberAI has allowed it for the school, its keys
// are saved and "Test connection" has passed; that rule is the caller's
// (`mayEnableGateway`), since the keys are not readable from here.

export const METHODS = ['counter', 'direct_upi', 'razorpay'] as const;
export type Method = (typeof METHODS)[number];
const OFFICE: readonly string[] = ['principal', 'school_admin'];
type Actor = { schoolId: string; userId: string; role: StaffRole };
export type MethodRow = { method: Method; enabled: boolean; sortOrder: number; settings: Record<string, unknown> };

export async function listMethods(db: Pick<PoolClient, 'query'>, schoolId: string): Promise<MethodRow[]> {
  const rows = (await db.query(`select method, enabled, sort_order, settings from payment_methods where school_id = $1`, [schoolId])).rows as { method: string; enabled: boolean; sort_order: number; settings: Record<string, unknown> }[];
  return METHODS.map((m, i) => {
    const r = rows.find((x) => x.method === m);
    // The counter is on unless a school has said otherwise; everything else is off until switched on.
    return { method: m, enabled: r ? r.enabled : m === 'counter', sortOrder: r ? r.sort_order : i, settings: r?.settings ?? {} };
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}

export type MethodResult = { ok: true } | { ok: false; reason: 'not_allowed' | 'method' | 'order' | 'gateway_not_ready' };

export async function setMethod(db: PoolClient, actor: Actor, input: { method: string; enabled: boolean; sortOrder: number }, mayEnableGateway: (method: Method) => Promise<boolean>): Promise<MethodResult> {
  if (!OFFICE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const method = METHODS.find((m) => m === input.method);
  if (!method) return { ok: false, reason: 'method' };
  if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 99) return { ok: false, reason: 'order' };
  if (method === 'razorpay' && input.enabled && !(await mayEnableGateway(method))) return { ok: false, reason: 'gateway_not_ready' };
  // Direct UPI has its own set-up (setDirectUpi): it is never switched on from here without it.
  if (method === 'direct_upi') return { ok: false, reason: 'method' };
  const before = (await db.query(`select enabled, sort_order from payment_methods where school_id = $1 and method = $2 for update`, [actor.schoolId, method])).rows[0];
  await db.query(
    `insert into payment_methods (school_id, method, enabled, sort_order, updated_by) values ($1, $2, $3, $4, $5)
     on conflict (school_id, method) do update set enabled = excluded.enabled, sort_order = excluded.sort_order, updated_by = excluded.updated_by, updated_at = now()`,
    [actor.schoolId, method, input.enabled, input.sortOrder, actor.userId]
  );
  if (!before || before.enabled !== input.enabled || before.sort_order !== input.sortOrder)
    await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'payments.method_changed', targetType: 'payment_methods', targetId: method, beforeState: before ? { enabled: before.enabled, sortOrder: before.sort_order } : undefined, afterState: { enabled: input.enabled, sortOrder: input.sortOrder } });
  return { ok: true };
}

export type UpiSetupResult = { ok: true } | { ok: false; reason: 'not_allowed' | NonNullable<ReturnType<typeof upiSettingsProblem>> };

// The school's direct-UPI set-up (docs/24 §3.3 step 1, C174): its own merchant UPI ID and payee name, the account the
// money lands in, who may verify, the amount above which the principal must also confirm, and how verifiers are told.
// It can be switched on only when every part is given and well formed.
export async function setDirectUpi(db: PoolClient, actor: Actor, input: { enabled: boolean; settings: unknown }): Promise<UpiSetupResult> {
  if (!OFFICE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const settings: UpiSettings = readUpiSettings(input.settings);
  settings.upiId = settings.upiId.trim();
  settings.payeeName = settings.payeeName.trim();
  settings.ifsc = settings.ifsc.trim().toUpperCase();
  const problem = upiSettingsProblem(settings);
  if (problem) return { ok: false, reason: problem };
  const before = (await db.query(`select enabled, settings from payment_methods where school_id = $1 and method = 'direct_upi' for update`, [actor.schoolId])).rows[0];
  await db.query(
    `insert into payment_methods (school_id, method, enabled, sort_order, settings, updated_by) values ($1, 'direct_upi', $2, 1, $3, $4)
     on conflict (school_id, method) do update set enabled = excluded.enabled, settings = excluded.settings, updated_by = excluded.updated_by, updated_at = now()`,
    [actor.schoolId, input.enabled, JSON.stringify(settings), actor.userId]
  );
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'payments.direct_upi_changed', targetType: 'payment_methods', targetId: 'direct_upi', beforeState: before ? { enabled: before.enabled } : undefined, afterState: { enabled: input.enabled, changed: (Object.keys(settings) as (keyof UpiSettings)[]).filter((k) => !before || JSON.stringify(settings[k]) !== JSON.stringify(readUpiSettings(before.settings)[k])), verifiers: settings.verifiers, principalLimitMinor: settings.principalLimitMinor, notify: settings.notify } }); // which parts changed, never the UPI ID or payee name (C224)
  return { ok: true };
}
