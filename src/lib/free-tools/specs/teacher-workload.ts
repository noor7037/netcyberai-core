import { Checker, bi, n, rn, rows, type ToolSpec } from '../engine';
import { num, type ReportSection, type ReportTone } from '../report';
import { EMPTY_REPORT, picker } from './common';

const F = {
  days: bi('Working days per week', 'Hafte mein working din'),
  perDay: bi('Periods per day', 'Din mein periods'),
  minutes: bi('Minutes per period', 'Ek period ke minute'),
  maxPeriods: bi('Most teaching periods per week', 'Hafte mein zyada se zyada teaching periods'),
  maxHours: bi('Most working hours per week', 'Hafte mein zyada se zyada kaam ke ghante'),
  teachers: bi('Teachers this week', 'Is hafte ke teachers'),
};

export interface TeacherLoad {
  name: string;
  subject: string;
  periods: number;
  hours: number;
  free: number;
  leave: number;
  cover: number;
  overload: string[];
}

export const teacherWorkloadSpec: ToolSpec = {
  slug: 'teacher-workload-planner',
  rulesUpdated: '27 September 2026',
  groups: [
    {
      title: bi('School week', 'School ka hafta'),
      fields: [
        { kind: 'number', id: 'days', label: F.days, suffix: 'days', min: 1, max: 7 },
        { kind: 'number', id: 'perDay', label: F.perDay, suffix: 'periods', min: 1, max: 14 },
        { kind: 'number', id: 'minutes', label: F.minutes, min: 10, max: 120 },
      ],
    },
    {
      title: bi('Your limits', 'Aapki seema'),
      fields: [
        { kind: 'number', id: 'maxPeriods', label: F.maxPeriods, suffix: 'periods', min: 1, help: bi('Set by your school policy.', 'School policy ke hisaab se.') },
        { kind: 'number', id: 'maxHours', label: F.maxHours, suffix: 'hours', min: 1 },
      ],
    },
    {
      title: bi('Teachers', 'Teachers'),
      fields: [
        {
          kind: 'rows',
          id: 'teachers',
          label: F.teachers,
          help: bi('Hours per week. Names stay on this device and are never put in a share link.', 'Hafte ke ghante. Naam isi device par rehte hain, share link mein kabhi nahi.'),
          addLabel: bi('Add teacher', 'Teacher jodein'),
          maxRows: 60,
          columns: [
            { id: 'name', label: bi('Teacher', 'Teacher'), kind: 'text', personal: true },
            { id: 'subject', label: bi('Subject', 'Subject'), kind: 'text' },
            { id: 'periods', label: bi('Teaching periods', 'Teaching periods'), kind: 'number', min: 0 },
            { id: 'prep', label: bi('Preparation hours', 'Taiyari ghante'), kind: 'number', min: 0 },
            { id: 'correction', label: bi('Correction hours', 'Copy check ghante'), kind: 'number', min: 0 },
            { id: 'meetings', label: bi('Meeting and duty hours', 'Meeting aur duty ghante'), kind: 'number', min: 0 },
            { id: 'leave', label: bi('Leave days this week', 'Is hafte chhutti ke din'), kind: 'number', min: 0 },
          ],
        },
      ],
    },
  ],
  defaults: { days: '6', perDay: '8', minutes: '40', maxPeriods: '32', maxHours: '42', teachers: [{ name: '', subject: '', periods: '', prep: '0', correction: '0', meetings: '0', leave: '0' }] },

  compute(v, lang) {
    const p = picker(lang);
    const c = new Checker(lang);
    const days = c.num(n(v, 'days'), F.days, { min: 1, max: 7, int: true });
    const perDay = c.num(n(v, 'perDay'), F.perDay, { min: 1, max: 14, int: true });
    const minutes = c.num(n(v, 'minutes'), F.minutes, { min: 10, max: 120 });
    const maxPeriods = c.num(n(v, 'maxPeriods'), F.maxPeriods, { min: 1 });
    const maxHours = c.num(n(v, 'maxHours'), F.maxHours, { min: 1 });
    const list = rows(v, 'teachers').filter((r) => (r.name ?? '').trim() || Number.isFinite(rn(r, 'periods')));
    if (list.length === 0) c.add('Add at least one teacher with teaching periods.', 'Kam se kam ek teacher aur periods jodein.');
    const week = days * perDay;
    list.forEach((r, i) => {
      const per = rn(r, 'periods');
      const leave = Number.isFinite(rn(r, 'leave')) ? rn(r, 'leave') : 0;
      if (!Number.isFinite(per) || per < 0) c.add(`Row ${i + 1}: enter teaching periods.`, `Row ${i + 1}: teaching periods bhariye.`);
      else if (per > week) c.add(`Row ${i + 1}: more periods than the week has (${week}).`, `Row ${i + 1}: hafte ke periods (${week}) se zyada.`);
      if (leave < 0 || leave > days) c.add(`Row ${i + 1}: leave days must be between 0 and ${days}.`, `Row ${i + 1}: chhutti 0 se ${days} ke beech ho.`);
    });
    if (c.errors.length) return { errors: c.errors, report: EMPTY_REPORT };

    const val = (r: Record<string, string>, id: string) => (Number.isFinite(rn(r, id)) ? rn(r, id) : 0);
    const loads: TeacherLoad[] = list.map((r, i) => {
      const periods = rn(r, 'periods');
      const leave = val(r, 'leave');
      const hours = (periods * minutes) / 60 + val(r, 'prep') + val(r, 'correction') + val(r, 'meetings');
      const presentPeriods = (days - leave) * perDay;
      // Periods a teacher on leave would have taught, spread evenly.
      const cover = Math.round((periods * leave) / days);
      const overload: string[] = [];
      if (periods > maxPeriods) overload.push(p(`${periods} periods > ${maxPeriods}`, `${periods} periods > ${maxPeriods}`));
      if (hours > maxHours) overload.push(p(`${num(hours, 1)} h > ${maxHours} h`, `${num(hours, 1)} ghante > ${maxHours}`));
      return {
        name: (r.name ?? '').trim() || p(`Teacher ${i + 1}`, `Teacher ${i + 1}`),
        subject: (r.subject ?? '').trim(),
        periods,
        hours,
        free: Math.max(0, presentPeriods - (periods - cover)),
        leave,
        cover,
        overload,
      };
    });

    const needCover = loads.filter((l) => l.cover > 0);
    const pool = loads.filter((l) => l.leave === 0 && l.overload.length === 0);
    // Substitutes: same subject first, then the most free periods, then
    // the lightest week. Every reason is shown; there is no hidden score.
    const subsFor = (t: TeacherLoad) =>
      [...pool]
        .sort((a, b) => Number(b.subject === t.subject && !!t.subject) - Number(a.subject === t.subject && !!t.subject) || b.free - a.free || a.hours - b.hours)
        .slice(0, 3)
        .map((s) => `${s.name}${s.subject === t.subject && t.subject ? p(' (same subject)', ' (wahi subject)') : ''}, ${s.free} ${p('free', 'free')}`);

    const overloaded = loads.filter((l) => l.overload.length);
    const avgHours = loads.reduce((a, l) => a + l.hours, 0) / loads.length;
    const sections: ReportSection[] = [
      {
        kind: 'stats',
        items: [
          { label: p('Teachers', 'Teachers'), value: num(loads.length) },
          { label: p('Over your limits', 'Seema se zyada'), value: num(overloaded.length), tone: overloaded.length ? 'bad' : 'good' },
          { label: p('Average working hours', 'Ausat kaam ke ghante'), value: num(avgHours, 1), note: p(`limit ${maxHours} h`, `seema ${maxHours} ghante`) },
          { label: p('Periods needing a substitute', 'Substitute wale periods'), value: num(needCover.reduce((a, l) => a + l.cover, 0)), tone: needCover.length ? 'warn' : 'good' },
        ],
      },
      {
        kind: 'table',
        heading: p('Workload comparison', 'Workload tulna'),
        columns: [p('Teacher', 'Teacher'), p('Subject', 'Subject'), p('Periods', 'Periods'), p('Hours', 'Ghante'), p('Free periods', 'Free periods'), p('Flag', 'Flag')],
        rows: loads.map((l) => [l.name, l.subject, num(l.periods), num(l.hours, 1), num(l.free), l.overload.join('; ') || (l.leave ? p(`On leave ${l.leave} day(s)`, `${l.leave} din chhutti`) : '')]),
        numeric: [false, false, true, true, true, false],
        rowTones: loads.map((l): ReportTone | undefined => (l.overload.length ? 'bad' : l.leave ? 'warn' : undefined)),
      },
    ];
    if (needCover.length) {
      sections.push({
        kind: 'table',
        heading: p('Substitute suggestions', 'Substitute sujhav'),
        columns: [p('Teacher on leave', 'Chhutti par teacher'), p('Periods to cover', 'Cover karne wale periods'), p('Suggested substitutes', 'Sujhaye gaye substitutes')],
        rows: needCover.map((t) => [t.name, num(t.cover), subsFor(t).join(' · ') || p('No one free within limits', 'Seema ke andar koi free nahi')]),
        numeric: [false, true, false],
      });
    }
    sections.push({
      kind: 'table',
      heading: p('Weekly plan (hours)', 'Hafte ka plan (ghante)'),
      columns: [p('Teacher', 'Teacher'), p('Teaching', 'Padhana'), p('Preparation', 'Taiyari'), p('Correction', 'Copy check'), p('Meetings and duty', 'Meeting aur duty'), p('Total', 'Kul')],
      rows: list.map((r, i) => [loads[i].name, num((loads[i].periods * minutes) / 60, 1), num(val(r, 'prep'), 1), num(val(r, 'correction'), 1), num(val(r, 'meetings'), 1), num(loads[i].hours, 1)]),
      numeric: [false, true, true, true, true, true],
    });

    return {
      errors: [],
      report: {
        title: p('Teacher Workload and Substitution Plan', 'Teacher Workload aur Substitution Plan'),
        subtitle: p(`${days}-day week · ${perDay} periods a day · ${minutes}-minute periods`, `${days} din ka hafta · din mein ${perDay} periods · ${minutes} minute ke periods`),
        sections,
        assumptions: [
          p('A teacher’s periods are spread evenly across the week, so leave removes the same share of them.', 'Teacher ke periods hafte bhar barabar bante hain, isliye chhutti utna hi hissa ghatati hai.'),
          p('Free periods = periods on days present minus periods still taught.', 'Free periods = present dinon ke periods minus padhaye jaane wale periods.'),
          p('Substitutes come only from teachers not on leave and within both limits.', 'Substitute sirf un teachers se jo chhutti par nahi aur dono seemaon ke andar hain.'),
          p('There is no single efficiency score; every figure above comes straight from your inputs.', 'Koi ek efficiency score nahi; upar ka har number seedhe aapke inputs se hai.'),
        ],
        disclaimer: p(
          'A planning aid. Workload limits are your school’s policy; confirm substitutions with the teachers concerned.',
          'Ye planning ki madad hai. Workload seema aapke school ki policy hai; substitution sambandhit teachers se pakka karein.'
        ),
      },
    };
  },
};
