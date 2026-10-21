// App flags and banners (docs/family-app/10 §2, M1-7). Control sets them in control.app_flags and control.app_banners;
// every app reads them through the ONE function below, so "is this module on for this person" has one answer.
// Pure TypeScript with no Node-only API: it runs on the server, in the browser and at the edge.

export const APP_IDS = ['family', 'teacher', 'school_web'] as const;
export type AppId = (typeof APP_IDS)[number];

export const FLAG_AUDIENCES = ['everyone', 'staff_preview', 'percent', 'schools'] as const;
export type FlagAudience = (typeof FLAG_AUDIENCES)[number];

// The module name that is the whole app's kill switch.
export const WHOLE_APP = '*';

export interface AppFlag {
  app: AppId;
  module: string; // '*' is the whole app
  enabled: boolean;
  audience: FlagAudience;
  audiencePercent: number | null; // 0 to 100, set when audience is 'percent'
  audienceSchools: readonly string[] | null; // school ids, set when audience is 'schools'
  reason: string | null;
  endsAt: Date | null;
  offMessageEn: string | null;
  offMessageHi: string | null;
}

export type BannerTone = 'info' | 'warning';

export interface AppBanner {
  bannerId: string;
  app: AppId;
  tone: BannerTone;
  textEn: string;
  textHi: string;
  startsAt: Date;
  endsAt: Date;
  endedAt: Date | null;
}

export interface FlagViewer {
  accountId: string | null;
  isPreview: boolean;
  schoolId?: string | null;
}

// A stable bucket from 0 to 99 for an account id (FNV-1a, 32 bits, in plain TypeScript). The same account is always
// in the same bucket, so raising a rollout from 10 to 50 percent only ever adds families.
export function rolloutBucket(accountId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < accountId.length; i++) {
    h ^= accountId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
}

// Is this flag on for this viewer, now? A missing row is off. An end date in the past is off.
export function flagOn(flag: AppFlag | undefined, viewer: FlagViewer, now: Date): boolean {
  if (!flag || !flag.enabled) return false;
  if (flag.endsAt && flag.endsAt.getTime() <= now.getTime()) return false;
  switch (flag.audience) {
    case 'everyone':
      return true;
    case 'staff_preview':
      return viewer.isPreview;
    case 'percent':
      return viewer.accountId !== null && flag.audiencePercent !== null && rolloutBucket(viewer.accountId) < flag.audiencePercent;
    case 'schools':
      return Boolean(viewer.schoolId) && (flag.audienceSchools ?? []).includes(viewer.schoolId as string);
    default:
      return false;
  }
}

// A module is on when its own flag is on AND the whole app's switch ('*') is on. No '*' row counts as off, like any
// missing row: the app's kill switch is a row Control keeps.
export function moduleOn(flags: readonly AppFlag[], app: AppId, module: string, viewer: FlagViewer, now: Date): boolean {
  const whole = flags.find((f) => f.app === app && f.module === WHOLE_APP);
  if (!flagOn(whole, viewer, now)) return false;
  if (module === WHOLE_APP) return true;
  return flagOn(
    flags.find((f) => f.app === app && f.module === module),
    viewer,
    now
  );
}

// The banner to show now for an app: started, not ended by hand, not past its end. The most recently started wins.
export function activeBanner(banners: readonly AppBanner[], app: AppId, now: Date): AppBanner | null {
  const t = now.getTime();
  const live = banners.filter((b) => b.app === app && b.endedAt === null && b.startsAt.getTime() <= t && t < b.endsAt.getTime());
  if (live.length === 0) return null;
  return live.reduce((a, b) => (b.startsAt.getTime() > a.startsAt.getTime() ? b : a));
}
