import type { MessageKey } from '@/lib/i18n';

// The words the shared tutor window and the Learning Vault need on the phone (S2, C375), picked on the server.
export const TUTOR_KEYS: MessageKey[] = [
  'fam.tutor.title', 'fam.tutor.tabs', 'fam.tutor.tabAsk', 'fam.tutor.tabConversation', 'fam.tutor.question', 'fam.tutor.questionHelp', 'fam.tutor.send',
  'fam.tutor.attach', 'fam.tutor.attachHelp', 'fam.tutor.filePhoto', 'fam.tutor.filePdf', 'fam.tutor.fileSending', 'fam.tutor.fileChecking',
  'fam.tutor.removeFile', 'fam.tutor.openFile', 'fam.tutor.err.file_too_large', 'fam.tutor.err.file_type', 'fam.tutor.err.file_empty',
  'fam.tutor.err.too_many_files', 'fam.tutor.err.upload_aadhaar_number', 'fam.tutor.err.upload_aadhaar_card', 'fam.tutor.err.upload_unreadable',
  'fam.tutor.err.photo_consent',
  'fam.tutor.err.homework_off', 'fam.tutor.err.storage_unavailable', 'fam.tutor.empty', 'fam.tutor.loading', 'fam.tutor.you', 'fam.tutor.tutorSaid',
  'fam.tutor.fromReader', 'fam.tutor.homeworkNote', 'fam.tutor.homeworkOpen', 'fam.tutor.doubt', 'fam.tutor.doubtAbout', 'fam.tutor.close', 'fam.err.network',
];

export const VAULT_KEYS: MessageKey[] = [
  'fam.vault.title', 'fam.vault.lead', 'fam.vault.none', 'fam.vault.counts', 'fam.vault.clear', 'fam.vault.clearConfirm', 'fam.vault.clearYes',
  'fam.vault.cleared', 'fam.vault.files', 'fam.tutor.openFile', 'fam.marks.backParent', 'fam.common.cancel', 'fam.err.network', 'fam.err.parent_pin_required',
  'fam.err.not_found', 'fam.tutor.err.storage_unavailable', 'fam.tests.link',
];
