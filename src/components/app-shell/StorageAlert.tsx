import { SERVICE_ROLE_SETTING_NAME } from '@/lib/auth/env';
import { t, type Lang } from '@/lib/i18n';
import type { StorageHealth } from '@/lib/observability/storage-health';

// The red line at the top of every page while file storage does not work (C236): in Control for the founder, and in
// the school app for the principal and the school admin only. It names the setting and what is wrong with it, never
// its value. Uploads and login invites fail until it is fixed, so it is not dismissable. Not counted as the screen's
// own words (the word count skips [data-shell-alert]): it is the shell's, the same on every page.

// Who in a school sees it: the office that would try an upload or an invite and needs to know why it fails.
export const showsStorageAlert = (role: string) => role === 'principal' || role === 'school_admin';

export function StorageAlert({ state, scope, lang }: { state: Exclude<StorageHealth, 'ok'>; scope: 'control' | 'school'; lang: Lang }) {
  const reason = t(lang, `shell.storage.reason.${state}`);
  return (
    <p role="alert" lang={lang} data-shell-alert="storage" data-storage-state={state} className="bg-coral-deep px-4 py-2 text-sm font-semibold text-white">
      {t(lang, scope === 'control' ? 'shell.storage.control' : 'shell.storage.school', { setting: SERVICE_ROLE_SETTING_NAME, reason })}
    </p>
  );
}
