import { Checker, bi, n, str, type ToolSpec } from '../engine';
import { money, pct, type ReportSection } from '../report';
import { EMPTY_REPORT, ESTIMATE, MONTHS, ordinal, picker } from './common';

const PLANS = { monthly: 12, quarterly: 4, term: 3, half: 2, annual: 1 } as const;
type Plan = keyof typeof PLANS;

const F = {
  annualFee: bi('Annual fee per student', 'Har student ki saalana fees'),
  students: bi('Number of students', 'Students ki sankhya'),
  plan: bi('Instalment plan', 'Kisht ka plan'),
  startMonth: bi('First instalment month', 'Pehli kisht ka mahina'),
  dueDay: bi('Due day of the month', 'Mahine ki due date'),
  downPayment: bi('Down payment at admission', 'Admission par pehli payment'),
  siblingStudents: bi('Students with a sibling discount', 'Sibling discount wale students'),
  siblingPercent: bi('Sibling discount', 'Sibling discount'),
  concessionStudents: bi('Students with a scholarship or concession', 'Scholarship ya concession wale students'),
  concessionPercent: bi('Scholarship or concession', 'Scholarship ya concession'),
  lateFee: bi('Late fee per late instalment', 'Har late kisht par late fee'),
  onTime: bi('Instalments paid on time', 'Samay par bhari kishtein'),
  late: bi('Instalments paid late (within the year)', 'Late bhari kishtein (saal ke andar)'),
};

// Splits an amount into n instalments of whole rupees; the last one
// absorbs the rounding so the schedule always adds up exactly.
export function splitInstalments(amount: number, count: number): number[] {
  const each = Math.floor(amount / count);
  const out = Array.from({ length: count }, () => each);
  out[count - 1] = amount - each * (count - 1);
  return out;
}

export const feePlannerSpec: ToolSpec = {
  slug: 'school-fee-planner',
  rulesUpdated: '27 September 2026',
  groups: [
    {
      title: bi('Fee structure', 'Fee structure'),
      fields: [
        { kind: 'number', id: 'annualFee', label: F.annualFee, suffix: 'money', min: 0, step: 100 },
        { kind: 'number', id: 'students', label: F.students, suffix: 'students', min: 1 },
        {
          kind: 'select',
          id: 'plan',
          label: F.plan,
          options: [
            { value: 'monthly', label: bi('Monthly (12)', 'Har mahine (12)') },
            { value: 'quarterly', label: bi('Quarterly (4)', 'Har teen mahine (4)') },
            { value: 'term', label: bi('Term-wise (3)', 'Term ke hisaab se (3)') },
            { value: 'half', label: bi('Half-yearly (2)', 'Chhah-maahi (2)') },
            { value: 'annual', label: bi('Once a year (1)', 'Saal mein ek baar (1)') },
          ],
        },
        { kind: 'select', id: 'startMonth', label: F.startMonth, options: MONTHS.map((m, i) => ({ value: String(i), label: bi(m, m) })) },
        { kind: 'number', id: 'dueDay', label: F.dueDay, min: 1, max: 28 },
        { kind: 'number', id: 'downPayment', label: F.downPayment, suffix: 'money', min: 0, help: bi('Collected once at admission and taken off the instalments.', 'Admission par ek baar li jati hai aur kishton se ghata di jati hai.') },
        { kind: 'number', id: 'lateFee', label: F.lateFee, suffix: 'money', min: 0 },
      ],
    },
    {
      title: bi('Discounts', 'Chhoot'),
      fields: [
        { kind: 'number', id: 'siblingStudents', label: F.siblingStudents, suffix: 'students', min: 0 },
        { kind: 'number', id: 'siblingPercent', label: F.siblingPercent, suffix: 'percent', min: 0, max: 100 },
        { kind: 'number', id: 'concessionStudents', label: F.concessionStudents, suffix: 'students', min: 0 },
        { kind: 'number', id: 'concessionPercent', label: F.concessionPercent, suffix: 'percent', min: 0, max: 100 },
      ],
    },
    {
      title: bi('Collection forecast', 'Collection ka anumaan'),
      fields: [
        { kind: 'number', id: 'onTime', label: F.onTime, suffix: 'percent', min: 0, max: 100, help: bi('Your best estimate from last year’s register.', 'Pichhle saal ke register se apna anumaan.') },
        { kind: 'number', id: 'late', label: F.late, suffix: 'percent', min: 0, max: 100 },
      ],
    },
  ],
  defaults: { annualFee: '', students: '', plan: 'quarterly', startMonth: '3', dueDay: '10', downPayment: '0', lateFee: '0', siblingStudents: '0', siblingPercent: '0', concessionStudents: '0', concessionPercent: '0', onTime: '', late: '0' },

  compute(v, lang) {
    const p = picker(lang);
    const c = new Checker(lang);
    const fee = c.num(n(v, 'annualFee'), F.annualFee, { min: 1 });
    const students = c.num(n(v, 'students'), F.students, { min: 1, int: true });
    const plan = (str(v, 'plan') in PLANS ? str(v, 'plan') : 'quarterly') as Plan;
    const count = PLANS[plan];
    const start = Math.min(11, Math.max(0, Math.round(n(v, 'startMonth')) || 0));
    const dueDay = c.opt(n(v, 'dueDay'), 10, F.dueDay, { min: 1, max: 28, int: true });
    const down = c.opt(n(v, 'downPayment'), 0, F.downPayment, { min: 0 });
    const lateFee = c.opt(n(v, 'lateFee'), 0, F.lateFee, { min: 0 });
    const sibN = c.opt(n(v, 'siblingStudents'), 0, F.siblingStudents, { min: 0, int: true });
    const sibP = c.opt(n(v, 'siblingPercent'), 0, F.siblingPercent, { min: 0, max: 100 });
    const conN = c.opt(n(v, 'concessionStudents'), 0, F.concessionStudents, { min: 0, int: true });
    const conP = c.opt(n(v, 'concessionPercent'), 0, F.concessionPercent, { min: 0, max: 100 });
    const onTime = c.num(n(v, 'onTime'), F.onTime, { min: 0, max: 100 });
    const late = c.opt(n(v, 'late'), 0, F.late, { min: 0, max: 100 });
    if (sibN + conN > students) c.add('Discounted students cannot be more than the total number of students.', 'Discount wale students kul students se zyada nahi ho sakte.');
    if (onTime + late > 100) c.add('On-time and late instalments together cannot be more than 100 percent.', 'Samay par aur late kishtein milakar 100 percent se zyada nahi ho sakti.');
    const sibFee = Math.round(fee * (1 - sibP / 100));
    const conFee = Math.round(fee * (1 - conP / 100));
    if (down > Math.min(fee, sibFee, conFee)) c.add('The down payment is larger than a discounted annual fee.', 'Pehli payment discount wali saalana fees se zyada hai.');
    if (c.errors.length) return { errors: c.errors, report: EMPTY_REPORT };

    const fullN = students - sibN - conN;
    const planFor = (annual: number) => splitInstalments(annual - down, count);
    const full = planFor(fee);
    const sib = planFor(sibFee);
    const con = planFor(conFee);

    const gross = fee * students;
    const sibDiscount = (fee - sibFee) * sibN;
    const conDiscount = (fee - conFee) * conN;
    const net = gross - sibDiscount - conDiscount;
    const downTotal = down * students;
    const instalmentTotal = net - downTotal;
    const collected = downTotal + instalmentTotal * ((onTime + late) / 100);
    const lateIncome = count * students * (late / 100) * lateFee;
    const shortfall = net - collected;
    const collectionPct = net > 0 ? (collected / net) * 100 : 0;

    const step = 12 / count;
    const schedule = full.map((amt, i) => {
      const month = MONTHS[(start + i * step) % 12];
      const billed = amt * fullN + sib[i] * sibN + con[i] * conN;
      return [String(i + 1), `${dueDay} ${month}`, money(amt), money(sib[i]), money(con[i]), money(billed), money(billed * (onTime / 100))];
    });

    const sections: ReportSection[] = [
      {
        kind: 'stats',
        items: [
          { label: p('Net fee billable this year', 'Is saal ki net billable fees'), value: money(net), note: p(`Gross ${money(gross)} less discounts`, `Gross ${money(gross)} mein se discount ghata kar`) },
          { label: p('Expected collection', 'Anumanit collection'), value: money(collected), tone: collectionPct >= 95 ? 'good' : collectionPct >= 85 ? 'warn' : 'bad', note: pct(collectionPct) },
          { label: p('Projected shortfall', 'Anumanit kami'), value: money(shortfall), tone: shortfall <= 0 ? 'good' : 'bad' },
          { label: p('Instalment for a full-fee student', 'Poori fees wale student ki kisht'), value: money(full[0]), note: p(`${count} instalments`, `${count} kishtein`) },
          { label: p('Discounts given', 'Di gayi chhoot'), value: money(sibDiscount + conDiscount), note: p(`Sibling ${money(sibDiscount)}, concession ${money(conDiscount)}`, `Sibling ${money(sibDiscount)}, concession ${money(conDiscount)}`) },
          { label: p('Late fee income (estimate)', 'Late fee se aamdani (anumaan)'), value: money(lateIncome) },
        ],
      },
      {
        kind: 'table',
        heading: p('Instalment schedule', 'Kisht schedule'),
        columns: [p('No.', 'No.'), p('Due date', 'Due date'), p('Full fee', 'Poori fees'), p('Sibling', 'Sibling'), p('Concession', 'Concession'), p('School bills', 'School ka bill'), p('Expected on time', 'Samay par anumaan')],
        rows: schedule,
        numeric: [false, false, true, true, true, true, true],
      },
      {
        kind: 'text',
        heading: p('For parents', 'Parents ke liye'),
        text: p(
          `Annual fee ${money(fee)}. ${down > 0 ? `Pay ${money(down)} at admission, then ` : 'Pay '}${count} instalment${count > 1 ? 's' : ''} of about ${money(full[0])}, due on the ${ordinal(dueDay)}. ${lateFee > 0 ? `A late fee of ${money(lateFee)} applies to each late instalment.` : ''}`,
          `Saalana fees ${money(fee)}. ${down > 0 ? `Admission par ${money(down)}, phir ` : ''}${count} kisht, har ek lagbhag ${money(full[0])}, har baar ${dueDay} tareekh tak. ${lateFee > 0 ? `Har late kisht par ${money(lateFee)} late fee lagegi.` : ''}`
        ).trim(),
      },
    ];
    if (shortfall > 0) {
      sections.push({
        kind: 'notes',
        heading: p('To close the gap', 'Kami poori karne ke liye'),
        tone: 'warn',
        items: [
          p(`${money(shortfall)} is not expected to arrive this year at these rates.`, `In daron par ${money(shortfall)} is saal aane ki ummeed nahi hai.`),
          p('Send one polite reminder to each family three days before every due date.', 'Har due date se teen din pehle har parivaar ko ek vinamr reminder bhejein.'),
          p('Offer a smaller instalment plan to families who ask, instead of waiting for the year end.', 'Jo parivaar poochhein unhe chhoti kisht ka plan dein, saal ke ant ka intezaar na karein.'),
        ],
      });
    }
    return {
      errors: [],
      report: {
        title: p('School Fee Plan and Collection Forecast', 'School Fee Plan aur Collection Anumaan'),
        subtitle: p(`${students} students · ${count} instalments`, `${students} students · ${count} kishtein`),
        sections,
        assumptions: [
          p('Sibling and concession students are separate groups; a student gets one discount, not both.', 'Sibling aur concession students alag groups hain; ek student ko ek hi chhoot milti hai.'),
          p('Discounts apply to the annual fee; the down payment is the same for everyone.', 'Chhoot saalana fees par lagti hai; pehli payment sabke liye barabar hai.'),
          p('Every down payment is collected at admission.', 'Har pehli payment admission par mil jati hai.'),
          p('Instalments are whole rupees; the last instalment absorbs rounding.', 'Kishtein poore rupaye mein hain; aakhri kisht mein rounding adjust hoti hai.'),
        ],
        disclaimer: ESTIMATE(p),
      },
    };
  },
};
