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
import type { Lang, MessageKey } from '@/lib/i18n';
import { fillWord, type Words } from '@/lib/i18n/words';
import { clearScanOutbox, scanPagesOnPhone } from '@/lib/marking/outbox-clear';
import { brandInitials } from '@/lib/school/logo-file';
import { GlobalSearch } from './GlobalSearch';
import { QuickAdd } from './QuickAdd';
import type { TourId } from '@/lib/contracts/tours';
import { LangProvider } from './lang-core';
import { WordsProvider, useWords } from './Words';
import { ToursProvider } from './ToursContext';
import { LanguageSwitch } from './LanguageSwitch';
import { OfflineProvider, useOffline } from './OfflineContext';
import { SchoolLogo } from './SchoolLogo';
import { readSidebarHidden, writeSidebarHidden } from './sidebar-preference';
import { SyncLine } from './SyncLine';
import { activeHref, type ShellGroup, type ShellItem } from './shell-active';

type Values = Record<string, string>;

// True from the width where the sidebar sits beside the page (Tailwind's `md`, 768 px); false on a phone, and before
// the browser has said, so the server's page is the phone's.
function useWideScreen(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setWide(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

// The app shell (17 §2, §4; C121). One branded bar sits at the top of every
// screen, on wide screens and on phones (C235-B): the school's logo (or its
// initials) and its name, and the signed-in person's name and role. On wide
// screens the bar also holds search, "+ New" and the language switch (C134,
// C135), and a sidebar below it holds the menu; on phones the bar is compact
// (logo, the name cut short, the person's name and role on a second line),
// the tools sit just below it, and the teacher shell keeps its bottom bar of
// day-to-day modules.
// The menu button is the first thing in the bar, on the left, at every width
// (F1-2). On a phone it opens the menu as a drawer from the left, below the
// bar; the same button, a tap outside the drawer or Esc closes it, and focus
// goes back to the button. On a tablet or a computer the same button hides the
// sidebar completely, so the page has the whole width, and shows it again; the
// choice is kept on that device (sidebar-preference.ts).
// The school app's menu reads like a school app's (C235-B): the Home items,
// then "Frequent work", then "All modules", each module under its group, the
// page's group open. Control passes one group and no Home or Frequent work.
// Unbuilt modules say "Soon"; badges are server numbers only. Every word of
// the shell comes from the message files. The shell's own parts carry `lang`;
// the page inside does not, because a screen that has not been moved to the
// message files yet is still in English and a screen reader must read it as
// English.

function Badge({ badge }: { badge: NavBadge }) {
  const { t } = useWords();
  const text = badge.kind === 'new' ? t('shell.badge.new') : badge.kind === 'percent' ? `${badge.value}%` : String(badge.value);
  return <span className="ml-auto rounded-full bg-white px-2 text-xs font-bold text-midnight">{text}</span>;
}

function ItemLink({ item, active, tone, onNavigate }: { item: ShellItem; active: boolean; tone: ColorToken; onNavigate?: () => void }) {
  const { t } = useWords();
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
      <p id={id} className="bg-midnight px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wider text-white/75">
        {label}
      </p>
      {children}
    </div>
  );
}

function Menu({ home, frequent, groups, active, onNavigate }: { home?: readonly ShellItem[]; frequent?: readonly ShellItem[]; groups: readonly ShellGroup[]; active: string | null; onNavigate?: () => void }) {
  const { t } = useWords();
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
  const { t, tCount } = useWords();
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
          // Scanned answer-sheet pages not sent yet are children's work: the person is told, and they go with the sign-out (C230-AJ).
          const pages = await scanPagesOnPhone();
          if (pages > 0 && !window.confirm(t('mk.scan.signOutWaiting', { n: pages }))) return;
          await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
          await clear();
          await clearScanOutbox();
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
  words,
  langSaved,
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
  // The shell's words, picked on the server (shellWords, C395): the shell never carries the whole message table.
  words: Words;
  // "Saved: <language>" in each language, for the language switch (shellWords).
  langSaved: Record<Lang, string>;
  children: ReactNode;
}) {
  const t = (key: MessageKey, params?: Values) => fillWord(words, key, params);
  const pathname = usePathname() ?? '';
  const active = activeHref([{ items: [...(home ?? []), ...(frequent ?? [])] }, ...groups], pathname);
  const wide = useWideScreen();
  const [drawer, setDrawer] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const drawerId = useId();
  const sidebarId = useId();
  const who = person ?? { name: '', role: roleLabel };
  // "Asha Verma · Principal", or the role alone.
  const whoLine = who.name ? `${who.name} · ${who.role}` : who.role;
  // The drawer is a phone's: a screen that grows past the phone's width closes it.
  const drawerOpen = drawer && !wide;
  const expanded = wide ? !sidebarHidden : drawerOpen;
  const menuLabel = t(wide ? (sidebarHidden ? 'shell.menu.show' : 'shell.menu.hide') : drawerOpen ? 'shell.menu.close' : 'shell.menu.open');

  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    if (wide) setDrawer(false);
  }, [wide]);
  // What this device chose last time; until it is read (and when the browser has no store) the sidebar is shown.
  useEffect(() => setSidebarHidden(readSidebarHidden()), []);
  const toggleMenu = () => {
    if (wide) {
      const hidden = !sidebarHidden;
      setSidebarHidden(hidden);
      writeSidebarHidden(hidden);
    } else {
      setDrawer((d) => !d);
    }
  };

  useEffect(() => {
    if (!drawerOpen) return;
    // Esc closes. Tab stays among the button and the drawer's own links, so focus never lands on the page behind it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawer(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const stops = [toggleRef.current, ...(panelRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])') ?? [])].filter((el): el is HTMLElement => el !== null);
      const at = stops.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : at < 0 || at === stops.length - 1 ? 0 : at + 1;
      e.preventDefault();
      stops[next]?.focus();
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLElement>('a[href],button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);
  // However the drawer closed (the button, a tap outside, Esc, a link), focus goes back to the button.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !drawerOpen) toggleRef.current?.focus();
    wasOpen.current = drawerOpen;
  }, [drawerOpen]);

  const menu = (onNavigate?: () => void) => <Menu home={home} frequent={frequent} groups={groups} active={active} onNavigate={onNavigate} />;

  return (
    <LangProvider lang={lang}>
      <WordsProvider words={words}>
      <ToursProvider initial={toursSeen}>
      <OfflineProvider schoolId={device?.schoolId ?? null} userId={device?.userId ?? null}>
      <div className="min-h-screen bg-off-white">
      {/* The branded bar (C235-B). On wide screens: one sticky, translucent bar the width of the page. On phones its
          parts stand on their own: the brand row sticks to the top, the tools below it scroll away. */}
      <header lang={lang} data-shell-header className="contents md:sticky md:top-0 md:z-40 md:flex md:h-16 md:items-center md:border-b md:border-slate/10 md:bg-white/90 md:backdrop-blur print:hidden">
        <div data-shell-brand className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate/10 bg-white/90 pl-1 pr-2 backdrop-blur md:static md:z-auto md:h-full md:w-64 md:shrink-0 md:border-b-0 md:border-r md:bg-transparent md:pr-3 md:backdrop-blur-none">
          <button
            ref={toggleRef}
            type="button"
            data-shell-menu-button
            aria-expanded={expanded}
            aria-controls={wide ? sidebarId : drawerId}
            aria-label={menuLabel}
            onClick={toggleMenu}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate hover:bg-slate/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal"
          >
            <span aria-hidden="true" className="text-2xl leading-none">
              {drawerOpen ? '×' : '☰'}
            </span>
          </button>
          <SchoolLogo src={logoSrc} name={brand} size="md" />
          <div className="min-w-0 flex-1">
            <p data-shell-school className="truncate text-sm font-extrabold leading-tight text-slate lg:line-clamp-2 lg:whitespace-normal" title={brand}>
              {brand}
            </p>
            <p data-shell-person-line className="truncate text-xs text-slate/70 lg:hidden">
              {whoLine}
            </p>
          </div>
          {action && (
            <div className="flex shrink-0 items-center md:hidden">
              <span lang="en">{action}</span>
            </div>
          )}
        </div>
        <div data-shell-lang={lang} role="region" aria-label={t('shell.tools')} className="flex flex-wrap items-center gap-2 border-b border-slate/10 bg-white px-4 py-2 md:h-full md:min-w-0 md:flex-1 md:flex-nowrap md:border-b-0 md:bg-transparent md:py-0">
          <GlobalSearch scope={scope} />
          <QuickAdd items={quickAdd} />
          {device && <SyncLine />}
          <div className="ml-auto">
            <LanguageSwitch known={langKnown} saved={langSaved} />
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
      </header>

      <aside id={sidebarId} lang={lang} data-shell-sidebar={sidebarHidden ? 'hidden' : 'shown'} className={`fixed bottom-0 left-0 top-16 z-30 hidden w-64 flex-col bg-midnight ${sidebarHidden ? '' : 'md:flex'} print:hidden`}>
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

      {drawerOpen && (
        <>
          {/* A tap anywhere outside the drawer closes it. Both sit below the bar, so the button stays in reach. */}
          <div aria-hidden="true" data-shell-scrim onClick={() => setDrawer(false)} className="fixed inset-x-0 bottom-0 top-14 z-40 bg-midnight/60" />
          <div id={drawerId} ref={panelRef} lang={lang} role="dialog" aria-label={navLabel} data-shell-drawer className="fixed bottom-0 left-0 top-14 z-40 flex w-[85vw] max-w-xs animate-drawer-in flex-col bg-midnight motion-reduce:animate-none">
            <nav aria-label={navLabel} className="flex-1 overflow-y-auto px-2 pb-2 pt-2">
              {menu(() => setDrawer(false))}
            </nav>
            <Footer accountHref={accountHref} />
          </div>
        </>
      )}

      <main className={`${sidebarHidden ? '' : 'md:pl-64'} ${bottomItems?.length ? 'pb-20 md:pb-0' : ''}`}>{children}</main>

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
          <button type="button" onClick={() => setDrawer(true)} aria-expanded={drawerOpen} aria-controls={drawerId} className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 bg-midnight text-xs font-semibold text-white/75">
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
      </WordsProvider>
    </LangProvider>
  );
}
