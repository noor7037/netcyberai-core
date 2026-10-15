'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { dayFormat } from '@/components/compliance/desk-client';
import type { OwnQualification } from '@/lib/compliance/qualifications';
import type { Qualification } from '@/lib/compliance/register-rules';
import type { MessageKey } from '@/lib/i18n';

// "My qualifications" on a teacher's account page (C230-A, C232 part B): their own qualification row as the office
// keeps it on the compliance desk, read-only. Row level security lets them read that row and nothing else of the
// desk. Nothing is shown to a role with no row on the register (the accountant), or when the school's plan has no
// desk and nothing was ever kept.

const BOX = 'flex w-full max-w-2xl flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4 text-sm text-slate';

export function MyQualificationsPanel() {
  const { t, lang } = useT();
  const [data, setData] = useState<OwnQualification | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch('/api/app/compliance/qualifications/mine')
      .then((r) => (r.ok ? (r.json() as Promise<OwnQualification>) : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);
  const date = dayFormat(lang);

  if (failed) {
    return (
      <section lang={lang} data-my-qualifications="failed" className={BOX}>
        <h2 className="text-base font-bold">{t('myq.title')}</h2>
        <p role="alert" className="rounded-md bg-off-white px-3 py-2">{t('myq.failed')}</p>
      </section>
    );
  }
  if (!data?.applies) return null;
  const q = data.qualification;
  const tetName = (type: string) => (type === 'CTET' ? type : t('cdk.tet.state'));
  const paperName = (paper: string) => (paper === 'both' ? t('cdk.paper.both') : paper);
  const tet = (v: Qualification) => {
    if (!v.tet_type) return t('cdk.q.noTet');
    const parts = [v.tet_paper ? t('cdk.q.tetWithPaper', { type: tetName(v.tet_type), paper: paperName(v.tet_paper) }) : tetName(v.tet_type)];
    if (v.tet_certificate_date) parts.push(t('cdk.q.certificateOn', { date: date(v.tet_certificate_date) }));
    parts.push(v.tet_valid_until ? t('cdk.q.validUntil', { date: date(v.tet_valid_until) }) : t('cdk.q.noEnd'));
    return parts.join(' · ');
  };
  const rows: [MessageKey, string][] = q
    ? [
        ['cdk.f.stage', q.stage ? t(`cdk.stage.${q.stage}` as MessageKey) : t('cdk.stage.none')],
        ['cdk.f.subjects', q.subjects ?? t('myq.notRecorded')],
        ['cdk.f.degree', q.degree ?? t('myq.notRecorded')],
        ['cdk.f.pg', q.postgraduate_degree ?? t('myq.notRecorded')],
        ['cdk.f.professional', q.professional_qualification ?? t('myq.notRecorded')],
        ['cdk.f.tetType', tet(q)],
        ['cdk.f.other', q.other_approval ? (q.other_valid_until ? t('cdk.q.otherUntil', { name: q.other_approval, date: date(q.other_valid_until) }) : q.other_approval) : t('myq.notRecorded')],
      ]
    : [];

  return (
    <section lang={lang} data-my-qualifications={q ? 'kept' : 'none'} className={BOX}>
      <div>
        <h2 className="text-base font-bold">{t('myq.title')}</h2>
        <p className="text-slate/70">{t('myq.how')}</p>
      </div>
      {!q ? (
        <p className="rounded-md bg-off-white px-3 py-2">{t('myq.none')}</p>
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label} className="rounded-md bg-off-white px-3 py-2">
                <dt className="text-slate/70">{t(label)}</dt>
                <dd className="break-words font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          {data.updated_at && <p className="text-slate/70">{t('cdk.q.changed', { name: data.updated_by ?? '', date: date(data.updated_at) })}</p>}
        </>
      )}
    </section>
  );
}
