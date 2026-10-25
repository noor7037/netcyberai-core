import { LinkPhoneForm } from '@/components/family/LinkPhoneForm';
import { familyLangBeforeSignIn } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';
import { t } from '@/lib/i18n';

// A child's own phone, linked with the parent's one-time code (M2b-2, C342; docs/34 §9.4). No session yet.
export default function FamilyLinkPage() {
  const lang = familyLangBeforeSignIn();
  return (
    <div lang={lang} className="mx-auto flex min-h-screen w-full max-w-md flex-col">
      <header className="bg-gradient-to-br from-royal-deep to-royal px-4 pb-10 pt-8 text-white">
        <p className="text-sm font-bold uppercase tracking-wide text-white/90">{t(lang, 'fam.app.name')}</p>
      </header>
      <main className="-mt-6 flex-1 rounded-t-3xl bg-off-white px-4 pb-10 pt-6">
        <LinkPhoneForm w={familyWords(lang, ['fam.link.title', 'fam.link.lead', 'fam.link.code', 'fam.link.go', 'fam.link.wrong', 'fam.link.tooMany'])} />
      </main>
    </div>
  );
}
