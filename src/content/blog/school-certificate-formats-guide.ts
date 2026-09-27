import type { BlogPost } from '../contract';

export const schoolCertificateFormatsGuide: BlogPost = {
  slug: 'school-certificate-formats-guide',
  title: 'School Certificate Formats: TC, Bonafide and More',
  description:
    'What a transfer certificate, bonafide, character and study certificate, report card, fee receipt and achievement certificate should contain, field by field.',
  publishedOn: '2026-09-27',
  answerFirst:
    'Every school certificate needs the same frame: the school’s name, logo, affiliation number and address, a unique certificate number, the student’s name and admission number, the date of issue and a signature with the school seal. What changes between documents is the body: a record of study, a statement of conduct, marks, or a payment.',
  body: [
    { type: 'heading', text: 'Transfer Certificate' },
    {
      type: 'paragraph',
      text: 'A TC records a student’s time at the school for the next one. Common fields: TC and admission numbers, name, parents’ names, date of birth in figures and in words, nationality and category, date of first admission and class, class last studied, last examination and result, whether qualified for promotion, working days and days present, dues cleared, concessions, activities, conduct, dates of last attendance, application and issue, and the reason for leaving. Print it in black and white. [Make one free](/free-tools/transfer-certificate-generator).',
    },
    { type: 'heading', text: 'Bonafide and study certificates' },
    {
      type: 'paragraph',
      text: 'Both confirm that a student is, or was, enrolled: name, parent, admission number, class and section, academic year and the purpose, such as a bank account, passport or scholarship. A study certificate often adds the admission date. Use one fixed wording so every clerk issues the same text. Try the [bonafide](/free-tools/bonafide-certificate-generator) and [study certificate](/free-tools/study-certificate-generator) generators.',
    },
    { type: 'heading', text: 'Character certificate' },
    {
      type: 'paragraph',
      text: 'A character certificate states the period of study, conduct and participation, and whether any disciplinary action is on record. Keep the wording factual and fair; colleges read many of these. Black and white suits it. [Make one free](/free-tools/character-certificate-generator).',
    },
    { type: 'heading', text: 'Report card and marksheet' },
    {
      type: 'paragraph',
      text: 'A report card lists each subject’s maximum, theory and practical marks, the total, percentage, grade and result, with attendance and remarks from the class teacher and principal. State the grading scale and pass mark on the card. [Make one free](/free-tools/report-card-generator).',
    },
    { type: 'heading', text: 'Fee receipt' },
    {
      type: 'paragraph',
      text: 'A receipt lists fee heads and amounts, any discount or late fee, the total, the amount paid in figures and words, the balance, the payment mode and transaction number, and who received it. Number receipts in sequence and never reuse a number. [Make one free](/free-tools/fee-receipt-generator).',
    },
    { type: 'heading', text: 'Achievement and participation certificates' },
    {
      type: 'paragraph',
      text: 'These can be colourful: the recipient, the award or position, the event, level and date, the organiser and one or two signatures. [Make one free](/free-tools/achievement-certificate-generator), or many at once from a CSV.',
    },
    { type: 'heading', text: 'Good practice for every certificate' },
    {
      type: 'list',
      items: [
        'Keep an issue register: number, type, name, admission number and date.',
        'Never issue two certificates with the same number.',
        'Check names and dates against the admission register before signing.',
        'Print on A4 at 300 DPI or higher so the logo and seal stay sharp.',
      ],
    },
    {
      type: 'paragraph',
      text: 'For how a request should move from application to a signed certificate, see the [digital TC and character certificate workflow](/blog/digital-tc-character-certificate-workflow).',
    },
  ],
  faqs: [
    { question: 'Is date of birth in words required on a TC?', answer: 'Most TC formats print the date of birth in both figures and words, which reduces tampering and misreading. The generator writes the words for you.' },
    { question: 'What is the difference between a bonafide and a study certificate?', answer: 'Both confirm enrollment. A bonafide certificate is usually for an external purpose such as a bank account; a study certificate often adds the admission date and years of study.' },
    { question: 'Should certificates be in colour?', answer: 'Official records such as the TC and character certificate are best in black and white. Achievement and participation certificates can use colour.' },
    { question: 'Do I need to keep a copy of every certificate?', answer: 'Keep an issue register at minimum. A school system can keep the record and a verification link for each certificate.' },
    { question: 'Are the free generators safe for student data?', answer: 'Yes. They run in your browser and nothing typed or uploaded is sent to NetCyberAI or stored.' },
  ],
  sources: [],
  caseStudy: null,
};
