'use client';

import { useState, type FormEvent } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Button } from '@/components/ui/Button';
import { SubmitError } from '@/components/marketing/SubmitError';
import { Honeypot } from '@/components/marketing/Honeypot';
import { submitLead } from '@/components/marketing/submitLead';
import { EMPTY_PHONE, PhoneWithCountry, countryCodeOf, type PhoneValue } from '@/components/marketing/PhoneWithCountry';
import { EMAIL_RE, toE164 } from '@/lib/leads/contact';

// Pricing page "Get a custom quote". Same /api/public/leads intake as
// every other website form (source 'quote'), so the request lands in the
// Control Plane onboarding list with the rest.

const MODULES = [
  { value: 'records', label: 'Student records' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'fees', label: 'Fees and receipts' },
  { value: 'pulse', label: 'Daily Learning Pulse' },
  { value: 'exams', label: 'Exams and report cards' },
  { value: 'admissions', label: 'Admissions' },
];
const STUDENT_BANDS = ['Under 200', '200-500', '500-1,000', '1,000-2,500', '2,500+'];

type Values = {
  schoolName: string;
  contactName: string;
  phone: PhoneValue;
  contactEmail: string;
  city: string;
  studentCountBand: string;
  requiredModules: string[];
  currentErp: string;
  requirements: string;
  preferredContact: 'phone' | 'whatsapp' | 'email';
};

const EMPTY: Values = {
  schoolName: '',
  contactName: '',
  phone: EMPTY_PHONE,
  contactEmail: '',
  city: '',
  studentCountBand: '',
  requiredModules: [],
  currentErp: '',
  requirements: '',
  preferredContact: 'whatsapp',
};

type Errors = Partial<Record<keyof Values, string>>;

function validate(v: Values): Errors {
  const e: Errors = {};
  if (!v.schoolName.trim()) e.schoolName = 'Please enter your school’s name.';
  if (!v.contactName.trim()) e.contactName = 'Please enter your name.';
  if (!toE164(countryCodeOf(v.phone), v.phone.phone)) e.phone = 'Please check the phone number and the country code.';
  if (!EMAIL_RE.test(v.contactEmail.trim())) e.contactEmail = 'Please enter a valid email address.';
  if (!v.studentCountBand) e.studentCountBand = 'Please choose the number of students.';
  return e;
}

export function QuoteForm() {
  const [v, setV] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<{ isDuplicate: boolean } | null>(null);

  const set = <K extends keyof Values>(k: K, value: Values[K]) => {
    setV((s) => ({ ...s, [k]: value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const found = validate(v);
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(`quote-${first === 'phone' ? 'contactPhone' : first}`)?.focus();
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { phone, ...rest } = v;
      setDone(await submitLead({ source: 'quote', ...rest, contactPhone: phone.phone, countryCode: countryCodeOf(phone), website }));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div role="status" className="rounded-3xl border border-emerald/30 bg-white p-6">
        <p className="text-lg font-bold text-slate">{done.isDuplicate ? 'We already have your request' : 'Quote request received'}</p>
        <p className="mt-2 text-slate/70">
          {done.isDuplicate
            ? 'We found an earlier request from this phone number or email and will follow up on that one.'
            : v.preferredContact === 'email'
              ? 'A member of our team will send your quote by email.'
              : `A member of our team will contact you on ${v.preferredContact === 'whatsapp' ? 'WhatsApp' : 'the phone number you shared'} with your quote.`}
        </p>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} className="relative flex flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-6">
      <Honeypot value={website} onChange={setWebsite} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input id="quote-schoolName" label="School name" required autoComplete="organization" value={v.schoolName} error={errors.schoolName} onChange={(e) => set('schoolName', e.target.value)} />
        <Input id="quote-contactName" label="Your name" required autoComplete="name" value={v.contactName} error={errors.contactName} onChange={(e) => set('contactName', e.target.value)} />
        <PhoneWithCountry idPrefix="quote" phoneId="quote-contactPhone" helperText="" value={v.phone} error={errors.phone} onChange={(p) => set('phone', p)} />
        <Input id="quote-contactEmail" label="Email" type="email" required autoComplete="email" value={v.contactEmail} error={errors.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
        <Input id="quote-city" label="City" autoComplete="address-level2" value={v.city} onChange={(e) => set('city', e.target.value)} />
        <Select id="quote-studentCountBand" label="Number of students" required value={v.studentCountBand} error={errors.studentCountBand} onChange={(e) => set('studentCountBand', e.target.value)}>
          <option value="">Select a range</option>
          {STUDENT_BANDS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </Select>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-slate">Modules you are interested in</legend>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {MODULES.map((m) => (
            <Checkbox
              key={m.value}
              id={`quote-module-${m.value}`}
              label={m.label}
              checked={v.requiredModules.includes(m.value)}
              onChange={() =>
                set('requiredModules', v.requiredModules.includes(m.value) ? v.requiredModules.filter((x) => x !== m.value) : [...v.requiredModules, m.value])
              }
            />
          ))}
        </div>
      </fieldset>
      <Input id="quote-currentErp" label="Software you use today" helperText="e.g. registers and spreadsheets, another ERP, none" value={v.currentErp} onChange={(e) => set('currentErp', e.target.value)} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="quote-requirements" className="text-sm font-medium text-slate">
          Anything we should know
        </label>
        <textarea
          id="quote-requirements"
          rows={3}
          value={v.requirements}
          onChange={(e) => set('requirements', e.target.value)}
          className="rounded-md border border-slate/20 bg-white px-4 py-3 text-base text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire"
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-slate">How should we contact you?</legend>
        <div className="flex flex-wrap gap-2">
          {(['whatsapp', 'phone', 'email'] as const).map((m) => (
            <label
              key={m}
              className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold ${v.preferredContact === m ? 'border-royal bg-royal/10 text-royal-deep' : 'border-slate/20 text-slate'}`}
            >
              <input type="radio" name="quote-preferred" value={m} checked={v.preferredContact === m} onChange={() => set('preferredContact', m)} className="h-4 w-4 accent-royal" />
              {m === 'whatsapp' ? 'WhatsApp' : m === 'phone' ? 'Phone call' : 'Email'}
            </label>
          ))}
        </div>
      </fieldset>
      {submitError && <SubmitError message={submitError} />}
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Sending…' : 'Request my quote'}
      </Button>
      <p className="text-xs text-slate/70">A real person prepares every quote. Submitting this form does not sign you up for anything.</p>
    </form>
  );
}
