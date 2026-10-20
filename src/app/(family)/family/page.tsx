'use client';

import React, { useState } from 'react';
import { ChildSwitcher } from '@/components/family/ChildSwitcher';
import { ParentCalmCard } from '@/components/family/ParentCalmCard';
import { SubjectCard } from '@/components/family/SubjectCard';
import { ConceptResolverView } from '@/components/family/ConceptResolverView';
import { getChildrenForAccount, getParentDailyCard } from '@/lib/family/children';
import { CATALOG_SUBJECTS, getTopicsForGrade } from '@/lib/family/syllabus/catalog';
import { resolveTopicBlocks } from '@/lib/family/resolver';
import { t, type Lang } from '@/lib/i18n';

const DEMO_ACCOUNT_ID = 'fam-acc-demo-101';

export default function FamilyHomePage() {
  const [lang, setLang] = useState<Lang>('hi');
  const [childrenList] = useState(() => getChildrenForAccount(DEMO_ACCOUNT_ID));
  const [activeChildId, setActiveChildId] = useState<string>(
    childrenList[0]?.childId || 'child-aarav-9'
  );
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const activeChild = childrenList.find((c) => c.childId === activeChildId) || childrenList[0];
  const activeGrade = activeChild ? activeChild.grade : 9;
  const calmCard = getParentDailyCard(activeChildId);

  const activeResolverResponse = selectedTopicId
    ? resolveTopicBlocks(selectedTopicId, lang === 'hi' ? 'hi' : 'en')
    : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col bg-off-white px-4 py-6">
      {/* Top App Bar */}
      <header className="flex items-center justify-between border-b border-slate/10 pb-4">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-slate">
            {t(lang, 'fam.app.title')}
          </h1>
          <p className="text-xs font-medium text-slate/70">
            {t(lang, 'fam.app.tagline')}
          </p>
        </div>

        {/* Language & Action Bar */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate/20 bg-white p-0.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`rounded px-2 py-1 ${
                lang === 'en' ? 'bg-sapphire text-white' : 'text-slate hover:bg-slate/5'
              }`}
            >
              {t(lang, 'fam.lang.en')}
            </button>
            <button
              type="button"
              onClick={() => setLang('hi')}
              className={`rounded px-2 py-1 ${
                lang === 'hi' ? 'bg-sapphire text-white' : 'text-slate hover:bg-slate/5'
              }`}
            >
              {t(lang, 'fam.lang.hi')}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mt-5 flex flex-col gap-6">
        {/* Child Switcher */}
        <div className="rounded-2xl border border-slate/15 bg-white p-4 shadow-sm">
          <ChildSwitcher
            childrenList={childrenList}
            activeChildId={activeChildId}
            onSelectChild={(cid) => {
              setActiveChildId(cid);
              setSelectedTopicId(null);
            }}
            lang={lang}
          />
        </div>

        {/* If a topic is selected, render the Concept Resolver */}
        {activeResolverResponse ? (
          <ConceptResolverView
            response={activeResolverResponse}
            childId={activeChildId}
            lang={lang}
            onBack={() => setSelectedTopicId(null)}
            onProgressUpdated={() => setRefreshKey((k) => k + 1)}
          />
        ) : (
          <>
            {/* Parent Calm Card */}
            <ParentCalmCard card={calmCard} lang={lang} key={refreshKey} />

            {/* School Subjects for Active Grade */}
            <section
              aria-label={t(lang, 'fam.subjects.title')}
              className="flex flex-col gap-4"
            >
              <h2 className="text-base font-extrabold text-slate">
                {t(lang, 'fam.subjects.title')} — {t(lang, 'fam.class.prefix', { grade: activeGrade })}
              </h2>

              <div className="grid grid-cols-1 gap-4">
                {CATALOG_SUBJECTS.map((sub) => {
                  const topics = getTopicsForGrade(activeGrade, sub.id);
                  if (topics.length === 0) return null;
                  return (
                    <SubjectCard
                      key={sub.id}
                      subject={sub}
                      topics={topics}
                      onSelectTopic={(tId) => setSelectedTopicId(tId)}
                      lang={lang}
                    />
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
