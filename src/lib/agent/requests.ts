import type { NextRequest } from 'next/server';
import { withTenantContext } from '@/lib/auth/db';
import type { SessionClaims } from '@/lib/auth/types';
import { writeAuditLog } from '@/lib/audit/log';
import { agentNoPreview } from './ctx';
import type { Auth } from './call';
import { applyPlan, checkPlan, mayApprove, planTier } from './engine';
import { bookFromJson, redact, restoreNames, type NameBook } from './redact';
import type { Change, Step, Tier } from './types';

// Change requests as the school's screens see them (C546), and the two decisions on one: go live, or discard.

export type RequestView = {
  requestId: string; status: string; title: string; summary: string; tier: Tier; createdAt: string; createdBy: string;
  createdByName: string | null; appliedAt: string | null; steps: { endpoint: string; why?: string; status?: number }[];
  changes: Change[]; mayGoLive: boolean; reverseOf: string | null;
  // Pages and files the changes made (a certificate's PDF), once live: this app's own addresses only.
  files: { label: string; href: string }[];
};

// The app's own pages and files named in what the steps answered when they went live.
export function filesIn(answers: readonly unknown[]): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  const walk = (v: unknown, key: string, depth: number) => {
    if (depth > 6 || out.length >= 10) return;
    if (typeof v === 'string') {
      if (/(url|href|pdf|file|link|download)/i.test(key) && /^\/(app|api\/app)\/[A-Za-z0-9/_?=&.:%-]+$/.test(v) && !v.includes('..')) out.push({ label: key.replace(/_/g, ' '), href: v });
      return;
    }
    if (Array.isArray(v)) v.forEach((x) => walk(x, key, depth + 1));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k, depth + 1);
  };
  answers.forEach((a) => walk(a, '', 0));
  return out;
}

export const authFrom = (req: NextRequest): Auth => ({ origin: req.nextUrl.origin, cookie: req.headers.get('cookie') ?? '', authorization: req.headers.get('authorization') ?? '' });
const inSchool = <T>(claims: SessionClaims, fn: Parameters<typeof withTenantContext<T>>[1]) => agentNoPreview.run(true, () => withTenantContext(claims, fn));

function view(r: Record<string, unknown>, claims: SessionClaims): RequestView {
  const preview = (r.preview ?? {}) as { steps?: { endpoint: string; status: number }[]; changes?: Change[]; files?: { label: string; href: string }[] };
  const steps = (r.steps as Step[]).map((s, i) => ({ endpoint: s.endpoint, ...(s.why ? { why: s.why } : {}), ...(preview.steps?.[i] ? { status: preview.steps[i].status } : {}) }));
  return {
    requestId: String(r.request_id), status: String(r.status), title: String(r.title), summary: String(r.summary), tier: Number(r.tier) as Tier,
    createdAt: new Date(r.created_at as string).toISOString(), createdBy: String(r.created_by), createdByName: (r.created_by_name as string | null) ?? null,
    appliedAt: r.applied_at ? new Date(r.applied_at as string).toISOString() : null, steps, changes: preview.changes ?? [],
    mayGoLive: r.status === 'ready' && mayApprove(Number(r.tier) as Tier, { role: claims.role, userId: claims.sub }, String(r.created_by)),
    reverseOf: (r.reverse_of as string | null) ?? null,
    files: preview.files ?? [],
  };
}

const SELECT = `select r.*, u.display_name as created_by_name from agent_requests r left join users u on u.school_id = r.school_id and u.user_id = r.created_by`;

export async function listRequests(claims: SessionClaims): Promise<RequestView[]> {
  return inSchool(claims, async (db) => (await db.query(`${SELECT} where r.school_id = $1 order by r.created_at desc limit 30`, [claims.schoolId])).rows.map((r) => view(r, claims)));
}

export async function getRequest(claims: SessionClaims, id: string): Promise<RequestView | null> {
  return inSchool(claims, async (db) => {
    const r = (await db.query(`${SELECT} where r.school_id = $1 and r.request_id = $2`, [claims.schoolId, id])).rows[0];
    return r ? view(r, claims) : null;
  });
}

export type ChatLine = { role: string; body: string; requestId: string | null; at: string; links: { label: string; href: string }[]; ticket: string | null; photos: number };
export async function recentMessages(claims: SessionClaims): Promise<ChatLine[]> {
  return inSchool(claims, async (db) => {
    const { rows } = await db.query(`select role, body, names, request_id, created_at, extras from agent_messages where school_id = $1 and user_id = $2 order by created_at desc limit 40`, [claims.schoolId, claims.sub]);
    return rows.reverse().map((r) => {
      const x = (r.extras ?? {}) as { links?: { label: string; href: string }[]; ticket?: string; photos?: number };
      return { role: String(r.role), body: restoreNames(String(r.body), bookFromJson(r.names)), requestId: (r.request_id as string | null) ?? null, at: new Date(r.created_at).toISOString(), links: Array.isArray(x.links) ? x.links : [], ticket: x.ticket ?? null, photos: Number(x.photos ?? 0) };
    });
  });
}

export type Decision = { ok: true; view: RequestView } | { ok: false; status: number; error: 'not_found' | 'not_yours_to_approve' | 'not_ready' | 'changed_since_review' | 'failed'; detail?: string };

export async function goLive(claims: SessionClaims, id: string, auth: Auth): Promise<Decision> {
  const current = await getRequest(claims, id);
  if (!current) return { ok: false, status: 404, error: 'not_found' };
  if (current.status !== 'ready') return { ok: false, status: 409, error: 'not_ready' };
  if (!current.mayGoLive) return { ok: false, status: 403, error: 'not_yours_to_approve' };
  const row = await inSchool(claims, async (db) => (await db.query(`select steps, diff_hash from agent_requests where request_id = $1 and school_id = $2`, [id, claims.schoolId])).rows[0]);
  const steps = row.steps as Step[];
  // The tier is worked out again from the routes, never taken from the stored row.
  const tier = planTier(steps);
  if (tier === null || tier === 0 || !mayApprove(tier, { role: claims.role, userId: claims.sub }, current.createdBy)) return { ok: false, status: 403, error: 'not_yours_to_approve' };
  // Someone approving another person's plan checks it again as themselves: it goes live only if, with their own rights,
  // it changes exactly what the author's check showed (a route can do more for a principal than for a teacher).
  if (claims.sub !== current.createdBy) {
    const again = await checkPlan(claims, steps, auth);
    if (!again.ok || again.hash !== String(row.diff_hash)) {
      await inSchool(claims, (db) => db.query(`update agent_requests set status = 'stale', updated_at = now() where request_id = $1 and school_id = $2 and status = 'ready'`, [id, claims.schoolId]));
      return { ok: false, status: 409, error: 'changed_since_review' };
    }
  }
  const outcome = await applyPlan(claims, steps, auth, String(row.diff_hash), async (db, run) => {
    const files = filesIn(run.steps.map((s) => s.answer));
    const done = await db.query(`update agent_requests set status = 'live', approved_by = $3, applied_at = now(), updated_at = now(), preview = preview || jsonb_build_object('files', $4::jsonb) where request_id = $1 and school_id = $2 and status = 'ready'`, [id, claims.schoolId, claims.sub, JSON.stringify(files)]);
    if (done.rowCount !== 1) throw new Error('agent_request_not_ready');
    // An undo that goes live marks what it reversed.
    await db.query(`update agent_requests o set status = 'undone', updated_at = now() from agent_requests r where r.request_id = $1 and r.school_id = $2 and o.request_id = r.reverse_of and o.school_id = r.school_id and o.status = 'live'`, [id, claims.schoolId]);
    await writeAuditLog(db, { schoolId: claims.schoolId as string, actorUserId: claims.sub, actorRole: claims.role, eventAction: 'agent.request.live', targetType: 'agent_requests', targetId: id });
  });
  if (!outcome.ok) {
    await inSchool(claims, (db) => db.query(`update agent_requests set status = $3, updated_at = now() where request_id = $1 and school_id = $2 and status = 'ready'`, [id, claims.schoolId, outcome.why === 'changed_since_review' ? 'stale' : 'failed']));
    const failed = outcome.run.steps.find((s) => !s.ok);
    return { ok: false, status: 409, error: outcome.why, ...(failed?.error ? { detail: failed.error } : {}) };
  }
  return { ok: true, view: (await getRequest(claims, id))! };
}

export async function discard(claims: SessionClaims, id: string): Promise<Decision> {
  const r = await inSchool(claims, (db) => db.query(`update agent_requests set status = 'discarded', updated_at = now() where request_id = $1 and school_id = $2 and status in ('ready', 'stale', 'failed') returning request_id`, [id, claims.schoolId]));
  if (r.rowCount !== 1) return { ok: false, status: 404, error: 'not_found' };
  return { ok: true, view: (await getRequest(claims, id))! };
}

// Undo asks the agent for the reverse of what went live, as a new change request the person reviews like any other.
export function undoAsk(v: RequestView, book: NameBook): string {
  const changes = v.changes.slice(0, 30).map((c) => `${c.action} ${c.target ?? ''} ${c.targetId ?? ''} before=${JSON.stringify(redact(c.before, book))} after=${JSON.stringify(redact(c.after, book))}`).join('\n');
  return `Undo the change request "${v.title}" that went live: put back what it changed, exactly as it was before. Its steps were: ${v.steps.map((s) => s.endpoint).join('; ')}. What changed:\n${changes}`;
}

export async function linkReverse(claims: SessionClaims, newId: string, of: string): Promise<void> {
  await inSchool(claims, (db) => db.query(`update agent_requests set reverse_of = $3 where request_id = $1 and school_id = $2`, [newId, claims.schoolId, of]));
}
