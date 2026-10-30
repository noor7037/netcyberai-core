import type { MessageKey } from '@/lib/i18n';
import { INTERACTIVE_KEYS } from './interactive-words';

// The words Understand needs on the phone (M1-5, C251), picked on the server.
export const UNDERSTAND_KEYS: MessageKey[] = [
  'fam.label.aiMade', 'fam.label.checked', 'fam.ai.notice.aiMade', 'fam.ai.notice.checked', 'fam.ai.notice.link', 'fam.block.example', 'fam.block.terms', 'fam.block.worked', 'fam.block.answer', 'fam.block.keyPoints',
  'fam.block.english', 'fam.block.pattern', 'fam.block.sayIt', 'fam.block.readAloud', 'fam.block.deviceVoice', 'fam.block.sources', 'fam.block.check',
  'fam.block.practice', 'fam.check.hint', 'fam.check.hintLabel', 'fam.check.right', 'fam.check.notYet', 'fam.check.notThis', 'fam.check.correct', 'fam.check.explainAgain', 'fam.block.mindMap', 'fam.block.photo', 'fam.block.photoCredit',
  'fam.understand.loading', 'fam.understand.missing', 'fam.understand.cut', 'fam.understand.part.explanation', 'fam.understand.part.check', 'fam.understand.part.practice', 'fam.understand.and', 'fam.understand.followUps', 'fam.followUp.simpler', 'fam.followUp.another_example',
  'fam.followUp.differently', 'fam.followUp.practise_more', 'fam.err.network', 'fam.plan.comesBack',
  ...INTERACTIVE_KEYS,
  // M2-5: the honest player under a topic's response.
  'fam.video.title', 'fam.video.note', 'fam.video.play', 'fam.video.length', 'fam.video.by', 'fam.video.frame',
];
