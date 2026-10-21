import { FamilySignIn } from '@/components/family/FamilySignIn';
import { familyLangBeforeSignIn } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';
import { t, type MessageKey } from '@/lib/i18n';

// Sign in to the Family app by a code sent to the email (M1-2, C248).
const KEYS: MessageKey[] = [
  'fam.signIn.title', 'fam.signIn.lead', 'fam.signIn.email', 'fam.signIn.send', 'fam.signIn.sending', 'fam.signIn.codeSent', 'fam.signIn.code',
  'fam.signIn.verify', 'fam.signIn.keep', 'fam.signIn.rememberEmail', 'fam.signIn.otherEmail', 'fam.signIn.resend', 'fam.lang.label', 'fam.lang.en', 'fam.lang.hi',
  'fam.err.email', 'fam.err.rate_limited', 'fam.err.email_unavailable', 'fam.err.wrong', 'fam.err.locked', 'fam.err.expired', 'fam.err.none',
  'fam.err.start_again', 'fam.err.network',
];

export default function FamilySignInPage() {
  const lang = familyLangBeforeSignIn();
  return (
    <div lang={lang} className="mx-auto flex min-h-screen w-full max-w-md flex-col">
      <header className="bg-gradient-to-br from-royal-deep to-royal px-4 pb-10 pt-8 text-white">
        <p className="text-sm font-bold uppercase tracking-wide text-white/90">{t(lang, 'fam.app.name')}</p>
        <p className="mt-2 text-2xl font-extrabold">{t(lang, 'fam.signIn.tagline')}</p>
      </header>
      <main className="-mt-6 flex-1 rounded-t-3xl bg-off-white px-4 pb-10 pt-6">
        <FamilySignIn w={familyWords(lang, KEYS)} lang={lang} />
      </main>
    </div>
  );
}
