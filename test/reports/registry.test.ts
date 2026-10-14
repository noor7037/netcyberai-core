import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { moduleById, type SchoolRole } from '@/lib/contracts/modules';
import { TOURS } from '@/lib/contracts/tours';
import { HELP_ARTICLES } from '@/content/help/articles';
import { isMessageKey, t } from '@/lib/i18n';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';
import { FACTS, rangeFor } from '@/lib/insights';
import { READ_ROUTES, WRITE_ROUTES, readModuleFor } from '@/lib/frameworks/write-guard';
import { RECEIPT_METHODS, REPORTS, REPORT_GROUPS, REPORT_IDS, REPORT_MAX_DAYS, REPORT_ROLES, daysIn, fileCell, fileHeading, isRealDay, rangeQuery, readReportRange, reportCsv, reportEmpty, reportTable, reportsFor, sayCell, totalOf, type ReportResult } from '@/lib/reports';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';
import type { SchoolEntitlements } from '@/lib/contracts/entitlements';

// Reports (docs/26 slice 8h, C207): the fixed list itself, its words in both languages, the days a report may
// cover, and how a table is written for the screen and for the file. No database here: the numbers are proven on
// the whole schema in reports.test.ts.

const DEVANAGARI = /[ऀ-ॿ]/;
const ents = (off: readonly string[] = []): SchoolEntitlements => ({ schoolId: 's', plan: 'standard', accessMode: 'full', modules: Object.fromEntries(MODULE_REGISTRY.map((m) => [m.id, { enabled: !off.includes(m.id), source: 'plan' as const }])) });
const ids = (role: SchoolRole, off: readonly string[] = []) => reportsFor(role, ents(off)).map((r) => r.id);
const params = (query: string) => new URLSearchParams(query);
const TODAY = '2026-10-14';

describe('the fixed list of reports', () => {
  it('is the eight reports of v1, each in one group, and nothing else', () => {
    expect(REPORTS.map((r) => r.id)).toEqual([...REPORT_IDS]);
    expect([...REPORT_IDS]).toEqual(['daily-collection', 'dues', 'attendance-by-class', 'absentees', 'homework-coverage', 'pulse-coverage', 'messages-by-state', 'staff-leave']);
    for (const r of REPORTS) expect(REPORT_GROUPS, r.id).toContain(r.group);
    expect(REPORT_ROLES).toEqual(['principal', 'school_admin', 'accountant', 'academic_coordinator']);
  });

  it('gives each role its own reports: an accountant no learning report, a coordinator no fee report, a teacher none', () => {
    expect(ids('principal')).toEqual([...REPORT_IDS]);
    expect(ids('school_admin')).toEqual([...REPORT_IDS]);
    expect(ids('accountant')).toEqual(['daily-collection', 'dues']);
    expect(ids('academic_coordinator')).toEqual(['attendance-by-class', 'absentees', 'homework-coverage']);
    expect(ids('teacher')).toEqual([]);
    // Fees sit in their own group; nothing about a child or a class is in it, and no fee report is in another.
    for (const r of REPORTS) expect(r.group === 'money', r.id).toBe(r.moduleId === 'fees');
    for (const role of REPORT_ROLES) for (const r of reportsFor(role, ents())) expect(r.roles, `${r.id} → ${role}`).toContain(role);
  });

  it('a report is never wider than Reports itself, than its own module, or than the dashboard number it must equal', () => {
    for (const r of REPORTS) {
      for (const role of r.roles) {
        expect(REPORT_ROLES, `${r.id} → ${role}`).toContain(role);
        expect(moduleById(r.moduleId).roles, `${r.id} → ${role} in ${r.moduleId}`).toContain(role);
      }
      // Whoever may read the report may read the fact it is compared with: the same roles the tables allow.
      for (const a of r.agrees) {
        const fact = FACTS.find((f) => f.id === a.fact);
        expect(fact, `${r.id}: ${a.fact}`).toBeDefined();
        for (const role of r.roles) expect(fact!.roles, `${r.id} → ${role} reads ${a.fact}`).toContain(role);
        expect(r.columns.some((c) => c.key === a.column), `${r.id}: column ${a.column}`).toBe(true);
        // A report about a span of days is compared with a number about the same span; one about now with one about now.
        expect(fact!.period, `${r.id}: ${a.fact}`).toBe(r.period);
      }
    }
    // The one report with no dashboard number is the leave list.
    expect(REPORTS.filter((r) => r.agrees.length === 0).map((r) => r.id)).toEqual(['staff-leave']);
    // A report that repeats a dashboard number's "not set up" asks a number every one of its readers may read,
    // about the same span: it is one of the numbers its own total equals.
    for (const r of REPORTS.filter((x) => x.notSetUpAs)) {
      const fact = FACTS.find((f) => f.id === r.notSetUpAs)!;
      for (const role of r.roles) expect(fact.roles, `${r.id} → ${role} reads ${fact.id}`).toContain(role);
      expect(fact.period, r.id).toBe(r.period);
      expect(r.agrees.map((a) => a.fact), r.id).toContain(r.notSetUpAs);
    }
    expect(REPORTS.filter((r) => r.notSetUpAs).map((r) => [r.id, r.notSetUpAs])).toEqual([['dues', 'fees.overdue']]);
  });

  it('a module switched off takes its reports out of every list', () => {
    expect(ids('principal', ['fees'])).toEqual(['attendance-by-class', 'absentees', 'homework-coverage', 'pulse-coverage', 'messages-by-state', 'staff-leave']);
    expect(ids('accountant', ['fees'])).toEqual([]);
    expect(ids('academic_coordinator', ['attendance'])).toEqual(['homework-coverage']);
    expect(ids('principal', ['staff', 'pulse', 'communication', 'homework'])).toEqual(['daily-collection', 'dues', 'attendance-by-class', 'absentees']);
  });

  it('no fee figure sits beside learning, no report ranks a person, and the leave list shows no kind and no reason', () => {
    const learningTables = ['attendance', 'homework', 'homework_targets', 'homework_status', 'pulse_messages', 'pulse_response_log', 'students', 'classes'];
    for (const r of REPORTS.filter((x) => x.group === 'money')) {
      expect(r.sources.filter((s) => learningTables.includes(s)), r.id).toEqual([]);
      expect(r.columns.map((c) => c.key).filter((k) => /class|attend|absent|present|homework|pulse|rate/.test(k)), r.id).toEqual([]);
    }
    for (const r of REPORTS.filter((x) => x.group !== 'money')) expect(r.columns.filter((c) => c.unit === 'inr_paise'), r.id).toEqual([]);
    // No column is a rank, a score or a place in an order.
    for (const r of REPORTS) expect(r.columns.map((c) => c.key).filter((k) => /rank|score|position|best|worst|top/.test(k)), r.id).toEqual([]);
    // The leave list is a row a leave: who, its first and last day, and how many of its days are in the span.
    // The one column that is added up is those days; nothing is a count by person.
    const leave = REPORTS.find((r) => r.id === 'staff-leave')!;
    expect(leave.columns.map((c) => c.key)).toEqual(['name', 'from_date', 'to_date', 'days']);
    expect(leave.columns.filter((c) => c.total === 'sum').map((c) => c.key)).toEqual(['days']);
    expect(leave.roles).toEqual(['principal', 'school_admin']);
    for (const lang of ['en', 'hi'] as const) for (const part of ['about', 'rule'] as const) expect(t(lang, `rpt.staff-leave.${part}`), `${lang} ${part}`).toMatch(lang === 'en' ? /a row a leave|one row a leave/i : /हर (उस मंज़ूर )?छुट्टी की एक पंक्ति/);
    expect(t('en', 'rpt.staff-leave.rule')).toMatch(/not added up by person/);
    // Messages are counts only: no column could hold a name or a number.
    expect(REPORTS.find((r) => r.id === 'messages-by-state')!.columns.every((c) => c.unit === 'count' || c.key === 'day')).toBe(true);
  });

  it('every report has a first column that carries "Total", and a total made only by adding or by its own rule', () => {
    for (const r of REPORTS) {
      expect(r.columns[0].total, r.id).toBe('label');
      expect(r.columns.slice(1).some((c) => c.total === 'label'), r.id).toBe(false);
      for (const c of r.columns) {
        if (c.total === 'sum') expect(['count', 'inr_paise'], `${r.id}.${c.key}`).toContain(c.unit);
        // A count the rows share (a day two classes were marked on) is never added up: the report counts it once.
        if (c.total === 'whole') expect(c.unit, `${r.id}.${c.key}`).toBe('count');
        if (c.unit === 'percent') expect(c.total, `${r.id}.${c.key}: a rate is never added up`).toBe('worked');
        if (c.total === 'worked') expect(typeof r.worked, r.id).toBe('function');
      }
      expect(new Set(r.columns.map((c) => c.key)).size, r.id).toBe(r.columns.length);
    }
    // The one such count is the days a class was marked on, and the dashboard says the school's.
    expect(REPORTS.flatMap((r) => r.columns.filter((c) => c.total === 'whole').map((c) => `${r.id}.${c.key}`))).toEqual(['attendance-by-class.days']);
    expect(REPORTS.find((r) => r.id === 'attendance-by-class')!.agrees).toContainEqual({ column: 'days', fact: 'attendance.present_rate', pick: 'total' });
    for (const lang of ['en', 'hi'] as const) expect(t(lang, 'rpt.attendance-by-class.rule'), lang).toContain(`“${t(lang, 'rpt.col.daysMarked')}”`);
  });
});

describe('the words of every report, in English and Hindi', () => {
  it('each report has its name, what it is, its rule and a teaching empty state', () => {
    for (const r of REPORTS) {
      for (const part of ['title', 'about', 'rule', 'empty.title', 'empty.do']) {
        const key = `rpt.${r.id}.${part}`;
        expect(isMessageKey(key), key).toBe(true);
        expect(hi[key as keyof typeof en], key).toMatch(DEVANAGARI);
        expect(hi[key as keyof typeof en], key).not.toBe(en[key as keyof typeof en]);
      }
      for (const c of r.columns) {
        expect(isMessageKey(c.label), `${r.id}.${c.key}`).toBe(true);
        if (c.empty) expect(isMessageKey(c.empty), `${r.id}.${c.key}`).toBe(true);
      }
      for (const s of r.sources) expect(isMessageKey(`rpt.source.${s}`) || isMessageKey(`dash.source.${s}`), `${r.id}: ${s}`).toBe(true);
    }
    // "Not set up" has its own words for the report that can say it, and for no other.
    for (const r of REPORTS) {
      for (const part of ['notSetUp.title', 'notSetUp.do']) {
        const key = `rpt.${r.id}.${part}`;
        expect(isMessageKey(key), key).toBe(Boolean(r.notSetUpAs));
        if (!r.notSetUpAs) continue;
        expect(hi[key as keyof typeof en], key).toMatch(DEVANAGARI);
        expect(hi[key as keyof typeof en], key).not.toBe(en[key as keyof typeof en]);
      }
    }
    for (const g of REPORT_GROUPS) expect(isMessageKey(`rpt.group.${g}`), g).toBe(true);
    for (const word of ['call', 'promise', 'hardship', 'none', 'unknown']) expect(isMessageKey(`rpt.followup.${word}`), word).toBe(true);
    for (const code of ['range', 'too_many_rows', 'other']) expect(isMessageKey(`rpt.err.${code}`), code).toBe(true);
  });

  it('no words are left over for a report that does not exist', () => {
    const known = new Set<string>(REPORT_IDS);
    // What only a report has: what it is, its rule and its empty state.
    const own = Object.keys(en).filter((k) => /^rpt\.[^.]+\.(about|rule|empty\.title|empty\.do)$/.test(k));
    expect(own).toHaveLength(REPORT_IDS.length * 4);
    for (const key of own) expect(known.has(key.split('.')[1]), key).toBe(true);
    expect(Object.keys(hi).filter((k) => k.startsWith('rpt.')).sort()).toEqual(Object.keys(en).filter((k) => k.startsWith('rpt.')).sort());
  });

  it('the module is partly live, with its sentence, its tour, its guide and its guard rows', () => {
    const reports = moduleById('reports');
    expect(reports.status).toBe('partial');
    expect(reports.phaseNote).toMatch(/fixed list/);
    expect(reports.roles).toEqual(['principal', 'school_admin', 'accountant', 'academic_coordinator']);
    expect(isMessageKey('moduleOff.reports')).toBe(true);
    expect(TOURS.reports.steps).toHaveLength(3);
    for (const n of [1, 2, 3]) for (const part of ['title', 'text']) expect(isMessageKey(`tour.reports.${n}.${part}`), `${n}.${part}`).toBe(true);
    const guide = HELP_ARTICLES.find((a) => a.slug === 'run-a-report')!;
    expect(guide.start?.href).toBe('/app/reports');
    expect(guide.steps.length).toBeGreaterThanOrEqual(3);
    // The three addresses, each a read of Reports; nothing under it changes a school's records.
    for (const address of ['/api/app/reports', '/api/app/reports/dues', '/api/app/reports/dues/export']) expect(readModuleFor(address), address).toBe('reports');
    expect(READ_ROUTES.filter(([, module]) => module === 'reports').map(([pattern]) => pattern)).toEqual(['reports/**', 'reports']);
    expect(WRITE_ROUTES.some(([pattern]) => pattern.startsWith('reports'))).toBe(false);
    // The page is the module's own screen, with its guide and its tour.
    const page = readFileSync(path.join(process.cwd(), 'src/app/(school)/app/reports/page.tsx'), 'utf8');
    for (const words of ['moduleOffReason(\'reports\')', '<ModuleOffPage moduleId="reports"', '<ModulePage moduleId="reports" help="run-a-report" tour="reports"']) expect(page).toContain(words);
  });

  it('the migration switches Reports on for every school and changes nothing else', () => {
    const dir = path.join(process.cwd(), 'supabase/migrations');
    const file = readdirSync(dir).find((f) => f.endsWith('_p5_reports_on.sql'));
    expect(file).toBeDefined();
    const sql = readFileSync(path.join(dir, file!), 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim();
    expect(sql.replace(/\s+/g, ' ')).toBe(`insert into school_module_entitlements (school_id, module_id, enabled, source) select s.school_id, 'reports', true, 'plan' from schools s on conflict (school_id, module_id) do nothing;`);
  });

  it('the collection report has a column for every way a receipt can be paid: the database’s own list', () => {
    // The receipts table's check on `method`, as the migrations last left it. A method added there without a
    // column here would stop the report (it refuses to leave money out of a row), so the two lists are held equal.
    const dir = path.join(process.cwd(), 'supabase/migrations');
    const checks = readdirSync(dir).sort().flatMap((f) => [...readFileSync(path.join(dir, f), 'utf8').matchAll(/receipts_method_check check \(method in \(([^)]+)\)\)/g)].map((m) => m[1]));
    expect(checks.length).toBeGreaterThan(0);
    const allowed = checks[checks.length - 1].split(',').map((m) => m.trim().replace(/'/g, ''));
    expect([...RECEIPT_METHODS].sort()).toEqual([...allowed].sort());
    const columns = REPORTS.find((r) => r.id === 'daily-collection')!.columns.map((c) => c.key);
    for (const method of allowed) {
      expect(columns, method).toContain(method);
      expect(isMessageKey(`rpt.col.method.${method}`), method).toBe(true);
    }
  });
});

describe('the days a report covers', () => {
  it('today, 7 days and 30 days are the dashboard’s own days; with nothing said, 30 days', () => {
    for (const id of ['today', '7d', '30d'] as const) expect(readReportRange(params(`range=${id}`), TODAY)).toEqual({ ok: true, range: rangeFor(TODAY, id), rangeId: id });
    expect(readReportRange(params(''), TODAY)).toEqual({ ok: true, range: { from: '2026-09-15', to: '2026-10-14' }, rangeId: '30d' });
    expect(readReportRange(params('range=7d'), TODAY)).toMatchObject({ range: { from: '2026-10-08', to: '2026-10-14' } });
    expect(readReportRange(params('range=today'), TODAY)).toMatchObject({ range: { from: TODAY, to: TODAY } });
  });

  it('two dates: real days, in order, both ends included, at most 366 days', () => {
    expect(readReportRange(params('from=2026-04-01&to=2026-04-30'), TODAY)).toEqual({ ok: true, range: { from: '2026-04-01', to: '2026-04-30' }, rangeId: null });
    expect(readReportRange(params('from=2026-04-01&to=2026-04-01'), TODAY)).toMatchObject({ ok: true });
    expect(daysIn({ from: '2026-04-01', to: '2026-04-30' })).toBe(30);
    expect(REPORT_MAX_DAYS).toBe(366);
    // 366 days is the most; one more is refused.
    expect(daysIn({ from: '2025-10-14', to: '2026-10-14' })).toBe(366);
    expect(readReportRange(params('from=2025-10-14&to=2026-10-14'), TODAY)).toMatchObject({ ok: true });
    expect(readReportRange(params('from=2025-10-13&to=2026-10-14'), TODAY)).toEqual({ ok: false });
    expect(readReportRange(params('from=2020-01-01&to=2026-10-14'), TODAY)).toEqual({ ok: false });
  });

  it('refuses days that are backwards, not real, half given, or said twice', () => {
    for (const query of ['from=2026-10-14&to=2026-10-01', 'from=2026-02-30&to=2026-03-02', 'from=2026-13-01&to=2026-13-02', 'from=2026-10-01', 'to=2026-10-01', 'from=&to=', 'from=1-1-2026&to=2-1-2026', 'from=2026-10-01&to=2026-10-02&range=7d', 'range=90d', 'range=', 'from=2026-10-01%27--&to=2026-10-02']) {
      expect(readReportRange(params(query), TODAY), query).toEqual({ ok: false });
    }
    expect([isRealDay('2026-02-28'), isRealDay('2024-02-29'), isRealDay('2026-02-29'), isRealDay('2026-2-9'), isRealDay(null), isRealDay(20261014)]).toEqual([true, true, false, false, false, false]);
  });

  it('the screen asks the server, and the file, with the same words', () => {
    expect(rangeQuery({ rangeId: '7d' })).toBe('range=7d');
    expect(rangeQuery({ from: '2026-04-01', to: '2026-04-30' })).toBe('from=2026-04-01&to=2026-04-30');
    expect(readReportRange(params(rangeQuery({ from: '2026-04-01', to: '2026-04-30' })), TODAY)).toMatchObject({ ok: true, range: { from: '2026-04-01', to: '2026-04-30' } });
  });
});

describe('a table, written for the screen and for the file', () => {
  const dues = REPORTS.find((r) => r.id === 'dues')!;
  const byClass = REPORTS.find((r) => r.id === 'attendance-by-class')!;
  const result = (def: (typeof REPORTS)[number], rows: ReportResult['rows'], whole?: Record<string, number>): ReportResult => ({
    id: def.id, moduleId: def.moduleId, group: def.group, period: def.period, state: 'ok', range: def.period === 'range' ? { from: '2026-10-01', to: '2026-10-14' } : null,
    columns: def.columns.map((c) => ({ key: c.key, label: c.label, unit: c.unit, ...(c.words ? { words: c.words } : {}), ...(c.empty ? { empty: c.empty } : {}) })),
    rows, total: totalOf(def, rows, whole), ranAt: '2026-10-14T05:00:00.000Z', rule: { key: `rpt.${def.id}.rule`, version: def.version }, sources: def.sources, notes: [],
  });

  it('the total row is the rows added up; a rate is worked out again from the sums, never averaged', () => {
    const rows = [
      { class: '5-A', days: 4, present: 9, late: 1, absent: 0, leave: 0, rate: 100 },
      { class: '6-B', days: 1, present: 0, late: 0, absent: 30, leave: 0, rate: 0 },
    ];
    // 5-A was marked on four days and 6-B on one of the same four: four days for the school, never five.
    const total = totalOf(byClass, rows, { days: 4 })!;
    expect(total).toEqual({ class: null, days: 4, present: 9, late: 1, absent: 30, leave: 0, rate: 25 });
    expect(total.days).not.toBe(rows.reduce((a, r) => a + r.days, 0));
    // With no count for the school given, the cell is empty: it is never the classes' days added up.
    expect(totalOf(byClass, rows)!.days).toBeNull();
    expect(reportTable('en', result(byClass, rows)).total).toEqual(['Total', '', '9', '1', '30', '0', '25%']);
    expect(reportTable('en', result(byClass, rows, { days: 4 })).total).toEqual(['Total', '4', '9', '1', '30', '0', '25%']);
    // The average of the two classes' rates would be 50: the total is the school's own rate, 10 in school of 40 marks.
    expect(total.rate).not.toBe(50);
    expect(totalOf(byClass, [])).toBeNull();
    expect(totalOf(dues, [{ payer: 'A', children: 1, entries: 2, owed: 150050, oldest_due: '2026-10-01', last_followup: 'none', last_on: null }, { payer: 'B', children: 2, entries: 1, owed: 5, oldest_due: '2026-09-01', last_followup: 'call', last_on: '2026-10-02' }]))
      .toEqual({ payer: null, children: 3, entries: 3, owed: 150055, oldest_due: null, last_followup: null, last_on: null });
  });

  it('the screen writes numbers for a person; the file writes the same numbers for a spreadsheet', () => {
    const shown = result(dues, [
      { payer: 'F-001 · Asha', children: 2, entries: 3, owed: 123456700, oldest_due: '2026-10-02', last_followup: 'promise', last_on: '2026-10-12' },
      { payer: 'Gopal', children: 1, entries: 1, owed: 60050, oldest_due: '2026-10-12', last_followup: 'none', last_on: null },
    ]);
    const table = reportTable('en', shown);
    expect(table.headings).toEqual(['Family or student', 'Children', 'Overdue entries', 'Owed', 'Oldest due date', 'Last follow-up', 'Follow-up on']);
    expect(table.rows[0]).toEqual(['F-001 · Asha', '2', '3', '₹12,34,567', '2 Oct 2026', 'Promise to pay', '12 Oct 2026']);
    expect(table.rows[1]).toEqual(['Gopal', '1', '1', '₹600.50', '12 Oct 2026', 'None yet', '–']);
    expect(table.total).toEqual(['Total', '3', '4', '₹12,35,167.50', '', '', '']);
    const file = reportCsv('en', shown);
    expect(file.header).toEqual(['Family or student', 'Children', 'Overdue entries', 'Owed (rupees)', 'Oldest due date', 'Last follow-up', 'Follow-up on']);
    expect(file.rows).toEqual([
      ['F-001 · Asha', 2, 3, 1234567, '2026-10-02', 'Promise to pay', '2026-10-12'],
      ['Gopal', 1, 1, 600.5, '2026-10-12', 'None yet', null],
      ['Total', 3, 4, 1235167.5, null, null, null],
    ]);
    // The same table in Hindi: the same numbers, the words in Hindi.
    const hindi = reportTable('hi', shown);
    expect(hindi.headings[0]).toBe('परिवार या विद्यार्थी');
    expect(hindi.rows[0][3]).toBe('₹12,34,567');
    expect(hindi.rows[0][5]).toBe('भुगतान का वादा');
    expect(hindi.total![0]).toBe('कुल');
    expect(reportCsv('hi', shown).header[3]).toBe('बकाया (रुपये)');
  });

  it('a rate, a list of dates and a name that is not shown are each written in plain words', () => {
    const shown = result(byClass, [{ class: null, days: 2, present: 3, late: 0, absent: 1, leave: 0, rate: 75 }], { days: 2 });
    expect(reportTable('en', shown).rows[0]).toEqual(['Class no longer on record', '2', '3', '0', '1', '0', '75%']);
    expect(reportCsv('en', shown)).toEqual({ header: ['Class', 'Days marked', 'Present', 'Late', 'Absent', 'On leave', 'In school (percent)'], rows: [['Class no longer on record', 2, 3, 0, 1, 0, 75], ['Total', 2, 3, 0, 1, 0, 75]] });
    const absentees = REPORTS.find((r) => r.id === 'absentees')!;
    const column = (key: string) => result(absentees, []).columns.find((c) => c.key === key)!;
    expect(sayCell('en', column('dates'), ['2026-10-13', '2026-10-14'])).toBe('13 Oct 2026, 14 Oct 2026');
    expect(fileCell('en', column('dates'), ['2026-10-13', '2026-10-14'])).toBe('2026-10-13; 2026-10-14');
    expect(sayCell('en', column('student'), null)).toBe('Name not shown to your role (waiting for consent)');
    expect(sayCell('en', column('roll_no'), null)).toBe('–');
    expect(fileCell('en', column('roll_no'), null)).toBeNull();
    // A span of days in a list of dates is written "first to last".
    expect(sayCell('en', column('dates'), ['2026-10-01/2026-10-03', '2026-10-11'])).toBe('1 Oct 2026 to 3 Oct 2026, 11 Oct 2026');
    expect(sayCell('hi', column('dates'), ['2026-10-11'])).toMatch(DEVANAGARI);
    // A leave is a row: its first and last day as dates, and its days inside the span as a number.
    const leave = result(REPORTS.find((r) => r.id === 'staff-leave')!, [{ name: 'Tara Teacher', from_date: '2026-09-28', to_date: '2026-10-02', days: 2 }, { name: 'Tara Teacher', from_date: '2026-10-11', to_date: '2026-10-11', days: 1 }]);
    expect(reportTable('en', leave)).toEqual({ headings: ['Member of staff', 'First day of leave', 'Last day of leave', 'Days of leave in the days shown'], rows: [['Tara Teacher', '28 Sept 2026', '2 Oct 2026', '2'], ['Tara Teacher', '11 Oct 2026', '11 Oct 2026', '1']], total: ['Total', '', '', '3'] });
    expect(reportCsv('en', leave).rows).toEqual([['Tara Teacher', '2026-09-28', '2026-10-02', 2], ['Tara Teacher', '2026-10-11', '2026-10-11', 1], ['Total', null, null, 3]]);
    expect(fileHeading('en', leave.columns[3])).toBe(t('en', 'rpt.col.leaveDays'));
  });

  it('a report with no rows says what is true: "not set up" where the thing is not set up, otherwise that nothing was recorded', () => {
    expect(reportEmpty('en', { id: 'dues', state: 'ok' })).toEqual({ title: 'No fee is overdue', do: expect.stringContaining('Nothing is past its date') });
    const notSetUp = reportEmpty('en', { id: 'dues', state: 'not_set_up' });
    expect(notSetUp).toEqual({ title: 'Fees are not set up yet', do: expect.stringContaining('No fee has been raised') });
    // It teaches the next step, and it does not say a zero.
    expect(notSetUp.do).toMatch(/Raise a month’s dues in Fees/);
    expect(`${notSetUp.title} ${notSetUp.do}`).not.toMatch(/No fee is overdue|Nothing is past its date/);
    // The dashboard's own words for the same state say the same thing.
    expect(t('en', 'dash.notSetUp.fees')).toMatch(/No fee has been raised yet/);
    expect(reportEmpty('hi', { id: 'dues', state: 'not_set_up' }).title).toMatch(DEVANAGARI);
    for (const r of REPORTS) expect(reportEmpty('en', { id: r.id, state: 'ok' }).title, r.id).toBe(t('en', `rpt.${r.id}.empty.title` as never));
  });
});
