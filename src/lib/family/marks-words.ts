import type { MessageKey } from '@/lib/i18n';
import type { SchoolMistake } from '@/lib/contracts/school-link';

// The words of a checked paper and the exam timetable (C351), picked on the server for the family's screens.
export const MISTAKE_KEYS: Record<Exclude<SchoolMistake, 'none'>, MessageKey> = {
  concept: 'fam.marks.mistake.concept',
  calculation: 'fam.marks.mistake.calculation',
  incomplete: 'fam.marks.mistake.incomplete',
  presentation: 'fam.marks.mistake.presentation',
  language: 'fam.marks.mistake.language',
  misread: 'fam.marks.mistake.misread',
  not_attempted: 'fam.marks.mistake.not_attempted',
};

export const TIMETABLE_KEYS: MessageKey[] = ['fam.marks.timetable', 'fam.marks.timetableNone', 'fam.marks.seat'];

export const CHECKED_PAPER_KEYS: MessageKey[] = [
  'fam.school.resultPublished', 'fam.marks.title', 'fam.marks.paperTitle', 'fam.marks.gone', 'fam.marks.partScore', 'fam.marks.approved', 'fam.marks.pagesTitle', 'fam.marks.pagesLead', 'fam.marks.page',
  'fam.marks.badge', 'fam.marks.badgeNotCounted', 'fam.marks.showPages', 'fam.marks.saverNote', 'fam.marks.questionsTitle', 'fam.marks.question',
  'fam.marks.markOf', 'fam.marks.noMark', 'fam.marks.notCounted', 'fam.marks.strengths', 'fam.marks.improve', 'fam.marks.practice',
  'fam.marks.childStrengths', 'fam.marks.childImprove', 'fam.marks.childLead', 'fam.marks.backParent', 'fam.marks.backResults',
  ...Object.values(MISTAKE_KEYS),
];

export const MY_RESULTS_KEYS: MessageKey[] = [
  'fam.marks.myResults', 'fam.marks.myResultsLead', 'fam.marks.none', 'fam.marks.open', 'fam.marks.openSubject', 'fam.tab.home',
  'fam.school.resultPublished', 'fam.school.resultOverall', 'fam.school.resultNotComplete', ...TIMETABLE_KEYS,
];
