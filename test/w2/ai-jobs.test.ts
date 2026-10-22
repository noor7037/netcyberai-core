import { randomBytes } from 'crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// W2 (C316): the two jobs staff start without a browser: the AI smoke test (one live call to each children's feature,
// summed up in the audit log) and preparing chapters one line per run. Cloudflare is replaced at fetch for the smoke
// test; the resolver's AI call is replaced for preparing. Made-up people and words only.

const ai = vi.hoisted(() => ({ incompleteFor: null as string | null }));
vi.mock('@/lib/ai/platform', async (original) => {
  const real = await original<typeof import('@/lib/ai/platform')>();
  return {
    ...real,
    prepareText: async (db: unknown, ctx: unknown, profile: string, req: { messages: { content: string }[] }) => {
      // Only the preparing path is replaced; the smoke test reaches the vendors through the real adapters.
      if (profile !== 'content.prepare') return real.prepareText(db as never, ctx as never, profile as never, req as never);
      const item = (id: string) => ({ id, question: `Question ${id}?`, options: ['a', 'b', 'c', 'd'], answer: 1, hint: 'h', why: 'w', wrong: ['', '', '', ''] });
      const full = [
        { type: 'explanation', title: 'Magnets', idea: 'A magnet pulls iron.', example: 'A fridge magnet.', steps: ['One', 'Two'], terms: [] },
        { type: 'check', items: [item('c1'), item('c2')] },
        { type: 'practice', items: [item('p1')] },
      ];
      // The line under test comes back with its check's answer as a letter, which our checks refuse.
      const lines = ai.incompleteFor && req.messages[0].content.includes(ai.incompleteFor) ? [full[0], { ...full[1], items: [{ ...item('c1'), answer: 'B' }] }] : full;
      // Spread over lines and fenced, as an open model may write it (C316).
      const text = `\`\`\`json\n${lines.map((l) => JSON.stringify(l, null, 2)).join('\n')}\n\`\`\``;
      return { ok: true, text: { send: async (onDelta: (t: string) => void) => (onDelta(text), { result: { ok: true, text, tokensIn: 1, tokensOut: 1, provider: 'workers-ai', model: 'm' }, record: async () => {} }) } };
    },
  };
});

const STAFF = 'ff000000-0000-4000-8000-0000000000f1';
const VERSION = 'ff000000-0000-4000-8000-0000000000b1';
const WORKERS_KEY = `${'c'.repeat(32)}:cfat_${'W'.repeat(36)}`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const job = (type: string, payload: Record<string, unknown>, key = `${type}:t:0`) => ({ jobId: 'j', type, payload, attempts: 1, maxAttempts: 2, schoolId: null, idempotencyKey: key });

beforeAll(async () => {
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  process.env.AI_CREDENTIALS_KEY_VERSION = '1';
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-w2-ai-jobs-tests-0123456789';
  await db.pg.exec(`
    insert into users (user_id, school_id, role, display_name) values ('${STAFF}', null, 'super_admin', 'Made-up Reviewer');
    insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, import_source, import_ref)
      values ('${VERSION}', 'CBSE', 6, 'science', '2099-00', 1, 'in_review', 'repository', 'test');
    insert into content.chapters (chapter_id, version_id, chapter_key, position, title_en, source_url, source_page, checked_on) values
      ('ff000000-0000-4000-8000-0000000000d1', '${VERSION}', 'jt.c6.science.ch04', 1, 'Exploring Magnets', 'https://ncert.nic.in/', '1', '2026-10-22'),
      ('ff000000-0000-4000-8000-0000000000d2', '${VERSION}', 'jt.c6.science.ch05', 2, 'Another chapter', 'https://ncert.nic.in/', '1', '2026-10-22');
    insert into content.topics (version_id, chapter_id, topic_key, position, title_en, source_url, source_page, checked_on) values
      ('${VERSION}', 'ff000000-0000-4000-8000-0000000000d1', 'jt.c6.science.ch04.t01', 1, 'Magnetic materials', 'https://ncert.nic.in/', '1', '2026-10-22');
  `);
}, 90_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('the preparing job (C316)', () => {
  it('prepares only the chapters asked for, one line per run, passing over a line that fails, and sums up in the audit log', async () => {
    const { contentPrepareHandler } = await import('@/lib/jobs/ai-jobs');
    const { withPlatformService } = await import('@/lib/auth/db');
    const queued: { payload: Record<string, unknown>; idempotencyKey: string }[] = [];
    const queue = { enqueue: async (_db: unknown, spec: { payload: Record<string, unknown>; idempotencyKey: string }) => (queued.push(spec), { jobId: 'n', created: true }) } as never;
    const handler = contentPrepareHandler({ platform: withPlatformService as never, queue });
    ai.incompleteFor = 'Magnetic materials';
    let payload: Record<string, unknown> = { versionId: VERSION, chapterKeys: ['jt.c6.science.ch04'], by: STAFF, outcomes: [] };
    let key = 'content.prepare:demo';
    for (let i = 0; i < 10; i++) {
      const before = queued.length;
      await handler(job('content.prepare', payload, key));
      if (queued.length === before) break;
      ({ payload, idempotencyKey: key } = queued.at(-1)!);
    }
    // Two lines (the chapter and its topic) × English and Hindi; the topic came back incomplete both times. Each run's
    // jobs carry the first job's key, so two runs never share one.
    expect(queued.map((x) => x.idempotencyKey)).toEqual(['content.prepare:demo:1', 'content.prepare:demo:2', 'content.prepare:demo:3', 'content.prepare:demo:4']);
    const [run] = await q(`select after_state from audit_log where event_action = 'content.prepare_run'`);
    expect(run.after_state).toMatchObject({ chapterKeys: ['jt.c6.science.ch04'], tried: 4, kept: 2 });
    // Each line says what came back, as types and counts (C318).
    expect(run.after_state.outcomes[0].detail).toEqual({ finish: null, objects: 3, kept: ['explanation', 'check', 'practice'], rejected: [] });
    expect(run.after_state.outcomes[2].detail).toMatchObject({ finish: null, objects: 2, kept: ['explanation'], rejected: ['check'] });
    // A line not kept also keeps the first words the model wrote (C320); a kept one does not.
    expect(run.after_state.outcomes[2].detail.start).toMatch(/^```json \{ "type": "explanation"/);
    expect(run.after_state.outcomes[0].detail.start).toBeUndefined();
    expect(run.after_state.outcomes.map((o: { key: string; outcome: string }) => `${o.key}:${o.outcome}`)).toEqual([
      'jt.c6.science.ch04:kept',
      'jt.c6.science.ch04:kept',
      'jt.c6.science.ch04.t01:incomplete',
      'jt.c6.science.ch04.t01:incomplete',
    ]);
    // Chapter 5 was not asked for.
    expect(await q(`select distinct topic_key from content.responses order by 1`)).toEqual([{ topic_key: 'jt.c6.science.ch04' }]);
  });

  it('refuses a payload without active staff', async () => {
    const { contentPrepareHandler } = await import('@/lib/jobs/ai-jobs');
    const { withPlatformService } = await import('@/lib/auth/db');
    const handler = contentPrepareHandler({ platform: withPlatformService as never, queue: {} as never });
    await expect(handler(job('content.prepare', { versionId: VERSION, chapterKeys: [], by: 'ff000000-0000-4000-8000-0000000000aa', outcomes: [] }))).rejects.toThrow(/staff/);
    await expect(handler(job('content.prepare', { versionId: 'x', chapterKeys: [], by: STAFF }))).rejects.toThrow(/payload/);
  });
});

describe('the AI smoke test (C316)', () => {
  it('nothing switched on: each check says so, and the audit row records it', async () => {
    const { aiSmokeHandler } = await import('@/lib/jobs/ai-jobs');
    const { withPlatformService } = await import('@/lib/auth/db');
    await aiSmokeHandler({ platform: withPlatformService as never })(job('ai.smoke', { by: STAFF }));
    const [row] = await q(`select after_state from audit_log where event_action = 'ai.smoke_test' order by created_at desc limit 1`);
    expect(row.after_state.checks.map((c: { check: string; ok: boolean; failure: string }) => [c.check, c.ok, c.failure])).toEqual([
      ['text', false, 'not_switched_on'],
      ['text:system', false, 'not_switched_on'],
      ['photo', false, 'not_switched_on'],
      ['voice', false, 'not_switched_on'],
      ['safety', false, 'not_switched_on'],
    ]);
  });

  it('cleared and keyed: a text, a photo, four recordings and the safety check, each recorded with what came back', async () => {
    const { aiEncryptionKey, sealAiKey } = await import('@/lib/ai/credentials');
    await q(`update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.org/terms', cleared_at = now(), cleared_by = $1 where provider_id = 'workers-ai'`, [STAFF]);
    for (const [profile, model] of [
      ['family.resolver', '@cf/meta/llama-4-scout-17b-16e-instruct'],
      ['family.homework', '@cf/meta/llama-4-scout-17b-16e-instruct'],
      ['family.voice_input', '@cf/openai/whisper-large-v3-turbo'],
      ['family.moderation', '@cf/meta/llama-guard-3-8b'],
    ])
      await q(`update control.ai_profiles set provider_id = 'workers-ai', model = $2 where profile_id = $1`, [profile, model]);
    const s = sealAiKey(aiEncryptionKey()!, 'workers-ai', WORKERS_KEY);
    await q(`insert into control.ai_credentials (provider_id, ciphertext, iv, tag, key_version, key_last4, set_by) values ('workers-ai', $1, $2, $3, $4, $5, $6)`, [s.ciphertext, s.iv, s.tag, s.keyVersion, 'WWWW', STAFF]);

    const sent: { url: string; body: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        sent.push({ url: String(url), body: String(init.body) });
        const answer = '{"type":"answer","word":"iron"}';
        if (String(url).endsWith('/chat/completions')) {
          const photo = String(init.body).includes('image_url');
          const text = photo ? '{"question":"Which of these is attracted by a magnet?"}' : answer;
          if (JSON.parse(String(init.body)).stream === false) return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });
          return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`, { status: 200 });
        }
        if (String(url).includes('/run/@cf/meta/llama-4')) {
          // Workers AI's own route: in one piece, or streamed as { response } events.
          if (JSON.parse(String(init.body)).stream) return new Response(`data: ${JSON.stringify({ response: answer })}\n\ndata: [DONE]\n\n`, { status: 200 });
          return new Response(JSON.stringify({ success: true, result: { response: answer } }), { status: 200 });
        }
        if (String(url).includes('whisper')) {
          const audio = JSON.parse(String(init.body)).audio as string;
          // Pretend Cloudflare takes WAV and WebM and refuses the others, to show each format is recorded on its own.
          const ok = audio.startsWith('UklGR') || audio.startsWith('GkXf');
          return ok ? new Response(JSON.stringify({ success: true, result: { text: 'What does a magnet attract?' } }), { status: 200 }) : new Response('{}', { status: 400 });
        }
        return new Response(JSON.stringify({ success: true, result: { response: 'safe' } }), { status: 200 });
      })
    );
    const { aiSmokeHandler } = await import('@/lib/jobs/ai-jobs');
    const { withPlatformService } = await import('@/lib/auth/db');
    await aiSmokeHandler({ platform: withPlatformService as never })(job('ai.smoke', { by: STAFF }));
    vi.unstubAllGlobals();
    const [row] = await q(`select after_state from audit_log where event_action = 'ai.smoke_test' order by created_at desc limit 1`);
    const summary = row.after_state.checks.map((c: { check: string; ok: boolean; note?: string; status?: number }) => [c.check, c.ok, c.note ?? c.status]);
    expect(summary).toEqual([
      ['text', true, 'json: one object, nothing around it'],
      ['text:system', true, 'json: one object, nothing around it'],
      ['transport:compat_stream', true, 'json: one object, nothing around it'],
      ['transport:compat_once', true, 'json: one object, nothing around it'],
      ['transport:native_once', true, 'json: one object, nothing around it'],
      ['transport:native_stream', true, 'json: one object, nothing around it'],
      ['photo', true, 'read the printed question'],
      ['voice:webm', true, 'heard the question'],
      ['voice:ogg', false, 400],
      ['voice:mp4', false, 400],
      ['voice:wav', true, 'heard the question'],
      ['safety', true, 'safe; answered as text'],
    ]);
    // The first words of a made-up answer are kept, to see a format problem (C320).
    expect(row.after_state.checks[0].start).toBe('{"type":"answer","word":"iron"}');
    // The streamed transports keep the first raw bytes, to see where a character is lost (C321).
    expect(row.after_state.checks.find((c: { check: string }) => c.check === 'transport:compat_stream').raw).toContain('data: ');
    // Twelve calls, metered under each profile; nothing taken from a family's day.
    expect(sent).toHaveLength(12);
    expect(await q(`select profile_id, sum(requests)::int as requests from control.ai_usage group by 1 order by 1`)).toEqual([
      { profile_id: 'family.homework', requests: 1 },
      { profile_id: 'family.moderation', requests: 1 },
      { profile_id: 'family.resolver', requests: 6 },
      { profile_id: 'family.voice_input', requests: 4 },
    ]);
    expect(await q(`select * from family.ai_daily`)).toEqual([]);
  });
});
