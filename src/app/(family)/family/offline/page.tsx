import { OfflineShelf } from '@/components/family/offline/OfflineShelf';
import { familyLangBeforeSignIn } from '@/lib/family/server';
import { OFFLINE_KEYS } from '@/lib/family/offline-words';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';
import { familyWords } from '@/lib/family/words';
import { t } from '@/lib/i18n';

// No connection (M1-8, C254): the page a browser or the Android shell shows when the live Family app cannot load. It
// needs no session and its HTML holds nothing personal. The shell carries its own copy (android-shell/www/offline.html).
// M2-9 (C283): it is also the app's offline shell. The service worker keeps it and answers any /family page with it when
// there is no network; the chapters saved on the phone open here from the phone's own store (OfflineShelf).
export default function FamilyOfflinePage() {
  const lang = familyLangBeforeSignIn();
  return (
    <main lang={lang} className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <h1 className="text-2xl font-extrabold text-slate">{t(lang, 'fam.offline.title')}</h1>
      <p className="text-base text-slate">{t(lang, 'fam.offline.lead')}</p>
      <a href="/family" className="mt-2 flex min-h-[48px] items-center justify-center rounded-2xl bg-royal px-6 text-base font-bold text-white">
        {t(lang, 'fam.offline.retry')}
      </a>
      <OfflineShelf w={familyWords(lang, [...UNDERSTAND_KEYS, ...OFFLINE_KEYS])} lang={lang} />
    </main>
  );
}
