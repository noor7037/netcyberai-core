import { Checker, bi, n, rn, rows, str, type ToolSpec } from '../engine';
import { num, type ReportSection, type ReportTone } from '../report';
import { EMPTY_REPORT, picker } from './common';

const DAY_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_HI = ['Som', 'Mangal', 'Budh', 'Guru', 'Shukra', 'Shani', 'Ravi'];
const DAY_ALIASES: Record<string, number> = {
  mon: 0, monday: 0, som: 0, somvar: 0,
  tue: 1, tues: 1, tuesday: 1, mangal: 1, mangalvar: 1,
  wed: 2, wednesday: 2, budh: 2, budhvar: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3, guru: 3, guruvar: 3,
  fri: 4, friday: 4, shukra: 4, shukravar: 4,
  sat: 5, saturday: 5, shani: 5, shanivar: 5,
  sun: 6, sunday: 6, ravi: 6, ravivar: 6,
};

export function parseDay(s: string, days: number): number | null {
  const t = s.trim().toLowerCase();
  const d = /^\d+$/.test(t) ? Number(t) - 1 : DAY_ALIASES[t];
  return d !== undefined && d >= 0 && d < days ? d : null;
}

// "1-3", "2,4", "all" -> the set of period numbers (1-based).
export function parsePeriods(s: string, perDay: number): Set<number> {
  const out = new Set<number>();
  const t = s.trim().toLowerCase();
  if (t === '' || t === 'all' || t === 'sab') {
    for (let i = 1; i <= perDay; i++) out.add(i);
    return out;
  }
  for (const part of t.split(/[,\s]+/)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= perDay) out.add(i);
  }
  return out;
}

const F = {
  days: bi('School days per week', 'Hafte mein school ke din'),
  perDay: bi('Periods per day', 'Din mein periods'),
  entries: bi('Timetable entries', 'Timetable entries'),
  required: bi('Weekly periods required', 'Hafte mein zaroori periods'),
  unavailable: bi('Teacher unavailability', 'Teacher uplabdh nahi'),
  absent: bi('Teacher absent (for substitutes)', 'Anupasthit teacher (substitute ke liye)'),
  absentDay: bi('Day of absence', 'Anupasthiti ka din'),
};

interface Entry {
  day: number;
  period: number;
  cls: string;
  subject: string;
  teacher: string;
}

export const timetableSpec: ToolSpec = {
  slug: 'timetable-clash-checker',
  rulesUpdated: '27 September 2026',
  groups: [
    {
      title: bi('School week', 'School ka hafta'),
      fields: [
        { kind: 'number', id: 'days', label: F.days, suffix: 'days', min: 1, max: 7 },
        { kind: 'number', id: 'perDay', label: F.perDay, suffix: 'periods', min: 1, max: 14 },
      ],
    },
    {
      title: bi('Timetable', 'Timetable'),
      fields: [
        {
          kind: 'rows',
          id: 'entries',
          label: F.entries,
          help: bi('One row per class per period. Day as Mon to Sat or 1 to 6. Import a CSV to add a whole week at once.', 'Har class ke har period ki ek row. Din Mon se Sat ya 1 se 6. Poora hafta ek saath jodne ke liye CSV import karein.'),
          addLabel: bi('Add entry', 'Entry jodein'),
          maxRows: 600,
          columns: [
            { id: 'day', label: bi('Day', 'Din'), kind: 'text' },
            { id: 'period', label: bi('Period', 'Period'), kind: 'number', min: 1 },
            { id: 'class', label: bi('Class', 'Class'), kind: 'text' },
            { id: 'subject', label: bi('Subject', 'Subject'), kind: 'text' },
            { id: 'teacher', label: bi('Teacher', 'Teacher'), kind: 'text', personal: true },
          ],
        },
      ],
    },
    {
      title: bi('Rules to check', 'Check karne ke niyam'),
      fields: [
        {
          kind: 'rows',
          id: 'required',
          label: F.required,
          addLabel: bi('Add requirement', 'Zaroorat jodein'),
          maxRows: 200,
          columns: [
            { id: 'class', label: bi('Class', 'Class'), kind: 'text' },
            { id: 'subject', label: bi('Subject', 'Subject'), kind: 'text' },
            { id: 'periods', label: bi('Periods a week', 'Hafte ke periods'), kind: 'number', min: 0 },
          ],
        },
        {
          kind: 'rows',
          id: 'unavailable',
          label: F.unavailable,
          help: bi('Periods as 1-3, 2,4 or all.', 'Periods jaise 1-3, 2,4 ya all.'),
          addLabel: bi('Add unavailability', 'Jodein'),
          maxRows: 100,
          columns: [
            { id: 'teacher', label: bi('Teacher', 'Teacher'), kind: 'text', personal: true },
            { id: 'day', label: bi('Day', 'Din'), kind: 'text' },
            { id: 'periods', label: bi('Periods', 'Periods'), kind: 'text' },
          ],
        },
      ],
    },
    {
      title: bi('Substitutes', 'Substitutes'),
      fields: [
        { kind: 'text', id: 'absent', label: F.absent, personal: true },
        { kind: 'text', id: 'absentDay', label: F.absentDay, help: bi('For example Mon.', 'Jaise Mon.') },
      ],
    },
  ],
  defaults: { days: '6', perDay: '8', entries: [{ day: '', period: '', class: '', subject: '', teacher: '' }], required: [], unavailable: [], absent: '', absentDay: '' },

  compute(v, lang) {
    const p = picker(lang);
    const c = new Checker(lang);
    const days = c.num(n(v, 'days'), F.days, { min: 1, max: 7, int: true });
    const perDay = c.num(n(v, 'perDay'), F.perDay, { min: 1, max: 14, int: true });
    if (c.errors.length) return { errors: c.errors, report: EMPTY_REPORT };
    const dayName = (d: number) => (lang === 'en' ? DAY_EN : DAY_HI)[d];

    const entries: Entry[] = [];
    rows(v, 'entries').forEach((r, i) => {
      if (Object.values(r).every((x) => !(x ?? '').trim())) return;
      const day = parseDay(r.day ?? '', days);
      const period = rn(r, 'period');
      const cls = (r.class ?? '').trim();
      const teacher = (r.teacher ?? '').trim();
      if (day === null) c.add(`Entry ${i + 1}: day “${r.day ?? ''}” is not one of the ${days} school days.`, `Entry ${i + 1}: din “${r.day ?? ''}” ${days} school dinon mein nahi.`);
      if (!Number.isInteger(period) || period < 1 || period > perDay) c.add(`Entry ${i + 1}: period must be 1 to ${perDay}.`, `Entry ${i + 1}: period 1 se ${perDay} ho.`);
      if (!cls || !teacher) c.add(`Entry ${i + 1}: class and teacher are needed.`, `Entry ${i + 1}: class aur teacher zaroori hain.`);
      if (day !== null && Number.isInteger(period) && cls && teacher) entries.push({ day, period, cls, subject: (r.subject ?? '').trim(), teacher });
    });
    if (entries.length === 0 && c.errors.length === 0) c.add('Add timetable entries or import a CSV.', 'Timetable entries jodein ya CSV import karein.');
    if (c.errors.length) return { errors: c.errors.slice(0, 12), report: EMPTY_REPORT };

    const key = (...k: (string | number)[]) => k.join('\u0000');
    const bySlotTeacher = new Map<string, Entry[]>();
    const bySlotClass = new Map<string, Entry[]>();
    for (const e of entries) {
      const a = key(e.day, e.period, e.teacher.toLowerCase());
      bySlotTeacher.set(a, [...(bySlotTeacher.get(a) ?? []), e]);
      const b = key(e.day, e.period, e.cls.toLowerCase());
      bySlotClass.set(b, [...(bySlotClass.get(b) ?? []), e]);
    }
    const teacherClashes = [...bySlotTeacher.values()].filter((l) => new Set(l.map((e) => e.cls.toLowerCase())).size > 1);
    const classClashes = [...bySlotClass.values()].filter((l) => l.length > 1);

    const unavailable = rows(v, 'unavailable')
      .map((r) => ({ teacher: (r.teacher ?? '').trim().toLowerCase(), day: parseDay(r.day ?? '', days), periods: parsePeriods(r.periods ?? '', perDay) }))
      .filter((u) => u.teacher && u.day !== null);
    const isUnavailable = (teacher: string, day: number, period: number) => unavailable.some((u) => u.teacher === teacher.toLowerCase() && u.day === day && u.periods.has(period));
    const violations = entries.filter((e) => isUnavailable(e.teacher, e.day, e.period));

    const teachers = [...new Set(entries.map((e) => e.teacher))].sort((a, b) => a.localeCompare(b));
    const week = days * perDay;
    const load = teachers.map((t) => {
      const mine = entries.filter((e) => e.teacher === t);
      const slots = new Set(mine.map((e) => key(e.day, e.period)));
      const perDayCount = Array.from({ length: days }, (_, d) => new Set(mine.filter((e) => e.day === d).map((e) => e.period)).size);
      return { t, periods: slots.size, maxDay: Math.max(...perDayCount), free: week - slots.size, subjects: new Set(mine.map((e) => e.subject.toLowerCase())) };
    });
    const avg = load.reduce((a, l) => a + l.periods, 0) / Math.max(1, load.length);
    const balance = (x: number): ReportTone | undefined => (x > avg * 1.25 ? 'bad' : x < avg * 0.75 ? 'warn' : undefined);

    const required = rows(v, 'required')
      .map((r) => ({ cls: (r.class ?? '').trim(), subject: (r.subject ?? '').trim(), need: rn(r, 'periods') }))
      .filter((r) => r.cls && r.subject && Number.isFinite(r.need));
    const reqRows = required.map((r) => {
      const got = entries.filter((e) => e.cls.toLowerCase() === r.cls.toLowerCase() && e.subject.toLowerCase() === r.subject.toLowerCase()).length;
      return { ...r, got, diff: got - r.need };
    });

    const sections: ReportSection[] = [
      {
        kind: 'stats',
        items: [
          { label: p('Teacher clashes', 'Teacher clash'), value: num(teacherClashes.length), tone: teacherClashes.length ? 'bad' : 'good', note: p('same teacher, two classes, one period', 'ek teacher, do class, ek period') },
          { label: p('Class double-bookings', 'Class double-booking'), value: num(classClashes.length), tone: classClashes.length ? 'bad' : 'good' },
          { label: p('Unavailability breaks', 'Uplabdhta ka ullanghan'), value: num(violations.length), tone: violations.length ? 'bad' : 'good' },
          { label: p('Subjects short of required periods', 'Kam periods wale subjects'), value: num(reqRows.filter((r) => r.diff < 0).length), tone: reqRows.some((r) => r.diff < 0) ? 'warn' : 'good' },
          { label: p('Teachers', 'Teachers'), value: num(teachers.length), note: p(`${num(avg, 1)} periods each on average`, `ausat ${num(avg, 1)} periods har ek`) },
          { label: p('Entries checked', 'Jaanchi gayi entries'), value: num(entries.length), note: p(`${week} periods in the week`, `hafte mein ${week} periods`) },
        ],
      },
    ];

    const problems = [
      ...teacherClashes.map((l) => [dayName(l[0].day), String(l[0].period), p('Teacher clash', 'Teacher clash'), `${l[0].teacher}: ${l.map((e) => e.cls).join(', ')}`]),
      ...classClashes.map((l) => [dayName(l[0].day), String(l[0].period), p('Class double-booked', 'Class double-book'), `${l[0].cls}: ${l.map((e) => `${e.subject || '?'} (${e.teacher})`).join(', ')}`]),
      ...violations.map((e) => [dayName(e.day), String(e.period), p('Teacher unavailable', 'Teacher uplabdh nahi'), `${e.teacher} → ${e.cls}`]),
    ];
    if (problems.length) {
      sections.push({ kind: 'table', heading: p('Problems to fix', 'Theek karne wali samasyayein'), columns: [p('Day', 'Din'), p('Period', 'Period'), p('Problem', 'Samasya'), p('Details', 'Vivaran')], rows: problems, rowTones: problems.map(() => 'bad' as const) });
    }
    if (reqRows.length) {
      sections.push({
        kind: 'table',
        heading: p('Required vs scheduled periods', 'Zaroori vs lage periods'),
        columns: [p('Class', 'Class'), p('Subject', 'Subject'), p('Required', 'Zaroori'), p('Scheduled', 'Lage'), p('Difference', 'Antar')],
        rows: reqRows.map((r) => [r.cls, r.subject, num(r.need), num(r.got), r.diff > 0 ? `+${r.diff}` : String(r.diff)]),
        numeric: [false, false, true, true, true],
        rowTones: reqRows.map((r) => (r.diff < 0 ? 'warn' : undefined)),
      });
    }
    sections.push({
      kind: 'table',
      heading: p('Teacher workload and free periods', 'Teacher workload aur free periods'),
      columns: [p('Teacher', 'Teacher'), p('Periods a week', 'Hafte ke periods'), p('Most in one day', 'Ek din mein sabse zyada'), p('Free periods', 'Free periods'), p('Balance', 'Santulan')],
      rows: load.map((l) => [l.t, num(l.periods), num(l.maxDay), num(l.free), balance(l.periods) === 'bad' ? p('Heavy', 'Bhaari') : balance(l.periods) === 'warn' ? p('Light', 'Halka') : p('Even', 'Barabar')]),
      numeric: [false, true, true, true, false],
      rowTones: load.map((l) => balance(l.periods)),
    });

    const absent = str(v, 'absent');
    const absentDay = parseDay(str(v, 'absentDay'), days);
    if (absent && absentDay !== null) {
      const theirs = entries.filter((e) => e.teacher.toLowerCase() === absent.toLowerCase() && e.day === absentDay).sort((a, b) => a.period - b.period);
      const dayLoad = (t: string) => new Set(entries.filter((e) => e.teacher === t && e.day === absentDay).map((e) => e.period)).size;
      const subRows = theirs.map((e) => {
        const free = load
          .filter((l) => l.t.toLowerCase() !== absent.toLowerCase())
          .filter((l) => !entries.some((x) => x.teacher === l.t && x.day === e.day && x.period === e.period) && !isUnavailable(l.t, e.day, e.period))
          .sort((a, b) => Number(b.subjects.has(e.subject.toLowerCase())) - Number(a.subjects.has(e.subject.toLowerCase())) || dayLoad(a.t) - dayLoad(b.t))
          .slice(0, 3)
          .map((l) => `${l.t}${l.subjects.has(e.subject.toLowerCase()) && e.subject ? p(' (same subject)', ' (wahi subject)') : ''}, ${dayLoad(l.t)} ${p('periods that day', 'periods us din')}`);
        return [String(e.period), e.cls, e.subject, free.join(' · ') || p('No one free', 'Koi free nahi')];
      });
      sections.push(
        subRows.length
          ? { kind: 'table', heading: p(`Substitutes for ${absent} on ${dayName(absentDay)}`, `${dayName(absentDay)} ko ${absent} ke substitutes`), columns: [p('Period', 'Period'), p('Class', 'Class'), p('Subject', 'Subject'), p('Free teachers', 'Free teachers')], rows: subRows }
          : { kind: 'text', heading: p('Substitutes', 'Substitutes'), text: p(`${absent} has no periods on ${dayName(absentDay)}.`, `${dayName(absentDay)} ko ${absent} ke koi periods nahi.`) }
      );
    }

    const classes = [...new Set(entries.map((e) => e.cls))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const cls of classes) {
      const grid = Array.from({ length: days }, (_, d) => [
        dayName(d),
        ...Array.from({ length: perDay }, (_, pi) =>
          entries
            .filter((e) => e.cls === cls && e.day === d && e.period === pi + 1)
            .map((e) => `${e.subject}${e.subject ? ' · ' : ''}${e.teacher}`)
            .join(' / ')
        ),
      ]);
      sections.push({ kind: 'table', heading: p(`Timetable: ${cls}`, `Timetable: ${cls}`), columns: [p('Day', 'Din'), ...Array.from({ length: perDay }, (_, i) => `P${i + 1}`)], rows: grid });
    }

    return {
      errors: [],
      report: {
        title: p('Timetable Clash and Workload Check', 'Timetable Clash aur Workload Jaanch'),
        subtitle: p(`${classes.length} classes · ${teachers.length} teachers · ${days} days × ${perDay} periods`, `${classes.length} classes · ${teachers.length} teachers · ${days} din × ${perDay} periods`),
        sections,
        assumptions: [
          p('Names are matched without regard to capital letters; spell each teacher the same way everywhere.', 'Naam capital letters ke bina milaaye jaate hain; har teacher ka naam har jagah ek jaisa likhein.'),
          p('Balance marks a teacher as heavy above 1.25 times the average weekly periods and light below 0.75 times.', 'Santulan: ausat periods ke 1.25 guna se zyada bhaari, 0.75 guna se kam halka.'),
          p('Substitutes are teachers with no class and no unavailability in that period; same-subject teachers come first, then the lightest day.', 'Substitute woh teachers jinki us period class aur rok nahi; pehle wahi subject, phir sabse halka din.'),
        ],
        disclaimer: p('A checking aid. The timetable in-charge makes the final timetable.', 'Ye jaanch ki madad hai. Final timetable in-charge hi banata hai.'),
      },
    };
  },
};
