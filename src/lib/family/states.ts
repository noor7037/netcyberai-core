import { INDIAN_STATES } from '@/lib/contracts/indian-states';
import { tOr, type Lang } from '@/lib/i18n';

// The state list for "add a child", in the parent's language (Hindi names are the messages fam.state.<code>), sorted
// as the parent reads it. No state is chosen by default.
export function familyStates(lang: Lang): { code: string; name: string }[] {
  const named = INDIAN_STATES.map((s) => ({ code: s.code, name: lang === 'hi' ? tOr('hi', `fam.state.${s.code}`, s.name) : s.name }));
  return named.sort((a, b) => a.name.localeCompare(b.name, lang === 'hi' ? 'hi-IN' : 'en-IN'));
}
