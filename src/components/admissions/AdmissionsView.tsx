'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { ModulePage, PRIMARY_ACTION } from '@/components/app-ui/ModulePage';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import type { MessageKey } from '@/lib/i18n';

// The admissions pipeline (docs/28 slice 10a, C221): record an enquiry with who follows it up and when; "Follow up
// today" and "Gone quiet" (the website tracker's own rule, worked out on the server); record what happened, which
// moves the stage; and "Admit", which makes the child's student record in the class sought, waiting for consent,
// on the class's fee structure. The office only: `office` is false for anyone else, who is told so and is shown
// only the children waiting for consent (`children`, drawn on the server).
// The office also deletes an enquiry that was not admitted, and every such enquiry of a family that never joined
// (a parent's erasure request, found by phone), each after a confirmation (C223-A answer 3, C224). An admitted
// enquiry is the child's record: it is never deleted, and after the erasure of the child's data it shows no names.

type SourceCode = 'walk_in' | 'phone_call' | 'whatsapp' | 'website' | 'referral' | 'newspaper' | 'other';
type StageCode = 'enquiry' | 'visit_booked' | 'visited' | 'form_taken' | 'form_submitted' | 'admitted' | 'not_joining';
type Row = { enquiry_id: string; child_name: string | null; guardian_name: string | null; phone: string | null; class_id: string; class_name: string; source: SourceCode; stage: StageCode; owner_id: string; owner: string; next_follow_up: string | null; next_step: string | null; closed_reason: string | null; student_id: string | null; created_on: string; last_contact_on: string; erased_on: string | null };
type Data = { today: string; quietDays: number; enquiries: Row[]; lists: { due: { enquiryId: string; overdueDays: number }[]; quiet: { enquiryId: string; quietDays: number }[] }; classes: { class_id: string; name: string }[]; owners: { user_id: string; name: string }[]; me: string };
type Step = { kind: string; note: string | null; stage_from: StageCode | null; stage_to: StageCode | null; follow_up: string | null; next_step: string | null; owner: string | null; student_id: string | null; changed: string[] | null; by: string; at: string };
type Admitted = { studentId: string; className: string; fees: { academic_year: string; effective_from: string } | null; monthRaised: boolean };
type Family = { phone: string; enquiries: { enquiry_id: string; child_name: string; class_name: string; stage: StageCode; created_on: string }[]; admitted: number };
type Send = (url: string, payload: unknown, done: (got: Record<string, unknown>) => string, after?: () => void, method?: 'POST' | 'DELETE') => Promise<boolean>;
type Words = ReturnType<typeof useT>;

// The tool's lists, in its order (src/lib/free-tools/admissions-tracker.ts; the tests hold these to it).
const SOURCES: SourceCode[] = ['walk_in', 'phone_call', 'whatsapp', 'website', 'referral', 'newspaper', 'other'];
const STAGES: StageCode[] = ['enquiry', 'visit_booked', 'visited', 'form_taken', 'form_submitted', 'admitted', 'not_joining'];
const MOVABLE = STAGES.filter((s) => s !== 'admitted');
const isOpen = (s: StageCode) => s !== 'admitted' && s !== 'not_joining';
const ERRORS = ['child_name', 'guardian_name', 'phone', 'class', 'source', 'owner', 'stage', 'follow_up', 'next_step', 'reason', 'note', 'nothing', 'aadhaar', 'closed', 'admitted', 'admission_no', 'admission_no_taken', 'dob', 'changed'];
const TAP = 'min-h-[44px] rounded-md border border-slate/20 bg-white px-4 text-sm font-semibold text-slate disabled:opacity-60';
const DANGER = 'min-h-[44px] rounded-md border border-red-800/30 bg-white px-4 text-sm font-semibold text-red-800 disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const LINK = 'inline-flex min-h-[44px] items-center font-semibold text-sapphire underline';
const BLANK = { childName: '', classId: '', guardianName: '', phone: '', source: 'walk_in' as SourceCode, ownerId: '', followUp: '', nextStep: '', note: '' };

// A card starts again from what is saved whenever the enquiry changes (its forms hold what is being typed).
const cardKey = (r: Row) => [r.enquiry_id, r.stage, r.next_follow_up, r.next_step, r.closed_reason, r.owner_id, r.class_id, r.child_name, r.guardian_name, r.phone, r.source].join('|');
const dayIn = (lang: string, iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const daysFrom = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const followUpLine = ({ t, tCount, lang }: Words, r: Row, today: string) => {
  if (!r.next_follow_up || !isOpen(r.stage)) return null;
  const late = daysFrom(r.next_follow_up, today);
  return late > 0 ? tCount('adm.overdue', late) : late === 0 ? t('adm.dueToday') : t('adm.followUpOn', { date: dayIn(lang, r.next_follow_up) });
};

export function AdmissionsView({ office, children }: { office: boolean; children: ReactNode }) {
  const words = useT();
  const { t, tCount, lang } = words;
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/app/admissions').catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as Data | null) : null;
    setFailed(!got);
    if (got) setData(got);
  }, []);
  useEffect(() => {
    if (office) void load();
  }, [office, load]);

  const send: Send = async (url, payload, done, after, method = 'POST') => {
    setBusy(true);
    setNote(null);
    const res = await fetch(url, method === 'DELETE' ? { method } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const got = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
    setBusy(false);
    if (!res?.ok) {
      setNote({ ok: false, text: ERRORS.includes(String(got?.code)) ? t(`adm.err.${got?.code}` as MessageKey) : t('adm.err.other') });
      return false;
    }
    setNote({ ok: true, text: done(got ?? {}) });
    after?.();
    await load();
    // The children waiting for consent are drawn on the server: read the page again, so one just admitted is there.
    router.refresh();
    return true;
  };

  const byId = new Map((data?.enquiries ?? []).map((r) => [r.enquiry_id, r]));
  const due = (data?.lists.due ?? []).flatMap((d) => (byId.has(d.enquiryId) ? [{ ...d, row: byId.get(d.enquiryId)! }] : []));
  const quiet = (data?.lists.quiet ?? []).flatMap((q) => (byId.has(q.enquiryId) ? [{ ...q, row: byId.get(q.enquiryId)! }] : []));
  const open = (data?.enquiries ?? []).filter((r) => isOpen(r.stage)).sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || (a.next_follow_up ?? '9999').localeCompare(b.next_follow_up ?? '9999'));
  const closed = (data?.enquiries ?? []).filter((r) => !isOpen(r.stage));
  const showForm = office && data !== null && (adding || data.enquiries.length === 0);
  const owner = form.ownerId || (data?.owners.some((o) => o.user_id === data.me) ? data.me : '');

  return (
    <ModulePage
      moduleId="admissions"
      tour="admissions"
      help="admissions-enquiries"
      title={t('adm.page.title')}
      purpose={t('adm.page.purpose')}
      about={t('adm.page.about')}
      primary={
        office ? (
          <button type="button" data-adm-new-open className={PRIMARY_ACTION} onClick={() => setAdding(true)}>
            {t('adm.new.open')}
          </button>
        ) : undefined
      }
      notice={note ? <p role="status" data-adm-note className={`rounded-md px-3 py-2 text-sm font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>{note.text}</p> : undefined}
    >
      <div lang={lang} data-admissions className="flex min-w-0 flex-col gap-4 text-sm text-slate">
        {!office && <p data-adm-office-only className="rounded-md bg-off-white px-3 py-2">{t('adm.officeOnly')}</p>}
        {office && failed && <p role="alert" className="rounded-md bg-off-white px-3 py-2">{t('adm.failed')}</p>}

        {showForm && data && (
          <section data-adm-new className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
            <div className="flex flex-wrap items-center gap-x-1">
              <h2 className="text-base font-bold">{t('adm.new.title')}</h2>
              <InfoTip>{t(data.enquiries.length === 0 ? 'adm.new.first' : 'adm.new.how')}</InfoTip>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input id="adm-child" label={t('adm.form.child')} maxLength={60} value={form.childName} onChange={(e) => setForm({ ...form, childName: e.target.value })} />
              <Select id="adm-class" label={t('adm.form.class')} value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                <option value="">{t('adm.choose')}</option>
                {data.classes.map((c) => (
                  <option key={c.class_id} value={c.class_id}>{c.name}</option>
                ))}
              </Select>
              <Input id="adm-guardian" label={t('adm.form.guardian')} maxLength={60} value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} />
              <Input id="adm-phone" type="tel" inputMode="tel" label={t('adm.form.phone')} maxLength={20} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Select id="adm-source" label={t('adm.form.source')} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as SourceCode })}>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>{t(`adm.source.${s}` as MessageKey)}</option>
                ))}
              </Select>
              <Select id="adm-owner" label={t('adm.form.owner')} value={owner} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
                <option value="">{t('adm.choose')}</option>
                {data.owners.map((p) => (
                  <option key={p.user_id} value={p.user_id}>{p.name}</option>
                ))}
              </Select>
              <Input id="adm-follow-up" type="date" label={t('adm.form.followUp')} min={data.today} value={form.followUp} onChange={(e) => setForm({ ...form, followUp: e.target.value })} />
              <Input id="adm-next-step" label={t('adm.form.nextStep')} maxLength={120} value={form.nextStep} onChange={(e) => setForm({ ...form, nextStep: e.target.value })} />
              <div className="sm:col-span-2">
                <Textarea id="adm-note" label={t('adm.form.note')} helperText={t('adm.form.noAadhaar')} rows={2} maxLength={500} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-adm-record
                disabled={busy || !form.childName.trim() || !form.guardianName.trim() || !form.phone.trim() || !form.classId || !owner}
                className={PRIMARY}
                onClick={() => void send('/api/app/admissions', { ...form, ownerId: owner, followUp: form.followUp || null, nextStep: form.nextStep || null, note: form.note || null }, () => t('adm.recorded'), () => { setForm(BLANK); setAdding(false); })}
              >
                {t('adm.new.record')}
              </button>
              {data.enquiries.length > 0 && (
                <button type="button" className={TAP} onClick={() => setAdding(false)}>
                  {t('adm.cancel')}
                </button>
              )}
            </div>
          </section>
        )}

        {office && data && data.enquiries.length > 0 && (
          <>
            <section data-adm-due data-count={due.length} className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
              <h2 className="text-base font-bold">{t('adm.due.title', { count: due.length })}</h2>
              {due.length === 0 ? (
                <p className="rounded-md bg-off-white px-3 py-2">{t('adm.due.none')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {due.map((d) => (
                    <ListedRow key={d.enquiryId} kind="due" r={d.row} words={words} line={d.overdueDays > 0 ? tCount('adm.overdue', d.overdueDays) : t('adm.dueToday')} />
                  ))}
                </ul>
              )}
            </section>
            <section data-adm-quiet data-count={quiet.length} className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
              <div className="flex flex-wrap items-center gap-x-1">
                <h2 className="text-base font-bold">{t('adm.quiet.title', { count: quiet.length })}</h2>
                <InfoTip>{tCount('adm.quiet.how', data.quietDays)}</InfoTip>
              </div>
              {quiet.length === 0 ? (
                <p className="rounded-md bg-off-white px-3 py-2">{t('adm.quiet.none')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {quiet.map((q) => (
                    <ListedRow key={q.enquiryId} kind="quiet" r={q.row} words={words} line={tCount('adm.quietFor', q.quietDays)} />
                  ))}
                </ul>
              )}
            </section>
            <section data-adm-open data-count={open.length} className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
              <div>
                <h2 className="text-base font-bold">{t('adm.open.title', { count: open.length })}</h2>
                <p className="text-slate/70">{MOVABLE.filter((s) => s !== 'not_joining').map((s) => `${t(`adm.stage.${s}` as MessageKey)} ${open.filter((r) => r.stage === s).length}`).join(' · ')}</p>
              </div>
              {open.length === 0 ? (
                <p className="rounded-md bg-off-white px-3 py-2">{t('adm.open.none')}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {open.map((r) => (
                    <EnquiryCard key={cardKey(r)} r={r} data={data} busy={busy} send={send} words={words} />
                  ))}
                </ul>
              )}
            </section>
            {closed.length > 0 && (
              <details data-adm-closed className="rounded-lg border border-slate/10 bg-white p-4">
                <summary className="flex min-h-[44px] cursor-pointer items-center text-base font-bold">{t('adm.closed.title', { count: closed.length })}</summary>
                <ul className="mt-3 flex flex-col gap-3">
                  {closed.map((r) => (
                    <EnquiryCard key={cardKey(r)} r={r} data={data} busy={busy} send={send} words={words} />
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
        {office && data && <FamilyDelete busy={busy} send={send} words={words} />}
        {children}
      </div>
    </ModulePage>
  );
}

// One row of "Follow up today" or "Gone quiet": who, and a link to the enquiry's card below, where the work is done.
function ListedRow({ kind, r, words, line }: { kind: 'due' | 'quiet'; r: Row; words: Words; line: string }) {
  const { t } = words;
  return (
    <li data-adm-row={kind} data-enquiry-row={r.enquiry_id} className="flex min-w-0 flex-col gap-0.5 rounded-md border border-slate/10 p-3">
      <a href={`#enquiry-${r.enquiry_id}`} className={LINK}>
        {t('adm.childFor', { child: r.child_name ?? '', class: r.class_name })}
      </a>
      <span className="break-words">{[r.guardian_name, r.phone].join(' · ')}</span>
      <span className="text-slate/70">{[line, t(`adm.stage.${r.stage}` as MessageKey), t('adm.with', { owner: r.owner })].join(' · ')}</span>
    </li>
  );
}

// One enquiry: what is known, "Record what happened", "Admit", give it to someone, and its steps.
function EnquiryCard({ r, data, busy, send, words }: { r: Row; data: Data; busy: boolean; send: Send; words: Words }) {
  const { t, tCount, lang } = words;
  const fresh = { note: '', stage: r.stage === 'admitted' ? ('enquiry' as StageCode) : r.stage, nextStep: r.next_step ?? '', followUp: r.next_follow_up ?? '', reason: r.closed_reason ?? '' };
  const [o, setO] = useState(fresh);
  const [admitting, setAdmitting] = useState<{ admissionNo: string; dob: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [fix, setFix] = useState({ childName: r.child_name ?? '', guardianName: r.guardian_name ?? '', phone: r.phone ?? '', classId: r.class_id, source: r.source });
  const stageWord = (s: StageCode | null) => t(`adm.stage.${s ?? 'enquiry'}` as MessageKey);
  const when = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const loadSteps = async () => {
    const res = await fetch(`/api/app/admissions/${r.enquiry_id}`).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as { steps: Step[] } | null) : null;
    if (got) setSteps(got.steps);
  };
  const stepWords = (s: Step) =>
    s.kind === 'recorded' ? t('adm.step.recorded', { stage: stageWord(s.stage_to) })
    : s.kind === 'note' ? (s.note === null ? t('adm.step.noteErased') : t('adm.step.note', { note: s.note }))
    : s.kind === 'stage' && s.stage_to === 'not_joining' && s.note !== null ? t('adm.step.notJoining', { reason: s.note })
    : s.kind === 'stage' ? t('adm.step.stage', { from: stageWord(s.stage_from), to: stageWord(s.stage_to) })
    : s.kind === 'follow_up' ? (s.follow_up ? t('adm.step.followUp', { date: dayIn(lang, s.follow_up) }) : t('adm.step.noFollowUp'))
    : s.kind === 'owner' ? t('adm.step.owner', { owner: s.owner ?? '' })
    : s.kind === 'erased' ? t('adm.step.erased')
    : t('adm.step.details', { fields: (s.changed ?? []).map((f) => t(`adm.field.${f}` as MessageKey)).join(', ') });
  const admitted = (a: Admitted) =>
    [
      t('adm.admitted', { child: r.child_name ?? '', class: a.className }),
      a.fees ? t('adm.fees.on', { class: a.className, year: a.fees.academic_year, from: dayIn(lang, a.fees.effective_from) }) : t('adm.fees.none', { class: a.className }),
      a.fees ? t(a.monthRaised ? 'adm.fees.raiseAgain' : 'adm.fees.next', { class: a.className }) : '',
    ].filter(Boolean).join(' ');

  return (
    <li id={`enquiry-${r.enquiry_id}`} data-enquiry={r.enquiry_id} data-stage={r.stage} data-erased={r.erased_on ? '' : undefined} className="flex min-w-0 scroll-mt-4 flex-col gap-2 rounded-md border border-slate/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={r.stage === 'admitted' ? 'success' : r.stage === 'not_joining' ? 'neutral' : 'warning'}>{stageWord(r.stage)}</Badge>
        <span className="font-bold">{r.erased_on ? t('adm.erased.title', { class: r.class_name }) : t('adm.childFor', { child: r.child_name ?? '', class: r.class_name })}</span>
      </div>
      {r.erased_on ? (
        <p className="break-words text-slate/70">{t('adm.erased.how', { date: dayIn(lang, r.erased_on) })}</p>
      ) : (
        <p className="break-words">{[r.guardian_name, r.phone, t(`adm.source.${r.source}` as MessageKey)].join(' · ')}</p>
      )}
      <p className="break-words text-slate/70">{[followUpLine(words, r, data.today), r.next_step, t('adm.with', { owner: r.owner })].filter(Boolean).join(' · ')}</p>
      {r.stage === 'not_joining' && r.closed_reason && <p className="break-words">{t('adm.whyNot', { reason: r.closed_reason })}</p>}
      {r.stage === 'admitted' && r.student_id && (
        <Link href={`/app/students/${r.student_id}`} className={LINK}>
          {t('adm.openStudent')}
        </Link>
      )}

      {r.stage !== 'admitted' && (
        <details data-adm-act className="rounded-md bg-off-white p-2">
          <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold">{t('adm.act.title')}</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Textarea id={`adm-act-note-${r.enquiry_id}`} data-adm-act-note label={t('adm.act.note')} rows={2} maxLength={500} value={o.note} onChange={(e) => setO({ ...o, note: e.target.value })} />
            </div>
            <Select id={`adm-act-stage-${r.enquiry_id}`} data-adm-stage label={t('adm.act.stage')} value={o.stage} onChange={(e) => setO({ ...o, stage: e.target.value as StageCode })}>
              {MOVABLE.map((s) => (
                <option key={s} value={s}>{stageWord(s)}</option>
              ))}
            </Select>
            {o.stage === 'not_joining' ? (
              <Input id={`adm-act-reason-${r.enquiry_id}`} data-adm-reason label={t('adm.act.reason')} maxLength={120} value={o.reason} onChange={(e) => setO({ ...o, reason: e.target.value })} />
            ) : (
              <>
                <Input id={`adm-act-follow-${r.enquiry_id}`} type="date" data-adm-act-follow-up label={t('adm.form.followUp')} min={data.today} value={o.followUp} onChange={(e) => setO({ ...o, followUp: e.target.value })} />
                <div className="sm:col-span-2">
                  <Input id={`adm-act-next-${r.enquiry_id}`} data-adm-act-next-step label={t('adm.form.nextStep')} maxLength={120} value={o.nextStep} onChange={(e) => setO({ ...o, nextStep: e.target.value })} />
                </div>
              </>
            )}
          </div>
          <button type="button" data-adm-save disabled={busy} className={`${PRIMARY} mt-3`} onClick={() => void send(`/api/app/admissions/${r.enquiry_id}`, { action: 'outcome', ...o }, () => t('adm.saved'))}>
            {t('adm.act.save')}
          </button>
        </details>
      )}

      {isOpen(r.stage) && (
        <div className="flex flex-col gap-2">
          {!admitting ? (
            <button type="button" data-adm-admit disabled={busy} className={`${TAP} self-start`} onClick={() => setAdmitting({ admissionNo: '', dob: '' })}>
              {t('adm.admit.open')}
            </button>
          ) : (
            <div data-adm-admit-form className="flex flex-col gap-3 rounded-md border border-slate/10 p-3">
              <p>{t('adm.admit.how', { child: r.child_name ?? '', class: r.class_name })}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input id={`adm-no-${r.enquiry_id}`} label={t('adm.admit.no')} maxLength={40} value={admitting.admissionNo} onChange={(e) => setAdmitting({ ...admitting, admissionNo: e.target.value })} />
                <Input id={`adm-dob-${r.enquiry_id}`} type="date" label={t('adm.admit.dob')} max={data.today} value={admitting.dob} onChange={(e) => setAdmitting({ ...admitting, dob: e.target.value })} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" data-adm-admit-confirm disabled={busy} className={PRIMARY} onClick={() => void send(`/api/app/admissions/${r.enquiry_id}`, { action: 'admit', admissionNo: admitting.admissionNo || null, dob: admitting.dob || null }, (got) => admitted(got as unknown as Admitted))}>
                  {t('adm.admit.confirm', { class: r.class_name })}
                </button>
                <button type="button" className={TAP} onClick={() => setAdmitting(null)}>
                  {t('adm.cancel')}
                </button>
              </div>
            </div>
          )}
          {data.owners.some((p) => p.user_id !== r.owner_id) && (
            <div className="sm:max-w-xs">
              <Select id={`adm-give-${r.enquiry_id}`} data-adm-give label={t('adm.give')} value="" disabled={busy} onChange={(e) => e.target.value && void send(`/api/app/admissions/${r.enquiry_id}`, { action: 'give', ownerId: e.target.value }, () => t('adm.given'))}>
                <option value="">{t('adm.choose')}</option>
                {data.owners.filter((p) => p.user_id !== r.owner_id).map((p) => (
                  <option key={p.user_id} value={p.user_id}>{p.name}</option>
                ))}
              </Select>
            </div>
          )}
        </div>
      )}

      {r.stage !== 'admitted' && (
        <details data-adm-fix>
          <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold">{t('adm.fix.title')}</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Input id={`adm-fix-child-${r.enquiry_id}`} label={t('adm.form.child')} maxLength={60} value={fix.childName} onChange={(e) => setFix({ ...fix, childName: e.target.value })} />
            <Select id={`adm-fix-class-${r.enquiry_id}`} label={t('adm.form.class')} value={fix.classId} onChange={(e) => setFix({ ...fix, classId: e.target.value })}>
              {data.classes.map((c) => (
                <option key={c.class_id} value={c.class_id}>{c.name}</option>
              ))}
            </Select>
            <Input id={`adm-fix-guardian-${r.enquiry_id}`} label={t('adm.form.guardian')} maxLength={60} value={fix.guardianName} onChange={(e) => setFix({ ...fix, guardianName: e.target.value })} />
            <Input id={`adm-fix-phone-${r.enquiry_id}`} type="tel" inputMode="tel" label={t('adm.form.phone')} maxLength={20} value={fix.phone} onChange={(e) => setFix({ ...fix, phone: e.target.value })} />
            <Select id={`adm-fix-source-${r.enquiry_id}`} label={t('adm.form.source')} value={fix.source} onChange={(e) => setFix({ ...fix, source: e.target.value as SourceCode })}>
              {SOURCES.map((s) => (
                <option key={s} value={s}>{t(`adm.source.${s}` as MessageKey)}</option>
              ))}
            </Select>
          </div>
          <button type="button" data-adm-fix-save disabled={busy} className={`${TAP} mt-3`} onClick={() => void send(`/api/app/admissions/${r.enquiry_id}`, { action: 'details', ...fix }, () => t('adm.fixed'))}>
            {t('adm.fix.save')}
          </button>
        </details>
      )}

      {/* Deleted only after the office reads what goes; an admitted enquiry is the child's record and is never deleted. */}
      {r.stage !== 'admitted' &&
        (!deleting ? (
          <button type="button" data-adm-delete disabled={busy} className={`${DANGER} self-start`} onClick={() => setDeleting(true)}>
            {t('adm.delete.open')}
          </button>
        ) : (
          <div data-adm-delete-confirm className="flex flex-col gap-2 rounded-md border border-red-800/30 p-3">
            <p className="break-words">{t('adm.delete.how', { child: r.child_name ?? '' })}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-adm-delete-yes
                disabled={busy}
                className={DANGER}
                onClick={() => void send(`/api/app/admissions/${r.enquiry_id}`, null, (got) => tCount('adm.deleted', Number(got.steps ?? 0)), () => setDeleting(false), 'DELETE')}
              >
                {t('adm.delete.confirm')}
              </button>
              <button type="button" className={TAP} onClick={() => setDeleting(false)}>
                {t('adm.cancel')}
              </button>
            </div>
          </div>
        ))}

      <details data-adm-steps onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) void loadSteps(); }}>
        <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold">{t('adm.steps')}</summary>
        <ul className="flex flex-col gap-1 border-l-2 border-slate/10 pl-3">
          {(steps ?? []).map((s, i) => (
            <li key={i} data-adm-step={s.kind} className="break-words">
              <span className="font-semibold">{stepWords(s)}</span> <span className="text-slate/70">{t('adm.step.by', { by: s.by, at: when.format(new Date(s.at)) })}</span>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

// A parent's erasure request about a family that never joined (C223-A answer 3): the office types the phone the
// enquiries were recorded with, reads which would go (and how many admitted ones stay), and confirms. The phone is
// sent in the body, never in the address; the list confirmed is the list deleted, or nothing is.
function FamilyDelete({ busy, send, words }: { busy: boolean; send: Send; words: Words }) {
  const { t, tCount, lang } = words;
  const [phone, setPhone] = useState('');
  const [found, setFound] = useState<Family | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const find = async () => {
    setFinding(true);
    setProblem(null);
    setFound(null);
    const res = await fetch('/api/app/admissions/family', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'find', phone }) }).catch(() => null);
    const got = res ? ((await res.json().catch(() => null)) as (Family & { code?: string }) | null) : null;
    setFinding(false);
    if (!res?.ok || !got) return setProblem(got?.code === 'phone' ? t('adm.err.phone') : t('adm.err.other'));
    setFound(got);
  };
  return (
    <details data-adm-family className="rounded-lg border border-slate/10 bg-white p-4">
      <summary className="flex min-h-[44px] cursor-pointer items-center text-base font-bold">{t('adm.family.title')}</summary>
      <div className="mt-2 flex flex-col gap-3">
        <p className="text-slate/70">{t('adm.family.how')}</p>
        <div className="flex flex-wrap items-end gap-2">
          <Input id="adm-family-phone" type="tel" inputMode="tel" autoComplete="off" label={t('adm.family.phone')} maxLength={20} value={phone} onChange={(e) => { setPhone(e.target.value); setFound(null); }} className="min-w-0 flex-1" />
          <button type="button" data-adm-family-find disabled={busy || finding || !phone.trim()} className={TAP} onClick={() => void find()}>
            {t('adm.family.find')}
          </button>
        </div>
        {problem && <p role="alert" className="rounded-md border border-red-800/30 px-3 py-2 text-red-800">{problem}</p>}
        {found && (
          <div data-adm-family-found data-count={found.enquiries.length} className="flex flex-col gap-2">
            {found.enquiries.length === 0 ? (
              <p className="rounded-md bg-off-white px-3 py-2">{t('adm.family.none')}</p>
            ) : (
              <>
                <p className="font-semibold">{tCount('adm.family.found', found.enquiries.length)}</p>
                <ul className="flex flex-col gap-1">
                  {found.enquiries.map((e) => (
                    <li key={e.enquiry_id} className="break-words rounded-md border border-slate/10 px-3 py-2">
                      {t('adm.family.row', { child: e.child_name, class: e.class_name, stage: t(`adm.stage.${e.stage}` as MessageKey), date: dayIn(lang, e.created_on) })}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {found.admitted > 0 && <p className="text-slate/70">{tCount('adm.family.admitted', found.admitted)}</p>}
            {found.enquiries.length > 0 && (
              <button
                type="button"
                data-adm-family-delete
                disabled={busy}
                className={`${DANGER} self-start`}
                onClick={() =>
                  void send('/api/app/admissions/family', { action: 'delete', phone, enquiryIds: found.enquiries.map((e) => e.enquiry_id) }, (got) => tCount('adm.family.deleted', Number(got.deleted ?? 0)), () => {
                    setFound(null);
                    setPhone('');
                  })
                }
              >
                {tCount('adm.family.confirm', found.enquiries.length)}
              </button>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
