import { Checker, bi, n, rn, rows, type ToolSpec } from '../engine';
import { money, num, pct, type ReportSection } from '../report';
import { EMPTY_REPORT, ESTIMATE, picker } from './common';

const F = {
  staff: bi('Staff by role', 'Role ke hisaab se staff'),
  students: bi('Students enrolled', 'Enrolled students'),
  months: bi('Salary months per year', 'Saal mein salary ke mahine'),
  incA: bi('Scenario A: increment', 'Scenario A: increment'),
  incB: bi('Scenario B: increment', 'Scenario B: increment'),
};

export const payrollSpec: ToolSpec = {
  slug: 'school-payroll-planner',
  rulesUpdated: '27 September 2026',
  groups: [
    {
      title: bi('Staff and pay', 'Staff aur vetan'),
      fields: [
        {
          kind: 'rows',
          id: 'staff',
          label: F.staff,
          help: bi(
            'Monthly amounts per person. Enter your own deduction and employer rates; this tool does not work out statutory amounts.',
            'Har vyakti ki mahine ki rakam. Deduction aur employer rate khud bhariye; ye tool statutory rakam nahi nikalta.'
          ),
          addLabel: bi('Add role', 'Role jodein'),
          maxRows: 25,
          columns: [
            { id: 'role', label: bi('Role', 'Role'), kind: 'text' },
            { id: 'teaching', label: bi('Teaching (Y/N)', 'Teaching (Y/N)'), kind: 'text' },
            { id: 'count', label: bi('People', 'Log'), kind: 'number', min: 0 },
            { id: 'basic', label: bi('Basic pay', 'Basic pay'), kind: 'number', min: 0, suffix: 'money' },
            { id: 'allowances', label: bi('Allowances', 'Allowances'), kind: 'number', min: 0, suffix: 'money' },
            { id: 'deduction', label: bi('Employee deductions % of basic', 'Employee deduction basic ka %'), kind: 'number', min: 0 },
            { id: 'employer', label: bi('Employer contribution % of basic', 'Employer contribution basic ka %'), kind: 'number', min: 0 },
          ],
        },
      ],
    },
    {
      title: bi('School and scenarios', 'School aur scenarios'),
      fields: [
        { kind: 'number', id: 'students', label: F.students, suffix: 'students', min: 1 },
        { kind: 'number', id: 'months', label: F.months, suffix: 'months', min: 1, max: 14 },
        { kind: 'number', id: 'incA', label: F.incA, suffix: 'percent', min: 0, max: 100 },
        { kind: 'number', id: 'incB', label: F.incB, suffix: 'percent', min: 0, max: 100 },
      ],
    },
  ],
  defaults: {
    staff: [{ role: '', teaching: 'Y', count: '', basic: '', allowances: '', deduction: '0', employer: '0' }],
    students: '',
    months: '12',
    incA: '5',
    incB: '10',
  },

  compute(v, lang) {
    const p = picker(lang);
    const c = new Checker(lang);
    const students = c.num(n(v, 'students'), F.students, { min: 1, int: true });
    const months = c.opt(n(v, 'months'), 12, F.months, { min: 1, max: 14 });
    const incA = c.opt(n(v, 'incA'), 0, F.incA, { min: 0, max: 100 });
    const incB = c.opt(n(v, 'incB'), 0, F.incB, { min: 0, max: 100 });
    const staff = rows(v, 'staff')
      .map((r, i) => ({
        role: (r.role ?? '').trim() || p(`Role ${i + 1}`, `Role ${i + 1}`),
        teaching: /^(y|yes|haan|h)$/i.test((r.teaching ?? '').trim()),
        count: rn(r, 'count'),
        basic: rn(r, 'basic'),
        allowances: Number.isFinite(rn(r, 'allowances')) ? rn(r, 'allowances') : 0,
        deduction: Number.isFinite(rn(r, 'deduction')) ? rn(r, 'deduction') : 0,
        employer: Number.isFinite(rn(r, 'employer')) ? rn(r, 'employer') : 0,
      }))
      .filter((s) => Number.isFinite(s.count) || Number.isFinite(s.basic));
    if (staff.length === 0) c.add('Add at least one role with its people and basic pay.', 'Kam se kam ek role, log aur basic pay jodein.');
    staff.forEach((s, i) => {
      if (!Number.isFinite(s.count) || s.count < 0 || !Number.isInteger(s.count)) c.add(`Row ${i + 1}: enter the number of people as a whole number.`, `Row ${i + 1}: logon ki sankhya poore number mein bhariye.`);
      if (!Number.isFinite(s.basic) || s.basic < 0) c.add(`Row ${i + 1}: enter the basic pay.`, `Row ${i + 1}: basic pay bhariye.`);
      if (s.deduction < 0 || s.deduction > 100 || s.employer < 0 || s.employer > 100) c.add(`Row ${i + 1}: rates must be between 0 and 100.`, `Row ${i + 1}: rate 0 se 100 ke beech ho.`);
    });
    if (c.errors.length) return { errors: c.errors, report: EMPTY_REPORT };

    const lines = staff.map((s) => {
      const gross = s.basic + s.allowances;
      const deductions = (s.basic * s.deduction) / 100;
      const employer = (s.basic * s.employer) / 100;
      return { ...s, gross, net: gross - deductions, cost: gross + employer, totalGross: gross * s.count, totalNet: (gross - deductions) * s.count, totalCost: (gross + employer) * s.count };
    });
    const monthlyGross = lines.reduce((a, l) => a + l.totalGross, 0);
    const monthlyNet = lines.reduce((a, l) => a + l.totalNet, 0);
    const monthlyCost = lines.reduce((a, l) => a + l.totalCost, 0);
    const annual = monthlyCost * months;
    const teachers = lines.filter((l) => l.teaching).reduce((a, l) => a + l.count, 0);
    const teacherCost = lines.filter((l) => l.teaching).reduce((a, l) => a + l.totalCost, 0) * months;
    const headcount = lines.reduce((a, l) => a + l.count, 0);

    const scenario = (inc: number) => annual * (1 + inc / 100);
    const sections: ReportSection[] = [
      {
        kind: 'stats',
        items: [
          { label: p('Monthly payroll (gross)', 'Mahine ka payroll (gross)'), value: money(monthlyGross), note: p(`${headcount} people`, `${headcount} log`) },
          { label: p('Monthly cost to school', 'School ka mahine ka kharcha'), value: money(monthlyCost), note: p('gross pay + employer contributions', 'gross pay + employer contribution') },
          { label: p('Annual staff budget', 'Saal ka staff budget'), value: money(annual), note: p(`${months} salary months`, `${months} salary mahine`) },
          { label: p('Staff cost per student per year', 'Har student par saal ka staff kharcha'), value: money(annual / students) },
          { label: p('Students per teacher', 'Har teacher par students'), value: teachers > 0 ? num(students / teachers, 1) : '—', note: p(`${teachers} teaching staff`, `${teachers} teaching staff`) },
          { label: p('Teacher cost per student per year', 'Har student par saal ka teacher kharcha'), value: money(teacherCost / students) },
        ],
      },
      {
        kind: 'table',
        heading: p('Cost by role (monthly)', 'Role ke hisaab se kharcha (mahina)'),
        columns: [p('Role', 'Role'), p('People', 'Log'), p('Gross each', 'Har ek ka gross'), p('Take-home each', 'Har ek ka haath mein'), p('Cost each', 'Har ek ka kharcha'), p('Total cost', 'Kul kharcha'), p('Share', 'Hissa')],
        rows: lines.map((l) => [l.role, num(l.count), money(l.gross), money(l.net), money(l.cost), money(l.totalCost), pct(monthlyCost ? (l.totalCost / monthlyCost) * 100 : 0)]),
        numeric: [false, true, true, true, true, true, true],
      },
      {
        kind: 'table',
        heading: p('Scenario comparison (annual)', 'Scenario tulna (saal)'),
        columns: [p('Scenario', 'Scenario'), p('Annual cost', 'Saal ka kharcha'), p('Per student', 'Har student'), p('Change', 'Badlaav')],
        rows: [
          [p('Current', 'Abhi'), money(annual), money(annual / students), money(0)],
          [p(`A: +${pct(incA)}`, `A: +${pct(incA)}`), money(scenario(incA)), money(scenario(incA) / students), money(scenario(incA) - annual)],
          [p(`B: +${pct(incB)}`, `B: +${pct(incB)}`), money(scenario(incB)), money(scenario(incB) / students), money(scenario(incB) - annual)],
        ],
        numeric: [false, true, true, true],
      },
      {
        kind: 'notes',
        heading: p('Monthly take-home paid out', 'Mahine mein haath mein diya gaya'),
        items: [p(`${money(monthlyNet)} after the employee deductions you entered.`, `Aapke bhare deductions ke baad ${money(monthlyNet)}.`)],
      },
    ];

    return {
      errors: [],
      report: {
        title: p('School Payroll and Staff Cost Estimate', 'School Payroll aur Staff Kharcha Anumaan'),
        subtitle: p(`${headcount} staff · ${students} students`, `${headcount} staff · ${students} students`),
        sections,
        assumptions: [
          p('Deduction and employer rates apply to basic pay only, as entered.', 'Deduction aur employer rate sirf basic pay par, jaisa bhara gaya.'),
          p('Increments apply evenly to all pay and contributions.', 'Increment sabhi pay aur contribution par barabar lagta hai.'),
          p('Statutory deductions such as PF, ESI, professional tax and TDS depend on thresholds and current rules; this estimate does not calculate them.', 'PF, ESI, professional tax aur TDS jaise statutory deduction seema aur current niyam par nirbhar hain; ye anumaan unhe nahi nikalta.'),
        ],
        disclaimer: ESTIMATE(p),
      },
    };
  },
};
