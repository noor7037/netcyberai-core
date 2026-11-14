import type { MessageKey } from '@/lib/i18n';
import { FREEHAND_TOOLS, PAPERS, SHAPE_TOOLS, SKETCH_PALETTE } from './sketch';
import { STICKERS, STICKER_GROUPS } from './sketch-stickers';
import { DRAW_STUDIO_KEYS } from './draw-words';

// The drawing studio's words and the photo sheet's (C510), picked for the tutor window (TUTOR_KEYS).
export const PHOTO_SHEET_KEYS: MessageKey[] = ['fam.photo.take', 'fam.photo.gallery', 'fam.photo.close', 'fam.photo.askLead'];

export const SKETCH_KEYS: MessageKey[] = [
  'fam.sketch.open', 'fam.sketch.title', 'fam.sketch.close', 'fam.sketch.eraser', 'fam.sketch.undo', 'fam.sketch.redo', 'fam.sketch.clear',
  'fam.sketch.clearAsk', 'fam.sketch.clearYes', 'fam.sketch.keep', 'fam.sketch.send', 'fam.sketch.ask', 'fam.sketch.tools', 'fam.sketch.size',
  'fam.sketch.colours', 'fam.sketch.custom', 'fam.sketch.shapes', 'fam.sketch.paper', 'fam.sketch.stickers', 'fam.sketch.more',
  'fam.sketch.textLabel', 'fam.sketch.textHint', 'fam.sketch.stickerHint', 'fam.sketch.bigger', 'fam.sketch.smaller', 'fam.sketch.stamp',
  'fam.sketch.unstamp', 'fam.sketch.save', 'fam.sketch.saved', 'fam.sketch.nameLabel', 'fam.sketch.untitled', 'fam.sketch.mine',
  'fam.sketch.mineEmpty', 'fam.sketch.reopen', 'fam.sketch.duplicate', 'fam.sketch.delete', 'fam.sketch.deleteSure', 'fam.sketch.full',
  'fam.sketch.oldest', 'fam.sketch.noStore', 'fam.sketch.saveFailed', 'fam.sketch.download', 'fam.sketch.downloadApp', 'fam.sketch.question',
  'fam.sketch.questionHint', 'fam.sketch.sending', 'fam.sketch.sent', 'fam.sketch.failed', 'fam.sketch.tryAgain', 'fam.sketch.back',
  'fam.sketch.blank', 'fam.sketch.new', 'fam.sketch.fillBig',
  ...FREEHAND_TOOLS.filter((t) => t !== 'eraser').map((t) => `fam.sketch.tool.${t}` as MessageKey),
  ...SHAPE_TOOLS.map((t) => `fam.sketch.tool.${t}` as MessageKey),
  'fam.sketch.tool.fill', 'fam.sketch.tool.text',
  ...PAPERS.map((p) => `fam.sketch.paper.${p}` as MessageKey),
  ...SKETCH_PALETTE.map((c) => `fam.sketch.colour.${c.id}` as MessageKey),
  ...STICKERS.map((s) => `fam.sketch.sticker.${s.id}` as MessageKey),
  ...STICKER_GROUPS.map((g) => `fam.sketch.group.${g.id}` as MessageKey),
  // C513: the art table's own words (stickers as objects, templates, the colour wheel, the daily limit, send errors).
  ...DRAW_STUDIO_KEYS,
];
