'use client';

import { useState } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import { errorWords, familyApi } from '../client';

// The Learning Vault's list (S2, C375), in parent mode: each child's conversations with the tutor, a subject at a time,
// with the child's questions (newest first) and a "clear" that removes the questions, answers and files for good,
// after the parent confirms. The server checks parent mode again on every clear.

export type VaultChild = {
  childId: string;
  firstName: string;
  conversations: { conversationId: string; subject: string; subjectName: string; turns: number; files: number; questions: { text: string; at: string }[] }[];
};

export function VaultList({ w, list, lang }: { w: Words; list: VaultChild[]; lang: string }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const date = (at: string) => new Date(at).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

  const clear = async (conversationId: string) => {
    setBusy(true);
    setError(null);
    const res = await familyApi('/api/family/tutor/vault', 'DELETE', { conversationId });
    setBusy(false);
    if (!res.ok) {
      setError(res.error === 'storage_unavailable' ? w['fam.tutor.err.storage_unavailable'] : errorWords(w, res.error));
      return;
    }
    setAsking(null);
    setGone((s) => new Set(s).add(conversationId));
    setSaid(w['fam.vault.cleared']);
  };

  const shown = list.map((c) => ({ ...c, conversations: c.conversations.filter((v) => !gone.has(v.conversationId)) }));
  const any = shown.some((c) => c.conversations.length > 0);
  return (
    <div className="flex flex-col gap-4" data-vault>
      <p role="status" className="sr-only">
        {said ?? ''}
      </p>
      {error && (
        <p role="alert" className="fam-card bg-white p-4 text-sm font-semibold text-slate">
          {error}
        </p>
      )}
      {!any && (
        <p data-vault-empty className="fam-card bg-white p-5 text-base text-slate">
          {w['fam.vault.none']}
        </p>
      )}
      {shown
        .filter((c) => c.conversations.length > 0)
        .map((c) => (
          <section key={c.childId} aria-labelledby={`vault-${c.childId}`} className="flex flex-col gap-2" data-vault-child>
            <h2 id={`vault-${c.childId}`} className="px-1 text-lg font-extrabold text-slate">
              {c.firstName}
            </h2>
            {c.conversations.map((v) => (
              <article key={v.conversationId} className="fam-card flex flex-col gap-3 bg-white p-4" data-vault-conversation>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <h3 className="text-base font-bold text-slate">{v.subjectName}</h3>
                    <p className="text-sm text-slate">{fill(w['fam.vault.counts'], { turns: v.turns, files: v.files })}</p>
                  </div>
                  {asking !== v.conversationId && (
                    <button type="button" data-vault-clear onClick={() => setAsking(v.conversationId)} className="fam-press min-h-[44px] rounded-2xl bg-white px-4 text-sm font-bold text-slate ring-1 ring-slate/20 hover:bg-off-white">
                      {w['fam.vault.clear']}
                    </button>
                  )}
                </div>
                {asking === v.conversationId && (
                  <div role="group" aria-label={w['fam.vault.clear']} className="flex flex-col gap-2 rounded-2xl bg-off-white p-3">
                    <p className="text-sm font-semibold text-slate">{fill(w['fam.vault.clearConfirm'], { subject: v.subjectName, name: c.firstName })}</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy} data-vault-clear-yes onClick={() => void clear(v.conversationId)} className="fam-press min-h-[44px] rounded-2xl bg-royal-deep px-4 text-sm font-bold text-white disabled:opacity-60">
                        {w['fam.vault.clearYes']}
                      </button>
                      <button type="button" disabled={busy} onClick={() => setAsking(null)} className="fam-press min-h-[44px] rounded-2xl bg-white px-4 text-sm font-bold text-slate ring-1 ring-slate/20">
                        {w['fam.common.cancel']}
                      </button>
                    </div>
                  </div>
                )}
                {v.questions.length > 0 && (
                  <ul className="flex flex-col divide-y divide-slate/10">
                    {v.questions.map((q, i) => (
                      <li key={i} className="flex flex-col gap-0.5 py-2">
                        <span className="whitespace-pre-wrap break-words text-sm text-slate">{q.text}</span>
                        <span className="text-xs text-slate/80">{date(q.at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </section>
        ))}
    </div>
  );
}
