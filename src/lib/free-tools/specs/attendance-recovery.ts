import { calculateAttendance } from '../attendance';
import { Checker, bi, n, type ToolSpec } from '../engine';
import { num, pct, type ReportSection } from '../report';
import { EMPTY_REPORT, picker } from './common';

const F = {
  present: bi('Days present so far', 'Ab tak present din'),
  absent: bi('Days absent so far', 'Ab tak absent din'),
  remaining: bi('Working days left this term', 'Term mein bache working din'),
  target: bi('Target attendance', 'Target attendance'),
  planned: bi('Days you expect to miss (what-if)', 'Kitne din chhootne ki sambhavna (what-if)'),
};

export interface RecoveryResult {
  currentPercent: number;
  bestFinalPercent: number;
  // Days of the remaining ones that must be attended to end the term at
  // or above the target; null when even full attendance cannot reach it.
  mustAttend: number | null;
  maxMisses: number;
}

// Exact integer arithmetic in hundredths of a percent, so a target of 75
// on 200 days needs exactly 150, never 149.99999.
export function attendanceRecovery(present: number, absent: number, remaining: number, target: number): RecoveryResult {
  const sofar = present + absent;
  const total = sofar + remaining;
  const basis = Math.round(target * 100);
  const gap = basis * total - present * 10000;
  const need = gap <= 0 ? 0 : Math.ceil(gap / 10000);
  const mustAttend = need > remaining ? null : need;
  return {
    currentPercent: sofar > 0 ? (present / sofar) * 100 : 0,
    bestFinalPercent: total > 0 ? ((present + remaining) / total) * 100 : 0,
    mustAttend,
    maxMisses: mustAttend === null ? 0 : remaining - mustAttend,
  };
}

export const attendanceRecoverySpec: ToolSpec = {
  slug: 'attendance-recovery-planner',
  rulesUpdated: '27 September 2026',
  groups: [
    {
      title: bi('Attendance so far', 'Ab tak ki attendance'),
      fields: [
        { kind: 'number', id: 'present', label: F.present, suffix: 'days', min: 0 },
        { kind: 'number', id: 'absent', label: F.absent, suffix: 'days', min: 0 },
        { kind: 'number', id: 'remaining', label: F.remaining, suffix: 'days', min: 0, help: bi('Count only days the school is open.', 'Sirf wahi din ginein jab school khula ho.') },
      ],
    },
    {
      title: bi('Rule and plan', 'Niyam aur plan'),
      fields: [
        {
          kind: 'number',
          id: 'target',
          label: F.target,
          suffix: 'percent',
          min: 1,
          max: 99,
          help: bi('Use your board’s or school’s current rule. Many boards use 75.', 'Apne board ya school ka current niyam likhein. Kai boards 75 rakhte hain.'),
        },
        { kind: 'number', id: 'planned', label: F.planned, suffix: 'days', min: 0 },
      ],
    },
  ],
  defaults: { present: '', absent: '', remaining: '', target: '75', planned: '0' },

  compute(v, lang) {
    const p = picker(lang);
    const c = new Checker(lang);
    const present = c.num(n(v, 'present'), F.present, { min: 0, int: true });
    const absent = c.num(n(v, 'absent'), F.absent, { min: 0, int: true });
    const remaining = c.num(n(v, 'remaining'), F.remaining, { min: 0, int: true });
    const target = c.num(n(v, 'target'), F.target, { min: 1, max: 99 });
    const planned = c.opt(n(v, 'planned'), 0, F.planned, { min: 0, int: true });
    if (present + absent === 0) c.add('Enter at least one day present or absent.', 'Kam se kam ek din present ya absent bhariye.');
    if (planned > remaining) c.add('Days you expect to miss cannot be more than the days left.', 'Chhootne wale din bache hue dinon se zyada nahi ho sakte.');
    if (c.errors.length) return { errors: c.errors, report: EMPTY_REPORT };

    const r = attendanceRecovery(present, absent, remaining, target);
    const total = present + absent + remaining;
    const now = calculateAttendance({ attended: present, total: present + absent, targetPercent: target });
    const eligible = r.mustAttend !== null;
    const finalWith = (miss: number) => ((present + remaining - miss) / total) * 100;
    const okWith = (miss: number) => (present + remaining - miss) * 10000 >= Math.round(target * 100) * total;

    const misses = Array.from(new Set([0, planned, 2, 5, 10, r.maxMisses, r.maxMisses + 1].filter((m) => m >= 0 && m <= remaining))).sort((a, b) => a - b);

    const sections: ReportSection[] = [
      {
        kind: 'stats',
        items: [
          { label: p('Attendance now', 'Abhi attendance'), value: pct(r.currentPercent), tone: now.ok && now.meetsTarget ? 'good' : 'warn' },
          {
            label: p('Days to attend of those left', 'Bache dinon mein se kitne din aana zaroori'),
            value: eligible ? num(r.mustAttend as number) : p('Not reachable', 'Sambhav nahi'),
            tone: eligible ? 'neutral' : 'bad',
            note: p(`out of ${remaining} working days`, `${remaining} working dinon mein se`),
          },
          { label: p('Most days that can still be missed', 'Zyada se zyada kitne din chhoot sakte hain'), value: num(r.maxMisses), tone: eligible ? (r.maxMisses > 3 ? 'good' : 'warn') : 'bad' },
          { label: p('Best possible by term end', 'Term ke ant tak sabse achha'), value: pct(r.bestFinalPercent), note: p('if every remaining day is attended', 'agar har bacha din aaye') },
          { label: p('With your planned absences', 'Aapki sochi chhuttiyon ke saath'), value: pct(finalWith(planned)), tone: okWith(planned) ? 'good' : 'bad' },
          ...(now.ok && !now.meetsTarget
            ? [{ label: p('Days in a row to be back on target', 'Target par lautne ke liye lagatar din'), value: num(now.daysNeeded), note: p('counting from today', 'aaj se ginti') }]
            : []),
        ],
      },
      {
        kind: 'table',
        heading: p('What-if: days missed from now', 'What-if: ab se chhoote din'),
        columns: [p('Days missed', 'Chhoote din'), p('Final attendance', 'Final attendance'), p('Meets target?', 'Target poora?')],
        rows: misses.map((m) => [num(m), pct(finalWith(m)), okWith(m) ? p('Yes', 'Haan') : p('No', 'Nahi')]),
        numeric: [true, true, false],
        rowTones: misses.map((m) => (okWith(m) ? undefined : 'bad')),
      },
    ];
    if (!eligible) {
      sections.push({
        kind: 'notes',
        heading: p('Exam eligibility warning', 'Exam eligibility chetavni'),
        tone: 'bad',
        items: [
          p(`Even with full attendance, the term ends at ${pct(r.bestFinalPercent)}, below the ${pct(target, 0)} target.`, `Poori attendance ke baad bhi term ${pct(r.bestFinalPercent)} par khatam hoga, jo ${pct(target, 0)} target se kam hai.`),
          p('Speak to the school now about medical certificates and any condonation rule your board allows.', 'Abhi school se medical certificate aur board ke condonation niyam ke baare mein baat karein.'),
        ],
      });
    } else if (r.maxMisses <= 3) {
      sections.push({
        kind: 'notes',
        heading: p('Close to the line', 'Seema ke kareeb'),
        tone: 'warn',
        items: [p(`Only ${r.maxMisses} more absences are possible this term. Plan leave carefully.`, `Is term sirf ${r.maxMisses} aur chhuttiyan sambhav hain. Chhutti soch-samajh kar lein.`)],
      });
    }
    return {
      errors: [],
      report: {
        title: p('Attendance Recovery Plan', 'Attendance Recovery Plan'),
        subtitle: p(`Target ${pct(target, 0)} · ${total} working days in the term`, `Target ${pct(target, 0)} · term mein ${total} working din`),
        sections,
        assumptions: [
          p('Attendance is counted in whole days; half days are not included.', 'Attendance poore dinon mein gini gayi hai; aadhe din shaamil nahi.'),
          p('The working days left are the only school days before the attendance is checked.', 'Bache working din hi attendance check se pehle ke school din hain.'),
          p('Medical leave, condonation and exemptions depend on your board and school, and are not applied here.', 'Medical leave, condonation aur chhoot board aur school par nirbhar hain; yahan lagu nahi kiye gaye.'),
        ],
        disclaimer: p(
          'A planning aid, not an eligibility decision. The school’s own register and your board’s current rule decide eligibility.',
          'Ye sirf planning ki madad hai, eligibility ka faisla nahi. School ka register aur board ka current niyam hi eligibility tay karta hai.'
        ),
      },
    };
  },
};
