import { FamIcon } from '@/components/family/FamIcon';
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
// F2 on D1 (C230-Q): the message on a D1 card with a drawn mark, and "Try again" as D1's call to action.
export default function FamilyOfflinePage() {
  const lang = familyLangBeforeSignIn();
  return (
    <main lang={lang} className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-4 px-4 py-8">
      <section className="fam-card fam-rise flex w-full flex-col items-center gap-3 bg-white p-6 text-center">
        <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-3xl bg-ink text-white shadow-lg">
          <FamIcon name="offline" className="h-8 w-8" />
        </span>
        <h1 className="bg-white text-2xl font-extrabold text-slate">{t(lang, 'fam.offline.title')}</h1>
        <p className="bg-white text-base text-slate">{t(lang, 'fam.offline.lead')}</p>
        <a href="/family" className="fam-cta fam-press mt-1 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-saffron px-6 text-base font-extrabold text-ink sm:w-auto">
          <FamIcon name="again" className="h-5 w-5" />
          {t(lang, 'fam.offline.retry')}
        </a>
      </section>
      <OfflineShelf w={familyWords(lang, [...UNDERSTAND_KEYS, ...OFFLINE_KEYS])} lang={lang} />
    </main>
  );
}
