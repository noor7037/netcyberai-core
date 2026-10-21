import { familyLangBeforeSignIn } from '@/lib/family/server';
import { t } from '@/lib/i18n';

// No connection (M1-8, C254): the page a browser or the Android shell shows when the live Family app cannot load. It
// needs no session and keeps nothing on the phone. The shell carries its own copy (android-shell/www/offline.html).
export default function FamilyOfflinePage() {
  const lang = familyLangBeforeSignIn();
  return (
    <main lang={lang} className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-extrabold text-slate">{t(lang, 'fam.offline.title')}</h1>
      <p className="text-base text-slate">{t(lang, 'fam.offline.lead')}</p>
      <a href="/family" className="mt-2 flex min-h-[48px] items-center justify-center rounded-2xl bg-royal px-6 text-base font-bold text-white">
        {t(lang, 'fam.offline.retry')}
      </a>
    </main>
  );
}
