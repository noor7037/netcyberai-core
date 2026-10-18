'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { PRIMARY_ACTION, QUIET_ACTION } from '@/components/app-ui/ModulePage';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import type { MessageKey } from '@/lib/i18n';
import { drawStaffPhoto } from '@/lib/staff/photo-draw';
import type { StaffProfile } from '@/lib/staff/profile';
import { ADDRESS_MAX, DESIGNATION_MAX, EMERGENCY_MAX, EMPLOYMENT_TYPES, PHOTO_PICKER_ACCEPT, STAFF_CODE_MAX, type ProfileField } from '@/lib/staff/profile-rules';
import { StaffPhoto } from './StaffIdCard';

// The office's edit of a member of staff's profile (C238): the profile's fields and the photo. The photo is drawn in
// the browser (at most 512 px, sent as a JPEG) and checked again by the server. The fields are saved first, then the
// photo; each refusal is said in the person's language, a field's own under that field.

const LABEL: Record<ProfileField, MessageKey> = {
  staff_code: 'sprof.staffCode',
  designation: 'sprof.designation',
  employment_type: 'sprof.employmentType',
  joining_date: 'sprof.joining',
  date_of_birth: 'sprof.dob',
  address: 'sprof.address',
  emergency_contact: 'sprof.emergency',
};
const CODES = ['not_allowed', 'not_found', 'not_sent', 'photo_empty', 'photo_too_large', 'photo_not_image', 'photo_dimensions', 'storage_unavailable', 'picker_type', 'picker_size', 'picker_read'];
const PROBLEMS = ['invalid', 'too_long', 'aadhaar', 'date'];

export function StaffProfileEdit({ profile, onClose }: { profile: StaffProfile; onClose: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<Record<ProfileField, string>>({
    staff_code: profile.staffCode ?? '',
    designation: profile.designation ?? '',
    employment_type: profile.employmentType ?? '',
    joining_date: profile.profileJoiningDate ?? profile.joiningDate ?? '',
    date_of_birth: profile.dateOfBirth ?? '',
    address: profile.address ?? '',
    emergency_contact: profile.emergencyContact ?? '',
  });
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | 'remove' | null>(null);
  const [fieldError, setFieldError] = useState<{ field: ProfileField; words: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const said = (code: unknown) => t(`sprof.err.${typeof code === 'string' && CODES.includes(code) ? code : 'failed'}` as MessageKey);
  const set = (field: ProfileField) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [field]: e.target.value }));
  const errorOf = (field: ProfileField) => (fieldError?.field === field ? fieldError.words : undefined);

  async function pick(file: File | undefined) {
    if (!file) return;
    const drawn = await drawStaffPhoto(file);
    if (fileRef.current) fileRef.current.value = '';
    if ('problem' in drawn) return setNote(said(drawn.problem));
    setPhoto({ blob: drawn.blob, preview: URL.createObjectURL(drawn.blob) });
    setNote(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNote(null);
    setFieldError(null);
    try {
      const res = await fetch(`/api/app/staff/${profile.userId}/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (body?.code === 'code_taken') return setFieldError({ field: 'staff_code', words: t('sprof.err.code_taken') });
        if (body?.code === 'field' && body.field in LABEL) {
          const field = body.field as ProfileField;
          return setFieldError({ field, words: t(`sprof.err.field.${PROBLEMS.includes(body.problem) ? body.problem : 'invalid'}` as MessageKey, { field: t(LABEL[field]) }) });
        }
        return setNote(said(body?.code));
      }
      if (photo) {
        const form = new FormData();
        if (photo !== 'remove') form.set('photo', photo.blob, 'photo.jpg');
        const sent = await fetch(`/api/app/staff/${profile.userId}/photo`, photo === 'remove' ? { method: 'DELETE' } : { method: 'POST', body: form });
        if (!sent.ok) {
          // The fields above were saved: the page shows them, and the note says what happened to the photo.
          router.refresh();
          return setNote(said((await sent.json().catch(() => null))?.code));
        }
      }
      router.refresh();
      onClose();
    } catch {
      setNote(t('sprof.err.failed'));
    } finally {
      setBusy(false);
    }
  }

  const shown = photo === 'remove' ? { ...profile, photoVersion: null } : profile;
  return (
    <form onSubmit={save} data-staff-profile-form className="flex flex-col gap-4 rounded-2xl border border-slate/10 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-bold text-slate">{t('sprof.edit.title')}</h2>
      <section className="flex flex-wrap items-center gap-3">
        {photo && photo !== 'remove' ? (
          // eslint-disable-next-line @next/next/no-img-element -- the picture just drawn in this browser
          <img src={photo.preview} alt={t('sprof.photoAlt', { name: profile.name })} className="h-20 w-20 rounded-full border border-slate/10 object-cover" />
        ) : (
          <StaffPhoto profile={shown} size="header" />
        )}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <label htmlFor={`${id}-photo`} className={`${QUIET_ACTION} cursor-pointer`}>
              {t('sprof.photo.choose')}
            </label>
            <input ref={fileRef} id={`${id}-photo`} type="file" accept={PHOTO_PICKER_ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
            {(profile.photoVersion || (photo && photo !== 'remove')) && photo !== 'remove' && (
              <button type="button" onClick={() => setPhoto('remove')} className={QUIET_ACTION}>
                {t('sprof.photo.remove')}
              </button>
            )}
          </div>
          <p className="text-sm text-slate/70">{t('sprof.photo.help')}</p>
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <Input id={`${id}-code`} name="staff_code" label={t(LABEL.staff_code)} value={values.staff_code} onChange={set('staff_code')} maxLength={STAFF_CODE_MAX} error={errorOf('staff_code')} autoComplete="off" />
        <Input id={`${id}-designation`} label={t(LABEL.designation)} value={values.designation} onChange={set('designation')} maxLength={DESIGNATION_MAX} error={errorOf('designation')} />
        <Select id={`${id}-employment`} label={t(LABEL.employment_type)} value={values.employment_type} onChange={set('employment_type')} error={errorOf('employment_type')}>
          <option value="">{t('sprof.notRecorded')}</option>
          {EMPLOYMENT_TYPES.map((k) => (
            <option key={k} value={k}>
              {t(`sprof.employment.${k}` as MessageKey)}
            </option>
          ))}
        </Select>
        <Input id={`${id}-joining`} type="date" label={t(LABEL.joining_date)} value={values.joining_date} onChange={set('joining_date')} error={errorOf('joining_date')} />
        <Input id={`${id}-dob`} type="date" label={t(LABEL.date_of_birth)} value={values.date_of_birth} onChange={set('date_of_birth')} error={errorOf('date_of_birth')} />
        <Input id={`${id}-emergency`} label={t(LABEL.emergency_contact)} value={values.emergency_contact} onChange={set('emergency_contact')} maxLength={EMERGENCY_MAX} error={errorOf('emergency_contact')} helperText={t('sprof.emergencyHelp')} />
        <div className="md:col-span-2">
          <Textarea id={`${id}-address`} label={t(LABEL.address)} value={values.address} onChange={set('address')} maxLength={ADDRESS_MAX} rows={3} error={errorOf('address')} />
        </div>
      </div>
      <p className="text-sm text-slate/70">{t('sprof.notKept')}</p>
      {note && (
        <p role="status" data-staff-profile-note className="rounded-md border border-red-800/30 px-3 py-2 text-sm font-semibold text-red-800">
          {note}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={PRIMARY_ACTION}>
          {busy ? t('sprof.edit.saving') : t('sprof.edit.save')}
        </button>
        <button type="button" onClick={onClose} disabled={busy} className={QUIET_ACTION}>
          {t('sprof.edit.cancel')}
        </button>
      </div>
    </form>
  );
}
