import type { MessageKey } from '@/lib/i18n';

// The words a worksheet needs on the phone and on paper (M2-4, C278), picked on the server.
export const WORKSHEET_KEYS: MessageKey[] = [
  'fam.worksheet.title', 'fam.worksheet.lead', 'fam.worksheet.print', 'fam.worksheet.printParent', 'fam.worksheet.printHelp', 'fam.worksheet.sheetFor',
  'fam.worksheet.topic', 'fam.worksheet.nameLine', 'fam.worksheet.dateLine', 'fam.worksheet.answerLine', 'fam.worksheet.keyTitle', 'fam.worksheet.keyFor',
  'fam.worksheet.keyNote', 'fam.worksheet.parentLead', 'fam.worksheet.printWithKey',
  // W2 (C315): the "made by AI" notice.
  'fam.ai.notice.aiMade', 'fam.ai.notice.checked', 'fam.ai.notice.link',
];
