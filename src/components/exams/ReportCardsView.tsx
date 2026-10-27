'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import type { ReportCardsScreen } from '@/lib/exams/publish';
import type { ReportCardSet } from '@/lib/exams/report-card';
import { reportCardBlocks, type CardBlock } from '@/lib/exams/report-card-text';
import type { MessageKey } from '@/lib/i18n';
import { downloadBlob, safeFilename } from '@/lib/pdf/browser';
import { CardPreview } from './CardPreview';
import { momentWords } from './exam-format';
import { reportCardsPdf } from './report-card-pdf';
import { PRIMARY, SECTION, TAP } from './SchemeParts';

// Publish and report cards (docs/27 row 9c, C215). The office (the principal, the school admin, the academic
// coordinator) publishes a class's result once every paper is entered: its marks, papers and remarks are then
// frozen, and the grading scheme in force is kept with it. Only the principal reopens it, with a reason. The class
// teacher writes each child's remark before it is published; the class teacher or the office records the
// co-scholastic grades of the scheme's areas (C219), frozen with it too. The office and the class teacher show and download
// report cards, one child or the whole class, drawn as a PDF on this device. Children are listed in roll order; each
// card holds one child's own marks. The server and the database decide who may do what.

const ERRORS = ['not_found', 'not_entered', 'scripts_changed', 'no_scheme', 'published', 'not_published', 'reason', 'remarks', 'child', 'remark', 'not_allowed', 'no_co_scholastic', 'co_entries', 'co_grade'];
const coKey = (studentId: string, area: string) => `${studentId}|${area}`;

export function ReportCardsView({ examId, classId }: { examId: string; classId: string }) {
  const { t, lang } = useT();
  const [data, setData] = useState<ReportCardsScreen | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [co, setCo] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<{ studentId: string; blocks: CardBlock[] } | null>(null);
  const base = `/api/app/exams/${examId}/classes/${classId}/report-cards`;

  const load = useCallback(async () => {
    const res = await fetch(base, { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as ReportCardsScreen | null) : null;
    setFailed(!got);
    if (got) {
      setData(got);
      setRemarks(Object.fromEntries(got.children.map((c) => [c.studentId, c.remark ?? ''])));
      setCo(Object.fromEntries(got.children.flatMap((c) => (got.coScholastic?.areas ?? []).map((a) => [coKey(c.studentId, a), c.coScholastic[a] ?? '']))));
    }
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);

  const post = async (payload: unknown, done: (body: Record<string, unknown>) => string) => {
    setBusy(true);
    setNote(null);
    const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const body = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
    setBusy(false);
    if (!res?.ok || !body) {
      const code = typeof body?.code === 'string' ? body.code : '';
      setNote({ ok: false, text: ERRORS.includes(code) ? t(`rc.err.${code}` as MessageKey) : res?.status === 403 ? t('rc.err.not_allowed') : t('rc.err.other') });
      return false;
    }
    setNote({ ok: true, text: done(body) });
    setShown(null);
    await load();
    return true;
  };

  const cards = async (studentId: string | null): Promise<ReportCardSet | null> => {
    const res = await fetch(`${base}/cards${studentId ? `?student=${encodeURIComponent(studentId)}` : ''}`, { cache: 'no-store' }).catch(() => null);
    return res?.ok ? ((await res.json().catch(() => null)) as ReportCardSet | null) : null;
  };
  const show = async (studentId: string) => {
    if (shown?.studentId === studentId) return setShown(null);
    const set = await cards(studentId);
    if (!set?.cards[0]) return setNote({ ok: false, text: t('rc.download.failed') });
    setShown({ studentId, blocks: reportCardBlocks(set, set.cards[0], lang) });
  };
  const download = async (studentId: string | null) => {
    if (!data) return;
    setBusy(true);
    setNote({ ok: true, text: t('rc.download.making') });
    try {
      const set = await cards(studentId);
      if (!set?.cards.length) throw new Error('cards');
      const roll = studentId ? set.cards[0].rollNo ?? '' : '';
      const file = safeFilename(`report-card ${set.exam.name} ${set.className} ${roll}`, 'pdf');
      const blob = await reportCardsPdf(set.cards.map((c) => reportCardBlocks(set, c, lang)), file, `${set.schoolName} · ${set.exam.name} · ${set.className}`);
      downloadBlob(blob, file);
      setNote({ ok: true, text: t('rc.download.made', { file }) });
    } catch {
      setNote({ ok: false, text: t('rc.download.failed') });
    }
    setBusy(false);
  };

  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('rc.failed')}</p>;
  if (!data) return null;
  const pub = data.inForce;
  const reopened = !pub ? data.history.find((h) => h.reopenedAt !== null) ?? null : null;
  const changedRemarks = data.children.filter((c) => (remarks[c.studentId] ?? '').trim() !== (c.remark ?? ''));
  const areas = data.coScholastic?.areas ?? [];
  const changedCo = data.children.flatMap((c) => areas.filter((a) => (co[coKey(c.studentId, a)] ?? '') !== (c.coScholastic[a] ?? '')).map((a) => ({ studentId: c.studentId, area: a, grade: co[coKey(c.studentId, a)] ?? '' })));
  const gradeWords = (grade: string) => {
    const g = data.coScholastic?.grades.find((x) => x.grade === grade);
    return g?.meaning ? t('rc.cell.gradeMeaning', { grade: g.grade, meaning: g.meaning }) : grade;
  };
  const who = (c: ReportCardsScreen['children'][number]) => (c.rollNo ? t('ex.entry.child', { roll: c.rollNo, name: c.name }) : c.name);

  return (
    <div lang={lang} data-report-cards data-published={pub ? String(pub.version) : 'no'} className="flex flex-col gap-4 text-sm text-slate">
      {note && (
        <p role="status" data-rc-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}

      <section data-rc-state className={SECTION}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="min-w-0 text-base font-bold">{data.exam.name} · {data.className}</h2>
          <Badge variant={pub ? 'success' : reopened ? 'warning' : 'neutral'}>
            {pub ? t('rc.state.published', { version: pub.version }) : reopened ? t('rc.state.reopened') : t('rc.state.notPublished')}
          </Badge>
        </div>
        {pub && <p>{pub.publishedBy ? t('rc.publishedBy', { name: pub.publishedBy, when: momentWords(pub.publishedAt, lang), scheme: pub.schemeVersion }) : t('rc.publishedNoName', { when: momentWords(pub.publishedAt, lang), scheme: pub.schemeVersion })}</p>}
        {reopened && <p data-rc-reopened>{t('rc.reopenedBy', { version: reopened.version, name: reopened.reopenedBy ?? '', when: momentWords(reopened.reopenedAt as string, lang), reason: reopened.reason ?? '' })}</p>}
        <div className="flex flex-wrap items-center gap-x-1">
          <span className="text-slate/70">{t('rc.noRank.short')}</span>
          <InfoTip>
            {data.recognitionOn && <p className="mb-2">{t('rc.recognition.on')}</p>}
            <p>{t('rc.noRank')}</p>
          </InfoTip>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/app/exams/${examId}/classes/${classId}`} className={TAP}>{t('ex.exam.resultOf', { className: data.className })}</a>
          <a href="/app/exams" className={TAP}>{t('ex.allExams')}</a>
        </div>
      </section>

      <section data-rc-papers className={SECTION}>
        <h2 className="text-base font-bold">{t('rc.papers.title')}</h2>
        <ul className="flex flex-col gap-2">
          {data.papers.map((p) => (
            <li key={p.paperId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 p-3">
              <span className="font-semibold">{p.subjectName}</span>
              <Badge variant={p.entered ? 'success' : 'warning'}>{p.entered ? t('ex.paper.entered') : t('ex.paper.waiting')}</Badge>
            </li>
          ))}
        </ul>
      </section>

      {!pub && (
        <section data-rc-publish className={SECTION}>
          <h2 className="sr-only">{t('rc.publish.title')}</h2>
          {data.scheme ? <p>{t('rc.publish.how', { className: data.className, version: data.scheme.version })}</p> : <p>{t('rc.publish.noScheme')}</p>}
          {data.papers.some((p) => !p.entered) && <p className="rounded-md bg-off-white px-3 py-2">{t('rc.publish.waiting')}</p>}
          {data.mayPublish ? (
            <button type="button" data-rc-publish-button className={`${PRIMARY} self-start`} disabled={busy || !data.ready} onClick={() => void post({ action: 'publish' }, (b) => t('rc.publish.done', { version: Number(b.version) }))}>
              {t('rc.publish.button')}
            </button>
          ) : (
            <p className="text-slate/70">{t('rc.publish.officeOnly')}</p>
          )}
        </section>
      )}

      {data.mayReopen && (
        <section data-rc-reopen className={SECTION}>
          <div className="flex flex-wrap items-center gap-x-1">
            <h2 className="text-base font-bold">{t('rc.reopen.title')}</h2>
            <InfoTip>{t('rc.reopen.how')}</InfoTip>
          </div>
          <Textarea id="rc-reason" label={t('rc.reopen.reason')} rows={2} maxLength={500} helperText={t('rc.reopen.reasonHow')} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button
            type="button"
            data-rc-reopen-button
            className={`${TAP} self-start`}
            disabled={busy || reason.trim().length < 5}
            onClick={() => void post({ action: 'reopen', reason }, () => t('rc.reopen.done')).then((ok) => ok && setReason(''))}
          >
            {t('rc.reopen.button')}
          </button>
        </section>
      )}

      <section data-rc-children className={SECTION}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-base font-bold">{t('rc.children.title')}</h2>
          <InfoTip>
            <p>{pub ? (data.mayDownload ? t('rc.download.how') : t('rc.download.who')) : t('rc.download.notYet')}</p>
            {data.mayWriteRemarks && <p className="mt-2">{t('rc.remarks.how')}</p>}
            {!data.mayWriteRemarks && !pub && (data.classTeacher ? <p className="mt-2">{t('rc.remarks.byTeacher', { name: data.classTeacher })}</p> : <p className="mt-2">{t('rc.remarks.noTeacher')}</p>)}
            {areas.length > 0 && (
              <p data-rc-co-how className="mt-2">
                {t('rc.co.title')}: {data.mayWriteCoScholastic ? t('rc.co.how') : t('rc.co.who')}
              </p>
            )}
          </InfoTip>
        </div>
        {pub && data.mayDownload && (
          <button type="button" data-rc-download-all className={`${PRIMARY} self-start`} disabled={busy} onClick={() => void download(null)}>
            {t('rc.download.all')}
          </button>
        )}
        {data.notShown > 0 && <p className="rounded-md bg-off-white px-3 py-2">{t('ex.entry.notShown', { n: data.notShown })}</p>}
        {!data.children.length && <p className="rounded-md bg-off-white px-3 py-2">{t('ex.entry.noChildren')}</p>}
        <ol className="flex flex-col gap-2">
          {data.children.map((c) => (
            <li key={c.studentId} data-rc-child={c.studentId} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 font-semibold">{who(c)}</p>
                {pub && data.mayDownload && (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" data-rc-show className={TAP} aria-expanded={shown?.studentId === c.studentId} onClick={() => void show(c.studentId)}>
                      {shown?.studentId === c.studentId ? t('rc.download.hide') : t('rc.download.show')}
                    </button>
                    <button type="button" data-rc-download aria-label={`${t('rc.download.one')}: ${c.name}`} className={TAP} disabled={busy} onClick={() => void download(c.studentId)}>
                      {t('rc.download.pdf')}
                    </button>
                    <a href={`/app/exams/progress/${c.studentId}`} data-rc-progress aria-label={t('pr.open.child', { name: c.name })} className={TAP}>
                      {t('pr.open')}
                    </a>
                  </div>
                )}
              </div>
              {data.mayWriteRemarks ? (
                <div role="group" aria-label={c.name}>
                  <Textarea id={`rc-remark-${c.studentId}`} data-rc-remark label={t('rc.remarks.label', { name: c.name })} rows={2} maxLength={500} value={remarks[c.studentId] ?? ''} onChange={(e) => setRemarks({ ...remarks, [c.studentId]: e.target.value })} />
                </div>
              ) : (
                c.remark && <p className="text-slate/70">{c.remark}</p>
              )}
              {areas.length > 0 && data.mayWriteCoScholastic && (
                <div data-rc-co-child role="group" aria-label={c.name} className="grid gap-2 sm:grid-cols-2">
                  {areas.map((a) => (
                    <Select
                      key={a}
                      id={`rc-co-${c.studentId}-${areas.indexOf(a)}`}
                      data-rc-co={a}
                      label={t('rc.co.label', { area: a, name: c.name })}
                      value={co[coKey(c.studentId, a)] ?? ''}
                      onChange={(e) => setCo({ ...co, [coKey(c.studentId, a)]: e.target.value })}
                    >
                      <option value="">{t('rc.co.none')}</option>
                      {data.coScholastic!.grades.map((g) => (
                        <option key={g.grade} value={g.grade}>
                          {gradeWords(g.grade)}
                        </option>
                      ))}
                    </Select>
                  ))}
                </div>
              )}
              {areas.length > 0 && !data.mayWriteCoScholastic && areas.some((a) => c.coScholastic[a]) && (
                <p data-rc-co-shown className="text-slate/70">{areas.filter((a) => c.coScholastic[a]).map((a) => t('rc.co.shown', { area: a, grade: gradeWords(c.coScholastic[a]) })).join(' · ')}</p>
              )}
              {shown?.studentId === c.studentId && <CardPreview blocks={shown.blocks} />}
            </li>
          ))}
        </ol>
        {data.mayWriteRemarks && (
          <button
            type="button"
            data-rc-remarks-save
            className={`${PRIMARY} self-start`}
            disabled={busy || !changedRemarks.length}
            onClick={() => void post({ action: 'remarks', remarks: changedRemarks.map((c) => ({ studentId: c.studentId, remark: (remarks[c.studentId] ?? '').trim() })) }, () => t('rc.remarks.saved'))}
          >
            {changedRemarks.length ? t('rc.remarks.save') : t('rc.remarks.nothing')}
          </button>
        )}
        {areas.length > 0 && data.mayWriteCoScholastic && (
          <button
            type="button"
            data-rc-co-save
            className={`${PRIMARY} self-start`}
            disabled={busy || !changedCo.length}
            onClick={() => void post({ action: 'co_scholastic', grades: changedCo }, () => t('rc.co.saved'))}
          >
            {changedCo.length ? t('rc.co.save') : t('rc.co.nothing')}
          </button>
        )}
      </section>

      {data.history.length > 0 && (
        <section data-rc-history className={SECTION}>
          <h2 className="text-base font-bold">{t('rc.history.title')}</h2>
          <ul className="flex flex-col gap-2">
            {data.history.map((h) => (
              <li key={h.version} className="rounded-md border border-slate/10 p-3">
                <p>{t('rc.history.published', { version: h.version, name: h.publishedBy ?? '', when: momentWords(h.publishedAt, lang) })}</p>
                {h.reopenedAt && <p className="text-slate/70">{t('rc.history.reopened', { name: h.reopenedBy ?? '', when: momentWords(h.reopenedAt, lang), reason: h.reason ?? '' })}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
