'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Icon } from '@/components/visual/Icons';
import { featurePages, products, solutions } from '@/content/catalog';
import { KIND_LABELS, freeTools, toolsOfKind, type FreeToolKind } from '@/content/free-tools';
import { tones } from '@/lib/semantic';
import { useFinePointer } from '@/lib/hooks';
import { companyName } from '@/lib/site-config';

type MenuKey = 'products' | 'solutions' | 'features' | 'tools';

// `xlOnly` links drop out of the desktop bar between 1024 and 1279px so
// the bar never wraps; they stay in the mobile menu and the footer.
const PLAIN_LINKS = [
  { href: '/pricing', label: 'Pricing', xlOnly: false },
  { href: '/resources', label: 'Resources', xlOnly: false },
  { href: '/about', label: 'About', xlOnly: true },
  { href: '/contact', label: 'Contact', xlOnly: true },
];

const ROLE_SLUGS = ['principal', 'school-admin', 'teacher', 'finance', 'admissions'];

function Wordmark() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- the founder's raster wordmark at 1x/2x; next/image adds nothing for a fixed-size logo.
    <img
      src="/brand/wordmark.webp"
      srcSet="/brand/wordmark.webp 1x, /brand/wordmark@2x.webp 2x"
      alt={companyName}
      width={168}
      height={32}
      className="h-8 w-auto"
    />
  );
}

function ProductsPanel({ onNavigate }: { onNavigate: () => void }) {
  const [hovered, setHovered] = useState(0);
  const p = products[hovered];
  return (
    <div className="grid grid-cols-[1fr_18rem] gap-6">
      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate/70">Products</p>
        <ul className="grid grid-cols-3 gap-2">
          {products.map((item, i) => (
            <li key={item.slug}>
              <Link
                href={`/products/${item.slug}`}
                onClick={onNavigate}
                onMouseEnter={() => setHovered(i)}
                onFocus={() => setHovered(i)}
                className="flex h-full gap-3 rounded-xl p-3 hover:bg-off-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tones[item.tone].solid}`}>
                  <Icon name={item.icon} className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate">{item.name}</span>
                  <span className="block text-xs leading-snug text-slate/70">{item.menuBlurb}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-x-5">
          <Link href="/products" onClick={onNavigate} className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-bold text-royal hover:underline">
            All products <Icon name="arrow" className="h-4 w-4" />
          </Link>
          <Link href="/product-tour" onClick={onNavigate} className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-bold text-royal hover:underline">
            <Icon name="play" className="h-4 w-4" /> Explore the product tour
          </Link>
        </div>
      </div>
      <div className="flex flex-col gap-3 rounded-2xl bg-off-white p-4" aria-hidden="true">
        <p className="text-xs font-bold uppercase tracking-wider text-slate/70">Preview</p>
        <div key={p.slug} className="nca-pop flex flex-col gap-3">
          <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tones[p.tone].solid}`}>
            <Icon name={p.icon} className="h-6 w-6" />
          </span>
          <p className="text-lg font-extrabold text-slate">{p.name}</p>
          <ul className="flex flex-col gap-1.5">
            {p.workflow.slice(0, 4).map((w, i) => (
              <li key={w.title} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${tones[p.tone].soft}`}>
                {`${i + 1}. ${w.title}`}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate/70">{`Used by: ${p.users.map((u) => u.role).join(', ')}`}</p>
        </div>
      </div>
    </div>
  );
}

function SolutionsPanel({ onNavigate }: { onNavigate: () => void }) {
  const byRole = solutions.filter((s) => ROLE_SLUGS.includes(s.slug));
  const byType = solutions.filter((s) => !ROLE_SLUGS.includes(s.slug));
  const group = (title: string, items: typeof solutions) => (
    <div>
      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate/70">{title}</p>
      <ul className="flex flex-col gap-1">
        {items.map((s) => (
          <li key={s.slug}>
            <Link
              href={`/solutions/${s.slug}`}
              onClick={onNavigate}
              className="flex gap-3 rounded-xl p-2.5 hover:bg-off-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal"
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tones[s.tone].solid}`}>
                <Icon name={s.icon} className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate">{s.name}</span>
                <span className="block text-xs leading-snug text-slate/70">{s.menuBlurb}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="grid grid-cols-3 gap-6">
      {group('By role', byRole)}
      {group('By school type', byType)}
      <div className="flex flex-col justify-between gap-4 rounded-2xl bg-sapphire p-5 text-white">
        <div>
          <p className="text-lg font-extrabold">Not sure where to start?</p>
          <p className="mt-1 text-sm opacity-90">Tell us about your school and we will show you the parts that matter to you.</p>
        </div>
        <Button href="/book-demo" variant="secondary" onClick={onNavigate}>
          Book a demo
        </Button>
      </div>
    </div>
  );
}

function FeaturesPanel({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div>
      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate/70">Features</p>
      <ul className="grid grid-cols-3 gap-2">
        {featurePages.map((f) => (
          <li key={f.href}>
            <Link
              href={f.href}
              onClick={onNavigate}
              className="flex h-full gap-3 rounded-xl p-3 hover:bg-off-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal"
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tones[f.tone].solid}`}>
                <Icon name={f.icon} className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate">{f.name}</span>
                <span className="block text-xs leading-snug text-slate/70">{f.blurb}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/features" onClick={onNavigate} className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 text-sm font-bold text-royal hover:underline">
        Explore all features <Icon name="arrow" className="h-4 w-4" />
      </Link>
    </div>
  );
}

function ToolsPanel({ onNavigate }: { onNavigate: () => void }) {
  // Four columns: the two large groups on their own, the four small ones
  // stacked in pairs.
  const columns: FreeToolKind[][] = [['decision'], ['certificate'], ['data', 'compliance'], ['office', 'teaching']];
  return (
    <div>
      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate/70">Free tools · no login, runs in your browser</p>
      <div className="grid grid-cols-4 gap-5">
        {columns.map((kinds) => (
          <div key={kinds.join('-')} className="flex flex-col gap-4">
            {kinds.map((kind) => (
              <div key={kind}>
                <p className="mb-2 text-sm font-extrabold text-sapphire">{KIND_LABELS[kind].title}</p>
                <ul className="grid grid-cols-1 gap-0.5">
                  {toolsOfKind(kind).map((t) => (
                    <li key={t.slug}>
                      <Link
                        href={`/free-tools/${t.slug}`}
                        onClick={onNavigate}
                        className="flex min-h-[40px] items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate hover:bg-off-white hover:text-royal focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal"
                      >
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${tones[t.tone].solid}`}>
                          <Icon name={t.icon} className="h-3.5 w-3.5" />
                        </span>
                        {t.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
      <Link href="/free-tools" onClick={onNavigate} className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 text-sm font-bold text-royal hover:underline">
        All free tools <Icon name="arrow" className="h-4 w-4" />
      </Link>
    </div>
  );
}

export function Header() {
  const pathname = usePathname();
  const [menu, setMenu] = useState<MenuKey | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<MenuKey | null>(null);
  const fine = useFinePointer();
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const triggerRefs = useRef<Record<MenuKey, HTMLButtonElement | null>>({ products: null, solutions: null, features: null, tools: null });
  // Set when a menu is opened from the keyboard. The panels render after
  // the whole nav in the DOM, so without moving focus a keyboard user
  // would have to tab past every other header link to reach the menu
  // they just opened.
  const focusPanelOnOpen = useRef(false);
  const panelId = useId();
  const mobileId = useId();

  useEffect(() => {
    setMenu(null);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menu || !focusPanelOnOpen.current) return;
    focusPanelOnOpen.current = false;
    document.getElementById(`${panelId}-${menu}`)?.querySelector<HTMLElement>('a[href], button')?.focus();
  }, [menu, panelId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (menu) {
        triggerRefs.current[menu]?.focus();
        setMenu(null);
      }
      setMobileOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menu]);

  // Found by Playwright verification in an earlier prompt: the marketing
  // chrome doesn't belong above the internal /control and /app shells
  // (nor the development-only shell preview, C121), nor above the parent's /family app (C230-D).
  if (pathname.startsWith('/control') || pathname.startsWith('/app') || pathname === '/family' || pathname.startsWith('/family/') || pathname.startsWith('/design-system/shell')) {
    return null;
  }

  function clearTimers() {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }
  function hoverOpen(key: MenuKey) {
    if (!fine) return;
    clearTimers();
    openTimer.current = window.setTimeout(() => setMenu(key), 80);
  }
  function hoverClose() {
    if (!fine) return;
    clearTimers();
    closeTimer.current = window.setTimeout(() => setMenu(null), 180);
  }
  const close = () => {
    clearTimers();
    setMenu(null);
  };

  const menus: { key: MenuKey; label: string }[] = [
    { key: 'products', label: 'Products' },
    { key: 'solutions', label: 'Solutions' },
    { key: 'features', label: 'Features' },
    { key: 'tools', label: 'Free Tools' },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-slate/10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 print:hidden" onMouseLeave={hoverClose}>
      <Container wide className="flex h-16 items-center justify-between gap-3">
        <Link href="/" className="flex min-h-[44px] shrink-0 items-center" aria-label={`${companyName} home`}>
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Primary">
          {menus.map((m) => (
            <button
              key={m.key}
              ref={(el) => {
                triggerRefs.current[m.key] = el;
              }}
              type="button"
              aria-expanded={menu === m.key}
              aria-controls={`${panelId}-${m.key}`}
              onMouseEnter={() => hoverOpen(m.key)}
              onClick={(e) => {
                // detail === 0: activated by Enter/Space rather than a pointer.
                if (e.detail === 0 && menu !== m.key) focusPanelOnOpen.current = true;
                setMenu((cur) => (cur === m.key ? null : m.key));
              }}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowDown') return;
                e.preventDefault();
                if (menu === m.key) {
                  document.getElementById(`${panelId}-${m.key}`)?.querySelector<HTMLElement>('a[href], button')?.focus();
                } else {
                  focusPanelOnOpen.current = true;
                  setMenu(m.key);
                }
              }}
              className="inline-flex min-h-[44px] items-center gap-1 whitespace-nowrap rounded-md px-2 text-sm font-semibold text-slate hover:text-royal focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal xl:px-3"
            >
              {m.label}
              <Icon name="chevronDown" className={`h-3.5 w-3.5 transition-transform ${menu === m.key ? 'rotate-180' : ''}`} />
            </button>
          ))}
          {PLAIN_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onMouseEnter={hoverClose}
              className={`${l.xlOnly ? 'hidden xl:inline-flex' : 'inline-flex'} min-h-[44px] items-center whitespace-nowrap rounded-md px-2 text-sm font-semibold text-slate hover:text-royal focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal xl:px-3`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/login"
            className="hidden min-h-[44px] items-center px-2 text-sm font-semibold text-slate hover:text-royal lg:flex"
          >
            Login
          </Link>
          <Button href="/book-demo" variant="secondary" className="hidden !px-4 !py-2 !text-sm sm:inline-flex">
            Book a demo
          </Button>
          <Button href="/get-started" className="hidden !px-4 !py-2 !text-sm lg:inline-flex">
            Get started
          </Button>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-md text-slate hover:bg-slate/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal lg:hidden"
            aria-expanded={mobileOpen}
            aria-controls={mobileId}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </Container>
      <div aria-hidden="true" className="nca-spectrum-bar h-0.5" />

      {/* Desktop mega-menus */}
      {menus.map((m) =>
        menu === m.key ? (
          <div
            key={m.key}
            id={`${panelId}-${m.key}`}
            onMouseEnter={clearTimers}
            className="nca-pop absolute inset-x-0 top-full hidden border-b border-slate/10 bg-white shadow-2xl shadow-sapphire/10 lg:block"
          >
            <Container wide className="py-6">
              {m.key === 'products' && <ProductsPanel onNavigate={close} />}
              {m.key === 'solutions' && <SolutionsPanel onNavigate={close} />}
              {m.key === 'features' && <FeaturesPanel onNavigate={close} />}
              {m.key === 'tools' && <ToolsPanel onNavigate={close} />}
            </Container>
          </div>
        ) : null
      )}

      {/* Mobile menu */}
      {mobileOpen && (
        <div id={mobileId} className="absolute inset-x-0 top-full max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-slate/10 bg-white shadow-2xl lg:hidden">
          <nav aria-label="Primary" className="flex flex-col">
            {menus.map((m) => {
              const open = mobileSection === m.key;
              const items =
                m.key === 'products'
                  ? products.map((p) => ({ href: `/products/${p.slug}`, name: p.name, blurb: p.menuBlurb, tone: p.tone, icon: p.icon }))
                  : m.key === 'solutions'
                    ? solutions.map((s) => ({ href: `/solutions/${s.slug}`, name: s.name, blurb: s.menuBlurb, tone: s.tone, icon: s.icon }))
                    : m.key === 'features'
                      ? featurePages.map((f) => ({ href: f.href, name: f.name, blurb: f.blurb, tone: f.tone, icon: f.icon }))
                      : freeTools.map((t) => ({ href: `/free-tools/${t.slug}`, name: t.name, blurb: t.menuBlurb, tone: t.tone, icon: t.icon }));
              return (
                <div key={m.key} className="border-b border-slate/10">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setMobileSection(open ? null : m.key)}
                    className="flex min-h-[52px] w-full items-center justify-between px-4 text-left text-base font-bold text-slate"
                  >
                    {m.label}
                    <Icon name="chevronDown" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && (
                    <ul className="flex flex-col gap-1 px-3 pb-3">
                      {items.map((it) => (
                        <li key={it.href}>
                          <Link href={it.href} className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-off-white">
                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones[it.tone].solid}`}>
                              <Icon name={it.icon} className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-bold text-slate">{it.name}</span>
                              <span className="block text-xs text-slate/70">{it.blurb}</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            {PLAIN_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="flex min-h-[52px] items-center border-b border-slate/10 px-4 text-base font-bold text-slate">
                {l.label}
              </Link>
            ))}
            <Link href="/login" className="flex min-h-[52px] items-center border-b border-slate/10 px-4 text-base font-bold text-slate">
              Login
            </Link>
            <div className="flex flex-col gap-2 p-4">
              <Button href="/book-demo" variant="secondary">
                Book a demo
              </Button>
              <Button href="/get-started">Get started</Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
