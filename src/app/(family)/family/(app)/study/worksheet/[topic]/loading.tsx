import { Skeleton } from '@/components/family/ui/Skeleton';
import { familyLangBeforeSignIn } from '@/lib/family/server';
import { t } from '@/lib/i18n';

// D1-3: while this page is read on the server, a skeleton in its place, never a blank (docs/family-app/09 §6 rule 9).
// The words follow the language chosen on this phone (the page itself follows the child's or the parent's).
export default function Loading() {
  const lang = familyLangBeforeSignIn();
  return (
    <div lang={lang} className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 pt-6">
      <div className="h-24 rounded-3xl bg-slate/10" aria-hidden="true" />
      <Skeleton label={t(lang, 'fam.d13.loading.worksheet')} lines={4} />
      <Skeleton label={t(lang, 'fam.d13.loading.page')} lines={2} />
    </div>
  );
}
