import type { BlogPost } from '../contract';

export const examResultAnalysisForTeachers: BlogPost = {
  slug: 'exam-result-analysis-for-teachers',
  title: 'Exam Result Analysis for Teachers: A Simple Method',
  description:
    'Exam result analysis for class teachers: totals, percentages, grades on your own scale, subject averages, missing marks and students who need help first.',
  publishedOn: '2026-09-27',
  answerFirst:
    'A useful result analysis answers three questions: how did the class do in each subject, which students passed every subject, and who needs help first? Totals and grades are the start. The value is in the lists that follow: missing marks to chase, subjects with many students below the pass mark, and students whose results fell sharply.',
  body: [
    { type: 'heading', text: 'Get the basics right' },
    {
      type: 'list',
      items: [
        'Set maximum and pass marks for each subject before entering any marks.',
        'Treat an absent or missing mark as incomplete, never as zero.',
        'Calculate each student’s percentage only from the subjects with marks.',
        'Convert to grades with the scale your board or school actually uses, written down once.',
      ],
    },
    { type: 'heading', text: 'Read the subject table first' },
    {
      type: 'paragraph',
      text: 'A subject with a low average and many students below the pass mark is a teaching question, not a student question. It deserves a conversation with the subject teacher before any extra classes are scheduled for individual students.',
    },
    { type: 'heading', text: 'Then list who needs support' },
    {
      type: 'paragraph',
      text: 'Students below an overall line you set, below the pass mark in any subject, or down ten or more points since the last exam should be on one short list for the class teacher. Comparing with the student’s own previous result is fairer than comparing with the class topper, and it catches a quiet slide early. The [free Exam Marks Analyzer](/free-tools/exam-marks-analyzer) produces all of this from a CSV or typed marks, and the [Report Card Generator](/free-tools/report-card-generator) prints the individual cards.',
    },
    { type: 'heading', text: 'Share results with care' },
    {
      type: 'paragraph',
      text: 'Class analysis is for teachers. Families should hear about their own child, privately, with what is going well and one clear next step. That is the thinking behind [personal best recognition](/blog/personal-best-vs-top-3-recognition).',
    },
  ],
  faqs: [
    { question: 'How do I calculate a student’s percentage?', answer: 'Add the marks obtained in the subjects with marks, divide by the total maximum of those subjects, and multiply by 100. Mark missing subjects as incomplete.' },
    { question: 'Which grading scale should I use?', answer: 'Your board’s or school’s published scale. Write it as grade and lowest percentage pairs so the conversion is the same for every teacher.' },
    { question: 'How do I identify weak students fairly?', answer: 'Use clear, written rules: below an overall line, below the pass mark in any subject, or a large drop from the student’s own previous result.' },
    { question: 'Can I do this in Excel?', answer: 'Yes, but formulas break easily. A tool that reads a CSV and applies the same rules every time is quicker and harder to get wrong.' },
  ],
  sources: [],
  caseStudy: null,
};
