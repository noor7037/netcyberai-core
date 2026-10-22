import type { MessageKey } from '@/lib/i18n';

// The words offline packs and the data-saver need on the phone (M2-9, C283), picked on the server.
export const OFFLINE_KEYS: MessageKey[] = [
  'fam.offline.pack.save', 'fam.offline.pack.size', 'fam.offline.pack.saving', 'fam.offline.pack.saved',
  'fam.offline.pack.remove', 'fam.offline.pack.removeLabel', 'fam.offline.pack.failed', 'fam.offline.pack.partial', 'fam.offline.pack.partialOne', 'fam.offline.pack.until',
  'fam.offline.pack.shelf', 'fam.offline.pack.none', 'fam.offline.pack.needsInternet', 'fam.offline.pack.needsInternetLead',
  'fam.offline.pack.answerSaved', 'fam.offline.pack.waiting', 'fam.offline.pack.allChapters', 'fam.offline.pack.notInPack',
  'fam.dataSaver.title', 'fam.dataSaver.on', 'fam.dataSaver.off', 'fam.dataSaver.phone', 'fam.dataSaver.skipped',
  // D1-3: the shelf's designed empty state.
  'fam.d13.offline.noneTitle', 'fam.tab.study',
];
