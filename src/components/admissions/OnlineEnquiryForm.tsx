'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { FormClass } from '@/lib/admissions/online';
import { t, type Lang, type MessageKey } from '@/lib/i18n';

// The family's side of the online enquiry form (W21-M1). Four fields and a hidden one (the honeypot, "website", which
// a person never sees); sent once, then a thank-you that says the school will call.
const ERRORS = ['child_name', 'guardian_name', 'phone', 'class', 'aadhaar'];

export function OnlineEnquiryForm({ lang, formKey, classes }: { lang: Lang; formKey: string; classes: FormClass[] }) {
  const [form, setForm] = useState({ childName: '', classId: '', guardianName: '', phone: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const classWord = (c: FormClass) => (c.grade === null ? c.name : /^[0-9]+$/.test(c.grade) ? t(lang, 'enq.class', { grade: c.grade }) : c.grade);

  const send = async () => {
    setBusy(true);
    setProblem(null);
    const res = await fetch(`/api/public/admissions/${formKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).catch(() => null);
    const got = res ? ((await res.json().catch(() => null)) as { error?: string; code?: string } | null) : null;
    setBusy(false);
    if (res?.ok) {
      setDone(true);
      return;
    }
    const code = got?.code && ERRORS.includes(got.code) ? `enq.err.${got.code}` : got?.error === 'rate_limited' ? 'enq.err.rate_limited' : 'enq.err.other';
    setProblem(t(lang, code as MessageKey));
  };

  if (done) {
    return (
      <div role="status" data-enquire-sent className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-4 text-base">
        <p className="font-bold">{t(lang, 'enq.sent.title')}</p>
        <p>{t(lang, 'enq.sent.how')}</p>
      </div>
    );
  }
  return (
    <form
      data-enquire-form
      className="relative flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <Input id="enq-child" label={t(lang, 'enq.child')} autoComplete="off" maxLength={40} value={form.childName} onChange={(e) => setForm({ ...form, childName: e.target.value })} />
      <Select id="enq-class" label={t(lang, 'enq.classSought')} value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
        <option value="">{t(lang, 'enq.choose')}</option>
        {classes.map((c) => (
          <option key={c.classId} value={c.classId}>{classWord(c)}</option>
        ))}
      </Select>
      <Input id="enq-guardian" label={t(lang, 'enq.guardian')} autoComplete="name" maxLength={60} value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} />
      <Input id="enq-phone" type="tel" inputMode="tel" autoComplete="tel" label={t(lang, 'enq.phone')} helperText={t(lang, 'enq.phoneHow')} maxLength={20} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      {/* The honeypot: out of sight and out of the screen reader's way; a bot that fills it is refused. */}
      <div aria-hidden="true" className="absolute left-[-10000px] top-0 h-px w-px overflow-hidden">
        <label htmlFor="enq-website">Website</label>
        <input id="enq-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
      </div>
      <p className="text-sm">{t(lang, 'enq.privacy')}</p>
      {problem && (
        <p role="alert" className="rounded-md border border-red-800/30 px-3 py-2 text-sm font-semibold text-red-800">
          {problem}
        </p>
      )}
      <button type="submit" data-enquire-send disabled={busy || !form.childName.trim() || !form.classId || !form.guardianName.trim() || !form.phone.trim()} className="min-h-[44px] rounded-md bg-sapphire px-5 text-base font-semibold text-white disabled:opacity-60">
        {t(lang, busy ? 'enq.sending' : 'enq.send')}
      </button>
    </form>
  );
}
