'use client';

import { useState, type FormEvent } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Button } from '@/components/ui/Button';
import { SubmitError } from '@/components/marketing/SubmitError';
import { submitLead } from '@/components/marketing/submitLead';

type Source = 'get_started' | 'book_demo' | 'start_pilot';

const MODULES = [
  { value: 'attendance', label: 'Attendance' },
  { value: 'fees', label: 'Fees & Billing' },
  { value: 'communication', label: 'Parent Communication (WhatsApp)' },
  { value: 'academics', label: 'Academics & Exams' },
  { value: 'compliance', label: 'Compliance' },
];

const STUDENT_COUNT_BANDS = ['Under 200', '200-500', '500-1,000', '1,000-2,500', '2,500+'];
const ORG_TYPES = ['School', 'Group of schools', 'Coaching centre', 'Trust / Society', 'Other'];

type FormState = {
  schoolName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  city: string;
  orgType: string;
  studentCountBand: string;
  currentErp: string;
  requiredModules: string[];
  requirements: string;
  preferredDate: string;
  preferredTime: string;
};

const EMPTY: FormState = {
  schoolName: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  city: '',
  orgType: '',
  studentCountBand: '',
  currentErp: '',
  requiredModules: [],
  requirements: '',
  preferredDate: '',
  preferredTime: '',
};

export function LeadForm({ source }: { source: Source }) {
  const [step, setStep] = useState<'form' | 'review' | 'done'>('form');
  const [values, setValues] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ isDuplicate: boolean } | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function toggleModule(value: string) {
    setValues((v) => ({
      ...v,
      requiredModules: v.requiredModules.includes(value)
        ? v.requiredModules.filter((m) => m !== value)
        : [...v.requiredModules, value],
    }));
  }

  function handleReview(e: FormEvent) {
    e.preventDefault();
    setStep('review');
  }

  async function handleConfirm() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body = await submitLead({ source, ...values });
      setResult({ isDuplicate: body.isDuplicate });
      setStep('done');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'done') {
    return (
      <div className="rounded-lg border border-emerald/30 bg-emerald/5 p-6">
        <h3 className="text-lg font-bold text-slate">
          {result?.isDuplicate ? "We already have your request" : 'Request received'}
        </h3>
        <p className="mt-2 text-slate/70">
          {result?.isDuplicate
            ? "We found an earlier request from this phone number — our team will follow up on that one shortly, so there's no need to submit again."
            : source === 'book_demo'
              ? "Thanks — our team will confirm your demo slot shortly, on the phone number you shared."
              : source === 'start_pilot'
                ? "Thanks — our team will call you to agree the pilot scope, the classes involved, and the WhatsApp numbers to whitelist before anything is sent."
                : "Thanks — our team will reach out shortly to take your school live on NetCyberAI."}
        </p>
      </div>
    );
  }

  if (step === 'review') {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-slate/10 bg-white p-6">
        <h3 className="text-lg font-bold text-slate">Please confirm your details</h3>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          {source !== 'book_demo' && <Field label="Organisation type" value={values.orgType || '—'} />}
          <Field label="School" value={values.schoolName} />
          <Field label="Contact" value={values.contactName} />
          <Field label="Phone" value={values.contactPhone} />
          <Field label="Email" value={values.contactEmail || '—'} />
          <Field label="City" value={values.city || '—'} />
          <Field label="Students" value={values.studentCountBand || '—'} />
          {source === 'book_demo' && <Field label="Preferred date" value={values.preferredDate || '—'} />}
          {source === 'book_demo' && <Field label="Preferred time" value={values.preferredTime || '—'} />}
          {source !== 'get_started' && <Field label="Notes" value={values.requirements || '—'} />}
          <Field
            label="Modules"
            value={values.requiredModules.length ? values.requiredModules.join(', ') : '—'}
          />
        </dl>
        {submitError && <SubmitError message={submitError} />}
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => setStep('form')} disabled={submitting}>
            Back and edit
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Confirm and submit'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleReview} className="flex flex-col gap-4 rounded-lg border border-slate/10 bg-white p-6">
      {source !== 'book_demo' && (
        <Select
          id="lead-org-type"
          label="Organisation type"
          required
          value={values.orgType}
          onChange={(e) => update('orgType', e.target.value)}
        >
          <option value="">Select one</option>
          {ORG_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      )}
      <Input
        id="lead-school-name"
        label="School / organisation name"
        required
        value={values.schoolName}
        onChange={(e) => update('schoolName', e.target.value)}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          id="lead-contact-name"
          label="Your name"
          required
          value={values.contactName}
          onChange={(e) => update('contactName', e.target.value)}
        />
        <Input
          id="lead-contact-phone"
          label="Phone (WhatsApp preferred)"
          type="tel"
          required
          value={values.contactPhone}
          onChange={(e) => update('contactPhone', e.target.value)}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          id="lead-contact-email"
          label="Email"
          type="email"
          helperText="Optional"
          value={values.contactEmail}
          onChange={(e) => update('contactEmail', e.target.value)}
        />
        <Input id="lead-city" label="City" value={values.city} onChange={(e) => update('city', e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          id="lead-student-count"
          label="Number of students"
          value={values.studentCountBand}
          onChange={(e) => update('studentCountBand', e.target.value)}
        >
          <option value="">Select a range</option>
          {STUDENT_COUNT_BANDS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </Select>
        <Input
          id="lead-current-erp"
          label="Current system (if any)"
          helperText="e.g. spreadsheets, another ERP, none"
          value={values.currentErp}
          onChange={(e) => update('currentErp', e.target.value)}
        />
      </div>

      {source === 'book_demo' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            id="lead-preferred-date"
            label="Preferred date"
            type="date"
            value={values.preferredDate}
            onChange={(e) => update('preferredDate', e.target.value)}
          />
          <Select
            id="lead-preferred-time"
            label="Preferred time"
            value={values.preferredTime}
            onChange={(e) => update('preferredTime', e.target.value)}
          >
            <option value="">Select a slot</option>
            <option value="morning">Morning (10am–1pm)</option>
            <option value="afternoon">Afternoon (2pm–5pm)</option>
            <option value="evening">Evening (5pm–7pm)</option>
          </Select>
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-slate">Modules you need</legend>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {MODULES.map((m) => (
            <Checkbox
              key={m.value}
              id={`lead-module-${m.value}`}
              label={m.label}
              checked={values.requiredModules.includes(m.value)}
              onChange={() => toggleModule(m.value)}
            />
          ))}
        </div>
      </fieldset>

      {source !== 'get_started' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="lead-requirements" className="text-sm font-medium text-slate">
            {source === 'start_pilot'
              ? 'What should the pilot prove for your school?'
              : "Anything specific you'd like covered"}
          </label>
          <textarea
            id="lead-requirements"
            rows={3}
            className="rounded-md border border-slate/20 bg-white px-4 py-3 text-base text-slate placeholder:text-slate/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire"
            value={values.requirements}
            onChange={(e) => update('requirements', e.target.value)}
          />
        </div>
      )}

      <Button type="submit">Review and continue</Button>
    </form>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate/70">{label}</dt>
      <dd className="text-slate">{value}</dd>
    </div>
  );
}
