'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '@/components/visual/Icons';
import { ModuleIcon } from '@/components/app-ui/ModuleIcon';
import { TOKEN_TONES } from '@/components/app-ui/tones';
import type { ColorToken } from '@/lib/contracts/modules';
import type { NavBadge } from '@/lib/contracts/navigation';
import type { QuickAddItem } from '@/lib/contracts/quick-add';
import { t as translate, type Lang } from '@/lib/i18n';
import { GlobalSearch } from './GlobalSearch';
import { QuickAdd } from './QuickAdd';
import { LangProvider, useT } from './LangContext';
import { LanguageSwitch } from './LanguageSwitch';
import { activeHref, type ShellGroup, type ShellItem } from './shell-nav';

// The app shell (17 §2, §4; C121): on wide screens a sidebar of
// collapsible groups, each marked in its group's colour; on phones a top
// bar whose menu opens the same groups as a drawer, plus, for the teacher
// shell, a bottom bar with the day-to-day modules. The page's group opens
// by itself. Unbuilt modules say "Soon"; badges are server numbers only.
// Above every page sits one bar (C134, C135): search, "+ New" and the
// language switch. Every
// word of the shell comes from the message files. The shell's own parts
// carry `lang`; the page inside does not, because a screen that has not
// been moved to the message files yet is still in English and a screen
// reader must read it as English.

function Badge({ badge }: { badge: NavBadge }) {
  const { t } = useT();
  const text = badge.kind === 'new' ? t('shell.badge.new') : badge.kind === 'percent' ? `${badge.value}%` : String(badge.value);
  return <span className="ml-auto rounded-full bg-white px-2 text-xs font-bold text-midnight">{text}</span>;
}

function ItemLink({ item, active, tone, onNavigate }: { item: ShellItem; active: boolean; tone: ColorToken; onNavigate?: () => void }) {
  const { t } = useT();
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={`flex min-h-[48px] items-center gap-3 rounded-lg px-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${active ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
    >
      {item.icon && <ModuleIcon name={item.icon} tone={item.tone ?? tone} size="sm" variant="solid" className={active ? 'ring-2 ring-white' : ''} />}
      <span className="min-w-0 flex-1 truncate" title={item.label}>
        {item.label}
      </span>
      {item.badge && <Badge badge={item.badge} />}
      {item.comingIn && (
        <span className="rounded-full border border-white/30 bg-midnight px-2 text-xs text-white">
          {t('shell.soon')}
          <span className="sr-only">{t('shell.soon.phase', { phase: item.comingIn })}</span>
        </span>
      )}
    </Link>
  );
}

function Groups({ groups, active, onNavigate }: { groups: readonly ShellGroup[]; active: string | null; onNavigate?: () => void }) {
  const current = groups.find((g) => g.items.some((i) => i.href === active))?.id;
  const [open, setOpen] = useState<Set<string>>(() => new Set(current ? [current] : groups.slice(0, 1).map((g) => g.id)));
  useEffect(() => {
    if (current) setOpen((o) => new Set([...o, current]));
  }, [current]);
  const toggle = (id: string) => setOpen((o) => (o.has(id) ? new Set([...o].filter((x) => x !== id)) : new Set([...o, id])));
  return (
    <div className="flex flex-col gap-1">
      {groups.map((g) => {
        const isOpen = open.has(g.id) || groups.length === 1;
        const listId = `nav-${g.id}`;
        return (
          <div key={g.id}>
            {groups.length > 1 && (
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={listId}
                onClick={() => toggle(g.id)}
                className="flex min-h-[44px] w-full items-center gap-2 rounded-md bg-midnight px-3 text-left text-xs font-bold uppercase tracking-wider text-white/80 hover:text-white"
              >
                <span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded ring-1 ring-white/50 ${TOKEN_TONES[g.tone[0]].bar}`} />
                <span className="flex-1">{g.label}</span>
                <span aria-hidden="true" className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                  ›
                </span>
              </button>
            )}
            {isOpen && (
              <ul id={listId} className="mb-1 flex flex-col gap-0.5 pl-2">
                {g.items.map((i) => (
                  <li key={i.href}>
                    <ItemLink item={i} active={i.href === active} tone={g.tone[0]} onNavigate={onNavigate} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Footer({ accountHref }: { accountHref: string }) {
  const router = useRouter();
  const { t } = useT();
  const link = 'flex min-h-[44px] w-full items-center rounded-md bg-midnight px-3 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white';
  return (
    <div className="flex flex-col gap-0.5 border-t border-white/10 p-3">
      <Link href={accountHref} className={link}>
        {t('shell.account')}
      </Link>
      <button
        type="button"
        className={link}
        onClick={async () => {
          await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
          router.push('/login');
          router.refresh();
        }}
      >
        {t('shell.signOut')}
      </button>
    </div>
  );
}

export function AppShell({
  groups,
  bottomItems,
  brand,
  roleLabel,
  navLabel,
  accountHref,
  action,
  lang = 'en',
  langKnown = true,
  scope = 'school',
  quickAdd = [],
  children,
}: {
  groups: readonly ShellGroup[];
  bottomItems?: readonly ShellItem[];
  brand: string;
  roleLabel: string;
  navLabel: string;
  accountHref: string;
  // A persistent action beside the menu (the teacher's QR scan, PRD §7.3).
  action?: ReactNode;
  lang?: Lang;
  // False when this browser has no language cookie for this person yet.
  langKnown?: boolean;
  // Which search this shell has: the school's, or Control's.
  scope?: 'school' | 'control';
  quickAdd?: readonly QuickAddItem[];
  children: ReactNode;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key);
  const pathname = usePathname() ?? '';
  const active = activeHref(groups, pathname);
  const [drawer, setDrawer] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const drawerId = useId();

  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawer(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLElement>('a[href],button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer]);

  const head = (
    <div className="bg-midnight px-4 py-4">
      <p className="truncate text-base font-extrabold text-white">{brand}</p>
      <p className="text-xs text-white/75">{roleLabel}</p>
    </div>
  );

  return (
    <LangProvider lang={lang}>
      <div className="min-h-screen bg-off-white">
      <aside lang={lang} className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-midnight md:flex">
        <span aria-hidden="true" className="nca-spectrum-bar block h-1" />
        {head}
        {action && (
          <div lang="en" className="px-3 pb-2">
            {action}
          </div>
        )}
        <nav aria-label={navLabel} className="flex-1 overflow-y-auto px-2 pb-2">
          <Groups groups={groups} active={active} />
        </nav>
        <Footer accountHref={accountHref} />
      </aside>

      <header lang={lang} className="sticky top-0 z-30 flex h-14 items-center justify-between bg-midnight px-4 md:hidden">
        <p className="truncate text-base font-extrabold text-white">{brand}</p>
        <div className="flex items-center gap-1">
          {action && <span lang="en">{action}</span>}
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={drawer}
            aria-controls={drawerId}
            aria-label={t(drawer ? 'shell.menu.close' : 'shell.menu.open')}
            onClick={() => setDrawer((d) => !d)}
            className="flex h-11 w-11 items-center justify-center rounded-md bg-midnight text-white hover:bg-white/10"
          >
            <span aria-hidden="true" className="text-2xl leading-none">
              {drawer ? '×' : '☰'}
            </span>
          </button>
        </div>
      </header>

      {drawer && (
        <div id={drawerId} ref={panelRef} lang={lang} role="dialog" aria-modal="true" aria-label={navLabel} className="fixed inset-0 z-40 flex flex-col bg-midnight md:hidden">
          <div className="flex items-center justify-between pr-2">
            {head}
            <button type="button" onClick={() => setDrawer(false)} aria-label={t('shell.menu.close')} className="flex h-11 w-11 items-center justify-center rounded-md bg-midnight text-2xl text-white">
              ×
            </button>
          </div>
          <nav aria-label={navLabel} className="flex-1 overflow-y-auto px-2 pb-2">
            <Groups groups={groups} active={active} onNavigate={() => setDrawer(false)} />
          </nav>
          <Footer accountHref={accountHref} />
        </div>
      )}

      <main className={`md:pl-64 ${bottomItems?.length ? 'pb-20 md:pb-0' : ''}`}>
        <div lang={lang} data-shell-lang={lang} role="region" aria-label={t('shell.tools')} className="z-20 flex flex-wrap items-center gap-2 border-b border-slate/10 bg-white px-4 py-2 md:sticky md:top-0 md:px-6 print:hidden">
          <GlobalSearch scope={scope} />
          <QuickAdd items={quickAdd} />
          <div className="ml-auto">
            <LanguageSwitch known={langKnown} />
          </div>
        </div>
        {children}
      </main>

      {bottomItems && bottomItems.length > 0 && (
        <nav lang={lang} aria-label={t('shell.nav.quick')} className="fixed inset-x-0 bottom-0 z-30 grid border-t border-white/10 bg-midnight md:hidden" style={{ gridTemplateColumns: `repeat(${bottomItems.length + 1}, minmax(0, 1fr))` }}>
          {bottomItems.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={i.href === active ? 'page' : undefined}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 bg-midnight text-xs font-semibold ${i.href === active ? 'text-white' : 'text-white/75'}`}
            >
              {i.icon && <Icon name={i.icon} className="h-5 w-5" aria-hidden="true" />}
              <span className="max-w-full truncate px-1">{i.label}</span>
            </Link>
          ))}
          <button type="button" onClick={() => setDrawer(true)} aria-expanded={drawer} className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 bg-midnight text-xs font-semibold text-white/75">
            <span aria-hidden="true" className="text-lg leading-none">
              ☰
            </span>
            {t('shell.menu.more')}
          </button>
        </nav>
      )}
      </div>
    </LangProvider>
  );
}
