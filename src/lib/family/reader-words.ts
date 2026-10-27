import type { MessageKey } from '@/lib/i18n';

// The words the chapter reader needs on the phone (S1, C374), picked on the server.
export const READER_KEYS: MessageKey[] = [
  'fam.reader.listen', 'fam.reader.resume', 'fam.reader.continue', 'fam.reader.again', 'fam.reader.pause', 'fam.reader.prev', 'fam.reader.next',
  'fam.reader.speed', 'fam.reader.position', 'fam.reader.seek', 'fam.reader.progress', 'fam.reader.controls', 'fam.reader.silentNote', 'fam.reader.done',
  // S5 (C378): sliders, 3D models, chapter tests and chapter videos.
  'fam.block.slider.fraction', 'fam.model.see3d', 'fam.model.back2d', 'fam.model.saver', 'fam.model.noGl', 'fam.model.loading', 'fam.model.failed', 'fam.model.turn', 'fam.model.left', 'fam.model.right', 'fam.model.up', 'fam.model.down', 'fam.model.volume', 'fam.model.surface', 'fam.model.aria', 'fam.model.hint', 'fam.ctest.mcq', 'fam.ctest.written', 'fam.ctest.rubric', 'fam.ctest.photoAttach', 'fam.ctest.photoChecking', 'fam.ctest.photoReady', 'fam.ctest.photoRemove', 'fam.ctest.submit', 'fam.ctest.sending', 'fam.ctest.sent', 'fam.ctest.score', 'fam.ctest.right', 'fam.ctest.notYet', 'fam.ctest.kept', 'fam.ctest.incomplete', 'fam.ctest.preview', 'fam.ctest.err.generic', 'fam.ctest.err.item_expired', 'fam.ctest.err.text_unsuitable', 'fam.ctest.err.photo_not_ready', 'fam.ctest.err.photo_consent', 'fam.ctest.err.photo', 'fam.video.saver', 'fam.video.picks', 'fam.err.network',
];
