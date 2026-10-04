'use client';

import type { SiblingSuggestion } from '@/lib/contracts/families';

// Possible siblings (C116): guardians already on record with the same phone
// or email, and their children. Nothing is linked until the office presses
// the button, which is shown only when `onConfirm` is given.
export function SiblingSuggestions({
  suggestions,
  onConfirm,
  busyParentId,
}: {
  suggestions: readonly SiblingSuggestion[];
  onConfirm?: (s: SiblingSuggestion) => void;
  busyParentId?: string | null;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="rounded-md border border-sapphire/30 bg-sapphire/5 p-3 text-sm" role="status">
      <p className="mb-2 font-semibold text-slate">Possible sibling — this guardian is already on record</p>
      <ul className="flex flex-col gap-2">
        {suggestions.map((s) => (
          <li key={s.parentId} className="rounded-md border border-slate/10 bg-white p-3">
            <p className="font-semibold text-slate">
              {s.guardianName} {s.relation && <span className="font-normal text-slate/70">({s.relation})</span>}
            </p>
            <p className="text-slate/70">
              Same {s.matchedOn === 'phone' ? `phone (ends ${s.phoneLast4})` : 'email'}
              {s.family ? ` · Family ${s.family.familyCode}` : ''}
            </p>
            <p className="mt-1 text-slate">
              Children: {s.students.map((c) => `${c.displayName}${c.className ? ` (${c.className})` : ''}`).join(', ')}
            </p>
            {onConfirm && (
              <button
                type="button"
                onClick={() => onConfirm(s)}
                disabled={busyParentId === s.parentId}
                className="mt-2 min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busyParentId === s.parentId ? 'Linking…' : 'Link to this guardian and family'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
