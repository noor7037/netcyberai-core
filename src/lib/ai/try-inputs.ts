import type { ProfileId } from './platform';
// The smoke test's fixture inputs (a printed question's photo, a spoken question in each format a phone records, a
// syllabus line), handed on so a route never reaches into the demo fixture itself.
export { SMOKE_PHOTO_JPEG, SMOKE_SPEECH, SMOKE_TOPIC } from '@/demo-fixture/ai-smoke/inputs';

// Control's Try it (W17-B1): the made-up input each AI feature is tried on. Fixed words about a magnet, so nothing a
// child wrote, said or uploaded ever goes out: the photo and the recording are the smoke test's own fixtures
// (src/demo-fixture/ai-smoke/inputs), passed in by the caller. The smoke test (platform.ts, C316) asks the same JSON
// question, reads the same photo and checks the same pair, so a result here and a smoke check compare directly.

export const SAMPLE_QUESTION = 'What does a magnet attract?';
// The smoke test's JSON request (C320): one object on one line, so a format problem shows at a glance.
export const TRY_JSON_ASK = { system: 'Answer with one JSON object only, on one line: {"type":"answer","word":"<one word>"}.', user: `${SAMPLE_QUESTION} One word.` } as const;
// The smoke test's photo request: the fixture photo holds a printed magnet question.
export const TRY_PHOTO_ASK = { system: 'Read the question in the photo. Answer with one JSON object only: {"question":"<the question as printed>"}.', user: 'The photo.' } as const;
// A question and an answer for the safety check, both harmless.
export const TRY_SAFETY_PAIR = { user: SAMPLE_QUESTION, assistant: 'Iron, nickel and cobalt.' } as const;
// One line in each language the voice speaks, both synthesized, so a voice that cannot read Hindi shows it.
export const TRY_SPOKEN = [
  { text: 'A magnet attracts iron, nickel and cobalt.', language: 'en' },
  { text: 'चुंबक लोहे, निकल और कोबाल्ट को आकर्षित करता है।', language: 'hi' },
] as const;

// `json`: the feature writes JSON, so the answer is asked for as JSON and shown parsed. `photo`: the feature reads
// photos (its `needs` includes vision), so the fixture photo goes with the request.
export type TrySample =
  | { kind: 'text'; system: string; user: string; json: boolean; photo: boolean }
  | { kind: 'hear' }
  | { kind: 'speak' }
  | { kind: 'safety' }
  | { kind: 'token' };

const JSON_TEXT: TrySample = { kind: 'text', ...TRY_JSON_ASK, json: true, photo: false };
const PHOTO_TEXT: TrySample = { kind: 'text', ...TRY_PHOTO_ASK, json: true, photo: true };
const plain = (system: string, user: string): TrySample => ({ kind: 'text', system, user, json: false, photo: false });

// Every profile has one (the record's type holds that): adding a profile without an input does not compile.
export const TRY_INPUTS: Record<ProfileId, TrySample> = {
  'family.resolver': JSON_TEXT,
  'family.homework': PHOTO_TEXT,
  'family.voice_input': { kind: 'hear' },
  'family.moderation': { kind: 'safety' },
  'family.plan': JSON_TEXT,
  'family.syllabus_extract': PHOTO_TEXT,
  'family.english_conversation': plain('You are a friendly partner for practising spoken English. Reply in one short sentence.', 'Hello! I like magnets.'),
  'family.summary': plain('Sum up this short chat in one sentence.', `Question: ${SAMPLE_QUESTION} Answer: ${TRY_SAFETY_PAIR.assistant}`),
  'family.text_to_speech': { kind: 'speak' },
  'family.quiz': JSON_TEXT,
  'family.parent_report': plain('Write one short sentence for a parent about the chapter studied this week.', 'Chapter studied: Exploring Magnets.'),
  'family.qc': JSON_TEXT,
  'family.voice_call': { kind: 'token' },
  'copilot.draft': plain('Suggest one short classroom activity for a teacher.', 'Class 6 science, chapter Exploring Magnets.'),
  'parent_ai.home_help': plain('Give a parent one short tip to help with this topic at home.', 'Class 6 science, chapter Exploring Magnets.'),
  'content.syllabus_extract': JSON_TEXT,
  'content.prepare': JSON_TEXT,
  'exams.read_pages': PHOTO_TEXT,
  'exams.mark': PHOTO_TEXT,
  'exams.write_questions': JSON_TEXT,
  'students.register_ocr': PHOTO_TEXT,
};
