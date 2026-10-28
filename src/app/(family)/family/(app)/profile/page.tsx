import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SubPageHeader } from '@/components/family/SubPageHeader';
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
      <main className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-24">
        <section data-profile className="fam-card flex items-center gap-4 bg-white p-4">
          <span aria-hidden="true" className="fam-avatar-ring flex h-16 w-16 shrink-0 items-center justify-center rounded-full p-[3px]">
            <span className="flex h-full w-full items-center justify-center rounded-full bg-midnight text-2xl font-black text-white">{child.firstName.slice(0, 1).toUpperCase()}</span>
          </span>
          <div className="min-w-0">
            <p className="truncate text-xl font-extrabold text-slate">{child.firstName}</p>
            <p className="text-sm font-semibold text-slate">{classText((k) => t(lang, k as MessageKey), child.classLevel)}</p>
          </div>
        </section>
        <section className="fam-card flex flex-col gap-2 bg-white p-4">
          <Link href="/family/parent" data-parent-space className="fam-press flex min-h-[48px] items-center gap-3 rounded-2xl bg-off-white px-3 text-base font-bold text-royal-deep">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            {t(lang, 'fam.profile.parentSpace')}
          </Link>
          <p className="text-sm text-slate">{t(lang, 'fam.profile.parentLead')}</p>
        </section>
      </main>
    </div>
  );
}
