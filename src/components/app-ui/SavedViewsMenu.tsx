'use client';

import { useState } from 'react';
import type { ListQuery, SavedView } from '@/lib/contracts/filters';
import { SCHOOL_ROLES, type SchoolRole } from '@/lib/contracts/modules';

// Saved views of a list (17 §1a, C113): the person's own views, the school's
// shared views (with the roles they open by default), and "Save current
// view". Sharing with the school and role defaults are for the principal
// and school admin (`canShare`); the API and RLS enforce the same.

const ROLE_LABEL: Record<SchoolRole, string> = {
  principal: 'Principal',
  school_admin: 'School admin',
  teacher: 'Teachers',
  accountant: 'Accountants',
  academic_coordinator: 'Coordinators',
};

export type NewView = { name: string; scope: 'personal' | 'school'; defaultForRoles: SchoolRole[] };

export function SavedViewsMenu({
  views,
  defaultViewId,
  activeViewId,
  currentUserId,
  canShare,
  onApply,
  onSave,
  onDelete,
  defaultOpen = false,
}: {
  views: readonly SavedView[];
  defaultViewId: string | null;
  activeViewId?: string | null;
  currentUserId: string;
  canShare: boolean;
  onApply: (view: SavedView) => void;
  onSave: (v: NewView) => void;
  onDelete: (viewId: string) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'personal' | 'school'>('personal');
  const [roles, setRoles] = useState<SchoolRole[]>([]);
  const mine = views.filter((v) => v.scope === 'personal');
  const school = views.filter((v) => v.scope === 'school');
  const active = views.find((v) => v.viewId === activeViewId);

  const row = (v: SavedView) => (
    <li key={v.viewId} className="flex items-center gap-1">
      <button type="button" onClick={() => onApply(v)} aria-current={v.viewId === activeViewId ? 'true' : undefined} className="flex min-h-[44px] flex-1 flex-col items-start justify-center rounded px-2 text-left text-sm text-slate hover:bg-slate/5">
        <span className="font-semibold">{v.name}</span>
        {(v.defaultForRoles?.length || v.viewId === defaultViewId) && (
          <span className="text-xs text-slate/70">
            Default for {(v.defaultForRoles ?? []).map((r) => ROLE_LABEL[r]).join(', ') || 'you'}
          </span>
        )}
      </button>
      {(v.scope === 'personal' ? v.ownerUserId === currentUserId : canShare) && (
        <button type="button" onClick={() => onDelete(v.viewId)} aria-label={`Delete view ${v.name}`} className="min-h-[44px] min-w-[44px] text-coral-deep">
          ×
        </button>
      )}
    </li>
  );

  return (
    <div className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-slate/20 bg-white px-3 text-sm font-semibold text-slate">
        {active ? active.name : 'Views'} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-slate/15 bg-white p-3 shadow-xl">
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate/70">My views</p>
          {mine.length ? <ul className="mb-2">{mine.map(row)}</ul> : <p className="mb-2 text-sm text-slate/70">None yet. Save the current filters below.</p>}
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate/70">School views</p>
          {school.length ? <ul className="mb-2">{school.map(row)}</ul> : <p className="mb-2 text-sm text-slate/70">No shared views yet.</p>}
          <form
            className="mt-2 flex flex-col gap-2 border-t border-slate/10 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              onSave({ name: name.trim(), scope, defaultForRoles: scope === 'school' ? roles : [] });
              setName('');
              setRoles([]);
            }}
          >
            <label className="text-sm font-semibold text-slate">
              Save current view as
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="mt-1 min-h-[44px] w-full rounded-md border border-slate/20 px-3 text-sm font-normal" />
            </label>
            {canShare && (
              <fieldset className="text-sm text-slate">
                <legend className="sr-only">Who sees it</legend>
                {(['personal', 'school'] as const).map((s) => (
                  <label key={s} className="mr-4 inline-flex min-h-[44px] items-center gap-2">
                    <input type="radio" name="view-scope" checked={scope === s} onChange={() => setScope(s)} />
                    {s === 'personal' ? 'Only me' : 'Whole school'}
                  </label>
                ))}
                {scope === 'school' && (
                  <div className="flex flex-wrap gap-x-4">
                    <span className="w-full text-xs text-slate/70">Open by default for</span>
                    {SCHOOL_ROLES.map((r) => (
                      <label key={r} className="inline-flex min-h-[44px] items-center gap-2">
                        <input type="checkbox" checked={roles.includes(r)} onChange={() => setRoles(roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r])} />
                        {ROLE_LABEL[r]}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            )}
            <button type="submit" disabled={!name.trim()} className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white disabled:opacity-60">
              Save view
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// The PR-2b saved views API (C113), for screens that use the menu.
export const savedViewsApi = {
  async list(listId: string): Promise<{ views: SavedView[]; defaultViewId: string | null }> {
    const r = await fetch(`/api/app/views?listId=${encodeURIComponent(listId)}`);
    if (!r.ok) throw new Error('Could not load views');
    return r.json();
  },
  async create(listId: string, v: NewView, query: ListQuery): Promise<SavedView> {
    const r = await fetch('/api/app/views', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listId, ...v, query }) });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error ?? 'Could not save the view');
    return body.view;
  },
  async remove(viewId: string): Promise<void> {
    const r = await fetch(`/api/app/views/${viewId}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('Could not delete the view');
  },
};
