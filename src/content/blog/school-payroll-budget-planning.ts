import type { BlogPost } from '../contract';

export const schoolPayrollBudgetPlanning: BlogPost = {
  slug: 'school-payroll-budget-planning',
  title: 'Planning a School’s Payroll and Staff Budget',
  description:
    'How to estimate a school’s monthly payroll, cost to school, annual staff budget and cost per student, and compare increment scenarios before they are agreed.',
  publishedOn: '2026-09-27',
  answerFirst:
    'A staff budget starts from roles, not names: how many people in each role, their basic pay and allowances, and the employer contributions the school pays on top. Multiply out to a monthly cost to school, then to a year, then divide by students. That single cost-per-student figure makes every increment and new post an easier conversation.',
  body: [
    { type: 'heading', text: 'Gross pay, take-home and cost to school' },
    {
      type: 'list',
      items: [
        'Gross pay is basic pay plus allowances.',
        'Take-home is gross pay less the employee deductions the school applies.',
        'Cost to school is gross pay plus the employer contributions the school pays.',
        'The budget is cost to school for every person, for every salary month.',
      ],
    },
    {
      type: 'paragraph',
      text: 'Statutory contributions such as provident fund and employee state insurance depend on wage thresholds, and income tax depends on each person’s situation. A planning estimate should use the rates your accountant applies, and say clearly that it is an estimate.',
    },
    { type: 'heading', text: 'Cost per student and students per teacher' },
    {
      type: 'paragraph',
      text: 'Divide the annual staff budget by enrollment for cost per student, and enrollment by teaching staff for students per teacher. For elementary classes the RTE Act schedule sets pupil-teacher ratios of 30 to 1 at primary and 35 to 1 at upper primary level, which is a floor for staffing, not a target.',
    },
    { type: 'heading', text: 'Compare increments before agreeing them' },
    {
      type: 'paragraph',
      text: 'Put two increment levels side by side and look at the change in the annual budget and in cost per student. A decision that looks small per month can decide whether next year’s fee must rise. The [free Payroll and Staff Cost Planner](/free-tools/school-payroll-planner) prints this comparison, and the [Operations Cost Calculator](/free-tools/school-operations-cost-calculator) places payroll in the whole budget.',
    },
  ],
  faqs: [
    { question: 'What is cost to school?', answer: 'Gross pay plus the employer’s own contributions, such as the employer share of provident fund, for every person on the payroll.' },
    { question: 'Should the budget include vacant posts?', answer: 'Yes, if you intend to fill them this year. Add them as a role with the expected pay so the budget is not a surprise later.' },
    { question: 'What is a healthy student-teacher ratio?', answer: 'For classes 1 to 8, the RTE Act sets 30 to 1 at primary and 35 to 1 at upper primary as the maximum. Many private schools aim lower for quality.' },
    { question: 'Does a planner replace payroll software?', answer: 'No. It is for decisions and budgets. Salaries and statutory filings need proper payroll records.' },
  ],
  sources: [
    { label: 'Department of School Education and Literacy: student-teacher ratio under the RTE Act', url: 'https://dsel.education.gov.in/sites/default/files/update/Student-Teacher-Ratio.pdf', checkedOn: '2026-09-27' },
  ],
  caseStudy: null,
};
