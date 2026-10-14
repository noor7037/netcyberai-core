import type { Lesson } from '@/lib/free-tools/lesson-plan';

// The "Try an example" lesson for the lesson plan and worksheet maker: a
// fictional Class 5 mathematics lesson, written for the demo. No real
// school, teacher or student.

export const LESSON_EXAMPLE: Lesson = {
  className: '5 B',
  subject: 'Mathematics',
  topic: 'Equivalent fractions',
  date: '2026-10-19',
  period: '40',
  objectives: [
    'Explain what equivalent fractions are, using a fraction strip',
    'Make an equivalent fraction by multiplying the numerator and denominator by the same number',
    'Check whether two fractions are equivalent',
  ],
  materials: 'Paper strips for folding, a fraction wall chart, chalk in two colours',
  phases: {
    warmup: { minutes: '4', activity: 'Each student folds a strip into halves, then quarters. Ask: which part is bigger, one half or two quarters?' },
    teaching: { minutes: '16', activity: 'Shade 1/2, 2/4 and 4/8 on the board in two colours. Show that multiplying the top and bottom by the same number gives an equal fraction. Work three examples together.' },
    practice: { minutes: '14', activity: 'Pairs use the fraction wall to find two fractions equal to 1/3 and to 3/4, then try the worksheet questions 1 to 3.' },
    review: { minutes: '6', activity: 'Exit check: worksheet questions 4 and 5. Two pairs explain their answers to the class.' },
  },
  homework: 'Draw a fraction strip for 2/3 and shade two fractions equal to it.',
  questions: [
    { type: 'blank', text: '1/2 = ___/8', options: ['', '', '', ''], answer: '4' },
    { type: 'mcq', text: 'Which fraction is equal to 2/3?', options: ['4/6', '3/4', '2/6', '3/5'], answer: '0' },
    { type: 'short', text: 'Write two fractions that are equal to 3/4.', options: ['', '', '', ''], answer: 'Any two, such as 6/8 and 9/12' },
    { type: 'truefalse', text: '3/6 is equal to 1/2.', options: ['', '', '', ''], answer: 'True' },
    { type: 'truefalse', text: '2/5 is equal to 4/5.', options: ['', '', '', ''], answer: 'False' },
  ],
};
