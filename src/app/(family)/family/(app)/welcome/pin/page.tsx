import { redirect } from 'next/navigation';
import { PinSetup } from '@/components/family/FirstSteps';
import { firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';
import type { MessageKey } from '@/lib/i18n';

// The parent PIN, set at sign-up (docs/34 §9.1 rule 1; M1-2, C248).
const KEYS: MessageKey[] = [
  'fam.app.name',
  'fam.pin.setTitle', 'fam.pin.setLead', 'fam.pin.new', 'fam.pin.again', 'fam.pin.save', 'fam.pin.mismatch', 'fam.pin.enter',
  'fam.err.format', 'fam.err.too_simple', 'fam.err.consent_required', 'fam.err.pin_exists', 'fam.err.network', 'fam.err.not_signed_in',
];

export default async function FamilyPinSetupPage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next !== '/family/welcome/pin') redirect(next ?? '/family');
  return (
    <div lang={page.parentLang}>
      <PinSetup w={familyWords(page.parentLang, KEYS)} />
    </div>
  );
}
