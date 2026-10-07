import { OfficeDashboardView, type OfficeDashboardData } from '@/components/dashboards/OfficeDashboardView';
import { withTenantContext } from '@/lib/auth/db';
import type { SessionClaims } from '@/lib/auth/types';

// PRD §7.3/§4.4's "exception-first" structure (Needs your decision today
// / Today / This week / Warnings) is kept as the underlying information
// architecture -- it was already decided and is sound -- but each
// section is now filled with real queries against the signed-in
// school's own data (RLS-scoped via withTenantContext, no app-level
// filtering needed) instead of static placeholder text, per the
// founder's explicit "build the actual, with real fields" instruction.
// KPI-grid-plus-chart visual layout matches the founder-supplied
// reference design (now docs/19 §3.3, drawn by OfficeDashboardView); TC-request/correction-request/marks-approval
// workflows referenced in the original placeholder text are NOT
// queried here because those workflows don't exist in the data model
// yet -- shown honestly via what real signals exist (pending consent,
// overdue fees, blocked sends) rather than inventing fields for
// features that aren't built.
export async function OfficeDashboard({ session }: { session: SessionClaims }) {
  const data: OfficeDashboardData = await withTenantContext(session, async (client) => {
    const [studentsRes, staffRes, attendanceTodayRes, attendanceTrendRes, feesRes, consentRes, blockedRes, activityRes, schoolRes] = await Promise.all([
      client.query(`select count(*) filter (where status = 'active') as active, count(*) as total from students`),
      client.query(`select count(*) as total from teachers`),
      client.query(
        `select status, count(*) from attendance where date = (now() at time zone 'Asia/Kolkata')::date group by status`
      ),
      client.query(
        `select date::text as date, count(*) filter (where status = 'present') as present, count(*) as total
         from attendance
         where date > (now() at time zone 'Asia/Kolkata')::date - 14 and date <= (now() at time zone 'Asia/Kolkata')::date
         group by date order by date`
      ),
      client.query(
        `select
           coalesce(sum(amount_minor) filter (where status = 'paid'), 0) as collected_minor,
           coalesce(sum(amount_minor) filter (where status = 'pending'), 0) as pending_minor,
           coalesce(sum(amount_minor) filter (where status = 'overdue'), 0) as overdue_minor,
           coalesce(sum(amount_minor) filter (where status::text = 'partial'), 0) as partial_minor,
           coalesce(sum(amount_minor) filter (where status::text = 'waived'), 0) as waived_minor,
           count(*) filter (where status = 'overdue') as overdue_count
         from fees_ledger`
      ),
      client.query(`select count(*) filter (where status = 'pending_consent') as pending, count(*) as total from students`),
      client.query(`select count(*) as total from communication_log where status::text like 'blocked%' and created_at > now() - interval '7 days'`),
      client.query(
        `select event_action, occurred_at from audit_log order by occurred_at desc limit 6`
      ),
      client.query(`select name from schools where school_id = $1`, [session.schoolId]),
    ]);

    const attToday: Record<string, number> = {};
    for (const row of attendanceTodayRes.rows) attToday[row.status] = Number(row.count);
    const presentToday = attToday.present ?? 0;
    const absentToday = attToday.absent ?? 0;
    const markedToday = presentToday + absentToday + (attToday.late ?? 0);

    return {
      schoolName: (schoolRes.rows[0]?.name as string | undefined) ?? 'Your school',
      activeStudents: Number(studentsRes.rows[0]?.active ?? 0),
      totalStudents: Number(studentsRes.rows[0]?.total ?? 0),
      totalStaff: Number(staffRes.rows[0]?.total ?? 0),
      presentToday,
      absentToday,
      markedToday,
      attendanceTrend: attendanceTrendRes.rows.map((r) => ({
        date: r.date as string,
        pct: Math.round((Number(r.present) / Number(r.total)) * 1000) / 10, // one decimal, as the tile shows it
      })),
      feesCollectedMinor: Number(feesRes.rows[0]?.collected_minor ?? 0),
      feesPendingMinor: Number(feesRes.rows[0]?.pending_minor ?? 0),
      feesOverdueMinor: Number(feesRes.rows[0]?.overdue_minor ?? 0),
      feesPartialMinor: Number(feesRes.rows[0]?.partial_minor ?? 0),
      feesWaivedMinor: Number(feesRes.rows[0]?.waived_minor ?? 0),
      overdueCount: Number(feesRes.rows[0]?.overdue_count ?? 0),
      consentPending: Number(consentRes.rows[0]?.pending ?? 0),
      consentTotal: Number(consentRes.rows[0]?.total ?? 0),
      blockedThisWeek: Number(blockedRes.rows[0]?.total ?? 0),
      recentActivity: activityRes.rows.map((r) => ({ action: r.event_action as string, at: r.occurred_at as string })),
    };
  });

  return <OfficeDashboardView data={data} />;
}
