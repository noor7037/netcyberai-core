import type { MessageKey } from '@/lib/i18n';
import { DRAW_SEND_CODES } from './draw-send';

// The art table's words (C513). STUDIO: what the studio itself says (picked with the sketch words, so the tutor
// composer's Draw and the Draw tab show the same studio). PAGE: the Draw tab's own page.
export const DRAW_STUDIO_KEYS: MessageKey[] = [
  'fam.draw.stick', 'fam.draw.stickerTip', 'fam.draw.turnLeft', 'fam.draw.turnRight', 'fam.draw.handle', 'fam.draw.removeSticker', 'fam.draw.sticker',
  'fam.draw.done', 'fam.draw.doneSaid', 'fam.draw.labels', 'fam.draw.labelHint', 'fam.draw.templateColours', 'fam.draw.recent', 'fam.draw.allColours',
  'fam.draw.g.hello', 'fam.draw.g.colourIt', 'fam.draw.g.finish', 'fam.draw.g.next', 'fam.draw.g.drawFirst', 'fam.draw.g.step', 'fam.draw.g.listen', 'fam.draw.g.soundOn', 'fam.draw.g.soundOff', 'fam.draw.g.yay', 'fam.draw.g.noVoice',
  'fam.draw.wheelTip', 'fam.draw.limitTitle', 'fam.draw.limitBody', 'fam.draw.limitOpen', 'fam.draw.limitClose',
  ...DRAW_SEND_CODES.map((c) => `fam.draw.err.${c}` as MessageKey),
];

export const DRAW_PAGE_KEYS: MessageKey[] = [
  'fam.draw.title', 'fam.draw.heroTitle', 'fam.draw.heroLead', 'fam.draw.start', 'fam.draw.mine', 'fam.draw.mineEmpty', 'fam.draw.deviceNote', 'fam.draw.left',
  'fam.draw.open', 'fam.nav.home',
];
