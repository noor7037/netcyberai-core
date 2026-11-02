import type { MessageKey } from '@/lib/i18n';
import { UNDERSTAND_KEYS } from './understand-words';
import { VOICE_KEYS } from './voice-words';

// The words the call screen needs (W16-A4), picked on the server: its own, the voice input's (the microphone's refusals
// are the same ones, in the same words), which voice speaks, and what the board's blocks draw with.
export const CALL_KEYS: MessageKey[] = [
  'fam.call.title', 'fam.call.with', 'fam.call.tutorDefault', 'fam.call.end', 'fam.call.mic.talk', 'fam.call.mic.done', 'fam.call.mic.thinking',
  'fam.call.mic.speaking', 'fam.call.you', 'fam.call.captions', 'fam.call.board', 'fam.call.empty', 'fam.call.boardEmpty', 'fam.call.hold',
  'fam.chat.full', 'fam.voiceOut.server', 'fam.voiceOut.phone',
  ...VOICE_KEYS,
  ...UNDERSTAND_KEYS,
];

// The tutor's name on the call, from `?tutor=` (a tutor's id). The tutors themselves arrive with W16-A3; until a tutor
// is listed here (id -> the word that names it) the call says "Your tutor", and an id nobody knows is never printed.
export const CALL_TUTOR_NAMES: Readonly<Record<string, MessageKey>> = { default: 'fam.call.tutorDefault' };

export function callTutorName(id: unknown): MessageKey {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(CALL_TUTOR_NAMES, id) ? CALL_TUTOR_NAMES[id] : 'fam.call.tutorDefault';
}
