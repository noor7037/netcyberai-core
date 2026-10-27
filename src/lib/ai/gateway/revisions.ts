import { aiRouteActivationStatement } from '@/lib/auth/db';
import type { Sql } from '@/lib/jobs/types';
import type { RouteRevision } from '@/lib/contracts/ai-gateway';

// Route revisions (G2, C370; the brief's §5.4). A trigger on control.ai_profiles writes an immutable snapshot of the
// route (Primary, Backup 1, Backup 2, the prompt version, the switch) on every change, with who and when, and points
// the profile at it (control.ai_profiles.revision_id). Control says why for the transaction: a save, an undo or a
// rollback. A rollback is the previous revision activated again, as a new revision, audited like any other change.

export type Activation = 'set' | 'undo' | 'rollback';

// Before Control's update of a profile: why this activation, and for a rollback the revision it restores. Local to
// the transaction; cleared again by activated().
export async function activating(db: Sql, activation: Activation, rollbackOf: string | null = null): Promise<void> {
  const s = aiRouteActivationStatement(activation, rollbackOf ?? '');
  await db.query(s.sql, s.params);
}
export async function activated(db: Sql): Promise<void> {
  const s = aiRouteActivationStatement('', '');
  await db.query(s.sql, s.params);
}

export type RevisionRow = { revisionId: string; providerId: string | null; model: string | null; fallback: unknown; promptVersion: string; enabled: boolean };

// The revision a rollback restores: the one named (of this profile, not the active one), or else the one activated
// just before the active one.
export async function revisionToRestore(db: Sql, profileId: string, revisionId: string | null): Promise<RevisionRow | null> {
  const { rows } = await db.query(
    `select r.revision_id, r.provider_id, r.model, r.fallback, r.prompt_version, r.enabled
       from control.ai_route_revisions r join control.ai_profiles p on p.profile_id = r.profile_id
      where r.profile_id = $1 and r.revision_id is distinct from p.revision_id
        and (case when $2::bigint is null then r.revision_id < coalesce(p.revision_id, 0) else r.revision_id = $2::bigint end)
      order by r.revision_id desc limit 1`,
    [profileId, revisionId]
  );
  const r = rows[0];
  return r ? { revisionId: String(r.revision_id), providerId: r.provider_id ?? null, model: r.model ?? null, fallback: r.fallback, promptVersion: String(r.prompt_version), enabled: r.enabled === true } : null;
}

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

// Control's view (the platform role): a profile's revisions (or every profile's), newest first.
export async function loadRouteRevisions(db: Sql, f: { profileId?: string; limit?: number } = {}): Promise<RouteRevision[]> {
  const limit = Math.min(200, Math.max(1, Math.floor(f.limit ?? 50)));
  const { rows } = await db.query(
    `select r.revision_id, r.profile_id, r.provider_id, r.model, r.fallback, r.prompt_version, r.enabled, r.activation, r.rollback_of, r.activated_at,
            u.display_name, (p.revision_id = r.revision_id) as active
       from control.ai_route_revisions r
       left join control.ai_profiles p on p.profile_id = r.profile_id
       left join users u on u.user_id = r.activated_by
      where ($1::text is null or r.profile_id = $1)
      order by r.revision_id desc limit $2`,
    [f.profileId ?? null, limit]
  );
  return rows.map((r) => ({
    revisionId: String(r.revision_id),
    profileId: String(r.profile_id),
    providerId: r.provider_id ?? null,
    model: r.model ?? null,
    fallback: (Array.isArray(r.fallback) ? r.fallback : []).flatMap((x: unknown) => {
      const l = x as { provider?: unknown; model?: unknown };
      return typeof l?.provider === 'string' && typeof l?.model === 'string' ? [{ provider: l.provider, model: l.model }] : [];
    }),
    promptVersion: String(r.prompt_version),
    enabled: r.enabled === true,
    activation: r.activation,
    rollbackOf: r.rollback_of === null || r.rollback_of === undefined ? null : String(r.rollback_of),
    activatedAt: iso(r.activated_at) as string,
    activatedByName: r.display_name ?? null,
    active: r.active === true,
  }));
}
