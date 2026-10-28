import { redirect } from 'next/navigation';
import { LivePractice } from '@/components/family/english/LivePractice';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { liveView } from '@/lib/family/english/live';
import { LIVE_KEYS } from '@/lib/family/english/words';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { VOICE_KEYS } from '@/lib/family/voice-words';
import { familyWords } from '@/lib/family/words';
import { readFamilySwitches, switchOn } from '@/lib/family/flags';
import { t } from '@/lib/i18n';

// Live practice beside the English course (E1, C382): the live spoken-English tutor. Control's switch for the course
// hides it, as it hides the course; the parent's consents, the child's class and what is set up are checked by the
// live API, and the screen says plainly what is missing.
export default async function FamilyEnglishLivePage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const lang = page.childLang;
  const switches = await familyPageRead(page, (db) => readFamilySwitches(db, page.session.accountId));
  if (!switches || !switchOn(switches, 'english_programme') || !switchOn(switches, 'voice_input')) redirect('/family/english');
  const r = await familyPageRead(page, (db) => liveView(db, page.session.accountId, page.child?.childId)).catch(() => ({ ok: false as const, status: 503, error: 'failed' }));
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family/english" backLabel={t(lang, 'fam.english.title')} kicker={t(lang, 'fam.english.live.kicker')} title={t(lang, 'fam.english.live.title')} />
      <main className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-24">
        <LivePractice w={familyWords(lang, [...LIVE_KEYS, ...VOICE_KEYS, 'fam.english.consentButton'])} initial={r.ok ? { state: r.view } : { error: r.error }} />
      </main>
    </div>
  );
}
