import type { MessageKey } from '@/lib/i18n';
import { SUBJECT_IDS } from '@/lib/contracts/subjects';
import { SKETCH_KEYS } from './sketch-words';

// The words of the drawing templates (C514): the Draw tab's section and the lesson's "Draw it" card (with the studio's own
// words, which the studio opened from them needs, and the subjects' names), and the parent area's drawings panel.
export const DRAW_TEMPLATE_KEYS: MessageKey[] = [
  'fam.draw.t.title', 'fam.draw.t.lead', 'fam.draw.t.done', 'fam.draw.t.locked', 'fam.draw.t.lockedNote', 'fam.draw.t.offline', 'fam.draw.t.none',
  'fam.draw.t.drawIt', 'fam.draw.t.drawItLead', 'fam.draw.t.sendLater', 'fam.draw.t.loadFailed',
  ...SUBJECT_IDS.map((s) => `fam.subject.${s}` as MessageKey),
  ...SKETCH_KEYS,
];

export const DRAW_PARENT_KEYS: MessageKey[] = ['fam.draw.p.title', 'fam.draw.p.week', 'fam.draw.p.all', 'fam.draw.p.allow', 'fam.draw.p.allowNote', 'fam.draw.p.countOnly', 'fam.school.saveError'];
