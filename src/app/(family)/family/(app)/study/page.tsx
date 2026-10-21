import Link from 'next/link';
import { redirect } from 'next/navigation';
import { StudyQuestion } from '@/components/family/StudyQuestion';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { readFamilyCatalog } from '@/lib/family/catalog';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';
import { familyWords } from '@/lib/family/words';
import { t, type MessageKey } from '@/lib/i18n';

// Study (M1-5, C251): the child's subject, its chapters and topics from the catalog released to everyone for the
// child's class, each opening Understand; and a typed question. Without a catalog for the class (classes 6–8 for
// 2026-27, C250) only the question is offered.
const SUBJECTS = ['mathematics', 'science'] as const;
type Subject = (typeof SUBJECTS)[number];

export default async function FamilyStudyPage({ searchParams }: { searchParams: { subject?: string } }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  const lang = page.childLang;
  const subject: Subject = SUBJECTS.includes(searchParams.subject as Subject) ? (searchParams.subject as Subject) : (child.freeSubject ?? 'science');
  const catalog = await familyPageRead(page, (db) => readFamilyCatalog(db, { board: child.board, classLevel: child.classLevel, subject, lang }));
  const tone = subject === 'mathematics' ? 'mathematics' : 'science';
  const w = familyWords(lang, [...UNDERSTAND_KEYS, 'fam.study.ask', 'fam.study.askHelp', 'fam.study.askButton'] as MessageKey[]);
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family" backLabel={t(lang, 'fam.nav.home')} kicker={t(lang, 'fam.class.label', { n: child.classLevel })} title={t(lang, 'fam.study.title')} tone={subject === 'science' ? 'emerald' : 'royal'} />
      <main className="mx-auto -mt-4 flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-24">
        <nav aria-label={t(lang, 'fam.study.subjects')} className="grid grid-cols-2 gap-2 rounded-3xl bg-white p-2 shadow-sm ring-1 ring-slate/10">
          {SUBJECTS.map((s) => (
            <Link
              key={s}
              href={`/family/study?subject=${s}`}
              aria-current={s === subject ? 'page' : undefined}
              className={`flex min-h-[44px] items-center justify-center rounded-2xl text-base font-bold ${s === subject ? (s === 'science' ? 'bg-emerald-text text-white' : 'bg-royal text-white') : 'text-slate hover:bg-slate/5'}`}
            >
              {t(lang, `fam.subject.${s}`)}
            </Link>
          ))}
        </nav>
        <StudyQuestion w={w} subject={subject} tone={tone} />
        {catalog ? (
          <section aria-labelledby="fam-chapters" className="flex flex-col gap-2">
            <h2 id="fam-chapters" className="px-1 text-lg font-extrabold text-slate">
              {t(lang, 'fam.study.chapters')}
            </h2>
            <ol className="flex flex-col gap-2">
              {catalog.chapters.map((c) => (
                <li key={c.key} className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-slate/10">
                  <Link href={`/family/understand?kind=chapter&key=${encodeURIComponent(c.key)}`} className="flex min-h-[44px] items-center justify-between gap-2 px-1 text-base font-bold text-slate">
                    <span lang={lang === 'hi' ? 'en' : undefined}>{c.title}</span>
                    <span aria-hidden="true" className="text-royal">→</span>
                  </Link>
                  {c.topics.length > 0 && (
                    <ul className="mt-1 flex flex-col">
                      {c.topics.map((tp) => (
                        <li key={tp.key}>
                          <Link href={`/family/understand?kind=topic&key=${encodeURIComponent(tp.key)}`} className="flex min-h-[44px] items-center rounded-xl px-2 text-sm text-slate hover:bg-slate/5">
                            <span lang={lang === 'hi' ? 'en' : undefined}>{tp.title}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ) : (
          <p data-family-no-catalog className="rounded-3xl bg-white p-4 text-base text-slate shadow-sm ring-1 ring-slate/10">
            {t(lang, 'fam.study.noCatalog')}
          </p>
        )}
      </main>
    </div>
  );
}
