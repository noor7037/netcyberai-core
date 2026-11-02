import type { MessageKey } from '@/lib/i18n';
import { SUBJECT_IDS } from './subjects';

// The words the shared tutor window and the Learning Vault need on the phone (S2, C375), picked on the server.
export const TUTOR_KEYS: MessageKey[] = [
  'fam.tutor.title', 'fam.tutor.tabConversation', 'fam.tutor.question', 'fam.tutor.send', 'fam.tutor.attachMenu', 'fam.homework.studyLink', 'fam.homework.studyLead',
  'fam.check.menu', 'fam.check.menuLead', 'fam.check.sent', 'fam.check.err.photo_only', 'fam.tutor.attach', 'fam.tutor.filePhoto', 'fam.tutor.filePdf', 'fam.tutor.fileSending', 'fam.tutor.fileChecking',
  'fam.tutor.removeFile', 'fam.tutor.openFile', 'fam.tutor.err.file_too_large', 'fam.tutor.err.file_type', 'fam.tutor.err.file_empty',
  'fam.tutor.err.too_many_files', 'fam.tutor.err.upload_aadhaar_number', 'fam.tutor.err.upload_aadhaar_card', 'fam.tutor.err.upload_unreadable',
  'fam.tutor.err.photo_consent',
  'fam.tutor.err.homework_off', 'fam.tutor.err.storage_unavailable', 'fam.tutor.empty', 'fam.tutor.loading', 'fam.tutor.you', 'fam.tutor.tutorSaid',
  'fam.tutor.fromReader', 'fam.tutor.doubt', 'fam.tutor.doubtAbout', 'fam.tutor.close', 'fam.err.network',
  // W9-A (C406), W10-4 (C413): the subject's feed, named with the subject's own word.
  'fam.chat.feed', 'fam.chat.kept', 'fam.chat.moved', 'fam.chat.full',
  // W16-B1: "Done for now" ends the session and its quick quiz is made.
  'fam.quiz.done', 'fam.quiz.doneThanks', 'fam.quiz.doneNoQuiz',
  // W17-B2: read a tutor's answer aloud, and which voice reads it.
  'fam.tutor.readAloud', 'fam.tutor.stopAloud', 'fam.voiceOut.server', 'fam.voiceOut.phone',
  ...SUBJECT_IDS.map((s) => `fam.subject.${s}` as MessageKey),
];

export const VAULT_KEYS: MessageKey[] = [
  'fam.vault.title', 'fam.vault.lead', 'fam.vault.none', 'fam.vault.counts', 'fam.vault.clear', 'fam.vault.clearConfirm', 'fam.vault.clearYes',
  'fam.vault.cleared', 'fam.vault.files', 'fam.tutor.openFile', 'fam.marks.backParent', 'fam.common.cancel', 'fam.err.network', 'fam.err.parent_pin_required',
  'fam.err.not_found', 'fam.tutor.err.storage_unavailable', 'fam.tests.link',
];
