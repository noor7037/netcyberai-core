import { redirect } from 'next/navigation';
import { LanguageSwitch } from '@/components/family/LanguageSwitch';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { Mascot } from '@/components/family/mascot/Mascot';
import { SettingsForm } from '@/components/family/settings/SettingsForm';
import { loadChildSettings } from '@/lib/family/child-settings';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';
import { t, type MessageKey } from '@/lib/i18n';

// W19-C: the child's own Settings, behind nothing but the family session (parent-only things stay in the parent area,
// behind the PIN): read aloud, the tutor's face, movement, hands-free listening, the voice speed, and the language
// (the existing switch). Saved per child on the server (family.child_settings); the other screens read them with
// readChildSettings() from src/lib/family/child-settings.ts.
const KEYS: MessageKey[] = [
  'fam.w19.settings.voiceTitle', 'fam.w19.settings.lookTitle',
  'fam.w19.settings.readAloud', 'fam.w19.settings.readAloudNote', 'fam.w19.settings.tutorFace', 'fam.w19.settings.tutorFaceNote',
  'fam.w19.settings.motion', 'fam.w19.settings.motionNote', 'fam.w19.settings.handsFree', 'fam.w19.settings.handsFreeNote',
  'fam.w19.settings.speed', 'fam.w19.settings.slow', 'fam.w19.settings.normal', 'fam.w19.settings.saved',
  'fam.err.network', 'fam.err.not_signed_in', 'fam.lang.label', 'fam.lang.en', 'fam.lang.hi',
];

export default async function FamilySettingsPage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  const lang = page.childLang;
  const settings = await familyPageRead(page, (db) => loadChildSettings(db, page.session.accountId, child.childId));
  const w = familyWords(lang, KEYS);
  return (
    <div lang={lang} data-family-settings data-fam-motion={settings.motion ? undefined : 'off'} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family/profile" backLabel={t(lang, 'fam.profile.title')} title={t(lang, 'fam.w19.settings.title')} />
      <main className="fam-page">
        <section className="fam-activity fam-rise flex items-center gap-3 rounded-2xl bg-lesson-lilac p-4">
          <Mascot id="settings" className="h-20 w-24 shrink-0" />
          <p className="text-base font-semibold text-ink">{t(lang, 'fam.w19.settings.lead')}</p>
        </section>
        <SettingsForm initial={settings} w={w} />
        <section aria-labelledby="fam-set-lang" className="fam-card fam-section fam-rise bg-white" style={{ ['--d' as string]: '120ms' } as React.CSSProperties}>
          <h2 id="fam-set-lang" className="fam-h2 text-ink">
            {t(lang, 'fam.lang.label')}
          </h2>
          <LanguageSwitch lang={lang} w={w} />
        </section>
      </main>
    </div>
  );
}
