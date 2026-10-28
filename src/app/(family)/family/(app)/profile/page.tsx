import { redirect } from 'next/navigation';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { LinkRow } from '@/components/family/ui/LinkRow';
import { classText } from '@/lib/family/fill';
import { firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { t, type MessageKey } from '@/lib/i18n';

// The child's Profile (H1, C230-AO): who is using the app, and "Parent space", the way to the parent area that used to
// be a button in the header. The parent area itself is unchanged and still asks for the parent PIN (/family/parent).
export default async function FamilyProfilePage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const lang = page.childLang;
  const child = page.child!;
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family" backLabel={t(lang, 'fam.nav.home')} title={t(lang, 'fam.profile.title')} />
      <main className="fam-page">
        <section data-profile className="fam-card fam-rise flex items-center gap-4 bg-white p-5">
          <span aria-hidden="true" className="fam-avatar-ring flex h-16 w-16 shrink-0 items-center justify-center rounded-full p-[3px]">
            <span className="flex h-full w-full items-center justify-center rounded-full bg-midnight text-2xl font-black text-white">{child.firstName.slice(0, 1).toUpperCase()}</span>
          </span>
          <div className="min-w-0">
            <p className="truncate text-2xl font-extrabold tracking-tight text-slate">{child.firstName}</p>
            <p className="fam-pill mt-1 bg-off-white text-slate ring-1 ring-slate/15">{classText((k) => t(lang, k as MessageKey), child.classLevel)}</p>
          </div>
        </section>
        <section className="fam-card fam-section fam-rise bg-white" style={{ ['--d' as string]: '80ms' } as React.CSSProperties}>
          <LinkRow href="/family/notifications" icon="bell">
            {t(lang, 'fam.notify.center.title')}
          </LinkRow>
          <LinkRow href="/family/parent" icon="lock" data-parent-space="">
            {t(lang, 'fam.profile.parentSpace')}
          </LinkRow>
        </section>
      </main>
    </div>
  );
}
