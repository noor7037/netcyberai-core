import { redirect } from 'next/navigation';
import { familyModuleOn } from '@/lib/family/flags';
import { familyPageRead, firstStepsNext, requireFamilyPage, type FamilyPage } from '@/lib/family/server';

// Same door as the other Future hubs: a signed-in family, first steps done, careers module on.
export async function openCareer(): Promise<FamilyPage> {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const on = await familyPageRead(page, (db) => familyModuleOn(db, 'careers', page.session.accountId));
  if (!on) redirect('/family/future');
  if (!page.child) redirect('/family/welcome/child');
  return page;
}
