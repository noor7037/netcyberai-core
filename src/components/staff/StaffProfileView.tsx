'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { ModulePage, PRIMARY_ACTION, QUIET_ACTION } from '@/components/app-ui/ModulePage';
import { RecordDocuments } from '@/components/documents/RecordDocuments';
import { Badge } from '@/components/ui/Badge';
import { Tabs } from '@/components/ui/Tabs';
import type { MessageKey } from '@/lib/i18n';
import type { StaffProfile } from '@/lib/staff/profile';

// A member of staff's profile (C235-D): a header with their initials (no photo is recorded), designation, mobile and
// email, and two tabs: Overview (what the school's record already holds) and Documents (the papers on their record).
// The office opens anyone's; a member of staff opens their own, read-only.

export type StaffProfileTab = 'overview' | 'documents';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate/10 py-2 sm:flex-row sm:gap-4">
      <dt className="text-sm text-slate/70 sm:w-56 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-medium text-slate">{children}</dd>
    </div>
  );
}

export function StaffProfileView({ profile, tab, office }: { profile: StaffProfile; tab: StaffProfileTab; office: boolean }) {
  const { t, lang } = useT();
  const role = t(`role.${profile.role}` as MessageKey);
  const missing = <span className="font-normal text-slate/70">{t('sprof.notRecorded')}</span>;
  const day = (iso: string) => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

  const overview = (
    <div data-staff-overview className="flex flex-col gap-6">
      <dl className="flex flex-col">
        <Row label={t('sprof.designation')}>{role}</Row>
        <Row label={t('sprof.mobile')}>{profile.phone ?? missing}</Row>
        <Row label={t('sprof.email')}>{profile.email ?? missing}</Row>
        <Row label={t('sprof.account')}>{t(profile.active ? 'sprof.account.on' : 'sprof.account.off')}</Row>
        <Row label={t('sprof.since')}>{day(profile.since)}</Row>
        {profile.joiningDate && <Row label={t('sprof.joining')}>{day(profile.joiningDate)}</Row>}
        {profile.role === 'teacher' && (
          <>
            <Row label={t('sprof.classTeacher')}>{profile.classTeacherOf.length ? profile.classTeacherOf.join(', ') : <span className="font-normal text-slate/70">{t('sprof.none')}</span>}</Row>
            <Row label={t('sprof.teaches')}>
              {profile.teaches.length ? (
                <ul className="flex flex-col gap-0.5">
                  {profile.teaches.map((x) => (
                    <li key={`${x.className}-${x.subject}`}>{t('sprof.teachesItem', { subject: x.subject, class: x.className })}</li>
                  ))}
                </ul>
              ) : (
                <span className="font-normal text-slate/70">{t('sprof.none')}</span>
              )}
            </Row>
          </>
        )}
      </dl>
      {profile.qualification && (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-slate">{t('sprof.qualifications')}</h3>
          <dl className="flex flex-col">
            <Row label={t('sprof.degree')}>{profile.qualification.degree ?? missing}</Row>
            <Row label={t('sprof.postgraduate')}>{profile.qualification.postgraduate ?? missing}</Row>
            <Row label={t('sprof.professional')}>{profile.qualification.professional ?? missing}</Row>
            <Row label={t('sprof.tet')}>{profile.qualification.tet ?? missing}</Row>
          </dl>
        </div>
      )}
    </div>
  );

  return (
    <ModulePage
      moduleId="staff"
      help="attach-documents"
      tour="staff-profile"
      title={profile.name}
      purpose={t(office ? 'sprof.purpose' : 'sprof.purposeSelf')}
      primary={
        <Link href={`/app/staff/${profile.userId}?tab=documents`} data-staff-documents-button className={PRIMARY_ACTION}>
          {t('sprof.documents')}
        </Link>
      }
      more={
        office ? (
          <Link href="/app/staff" className={QUIET_ACTION}>
            {t('sprof.back')}
          </Link>
        ) : undefined
      }
    >
      <section data-staff-header className="flex flex-col gap-4 rounded-lg border border-slate/10 bg-white p-4 sm:flex-row sm:items-center">
        <div aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-sapphire text-xl font-bold text-white">
          {initials(profile.name)}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-bold text-slate">{role}</p>
            <Badge variant={profile.active ? 'success' : 'neutral'}>{t(profile.active ? 'sprof.account.on' : 'sprof.account.off')}</Badge>
          </div>
          <dl className="flex flex-col gap-x-6 gap-y-1 text-sm sm:flex-row sm:flex-wrap">
            <div className="flex gap-1">
              <dt className="text-slate/70">{t('sprof.mobile')}:</dt>
              <dd className="font-medium text-slate">{profile.phone ?? t('sprof.notRecorded')}</dd>
            </div>
            <div className="flex min-w-0 gap-1">
              <dt className="text-slate/70">{t('sprof.email')}:</dt>
              <dd className="break-all font-medium text-slate">{profile.email ?? t('sprof.notRecorded')}</dd>
            </div>
          </dl>
        </div>
      </section>

      <Tabs
        key={tab}
        idPrefix="staff-profile-"
        label={t('sprof.tabs')}
        defaultActiveId={tab}
        items={[
          { id: 'overview', label: t('sprof.tab.overview'), content: overview },
          { id: 'documents', label: t('sprof.tab.documents'), content: <RecordDocuments record="staff" recordId={profile.userId} /> },
        ]}
      />
    </ModulePage>
  );
}
