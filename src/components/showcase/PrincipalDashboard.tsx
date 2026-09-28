'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/visual/Icons';
import { useWheelHandoff } from '@/lib/scroll-handoff';
import { tones } from '@/lib/semantic';
import { MODULES, NAV_GROUPS, SCHOOL, TOP_NOTICES, type AddRole, type BadgeTone, type ModuleId, type PageId } from '@/demo-fixture/principal-dashboard';
import { PrincipalHome } from './principal/PrincipalHome';
import { ModulePage } from './principal/ModulePage';
import { AddRecordDialog } from './principal/AddRecordDialog';

// The founder's principal dashboard as one working demo app: 5 nav
// groups, 33 modules, search, collapsible sidebar, "+ Add" for six
// roles, notifications and logout. It stays in desktop format at every
// screen size (the frame scrolls sideways on a phone) because it is a
// preview of the desktop product. Fixture data only; nothing is saved.

const BADGE: Record<BadgeTone, string> = {
  neutral: 'bg-white/10 text-white',
  success: 'bg-turquoise text-slate',
  alert: 'bg-coral text-slate',
  action: 'bg-tangerine text-slate',
  intelligence: 'bg-grape text-white',
};

export function PrincipalDashboard({ initialPage = 'dashboard' }: { initialPage?: PageId }) {
  const [page, setPage] = useState<PageId>(initialPage);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addRole, setAddRole] = useState<AddRole>('student');
  const [confirmLogout, setConfirmLogout] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  useWheelHandoff(contentRef);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastMsg(''), 3200);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const open = useCallback((id: PageId) => {
    setPage(id);
    contentRef.current?.scrollTo({ top: 0 });
  }, []);

  const openAdd = (role: AddRole = 'student') => {
    setAddRole(role);
    setAddOpen(true);
  };

  const q = query.trim().toLowerCase();
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !q || i.label.toLowerCase().includes(q)) })).filter((g) => g.items.length > 0);

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || !q) return;
    const match = groups.flatMap((g) => g.items).find((i) => i.id !== 'logout');
    if (match) {
      open(match.id as PageId);
      toast(`Opened ${match.label}`);
    } else {
      toast(`No module matches “${query.trim()}”`);
    }
  }

  const title = page === 'dashboard' ? 'Dashboard' : MODULES[page].title;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate/15 bg-white shadow-2xl shadow-slate/20">
      <div className="flex items-center gap-1.5 border-b border-slate/10 bg-off-white px-4 py-2">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-coral" />
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-gold" />
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-leaf" />
        <span className="ml-3 truncate rounded-md bg-white px-2 py-0.5 text-xs text-slate/70">{`demo.netcyberai.com/${page}`}</span>
      </div>

      <div className="flex h-[48rem]">
        <aside className={`flex shrink-0 flex-col bg-slate text-white transition-[width] duration-200 ${collapsed ? 'w-[4.25rem]' : 'w-60'}`} aria-label="Dashboard sidebar">
          <div className="flex items-center gap-2 border-b border-white/10 p-3">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold text-sm font-extrabold text-slate">
              {SCHOOL.short}
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-extrabold">{SCHOOL.name}</span>
                <span className="block truncate text-[10px] opacity-80">{SCHOOL.sub}</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan"
            >
              <span aria-hidden="true">☰</span>
            </button>
          </div>

          <nav aria-label="Dashboard modules" className="nca-scroll flex-1 overflow-y-auto px-2 py-2">
            {groups.map((g) => (
              <div key={g.title} className="mb-2">
                {!collapsed && <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider opacity-70">{g.title}</p>}
                <ul className="flex flex-col gap-0.5">
                  {g.items.map((it) => {
                    const on = it.id === page;
                    const isLogout = it.id === 'logout';
                    return (
                      <li key={it.id}>
                        <button
                          type="button"
                          title={collapsed ? it.label : undefined}
                          aria-current={on ? 'page' : undefined}
                          onClick={() => (isLogout ? setConfirmLogout(true) : open(it.id as PageId))}
                          className={`flex min-h-[34px] w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan ${on ? 'bg-white text-slate' : isLogout ? 'text-white hover:bg-coral/30' : 'hover:bg-white/10'}`}
                        >
                          <Icon name={it.icon} className="h-4 w-4 shrink-0" />
                          {!collapsed && <span className="min-w-0 flex-1 truncate">{it.label}</span>}
                          {!collapsed && it.badge && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${on ? 'bg-slate/10 text-slate' : BADGE[it.badgeTone ?? 'neutral']}`}>{it.badge}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {groups.length === 0 && <p className="px-2 py-4 text-xs opacity-80">No module matches.</p>}
          </nav>

          {confirmLogout && (
            <div role="alertdialog" aria-label="Confirm logout" className="m-2 flex flex-col gap-2 rounded-lg bg-white p-3 text-slate">
              <p className="text-xs font-bold">{`Log out of ${SCHOOL.name}?`}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  autoFocus
                  onClick={() => {
                    setConfirmLogout(false);
                    toast('Demo: session ended · Powered by NetCyberAI');
                  }}
                  className="rounded-md bg-coral px-2.5 py-1 text-xs font-bold text-slate"
                >
                  Log out
                </button>
                <button type="button" onClick={() => setConfirmLogout(false)} className="rounded-md border border-slate/20 px-2.5 py-1 text-xs font-bold">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!collapsed && (
            <p className="border-t border-white/10 px-3 py-3 text-[11px] leading-snug opacity-90">
              Powered by <b>NetCyberAI</b>
              <br />
              Smarter Schools. Brighter Futures.
            </p>
          )}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-slate/10 bg-white px-4 py-2.5">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate/15 bg-off-white px-3">
              <span className="sr-only">Search modules</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-slate/70" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKey}
                placeholder="Search students, staff, fees, anything..."
                className="min-h-[36px] w-full min-w-0 bg-transparent text-sm text-slate outline-none"
              />
            </label>
            <button type="button" onClick={() => openAdd()} className="nca-lift inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg bg-emerald px-3 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal">
              <span aria-hidden="true">＋</span> Add
            </button>
            {[
              { label: 'Notifications', icon: 'bell' as const, msg: TOP_NOTICES.bell },
              { label: 'Messages', icon: 'chat' as const, msg: TOP_NOTICES.chat },
            ].map((b) => (
              <button
                key={b.label}
                type="button"
                aria-label={b.label}
                onClick={() => toast(b.msg)}
                className="nca-lift relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate/15 text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal"
              >
                <Icon name={b.icon} className="h-4 w-4" />
                <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-coral" />
              </button>
            ))}
            <span className="flex shrink-0 items-center gap-2">
              <span aria-hidden="true" className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-extrabold ${tones.achievement.solid}`}>
                {SCHOOL.user.initials}
              </span>
              <span className="hidden leading-tight xl:block">
                <b className="block text-xs text-slate">{SCHOOL.user.name}</b>
                <span className="block text-[10px] text-slate/70">{SCHOOL.name}</span>
              </span>
            </span>
          </div>

          <div ref={contentRef} role="region" aria-label={`Demo screen: ${title}`} tabIndex={-1} className="nca-scroll min-w-0 flex-1 overflow-y-auto bg-off-white p-4">
            <div key={page} className="nca-pop">
              {page === 'dashboard' ? (
                <PrincipalHome open={open} onAdd={() => openAdd('student')} toast={toast} />
              ) : (
                <ModulePage id={page as ModuleId} onAdd={() => openAdd('student')} toast={toast} />
              )}
            </div>
          </div>
        </div>
      </div>

      <div aria-live="polite" className="pointer-events-none absolute bottom-4 right-4 z-10 max-w-sm">
        {toastMsg && <p className="nca-pop rounded-xl bg-slate px-4 py-3 text-sm font-semibold text-white shadow-xl">{toastMsg}</p>}
      </div>

      <AddRecordDialog open={addOpen} initialRole={addRole} onClose={() => setAddOpen(false)} onCreated={toast} />
    </div>
  );
}
