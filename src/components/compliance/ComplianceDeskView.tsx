'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import type { DisclosureItem } from '@/lib/compliance/disclosure';
import type { Register } from '@/lib/compliance/qualifications';
import type { Sqaaf } from '@/lib/compliance/sqaaf';
import { DisclosurePanel } from './DisclosurePanel';
import { Form6Panel } from './Form6Panel';
import { QualificationsPanel } from './QualificationsPanel';
import { SqaafPanel } from './SqaafPanel';

// The compliance desk (docs/28 row 10d, C227), for the principal and the school admin: teacher qualifications and TET
// with what ends soon, the mandatory public disclosure data, Form 6 fee data, and SQAAF evidence tagged to CBSE's
// standards. One read of /api/app/compliance/desk; Form 6 from its own route.

type Desk = { register: Register; disclosure: DisclosureItem[]; sqaaf: Sqaaf };

export function ComplianceDeskView() {
  const { t, lang } = useT();
  const [data, setData] = useState<Desk | null>(null);
  const [failed, setFailed] = useState<'failed' | 'notYours' | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/app/compliance/desk').catch(() => null);
    if (res?.status === 403) return setFailed('notYours');
    const got = res?.ok ? ((await res.json().catch(() => null)) as Desk | null) : null;
    setFailed(got ? null : 'failed');
    if (got) setData(got);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const say = useCallback((ok: boolean, text: string) => setNote({ ok, text }), []);

  if (failed) return <p role="alert" data-cdk-failed={failed} className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t(failed === 'notYours' ? 'cdk.notYours' : 'cdk.failed')}</p>;
  if (!data) return null;
  return (
    <div lang={lang} data-compliance-desk className="flex flex-col gap-4 text-sm text-slate">
      {note && <p role="status" data-cdk-note={note.ok ? 'ok' : 'refused'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>{note.text}</p>}
      <QualificationsPanel register={data.register} reload={load} say={say} />
      <DisclosurePanel items={data.disclosure} reload={load} say={say} />
      {/* The office enters the CPI and the filing deadline here, each with its source and the day read (C232 part B). */}
      <Form6Panel canEnter />
      <SqaafPanel sqaaf={data.sqaaf} reload={load} say={say} />
    </div>
  );
}
