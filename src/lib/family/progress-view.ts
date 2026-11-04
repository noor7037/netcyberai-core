// W19-C: the numbers of the child's Progress screen and the home's activity tiles, made only of what is stored:
// topics checked and mastered (family.topic_progress, checked answers only, 02 §4.2), the subjects open to this child,
// and checked answers per India day (family.attempts). Nothing estimated, no time in the app, no comparison with anyone.
import type { TopicProgress } from './learning';

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export type ProgressStats = { subjects: number; checked: number; mastered: number; average: number | null };

// Average progress: mastered out of checked, as a whole percent; null before the first checked topic (never zero
// standing for "nothing yet").
export function progressStats(progress: Pick<TopicProgress, 'mastered'>[], subjectsOpen: number): ProgressStats {
  const checked = progress.length;
  const mastered = progress.filter((p) => p.mastered).length;
  return { subjects: subjectsOpen, checked, mastered, average: checked ? Math.round((mastered / checked) * 100) : null };
}

export type DayCount = { day: string; n: number };
export type WeekBar = DayCount & { share: number; today: boolean };

// The seven India days ending today, oldest first, each with its count (0 for a day with none).
export function weekDays(today: string, counts: DayCount[]): DayCount[] {
  const by = new Map(counts.map((c) => [c.day, c.n]));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i - 6);
    const day = d.toISOString().slice(0, 10);
    return { day, n: by.get(day) ?? 0 };
  });
}

// Bar heights as a share of the week's highest day (a week of zeros stays flat).
export function weekBars(days: DayCount[], today: string): WeekBar[] {
  const top = Math.max(0, ...days.map((d) => d.n));
  return days.map((d) => ({ ...d, share: top > 0 ? d.n / top : 0, today: d.day === today }));
}

// Checked answers per India day over the last seven days, today included.
export async function weekAnswers(db: Db, accountId: string, childId: string, today: string): Promise<DayCount[]> {
  const { rows } = await db.query(
    `select answered_on::text as day, count(*)::int as n from family.attempts
      where account_id = $1 and child_id = $2 and answered_on > $3::date - 7 and answered_on <= $3::date group by answered_on`,
    [accountId, childId, today]
  );
  return weekDays(today, rows.map((r) => ({ day: String(r.day).slice(0, 10), n: Number(r.n) })));
}
