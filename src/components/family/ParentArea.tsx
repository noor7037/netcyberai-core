'use client';

import { forgetThisBrowser } from './push-client';
import type { Subject } from '@/lib/family/subjects';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Lang } from '@/lib/i18n';
import { classText, fill, type Words } from '@/lib/family/fill';
import type { BoardOption } from '@/lib/family/children';
import { ChildForm, type ChildFormValue } from './ChildForm';
import { errorWords, familyApi } from './client';
import { HabitParent } from './HabitParent';
import { LanguageSwitch } from './LanguageSwitch';
import { clearOffline } from './offline/store';
import { FamIcon, type IconName } from './FamIcon';
import { SubPageHeader } from './SubPageHeader';
import type { ParentHabit } from '@/lib/family/habit';

// The parent area (feature P2; docs/34 §9.1 rule 1; M1-2, C248), open only in parent mode: the children, what the
// parent agreed to, each child's answers (see and delete), the language, signing out, and deleting the account.
// Every change is the parent's own tap; nothing here uses a browser dialog.
// F2 on D1 (C230-Q): every section is a D1 card; each consent says its state as a word in a badge (with a drawn tick
// when given), and every tappable thing presses (fam-press).

// `subjects`: the subjects of the child's class (C264), for choosing the free one.
type Child = ChildFormValue & { childId: string; classLevel: number; freeSubject: Subject | null; subjects: Subject[] };
export type Calm = { childId: string; answers: number; right: number; topics: number; mastered: number; practisedTitles: string[] };
type Answer = { attemptId: string; subject: string; kind: string; answer: string; correct: boolean; answeredOn: string };

// W6-B (docs/38 §5): one section card for the whole area: the title row with its mark, then the content.
function Section({ title, icon, children }: { title: string; icon?: IconName; children: React.ReactNode }) {
  return (
    <section className="fam-card fam-section fam-rise bg-white">
      <h2 className="fam-h2 flex items-center gap-3 text-slate">
        {icon && (
          <span aria-hidden="true" className="fam-chip-icon bg-royal-deep bg-gradient-to-br from-royal to-violet text-white">
            <FamIcon name={icon} className="h-5 w-5" />
          </span>
        )}
        {title}
      </h2>
      {children}
    </section>
  );
}

const linkButton = 'fam-press min-h-[44px] rounded-xl px-2 text-sm font-semibold text-royal underline-offset-4 hover:underline';

// One purpose the parent agreed to (or not), C230-Y: a short name and an on/off switch, with the full words of what it
// means one tap away. Each purpose keeps its own switch (DPDP: consent is given for each purpose, never bundled).
// `changed`: the notice for this purpose changed since the parent said yes (C230-AP); said in the open, not folded away.
function ConsentRow({ w, consent, granted, onToggle, data, note, changed }: { w: Words; consent: string; granted: boolean; onToggle: () => void; data?: Record<string, string | boolean>; note?: string; changed?: string }) {
  const name = w[`fam.consent.short.${consent}`];
  return (
    <div {...data} className="flex flex-col rounded-xl bg-off-white px-3 py-1">
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold text-slate">{name}</p>
        <button type="button" role="switch" aria-checked={granted} aria-label={name} onClick={onToggle} className="fam-press flex min-h-[44px] min-w-[56px] items-center justify-end">
          <span aria-hidden="true" className={`flex h-7 w-12 items-center rounded-full p-0.5 transition-colors ${granted ? 'justify-end bg-emerald-text' : 'justify-start bg-slate/30'}`}>
            <span className="h-6 w-6 rounded-full bg-white shadow" />
          </span>
        </button>
      </div>
      {changed && (
        <p data-consent-changed={consent} className="pb-1 text-sm font-semibold text-slate">
          {changed}
        </p>
      )}
      <details className="pb-2">
        <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-semibold text-royal">{w['fam.consent.more']}</summary>
        <p className="text-sm text-slate">{w[`fam.consent.purpose.${consent}`]}</p>
        {note && <p className="mt-1 text-sm text-slate">{note}</p>}
      </details>
    </div>
  );
}

function ChildRow({ w, child, states, boards }: { w: Words; child: Child; states: { code: string; name: string }[]; boards?: BoardOption[] }) {
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
    <li className="flex flex-col gap-3 rounded-xl bg-off-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-bold text-slate">
          {child.firstName} <span className="font-normal text-slate/80">· {classText((k) => w[k], child.classLevel)}</span>
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
            className={`fam-press min-h-[44px] rounded-full px-4 font-bold ${child.freeSubject === sub ? 'bg-royal text-white' : 'bg-white text-slate ring-1 ring-slate/15'}`}
          >
            {w[`fam.subject.${sub}`]}
          </button>
        ))}
      </div>
      {mode === 'edit' && (
        <ChildForm
          w={w}
          states={states}
          boards={boards}
          childId={child.childId}
          initial={{ firstName: child.firstName, classLevel: child.classLevel, board: child.board, language: child.language, style: child.style, stateCode: child.stateCode, stream: child.stream }}
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

// W6-F (docs/38 §6): the area's six sections. The URL hash names the open one (#children), so a link can open it.
export const TABS = ['overview', 'children', 'school', 'learning', 'privacy', 'account'] as const;
export type TabId = (typeof TABS)[number];
const tabOfHash = (hash: string): TabId => ((TABS as readonly string[]).includes(hash.replace(/^#/, '')) ? (hash.replace(/^#/, '') as TabId) : 'overview');

// The open section: Overview on the server and on the first paint (so the two agree), then the hash. The tabs pattern:
// arrows, Home and End move between the tabs, and only the open tab is in the tab order.
function useTabs() {
  const [tab, setTab] = useState<TabId>('overview');
  const ready = useRef(false);
  useEffect(() => {
    const read = () => setTab(tabOfHash(window.location.hash));
    read();
    ready.current = true;
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  // The open tab stays in view on the scrolling bar (a link to #account opens it off to the right).
  useEffect(() => {
    document.getElementById(`fam-parent-tab-${tab}`)?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [tab]);
  const go = useCallback((id: TabId) => {
    setTab(id);
    try {
      window.history.replaceState(window.history.state, '', `#${id}`);
    } catch {
      // The hash is only the deep link; the section is already open.
    }
    if (ready.current) window.scrollTo({ top: 0 });
  }, []);
  const onKey = (e: React.KeyboardEvent) => {
    const i = TABS.indexOf(tab);
    const next = e.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length] : e.key === 'ArrowLeft' ? TABS[(i + TABS.length - 1) % TABS.length] : e.key === 'Home' ? TABS[0] : e.key === 'End' ? TABS[TABS.length - 1] : null;
    if (!next) return;
    e.preventDefault();
    go(next);
    document.getElementById(`fam-parent-tab-${next}`)?.focus();
  };
  return { tab, go, onKey };
}

// `english`: the English course (C274) when Control has it switched on: whether the parent has given its consent.
// `photo`: the same for photo questions (M2-6, C280), when Control has the homework helper or the tutor switched on;
// `renew` when a yes given on the older notice no longer counts (C230-AP).
// `voice`: the same for voice (M2-7, C281), when Control has voice input switched on.
// `offers` (C230-V): whether the parent agreed to hear about offers; always shown, optional, off until turned on.
// `slots` (W6-F, docs/38 §6): the sections the page builds on the server, placed by the area under the tab they belong to:
// the Overview's links, the Children's phones, the School's parts, and the Learning's chapter requests and syllabus
// (null: none to show, so the tab says so in one sentence). `needs`: what needs the parent now, one action each.
export type ParentSlots = { overview?: ReactNode; children?: ReactNode; school?: ReactNode; learning?: ReactNode };
export type ParentNeed = { kind: 'requests_declined' | 'requests_open' | 'renew' | 'consent' | 'meeting'; n?: number; name?: string };

export function ParentArea({ w, lang, children, states, boards, studyCore, calm, english = null, photo = null, voice = null, offers = null, habit = null, slots = {}, needs = [] }: { w: Words; lang: Lang; children: Child[]; states: { code: string; name: string }[]; boards?: BoardOption[]; studyCore: boolean; calm: Calm[]; english?: { granted: boolean } | null; photo?: { granted: boolean; renew?: boolean } | null; voice?: { granted: boolean } | null; offers?: { granted: boolean } | null; habit?: ParentHabit[] | null; slots?: ParentSlots; needs?: ParentNeed[] }) {
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

  const { tab, go, onKey } = useTabs();
  const need = (n: ParentNeed): { text: string; to: TabId } => {
    switch (n.kind) {
      case 'requests_declined':
        return { text: fill(w['fam.parent.needs.requestsDeclined'], { n: n.n ?? 0 }), to: 'learning' };
      case 'requests_open':
        return { text: fill(w['fam.parent.needs.requestsOpen'], { n: n.n ?? 0 }), to: 'learning' };
      case 'renew':
        return { text: w['fam.parent.needs.renew'], to: 'privacy' };
      case 'consent':
        return { text: w['fam.parent.needs.consent'], to: 'privacy' };
      case 'meeting':
        return { text: fill(w['fam.parent.needs.meeting'], { name: n.name ?? '' }), to: 'school' };
    }
  };
  const panel = (id: TabId, body: ReactNode) => (
    <div key={id} role="tabpanel" id={`fam-parent-panel-${id}`} aria-labelledby={`fam-parent-tab-${id}`} data-parent-panel={id} hidden={tab !== id} tabIndex={-1}>
      <div className="flex flex-col gap-4">{body}</div>
    </div>
  );
  const emptyLine = (text: string, action: string, to: TabId) => (
    <section data-parent-empty className="fam-card fam-empty bg-white text-slate">
      <p className="text-base font-semibold text-slate">{text}</p>
      <button type="button" onClick={() => go(to)} className="fam-press inline-flex min-h-[44px] items-center justify-center rounded-full bg-white px-5 text-sm font-bold text-royal-deep ring-1 ring-royal/30">
        {action}
      </button>
    </section>
  );

  return (
    <>
      <SubPageHeader
        back="/family/profile"
        backLabel={w['fam.profile.title']}
        title={w['fam.parent.title']}
        tone="royal"
        aside={
          <button
            type="button"
            onClick={() => void post('/api/family/pin/lock', {}, '/family')}
            className="fam-press inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-royal-deep px-4 text-sm font-bold text-white ring-1 ring-white/40"
          >
            <FamIcon name="lock" className="h-4 w-4" />
            {w['fam.parent.back']}
          </button>
        }
      />
      <main className="fam-page">
        {/* W6-F (docs/38 §6): the area as six sections. The bar sticks under the band; one panel shows, the rest stay mounted
            (hidden) so a draft typed in one is not lost on the way to another. */}
        <div className="fam-card sticky top-0 z-30 bg-white/95 p-1 backdrop-blur">
          <div role="tablist" aria-label={w['fam.parent.tabs']} data-parent-tabs className="relative flex gap-1 overflow-x-auto" onKeyDown={onKey}>
            {TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`fam-parent-tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`fam-parent-panel-${id}`}
                tabIndex={tab === id ? 0 : -1}
                data-parent-tab={id}
                onClick={() => go(id)}
                className={`fam-press min-h-[44px] shrink-0 rounded-full px-4 text-sm font-bold ${tab === id ? 'bg-royal text-white' : 'text-slate'}`}
              >
                {w[`fam.parent.tab.${id}`]}
              </button>
            ))}
          </div>
        </div>

        {panel(
          'overview',
          <>
            <Section title={w['fam.parent.needs.title']} icon="bell">
              {needs.length === 0 ? (
                <p data-parent-needs-none className="text-base text-slate">
                  {w['fam.parent.needs.none']}
                </p>
              ) : (
                <ul data-parent-needs className="flex flex-col gap-2">
                  {needs.map((n, i) => {
                    const { text, to } = need(n);
                    return (
                      <li key={i} className="fam-row justify-between gap-3 bg-off-white text-base text-slate">
                        <span className="min-w-0 flex-1">{text}</span>
                        <button type="button" onClick={() => go(to)} className="fam-press min-h-[44px] shrink-0 rounded-full bg-white px-4 text-sm font-bold text-royal-deep ring-1 ring-royal/30">
                          {w['fam.parent.needs.open']}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>

            <Section title={w['fam.calm.title']} icon="chart">
              <ul className="flex flex-col gap-2">
                {children.map((c) => {
                  const card = calm.find((x) => x.childId === c.childId);
                  return (
                    <li key={c.childId} data-calm-card className="flex flex-col gap-1 rounded-xl bg-off-white p-3 text-sm text-slate">
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
            </Section>

            {habit && habit.length > 0 && (
              <Section title={w['fam.habit.parent.title']} icon="star">
                <HabitParent w={w} habit={habit} names={Object.fromEntries(children.map((c) => [c.childId, c.firstName]))} />
              </Section>
            )}

            {slots.overview}

            {english?.granted && children.length > 0 && (
              <Section title={w['fam.english.parent.section']} icon="steps">
                <ul className="flex flex-col gap-2">
                  {children.map((c) => (
                    <li key={c.childId}>
                      <a href={`/family/parent/english/${c.childId}`} className="fam-row fam-lift justify-between bg-off-white text-base font-semibold text-slate">
                        <span>
                          {c.firstName} · {w['fam.english.parent.open']}
                        </span>
                        <FamIcon name="next" className="h-5 w-5 shrink-0" />
                      </a>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}

        {panel(
          'children',
          <>
            <Section title={w['fam.parent.children']} icon="user">
              <ul className="flex flex-col gap-2">
                {children.map((c) => (
                  <ChildRow key={c.childId} w={w} child={c} states={states} boards={boards} />
                ))}
              </ul>
              {adding ? (
                <ChildForm
                  w={w}
                  states={states}
                  boards={boards}
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
            {slots.children}
          </>
        )}

        {panel('school', slots.school)}

        {panel('learning', slots.learning ?? emptyLine(w['fam.parent.learningEmpty'], w['fam.parent.goChildren'], 'children'))}

        {panel(
          'privacy',
          <Section title={w['fam.parent.privacy']} icon="shield">
            <p className="text-sm text-slate">{w['fam.parent.privacyIntro']}</p>
            {/* The withdraw note belongs to study_core alone: switching off an optional purpose stops only that. */}
            <ConsentRow w={w} consent="study_core" granted={studyCore} note={w['fam.parent.withdrawNote']} onToggle={() => void post('/api/family/consent', { purpose: 'study_core', granted: !studyCore, tap: true }, null)} />
            {english && <ConsentRow w={w} consent="english_programme" granted={english.granted} onToggle={() => void post('/api/family/consent', { purpose: 'english_programme', granted: !english.granted, tap: true }, null)} />}
            {photo && (
              <ConsentRow w={w} consent="photo_input" granted={photo.granted} changed={photo.renew ? w['fam.consent.changed.photo_input'] : undefined} data={{ 'data-consent': 'photo_input' }} onToggle={() => void post('/api/family/consent', { purpose: 'photo_input', granted: !photo.granted, tap: true }, null)} />
            )}
            {voice && (
              <ConsentRow w={w} consent="voice_practice" granted={voice.granted} data={{ 'data-consent-voice': true }} onToggle={() => void post('/api/family/consent', { purpose: 'voice_practice', granted: !voice.granted, tap: true }, null)} />
            )}
            {offers && (
              <ConsentRow w={w} consent="offers" granted={offers.granted} data={{ 'data-consent': 'offers' }} onToggle={() => void post('/api/family/consent', { purpose: 'offers', granted: !offers.granted, tap: true }, null)} />
            )}
          </Section>
        )}

        {panel(
          'account',
          <>
            <Section title={w['fam.parent.language']}>
              <LanguageSwitch lang={lang} w={w} />
            </Section>

            <Section title={w['fam.parent.signOutTitle']} icon="lock">
              <div className="flex flex-col gap-2 sm:flex-row">
                {/* M2-9: signing out also clears the chapters and answers kept on this phone; M3-8b: and its notifications. */}
                <Button variant="outline" onClick={() => void forgetThisBrowser().then(clearOffline).then(() => post('/api/family/auth/sign-out', {}, '/family/sign-in'))}>
                  {w['fam.parent.signOut']}
                </Button>
                <Button variant="outline" onClick={() => void forgetThisBrowser().then(clearOffline).then(() => post('/api/family/auth/sign-out', { everywhere: true }, '/family/sign-in'))}>
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
          </>
        )}

        {error && (
          <p role="alert" className="text-sm font-semibold text-red-800">
            {error}
          </p>
        )}
      </main>
    </>
  );
}
