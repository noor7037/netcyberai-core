'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { bandProblems, gapsAsInPreset, grade, passed } from '@/lib/exams/grading';
import { emptyScheme, LAYOUT_PARTS, schemeFromPreset, validateScheme, type BoardPreset, type GradingScheme } from '@/lib/exams/scheme';
import type { SchemeScreen } from '@/lib/exams/schemes';
import type { MessageKey } from '@/lib/i18n';
import { AddButton, BandsEditor, ComponentsEditor, Field, FIELD, PRIMARY, SECTION, TAP } from './SchemeParts';
import { formToScheme, schemeToForm, type SchemeForm } from './scheme-form';

// The school's grading scheme (docs/27 row 9a, C213). The board first; then the scheme in force, where it came from
// and its gaps; the principal or the school admin changes it, starting from the board's preset or empty, and saving
// makes a new version. "Try it" shows the grade and pass any percent gets, from the same grade() and passed() every
// screen uses. The academic coordinator reads it all.

type Draft = { form: SchemeForm; fromPresetId: string | null; basedOn: number };
type Preset = BoardPreset & { boardName?: string | null; replaced?: boolean };
const PROBLEMS = ['shape', 'decimals', 'band_grade', 'band_meaning', 'band_partial', 'band_mixed', 'band_range', 'band_decimals', 'band_duplicate', 'band_overlap', 'pass_mark', 'component_name', 'component_duplicate', 'component_share', 'component_shares_total', 'component_pass_mark', 'component_parts', 'term_name', 'term_duplicate', 'co_area', 'co_grade', 'too_many'];
const set = <T,>(list: readonly T[], i: number, v: T) => list.map((x, j) => (j === i ? v : x));
const without = <T,>(list: readonly T[], i: number) => list.filter((_, j) => j !== i);

export function SchemeView() {
  const { t, lang } = useT();
  const [data, setData] = useState<SchemeScreen | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [board, setBoard] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const num = useCallback((n: number) => n.toLocaleString(locale, { maximumFractionDigits: 1 }), [locale]);
  const when = (iso: string) => new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
  const day = (ymd: string) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${ymd}T00:00:00Z`));

  const load = useCallback(async () => {
    const res = await fetch('/api/app/exams/scheme', { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as SchemeScreen | null) : null;
    setDenied(res?.status === 403);
    setFailed(!got);
    if (got) {
      setData(got);
      setBoard(got.board.boardId ?? '');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const post = async (payload: unknown): Promise<{ ok: boolean; body: Record<string, unknown> | null }> => {
    setBusy(true);
    setNote(null);
    const res = await fetch('/api/app/exams/scheme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const body = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
    setBusy(false);
    return { ok: !!res?.ok, body };
  };

  const errorWords = (body: Record<string, unknown> | null) => {
    const code = typeof body?.code === 'string' ? body.code : '';
    const at = typeof body?.at === 'number' ? body.at + 1 : 1;
    if (PROBLEMS.includes(code)) return t(`gs.problem.${code}` as MessageKey, { n: at });
    if (['newer_version', 'preset', 'no_board'].includes(code)) return t(`gs.err.${code}` as MessageKey);
    return t('gs.err.other');
  };

  const saveBoard = async () => {
    const r = await post({ action: 'board', boardId: board || null });
    setNote(r.ok ? { ok: true, text: t('gs.board.saved') } : { ok: false, text: errorWords(r.body) });
    if (r.ok) await load();
  };

  const presetById = (id: string | null): Preset | null => {
    if (!id || !data) return null;
    if (data.current?.fromPreset?.presetId === id) return data.current.fromPreset;
    for (const b of data.boards) for (const p of b.presets) if (p.presetId === id) return { ...p, boardName: b.name, replaced: false };
    return null;
  };

  const startFrom = (preset: BoardPreset | null) => {
    setNote(null);
    setDraft({ form: schemeToForm(preset ? schemeFromPreset(preset) : emptyScheme()), fromPresetId: preset?.presetId ?? null, basedOn: data?.current?.version ?? 0 });
  };
  const change = () => {
    if (!data?.current) return;
    setNote(null);
    setDraft({ form: schemeToForm(data.current.scheme), fromPresetId: data.current.fromPresetId, basedOn: data.current.version });
  };

  const draftScheme = useMemo(() => (draft ? formToScheme(draft.form) : null), [draft]);
  const checked = useMemo(() => (draftScheme ? validateScheme(draftScheme) : null), [draftScheme]);

  const save = async () => {
    if (!draft || !checked?.ok) return;
    const r = await post({ action: 'save', scheme: checked.scheme, fromPresetId: draft.fromPresetId, basedOn: draft.basedOn });
    if (!r.ok) return setNote({ ok: false, text: errorWords(r.body) });
    setNote({ ok: true, text: t('gs.saved', { version: Number(r.body?.version ?? draft.basedOn + 1) }) });
    setDraft(null);
    await load();
  };

  if (denied) return <p data-scheme-denied className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('gs.denied')}</p>;
  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('gs.failed')}</p>;
  if (!data) return null;
  const myBoard = data.boards.find((b) => b.boardId === data.board.boardId) ?? null;
  const shown: GradingScheme | null = draftScheme ?? data.current?.scheme ?? null;
  const shownPreset = draft ? presetById(draft.fromPresetId) : (data.current?.fromPreset ?? null);

  const starts = (
    <div data-scheme-start className="flex flex-col gap-2">
      {data.current && <p className="text-sm font-semibold text-slate">{t('gs.start.title')}</p>}
      <div className="flex flex-wrap gap-2">
        {(myBoard?.presets ?? []).map((p) => (
          <button key={p.presetId} type="button" data-scheme-start-preset={p.level} className={data.current ? TAP : PRIMARY} onClick={() => startFrom(p)}>
            {t('gs.start.preset', { board: myBoard!.name, level: p.level })}
          </button>
        ))}
        <button type="button" data-scheme-start-empty className={TAP} onClick={() => startFrom(null)}>
          {t('gs.start.empty')}
        </button>
      </div>
      {!myBoard && <p className="text-sm text-slate/70">{t('gs.start.noBoard')}</p>}
      {myBoard && myBoard.presets.length === 0 && <p className="text-sm text-slate/70">{t('gs.start.noPreset')}</p>}
    </div>
  );

  return (
    <div lang={lang} data-grading-scheme className="flex flex-col gap-4 text-sm text-slate">
      {note && (
        <p role="status" data-scheme-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}

      <section data-scheme-board className={SECTION}>
        <h2 className="text-base font-bold">{t('gs.board.title')}</h2>
        <p className="text-slate/70">{t('gs.board.how')}</p>
        {data.mayEdit ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 sm:max-w-md">
              <Field id="scheme-board" label={t('gs.board.label')}>
                <select id="scheme-board" className={FIELD} value={board} onChange={(e) => setBoard(e.target.value)}>
                  <option value="">{t('gs.board.none')}</option>
                  {data.boards.map((b) => (
                    <option key={b.boardId} value={b.boardId}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <button type="button" data-scheme-board-save className={PRIMARY} disabled={busy || board === (data.board.boardId ?? '')} onClick={() => void saveBoard()}>
              {t('gs.board.save')}
            </button>
          </div>
        ) : (
          <p className="font-semibold">{data.board.name ?? t('gs.board.unset')}</p>
        )}
        {data.board.setAt && <p className="text-slate/70">{data.board.setBy ? t('gs.board.setBy', { name: data.board.setBy, date: when(data.board.setAt) }) : t('gs.board.setOn', { date: when(data.board.setAt) })}</p>}
        {!data.mayEdit && <p className="text-slate/70">{t('gs.board.readOnly')}</p>}
      </section>

      {!data.current && !draft && (
        <section data-scheme-empty className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-slate/20 bg-white p-5">
          <p className="text-base font-bold">{t('gs.none.title')}</p>
          <p className="max-w-prose">{t(data.mayEdit ? 'gs.none.do' : 'gs.none.view')}</p>
          {data.mayEdit && starts}
        </section>
      )}

      {data.current && !draft && (
        <section data-scheme-current={data.current.version} className={SECTION}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold">{t('gs.current.title', { version: data.current.version })}</h2>
            <Badge variant="success">{t('gs.versions.inForce')}</Badge>
          </div>
          <p className="text-slate/70">{data.current.madeBy ? t('gs.current.by', { name: data.current.madeBy, date: when(data.current.madeAt) }) : t('gs.current.on', { date: when(data.current.madeAt) })}</p>
          <Source preset={shownPreset} day={day} />
          <Summary scheme={data.current.scheme} num={num} />
          <Checks scheme={data.current.scheme} preset={shownPreset} num={num} />
          {data.mayEdit && (
            <div className="flex flex-col gap-3 border-t border-slate/10 pt-3">
              <button type="button" data-scheme-change className={`${PRIMARY} self-start`} onClick={change}>
                {t('gs.current.change')}
              </button>
              {starts}
            </div>
          )}
        </section>
      )}

      {draft && checked && (
        <section data-scheme-editor className={SECTION}>
          <h2 className="text-base font-bold">{t('gs.editing.title', { version: draft.basedOn + 1 })}</h2>
          <Source preset={shownPreset} day={day} />
          <Editor form={draft.form} onChange={(form) => setDraft({ ...draft, form })} preset={shownPreset} num={num} />
          <div className="flex flex-col gap-2 border-t border-slate/10 pt-3">
            {!checked.ok && (
              <p role="alert" data-scheme-problem={checked.problem.code} className="rounded-md border border-red-800/30 px-3 py-2 font-semibold text-red-800">
                {t('gs.fixFirst', { problem: t(`gs.problem.${checked.problem.code}` as MessageKey, { n: (checked.problem.at ?? 0) + 1 }) })}
              </p>
            )}
            <p className="text-slate/70">{t('gs.saveHow')}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-scheme-save className={PRIMARY} disabled={busy || !checked.ok} onClick={() => void save()}>
                {t('gs.save', { version: draft.basedOn + 1 })}
              </button>
              <button type="button" className={TAP} disabled={busy} onClick={() => setDraft(null)}>
                {t('gs.cancel')}
              </button>
            </div>
          </div>
        </section>
      )}

      {shown && <TryIt scheme={shown} num={num} />}

      {data.versions.length > 0 && (
        <section data-scheme-versions className={SECTION}>
          <h2 className="text-base font-bold">{t('gs.versions.title')}</h2>
          <ul className="flex flex-col gap-1">
            {data.versions.map((v) => (
              <li key={v.version} data-scheme-version={v.version}>
                {v.madeBy ? t('gs.versions.line', { version: v.version, name: v.madeBy, date: when(v.madeAt) }) : t('gs.versions.lineNoName', { version: v.version, date: when(v.madeAt) })}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// Where the scheme came from: the board's preset with its document, or the school's own.
function Source({ preset, day }: { preset: Preset | null; day: (ymd: string) => string }) {
  const { t } = useT();
  if (!preset) return <p data-scheme-source="school" className="text-slate/70">{t('gs.source.empty')}</p>;
  return (
    <div data-scheme-source={preset.presetId} className="flex flex-col gap-2 rounded-md bg-off-white p-3">
      <p className="font-semibold">{t('gs.source.title')}</p>
      <p>{t('gs.source.from', { board: preset.boardName ?? preset.boardId, level: preset.level, title: preset.sourceTitle, date: day(preset.sourceReadOn) })}</p>
      <a href={preset.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center self-start font-semibold text-sapphire underline">
        {t('gs.source.open')}
      </a>
      {preset.replaced && <p>{t('gs.source.replaced')}</p>}
      {preset.notes.length > 0 && (
        <details>
          <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold">{t('gs.source.notes')}</summary>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {preset.notes.map((n, i) => (
              <li key={i}>{n.text}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// The gaps and overlaps of the bands, as the person types; a gap copied from the preset says so, beside the
// document's own words; grades without a range ask for them.
function Checks({ scheme, preset, num }: { scheme: GradingScheme; preset: Preset | null; num: (n: number) => string }) {
  const { t } = useT();
  if (!scheme.bands.length) return <p data-scheme-check="no-bands">{t('gs.bands.none')}</p>;
  const gaps = gapsAsInPreset(scheme, preset?.bands ?? null);
  const { overlaps, unranged } = bandProblems(scheme);
  const noRanges = unranged.length === scheme.bands.length;
  const words = (preset?.notes ?? []).filter((n) => n.about === 'bands');
  const copied = gaps.some((g) => g.asInPreset) || noRanges;
  return (
    <div data-scheme-check className="flex flex-col gap-2">
      <p className="font-semibold">{t('gs.check.title')}</p>
      {!gaps.length && !overlaps.length && !unranged.length && <p data-scheme-check-ok>{t('gs.check.ok')}</p>}
      {noRanges && (
        <p data-scheme-ask-ranges className="rounded-md border border-slate/20 px-3 py-2">
          {t('gs.check.askRanges')}
        </p>
      )}
      {unranged.length > 0 && <p data-scheme-unranged>{t('gs.check.unranged', { grades: unranged.join(', ') })}</p>}
      <ul className="flex flex-col gap-1">
        {gaps.map((g) => (
          <li key={`g${g.from}`} data-gap={`${g.from}-${g.to}`} data-as-printed={g.asInPreset ? 'yes' : 'no'}>
            {g.from === g.to ? t('gs.check.gapOne', { from: num(g.from) }) : t('gs.check.gap', { from: num(g.from), to: num(g.to) })}
            {g.asInPreset && <span className="font-semibold"> {t('gs.check.asPrinted')}</span>}
          </li>
        ))}
        {overlaps.map((o) => (
          <li key={`o${o.from}`} data-overlap={`${o.from}-${o.to}`} className="font-semibold text-red-800">
            {t('gs.check.overlap', { from: num(o.from), to: num(o.to), grades: o.grades.join(', ') })}
          </li>
        ))}
      </ul>
      {copied &&
        words.map((n, i) => (
          <p key={i} data-scheme-document-says className="rounded-md bg-off-white px-3 py-2">
            {t('gs.check.documentSays', { note: n.text })}
          </p>
        ))}
    </div>
  );
}

// The scheme in force, read: what the coordinator sees, and the office before it changes anything.
function Summary({ scheme, num }: { scheme: GradingScheme; num: (n: number) => string }) {
  const { t } = useT();
  const kind = (k: string) => t(`gs.comp.kind.${k}` as MessageKey);
  return (
    <div data-scheme-summary className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-1">
        <h3 className="font-bold">{t('gs.bands.title')}</h3>
        {scheme.bands.length ? (
          <ul className="flex flex-col gap-1">
            {scheme.bands.map((b) => (
              <li key={b.grade}>
                {typeof b.from === 'number' && typeof b.to === 'number' ? t('gs.bands.line', { grade: b.grade, from: num(b.from), to: num(b.to) }) : t('gs.bands.lineNoRange', { grade: b.grade })}
                {b.meaning ? ` · ${b.meaning}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('gs.bands.none')}</p>
        )}
        <p className="text-slate/70">{t(scheme.decimals === 1 ? 'gs.rounding.show1' : 'gs.rounding.show0')}</p>
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="font-bold">{t('gs.pass.title')}</h3>
        <p>{scheme.passMark === null ? t('gs.pass.none') : t('gs.pass.show', { passMark: num(scheme.passMark) })}</p>
        <h3 className="mt-2 font-bold">{t('gs.comp.title')}</h3>
        {scheme.components.length ? (
          <ul className="flex flex-col gap-1">
            {scheme.components.map((c) => (
              <li key={c.key}>
                {c.passMark === null ? t('gs.comp.line', { name: c.name, kind: kind(c.kind), share: num(c.share) }) : t('gs.comp.linePass', { name: c.name, kind: kind(c.kind), share: num(c.share), passMark: num(c.passMark) })}
                {c.parts.length > 0 && <span className="block text-slate/70">{t('gs.comp.lineParts', { parts: c.parts.map((p) => `${p.name} ${num(p.share)}`).join(', ') })}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('gs.comp.none')}</p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="font-bold">{t('gs.terms.title')}</h3>
        <p>{scheme.terms.length ? scheme.terms.map((x) => x.name).join(', ') : t('gs.terms.none')}</p>
        <h3 className="mt-2 font-bold">{t('gs.co.title')}</h3>
        <p>
          {scheme.coScholastic
            ? t('gs.co.line', { areas: scheme.coScholastic.areas.join(', '), grades: scheme.coScholastic.grades.map((g) => g.grade).join(', '), pass: scheme.coScholastic.grades.filter((g) => g.pass).map((g) => g.grade).join(', ') })
            : t('gs.co.none')}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="font-bold">{t('gs.layout.title')}</h3>
        <p>{t('gs.layout.shows', { parts: LAYOUT_PARTS.filter((k) => scheme.layout[k]).map((k) => t(`gs.layout.${k}` as MessageKey)).join(', ') })}</p>
      </div>
    </div>
  );
}

function Editor({ form, onChange, preset, num }: { form: SchemeForm; onChange: (f: SchemeForm) => void; preset: Preset | null; num: (n: number) => string }) {
  const { t } = useT();
  const put = (v: Partial<SchemeForm>) => onChange({ ...form, ...v });
  const sub = 'flex flex-col gap-3 border-t border-slate/10 pt-3';
  return (
    <div className="flex flex-col gap-4">
      <div data-scheme-bands className="flex flex-col gap-3">
        <h3 className="font-bold">{t('gs.bands.title')}</h3>
        <p className="text-slate/70">{t('gs.bands.how')}</p>
        <BandsEditor idPrefix="scheme" bands={form.bands} onChange={(bands) => put({ bands })} />
        <div className="max-w-md">
          <Field id="scheme-rounding" label={t('gs.rounding.label')}>
            <select id="scheme-rounding" className={FIELD} value={form.decimals} onChange={(e) => put({ decimals: e.target.value === '1' ? 1 : 0 })}>
              <option value={0}>{t('gs.rounding.0')}</option>
              <option value={1}>{t('gs.rounding.1')}</option>
            </select>
          </Field>
          <p className="mt-1 text-slate/70">{t('gs.rounding.how')}</p>
        </div>
        <Checks scheme={formToScheme(form)} preset={preset} num={num} />
      </div>

      <div className={sub}>
        <h3 className="font-bold">{t('gs.pass.title')}</h3>
        <div className="max-w-md">
          <Field id="scheme-pass" label={t('gs.pass.label')}>
            <input id="scheme-pass" inputMode="decimal" className={FIELD} value={form.passMark} onChange={(e) => put({ passMark: e.target.value })} />
          </Field>
        </div>
        <p className="text-slate/70">{t('gs.pass.how')}</p>
      </div>

      <div className={sub}>
        <h3 className="font-bold">{t('gs.comp.title')}</h3>
        <p className="text-slate/70">{t('gs.comp.how')}</p>
        <ComponentsEditor idPrefix="scheme" components={form.components} onChange={(components) => put({ components })} />
      </div>

      <div className={sub}>
        <h3 className="font-bold">{t('gs.terms.title')}</h3>
        <p className="text-slate/70">{t('gs.terms.how')}</p>
        {form.terms.map((name, i) => (
          <div key={i} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,24rem)_auto] sm:justify-start">
            <Field id={`scheme-term-${i}`} label={t('gs.terms.name', { n: i + 1 })}>
              <input id={`scheme-term-${i}`} maxLength={60} className={FIELD} value={name} onChange={(e) => put({ terms: set(form.terms, i, e.target.value) })} />
            </Field>
            <button type="button" className={TAP} onClick={() => put({ terms: without(form.terms, i) })}>
              {t('gs.terms.remove', { n: i + 1 })}
            </button>
          </div>
        ))}
        <AddButton data="term" label={t('gs.terms.add')} onClick={() => put({ terms: [...form.terms, ''] })} />
      </div>

      <fieldset className={sub}>
        <legend className="font-bold">{t('gs.layout.title')}</legend>
        <p className="text-slate/70">{t('gs.layout.how')}</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {LAYOUT_PARTS.map((k) => (
            <label key={k} className="flex min-h-[44px] items-center gap-2">
              <input type="checkbox" data-layout={k} className="h-5 w-5" checked={form.layout[k]} onChange={(e) => put({ layout: { ...form.layout, [k]: e.target.checked } })} />
              {t(`gs.layout.${k}` as MessageKey)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className={sub}>
        <h3 className="font-bold">{t('gs.co.title')}</h3>
        <p className="text-slate/70">{t('gs.co.how')}</p>
        {form.areas.map((a, i) => (
          <div key={i} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,24rem)_auto] sm:justify-start">
            <Field id={`scheme-area-${i}`} label={t('gs.co.area', { n: i + 1 })}>
              <input id={`scheme-area-${i}`} maxLength={60} className={FIELD} value={a} onChange={(e) => put({ areas: set(form.areas, i, e.target.value) })} />
            </Field>
            <button type="button" className={TAP} onClick={() => put({ areas: without(form.areas, i) })}>
              {t('gs.co.removeArea', { n: i + 1 })}
            </button>
          </div>
        ))}
        <AddButton label={t('gs.co.addArea')} onClick={() => put({ areas: [...form.areas, ''] })} />
        {form.coGrades.map((g, i) => (
          <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto_auto]">
            <Field id={`scheme-co-${i}-grade`} label={t('gs.co.grade')}>
              <input id={`scheme-co-${i}-grade`} maxLength={20} className={FIELD} value={g.grade} onChange={(e) => put({ coGrades: set(form.coGrades, i, { ...g, grade: e.target.value }) })} />
            </Field>
            <Field id={`scheme-co-${i}-meaning`} label={t('gs.co.meaning')}>
              <input id={`scheme-co-${i}-meaning`} maxLength={120} className={FIELD} value={g.meaning} onChange={(e) => put({ coGrades: set(form.coGrades, i, { ...g, meaning: e.target.value }) })} />
            </Field>
            <label className="flex min-h-[44px] items-center gap-2">
              <input type="checkbox" className="h-5 w-5" checked={g.pass} onChange={(e) => put({ coGrades: set(form.coGrades, i, { ...g, pass: e.target.checked }) })} />
              {t('gs.co.pass')}
            </label>
            <button type="button" className={TAP} onClick={() => put({ coGrades: without(form.coGrades, i) })}>
              {t('gs.co.removeGrade', { n: i + 1 })}
            </button>
          </div>
        ))}
        <AddButton label={t('gs.co.addGrade')} onClick={() => put({ coGrades: [...form.coGrades, { grade: '', meaning: '', pass: true }] })} />
      </div>
    </div>
  );
}

// Any percent, through the same grade() and passed() every screen uses.
function TryIt({ scheme, num }: { scheme: GradingScheme; num: (n: number) => string }) {
  const { t } = useT();
  const [typed, setTyped] = useState('');
  const value = typed.trim() === '' ? null : Number(typed.trim().replace(',', '.'));
  const okValue = value !== null && Number.isFinite(value) && value >= 0 && value <= 100;
  let lines: string[] = [];
  if (okValue) {
    const g = grade(value, { bands: scheme.bands.filter((b) => b.grade.trim()), decimals: scheme.decimals });
    const shown = { percent: num(value), rounded: g.rounded === null ? '' : num(g.rounded) };
    const gradeLine =
      g.kind === 'grade'
        ? g.meaning
          ? t('gs.try.gradeMeaning', { ...shown, grade: g.grade, meaning: g.meaning })
          : t('gs.try.grade', { ...shown, grade: g.grade })
        : t(`gs.try.${g.reason === 'no_marks' ? 'no_bands' : g.reason}` as MessageKey, { ...shown, grades: g.grades.join(', ') });
    const p = scheme.passMark === null || !Number.isFinite(scheme.passMark) ? null : passed({ percent: value }, { passMark: scheme.passMark, components: [], decimals: scheme.decimals });
    const passLine = p === null ? t('gs.try.noPassMark') : p.kind === 'passed' ? t('gs.try.passed', { passMark: num(scheme.passMark as number) }) : t('gs.try.notPassed', { passMark: num(scheme.passMark as number) });
    lines = [gradeLine, passLine];
  }
  return (
    <section data-scheme-try className={SECTION}>
      <h2 className="text-base font-bold">{t('gs.try.title')}</h2>
      <p className="text-slate/70">{t('gs.try.how')}</p>
      <div className="max-w-xs">
        <Field id="scheme-try" label={t('gs.try.label')}>
          <input id="scheme-try" inputMode="decimal" className={FIELD} value={typed} onChange={(e) => setTyped(e.target.value)} />
        </Field>
      </div>
      {typed.trim() !== '' && !okValue && <p>{t('gs.try.bad')}</p>}
      {lines.map((l, i) => (
        <p key={i} data-scheme-try-line={i === 0 ? 'grade' : 'pass'} className="font-semibold">
          {l}
        </p>
      ))}
    </section>
  );
}
