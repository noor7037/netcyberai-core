'use client';

import { useEffect, useId, useRef, useState, type Ref } from 'react';
import { Icon } from '@/components/visual/Icons';
import { CLOSED_STAGES, ENQUIRY_MAX, SOURCES, STAGES, followUpDraft, formatDate, isOpen, phoneProblem, type Enquiry, type Outcome, type Source, type Stage } from '@/lib/free-tools/admissions-tracker';
import { whatsappDraftLink } from '@/lib/free-tools/whatsapp-draft';
import { btn, btnQuiet, btnSolid } from './ReportActions';

export const inputCls =
  'min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-base text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire';
const areaCls =
  'w-full rounded-md border border-slate/20 bg-white px-3 py-2 text-base text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire';
const labelCls = 'text-sm font-medium text-slate';
const btnRemove = `${btn} border border-slate/20 bg-white text-red-800 hover:bg-off-white`;

const STAGE_BADGE: Record<Stage, string> = {
  Enquiry: 'bg-royal/10 text-royal-deep',
  'Visit booked': 'bg-royal/10 text-royal-deep',
  Visited: 'bg-royal/10 text-royal-deep',
  'Form taken': 'bg-royal/10 text-royal-deep',
  'Form submitted': 'bg-royal/10 text-royal-deep',
  Admitted: 'bg-turquoise/15 text-emerald-text',
  'Not joining': 'bg-off-white text-slate',
};
const HINT_TONE = { bad: 'text-red-800', warn: 'text-amber-text' } as const;

export interface CardHint {
  text: string;
  tone: keyof typeof HINT_TONE;
}

// One enquiry: a summary, then one panel at a time to record what
// happened, write the WhatsApp follow-up or edit the details. Nothing is
// sent: the WhatsApp link opens the school's own app with the draft.
export function AdmissionsTrackerCard({
  e,
  school,
  hint,
  draft,
  onDraft,
  onRecord,
  editing,
  onEditing,
  onChange,
  onRemove,
}: {
  e: Enquiry;
  school: string;
  hint?: CardHint;
  draft: string | undefined;
  onDraft: (text: string | null) => void;
  onRecord: (o: Outcome) => void;
  // Edit and remove are offered in the full list only.
  editing?: boolean;
  onEditing?: (open: boolean) => void;
  onChange?: (patch: Partial<Enquiry>) => void;
  onRemove?: () => void;
}) {
  const id = useId();
  const [panel, setPanel] = useState<'record' | 'whatsapp' | null>(null);
  const who = e.parentName.trim() || 'New enquiry';
  const child = [e.childName.trim(), e.classWanted.trim()].filter(Boolean).join(', ');
  const toggle = (p: 'record' | 'whatsapp') => {
    setPanel((cur) => (cur === p ? null : p));
    onEditing?.(false);
  };

  return (
    <li className="rounded-2xl border border-slate/10 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-bold text-slate">{who}</p>
          {child && <p className="break-words text-sm text-slate">{child}</p>}
          <p className="text-xs text-slate/70">
            {e.source}
            {e.added && ` · Added ${formatDate(e.added)}`}
            {e.updated && ` · Updated ${formatDate(e.updated)}`}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STAGE_BADGE[e.stage]}`}>{e.stage}</span>
      </div>
      {hint && <p className={`mt-2 text-sm font-semibold ${HINT_TONE[hint.tone]}`}>{hint.text}</p>}
      {isOpen(e) && (e.nextStep || e.followUp) && (
        <p className="mt-2 break-words text-sm text-slate">
          <span className="font-semibold">Next step:</span> {e.nextStep || '—'}
          {e.followUp && ` · ${formatDate(e.followUp)}`}
        </p>
      )}
      {e.stage === 'Not joining' && e.notJoiningReason && (
        <p className="mt-2 break-words text-sm text-slate">
          <span className="font-semibold">Reason:</span> {e.notJoiningReason}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={btnQuiet} aria-expanded={panel === 'record'} aria-controls={`${id}-record`} onClick={() => toggle('record')}>
          <Icon name="check" className="h-4 w-4" /> Record what happened
        </button>
        {e.stage !== 'Not joining' && (
          <button type="button" className={btnQuiet} aria-expanded={panel === 'whatsapp'} aria-controls={`${id}-wa`} onClick={() => toggle('whatsapp')}>
            <Icon name="chat" className="h-4 w-4" /> WhatsApp message
          </button>
        )}
        {onEditing && (
          <button
            type="button"
            className={btnQuiet}
            aria-expanded={Boolean(editing)}
            aria-controls={`${id}-edit`}
            onClick={() => {
              setPanel(null);
              onEditing(!editing);
            }}
          >
            {editing ? 'Close details' : 'Edit details'}
          </button>
        )}
        {onRemove && (
          <button type="button" className={btnRemove} onClick={onRemove}>
            Remove<span className="sr-only"> {who}</span>
          </button>
        )}
      </div>
      {panel === 'record' && (
        <RecordPanel
          id={`${id}-record`}
          e={e}
          onCancel={() => setPanel(null)}
          onSave={(o) => {
            setPanel(null);
            onRecord(o);
          }}
        />
      )}
      {panel === 'whatsapp' && <WhatsAppPanel id={`${id}-wa`} e={e} school={school} draft={draft} onDraft={onDraft} />}
      {editing && onChange && <EditPanel id={`${id}-edit`} e={e} onChange={onChange} onDone={() => onEditing?.(false)} />}
    </li>
  );
}

function RecordPanel({ id, e, onSave, onCancel }: { id: string; e: Enquiry; onSave: (o: Outcome) => void; onCancel: () => void }) {
  const [note, setNote] = useState('');
  const [stage, setStage] = useState<Stage>(e.stage);
  const [nextStep, setNextStep] = useState(e.nextStep);
  const [followUp, setFollowUp] = useState('');
  const [reason, setReason] = useState(e.notJoiningReason);
  const [error, setError] = useState('');
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => noteRef.current?.focus(), []);
  const closed = CLOSED_STAGES.includes(stage);

  return (
    <form
      id={id}
      className="mt-4 grid grid-cols-1 gap-3 rounded-xl bg-off-white p-4 sm:grid-cols-2"
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        if (!note.trim()) return setError('Write what happened first, for example “Called, visiting on Saturday”.');
        onSave({ note, stage, nextStep, followUp, reason });
      }}
    >
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label htmlFor={`${id}-note`} className={labelCls}>
          What happened
        </label>
        <textarea
          id={`${id}-note`}
          ref={noteRef}
          rows={2}
          maxLength={300}
          className={areaCls}
          value={note}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(ev) => (setNote(ev.target.value), setError(''))}
        />
        {error && (
          <p id={`${id}-err`} className="text-sm font-semibold text-red-800">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-stage`} className={labelCls}>
          Stage now
        </label>
        <select id={`${id}-stage`} className={inputCls} value={stage} onChange={(ev) => setStage(ev.target.value as Stage)}>
          {STAGES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      {stage === 'Not joining' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-reason`} className={labelCls}>
            Reason for not joining
          </label>
          <input id={`${id}-reason`} className={inputCls} maxLength={ENQUIRY_MAX.notJoiningReason} value={reason} onChange={(ev) => setReason(ev.target.value)} />
        </div>
      )}
      {!closed && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-next`} className={labelCls}>
              Next step
            </label>
            <input id={`${id}-next`} className={inputCls} maxLength={ENQUIRY_MAX.nextStep} value={nextStep} onChange={(ev) => setNextStep(ev.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-date`} className={labelCls}>
              Next follow-up date
            </label>
            <input id={`${id}-date`} type="date" className={inputCls} value={followUp} onChange={(ev) => setFollowUp(ev.target.value)} />
          </div>
          {!followUp && <p className="text-sm text-amber-text sm:col-span-2">Set a follow-up date so this family comes back on today’s list.</p>}
        </>
      )}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" className={btnSolid}>
          Save
        </button>
        <button type="button" className={btnQuiet} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function WhatsAppPanel({ id, e, school, draft, onDraft }: { id: string; e: Enquiry; school: string; draft: string | undefined; onDraft: (text: string | null) => void }) {
  const text = draft ?? followUpDraft(e, school);
  const problem = phoneProblem(e.phone);
  const link = problem ? null : whatsappDraftLink(e.phone, text);
  return (
    <div id={id} className="mt-4 flex flex-col gap-2 rounded-xl bg-off-white p-4">
      <label htmlFor={`${id}-msg`} className={labelCls}>
        Message to {e.parentName.trim() || 'the family'} (edit before sending)
      </label>
      <textarea id={`${id}-msg`} rows={5} maxLength={1000} className={areaCls} value={text} onChange={(ev) => onDraft(ev.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        {link ? (
          <a className={btnSolid} href={link} target="_blank" rel="noopener noreferrer">
            <Icon name="chat" className="h-4 w-4" /> Open in WhatsApp
          </a>
        ) : (
          <p className="text-sm font-semibold text-amber-text">{problem}</p>
        )}
        {draft !== undefined && (
          <button type="button" className={btnQuiet} onClick={() => onDraft(null)}>
            Use the standard message
          </button>
        )}
      </div>
      <p className="text-xs text-slate/70">WhatsApp opens on this phone or computer with the message ready. Nothing is sent until you press send there.</p>
    </div>
  );
}

function EditPanel({ id, e, onChange, onDone }: { id: string; e: Enquiry; onChange: (patch: Partial<Enquiry>) => void; onDone: () => void }) {
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => firstRef.current?.focus(), []);
  const phoneNote = e.phone.trim() ? phoneProblem(e.phone) : null;
  const text = (key: 'parentName' | 'childName' | 'classWanted' | 'nextStep' | 'notJoiningReason', label: string, ref?: Ref<HTMLInputElement>) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-${key}`} className={labelCls}>
        {label}
      </label>
      <input id={`${id}-${key}`} ref={ref} className={inputCls} maxLength={ENQUIRY_MAX[key]} autoComplete="off" value={e[key]} onChange={(ev) => onChange({ [key]: ev.target.value } as Partial<Enquiry>)} />
    </div>
  );
  return (
    <div id={id} className="mt-4 grid grid-cols-1 gap-3 rounded-xl bg-off-white p-4 sm:grid-cols-2">
      {text('parentName', 'Parent’s name', firstRef)}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-phone`} className={labelCls}>
          Phone
        </label>
        <input
          id={`${id}-phone`}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          className={inputCls}
          maxLength={ENQUIRY_MAX.phone}
          value={e.phone}
          aria-describedby={phoneNote ? `${id}-phone-note` : undefined}
          onChange={(ev) => onChange({ phone: ev.target.value })}
        />
        {phoneNote && (
          <p id={`${id}-phone-note`} className="text-xs font-semibold text-amber-text">
            {phoneNote}
          </p>
        )}
      </div>
      {text('childName', 'Child’s name')}
      {text('classWanted', 'Class wanted')}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-source`} className={labelCls}>
          Source
        </label>
        <select id={`${id}-source`} className={inputCls} value={e.source} onChange={(ev) => onChange({ source: ev.target.value as Source })}>
          {SOURCES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-stage`} className={labelCls}>
          Stage
        </label>
        <select id={`${id}-stage`} className={inputCls} value={e.stage} onChange={(ev) => onChange({ stage: ev.target.value as Stage })}>
          {STAGES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      {e.stage === 'Not joining' && text('notJoiningReason', 'Reason for not joining')}
      {text('nextStep', 'Next step')}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-follow`} className={labelCls}>
          Follow-up date
        </label>
        <input id={`${id}-follow`} type="date" className={inputCls} value={e.followUp} onChange={(ev) => onChange({ followUp: ev.target.value })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-added`} className={labelCls}>
          Date added
        </label>
        <input id={`${id}-added`} type="date" className={inputCls} value={e.added} onChange={(ev) => onChange({ added: ev.target.value })} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label htmlFor={`${id}-notes`} className={labelCls}>
          Notes
        </label>
        <textarea id={`${id}-notes`} rows={3} maxLength={ENQUIRY_MAX.notes} className={areaCls} value={e.notes} onChange={(ev) => onChange({ notes: ev.target.value })} />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="button" className={btnSolid} onClick={onDone}>
          Done
        </button>
        <p className="text-sm text-slate/70">Changes are kept as you type. Last updated {formatDate(e.updated) || 'today'}.</p>
      </div>
    </div>
  );
}
