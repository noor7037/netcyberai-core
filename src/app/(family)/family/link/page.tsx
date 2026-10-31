import { LinkPhoneForm } from '@/components/family/LinkPhoneForm';
import { familyLangBeforeSignIn } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';
import { t } from '@/lib/i18n';

// A child's own phone asks for a code to show the parent (M2b-2; reversed by C230-AF, C346; docs/34 §9.4). No session yet.
export default function FamilyLinkPage() {
  const lang = familyLangBeforeSignIn();
  return (
    <div lang={lang} className="mx-auto flex min-h-screen w-full max-w-md flex-col">
      <header className="bg-paper px-4 pb-10 pt-8 text-ink">
        <p className="text-sm font-bold uppercase tracking-wide text-saffron-deep">{t(lang, 'fam.app.name')}</p>
      </header>
      <main className="-mt-6 flex-1 rounded-t-3xl bg-off-white px-4 pb-10 pt-6">
        <LinkPhoneForm lang={lang} w={familyWords(lang, ['fam.link.title', 'fam.link.lead', 'fam.link.code', 'fam.link.go', 'fam.link.wait', 'fam.link.gone', 'fam.link.off', 'fam.link.tooMany'])} />
      </main>
    </div>
  );
}
