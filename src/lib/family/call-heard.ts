// The call (W16-A4): what the microphone heard is a question only when it has words. A transcription of a quiet room
// (Whisper writes "Thank you." or "you" for silence; the browser test of 2 Nov 2026 got "This question is not about
// Mathematics or Science" for it) is not sent to the tutor, not counted and not answered: the call asks the child to say
// it again. Pure; the phone decides before any request.

const SILENCE = new Set([
  'thank you', 'thanks', 'thank you for watching', 'thanks for watching', 'thank you very much', 'you', 'bye', 'okay', 'ok', 'hmm', 'um', 'uh', 'oh', 'yes', 'no',
  'subtitles by the amara org community', 'धन्यवाद', 'शुक्रिया', 'हाँ', 'नहीं', 'ठीक है',
]);
const PUNCT = /[.,!?;:।…"'“”‘’()[\]-]/gu;

export function heardNothing(text: string): boolean {
  const words = text.normalize('NFKC').toLowerCase().replace(PUNCT, ' ').replace(/\s+/g, ' ').trim();
  if (words.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return true;
  return SILENCE.has(words);
}
