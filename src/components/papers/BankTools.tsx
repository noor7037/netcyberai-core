'use client';

import { useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { numberWords } from '@/components/exams/exam-format';
import { PRIMARY, TAP } from '@/components/exams/SchemeParts';
import { ask, errorWords } from '@/components/marking/parts';
import { Checkbox } from '@/components/ui/Checkbox';
import { Select } from '@/components/ui/Select';
import type { MarkingQuestion, MarkingUnit, SetupScreen } from '@/lib/contracts/marking';
import type { MessageKey } from '@/lib/i18n';
import type { BankList, BankQuestion } from '@/lib/papers/types';
import { DIFFICULTY_KEYS } from './AnswerFields';

// The school's question bank on a paper's questions screen (C363): "Replace" one question with a kept bank question of
// the same marks, or with one the AI writes anew; and "Pick from the bank" to add questions at the end. The bank leaves
// out questions already on the paper and those the class had in its last two papers of the subject, and says how many.
// The server decides who may (whoever may mark the paper) and refuses while the paper is being made.

const KIND_KEYS: Record<BankQuestion['kind'], MessageKey> = {
  objective: 'mk.kind.objective',
  short: 'mk.kind.short',
  long: 'mk.kind.long',
  numerical: 'mk.kind.numerical',
  diagram: 'mk.kind.diagram',
};

export function refusalWords(t: (k: MessageKey, p?: Record<string, string | number>) => string, r: { status: number; body: Record<string, unknown> | null }): string {
  const code = typeof r.body?.code === 'string' ? r.body.code : '';
  const known: Record<string, MessageKey> = {
    busy: 'pp.refused.busy',
    closed: 'pp.refused.closed',
    locked: 'pp.refused.locked',
    gone: 'pp.refused.gone',
    ai_off: 'pp.refused.ai_off',
    no_topic: 'pp.refused.no_topic',
    has_questions: 'pp.refused.has_questions',
    no_blueprint: 'pp.refused.no_blueprint',
    plan: 'pp.refused.plan',
    blueprint: 'pp.refused.blueprint',
    empty: 'pp.refused.empty',
    structure: 'pp.refused.structure',
    too_many: 'pp.refused.too_many',
    not_kept: 'pp.print.not_kept',
    changed: 'pp.print.changed',
    drafts: 'pp.print.drafts',
    no_questions: 'pp.print.no_questions',
  };
  return known[code] ? t(known[code]) : errorWords(t, r);
}

function BankCard({ q, action }: { q: BankQuestion; action: React.ReactNode }) {
  const { t, lang } = useT();
  return (
    <li data-bank-question={q.bankId} className="flex flex-col gap-2 rounded-md border border-slate/15 p-3">
      <p className="text-slate/70">
        {q.chapter}
        {q.topic ? `: ${q.topic}` : ''} · {t(KIND_KEYS[q.kind])} · {t('pp.bank.marks', { marks: numberWords(q.maxMarks, lang) })}
        {q.difficulty ? ` · ${t(DIFFICULTY_KEYS[q.difficulty])}` : ''}
      </p>
      <p className="whitespace-pre-line">{q.prompt}</p>
      {q.options.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-slate/80">
          {q.options.map((o) => (
            <li key={o.key}>
              ({o.key}) {o.text}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate/70">{q.usedCount ? t('pp.bank.used', { n: q.usedCount }) : t('pp.bank.unused')}</span>
        {action}
      </div>
    </li>
  );
}

// "Replace": with a bank question of the same marks (and kind), or written anew by the AI.
export function ReplaceQuestion({ paperId, question, units, ai, disabled, onScreen, onAsked }: { paperId: string; question: MarkingQuestion; units: readonly MarkingUnit[]; ai: boolean; disabled: boolean; onScreen: (s: SetupScreen) => void; onAsked: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<BankList | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const chapter = units.find((u) => u.unitId === question.unitId)?.chapter ?? null;

  const load = async () => {
    setOpen(true);
    setNote(null);
    const q = new URLSearchParams({ kind: question.kind, marks: String(question.maxMarks), ...(chapter ? { chapter } : {}) });
    const r = await ask('GET', `/api/app/marking/papers/${paperId}/bank?${q.toString()}`);
    if (r.ok) setList(r.body as unknown as BankList);
    else setNote(refusalWords(t, r));
  };
  const use = async (bankId: string) => {
    setBusy(true);
    const r = await ask('POST', `/api/app/marking/questions/${question.questionId}/replace`, { from: 'bank', bankId });
    setBusy(false);
    if (!r.ok) return setNote(refusalWords(t, r));
    setOpen(false);
    onScreen(r.body?.screen as unknown as SetupScreen);
  };
  const write = async () => {
    setBusy(true);
    const r = await ask('POST', `/api/app/marking/questions/${question.questionId}/replace`, { from: 'ai' });
    setBusy(false);
    if (!r.ok) return setNote(refusalWords(t, r));
    setOpen(false);
    onAsked();
  };

  if (!open)
    return (
      <button type="button" data-question-replace className={TAP} disabled={disabled} onClick={() => void load()}>
        {t('pp.replace.open')}
      </button>
    );
  return (
    <div data-replace-panel className="flex w-full flex-col gap-2 rounded-md bg-off-white p-3">
      <p className="font-semibold">{t('pp.replace.title', { label: question.label })}</p>
      {ai && (
        <button type="button" data-replace-ai className={`${TAP} self-start`} disabled={busy || !question.unitId} onClick={() => void write()}>
          {t('pp.replace.ai')}
        </button>
      )}
      {!question.unitId && <p className="text-slate/70">{t('pp.refused.no_topic')}</p>}
      {list && (
        <>
          <p className="text-slate/70">{list.questions.length ? t('pp.replace.fromBank') : t('pp.bank.none')}</p>
          {list.skipped > 0 && <p className="text-slate/70">{t('pp.bank.skipped', { n: list.skipped })}</p>}
          <ul className="flex flex-col gap-2">
            {list.questions.slice(0, 20).map((q) => (
              <BankCard key={q.bankId} q={q} action={<button type="button" className={TAP} disabled={busy} onClick={() => void use(q.bankId)}>{t('pp.replace.use')}</button>} />
            ))}
          </ul>
        </>
      )}
      {note && <p role="status" className="font-semibold text-red-800">{note}</p>}
      <button type="button" className={`${TAP} self-start`} onClick={() => setOpen(false)}>
        {t('pp.close')}
      </button>
    </div>
  );
}

// "Pick from the bank": kept questions of the class's grade and subject, by chapter, added at the end of the paper.
export function BankPicker({ paperId, disabled, onScreen }: { paperId: string; disabled: boolean; onScreen: (s: SetupScreen) => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [chapter, setChapter] = useState('');
  const [list, setList] = useState<BankList | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = async (ch: string) => {
    setOpen(true);
    setNote(null);
    setChapter(ch);
    const r = await ask('GET', `/api/app/marking/papers/${paperId}/bank${ch ? `?chapter=${encodeURIComponent(ch)}` : ''}`);
    if (r.ok) setList(r.body as unknown as BankList);
    else setNote(refusalWords(t, r));
  };
  const add = async () => {
    setBusy(true);
    const r = await ask('POST', `/api/app/marking/papers/${paperId}/bank`, { bankIds: chosen });
    setBusy(false);
    if (!r.ok) return setNote(refusalWords(t, r));
    setChosen([]);
    setOpen(false);
    onScreen(r.body?.screen as unknown as SetupScreen);
  };

  if (!open)
    return (
      <button type="button" data-bank-open className={TAP} disabled={disabled} onClick={() => void load('')}>
        {t('pp.bank.open')}
      </button>
    );
  return (
    <section data-bank-picker className="flex w-full flex-col gap-3 rounded-md border border-slate/15 p-3" aria-labelledby="pp-bank-title">
      <h3 id="pp-bank-title" className="font-bold">{t('pp.bank.title')}</h3>
      {list && (
        <div className="max-w-sm">
          <Select id="pp-bank-chapter" label={t('pp.bank.chapter')} value={chapter} onChange={(e) => void load(e.target.value)}>
            <option value="">{t('pp.bank.allChapters')}</option>
            {list.chapters.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </div>
      )}
      {list && !list.questions.length && <p className="text-slate/70">{t('pp.bank.none')}</p>}
      {list && list.skipped > 0 && <p className="text-slate/70">{t('pp.bank.skipped', { n: list.skipped })}</p>}
      <ul className="flex flex-col gap-2">
        {(list?.questions ?? []).slice(0, 50).map((q) => (
          <BankCard
            key={q.bankId}
            q={q}
            action={<Checkbox id={`pp-bank-${q.bankId}`} label={t('pp.bank.choose')} checked={chosen.includes(q.bankId)} onChange={(e) => setChosen(e.target.checked ? [...chosen, q.bankId] : chosen.filter((x) => x !== q.bankId))} />}
          />
        ))}
      </ul>
      {note && <p role="status" className="font-semibold text-red-800">{note}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" data-bank-add className={PRIMARY} disabled={busy || !chosen.length} onClick={() => void add()}>
          {t('pp.bank.add', { n: chosen.length })}
        </button>
        <button type="button" className={TAP} onClick={() => setOpen(false)}>
          {t('pp.close')}
        </button>
      </div>
    </section>
  );
}
