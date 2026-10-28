import { redirect } from 'next/navigation';
import { ConsentStep } from '@/components/family/FirstSteps';
import { firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';
import type { MessageKey } from '@/lib/i18n';

// The parent's first step (M1-2, C248): what is kept and why, and an explicit tap to agree (study_core). Nothing is
// processed before it.
const KEYS: MessageKey[] = [
  'fam.app.name',
  'fam.consent.title', 'fam.consent.lead', 'fam.consent.item.child', 'fam.consent.item.answers', 'fam.consent.item.ai', 'fam.consent.item.never',
  'fam.consent.item.control', 'fam.consent.agree', 'fam.consent.notNow', 'fam.err.network', 'fam.err.not_signed_in', 'fam.err.parent_pin_required',
];

export default async function FamilyWelcomePage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next !== '/family/welcome') redirect(next ?? '/family');
  return (
    <div lang={page.parentLang}>
      <ConsentStep w={familyWords(page.parentLang, KEYS)} />
    </div>
  );
}
