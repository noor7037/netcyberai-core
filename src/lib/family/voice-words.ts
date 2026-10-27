import type { MessageKey } from '@/lib/i18n';

// The words voice input needs on the phone (M2-7, C281), picked on the server.
export const VOICE_KEYS: MessageKey[] = [
  'fam.voice.speak', 'fam.voice.stop', 'fam.voice.recording', 'fam.voice.sending', 'fam.voice.privacy', 'fam.voice.check',
  'fam.voice.err.denied', 'fam.voice.err.unsupported', 'fam.voice.err.voice_cap', 'fam.voice.err.not_heard', 'fam.voice.err.not_audio',
  'fam.voice.err.consent_required', 'fam.voice.err.off', 'fam.voice.err.not_for_class',
  'ai.not_switched_on', 'ai.cap_reached', 'ai.not_cleared_for_minors', 'ai.not_capable', 'ai.failed', 'fam.err.network',
];
