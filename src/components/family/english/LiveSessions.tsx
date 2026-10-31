'use client';

import { useEffect, useState } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import { familyApi } from '@/components/family/client';
import { sameInkOnBothSides } from '@/lib/family/day-text';

// The parent's view of a child's live English practice (E1, C382): each kept talk with the child's corrected words and
// the partner's replies, and the words that were new; the parent may clear any talk. Recordings are never kept.

type Session = { sessionId: string; topic: string; startedAt: string; recap: { newWords: string[] } | null; turns: { position: number; childText: string; reply: string }[] };

export function LiveSessions({ childId, w, lang }: { childId: string; w: Words; lang: 'en' | 'hi' }) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void familyApi<{ sessions: Session[] }>(`/api/family/english/live/sessions?childId=${encodeURIComponent(childId)}`, 'GET').then((r) => setSessions(r.ok ? r.data.sessions : []));
  }, [childId]);

  const clear = async (sessionId: string) => {
    setNote(null);
    const r = await familyApi('/api/family/english/live/sessions', 'DELETE', { sessionId });
    if (!r.ok) return setNote(w['fam.english.live.parent.clearFailed']);
    setSessions((s) => (s ?? []).filter((x) => x.sessionId !== sessionId));
  };

  const day = (iso: string) => sameInkOnBothSides(new Date(iso).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }));
  return (
    <section data-live-parent className="flex flex-col gap-3 fam-card bg-white p-4 text-slate">
      <h2 className="fam-h2 text-slate">{w['fam.english.live.parent.title']}</h2>
      <p className="text-sm text-slate/80">{w['fam.english.live.parent.note']}</p>
      {sessions !== null && sessions.length === 0 && <p className="text-base text-slate">{w['fam.english.live.parent.empty']}</p>}
      {note && <p role="alert" className="rounded-2xl bg-coral/10 px-3 py-2 text-sm font-semibold text-slate">{note}</p>}
      <ul className="flex flex-col gap-3">
        {(sessions ?? []).map((s) => (
          <li key={s.sessionId} data-live-parent-session className="flex flex-col gap-2 rounded-2xl bg-off-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex-1 text-base font-bold text-slate">
                {w[`fam.english.live.topic.${s.topic}`]} · {day(s.startedAt)} · {fill(w['fam.english.live.parent.turns'], { n: s.turns.length })}
              </span>
              <button type="button" onClick={() => void clear(s.sessionId)} className="fam-press min-h-[44px] rounded-full bg-white px-4 font-bold text-slate ring-1 ring-slate/20">
                {w['fam.english.live.parent.clear']}
              </button>
            </div>
            {s.recap?.newWords.length ? (
              <p className="text-sm text-slate">
                {fill(w['fam.english.live.parent.words'], { words: '' })}
                <span lang="en">{s.recap.newWords.join(', ')}</span>
              </p>
            ) : null}
            <details>
              <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-bold text-ink">{w['fam.english.live.parent.show']}</summary>
              <ol className="flex flex-col gap-2 pt-2" lang="en">
                {s.turns.map((t) => (
                  <li key={t.position} className="flex flex-col gap-1 text-sm">
                    <p className="font-semibold text-slate">{t.childText}</p>
                    <p className="text-slate/80">{t.reply}</p>
                  </li>
                ))}
              </ol>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
