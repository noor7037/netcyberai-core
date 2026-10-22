import { randomBytes } from 'crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { aiEncryptionKey, sealAiKey } from '@/lib/ai/credentials';
import { capableAdapter } from '@/lib/ai/platform';
import { setProfile } from '@/lib/ai/control';
import { cleanTranscript, countedSeconds, sniffAudio } from '@/lib/family/voice';
import { ASKED_PURPOSES } from '@/lib/family/consent';
import { FAMILY_MODULES } from '@/lib/family/modules';

// M2-7 (C281): voice input. A child speaks a question in Study; the recording goes once to the family.voice_input
// profile (speech to text, a provider cleared for minors), on the real AI platform and the real migrations (PGlite),
// with the vendor replaced at fetch. No consent, no microphone and no call; the seconds a day are capped; the recording
// is never stored or logged; only the words come back, an Aadhaar-like number taken out. Made-up names and keys only.

const ACCOUNT = 'f9000000-0000-4000-8000-0000000000a1';
const CHILD = 'f9000000-0000-4000-8000-0000000000a2';
const SMALL = 'f9000000-0000-4000-8000-0000000000a3';
const FOUNDER = 'f9000000-0000-4000-8000-0000000000f1';
const OPENAI_KEY = `sk-${'c'.repeat(30)}VOIC`;
// A WebM header, then a marker that must never be found anywhere afterwards.
const MARK = 'VOICE-SAMPLE-7f3a9c';
const AUDIO = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]), Buffer.from(MARK)]);
const B64 = AUDIO.toString('base64');

describe('reading a recording', () => {
  it('knows the container by its bytes', () => {
    expect(sniffAudio(AUDIO)).toBe('audio/webm');
    expect(sniffAudio(Buffer.from('OggS\0\x02rest'))).toBe('audio/ogg');
    expect(sniffAudio(Buffer.from('\0\0\0\x20ftypM4A '))).toBe('audio/mp4');
    expect(sniffAudio(Buffer.from('RIFF\x24\0\0\0WAVEfmt '))).toBe('audio/wav');
    expect(sniffAudio(Buffer.from('not audio at all'))).toBeNull();
    expect(sniffAudio(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
  });
  it('counts 1 to 30 seconds, and a missing timer as 30', () => {
    expect([countedSeconds(0.2), countedSeconds(12.1), countedSeconds(400), countedSeconds(undefined), countedSeconds('5'), countedSeconds(NaN)]).toEqual([1, 13, 30, 30, 30, 30]);
  });
  it('takes an Aadhaar-like number out and keeps the words to 500 characters', () => {
    expect(cleanTranscript('My number is 2345 6789 0123, what is a fraction?')).toBe('My number is , what is a fraction?');
    expect(cleanTranscript('What is २३४५६७८९०१२३ times two?')).toBe('What is times two?');
    expect(cleanTranscript('What is 12 times 14?')).toBe('What is 12 times 14?');
    expect(cleanTranscript('a '.repeat(400)).length).toBeLessThanOrEqual(500);
    // A longer number cut at the end must not leave twelve digits behind.
    expect(cleanTranscript(`${'x'.repeat(488)} 1234567890123456`)).not.toMatch(/\d{12}/);
  });
});

describe('the capability on the AI platform', () => {
  it('voice input takes only a provider that can hear', async () => {
    expect(capableAdapter('family.voice_input', 'openai')?.capability).toBe('speech_to_text');
    expect(capableAdapter('family.voice_input', 'anthropic')).toBeNull();
    expect(capableAdapter('family.resolver', 'anthropic')?.capability).toBe('text');
    // Control refuses the choice before touching the database.
    const db = { query: async () => { throw new Error('not reached'); } };
    expect(await setProfile(db as never, { userId: FOUNDER } as never, 'family.voice_input', { providerId: 'anthropic', model: 'm', promptVersion: 'v1', enabled: true, fallback: [] })).toEqual({ ok: false, code: 'provider' });
  });
  it('the parent is asked for voice, and the module is built', () => {
    expect(ASKED_PURPOSES).toContain('voice_practice');
    expect(FAMILY_MODULES.find((m) => m.id === 'voice_input')?.built).toBe(true);
  });
});

// ---- the route, on the real migrations and the real platform ---------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
let cookie = '';
const cookieFor = async (child: string) => {
  const { signFamilySession } = await import('@/lib/family/session');
  return `ncf_session=${await signFamilySession({ accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' })}; ncf_child=${child}`;
};

type Call = { url: string; form: FormData; headers: Record<string, string> };
let calls: Call[] = [];
let reply: () => Response = () => Response.json({ text: 'What is photosynthesis?', usage: { input_tokens: 40, output_tokens: 6 } });
const logged: string[] = [];

beforeAll(async () => {
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  process.env.AI_CREDENTIALS_KEY_VERSION = '1';
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-voice-tests-0123456789abc';
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'voice@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${CHILD}', '${ACCOUNT}', 'Zoya', 6, 'CBSE', 'hi', 'hi', 'IN-MH'),
      ('${SMALL}', '${ACCOUNT}', 'Kabir', 0, 'CBSE', 'en', 'en', 'IN-MH');
  `);
  const k = aiEncryptionKey();
  if (!k) throw new Error('test key missing');
  const s = sealAiKey(k, 'openai', OPENAI_KEY);
  await q(`insert into control.ai_credentials (provider_id, ciphertext, iv, tag, key_version, key_last4, set_by) values ('openai', $1, $2, $3, $4, 'VOIC', $5)`, [s.ciphertext, s.iv, s.tag, s.keyVersion, FOUNDER]);
  await q(`update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.org/terms', cleared_at = now(), cleared_by = $1 where provider_id in ('openai', 'anthropic')`, [FOUNDER]);
  await q(`update control.ai_profiles set provider_id = 'openai', model = 'test-transcribe', fallback = '[]', enabled = true where profile_id = 'family.voice_input'`);
  cookie = await cookieFor(CHILD);
}, 90_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});
beforeEach(async () => {
  calls = [];
  reply = () => Response.json({ text: 'What is photosynthesis?', usage: { input_tokens: 40, output_tokens: 6 } });
  logged.length = 0;
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, level).mockImplementation((...a: unknown[]) => void logged.push(a.map(String).join(' ')));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), form: init.body as FormData, headers: init.headers as Record<string, string> });
      return reply();
    })
  );
  await q(`delete from family.day_counts`);
  await q(`delete from control.ai_usage`);
  await q(`delete from family.ai_daily`);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const post = async (body: unknown, as = cookie) => {
  const mod = await import('@/app/api/family/voice/route');
  const res = await mod.POST(new NextRequest('http://localhost/api/family/voice', { method: 'POST', headers: { cookie: as, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};
const seconds = async () => Number((await q(`select coalesce(sum(voice_seconds), 0)::int as n from family.day_counts where child_id = $1`, [CHILD]))[0].n);
const grantVoice = (granted: boolean) => q(`insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ($1, 'voice_practice', $2, 'parent_tap', 'v1')`, [ACCOUNT, granted]);

describe('the voice route', () => {
  it('without the parent\'s voice consent: refused, nothing counted, no call', async () => {
    await q(`insert into control.app_flags (app, module, enabled, reason) values ('family', 'voice_input', true, 'test')`);
    expect(await post({ audio: B64, seconds: 5 })).toEqual({ status: 403, body: { error: 'consent_required' } });
    expect([calls.length, await seconds()]).toEqual([0, 0]);
  });

  it('with the module off: refused', async () => {
    await grantVoice(true);
    await q(`update control.app_flags set enabled = false where app = 'family' and module = 'voice_input'`);
    expect((await post({ audio: B64, seconds: 5 })).body.error).toBe('off');
    await q(`update control.app_flags set enabled = true where app = 'family' and module = 'voice_input'`);
    expect(calls).toHaveLength(0);
  });

  it('for a pre-primary child: refused', async () => {
    expect((await post({ audio: B64, seconds: 5 }, await cookieFor(SMALL))).body.error).toBe('not_for_class');
    expect(calls).toHaveLength(0);
  });

  it('something that is not a recording: refused before any call', async () => {
    expect((await post({ audio: Buffer.from('plain text, not audio').toString('base64'), seconds: 5 })).body.error).toBe('not_audio');
    expect((await post({ audio: 'not base64 !!', seconds: 5 })).body.error).toBe('not_audio');
    expect((await post({ audio: Buffer.alloc(1_100_000, 1).toString('base64'), seconds: 5 })).status).toBe(413);
    expect([calls.length, await seconds()]).toEqual([0, 0]);
  });

  it('returns only the words; the request carries the recording, the model and the language, and no name', async () => {
    const r = await post({ audio: B64, seconds: 7.4 });
    expect(r).toEqual({ status: 200, body: { text: 'What is photosynthesis?', left: 112, maxSeconds: 30 } });
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(call.headers.authorization).toBe(`Bearer ${OPENAI_KEY}`);
    const file = call.form.get('file') as File;
    expect(file.name).toBe('audio.webm');
    expect(file.type).toBe('audio/webm');
    expect(Buffer.from(await file.arrayBuffer()).equals(AUDIO)).toBe(true);
    expect([call.form.get('model'), call.form.get('language'), call.form.get('response_format')]).toEqual(['test-transcribe', 'hi', 'json']);
    const fields = [...call.form.keys()].sort();
    expect(fields).toEqual(['file', 'language', 'model', 'response_format']);
    expect(JSON.stringify([fields.map((f) => (f === 'file' ? file.name : call.form.get(f))), call.headers])).not.toMatch(/Zoya|Kabir|voice@example/);
    expect(await seconds()).toBe(8);
  });

  it('meters counts and tokens only, and the recording is written nowhere and logged nowhere', async () => {
    await post({ audio: B64, seconds: 3 });
    expect(await q(`select profile_id, provider_id, model, requests, failures, tokens_in::int, tokens_out::int from control.ai_usage`)).toEqual([
      { profile_id: 'family.voice_input', provider_id: 'openai', model: 'test-transcribe', requests: 1, failures: 0, tokens_in: 40, tokens_out: 6 },
    ]);
    expect(await q(`select requests from family.ai_daily`)).toEqual([{ requests: 1 }]);
    // No table in the family, content or control schemas holds the recording or the words heard.
    const tables = await q(`select table_schema, table_name from information_schema.tables where table_schema in ('family', 'content', 'control', 'public') and table_type = 'BASE TABLE'`);
    for (const t of tables) {
      const hit = await q(`select count(*)::int as n from ${t.table_schema}.${t.table_name} x where x::text like $1 or x::text like $2 or x::text like $3`, [`%${MARK}%`, `%${B64.slice(8, 30)}%`, '%photosynthesis%']);
      expect(hit[0].n, `${t.table_schema}.${t.table_name}`).toBe(0);
    }
    expect(logged.join('\n')).not.toMatch(new RegExp(`${MARK}|${B64.slice(8, 30).replace(/[+/]/g, '.')}|photosynthesis`));
  });

  it('an Aadhaar-like number heard is taken out before it is returned', async () => {
    reply = () => Response.json({ text: 'My Aadhaar is 2345 6789 0123. What is a prime number?' });
    const r = await post({ audio: B64, seconds: 4 });
    expect(r.body.text).toBe('My Aadhaar is . What is a prime number?');
    expect(JSON.stringify(r.body)).not.toMatch(/\d{4}\s?\d{4}\s?\d{4}/);
  });

  it("over the day's seconds: refused and not called; seconds are counted per recording", async () => {
    await q(`update control.settings set value = '20'::jsonb where key = 'family.voice_input_seconds_per_day'`);
    expect((await post({ audio: B64, seconds: 15 })).body).toMatchObject({ left: 5, maxSeconds: 5 });
    expect(await seconds()).toBe(15);
    expect(await post({ audio: B64, seconds: 6 })).toEqual({ status: 429, body: { error: 'voice_cap', limit: 20, left: 5 } });
    expect(await post({ audio: B64 })).toEqual({ status: 429, body: { error: 'voice_cap', limit: 20, left: 5 } });
    expect((await post({ audio: B64, seconds: 5 })).status).toBe(200);
    expect(await post({ audio: B64, seconds: 1 })).toEqual({ status: 429, body: { error: 'voice_cap', limit: 20, left: 0 } });
    expect(calls).toHaveLength(2);
    expect(await seconds()).toBe(20);
    await q(`update control.settings set value = '120'::jsonb where key = 'family.voice_input_seconds_per_day'`);
  });

  it('a failed call gives the seconds back', async () => {
    reply = () => new Response('{}', { status: 500 });
    expect(await post({ audio: B64, seconds: 9 })).toEqual({ status: 503, body: { error: 'ai_failed' } });
    expect(await seconds()).toBe(0);
    expect(await q(`select requests, failures from control.ai_usage`)).toEqual([{ requests: 1, failures: 1 }]);
  });

  it('the minors check refuses a provider not cleared, and gives the seconds back', async () => {
    await q(`alter table control.ai_profiles disable trigger ai_profiles_minors_check`);
    await q(`alter table control.ai_providers disable trigger ai_providers_clearance_check`);
    try {
      await q(`update control.ai_providers set cleared_for_minors = false where provider_id = 'openai'`);
      expect(await post({ audio: B64, seconds: 5 })).toEqual({ status: 503, body: { error: 'ai_not_cleared_for_minors' } });
      expect([calls.length, await seconds()]).toEqual([0, 0]);
    } finally {
      await q(`update control.ai_providers set cleared_for_minors = true where provider_id = 'openai'`);
      await q(`alter table control.ai_providers enable trigger ai_providers_clearance_check`);
      await q(`alter table control.ai_profiles enable trigger ai_profiles_minors_check`);
    }
  });

  it('a provider without a speech adapter is skipped: alone it is not switched on, first in the chain it hands over', async () => {
    await q(`update control.ai_profiles set provider_id = 'anthropic', model = 'test-model', fallback = '[]' where profile_id = 'family.voice_input'`);
    expect(await post({ audio: B64, seconds: 5 })).toEqual({ status: 503, body: { error: 'ai_not_switched_on' } });
    expect(calls).toHaveLength(0);
    await q(`update control.ai_profiles set fallback = '[{"provider":"openai","model":"test-transcribe"}]' where profile_id = 'family.voice_input'`);
    expect((await post({ audio: B64, seconds: 5 })).status).toBe(200);
    expect(calls.map((c) => c.url)).toEqual(['https://api.openai.com/v1/audio/transcriptions']);
    await q(`update control.ai_profiles set provider_id = 'openai', model = 'test-transcribe', fallback = '[]' where profile_id = 'family.voice_input'`);
  });

  it('a withdrawn voice consent stops the microphone again', async () => {
    await grantVoice(false);
    expect((await post({ audio: B64, seconds: 5 })).body.error).toBe('consent_required');
    expect(calls).toHaveLength(0);
  });
});
