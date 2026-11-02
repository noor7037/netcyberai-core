import type { MessageKey } from '@/lib/i18n';

// The words the Quick quiz needs on the phone (W16-B1), picked on the server for the quiz page: the chapter
// test player's own words (the quiz is played by it) and the link back to the explanation. The card is drawn on the server
// with t(), so it needs no list.
export const QUIZ_PAGE_KEYS: MessageKey[] = [
  'fam.quiz.page', 'fam.quiz.missing', 'fam.quiz.explain',
  'fam.ctest.mcq', 'fam.ctest.written', 'fam.ctest.rubric', 'fam.ctest.submit', 'fam.ctest.sending', 'fam.ctest.sent', 'fam.ctest.score', 'fam.ctest.right', 'fam.ctest.notYet',
  'fam.ctest.kept', 'fam.ctest.incomplete', 'fam.ctest.preview', 'fam.ctest.err.generic', 'fam.ctest.err.item_expired', 'fam.ctest.err.text_unsuitable',
];
