import type { Sql } from '@/lib/jobs/types';

// The numbers on the founder's Control dashboard. Platform totals count
// LIVE schools only: a tagged test-fixture school (schools.is_test_fixture)
// is listed, with its badge, but its students, staff, fees, messages,
// consent and tickets are never added to a total (C64, C132). Runs as
// nca_super. "Today" and day buckets are India's calendar days.

export type ControlSchoolRow = { id: string; name: string; stage: string; students: number; isFixture: boolean };

export type ControlDashboardData = {
  schools: ControlSchoolRow[]; // every school, fixtures included, for the list
  liveSchools: number;
  activeStudents: number;
  totalStudents: number;
  totalStaff: number;
  totalComms: number; // last 30 days
  blocked: number;
  deliveryRate: number | null;
  consentActive: number;
  consentPending: number;
  feesCollectedMinor: number;
  feesDueMinor: number;
  ticketsOpen: number;
  ticketsInProgress: number;
  // Open or in-progress tickets from test schools: not counted above, but
  // they are in the queue, so the dashboard says so instead of "none waiting".
  ticketsFromTestSchools: number;
  dailySends: { day: string; sent: number; delivered: number }[]; // last 14 India days that have messages
};

const LIVE = `school_id in (select school_id from schools where not is_test_fixture)`;
const INDIA_TODAY = `(now() at time zone 'Asia/Kolkata')::date`;

export async function loadControlDashboard(db: Sql): Promise<ControlDashboardData> {
  const [schoolsRes, studentsRes, staffRes, commsRes, feesRes, dailyRes, ticketsRes] = await Promise.all([
    db.query(
      `select school_id, name, onboarding_stage, is_test_fixture,
              (select count(*) from students st where st.school_id = s.school_id) as student_count
       from schools s order by created_at desc`
    ),
    db.query(
      `select count(*) filter (where status = 'active') as active,
              count(*) filter (where status = 'pending_consent') as pending,
              count(*) as total
       from students where ${LIVE}`
    ),
    db.query(`select count(*) as total from teachers where ${LIVE}`),
    db.query(`select status, count(*) from communication_log where ${LIVE} and created_at > now() - interval '30 days' group by status`),
    db.query(
      `select coalesce(sum(amount_minor) filter (where status = 'paid'), 0) as collected_minor,
              coalesce(sum(amount_minor) filter (where status in ('pending','overdue')), 0) as due_minor
       from fees_ledger where ${LIVE}`
    ),
    db.query(
      `select (created_at at time zone 'Asia/Kolkata')::date::text as day, count(*) as sent,
              count(*) filter (where status in ('delivered','read')) as delivered
       from communication_log
       where ${LIVE} and (created_at at time zone 'Asia/Kolkata')::date > ${INDIA_TODAY} - 14
       group by 1 order by 1`
    ),
    db.query(
      `select count(*) filter (where status = 'open' and ${LIVE}) as open,
              count(*) filter (where status = 'in_progress' and ${LIVE}) as in_progress,
              count(*) filter (where status in ('open', 'in_progress') and not (${LIVE})) as from_test
       from support_tickets`
    ),
  ]);

  const schools: ControlSchoolRow[] = schoolsRes.rows.map((r) => ({ id: r.school_id, name: r.name, stage: r.onboarding_stage, students: Number(r.student_count), isFixture: r.is_test_fixture }));
  const byStatus: Record<string, number> = {};
  for (const row of commsRes.rows) byStatus[row.status] = Number(row.count);
  const totalComms = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const blocked = Object.entries(byStatus).filter(([k]) => k.startsWith('blocked')).reduce((a, [, v]) => a + v, 0);
  const readOrDelivered = (byStatus.read ?? 0) + (byStatus.delivered ?? 0);

  return {
    schools,
    liveSchools: schools.filter((s) => !s.isFixture).length,
    activeStudents: Number(studentsRes.rows[0]?.active ?? 0),
    totalStudents: Number(studentsRes.rows[0]?.total ?? 0),
    totalStaff: Number(staffRes.rows[0]?.total ?? 0),
    totalComms,
    blocked,
    deliveryRate: totalComms > 0 ? Math.round((readOrDelivered / totalComms) * 100) : null,
    consentActive: Number(studentsRes.rows[0]?.active ?? 0),
    consentPending: Number(studentsRes.rows[0]?.pending ?? 0),
    feesCollectedMinor: Number(feesRes.rows[0]?.collected_minor ?? 0),
    feesDueMinor: Number(feesRes.rows[0]?.due_minor ?? 0),
    ticketsOpen: Number(ticketsRes.rows[0]?.open ?? 0),
    ticketsInProgress: Number(ticketsRes.rows[0]?.in_progress ?? 0),
    ticketsFromTestSchools: Number(ticketsRes.rows[0]?.from_test ?? 0),
    dailySends: dailyRes.rows.map((r) => ({ day: r.day as string, sent: Number(r.sent), delivered: Number(r.delivered) })),
  };
}
