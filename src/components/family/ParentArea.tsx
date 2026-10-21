'use client';

import type { Subject } from '@/lib/family/subjects';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Lang } from '@/lib/i18n';
import { classText, fill, type Words } from '@/lib/family/fill';
import { ChildForm, type ChildFormValue } from './ChildForm';
import { errorWords, familyApi } from './client';
import { LanguageSwitch } from './LanguageSwitch';

// The parent area (feature P2; docs/34 §9.1 rule 1; M1-2, C248), open only in parent mode: the children, what the
// parent agreed to, each child's answers (see and delete), the language, signing out, and deleting the account.
// Every change is the parent's own tap; nothing here uses a browser dialog.

// `subjects`: the subjects of the child's class (C264), for choosing the free one.
type Child = ChildFormValue & { childId: string; classLevel: number; freeSubject: Subject | null; subjects: Subject[] };
export type Calm = { childId: string; answers: number; right: number; topics: number; mastered: number; practisedTitles: string[] };
type Answer = { attemptId: string; subject: string; kind: string; answer: string; correct: boolean; answeredOn: string };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate/10 sm:p-5">
      <h2 className="text-lg font-extrabold text-slate">{title}</h2>
      {children}
    </section>
  );
}

const linkButton = 'min-h-[44px] px-2 text-sm font-semibold text-royal underline-offset-4 hover:underline';

function ChildRow({ w, child, states }: { w: Words; child: Child; states: { code: string; name: string }[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'edit' | 'remove' | 'answers'>('view');
  const [answers, setAnswers] = useState<Answer[] | null>(null);
  const [error, setError] = useState('');
  const loadAnswers = async () => {
    const r = await familyApi<{ answers: Answer[] }>(`/api/family/answers?childId=${child.childId}`, 'GET');
    if (!r.ok) return setError(errorWords(w, r.error));
    setAnswers(r.data.answers);
    setMode('answers');
  };
  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-off-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-bold text-slate">
          {child.firstName} <span className="font-normal text-slate/70">· {classText((k) => w[k], child.classLevel)}</span>
        </p>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={linkButton} onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}>
            {w['fam.parent.edit']}
          </button>
          <button type="button" className={linkButton} onClick={() => (mode === 'answers' ? setMode('view') : void loadAnswers())}>
            {w['fam.parent.answersShow']}
          </button>
          <button type="button" className={linkButton} onClick={() => setMode('remove')}>
            {w['fam.parent.remove']}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate">
        <span>{w['fam.parent.freeSubject']}</span>
        {child.subjects.map((sub) => (
          <button
            key={sub}
            type="button"
            aria-pressed={child.freeSubject === sub}
            onClick={async () => {
              if (child.freeSubject === sub) return;
              const r = await familyApi(`/api/family/children/${child.childId}/subject`, 'POST', { subject: sub });
              if (!r.ok) return setError(r.error === 'too_soon' ? w['fam.parent.freeSubjectTooSoon'] : errorWords(w, r.error));
              router.refresh();
            }}
            className={`min-h-[44px] rounded-full px-4 font-bold ${child.freeSubject === sub ? 'bg-royal text-white' : 'bg-white text-slate ring-1 ring-slate/15'}`}
          >
            {w[`fam.subject.${sub}`]}
          </button>
        ))}
      </div>
      {mode === 'edit' && (
        <ChildForm
          w={w}
          states={states}
          childId={child.childId}
          initial={{ firstName: child.firstName, classLevel: child.classLevel, board: child.board, language: child.language, style: child.style, stateCode: child.stateCode }}
          submitLabel={w['fam.child.save']}
          onDone={() => {
            setMode('view');
            router.refresh();
          }}
        />
      )}
      {mode === 'remove' && (
        <div className="flex flex-col gap-2 rounded-xl bg-white p-3 ring-1 ring-red-200">
          <p className="text-sm text-slate">{fill(w['fam.parent.removeConfirm'], { name: child.firstName })}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                const r = await familyApi(`/api/family/children/${child.childId}`, 'DELETE');
                if (!r.ok) return setError(errorWords(w, r.error));
                router.refresh();
              }}
            >
              {w['fam.parent.removeYes']}
            </Button>
            <Button variant="outline" onClick={() => setMode('view')}>
              {w['fam.common.cancel']}
            </Button>
          </div>
        </div>
      )}
      {mode === 'answers' && answers && (
        <div className="flex flex-col gap-2">
          {answers.length === 0 ? (
            <p className="text-sm text-slate/70">{w['fam.parent.answersNone']}</p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {answers.map((a) => (
                  <li key={a.attemptId} className="flex items-start justify-between gap-2 rounded-xl bg-white p-3 text-sm ring-1 ring-slate/10">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate">
                        {w[`fam.subject.${a.subject}`] ?? a.subject} · {a.answeredOn}
                      </p>
                      <p className="break-words text-slate/80">{a.answer}</p>
                      <p className={a.correct ? 'font-semibold text-emerald-text' : 'font-semibold text-slate/70'}>{a.correct ? w['fam.parent.answerRight'] : w['fam.parent.answerWrong']}</p>
                    </div>
                    <button
                      type="button"
                      className={linkButton}
                      onClick={async () => {
                        const r = await familyApi('/api/family/answers', 'DELETE', { attemptId: a.attemptId });
                        if (r.ok) setAnswers(answers.filter((x) => x.attemptId !== a.attemptId));
                      }}
                    >
                      {w['fam.parent.delete']}
                    </button>
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                onClick={async () => {
                  const r = await familyApi('/api/family/answers', 'DELETE', { childId: child.childId, all: true });
                  if (r.ok) setAnswers([]);
                }}
              >
                {fill(w['fam.parent.deleteAll'], { name: child.firstName })}
              </Button>
            </>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
    </li>
  );
}

// `english`: the English course (C274) when Control has it switched on: whether the parent has given its consent.
export function ParentArea({ w, lang, children, states, studyCore, calm, english = null }: { w: Words; lang: Lang; children: Child[]; states: { code: string; name: string }[]; studyCore: boolean; calm: Calm[]; english?: { granted: boolean } | null }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [deleteWord, setDeleteWord] = useState('');
  const [error, setError] = useState('');
  const post = async (path: string, body: unknown, then: string | null) => {
    setError('');
    const r = await familyApi(path, 'POST', body);
    if (!r.ok) return setError(errorWords(w, r.error));
    if (then) router.replace(then);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold text-slate">{w['fam.parent.title']}</h1>
        <Button variant="outline" onClick={() => void post('/api/family/pin/lock', {}, '/family')}>
          {w['fam.parent.back']}
        </Button>
      </div>

      <Section title={w['fam.calm.title']}>
        <ul className="flex flex-col gap-2">
          {children.map((c) => {
            const card = calm.find((x) => x.childId === c.childId);
            return (
              <li key={c.childId} data-calm-card className="flex flex-col gap-1 rounded-2xl bg-off-white p-3 text-sm text-slate">
                <p className="text-base font-bold text-slate">{c.firstName}</p>
                {!card || card.answers === 0 ? (
                  <p>{w['fam.calm.nothingYet']}</p>
                ) : (
                  <>
                    <p>{fill(w['fam.calm.week'], { answers: card.answers, right: card.right, topics: card.topics })}</p>
                    {card.mastered > 0 && <p>{fill(w['fam.calm.mastered'], { n: card.mastered })}</p>}
                    {card.practisedTitles.length > 0 && <p className="text-slate/80">{fill(w['fam.calm.recent'], { topics: card.practisedTitles.join(', ') })}</p>}
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-slate/80">{w['fam.calm.note']}</p>
      </Section>

      <Section title={w['fam.parent.children']}>
        <ul className="flex flex-col gap-2">
          {children.map((c) => (
            <ChildRow key={c.childId} w={w} child={c} states={states} />
          ))}
        </ul>
        {adding ? (
          <ChildForm
            w={w}
            states={states}
            initial={{ firstName: '', classLevel: null, board: '', language: lang, style: lang === 'hi' ? 'hinglish' : 'en', stateCode: '' }}
            submitLabel={w['fam.child.add']}
            onDone={() => {
              setAdding(false);
              router.refresh();
            }}
          />
        ) : (
          <Button variant="outline" onClick={() => setAdding(true)}>
            {w['fam.child.add']}
          </Button>
        )}
      </Section>

      <Section title={w['fam.parent.privacy']}>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-off-white p-3">
          <div className="min-w-0">
            <p className="text-base font-semibold text-slate">{w['fam.consent.purpose.study_core']}</p>
            <p className="text-sm text-slate/70">{studyCore ? w['fam.parent.granted'] : w['fam.parent.notGranted']}</p>
          </div>
          <button type="button" className={linkButton} onClick={() => void post('/api/family/consent', { purpose: 'study_core', granted: !studyCore, tap: true }, null)}>
            {studyCore ? w['fam.parent.withdraw'] : w['fam.parent.grant']}
          </button>
        </div>
        {english && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-off-white p-3">
            <div className="min-w-0">
              <p className="text-base font-semibold text-slate">{w['fam.consent.purpose.english_programme']}</p>
              <p className="text-sm text-slate/70">{english.granted ? w['fam.parent.granted'] : w['fam.parent.notGranted']}</p>
            </div>
            <button type="button" className={linkButton} onClick={() => void post('/api/family/consent', { purpose: 'english_programme', granted: !english.granted, tap: true }, null)}>
              {english.granted ? w['fam.parent.withdraw'] : w['fam.parent.grant']}
            </button>
          </div>
        )}
        <p className="text-sm text-slate/70">{w['fam.parent.withdrawNote']}</p>
      </Section>

      {english?.granted && children.length > 0 && (
        <Section title={w['fam.english.parent.section']}>
          <ul className="flex flex-col gap-2">
            {children.map((c) => (
              <li key={c.childId}>
                <a href={`/family/parent/english/${c.childId}`} className="flex min-h-[44px] items-center justify-between rounded-2xl bg-off-white p-3 text-base font-semibold text-slate">
                  <span>
                    {c.firstName} · {w['fam.english.parent.open']}
                  </span>
                  <span aria-hidden="true">→</span>
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={w['fam.parent.language']}>
        <LanguageSwitch lang={lang} w={w} />
      </Section>

      <Section title={w['fam.parent.signOutTitle']}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => void post('/api/family/auth/sign-out', {}, '/family/sign-in')}>
            {w['fam.parent.signOut']}
          </Button>
          <Button variant="outline" onClick={() => void post('/api/family/auth/sign-out', { everywhere: true }, '/family/sign-in')}>
            {w['fam.parent.signOutAll']}
          </Button>
        </div>
      </Section>

      <Section title={w['fam.parent.deleteAccount']}>
        <p className="text-sm text-slate">{w['fam.parent.deleteAccountLead']}</p>
        <Input id="fam-delete-word" label={w['fam.parent.deleteAccountWord']} autoComplete="off" value={deleteWord} onChange={(e) => setDeleteWord(e.target.value)} />
        <Button
          variant="secondary"
          disabled={deleteWord.trim().toUpperCase() !== 'DELETE'}
          onClick={async () => {
            const r = await familyApi('/api/family/account', 'DELETE', { confirm: 'DELETE' });
            if (!r.ok) return setError(errorWords(w, r.error));
            router.replace('/family/sign-in');
            router.refresh();
          }}
        >
          {w['fam.parent.deleteAccountYes']}
        </Button>
      </Section>

      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
