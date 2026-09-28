import type { BlogPost } from '../contract';

export const attendanceRecoveryPlanForExamEligibility: BlogPost = {
  slug: 'attendance-recovery-plan-for-exam-eligibility',
  title: 'Attendance Recovery Plans Before Board Exams',
  description:
    'How to work out the school days a student must still attend to meet the attendance rule for exams, how many can be missed, and when to warn the family early.',
  publishedOn: '2026-09-27',
  answerFirst:
    'An attendance recovery plan answers one question early: of the working days left, how many must this student attend to finish the term at or above the attendance rule? If the answer is more days than remain, the target is already out of reach and the family must hear it now, while medical records and exemptions can still be arranged.',
  body: [
    { type: 'heading', text: 'The rule and why it is enforced' },
    {
      type: 'paragraph',
      text: 'CBSE’s examination bye-laws require a minimum of 75 percent attendance for students to appear in the Class 10 and Class 12 board examinations, with limited relaxation for documented exigencies such as medical emergencies or national-level sports. In August 2025 the board asked schools to enforce this strictly. Other boards set their own rules, so always confirm the rule your school follows today.',
    },
    { type: 'heading', text: 'The arithmetic, done exactly' },
    {
      type: 'paragraph',
      text: 'Add the days present, the days absent and the working days left to get the term’s total working days. Multiply by the target share to find the present days required, and subtract the days already present. That is the number of remaining days the student must attend. Everything left over is the most that can still be missed. Doing this in whole days, rather than rounded percentages, avoids telling a family they are safe when they are one day short.',
    },
    {
      type: 'list',
      items: [
        'Must attend = target share × (present + absent + days left) − present, rounded up.',
        'Can still miss = days left − must attend.',
        'If must attend is more than the days left, full attendance cannot reach the target.',
      ],
    },
    { type: 'heading', text: 'Warn early and in writing' },
    {
      type: 'paragraph',
      text: 'A printed plan showing what-if outcomes, such as missing two, five or ten more days, turns an abstract rule into a decision the family can act on. The [free Attendance Recovery Planner](/free-tools/attendance-recovery-planner) prints exactly that, with an eligibility warning when the target is no longer reachable.',
    },
    { type: 'heading', text: 'From one student to the whole school' },
    {
      type: 'paragraph',
      text: 'Checking students one by one works for a few families. For a whole school, attendance needs to be marked once and every student compared with the rule automatically, so the students drifting towards the line are seen in the first term. That is the idea behind [attendance alerts that do not spam parents](/blog/school-attendance-alerts-without-spamming-parents).',
    },
  ],
  faqs: [
    { question: 'How many days must a student attend to reach 75 percent?', answer: 'Multiply the term’s total working days by 0.75, subtract the days already present, and round up. That is the number of the remaining days the student must attend.' },
    { question: 'What if the student cannot reach the target any more?', answer: 'Tell the family immediately and in writing, and check whether the board’s relaxation for documented medical or sports reasons applies. Waiting only removes options.' },
    { question: 'Does every board use 75 percent?', answer: 'No. CBSE uses 75 percent for board exam eligibility, but state boards and schools set their own rules. Enter the rule that applies to your students.' },
    { question: 'Are half days counted?', answer: 'The simple plan counts whole days. If your school counts half days, record them the way your register does before planning.' },
  ],
  sources: [
    {
      label: 'CBSE circular: strict compliance with attendance requirements for eligibility (5 August 2025)',
      url: 'https://www.cbse.gov.in/cbsenew/documents/Strict_Compliance_attendance_Eligibility_05082025.pdf',
      checkedOn: '2026-09-27',
    },
  ],
  caseStudy: null,
};
