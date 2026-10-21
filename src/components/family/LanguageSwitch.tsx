'use client';

import { useRouter } from 'next/navigation';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import type { Lang } from '@/lib/i18n';
import type { Words } from '@/lib/family/fill';
import { familyApi } from './client';

// English or Hindi, each named in its own language. Saved on the account when signed in, and on this phone always.
export function LanguageSwitch({ lang, w }: { lang: Lang; w: Words }) {
  const router = useRouter();
  return (
    <SegmentedControl
      id="fam-lang"
      label={w['fam.lang.label']}
      hideLabel
      value={lang}
      options={[
        { value: 'en', label: w['fam.lang.en'] },
        { value: 'hi', label: w['fam.lang.hi'] },
      ]}
      onChange={async (next) => {
        await familyApi('/api/family/language', 'POST', { lang: next });
        router.refresh();
      }}
    />
  );
}
