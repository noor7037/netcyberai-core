import { Checker, bi, n, type ToolSpec } from '../engine';
import { money, num, pct, type ReportSection } from '../report';
import { EMPTY_REPORT, ESTIMATE, ceilSafe, picker } from './common';

const F = {
  seats: bi('Total seats in the school', 'School mein kul seats'),
  continuing: bi('Continuing students next year', 'Agle saal jaari rehne wale students'),
  enquiries: bi('Enquiries this season', 'Is season ki enquiries'),
  toApp: bi('Enquiries that apply', 'Apply karne wali enquiries'),
  toAdmit: bi('Applications that take admission', 'Admission lene wali applications'),
  admissionFee: bi('One-time admission fee', 'Ek baar ki admission fees'),
  annualFee: bi('Annual fee per student', 'Har student ki saalana fees'),
  sectionSize: bi('Students per section', 'Ek section mein students'),
  days: bi('Days left in the admission season', 'Admission season ke bache din'),
  capacity: bi('Follow-up calls your team can make a day', 'Team roz kitne follow-up call kar sakti hai'),
  improve: bi('Conversion improvement to test', 'Test karne ke liye conversion sudhaar'),
};

export const admissionSpec: ToolSpec = {
  slug: 'admission-revenue-planner',
  rulesUpdated: '27 September 2026',
  groups: [
    {
      title: bi('Seats', 'Seats'),
      fields: [
        { kind: 'number', id: 'seats', label: F.seats, suffix: 'count', min: 1 },
        { kind: 'number', id: 'continuing', label: F.continuing, suffix: 'students', min: 0 },
        { kind: 'number', id: 'sectionSize', label: F.sectionSize, suffix: 'students', min: 1 },
      ],
    },
    {
      title: bi('Funnel', 'Funnel'),
      fields: [
        { kind: 'number', id: 'enquiries', label: F.enquiries, suffix: 'count', min: 0 },
        { kind: 'number', id: 'toApp', label: F.toApp, suffix: 'percent', min: 0, max: 100 },
        { kind: 'number', id: 'toAdmit', label: F.toAdmit, suffix: 'percent', min: 0, max: 100 },
        { kind: 'number', id: 'improve', label: F.improve, suffix: 'percent', min: 0, max: 50, help: bi('Percentage points added to both conversion steps.', 'Dono conversion steps mein jode gaye percentage points.') },
      ],
    },
    {
      title: bi('Fees and follow-up', 'Fees aur follow-up'),
      fields: [
        { kind: 'number', id: 'admissionFee', label: F.admissionFee, suffix: 'money', min: 0 },
        { kind: 'number', id: 'annualFee', label: F.annualFee, suffix: 'money', min: 0 },
        { kind: 'number', id: 'days', label: F.days, suffix: 'days', min: 1 },
        { kind: 'number', id: 'capacity', label: F.capacity, suffix: 'count', min: 1 },
      ],
    },
  ],
  defaults: { seats: '', continuing: '', sectionSize: '40', enquiries: '', toApp: '', toAdmit: '', improve: '5', admissionFee: '0', annualFee: '', days: '30', capacity: '20' },

  compute(v, lang) {
    const p = picker(lang);
    const c = new Checker(lang);
    const seats = c.num(n(v, 'seats'), F.seats, { min: 1, int: true });
    const continuing = c.num(n(v, 'continuing'), F.continuing, { min: 0, int: true });
    const size = c.opt(n(v, 'sectionSize'), 40, F.sectionSize, { min: 1, int: true });
    const enquiries = c.num(n(v, 'enquiries'), F.enquiries, { min: 0, int: true });
    const toApp = c.num(n(v, 'toApp'), F.toApp, { min: 0, max: 100 });
    const toAdmit = c.num(n(v, 'toAdmit'), F.toAdmit, { min: 0, max: 100 });
    const improve = c.opt(n(v, 'improve'), 0, F.improve, { min: 0, max: 50 });
    const admissionFee = c.opt(n(v, 'admissionFee'), 0, F.admissionFee, { min: 0 });
    const annualFee = c.num(n(v, 'annualFee'), F.annualFee, { min: 0 });
    const days = c.opt(n(v, 'days'), 30, F.days, { min: 1, int: true });
    const capacity = c.opt(n(v, 'capacity'), 20, F.capacity, { min: 1 });
    if (continuing > seats) c.add('Continuing students cannot be more than total seats.', 'Jaari students kul seats se zyada nahi ho sakte.');
    if (c.errors.length) return { errors: c.errors, report: EMPTY_REPORT };

    const open = seats - continuing;
    const run = (a: number, b: number) => {
      const applications = Math.round(enquiries * (Math.min(100, a) / 100));
      const demand = Math.round(applications * (Math.min(100, b) / 100));
      const admitted = Math.min(demand, open);
      return { applications, demand, admitted, waitlist: Math.max(0, demand - open), revenue: admitted * (admissionFee + annualFee) };
    };
    const base = run(toApp, toAdmit);
    const s1 = run(toApp + improve, toAdmit + improve);
    const s2 = run(toApp + 2 * improve, toAdmit + 2 * improve);
    const unfilled = open - base.admitted;
    const queue = enquiries - base.applications;
    const perDay = queue / days;
    const newSections = ceilSafe(base.admitted / size);
    const fullRevenue = open * (admissionFee + annualFee);

    const sections: ReportSection[] = [
      {
        kind: 'stats',
        items: [
          { label: p('Seats open for new students', 'Naye students ke liye seats'), value: num(open) },
          { label: p('Expected admissions', 'Anumanit admissions'), value: num(base.admitted), tone: unfilled > 0 ? 'warn' : 'good', note: p(`from ${num(base.applications)} applications`, `${num(base.applications)} applications se`) },
          { label: p('Seats left unfilled', 'Khaali reh jaane wali seats'), value: num(unfilled), tone: unfilled > 0 ? 'warn' : 'good', note: base.waitlist ? p(`${base.waitlist} more want a seat (waitlist)`, `${base.waitlist} aur seat chahte hain (waitlist)`) : undefined },
          { label: p('First-year revenue from new admissions', 'Naye admissions se pehle saal ki aamdani'), value: money(base.revenue), note: p(`${money(fullRevenue)} if every open seat fills`, `sabhi seats bharne par ${money(fullRevenue)}`) },
          { label: p('New sections needed', 'Naye sections'), value: num(newSections), note: p(`${size} per section`, `${size} har section`) },
          { label: p('Follow-ups needed per day', 'Roz ke follow-up'), value: num(perDay, 1), tone: perDay > capacity ? 'bad' : 'good', note: p(`${num(queue)} enquiries not yet applied; team can do ${capacity} a day`, `${num(queue)} enquiries ne abhi apply nahi kiya; team roz ${capacity}`) },
        ],
      },
      {
        kind: 'table',
        heading: p('Scenario comparison', 'Scenario tulna'),
        columns: [p('Scenario', 'Scenario'), p('Applications', 'Applications'), p('Admissions', 'Admissions'), p('Waitlist', 'Waitlist'), p('Revenue', 'Aamdani')],
        rows: [
          [p('Current', 'Abhi'), num(base.applications), num(base.admitted), num(base.waitlist), money(base.revenue)],
          [p(`+${pct(improve, 0)} points`, `+${pct(improve, 0)} points`), num(s1.applications), num(s1.admitted), num(s1.waitlist), money(s1.revenue)],
          [p(`+${pct(2 * improve, 0)} points`, `+${pct(2 * improve, 0)} points`), num(s2.applications), num(s2.admitted), num(s2.waitlist), money(s2.revenue)],
        ],
        numeric: [false, true, true, true, true],
      },
    ];
    const notes: string[] = [];
    if (perDay > capacity) notes.push(p(`The follow-up queue needs ${num(perDay, 1)} calls a day but the team can make ${capacity}. Prioritise enquiries from the last 7 days.`, `Follow-up queue ko roz ${num(perDay, 1)} call chahiye par team ${capacity} kar sakti hai. Pichhle 7 din ki enquiries pehle.`));
    if (base.waitlist > 0) notes.push(p('Demand is above the seats open. Keep a written waitlist in the order applications arrived.', 'Maang khaali seats se zyada hai. Applications ke kram mein likhit waitlist rakhein.'));
    if (unfilled > 0) notes.push(p(`${num(unfilled)} seats may stay empty. Call every enquiry within a day and offer a school visit.`, `${num(unfilled)} seats khaali reh sakti hain. Har enquiry ko ek din mein call karein aur school visit offer karein.`));
    if (notes.length) sections.push({ kind: 'notes', heading: p('What to do next', 'Aage kya karein'), tone: 'warn', items: notes });

    return {
      errors: [],
      report: {
        title: p('Admission Capacity and Revenue Plan', 'Admission Capacity aur Aamdani Plan'),
        subtitle: p(`${num(enquiries)} enquiries · ${num(open)} open seats`, `${num(enquiries)} enquiries · ${num(open)} khaali seats`),
        sections,
        assumptions: [
          p('Admissions never exceed the open seats; extra demand becomes a waitlist.', 'Admissions khaali seats se zyada nahi; baaki maang waitlist banti hai.'),
          p('Revenue counts the admission fee and one year of annual fee for each new student.', 'Aamdani mein har naye student ki admission fees aur ek saal ki fees.'),
          p('Conversion rates are your estimates from past seasons.', 'Conversion rate pichhle season se aapke anumaan hain.'),
        ],
        disclaimer: ESTIMATE(p),
      },
    };
  },
};
