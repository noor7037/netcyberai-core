import type { MessageKey } from '@/lib/i18n';

// The words the homework helper needs on the phone (M2-6, C280), picked on the server.
export const HOMEWORK_KEYS: MessageKey[] = [
  'fam.homework.lead', 'fam.homework.takePhoto', 'fam.homework.choosePhoto', 'fam.homework.privacy', 'fam.homework.reading', 'fam.homework.question',
  'fam.homework.hint', 'fam.homework.showHint', 'fam.homework.hintAfterTry', 'fam.homework.yourAnswer', 'fam.homework.check', 'fam.homework.right',
  'fam.homework.notYet', 'fam.homework.stuck', 'fam.homework.steps', 'fam.homework.stepsNote', 'fam.homework.another',
  'fam.homework.err.not_a_photo', 'fam.homework.err.too_big', 'fam.homework.err.personal_info', 'fam.homework.err.unreadable', 'fam.homework.err.person',
  'fam.homework.err.no_question', 'fam.homework.err.photo_cap', 'fam.homework.err.not_open', 'fam.homework.err.off', 'fam.homework.err.not_for_class',
  'ai.not_switched_on', 'ai.cap_reached', 'ai.not_cleared_for_minors', 'ai.failed', 'fam.err.network',
];
