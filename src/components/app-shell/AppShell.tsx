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
import { t as translate, type Lang, type MessageKey } from '@/lib/i18n';
import { brandInitials } from '@/lib/school/logo-file';
import { GlobalSearch } from './GlobalSearch';
import { QuickAdd } from './QuickAdd';
import type { TourId } from '@/lib/contracts/tours';
import { LangProvider, useT } from './LangContext';
import { ToursProvider } from './ToursContext';
import { LanguageSwitch } from './LanguageSwitch';
import { OfflineProvider, useOffline } from './OfflineContext';
import { SchoolLogo } from './SchoolLogo';
import { SyncLine } from './SyncLine';
import { activeHref, type ShellGroup, type ShellItem } from './shell-nav';

type Values = Record<string, string>;

// The app shell (17 §2, §4; C121). One branded bar sits at the top of every
// screen, on wide screens and on phones (C235-B): the school's logo (or its
// initials) and its name, and the signed-in person's name and role. On wide
// screens the bar also holds search, "+ New" and the language switch (C134,
// C135), and a sidebar below it holds the menu; on phones the bar is compact
// (logo, the name cut short, the person's name and role on a second line),
// its menu opens the same menu as a drawer, the tools sit just below it, and
// the teacher shell keeps its bottom bar of day-to-day modules.
// The school app's menu reads like a school app's (C235-B): the Home items,
// then "Frequent work", then "All modules", each module under its group, the
// page's group open. Control passes one group and no Home or Frequent work.
// Unbuilt modules say "Soon"; badges are server numbers only. Every word of
// the shell comes from the message files. The shell's own parts carry `lang`;
// the page inside does not, because a screen that has not been moved to the
// message files yet is still in English and a screen reader must read it as
// English.

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

// `openFirst`: with no group holding the page, the first group starts open (Control's single group, the old menu).
function Groups({ groups, active, onNavigate, openFirst = true }: { groups: readonly ShellGroup[]; active: string | null; onNavigate?: () => void; openFirst?: boolean }) {
  const current = groups.find((g) => g.items.some((i) => i.href === active))?.id;
  const [open, setOpen] = useState<Set<string>>(() => new Set(current ? [current] : openFirst ? groups.slice(0, 1).map((g) => g.id) : []));
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
          <div key={g.id} data-nav-group={g.id}>
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
                <span aria-hidden="true" className={`motion-safe:transition-transform ${isOpen ? 'rotate-90' : ''}`}>
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

// A labelled part of the menu: Frequent work, All modules.
function Part({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div role="group" aria-labelledby={id} data-nav-part={id.replace(/^.*-/, '')}>
      <p id={id} className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wider text-white/75">
        {label}
      </p>
      {children}
    </div>
  );
}

function Menu({ home, frequent, groups, active, onNavigate }: { home?: readonly ShellItem[]; frequent?: readonly ShellItem[]; groups: readonly ShellGroup[]; active: string | null; onNavigate?: () => void }) {
  const { t } = useT();
  const id = useId();
  if (!home && !frequent) return <Groups groups={groups} active={active} onNavigate={onNavigate} />;
  const list = (items: readonly ShellItem[], tone: ColorToken) => (
    <ul className="flex flex-col gap-0.5">
      {items.map((i) => (
        <li key={i.href}>
          <ItemLink item={i} active={i.href === active} tone={tone} onNavigate={onNavigate} />
        </li>
      ))}
    </ul>
  );
  return (
    <div className="flex flex-col gap-2">
      {home && home.length > 0 && <div data-nav-part="home">{list(home, 'royal')}</div>}
      {frequent && frequent.length > 0 && (
        <Part id={`${id}-frequent`} label={t('shell.nav.frequent')}>
          {list(frequent, 'royal')}
        </Part>
      )}
      {groups.length > 0 && (
        <Part id={`${id}-all`} label={t('shell.nav.allModules')}>
          <Groups groups={groups} active={active} onNavigate={onNavigate} openFirst={false} />
        </Part>
      )}
    </div>
  );
}

function Footer({ accountHref }: { accountHref: string }) {
  const router = useRouter();
  const { t, tCount } = useT();
  const { sendNow, operations, clear } = useOffline();
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
          // Changes still on this phone are sent first; if any cannot be, the person is asked (docs/20 §4).
          await sendNow().catch(() => undefined);
          const left = (await operations().catch(() => [])).length;
          if (left > 0 && !window.confirm(tCount('sync.signOut.waiting', left))) return;
          await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
          await clear();
          router.push('/login');
          router.refresh();
        }}
      >
        {t('shell.signOut')}
      </button>
    </div>
  );
}

// Who is signed in: their full name and role, or the role alone when the name is not known.
export type ShellPerson = { name: string; role: string };

export function AppShell({
  groups,
  home,
  frequent,
  bottomItems,
  brand,
  logoSrc = null,
  person = null,
  roleLabel,
  navLabel,
  accountHref,
  action,
  lang = 'en',
  langKnown = true,
  toursSeen = [],
  device = null,
  scope = 'school',
  quickAdd = [],
  children,
}: {
  // The menu's groups: the school's module groups ("All modules" when `home` or `frequent` is given), or Control's one.
  groups: readonly ShellGroup[];
  // The school app (C235-B): My Day and the office's Dashboard and Settings, then the role's Frequent work.
  home?: readonly ShellItem[];
  frequent?: readonly ShellItem[];
  bottomItems?: readonly ShellItem[];
  // The school's name (or NetCyberAI Control's) and its logo's address; with no logo, its initials are shown.
  brand: string;
  logoSrc?: string | null;
  person?: ShellPerson | null;
  roleLabel: string;
  navLabel: string;
  accountHref: string;
  // A persistent action beside the menu (the teacher's QR scan, PRD §7.3).
  action?: ReactNode;
  lang?: Lang;
  // False when this browser has no language cookie for this person yet.
  langKnown?: boolean;
  // The first-visit tours this person has seen; null when this browser does not know yet.
  toursSeen?: readonly TourId[] | null;
  // The school app only: whose device store and outbox this is (working offline, C143).
  device?: { schoolId: string; userId: string } | null;
  // Which search this shell has: the school's, or Control's.
  scope?: 'school' | 'control';
  quickAdd?: readonly QuickAddItem[];
  children: ReactNode;
}) {
  const t = (key: MessageKey, params?: Values) => translate(lang, key, params);
  const pathname = usePathname() ?? '';
  const active = activeHref([{ items: [...(home ?? []), ...(frequent ?? [])] }, ...groups], pathname);
  const [drawer, setDrawer] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const drawerId = useId();
  const who = person ?? { name: '', role: roleLabel };
  // "Asha Verma · Principal", or the role alone.
  const whoLine = who.name ? `${who.name} · ${who.role}` : who.role;

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

  const menu = (onNavigate?: () => void) => <Menu home={home} frequent={frequent} groups={groups} active={active} onNavigate={onNavigate} />;

  return (
    <LangProvider lang={lang}>
      <ToursProvider initial={toursSeen}>
      <OfflineProvider schoolId={device?.schoolId ?? null} userId={device?.userId ?? null}>
      <div className="min-h-screen bg-off-white">
      {/* The branded bar (C235-B). On wide screens: one sticky, translucent bar the width of the page. On phones its
          parts stand on their own: the brand row sticks to the top, the tools below it scroll away. */}
      <div lang={lang} data-shell-header className="contents md:sticky md:top-0 md:z-40 md:flex md:h-16 md:items-center md:border-b md:border-slate/10 md:bg-white/90 md:backdrop-blur print:hidden">
        <div data-shell-brand className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate/10 bg-white/90 pl-3 pr-1 backdrop-blur md:static md:z-auto md:h-full md:w-64 md:shrink-0 md:border-b-0 md:border-r md:bg-transparent md:px-4 md:backdrop-blur-none">
          <SchoolLogo src={logoSrc} name={brand} size="md" />
          <div className="min-w-0 flex-1">
            <p data-shell-school className="truncate text-sm font-extrabold leading-tight text-slate md:text-base" title={brand}>
              {brand}
            </p>
            <p data-shell-person-line className="truncate text-xs text-slate/70 lg:hidden">
              {whoLine}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1 md:hidden">
            {action && <span lang="en">{action}</span>}
            <button
              ref={toggleRef}
              type="button"
              aria-expanded={drawer}
              aria-controls={drawerId}
              aria-label={t(drawer ? 'shell.menu.close' : 'shell.menu.open')}
              onClick={() => setDrawer((d) => !d)}
              className="flex h-11 w-11 items-center justify-center rounded-md text-slate hover:bg-slate/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal"
            >
              <span aria-hidden="true" className="text-2xl leading-none">
                {drawer ? '×' : '☰'}
              </span>
            </button>
          </div>
        </div>
        <div data-shell-lang={lang} role="region" aria-label={t('shell.tools')} className="flex flex-wrap items-center gap-2 border-b border-slate/10 bg-white px-4 py-2 md:h-full md:min-w-0 md:flex-1 md:flex-nowrap md:border-b-0 md:bg-transparent md:py-0">
          <GlobalSearch scope={scope} />
          <QuickAdd items={quickAdd} />
          {device && <SyncLine />}
          <div className="ml-auto">
            <LanguageSwitch known={langKnown} />
          </div>
        </div>
        <Link
          href={accountHref}
          data-shell-person
          aria-label={who.name ? t('shell.person.account', { name: who.name, role: who.role }) : t('shell.account')}
          className="mr-3 hidden min-h-[44px] shrink-0 items-center gap-2 rounded-lg px-2 hover:bg-slate/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal lg:flex"
        >
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-royal text-sm font-bold text-white">
            {brandInitials(who.name || who.role)}
          </span>
          <span className="flex min-w-0 max-w-[14rem] flex-col leading-tight">
            {who.name && <span className="truncate text-sm font-semibold text-slate">{who.name}</span>}
            <span className="truncate text-xs text-slate/70">{who.role}</span>
          </span>
        </Link>
      </div>

      <aside lang={lang} className="fixed bottom-0 left-0 top-16 z-30 hidden w-64 flex-col bg-midnight md:flex print:hidden">
        <span aria-hidden="true" className="nca-spectrum-bar block h-1" />
        {action && (
          <div lang="en" className="px-3 pb-2 pt-3">
            {action}
          </div>
        )}
        <nav aria-label={navLabel} className="flex-1 overflow-y-auto px-2 pb-2 pt-2">
          {menu()}
        </nav>
        <Footer accountHref={accountHref} />
      </aside>

      {drawer && (
        <div id={drawerId} ref={panelRef} lang={lang} role="dialog" aria-modal="true" aria-label={navLabel} className="fixed inset-0 z-40 flex flex-col bg-midnight md:hidden">
          <div className="flex items-center gap-2 py-3 pl-4 pr-2">
            <SchoolLogo src={logoSrc} name={brand} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-extrabold text-white">{brand}</p>
              <p className="truncate text-xs text-white/75">{whoLine}</p>
            </div>
            <button type="button" onClick={() => setDrawer(false)} aria-label={t('shell.menu.close')} className="flex h-11 w-11 items-center justify-center rounded-md bg-midnight text-2xl text-white">
              ×
            </button>
          </div>
          <nav aria-label={navLabel} className="flex-1 overflow-y-auto px-2 pb-2">
            {menu(() => setDrawer(false))}
          </nav>
          <Footer accountHref={accountHref} />
        </div>
      )}

      <main className={`md:pl-64 ${bottomItems?.length ? 'pb-20 md:pb-0' : ''}`}>{children}</main>

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
      </OfflineProvider>
      </ToursProvider>
    </LangProvider>
  );
}
