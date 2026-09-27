import type { BlogPost } from '../contract';

export const schoolCapacityAndSectionPlanning: BlogPost = {
  slug: 'school-capacity-and-section-planning',
  title: 'School Capacity and Section Planning, Step by Step',
  description:
    'How to work out safe seats per classroom from floor area, how many sections each class needs, and how many teachers that means, with CBSE reference norms.',
  publishedOn: '2026-09-27',
  answerFirst:
    'Safe capacity is the smaller of two limits: the students a room’s usable floor area allows, and the most students you allow in one section. Multiply that by the classrooms you have and compare it with enrollment class by class. Where a class needs more sections than rooms exist, fix it before admissions are confirmed, not after.',
  body: [
    { type: 'heading', text: 'Seats per room: area first' },
    {
      type: 'paragraph',
      text: 'Measure the classroom and take off the share lost to furniture, walls and walkways. Divide the usable area by the floor area you allow each student. CBSE’s Affiliation Bye-Laws 2018 describe classrooms of at least 8 m by 6 m (about 500 sq ft) and 1 sq m of built-up floor area per student, with an optimum of 40 students per section. Treat these as reference norms and check the version and state rules that apply to you.',
    },
    { type: 'heading', text: 'Sections: class by class' },
    {
      type: 'list',
      items: [
        'Add current and expected new students for each class.',
        'Divide by the safe seats per room and round up: that is the sections that class needs.',
        'Add the sections across classes and compare with the classrooms you have.',
        'A gap means a shift, new rooms or fewer admissions, decided before offers go out.',
      ],
    },
    { type: 'heading', text: 'Teachers follow sections' },
    {
      type: 'paragraph',
      text: 'Every section needs its weekly periods taught. Multiply sections by weekly periods per section and divide by the periods one teacher takes a week. The result is a floor, not a ceiling: subject specialists, languages and electives raise it. For elementary classes, the RTE Act schedule also sets pupil-teacher ratios of 30 to 1 at primary and 35 to 1 at upper primary level.',
    },
    { type: 'heading', text: 'Use it before every admission season' },
    {
      type: 'paragraph',
      text: 'The [free Capacity and Section Planner](/free-tools/school-capacity-planner) does this arithmetic from your rooms and enrollment and flags rooms below the reference norms. Pair it with the [Admission Capacity and Revenue Planner](/free-tools/admission-revenue-planner) so the seats you promise are seats you have.',
    },
  ],
  faqs: [
    { question: 'How many students can sit in a 500 sq ft classroom?', answer: 'About 40 at 1 sq m per student, before furniture and walkways. With a usable share of around 85 of every 100 sq ft, the area allows about 39 to 40.' },
    { question: 'What is the CBSE norm for classroom size?', answer: 'The Affiliation Bye-Laws 2018 describe at least 8 m by 6 m, about 500 sq ft, with 1 sq m per student and an optimum of 40 per section. Check the current bye-laws before relying on them.' },
    { question: 'How many teachers does a school need?', answer: 'At least sections × weekly periods per section ÷ periods per teacher, rounded up, and more for specialist subjects. Elementary classes must also meet RTE pupil-teacher ratios.' },
    { question: 'Is this a legal compliance check?', answer: 'No. It is planning arithmetic. Your board, state education department and building rules decide what is allowed.' },
  ],
  sources: [
    { label: 'CBSE Affiliation Bye-Laws', url: 'https://www.cbse.gov.in/cbsenew/aff_bye_laws.html', checkedOn: '2026-09-27' },
    { label: 'Department of School Education and Literacy: student-teacher ratio under the RTE Act', url: 'https://dsel.education.gov.in/sites/default/files/update/Student-Teacher-Ratio.pdf', checkedOn: '2026-09-27' },
  ],
  caseStudy: null,
};
