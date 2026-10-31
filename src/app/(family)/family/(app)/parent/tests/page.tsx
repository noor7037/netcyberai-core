import { redirect } from 'next/navigation';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { EmptyState } from '@/components/family/ui/EmptyState';
import { loadChapter } from '@/lib/family/chapter-store';
import { TESTS_KEYS } from '@/lib/family/chapter-test-words';
import { listAttempts } from '@/lib/family/chapter-tests';
import { fill } from '@/lib/family/fill';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';
import { sameInkOnBothSides } from '@/lib/family/day-text';

// The chapter tests the children sent (S5, C378): in the parent area, behind the parent PIN, never on a child's own
// phone. Every attempt is one the child really sent. Choice questions show what the app found; written and photo answers
// are shown as sent with the points to look for, and carry no score: the app does not mark them.
export const dynamic = 'force-dynamic';

export default async function FamilyChapterTestsPage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  if (!page.parentMode) redirect('/family/parent');
  const lang = page.parentLang;
  const w = familyWords(lang, TESTS_KEYS);
  const attempts = await familyPageRead(page, (db) => listAttempts(db, page.session.accountId));
  const titles = new Map<string, string>();
  for (const key of new Set(attempts.map((a) => a.chapterKey))) {
    const c = await familyPageRead(page, (db) => loadChapter(db, key));
    titles.set(key, c ? c.title[lang === 'hi' ? 'hi' : 'en'] : key);
  }
  const name = new Map(page.children.map((c) => [c.childId, c.firstName]));
  const day = (iso: string) => sameInkOnBothSides(new Date(iso).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }));
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family/parent" backLabel={w['fam.marks.backParent']} title={w['fam.tests.title']} tone="ink" />
      <main className="fam-page" data-parent-tests>
        <p className="fam-note px-1 font-semibold text-slate">{w['fam.tests.lead']}</p>
        {attempts.length === 0 && <EmptyState icon="sheet" text={w['fam.tests.none']} href="/family/parent" action={w['fam.marks.backParent']} />}
        <ul className="flex flex-col gap-4">
          {attempts.map((a) => (
            <li key={a.attemptId} data-test-attempt={a.attemptId} className="fam-card fam-section bg-white text-slate">
              <div className="flex flex-col gap-1">
                <h2 className="fam-h2">
                  {name.get(a.childId) ?? ''} · <span lang={a.lang}>{titles.get(a.chapterKey)}</span>
                </h2>
                <p className="fam-note text-slate/80">{fill(w['fam.tests.when'], { day: day(a.submittedAt) })}</p>
                <p className="fam-pill self-start bg-off-white font-bold text-slate ring-1 ring-slate/15">{a.mcqTotal > 0 ? fill(w['fam.tests.score'], { n: a.mcqCorrect, d: a.mcqTotal }) : w['fam.tests.noChoice']}</p>
              </div>
              <ol className="flex flex-col gap-3">
                {a.answers.map((x) => (
                  <li key={x.itemId} className="flex flex-col gap-1 rounded-xl bg-off-white p-3 text-sm">
                    <p className="font-bold">
                      {x.kind === 'mcq' ? w['fam.tests.mcq'] : x.kind === 'written' ? w['fam.tests.written'] : w['fam.tests.photo']}
                    </p>
                    <p lang={a.lang}>{x.question}</p>
                    {x.kind === 'mcq' && (
                      <p>
                        {fill(w['fam.tests.chose'], { n: (x.choice ?? 0) + 1 })} · <span className="font-bold">{x.correct ? w['fam.ctest.right'] : w['fam.ctest.notYet']}</span>
                      </p>
                    )}
                    {x.kind === 'written' && <p className="whitespace-pre-wrap rounded-xl bg-white p-2">{x.body}</p>}
                    {x.kind === 'photo' &&
                      (x.attachmentId ? (
                        <a href={`/api/family/tutor/files/${encodeURIComponent(x.attachmentId)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center self-start rounded-2xl bg-white px-3 font-bold text-ink">
                          {w['fam.tutor.openFile']}
                        </a>
                      ) : (
                        <p>{w['fam.tests.photoRemoved']}</p>
                      ))}
                    {x.rubric && (
                      <div>
                        <p className="font-bold">{w['fam.tests.rubric']}</p>
                        <ul lang={a.lang} className="list-disc pl-5">
                          {x.rubric.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
