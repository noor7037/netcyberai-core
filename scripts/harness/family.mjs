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
  // S3 (C376): asking for a chapter and the source choice, in the parent area; Study lists the requests with their badges.
  ['full', 'family-parent-chapter-request', '/family/parent', { parent: true, settle: '[data-chapter-request] [data-request-list]' }],
  ['full', 'family-study-requests', '/family/study?subject=science', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-chapter-requests]' }],
  ['full', 'family-home-progress', '/family', { child: 'f0000000-0000-4000-8000-0000000fc002' }],
  ['full', 'family-study', '/family/study', {}],
  ['full', 'family-study-catalog', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002' }],
  ['full', 'family-understand', '/family/understand?kind=topic&key=cbse.c9.mathematics.u1.ch01.t01', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-block="practice"]' }],
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
  ['full', 'family-tutor-conversation', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-tutor-rail]', steps: [{ tap: '[data-tutor-tab="conversation"]', wait: '[data-tutor-turns]' }] }],
  ['full', 'family-tutor-doubt', '/family/study/chapter/nc.showcase.equal-fractions', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-reader-doubt]', steps: [{ tap: '[data-reader-doubt]', wait: '[data-tutor-drawer] [data-tutor-rail]' }] }],
  ['full', 'family-tutor-vault', '/family/parent/vault', { parent: true, settle: '[data-vault-conversation]' }],
  // M2-5 (C279): the honest player under the response, before and after the tap that loads the embed.
  ['full', 'family-video', '/family/understand?kind=topic&key=cbse.c9.mathematics.u1.ch01.t01', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-video-play]' }],
  ['full', 'family-video-playing', '/family/understand?kind=topic&key=cbse.c9.mathematics.u1.ch01.t01', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-video-play]', tap: '[data-video-play]' }],
  // m2-6: the homework helper's start screen, and its link in Study (C280).
  ['full', 'family-homework', '/family/study/homework', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-homework-start]' }],
  ['full', 'family-study-homework-link', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-homework-link]' }],
  // m2-7: the microphone beside the typed question, and the recording state (C281; a fake microphone, see `mic`).
  ['full', 'family-study-voice', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-voice-input]' }],
  ['full', 'family-study-voice-recording', '/family/study?subject=mathematics', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-voice-input]', mic: true }],
  // C230-AP: a photo yes given on the older notice is asked again, and the row says why.
  ['full', 'family-parent-photo-notice', '/family/parent', { parent: true, settle: '[data-consent-changed="photo_input"]', prep: "insert into family.consents (account_id, purpose, granted, verification_method, notice_version, created_at) values ('f0000000-0000-4000-8000-0000000f0004', 'photo_input', true, 'parent_tap', 'fam-notice-2', now() + interval '1 day')", reset: "delete from family.consents where notice_version = 'fam-notice-2'" }],
  ['full', 'family-parent-area-voice', '/family/parent', { parent: true, settle: '[data-consent-voice]' }],
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
  ['full', 'family-parent-habit', '/family/parent', { parent: true, settle: '[data-habit-child]' }],
  // m2b-2, reversed: children's own phones in the parent area, where the parent types the phone's code (C342, C346).
  ['full', 'family-parent-phones', '/family/parent', { parent: true, flags: { focus_lock: true }, settle: '[data-child-phone-link]' }],
  // m3-7: the parent's home plan after a parent-teacher meeting, and tonight's night on the child's home (C337).
  ['full', 'family-parent-home-plan', '/family/parent', { parent: true, settle: '[data-home-plan-nights]' }],
  ['full', 'family-home-meeting', '/family', { child: 'f0000000-0000-4000-8000-0000000fc002', settle: '[data-home-plan-tonight]' }],
  // m3-8a: what the app tells the parent about (C338).
  ['full', 'family-parent-notify', '/family/parent', { parent: true, settle: '[data-notify-section]' }],
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
  ['english', 'family-parent-focus', '/family/parent', { parent: true, settle: '[data-focus-section]' }],
  // m2-8 begin: the interactive blocks (C282), each from an illustrative cached response in harness-seed.sql.
  // AM-4 (C351): the checked paper in the parent area, the child's own results and paper, and the private report link.
  ['linked', 'family-parent-checked-paper', `/family/parent/results/${LINKED_CHILD}/${MK.paper}`, { parent: true, child: LINKED_CHILD, settle: '[data-marked-script] img', pictures: true }],
  ['linked', 'family-parent-school-results', '/family/parent', { parent: true, child: LINKED_CHILD, settle: '[data-checked-paper-link]', pictures: true }],
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
];

export const FAMILY_WIDTHS = [360, 390, 1440];
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
          // Rows only this screen needs, taken away again by its `reset`.
          if (opts.prep) await db.pg.exec(opts.prep);
          const aiOff = opts.ai ? await liveAiOn(db, aiKey) : null;
          const voiceOff = opts.voice ? await serverVoiceOn(db, aiKey) : null;
          for (const [module, on] of Object.entries(opts.flags ?? {}))
            await db.pg.query(`insert into control.app_flags (app, module, enabled, reason) values ('family', $1, $2, 'harness screen') on conflict (app, module) do nothing`, [module, on]);
          const context = await browser.newContext({ viewport: { width, height: width < 768 ? 800 : 900 }, reducedMotion: motion, deviceScaleFactor: 1, ...(opts.mic ? { permissions: ['microphone'] } : {}) });
          const cookies = who ? await familyCookies(FAMILY[who], opts.parent, secret, opts.child) : [];
          cookies.push({ name: 'ncf_lang', value: lang });
          await context.addCookies(cookies.map((c) => ({ ...c, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' })));
          // A device setting the screen reads from the phone's storage (the data-saver, M2-9).
          if (opts.storage) await context.addInitScript((s) => Object.entries(s).forEach(([k, v]) => window.localStorage.setItem(k, v)), opts.storage);
          // The checked pages' pictures are drawn in the browser (marking-seed.mjs): the harness has no file store.
          if (opts.pictures) await routeScriptPictures(context);
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
          page.on('response', (r) => {
            if (r.url().includes('/api/') && r.status() >= 400) errors.push(`${r.request().method()} ${new URL(r.url()).pathname} answered ${r.status()}`);
          });
          // The report link's language is in its address (the WhatsApp message carries the guardian's).
          const address = opts.langQuery && lang === 'hi' ? `${route}?lang=hi` : route;
          const response = await page.goto(base + address, { waitUntil: 'networkidle', timeout: 90000 }).catch((e) => ({ status: () => 0, error: e.message }));
          if (opts.settle) await page.locator(opts.settle).first().waitFor({ timeout: 20000 }).catch(() => errors.push(`${opts.settle} never appeared`));
          // `mic`: start a recording on Chromium's fake microphone (the browser is launched with it), so the recording
          // state can be pictured. Nothing is sent: the context closes while it records.
          if (opts.mic) {
            await page.locator('[data-voice-input] button').first().click();
            await page.locator('[data-voice-state="recording"]').waitFor({ timeout: 10000 }).catch(() => errors.push('the recording never started'));
            await page.waitForTimeout(1600);
          }
          if (opts.tap) await page.locator(opts.tap).first().click().catch(() => errors.push(`${opts.tap} could not be tapped`));
          // `steps`: taps in turn, each waiting for what it brings (AQ-4's test screens).
          for (const step of opts.steps ?? []) {
            if (step.tap) await page.locator(step.tap).first().click().catch(() => errors.push(`${step.tap} could not be tapped`));
            if (step.wait) await page.locator(step.wait).first().waitFor({ timeout: 20000 }).catch(() => errors.push(`${step.wait} never appeared`));
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
          await page.screenshot({ path: path.join(out, file), fullPage: true });
          const problems = [];
          if (response.status() !== 200) problems.push(`answered ${response.status()}`);
          if (seen.path !== route.split('?')[0]) problems.push(`landed on ${seen.path}`);
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
