import { randomBytes } from 'crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { aiEncryptionKey, sealAiKey } from '@/lib/ai/credentials';
import { aiOpsDailyHandler, mondayOf } from '@/lib/ai/ops-daily';
import { REFUSAL_MESSAGE, streamText, type AiContext } from '@/lib/ai/platform';
import { loadTutorUse } from '@/lib/ai/tutor-use';
import { readTutorCaps, setTutorCaps } from '@/lib/control/family-settings';
import { TutorToday } from '@/components/family/TutorToday';
import { takePhotoPlace } from '@/lib/family/tutor-read';
import { tutorDay, tutorLimits } from '@/lib/family/tutor-meter';
import { takeVoiceSeconds, voiceDay } from '@/lib/family/voice';
import { jobQueue } from '@/lib/jobs/pg-queue';
import type { ClaimedJob } from '@/lib/jobs/types';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';
import { anthropicOk } from './streams';

// W16-B4: the tutor's use metered per child per India day as text turns, voice minutes and photo doubts, capped by the
// plan (Plus times more, testing mode lifts it), shown to Control and to the parent, and the daily ops job. On the real
// migrations (PGlite), run as the family session runs the child's side. Made-up people only.

const A = 'f1600000-0000-4000-8000-0000000000a1';
const B = 'f1600000-0000-4000-8000-0000000000b1';
const KID = 'f1600000-0000-4000-8000-0000000000c1';
const KID2 = 'f1600000-0000-4000-8000-0000000000c2';
const KID_B = 'f1600000-0000-4000-8000-0000000000c3';
const FOUNDER = 'f1600000-0000-4000-8000-0000000000f1';
const ANTHROPIC_KEY = `sk-ant-${'a'.repeat(30)}WXYZ`;
const DAY = '2026-11-03';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
const asFamily = <T>(account: string, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', $1, true)`, [account]);
    return fn(tx);
  });
const q = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const setting = (key: string, value: unknown) =>
  q(`insert into control.settings (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value`, [key, JSON.stringify(value)]);
const unset = (...keys: string[]) => q(`delete from control.settings where key = any($1::text[])`, [keys]);

const ctx = (account = A, child: string | null = KID): AiContext => ({ accountId: account, childFirstNames: ['Asha'], parentEmail: 'parent.a@example.org', day: DAY, ...(child ? { childId: child } : {}) });
const resolverTurn = (c: AiContext = ctx()) => asFamily(c.accountId, (tx) => streamText(tx as never, c, 'family.resolver', { system: 'Explain for a Class 7 student.', messages: [{ role: 'user', content: 'What is photosynthesis?' }] }));
const counts = async (child = KID) => (await q(`select text_turns, voice_seconds, photo_questions from family.day_counts where child_id = $1 and day = $2`, [child, DAY]))[0] ?? { text_turns: 0, voice_seconds: 0, photo_questions: 0 };
const voiceLimitNow = (account = A, child = KID) => asFamily(account, async (tx) => (await voiceDay(tx as never, account, child, DAY)).limit);
const takeVoice = (seconds: number, account = A, child = KID) =>
  asFamily(account, async (tx) => takeVoiceSeconds(tx as never, account, child, DAY, seconds, (await voiceDay(tx as never, account, child, DAY)).limit));
const takePhoto = (account = A, child = KID) => asFamily(account, (tx) => takePhotoPlace(tx as never, account, child, DAY));

async function sealInto(provider: string, key: string) {
  const k = aiEncryptionKey();
  if (!k) throw new Error('test key missing');
  const s = sealAiKey(k, provider, key);
  await q(
    `insert into control.ai_credentials (provider_id, ciphertext, iv, tag, key_version, key_last4, set_by) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (provider_id) do update set ciphertext = excluded.ciphertext, iv = excluded.iv, tag = excluded.tag, key_version = excluded.key_version, key_last4 = excluded.key_last4`,
    [provider, s.ciphertext, s.iv, s.tag, s.keyVersion, key.slice(-4), FOUNDER]
  );
}

beforeAll(async () => {
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  process.env.AI_CREDENTIALS_KEY_VERSION = '1';
  db = await startHarnessDb({ port: 0 });
  await q(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Farid Founder')`, [FOUNDER]);
  await q(`insert into family.accounts (account_id, email) values ($1, 'parent.a@example.org'), ($2, 'parent.b@example.org')`, [A, B]);
  await q(
    `insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code)
     values ($1, $4, 'Asha', 7, 'CBSE', 'en', 'en', 'IN-UP'), ($2, $4, 'Ravi', 6, 'CBSE', 'en', 'en', 'IN-UP'), ($3, $5, 'Meera', 8, 'CBSE', 'en', 'en', 'IN-UP')`,
    [KID, KID2, KID_B, A, B]
  );
  await q(`update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.org/terms', cleared_at = now(), cleared_by = $1 where provider_id = 'anthropic'`, [FOUNDER]);
  await q(`update control.ai_profiles set provider_id = 'anthropic', model = 'test-model-a', fallback = '[]'::jsonb, enabled = true where profile_id = 'family.resolver'`);
  await sealInto('anthropic', ANTHROPIC_KEY);
}, 90_000);
afterAll(async () => {
  await db?.stop();
});

beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn(async () => anthropicOk(['Plants make food.'])));
  await q(`delete from family.day_counts`);
  await q(`delete from family.ai_daily`);
  await q(`delete from control.ai_usage`);
  await q(`delete from control.preview_accounts`);
  await unset('family.tutor.text_turns_per_day', 'family.tutor.voice_minutes_per_day', 'family.tutor.photo_doubts_per_day', 'family.plus.multiplier', 'family.plus_open', 'ai.spend_alert_usd_per_day');
  await setting('family.ai.daily_requests', 20);
  await setting('family.voice_input_seconds_per_day', 120);
  await setting('family.photo_questions_per_day', 3);
  await setting('ai.testing_mode', 'off');
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the three dimensions', () => {
  it('a text turn moves the text counter only; a voice turn the voice seconds only; a photo call the photo doubts only', async () => {
    expect((await resolverTurn()).ok).toBe(true);
    expect(await counts()).toEqual({ text_turns: 1, voice_seconds: 0, photo_questions: 0 });
    expect(await takeVoice(45)).toBe(45);
    expect(await counts()).toEqual({ text_turns: 1, voice_seconds: 45, photo_questions: 0 });
    expect(await takePhoto()).toBe(true);
    expect(await counts()).toEqual({ text_turns: 1, voice_seconds: 45, photo_questions: 1 });
    // The family's daily requests still count the text turn.
    expect(await q(`select requests from family.ai_daily where account_id = $1`, [A])).toEqual([{ requests: 1 }]);
  });

  it('is per child: a sibling and another family have their own day', async () => {
    await setting('family.tutor.text_turns_per_day', 1);
    expect((await resolverTurn(ctx(A, KID))).ok).toBe(true);
    expect(await resolverTurn(ctx(A, KID))).toEqual({ ok: false, reason: 'cap_reached' });
    expect((await resolverTurn(ctx(A, KID2))).ok).toBe(true);
    expect((await resolverTurn(ctx(B, KID_B))).ok).toBe(true);
  });

  it('without a child the family’s daily requests cap holds as before', async () => {
    await setting('family.ai.daily_requests', 1);
    expect((await resolverTurn(ctx(A, null))).ok).toBe(true);
    expect(await resolverTurn(ctx(A, null))).toEqual({ ok: false, reason: 'cap_reached' });
    expect(await counts()).toEqual({ text_turns: 0, voice_seconds: 0, photo_questions: 0 });
  });
});

describe('the caps by plan', () => {
  it('refuse the right dimension with the right words, and only that dimension', async () => {
    await setting('family.tutor.text_turns_per_day', 2);
    await setting('family.tutor.voice_minutes_per_day', 1);
    await setting('family.tutor.photo_doubts_per_day', 1);
    // Text: two answered, the third refused in the existing plain words.
    expect((await resolverTurn()).ok).toBe(true);
    expect((await resolverTurn()).ok).toBe(true);
    const refused = await resolverTurn();
    expect(refused).toEqual({ ok: false, reason: 'cap_reached' });
    expect(en[REFUSAL_MESSAGE.cap_reached]).toBe("You have used today's explanations. More tomorrow.");
    expect(hi[REFUSAL_MESSAGE.cap_reached]).toBeTruthy();
    expect(await q(`select cap_refusals from control.ai_usage where profile_id = 'family.resolver'`)).toEqual([{ cap_refusals: 1 }]);
    // Voice: one minute is 60 seconds; the next 30 do not fit. Its words are the speaking-time ones.
    expect(await voiceLimitNow()).toBe(60);
    expect(await takeVoice(30)).toBe(30);
    expect(await takeVoice(30)).toBe(60);
    expect(await takeVoice(1)).toBeNull();
    expect(en['fam.voice.err.voice_cap']).toMatch(/speaking time/);
    // Photo: one place, then none.
    expect(await takePhoto()).toBe(true);
    expect(await takePhoto()).toBe(false);
    expect(en['fam.homework.err.photo_cap']).toMatch(/photo questions/);
    // Another child's photo place is their own, and a spent text cap left voice and photo to their own limits.
    expect(await takePhoto(A, KID2)).toBe(true);
    expect(await counts()).toEqual({ text_turns: 2, voice_seconds: 60, photo_questions: 1 });
  });

  it('until Control sets a number, the older settings hold; where none exist, the built-in numbers', async () => {
    await setting('family.ai.daily_requests', 7);
    expect(await asFamily(A, (tx) => tutorLimits(tx as never, A))).toMatchObject({ textTurns: 7, voiceSeconds: 120, voiceMinutes: 2, photoDoubts: 3, plus: false, multiplier: 1 });
    await unset('family.ai.daily_requests', 'family.voice_input_seconds_per_day', 'family.photo_questions_per_day');
    expect(await asFamily(A, (tx) => tutorLimits(tx as never, A))).toMatchObject({ textTurns: 40, voiceMinutes: 20, photoDoubts: 5, voiceSeconds: 1200 });
  });

  it('Plus triples the cap (the multiplier is Control’s), for a family on the pilot list only', async () => {
    await setting('family.tutor.text_turns_per_day', 2);
    await setting('family.tutor.voice_minutes_per_day', 1);
    await setting('family.tutor.photo_doubts_per_day', 1);
    await setting('family.plus_open', true);
    // Plus is open but this family is not on the pilot list: not Plus.
    expect(await asFamily(A, (tx) => tutorLimits(tx as never, A))).toMatchObject({ textTurns: 2, plus: false });
    await q(`insert into control.preview_accounts (account_id, added_by) values ($1, $2)`, [A, FOUNDER]);
    expect(await asFamily(A, (tx) => tutorLimits(tx as never, A))).toMatchObject({ textTurns: 6, voiceMinutes: 3, voiceSeconds: 180, photoDoubts: 3, plus: true, multiplier: 3 });
    for (let i = 0; i < 6; i++) expect((await resolverTurn()).ok).toBe(true);
    expect(await resolverTurn()).toEqual({ ok: false, reason: 'cap_reached' });
    await setting('family.plus.multiplier', 2);
    expect(await asFamily(A, (tx) => tutorLimits(tx as never, A))).toMatchObject({ textTurns: 4, photoDoubts: 2, multiplier: 2 });
    // The other family is not on Plus.
    expect(await asFamily(B, (tx) => tutorLimits(tx as never, B))).toMatchObject({ textTurns: 2, plus: false });
  });

  it('testing mode lifts every cap and still counts', async () => {
    await setting('family.tutor.text_turns_per_day', 1);
    await setting('family.tutor.voice_minutes_per_day', 1);
    await setting('family.tutor.photo_doubts_per_day', 1);
    await setting('ai.testing_mode', 'on');
    for (let i = 0; i < 3; i++) expect((await resolverTurn()).ok).toBe(true);
    expect(await takeVoice(30)).toBe(30);
    expect(await takeVoice(30)).toBe(60);
    expect(await takeVoice(30)).toBe(90);
    expect(await takePhoto()).toBe(true);
    expect(await takePhoto()).toBe(true);
    expect(await counts()).toEqual({ text_turns: 3, voice_seconds: 90, photo_questions: 2 });
  });
});

describe('Control and the parent area', () => {
  it('saving the caps needs a reason, is audited with the numbers before and after, and is what then applies', async () => {
    const by = { userId: FOUNDER };
    const input = { textTurns: 60, voiceMinutes: 25, photoDoubts: 6, plusMultiplier: 4 };
    expect(await setTutorCaps(db.pg, by, { ...input, reason: '' })).toEqual({ ok: false, code: 'reason_required' });
    expect(await setTutorCaps(db.pg, by, { ...input, textTurns: -1, reason: 'Pilot week' })).toEqual({ ok: false, code: 'bad_value' });
    expect(await setTutorCaps(db.pg, by, { ...input, plusMultiplier: 0.5, reason: 'Pilot week' })).toEqual({ ok: false, code: 'bad_value' });
    expect(await q(`select count(*)::int as n from audit_log where event_action = 'family.tutor_caps_set'`)).toEqual([{ n: 0 }]);
    expect(await setTutorCaps(db.pg, by, { ...input, reason: 'Pilot week' })).toEqual({ ok: true, caps: input });
    const row = (await q(`select before_state, after_state, actor_user_id from audit_log where event_action = 'family.tutor_caps_set'`))[0];
    expect(row.before_state).toMatchObject({ textTurns: 20, voiceMinutes: 2, photoDoubts: 3, plusMultiplier: 3 });
    expect(row.after_state).toMatchObject({ ...input, reason: 'Pilot week' });
    expect(row.actor_user_id).toBe(FOUNDER);
    expect(await readTutorCaps(db.pg)).toEqual(input);
    expect(await asFamily(A, (tx) => tutorLimits(tx as never, A))).toMatchObject({ textTurns: 60, voiceMinutes: 25, photoDoubts: 6 });
  });

  it('the parent line reads "7 of 40 questions, 3 of 20 voice minutes, 1 of 5 photos", in English and Hindi', async () => {
    await setting('family.tutor.text_turns_per_day', 40);
    await setting('family.tutor.voice_minutes_per_day', 20);
    await setting('family.tutor.photo_doubts_per_day', 5);
    for (let i = 0; i < 7; i++) await resolverTurn();
    await takeVoice(30);
    await takeVoice(30);
    await takeVoice(30);
    await takeVoice(30);
    await takeVoice(30);
    await takeVoice(30);
    await takePhoto();
    const day = await asFamily(A, (tx) => tutorDay(tx as never, A, KID, DAY));
    expect([day.used.textTurns, day.limits.textTurns, day.voiceMinutesUsed, day.limits.voiceMinutes, day.used.photoDoubts, day.limits.photoDoubts]).toEqual([7, 40, 3, 20, 1, 5]);
    const row = { childId: KID, firstName: 'Asha', text: 7, textMax: 40, voice: 3, voiceMax: 20, photo: 1, photoMax: 5, multiplier: 1, uncapped: false };
    expect(renderToStaticMarkup(createElement(TutorToday, { rows: [row], lang: 'en' }))).toContain('Today: 7 of 40 questions, 3 of 20 voice minutes, 1 of 5 photos');
    const hindi = renderToStaticMarkup(createElement(TutorToday, { rows: [{ ...row, multiplier: 3 }], lang: 'hi' }));
    expect(hindi).toContain('40 में से 7 प्रश्न');
    expect(hindi).toContain('3 गुना');
    // Testing mode lifts every cap: the counts alone, and no Plus line (2 Nov: the section was missing then).
    const free = renderToStaticMarkup(createElement(TutorToday, { rows: [{ ...row, multiplier: 3, uncapped: true }], lang: 'en' }));
    expect(free).toContain('Today: 7 questions, 3 voice minutes, 1 photos. No limits while NetCyberAI is testing.');
    expect(free).not.toContain('3 times');
  });

  it('the Control tile row counts what the children used, and the cost the ledger gives per service', async () => {
    await resolverTurn();
    await resolverTurn(ctx(A, KID2));
    await takeVoice(90, A, KID);
    await takePhoto(B, KID_B);
    await q(`delete from control.ai_usage_ledger`);
    await q(`insert into control.ai_usage_ledger (day, profile_id, provider_id, model, route_position, outcome, cost_usd) values ($1, 'family.resolver', 'anthropic', 'm', 0, 'ok', 0.42), ($1, 'family.homework', 'nvidia', 'm', 0, 'ok', null)`, [DAY]);
    const use = await loadTutorUse(db.pg, DAY);
    expect(use).toMatchObject({ day: DAY, children: 3, textTurns: 2, voiceMinutes: 1.5, photoDoubts: 1, quizzes: 0, reports: 0 });
    expect(use.cost).toEqual([
      { profileId: 'family.homework', usd: null },
      { profileId: 'family.resolver', usd: 0.42 },
    ]);
  });
});

describe('the daily ops job', () => {
  const job = (date: string): ClaimedJob => ({ jobId: 'j', type: 'ai.ops_daily', payload: { date }, attempts: 1, maxAttempts: 4, schoolId: null, idempotencyKey: `ai.ops_daily:${date}` });
  const platform = <T>(fn: (d: typeof db.pg) => Promise<T>) => fn(db.pg);
  const run = (date: string, over: { weeklyReports?: never } = {}) => aiOpsDailyHandler({ platform: platform as never, queue: jobQueue, ...over })(job(date));
  const YESTERDAY = '2026-11-03';
  const TODAY = '2026-11-04';
  const dead = async (type = 'tutor.quiz') => {
    const id = (await q(`insert into jobs (type, payload, idempotency_key, status, attempts, max_attempts, last_error) values ($1, '{}', $2, 'dead', 3, 3, 'x') returning job_id`, [type, `k:${Math.random()}`]))[0].job_id as string;
    return id;
  };
  const status = async (id: string) => (await q(`select status, max_attempts from jobs where job_id = $1`, [id]))[0];

  beforeEach(async () => {
    await q(`delete from control.ai_ops_daily`);
    await q(`delete from jobs`);
    await q(`delete from control.ai_usage`);
    await q(`delete from control.ai_usage_ledger`);
  });

  it('writes one row whose numbers equal the counters, and a second run of the same day changes nothing', async () => {
    await q(`insert into family.day_counts (account_id, child_id, day, text_turns, voice_seconds, photo_questions) values ($1, $2, $5, 9, 150, 2), ($1, $3, $5, 4, 0, 1), ($4, $6, $5, 0, 0, 0)`, [A, KID, KID2, B, YESTERDAY, KID_B]);
    await q(`insert into jobs (type, payload, idempotency_key, status, completed_at) values ('tutor.quiz', '{}', 'q1', 'succeeded', '2026-11-03T10:00:00+05:30'), ('tutor.quiz', '{}', 'q2', 'succeeded', '2026-11-03T22:00:00+05:30'), ('tutor.parent_report', '{}', 'r1', 'succeeded', '2026-11-03T09:00:00+05:30'), ('tutor.quiz', '{}', 'q3', 'succeeded', '2026-11-04T01:00:00+05:30')`);
    await q(`insert into control.ai_usage (day, profile_id, provider_id, model, requests, failures) values ($1, 'family.resolver', 'anthropic', 'm', 20, 3), ($1, 'family.homework', 'nvidia', 'm', 5, 1)`, [YESTERDAY]);
    await q(`insert into control.ai_usage_ledger (day, profile_id, provider_id, model, route_position, outcome, cost_usd) values ($1, 'family.resolver', 'anthropic', 'm', 0, 'ok', 0.25)`, [YESTERDAY]);
    await run(TODAY);
    const read = async () => (await q(`select day::text, children, text_turns, voice_minutes::float8 as voice_minutes, photo_doubts, quizzes, reports, failures, cost_usd::float8 as cost_usd from control.ai_ops_daily`));
    const want = [{ day: YESTERDAY, children: 2, text_turns: 13, voice_minutes: 2.5, photo_doubts: 3, quizzes: 2, reports: 1, failures: 4, cost_usd: 0.25 }];
    expect(await read()).toEqual(want);
    await run(TODAY);
    expect(await read()).toEqual(want);
    const tile = await loadTutorUse(db.pg, YESTERDAY);
    expect([tile.children, tile.textTurns, tile.voiceMinutes, tile.photoDoubts, tile.quizzes, tile.reports]).toEqual([2, 13, 2.5, 3, 2, 1]);
  });

  it('retries a dead tutor job once, and never twice; other jobs are left alone', async () => {
    const quiz = await dead('tutor.quiz');
    const other = await dead('invite.send');
    await run(TODAY);
    expect(await status(quiz)).toMatchObject({ status: 'pending', max_attempts: 4 });
    expect(await status(other)).toMatchObject({ status: 'dead' });
    expect((await q(`select retried from control.ai_ops_daily`))[0].retried).toEqual([quiz]);
    // It dies again; the next days' runs leave it for a person.
    await q(`update jobs set status = 'dead' where job_id = $1`, [quiz]);
    await run('2026-11-05');
    await run(TODAY);
    expect(await status(quiz)).toMatchObject({ status: 'dead', max_attempts: 4 });
    // A job that dies after that is retried once, by its own day's run.
    const report = await dead('tutor.parent_report');
    await run('2026-11-06');
    expect(await status(report)).toMatchObject({ status: 'pending' });
  });

  it('sends the founders the spend alert once when the day’s cost reached the line, and not under it', async () => {
    await setting('ai.spend_alert_usd_per_day', 1);
    await q(`insert into control.ai_usage_ledger (day, profile_id, provider_id, model, route_position, outcome, cost_usd) values ($1, 'family.resolver', 'anthropic', 'm', 0, 'ok', 0.4)`, [YESTERDAY]);
    await run(TODAY);
    expect(await q(`select 1 from jobs where type = 'email.send'`)).toHaveLength(0);
    await q(`insert into control.ai_usage_ledger (day, profile_id, provider_id, model, route_position, outcome, cost_usd) values ($1, 'family.resolver', 'anthropic', 'm', 0, 'ok', 0.9)`, [YESTERDAY]);
    await run(TODAY);
    await run(TODAY);
    const mails = await q(`select idempotency_key, payload from jobs where type = 'email.send'`);
    expect(mails).toHaveLength(1);
    expect(mails[0].idempotency_key).toBe(`email.send:ai_spend_alert:${YESTERDAY}`);
    expect(mails[0].payload).toMatchObject({ to: 'founders', template: 'ai_spend_alert', data: { day: YESTERDAY, spentUsd: '1.30', limitUsd: '1.00' } });
    // The hourly upkeep's own mail for that day has the same key, so a day is never announced twice.
    expect(mails[0].payload.data.url).toMatch(/\/control\/ai$/);
  });

  it('on a Sunday starts the week’s parent reports for the week’s Monday; on other days not; a failure there keeps the row', async () => {
    const weeklyReports = vi.fn(async () => {});
    await run('2026-11-01', { weeklyReports } as never);
    expect(weeklyReports).toHaveBeenCalledTimes(1);
    expect(weeklyReports).toHaveBeenCalledWith(expect.anything(), jobQueue, '2026-10-26');
    expect(mondayOf('2026-11-01')).toBe('2026-10-26');
    expect(mondayOf('2026-11-02')).toBe('2026-11-02');
    await run('2026-11-02', { weeklyReports } as never);
    expect(weeklyReports).toHaveBeenCalledTimes(1);
    await q(`delete from control.ai_ops_daily`);
    const failing = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(run('2026-11-08', { weeklyReports: failing } as never)).resolves.toBeUndefined();
    expect(await q(`select day::text from control.ai_ops_daily`)).toEqual([{ day: '2026-11-07' }]);
  });

  it('is reachable only by the platform role', async () => {
    const as = async (role: string) => db.pg.transaction(async (tx: Tx) => {
      await tx.query(`set local role ${role}`);
      try {
        await tx.query('savepoint s');
        await tx.query('select * from control.ai_ops_daily');
        return 'read';
      } catch {
        return 'refused';
      }
    });
    expect(await as('nca_super')).toBe('read');
    expect(await as('family_app')).toBe('refused');
    expect(await as('app_user')).toBe('refused');
  });
});
