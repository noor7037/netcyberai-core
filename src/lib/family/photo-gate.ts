import { isPrePrimary, type FamilyChild } from './children';
import { consentState } from './consent';
import { familyModuleOn } from './flags';

// One capability, one set of rules (C230-AS; Decision Log C389). A photo a child sends to the AI, whether to the
// homework helper or attached to a tutor question, needs all of: a child in Class 1 or above, the parent's yes to
// learning and to photos (03 §11), and the homework helper's switch on. Read at every step that could send a photo,
// since a consent may be withdrawn or the switch turned off between steps.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export type PhotoRefusal = 'not_for_class' | 'consent_required' | 'photo_consent' | 'off';

export async function photoGate(db: Db, accountId: string, child: Pick<FamilyChild, 'classLevel'>): Promise<PhotoRefusal | null> {
  if (isPrePrimary(child.classLevel)) return 'not_for_class';
  const consents = await consentState(db as never, accountId);
  if (!consents.study_core) return 'consent_required';
  if (!consents.photo_input) return 'photo_consent';
  if (!(await familyModuleOn(db as never, 'homework', accountId))) return 'off';
  return null;
}
