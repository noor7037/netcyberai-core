'use client';

import { useEffect, useId, useState } from 'react';
import { Icon } from '@/components/visual/Icons';
import type { CertImage } from '@/lib/certificates/definitions';
import { EMPTY_PROFILE, PROFILE_FIELDS, cleanProfile, hasProfile, type SchoolProfile } from '@/lib/free-tools/school-profile';
import { ImagePicker } from './ImagePicker';
import { btnQuiet, btnSolid } from './ReportActions';
import { shrinkLogoForProfile } from './profile-logo';
import { useSchoolProfile } from './useSchoolProfile';

const inputCls =
  'min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-base text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire';

// The school's own details, typed once and saved in this browser, then
// filled into every free tool (Decision Log C198-B). Compact mode is a
// one-line bar for calculators; the full panel opens straight into the
// form when nothing is saved yet.
export function SchoolProfilePanel({ compact = false }: { compact?: boolean }) {
  const { profile, loaded, save, clear } = useSchoolProfile();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SchoolProfile>(EMPTY_PROFILE);
  const [logo, setLogo] = useState<CertImage | undefined>();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const id = useId();
  const saved = hasProfile(profile);

  // Start the form from what is saved whenever it opens.
  useEffect(() => {
    if (!open) return;
    setDraft(profile);
    setLogo(profile.logo ? { src: profile.logo, aspect: profile.logoAspect } : undefined);
  }, [open, profile]);

  // Nothing saved yet: the full panel opens straight into the form.
  useEffect(() => {
    if (loaded && !compact && !saved) setOpen(true);
  }, [loaded, compact, saved]);

  const say = (m: string) => {
    setStatus(m);
    window.setTimeout(() => setStatus(''), 4000);
  };

  async function onSave() {
    if (!draft.schoolName.trim()) return say('Type the school name first.');
    setBusy(true);
    try {
      let next: SchoolProfile = { ...draft, logo: '', logoAspect: 0 };
      let logoNote = '';
      if (logo) {
        const small = logo.src === profile.logo ? { src: profile.logo, aspect: profile.logoAspect } : await shrinkLogoForProfile(logo.src);
        if (small) next = { ...next, logo: small.src, logoAspect: small.aspect };
        else logoNote = ' The logo was too large to keep, so it was left out.';
      }
      if (save(cleanProfile(next))) {
        say(`Saved in this browser. Every free tool will fill these in.${logoNote}`);
        setOpen(false);
      } else say('This browser does not allow saving. The details work on this page only.');
    } catch {
      say('The logo could not be read. Try a PNG or JPG file.');
    } finally {
      setBusy(false);
    }
  }

  function onClear() {
    clear();
    setDraft(EMPTY_PROFILE);
    setLogo(undefined);
    say('School details removed from this browser.');
  }

  const summary = [profile.schoolName, profile.place].filter(Boolean).join(', ');

  return (
    <section aria-labelledby={`${id}-title`} className={`rounded-3xl border border-slate/10 bg-white print:hidden ${compact ? 'p-4' : 'p-5 sm:p-6'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {saved && profile.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.logo} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-slate/10 object-contain" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-royal/10 text-royal-deep">
              <Icon name="school" className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-base font-extrabold text-slate">
              {saved ? summary : 'Your school’s details'}
            </h2>
            <p className="text-sm text-slate/70">
              {saved ? 'Saved in this browser and filled into every free tool.' : 'Type them once. Every certificate, report and tracker fills them in.'}
            </p>
          </div>
        </div>
        <button type="button" className={btnQuiet} aria-expanded={open} aria-controls={`${id}-form`} onClick={() => setOpen((o) => !o)}>
          <Icon name="chevronDown" className={`h-4 w-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
          {open ? 'Close' : saved ? 'Edit school details' : 'Add school details'}
        </button>
      </div>

      {open && (
        <form id={`${id}-form`} className="mt-5 flex flex-col gap-5" onSubmit={(e) => (e.preventDefault(), void onSave())} noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {PROFILE_FIELDS.map((f) => (
              <div key={f.id} className={`flex flex-col gap-1.5 ${f.id === 'schoolName' || f.id === 'address' ? 'sm:col-span-2 xl:col-span-3' : ''}`}>
                <label htmlFor={`${id}-${f.id}`} className="text-sm font-medium text-slate">
                  {f.label}
                  {f.id === 'schoolName' && <span className="text-red-800"> *</span>}
                </label>
                <input
                  id={`${id}-${f.id}`}
                  className={inputCls}
                  maxLength={f.max}
                  autoComplete={f.id === 'email' ? 'email' : f.id === 'phone' ? 'tel' : 'off'}
                  inputMode={f.id === 'phone' ? 'tel' : f.id === 'email' ? 'email' : undefined}
                  value={draft[f.id]}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <ImagePicker label="School logo" help="Kept small in this browser. Signatures and stamps are never saved." value={logo} onChange={setLogo} whiteDefault />
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={btnSolid} disabled={busy}>
              <Icon name="check" className="h-4 w-4" /> {busy ? 'Saving…' : 'Save in this browser'}
            </button>
            {saved && (
              <button type="button" className={btnQuiet} onClick={onClear}>
                Remove saved details
              </button>
            )}
          </div>
          <p className="flex items-start gap-2 text-sm text-slate/70">
            <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0" />
            Only the school’s own details are kept, on this device. Nothing is sent to NetCyberAI, and no student’s, parent’s or teacher’s details are ever
            saved here.
          </p>
        </form>
      )}
      <p role="status" className="mt-2 text-sm font-semibold text-emerald-text empty:hidden">
        {status}
      </p>
    </section>
  );
}
