'use client';

import { useEffect, useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { KpiTile } from '@/components/app-ui/KpiTile';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Table, type TableColumn } from '@/components/ui/Table';
import type { MessageKey } from '@/lib/i18n';
import type { SchoolStudent, SchoolStudentsPage } from '@/lib/control/school-students';

// Control → a school → its students (W13-A). Read only: how many, how many active, how many in each class level, and
// the names a page at a time with a search. Nothing here changes a student.

const STATUS_BADGE = { active: 'success', pending_consent: 'neutral', inactive: 'neutral', transferred: 'neutral' } as const;
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';

export function SchoolStudentsPanel({ schoolId }: { schoolId: string }) {
  const { t } = useWords();
  const [data, setData] = useState<SchoolStudentsPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');

  // The search runs a moment after the typing stops, from the first page.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ((was) => {
        if (was !== typed.trim()) setPage(1);
        return typed.trim();
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [typed]);

  useEffect(() => {
    let live = true;
    (async () => {
      const res = await fetch(`/api/control/schools/${schoolId}/students?page=${page}&q=${encodeURIComponent(q)}`).catch(() => null);
      const body = res?.ok ? ((await res.json().catch(() => null)) as SchoolStudentsPage | null) : null;
      if (!live) return;
      if (body?.counts) {
        setData(body);
        setFailed(false);
      } else setFailed(true);
    })();
    return () => {
      live = false;
    };
  }, [schoolId, page, q]);

  const columns: TableColumn<SchoolStudent>[] = [
    { key: 'name', header: t('control.school.students.col.name'), render: (s) => <span className="font-semibold">{s.name}</span> },
    { key: 'admission', header: t('control.school.students.col.admission'), render: (s) => s.admissionNo ?? '—' },
    { key: 'class', header: t('control.school.students.col.class'), render: (s) => (s.className ? (s.section && !s.className.includes(s.section) ? `${s.className} ${s.section}` : s.className) : '—') },
    { key: 'status', header: t('control.school.students.col.status'), render: (s) => <Badge variant={STATUS_BADGE[s.status as keyof typeof STATUS_BADGE] ?? 'neutral'}>{t(`control.school.students.status.${s.status}` as MessageKey)}</Badge> },
  ];

  if (failed && !data) return <p role="alert" className="text-sm font-semibold text-red-800">{t('control.school.students.failed')}</p>;
  if (!data) return <p role="status" className="text-sm text-slate/70">{t('control.school.students.loading')}</p>;

  const { counts } = data;
  if (counts.total === 0) return <EmptyState title={t('control.school.students.empty.title')} description={t('control.school.students.empty.description')} />;
  const pages = Math.max(1, Math.ceil(data.matching / data.pageSize));

  return (
    <section data-school-students className="flex flex-col gap-4">
      <h3 className="text-base font-bold text-slate">{t('control.school.students.title')}</h3>
      {failed && <p role="alert" className="text-sm font-semibold text-red-800">{t('control.school.students.failed')}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile tile={{ kind: 'kpi', id: 'students-total', label: t('control.school.students.total'), value: counts.total, unit: 'count' }} tone="sapphire" />
        <KpiTile tile={{ kind: 'kpi', id: 'students-active', label: t('control.school.students.active'), value: counts.active, unit: 'count' }} tone="emerald" />
      </div>
      <div data-students-by-level className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-4">
        <p className="text-sm font-bold text-slate">{t('control.school.students.byLevel')}</p>
        <ul className="flex flex-wrap gap-2">
          {counts.byLevel.map((l) => (
            <li key={l.level ?? 'none'} className="rounded-md border border-slate/10 px-3 py-2 text-sm text-slate">
              <span className="font-semibold">{l.level === null ? t('control.school.students.level.none') : t('control.school.students.level', { level: l.level })}</span>
              <span className="ml-2 tabular-nums text-slate/70">{l.count}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="max-w-md">
        <Input id="school-students-search" type="search" label={t('control.school.students.search')} autoComplete="off" maxLength={60} value={typed} onChange={(e) => setTyped(e.target.value)} />
      </div>
      {data.students.length === 0 ? (
        <EmptyState title={t('control.school.students.noMatch')} />
      ) : (
        <Table columns={columns} rows={data.students} getRowId={(s) => s.studentId} />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-students-prev disabled={page <= 1} className={TAP} onClick={() => setPage(page - 1)}>
          {t('control.school.students.prev')}
        </button>
        <span className="text-sm text-slate/70">{t('control.school.students.page', { page: data.page, pages })}</span>
        <button type="button" data-students-next disabled={page >= pages} className={TAP} onClick={() => setPage(page + 1)}>
          {t('control.school.students.next')}
        </button>
      </div>
    </section>
  );
}
