'use client';

import { useState, type FormEvent } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { SubmitError } from '@/components/marketing/SubmitError';
import { submitLead } from '@/components/marketing/submitLead';
import { Honeypot } from '@/components/marketing/Honeypot';

// Short, single-step lead capture for Contact Sales and Request a
// Callback. Posts to the same /api/public/leads intake as Get Started
// and Book a Demo, and shows success only after the API returned 2xx.
type Source = 'contact' | 'callback';

type Values = {
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  schoolName: string;
  city: string;
  preferredTime: string;
  requirements: string;
};

const EMPTY: Values = {
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  schoolName: '',
  city: '',
  preferredTime: '',
  requirements: '',
};

type Errors = Partial<Record<keyof Values, string>>;

function validate(v: Values, source: Source): Errors {
  const errors: Errors = {};
  if (!v.contactName.trim()) errors.contactName = 'Please enter your name.';
  const digits = v.contactPhone.replace(/\D/g, '').length;
  if (digits < 10 || digits > 15) errors.contactPhone = 'Please enter a phone number with at least 10 digits.';
  if (!v.schoolName.trim()) errors.schoolName = 'Please enter your school or organisation name.';
  if (v.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.contactEmail.trim())) {
    errors.contactEmail = 'Please enter a valid email address, or leave it blank.';
  }
  if (source === 'contact' && !v.requirements.trim()) errors.requirements = 'Please tell us what you would like to discuss.';
  return errors;
}

export function QuickLeadForm({ source }: { source: Source }) {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<{ isDuplicate: boolean } | null>(null);
  const [website, setWebsite] = useState('');
  const idp = `${source}-lead`;

  function update<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validate(values, source);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = Object.keys(found)[0];
      document.getElementById(`${idp}-${first}`)?.focus();
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      setDone(await submitLead({ source, ...values, website }));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div role="status" className="rounded-3xl border border-emerald/30 bg-white p-6">
        <p className="text-lg font-bold text-slate">
          {done.isDuplicate ? 'We already have your request' : source === 'callback' ? 'Callback requested' : 'Message received'}
        </p>
        <p className="mt-2 text-slate/70">
          {done.isDuplicate
            ? 'We found an earlier request from this phone number. Our team will follow up on that one, so there is no need to send it again.'
            : source === 'callback'
              ? 'A member of our team will call you on the number you shared, in the time window you picked where possible.'
              : 'A member of our team will reply by phone or email. Nothing is sent to your parents or staff from this form.'}
        </p>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="relative flex flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-6">
      <Honeypot value={website} onChange={setWebsite} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          id={`${idp}-contactName`}
          label="Your name"
          required
          autoComplete="name"
          value={values.contactName}
          error={errors.contactName}
          onChange={(e) => update('contactName', e.target.value)}
        />
        <Input
          id={`${idp}-contactPhone`}
          label="Phone (WhatsApp preferred)"
          type="tel"
          required
          autoComplete="tel"
          inputMode="tel"
          value={values.contactPhone}
          error={errors.contactPhone}
          onChange={(e) => update('contactPhone', e.target.value)}
        />
      </div>
      <Input
        id={`${idp}-schoolName`}
        label="School / organisation"
        required
        autoComplete="organization"
        value={values.schoolName}
        error={errors.schoolName}
        onChange={(e) => update('schoolName', e.target.value)}
      />
      {source === 'contact' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            id={`${idp}-contactEmail`}
            label="Email"
            type="email"
            autoComplete="email"
            helperText="Optional"
            value={values.contactEmail}
            error={errors.contactEmail}
            onChange={(e) => update('contactEmail', e.target.value)}
          />
          <Input id={`${idp}-city`} label="City" autoComplete="address-level2" value={values.city} onChange={(e) => update('city', e.target.value)} />
        </div>
      ) : (
        <Select
          id={`${idp}-preferredTime`}
          label="Best time to call"
          value={values.preferredTime}
          onChange={(e) => update('preferredTime', e.target.value)}
        >
          <option value="">Any time</option>
          <option value="morning">Morning (10am–1pm)</option>
          <option value="afternoon">Afternoon (2pm–5pm)</option>
          <option value="evening">Evening (5pm–7pm)</option>
        </Select>
      )}
      {source === 'contact' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idp}-requirements`} className="text-sm font-medium text-slate">
            What would you like to discuss?
            <span aria-hidden="true" className="text-red-800">
              {' '}
              *
            </span>
            <span className="sr-only"> (required)</span>
          </label>
          <textarea
            id={`${idp}-requirements`}
            rows={4}
            aria-required
            aria-invalid={Boolean(errors.requirements) || undefined}
            aria-describedby={errors.requirements ? `${idp}-requirements-message` : undefined}
            className={`rounded-md border ${errors.requirements ? 'border-red-600' : 'border-slate/20'} bg-white px-4 py-3 text-base text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire`}
            value={values.requirements}
            onChange={(e) => update('requirements', e.target.value)}
          />
          {errors.requirements && (
            <p id={`${idp}-requirements-message`} className="text-sm text-red-800">
              {errors.requirements}
            </p>
          )}
        </div>
      )}
      {submitError && <SubmitError message={submitError} />}
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Sending…' : source === 'callback' ? 'Request a callback' : 'Send message'}
      </Button>
      <p className="text-xs text-slate/70">
        We use these details to reply to your enquiry. Submitting this form does not sign you up for anything.
      </p>
    </form>
  );
}
