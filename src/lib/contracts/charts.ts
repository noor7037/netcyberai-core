// Chart data shapes (17 §4 "one clear message per chart, value labels, a
// table view per chart"; Decision Log C110). The API returns these; the
// Experience lane's chart kit draws them. Every value is computed from
// real records: null means "no data yet", never a guess.

export type ValueUnit = 'count' | 'percent' | 'inr_paise' | 'days' | 'minutes' | 'score';

export type Trend = { direction: 'up' | 'down' | 'flat'; delta: number; unit: ValueUnit; comparedTo: string; good: 'up' | 'down' | 'neither' };

export type KpiTile = {
  kind: 'kpi';
  id: string;
  label: string;
  value: number | null;
  unit: ValueUnit;
  trend?: Trend;
  drillHref?: string; // every principal tile drills down (16 §4, P4)
};

export type TimeSeriesChart = {
  kind: 'time_series';
  id: string;
  title: string; // the one message, for example "Attendance this month"
  unit: ValueUnit;
  granularity: 'day' | 'week' | 'month';
  series: readonly { id: string; label: string; points: readonly { t: string; v: number | null }[] }[]; // t: ISO date
  target?: number;
};

export type CategoryChart = {
  kind: 'category';
  id: string;
  title: string;
  unit: ValueUnit;
  orientation: 'vertical' | 'horizontal';
  categories: readonly string[];
  series: readonly { id: string; label: string; values: readonly (number | null)[] }[];
};

export type ShareChart = {
  kind: 'share';
  id: string;
  title: string;
  unit: ValueUnit;
  slices: readonly { id: string; label: string; value: number }[];
};

export type ChartData = TimeSeriesChart | CategoryChart | ShareChart;

export type TableView = { columns: readonly string[]; rows: readonly (readonly (string | number | null)[])[] };

// The table every chart must also offer (screen readers, exports, phones).
export function chartAsTable(chart: ChartData): TableView {
  switch (chart.kind) {
    case 'time_series': {
      const dates = Array.from(new Set(chart.series.flatMap((s) => s.points.map((p) => p.t)))).sort();
      return {
        columns: ['Date', ...chart.series.map((s) => s.label)],
        rows: dates.map((t) => [t, ...chart.series.map((s) => s.points.find((p) => p.t === t)?.v ?? null)]),
      };
    }
    case 'category':
      return {
        columns: ['', ...chart.series.map((s) => s.label)],
        rows: chart.categories.map((c, i) => [c, ...chart.series.map((s) => s.values[i] ?? null)]),
      };
    case 'share':
      return { columns: ['', 'Value'], rows: chart.slices.map((s) => [s.label, s.value]) };
  }
}
