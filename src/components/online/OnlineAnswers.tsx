'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { momentWords } from '@/components/exams/exam-format';
import { ask } from '@/components/marking/parts';
import { Badge } from '@/components/ui/Badge';
import type { OnlineAnswer, OnlineScriptAnswers, SheetQuestion } from '@/lib/contracts/marking';

// An online script's typed answers (AQ-4, C365), in the review screen in place of page pictures: each question with what
// the child chose, gave or wrote, and whether they marked it to look at again; when it was sat. The child's words are
// shown as text, never as markup. `onFound` says whether the script is an online one (the route answers 404 for any
// other script, which keeps its page pictures).

function answerWords(q: Pick<SheetQuestion, 'options'>, a: OnlineAnswer): string {
  if ('text' in a) return a.text;
  if ('value' in a) return String(a.value);
  return a.keys.map((k) => `${k}) ${q.options.find((o) => o.key === k)?.text ?? ''}`.trim()).join(' · ');
}

export function OnlineAnswers({ sheetId, questions, active, onFound }: { sheetId: string; questions: SheetQuestion[]; active: string | null; onFound: (online: boolean) => void }) {
  const { t, lang } = useT();
  const [data, setData] = useState<OnlineScriptAnswers | null>(null);

  useEffect(() => {
    let live = true;
    void ask('GET', `/api/app/marking/sheets/${sheetId}/online`).then((r) => {
      if (!live) return;
      const found = r.ok && !!r.body;
      setData(found ? (r.body as unknown as OnlineScriptAnswers) : null);
      onFound(found);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId]);

  useEffect(() => {
    if (active) document.querySelector(`[data-online-answer="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!data) return null;
  const byQ = new Map(data.answers.map((a) => [a.questionId, a]));
  return (
    <section data-online-answers={sheetId} className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-3" aria-labelledby="online-answers-title">
      <h2 id="online-answers-title" className="text-base font-bold">{t('online.typed.title')}</h2>
      <p className="text-slate/70">{t('online.typed.when', { when: momentWords(data.startedAt, lang) })}</p>
      <ol className="flex flex-col gap-2">
        {questions.map((q) => {
          const a = byQ.get(q.questionId);
          return (
            <li key={q.questionId} data-online-answer={q.questionId} className={`flex flex-col gap-1 rounded-md border p-2 ${active === q.questionId ? 'border-sapphire' : 'border-slate/10'}`}>
              <p className="font-semibold">
                {q.label}. <span className="font-normal">{q.prompt}</span>
              </p>
              {a?.answer ? (
                <p className="whitespace-pre-wrap break-words rounded bg-off-white px-2 py-1 text-slate">{answerWords(q, a.answer)}</p>
              ) : (
                <p className="text-slate/70">{t('online.typed.none')}</p>
              )}
              {a?.flagged && <Badge variant="neutral" className="self-start">{t('online.typed.flagged')}</Badge>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
