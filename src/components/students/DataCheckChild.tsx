'use client';

import { useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import type { MessageKey } from '@/lib/i18n';
import type { DataCheckChild as Child, DataCheckRequest } from '@/lib/students/data-check';
import { PRINTED_GENDERS, hasAadhaarNumber, sayDob, type DataCheckField } from '@/lib/students/data-check-rules';
import { indiaDate } from '@/lib/time/india';

// One child of the student data check (C222): the three details side by side with the free tool's finding, typing
// what Aadhaar prints, "Ask the parent" (a draft a person reads, then sends through the send-gate), and the requests
// with the parent's reply, the answer the office attached, and the outcome. Only the office sees the buttons.

export type Action = 'printed' | 'draft' | 'ask' | 'note' | 'correct' | 'close';
export type Post = (url: string, payload: unknown, action: Action) => Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; text: string }>;
type Body = Record<string, unknown>;
type Said = { ok: boolean; text: string } | null;
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const FIELD = 'min-h-[44px] rounded-md border border-slate/20 bg-white px-3 text-sm text-slate';
const tone = (severity: number) => (severity <= 0 ? 'success' : severity < 4 ? 'warning' : 'danger');

export function DataCheckChild({ child, office, busy, post }: { child: Child; office: boolean; busy: boolean; post: Post }) {
  const { t, lang } = useT();
  const [said, setSaid] = useState<Said>(null);
  const [typing, setTyping] = useState<{ name: string; dob: string; gender: string } | null>(null);
  const [asking, setAsking] = useState<{ parentId: string; fields: DataCheckField[]; draft: { text: string | null; hasNumber: boolean } | null } | null>(null);
  const when = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const at = (v: string | null) => (v ? when.format(new Date(v)) : '');
  const show = (field: DataCheckField, v: string | null) => (v === null || v === '' || (field === 'gender' && v === 'not_given') ? t('sdc.value.none') : field === 'dob' ? sayDob(v) ?? v : field === 'gender' ? t(`sdc.gender.${v}` as MessageKey) : v);
  const today = indiaDate();
  const id = child.student_id;
  const open = child.requests.filter((r) => r.outcome === null);
  const askable = child.fields.filter((f) => f.finding !== 'exact' && !open.some((r) => r.field === f.field));

  const run: Run = async (url, payload, action, done, after) => {
    setSaid(null);
    const r = await post(url, payload, action);
    if (!r.ok) return setSaid({ ok: false, text: r.text });
    const words = done(r.body);
    if (words) setSaid({ ok: true, text: words });
    after?.();
  };
  const startTyping = () => setTyping({ name: child.printed?.name ?? '', dob: child.printed?.dob ?? '', gender: child.printed?.gender ?? '' });
  const startAsking = () => {
    const first = child.guardians.find((g) => g.last4) ?? child.guardians[0];
    setAsking({ parentId: first?.parent_id ?? '', fields: askable.map((f) => f.field), draft: null });
  };
  const typedNumber = typing ? hasAadhaarNumber(typing.name) : false;

  return (
    <li data-dc-child={id} data-dc-severity={child.severity} className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-bold">{child.name}</span>
        {child.printed ? (
          <Badge variant={tone(child.severity)}>{t(`sdc.finding.${child.fields.reduce((w, f) => (f.severity > w.severity ? f : w), child.fields[0]).finding}` as MessageKey)}</Badge>
        ) : (
          <Badge>{t('sdc.child.notTyped')}</Badge>
        )}
      </div>
      <p className="text-slate/70">{t('sdc.child.meta', { class: child.class_name ?? t('sdc.child.noClass'), adm: child.admission_no ?? t('sdc.child.noAdm') })}</p>
      {said && <p role="status" data-dc-said className={`rounded-md px-3 py-2 font-semibold ${said.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>{said.text}</p>}

      {child.printed && (
        <dl className="flex flex-col gap-2">
          {child.fields.map((f) => (
            <div key={f.field} data-dc-field={f.field} data-dc-finding={f.finding} className="grid gap-1 rounded-md bg-off-white p-2 sm:grid-cols-[9rem_1fr_1fr_auto] sm:items-center">
              <dt className="font-semibold">{t(`sdc.field.${f.field}` as MessageKey)}</dt>
              <dd><span className="text-slate/70">{t('sdc.col.record')}: </span>{show(f.field, f.school)}</dd>
              <dd><span className="text-slate/70">{t('sdc.col.printed')}: </span>{show(f.field, f.printed)}</dd>
              <dd><Badge variant={tone(f.severity)}>{t(`sdc.finding.${f.finding}` as MessageKey)}</Badge></dd>
            </div>
          ))}
        </dl>
      )}
      {child.printed && <p className="text-xs text-slate/70">{t('sdc.child.typedBy', { name: child.printed.typed_by ?? '', when: at(child.printed.typed_at) })}</p>}

      {office && !typing && !asking && (
        <div className="flex flex-wrap gap-2">
          <button type="button" data-dc-type disabled={busy} className={TAP} onClick={startTyping}>{t(child.printed ? 'sdc.type.change' : 'sdc.type.open')}</button>
          {askable.length > 0 && (
            <button type="button" data-dc-ask disabled={busy} className={PRIMARY} onClick={startAsking}>{t('sdc.ask.open')}</button>
          )}
        </div>
      )}

      {office && typing && (
        <div data-dc-typing className="flex flex-col gap-3 rounded-md border border-slate/10 p-3">
          <Input id={`dc-name-${id}`} label={t('sdc.type.name')} maxLength={120} autoComplete="off" value={typing.name} error={typedNumber ? t('sdc.err.aadhaar_number') : undefined} onChange={(e) => setTyping({ ...typing, name: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input id={`dc-dob-${id}`} type="date" label={t('sdc.type.dob')} max={today} value={typing.dob} onChange={(e) => setTyping({ ...typing, dob: e.target.value })} />
            <div className="flex flex-col gap-1">
              <label htmlFor={`dc-gender-${id}`} className="font-semibold">{t('sdc.type.gender')}</label>
              <select id={`dc-gender-${id}`} className={FIELD} value={typing.gender} onChange={(e) => setTyping({ ...typing, gender: e.target.value })}>
                <option value="">{t('sdc.type.choose')}</option>
                {PRINTED_GENDERS.map((g) => (
                  <option key={g} value={g}>{t(`sdc.gender.${g}` as MessageKey)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-dc-save disabled={busy || typedNumber || (!typing.name.trim() && !typing.dob && !typing.gender)} className={PRIMARY} onClick={() => void run(`/api/app/students/data-check/${id}`, { action: 'printed', ...typing }, 'printed', () => t('sdc.type.saved'), () => setTyping(null))}>
              {t('sdc.type.save')}
            </button>
            <button type="button" disabled={busy} className={TAP} onClick={() => setTyping(null)}>{t('sdc.type.cancel')}</button>
          </div>
        </div>
      )}

      {office && asking && (
        <div data-dc-asking className="flex flex-col gap-3 rounded-md border border-slate/10 p-3">
          <p className="font-bold">{t('sdc.ask.title')}</p>
          {child.guardians.length === 0 ? (
            <p>{t('sdc.ask.noGuardian')}</p>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor={`dc-guardian-${id}`} className="font-semibold">{t('sdc.ask.guardian')}</label>
                <select id={`dc-guardian-${id}`} className={FIELD} value={asking.parentId} onChange={(e) => setAsking({ ...asking, parentId: e.target.value, draft: null })}>
                  {child.guardians.map((g) => (
                    <option key={g.parent_id} value={g.parent_id}>{g.last4 ? t('sdc.ask.withNumber', { name: g.name, last4: g.last4 }) : t('sdc.ask.noNumber', { name: g.name })}</option>
                  ))}
                </select>
              </div>
              <fieldset className="flex flex-col gap-1">
                <legend className="font-semibold">{t('sdc.ask.fields')}</legend>
                {askable.map((f) => (
                  <label key={f.field} className="flex min-h-[44px] items-center gap-2">
                    <input type="checkbox" data-dc-ask-field={f.field} className="h-5 w-5" checked={asking.fields.includes(f.field)} onChange={(e) => setAsking({ ...asking, draft: null, fields: e.target.checked ? [...asking.fields, f.field] : asking.fields.filter((x) => x !== f.field) })} />
                    <span>{t(`sdc.field.${f.field}` as MessageKey)} · {t(`sdc.finding.${f.finding}` as MessageKey)}</span>
                  </label>
                ))}
              </fieldset>
              {asking.draft && (
                <div data-dc-draft className="flex flex-col gap-2 rounded-md bg-off-white p-3">
                  {asking.draft.text !== null ? (
                    <>
                      <p className="font-semibold">{t('sdc.ask.words')}</p>
                      <p data-dc-words className="whitespace-pre-wrap break-words">{asking.draft.text}</p>
                    </>
                  ) : (
                    <p>{t('sdc.ask.noWords')}</p>
                  )}
                  {!asking.draft.hasNumber && <p className="font-semibold">{t('sdc.ask.noNumberNote')}</p>}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {!asking.draft ? (
                  <button type="button" data-dc-draft-button disabled={busy || !asking.parentId || asking.fields.length === 0} className={PRIMARY} onClick={() => void run(`/api/app/students/data-check/${id}`, { action: 'draft', parentId: asking.parentId, fields: asking.fields }, 'draft', (b) => (setAsking({ ...asking, draft: { text: typeof b.text === 'string' ? b.text : null, hasNumber: b.hasNumber === true } }), null))}>
                    {t('sdc.ask.draft')}
                  </button>
                ) : (
                  <button type="button" data-dc-send disabled={busy} className={PRIMARY} onClick={() => void run(`/api/app/students/data-check/${id}`, { action: 'ask', parentId: asking.parentId, fields: asking.fields }, 'ask', (b) => t(b.message === 'queued' ? 'sdc.ask.sent.queued' : b.message === 'no_number' ? 'sdc.ask.sent.no_number' : 'sdc.ask.sent.held'), () => setAsking(null))}>
                    {t(asking.draft.hasNumber ? 'sdc.ask.send' : 'sdc.ask.keep')}
                  </button>
                )}
              </div>
            </>
          )}
          <button type="button" disabled={busy} className={`${TAP} self-start`} onClick={() => setAsking(null)}>{t('sdc.type.cancel')}</button>
        </div>
      )}

      {child.requests.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="font-bold">{t('sdc.req.title')}</h3>
          <ul className="flex flex-col gap-2">
            {child.requests.map((r) => (
              <Request key={r.request_id} r={r} office={office} busy={busy} show={show} at={at} today={today} run={run} />
            ))}
          </ul>
        </section>
      )}
    </li>
  );
}

type Run = (url: string, payload: unknown, action: Action, done: (body: Body) => string | null, after?: () => void) => Promise<void>;

function Request({ r, office, busy, show, at, today, run }: { r: DataCheckRequest; office: boolean; busy: boolean; show: (f: DataCheckField, v: string | null) => string; at: (v: string | null) => string; today: string; run: Run }) {
  const { t } = useT();
  const [note, setNote] = useState('');
  const [value, setValue] = useState(r.printed_value ?? '');
  const [why, setWhy] = useState('');
  const url = `/api/app/students/data-check/requests/${r.request_id}`;
  const answered = r.reply_at !== null || r.office_note !== null;
  const state = r.outcome ?? (answered ? 'answered' : 'open');
  const status = r.message_status;
  const message = !r.has_message ? t('sdc.req.noMessage') : status === null ? null : status.startsWith('blocked_') ? t(`msg.held.${status}` as MessageKey) : t('sdc.req.message', { state: t(`msg.state.${status}` as MessageKey) });
  const f = r.field;
  return (
    <li data-dc-request={state} data-dc-request-field={f} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={state === 'corrected' ? 'success' : state === 'answered' ? 'warning' : 'neutral'}>{t(`sdc.req.status.${state}` as MessageKey)}</Badge>
        <span className="font-semibold">{t('sdc.req.asked', { field: t(`sdc.field.${f}` as MessageKey), guardian: r.guardian ?? '', when: at(r.asked_at), by: r.asked_by ?? '' })}</span>
      </div>
      <p>{t('sdc.req.values', { school: show(f, r.school_value), printed: show(f, r.printed_value), finding: t(`sdc.finding.${r.finding}` as MessageKey) })}</p>
      {message && <p data-dc-message={status ?? 'none'} className="text-slate/70">{message}</p>}
      {r.reply_text !== null ? (
        <div data-dc-reply className="rounded-md bg-off-white p-2">
          <p className="font-semibold">{t('sdc.req.reply', { when: at(r.reply_at) })}</p>
          <p className="whitespace-pre-wrap break-words">{r.reply_text}</p>
        </div>
      ) : (
        r.outcome === null && r.has_message && <p className="text-slate/70">{t('sdc.req.noReply')}</p>
      )}
      {r.office_note !== null && (
        <div data-dc-note className="rounded-md bg-off-white p-2">
          <p className="font-semibold">{t('sdc.req.note', { by: r.office_note_by ?? '', when: at(r.office_note_at) })}</p>
          <p className="whitespace-pre-wrap break-words">{r.office_note}</p>
        </div>
      )}
      {r.outcome === 'corrected' && <p data-dc-outcome="corrected" className="font-semibold">{t('sdc.req.corrected', { value: show(f, r.corrected_to), by: r.decided_by ?? '', when: at(r.decided_at) })}</p>}
      {r.outcome === 'closed' && <p data-dc-outcome="closed" className="font-semibold">{t('sdc.req.closed', { by: r.decided_by ?? '', when: at(r.decided_at), note: r.closing_note ?? '' })}</p>}
      {office && r.outcome === null && (
        <div className="flex flex-col gap-3">
          {r.office_note === null && (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <Input id={`dc-note-${r.request_id}`} label={t('sdc.req.noteLabel')} maxLength={600} autoComplete="off" value={note} error={hasAadhaarNumber(note) ? t('sdc.err.aadhaar_number') : undefined} onChange={(e) => setNote(e.target.value)} />
              <button type="button" data-dc-attach disabled={busy || !note.trim() || hasAadhaarNumber(note)} className={TAP} onClick={() => void run(url, { action: 'note', text: note }, 'note', () => t('sdc.done.noted'), () => setNote(''))}>
                {t('sdc.req.attach')}
              </button>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            {f === 'gender' ? (
              <div className="flex flex-col gap-1">
                <label htmlFor={`dc-value-${r.request_id}`} className="font-semibold">{t('sdc.req.correctLabel')}</label>
                <select id={`dc-value-${r.request_id}`} className={FIELD} value={value} onChange={(e) => setValue(e.target.value)}>
                  <option value="">{t('sdc.type.choose')}</option>
                  {PRINTED_GENDERS.map((g) => (
                    <option key={g} value={g}>{t(`sdc.gender.${g}` as MessageKey)}</option>
                  ))}
                </select>
              </div>
            ) : (
              <Input id={`dc-value-${r.request_id}`} type={f === 'dob' ? 'date' : 'text'} max={f === 'dob' ? today : undefined} maxLength={f === 'name' ? 120 : undefined} autoComplete="off" label={t('sdc.req.correctLabel')} value={value} error={hasAadhaarNumber(value) ? t('sdc.err.aadhaar_number') : undefined} onChange={(e) => setValue(e.target.value)} />
            )}
            <button type="button" data-dc-correct disabled={busy || !value.trim() || hasAadhaarNumber(value)} className={PRIMARY} onClick={() => void run(url, { action: 'correct', value }, 'correct', () => t('sdc.done.corrected'))}>
              {t('sdc.req.correct')}
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <Input id={`dc-why-${r.request_id}`} label={t('sdc.req.closeLabel')} maxLength={300} autoComplete="off" value={why} error={hasAadhaarNumber(why) ? t('sdc.err.aadhaar_number') : undefined} onChange={(e) => setWhy(e.target.value)} />
            <button type="button" data-dc-close disabled={busy || !why.trim() || hasAadhaarNumber(why)} className={TAP} onClick={() => void run(url, { action: 'close', text: why }, 'close', () => t('sdc.done.closed'), () => setWhy(''))}>
              {t('sdc.req.close')}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
