import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { FamIcon, type IconName } from '@/components/family/FamIcon';
import { readFamilySwitches, switchOn } from '@/lib/family/flags';
import { futureHubs } from '@/lib/family/hubs';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { t } from '@/lib/i18n';

// W6-B: each hub's own mark (careers, exams, schemes); a hub without one gets the compass.
const ICON: Record<string, IconName> = { careers: 'user', exams_portal: 'sheet', opportunities: 'star' };

// The Future tab (H1): the hubs the module registry declares here that are built and switched on. Nothing hard-codes
// the list; a hub Control switches off disappears from it.
export default async function FamilyFuturePage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const lang = page.childLang;
  const switches = await familyPageRead(page, (db) => readFamilySwitches(db, page.session.accountId));
  const hubs = futureHubs().filter((h) => switchOn(switches, h.module));
  if (hubs.length === 0) redirect('/family');
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family" backLabel={t(lang, 'fam.nav.home')} title={t(lang, 'fam.tab.future')} />
      <main className="fam-page">
        <ul data-hub-list className="flex flex-col gap-3">
          {hubs.map((h, n) => (
            <li key={h.module} className="fam-rise" style={{ ['--d' as string]: `${n * 60}ms` } as React.CSSProperties}>
              <Link href={h.path} data-hub-link={h.module} className="fam-card fam-press flex min-h-[72px] items-center gap-4 bg-white p-4 text-slate">
                <span aria-hidden="true" className="fam-chip-icon h-12 w-12 bg-royal-deep bg-gradient-to-br from-royal to-violet text-white">
                  <FamIcon name={ICON[h.module] ?? 'compass'} className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1 text-lg font-extrabold leading-snug">{t(lang, h.title)}</span>
                <FamIcon name="next" className="h-5 w-5 shrink-0 text-royal-deep" />
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
