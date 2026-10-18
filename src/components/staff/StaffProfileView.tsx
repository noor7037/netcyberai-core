'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { KpiTile } from '@/components/app-ui/KpiTile';
import { ModulePage, PRIMARY_ACTION, QUIET_ACTION } from '@/components/app-ui/ModulePage';
import { RecordDocuments } from '@/components/documents/RecordDocuments';
import { Badge } from '@/components/ui/Badge';
import { Tabs } from '@/components/ui/Tabs';
import type { MessageKey } from '@/lib/i18n';
import type { StaffLeaveLine, StaffProfile } from '@/lib/staff/profile';
import { STAFF_PROFILE_TABS, type StaffProfileTab } from '@/lib/staff/profile-rules';
import { useLeaveWords } from './leave-parts';
import { StaffIdCard, StaffPhoto } from './StaffIdCard';
import { StaffProfileEdit } from './StaffProfileEdit';

// A member of staff's profile (C235-D, C238), to the founder's reference: a header with their photo (or initials),
// name, designation, staff code and mobile, and the buttons Documents, Edit (the office) and Biodata; then nine tabs:
// Overview, Contact, Employment, Attendance (leave only: the school keeps no daily attendance for staff), Teaching,
// Qualifications, Documents, ID card and Biodata (both printable). The office opens anyone's and edits it; a member of
// staff opens their own, read-only. Skills, experience, Aadhaar, PAN and bank details are not kept, and not shown.

const TAB_LABEL: Record<StaffProfileTab, MessageKey> = {
  overview: 'sprof.tab.overview',
  contact: 'sprof.tab.contact',
  employment: 'sprof.tab.employment',
  attendance: 'sprof.tab.attendance',
  teaching: 'sprof.tab.teaching',
  qualifications: 'sprof.tab.qualifications',
  documents: 'sprof.tab.documents',
  'id-card': 'sprof.tab.idCard',
  biodata: 'sprof.tab.biodata',
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate/10 py-2 sm:flex-row sm:gap-4">
      <dt className="text-sm text-slate/70 sm:w-56 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 whitespace-pre-line break-words text-sm font-medium text-slate">{children}</dd>
    </div>
  );
}

// One list of the person's leave: what waits, or what was approved.
function LeaveLines({ lines, status }: { lines: StaffLeaveLine[]; status: 'waiting' | 'approved' }) {
  const { t, tCount, dates } = useLeaveWords();
  const shown = lines.filter((l) => l.status === status);
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-slate">{t(status === 'waiting' ? 'sprof.leave.waitingList' : 'sprof.leave.approvedList')}</h3>
      {shown.length ? (
        <ul className="flex flex-col gap-2">
          {shown.map((l) => (
            <li key={l.leaveId} data-staff-leave={l.status} className="flex flex-wrap items-center gap-2 rounded-md border border-slate/10 bg-white px-3 py-2 text-sm text-slate">
              <Badge variant={l.status === 'approved' ? 'success' : 'warning'}>{t(`leave.status.${l.status}` as MessageKey)}</Badge>
              <span className="font-semibold">{dates({ from_date: l.from, to_date: l.to })}</span>
              <span className="text-slate/70">{`${tCount('leave.days', l.days)} · ${t(`leave.kind.${l.kind}` as MessageKey)}`}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate/70">{t('sprof.leave.none')}</p>
      )}
    </section>
  );
}

export function StaffProfileView({ profile, tab, office, schoolName }: { profile: StaffProfile; tab: StaffProfileTab; office: boolean; schoolName: string }) {
  const { t, lang } = useLeaveWords();
  const [editing, setEditing] = useState(false);
  const role = t(`role.${profile.role}` as MessageKey);
  const designation = profile.designation ?? role;
  const missing = <span className="font-normal text-slate/70">{t('sprof.notRecorded')}</span>;
  const none = <span className="font-normal text-slate/70">{t('sprof.none')}</span>;
  const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)) : missing);
  const employment = profile.employmentType ? t(`sprof.employment.${profile.employmentType}` as MessageKey) : missing;
  const tabHref = (id: StaffProfileTab) => `/app/staff/${profile.userId}?tab=${id}`;
  const teacher = profile.role === 'teacher';

  const facts = {
    designation: <Row label={t('sprof.designation')}>{profile.designation ?? missing}</Row>,
    role: <Row label={t('sprof.role')}>{role}</Row>,
    code: <Row label={t('sprof.staffCode')}>{profile.staffCode ?? missing}</Row>,
    employment: <Row label={t('sprof.employmentType')}>{employment}</Row>,
    joining: <Row label={t('sprof.joining')}>{day(profile.joiningDate)}</Row>,
    since: <Row label={t('sprof.since')}>{day(profile.since)}</Row>,
    account: <Row label={t('sprof.account')}>{t(profile.active ? 'sprof.account.on' : 'sprof.account.off')}</Row>,
    dob: <Row label={t('sprof.dob')}>{day(profile.dateOfBirth)}</Row>,
    mobile: <Row label={t('sprof.mobile')}>{profile.phone ?? missing}</Row>,
    email: <Row label={t('sprof.email')}>{profile.email ?? missing}</Row>,
    address: <Row label={t('sprof.address')}>{profile.address ?? missing}</Row>,
    emergency: <Row label={t('sprof.emergency')}>{profile.emergencyContact ?? missing}</Row>,
    classTeacher: <Row label={t('sprof.classTeacher')}>{profile.classTeacherOf.length ? profile.classTeacherOf.join(', ') : none}</Row>,
    teaches: (
      <Row label={t('sprof.teaches')}>
        {profile.teaches.length ? (
          <ul className="flex flex-col gap-0.5">
            {profile.teaches.map((x) => (
              <li key={`${x.className}-${x.subject}`}>{t('sprof.teachesItem', { subject: x.subject, class: x.className })}</li>
            ))}
          </ul>
        ) : (
          none
        )}
      </Row>
    ),
    periods: <Row label={t('sprof.kpi.periods')}>{profile.periodsAWeek ?? <span className="font-normal text-slate/70">{t('sprof.periods.none')}</span>}</Row>,
  };
  const q = profile.qualification;
  const qualifications = (
    <>
      <Row label={t('sprof.degree')}>{q?.degree ?? missing}</Row>
      <Row label={t('sprof.postgraduate')}>{q?.postgraduate ?? missing}</Row>
      <Row label={t('sprof.professional')}>{q?.professional ?? missing}</Row>
      <Row label={t('sprof.tet')}>{q?.tet ?? missing}</Row>
    </>
  );
  const kpis = (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {teacher && profile.periodsAWeek !== null && <KpiTile tone="royal" icon="timetable" tile={{ kind: 'kpi', id: 'periods', label: t('sprof.kpi.periods'), value: profile.periodsAWeek, unit: 'count', drillHref: tabHref('teaching') }} />}
      <KpiTile tone="turquoise" icon="attendance" tile={{ kind: 'kpi', id: 'leave-taken', label: t('sprof.kpi.leaveTaken'), value: profile.leave.daysTaken, unit: 'count', drillHref: tabHref('attendance') }} />
      <KpiTile tone="tangerine" icon="bell" tile={{ kind: 'kpi', id: 'leave-waiting', label: t('sprof.kpi.waiting'), value: profile.leave.waiting, unit: 'count', drillHref: tabHref('attendance') }} />
      <KpiTile tone="sapphire" icon="certificate" tile={{ kind: 'kpi', id: 'documents', label: t('sprof.kpi.documents'), value: profile.documents, unit: 'count', drillHref: tabHref('documents') }} />
    </div>
  );
  const notKept = (
    <div className="flex flex-wrap items-center gap-1 text-sm text-slate/70 print:hidden">
      <span>{t('sprof.notKeptShort')}</span>
      <InfoTip label={t('sprof.notKeptShort')}>{t('sprof.notKept')}</InfoTip>
    </div>
  );
  const print = (
    <button type="button" onClick={() => window.print()} className={`${QUIET_ACTION} self-start print:hidden`}>
      {t('sprof.print')}
    </button>
  );

  const panels: Record<StaffProfileTab, ReactNode> = {
    overview: (
      <div data-staff-overview className="flex flex-col gap-4">
        {kpis}
        <dl className="flex flex-col">
          {facts.designation}
          {facts.code}
          {facts.employment}
          {facts.joining}
          {facts.account}
        </dl>
      </div>
    ),
    contact: (
      <dl data-staff-contact className="flex flex-col">
        {facts.mobile}
        {facts.email}
        {facts.address}
        {facts.emergency}
      </dl>
    ),
    employment: (
      <div data-staff-employment className="flex flex-col gap-3">
        <dl className="flex flex-col">
          {facts.code}
          {facts.designation}
          {facts.role}
          {facts.employment}
          {facts.joining}
          {facts.since}
          {facts.account}
        </dl>
        {notKept}
      </div>
    ),
    attendance: (
      <div data-staff-attendance className="flex flex-col gap-4">
        <p className="text-sm text-slate">{t('sprof.leave.noDaily')}</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile tone="turquoise" icon="attendance" tile={{ kind: 'kpi', id: 'leave-taken', label: t('sprof.kpi.leaveTaken'), value: profile.leave.daysTaken, unit: 'count' }} />
          <KpiTile tone="tangerine" icon="bell" tile={{ kind: 'kpi', id: 'leave-waiting', label: t('sprof.kpi.waiting'), value: profile.leave.waiting, unit: 'count' }} />
        </div>
        <p className="text-sm text-slate/70">{profile.leave.session ? t('sprof.leave.session', { session: profile.leave.session }) : t('sprof.leave.allRecord')}</p>
        <LeaveLines lines={profile.leave.lines} status="waiting" />
        <LeaveLines lines={profile.leave.lines} status="approved" />
      </div>
    ),
    teaching: (
      <dl data-staff-teaching className="flex flex-col">
        {teacher && facts.periods}
        {facts.classTeacher}
        {facts.teaches}
      </dl>
    ),
    qualifications: (
      <div data-staff-qualifications className="flex flex-col gap-2">
        <dl className="flex flex-col">{qualifications}</dl>
        <p className="text-sm text-slate/70">{t('sprof.qual.where')}</p>
      </div>
    ),
    documents: <RecordDocuments record="staff" recordId={profile.userId} />,
    'id-card': (
      <div className="flex flex-col items-center gap-4">
        <StaffIdCard schoolName={schoolName} profile={profile} designation={designation} />
        {print}
      </div>
    ),
    biodata: (
      <article data-staff-biodata className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-lg border border-slate/10 bg-white p-4 print:border-0 print:p-0">
        <header className="flex items-center gap-4 border-b border-slate/10 pb-4">
          <StaffPhoto profile={profile} size="card" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate/70">{schoolName}</p>
            <h2 className="text-xl font-bold text-slate">{profile.name}</h2>
            <p className="text-sm text-slate">{t('sprof.biodata')}</p>
          </div>
        </header>
        <dl className="flex flex-col">
          {facts.code}
          {facts.designation}
          {facts.role}
          {facts.employment}
          {facts.joining}
          {facts.since}
          {facts.dob}
          {facts.mobile}
          {facts.email}
          {facts.address}
          {facts.emergency}
          {facts.classTeacher}
          {facts.teaches}
          {qualifications}
        </dl>
        {print}
      </article>
    ),
  };

  return (
    <ModulePage
      moduleId="staff"
      help="attach-documents"
      tour="staff-profile"
      title={profile.name}
      purpose={t(office ? 'sprof.purpose' : 'sprof.purposeSelf')}
      hideHeaderInPrint
      more={
        office ? (
          <Link href="/app/staff" className={`${QUIET_ACTION} print:hidden`}>
            {t('sprof.back')}
          </Link>
        ) : undefined
      }
    >
      <section data-staff-header className="flex flex-col gap-4 rounded-2xl border border-slate/10 bg-white p-4 shadow-sm sm:flex-row sm:items-center print:hidden">
        <StaffPhoto profile={profile} size="header" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-slate">{profile.name}</h2>
            <Badge variant={profile.active ? 'success' : 'neutral'}>{t(profile.active ? 'sprof.account.on' : 'sprof.account.off')}</Badge>
          </div>
          <p className="text-sm font-semibold text-slate">{designation}</p>
          <dl className="flex flex-col gap-x-6 gap-y-1 text-sm sm:flex-row sm:flex-wrap">
            <div className="flex gap-1">
              <dt className="text-slate/70">{t('sprof.staffCode')}:</dt>
              <dd data-staff-code className="font-medium text-slate">{profile.staffCode ?? t('sprof.notRecorded')}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-slate/70">{t('sprof.mobile')}:</dt>
              <dd className="font-medium text-slate">{profile.phone ?? t('sprof.notRecorded')}</dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={tabHref('documents')} data-staff-documents-button className={PRIMARY_ACTION}>
            {t('sprof.documents')}
          </Link>
          {office && !editing && (
            <button type="button" data-staff-edit onClick={() => setEditing(true)} className={QUIET_ACTION}>
              {t('sprof.edit')}
            </button>
          )}
          <Link href={tabHref('biodata')} data-staff-biodata-button className={QUIET_ACTION}>
            {t('sprof.biodata')}
          </Link>
        </div>
      </section>

      {office && editing ? (
        <StaffProfileEdit profile={profile} onClose={() => setEditing(false)} />
      ) : (
        <div className="print:[&_[role=tablist]]:hidden">
          <Tabs
            key={tab}
            idPrefix="staff-profile-"
            label={t('sprof.tabs')}
            orientation="vertical"
            defaultActiveId={tab}
            items={STAFF_PROFILE_TABS.map((id) => ({ id, label: t(TAB_LABEL[id]), content: panels[id] }))}
          />
        </div>
      )}
    </ModulePage>
  );
}
