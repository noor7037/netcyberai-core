import { Checker, bi, n, type Bi, type ToolSpec } from '../engine';
import { money, pct, type ReportSection } from '../report';
import { EMPTY_REPORT, ESTIMATE, picker } from './common';

const COSTS: { id: string; label: Bi }[] = [
  { id: 'payroll', label: bi('Payroll (all staff)', 'Payroll (sabhi staff)') },
  { id: 'rent', label: bi('Rent or loan instalment', 'Kiraya ya loan kisht') },
  { id: 'utilities', label: bi('Electricity, water and internet', 'Bijli, paani aur internet') },
  { id: 'materials', label: bi('Teaching materials and stationery', 'Padhai ka saamaan aur stationery') },
  { id: 'maintenance', label: bi('Maintenance and cleaning', 'Maintenance aur safai') },
  { id: 'communication', label: bi('Parent communication (SMS, WhatsApp, printing)', 'Parent communication (SMS, WhatsApp, printing)') },
  { id: 'software', label: bi('Software and subscriptions', 'Software aur subscriptions') },
  { id: 'transport', label: bi('Transport', 'Transport') },
  { id: 'other', label: bi('Other', 'Anya') },
];

const F = {
  students: bi('Students enrolled', 'Enrolled students'),
  fee: bi('Average annual fee per student', 'Har student ki ausat saalana fees'),
  collection: bi('Share of billed fee actually collected', 'Billed fees ka kitna hissa sach mein aata hai'),
  margin: bi('Surplus you want to keep', 'Kitna surplus chahiye'),
};

export const operationsCostSpec: ToolSpec = {
  slug: 'school-operations-cost-calculator',
  rulesUpdated: '27 September 2026',
  groups: [
    {
      title: bi('Monthly costs', 'Mahine ke kharche'),
      fields: COSTS.map((c) => ({ kind: 'number' as const, id: c.id, label: c.label, suffix: 'money' as const, min: 0 })),
    },
    {
      title: bi('Students and fees', 'Students aur fees'),
      fields: [
        { kind: 'number', id: 'students', label: F.students, suffix: 'students', min: 1 },
        { kind: 'number', id: 'fee', label: F.fee, suffix: 'money', min: 0 },
        { kind: 'number', id: 'collection', label: F.collection, suffix: 'percent', min: 1, max: 100 },
        { kind: 'number', id: 'margin', label: F.margin, suffix: 'percent', min: 0, max: 100, help: bi('For building, repairs and emergencies.', 'Building, marammat aur emergency ke liye.') },
      ],
    },
  ],
  defaults: { ...Object.fromEntries(COSTS.map((c) => [c.id, '0'])), students: '', fee: '', collection: '100', margin: '0' },

  compute(v, lang) {
    const p = picker(lang);
    const c = new Checker(lang);
    const monthly = COSTS.map((k) => ({ ...k, amount: c.opt(n(v, k.id), 0, k.label, { min: 0 }) }));
    const students = c.num(n(v, 'students'), F.students, { min: 1, int: true });
    const fee = c.num(n(v, 'fee'), F.fee, { min: 0 });
    const collection = c.opt(n(v, 'collection'), 100, F.collection, { min: 1, max: 100 });
    const margin = c.opt(n(v, 'margin'), 0, F.margin, { min: 0, max: 100 });
    const totalMonthly = monthly.reduce((a, m) => a + m.amount, 0);
    if (totalMonthly <= 0) c.add('Enter at least one monthly cost.', 'Kam se kam ek mahine ka kharcha bhariye.');
    if (c.errors.length) return { errors: c.errors, report: EMPTY_REPORT };

    const annual = totalMonthly * 12;
    const perStudent = annual / students;
    const breakEven = annual / (students * (collection / 100));
    const withMargin = breakEven * (1 + margin / 100);
    const revenue = students * fee * (collection / 100);
    const surplus = revenue - annual;
    const payrollShare = (monthly[0].amount / totalMonthly) * 100;

    const sections: ReportSection[] = [
      {
        kind: 'stats',
        items: [
          { label: p('Monthly running cost', 'Mahine ka kharcha'), value: money(totalMonthly) },
          { label: p('Annual budget', 'Saal ka budget'), value: money(annual) },
          { label: p('Cost per student per year', 'Har student par saal ka kharcha'), value: money(perStudent), note: p(`${money(perStudent / 12)} a month`, `${money(perStudent / 12)} mahina`) },
          { label: p('Break-even annual fee', 'Break-even saalana fees'), value: money(breakEven), tone: fee >= breakEven ? 'good' : 'bad', note: p(`at ${pct(collection, 0)} collection`, `${pct(collection, 0)} collection par`) },
          { label: p('Fee needed with your surplus', 'Surplus ke saath zaroori fees'), value: money(withMargin), note: p(`${pct(margin, 0)} surplus`, `${pct(margin, 0)} surplus`) },
          { label: surplus >= 0 ? p('Expected surplus this year', 'Is saal ka anumanit surplus') : p('Expected deficit this year', 'Is saal ka anumanit ghaata'), value: money(Math.abs(surplus)), tone: surplus >= 0 ? 'good' : 'bad' },
        ],
      },
      {
        kind: 'table',
        heading: p('Annual budget by category', 'Category ke hisaab se saal ka budget'),
        columns: [p('Category', 'Category'), p('Monthly', 'Mahina'), p('Annual', 'Saal'), p('Per student a year', 'Har student saal'), p('Share', 'Hissa')],
        rows: monthly.filter((m) => m.amount > 0).map((m) => [m.label[lang], money(m.amount), money(m.amount * 12), money((m.amount * 12) / students), pct((m.amount / totalMonthly) * 100)]),
        numeric: [false, true, true, true, true],
      },
    ];
    const notes: string[] = [];
    if (surplus < 0) notes.push(p(`At today’s average fee the school runs ${money(-surplus)} short this year. Improving collection is usually faster than raising fees.`, `Aaj ki ausat fees par school is saal ${money(-surplus)} kam padega. Fees badhane se pehle collection sudhaarna aksar tez hota hai.`));
    if (collection < 100) notes.push(p(`Collecting every billed rupee would lower the break-even fee to ${money(annual / students)}.`, `Har billed rupaya aane par break-even fees ${money(annual / students)} ho jayegi.`));
    notes.push(p(`Payroll is ${pct(payrollShare)} of running cost.`, `Payroll kul kharche ka ${pct(payrollShare)} hai.`));
    sections.push({ kind: 'notes', heading: p('What this means', 'Iska matlab'), items: notes, tone: surplus < 0 ? 'warn' : undefined });

    return {
      errors: [],
      report: {
        title: p('School Operations Cost and Break-even', 'School Operations Kharcha aur Break-even'),
        subtitle: p(`${students} students · average fee ${money(fee)}`, `${students} students · ausat fees ${money(fee)}`),
        sections,
        assumptions: [
          p('Monthly costs repeat for 12 months.', 'Mahine ke kharche 12 mahine dohraye gaye.'),
          p('Fee income is the only income; grants and donations are not included.', 'Fees hi aamdani hai; grant aur daan shaamil nahi.'),
          p('One-time capital spending (new buildings, buses) is not included.', 'Ek baar ka capital kharcha (naya building, bus) shaamil nahi.'),
        ],
        disclaimer: ESTIMATE(p),
      },
    };
  },
};
