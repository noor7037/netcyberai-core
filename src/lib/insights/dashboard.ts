import type { ColorToken } from '@/lib/contracts/modules';
import type { CsvValue } from '@/lib/export/csv';
import { minorToRupees } from '@/lib/fees/money';
import { isMessageKey, t, tCount, type Lang, type MessageKey } from '@/lib/i18n';
import type { FactId, FactRange, FactResult, FactUnit } from './types';

// What the office's dashboard shows, in what order (docs/26 slice 8d, C203;
// docs/19 §3.3). The screen and the CSV export are both drawn from this one
// arrangement of the loaded facts, so the file has what is on the screen.
// A fact that was not loaded (not this role's, its module off, or it could
// not be computed) is simply not there: no tile, no row, no zero.
//
// Fees sit in their own group, apart from learning (docs/26 §3 rule 5), and
// nothing here is ordered by a rate or a count (rule 4).

export const DASHBOARD_GROUPS: readonly { id: 'today' | 'money' | 'learning' | 'parents' | 'running'; tone: ColorToken; facts: readonly FactId[] }[] = [
  { id: 'today', tone: 'royal', facts: ['attendance.classes_marked', 'attendance.present', 'attendance.absent', 'attendance.late', 'attendance.leave'] },
  { id: 'money', tone: 'tangerine', facts: ['fees.collected', 'fees.overdue', 'fees.owed', 'fees.promises_due', 'fees.upi_to_verify'] },
  { id: 'learning', tone: 'azure', facts: ['attendance.present_rate', 'homework.set', 'homework.checked', 'homework.not_done', 'followups.open'] },
  { id: 'parents', tone: 'cyan', facts: ['pulse.sent', 'pulse.understood', 'pulse.needs_help', 'messages.total', 'complaints.open', 'notices.waiting', 'ptm.coming', 'events.coming', 'parent_ai.drafts'] },
  // Staff leave and covers (8b, 8c) are here as counts for running the day: never a list of who, never an order of people.
  { id: 'running', tone: 'sapphire', facts: ['students.active', 'students.waiting_consent', 'staff.leave_waiting', 'staff.on_leave_today', 'proxy.uncovered_today', 'whatsapp.spend', 'tickets.open'] },
];
export type DashboardGroupId = (typeof DASHBOARD_GROUPS)[number]['id'];

// The attention list, in this order: what the day cannot go on without first.
export const DASHBOARD_ATTENTION: readonly FactId[] = ['attendance.classes_unmarked', 'proxy.uncovered_today', 'complaints.overdue', 'notices.waiting', 'staff.leave_waiting', 'fees.upi_to_verify', 'fees.promises_due', 'fees.overdue', 'followups.open', 'parent_ai.drafts', 'students.waiting_consent', 'messages.failed', 'messages.held', 'tickets.waiting'];

// `fact`: the fact a row's number IS, where the row is a fact of its own (today's "Present", the fees "Not yet
// due"). Its rule, source and time are that fact's. A row without one is a part of the chart's own fact.
export type ChartRow = { key: string; value: number | null; href?: string; fact?: FactResult };
export type DashboardChart = {
  id: 'attendance-today' | 'present-rate' | 'fees-owed' | 'messages-by-state' | 'homework-checked';
  kind: 'bars' | 'line' | 'ring';
  tone: ColorToken;
  unit: FactUnit;
  // The fact whose rule, source and time the chart's "Why this?" shows first, and that the title's number is.
  fact: FactResult;
  // More facts the chart draws, each with its own rule in "Why this?" (the fees chart is two facts side by side).
  others?: FactResult[];
  // The label of a row is `chart.<id>.<key>`; a line chart's rows are dates.
  rows: ChartRow[];
  // What the title says: "{value} of {total}", a value alone, or (null) no number: every number a title says is
  // one fact's own value. Nothing is added up here.
  value: number | null;
  total?: number;
  href: string | null;
};

export type DashboardModel = { groups: { id: DashboardGroupId; tone: ColorToken; tiles: FactResult[] }[]; attention: FactResult[]; charts: DashboardChart[] };

export function dashboardModel(facts: readonly FactResult[]): DashboardModel {
  const by = new Map(facts.map((f) => [f.id, f]));
  const have = (ids: readonly FactId[]) => ids.map((id) => by.get(id)).filter((f): f is FactResult => f !== undefined);
  const ok = (id: FactId) => {
    const f = by.get(id);
    return f && f.state === 'ok' ? f : undefined;
  };
  const charts: DashboardChart[] = [];

  const marked = ok('attendance.students_marked');
  const marks = have(['attendance.present', 'attendance.absent', 'attendance.late', 'attendance.leave']).filter((f) => f.state === 'ok');
  if (marked && marks.length === 4) {
    charts.push({
      id: 'attendance-today', kind: 'bars', tone: 'royal', unit: 'count', fact: marked, value: marked.value, total: marked.total, href: marked.href,
      rows: [...marks.map((f) => ({ key: f.id.split('.')[1], value: f.value, href: f.href ?? undefined, fact: f })), { key: 'not_marked', value: marked.parts?.find((p) => p.key === 'not_marked')?.value ?? null, href: marked.parts?.find((p) => p.key === 'not_marked')?.href }],
    });
  }
  const rate = by.get('attendance.present_rate');
  if (rate && rate.state !== 'not_set_up' && (rate.series?.length ?? 0) > 1) charts.push({ id: 'present-rate', kind: 'line', tone: 'azure', unit: 'percent', fact: rate, value: rate.value, href: rate.href, rows: (rate.series ?? []).map((p) => ({ key: p.date, value: p.value })) });
  const owed = ok('fees.owed');
  const overdue = ok('fees.overdue');
  // Two facts side by side, each row with its own rule and its own rows. The title says no total: the two added
  // together would be a number with no rule of its own and no screen that lists it.
  if (owed && overdue) charts.push({ id: 'fees-owed', kind: 'bars', tone: 'tangerine', unit: 'inr_paise', fact: owed, others: [overdue], value: null, href: null, rows: [{ key: 'owed', value: owed.value, href: owed.href ?? undefined, fact: owed }, { key: 'overdue', value: overdue.value, href: overdue.href ?? undefined, fact: overdue }] });
  const messages = ok('messages.total');
  if (messages) charts.push({ id: 'messages-by-state', kind: 'bars', tone: 'cyan', unit: 'count', fact: messages, value: messages.value, href: messages.href, rows: (messages.parts ?? []).map((p) => ({ key: p.key, value: p.value, href: p.href })) });
  const checked = ok('homework.checked');
  if (checked) charts.push({ id: 'homework-checked', kind: 'ring', tone: 'azure', unit: 'count', fact: checked, value: checked.value, total: checked.total, href: checked.href, rows: (checked.parts ?? []).map((p) => ({ key: p.key, value: p.value, href: p.href })) });

  return {
    groups: DASHBOARD_GROUPS.map((g) => ({ id: g.id, tone: g.tone, tiles: have(g.facts) })).filter((g) => g.tiles.length > 0),
    attention: have(DASHBOARD_ATTENTION).filter((f) => f.attention),
    charts,
  };
}

// The number an attention item's sentence says ("2 fee entries are overdue"): how many things ask for THIS
// reader. Where a fact says that itself (`attentionCount`: the leave requests the reader may decide, not their
// own), it is that; otherwise the rows behind an amount (`count`), otherwise the value. The screen and the CSV's
// attention rows both ask here, so the file says the number the screen says.
export const attentionNumber = (fact: Pick<FactResult, 'attentionCount' | 'count' | 'value'>): number => fact.attentionCount ?? fact.count ?? fact.value ?? 0;

// ---- Words and numbers ---------------------------------------------------------

const grouped = (value: number, fraction = 0) => value.toLocaleString('en-IN', { maximumFractionDigits: fraction });

// A number as the dashboard writes it: Indian grouping, one decimal for a rate, and rupees from paise by the
// fee screens' own writer (src/lib/fees/money.ts), so a tile and the list it opens write one amount one way.
export function sayNumber(value: number, unit: FactUnit): string {
  if (unit === 'inr_paise') return `₹${minorToRupees(Math.round(value))}`;
  return unit === 'percent' ? `${grouped(value, 1)}%` : grouped(value);
}

// A message that is looked up by a built key; the key itself is shown if a fact has no words yet (a test fails first).
export const say = (lang: Lang, key: string, params?: Record<string, string | number>): string => (isMessageKey(key) ? t(lang, key as MessageKey, params) : key);

const dayWords = (lang: Lang, iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// The days a number is about, in words: "Today", "8 Oct to 14 Oct", "As of now", "This month", "From today".
export function sayPeriod(lang: Lang, fact: Pick<FactResult, 'period' | 'range'>): string {
  if (fact.period === 'range' && fact.range) return fact.range.from === fact.range.to ? t(lang, 'dash.period.today') : t(lang, 'dash.period.range', { from: dayWords(lang, fact.range.from), to: dayWords(lang, fact.range.to) });
  return t(lang, `dash.period.${fact.period === 'range' ? 'today' : fact.period}` as MessageKey);
}
export const sayDay = dayWords;

// The value as a tile says it: a count, "x of y", an amount in rupees, a rate, or what is missing.
export function sayValue(lang: Lang, fact: FactResult): string {
  if (fact.state === 'not_set_up') return t(lang, 'dash.notSetUp');
  if (fact.state === 'no_data' || fact.value === null) return t(lang, 'dash.noData');
  // "x of y" where the whole is part of the number's meaning; a rate's total is its days, said under the number.
  return saysWhole(fact) ? t(lang, 'dash.of', { value: sayNumber(fact.value, fact.unit), total: sayNumber(fact.total as number, fact.unit) }) : sayNumber(fact.value, fact.unit);
}
const WITH_WHOLE: readonly FactId[] = ['attendance.classes_marked', 'attendance.classes_unmarked', 'attendance.students_marked', 'homework.checked', 'whatsapp.spend', 'proxy.uncovered_today'];
// Whether the tile says this fact as "x of y". The screen and the CSV's "Out of" column both ask here.
// A count out of nothing is said as the count alone: on a day with no period to cover the tile says "0", not "0 of 0".
const saysWhole = (fact: FactResult): boolean => fact.state === 'ok' && fact.total !== undefined && fact.unit !== 'percent' && WITH_WHOLE.includes(fact.id) && !(fact.unit === 'count' && fact.total === 0);

export const sayTime = (lang: Lang, iso: string) => new Date(iso).toLocaleTimeString(lang === 'hi' ? 'hi-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
export const saySources = (lang: Lang, sources: readonly string[]) => sources.map((s) => say(lang, `dash.source.${s}`)).join(', ');

// Why a fact is "not set up": what is missing and what starts it counting.
export const sayNotSetUp = (lang: Lang, fact: Pick<FactResult, 'moduleId'>): string => say(lang, isMessageKey(`dash.notSetUp.${fact.moduleId}`) ? `dash.notSetUp.${fact.moduleId}` : 'dash.notSetUp');

// A second line under a tile's number, for the facts that have one (`fact.<id>.detail`): the counts the number
// is made of, such as "Booked: 3 of 8 times". Null when the fact has none or was not counted.
export function sayDetail(lang: Lang, fact: FactResult): string | null {
  const key = `fact.${fact.id}.detail`;
  if (fact.state !== 'ok' || !isMessageKey(key)) return null;
  const params: Record<string, string | number> = { count: fact.count ?? 0, days: fact.total ?? 0 };
  for (const p of fact.parts ?? []) params[p.key] = sayNumber(p.value, p.unit ?? 'count');
  return t(lang, key, params);
}

// A chart's one message, and the words of each of its rows.
export function chartTitle(lang: Lang, chart: DashboardChart): string {
  if (chart.value === null) return say(lang, isMessageKey(`chart.${chart.id}.title.none`) ? `chart.${chart.id}.title.none` : `chart.${chart.id}.title`, { value: '', total: '' });
  return say(lang, `chart.${chart.id}.title`, { value: sayNumber(chart.value, chart.unit), total: chart.total === undefined ? '' : sayNumber(chart.total, chart.unit) });
}
export function chartRowLabel(lang: Lang, chart: DashboardChart, row: ChartRow): string {
  if (chart.kind === 'line') return dayWords(lang, row.key);
  // The message states keep the words the Communication screen uses for them.
  return say(lang, chart.id === 'messages-by-state' ? `msg.state.${row.key}` : `chart.${chart.id}.${row.key}`);
}

// ---- The CSV of what is on screen ----------------------------------------------

export const DASHBOARD_CSV_HEADER: readonly MessageKey[] = ['dash.csv.section', 'dash.csv.number', 'dash.csv.value', 'dash.csv.outOf', 'dash.csv.unit', 'dash.csv.days', 'dash.csv.countedAt', 'dash.csv.rule', 'dash.csv.source', 'dash.csv.opens'];

const csvNumber = (value: number | null, unit: FactUnit): CsvValue => (value === null ? null : unit === 'inr_paise' ? value / 100 : value);

// One row a tile, one an attention item, one a chart row: the screen, top to bottom.
//   - "Out of" is written only where the tile itself says "x of y" (WITH_WHOLE): the file says no whole that the
//     screen does not say.
//   - A chart row that is a fact of its own carries that fact's rule, source and time, not the chart's.
//   - `leftOut`: how many numbers could not be worked out when the file was made. The screen says so; so does
//     the file, in its first row, so nobody later reads it as the whole picture.
export function dashboardCsvRows(lang: Lang, model: DashboardModel, range: FactRange, leftOut = 0): CsvValue[][] {
  const unit = (u: FactUnit) => t(lang, `dash.unit.${u}` as MessageKey);
  const days = (f: FactResult) => (f.range ? `${f.range.from} / ${f.range.to}` : f.period === 'range' ? `${range.from} / ${range.to}` : sayPeriod(lang, f));
  const state = (f: FactResult) => (f.state === 'not_set_up' ? t(lang, 'dash.notSetUp') : f.state === 'no_data' ? t(lang, 'dash.noData') : null);
  const row = (section: string, label: string, f: FactResult, value: number | null, total: number | undefined, u: FactUnit, href: string | null | undefined): CsvValue[] => [
    section, label, state(f) ?? csvNumber(value, u), total === undefined ? null : csvNumber(total, u), unit(u), days(f), f.countedAt, `${say(lang, f.rule.key)} (v${f.rule.version})`, f.sources.join(' '), href ?? null,
  ];
  const out: CsvValue[][] = [];
  if (leftOut > 0) out.push([t(lang, 'dash.csv.note'), tCount(lang, 'dash.csv.leftOut', leftOut), leftOut, null, unit('count'), null, null, null, null, null]);
  // An attention row says the number its sentence says on the screen (attentionNumber): a count of things, unless
  // the fact has neither `attentionCount` nor `count` and its value is the number.
  for (const f of model.attention) out.push(row(t(lang, 'dash.attention.title'), say(lang, `fact.${f.id}.label`), f, attentionNumber(f), undefined, f.attentionCount === undefined && f.count === undefined ? f.unit : 'count', f.href));
  for (const g of model.groups) for (const f of g.tiles) out.push(row(t(lang, `dash.group.${g.id}` as MessageKey), say(lang, `fact.${f.id}.label`), f, f.value, saysWhole(f) ? f.total : undefined, f.unit, f.href));
  for (const c of model.charts) {
    for (const r of c.rows) {
      const of = r.fact ?? c.fact;
      out.push(row(chartTitle(lang, c), c.kind === 'line' ? r.key : chartRowLabel(lang, c, r), c.kind === 'line' && r.value === null ? { ...of, state: 'no_data' } : of, r.value, undefined, c.unit, r.href ?? c.href));
    }
  }
  return out;
}
