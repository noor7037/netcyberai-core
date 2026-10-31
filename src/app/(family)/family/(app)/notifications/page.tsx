import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NotifySeen } from '@/components/family/NotifyBell';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { FamIcon } from '@/components/family/FamIcon';
import { EmptyState } from '@/components/family/ui/EmptyState';
import { familyClaims } from '@/lib/family/db';
import { fill } from '@/lib/family/fill';
import { NEWS_TEXT, readNotifications, REQUEST_TEXT, type NotificationItem } from '@/lib/family/notifications';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { t, type MessageKey } from '@/lib/i18n';

// The notifications centre (H1, C230-AO): what the app already has to tell this child's family, read-only. It lists the
// connected school's new homework, notices and results, tonight's practice and the state of the chapters asked for;
// nothing else, and no new push. "Nothing new" when there is nothing.
export default async function FamilyNotificationsPage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const lang = page.childLang;
  const child = page.child!;
  const items = await familyPageRead(page, (db) => readNotifications(db, familyClaims(page.session), page.session.accountId, child));
  const total = items.reduce((n, i) => n + (i.kind === 'news' ? i.count : 0), 0);
  const text = (i: NotificationItem): string => {
    if (i.kind === 'news') return t(lang, NEWS_TEXT[i.news], { n: i.count });
    if (i.kind === 'tonight') return fill(t(lang, 'fam.notify.center.tonight'), { subject: t(lang, `fam.subject.${i.subject}` as MessageKey) });
    return fill(t(lang, REQUEST_TEXT[i.status]), { title: i.title });
  };
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family" backLabel={t(lang, 'fam.nav.home')} title={t(lang, 'fam.notify.center.title')} />
      <NotifySeen total={total} />
      <main className="fam-page">
        {items.length === 0 ? (
          <EmptyState data-notify-empty="" icon="bell" text={t(lang, 'fam.notify.center.empty')} href="/family" action={t(lang, 'fam.nav.home')} />
        ) : (
          <ul data-notify-list className="flex flex-col gap-3">
            {items.map((i, n) => (
              <li key={i.id} className="fam-rise" style={{ ['--d' as string]: `${n * 50}ms` } as React.CSSProperties}>
                <Link href={i.href} data-notify-item={i.kind} className="fam-card fam-press flex min-h-[56px] items-center gap-3 bg-white p-4 text-base font-semibold text-slate">
                  <span aria-hidden="true" className="fam-chip-icon bg-ink text-white">
                    <FamIcon name={i.kind === 'tonight' ? 'bulb' : i.kind === 'request' ? 'sheet' : 'bell'} className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">{text(i)}</span>
                  <FamIcon name="next" className="h-5 w-5 shrink-0 text-ink" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
