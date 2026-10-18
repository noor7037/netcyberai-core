import { ChecklistView } from '@/components/setup/ChecklistView';
import { t, type Lang } from '@/lib/i18n';
import type { ChecklistItem } from '@/lib/setup/checklist';

// A school's onboarding checklist for the founder, on the Overview tab of the school's page in Control (docs/28 slice
// 10g, C244). The same list the school's principal sees on Setup, counted by the same function from that school's own
// records; here it is read, not worked through (the steps are the school's to do), so no step is a link. `items` is
// null when the school's records could not be counted: the page says so and goes on.
export function SchoolChecklistPanel({ items, lang }: { items: readonly ChecklistItem[] | null; lang: Lang }) {
  if (!items)
    return (
      <p lang={lang} role="status" data-school-checklist="failed" className="max-w-3xl rounded-2xl border border-slate/10 bg-white p-4 text-sm text-slate">
        {t(lang, 'setup.control.failed')}
      </p>
    );
  return (
    <div lang={lang} data-school-checklist className="flex flex-col gap-2">
      <ChecklistView items={items} lang={lang} linked={false} titleKey="setup.control.title" />
      <p className="max-w-3xl px-1 text-sm text-slate/70">{t(lang, 'setup.control.note')}</p>
    </div>
  );
}
