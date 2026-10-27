'use client';

import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { dayWords, numberWords } from '@/components/exams/exam-format';
import { SECTION } from '@/components/exams/SchemeParts';
import type { Genome } from '@/lib/genome/rules';
import type { AnswerEvidence, ChapterTopics } from '@/lib/genome/topics';
import { tCount, type Lang, type MessageKey } from '@/lib/i18n';

// The Learning Genome by topic (C352), as the server worked it out from the child's approved answer sheets: each
// chapter and topic with the marks got out of the marks possible and the answers they come from, each linking to its
// paper; the kinds of mistake that keep coming back; progress by chapter against the child's own previous exam; and
// what to practise next. In syllabus order and the order of the exams, never by marks. The lines in use are said
// where they are used. The child is compared only with themselves.

const LINK = 'inline-flex min-h-[44px] items-center text-sapphire underline';
const paperHref = (paperId: string) => `/app/exams/papers/${paperId}`;

type T = (key: MessageKey, params?: Record<string, string | number>) => string;
const pct = (t: T, lang: Lang, n: number) => t('ex.result.percent', { percent: numberWords(n, lang) });
const group = <X extends { subjectId: string; subjectName: string }>(list: readonly X[]) => {
  const out: { subjectId: string; subjectName: string; items: X[] }[] = [];
  for (const x of list) {
    const last = out[out.length - 1];
    if (last && last.subjectId === x.subjectId) last.items.push(x);
    else out.push({ subjectId: x.subjectId, subjectName: x.subjectName, items: [x] });
  }
  return out;
};

function Evidence({ list, kind }: { list: readonly AnswerEvidence[]; kind: string }) {
  const { t, lang } = useT();
  return (
    <ul className="flex flex-col" data-genome-evidence={kind}>
      {list.map((e, i) => (
        <li key={`${e.paperId}|${e.label}|${i}`}>
          <a href={paperHref(e.paperId)} className={LINK}>
            {t('ins.evidence.item', { exam: e.examName, label: e.label, marks: numberWords(e.marks, lang), max: numberWords(e.max, lang) })}
          </a>
        </li>
      ))}
    </ul>
  );
}

function ChapterCard({ c }: { c: ChapterTopics }) {
  const { t, lang } = useT();
  return (
    <li data-genome-topic-chapter={c.chapter} className="rounded-lg border border-slate/10 bg-white p-3">
      <p className="font-semibold">{t('ins.chapter.head', { chapter: c.chapter, class: c.className })}</p>
      <p data-genome-chapter-marks>{t('ins.marks', { marks: numberWords(c.marks, lang), max: numberWords(c.max, lang), percent: pct(t, lang, c.rounded) })}</p>
      <ul className="mt-2 flex flex-col gap-2">
        {c.topics.map((x) => (
          <li key={x.unitId} data-genome-topic={x.unitId} className="rounded-md bg-off-white px-3 py-1">
            <details>
              <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold">
                <span data-genome-topic-marks>
                  {tCount(lang, 'ins.topic.row', x.questions, { topic: x.topic, marks: numberWords(x.marks, lang), max: numberWords(x.max, lang), percent: pct(t, lang, x.rounded) })}
                </span>
              </summary>
              <p className="text-slate/70">{t('ins.topic.from')}</p>
              <Evidence list={x.evidence} kind="topic" />
            </details>
          </li>
        ))}
      </ul>
    </li>
  );
}

export function GenomeTopics({ genome }: { genome: Genome }) {
  const { t, lang } = useT();
  const g = genome.topics;
  const day = (ymd: string) => dayWords(ymd, lang);
  const progress = g.chapters.filter((c) => c.change);

  return (
    <>
      <section className={SECTION} data-genome-topics={g.scripts}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-base font-bold">{t('ins.topics.title')}</h2>
          <InfoTip label={t('gn.child.source')}>{t('ins.topics.how')}</InfoTip>
        </div>
        {!g.scripts && <p className="rounded-md bg-off-white px-3 py-2">{t('ins.topics.none')}</p>}
        {g.scripts > 0 && <p data-genome-topics-from>{tCount(lang, 'ins.topics.from', g.scripts, { answers: numberWords(g.answers, lang) })}</p>}
        {g.unlinked > 0 && <p className="text-slate/70" data-genome-unlinked={g.unlinked}>{tCount(lang, 'ins.topics.unlinked', g.unlinked)}</p>}
        {g.scripts > 0 && !g.chapters.length && <p className="rounded-md bg-off-white px-3 py-2">{t('ins.topics.noTopics')}</p>}
        {group(g.chapters).map((s) => (
          <div key={s.subjectId} data-genome-topic-subject={s.subjectId}>
            <h3 className="font-bold">{s.subjectName}</h3>
            <ul className="mt-2 flex flex-col gap-3">
              {s.items.map((c) => (
                <ChapterCard key={`${c.classId}|${c.chapter}`} c={c} />
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className={SECTION} data-genome-progress>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-base font-bold">{t('ins.progress.title')}</h2>
          <InfoTip label={t('gn.child.source')} tone="white">{t('ins.progress.how')}</InfoTip>
        </div>
        <p className="text-slate/70" data-genome-progress-line>{t('ins.progress.line', { line: numberWords(genome.settings.trendPoints, lang) })}</p>
        {!progress.length && <p className="rounded-md bg-off-white px-3 py-2">{t('ins.progress.none')}</p>}
        {group(progress).map((s) => (
          <div key={s.subjectId}>
            <h3 className="font-bold">{s.subjectName}</h3>
            <ul className="mt-2 flex flex-col gap-3">
              {s.items.map((c) => {
                const ch = c.change!;
                const words = {
                  chapter: c.chapter,
                  before: pct(t, lang, ch.from.rounded),
                  beforeExam: ch.from.examName,
                  after: pct(t, lang, ch.to.rounded),
                  afterExam: ch.to.examName,
                  line: numberWords(ch.line, lang),
                };
                return (
                  <li key={`${c.classId}|${c.chapter}`} data-genome-progress-chapter={c.chapter} data-genome-progress-change={ch.direction} className="rounded-lg border border-slate/10 bg-white p-3">
                    <p className="font-semibold">
                      {ch.direction === 'steady' ? t('ins.progress.steady', words) : tCount(lang, `ins.progress.${ch.direction}`, ch.points, { ...words, count: numberWords(ch.points, lang) })}
                    </p>
                    <ol className="mt-1 flex flex-col">
                      {c.points.map((p) => (
                        <li key={p.paperId}>
                          <a href={paperHref(p.paperId)} className={LINK}>
                            {p.date
                              ? t('ins.progress.pointDate', { exam: p.examName, date: day(p.date), marks: numberWords(p.marks, lang), max: numberWords(p.max, lang), percent: pct(t, lang, p.rounded) })
                              : t('ins.progress.point', { exam: p.examName, marks: numberWords(p.marks, lang), max: numberWords(p.max, lang), percent: pct(t, lang, p.rounded) })}
                          </a>
                        </li>
                      ))}
                    </ol>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <section className={SECTION} data-genome-mistakes={g.mistakes.length}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-base font-bold">{t('ins.mistakes.title')}</h2>
          <InfoTip label={t('gn.child.source')} tone="white">{t('ins.mistakes.how')}</InfoTip>
        </div>
        <p className="text-slate/70" data-genome-mistakes-line>
          {t('ins.mistakes.line', { questions: numberWords(genome.settings.mistakeMinQuestions, lang), papers: numberWords(genome.settings.mistakeMinPapers, lang) })}
        </p>
        {!g.mistakes.length && <p className="rounded-md bg-off-white px-3 py-2">{t(g.scripts ? 'ins.mistakes.none' : 'ins.mistakes.noScripts')}</p>}
        <ul className="flex flex-col gap-3">
          {g.mistakes.map((m) => (
            <li key={m.kind} data-genome-mistake={m.kind} className="rounded-lg border border-slate/10 bg-white p-3">
              <details>
                <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold">
                  {tCount(lang, 'ins.mistake.row', m.questions, { kind: t(`ins.error.${m.kind}` as MessageKey), papers: numberWords(m.papers, lang) })}
                </summary>
                <p className="text-slate/70">{t('ins.topic.from')}</p>
                <Evidence list={m.evidence} kind="mistake" />
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section className={SECTION} data-genome-practice>
        <h2 className="text-base font-bold">{t('ins.practice.title')}</h2>
        {!g.practice.length && <p className="rounded-md bg-off-white px-3 py-2">{t('ins.practice.none')}</p>}
        <ul className="flex flex-col gap-3">
          {g.practice.map((p) => (
            <li key={p.subjectId} data-genome-practice-subject={p.subjectId} className="rounded-lg border border-slate/10 bg-white p-3">
              <h3 className="font-bold">{p.subjectName}</h3>
              <a href={paperHref(p.paperId)} className={LINK}>
                {p.date ? t('ins.practice.fromDate', { exam: p.examName, date: day(p.date) }) : t('ins.practice.from', { exam: p.examName })}
              </a>
              <ul className="mt-1 flex flex-col gap-2">
                {p.items.map((x, i) => (
                  <li key={i} className="rounded-md bg-off-white px-3 py-2">
                    <p>{x.text}</p>
                    {x.chapter && x.topic && <p className="text-slate/70">{t('ins.practice.topic', { chapter: x.chapter, topic: x.topic })}</p>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
