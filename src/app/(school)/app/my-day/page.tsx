import { redirect } from 'next/navigation';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { MyDayView } from '@/components/dashboards/MyDayView';
import { SessionRevokedError, withTenantContext } from '@/lib/auth/db';
import { canAccessApp, shellForRole } from '@/lib/auth/guards';
import { getServerSession } from '@/lib/auth/server-session';
import type { SchoolRole } from '@/lib/contracts/modules';
import { arrangeMyDay, type MyDay } from '@/lib/contracts/today-cards';
import { loadEntitlements } from '@/lib/frameworks/entitlements';
import { t, type Lang } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { loadMyDay } from '@/lib/today/cards';

// My Day (docs/19 rule 2, C136): the home every role lands on. The cards
// come from the modules through one contract (src/lib/contracts/today-cards.ts)
// and are computed inside this person's own tenant context, so a teacher's
// day is about their classes and a school never counts another's.

export const dynamic = 'force-dynamic';

function greeting(lang: Lang, now: Date): string {
  const hour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(now));
  const date = now.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
  return `${t(lang, hour < 12 ? 'myDay.morning' : hour < 17 ? 'myDay.afternoon' : 'myDay.evening')} · ${date}`;
}

export default async function MyDayPage() {
  const session = await getServerSession();
  if (!canAccessApp(session)) redirect('/login');
  const role = session!.role as SchoolRole;
  const { lang } = getLang(session!.sub);

  let day: MyDay & { failed: number } = { ...arrangeMyDay([]), failed: 1 };
  try {
    day = await withTenantContext(session!, async (db) => loadMyDay(db, { schoolId: session!.schoolId!, userId: session!.sub, role }, await loadEntitlements(db, session!.schoolId!)));
  } catch (err) {
    if (err instanceof SessionRevokedError) redirect('/login');
    console.error('[my-day] could not load', err instanceof Error ? err.name : 'error');
  }

  return (
    <ModulePage moduleId="dashboard" title={t(lang, 'myDay.title')} purpose={t(lang, 'myDay.purpose')} eyebrow={greeting(lang, new Date())} headerLang={lang}>
      <MyDayView day={day} lang={lang} failed={day.failed} dashboardHref={shellForRole(role) === 'office' ? '/app/dashboard' : undefined} />
    </ModulePage>
  );
}
