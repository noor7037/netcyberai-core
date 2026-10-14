'use client';

import { useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import type { MessageKey } from '@/lib/i18n';
import type { WeekProblem } from '@/lib/timetable/generator';
import { CARD, dayKey, namer, PRIMARY, SECONDARY, send, when, type Draft, type GeneratorData } from './generator-ui';
import { WeekCompare } from './WeekCompare';

// The proposal (C229): what was placed and what could not be, and why; one class at a time beside the timetable in
// force, with every changed period highlighted; two taps swap two periods of the class; then a person publishes it
// (after reading what it replaces) or discards it. A proposal made before the timetable changed, or one that breaks
// a rule now, cannot be published, and says so.

type At = { weekday: number; period: number };
const SWAP_REFUSED: Record<string, MessageKey> = { teacher_clash: 'ttg.swap.teacher_clash', unavailable: 'ttg.swap.unavailable', consecutive_limit: 'ttg.swap.consecutive_limit' };
const PUBLISH_REFUSED: Record<string, MessageKey> = {
  timetable_changed: 'ttg.publish.timetable_changed',
  rules_changed: 'ttg.publish.rules_changed',
  week_problem: 'ttg.publish.week_problem',
  missing_not_accepted: 'ttg.publish.missing_not_accepted',
  teacher_clash: 'ttg.publish.teacher_clash',
};

export function GeneratorDraft({ draft, data, onChanged }: { draft: Draft; data: GeneratorData; onChanged: () => void }) {
  const { t, tCount, lang } = useT();
  const toast = useToast();
  const names = namer(data.names);
  const [classId, setClassId] = useState(draft.classIds[0] ?? '');
  const [picked, setPicked] = useState<At | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [withMissing, setWithMissing] = useState(false);
  const notPlaced = draft.unplaced.reduce((n, u) => n + u.wanted - u.placed, 0);
  const count = (kind: string) => draft.changes.filter((c) => c.kind === kind).length;
  const blocked = draft.stale || draft.rulesChanged || draft.problems.length > 0;

  async function pick(at: At) {
    setRefused(null);
    if (!picked) {
      setPicked(at);
      return;
    }
    if (picked.weekday === at.weekday && picked.period === at.period) {
      setPicked(null);
      return;
    }
    setBusy(true);
    const r = await send('/api/app/timetable/generator', 'POST', { action: 'swap', proposalId: draft.proposalId, classId, a: picked, b: at });
    setBusy(false);
    setPicked(null);
    if (r.ok) {
      toast.show(t('ttg.draft.swapped'), 'success');
      onChanged();
      return;
    }
    setRefused(t(SWAP_REFUSED[String(r.body.code)] ?? 'ttg.swap.failed'));
  }

  async function publish() {
    setBusy(true);
    const r = await send('/api/app/timetable/generator', 'POST', { action: 'publish', proposalId: draft.proposalId, withMissing });
    setBusy(false);
    setConfirming(false);
    if (r.ok) {
      toast.show(t('ttg.publish.done'), 'success');
      onChanged();
      return;
    }
    setRefused(t(PUBLISH_REFUSED[String(r.body.code)] ?? 'ttg.publish.failed'));
    onChanged();
  }

  async function discard() {
    setBusy(true);
    const r = await send('/api/app/timetable/generator', 'POST', { action: 'discard', proposalId: draft.proposalId });
    setBusy(false);
    toast.show(t(r.ok ? 'ttg.draft.discarded' : 'ttg.publish.failed'), r.ok ? 'success' : 'danger');
    onChanged();
  }

  const problemText = (p: WeekProblem) =>
    t(`ttg.problem.${p.code}` as MessageKey, { class: names.cls(p.slot.classId), teacher: names.teacher(p.slot.teacherUserId), day: t(dayKey(p.slot.weekday)), period: p.slot.period });

  return (
    <section data-ttg-draft={draft.proposalId} className={CARD} aria-labelledby="ttg-draft-title">
      <h2 id="ttg-draft-title" className="text-base font-bold text-slate">
        {t('ttg.draft.title')}
      </h2>
      <p className="text-sm text-slate/70">{t('ttg.draft.by', { date: when(draft.proposedAt, lang), name: draft.proposedByName })}</p>
      <ul className="flex flex-col gap-1 text-sm text-slate">
        <li data-ttg-placed={draft.entries.length}>{tCount('ttg.draft.placed', draft.entries.length)}</li>
        <li data-ttg-changes={draft.changes.length}>{tCount('ttg.draft.changes', draft.changes.length)}</li>
        {draft.unplaced.length === 0 && <li className="font-semibold">{t('ttg.draft.allPlaced')}</li>}
      </ul>

      {draft.unplaced.length > 0 && (
        <div data-ttg-unplaced={notPlaced} className="flex flex-col gap-2 rounded-md border border-amber/40 bg-amber/10 p-3">
          <h3 className="text-sm font-bold text-slate">{tCount('ttg.draft.unplacedTitle', notPlaced)}</h3>
          <p className="text-sm text-slate">{t('ttg.draft.unplacedHow')}</p>
          <ul className="flex flex-col gap-1 text-sm text-slate">
            {draft.unplaced.map((u) => (
              <li key={`${u.classId}:${u.subjectId}`} data-ttg-unplaced-line={u.reason}>
                {t('ttg.draft.unplacedLine', { class: names.cls(u.classId), subject: names.subject(u.subjectId), teacher: u.teacherUserId ? names.teacher(u.teacherUserId) : t('ttg.draft.noTeacher'), placed: u.placed, wanted: u.wanted })}{' '}
                {t(`ttg.unplaced.${u.reason}` as MessageKey)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {draft.stale && (
        <p role="alert" data-ttg-stale className="rounded-md border border-red-800/30 p-3 text-sm text-red-800">
          {t('ttg.draft.stale')}
        </p>
      )}
      {draft.rulesChanged && (
        <p role="alert" data-ttg-rules-changed className="rounded-md border border-red-800/30 p-3 text-sm text-red-800">
          {t('ttg.draft.rulesChanged')}
        </p>
      )}
      {draft.problems.length > 0 && (
        <div role="alert" data-ttg-problems className="rounded-md border border-red-800/30 p-3 text-sm text-slate">
          <p className="font-semibold text-red-800">{t('ttg.draft.problemsTitle')}</p>
          <ul className="mt-1 list-disc pl-5">
            {draft.problems.map((p, i) => (
              <li key={`${p.code}-${i}`}>{problemText(p)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="max-w-sm">
        <Select
          id="ttg-draft-class"
          label={t('ttg.draft.class')}
          value={classId}
          onChange={(e) => {
            setClassId(e.target.value);
            setPicked(null);
            setRefused(null);
          }}
        >
          {draft.classIds.map((id) => (
            <option key={id} value={id}>
              {names.cls(id)}
            </option>
          ))}
        </Select>
      </div>
      <p className="text-sm text-slate" aria-live="polite">
        {t(picked ? 'ttg.draft.swapPicked' : 'ttg.draft.swapHow')}
      </p>
      {refused && (
        <p role="alert" data-ttg-refused className="rounded-md border border-red-800/30 p-3 text-sm text-red-800">
          {refused}
        </p>
      )}
      {classId && (
        <WeekCompare
          classId={classId}
          days={draft.rules.days}
          periods={draft.rules.periods}
          left={draft.current}
          right={draft.entries}
          leftLabel={t('ttg.draft.now')}
          rightLabel={t('ttg.draft.proposed')}
          names={names}
          changes={draft.changes}
          onPick={pick}
          picked={picked}
          busy={busy}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" data-ttg-publish disabled={busy || blocked} onClick={() => setConfirming(true)} className={PRIMARY}>
          {t('ttg.draft.publish')}
        </button>
        <button type="button" data-ttg-discard disabled={busy} onClick={discard} className={SECONDARY}>
          {t('ttg.draft.discard')}
        </button>
      </div>

      <Modal open={confirming} onClose={() => setConfirming(false)} title={t('ttg.publish.title')}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void publish();
          }}
        >
          <p data-ttg-publish-what className="text-sm text-slate">
            {t('ttg.publish.what', { classes: draft.classIds.length, added: count('added'), changed: count('changed'), removed: count('removed') })}
          </p>
          {draft.unplaced.length > 0 && (
            <label className="flex min-h-[44px] items-center gap-3 text-sm text-slate">
              <input type="checkbox" data-ttg-with-missing checked={withMissing} onChange={(e) => setWithMissing(e.target.checked)} className="h-5 w-5" required />
              {tCount('ttg.publish.missing', notPlaced)}
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" data-ttg-publish-confirm disabled={busy || (draft.unplaced.length > 0 && !withMissing)} className={PRIMARY}>
              {t('ttg.publish.confirm')}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={SECONDARY}>
              {t('ttg.publish.cancel')}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
