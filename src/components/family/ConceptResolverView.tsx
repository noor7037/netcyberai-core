'use client';

import React, { useState } from 'react';
import type {
  ConceptResolverResponse,
  ExplanationBlock,
  WorkedExampleBlock,
  KeyPointsBlock,
  CheckQuestionBlock,
  TargetedPracticeBlock,
  EnglishMomentBlock,
  SourcesBlock,
} from '@/lib/contracts/family-types';
import { evaluateCheckAnswer } from '@/lib/family/resolver';
import { updateCheckProgress } from '@/lib/family/children';
import { t, type Lang } from '@/lib/i18n';

interface ConceptResolverViewProps {
  response: ConceptResolverResponse;
  childId: string;
  lang: Lang;
  onBack: () => void;
  onProgressUpdated?: () => void;
}

export function ConceptResolverView({
  response,
  childId,
  lang,
  onBack,
  onProgressUpdated,
}: ConceptResolverViewProps) {
  // Extract block types
  const explanation = response.blocks.find((b) => b.type === 'explanation') as ExplanationBlock | undefined;
  const workedExample = response.blocks.find((b) => b.type === 'worked_example') as WorkedExampleBlock | undefined;
  const keyPoints = response.blocks.find((b) => b.type === 'key_points') as KeyPointsBlock | undefined;
  const checkQuestion = response.blocks.find((b) => b.type === 'check_question') as CheckQuestionBlock | undefined;
  const practice = response.blocks.find((b) => b.type === 'targeted_practice') as TargetedPracticeBlock | undefined;
  const englishMoment = response.blocks.find((b) => b.type === 'english_moment') as EnglishMomentBlock | undefined;
  const sources = response.blocks.find((b) => b.type === 'sources') as SourcesBlock | undefined;

  // Socratic Check state
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [hintsUsed, setHintsUsed] = useState<number>(1);
  const [evaluatedResult, setEvaluatedResult] = useState<{
    isCorrect: boolean;
    feedbackText: string;
    nextHint?: string;
  } | null>(null);

  const handleOptionSelect = (optionId: string) => {
    setSelectedOptionId(optionId);
    if (!checkQuestion) return;

    const evaluation = evaluateCheckAnswer(checkQuestion, optionId, hintsUsed);
    setEvaluatedResult(evaluation);

    // Update mastery status in child record
    updateCheckProgress(childId, response.topicId, evaluation.isCorrect, evaluation.misconceptionTag);
    if (onProgressUpdated) onProgressUpdated();
  };

  const handleNextHint = () => {
    setHintsUsed((prev) => Math.min(prev + 1, 3));
  };

  return (
    <article className="flex flex-col gap-6">
      {/* Top Header & Breadcrumb */}
      <header className="flex flex-col gap-2 rounded-2xl bg-sapphire p-5 text-white shadow-sm">
        <button
          type="button"
          onClick={onBack}
          className="self-start text-xs font-extrabold text-white underline hover:text-white"
        >
          ← {t(lang, 'fam.resolver.back')}
        </button>
        <span className="text-xs font-semibold text-white">
          {response.chapterTitle}
        </span>
        <h1 className="text-xl font-extrabold tracking-tight text-white">
          {response.topicTitle}
        </h1>
      </header>

      {/* 1. Core Concept & Everyday Analogy */}
      {explanation && (
        <section
          aria-label={t(lang, 'fam.resolver.idea')}
          className="flex flex-col gap-4 rounded-2xl border border-slate/15 bg-white p-5 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">💡</span>
            <h2 className="text-base font-extrabold text-slate">
              {t(lang, 'fam.resolver.idea')}
            </h2>
          </div>

          <p className="text-base font-bold text-slate leading-relaxed">
            {explanation.idea}
          </p>

          <div className="rounded-xl border border-slate/15 bg-off-white p-4">
            <span className="block text-xs font-extrabold uppercase tracking-wider text-sapphire">
              {t(lang, 'fam.resolver.analogy')}
            </span>
            <p className="mt-1 text-sm font-medium text-slate leading-relaxed">
              {explanation.analogy}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-extrabold text-slate/80 uppercase">
              {t(lang, 'fam.resolver.steps')}
            </span>
            <ol className="flex flex-col gap-2">
              {explanation.steps.map((st, i) => (
                <li
                  key={i}
                  className="rounded-lg bg-off-white/80 px-3.5 py-2 text-sm font-medium text-slate"
                >
                  {st}
                </li>
              ))}
            </ol>
          </div>

          {explanation.technicalTerms.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate/10">
              <span className="text-xs font-bold text-slate/80">
                {t(lang, 'fam.resolver.terms')}:
              </span>
              {explanation.technicalTerms.map((term, i) => (
                <span
                  key={i}
                  className="rounded-full bg-sapphire/10 px-2.5 py-1 text-xs font-bold text-sapphire"
                >
                  {term.english} — {term.hindi}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 2. Worked Example */}
      {workedExample && (
        <section
          aria-label={t(lang, 'fam.resolver.workedExample')}
          className="flex flex-col gap-3 rounded-2xl border border-slate/15 bg-white p-5 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🔢</span>
            <h2 className="text-base font-extrabold text-slate">
              {t(lang, 'fam.resolver.workedExample')}
            </h2>
          </div>

          <div className="rounded-xl bg-off-white p-4 font-semibold text-sm text-slate">
            {workedExample.problemStatement}
          </div>

          <div className="flex flex-col gap-1.5 pl-2">
            {workedExample.steps.map((st, i) => (
              <p key={i} className="text-xs font-medium text-slate">
                • {st}
              </p>
            ))}
          </div>

          <div className="rounded-xl bg-emerald/15 border border-emerald/30 p-3 text-sm font-bold text-emerald-text">
            {workedExample.finalAnswer}
          </div>
        </section>
      )}

      {/* 3. Socratic Check Question (Hint First) */}
      {checkQuestion && (
        <section
          aria-label={t(lang, 'fam.resolver.checkTitle')}
          className="flex flex-col gap-4 rounded-2xl border-2 border-sapphire/30 bg-white p-5 shadow-md"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎯</span>
              <h2 className="text-base font-extrabold text-slate">
                {t(lang, 'fam.resolver.checkTitle')}
              </h2>
            </div>
            <span className="rounded-full bg-sapphire px-2.5 py-0.5 text-xs font-extrabold text-white">
              {t(lang, 'fam.resolver.hint1')} {hintsUsed}/3
            </span>
          </div>

          <p className="text-base font-bold text-slate">
            {checkQuestion.question}
          </p>

          {/* Hint Ladder Banner */}
          <div className="rounded-xl bg-off-white border border-slate/15 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase text-sapphire">
                💡 {t(lang, 'fam.resolver.hint1')} ({hintsUsed} of 3)
              </span>
              {hintsUsed < 3 && (
                <button
                  type="button"
                  onClick={handleNextHint}
                  className="text-xs font-bold text-royal underline"
                >
                  + {t(lang, 'fam.resolver.hint2')}
                </button>
              )}
            </div>
            <p className="mt-1 text-xs font-medium text-slate">
              {hintsUsed === 1 && checkQuestion.hint1}
              {hintsUsed === 2 && checkQuestion.hint2}
              {hintsUsed === 3 && checkQuestion.hint3}
            </p>
          </div>

          {/* Options */}
          <div className="flex flex-col gap-2">
            {checkQuestion.options.map((opt) => {
              const isSelected = selectedOptionId === opt.id;
              let btnStyle = 'border-slate/15 bg-off-white/40 hover:bg-slate/5 text-slate';
              if (isSelected && evaluatedResult) {
                btnStyle = evaluatedResult.isCorrect
                  ? 'border-emerald bg-emerald/15 text-emerald-text font-extrabold ring-2 ring-emerald'
                  : 'border-red-400 bg-red-50 text-red-900 ring-2 ring-red-300';
              }

              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleOptionSelect(opt.id)}
                  className={`flex items-center justify-between rounded-xl border p-3.5 text-left text-sm font-semibold transition-all ${btnStyle}`}
                >
                  <span>{opt.text}</span>
                  {isSelected && evaluatedResult && (
                    <span className="font-bold">
                      {evaluatedResult.isCorrect ? '✓' : '✗'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Evaluated Socratic Feedback */}
          {evaluatedResult && (
            <div
              className={`rounded-xl p-4 text-sm font-medium ${
                evaluatedResult.isCorrect
                  ? 'bg-emerald/15 border border-emerald/30 text-emerald-text'
                  : 'bg-off-white border border-slate/20 text-slate'
              }`}
            >
              <span className="block font-bold">
                {evaluatedResult.isCorrect ? t(lang, 'fam.resolver.success') : t(lang, 'fam.resolver.guidance')}
              </span>
              <p className="mt-1 text-xs leading-relaxed">{evaluatedResult.feedbackText}</p>
            </div>
          )}
        </section>
      )}

      {/* 4. Daily English Moment */}
      {englishMoment && (
        <section
          aria-label={t(lang, 'fam.resolver.englishMoment')}
          className="flex flex-col gap-3 rounded-2xl border border-slate/15 bg-white p-5 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🗣️</span>
            <h2 className="text-base font-extrabold text-slate">
              {t(lang, 'fam.resolver.englishMoment')}
            </h2>
          </div>

          <div className="flex flex-col gap-2">
            {englishMoment.keyWords.map((kw, i) => (
              <div key={i} className="flex items-baseline gap-2 text-sm">
                <span className="font-bold text-sapphire">{kw.word}</span>
                <span className="text-xs text-slate/80">({kw.meaning})</span>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-off-white p-3 text-xs">
            <span className="block font-bold text-slate">{t(lang, 'fam.resolver.modelSentence')}</span>
            <p className="font-semibold text-slate mt-0.5">{englishMoment.modelSentence}</p>
          </div>

          <div className="rounded-xl border border-sapphire/20 bg-off-white p-3 text-xs">
            <span className="block font-extrabold text-sapphire">{t(lang, 'fam.resolver.sayItAloud')}</span>
            <p className="font-medium text-slate mt-0.5">{englishMoment.sayItPrompt}</p>
          </div>
        </section>
      )}

      {/* 5. Verified Official Sources */}
      {sources && sources.references.length > 0 && (
        <footer className="flex flex-col gap-2 rounded-2xl border border-slate/15 bg-off-white p-4">
          <span className="text-xs font-bold text-slate uppercase">
            {t(lang, 'fam.resolver.sources')}
          </span>
          {sources.references.map((ref, i) => (
            <div key={i} className="flex flex-col text-xs text-slate">
              <a
                href={ref.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-sapphire underline hover:text-sapphire"
              >
                {ref.title} ↗
              </a>
              <span className="text-[10px] text-slate">
                {t(lang, 'fam.resolver.verified', { date: ref.verifiedDate })}
              </span>
            </div>
          ))}
        </footer>
      )}
    </article>
  );
}
