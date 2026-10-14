'use client';

import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { Icon } from '@/components/visual/Icons';
import { formatDate, phoneProblem } from '@/lib/free-tools/admissions-tracker';
import { PROMISE_MAX, STATUS_LABEL, amount, reminderDraft, reminderLink, type FeePromise, type PromiseStatus, type PromiseView } from '@/lib/free-tools/fee-promise';
import { money } from '@/lib/free-tools/report';
import { btn, btnQuiet, btnSolid } from './ReportActions';

export const inputCls =
  'min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-base text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire';
const areaCls =
  'w-full rounded-md border border-slate/20 bg-white px-3 py-2 text-base text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire';
const labelCls = 'text-sm font-medium text-slate';
const btnRemove = `${btn} border border-slate/20 bg-white text-red-800 hover:bg-off-white`;

const STATUS_BADGE: Record<PromiseStatus, string> = {
  kept: 'bg-turquoise/15 text-emerald-text',
  'paid-late': 'bg-off-white text-slate',
  'partly-kept': 'bg-amber/10 text-amber-text',
  broken: 'bg-off-white text-red-800',
  'due-today': 'bg-amber/10 text-amber-text',
  upcoming: 'bg-royal/10 text-royal-deep',
  incomplete: 'bg-off-white text-slate',
  'needs-help': 'bg-royal/10 text-royal-deep',
};

type Panel = 'payment' | 'date' | 'help' | 'whatsapp';

// One promise: a summary, then one panel at a time to record a payment, a
// new date or a request for help, or to write the WhatsApp reminder. A
// family that asked for help never gets the reminder panel.
export function FeePromiseCard({
  v,
  today,
  school,
  draft,
  onDraft,
  onPayment,
  onNewDate,
  onHelp,
  editing,
  onEditing,
  onChange,
  onRemove,
}: {
  v: PromiseView;
  today: string;
  school: string;
  draft: string | undefined;
  onDraft: (text: string | null) => void;
  onPayment: (paid: number, on: string) => void;
  onNewDate: (on: string, toPay: number | null) => void;
  onHelp: (staff: string, note: string) => void;
  // Edit and remove are offered in the full list only.
  editing?: boolean;
  onEditing?: (open: boolean) => void;
  onChange?: (patch: Partial<FeePromise>) => void;
  onRemove?: () => void;
}) {
  const id = useId();
  const [panel, setPanel] = useState<Panel | null>(null);
  const { p } = v;
  const who = p.student.trim() || 'New promise';
  const template = reminderDraft(v, school);
  const toggle = (next: Panel) => {
    setPanel((cur) => (cur === next ? null : next));
    onEditing?.(false);
  };
  const close = () => setPanel(null);
  const panelButton = (key: Panel, label: string) => (
    <button type="button" className={btnQuiet} aria-expanded={panel === key} aria-controls={`${id}-${key}`} onClick={() => toggle(key)}>
      {label}
    </button>
  );

  return (
    <li className="rounded-2xl border border-slate/10 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-bold text-slate">
            {who}
            {p.className.trim() && <span className="font-normal text-slate/70"> · {p.className.trim()}</span>}
          </p>
          {p.owner.trim() && !p.needsHelp && <p className="text-xs text-slate/70">Follow-up by {p.owner.trim()}</p>}
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE[v.status]}`}>{STATUS_LABEL[v.status]}</span>
      </div>
      {p.needsHelp ? (
        <div className="mt-2 flex flex-col gap-1 text-sm text-slate">
          <p>
            <span className="font-semibold">Speaking to the family:</span> {p.helpStaff.trim() || <span className="font-semibold text-amber-text">no one named yet</span>}
          </p>
          {p.helpNote.trim() && <p className="break-words">{p.helpNote}</p>}
          {Number.isFinite(amount(p.amountDue)) && <p className="text-slate/70">Amount due {money(amount(p.amountDue))}. No reminder is ever sent to this family.</p>}
        </div>
      ) : (
        v.promised > 0 && (
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-slate/70">Promised</dt>
              <dd className="font-semibold text-slate">{money(v.promised)}</dd>
            </div>
            <div>
              <dt className="text-slate/70">By</dt>
              <dd className="font-semibold text-slate">{formatDate(p.promisedDate) || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate/70">Received</dt>
              <dd className="font-semibold text-slate">{money(v.received)}</dd>
            </div>
            <div>
              <dt className="text-slate/70">Balance</dt>
              <dd className="font-semibold text-slate">{money(v.balance)}</dd>
            </div>
          </dl>
        )
      )}
      {v.missing.length > 0 && <p className="mt-2 text-sm font-semibold text-amber-text">Add the {v.missing.join(' and the ')}.</p>}
      {v.status === 'broken' || v.status === 'partly-kept' ? <p className="mt-2 text-sm font-semibold text-red-800">{`The promised date passed ${v.daysPast} ${v.daysPast === 1 ? 'day' : 'days'} ago.`}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {panelButton('payment', 'Record a payment')}
        {!p.needsHelp && panelButton('date', 'New promised date')}
        {!p.needsHelp && panelButton('help', 'Family asked for help')}
        {template !== null && (
          <button type="button" className={btnQuiet} aria-expanded={panel === 'whatsapp'} aria-controls={`${id}-whatsapp`} onClick={() => toggle('whatsapp')}>
            <Icon name="chat" className="h-4 w-4" /> WhatsApp reminder
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

      {panel === 'payment' && <PaymentPanel id={`${id}-payment`} today={today} balance={v.balance} onCancel={close} onSave={(paid, on) => (close(), onPayment(paid, on))} />}
      {panel === 'date' && <DatePanel id={`${id}-date`} today={today} balance={v.balance} onCancel={close} onSave={(on, toPay) => (close(), onNewDate(on, toPay))} />}
      {panel === 'help' && <HelpPanel id={`${id}-help`} onCancel={close} onSave={(staff, note) => (close(), onHelp(staff, note))} />}
      {panel === 'whatsapp' && template !== null && <WhatsAppPanel id={`${id}-whatsapp`} p={p} text={draft ?? template} edited={draft !== undefined} onDraft={onDraft} />}
      {editing && onChange && <EditPanel id={`${id}-edit`} p={p} onChange={onChange} onDone={() => onEditing?.(false)} />}
    </li>
  );
}

function useFocusFirst<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => ref.current?.focus(), []);
  return ref;
}

function Field({ id, label, help, children }: { id: string; label: string; help?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      {children}
      {help && (
        <p id={`${id}-help`} className="text-xs text-slate/70">
          {help}
        </p>
      )}
    </div>
  );
}

function PanelForm({ id, error, onSubmit, onCancel, children }: { id: string; error: string; onSubmit: () => void; onCancel: () => void; children: ReactNode }) {
  return (
    <form id={id} className="mt-4 grid grid-cols-1 gap-3 rounded-xl bg-off-white p-4 sm:grid-cols-2" noValidate onSubmit={(ev) => (ev.preventDefault(), onSubmit())}>
      {children}
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800 sm:col-span-2">
          {error}
        </p>
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

function PaymentPanel({ id, today, balance, onSave, onCancel }: { id: string; today: string; balance: number; onSave: (paid: number, on: string) => void; onCancel: () => void }) {
  const [paid, setPaid] = useState(balance > 0 ? String(balance) : '');
  const [on, setOn] = useState(today);
  const [error, setError] = useState('');
  const ref = useFocusFirst<HTMLInputElement>();
  return (
    <PanelForm
      id={id}
      error={error}
      onCancel={onCancel}
      onSubmit={() => {
        const n = amount(paid);
        if (!(n > 0)) return setError('Enter the amount received, in rupees.');
        if (!on) return setError('Enter the date it was received.');
        onSave(n, on);
      }}
    >
      <Field id={`${id}-amt`} label="Amount received (₹)">
        <input id={`${id}-amt`} ref={ref} inputMode="decimal" className={inputCls} maxLength={PROMISE_MAX.amount} value={paid} onChange={(ev) => (setPaid(ev.target.value), setError(''))} />
      </Field>
      <Field id={`${id}-on`} label="Date received">
        <input id={`${id}-on`} type="date" className={inputCls} value={on} onChange={(ev) => (setOn(ev.target.value), setError(''))} />
      </Field>
    </PanelForm>
  );
}

function DatePanel({ id, today, balance, onSave, onCancel }: { id: string; today: string; balance: number; onSave: (on: string, toPay: number | null) => void; onCancel: () => void }) {
  const [on, setOn] = useState('');
  const [toPay, setToPay] = useState('');
  const [error, setError] = useState('');
  const ref = useFocusFirst<HTMLInputElement>();
  return (
    <PanelForm
      id={id}
      error={error}
      onCancel={onCancel}
      onSubmit={() => {
        if (!on) return setError('Choose the new date the family has promised.');
        const n = toPay.trim() ? amount(toPay) : null;
        if (n !== null && !(n > 0)) return setError('Enter the amount as a number, or leave it blank for the balance.');
        onSave(on, n);
      }}
    >
      <Field id={`${id}-on`} label="New promised date">
        <input id={`${id}-on`} ref={ref} type="date" min={today || undefined} className={inputCls} value={on} onChange={(ev) => (setOn(ev.target.value), setError(''))} />
      </Field>
      <Field id={`${id}-amt`} label="Amount to be paid by then (₹)" help={balance > 0 ? `Leave blank for the balance, ${money(balance)}.` : undefined}>
        <input id={`${id}-amt`} inputMode="decimal" className={inputCls} maxLength={PROMISE_MAX.amount} value={toPay} aria-describedby={balance > 0 ? `${id}-amt-help` : undefined} onChange={(ev) => (setToPay(ev.target.value), setError(''))} />
      </Field>
    </PanelForm>
  );
}

function HelpPanel({ id, onSave, onCancel }: { id: string; onSave: (staff: string, note: string) => void; onCancel: () => void }) {
  const [staff, setStaff] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const ref = useFocusFirst<HTMLInputElement>();
  return (
    <PanelForm
      id={id}
      error={error}
      onCancel={onCancel}
      onSubmit={() => {
        if (!staff.trim()) return setError('Name the staff member who will speak to the family.');
        onSave(staff, note);
      }}
    >
      <p className="text-sm text-slate sm:col-span-2">The family moves to the help list, is kept off every reminder, and a named person decides on more time, instalments or a concession under your school’s policy.</p>
      <Field id={`${id}-staff`} label="Staff member who will speak to the family">
        <input id={`${id}-staff`} ref={ref} className={inputCls} maxLength={PROMISE_MAX.helpStaff} value={staff} onChange={(ev) => (setStaff(ev.target.value), setError(''))} />
      </Field>
      <Field id={`${id}-note`} label="Note (optional)">
        <input id={`${id}-note`} className={inputCls} maxLength={PROMISE_MAX.helpNote} value={note} onChange={(ev) => setNote(ev.target.value)} />
      </Field>
    </PanelForm>
  );
}

function WhatsAppPanel({ id, p, text, edited, onDraft }: { id: string; p: FeePromise; text: string; edited: boolean; onDraft: (text: string | null) => void }) {
  const problem = phoneProblem(p.phone);
  const link = problem ? null : reminderLink(p, text);
  return (
    <div id={id} className="mt-4 flex flex-col gap-2 rounded-xl bg-off-white p-4">
      <label htmlFor={`${id}-msg`} className={labelCls}>
        Reminder to the family of {p.student.trim() || 'this student'} (edit before sending)
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
        {edited && (
          <button type="button" className={btnQuiet} onClick={() => onDraft(null)}>
            Use the standard message
          </button>
        )}
      </div>
      <p className="text-xs text-slate/70">WhatsApp opens on this phone or computer with the message ready. Nothing is sent until you press send there. Keep it polite and private: never in a group.</p>
    </div>
  );
}

function EditPanel({ id, p, onChange, onDone }: { id: string; p: FeePromise; onChange: (patch: Partial<FeePromise>) => void; onDone: () => void }) {
  const ref = useFocusFirst<HTMLInputElement>();
  const phoneNote = p.phone.trim() ? phoneProblem(p.phone) : null;
  type TextKey = 'student' | 'className' | 'owner' | 'amountDue' | 'amountPromised' | 'amountReceived' | 'helpStaff' | 'helpNote';
  const max: Record<TextKey, number> = { student: PROMISE_MAX.student, className: PROMISE_MAX.className, owner: PROMISE_MAX.owner, amountDue: PROMISE_MAX.amount, amountPromised: PROMISE_MAX.amount, amountReceived: PROMISE_MAX.amount, helpStaff: PROMISE_MAX.helpStaff, helpNote: PROMISE_MAX.helpNote };
  const text = (key: TextKey, label: string, opts: { help?: string; money?: boolean; ref?: Ref<HTMLInputElement> } = {}) => (
    <Field id={`${id}-${key}`} label={label} help={opts.help}>
      <input
        id={`${id}-${key}`}
        ref={opts.ref}
        className={inputCls}
        maxLength={max[key]}
        autoComplete="off"
        inputMode={opts.money ? 'decimal' : undefined}
        value={p[key]}
        aria-describedby={opts.help ? `${id}-${key}-help` : undefined}
        onChange={(ev) => onChange({ [key]: ev.target.value } as Partial<FeePromise>)}
      />
    </Field>
  );
  const date = (key: 'promisedDate' | 'receivedDate', label: string) => (
    <Field id={`${id}-${key}`} label={label}>
      <input id={`${id}-${key}`} type="date" className={inputCls} value={p[key]} onChange={(ev) => onChange({ [key]: ev.target.value } as Partial<FeePromise>)} />
    </Field>
  );
  return (
    <div id={id} className="mt-4 grid grid-cols-1 gap-3 rounded-xl bg-off-white p-4 sm:grid-cols-2">
      {text('student', 'Student', { ref })}
      {text('className', 'Class')}
      <Field id={`${id}-phone`} label="Parent’s phone">
        <input
          id={`${id}-phone`}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          className={inputCls}
          maxLength={PROMISE_MAX.phone}
          value={p.phone}
          aria-describedby={phoneNote ? `${id}-phone-note` : undefined}
          onChange={(ev) => onChange({ phone: ev.target.value })}
        />
        {phoneNote && (
          <p id={`${id}-phone-note`} className="text-xs font-semibold text-amber-text">
            {phoneNote}
          </p>
        )}
      </Field>
      {text('owner', 'Follow-up by')}
      {text('amountDue', 'Amount due (₹)', { money: true })}
      {text('amountPromised', 'Amount promised (₹)', { money: true, help: 'Leave blank if the family promised the whole amount due.' })}
      {date('promisedDate', 'Promised date')}
      {text('amountReceived', 'Amount received so far (₹)', { money: true })}
      {date('receivedDate', 'Date received')}
      <div className="flex flex-col justify-end sm:col-span-2">
        <label className="flex min-h-[44px] items-center gap-3 text-sm font-semibold text-slate">
          <input type="checkbox" className="h-5 w-5 shrink-0 accent-sapphire" checked={p.needsHelp} onChange={(ev) => onChange({ needsHelp: ev.target.checked })} />
          The family has asked for help (kept off every reminder)
        </label>
      </div>
      {p.needsHelp && text('helpStaff', 'Staff member who will speak to the family')}
      {p.needsHelp && text('helpNote', 'Note')}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="button" className={btnSolid} onClick={onDone}>
          Done
        </button>
        <p className="text-sm text-slate/70">Changes are kept as you type.</p>
      </div>
    </div>
  );
}
