import { redirect } from 'next/navigation';
import { listFamilyBoards } from '@/lib/family/children';
import { familyPageRead } from '@/lib/family/server';
import { FirstChildStep } from '@/components/family/FirstSteps';
import { CHILD_FORM_KEYS } from '@/lib/family/child-words';
import { firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyStates } from '@/lib/family/states';
import { familyWords } from '@/lib/family/words';

// Add the first child (M1-2, C248): first name, class 6–10, CBSE, language, explanation style and state, in under a
// minute. Parent mode is open here: the PIN was set on the step before.
export default async function FamilyFirstChildPage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next !== '/family/welcome/child') redirect(next ?? '/family');
  if (!page.parentMode) redirect('/family/parent');
  const lang = page.parentLang;
  // S4: the boards come from the database (content.boards), not a list in the page.
  const boards = await familyPageRead(page, (db) => listFamilyBoards(db, lang));
  return (
    <main lang={lang} className="mx-auto w-full max-w-md px-4 py-8">
      <FirstChildStep w={familyWords(lang, ['fam.child.addTitle', 'fam.child.addLead', ...CHILD_FORM_KEYS])} states={familyStates(lang)} boards={boards} lang={lang} />
    </main>
  );
}
