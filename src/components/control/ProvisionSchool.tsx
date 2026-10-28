'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { isMessageKey, type MessageKey } from '@/lib/i18n';
import {
  MAX_SECTIONS,
  PROVISION_GRADES,
  parseTeacherList,
  provisionClassNames,
  sectionLetters,
  type ProvisionSession,
  type ProvisionTeacher,
} from '@/lib/onboarding/provision-input';

// Control → Onboarding → Provision a school (W6-E, C230-AU; Decision Log C399): one page, three steps shown together,
// each with its own state in the bar at the top. "Check" runs the whole provisioning and undoes it, so every problem
// and every count is seen before anything is saved; "Provision" saves it. A name that matches a school offers to add
// to that school instead. The words are the message files'; the data (class names, board names) is shown as it is.

type Board = { boardId: string; name: string };
type State = { code: string; name: string };
type Problem = { field: string; code: string; line?: number };
type RowError = { row: number; errors: string[] };
type Invite = { invitationId: string | null; displayName: string; role: 'principal' | 'teacher'; status: 'queued' | 'already_invited'; className: string | null; sendStatus?: string | null };
type Result = {
  schoolId: string;
  schoolName: string;
  newSchool: boolean;
  plan: { name: string; modules: number } | null;
  session: { label: string };
  classes: { created: number; alreadyThere: number };
  syllabus: { classesMapped: number; units: number; classesWithoutCatalog: number };
  invitations: Invite[];
  students: { imported: number; alreadyImported: boolean; onRecordGuardians: number };
  guardians: { created: number; linked: number };
};
type Answer =
  | { kind: 'idle' }
  | { kind: 'busy'; dryRun: boolean }
  | { kind: 'problems'; problems: Problem[] }
  | { kind: 'students'; errors: RowError[] }
  | { kind: 'exists'; schoolId: string; schoolName: string }
  | { kind: 'error'; key: MessageKey }
  | { kind: 'result'; dryRun: boolean; result: Result };

const CARD = 'rounded-2xl border border-slate/10 bg-white p-4 shadow-sm md:p-6 motion-safe:transition-shadow motion-safe:duration-200 hover:shadow-md';
const CHIP = 'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border px-3 text-sm font-semibold motion-safe:transition motion-safe:duration-150 motion-safe:active:scale-95';
const CHIP_ON = 'border-sapphire bg-sapphire text-off-white';
const CHIP_OFF = 'border-slate/20 bg-white text-slate hover:border-sapphire';
const BUTTON = 'inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 text-sm font-semibold motion-safe:transition motion-safe:duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 disabled:cursor-not-allowed disabled:opacity-60';
const PRIMARY = `${BUTTON} bg-sapphire text-off-white`;
const QUIET = `${BUTTON} border border-slate/20 bg-white text-slate hover:border-sapphire`;
const EMPTY_TEACHER: ProvisionTeacher = { name: '', email: '', className: '' };
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function StepHead({ id, n, title, ready, words }: { id: string; n: number; title: string; ready: boolean; words: { ready: string; todo: string } }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span aria-hidden className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold tabular-nums ${ready ? 'bg-emerald/15 text-emerald-text' : 'bg-sapphire text-off-white'}`}>
        {n}
      </span>
      <h2 id={id} className="text-lg font-bold text-slate">
        {title}
      </h2>
      <span className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${ready ? 'bg-emerald/15 text-emerald-text' : 'bg-amber/15 text-amber-text'}`}>{ready ? words.ready : words.todo}</span>
    </div>
  );
}

function Stat({ value, children }: { value: number | string; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-1 rounded-xl bg-slate/5 p-3">
      <span className="text-2xl font-bold tabular-nums text-slate">{value}</span>
      <span className="text-sm text-slate">{children}</span>
    </li>
  );
}

export function ProvisionSchool({ boards, states, initialSession }: { boards: Board[]; states: State[]; initialSession: ProvisionSession }) {
  const { t } = useT();
  const [schoolName, setSchoolName] = useState('');
  const [boardId, setBoardId] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [city, setCity] = useState('');
  const [grades, setGrades] = useState<string[]>([...PROVISION_GRADES]);
  const [sections, setSections] = useState(1);
  const [session, setSession] = useState<ProvisionSession>(initialSession);
  const [principal, setPrincipal] = useState({ name: '', email: '' });
  const [teachers, setTeachers] = useState<ProvisionTeacher[]>([{ ...EMPTY_TEACHER }]);
  const [teacherPaste, setTeacherPaste] = useState('');
  const [studentsCsv, setStudentsCsv] = useState('');
  const [answer, setAnswer] = useState<Answer>({ kind: 'idle' });
  // After "add to the existing school", every later check and provision is for that school.
  const [existing, setExisting] = useState<string | null>(null);

  const classCount = useMemo(() => provisionClassNames(grades, sections).length, [grades, sections]);
  const studentRows = useMemo(() => studentsCsv.split(/\r?\n/).filter((l) => l.trim()).length - 1, [studentsCsv]);
  const schoolReady = schoolName.trim().length >= 2 && Boolean(boardId) && Boolean(stateCode) && city.trim() !== '' && grades.length > 0 && session.label.trim() !== '';
  const peopleReady = principal.name.trim().length >= 2 && EMAIL.test(principal.email.trim());
  const reviewReady = answer.kind === 'result';
  const steps = { ready: t('control.provision.step.ready'), todo: t('control.provision.step.todo') };
  const busy = answer.kind === 'busy';

  const toggleGrade = (g: string) => setGrades((now) => (now.includes(g) ? now.filter((x) => x !== g) : [...now, g]));
  const setTeacher = (i: number, patch: Partial<ProvisionTeacher>) => setTeachers((now) => now.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const addFromPaste = () => {
    const rows = parseTeacherList(teacherPaste);
    if (rows.length === 0) return;
    setTeachers((now) => [...now.filter((r) => r.name || r.email || r.className), ...rows]);
    setTeacherPaste('');
  };
  const readFile = async (file: File | undefined) => {
    if (file) setStudentsCsv(await file.text());
  };

  async function send(dryRun: boolean, existingSchoolId: string | null = null) {
    setAnswer({ kind: 'busy', dryRun });
    const res = await fetch('/api/control/onboarding/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolName, boardId, stateCode, city, grades, sections, session, principal, teachers, studentsCsv, existingSchoolId, dryRun }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok && data.result) return setAnswer({ kind: 'result', dryRun, result: data.result });
    if (res?.status === 400 && Array.isArray(data.problems)) return setAnswer({ kind: 'problems', problems: data.problems });
    if (data.reason === 'school_exists') return setAnswer({ kind: 'exists', schoolId: data.schoolId, schoolName: data.schoolName });
    if (data.reason === 'students') return setAnswer({ kind: 'students', errors: data.errors ?? [] });
    const key = `control.provision.error.${data.reason ?? 'other'}`;
    setAnswer({ kind: 'error', key: isMessageKey(key) ? key : 'control.provision.error.other' });
  }

  const problemText = (p: Problem) => {
    const key = p.field === 'teacher' || p.field === 'students' ? `control.provision.problem.${p.field}.${p.code}` : `control.provision.problem.${p.field}`;
    return isMessageKey(key) ? t(key, { line: p.line ?? '' }) : t('control.provision.error.other');
  };
  const inviteWord = (status: string) => {
    const key = `control.provision.invite.${status}`;
    return isMessageKey(key) ? t(key) : status;
  };

  return (
    <div className="flex flex-col gap-4">
      <ol className="grid grid-cols-3 gap-2" data-provision-progress>
        {[
          ['control.provision.step.school', schoolReady],
          ['control.provision.step.people', peopleReady],
          ['control.provision.step.review', reviewReady],
        ].map(([key, ready], i) => (
          <li key={key as string} className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${ready ? 'border-emerald bg-emerald/10 text-emerald-text' : 'border-slate/15 bg-white text-slate'}`}>
            <span className="tabular-nums">{i + 1}</span>
            <span className="truncate">{t(key as MessageKey)}</span>
          </li>
        ))}
      </ol>

      <section className={CARD} aria-labelledby="provision-school" data-provision-step="school">
        <StepHead id="provision-school" n={1} title={t('control.provision.step.school')} ready={schoolReady} words={steps} />
        <div className="grid gap-4 md:grid-cols-2">
          <Input id="provision-name" label={t('control.provision.school.name')} required requiredText={t('control.provision.required')} value={schoolName} onChange={(e) => setSchoolName(e.target.value)} autoComplete="organization" />
          <Select id="provision-board" label={t('control.provision.school.board')} required requiredText={t('control.provision.required')} value={boardId} onChange={(e) => setBoardId(e.target.value)}>
            <option value="">{t('control.provision.school.boardChoose')}</option>
            {boards.map((b) => (
              <option key={b.boardId} value={b.boardId}>
                {b.name}
              </option>
            ))}
          </Select>
          <Select id="provision-state" label={t('control.provision.school.state')} required requiredText={t('control.provision.required')} value={stateCode} onChange={(e) => setStateCode(e.target.value)}>
            <option value="">{t('control.provision.school.stateChoose')}</option>
            {states.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </Select>
          <Input id="provision-city" label={t('control.provision.school.city')} required requiredText={t('control.provision.required')} value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
        </div>

        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-semibold text-slate">{t('control.provision.school.grades')}</legend>
          <div className="flex flex-wrap gap-2">
            {PROVISION_GRADES.map((g) => (
              <button key={g} type="button" aria-pressed={grades.includes(g)} onClick={() => toggleGrade(g)} className={`${CHIP} ${grades.includes(g) ? CHIP_ON : CHIP_OFF}`}>
                {g}
              </button>
            ))}
            <button type="button" onClick={() => setGrades(grades.length === PROVISION_GRADES.length ? [] : [...PROVISION_GRADES])} className={`${CHIP} ${CHIP_OFF}`}>
              {grades.length === PROVISION_GRADES.length ? t('control.provision.school.gradesNone') : t('control.provision.school.gradesAll')}
            </button>
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-semibold text-slate">{t('control.provision.school.sections')}</legend>
          <div className="flex flex-wrap items-center gap-2">
            {Array.from({ length: MAX_SECTIONS }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" aria-pressed={sections === n} onClick={() => setSections(n)} className={`${CHIP} ${sections === n ? CHIP_ON : CHIP_OFF}`}>
                {sectionLetters(n).join(' ')}
              </button>
            ))}
            <span className="text-sm tabular-nums text-slate" data-provision-class-count>
              {t('control.provision.school.classCount', { n: classCount })}
            </span>
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-semibold text-slate">{t('control.provision.school.session')}</legend>
          <div className="grid gap-4 md:grid-cols-3">
            <Input id="provision-session" label={t('control.provision.school.sessionLabel')} value={session.label} onChange={(e) => setSession({ ...session, label: e.target.value })} />
            <Input id="provision-start" type="date" floating={false} label={t('control.provision.school.sessionStart')} value={session.startDate} onChange={(e) => setSession({ ...session, startDate: e.target.value })} />
            <Input id="provision-end" type="date" floating={false} label={t('control.provision.school.sessionEnd')} value={session.endDate} onChange={(e) => setSession({ ...session, endDate: e.target.value })} />
          </div>
        </fieldset>
      </section>

      <section className={CARD} aria-labelledby="provision-people" data-provision-step="people">
        <StepHead id="provision-people" n={2} title={t('control.provision.step.people')} ready={peopleReady} words={steps} />
        <h3 className="mb-2 text-sm font-semibold text-slate">{t('control.provision.people.principal')}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Input id="provision-principal-name" label={t('control.provision.people.principalName')} required requiredText={t('control.provision.required')} value={principal.name} onChange={(e) => setPrincipal({ ...principal, name: e.target.value })} />
          <Input id="provision-principal-email" type="email" label={t('control.provision.people.principalEmail')} required requiredText={t('control.provision.required')} value={principal.email} onChange={(e) => setPrincipal({ ...principal, email: e.target.value })} />
        </div>

        <h3 className="mb-2 mt-6 text-sm font-semibold text-slate">{t('control.provision.people.teachers')}</h3>
        <ul className="flex flex-col gap-3">
          {teachers.map((row, i) => (
            <li key={i} className="grid gap-2 md:grid-cols-[1fr_1fr_10rem_auto]" data-provision-teacher={i + 1}>
              <Input id={`provision-teacher-${i}-name`} label={t('control.provision.people.teacherName')} value={row.name} onChange={(e) => setTeacher(i, { name: e.target.value })} />
              <Input id={`provision-teacher-${i}-email`} type="email" label={t('control.provision.people.teacherEmail')} value={row.email} onChange={(e) => setTeacher(i, { email: e.target.value })} />
              <Input id={`provision-teacher-${i}-class`} label={t('control.provision.people.teacherClass')} value={row.className} onChange={(e) => setTeacher(i, { className: e.target.value })} />
              <button type="button" onClick={() => setTeachers((now) => (now.length === 1 ? [{ ...EMPTY_TEACHER }] : now.filter((_, j) => j !== i)))} className={QUIET} aria-label={t('control.provision.people.teacherRemove', { n: i + 1 })}>
                <span aria-hidden>×</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setTeachers((now) => [...now, { ...EMPTY_TEACHER }])} className={QUIET}>
            {t('control.provision.people.teacherAdd')}
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <Textarea id="provision-teacher-paste" rows={3} label={t('control.provision.people.teacherPaste')} value={teacherPaste} onChange={(e) => setTeacherPaste(e.target.value)} />
          <button type="button" onClick={addFromPaste} disabled={!teacherPaste.trim()} className={`${QUIET} self-start`}>
            {t('control.provision.people.teacherPasteAdd')}
          </button>
        </div>

        <h3 className="mb-1 mt-6 text-sm font-semibold text-slate">{t('control.provision.people.students')}</h3>
        <p className="mb-2 text-sm text-slate">{t('control.provision.people.studentsLead')}</p>
        <Textarea id="provision-students" rows={5} label={t('control.provision.people.studentsList')} value={studentsCsv} onChange={(e) => setStudentsCsv(e.target.value)} className="font-mono text-sm" />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className={`${QUIET} cursor-pointer`}>
            {t('control.provision.people.studentsFile')}
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void readFile(e.target.files?.[0])} />
          </label>
          {studentRows > 0 ? <span className="text-sm tabular-nums text-slate">{t('control.provision.people.studentsRows', { n: studentRows })}</span> : null}
        </div>
      </section>

      <section className={CARD} aria-labelledby="provision-review" data-provision-step="review" aria-live="polite">
        <StepHead id="provision-review" n={3} title={t('control.provision.step.review')} ready={reviewReady} words={steps} />
        <p className="text-sm text-slate">{t('control.provision.review.lead')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void send(true, existing)} disabled={busy || !schoolReady || !peopleReady} className={QUIET} data-provision-check>
            {busy && answer.dryRun ? t('control.provision.review.checking') : t('control.provision.review.check')}
          </button>
          <button type="button" onClick={() => void send(false, existing)} disabled={busy || !schoolReady || !peopleReady} className={PRIMARY} data-provision-go>
            {busy && !answer.dryRun ? t('control.provision.review.provisioning') : t('control.provision.review.provision')}
          </button>
        </div>

        {answer.kind === 'problems' ? (
          <ul role="alert" className="mt-4 flex list-disc flex-col gap-1 rounded-xl bg-coral/10 p-4 pl-8 text-sm text-slate">
            {answer.problems.map((p, i) => (
              <li key={i}>{problemText(p)}</li>
            ))}
          </ul>
        ) : null}
        {answer.kind === 'students' ? (
          <div role="alert" className="mt-4 rounded-xl bg-coral/10 p-4 text-sm text-slate">
            <p className="font-semibold">{t('control.provision.students.rows')}</p>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
              {answer.errors.map((e) => (
                <li key={e.row}>{t('control.provision.students.row', { row: e.row, errors: e.errors.join('; ') })}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {answer.kind === 'error' ? (
          <p role="alert" className="mt-4 rounded-xl bg-coral/10 p-4 text-sm text-slate">
            {t(answer.key)}
          </p>
        ) : null}
        {answer.kind === 'exists' ? (
          <div role="alert" className="mt-4 flex flex-col gap-3 rounded-xl bg-amber/10 p-4 text-sm text-slate" data-provision-exists>
            <p className="font-semibold">{t('control.provision.exists.title', { name: answer.schoolName })}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={PRIMARY}
                onClick={() => {
                  setExisting(answer.schoolId);
                  void send(true, answer.schoolId);
                }}
              >
                {t('control.provision.exists.add')}
              </button>
              <button type="button" className={QUIET} onClick={() => {
                  setExisting(null);
                  setAnswer({ kind: 'idle' });
                }}>
                {t('control.provision.exists.rename')}
              </button>
            </div>
          </div>
        ) : null}

        {answer.kind === 'result' ? <Outcome result={answer.result} dryRun={answer.dryRun} inviteWord={inviteWord} /> : null}
      </section>
    </div>
  );
}

function Outcome({ result: r, dryRun, inviteWord }: { result: Result; dryRun: boolean; inviteWord: (s: string) => string }) {
  const { t } = useT();
  return (
    <div className="mt-5 flex flex-col gap-4" data-provision-result={dryRun ? 'preview' : 'done'}>
      <h3 className="text-base font-bold text-slate">{dryRun ? t('control.provision.review.preview') : t('control.provision.review.done')}</h3>
      <p className="text-sm text-slate">
        {r.newSchool ? t('control.provision.result.newSchool', { name: r.schoolName }) : t('control.provision.result.existingSchool', { name: r.schoolName })}
        {' · '}
        {r.plan ? t('control.provision.result.plan', { plan: r.plan.name, n: r.plan.modules }) : t('control.provision.result.planKept')}
        {' · '}
        {t('control.provision.result.session', { label: r.session.label })}
      </p>
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat value={r.classes.created}>{t('control.provision.result.classes', { made: r.classes.created, there: r.classes.alreadyThere })}</Stat>
        <Stat value={r.syllabus.units}>{t('control.provision.result.syllabus', { units: r.syllabus.units, classes: r.syllabus.classesMapped })}</Stat>
        <Stat value={r.invitations.length}>{t('control.provision.result.invites', { n: r.invitations.length })}</Stat>
        <Stat value={r.students.imported}>{r.students.alreadyImported ? t('control.provision.result.studentsBefore') : t('control.provision.result.students', { n: r.students.imported })}</Stat>
      </ul>
      <ul className="flex flex-col gap-1 text-sm text-slate">
        {r.syllabus.classesWithoutCatalog > 0 ? <li>{t('control.provision.result.syllabusNone', { n: r.syllabus.classesWithoutCatalog })}</li> : null}
        {r.guardians.created > 0 ? <li>{t('control.provision.result.guardians', { made: r.guardians.created, links: r.guardians.linked })}</li> : null}
        {r.students.onRecordGuardians > 0 ? <li>{t('control.provision.result.onRecord', { n: r.students.onRecordGuardians })}</li> : null}
      </ul>
      <ul className="flex flex-col divide-y divide-slate/10 rounded-xl border border-slate/10" data-provision-invites>
        {r.invitations.map((i, k) => (
          <li key={k} className="flex flex-wrap items-center gap-2 p-3 text-sm text-slate">
            <span className="font-semibold">{i.displayName}</span>
            <span>{i.role === 'principal' ? t('role.principal') : t('role.teacher')}</span>
            <span className="ml-auto rounded-full bg-slate/5 px-3 py-1 text-xs font-semibold">{inviteWord(i.status === 'already_invited' ? 'already' : (i.sendStatus ?? 'queued'))}</span>
            {i.className ? <span className="w-full text-xs">{t('control.provision.invite.classNote', { name: i.className })}</span> : null}
          </li>
        ))}
      </ul>
      {dryRun ? null : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Link href={`/control/schools/${r.schoolId}`} className={PRIMARY}>
              {t('control.provision.done.open')}
            </Link>
            <a href="/control/onboarding/provision" className={QUIET}>
              {t('control.provision.done.another')}
            </a>
          </div>
          <p className="text-sm text-slate">{t('control.provision.done.viewAs')}</p>
        </div>
      )}
    </div>
  );
}
