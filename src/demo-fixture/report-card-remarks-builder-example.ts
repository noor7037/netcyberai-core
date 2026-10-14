import { CUSTOM, type RemarkStudent } from '@/lib/free-tools/remarks';

// Example class for the Report Card Remarks Builder's "Try an example"
// button. Fictional students; no real children. Karan and Neha have the
// same marks and choices, to show the builder varying the wording.
// Kept in the demo fixture because it is demonstration data.

export const REMARKS_EXAMPLE_CLASS = 'Class 5B';

const blank = { strengthText: '', nextStepText: '' };

export const REMARKS_EXAMPLE: RemarkStudent[] = [
  { ...blank, id: 'ex-1', name: 'Aditi Sharma', overall: '91', attendance: '98', strength: 'creative-ideas', nextStep: 'class-discussion' },
  { ...blank, id: 'ex-2', name: 'Rahul Verma', overall: '76', attendance: '89', strength: 'strong-in-maths', nextStep: 'check-answers' },
  { ...blank, id: 'ex-3', name: 'Sneha Pillai', overall: '63', attendance: '93', strength: 'clear-writing', nextStep: 'times-tables' },
  { ...blank, id: 'ex-4', name: 'Arjun Malhotra', overall: '48', attendance: '82', strength: 'helps-classmates', nextStep: 'homework-on-time' },
  { ...blank, id: 'ex-5', name: 'Priya Nair', overall: '34', attendance: '71', strength: 'works-steadily', nextStep: 'attend-regularly' },
  { ...blank, id: 'ex-6', name: 'Karan Gill', overall: '72', attendance: '90', strength: 'neat-work', nextStep: 'read-daily' },
  { ...blank, id: 'ex-7', name: 'Neha Iyer', overall: '72', attendance: '90', strength: 'neat-work', nextStep: 'read-daily' },
  { id: 'ex-8', name: 'Faizan Ali', overall: '58', attendance: '86', strength: CUSTOM, strengthText: 'careful, labelled science diagrams', nextStep: CUSTOM, nextStepText: 'learning new spellings each week' },
];
