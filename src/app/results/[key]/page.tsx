import type { Metadata } from 'next';
import Link from 'next/link';
import { MarkedScript } from '@/components/app-ui/MarkedScript';
import { withPlatformService } from '@/lib/auth/db';
import type { SchoolCheckedPaper } from '@/lib/contracts/school-link';
import type { Mark } from '@/lib/exams/papers';
import { t, type Lang, type MessageKey } from '@/lib/i18n';
import type { Sql } from '@/lib/jobs/types';
import { pagePictureUrl, readReport, type ReportView } from '@/lib/marking/report-links';
import { ReportPdf } from './ReportPdf';

// The private report link for parents without the app (C351): what the office sent in the family's own WhatsApp
// message. Anyone holding the key sees one child's published result: the school, the child's first name and class, the
// exam, each subject's published marks and grade by the scheme kept with the publication (childResult, as the report
// card), and, while the school lets families see them, the checked pages with the marks in the margin, the questions,
// the teacher's notes and what to practise. Read through the platform role and the database's own definer functions
// only (src/lib/marking/report-links.ts). A wrong key, an expired one and a reopened publication show the same one
// page. Not indexed, never cached by a shared cache, no analytics, and the address is not passed on to other sites.
// English or Hindi by ?lang=hi (the message carries the guardian's language), with a link to the other.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Exam result', robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } }, referrer: 'no-referrer' };

const platform = withPlatformService as <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;
const shown = (n: number | null) => (n === null ? '–' : Number.isInteger(n) ? String(n) : n.toFixed(1));
const dayText = (lang: Lang, iso: string) => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const written = (text: string) => (/[ऀ-ॿ]/.test(text) ? 'hi' : 'en');

function markText(lang: Lang, mark: Mark | null, max: number): string {
  if (!mark) return '–';
  if (mark.kind === 'absent') return t(lang, 'fam.marks.report.absent');
  if (mark.kind === 'exempt') return t(lang, 'fam.marks.report.exempt');
  return t(lang, 'fam.marks.partScore', { score: shown(mark.score), max: shown(max) });
}
const scored = (lang: Lang, percent: number | null, grade: string | null) => (percent === null ? t(lang, 'fam.marks.report.notComplete') : grade ? `${percent}% · ${grade}` : `${percent}%`);

function Expired({ lang }: { lang: Lang }) {
  return (
    <div data-report-state="expired" className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 py-10 text-slate">
      <h1 className="text-xl font-bold">{t(lang, 'fam.marks.report.title')}</h1>
      {(['en', 'hi'] as const).map((l) => (
        <div key={l} lang={l} className="flex flex-col gap-1 rounded-lg border border-slate/10 bg-white p-4 text-base">
          <p className="font-semibold">{t(l, 'fam.marks.report.expired')}</p>
          <p>{t(l, 'fam.marks.report.expiredHelp')}</p>
        </div>
      ))}
    </div>
  );
}

function Paper({ lang, paper, reportKey }: { lang: Lang; paper: SchoolCheckedPaper; reportKey: string }) {
  return (
    <section data-report-paper={paper.paperId} aria-labelledby={`p-${paper.paperId}`} className="flex flex-col gap-3 rounded-2xl border border-slate/10 bg-white p-4">
      <h2 id={`p-${paper.paperId}`} className="text-lg font-bold text-slate">
        <span lang={written(paper.subject)}>{paper.subject}</span>
      </h2>
      <ul className="flex flex-wrap gap-2">
        {paper.parts.map((p) => (
          <li key={p.component} className="rounded-xl bg-off-white px-3 py-2 text-base font-semibold text-slate">
            <span lang={written(p.name)}>{p.name}</span>: {t(lang, 'fam.marks.partScore', { score: shown(p.score), max: shown(p.max) })}
          </li>
        ))}
      </ul>
      <p className="text-sm text-slate">{t(lang, 'fam.marks.approved')}</p>
      {paper.pages.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-base font-bold text-slate">{t(lang, 'fam.marks.pagesTitle')}</h3>
          <p className="text-sm text-slate">{t(lang, 'fam.marks.pagesLead')}</p>
          <MarkedScript
            pages={paper.pages}
            marks={paper.questions.map((q) => ({ label: q.label, marks: q.marks, max: q.max, counted: q.counted, place: q.place }))}
            src={(pageId) => pagePictureUrl(reportKey, pageId)}
            words={{ page: t(lang, 'fam.marks.page'), badge: t(lang, 'fam.marks.badge'), badgeNotCounted: t(lang, 'fam.marks.badgeNotCounted') }}
          />
        </div>
      )}
      <h3 className="text-base font-bold text-slate">{t(lang, 'fam.marks.questionsTitle')}</h3>
      <ol className="flex flex-col gap-2">
        {paper.questions.map((q) => (
          <li key={q.label} data-question={q.label} className={`flex flex-col gap-1 rounded-xl px-3 py-2 ${q.counted ? 'bg-off-white' : 'bg-white ring-1 ring-slate/15'}`}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-bold text-slate">{t(lang, 'fam.marks.question', { label: q.label })}</p>
              <p className="shrink-0 font-bold text-slate">{q.marks === null ? t(lang, 'fam.marks.noMark') : t(lang, 'fam.marks.markOf', { marks: shown(q.marks), max: shown(q.max) })}</p>
            </div>
            {q.question && (
              <p lang={written(q.question)} className="whitespace-pre-line text-sm text-slate/80">
                {q.question}
              </p>
            )}
            {!q.counted && <p className="text-sm font-semibold text-slate">{t(lang, 'fam.marks.notCounted')}</p>}
            {q.mistake && q.mistake !== 'none' && <p className="text-sm font-semibold text-slate">{t(lang, `fam.marks.mistake.${q.mistake}` as MessageKey)}</p>}
            {q.topic && (
              <p lang={written(q.topic)} className="text-sm text-royal-deep">
                {q.chapter ? `${q.chapter} · ${q.topic}` : q.topic}
              </p>
            )}
            {q.note && (
              <p lang={written(q.note)} className="whitespace-pre-line text-sm text-slate">
                {q.note}
              </p>
            )}
          </li>
        ))}
      </ol>
      {paper.strengths && (
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-bold text-emerald-text">{t(lang, 'fam.marks.strengths')}</h3>
          <p lang={written(paper.strengths)} className="whitespace-pre-line text-base text-slate">
            {paper.strengths}
          </p>
        </div>
      )}
      {paper.improve && (
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-bold text-slate">{t(lang, 'fam.marks.improve')}</h3>
          <p lang={written(paper.improve)} className="whitespace-pre-line text-base text-slate">
            {paper.improve}
          </p>
        </div>
      )}
      {paper.practice.length > 0 && (
        <div className="flex flex-col gap-1" data-practice-next>
          <h3 className="text-base font-bold text-royal-deep">{t(lang, 'fam.marks.practice')}</h3>
          <ul className="flex flex-col gap-2">
            {paper.practice.map((p, i) => (
              <li key={i} className="rounded-xl bg-off-white px-3 py-2 text-sm text-slate">
                {p.topic && (
                  <span lang={written(p.topic)} className="block font-bold text-royal-deep">
                    {p.chapter ? `${p.chapter} · ${p.topic}` : p.topic}
                  </span>
                )}
                <span lang={written(p.text)}>{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Report({ lang, view, reportKey }: { lang: Lang; view: ReportView; reportKey: string }) {
  const other: Lang = lang === 'hi' ? 'en' : 'hi';
  return (
    <div data-report-state="open" className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 text-slate">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate">
          <span lang={written(view.schoolName)}>{view.schoolName}</span>
        </p>
        <Link href={`/results/${reportKey}${other === 'hi' ? '?lang=hi' : ''}`} prefetch={false} lang={other} hrefLang={other} rel="nofollow" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-royal underline underline-offset-2">
          {t(lang, 'fam.marks.report.otherLanguage')}
        </Link>
      </div>
      <h1 className="text-2xl font-extrabold">{t(lang, 'fam.marks.report.title')}</h1>
      <div className="flex flex-col gap-1 rounded-2xl border border-slate/10 bg-white p-4">
        <p className="text-lg font-bold" data-report-child>
          {t(lang, 'fam.marks.report.child', { name: view.firstName, class: view.className })}
        </p>
        <p className="text-base">
          <span lang={written(view.exam)}>{view.exam}</span> · {t(lang, 'fam.school.resultPublished', { date: dayText(lang, view.publishedOn) })}
        </p>
        <p className="text-sm">{t(lang, 'fam.marks.report.private')}</p>
        <p className="text-sm">{t(lang, 'fam.marks.report.validFor')}</p>
      </div>
      <section aria-labelledby="report-subjects" className="flex flex-col gap-2 rounded-2xl border border-slate/10 bg-white p-4">
        <h2 id="report-subjects" className="text-lg font-bold">
          {t(lang, 'fam.marks.report.subjects')}
        </h2>
        <ul className="flex flex-col gap-2" data-report-subjects>
          {view.subjects.map((s) => (
            <li key={s.paperId} className="flex flex-col gap-1 rounded-xl bg-off-white px-3 py-2">
              <div className="flex items-baseline justify-between gap-3">
                <span lang={written(s.name)} className="font-bold">
                  {s.name}
                </span>
                <span className="shrink-0 font-bold">{scored(lang, s.percent, s.grade)}</span>
              </div>
              <p className="text-sm">
                {s.parts.map((p, i) => (
                  <span key={i}>
                    {i > 0 ? ' · ' : ''}
                    <span lang={written(p.name)}>{p.name}</span>: {markText(lang, p.mark, p.max)}
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ul>
        <p className="text-base font-bold">
          {t(lang, 'fam.marks.report.overall')}: {scored(lang, view.overall.percent, view.overall.grade)}
        </p>
      </section>
      {view.papers.length > 0 && (
        <ReportPdf
          papers={view.papers.map((p) => ({
            subject: p.subject,
            pages: p.pages.map((g) => ({ pageId: g.pageId, src: pagePictureUrl(reportKey, g.pageId) })),
            marks: p.questions.map((q) => ({ label: q.label, marks: q.marks, max: q.max, counted: q.counted, place: q.place })),
          }))}
          fileName={`${view.firstName} ${view.exam}`}
          title={`${view.firstName} · ${view.exam}`}
          words={{ pdf: t(lang, 'fam.marks.report.pdf'), making: t(lang, 'fam.marks.report.pdfMaking'), failed: t(lang, 'fam.marks.report.pdfFailed'), page: t(lang, 'fam.marks.page') }}
        />
      )}
      {view.papers.map((p) => (
        <Paper key={p.paperId} lang={lang} paper={p} reportKey={reportKey} />
      ))}
    </div>
  );
}

export default async function ReportLinkPage({ params, searchParams }: { params: { key: string }; searchParams: { lang?: string } }) {
  const lang: Lang = searchParams.lang === 'hi' ? 'hi' : 'en';
  const lookup = await platform((db) => readReport(db, params.key)).then(
    (view) => ({ failed: false as const, view }),
    () => ({ failed: true as const, view: null })
  );
  // A lookup that fails is not a link that does not exist: the page says to try again (as C228's copies do).
  if (lookup.failed) {
    return (
      <div lang={lang} data-report-state="unavailable" className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 py-10 text-slate">
        <h1 className="text-xl font-bold">{t(lang, 'fam.marks.report.title')}</h1>
        <p className="rounded-lg border border-slate/10 bg-white p-4 text-base">{t(lang, 'fam.marks.report.unavailable')}</p>
      </div>
    );
  }
  return <div lang={lang}>{lookup.view ? <Report lang={lang} view={lookup.view} reportKey={params.key} /> : <Expired lang={lang} />}</div>;
}
