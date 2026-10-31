'use client';

import { useEffect, useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { KpiTile } from '@/components/app-ui/KpiTile';
import { Badge } from '@/components/ui/Badge';
import { Table, type TableColumn } from '@/components/ui/Table';
import type { MessageKey } from '@/lib/i18n';
import type { SchoolStaff, StaffRow } from '@/lib/control/school-staff';

// Control → a school → Staff (W13-B). Read-only: who is on the school's staff, what they do, whether they are active
// and the day they joined. The API reads it for the founder; this screen only shows it.

const dayWords = (lang: string, iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function SchoolStaffPanel({ schoolId }: { schoolId: string }) {
  const { t, lang } = useWords();
  const [data, setData] = useState<SchoolStaff | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const res = await fetch(`/api/control/schools/${schoolId}/staff`).catch(() => null);
      const body = res?.ok ? ((await res.json().catch(() => null)) as SchoolStaff | null) : null;
      if (!live) return;
      if (body?.counts && Array.isArray(body.staff)) setData(body);
      else setFailed(true);
    })();
    return () => {
      live = false;
    };
  }, [schoolId]);

  const columns: TableColumn<StaffRow>[] = [
    { key: 'name', header: t('control.school.staff.col.name'), render: (s) => s.name },
    { key: 'role', header: t('control.school.staff.col.role'), render: (s) => t(`role.${s.role}` as MessageKey) },
    { key: 'subjects', header: t('control.school.staff.col.subjects'), render: (s) => (s.subjects.length ? s.subjects.join(', ') : '—') },
    { key: 'status', header: t('control.school.staff.col.status'), render: (s) => <Badge variant={s.status === 'active' ? 'success' : 'neutral'}>{t(s.status === 'active' ? 'viewAs.status.active' : 'viewAs.status.inactive')}</Badge> },
    { key: 'joined', header: t('control.school.staff.col.joined'), render: (s) => (s.joined ? dayWords(lang, s.joined) : '—') },
  ];
  const c = data?.counts;

  return (
    <section data-school-staff className="flex flex-col gap-3">
      <h3 className="text-base font-bold text-slate">{t('control.school.staff.title')}</h3>
      {c && (
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
          <KpiTile tone="royal" icon="staff" tile={{ kind: 'kpi', id: 'staff-total', label: t('control.school.staff.kpi.total'), value: c.total, unit: 'count' }} />
          <KpiTile tone="turquoise" icon="teacher" tile={{ kind: 'kpi', id: 'staff-teaching', label: t('control.school.staff.kpi.teaching'), value: c.teaching, unit: 'count' }} />
          <KpiTile tone="tangerine" icon="operations" tile={{ kind: 'kpi', id: 'staff-non-teaching', label: t('control.school.staff.kpi.nonTeaching'), value: c.nonTeaching, unit: 'count' }} />
          <KpiTile tone="royal" icon="check" tile={{ kind: 'kpi', id: 'staff-active', label: t('control.school.staff.kpi.active'), value: c.active, unit: 'count' }} />
        </div>
      )}
      {c && c.inactive > 0 && <p className="text-sm text-slate/70">{t('control.school.staff.inactiveNote', { n: String(c.inactive) })}</p>}
      <Table
        columns={columns}
        rows={data?.staff ?? []}
        getRowId={(s) => s.userId}
        state={failed ? 'error' : data ? 'ready' : 'loading'}
        errorMessage={t('control.school.staff.failed')}
        emptyTitle={t('control.school.staff.empty.title')}
        emptyDescription={t('control.school.staff.empty.desc')}
      />
    </section>
  );
}
