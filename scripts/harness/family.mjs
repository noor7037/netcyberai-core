// The Family app's pictures (M1-2, C248; the M1 gate, docs/family-app/07 §3): every family screen at 360, 390 and
// 1440 px, in English and Hindi, with reduced motion on and off. Same isolation as run.mjs: nothing under src/ imports
// this, and the cookies are signed with the run's own secret, worthless anywhere else.
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { SignJWT } from 'jose';
import { MK, routeScriptPictures, seedMarking } from './marking-seed.mjs';
import { seedOutputs } from './outputs-seed.mjs';
import { clearAaravAttempt, ON, seedOnline } from './online-seed.mjs';
import { seal } from './lab-seed.mjs';

// axe-core checks every picture against WCAG 2.1 A and AA; a serious or critical finding fails the run (07 §3).
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

export const FAMILY = {
  fresh: 'f0000000-0000-4000-8000-0000000f0001',
  consented: 'f0000000-0000-4000-8000-0000000f0002',
  pinned: 'f0000000-0000-4000-8000-0000000f0003',
  full: 'f0000000-0000-4000-8000-0000000f0004',
  english: 'f0000000-0000-4000-8000-0000000f0005',
  linked: 'f0000000-0000-4000-8000-0000000f0006',
  // W10-3 (C412): the lesson identity preview's family, six children at the classes of its six answers.
  identity: 'f0000000-0000-4000-8000-0000000f0a10',
};

// AM-4 (C351): a family linked to the illustrative school, whose child is matched to Aarav Example A of 5-A, with the
// class's published AI-marked Mathematics paper (marking-seed.mjs), a coming exam paper, and a private report link
// whose made-up key is fixed here (the harness's throwaway database only; it opens nothing anywhere else).
const LINKED_CHILD = 'f0000000-0000-4000-8000-0000000fc006';
export const REPORT_KEY = 'HarnessReportLinkKeyMadeUp00000000000000000';

// E1 (C382): Meena's talk at the market, three turns (illustrative words only), and its removal after the picture.
const LIVE_TALK = `
insert into family.english_live_sessions (session_id, account_id, child_id, topic, track, started_at)
values ('f0000000-0000-4000-8000-0000000fe101', 'f0000000-0000-4000-8000-0000000f0005', 'f0000000-0000-4000-8000-0000000fc005', 'market', 'b', now() - interval '5 minutes');
insert into family.english_live_turns (session_id, account_id, child_id, position, child_text, reply) values
  ('f0000000-0000-4000-8000-0000000fe101', 'f0000000-0000-4000-8000-0000000f0005', 'f0000000-0000-4000-8000-0000000fc005', 1, 'Hello. I want mangoes.', 'Hello! These mangoes are sweet. How many mangoes do you want?'),
  ('f0000000-0000-4000-8000-0000000fe101', 'f0000000-0000-4000-8000-0000000f0005', 'f0000000-0000-4000-8000-0000000fc005', 2, 'I want three mango.', 'You can say: I want three mangoes. Here they are! Do you want bananas too?'),
  ('f0000000-0000-4000-8000-0000000fe101', 'f0000000-0000-4000-8000-0000000f0005', 'f0000000-0000-4000-8000-0000000fc005', 3, 'Yes, I want three mangoes and two bananas.', 'Very good! That is twenty rupees. Do you have a bag?');`;
const LIVE_TALK_GONE = `delete from family.english_live_sessions where session_id = 'f0000000-0000-4000-8000-0000000fe101'`;
const LIVE_PROFILES = [
  ['family.voice_input', '@cf/openai/whisper-large-v3-turbo'],
  ['family.english_conversation', '@cf/meta/llama-4-scout-17b-16e-instruct'],
  ['family.moderation', '@cf/meta/llama-guard-3-8b'],
];

// W10 (C411): a Science chat of two turns (opened from Mathematics; its first answer moved it), the scripted follow-up
// answer kept in it, and the class the parent-area picture changes, put back.
const FOLLOW_CHAT_ID = 'f0000000-0000-4000-8000-0000000fa301';
const FOLLOW_UP_CHAT = `
  insert into family.tutor_conversations (conversation_id, account_id, child_id, subject, title, turn_count, status, updated_at, last_at)
  values ('${FOLLOW_CHAT_ID}', 'f0000000-0000-4000-8000-0000000f0004', 'f0000000-0000-4000-8000-0000000fc002', 'science', 'What is photosynthesis?', 1, 'open', now(), now())
  on conflict do nothing;
  insert into family.tutor_messages (conversation_id, account_id, child_id, role, body, created_at)
  values ('${FOLLOW_CHAT_ID}', 'f0000000-0000-4000-8000-0000000f0004', 'f0000000-0000-4000-8000-0000000fc002', 'child', 'What is photosynthesis?', now() - interval '2 minutes');
  insert into family.tutor_messages (conversation_id, account_id, child_id, role, blocks, created_at)
  values ('${FOLLOW_CHAT_ID}', 'f0000000-0000-4000-8000-0000000f0004', 'f0000000-0000-4000-8000-0000000fc002', 'tutor',
    '[{"type":"explanation","title":"How leaves make food","idea":"Green leaves make food from sunlight, water and air.","paragraphs":["Leaves take in carbon dioxide from the air and water from the roots, and use sunlight to make sugar."],"example":"","steps":[],"terms":[]}]'::jsonb, now() - interval '1 minute');
`;
const FOLLOW_UP_CHAT_GONE = `delete from family.tutor_messages where conversation_id = '${FOLLOW_CHAT_ID}'; delete from family.tutor_conversations where conversation_id = '${FOLLOW_CHAT_ID}';`;
// W16-B2 (Check my work): a Mathematics chat of one marked working, kept like any other tutor message (the question the
// child sent with the photo, and the answer's stored blocks: the chapter, the verdicts, the corrected working).
const CHECK_CHAT_ID = 'f0000000-0000-4000-8000-0000000fa302';
const CHECK_CHAT = `
  insert into family.tutor_conversations (conversation_id, account_id, child_id, subject, title, turn_count, status, updated_at, last_at)
  values ('${CHECK_CHAT_ID}', 'f0000000-0000-4000-8000-0000000f0004', 'f0000000-0000-4000-8000-0000000fc002', 'mathematics', 'Check my work', 1, 'open', now(), now())
  on conflict do nothing;
  insert into family.tutor_messages (conversation_id, account_id, child_id, role, body, created_at)
  values ('${CHECK_CHAT_ID}', 'f0000000-0000-4000-8000-0000000f0004', 'f0000000-0000-4000-8000-0000000fc002', 'child', 'Check my work', now() - interval '2 minutes');
  insert into family.tutor_messages (conversation_id, account_id, child_id, role, blocks, created_at)
  values ('${CHECK_CHAT_ID}', 'f0000000-0000-4000-8000-0000000f0004', 'f0000000-0000-4000-8000-0000000fc002', 'tutor',
    '[{"type": "sources", "links": [], "chapter": "Linear Equations in One Variable", "unit": "Solving an equation"}, {"type": "steps", "title": "Your working, step by step", "items": [{"label": "Step 1: right", "text": "You wrote 3x + 5 = 20. That is the equation, copied correctly."}, {"label": "Step 2: wrong", "text": "You wrote 3x = 25. But 5 is added on the left, so take 5 away from 20."}, {"label": "Step 3: wrong", "text": "You wrote x = 25/3. It follows from the step before, so it is not right either."}]}, {"type": "worked_example", "problem": "Solve 3x + 5 = 20.", "steps": [{"text": "Take 5 away from both sides.", "expression": "20-5", "result": "15"}, {"text": "Divide both sides by 3.", "expression": "15/3", "result": "5"}], "answer": "x = 5"}]'::jsonb, now() - interval '1 minute');
`;
const CHECK_CHAT_GONE = `delete from family.tutor_messages where conversation_id = '${CHECK_CHAT_ID}'; delete from family.tutor_conversations where conversation_id = '${CHECK_CHAT_ID}';`;
// W16-B1: a Quick quiz made from that Science chat (illustrative words only), for the Study feed's and the home's card.
const QUIZ_ID = 'f0000000-0000-4000-8000-0000000fa302';
const QUIZ_ITEMS = [
  { kind: 'mcq', id: 'q1', question: 'What do green leaves need to make food?', options: ['Sunlight', 'Sand', 'Salt'], answer: 0, why: 'Leaves use sunlight to make food.' },
  { kind: 'mcq', id: 'q2', question: 'Which gas do leaves take in?', options: ['Oxygen', 'Carbon dioxide', 'Helium'], answer: 1, why: 'Leaves take in carbon dioxide from the air.' },
  { kind: 'mcq', id: 'q3', question: 'Where is food made in a plant?', options: ['Roots', 'Leaves', 'Seeds'], answer: 1, why: 'The leaves hold the green colour that works with sunlight.' },
  { kind: 'mcq', id: 'q4', question: 'What is the green colour in leaves called?', options: ['Chlorophyll', 'Starch', 'Water'], answer: 0, why: 'Chlorophyll is the green colour in leaves.' },
  { kind: 'written', id: 'q5', question: 'Say in a sentence why a plant in a dark cupboard turns pale.', rubric: ['It gets no sunlight to make food'] },
];
const QUIZ_CARD = `${FOLLOW_UP_CHAT}
  insert into family.session_quizzes (quiz_id, account_id, child_id, conversation_id, session_day, subject, lang, title, items, review_due_on)
  select '${QUIZ_ID}', account_id, child_id, conversation_id, (now() at time zone 'Asia/Kolkata')::date, 'science', 'en', 'Quick quiz', '${JSON.stringify(QUIZ_ITEMS).replace(/'/g, "''")}'::jsonb,
         array[(now() at time zone 'Asia/Kolkata')::date + 1, (now() at time zone 'Asia/Kolkata')::date + 3, (now() at time zone 'Asia/Kolkata')::date + 7]
    from family.tutor_conversations where conversation_id = '${FOLLOW_CHAT_ID}' on conflict do nothing;`;
const FOLLOW_UP_ANSWER = [
  { t: 'meta', label: 'ai_made', cached: false, title: null, subject: 'science', topicKey: null },
  { t: 'block', block: { type: 'explanation', title: 'Photosynthesis in a money plant', idea: 'The leaves we talked about make food the same way in a plant at home.', paragraphs: ['A money plant near a sunny window grows towards the light: its leaves use the sunlight, the water you pour in and the air around it to make sugar, as explained above.'], example: 'Keep one plant in the sun and one in a dark cupboard for a week: the one in the dark turns pale.', steps: [], terms: [] } },
  { t: 'done', complete: true, missing: [], cut: false, chat: { chatId: FOLLOW_CHAT_ID, subject: 'science' } },
]
  .map((e) => `${JSON.stringify(e)}\n`)
  .join('');
// W16-A4 (the call): a scripted turn of the call, in the child's language. The voice route "hears" a question, the
// understand route answers it with a checked block and its spoken sentences (illustrative words, made-up seals), and the
// speak route answers like a family whose server voice is not set up yet, so the phone's own voice reads (see `call`).
const CALL_WORDS = {
  en: {
    heard: 'What are equal fractions?',
    idea: 'Equal fractions name the same part of a whole.',
    paragraphs: ['Half of a roti is the same as two quarters. Cut it again and nothing is lost!'],
    example: '1/2 is the same as 2/4, and it is also the same as 3/6.',
  },
  hi: {
    heard: 'बराबर भिन्न क्या होती हैं?',
    idea: 'बराबर भिन्न पूरे का एक ही हिस्सा बताती हैं।',
    paragraphs: ['आधी रोटी और दो चौथाई रोटी बराबर होती हैं। इसे और काटने पर भी कुछ कम नहीं होता!'],
    example: '1/2 और 2/4 बराबर हैं, और 3/6 भी बराबर है।',
  },
};
const callAnswer = (lang) => {
  const c = CALL_WORDS[lang];
  const lines = [c.idea, ...c.paragraphs[0].split(/(?<=[.!?।])\s+/), c.example].map((text, i) => ({ text, token: `harness-seal-${i}` }));
  return [
    { t: 'meta', label: 'ai_made', cached: false, title: null, subject: 'mathematics', topicKey: null },
    { t: 'block', block: { type: 'explanation', title: lang === 'hi' ? 'बराबर भिन्न' : 'Equal parts', idea: c.idea, paragraphs: c.paragraphs, example: c.example, steps: [], terms: [] } },
    { t: 'say', lines },
    { t: 'done', complete: true, missing: [], cut: false },
  ]
    .map((e) => `${JSON.stringify(e)}\n`)
    .join('');
};
// W23-C: Asha (Class 10) has an older Science answer from Study ("How Human Reproduction Works") and one earlier question of her
// own in Chemical Reactions; the chapter's tutor sheet shows the chapter's only, never the older one. The second picture is a
// tutor answer with a ready-built lab (its id one the server offered), the lab opened inside the answer.
const OLD_CHAT_ID = 'f0000000-0000-4000-8000-0000000fa311';
const CH_CHAT_ID = 'f0000000-0000-4000-8000-0000000fa312';
const ASHA = `'f0000000-0000-4000-8000-0000000f0004', 'f0000000-0000-4000-8000-0000000fc001'`;
const SCOPED_CHATS = `
  update family.children set class_level = 10 where child_id = 'f0000000-0000-4000-8000-0000000fc001';
  insert into family.tutor_conversations (conversation_id, account_id, child_id, subject, title, turn_count, status, updated_at, last_at) values
    ('${OLD_CHAT_ID}', ${ASHA}, 'science', 'How does reproduction work?', 1, 'open', now(), now() - interval '1 hour'),
    ('${CH_CHAT_ID}', ${ASHA}, 'science', 'What is a precipitate?', 1, 'open', now(), now() - interval '5 minutes') on conflict do nothing;
  insert into family.tutor_messages (conversation_id, account_id, child_id, role, body, created_at) values
    ('${OLD_CHAT_ID}', ${ASHA}, 'child', 'How does human reproduction work?', now() - interval '61 minutes');
  insert into family.tutor_messages (conversation_id, account_id, child_id, role, blocks, created_at) values
    ('${OLD_CHAT_ID}', ${ASHA}, 'tutor', '[{"type":"explanation","title":"How Human Reproduction Works","idea":"New life begins when two cells join.","paragraphs":["An egg cell and a sperm cell join, and the new cell grows into a baby."],"example":"Two cells join and one new cell starts to grow.","steps":["The egg cell and the sperm cell join.","The new cell divides and grows."],"terms":[]}]'::jsonb, now() - interval '60 minutes');
  insert into family.tutor_messages (conversation_id, account_id, child_id, role, body, chapter_key, block_id, created_at) values
    ('${CH_CHAT_ID}', ${ASHA}, 'child', 'What is a precipitate?', 'u.c10.science.jesc1.ch01', 't07', now() - interval '6 minutes');
  insert into family.tutor_messages (conversation_id, account_id, child_id, role, blocks, created_at) values
    ('${CH_CHAT_ID}', ${ASHA}, 'tutor', '[{"type":"explanation","title":"What a precipitate is","idea":"A precipitate is an insoluble solid that forms when two solutions react.","paragraphs":["When two clear solutions are mixed and a cloudy solid appears, that solid is the precipitate."],"example":"Silver nitrate with salt water gives a white cloudy solid.","steps":["Mix two clear solutions.","A cloudy solid appears: the precipitate."],"terms":[]}]'::jsonb, now() - interval '5 minutes');
`;
const SCOPED_CHATS_GONE = `delete from family.tutor_messages where conversation_id in ('${OLD_CHAT_ID}', '${CH_CHAT_ID}'); delete from family.tutor_conversations where conversation_id in ('${OLD_CHAT_ID}', '${CH_CHAT_ID}'); update family.children set class_level = 7 where child_id = 'f0000000-0000-4000-8000-0000000fc001';`;
const LAB_ANSWER = [
  { t: 'meta', label: 'ai_made', cached: false, title: null, subject: 'science', topicKey: null },
  { t: 'block', block: { type: 'explanation', title: 'Why a solid forms', idea: 'In a double displacement reaction the ions swap partners, and one new pair cannot stay dissolved.', paragraphs: ['Lead nitrate and potassium iodide are both clear solutions. When they meet, lead and iodide ions pair up into lead iodide, which does not dissolve, so it appears as a yellow solid.'], example: 'Mixing lead nitrate and potassium iodide gives a bright yellow solid.', steps: ['Two clear solutions are mixed.', 'The ions swap partners.', 'The pair that cannot dissolve shows as a solid.'], terms: [] } },
  { t: 'block', block: { type: 'lab', id: 'c10-science-jesc1-ch01-double-displacement', why: 'Mix the two clear solutions yourself and watch the yellow solid appear.' } },
  { t: 'done', complete: true, missing: [], cut: false },
]
  .map((e) => `${JSON.stringify(e)}\n`)
  .join('');
const CLASS_PUT_BACK = `update family.children set class_level = 7 where child_id = 'f0000000-0000-4000-8000-0000000fc001'`;
const CLASS_10 = `update family.children set class_level = 10 where child_id = 'f0000000-0000-4000-8000-0000000fc001'`;

// `ai`: for this picture, a made-up Workers AI key sealed with this run's own key, the provider cleared for children
// and the live tutor's three workloads on it, so the screen reads "set up" without any call. All put back after.
async function liveAiOn(db, aiKey) {
  const provider = (await db.pg.query(`select cleared_for_minors, cleared_terms_url, cleared_at, cleared_by, enabled from control.ai_providers where provider_id = 'workers-ai'`)).rows[0];
  const profiles = (await db.pg.query(`select profile_id, provider_id, model, fallback, enabled from control.ai_profiles where profile_id = any($1::text[])`, [LIVE_PROFILES.map(([p]) => p)])).rows;
  const hadKey = (await db.pg.query(`select 1 from control.ai_credentials where provider_id = 'workers-ai'`)).rows.length > 0;
  const k = seal(aiKey, 'workers-ai', `${'d'.repeat(32)}:cfat_${'H'.repeat(36)}`);
  if (!hadKey)
    await db.pg.query(`insert into control.ai_credentials (provider_id, ciphertext, iv, tag, key_version, key_last4, set_by) values ('workers-ai', $1, $2, $3, 1, 'HARN', '00000000-0000-4000-8000-00000000f001')`, [k.ciphertext, k.iv, k.tag]);
  await db.pg.query(`update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.invalid/terms', cleared_at = now(), cleared_by = '00000000-0000-4000-8000-00000000f001', enabled = true where provider_id = 'workers-ai'`);
  for (const [id, model] of LIVE_PROFILES) await db.pg.query(`update control.ai_profiles set provider_id = 'workers-ai', model = $2, fallback = '[]', enabled = true where profile_id = $1`, [id, model]);
  return async () => {
    for (const p of profiles) await db.pg.query(`update control.ai_profiles set provider_id = $2, model = $3, fallback = $4::jsonb, enabled = $5 where profile_id = $1`, [p.profile_id, p.provider_id, p.model, JSON.stringify(p.fallback ?? []), p.enabled]);
    if (provider)
      await db.pg.query(`update control.ai_providers set cleared_for_minors = $1, cleared_terms_url = $2, cleared_at = $3, cleared_by = $4, enabled = $5 where provider_id = 'workers-ai'`, [provider.cleared_for_minors, provider.cleared_terms_url, provider.cleared_at, provider.cleared_by, provider.enabled]);
    if (!hadKey) await db.pg.query(`delete from control.ai_credentials where provider_id = 'workers-ai'`);
  };
}

// C386: `voice`: for this picture, a made-up OpenAI key sealed with this run's own key, OpenAI cleared for children and
// the server voice (family.text_to_speech) on it, so the reader and live English say the server voice reads. Nothing is
// played or asked for (the picture never presses play). All put back after.
async function serverVoiceOn(db, aiKey) {
  const provider = (await db.pg.query(`select cleared_for_minors, cleared_terms_url, cleared_at, cleared_by, enabled from control.ai_providers where provider_id = 'openai'`)).rows[0];
  const profile = (await db.pg.query(`select provider_id, model, fallback, enabled from control.ai_profiles where profile_id = 'family.text_to_speech'`)).rows[0];
  const hadKey = (await db.pg.query(`select 1 from control.ai_credentials where provider_id = 'openai'`)).rows.length > 0;
  const k = seal(aiKey, 'openai', `sk-${'H'.repeat(40)}HARN`);
  if (!hadKey)
    await db.pg.query(`insert into control.ai_credentials (provider_id, ciphertext, iv, tag, key_version, key_last4, set_by) values ('openai', $1, $2, $3, 1, 'HARN', '00000000-0000-4000-8000-00000000f001')`, [k.ciphertext, k.iv, k.tag]);
  await db.pg.query(`update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.invalid/terms', cleared_at = now(), cleared_by = '00000000-0000-4000-8000-00000000f001', enabled = true where provider_id = 'openai'`);
  await db.pg.query(`update control.ai_profiles set provider_id = 'openai', model = 'gpt-4o-mini-tts', fallback = '[]', enabled = true where profile_id = 'family.text_to_speech'`);
  return async () => {
    if (profile) await db.pg.query(`update control.ai_profiles set provider_id = $1, model = $2, fallback = $3::jsonb, enabled = $4 where profile_id = 'family.text_to_speech'`, [profile.provider_id, profile.model, JSON.stringify(profile.fallback ?? []), profile.enabled]);
    if (provider)
      await db.pg.query(`update control.ai_providers set cleared_for_minors = $1, cleared_terms_url = $2, cleared_at = $3, cleared_by = $4, enabled = $5 where provider_id = 'openai'`, [provider.cleared_for_minors, provider.cleared_terms_url, provider.cleared_at, provider.cleared_by, provider.enabled]);
    if (!hadKey) await db.pg.query(`delete from control.ai_credentials where provider_id = 'openai'`);
  };
}

// [account (null: no session), picture name, address, { parent: parent mode open }]
// `flags`: Control's family switches set for this picture only (saved with the reason "harness screen", removed after);
// `reset`: SQL run after the picture (so a limit the picture spends does not carry over to the next).
export const FAMILY_SCREENS = [
  [null, 'family-sign-in', '/family/sign-in', {}],
  // W15-C: the sign-out page asks first; the visit itself ends nothing.
  ['full', 'family-sign-out', '/family/sign-out', {}],
  [null, 'family-offline', '/family/offline', {}],
  // m2b-2, reversed: a child's own phone asks for a code and shows it (C342, C346; behind the Focus Lock's switch).
  [null, 'family-link', '/family/link', { flags: { focus_lock: true }, tap: '[data-link-start]', reset: 'delete from family.child_link_tries; delete from family.child_link_requests' }],
  ['fresh', 'family-welcome', '/family/welcome', {}],
  ['consented', 'family-pin-setup', '/family/welcome/pin', {}],
  ['pinned', 'family-first-child', '/family/welcome/child', { parent: true }],
  ['full', 'family-home', '/family', {}],
  // H1 (C383): the header with the notifications bell and the hub entry (no Parent button), the Profile with Parent
  // space, the notifications centre with items and empty, and the Future page with the three hub shells.
  ['full', 'family-header-bell', '/family', { settle: '[data-notify-bell]' }],
  ['full', 'family-profile', '/family/profile', { settle: '[data-parent-space]' }],
  ['full', 'family-notifications', '/family/notifications', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-notify-list]' }],
  ['english', 'family-notifications-empty', '/family/notifications', { settle: '[data-notify-empty]' }],
  ['full', 'family-hub-future', '/family/future', { settle: '[data-hub-list]' }],
  ['full', 'family-hub-career', '/family/future/career', { settle: '[data-hub-section="national"]' }],
  ['full', 'family-hub-exams', '/family/future/exams', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-hub-section="state"]' }],
  ['full', 'family-hub-schemes', '/family/future/schemes', { child: 'f0000000-0000-4000-8000-0000000fc001', settle: '[data-hub-section="state"]' }],
  ['full', 'family-parent-gate', '/family/parent', {}],
  ['full', 'family-parent-area', '/family/parent', { parent: true }],
  // W6-F (docs/38 §6), C506: the parent area is four tabs (Home, Children, School, Me); the hash opens one (privacy has its own screens below).
  ['full', 'family-parent-area-children', '/family/parent#children', { parent: true, settle: '[data-parent-panel="children"]:not([hidden])' }],
  ['full', 'family-parent-area-school', '/family/parent#school', { parent: true, settle: '[data-parent-panel="school"]:not([hidden])' }],
  ['full', 'family-parent-area-learning', '/family/parent#learning', { parent: true, settle: '[data-parent-panel="me"]:not([hidden])' }],
  ['full', 'family-parent-area-account', '/family/parent#account', { parent: true, settle: '[data-parent-panel="me"]:not([hidden])' }],
  // S3 (C376): asking for a chapter and the source choice, in the parent area; Study lists the requests with their badges.
  ['full', 'family-parent-chapter-request', '/family/parent#learning', { parent: true, settle: '[data-chapter-request] [data-request-list]' }],
  ['full', 'family-study-requests', '/family/study?subject=science', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-chapter-requests]' }],
  ['full', 'family-home-progress', '/family', { child: 'f0000000-0000-4000-8000-0000000fc002' }],
  // W16-B5: the home screen's Tutors tile (the platform tutors' names in a calm list; the names take a ring in turn with motion).
  ['full', 'family-home-tutors', '/family', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-tutors-tile]' }],
  // W19-C: the child's own Progress and Settings.
  ['full', 'family-progress', '/family/progress', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-week-chart]' }],
  ['full', 'family-settings', '/family/settings', { settle: '[data-setting="readAloud"]' }],
  ['full', 'family-study', '/family/study', {}],
  // W16-B1: the Quick quiz card on the Study feed and on the home, and the quiz itself.
  ['full', 'family-quiz-card-study', '/family/study?subject=science', { child: 'f0000000-0000-4000-8000-0000000fc002', prep: QUIZ_CARD, reset: FOLLOW_UP_CHAT_GONE, settle: '[data-quiz-badge]' }],
  ['full', 'family-quiz-card-home', '/family', { child: 'f0000000-0000-4000-8000-0000000fc002', prep: QUIZ_CARD, reset: FOLLOW_UP_CHAT_GONE, settle: '[data-quiz-card]' }],
  ['full', 'family-quiz-play', `/family/study/quiz/${QUIZ_ID}`, { child: 'f0000000-0000-4000-8000-0000000fc002', prep: QUIZ_CARD, reset: FOLLOW_UP_CHAT_GONE, settle: '[data-test-item]' }],
  // W16-A3: the Tutor Hall.
  ['full', 'family-tutors', '/family/tutors', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-tutor-group]' }],
  ['full', 'family-tutors-study', '/family/study?subject=mathematics&tutor=maths', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-tutor-chosen]' }],
  ['full', 'family-study-catalog', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002' }],
  // The child's book (founder, 9 Nov 2026): Asha in CBSE Class 10 sees NCERT Science's 13 chapters in Study, and a
  // chapter opens the chapter reader inside the Family app (its topics, diagrams and labs). Put back in Class 7 after.
  ['full', 'family-book-study', '/family/study?subject=science', { prep: CLASS_10, reset: CLASS_PUT_BACK, settle: '#fam-chapters' }],
  // W22-S1: the quizzes page a subject chip's quiz badge opens, and the search in Study (a word typed, its results).
  ['full', 'family-study-quizzes', '/family/study/quizzes?subject=science', { child: 'f0000000-0000-4000-8000-0000000fc002', prep: QUIZ_CARD, reset: FOLLOW_UP_CHAT_GONE, settle: '[data-quiz-card]' }],
  ['full', 'family-study-search', '/family/study?subject=science', { prep: CLASS_10, reset: CLASS_PUT_BACK, settle: '[data-study-search-input]', steps: [{ fill: { field: '[data-study-search-input]', value: 'chemical' }, wait: '[data-search-results]' }] }],
  ['full', 'family-book-chapter', '/family/study/book/u.c10.science.jesc1.ch01', { prep: CLASS_10, reset: CLASS_PUT_BACK, settle: '[data-book-chapter] iframe', steps: [{ pause: 5000 }] }],
  // W22-S2: the reader's first topic with Teach me tapped (the page reads it, highlights the sentence and word, and scrolls to it),
  // and the tutor opened over the chapter with the chapter and topic as its context.
  // W24 (founder): reading starts on the chapter home (the speaker there reads the home, then goes into the topic).
  ['full', 'family-book-home-read', '/family/study/book/u.c10.science.jesc1.ch01', { langs: ['en'], prep: CLASS_10, reset: CLASS_PUT_BACK, speech: true, settle: '[data-book-chapter] iframe', steps: [{ frame: true, wait: '[data-listen]' }, { frame: true, tap: '[data-listen]' }, { pause: 3000 }] }],
  // W24: a topic opened again after reading with the voice (saved progress): its lesson must show (the founder saw only the header).
  ['full', 'family-book-return', '/family/study/book/u.c10.science.jesc1.ch01', { langs: ['en'], prep: CLASS_10, reset: CLASS_PUT_BACK, speech: true, settle: '[data-book-chapter] iframe', steps: [{ frame: true, tap: '[data-topic="0"]:visible', wait: '[data-mode="teach"]' }, { frame: true, tap: '[data-mode="teach"]' }, { pause: 5000 }, { reload: true }, { wait: '[data-book-chapter] iframe' }, { pause: 2500 }, { frame: true, tap: '[data-topic="0"]:visible' }, { pause: 2500 }] }],
  // W24: "Read all" with the voice going on a wide screen: the lesson must stay on screen (the founder saw only the side panels).
  ['full', 'family-book-readall', '/family/study/book/u.c10.science.jesc1.ch01', { langs: ['en'], prep: CLASS_10, reset: CLASS_PUT_BACK, speech: true, settle: '[data-book-chapter] iframe', steps: [{ frame: true, tap: '[data-topic="0"]:visible', wait: '[data-mode="read"]' }, { frame: true, tap: '[data-mode="read"]' }, { pause: 8000 }] }],
  ['full', 'family-book-teach', '/family/study/book/u.c10.science.jesc1.ch01', { prep: CLASS_10, reset: CLASS_PUT_BACK, speech: true, settle: '[data-book-chapter] iframe', steps: [{ frame: true, tap: '[data-topic="0"]:visible', wait: '[data-mode="teach"]' }, { frame: true, tap: '[data-mode="teach"]' }, { pause: 2600 }] }],
  ['full', 'family-book-tutor', '/family/study/book/u.c10.science.jesc1.ch01', { prep: CLASS_10, reset: CLASS_PUT_BACK, speech: true, settle: '[data-book-chapter] iframe', steps: [{ frame: true, tap: '[data-topic="0"]:visible', wait: '[data-mode="teach"]' }, { tap: '[data-book-face]', wait: '[data-tutor-window]' }, { pause: 600 }] }],
  // W23-C: the book chapter's tutor sheet is a fresh conversation scoped to the chapter (no older answer from elsewhere), and a
  // tutor answer can show a ready-built lab, opened inside it.
  ['full', 'family-book-tutor-fresh', '/family/study/book/u.c10.science.jesc1.ch01', { langs: ['en'], prep: SCOPED_CHATS, reset: SCOPED_CHATS_GONE, speech: true, settle: '[data-book-chapter] iframe', steps: [{ frame: true, tap: '[data-topic="0"]:visible', wait: '[data-mode="teach"]' }, { tap: '[data-book-face]', wait: '[data-tutor-window] [data-feed-answer]' }, { pause: 600 }] }],
  ['full', 'family-tutor-lab', '/family/study?subject=science', { langs: ['en'], prep: CLASS_10, reset: CLASS_PUT_BACK, answer: LAB_ANSWER, settle: '[data-tutor-window] textarea', steps: [{ fill: { field: '[data-tutor-window] textarea', value: 'Why does a yellow solid form when two clear solutions mix?' }, tap: '[data-tutor-send]', wait: '[data-block="lab"]' }, { tap: '[data-lab-open]', wait: '[data-block="lab"] iframe' }, { pause: 5000 }] }],
  ['full', 'family-understand', '/family/understand?kind=topic&key=cbse.c9.mathematics.u1.ch01.t01', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-block="practice"]' }],
  // W8-AI: a v7 answer with a mind map (an SVG from 480 px, a vertical tree below) and a check that says why each wrong option is wrong.
  ['full', 'family-understand-mindmap', '/family/understand?kind=topic&key=cbse.c9.mathematics.u1.ch90.t07', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-block="mind_map"]' }],
  // W9-C: an answer with a drawn figure, a real photograph with its credit, a step strip and the chapter's videos.
  ['full', 'family-understand-visuals', '/family/understand?kind=topic&key=cbse.c9.mathematics.u1.ch90.t08', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-block="videos"]' }],
  // W10-6: a motor scene (its rotor turns, the current flows), the heart (it pulses) and a bar chart with steps that
  // reveal one by one. The motor's coil is tapped open, so its text shows in the panel under the scene.
  ['full', 'family-understand-scene-motor', '/family/understand?kind=topic&key=cbse.c9.mathematics.u1.ch90.t09', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-block="scene"]', steps: [{ tap: '[data-scene-part="coil"]', wait: '[data-scene-text]' }] }],
  ['full', 'family-understand-scene-heart', '/family/understand?kind=topic&key=cbse.c9.mathematics.u1.ch90.t10', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-block="scene"]' }],
  ['full', 'family-understand-chart', '/family/understand?kind=topic&key=cbse.c9.mathematics.u1.ch90.t11', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-block="chart"]' }],
  // W16-A2: the drawing board (every step drawn under reduced motion; step 1 and its controls with motion) under the
  // citation chip naming the chapter, and the pressure simulation (the 4 m depth tapped) under the general chip.
  ['full', 'family-understand-board', '/family/understand?kind=topic&key=cbse.c9.mathematics.u1.ch90.t12', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-board-svg]' }],
  ['full', 'family-understand-sim', '/family/understand?kind=topic&key=cbse.c9.mathematics.u1.ch90.t13', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-sim="pressure_depth"]', steps: [{ tap: '[data-sim-choice="d4"]', wait: '[data-sim-choice="d4"][aria-checked="true"]' }] }],
  // S1 (C374): the chapter reader, its blocks and the sticky read-aloud controls.
  ['full', 'family-chapter-reader', '/family/study/chapter/nc.showcase.equal-fractions', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-reader-controls]' }],
  // C386: the reader with the server voice set up (its controls say the NetCyberAI voice reads).
  ['full', 'family-chapter-voice', '/family/study/chapter/nc.showcase.equal-fractions', { child: 'f0000000-0000-4000-8000-0000000fc002', voice: true, settle: '[data-voice-in-use="server"]' }],
  // S5 (C378): the slider, the 3D model (drawn in 2D until asked for) and the chapter test, in the same chapter.
  ['full', 'family-chapter-slider', '/family/study/chapter/nc.showcase.equal-fractions', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-block="slider"]' }],
  ['full', 'family-chapter-model', '/family/study/chapter/nc.showcase.equal-fractions', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-block="model_3d"] [data-model-2d]' }],
  ['full', 'family-chapter-test', '/family/study/chapter/nc.showcase.equal-fractions', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-block="chapter_test"]' }],
  ['full', 'family-parent-tests', '/family/parent/tests', { parent: true, settle: '[data-parent-tests]' }],
  ['full', 'family-chapter-science', '/family/study/chapter/nc.showcase.water-cycle', { settle: '[data-reader-controls]' }],
  // S2 (C375): the shared tutor window on Study (its input rail, then its Conversation tab), the reader's doubt drawer,
  // and the parent's Learning Vault.
  ['full', 'family-tutor-window', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-tutor-rail]' }],
  // W6-A (C395): Study's chapter accordion with its first chapter open (topics, worksheets, explain, offline pack).
  ['full', 'family-study-accordion', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-chapter-row] summary', steps: [{ tap: '[data-chapter-row] summary', wait: '[data-chapter-row] details[open] .fam-acc-body' }] }],
  // W10-4 (C413): the subject's feed, open on Study: Kabir's three Mathematics questions and answers across two chats,
  // newest at the bottom, with no list of chats.
  ['full', 'family-tutor-feed', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-tutor-turns] [data-feed-answer]' }],
  ['full', 'family-tutor-doubt', '/family/study/chapter/nc.showcase.equal-fractions', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-reader-doubt]', steps: [{ tap: '[data-reader-doubt]', wait: '[data-tutor-drawer] [data-tutor-rail]' }] }],
  // C513/C514: the Draw tab, then its studio open (the pressure brush, colour wheel, stickers and paper are read off this picture).
  ['full', 'family-draw', '/family/draw', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-draw-start]' }],
  ['full', 'family-draw-studio', '/family/draw', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-draw-start]', steps: [{ tap: '[data-draw-start]', wait: '[data-studio-tool]' }] }],
  ['full', 'family-draw-stickers', '/family/draw', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-draw-start]', steps: [{ tap: '[data-draw-start]', wait: '[data-studio-tool]' }, { tap: '[data-studio-panel="stickers"]', wait: '[data-studio-panel-open="stickers"]' }] }],
  ['full', 'family-draw-colours', '/family/draw', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-draw-start]', steps: [{ tap: '[data-draw-start]', wait: '[data-studio-tool]' }, { tap: '[data-studio-panel="colours"]', wait: '[data-studio-panel-open="colours"]' }] }],
  // C517: a Class 3 child's guided studio (engagement mode): the free canvas's hello, and a template one step at a time.
  ['full', 'family-draw-young', '/family/draw', { prep: `update family.children set class_level = 3 where child_id = 'f0000000-0000-4000-8000-0000000fc001'`, reset: CLASS_PUT_BACK, settle: '[data-draw-start]', steps: [{ tap: '[data-draw-start]', wait: '[data-draw-guide]' }] }],
  ['full', 'family-draw-young-template', '/family/draw', { prep: `update family.children set class_level = 3 where child_id = 'f0000000-0000-4000-8000-0000000fc001'`, reset: CLASS_PUT_BACK, settle: '[data-draw-template]', steps: [{ tap: '[data-draw-template]', wait: '[data-draw-guide-progress]' }] }],
  // C518: the template list for Nursery, LKG, Class 4 and Class 5
  ['full', 'family-draw-list-nursery', '/family/draw', { prep: `update family.children set class_level = -2 where child_id = 'f0000000-0000-4000-8000-0000000fc001'`, reset: CLASS_PUT_BACK, settle: '[data-draw-templates]' }],
  ['full', 'family-draw-list-lkg', '/family/draw', { prep: `update family.children set class_level = -1 where child_id = 'f0000000-0000-4000-8000-0000000fc001'`, reset: CLASS_PUT_BACK, settle: '[data-draw-templates]' }],
  ['full', 'family-draw-list-class4', '/family/draw', { prep: `update family.children set class_level = 4 where child_id = 'f0000000-0000-4000-8000-0000000fc001'`, reset: CLASS_PUT_BACK, settle: '[data-draw-templates]' }],
  ['full', 'family-draw-list-class5', '/family/draw', { prep: `update family.children set class_level = 5 where child_id = 'f0000000-0000-4000-8000-0000000fc001'`, reset: CLASS_PUT_BACK, settle: '[data-draw-templates]' }],
  ['full', 'family-tutor-vault', '/family/parent/vault', { parent: true, settle: '[data-vault-conversation]' }],
  // W10 (C411), W10-4 (C413): a follow-up typed with the Mathematics tab selected, about photosynthesis: the server keeps
  // it in Science, the feed says "Moved to Science" above the answer and the subject tab follows to Science.
  // Then the parent area right after a child's class is saved: the "Saved" line (Asha is put back in Class 7 after).
  ['full', 'family-tutor-followup', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', prep: FOLLOW_UP_CHAT, reset: FOLLOW_UP_CHAT_GONE, answer: FOLLOW_UP_ANSWER, settle: '[data-tutor-rail]', steps: [{ fill: { field: '[data-tutor-window] textarea', value: 'Can you show it with an example?' }, tap: '[data-tutor-send]', wait: '[data-tutor-window][data-listed="science"] [data-feed-moved="science"]' }] }],
  ['full', 'family-parent-child-saved', '/family/parent#manage', { parent: true, reset: CLASS_PUT_BACK, settle: '[data-parent-panel="children"]:not([hidden])', steps: [{ tap: '[data-child-edit]', wait: 'select[id$="-class"]' }, { select: { field: 'select[id$="-class"]', value: '3' }, tap: '[data-parent-panel="children"] form button[type="submit"]', wait: '[data-child-saved]' }] }],
  // W22-S3: a kept answer read aloud, caught in the middle: the tutor's face stays at the top of the feed, the sentence is
  // marked and kept on screen, and the read-aloud line says how much is read.
  ['full', 'family-tutor-word', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', speakStub: true, wordHelp: true, viewportShot: true, settle: '[data-tutor-turns] [data-feed-answer]', steps: [{ word: '[data-feed-answer] li' }, { wait: '[data-word-menu]' }, { tap: '[data-word-translate]' }, { select: { field: '[data-word-lang]', value: 'hi' } }, { wait: '[data-word-answer]' }, { pause: 300 }] }],
  ['full', 'family-book-word', '/family/study/book/u.c10.science.jesc1.ch01', { prep: CLASS_10, reset: CLASS_PUT_BACK, speech: true, wordHelp: true, settle: '[data-book-chapter] iframe', steps: [{ frame: true, tap: '[data-topic="0"]:visible', wait: '[data-mode="teach"]' }, { frame: true, word: '.step p' }, { wait: '[data-word-menu]' }, { tap: '[data-word-meaning]' }, { wait: '[data-word-answer]' }, { pause: 300 }] }],
  ['full', 'family-tutor-reading', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', speakStub: true, viewportShot: true, settle: '[data-tutor-turns] [data-feed-answer]', steps: [{ tap: '[data-feed-answer] [data-teach-me]', pause: 3300, wait: '[data-sticky-face]' }] }],
  // M2-5 (C279): the honest player under the response, before and after the tap that loads the embed.
  ['full', 'family-video', '/family/understand?kind=topic&key=cbse.c9.mathematics.u1.ch01.t01', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-video-play]' }],
  ['full', 'family-video-playing', '/family/understand?kind=topic&key=cbse.c9.mathematics.u1.ch01.t01', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-video-play]', tap: '[data-video-play]' }],
  // m2-6: the homework helper's start screen, and its link in Study (C280).
  ['full', 'family-homework', '/family/study/homework', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-homework-start]' }],
  // W6-A (C395): the homework helper's link is in the composer's Attach menu.
  ['full', 'family-study-homework-link', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-tutor-attach]', steps: [{ tap: '[data-tutor-attach]', wait: '[data-homework-link]' }] }],
  // W16-B2: the Attach menu's two photo actions (Ask about this, Check my work), and a marked working kept in the feed.
  ['full', 'family-study-check-menu', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-tutor-attach]', steps: [{ tap: '[data-tutor-attach]', wait: '[data-tutor-check-pick]' }] }],
  ['full', 'family-check-my-work', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', prep: CHECK_CHAT, reset: CHECK_CHAT_GONE, settle: '[data-feed-answer] [data-steps]' }],
  // m2-7: the microphone beside the typed question, and the recording state (C281; a fake microphone, see `mic`).
  ['full', 'family-study-voice', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-voice-input]' }],
  ['full', 'family-study-voice-recording', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-voice-input]', mic: true }],
  // W16-A4: the call, waiting for the first question, and after one turn (the question heard, the answer on the board with its
  // captions, the phone's own voice reading because no server voice is set up). The turn is scripted (`call`).
  // C511: the microphone is open from the start (no Talk tap); the scripted voice (`call` below) is one question, then quiet.
  ['full', 'family-call', '/family/call?tutor=maths&subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', call: true, settle: '[data-call-bar]' }],
  ['full', 'family-call-answer', '/family/call?tutor=maths&subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', call: true, callVoice: true, answer: callAnswer, settle: '[data-call-bar]', steps: [{ wait: '[data-call-caption]' }, { wait: '[data-call-board] [data-block="explanation"]' }, { wait: '[data-voice-in-use]' }] }],
  // C230-AP: a photo yes given on the older notice is asked again, and the row says why.
  ['full', 'family-parent-photo-notice', '/family/parent#privacy', { parent: true, settle: '[data-consent-changed="photo_input"]', prep: "insert into family.consents (account_id, purpose, granted, verification_method, notice_version, created_at) values ('f0000000-0000-4000-8000-0000000f0004', 'photo_input', true, 'parent_tap', 'fam-notice-2', now() + interval '1 day')", reset: "delete from family.consents where notice_version = 'fam-notice-2'" }],
  ['full', 'family-parent-area-voice', '/family/parent#privacy', { parent: true, settle: '[data-consent-voice]' }],
  // Worksheets (M2-4, C278): the worksheet on screen, and the parent's print with the answer key.
  ['full', 'family-worksheet', '/family/study/worksheet/cbse.c9.mathematics.u1.ch01.t01', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-block="practice"]' }],
  // W2 (C315): how the AI works, the page every "made by AI" notice links to.
  ['full', 'family-about-ai', '/family/about-ai', { settle: '[data-ai-feature]' }],
  ['full', 'family-worksheet-parent', '/family/parent/worksheet/cbse.c9.mathematics.u1.ch01.t01', { parent: true, child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-worksheet-key], #ws-key' }],
  // m2-2: today's plan first on the home (C276).
  ['full', 'family-home-plan', '/family', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-family-plan]' }],
  // m2-9: "Save for offline" with the pack's size, and Understand with the data-saver on (C283).
  ['full', 'family-study-offline', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-pack-size]' }],
  ['full', 'family-understand-saver', '/family/understand?kind=topic&key=cbse.c9.mathematics.u1.ch01.t01', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-saver-note]', storage: { 'ncf.dataSaver': '1' } }],
  // m2-3: the week, the badges and the reward jar on the home; the parent's habit section (C277).
  ['full', 'family-home-habit', '/family', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-family-jar]' }],
  ['full', 'family-parent-habit', '/family/parent#habit', { parent: true, settle: '[data-habit-child]' }],
  // m2b-2, reversed: children's own phones in the parent area, where the parent types the phone's code (C342, C346).
  ['full', 'family-parent-phones', '/family/parent#phones', { parent: true, flags: { focus_lock: true }, settle: '[data-child-phone-link]' }],
  // m3-7: the parent's home plan after a parent-teacher meeting, and tonight's night on the child's home (C337).
  ['full', 'family-parent-home-plan', '/family/parent#school', { parent: true, settle: '[data-home-plan-nights]' }],
  ['full', 'family-home-meeting', '/family', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-home-plan-tonight]' }],
  // m3-8a: what the app tells the parent about (C338).
  ['full', 'family-parent-notify', '/family/parent#school', { parent: true, settle: '[data-notify-section]' }],
  // The English course (C274): the course map, and a lesson's first card.
  ['english', 'family-english', '/family/english', { settle: 'ol[aria-label] li' }],
  ['english', 'family-english-lesson', '/family/english/lesson/b.u01.l1', { settle: '[role=progressbar]' }],
  ['english', 'family-english-l1-words', '/family/english/lesson/b.u01.l1?at=1', { settle: '[role=progressbar]' }],
  ['english', 'family-english-l1-match', '/family/english/lesson/b.u01.l1?at=2', { settle: '[role=progressbar]' }],
  ['english', 'family-english-l1-check', '/family/english/lesson/b.u01.l1?at=5', { settle: '[role=progressbar]' }],
  ['english', 'family-english-l2-pattern', '/family/english/lesson/b.u01.l2', { settle: '[role=progressbar]' }],
  ['english', 'family-english-l3-story', '/family/english/lesson/b.u01.l3', { settle: '[role=progressbar]' }],
  ['english', 'family-english-l4-roleplay', '/family/english/lesson/b.u01.l4', { settle: '[role=progressbar]' }],
  // E1 (C382): live practice beside the course: with no speech service (the screen says so), ready (a made-up Workers
  // AI key sealed for the picture, `ai`), and a talk of three turns; then the parent's English page with that talk.
  ['english', 'family-english-live-not-set-up', '/family/english/live', { settle: '[data-live-not-set-up]' }],
  ['english', 'family-english-live-ready', '/family/english/live', { ai: true, settle: '[data-live-ready]' }],
  ['english', 'family-english-live-session', '/family/english/live', { ai: true, prep: LIVE_TALK, reset: LIVE_TALK_GONE, settle: '[data-live-turns] li' }],
  // C386: the same talk with the server voice set up: the line says the NetCyberAI voice reads.
  ['english', 'family-english-live-voice', '/family/english/live', { ai: true, voice: true, prep: LIVE_TALK, reset: LIVE_TALK_GONE, settle: '[data-voice-in-use="server"]' }],
  ['english', 'family-parent-english-live', '/family/parent/english/f0000000-0000-4000-8000-0000000fc005', { parent: true, prep: LIVE_TALK, reset: LIVE_TALK_GONE, settle: '[data-live-parent-session]' }],
  // m2b-1 (C305): the parent area's Focus Lock section, two phones of the English family, one with notices to look at.
  ['english', 'family-parent-focus', '/family/parent#phones', { parent: true, settle: '[data-focus-section]' }],
  // m2-8 begin: the interactive blocks (C282), each from an illustrative cached response in harness-seed.sql.
  // AM-4 (C351): the checked paper in the parent area, the child's own results and paper, and the private report link.
  ['linked', 'family-parent-checked-paper', `/family/parent/results/${LINKED_CHILD}/${MK.paper}`, { parent: true, child: LINKED_CHILD, settle: '[data-marked-script] img', pictures: true }],
  // W14-G: the Overview of a family with a school connected: the school's numbers as tiles, the school named.
  ['linked', 'family-parent-area-overview-school', '/family/parent', { parent: true, child: LINKED_CHILD, settle: '[data-overview-school]' }],
  ['linked', 'family-parent-school-results', '/family/parent#school', { parent: true, child: LINKED_CHILD, settle: '[data-checked-paper-link]', pictures: true }],
  // W20-E: the parent-teacher meeting card, with a free and a taken time.
  ['linked', 'family-parent-school-ptm', '/family/parent#school', { parent: true, child: LINKED_CHILD, settle: '[data-school-ptm]' }],
  // W21-M7: the certificate card, with a request ready to download and a TC held for fees.
  ['linked', 'family-parent-school-certificates', '/family/parent#school', { parent: true, child: LINKED_CHILD, settle: '[data-school-certificates] [data-cert-download]' }],
  // W20-A: the matched child's school fees and "Pay by UPI" (the school's UPI ID, the family link's amount and the QR).
  ['linked', 'family-parent-school-fees', '/family/parent#school', { parent: true, child: LINKED_CHILD, settle: '[data-fees-pay]' }],
  ['linked', 'family-my-results', '/family/results', { child: LINKED_CHILD, settle: '[data-exam-timetable]', pictures: true }],
  ['linked', 'family-my-checked-paper', `/family/results/${MK.paper}`, { child: LINKED_CHILD, settle: '[data-marked-script] img', pictures: true }],
  // AJ-5 (C230-AJ part 5): a child's progress report by exam type, in the parent area and the child's own view.
  ['linked', 'family-parent-progress', `/family/parent/progress/${LINKED_CHILD}`, { parent: true, child: LINKED_CHILD, settle: '[data-parent-progress] [data-progress-group]' }],
  ['linked', 'family-my-progress', '/family/results/progress', { child: LINKED_CHILD, settle: '[data-my-progress] [data-progress-group]' }],
  // AQ-4 (C365): the school's online test in Study, its start screen, the test being sat (one answer given, so the
  // palette shows both marks), and the done screen; each picture starts afresh (`reset`), since a child sits it once.
  ['linked', 'family-school-tests', '/family/study', { child: LINKED_CHILD, settle: '[data-school-tests]' }],
  ['linked', 'family-school-test-start', `/family/study/tests/${ON.test}`, { child: LINKED_CHILD, settle: '[data-test-start]' }],
  ['linked', 'family-school-test-sitting', `/family/study/tests/${ON.test}`, { child: LINKED_CHILD, settle: '[data-test-start]', steps: [{ tap: '[data-test-start]', wait: '[data-test-question]' }, { tap: '[data-test-question] label' }, { wait: '[data-palette="answered"]' }, { wait: '[data-test-save="idle"]' }], reset: 'online' }],
  ['linked', 'family-school-test-done', `/family/study/tests/${ON.test}`, { child: LINKED_CHILD, settle: '[data-test-start]', steps: [{ tap: '[data-test-start]', wait: '[data-test-question]' }, { tap: '[data-test-submit-open]', wait: '[data-test-confirm]' }, { tap: '[data-test-submit-yes]', wait: '[data-test-phase="done"]' }], reset: 'online' }],
  [null, 'report-link', `/results/${REPORT_KEY}`, { settle: '[data-report-state="open"]', pictures: true, langQuery: true }],
  [null, 'report-link-expired', `/results/${'x'.repeat(43)}`, { settle: '[data-report-state="expired"]', langQuery: true }],
  ...[['graph', 't01', 'graph'], ['number-line', 't02', 'number_line'], ['fraction', 't03', 'fraction_model'], ['geometry', 't04', 'geometry'], ['pendulum', 't05', 'simulation'], ['refraction', 't06', 'simulation']].map(
    ([name, t, block]) => ['full', `family-interactive-${name}`, `/family/understand?kind=topic&key=cbse.c9.mathematics.u1.ch90.${t}`, { child: 'f0000000-0000-4000-8000-0000000fc002', settle: `[data-block="${block}"]` }]
  ),
  // m2-8 end
  // W10-3 (C412): the lesson identity on the Understand page, each a real render of a seeded answer (harness-seed.sql):
  // the black hole at classes 3, 6, 8 and 11, the heart (class 11 Biology) and Indian independence (class 12 History).
  // English only (`langs`): the answers are written in English for the preview.
  ...[['blackhole-c3', 'fca10', 'cbse.c3.evs'], ['blackhole-c6', 'fca20', 'cbse.c6.science'], ['blackhole-c8', 'fca30', 'cbse.c8.science'], ['blackhole-c11', 'fca40', 'cbse.c11.physics'], ['heart-c11', 'fca50', 'cbse.c11.biology'], ['independence-c12', 'fca60', 'cbse.c12.history']].map(
    ([name, child, key]) => ['identity', `family-identity-${name}`, `/family/understand?kind=topic&key=${key}.u90.ch90.t01`, { child: `f0000000-0000-4000-8000-0000000${child}`, settle: '[data-direct-answer]', langs: ['en'] }]
  ),
];

// HARNESS_FAMILY_WIDTHS=2000 (comma-separated) shoots other widths, e.g. a wide desktop screen (W24).
export const FAMILY_WIDTHS = process.env.HARNESS_FAMILY_WIDTHS ? process.env.HARNESS_FAMILY_WIDTHS.split(',').map(Number).filter((n) => n > 0) : [360, 390, 1440];
export const FAMILY_LANGS = ['en', 'hi'];
export const FAMILY_MOTIONS = ['reduce', 'no-preference'];

const sign = (typ, sub, claims, secret) =>
  new SignJWT({ ...claims, typ }).setProtectedHeader({ alg: 'HS256' }).setSubject(sub).setAudience('nca-family').setIssuedAt().setExpirationTime('2h').sign(new TextEncoder().encode(secret));

async function familyCookies(accountId, parent, secret, child) {
  const sid = randomUUID();
  const out = [{ name: 'ncf_session', value: await sign('family', accountId, { tv: 0, sid }, secret) }];
  if (parent) out.push({ name: 'ncf_parent', value: await sign('family_parent', accountId, { sid }, secret) });
  if (child) out.push({ name: 'ncf_child', value: child });
  return out;
}

// The video finder's picks for the understand screen's topic, in English and Hindi, with videos switched on (M2-5, C279).
// Made-up video and channel ids: the cards show without any search; the embed loads only after the tap.
export async function seedVideos(db) {
  await db.pg.query(`insert into control.app_flags (app, module, enabled, reason) values ('family', 'videos', true, 'harness') on conflict (app, module) do update set enabled = true`);
  const topic = 'cbse.c9.mathematics.u1.ch01.t01';
  for (const lang of ['en', 'hi']) {
    await db.pg.query(
      `insert into content.video_picks (topic_key, language, video_id, channel_id, channel_title, title, duration_s, start_s, captions, score, status, reviewed_by, reviewed_at) values
         ($1, $2, 'hrnsVideo01', 'UCharnessChannel0001', 'Made-up Maths Channel', 'Rational numbers on the number line', 545, 95, true, 71, 'pinned', '00000000-0000-4000-8000-00000000f001', now()),
         ($1, $2, 'hrnsVideo02', 'UCharnessChannel0002', 'Made-up Learning', 'Rational numbers: worked examples', 812, 0, true, 63, 'auto', null, null),
         ($1, $2, 'hrnsVideo03', 'UCharnessChannel0002', 'Made-up Learning', 'Is it rational? Practice questions', 1260, 0, false, 40, 'rejected', '00000000-0000-4000-8000-00000000f001', now())
       on conflict do nothing`,
      [topic, lang]
    );
  }
  await db.pg.query(`insert into content.video_channels (channel_id, title, kind, added_by) values ('UCharnessChannel0001', 'Made-up Maths Channel', 'official', '00000000-0000-4000-8000-00000000f001') on conflict do nothing`);
}

// The English course's track B lesson files, loaded as a published version (the harness only; C274).
async function seedEnglish(db) {
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '../../data/english/b');
  const units = readdirSync(dir).filter((f) => /^unit-\d{2}\.json$/.test(f)).sort().map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
  const v = 'f0000000-0000-4000-8000-00000000e001';
  await db.pg.query(`insert into content.english_versions (version_id, track, version_no, status, audience, import_source, import_ref, approved_by, approved_at, released_at) values ($1, 'b', 1, 'published', 'everyone', 'repository', 'harness', '00000000-0000-4000-8000-00000000f001', now(), now()) on conflict do nothing`, [v]);
  for (const u of units) {
    await db.pg.query(`insert into content.english_units (version_id, unit_key, position, title_en, title_hi, can_do_en, can_do_hi, pic) values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict do nothing`, [v, u.key, u.unit, u.title.en, u.title.hi, u.can_do.en, u.can_do.hi, u.pic]);
    for (const [i, l] of u.lessons.entries()) {
      await db.pg.query(`insert into content.english_lessons (version_id, lesson_key, unit_key, position, kind, title_en, title_hi, minutes, body) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict do nothing`, [v, l.key, u.key, i + 1, l.kind, l.title.en, l.title.hi, l.minutes, JSON.stringify(l)]);
    }
  }
}

// The Focus Lock's phones for the English family (M2b-1, C305): made-up hashes, one phone with a report and two notices
// to look at, one not reported yet. Its section shows because phones are set up; the module itself stays off.
async function seedFocus(db) {
  const account = FAMILY.english;
  const [p1, p2] = ['f0000000-0000-4000-8000-0000000fd001', 'f0000000-0000-4000-8000-0000000fd002'];
  await db.pg.query(
    `insert into family.focus_devices (device_id, account_id, device_hash, created_at, last_heartbeat_at, lock_on, permissions_ok, clock_changed, stop_noticed_at) values
       ($1, $3, repeat('a', 64), now() - interval '3 days', now() - interval '3 hours', true, true, false, now() - interval '1 hour'),
       ($2, $3, repeat('b', 64), now() - interval '1 day', null, null, null, null, null)
     on conflict do nothing`,
    [p1, p2, account]
  );
  await db.pg.query(`insert into family.focus_device_children (account_id, device_id, child_id) values ($1, $2, $4), ($1, $3, $4) on conflict do nothing`, [account, p1, p2, 'f0000000-0000-4000-8000-0000000fc005']);
  await db.pg.query(
    `insert into family.focus_notices (account_id, device_id, kind, at) values ($1, $2, 'stopped', now() - interval '3 hours'), ($1, $2, 'clock', now() - interval '1 day') on conflict do nothing`,
    [account, p1]
  );
}

async function seedLinkedFamily(db) {
  const school = 'a0000000-0000-4000-8000-000000000001';
  const principal = '00000000-0000-4000-8000-00000000a001';
  await seedMarking(db, { school, principal, teacher: '00000000-0000-4000-8000-00000000a003', publish: true });
  // AJ-5: the published Half-yearly gets its exam type, an earlier published Unit test is added, and the office has made both
  // classes' report cards and progress reports, so the Family app shows the progress report.
  await seedOutputs(db, { school, principal, teacher: '00000000-0000-4000-8000-00000000a003', made: true });
  await db.pg.query(
    `insert into family.accounts (account_id, email, ui_language, pin_hash, pin_set_at) values ($1, 'linked.family@example.org', 'en', 'scrypt$16384$8$1$aGFybmVzcy1zYWx0LTAwNA==$aGFybmVzcy1zdGFuZC1pbi1oYXNoLTAwMDAwMDAwMDA=', now()) on conflict do nothing`,
    [FAMILY.linked]
  );
  await db.pg.query(`insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ($1, 'study_core', true, 'parent_tap', 'fam-notice-1') on conflict do nothing`, [FAMILY.linked]);
  await db.pg.query(`insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ($1, $2, 'Aarav', 5, 'CBSE', 'en', 'en', 'IN-HR') on conflict do nothing`, [LINKED_CHILD, FAMILY.linked]);
  const link = 'f0000000-0000-4000-8000-0000000fd101';
  await db.pg.query(`insert into family.school_links (link_id, account_id, school_id, parent_id) values ($1, $2, $3, '00000000-0000-4000-8000-0000000e0001') on conflict do nothing`, [link, FAMILY.linked, school]);
  await db.pg.query(`insert into family.child_links (child_id, link_id, account_id, student_id) values ($1, $2, $3, '00000000-0000-4000-8000-000000500001') on conflict do nothing`, [LINKED_CHILD, link, FAMILY.linked]);
  // W20-E: 5-A's parent-teacher meeting in three days, invited, with the class teacher's times; one is already taken by
  // another guardian of the class (booked by the office), so the parent sees a free and a taken chip.
  const ptm = '00000000-0000-4000-8000-0000000b2001';
  await db.pg.query(`delete from ptm_bookings where ptm_id = $1`, [ptm]);
  await db.pg.query(`delete from ptm_slots where ptm_id = $1`, [ptm]);
  await db.pg.query(`delete from ptm_events where ptm_id = $1`, [ptm]);
  await db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source) values ($1, 'ptm', true, 'plan') on conflict (school_id, module_id) do update set enabled = true`, [school]);
  await db.pg.query(
    `insert into ptm_events (ptm_id, school_id, title, held_on, starts_at, ends_at, slot_minutes, class_ids, status, created_by, invited_by, invited_at)
     values ($1, $2, 'Term 1 parent-teacher meeting', (now() at time zone 'Asia/Kolkata')::date + 3, '10:00', '10:40', 10, array['00000000-0000-4000-8000-0000000c0051']::uuid[], 'invited', $3, $3, now())`,
    [ptm, school, principal]
  );
  await db.pg.query(`insert into ptm_slots (school_id, ptm_id, teacher_id, starts_at) select $1, $2, '00000000-0000-4000-8000-00000000a003', s::time from unnest(array['10:00', '10:10', '10:20', '10:30']) s`, [school, ptm]);
  await db.pg.query(
    `insert into ptm_bookings (school_id, ptm_id, slot_id, teacher_id, parent_id, booked_via, booked_by)
     select $1, $2, sl.slot_id, sl.teacher_id, m.parent_id, 'staff', $3 from ptm_slots sl,
       (select m.parent_id from parent_student_map m join students s on s.school_id = m.school_id and s.student_id = m.student_id
         where s.class_id = '00000000-0000-4000-8000-0000000c0051' and m.parent_id <> '00000000-0000-4000-8000-0000000e0001' order by m.parent_id limit 1) m
      where sl.ptm_id = $2 and sl.starts_at = '10:10'`,
    [school, ptm, principal]
  );
  // W20-A: the illustrative school takes UPI to its own account (an example UPI ID), so the fees show "Pay by UPI".
  await db.pg.query(
    `insert into payment_methods (school_id, method, enabled, settings, updated_by) values ($1, 'direct_upi', true, $2, $3) on conflict (school_id, method) do nothing`,
    [school, JSON.stringify({ upiId: 'example.school@okbank', payeeName: 'Example School', bankName: 'An Example Bank', accountLast4: '0000', ifsc: 'EXMP0000001', verifiers: ['accountant', 'principal'], principalLimitMinor: 0, notify: 'digest' }), principal]
  );
  // ...and the family's open payment link, as "Pay by UPI" makes it (origin family_app, as the platform role), for what Aarav owes.
  await db.pg.transaction(async (tx) => {
    await tx.query('set local role nca_super');
    await tx.query(
      `insert into payment_links (school_id, family_id, student_id, token, amount_minor, created_by, origin, expires_at, reference_code)
       select s.school_id, s.family_id, s.student_id, 'harness-family-fees-link-token-000000000001', sum(l.amount_minor), null, 'family_app', now() + interval '7 days', 'HRNSS234'
         from students s join fees_ledger l on l.school_id = s.school_id and l.student_id = s.student_id
        where s.student_id = '00000000-0000-4000-8000-000000500001'
          and not exists (select 1 from payment_links k where k.token = 'harness-family-fees-link-token-000000000001')
        group by s.school_id, s.family_id, s.student_id`
    );
  });
  // W21-M7: certificate requests for Aarav: a bonafide the office has made ready to download, and a TC held for fees.
  await db.pg.exec(`set session_replication_role = replica;
    delete from certificate_request_events; delete from certificate_requests; delete from certificate_copies; delete from certificates_issued;
    set session_replication_role = origin;`);
  const asRole = (role, user, fn) =>
    db.pg.transaction(async (tx) => {
      for (const [k, v] of [['app.current_tenant_id', school], ['app.current_role', role], ['app.current_user_id', user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
      return fn(tx);
    });
  const guardian = '00000000-0000-4000-8000-0000000e0001';
  const aarav = '00000000-0000-4000-8000-000000500001';
  const ids = await asRole('parent', guardian, async (tx) => {
    const a = (await tx.query(`insert into certificate_requests (school_id, student_id, cert_type, reason) values ($1, $2, 'bonafide', 'Opening a bank account') returning cert_id`, [school, aarav])).rows[0].cert_id;
    const b = (await tx.query(`insert into certificate_requests (school_id, student_id, cert_type, reason) values ($1, $2, 'transfer', 'Moving to another city') returning cert_id`, [school, aarav])).rows[0].cert_id;
    return { a, b };
  });
  await asRole('principal', principal, async (tx) => {
    const cert = (await tx.query(`insert into certificates_issued (school_id, cert_type, student_id, issued_by, purpose, printed) values ($1, 'bonafide', $2, $3, 'Opening a bank account', '{"studentName": "Aarav Example A"}') returning certificate_id`, [school, aarav, principal])).rows[0].certificate_id;
    await tx.query(`insert into certificate_copies (school_id, certificate_id, storage_key, size_bytes, made_by) values ($1, $2, $4, 1200, $3)`, [school, cert, principal, `${school}/certificates/${cert}/harness.pdf`]);
    await tx.query(`update certificate_requests set stage = 'issued', certificate_id = $3 where school_id = $1 and cert_id = $2`, [school, ids.a, cert]);
    await tx.query(`insert into certificate_request_events (school_id, request_id, kind, actor, actor_user_id) values ($1, $2, 'issued', 'office', $3)`, [school, ids.a, principal]);
    await tx.query(`update certificate_requests set stage = 'ready' where school_id = $1 and cert_id = $2`, [school, ids.a]);
    await tx.query(`insert into certificate_request_events (school_id, request_id, kind, actor, actor_user_id) values ($1, $2, 'ready', 'office', $3)`, [school, ids.a, principal]);
    await tx.query(`update certificate_requests set held_owed_minor = 450000 where school_id = $1 and cert_id = $2`, [school, ids.b]);
    await tx.query(`insert into certificate_request_events (school_id, request_id, kind, actor) values ($1, $2, 'held', 'system')`, [school, ids.b]);
  });
  // A coming exam with exam numbers, so the timetable has a paper and Aarav his number.
  const coming = '00000000-0000-4000-8000-0000000a9901';
  await db.pg.query(`delete from exam_seat_numbers where exam_id = $1`, [coming]);
  await db.pg.query(`delete from exam_papers where exam_id = $1`, [coming]);
  await db.pg.query(`delete from exams where exam_id = $1`, [coming]);
  await db.pg.query(`insert into exams (exam_id, school_id, name, term, created_by, numbering, seat_prefix) values ($1, $2, 'Unit test 3', 'Term 1', $3, 'seat', 'UT')`, [coming, school, principal]);
  for (const [n, subject, days] of [[1, '00000000-0000-4000-8000-0000000d0001', 5], [2, '00000000-0000-4000-8000-0000000d0002', 6]]) {
    await db.pg.query(
      `insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, paper_date, unit_ids, components, created_by)
       values ($1, $2, $3, '00000000-0000-4000-8000-0000000c0051', $4, (now() at time zone 'Asia/Kolkata')::date + $5::int, '{}', '[{"key":"written","name":"Written","max":25,"share":null}]', $6)`,
      [`00000000-0000-4000-8000-0000000a99${String(10 + n)}`, school, coming, subject, days, principal]
    );
  }
  await db.pg.query(
    `insert into marking_report_links (school_id, key_hash, exam_id, class_id, student_id, publication_version, made_by) values ($1, $2, $3, '00000000-0000-4000-8000-0000000c0051', '00000000-0000-4000-8000-000000500001', 1, $4)`,
    [school, createHash('sha256').update(REPORT_KEY).digest('hex'), MK.exam, principal]
  );
  // AQ-4: an online test of 5-A open now (online-seed.mjs); Aarav has not started it.
  await seedOnline(db, { school, principal, teacher: '00000000-0000-4000-8000-00000000a003' });
}

export async function runFamilyMatrix({ browser, base, db, secret, out, only, aiKey }) {
  await seedEnglish(db);
  await seedFocus(db);
  await seedLinkedFamily(db);
  // The English child has done the first three lessons of unit 1, so the map shows progress and lesson 4 is open.
  await db.pg.query(`insert into family.english_enrolments (account_id, child_id, track, started_on) values ($1, $2, 'b', (now() at time zone 'Asia/Kolkata')::date - 3) on conflict do nothing`, [FAMILY.english, 'f0000000-0000-4000-8000-0000000fc005']);
  for (const [k, s] of [['b.u01.l1', 3], ['b.u01.l2', 2], ['b.u01.l3', 3]]) {
    await db.pg.query(`insert into family.english_lessons_done (account_id, child_id, lesson_key, tries, best_score, stars, done_on, last_on) values ($1, $2, $3, 1, 100, $4, (now() at time zone 'Asia/Kolkata')::date - 1, (now() at time zone 'Asia/Kolkata')::date - 1) on conflict do nothing`, [FAMILY.english, 'f0000000-0000-4000-8000-0000000fc005', k, s]);
  }
  const rows = [];
  const screens = FAMILY_SCREENS.filter(([, name]) => !only.length || only.some((w) => name.includes(w)));
  for (const lang of FAMILY_LANGS) {
    await db.pg.query(`update family.accounts set ui_language = $1`, [lang]);
    await db.pg.query(`update family.children set language = $1`, [lang]);
    for (const motion of FAMILY_MOTIONS) {
      for (const width of FAMILY_WIDTHS) {
        for (const [who, name, route, opts] of screens) {
          if (opts.langs && !opts.langs.includes(lang)) continue;
          // Rows only this screen needs, taken away again by its `reset`.
          if (opts.prep) await db.pg.exec(opts.prep);
          const aiOff = opts.ai ? await liveAiOn(db, aiKey) : null;
          const voiceOff = opts.voice ? await serverVoiceOn(db, aiKey) : null;
          for (const [module, on] of Object.entries(opts.flags ?? {}))
            await db.pg.query(`insert into control.app_flags (app, module, enabled, reason) values ('family', $1, $2, 'harness screen') on conflict (app, module) do nothing`, [module, on]);
          const context = await browser.newContext({ viewport: { width, height: width < 768 ? 800 : 900 }, reducedMotion: motion, deviceScaleFactor: 1, ...(opts.mic || opts.call ? { permissions: ['microphone'] } : {}) });
          const cookies = who ? await familyCookies(FAMILY[who], opts.parent, secret, opts.child) : [];
          cookies.push({ name: 'ncf_lang', value: lang });
          await context.addCookies(cookies.map((c) => ({ ...c, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' })));
          // A device setting the screen reads from the phone's storage (the data-saver, M2-9).
          if (opts.storage) await context.addInitScript((s) => Object.entries(s).forEach(([k, v]) => window.localStorage.setItem(k, v)), opts.storage);
          // `speakStub` (W22-S3): a phone's speech engine that "reads" each sentence for 2.2 s and reports word boundaries,
          // so a picture can be taken in the middle of a read-aloud (headless Chromium has no voice). The product code is untouched.
          if (opts.speakStub)
            await context.addInitScript(() => {
              const voices = [{ lang: 'en-IN', name: 'stub' }, { lang: 'hi-IN', name: 'stub-hi' }];
              let timer = 0;
              const synth = {
                getVoices: () => voices,
                cancel: () => clearTimeout(timer),
                speak: (u) => {
                  u.onstart?.({});
                  const words = [...u.text.matchAll(/\S+/g)];
                  words.forEach((m, i) => setTimeout(() => u.onboundary?.({ charIndex: m.index }), (2200 * i) / Math.max(1, words.length)));
                  timer = setTimeout(() => u.onend?.({}), 2200);
                },
              };
              Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
              window.SpeechSynthesisUtterance = function (text) { this.text = text; };
            });
          // The checked pages' pictures are drawn in the browser (marking-seed.mjs): the harness has no file store.
          if (opts.pictures) await routeScriptPictures(context);
          // `answer`: the tutor's answer, scripted (W10, C411): the harness calls no model, so a typed question's
          // NDJSON stream is answered here; what follows it (the chats read again) is the app's own.
          if (opts.answer) await context.route('**/api/family/understand', (r) => r.fulfill({ status: 200, contentType: 'application/x-ndjson; charset=utf-8', body: typeof opts.answer === 'function' ? opts.answer(lang) : opts.answer }));
          // `wordHelp` (W23-A): the word-help call, scripted: a meaning and a translation in the language asked for.
          if (opts.wordHelp)
            await context.route('**/api/family/word-help', (r) => {
              const to = JSON.parse(r.request().postData() ?? '{}').to ?? 'en';
              const says = { en: 'Making food from light', hi: 'प्रकाश से भोजन बनाना', ta: 'ஒளியிலிருந்து உணவு தயாரித்தல்' };
              r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ meaning: 'How green plants make their own food from sunlight, water and air.', translation: says[to] ?? says.hi, lang: says[to] ? to : 'hi' }) });
            });
          // `call` (W16-A4): the call's hearing and speaking, scripted: the recording "hears" the scripted question, the speak
          // route says the server voice is not set up (so the phone's own voice reads), and the marks are taken without a log.
          if (opts.call) {
            // W18: the recorder measures the microphone before sending (voice-energy.ts) and Chromium's fake device is
            // near silent, so the analyser is told a steady voice-level signal here; the product code is untouched.
            // C511: the call's open microphone hears a quiet room; with `callVoice`, one second and a half of voice after the
            // first second (one question), then quiet again, so the turn ends by itself.
            await context.addInitScript((voice) => {
              let t0 = 0;
              const fill = (arr) => {
                const t = performance.now() - (t0 ||= performance.now());
                const a = voice && t > 1000 && t < 2500 ? 0.2 : 0.001;
                for (let i = 0; i < arr.length; i++) arr[i] = a * Math.sin(i / 7);
              };
              if (typeof AnalyserNode !== 'undefined') AnalyserNode.prototype.getFloatTimeDomainData = function (arr) { fill(arr); };
            }, Boolean(opts.callVoice));
            await context.route('**/api/family/voice', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: CALL_WORDS[lang].heard, left: 100, maxSeconds: 30 }) }));
            await context.route('**/api/family/voice/speak', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'not_set_up' }) }));
            await context.route('**/api/family/voice/call/marks', (r) => r.fulfill({ status: 204 }));
          }
          // `speech` (W22-S2): a speech engine that says each word every 420 ms and reports the word boundaries, so a picture can
          // show the sentence and word being read (headless Chromium has no voices).
          if (opts.speech) {
            await context.addInitScript(() => {
              const voices = [{ lang: 'en-IN', name: 'harness en' }, { lang: 'hi-IN', name: 'harness hi' }];
              const ss = {
                getVoices: () => voices, speaking: false, u: null, t: 0,
                cancel() { clearTimeout(ss.t); ss.u = null; },
                speak(u) {
                  ss.u = u;
                  if (u.onstart) u.onstart({});
                  const words = [...u.text.matchAll(/\S+/g)];
                  let i = 0;
                  const tick = () => {
                    if (ss.u !== u) return;
                    if (i < words.length) { if (u.onboundary) u.onboundary({ charIndex: words[i].index, name: 'word' }); i++; ss.t = setTimeout(tick, 420); } else { ss.u = null; if (u.onend) u.onend({}); }
                  };
                  ss.t = setTimeout(tick, 30);
                },
                addEventListener() {}, removeEventListener() {},
              };
              Object.defineProperty(window, 'speechSynthesis', { value: ss, configurable: true });
              window.SpeechSynthesisUtterance = function (text) { this.text = text; };
            });
          }
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
          page.on('response', (r) => {
            if (r.url().includes('/api/') && r.status() >= 400 && !(opts.call && r.url().endsWith('/api/family/voice/speak'))) errors.push(`${r.request().method()} ${new URL(r.url()).pathname} answered ${r.status()}`);
          });
          // The report link's language is in its address (the WhatsApp message carries the guardian's).
          const address = opts.langQuery && lang === 'hi' ? `${route}?lang=hi` : route;
          const response = await page.goto(base + address, { waitUntil: 'networkidle', timeout: 90000 }).catch((e) => ({ status: () => 0, error: e.message }));
          if (opts.settle) await page.locator(opts.settle).first().waitFor({ timeout: 20000 }).catch(() => errors.push(`${opts.settle} never appeared`));
          // `mic`: start a recording on Chromium's fake microphone (the browser is launched with it), so the recording
          // state can be pictured. Nothing is sent: the context closes while it records.
          if (opts.mic) {
            await page.locator('[data-voice-input] button, button[data-voice-input]').first().click();
            await page.locator('[data-voice-state="recording"]').waitFor({ timeout: 10000 }).catch(() => errors.push('the recording never started'));
            await page.waitForTimeout(1600);
          }
          if (opts.tap) await page.locator(opts.tap).first().click().catch(() => errors.push(`${opts.tap} could not be tapped`));
          // `steps`: taps in turn, each waiting for what it brings (AQ-4's test screens).
          for (const step of opts.steps ?? []) {
            // `fill` and `select` (W10, C411): words typed into a field, a value picked in a drop-down.
            if (step.fill) await page.locator(step.fill.field).first().fill(step.fill.value).catch(() => errors.push(`${step.fill.field} could not be filled`));
            if (step.select) await page.locator(step.select.field).first().selectOption(step.select.value).catch(() => errors.push(`${step.select.field} could not be chosen`));
            // `reload` (W24): the page loaded again, as a child coming back to it (saved progress kept).
            if (step.reload) await page.reload({ waitUntil: 'load' }).catch(() => errors.push('the page could not be reloaded'));
            // `frame` (W22-S2): the tap or wait is inside the chapter reader's frame.
            const where = step.frame ? page.frameLocator('[data-book-chapter] iframe') : page;
            // `word` (W23-A): a tap on the middle of the first long word under the selector.
            if (step.word) {
              const loc = where.locator(step.word).first();
              const pos = await loc.evaluate((el) => {
                const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
                for (let n = walk.nextNode(); n; n = walk.nextNode()) {
                  const m = /[A-Za-z\u0900-\u097F]{6,}/.exec(n.data);
                  if (!m) continue;
                  const r = document.createRange();
                  r.setStart(n, m.index + 1);
                  r.setEnd(n, m.index + 3);
                  const b = r.getBoundingClientRect();
                  const e = el.getBoundingClientRect();
                  return { x: b.left - e.left + b.width / 2, y: b.top - e.top + b.height / 2 };
                }
                return null;
              }).catch(() => null);
              if (pos) await loc.click({ position: pos }).catch(() => errors.push(`${step.word} word could not be tapped`));
              else errors.push(`${step.word} has no word to tap`);
            }
            if (step.tap) await where.locator(step.tap).first().click().catch(() => errors.push(`${step.tap} could not be tapped`));
            if (step.pause) await page.waitForTimeout(step.pause);
            // `choose`: a value in a drop-down when it shows (a phone), else a tap on the wide screen's own control (W9-A).
            if (step.choose) {
              const field = page.locator(step.choose.field).first();
              const done = (await field.isVisible().catch(() => false)) ? field.selectOption(step.choose.value) : page.locator(step.choose.or).first().click();
              await done.catch(() => errors.push(`${step.choose.field} could not be chosen`));
            }
            if (step.wait) await where.locator(step.wait).first().waitFor({ timeout: 20000 }).catch(() => errors.push(`${step.wait} never appeared`));
          }
          // A full-page picture does not scroll, so a lazy picture below the fold would never load: load them all first.
          if (opts.pictures) {
            await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach((img) => (img.loading = 'eager')));
            await page.waitForFunction(() => [...document.querySelectorAll('[data-script-page] img')].every((img) => img.complete && img.naturalWidth > 0), null, { timeout: 15000 }).catch(() => errors.push('a page picture never loaded'));
          }
          await page.waitForTimeout(400);
          const seen = await page.evaluate(() => {
            const main = document.querySelector('main') ?? document.body;
            const small = [...document.querySelectorAll('a, button, select, input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, summary')]
              .filter((e) => {
                const r = e.getBoundingClientRect();
                return r.width > 2 && r.height > 2 && r.height < 43.5;
              })
              .map((e) => `${(e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 24)}:${Math.round(e.getBoundingClientRect().height)}`);
            // Words marked as English on purpose (lang="en": English terms beside their Hindi, the English moment, catalog
            // titles printed only in English) are not counted as English left on a Hindi screen.
            const copy = main.cloneNode(true);
            copy.querySelectorAll('[lang="en"]').forEach((e) => e.remove());
            document.body.appendChild(copy);
            copy.style.position = 'absolute';
            copy.style.left = '-99999px';
            const text = copy.innerText;
            copy.remove();
            return {
              path: location.pathname,
              lang: document.querySelector('[lang]')?.getAttribute('lang') ?? null,
              h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
              horizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
              smallTargets: small,
              running: document.getAnimations().filter((a) => a.playState === 'running').length,
              devanagari: /[ऀ-ॿ]/.test(text),
              // Words left in English on a Hindi screen. Product names (NetCyberAI, Family Plus), the language names the seeded children's
              // first names (data, not words of the app) do not count.
              latinWords: (text.match(/\b[A-Za-z]{4,}\b/g) ?? []).filter((w) => !['netcyberai', 'cbse', 'english', 'hinglish', 'delete', 'asha', 'kabir', 'meena', 'aarav', 'family', 'plus', 'water', 'moves', 'from', 'book', 'polynomials'].includes(w.toLowerCase())),
            };
          });
          await page.addScriptTag({ path: AXE });
          const axe = await page.evaluate(async () => {
            const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
            return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} (${v.nodes.length}) at ${v.nodes[0].target.join(' ')}: ${(v.nodes[0].any[0]?.message ?? '').slice(0, 140)}`);
          });
          const file = `${name}-${lang}-${motion === 'reduce' ? 'still' : 'motion'}-${width}.png`;
          await page.screenshot({ path: path.join(out, file), fullPage: !opts.viewportShot });
          const problems = [];
          if (response.status() !== 200) problems.push(`answered ${response.status()}`);
          if (seen.path !== route.split(/[?#]/)[0]) problems.push(`landed on ${seen.path}`);
          if (seen.horizontalScroll) problems.push('sideways scroll');
          if (seen.smallTargets.length) problems.push(`targets under 44 px: ${seen.smallTargets.join(', ')}`);
          if (motion === 'reduce' && seen.running) problems.push(`${seen.running} animations run under reduced motion`);
          if (axe.length) problems.push(`axe: ${axe.join(', ')}`);
          if (lang === 'hi' && (!seen.devanagari || seen.latinWords.length > 3)) problems.push(`Hindi incomplete (${seen.latinWords.length} English words: ${seen.latinWords.slice(0, 8).join(' ')})`);
          problems.push(...errors);
          rows.push({ name, lang, motion, width, route, file, h1: seen.h1, axe, problems });
          console.log(`${width} ${lang} ${motion} ${name}: ${problems.length ? problems.join('; ') : 'ok'}`);
          await context.close();
          if (opts.flags) await db.pg.query(`delete from control.app_flags where app = 'family' and reason = 'harness screen'`);
          if (aiOff) await aiOff();
          if (voiceOff) await voiceOff();
          if (opts.reset === 'online') await clearAaravAttempt(db, 'a0000000-0000-4000-8000-000000000001');
          else if (opts.reset) await db.pg.exec(opts.reset);
        }
      }
    }
  }
  writeFileSync(path.join(out, 'family-report.json'), JSON.stringify(rows, null, 2));
  return rows;
}
