import Link from 'next/link';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { FamilyCountsView } from '@/components/control/apps/FamilyCountsView';
import { PlusOpenForm } from '@/components/control/apps/PlusOpenForm';
import { VoiceAllowanceForm } from '@/components/control/apps/VoiceAllowanceForm';
import { SubjectListForm } from '@/components/control/apps/SubjectListForm';
import { readPlusOpen, readSubjectList, readVoiceAllowance } from '@/lib/control/family-settings';
import { SUBJECT_IDS } from '@/lib/contracts/subjects';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { loadFamilyCounts } from '@/lib/control/family-counts';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { pickWords } from '@/lib/i18n/pick';
import { WordsProvider } from '@/components/app-shell/Words';

// Control → Family (docs/family-app/10 §9, M1-7): counts of the Family app, read only. They come from
// family.control_counts(), the only door Control has to family data; no name, child, answer or email is read. Below
// them, the two lists of subjects Control holds: open to every child (C298), and checked explanations only (C300);
// whether Family Plus is open to every family for a pilot (C337); and the daily voice allowance per family (C388). A
// link leads to the people who use the app (C230-V, /control/family/people).

export const dynamic = 'force-dynamic';

export default async function ControlFamilyPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  // One transaction as the signed-in founder (the layout has already refused anyone else).
  const data = session
    ? await withTenantContext(session, async (db) => ({ counts: await loadFamilyCounts(db), lists: { open: await readSubjectList(db, 'open'), reviewed: await readSubjectList(db, 'reviewed_only'), plusOpen: await readPlusOpen(db), voiceChars: await readVoiceAllowance(db) } }))
    : null;
  const counts = data?.counts ?? null;
  const lists = data?.lists ?? null;
  return (
    <ModulePage title={t(lang, 'control.family.title')} purpose={t(lang, 'control.family.purpose')} about={t(lang, 'control.family.about')} icon="users" tone="turquoise" eyebrow={t(lang, 'group.control')} headerLang={lang}>
      <p className="mb-4">
        <Link href="/control/family/people" data-people-link className="inline-flex min-h-[44px] items-center font-semibold text-royal underline">
          {t(lang, 'control.family.peopleLink')}
        </Link>
      </p>
      {counts && <FamilyCountsView counts={counts} lang={lang} />}
      {lists && (
        // The forms' words, picked here (C401): the page never carries the whole message table.
        <WordsProvider words={pickWords(lang, [], ['control.family.', 'fam.subject.'])}>
        <div className="mt-6 flex flex-col gap-6">
          <SubjectListForm list="open_subjects" subjects={SUBJECT_IDS} initial={lists.open} />
          <SubjectListForm list="reviewed_only" subjects={SUBJECT_IDS} initial={lists.reviewed} />
          <PlusOpenForm initial={lists.plusOpen} />
          <VoiceAllowanceForm initial={lists.voiceChars} />
        </div>
        </WordsProvider>
      )}
    </ModulePage>
  );
}
