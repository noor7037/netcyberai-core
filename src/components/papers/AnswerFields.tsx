'use client';

import { useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { TAP } from '@/components/exams/SchemeParts';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { DIFFICULTIES, OPTION_KEYS, OPTIONS_MAX, OPTIONS_MIN, type CorrectAnswer, type OptionKey, type QuestionKind } from '@/lib/contracts/marking';
import type { MessageKey } from '@/lib/i18n';
import { toNumber, type QuestionForm } from '@/lib/marking/question-form';
import { SECTION_LETTERS } from '@/lib/papers/blueprint';

// A question's answer fields on the questions screen (docs/36, C361, C362): a choice question's options A to F and
// its right key or keys; a number question's value and how far an answer may be from it; the difficulty and the
// printed section. Rules mark a choice or number question by these on a bubble sheet and online; the server checks
// them again (src/lib/marking/answers.ts). Once a script is approved the number of options and the right answer are
// fixed: only the words change.

export const DIFFICULTY_KEYS: Record<(typeof DIFFICULTIES)[number], MessageKey> = { easy: 'pp.difficulty.easy', medium: 'pp.difficulty.medium', hard: 'pp.difficulty.hard' };

// The answer fields a question keeps when its kind changes: options only on a choice question, a value only on a
// number question.
export function kindChange(f: Pick<QuestionForm, 'options' | 'correct'>, kind: QuestionKind): Partial<QuestionForm> {
  if (kind === 'objective') return { kind, correct: f.correct && 'keys' in f.correct ? f.correct : null };
  return { kind, options: [], correct: kind === 'numerical' && f.correct && 'value' in f.correct ? f.correct : null };
}

export function AnswerFields({ form, idPrefix, disabled, locked, onChange }: { form: QuestionForm; idPrefix: string; disabled: boolean; locked: boolean; onChange: (patch: Partial<QuestionForm>) => void }) {
  const { t } = useT();
  return (
    <div data-answer-fields className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Select id={`${idPrefix}-difficulty`} label={t('pp.q.difficulty')} value={form.difficulty ?? ''} disabled={disabled} onChange={(e) => onChange({ difficulty: (e.target.value || null) as QuestionForm['difficulty'] })}>
          <option value="">{t('pp.q.notSet')}</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>{t(DIFFICULTY_KEYS[d])}</option>
          ))}
        </Select>
        <Select id={`${idPrefix}-section`} label={t('pp.q.section')} value={form.section.trim().toUpperCase()} disabled={disabled} onChange={(e) => onChange({ section: e.target.value })}>
          <option value="">{t('pp.q.noSection')}</option>
          {SECTION_LETTERS.map((s) => (
            <option key={s} value={s}>{t('pp.section', { section: s })}</option>
          ))}
        </Select>
      </div>
      {form.kind === 'objective' && <ChoiceFields form={form} idPrefix={idPrefix} disabled={disabled} locked={locked} onChange={onChange} />}
      {form.kind === 'numerical' && <NumberFields correct={form.correct} idPrefix={idPrefix} disabled={disabled || locked} onChange={(correct) => onChange({ correct })} />}
    </div>
  );
}

function ChoiceFields({ form, idPrefix, disabled, locked, onChange }: { form: QuestionForm; idPrefix: string; disabled: boolean; locked: boolean; onChange: (patch: Partial<QuestionForm>) => void }) {
  const { t } = useT();
  const keys = form.correct && 'keys' in form.correct ? form.correct.keys : [];
  const setText = (i: number, text: string) => onChange({ options: form.options.map((o, j) => (j === i ? { ...o, text } : o)) });
  const toggle = (key: OptionKey, on: boolean) => {
    const next = on ? [...new Set([...keys, key])].sort() : keys.filter((k) => k !== key);
    onChange({ correct: next.length ? ({ keys: next } as CorrectAnswer) : null });
  };
  const add = () => {
    // A question with no options yet starts with two.
    const n = form.options.length === 0 ? OPTIONS_MIN : form.options.length + 1;
    onChange({ options: OPTION_KEYS.slice(0, n).map((key, i) => ({ key, text: form.options[i]?.text ?? '' })) });
  };
  const removeLast = () => {
    const options = form.options.length <= OPTIONS_MIN ? [] : form.options.slice(0, -1);
    const left = new Set(options.map((o) => o.key));
    const kept = keys.filter((k) => left.has(k));
    onChange({ options, correct: kept.length ? { keys: kept } : null });
  };
  return (
    <fieldset data-choice-options className="flex flex-col gap-2">
      <legend className="flex flex-wrap items-center gap-x-1 text-sm font-semibold">
        {t('pp.q.options')}
        <InfoTip>{t('pp.q.optionsHow')}</InfoTip>
      </legend>
      {form.options.map((o, i) => (
        <div key={o.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <Input id={`${idPrefix}-opt-${o.key}`} label={t('pp.q.option', { key: o.key })} maxLength={500} value={o.text} disabled={disabled} onChange={(e) => setText(i, e.target.value)} />
          <Checkbox id={`${idPrefix}-right-${o.key}`} label={t('pp.q.right')} checked={keys.includes(o.key)} disabled={disabled || locked} onChange={(e) => toggle(o.key, e.target.checked)} />
        </div>
      ))}
      {!form.options.length && <p className="text-slate/70">{t('pp.q.noOptions')}</p>}
      {!disabled && !locked && (
        <div className="flex flex-wrap gap-2">
          {form.options.length < OPTIONS_MAX && (
            <button type="button" data-option-add className={TAP} onClick={add}>
              {t('pp.q.optionAdd')}
            </button>
          )}
          {form.options.length > 0 && (
            <button type="button" data-option-remove className={TAP} onClick={removeLast}>
              {t('pp.q.optionRemove')}
            </button>
          )}
        </div>
      )}
      {form.options.length > 0 && !keys.length && <p className="text-amber-text">{t('pp.q.noRight')}</p>}
    </fieldset>
  );
}

// A number question's answer: typed as words until they are a number. Empty: rules do not mark it.
function NumberFields({ correct, idPrefix, disabled, onChange }: { correct: CorrectAnswer | null; idPrefix: string; disabled: boolean; onChange: (c: CorrectAnswer | null) => void }) {
  const { t } = useT();
  const start = correct && 'value' in correct ? correct : null;
  const [value, setValue] = useState(start ? String(start.value) : '');
  const [tolerance, setTolerance] = useState(start ? String(start.tolerance) : '');
  const v = toNumber(value);
  const tol = tolerance.trim() === '' ? 0 : toNumber(tolerance);
  const valueBad = value.trim() !== '' && !Number.isFinite(v);
  const tolBad = !Number.isFinite(tol) || tol < 0;
  const send = (nextValue: string, nextTol: string) => {
    const a = toNumber(nextValue);
    const b = nextTol.trim() === '' ? 0 : toNumber(nextTol);
    if (nextValue.trim() === '') onChange(null);
    else if (Number.isFinite(a) && Number.isFinite(b) && b >= 0) onChange({ value: a, tolerance: b });
  };
  return (
    <div data-number-answer className="grid grid-cols-2 gap-3">
      <Input
        id={`${idPrefix}-value`}
        label={t('pp.q.value')}
        inputMode="decimal"
        value={value}
        disabled={disabled}
        error={valueBad ? t('pp.q.valueBad') : undefined}
        helperText={t('pp.q.valueHow')}
        onChange={(e) => {
          setValue(e.target.value);
          send(e.target.value, tolerance);
        }}
      />
      <Input
        id={`${idPrefix}-tolerance`}
        label={t('pp.q.tolerance')}
        inputMode="decimal"
        value={tolerance}
        disabled={disabled}
        error={tolBad ? t('pp.q.valueBad') : undefined}
        helperText={t('pp.q.toleranceHow')}
        onChange={(e) => {
          setTolerance(e.target.value);
          send(value, e.target.value);
        }}
      />
    </div>
  );
}
