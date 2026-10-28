'use client';

import Link from 'next/link';
import { Icon } from '@/components/visual/Icons';
import { useWords } from './Words';

// "Show me how" (docs/19 rule 8, C138): one link in every screen's header to
// the Help Center guide for that screen's task, in the person's language.
// scripts/check_show_me_how.py fails a module page without one, and checks
// that the guide exists; this component stays small (it does not load the
// guides) because every screen carries it.
export function ShowMeHow({ slug }: { slug: string }) {
  const { lang, t } = useWords();
  if (!/^[a-z][a-z0-9-]+$/.test(slug)) return null;
  return (
    <Link
      lang={lang}
      href={`/app/help/${slug}${lang === 'hi' ? '?lang=hi' : ''}`}
      data-show-me-how={slug}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-sapphire underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal print:hidden"
    >
      <Icon name="support" className="h-4 w-4" aria-hidden="true" />
      {t('help.showMeHow')}
    </Link>
  );
}
