'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { examTypeName, offeredExamTypes, OTHER_EXAM_TYPE } from '@/lib/contracts/exam-types';
import type { ExamsScreen, ExamSummary, PaperSummary } from '@/lib/exams/exams';
import type { MessageKey } from '@/lib/i18n';
import { CandidatesPanel } from '@/components/marking/CandidatesPanel';
import { PRIMARY, SECTION, TAP } from './SchemeParts';
import { dayWords } from './exam-format';

// Exams (docs/27 row 9b, C214). The papers that wait for this person's marks come first. The principal, the school
// admin and the academic coordinator make an exam for a term, with a paper for each class and subject (its date and
// each part's maximum, from the grading scheme), and see how far each paper's entry has come. A teacher sees the
// exams of their own classes, and enters the papers of their own subject, or of their class as class teacher. The
// class result of each class is one tap away. The server and the database decide who may do what.

type PaperForm = { classId: string; subjectId: string; date: string; maxima: Record<string, string> };
const ERRORS = ['name', 'name_taken', 'session', 'term', 'exam_type', 'papers', 'class', 'subject', 'date', 'maxima', 'units', 'paper_twice', 'has_marks', 'published'];
const emptyPaper = (): PaperForm => ({ classId: '', subjectId: '', date: '', maxima: {} });
const toNumber = (text: string): number | null => (text.trim() === '' ? null : Number(text.trim().replace(',', '.')));

export function ExamsView() {
  const { t, lang } = useT();
  const [data, setData] = useState<ExamsScreen | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [session, setSession] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [term, setTerm] = useState('');
  const [examType, setExamType] = useState(OTHER_EXAM_TYPE);
  const [papers, setPapers] = useState<PaperForm[]>([emptyPaper()]);
  const [adding, setAdding] = useState<{ examId: string; paper: PaperForm } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (asked: string | null) => {
    const res = await fetch(`/api/app/exams${asked ? `?session=${encodeURIComponent(asked)}` : ''}`, { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as ExamsScreen | null) : null;
    setDenied(res?.status === 403);
    setFailed(!got);
    if (got) setData(got);
  }, []);
  useEffect(() => {
    void load(session);
  }, [load, session]);

  const post = async (url: string, payload: unknown): Promise<{ ok: boolean; body: Record<string, unknown> | null }> => {
    setBusy(true);
    setNote(null);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const body = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
    setBusy(false);
    return { ok: !!res?.ok, body };
  };
  const errorWords = (body: Record<string, unknown> | null) => {
    const code = typeof body?.code === 'string' ? body.code : '';
    const at = typeof body?.at === 'number' ? body.at + 1 : 1;
    return ERRORS.includes(code) ? t(`ex.err.${code}` as MessageKey, { n: at }) : t('ex.err.other');
  };
  const paperPayload = (p: PaperForm) => ({
    classId: p.classId,
    subjectId: p.subjectId,
    date: p.date || null,
    unitIds: [],
    maxima: Object.fromEntries(Object.entries(p.maxima).map(([k, v]) => [k, toNumber(v)]).filter(([, v]) => v !== null)),
  });

  const make = async () => {
    if (!data) return;
    const r = await post('/api/app/exams', { name, sessionId: data.session, term: term || null, examType, papers: papers.map(paperPayload) });
    if (!r.ok) return setNote({ ok: false, text: errorWords(r.body) });
    setNote({ ok: true, text: t('ex.make.done', { name: name.trim() }) });
    setName('');
    setTerm('');
    setExamType(OTHER_EXAM_TYPE);
    setPapers([emptyPaper()]);
    await load(session);
  };
  const change = async (examId: string, payload: Record<string, unknown>, done: MessageKey) => {
    const r = await post(`/api/app/exams/${examId}`, payload);
    if (!r.ok) return setNote({ ok: false, text: errorWords(r.body) });
    setNote({ ok: true, text: t(done) });
    setAdding(null);
    await load(session);
  };

  if (denied) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('ex.denied')}</p>;
  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('ex.failed')}</p>;
  if (!data) return null;
  const parts = data.scheme?.parts ?? [{ key: 'marks', name: t('ex.part.marks'), share: null }];
  const sessionLabel = data.sessions.find((s) => s.sessionId === data.session)?.label ?? null;

  return (
    <div lang={lang} data-exams className="flex flex-col gap-4 text-sm text-slate">
      {note && (
        <p role="status" data-exams-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}

      <section data-exams-to-enter className={SECTION}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-base font-bold">{t('ex.toEnter.title')}</h2>
          <InfoTip>{t('ex.toEnter.how')}</InfoTip>
        </div>
        {data.toEnter.length ? (
          <ul className="flex flex-col gap-2">
            {data.toEnter.map((p) => (
              <li key={p.paperId} data-to-enter={p.paperId} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate/10 p-3">
                <div className="min-w-0">
                  <p className="font-semibold">{p.className} · {p.subjectName}</p>
                  <p className="text-slate/70">
                    {p.examName} · {p.date ? dayWords(p.date, lang) : t('ex.paper.noDate')} · {t('ex.progress', { entered: p.entered, roll: p.roll })}
                  </p>
                </div>
                <a href={`/app/exams/papers/${p.paperId}`} data-enter-marks className={PRIMARY}>
                  {t('ex.enterMarks')}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p data-exams-none-waiting className="text-slate/70">{t('ex.toEnter.none')}</p>
        )}
      </section>

      {data.sessions.length > 1 && (
        <div className="max-w-xs">
          <Select id="exams-session" label={t('ex.session')} value={data.session ?? 'none'} onChange={(e) => setSession(e.target.value)}>
            {data.sessions.map((s) => (
              <option key={s.sessionId} value={s.sessionId}>{s.label}</option>
            ))}
          </Select>
        </div>
      )}

      {data.mayRun && (
        <section data-exam-make className={SECTION}>
          <div className="flex flex-wrap items-center gap-x-1">
            <h2 className="text-base font-bold">{t('ex.make.title')}</h2>
            <InfoTip>
              <p>{t('ex.make.how')}</p>
              {sessionLabel && <p className="mt-2">{t('ex.make.inSession', { session: sessionLabel })}</p>}
            </InfoTip>
          </div>
          {!data.scheme && (
            <div data-exam-no-scheme className="flex flex-col items-start gap-2 rounded-md bg-off-white px-3 py-2">
              <p>{t('ex.make.noScheme')}</p>
              <a href="/app/exams/scheme" className={TAP}>{t('ex.make.openScheme')}</a>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input id="exam-name" label={t('ex.make.name')} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            <Select id="exam-term" label={t('ex.make.term')} value={term} onChange={(e) => setTerm(e.target.value)}>
              <option value="">{t('ex.make.noTerm')}</option>
              {(data.scheme?.terms ?? []).map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </Select>
            <Select id="exam-type" label={t('ex.make.type')} value={examType} onChange={(e) => setExamType(e.target.value)}>
              {offeredExamTypes(data.examTypes).map((x) => (
                <option key={x.key} value={x.key}>{lang === 'hi' ? x.hi : x.en}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-x-1">
            <h3 className="font-bold">{t('ex.make.papers')}</h3>
            <InfoTip>{t('ex.make.maxHow')}</InfoTip>
          </div>
          {papers.map((p, i) => (
            <PaperRow key={i} index={i} idPrefix="exam-paper" paper={p} parts={parts} data={data} onChange={(v) => setPapers(papers.map((x, j) => (j === i ? v : x)))} onRemove={papers.length > 1 ? () => setPapers(papers.filter((_, j) => j !== i)) : undefined} />
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" data-exam-add-paper className={TAP} onClick={() => setPapers([...papers, { ...emptyPaper(), date: papers[papers.length - 1]?.date ?? '', maxima: { ...(papers[papers.length - 1]?.maxima ?? {}) } }])}>
              {t('ex.make.addPaper')}
            </button>
            <button type="button" data-exam-make-save className={PRIMARY} disabled={busy || !name.trim()} onClick={() => void make()}>
              {t('ex.make.save')}
            </button>
          </div>
        </section>
      )}

      <section data-exams-list className="flex flex-col gap-3">
        <h2 className="text-base font-bold">{sessionLabel ? t('ex.list.title', { session: sessionLabel }) : t('ex.list.titleNoSession')}</h2>
        {!data.exams.length && (
          <div className="rounded-lg border border-slate/10 bg-white">
            <EmptyState title={t('ex.list.empty')} description={t(data.mayRun ? 'ex.list.emptyHowOffice' : 'ex.list.emptyHowTeacher')} />
          </div>
        )}
        {data.exams.map((exam) => (
          <ExamCard
            key={exam.examId}
            exam={exam}
            data={data}
            parts={parts}
            busy={busy}
            adding={adding?.examId === exam.examId ? adding.paper : null}
            onAdding={(paper) => setAdding(paper ? { examId: exam.examId, paper } : null)}
            onAdd={(paper) => void change(exam.examId, { action: 'add_paper', paper: paperPayload(paper) }, 'ex.exam.paperAdded')}
            onRemovePaper={(paperId) => void change(exam.examId, { action: 'remove_paper', paperId }, 'ex.exam.paperRemoved')}
            onRemove={() => void change(exam.examId, { action: 'remove' }, 'ex.exam.removed')}
            onType={(examType) => void change(exam.examId, { action: 'type', examType }, 'ex.exam.typeChanged')}
          />
        ))}
      </section>
    </div>
  );
}

function ExamCard({
  exam,
  data,
  parts,
  busy,
  adding,
  onAdding,
  onAdd,
  onRemovePaper,
  onRemove,
  onType,
}: {
  exam: ExamSummary;
  data: ExamsScreen;
  parts: { key: string; name: string }[];
  busy: boolean;
  adding: PaperForm | null;
  onAdding: (paper: PaperForm | null) => void;
  onAdd: (paper: PaperForm) => void;
  onRemovePaper: (paperId: string) => void;
  onRemove: () => void;
  onType: (examType: string) => void;
}) {
  const { t, lang } = useT();
  const classes = [...new Map(exam.papers.map((p) => [p.classId, p.className])).entries()];
  const anyMarks = exam.papers.some((p) => p.hasMarks);
  // Published for a class (C215): its marks are frozen. The exam reads as published once every class of it is.
  const publishedClass = (classId: string) => exam.papers.some((p) => p.classId === classId && p.published);
  const allPublished = classes.length > 0 && classes.every(([classId]) => publishedClass(classId));
  return (
    <article data-exam={exam.examId} className={SECTION}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-1">
            <h3 className="text-base font-bold">{exam.name}</h3>
            <InfoTip>{t('ex.exam.noRank')}</InfoTip>
          </div>
          <p className="text-slate/70">
            <span data-exam-type={exam.examType}>{examTypeName(data.examTypes, exam.examType, lang)}</span>
            {' · '}
            {exam.term ? t('ex.exam.term', { term: exam.term }) : t('ex.exam.noTerm')}
            {exam.madeBy ? ` · ${t('ex.exam.madeBy', { name: exam.madeBy })}` : ''}
          </p>
        </div>
        <Badge variant={exam.status === 'open' && !allPublished ? 'neutral' : 'success'}>{t(exam.status === 'open' && !allPublished ? 'ex.exam.open' : 'ex.exam.published')}</Badge>
      </div>
      <ul className="flex flex-col gap-2">
        {exam.papers.map((p) => (
          <PaperLine key={p.paperId} paper={p} open={exam.status === 'open'} mayRun={data.mayRun} busy={busy} onRemove={() => onRemovePaper(p.paperId)} />
        ))}
      </ul>
      <CandidatesPanel examId={exam.examId} />
      {classes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {classes.map(([classId, className]) => (
            <a key={classId} href={`/app/exams/${exam.examId}/classes/${classId}`} data-class-result={classId} className={TAP}>
              {t('ex.exam.resultOf', { className })}
            </a>
          ))}
          {classes.map(([classId, className]) => (
            <a key={`rc-${classId}`} href={`/app/exams/${exam.examId}/classes/${classId}/report-cards`} data-report-cards-link={classId} className={TAP}>
              {publishedClass(classId) ? t('rc.exam.published', { className }) : t('rc.exam.reportCards', { className })}
            </a>
          ))}
        </div>
      )}
      {data.mayRun && !allPublished && !classes.some(([classId]) => publishedClass(classId)) && (
        <div className="max-w-xs">
          <Select id={`exam-${exam.examId.slice(0, 8)}-type`} label={t('ex.make.type')} value={data.examTypes.some((x) => x.key === exam.examType) ? exam.examType : OTHER_EXAM_TYPE} disabled={busy} onChange={(e) => onType(e.target.value)}>
            {offeredExamTypes(data.examTypes, exam.examType).map((x) => (
              <option key={x.key} value={x.key}>{lang === 'hi' ? x.hi : x.en}</option>
            ))}
          </Select>
        </div>
      )}
      {data.mayRun && (
        <div className="flex flex-col gap-2">
          {adding ? (
            <>
              <PaperRow index={0} idPrefix={`exam-${exam.examId.slice(0, 8)}-paper`} paper={adding} parts={parts} data={data} onChange={(v) => onAdding(v)} />
              <div className="flex flex-wrap gap-2">
                <button type="button" className={PRIMARY} disabled={busy} onClick={() => onAdd(adding)}>{t('ex.exam.addPaperSave')}</button>
                <button type="button" className={TAP} onClick={() => onAdding(null)}>{t('ex.cancel')}</button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={TAP} onClick={() => onAdding(emptyPaper())}>{t('ex.exam.addPaper')}</button>
              {!anyMarks && (
                <button type="button" data-exam-remove className={TAP} disabled={busy} onClick={onRemove}>{t('ex.exam.remove')}</button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function PaperLine({ paper, open, mayRun, busy, onRemove }: { paper: PaperSummary; open: boolean; mayRun: boolean; busy: boolean; onRemove: () => void }) {
  const { t, lang } = useT();
  const complete = paper.roll > 0 && paper.entered >= paper.roll;
  return (
    <li data-paper={paper.paperId} data-paper-entered={complete ? 'yes' : 'no'} data-paper-published={paper.published ? 'yes' : 'no'} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate/10 p-3">
      <div className="min-w-0">
        <p className="font-semibold">{paper.className} · {paper.subjectName}</p>
        <p className="text-slate/70">
          {paper.date ? dayWords(paper.date, lang) : t('ex.paper.noDate')} · {paper.components.map((c) => t('ex.paper.partMax', { part: c.name, max: c.max })).join(' · ')}
        </p>
        <p className="flex flex-wrap items-center gap-2">
          <Badge variant={complete ? 'success' : 'warning'}>{complete ? t('ex.paper.entered') : t('ex.paper.waiting')}</Badge>
          <span>{t('ex.progress', { entered: paper.entered, roll: paper.roll })}</span>
          {complete && paper.enteredBy && <span className="text-slate/70">{t('ex.paper.enteredBy', { name: paper.enteredBy })}</span>}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={`/app/exams/papers/${paper.paperId}`} className={paper.mayEnter && open ? PRIMARY : TAP}>
          {paper.mayEnter && open ? t('ex.enterMarks') : t('ex.paper.open')}
        </a>
        {paper.mayEnter && open && (
          <a href={`/app/exams/papers/${paper.paperId}/marking`} data-mark-with-ai className={TAP}>
            {t('mk.entry.link')}
          </a>
        )}
        {mayRun && !paper.hasMarks && !paper.published && (
          <button type="button" data-paper-remove className={TAP} disabled={busy} onClick={onRemove}>{t('ex.paper.remove')}</button>
        )}
      </div>
    </li>
  );
}

function PaperRow({ index, idPrefix, paper, parts, data, onChange, onRemove }: { index: number; idPrefix: string; paper: PaperForm; parts: { key: string; name: string }[]; data: ExamsScreen; onChange: (p: PaperForm) => void; onRemove?: () => void }) {
  const { t } = useT();
  const id = (what: string) => `${idPrefix}-${index}-${what}`;
  return (
    <fieldset data-paper-row={index} className="flex flex-col gap-3 rounded-md border border-slate/10 p-3">
      <legend className="px-1 font-semibold">{t('ex.make.paperN', { n: index + 1 })}</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select id={id('class')} label={t('ex.make.class')} value={paper.classId} onChange={(e) => onChange({ ...paper, classId: e.target.value })}>
          <option value="">—</option>
          {data.classes.map((c) => (
            <option key={c.classId} value={c.classId}>{c.name}</option>
          ))}
        </Select>
        <Select id={id('subject')} label={t('ex.make.subject')} value={paper.subjectId} onChange={(e) => onChange({ ...paper, subjectId: e.target.value })}>
          <option value="">—</option>
          {data.subjects.map((s) => (
            <option key={s.subjectId} value={s.subjectId}>{s.name}</option>
          ))}
        </Select>
        <Input id={id('date')} type="date" label={t('ex.make.date')} value={paper.date} onChange={(e) => onChange({ ...paper, date: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {parts.map((part) => (
          <Input key={part.key} id={id(`max-${part.key}`)} inputMode="decimal" label={t('ex.make.max', { part: part.name })} value={paper.maxima[part.key] ?? ''} onChange={(e) => onChange({ ...paper, maxima: { ...paper.maxima, [part.key]: e.target.value } })} />
        ))}
      </div>
      {onRemove && (
        <button type="button" className={`${TAP} self-start`} onClick={onRemove}>{t('ex.make.removePaper')}</button>
      )}
    </fieldset>
  );
}
