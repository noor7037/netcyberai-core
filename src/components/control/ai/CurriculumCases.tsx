'use client';

import { useMemo, useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { Select } from '@/components/ui/Select';
import { PRIMARY } from './shared';
import type { LabData } from './QualityLab';
import type { MessageKey } from '@/lib/i18n';

// "Add curriculum cases" (W9-D): questions written from the syllabus by a fixed template, no model called, added to the
// Lab's list for a board (and a class and subject). One already stored is skipped. The Lab's run scores them like any
// other case. Words: control.ai.lab.curriculum.*.

export type Scope = { boardId: string; classLevel: number; subject: string };

export function CurriculumCases({ scopes, total, disabled, onAdded }: { scopes: Scope[]; total: number; disabled: boolean; onAdded: (fresh: LabData) => void }) {
  const { t, has } = useWords();
  const boards = useMemo(() => Array.from(new Set(scopes.map((s) => s.boardId))).sort(), [scopes]);
  const [board, setBoard] = useState(boards[0] ?? '');
  const [cls, setCls] = useState('');
  const [subject, setSubject] = useState('');
  const [perUnit, setPerUnit] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const classes = useMemo(() => Array.from(new Set(scopes.filter((s) => s.boardId === board).map((s) => s.classLevel))).sort((a, b) => a - b), [scopes, board]);
  const subjects = useMemo(() => Array.from(new Set(scopes.filter((s) => s.boardId === board && (!cls || s.classLevel === Number(cls))).map((s) => s.subject))).sort(), [scopes, board, cls]);
  const subjectLabel = (s: string) => (has(`fam.subject.${s}`) ? t(`fam.subject.${s}` as MessageKey) : s.replace(/_/g, ' '));

  const add = async () => {
    setBusy(true);
    setNote(null);
    const body = { action: 'curriculum', boardId: board, classLevel: cls ? Number(cls) : null, subject: subject || null, perUnit: perUnit ? Number(perUnit) : null };
    const res = await fetch('/api/control/ai/lab', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    if (!res?.ok || !got?.ok) {
      setBusy(false);
      return setNote({ ok: false, text: got?.code === 'too_many' ? t('control.ai.lab.curriculum.tooMany') : t('control.ai.lab.curriculum.error') });
    }
    const fresh = await fetch('/api/control/ai/lab', { cache: 'no-store' }).catch(() => null);
    const data = fresh?.ok ? ((await fresh.json().catch(() => null)) as LabData | null) : null;
    if (data) onAdded(data);
    setBusy(false);
    setNote({ ok: true, text: got.units === 0 ? t('control.ai.lab.curriculum.noUnits') : t('control.ai.lab.curriculum.done', { added: got.added, skipped: got.skipped, units: got.units }) });
  };

  return (
    <div data-lab-curriculum className="flex flex-col gap-3 rounded-xl border border-slate/10 p-3">
      <h3 className="text-base font-bold">{t('control.ai.lab.curriculum.title')}</h3>
      <p className="text-sm text-slate/80">{t('control.ai.lab.curriculum.how')}</p>
      <p className="text-sm" data-lab-curriculum-total>
        {t('control.ai.lab.curriculum.stored', { count: total })}
      </p>
      {boards.length === 0 ? (
        <p className="text-sm text-slate/80">{t('control.ai.lab.curriculum.noSyllabus')}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select id="lab-cur-board" label={t('control.ai.lab.curriculum.board')} value={board} disabled={busy || disabled} onChange={(e) => { setBoard(e.target.value); setCls(''); setSubject(''); }}>
              {boards.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
            <Select id="lab-cur-class" label={t('control.ai.lab.curriculum.class')} value={cls} disabled={busy || disabled} onChange={(e) => { setCls(e.target.value); setSubject(''); }}>
              <option value="">{t('control.ai.lab.curriculum.all')}</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {t('control.ai.lab.curriculum.classN', { n: c })}
                </option>
              ))}
            </Select>
            <Select id="lab-cur-subject" label={t('control.ai.lab.curriculum.subject')} value={subject} disabled={busy || disabled} onChange={(e) => setSubject(e.target.value)}>
              <option value="">{t('control.ai.lab.curriculum.all')}</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {subjectLabel(s)}
                </option>
              ))}
            </Select>
            <Select id="lab-cur-per" label={t('control.ai.lab.curriculum.perUnit')} value={perUnit} disabled={busy || disabled} onChange={(e) => setPerUnit(e.target.value)}>
              <option value="">{t('control.ai.lab.curriculum.everyType')}</option>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {t('control.ai.lab.curriculum.upTo', { n })}
                </option>
              ))}
            </Select>
          </div>
          <button type="button" className={`${PRIMARY} self-start`} disabled={busy || disabled || !board} onClick={add} data-lab-curriculum-add>
            {busy ? t('control.ai.lab.curriculum.adding') : t('control.ai.lab.curriculum.add')}
          </button>
        </>
      )}
      {note && (
        <p role="status" data-lab-curriculum-note className={`text-sm font-semibold ${note.ok ? 'text-emerald-800' : 'text-red-800'}`}>
          {note.text}
        </p>
      )}
    </div>
  );
}
