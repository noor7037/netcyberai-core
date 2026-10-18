'use client';

import { useT } from '@/components/app-shell/LangContext';
import type { StaffProfile } from '@/lib/staff/profile';
import { photoAddress, staffInitials } from '@/lib/staff/profile-rules';

// The person's photo from the app's own address, or their initials when none is kept.
export function StaffPhoto({ profile, size }: { profile: Pick<StaffProfile, 'userId' | 'name' | 'photoVersion'>; size: 'header' | 'card' }) {
  const { t } = useT();
  const src = photoAddress(profile.userId, profile.photoVersion);
  const box = size === 'header' ? 'h-20 w-20 rounded-full text-2xl' : 'h-28 w-24 rounded-md text-3xl';
  // eslint-disable-next-line @next/next/no-img-element -- the app's own address, private to the session
  if (src) return <img src={src} alt={t('sprof.photoAlt', { name: profile.name })} data-staff-photo className={`${box} shrink-0 border border-slate/10 bg-off-white object-cover`} />;
  return (
    <div aria-hidden="true" data-staff-initials className={`${box} flex shrink-0 items-center justify-center bg-sapphire font-bold text-white`}>
      {staffInitials(profile.name)}
    </div>
  );
}

// A member of staff's ID card (C238), in the student ID card's layout (src/components/students/IdCardView.tsx, which it
// does not share): the school's name, the photo, the name, and where the student card has the class, the designation
// and the staff code. No QR code: no staff card token exists, and none is made up here. Printed from the profile's
// ID card tab (the page prints this card alone).
export function StaffIdCard({ schoolName, profile, designation }: { schoolName: string; profile: StaffProfile; designation: string }) {
  const { t } = useT();
  return (
    <div data-staff-id-card className="mx-auto flex w-72 flex-col items-center gap-2 rounded-lg border border-slate/20 bg-white p-4 text-center print:break-inside-avoid">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate/70">{schoolName}</p>
      <StaffPhoto profile={profile} size="card" />
      <p className="text-lg font-bold text-slate">{profile.name}</p>
      <p className="text-sm text-slate/70">{designation}</p>
      <p className="text-sm font-semibold text-slate">{profile.staffCode ? t('sprof.idCard.code', { code: profile.staffCode }) : t('sprof.idCard.noCode')}</p>
    </div>
  );
}
