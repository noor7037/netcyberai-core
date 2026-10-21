import { activeBanner, moduleOn, type AppBanner, type AppFlag } from '@/lib/contracts/app-flags';

// What Control has switched on for the Family app, for this family (docs/family-app/10 §2; M1-5, wired to M1-7's one
// flag rule, C253): every module's flag and the whole app's kill switch (module '*'), with their audiences (everyone,
// staff preview, a share of families, listed schools), and the banner. Read live on every request; a missing row is off.
type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export type FamilySwitches = { flags: AppFlag[]; banners: AppBanner[]; isPreview: boolean; accountId: string | null; minShell: number };

export async function readFamilySwitches(db: Db, accountId: string | null): Promise<FamilySwitches> {
  const { rows: f } = await db.query(
    `select app, module, enabled, audience, audience_percent, audience_schools, reason, ends_at, off_message_en, off_message_hi from control.app_flags where app = 'family'`
  );
  const { rows: b } = await db.query(`select banner_id, app, tone, text_en, text_hi, starts_at, ends_at, ended_at from control.app_banners where app = 'family' and ended_at is null and ends_at > now()`);
  const { rows: v } = await db.query(`select min_shell_version from control.app_versions where app = 'family'`);
  const preview = accountId ? (await db.query(`select 1 from control.preview_accounts where account_id = $1`, [accountId])).rows.length > 0 : false;
  const date = (v: unknown) => (v ? new Date(String(v)) : null);
  return {
    accountId,
    isPreview: preview,
    minShell: Number(v[0]?.min_shell_version ?? 0),
    flags: f.map((r) => ({
      app: 'family',
      module: String(r.module),
      enabled: r.enabled === true,
      audience: r.audience as AppFlag['audience'],
      audiencePercent: r.audience_percent === null ? null : Number(r.audience_percent),
      audienceSchools: (r.audience_schools as string[] | null) ?? null,
      reason: (r.reason as string | null) ?? null,
      endsAt: date(r.ends_at),
      offMessageEn: (r.off_message_en as string | null) ?? null,
      offMessageHi: (r.off_message_hi as string | null) ?? null,
    })),
    banners: b.map((r) => ({
      bannerId: String(r.banner_id),
      app: 'family',
      tone: r.tone === 'warning' ? 'warning' : 'info',
      textEn: String(r.text_en),
      textHi: String(r.text_hi),
      startsAt: new Date(String(r.starts_at)),
      endsAt: new Date(String(r.ends_at)),
      endedAt: date(r.ended_at),
    })),
  };
}

export function switchOn(s: FamilySwitches, module: string, now = new Date()): boolean {
  return moduleOn(s.flags, 'family', module, { accountId: s.accountId, isPreview: s.isPreview }, now);
}

// The words Control set to show in place of a module that is off, in the family's language, if any.
export function offMessage(s: FamilySwitches, module: string, lang: 'en' | 'hi'): string | null {
  const f = s.flags.find((x) => x.module === module && !switchOn(s, module)) ?? s.flags.find((x) => x.module === '*');
  const text = lang === 'hi' ? f?.offMessageHi : f?.offMessageEn;
  return text ?? null;
}

export function familyBanner(s: FamilySwitches, now = new Date()): AppBanner | null {
  return activeBanner(s.banners, 'family', now);
}

export async function familyModuleOn(db: Db, module: string, accountId: string | null): Promise<boolean> {
  return switchOn(await readFamilySwitches(db, accountId), module);
}

// The Android shell's version from its user agent; a browser has none and is never asked to update.
export function shellVersion(userAgent: string | null): number | null {
  const m = /NetCyberAIFamily\/(\d{1,6})/.exec(userAgent ?? '');
  return m ? Number(m[1]) : null;
}

export function shellTooOld(s: FamilySwitches, userAgent: string | null): boolean {
  const v = shellVersion(userAgent);
  return v !== null && v < s.minShell;
}
