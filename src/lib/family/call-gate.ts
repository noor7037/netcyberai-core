import { activeChild, isPrePrimary, listChildren, type FamilyChild } from './children';
import { consentState } from './consent';
import { familyModuleOn } from './flags';

// Who may call a tutor (W16-A4): exactly who may speak a question (M2-7, C281) — a child of Class 1 or above, with the
// parent's study_core AND voice_practice consents and the voice_input module on. The voice route's cheap refusals, the
// understand route's `call` flag and the speak route's call lines all ask this one function, so they refuse the same way
// with the same words. The day's speaking seconds are the voice route's own cap (family.voice_input_seconds_per_day).

type Db = Parameters<typeof listChildren>[0];

export type CallGate = { ok: true; child: FamilyChild; children: FamilyChild[]; language: 'en' | 'hi' } | { ok: false; status: number; error: 'not_found' | 'not_for_class' | 'consent_required' | 'off' };

export async function callGate(db: Db, accountId: string, chosen: string | undefined): Promise<CallGate> {
  const children = await listChildren(db, accountId);
  const child = activeChild(children, chosen);
  if (!child) return { ok: false, status: 404, error: 'not_found' };
  if (isPrePrimary(child.classLevel)) return { ok: false, status: 403, error: 'not_for_class' };
  const consents = await consentState(db, accountId);
  if (!consents.study_core || !consents.voice_practice) return { ok: false, status: 403, error: 'consent_required' };
  if (!(await familyModuleOn(db, 'voice_input', accountId))) return { ok: false, status: 403, error: 'off' };
  return { ok: true, child, children, language: child.language === 'hi' ? 'hi' : 'en' };
}
