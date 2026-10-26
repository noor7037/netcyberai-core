'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import type { EntryChild, PaperEntry } from '@/lib/exams/marks';
import { scoreOk, type MarkKind } from '@/lib/exams/papers';
import type { MessageKey } from '@/lib/i18n';
import { dayWords, markWords, momentWords, numberWords } from './exam-format';
import { PRIMARY, SECTION, TAP } from './SchemeParts';

// Entering one paper's marks (docs/27 row 9b, C214), made for a phone: the class's roll in roll order, and for each
// child each part of the paper with its maximum: a mark, or "Absent", or "Exempt". Absent and exempt are not marks
// and are never a zero. A mark outside 0 to the part's maximum, or with more than one decimal place, is shown as
// wrong and cannot be saved; the server and the database refuse it as well. Saving keeps what was typed; the paper
// is "entered" once every child on the roll has a mark, absent or exempt for every part. The office and the
// coordinator also set the paper's date and the chapters it assesses, from the class's syllabus map.

type Cell = { kind: MarkKind | 'none'; text: string };
type Draft = Record<string, Cell>; // `${studentId}|${component}`
const key = (studentId: string, component: string) => `${studentId}|${component}`;
const parse = (text: string): number => Number(text.trim().replace(',', '.'));

function draftOf(children: readonly EntryChild[], components: readonly { key: string }[]): Draft {
  const d: Draft = {};
  for (const c of children)
    for (const p of components) {
      const m = c.marks[p.key];
      d[key(c.studentId, p.key)] = m ? { kind: m.kind, text: m.kind === 'score' && m.score !== null ? String(m.score) : '' } : { kind: 'none', text: '' };
    }
  return d;
}

export function PaperEntryView({ paperId }: { paperId: string }) {
  const { t, lang } = useT();
  const [data, setData] = useState<PaperEntry | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [saved, setSaved] = useState<Draft>({});
  const [details, setDetails] = useState<{ date: string; unitIds: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/app/exams/papers/${paperId}`, { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as PaperEntry | null) : null;
    setFailed(!got);
    if (!got) return;
    setData(got);
    const d = draftOf(got.children, got.paper.components);
    setDraft(d);
    setSaved(d);
    setDetails({ date: got.paper.date ?? '', unitIds: got.paper.unitIds });
  }, [paperId]);
  useEffect(() => {
    void load();
  }, [load]);

  const max = useMemo(() => Object.fromEntries((data?.paper.components ?? []).map((c) => [c.key, c.max])), [data]);
  // What would be sent: each cell that differs from what is saved. A score cell left empty is "nothing entered".
  const changes = useMemo(() => {
    const out: { studentId: string; component: string; kind: MarkKind | 'clear'; score: number | null }[] = [];
    let wrong = 0;
    for (const [k, cell] of Object.entries(draft)) {
      const [studentId, component] = k.split('|');
      const was = saved[k];
      const now: Cell = cell.kind === 'score' && cell.text.trim() === '' ? { kind: 'none', text: '' } : cell;
      const before: Cell = was ?? { kind: 'none', text: '' };
      if (now.kind === 'score' && !scoreOk(parse(now.text), max[component])) {
        wrong += 1;
        continue;
      }
      if (now.kind === before.kind && (now.kind !== 'score' || parse(now.text) === parse(before.text))) continue;
      if (now.kind === 'none') out.push({ studentId, component, kind: 'clear', score: null });
      else out.push({ studentId, component, kind: now.kind, score: now.kind === 'score' ? parse(now.text) : null });
    }
    return { out, wrong };
  }, [draft, saved, max]);

  const save = async () => {
    setBusy(true);
    setNote(null);
    const res = await fetch(`/api/app/exams/papers/${paperId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ marks: changes.out }) }).catch(() => null);
    const body = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
    setBusy(false);
    if (!res?.ok || !body) {
      const code = typeof body?.code === 'string' ? body.code : '';
      return setNote({ ok: false, text: ['score', 'closed', 'child', 'component', 'not_allowed'].includes(code) ? t(`ex.entry.err.${code}` as MessageKey) : t('ex.entry.err.other') });
    }
    setNote({ ok: true, text: body.complete ? t('ex.entry.savedComplete') : t('ex.entry.saved', { entered: Number(body.entered), roll: Number(body.roll) }) });
    await load();
  };

  const saveDetails = async () => {
    if (!data || !details) return;
    setBusy(true);
    setNote(null);
    const res = await fetch(`/api/app/exams/${data.exam.examId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'paper', paperId, date: details.date || null, unitIds: details.unitIds }) }).catch(() => null);
    setBusy(false);
    setNote(res?.ok ? { ok: true, text: t('ex.entry.detailsSaved') } : { ok: false, text: t('ex.entry.err.details') });
    if (res?.ok) await load();
  };

  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('ex.entry.failed')}</p>;
  if (!data || !details) return null;
  const { paper, exam } = data;
  const complete = paper.roll > 0 && paper.entered >= paper.roll;
  const set = (studentId: string, component: string, cell: Cell) => setDraft({ ...draft, [key(studentId, component)]: cell });
  const saveBar = (withTip: boolean) =>
    data.mayEnter && (
      <div className="flex flex-wrap items-center gap-x-3">
        <button type="button" data-marks-save className={PRIMARY} disabled={busy || changes.wrong > 0 || changes.out.length === 0} onClick={() => void save()}>
          {t('ex.entry.save')}
        </button>
        <span data-marks-pending className="text-slate/70">
          {changes.wrong > 0 ? t('ex.entry.wrong', { n: changes.wrong }) : changes.out.length ? t('ex.entry.pending', { n: changes.out.length }) : ''}
        </span>
        {withTip && <InfoTip>{t('ex.entry.rules')}</InfoTip>}
      </div>
    );

  return (
    <div lang={lang} data-paper-entry={paperId} className="flex flex-col gap-4 text-sm text-slate">
      {note && (
        <p role="status" data-entry-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}

      <section className={SECTION}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold">{paper.className} · {paper.subjectName}</h2>
            <p className="text-slate/70">
              {exam.name}
              {exam.term ? ` · ${t('ex.exam.term', { term: exam.term })}` : ''} · {paper.date ? dayWords(paper.date, lang) : t('ex.paper.noDate')}
            </p>
            <p className="text-slate/70">{paper.components.map((c) => t('ex.paper.partMax', { part: c.name, max: numberWords(c.max, lang) })).join(' · ')}</p>
            <p className="text-slate/70">{paper.chapters.length ? t('ex.entry.chapters', { chapters: paper.chapters.join(', ') }) : t('ex.entry.noChapters')}</p>
          </div>
          <Badge variant={complete ? 'success' : 'warning'} data-entry-state={complete ? 'entered' : 'waiting'}>{complete ? t('ex.paper.entered') : t('ex.paper.waiting')}</Badge>
        </div>
        <p data-entry-progress>
          {t('ex.progress', { entered: paper.entered, roll: paper.roll })}
          {complete && paper.enteredBy && paper.enteredAt ? ` · ${t('ex.entry.enteredBy', { name: paper.enteredBy, when: momentWords(paper.enteredAt, lang) })}` : ''}
        </p>
        {data.notShown > 0 && <p className="rounded-md bg-off-white px-3 py-2">{t('ex.entry.notShown', { n: data.notShown })}</p>}
        {exam.status !== 'open' && <p className="rounded-md bg-off-white px-3 py-2">{t('ex.entry.closed')}</p>}
        {!data.mayEnter && exam.status === 'open' && <p className="rounded-md bg-off-white px-3 py-2">{t('ex.entry.readOnly')}</p>}
        <div className="flex flex-wrap gap-2">
          <a href={`/app/exams/${exam.examId}/classes/${paper.classId}`} className={TAP}>{t('ex.exam.resultOf', { className: paper.className })}</a>
          {data.mayEnter && exam.status === 'open' && (
            <a href={`/app/exams/papers/${paperId}/marking`} data-mark-with-ai className={TAP}>{t('mk.entry.link')}</a>
          )}
          <a href="/app/exams" className={TAP}>{t('ex.allExams')}</a>
        </div>
      </section>

      {data.mayChange && (
        <details data-paper-details className={SECTION}>
          <summary className="min-h-[44px] cursor-pointer py-2 font-bold">{t('ex.entry.detailsTitle')}</summary>
          <div className="mt-3 max-w-xs">
            <Input id="paper-date" type="date" label={t('ex.make.date')} value={details.date} onChange={(e) => setDetails({ ...details, date: e.target.value })} />
          </div>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs font-semibold">{t('ex.entry.chaptersPick')}</legend>
            {data.map.length ? (
              data.map.map((u) => (
                <Checkbox key={u.unitId} id={`paper-unit-${u.unitId}`} label={`${u.chapter}: ${u.topic}`} checked={details.unitIds.includes(u.unitId)} onChange={(e) => setDetails({ ...details, unitIds: e.target.checked ? [...details.unitIds, u.unitId] : details.unitIds.filter((x) => x !== u.unitId) })} />
              ))
            ) : (
              <p className="text-slate/70">{t('ex.entry.noMap')}</p>
            )}
          </fieldset>
          <button type="button" data-paper-details-save className={`${PRIMARY} self-start`} disabled={busy} onClick={() => void saveDetails()}>
            {t('ex.entry.detailsSave')}
          </button>
        </details>
      )}

      {saveBar(true)}
      {!data.children.length && <p className="rounded-md bg-off-white px-3 py-2">{t('ex.entry.noChildren')}</p>}
      <ol className="flex flex-col gap-3" data-entry-children>
        {data.children.map((child) => (
          <li key={child.studentId} data-entry-child={child.studentId} className="rounded-lg border border-slate/10 bg-white p-3">
            <p className="mb-2 font-bold">{child.rollNo ? t('ex.entry.child', { roll: child.rollNo, name: child.name }) : child.name}</p>
            <div className="flex flex-col gap-3">
              {paper.components.map((c) => {
                const cell = draft[key(child.studentId, c.key)] ?? { kind: 'none', text: '' };
                const id = `mark-${child.studentId}-${c.key}`;
                const wrong = cell.kind === 'score' && cell.text.trim() !== '' && !scoreOk(parse(cell.text), c.max);
                if (!data.mayEnter) return <p key={c.key}>{markWords(t, lang, c, child.marks[c.key])}</p>;
                return (
                  <div key={c.key} data-mark-cell={c.key} className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-32 flex-none">
                        <Input
                          id={id}
                          label={t('ex.entry.partLabel', { part: c.name, max: numberWords(c.max, lang) })}
                          inputMode="decimal"
                          aria-invalid={wrong}
                          floating={false}
                          value={cell.kind === 'score' ? cell.text : ''}
                          disabled={cell.kind === 'absent' || cell.kind === 'exempt'}
                          onChange={(e) => set(child.studentId, c.key, { kind: 'score', text: e.target.value })}
                        />
                      </div>
                      {(['absent', 'exempt'] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          data-mark-kind={k}
                          aria-pressed={cell.kind === k}
                          className={cell.kind === k ? PRIMARY : TAP}
                          onClick={() => set(child.studentId, c.key, cell.kind === k ? { kind: 'none', text: '' } : { kind: k, text: '' })}
                        >
                          {t(k === 'absent' ? 'ex.entry.absent' : 'ex.entry.exempt')}
                        </button>
                      ))}
                    </div>
                    {wrong && <p role="alert" className="text-red-800">{t('ex.entry.badScore', { max: numberWords(c.max, lang) })}</p>}
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
      {data.children.length > 3 && saveBar(false)}
    </div>
  );
}
