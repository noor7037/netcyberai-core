'use client';

import { forgetThisBrowser } from './push-client';
import type { Subject } from '@/lib/family/subjects';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/family/ui/Button';
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
import { ParentTile } from './ParentTile';
import { SchoolText } from './SchoolText';
import { Disclosure } from './parent/Disclosure';
import { ChildSwitcherBar, ChildWeek } from './parent/ChildPanel';
import { ParentHome, type HomeChild, type HomeNeed } from './parent/ParentHome';
import { BottomTabs, type IconName as PartIcon } from './parent/parts';
import type { SchoolOverview } from '@/lib/family/school';
import type { ParentHabit } from '@/lib/family/habit';
import type { ParentWeek } from '@/lib/family/learning';

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
          <span aria-hidden="true" className="fam-chip-icon bg-ink text-white">
            <FamIcon name={icon} className="h-5 w-5" />
          </span>
        )}
        {title}
      </h2>
      {children}
    </section>
  );
}

const linkButton = 'fam-press min-h-[44px] rounded-xl px-2 text-sm font-semibold text-ink underline-offset-4 hover:underline';

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
        <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-semibold text-ink">{w['fam.consent.more']}</summary>
        <p className="text-sm text-slate">{w[`fam.consent.purpose.${consent}`]}</p>
        {note && <p className="mt-1 text-sm text-slate">{note}</p>}
      </details>
    </div>
  );
}

function ChildRow({ w, child, states, boards }: { w: Words; child: Child; states: { code: string; name: string }[]; boards?: BoardOption[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'edit' | 'remove' | 'answers'>('view');
  // W10 (C411): a change saved is said, not only closed.
  const [saved, setSaved] = useState(false);
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
          <button
            type="button"
            className={linkButton}
            data-child-edit
            onClick={() => {
              setSaved(false);
              setMode(mode === 'edit' ? 'view' : 'edit');
            }}
          >
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
            className={`fam-press min-h-[44px] rounded-full px-4 font-bold ${child.freeSubject === sub ? 'bg-ink text-white' : 'bg-white text-slate ring-1 ring-slate/15'}`}
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
            setSaved(true);
            router.refresh();
          }}
        />
      )}
      {saved && mode === 'view' && (
        <p role="status" data-child-saved className="flex min-h-[44px] items-center rounded-xl bg-emerald/10 px-3 text-sm font-semibold text-emerald-text">
          {fill(w['fam.parent.childSaved'], { name: child.firstName })}
        </p>
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

// C506: the area is four tabs in a bottom bar (Home, Children, School, Me). The URL hash names the open one (#children),
// so a link can open it; the older names still open the right place (#overview is Home; #learning, #privacy and #account
// open Me with that row open; #manage, #habit and #phones open those rows on Children).
export const TABS = ['home', 'children', 'school', 'me'] as const;
export type TabId = (typeof TABS)[number];
type RowId = 'manage' | 'habit' | 'phones' | 'learning' | 'privacy' | 'language' | 'signout' | 'delete';
const HASHES: Record<string, { tab: TabId; row?: RowId }> = {
  home: { tab: 'home' },
  overview: { tab: 'home' },
  children: { tab: 'children' },
  school: { tab: 'school' },
  me: { tab: 'me' },
  learning: { tab: 'me', row: 'learning' },
  privacy: { tab: 'me', row: 'privacy' },
  account: { tab: 'me', row: 'signout' },
  manage: { tab: 'children', row: 'manage' },
  habit: { tab: 'children', row: 'habit' },
  phones: { tab: 'children', row: 'phones' },
};
const BAR: { id: TabId; icon: PartIcon }[] = [
  { id: 'home', icon: 'home' },
  { id: 'children', icon: 'kids' },
  { id: 'school', icon: 'school' },
  { id: 'me', icon: 'me' },
];

// The open tab: Home on the server and on the first paint (so the two agree), then the hash. `rows` are the open rows.
function useTabs() {
  const [tab, setTab] = useState<TabId>('home');
  const [rows, setRows] = useState<ReadonlySet<RowId>>(new Set());
  const ready = useRef(false);
  useEffect(() => {
    const read = () => {
      const h = HASHES[window.location.hash.replace(/^#/, '')];
      if (!h) return;
      setTab(h.tab);
      if (h.row) setRows((r) => new Set(r).add(h.row as RowId));
    };
    read();
    ready.current = true;
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const go = useCallback((id: TabId, row?: RowId) => {
    setTab(id);
    if (row) setRows((r) => new Set(r).add(row));
    try {
      window.history.replaceState(window.history.state, '', `#${id}`);
    } catch {
      // The hash is only the deep link; the section is already open.
    }
    if (ready.current) window.scrollTo({ top: 0 });
  }, []);
  const toggle = useCallback((row: RowId) => setRows((r) => { const n = new Set(r); if (n.has(row)) n.delete(row); else n.add(row); return n; }), []);
  return { tab, go, rows, toggle };
}

// `english`: the English course (C274) when Control has it switched on: whether the parent has given its consent.
// `photo`: the same for photo questions (M2-6, C280), when Control has the homework helper or the tutor switched on;
// `renew` when a yes given on the older notice no longer counts (C230-AP).
// `voice`: the same for voice (M2-7, C281), when Control has voice input switched on.
// `offers` (C230-V): whether the parent agreed to hear about offers; always shown, optional, off until turned on.
// `slots` (W6-F, docs/38 §6): the sections the page builds on the server, placed by the area where they belong: the
// Children's Learning Vault link and tutor use (`overview`), phones and Focus Lock (`children`), the School's parts,
// and the Me tab's chapter requests and syllabus (`learning`; null: none to show, so the row says so in one sentence).
// `needs`: what needs the parent now, one action each. `weeks`: each child's week (C506), counts of what was answered.
export type ParentSlots = { overview?: ReactNode; children?: ReactNode; school?: ReactNode; learning?: ReactNode };
export type ParentNeed = { kind: 'requests_declined' | 'requests_open' | 'renew' | 'consent' | 'meeting'; n?: number; name?: string };

export function ParentArea({ w, lang, children, states, boards, studyCore, calm, english = null, photo = null, voice = null, offers = null, habit = null, slots = {}, needs = [], schoolNumbers = [], weeks = [] }: { w: Words; lang: Lang; children: Child[]; states: { code: string; name: string }[]; boards?: BoardOption[]; studyCore: boolean; calm: Calm[]; english?: { granted: boolean } | null; photo?: { granted: boolean; renew?: boolean } | null; voice?: { granted: boolean } | null; offers?: { granted: boolean } | null; habit?: ParentHabit[] | null; slots?: ParentSlots; needs?: ParentNeed[]; schoolNumbers?: SchoolOverview[]; weeks?: ParentWeek[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [deleteWord, setDeleteWord] = useState('');
  const [error, setError] = useState('');
  const post = async (path: string, body: unknown, then: string | null) => {
    setError('');
    const r = await familyApi(path, 'POST', body);
    if (!r.ok) return setError(errorWords(w, r.error));
    if (then) router.replace(then);
    router.refresh();
  };

  const { tab, go, rows, toggle } = useTabs();
  const need = (n: ParentNeed, i: number): HomeNeed => {
    const key = `${n.kind}-${i}`;
    switch (n.kind) {
      case 'requests_declined':
        return { key, icon: 'book', tone: 'action', text: fill(w['fam.parent.needs.requestsDeclined'], { n: n.n ?? 0 }), onOpen: () => go('me', 'learning') };
      case 'requests_open':
        return { key, icon: 'clock', tone: 'product', text: fill(w['fam.parent.needs.requestsOpen'], { n: n.n ?? 0 }), onOpen: () => go('me', 'learning') };
      case 'renew':
        return { key, icon: 'shield', tone: 'trust', text: w['fam.parent.needs.renew'], onOpen: () => go('me', 'privacy') };
      case 'consent':
        return { key, icon: 'shield', tone: 'trust', text: w['fam.parent.needs.consent'], onOpen: () => go('me', 'privacy') };
      case 'meeting':
        return { key, icon: 'school', tone: 'product', text: fill(w['fam.parent.needs.meeting'], { name: n.name ?? '' }), onOpen: () => go('school') };
    }
  };
  const panel = (id: TabId, body: ReactNode) => (
    <div key={id} id={`fam-parent-panel-${id}`} data-parent-panel={id} hidden={tab !== id}>
      <div className="flex flex-col gap-4">{body}</div>
    </div>
  );
  const row = (id: RowId, title: string, icon: PartIcon, body: ReactNode) => (
    <Disclosure id={id} title={title} icon={icon} open={rows.has(id)} onToggle={() => toggle(id)}>
      {body}
    </Disclosure>
  );

  const goalOf = (childId: string) => habit?.find((h) => h.childId === childId)?.goal ?? null;
  const kids: HomeChild[] = children.map((c) => {
    const card = calm.find((x) => x.childId === c.childId);
    return { childId: c.childId, firstName: c.firstName, classLevel: c.classLevel, week: weeks.find((x) => x.childId === c.childId) ?? null, calm: card ? { right: card.right, topics: card.topics, mastered: card.mastered } : null, goalDays: goalOf(c.childId) };
  });
  const sel = kids.find((k) => k.childId === selected) ?? kids[0] ?? null;
  const selChild = sel ? children.find((c) => c.childId === sel.childId) : undefined;
  const addForm = (
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
  );
  const addChild = () => {
    setAdding(true);
    go('children');
  };
  const tabs = BAR.map((b) => ({ id: b.id, icon: b.icon, label: w[`fam.parent.app.tab.${b.id}`] }));

  return (
    <>
      <SubPageHeader
        back="/family/profile"
        backLabel={w['fam.profile.title']}
        title={w['fam.parent.title']}
        tone="ink"
        aside={
          <button
            type="button"
            onClick={() => void post('/api/family/pin/lock', {}, '/family')}
            className="fam-press inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-ink px-4 text-sm font-bold text-white ring-1 ring-white/40"
          >
            <FamIcon name="lock" className="h-4 w-4" />
            {w['fam.parent.back']}
          </button>
        }
      />
      <main className="fam-page">
        {/* The area as four tabs in the bottom bar (the child's own dock is not shown on this page, so exactly one bar
            shows). One panel shows, the rest stay mounted (hidden) so a draft typed in one is not lost. */}
        {panel(
          'home',
          <>
            <ParentHome
              w={w}
              lang={lang}
              needs={needs.map(need)}
              noNeeds={w['fam.parent.needs.none']}
              kids={kids}
              onSeeChild={(id) => {
                setSelected(id);
                go('children');
              }}
              onAddChild={addChild}
            />
            {schoolNumbers.length > 0 && (
              <Section title={w['fam.parent.ov.title']} icon="calendar">
                {schoolNumbers.map((s) => (
                  <div key={s.linkId} data-overview-school={s.linkId} className="flex flex-col gap-4">
                    {s.children.map((c) => {
                      // "from DAV Public School", the school's name in its own words inside the app's sentence.
                      const from = (
                        <span>
                          {(w['fam.parent.ov.from'] ?? '').split('{school}').map((part, i) => (
                            <span key={i}>
                              {i > 0 && <SchoolText text={s.schoolName} />}
                              {part}
                            </span>
                          ))}
                        </span>
                      );
                      return (
                        <div key={c.studentId} data-overview-school-child={c.studentId} className="flex flex-col gap-2">
                          <p className="text-base font-bold text-slate">
                            <SchoolText text={c.name} />
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <ParentTile
                              data-tile="attendance"
                              tint="mint"
                              icon="calendar"
                              label={w['fam.parent.ov.attendance']}
                              value={c.attendance ? `${c.attendance.present}/${c.attendance.marked}` : '–'}
                              lines={[c.attendance ? fill(w['fam.school.present'], { present: c.attendance.present, marked: c.attendance.marked }) : w['fam.parent.ov.attendanceNone'], from]}
                            />
                            <ParentTile
                              data-tile="fees"
                              tint="butter"
                              icon="fees"
                              label={w['fam.parent.ov.fees']}
                              value={new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(c.dueMinor / 100)}
                              lines={[c.dueMinor > 0 ? fill(w['fam.school.due'], { amount: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(c.dueMinor / 100) }) : w['fam.parent.ov.feesNone'], from]}
                            />
                            {c.results !== null && (
                              <ParentTile data-tile="results" tint="lilac" icon="sheet" label={w['fam.parent.ov.results']} value={String(c.results)} lines={[c.results === 0 ? w['fam.parent.ov.resultsNone'] : '', from].filter(Boolean)} />
                            )}
                            {c.homeworkDue !== null && (
                              <ParentTile data-tile="homework" tint="sky" icon="pencil" label={w['fam.parent.ov.homework']} value={String(c.homeworkDue)} lines={[c.homeworkDue === 0 ? w['fam.parent.ov.homeworkNone'] : '', from].filter(Boolean)} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </Section>
            )}
          </>
        )}

        {panel(
          'children',
          <>
            {kids.length > 0 && <ChildSwitcherBar w={w} kids={kids} activeId={sel?.childId ?? null} onSelect={setSelected} onAdd={() => setAdding(true)} />}
            {adding && (
              <section className="fam-card p-4">
                {addForm}
                <Button variant="outline" onClick={() => setAdding(false)}>
                  {w['fam.common.cancel']}
                </Button>
              </section>
            )}
            {!sel ? (
              !adding && (
                <section data-parent-empty className="flex flex-col items-start gap-3 fam-card p-4">
                  <p className="text-base font-semibold text-slate">{w['fam.parent.app.noKids']}</p>
                  <Button variant="outline" onClick={() => setAdding(true)}>
                    {w['fam.child.add']}
                  </Button>
                </section>
              )
            ) : (
              <>
                <ChildWeek w={w} lang={lang} kid={sel} week={sel.week} />
                {/* What the parent could do for this child before, as compact rows that open the same things. */}
                {selChild && row('manage', fill(w['fam.parent.app.manage'], { name: selChild.firstName }), 'kids', <ul className="flex flex-col gap-2"><ChildRow key={selChild.childId} w={w} child={selChild} states={states} boards={boards} /></ul>)}
                {english?.granted && selChild && (
                  <a href={`/family/parent/english/${selChild.childId}`} data-parent-english className="fam-row fam-lift justify-between bg-white text-base font-semibold text-slate">
                    <span>
                      {w['fam.english.parent.section']} · {w['fam.english.parent.open']}
                    </span>
                    <FamIcon name="next" className="h-5 w-5 shrink-0" />
                  </a>
                )}
              </>
            )}
            {habit && habit.length > 0 && row('habit', w['fam.habit.parent.title'], 'star', <HabitParent w={w} habit={habit} names={Object.fromEntries(children.map((c) => [c.childId, c.firstName]))} />)}
            {slots.children && row('phones', w['fam.parent.app.phones'], 'link', slots.children)}
            {slots.overview}
          </>
        )}

        {panel('school', slots.school ?? <p data-parent-empty className="fam-card p-4 text-base font-semibold text-slate">{w['fam.parent.app.schoolNone']}</p>)}

        {panel(
          'me',
          <>
            {row(
              'learning',
              w['fam.parent.tab.learning'],
              'book',
              slots.learning ?? (
                <div data-parent-empty className="flex flex-col items-start gap-3">
                  <p className="text-base font-semibold text-slate">{w['fam.parent.learningEmpty']}</p>
                  <Button variant="outline" onClick={() => go('children')}>
                    {w['fam.parent.goChildren']}
                  </Button>
                </div>
              )
            )}
            {row(
              'privacy',
              w['fam.parent.privacy'],
              'shield',
              <>
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
              </>
            )}
            {row('language', w['fam.parent.language'], 'me', <LanguageSwitch lang={lang} w={w} />)}
            {row(
              'signout',
              w['fam.parent.signOutTitle'],
              'link',
              <div className="flex flex-col gap-2 sm:flex-row">
                {/* M2-9: signing out also clears the chapters and answers kept on this phone; M3-8b: and its notifications. */}
                <Button variant="outline" onClick={() => void forgetThisBrowser().then(clearOffline).then(() => post('/api/family/auth/sign-out', {}, '/family/sign-in'))}>
                  {w['fam.parent.signOut']}
                </Button>
                <Button variant="outline" onClick={() => void forgetThisBrowser().then(clearOffline).then(() => post('/api/family/auth/sign-out', { everywhere: true }, '/family/sign-in'))}>
                  {w['fam.parent.signOutAll']}
                </Button>
              </div>
            )}
            {row(
              'delete',
              w['fam.parent.deleteAccount'],
              'clock',
              <>
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
              </>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="text-sm font-semibold text-red-800">
            {error}
          </p>
        )}
      </main>
      <BottomTabs tabs={tabs} active={tab} onSelect={(id) => go(id as TabId)} label={w['fam.parent.app.nav']} />
    </>
  );
}
