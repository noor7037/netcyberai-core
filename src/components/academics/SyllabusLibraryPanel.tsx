'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { tCount } from '@/lib/i18n';

// "Use the NetCyberAI syllabus" (W14-I): above the Taught today list, the school's class and subject pairs that have no
// syllabus map yet, with one button for all of them and one for each. The server decides what is copied (the library
// for the school's recorded board, class and subject); this only shows what it says. When something is copied it tells
// the list below (the 'syllabus-changed' event) to read again.

type Pair = { classId: string; className: string; subjectId: string; subjectName: string; status: 'available' | 'has_units' | 'no_match'; units: number };
type Named = { classId: string; className: string; subjectId: string; subjectName: string };
type Run = { copied: (Named & { units: number })[]; leftAlone: (Named & { units: number })[]; noMatch: Named[]; unitsCopied: number };

export const SYLLABUS_CHANGED = 'syllabus-changed';
const TAP = 'min-h-[48px] rounded-md px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire disabled:opacity-60';

export function SyllabusLibraryPanel() {
  const { t, lang } = useT();
  const toast = useToast();
  const [plan, setPlan] = useState<{ board: string | null; pairs: Pair[] } | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/app/syllabus/library', { cache: 'no-store' }).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    if (body && Array.isArray(body.pairs)) setPlan(body);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function copy(only?: Pair) {
    setBusy(true);
    const res = await fetch('/api/app/syllabus/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(only ? { classId: only.classId, subjectId: only.subjectId } : {}) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    if (!res?.ok) {
      toast.show(t(!res ? 'syllab.lib.needsNetwork' : res.status === 403 ? 'syllab.lib.notAllowed' : 'syllab.lib.failed'), 'danger');
      return;
    }
    setRun(body as Run);
    window.dispatchEvent(new Event(SYLLABUS_CHANGED));
    void load();
  }

  if (!plan || plan.pairs.length === 0) return null;
  const waiting = plan.pairs.filter((p) => p.status === 'available');
  const name = (p: Named) => ({ class: p.className, subject: p.subjectName });
  // Nothing to offer and nothing to report: every class and subject already has its syllabus.
  if (waiting.length === 0 && !run && plan.pairs.every((p) => p.status === 'has_units')) return null;

  return (
    <section lang={lang} data-syllabus-library aria-labelledby="syllabus-library-title" className="mb-4 flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
      <div className="flex flex-col gap-1">
        <h2 id="syllabus-library-title" className="text-base font-bold text-slate">
          {t('syllab.lib.title')}
        </h2>
        <p className="text-sm text-slate/70">{t('syllab.lib.purpose')}</p>
        {plan.board && <p className="text-sm font-semibold text-slate">{t('syllab.lib.board', { board: plan.board.toUpperCase() })}</p>}
      </div>

      {!plan.board ? (
        <p role="status" className="rounded-md bg-tangerine/10 px-3 py-2 text-sm font-semibold text-slate">
          {t('syllab.lib.noBoard')}
        </p>
      ) : (
        <>
          <button type="button" data-library-all disabled={busy || waiting.length === 0} onClick={() => void copy()} className={`${TAP} self-start bg-sapphire text-white`}>
            {t('syllab.lib.all')}
          </button>
          <ul className="flex flex-col gap-2">
            {plan.pairs.map((p) => (
              <li key={`${p.classId}:${p.subjectId}`} data-library-pair={p.status} className="flex flex-wrap items-center gap-2 text-sm text-slate">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{`${p.className} · ${p.subjectName}`}</span>
                  <span className="ml-2 text-slate/70">{p.status === 'available' ? t('syllab.lib.state.available') : p.status === 'has_units' ? tCount(lang, 'syllab.lib.state.has', p.units) : t('syllab.lib.state.none')}</span>
                </span>
                {p.status === 'available' && (
                  <button type="button" disabled={busy} aria-label={t('syllab.lib.oneFor', name(p))} onClick={() => void copy(p)} className={`${TAP} border border-sapphire text-sapphire`}>
                    {t('syllab.lib.one')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {run && (
        <div role="status" data-library-summary className="flex flex-col gap-1 rounded-md bg-off-white p-3 text-sm text-slate">
          <p className="flex items-center gap-2 font-semibold">
            <Badge variant={run.unitsCopied > 0 ? 'success' : 'neutral'}>{run.unitsCopied > 0 ? t('syllab.lib.summary', { units: run.unitsCopied, pairs: run.copied.length }) : t('syllab.lib.nothing')}</Badge>
          </p>
          {run.copied.map((c) => (
            <p key={`c${c.classId}:${c.subjectId}`}>{tCount(lang, 'syllab.lib.copied', c.units, name(c))}</p>
          ))}
          {run.leftAlone.map((c) => (
            <p key={`l${c.classId}:${c.subjectId}`}>{tCount(lang, 'syllab.lib.left', c.units, name(c))}</p>
          ))}
          {run.noMatch.map((c) => (
            <p key={`n${c.classId}:${c.subjectId}`}>{t('syllab.lib.nomatch', name(c))}</p>
          ))}
        </div>
      )}
    </section>
  );
}
