import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { readFamilySwitches, switchOn } from '@/lib/family/flags';
import { futureHubs } from '@/lib/family/hubs';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { t } from '@/lib/i18n';

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
      <main className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-24">
        <ul data-hub-list className="flex flex-col gap-3">
          {hubs.map((h) => (
            <li key={h.module}>
              <Link href={h.path} data-hub-link={h.module} className="fam-card fam-press flex min-h-[64px] items-center justify-between gap-3 bg-white p-4 text-lg font-extrabold text-slate">
                {t(lang, h.title)}
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-royal-deep" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
