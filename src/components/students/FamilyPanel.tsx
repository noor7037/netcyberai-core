'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import type { FamilyView } from '@/lib/contracts/families';
import type { StudentSearchResult } from '@/lib/contracts/student-search';
import { TeachEmpty } from '@/components/app-ui/TeachEmpty';

// Student 360 → Siblings and Family (C116): the student's siblings (name,
// class, status, order by age), all children and guardians of the family,
// and for the office: link a sibling, remove from the family, and merge two
// guardian records that are the same person. A teacher sees only siblings
// in their own classes (the server decides).

const STATUS_LABEL: Record<string, string> = {
  pending_consent: 'Waiting for consent',
  active: 'Active',
  inactive: 'Inactive',
  transferred: 'Transferred',
};
const STATUS_VARIANT: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  pending_consent: 'warning',
  active: 'success',
  inactive: 'neutral',
  transferred: 'danger',
};

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function FamilyPanel({ studentId, refreshKey = 0 }: { studentId: string; refreshKey?: number }) {
  const [view, setView] = useState<FamilyView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    setError(null);
    fetch(`/api/app/students/${studentId}/family`)
      .then(async (r) => {
        if (r.status === 403) throw new Error('You do not have access to family details.');
        if (!r.ok) throw new Error('Could not load the family.');
        return r.json();
      })
      .then(setView)
      .catch((e: Error) => setError(e.message));
  }, [studentId]);

  useEffect(load, [load, refreshKey]);

  if (error) return <section className="rounded-lg border border-slate/10 p-4 text-sm text-slate/70">{error}</section>;
  if (!view) return <section className="rounded-lg border border-slate/10 p-4 text-sm text-slate/70">Loading family…</section>;

  const self = view.members.find((m) => m.isSelf);
  const siblings = view.members.filter((m) => !m.isSelf);
  const activeCount = view.members.filter((m) => m.siblingOrder !== null).length;

  async function removeFromFamily() {
    if (!window.confirm('Remove this student from the family? The other children stay in it.')) return;
    const res = await fetch(`/api/app/students/${studentId}/family`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ familyId: null }),
    });
    if (!res.ok) return toast.show('Could not remove from the family', 'danger');
    setView(await res.json());
    toast.show('Removed from the family', 'success');
  }

  return (
    <section className="rounded-lg border border-slate/10 p-4" aria-labelledby="family-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="family-heading" className="text-base font-semibold text-slate">
          Siblings and family {view.family && <span className="font-normal text-slate/70">· {view.family.familyCode}</span>}
        </h2>
        {view.canManage && (
          <div className="flex flex-wrap gap-3 text-sm font-semibold">
            <button type="button" onClick={() => setLinkOpen(true)} className="min-h-[44px] text-sapphire">
              + Link a sibling
            </button>
            {view.family && (
              <button type="button" onClick={removeFromFamily} className="min-h-[44px] text-red-800">
                Remove from family
              </button>
            )}
          </div>
        )}
      </div>

      {self?.siblingOrder != null && activeCount > 1 && (
        <p className="mb-3 text-sm text-slate/70">
          {ordinal(self.siblingOrder)} of {activeCount} children at this school, by date of birth.
        </p>
      )}

      <h3 className="mb-2 text-sm font-semibold text-slate">Siblings</h3>
      {siblings.length === 0 ? (
        <div className="mb-4">{view.canManage ? <TeachEmpty id="siblings" compact onAction={() => setLinkOpen(true)} /> : <TeachEmpty id="siblings-view" compact />}</div>
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {siblings.map((m) => (
            <li key={m.studentId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 p-3 text-sm">
              <div>
                <Link href={`/app/students/${m.studentId}`} className="font-semibold text-sapphire">
                  {m.displayName}
                </Link>
                <p className="text-slate/70">
                  {m.className ?? 'No class'}
                  {m.section ? ` · Section ${m.section}` : ''}
                  {m.siblingOrder != null ? ` · ${ordinal(m.siblingOrder)} child` : ''}
                </p>
              </div>
              <Badge variant={STATUS_VARIANT[m.status]}>{STATUS_LABEL[m.status]}</Badge>
            </li>
          ))}
        </ul>
      )}

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate">Guardians of the family</h3>
        {view.canManage && view.guardians.length >= 2 && (
          <button type="button" onClick={() => setMergeOpen(true)} className="min-h-[44px] text-sm font-semibold text-sapphire">
            Merge duplicate guardians
          </button>
        )}
      </div>
      {view.guardians.length === 0 ? (
        <TeachEmpty id="family-guardians" compact />
      ) : (
        <ul className="flex flex-col gap-2">
          {view.guardians.map((g) => (
            <li key={g.parentId} className="rounded-md border border-slate/10 p-3 text-sm">
              <p className="font-semibold text-slate">
                {g.name} {g.relation && <span className="font-normal text-slate/70">({g.relation})</span>}
              </p>
              <p className="text-slate/70">
                {g.phoneLast4 ? `Phone ends ${g.phoneLast4} · ` : ''}
                {g.childIds.length === 1 ? '1 child' : `${g.childIds.length} children`}
              </p>
            </li>
          ))}
        </ul>
      )}

      {view.canManage && (
        <LinkSiblingModal
          open={linkOpen}
          studentId={studentId}
          onClose={() => setLinkOpen(false)}
          onLinked={() => {
            setLinkOpen(false);
            load();
          }}
        />
      )}
      {view.canManage && (
        <MergeGuardiansModal
          open={mergeOpen}
          guardians={view.guardians}
          onClose={() => setMergeOpen(false)}
          onMerged={() => {
            setMergeOpen(false);
            load();
          }}
        />
      )}
    </section>
  );
}

function LinkSiblingModal({ open, studentId, onClose, onLinked }: { open: boolean; studentId: string; onClose: () => void; onLinked: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => {
      fetch(`/api/app/students/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((body) => setResults((body.results ?? []).filter((r: StudentSearchResult) => r.studentId !== studentId)))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, studentId]);

  async function link(other: StudentSearchResult) {
    setBusy(other.studentId);
    const res = await fetch('/api/app/families/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentIds: [studentId, other.studentId] }),
    });
    setBusy(null);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Could not link' }));
      return toast.show(error, 'danger');
    }
    toast.show(`Linked with ${other.displayName}`, 'success');
    onLinked();
  }

  return (
    <Modal open={open} onClose={onClose} title="Link a sibling">
      <label htmlFor="sibling-search" className="mb-1 block text-sm font-semibold text-slate">
        Find the brother or sister
      </label>
      <input
        id="sibling-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Name, admission no. or guardian phone"
        className="mb-3 min-h-[44px] w-full rounded-md border border-slate/20 px-3 text-sm"
        autoComplete="off"
      />
      <ul className="flex flex-col gap-2">
        {results.map((r) => (
          <li key={r.studentId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 p-3 text-sm">
            <div>
              <p className="font-semibold text-slate">{r.displayName}</p>
              <p className="text-slate/70">
                {r.className ?? 'No class'}
                {r.admissionNo ? ` · ${r.admissionNo}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => link(r)}
              disabled={busy === r.studentId}
              className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy === r.studentId ? 'Linking…' : 'Link as sibling'}
            </button>
          </li>
        ))}
      </ul>
      {q.trim().length >= 2 && results.length === 0 && <p className="text-sm text-slate/70">No other student found.</p>}
    </Modal>
  );
}

function MergeGuardiansModal({
  open,
  guardians,
  onClose,
  onMerged,
}: {
  open: boolean;
  guardians: FamilyView['guardians'];
  onClose: () => void;
  onMerged: () => void;
}) {
  const [keep, setKeep] = useState('');
  const [merge, setMerge] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const name = (id: string) => guardians.find((g) => g.parentId === id)?.name ?? '';

  async function submit() {
    if (!keep || !merge || keep === merge) return toast.show('Choose two different guardians', 'danger');
    if (!window.confirm(`Merge “${name(merge)}” into “${name(keep)}”? The children move to “${name(keep)}”; the other record is kept and marked as merged.`)) return;
    setBusy(true);
    const res = await fetch('/api/app/guardians/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepParentId: keep, mergeParentId: merge }),
    });
    setBusy(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Could not merge' }));
      return toast.show(error, 'danger');
    }
    toast.show('Guardians merged', 'success');
    onMerged();
  }

  const select = (id: string, label: string, value: string, set: (v: string) => void) => (
    <div className="mb-3">
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-slate">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => set(e.target.value)} className="min-h-[44px] w-full rounded-md border border-slate/20 px-3 text-sm">
        <option value="">Choose…</option>
        {guardians.map((g) => (
          <option key={g.parentId} value={g.parentId}>
            {g.name}
            {g.relation ? ` (${g.relation})` : ''}
            {g.phoneLast4 ? ` · ends ${g.phoneLast4}` : ''}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="Merge duplicate guardians">
      <p className="mb-3 text-sm text-slate/70">Use this when the same person was entered twice. Nothing is deleted: the merged record stays, marked, and the merge is recorded.</p>
      {select('merge-keep', 'Keep this record', keep, setKeep)}
      {select('merge-from', 'Merge this record into it', merge, setMerge)}
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? 'Merging…' : 'Merge'}
      </button>
    </Modal>
  );
}
