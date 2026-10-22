import Link from 'next/link';
import type { ReactNode } from 'react';
import { AppCard } from '@/components/app-ui/Card';
import { BannerForm, FlagEditor, KillSwitch, ReasonButton, UndoButton, VersionForm } from '@/components/control/apps/AppsPanels';
import { Badge } from '@/components/ui/Badge';
import { APP_IDS, WHOLE_APP, flagOn, type AppId } from '@/lib/contracts/app-flags';
import { familyModuleRows, toAppFlag, type ControlApps, type FlagRow, type LiveBuild } from '@/lib/control/apps';
import { isMessageKey, t, type Lang, type MessageKey } from '@/lib/i18n';

// Control → Apps (docs/family-app/10 §2, M1-7). Drawn on the server from loadControlApps: for each app its version,
// the whole-app switch, its modules with who sees them, its banner, then the staff-preview accounts and the recent
// changes with Undo. "On now" is worked out by flagOn, the one function the apps themselves use.

const locale = (lang: Lang) => (lang === 'hi' ? 'hi-IN' : 'en-IN');
const when = (lang: Lang, iso: string) => new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso));
const SUB = 'text-base font-bold text-slate';
const NOTE = 'max-w-prose text-sm text-slate/70';
const EVERYONE = { accountId: null, isPreview: false } as const;

function audienceWords(lang: Lang, f: FlagRow): string {
  if (f.audience === 'percent') return t(lang, 'control.apps.audience.percentValue', { n: f.audience_percent ?? 0 });
  if (f.audience === 'schools') return t(lang, 'control.apps.audience.schoolsValue', { n: f.audience_schools?.length ?? 0 });
  return t(lang, `control.apps.audience.${f.audience}` as MessageKey);
}

function Summary({ lang, flag, live, everSet = true }: { lang: Lang; flag: FlagRow; live: boolean; everSet?: boolean }): ReactNode {
  // A module never switched on has no row yet (C230-V): it is off for everyone until it is saved here.
  if (!everSet) return <><Badge variant="warning">{t(lang, 'control.apps.module.off')}</Badge> {t(lang, 'control.apps.module.neverSet')}</>;
  return (
    <>
      <Badge variant={live ? 'success' : 'warning'}>{live ? t(lang, 'control.apps.module.on') : t(lang, 'control.apps.module.off')}</Badge> {audienceWords(lang, flag)}
      {flag.ends_at && <> · {t(lang, 'control.apps.endsAt.summary', { when: when(lang, flag.ends_at) })}</>}
      {flag.reason && <> · {t(lang, 'control.apps.lastReason', { reason: flag.reason })}</>}
    </>
  );
}

export function AppsView({ data, build, lang, now }: { data: ControlApps; build: LiveBuild; lang: Lang; now: Date }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {APP_IDS.map((app) => (
        <AppSection key={app} app={app} data={data} build={build} lang={lang} now={now} />
      ))}
      <AppCard title={t(lang, 'control.apps.preview.heading')} description={t(lang, 'control.apps.preview.purpose')}>
        {data.preview.length === 0 ? (
          <p className={NOTE}>{t(lang, 'control.apps.preview.none')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.preview.map((p) => (
              <li key={p.account_id} data-preview-account={p.account_id} className="flex flex-col gap-2 rounded-xl border border-slate/10 p-3">
                <p className="break-all text-sm text-slate">{t(lang, 'control.apps.preview.row', { account: p.account_id, by: p.added_by, when: when(lang, p.added_at) })}</p>
                <ReasonButton url="/api/control/apps/preview/remove" field="accountId" id={p.account_id} label={t(lang, 'control.apps.preview.remove')} />
              </li>
            ))}
          </ul>
        )}
      </AppCard>
      <AppCard title={t(lang, 'control.apps.changes.heading')}>
        {data.changes.length === 0 ? (
          <p className={NOTE}>{t(lang, 'control.apps.changes.none')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.changes.map((c) => (
              <li key={c.audit_id} data-change={c.audit_id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate/10 p-3">
                <div className="min-w-0">
                  <p className="break-words text-sm text-slate">
                    {t(lang, 'control.apps.changes.row', {
                      what: isMessageKey(`control.apps.action.${c.event_action}`) ? t(lang, `control.apps.action.${c.event_action}` as MessageKey) : c.event_action,
                      target: c.target_id ?? '',
                      when: when(lang, c.occurred_at),
                      who: c.actor_name ?? t(lang, 'control.apps.changes.unknownWho'),
                    })}
                  </p>
                  {c.reason && <p className={NOTE}>{t(lang, 'control.apps.changes.reason', { reason: c.reason })}</p>}
                </div>
                {c.undone ? <Badge>{t(lang, 'control.apps.changes.undone')}</Badge> : c.undoable ? <UndoButton auditId={c.audit_id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </AppCard>
    </div>
  );
}

function AppSection({ app, data, build, lang, now }: { app: AppId; data: ControlApps; build: LiveBuild; lang: Lang; now: Date }) {
  const flags = data.flags.filter((f) => f.app === app);
  const whole = flags.find((f) => f.module === WHOLE_APP) ?? null;
  // The Family app lists every built module of its registry, set or not (C230-V); the other apps list their saved rows.
  const modules = app === 'family' ? familyModuleRows(flags) : flags.filter((f) => f.module !== WHOLE_APP).map((flag) => ({ flag, everSet: true }));
  const wholeLive = flagOn(whole ? toAppFlag(whole) : undefined, EVERYONE, now);
  const banners = data.banners.filter((b) => b.app === app);
  const isFamily = app === 'family';
  return (
    <AppCard title={t(lang, `control.apps.app.${app}` as MessageKey)} tone={isFamily ? 'royal' : 'slate'}>
      <div data-app={app} className="flex min-w-0 flex-col gap-5">
        {!isFamily && <p className={NOTE}>{t(lang, 'control.apps.notRead')}</p>}

        <section className="flex flex-col gap-3" aria-label={t(lang, 'control.apps.version.heading')}>
          <h3 className={SUB}>{t(lang, 'control.apps.version.heading')}</h3>
          <p className="text-sm text-slate">
            {t(lang, 'control.apps.build')}:{' '}
            <span data-build={app} className="font-semibold">
              {build.commit ?? t(lang, 'control.apps.build.unknown')}
            </span>
            {build.commit && build.deployedAt && <> · {t(lang, 'control.apps.build.deployed', { when: when(lang, build.deployedAt) })}</>}
          </p>
          <VersionForm app={app} current={data.minShell[app]} />
        </section>

        <section className="flex flex-col gap-3" aria-label={t(lang, 'control.apps.kill.heading')}>
          <h3 className={SUB}>{t(lang, 'control.apps.kill.heading')}</h3>
          <KillSwitch app={app} flag={whole} live={wholeLive} />
        </section>

        <section className="flex flex-col gap-3" aria-label={t(lang, 'control.apps.modules.heading')}>
          <h3 className={SUB}>{t(lang, 'control.apps.modules.heading')}</h3>
          {!isFamily && (
            <p className={NOTE}>
              {t(lang, 'control.apps.modules.perSchool')}{' '}
              <Link href="/control/schools" className="inline-flex min-h-[44px] items-center font-semibold text-royal underline">
                {t(lang, 'control.apps.modules.link')}
              </Link>
            </p>
          )}
          {modules.length === 0 ? (
            <p className={NOTE}>{t(lang, 'control.apps.modules.none')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {modules.map(({ flag: f, everSet }) => {
                const live = everSet && flagOn(toAppFlag(f), EVERYONE, now);
                const key = `control.apps.module.label.${f.module}`;
                const label = isMessageKey(key) ? t(lang, key) : undefined;
                return <FlagEditor key={f.module} flag={f} label={label} live={live} schools={data.schools} summary={<Summary lang={lang} flag={f} live={live} everSet={everSet} />} />;
              })}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3" aria-label={t(lang, 'control.apps.banner.heading')}>
          <h3 className={SUB}>{t(lang, 'control.apps.banner.heading')}</h3>
          {banners.length === 0 ? (
            <p className={NOTE}>{t(lang, 'control.apps.banner.none')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {banners.map((b) => (
                <li key={b.banner_id} data-banner={b.banner_id} className="flex flex-col gap-2 rounded-xl border border-slate/10 p-3">
                  <p className="text-sm text-slate">
                    <Badge variant={b.tone === 'warning' ? 'warning' : 'neutral'}>{t(lang, `control.apps.banner.tone.${b.tone}` as MessageKey)}</Badge> {lang === 'hi' ? b.text_hi : b.text_en}
                  </p>
                  <p className={NOTE}>{t(lang, 'control.apps.banner.window', { from: when(lang, b.starts_at), to: when(lang, b.ends_at) })}</p>
                  <ReasonButton url="/api/control/apps/banners/end" field="bannerId" id={b.banner_id} label={t(lang, 'control.apps.banner.end')} />
                </li>
              ))}
            </ul>
          )}
          <BannerForm app={app} />
        </section>
      </div>
    </AppCard>
  );
}
