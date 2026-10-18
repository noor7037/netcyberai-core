'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/components/app-shell/LangContext';
import { Skeleton } from '@/components/app-ui/States';
import { Icon } from '@/components/visual/Icons';
import type { ChecklistItem } from '@/lib/setup/checklist';
import { ChecklistView } from './ChecklistView';

// The Setup page (docs/28 slice 10g, C244): the onboarding checklist read from the school's own records when the page
// opens (never from a copy kept by the browser, so coming back from a screen shows what that screen did), and the two
// lists the office keeps here, sessions and subjects.

const LINK = 'flex min-h-[56px] items-center gap-3 rounded-2xl border border-slate/10 bg-white p-4 shadow-sm hover:bg-off-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal';

export function SetupChecklist() {
  const { t, lang } = useT();
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await fetch('/api/app/setup/checklist', { cache: 'no-store' }).catch(() => null);
      const body = res?.ok ? ((await res.json().catch(() => null)) as { items?: ChecklistItem[] } | null) : null;
      if (!alive) return;
      if (body?.items) setItems(body.items);
      else setFailed(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div lang={lang} className="flex flex-col gap-4">
      {items ? (
        <ChecklistView items={items} lang={lang} />
      ) : failed ? (
        <p role="alert" data-setup-checklist="failed" className="max-w-3xl rounded-2xl border border-slate/10 bg-white p-4 text-sm text-slate">
          {t('setup.check.failed')}
        </p>
      ) : (
        <Skeleton lines={5} className="max-w-3xl rounded-2xl border border-slate/10 bg-white p-4" />
      )}

      <section aria-labelledby="setup-keep" className="flex max-w-3xl flex-col gap-2">
        <h2 id="setup-keep" className="text-base font-bold text-slate">
          {t('setup.home.keep')}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              { href: '/app/setup/sessions', title: 'setup.home.sessions', hint: 'setup.home.sessions.hint', link: 'sessions' },
              { href: '/app/setup/subjects', title: 'setup.home.subjects', hint: 'setup.home.subjects.hint', link: 'subjects' },
            ] as const
          ).map((l) => (
            <Link key={l.href} href={l.href} data-setup-link={l.link} className={LINK}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate md:text-base">{t(l.title)}</span>
                <span className="block text-sm text-slate/70">{t(l.hint)}</span>
              </span>
              <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-slate/70" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
