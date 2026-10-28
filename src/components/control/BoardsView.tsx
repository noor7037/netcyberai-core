'use client';

import { useCallback, useMemo, useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { AddButton, BandsEditor, ComponentsEditor, PRIMARY, SECTION, TAP } from '@/components/exams/SchemeParts';
import { formToScheme, schemeToForm, type BandForm, type ComponentForm } from '@/components/exams/scheme-form';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import type { ControlBoard, ControlPreset } from '@/lib/exams/boards';
import { NOTE_TOPICS, validatePreset, type CoScholastic, type NoteTopic, type PresetNote } from '@/lib/exams/scheme';
import type { MessageKey } from '@/lib/i18n';
import { indiaDate } from '@/lib/time/india';

// Control → Boards & grading (docs/27 row 9a, C213). The boards and every preset, each with its document; a board is
// added when a school from it signs, and its preset copied from the board's official circular, gaps included. A
// preset is never changed: "Replace this preset" starts a new one from it, and the old one stays on record. Every
// change goes to the Control API, which checks the session and writes the audit row.

type Draft = {
  boardId: string;
  level: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceReadOn: string;
  passMark: string;
  bands: BandForm[];
  components: ComponentForm[];
  coScholastic: CoScholastic | null;
  notes: PresetNote[];
  replaces: { presetId: string; level: string; board: string } | null;
};
const SCHEME_PROBLEMS = ['shape', 'decimals', 'band_grade', 'band_meaning', 'band_partial', 'band_mixed', 'band_range', 'band_decimals', 'band_duplicate', 'band_overlap', 'pass_mark', 'component_name', 'component_duplicate', 'component_share', 'component_shares_total', 'component_pass_mark', 'component_parts', 'term_name', 'term_duplicate', 'co_area', 'co_grade', 'too_many'];
const BOARD_PROBLEMS = ['board_id', 'name', 'id_taken', 'name_taken', 'board', 'no_board', 'level', 'source_title', 'source_url', 'source_read_on', 'notes', 'replaces', 'replaced_already', 'replaces_other_board'];

export function BoardsView({ initial }: { initial: ControlBoard[] }) {
  const { t, tCount, lang } = useWords();
  const [boards, setBoards] = useState<ControlBoard[]>(initial);
  const [newBoard, setNewBoard] = useState({ boardId: '', name: '' });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const num = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 1 });
  const when = (iso: string) => new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
  const day = (ymd: string) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${ymd}T00:00:00Z`));

  const words = (code: unknown, at?: unknown) => {
    const c = typeof code === 'string' ? code : '';
    const n = typeof at === 'number' ? at + 1 : 1;
    if (BOARD_PROBLEMS.includes(c)) return t(`boards.err.${c}` as MessageKey);
    if (SCHEME_PROBLEMS.includes(c)) return t(`gs.problem.${c}` as MessageKey, { n });
    return t('boards.err.other');
  };

  const load = useCallback(async () => {
    const res = await fetch('/api/control/boards', { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as { boards: ControlBoard[] } | null) : null;
    if (got) setBoards(got.boards);
  }, []);

  const send = async (payload: unknown, done: MessageKey): Promise<boolean> => {
    setBusy(true);
    setNote(null);
    const res = await fetch('/api/control/boards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) {
      setNote({ ok: false, text: words(got?.code, got?.at) });
      return false;
    }
    setNote({ ok: true, text: t(done) });
    await load();
    return true;
  };

  const fresh = (): Draft => ({ boardId: '', level: '', sourceTitle: '', sourceUrl: '', sourceReadOn: indiaDate(), passMark: '', bands: [{ from: '', to: '', grade: '', meaning: '' }], components: [], coScholastic: null, notes: [], replaces: null });
  const replace = (b: ControlBoard, p: ControlPreset) => {
    const form = schemeToForm({ bands: p.bands, decimals: 1, passMark: p.passMark, components: p.components, terms: [], layout: { components: true, total: true, percent: true, grade: true, attendance: true, remarks: true, coScholastic: false }, coScholastic: null });
    setNote(null);
    setDraft({ boardId: b.boardId, level: p.level, sourceTitle: p.sourceTitle, sourceUrl: p.sourceUrl, sourceReadOn: indiaDate(), passMark: form.passMark, bands: form.bands, components: form.components, coScholastic: p.coScholastic, notes: p.notes.map((n) => ({ ...n })), replaces: { presetId: p.presetId, level: p.level, board: b.name } });
  };

  const body = useMemo(() => {
    if (!draft) return null;
    const s = formToScheme({ bands: draft.bands, decimals: 1, passMark: draft.passMark, components: draft.components, terms: [], layout: { components: true, total: true, percent: true, grade: true, attendance: true, remarks: true, coScholastic: false }, areas: [], coGrades: [] });
    return { boardId: draft.boardId, level: draft.level, sourceTitle: draft.sourceTitle, sourceUrl: draft.sourceUrl, sourceReadOn: draft.sourceReadOn, bands: s.bands, passMark: s.passMark, components: s.components, coScholastic: draft.coScholastic, notes: draft.notes, replacesPresetId: draft.replaces?.presetId ?? null };
  }, [draft]);
  const checked = body ? validatePreset(body) : null;

  const bandsLine = (p: ControlPreset) => p.bands.map((b) => (typeof b.from === 'number' && typeof b.to === 'number' ? t('gs.bands.line', { grade: b.grade, from: num(b.from), to: num(b.to) }) : t('gs.bands.lineNoRange', { grade: b.grade })) + (b.meaning ? ` (${b.meaning})` : '')).join(', ');

  return (
    <div lang={lang} data-boards className="flex flex-col gap-4 text-sm text-slate">
      {note && (
        <p role="status" data-boards-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}

      <section className={SECTION}>
        <h2 className="text-base font-bold">{t('boards.list.title')}</h2>
        <ul className="flex flex-col gap-4">
          {boards.map((b) => (
            <li key={b.boardId} data-board={b.boardId} className="flex flex-col gap-3 rounded-md border border-slate/10 p-3">
              <div>
                <p className="text-base font-bold">{b.name}</p>
                <p className="text-slate/70">
                  {b.boardId} · {tCount('boards.schools', b.schools)}
                </p>
              </div>
              {b.presets.length === 0 && <p className="text-slate/70">{t('boards.noPresets')}</p>}
              {b.presets.map((p) => (
                <div key={p.presetId} data-preset={p.level} data-replaced={p.replacedBy ? 'yes' : 'no'} className="flex flex-col gap-1 border-t border-slate/10 pt-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{p.level}</span>
                    <Badge variant={p.replacedBy ? 'neutral' : 'success'}>{t(p.replacedBy ? 'boards.preset.replacedBadge' : 'boards.preset.inUse')}</Badge>
                  </p>
                  <p>{t('boards.preset.source', { title: p.sourceTitle, date: day(p.sourceReadOn) })}</p>
                  <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center self-start break-all font-semibold text-sapphire underline">
                    {p.sourceUrl}
                  </a>
                  <p>{t('boards.preset.bands', { bands: bandsLine(p) })}</p>
                  <p>{p.passMark === null ? t('gs.pass.none') : t('gs.pass.show', { passMark: num(p.passMark) })}</p>
                  {p.components.map((c) => (
                    <p key={c.key}>
                      {t('gs.comp.line', { name: c.name, kind: t(`gs.comp.kind.${c.kind}` as MessageKey), share: num(c.share) })}
                      {c.parts.length > 0 && ` · ${t('gs.comp.lineParts', { parts: c.parts.map((x) => `${x.name} ${num(x.share)}`).join(', ') })}`}
                    </p>
                  ))}
                  {p.coScholastic && <p>{t('gs.co.line', { areas: p.coScholastic.areas.join(', '), grades: p.coScholastic.grades.map((g) => g.grade).join(', '), pass: p.coScholastic.grades.filter((g) => g.pass).map((g) => g.grade).join(', ') })}</p>}
                  {p.notes.length > 0 && (
                    <ul className="flex list-disc flex-col gap-1 pl-5 text-slate/70">
                      {p.notes.map((n, i) => (
                        <li key={i}>{n.text}</li>
                      ))}
                    </ul>
                  )}
                  <p className="text-slate/70">{p.addedBy ? t('boards.preset.added', { name: p.addedBy, date: when(p.addedAt) }) : t('boards.preset.addedOn', { date: when(p.addedAt) })}</p>
                  {p.replacedAt && <p className="text-slate/70">{t('boards.preset.replaced', { date: when(p.replacedAt) })}</p>}
                  {!p.replacedBy && (
                    <button type="button" data-preset-replace className={`${TAP} self-start`} onClick={() => replace(b, p)}>
                      {t('boards.preset.replace')}
                    </button>
                  )}
                </div>
              ))}
            </li>
          ))}
        </ul>
      </section>

      <section data-board-new className={SECTION}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-base font-bold">{t('boards.addBoard.title')}</h2>
          <InfoTip>{t('boards.addBoard.how')}</InfoTip>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <Input id="board-id" label={t('boards.addBoard.id')} maxLength={40} value={newBoard.boardId} onChange={(e) => setNewBoard({ ...newBoard, boardId: e.target.value.trim().toLowerCase() })} />
          <Input id="board-name" label={t('boards.addBoard.name')} maxLength={80} value={newBoard.name} onChange={(e) => setNewBoard({ ...newBoard, name: e.target.value })} />
        </div>
        <button type="button" data-board-add className={`${PRIMARY} self-start`} disabled={busy || !newBoard.boardId || !newBoard.name.trim()} onClick={() => void send({ action: 'board', ...newBoard }, 'boards.addBoard.done').then((ok) => ok && setNewBoard({ boardId: '', name: '' }))}>
          {t('boards.addBoard.save')}
        </button>
      </section>

      <section data-preset-form className={SECTION}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-base font-bold">{t('boards.addPreset.title')}</h2>
          <InfoTip>{t('boards.addPreset.how')}</InfoTip>
        </div>
        {!draft ? (
          <AddButton data="preset" label={t('boards.addPreset.open')} onClick={() => setDraft(fresh())} />
        ) : (
          <div className="flex flex-col gap-3">
            {draft.replaces && <p className="rounded-md bg-off-white px-3 py-2 font-semibold">{t('boards.addPreset.replacing', { level: draft.replaces.level, board: draft.replaces.board })}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Select id="preset-board" label={t('boards.addPreset.board')} value={draft.boardId} disabled={!!draft.replaces} onChange={(e) => setDraft({ ...draft, boardId: e.target.value })}>
                <option value="">{t('boards.addPreset.choose')}</option>
                {boards.map((b) => (
                  <option key={b.boardId} value={b.boardId}>
                    {b.name}
                  </option>
                ))}
              </Select>
              <Input id="preset-level" label={t('boards.addPreset.level')} maxLength={80} value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value })} />
              <Input id="preset-title" label={t('boards.addPreset.sourceTitle')} maxLength={200} value={draft.sourceTitle} onChange={(e) => setDraft({ ...draft, sourceTitle: e.target.value })} />
              <Input id="preset-url" type="url" label={t('boards.addPreset.sourceUrl')} maxLength={500} value={draft.sourceUrl} onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })} />
              <Input id="preset-read-on" type="date" label={t('boards.addPreset.readOn')} value={draft.sourceReadOn} onChange={(e) => setDraft({ ...draft, sourceReadOn: e.target.value })} />
              <Input id="preset-pass" inputMode="decimal" label={t('boards.addPreset.passMark')} value={draft.passMark} onChange={(e) => setDraft({ ...draft, passMark: e.target.value })} />
            </div>
            <div className="flex flex-wrap items-center gap-x-1">
              <h3 className="font-bold">{t('gs.bands.title')}</h3>
              <InfoTip>{t('boards.addPreset.bandsHow')}</InfoTip>
            </div>
            <BandsEditor idPrefix="preset" bands={draft.bands} onChange={(bands) => setDraft({ ...draft, bands })} />
            <h3 className="font-bold">{t('gs.comp.title')}</h3>
            <ComponentsEditor idPrefix="preset" components={draft.components} onChange={(components) => setDraft({ ...draft, components })} />
            {draft.coScholastic && <p>{t('gs.co.line', { areas: draft.coScholastic.areas.join(', '), grades: draft.coScholastic.grades.map((g) => g.grade).join(', '), pass: draft.coScholastic.grades.filter((g) => g.pass).map((g) => g.grade).join(', ') })}</p>}
            <h3 className="font-bold">{t('boards.addPreset.notes')}</h3>
            {draft.notes.map((n, i) => (
              <div key={i} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]">
                <Select id={`preset-note-${i}-about`} label={t('boards.addPreset.noteAbout')} value={n.about} onChange={(e) => setDraft({ ...draft, notes: draft.notes.map((x, j) => (j === i ? { ...x, about: e.target.value as NoteTopic } : x)) })}>
                  {NOTE_TOPICS.map((k) => (
                    <option key={k} value={k}>
                      {t(`boards.note.${k}` as MessageKey)}
                    </option>
                  ))}
                </Select>
                <Textarea id={`preset-note-${i}`} label={t('boards.addPreset.noteText', { n: i + 1 })} rows={2} maxLength={600} value={n.text} onChange={(e) => setDraft({ ...draft, notes: draft.notes.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                <button type="button" className={TAP} onClick={() => setDraft({ ...draft, notes: draft.notes.filter((_, j) => j !== i) })}>
                  {t('boards.addPreset.removeNote', { n: i + 1 })}
                </button>
              </div>
            ))}
            <AddButton label={t('boards.addPreset.addNote')} onClick={() => setDraft({ ...draft, notes: [...draft.notes, { about: 'bands', text: '' }] })} />
            {checked && !checked.ok && (
              <p role="alert" data-preset-problem={checked.problem} className="rounded-md border border-red-800/30 px-3 py-2 font-semibold text-red-800">
                {words(checked.problem, checked.at)}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" data-preset-save className={PRIMARY} disabled={busy || !checked?.ok} onClick={() => void send({ action: 'preset', ...body }, 'boards.addPreset.done').then((ok) => ok && setDraft(null))}>
                {t('boards.addPreset.save')}
              </button>
              <button type="button" className={TAP} disabled={busy} onClick={() => setDraft(null)}>
                {t('gs.cancel')}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
