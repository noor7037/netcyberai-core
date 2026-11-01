'use client';

import { useEffect, useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { KpiTile } from '@/components/app-ui/KpiTile';
import { AreaTrend } from '@/components/app-ui/ProgressCharts';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, type TableColumn } from '@/components/ui/Table';
import type { ClassToday, SchoolAttendance } from '@/lib/control/school-attendance';

// Control → a school → Attendance (W13-C): read-only. Today's marking, the last 14 days and the correction requests
// waiting, counted by src/lib/control/school-attendance.ts for this school. No student is named. A day or a school
// with nothing marked says so; it never shows zero present.

export function SchoolAttendancePanel({ schoolId }: { schoolId: string }) {
  const { t } = useWords();
  const [data, setData] = useState<SchoolAttendance | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await fetch(`/api/control/schools/${schoolId}/attendance`).catch(() => null);
      const body = res?.ok ? ((await res.json().catch(() => null)) as SchoolAttendance | null) : null;
      if (!live) return;
      if (body?.days) setData(body);
      else setFailed(true);
    })();
    return () => {
      live = false;
    };
  }, [schoolId]);

  if (failed) return <p role="alert" className="text-sm font-semibold text-red-800">{t('control.school.attendance.failed')}</p>;
  if (!data) return <p role="status" className="text-sm text-slate/70">{t('control.school.attendance.loading')}</p>;
  if (!data.everMarked && data.waitingCorrections === 0) {
    return <EmptyState title={t('control.school.attendance.none.title')} description={t('control.school.attendance.none.description')} />;
  }

  // Nothing marked today shows as "no data", never as zero present.
  const counted = (v: number) => (data.studentsMarked > 0 ? v : null);
  const columns: TableColumn<ClassToday>[] = [
    { key: 'class', header: t('control.school.attendance.col.class'), render: (c) => c.name },
    { key: 'section', header: t('control.school.attendance.col.section'), render: (c) => c.section ?? t('control.school.attendance.section.none') },
    { key: 'marked', header: t('control.school.attendance.col.marked'), render: (c) => t(c.marked ? 'control.school.attendance.marked.yes' : 'control.school.attendance.marked.no') },
    { key: 'present', header: t('control.school.attendance.col.present'), render: (c) => (c.marked ? c.present : '—') },
    { key: 'absent', header: t('control.school.attendance.col.absent'), render: (c) => (c.marked ? c.absent : '—') },
  ];

  return (
    <section data-school-attendance className="flex flex-col gap-4">
      <h3 className="text-base font-bold text-slate">{t('control.school.attendance.today.title')}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiTile tone="royal" icon="school" tile={{ kind: 'kpi', id: 'classes', label: t('control.school.attendance.tile.classes', { total: String(data.classesTotal) }), value: data.classesMarked, unit: 'count' }} />
        <KpiTile tone="turquoise" icon="student" tile={{ kind: 'kpi', id: 'present', label: t('control.school.attendance.tile.present'), value: counted(data.present), unit: 'count' }} />
        <KpiTile tone="coral" icon="student" tile={{ kind: 'kpi', id: 'absent', label: t('control.school.attendance.tile.absent'), value: counted(data.absent), unit: 'count' }} />
        <KpiTile tone="grape" icon="student" tile={{ kind: 'kpi', id: 'late', label: t('control.school.attendance.tile.late'), value: counted(data.late), unit: 'count' }} />
        <KpiTile tone="royal" icon="school" tile={{ kind: 'kpi', id: 'waiting', label: t('control.school.attendance.tile.waiting'), value: data.waitingCorrections, unit: 'count' }} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AreaTrend title={t('control.school.attendance.rate.title')} seriesLabel={t('control.school.attendance.rate.series')} unit="percent" tone="turquoise" points={data.days.map((d) => ({ t: d.date, v: d.presentRate }))} emptyHint={t('control.school.attendance.rate.empty')} />
        <AreaTrend title={t('control.school.attendance.classes.title')} seriesLabel={t('control.school.attendance.classes.series')} unit="count" tone="royal" points={data.days.map((d) => ({ t: d.date, v: d.classesMarked }))} emptyHint={t('control.school.attendance.classes.empty')} />
      </div>

      <h3 className="text-base font-bold text-slate">{t('control.school.attendance.table.title')}</h3>
      <Table columns={columns} rows={data.classes} getRowId={(c) => c.classId} empty={<EmptyState title={t('control.school.attendance.table.none')} />} />
    </section>
  );
}
