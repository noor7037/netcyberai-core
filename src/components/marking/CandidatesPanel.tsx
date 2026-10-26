'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { momentWords, numberWords } from '@/components/exams/exam-format';
import { PRIMARY, TAP } from '@/components/exams/SchemeParts';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import type { ExamCandidates } from '@/lib/contracts/marking';
import type { ClassNumbers } from '@/lib/marking/numbers';
import { ask, childLine, errorWords } from './parts';

// An exam's candidates and exam numbers, on the exam (C348). Per class: the children on the roll, the ones the office
// withdrew from this exam, who is left sitting it, and how many have an exam number. The office turns exam numbers on
// or off for the exam (with a prefix), withdraws a child with a reason and takes a withdrawal back; a teacher reads.
// Official roll numbers are never touched. Each class has a printable list of its exam numbers. Counted from the rows
// by the database every time, never typed.

export function CandidatesPanel({ examId }: { examId: string }) {
  const { t, lang } = useT();
  const [opened, setOpened] = useState(false);
  const [data, setData] = useState<ExamCandidates | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [prefix, setPrefix] = useState('');
  const [wClass, setWClass] = useState('');
  const [wChildren, setWChildren] = useState<ClassNumbers['children']>([]);
  const [wChild, setWChild] = useState('');
  const [wReason, setWReason] = useState('');

  const load = useCallback(async () => {
    const r = await ask('GET', `/api/app/exams/${examId}/candidates`);
    setFailed(!r.ok);
    if (r.ok) {
      const got = r.body as unknown as ExamCandidates;
      setData(got);
      setPrefix(got.seatPrefix);
    }
  }, [examId]);
  useEffect(() => {
    if (opened && !data) void load();
  }, [opened, data, load]);

  // The class chosen for a withdrawal: its children from the exam's own list of that class.
  useEffect(() => {
    setWChild('');
    setWChildren([]);
    if (!wClass) return;
    let live = true;
    void ask('GET', `/api/app/exams/${examId}/classes/${wClass}/numbers`).then((r) => {
      if (live && r.ok) setWChildren((r.body as unknown as ClassNumbers).children.filter((c) => !c.withdrawn));
    });
    return () => {
      live = false;
    };
  }, [examId, wClass]);

  const post = async (payload: Record<string, unknown>, done: string) => {
    setBusy(true);
    setNote(null);
    const r = await ask('POST', `/api/app/exams/${examId}/candidates`, payload);
    setBusy(false);
    if (!r.ok) return setNote({ ok: false, text: errorWords(t, r) });
    setNote({ ok: true, text: done });
    await load();
    return true;
  };

  const withdraw = async () => {
    const ok = await post({ action: 'withdraw', studentId: wChild, reason: wReason }, t('mk.cand.withdrawn'));
    if (ok) {
      setWChild('');
      setWReason('');
      setWClass('');
    }
  };

  const seat = data?.numbering === 'seat';

  return (
    <details data-candidates={examId} className="rounded-md border border-slate/10 p-3" onToggle={(e) => setOpened((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="flex min-h-[44px] cursor-pointer items-center font-bold">{t('mk.cand.title')}</summary>
      {opened && failed && <p role="alert" className="mt-2 text-slate">{t('mk.cand.failed')}</p>}
      {opened && data && (
        <div className="mt-2 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-1">
            <p className="min-w-0">{t('mk.cand.how')}</p>
            <InfoTip>{t('mk.cand.howMore')}</InfoTip>
          </div>

          <ul data-candidate-classes className="flex flex-col gap-2">
            {data.classes.map((c) => (
              <li key={c.classId} data-candidate-class={c.classId} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
                <p className="font-bold">{c.className}</p>
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div><dt className="text-slate/70">{t('mk.cand.onRoll')}</dt><dd data-on-roll className="text-lg font-bold">{numberWords(c.onRoll, lang)}</dd></div>
                  <div><dt className="text-slate/70">{t('mk.cand.withdrawnCount')}</dt><dd data-withdrawn className="text-lg font-bold">{numberWords(c.withdrawn, lang)}</dd></div>
                  <div><dt className="text-slate/70">{t('mk.cand.candidates')}</dt><dd data-candidates-count className="text-lg font-bold">{numberWords(c.candidates, lang)}</dd></div>
                  <div><dt className="text-slate/70">{t('mk.cand.numbered')}</dt><dd data-numbered className="text-lg font-bold">{seat ? numberWords(c.numbered, lang) : '—'}</dd></div>
                </dl>
                <a href={`/app/exams/${examId}/classes/${c.classId}/numbers`} data-numbers-link className={`${TAP} self-start`}>
                  {seat ? t('mk.cand.numbersList') : t('mk.cand.rollList')}
                </a>
              </li>
            ))}
          </ul>

          {data.mayChange ? (
            <div data-numbering className="flex flex-col gap-2 rounded-md bg-off-white p-3">
              <Switch
                id={`mk-numbering-${examId}`}
                label={t('mk.cand.useNumbers')}
                stateText={seat ? t('mk.cand.on') : t('mk.cand.off')}
                checked={seat}
                disabled={busy}
                onChange={(e) => void post({ action: 'numbering', numbering: e.target.checked ? 'seat' : 'roll', prefix }, e.target.checked ? t('mk.cand.numbersOn') : t('mk.cand.numbersOff'))}
              />
              <div className="flex flex-wrap items-start gap-2">
                <div className="w-40">
                  <Input id={`mk-prefix-${examId}`} label={t('mk.cand.prefix')} maxLength={6} value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} helperText={t('mk.cand.prefixHow')} />
                </div>
                <button type="button" data-prefix-save className={TAP} disabled={busy || prefix === data.seatPrefix} onClick={() => void post({ action: 'numbering', numbering: data.numbering, prefix }, t('mk.cand.prefixSaved'))}>
                  {t('mk.cand.prefixSave')}
                </button>
              </div>
            </div>
          ) : (
            <p data-numbering-readonly>{seat ? t('mk.cand.readOn', { prefix: data.seatPrefix || '—' }) : t('mk.cand.readOff')}</p>
          )}

          <div data-withdrawals className="flex flex-col gap-2">
            <h4 className="font-bold">{t('mk.cand.withdrawals')}</h4>
            {data.withdrawals.length === 0 ? (
              <p className="text-slate/70">{t('mk.cand.noWithdrawals')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.withdrawals.map((w) => (
                  <li key={w.studentId} data-withdrawal={w.studentId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 p-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{childLine({ name: w.name, rollNo: w.rollNo })} · {w.className}</p>
                      <p className="text-slate/70">{w.reason} · {momentWords(w.withdrawnAt, lang)}</p>
                    </div>
                    {data.mayChange && (
                      <button type="button" data-withdrawal-undo className={TAP} disabled={busy} onClick={() => void post({ action: 'undo', studentId: w.studentId }, t('mk.cand.restored'))}>
                        {t('mk.cand.undo')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {data.mayChange && (
            <fieldset data-withdraw-form className="flex flex-col gap-3 rounded-md border border-slate/10 p-3">
              <legend className="px-1 font-bold">{t('mk.cand.withdrawTitle')}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select id={`mk-w-class-${examId}`} label={t('mk.cand.class')} value={wClass} onChange={(e) => setWClass(e.target.value)}>
                  <option value="">—</option>
                  {data.classes.map((c) => (
                    <option key={c.classId} value={c.classId}>{c.className}</option>
                  ))}
                </Select>
                <Select id={`mk-w-child-${examId}`} label={t('mk.cand.child')} value={wChild} disabled={!wClass} onChange={(e) => setWChild(e.target.value)}>
                  <option value="">—</option>
                  {wChildren.map((c) => (
                    <option key={c.studentId} value={c.studentId}>{childLine(c)}</option>
                  ))}
                </Select>
              </div>
              <Input id={`mk-w-reason-${examId}`} label={t('mk.cand.reason')} maxLength={300} value={wReason} onChange={(e) => setWReason(e.target.value)} helperText={t('mk.cand.reasonHow')} />
              <button type="button" data-withdraw-save className={`${PRIMARY} self-start`} disabled={busy || !wChild || wReason.trim().length < 3} onClick={() => void withdraw()}>
                {t('mk.cand.withdraw')}
              </button>
            </fieldset>
          )}

          {note && (
            <p role="status" data-candidates-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
              {note.text}
            </p>
          )}
        </div>
      )}
    </details>
  );
}
