'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { useToast } from '@/components/ui/Toast';

// W20-B (docs/42 H2): the students becoming chronically absent, the reason the rule gives, and "Tell the family"
// (the principal's one tap; once in 7 days). The rule is on the server (src/lib/early-warning/chronic-absence.ts); this
// screen only says what it was told. The reason shape mirrors that file, for display only.
type Reason =
  | { kind: 'recent'; absent: number; of: number }
  | { kind: 'consecutive'; days: number; endedOn: string }
  | { kind: 'rate'; absent: number; of: number; percent: number };
type Row = { studentId: string; name: string; className: string; reasons: Reason[]; toldOn: string | null; daysSinceTold: number | null; tellAgainOn: string | null };

export function ChronicAbsence() {
  const { t } = useT();
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [mayTell, setMayTell] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/app/attendance/chronic', { cache: 'no-store' });
      if (!res.ok) throw new Error('read');
      const data = (await res.json()) as { rows: Row[]; mayTell: boolean };
      setRows(data.rows);
      setMayTell(data.mayTell);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function tell(studentId: string) {
    setBusy(studentId);
    try {
      const res = await fetch('/api/app/attendance/chronic/tell', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId }) });
      if (res.ok) toast.show(t('att.chronic.sent'), 'success');
      else {
        const code = ((await res.json().catch(() => ({}))) as { code?: string }).code;
        toast.show(t(code === 'told_recently' ? 'att.chronic.error.told_recently' : code === 'nobody' ? 'att.chronic.error.nobody' : 'att.chronic.error.other'), 'danger');
      }
    } catch {
      toast.show(t('att.chronic.error.other'), 'danger');
    }
    setBusy(null);
    await load();
  }

  const say = (r: Reason) =>
    r.kind === 'consecutive' ? t('att.chronic.reason.consecutive', { days: r.days }) : r.kind === 'recent' ? t('att.chronic.reason.recent', { absent: r.absent, of: r.of }) : t('att.chronic.reason.rate', { absent: r.absent, of: r.of, percent: r.percent });
  const toldLine = (r: Row) => (r.toldOn === null ? t('att.chronic.never') : r.daysSinceTold === 0 ? t('att.chronic.toldToday') : t('att.chronic.toldDays', { days: r.daysSinceTold ?? 0 }));

  return (
    <section data-chronic-absence aria-labelledby="chronic-title" className="flex flex-col gap-3 rounded-md border border-slate/10 bg-white p-3 text-sm text-slate">
      <div>
        <h2 id="chronic-title" className="text-base font-semibold">
          {t('att.chronic.title')}
        </h2>
        <p className="text-slate/80">{t('att.chronic.intro')}</p>
      </div>
      {failed && <p role="alert" className="text-red-800">{t('att.chronic.failed')}</p>}
      {!failed && rows === null && <p>{t('att.chronic.loading')}</p>}
      {rows !== null && rows.length === 0 && <p>{t('att.chronic.empty')}</p>}
      {rows !== null && rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.studentId} data-chronic-row className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 p-3">
              <div className="min-w-0">
                <p className="font-semibold">
                  {r.name} <span className="font-normal text-slate/80">· {r.className}</span>
                </p>
                {r.reasons.map((x) => (
                  <p key={x.kind}>{say(x)}</p>
                ))}
                <p className="text-xs text-slate/80">{toldLine(r)}</p>
                {r.tellAgainOn && <p className="text-xs text-slate/80">{t('att.chronic.again', { date: r.tellAgainOn })}</p>}
              </div>
              {mayTell ? (
                <button
                  type="button"
                  data-tell
                  disabled={busy !== null || r.tellAgainOn !== null}
                  onClick={() => void tell(r.studentId)}
                  className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-off-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === r.studentId ? t('att.chronic.sending') : r.tellAgainOn ? t('att.chronic.told') : t('att.chronic.tell')}
                </button>
              ) : (
                <p className="text-xs text-slate/80">{t('att.chronic.principalOnly')}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
