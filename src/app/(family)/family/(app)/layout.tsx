import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { FamilySessionKeeper } from '@/components/family/FamilySessionKeeper';
import { FamilyTabs } from '@/components/family/FamilyTabs';
import { familyBanner, offMessage, readFamilySwitches, shellTooOld, switchOn } from '@/lib/family/flags';
import { visibleTabs } from '@/lib/family/modules';
import { familyPageRead, requireFamilyPage } from '@/lib/family/server';
import { t } from '@/lib/i18n';

// Every Family app page that needs a session renders through this layout (M1-2, C248): no family session, no page.
// The middleware checks the cookie's signature first; this reads the account, so a deleted or signed-out-everywhere
// session ends here too. A staff session is never read.
// M1-6 (C252): Control's switches apply here: the whole app's kill switch shows its message in place of every page,
// a live banner shows above them, and the tabs show only what is switched on.
export const dynamic = 'force-dynamic';

export default async function FamilyAppLayout({ children }: { children: React.ReactNode }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const lang = page.childLang;
  const switches = await familyPageRead(page, (db) => readFamilySwitches(db, page.session.accountId));
  if (!switchOn(switches, '*')) {
    return (
      <main lang={lang} data-family-off className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-3 px-4">
        <h1 className="text-2xl font-extrabold text-slate">{t(lang, 'fam.app.name')}</h1>
        <p className="text-base text-slate">{offMessage(switches, '*', lang) ?? t(lang, 'fam.off.app')}</p>
      </main>
    );
  }
  // The Android shell reports its version in the user agent ("NetCyberAIFamily/<n>", M1-8). One older than Control's
  // oldest accepted version is asked to update before anything else.
  if (shellTooOld(switches, headers().get('user-agent'))) {
    return (
      <main lang={lang} data-family-update className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-3 px-4">
        <h1 className="text-2xl font-extrabold text-slate">{t(lang, 'fam.app.name')}</h1>
        <p className="text-base text-slate">{t(lang, 'fam.shell.update')}</p>
      </main>
    );
  }
  const banner = familyBanner(switches);
  const tabs = visibleTabs((flag) => switchOn(switches, flag));
  return (
    <>
      {banner && (
        <div role="status" lang={lang} className={`px-4 py-2 text-center text-sm font-semibold ${banner.tone === 'warning' ? 'bg-amber text-slate' : 'bg-sapphire text-white'}`}>
          {lang === 'hi' ? banner.textHi : banner.textEn}
        </div>
      )}
      <FamilySessionKeeper />
      <div className="pb-20">{children}</div>
      <FamilyTabs tabs={tabs} navLabel={t(lang, 'fam.tab.nav')} labels={{ home: t(lang, 'fam.tab.home'), study: t(lang, 'fam.tab.study'), english: t(lang, 'fam.tab.english'), future: t(lang, 'fam.tab.future'), family: t(lang, 'fam.tab.family') }} />
    </>
  );
}
