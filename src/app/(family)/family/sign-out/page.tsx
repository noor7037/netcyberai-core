import { FamilySignOutNow } from '@/components/family/FamilySignOutNow';
import { familyLangBeforeSignIn } from '@/lib/family/server';
import { t } from '@/lib/i18n';

// Signs the family out of this phone and lands on the sign-in page (W14-D). An address people type or follow from an
// old link; the work is the existing /api/family/auth/sign-out.
export default function FamilySignOutPage() {
  const lang = familyLangBeforeSignIn();
  return (
    <div lang={lang} className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pt-10 text-ink">
      <FamilySignOutNow ask={t(lang, 'fam.signOut.ask')} confirm={t(lang, 'fam.signOut.confirm')} stay={t(lang, 'fam.signOut.stay')} working={t(lang, 'fam.signOut.working')} />
    </div>
  );
}
