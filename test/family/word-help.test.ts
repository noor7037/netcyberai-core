import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { DEFAULT_CHILD_SETTINGS, checkSettingsPatch, meaningLangOf, parseChildSettings } from '@/lib/family/child-settings';
import { LANGUAGES, LANG_CODES, isLangCode, voiceTagOf } from '@/lib/family/languages';
import { checkWordHelpBody, contextHash, looksPersonal, normaliseText, parseWordHelp } from '@/lib/family/word-help';
import { wordHelpPrompt } from '@/lib/ai/prompts/family.word_help';
import { PROFILES } from '@/lib/ai/platform';

// W23-B (C494): word help. The pure parts (languages, settings, the body check, the cache key, the model's answer read
// strictly), then the route on the real migrations (PGlite): the guard, the checks, the child's switch, the shared cache,
// the family's own daily allowance and a provider that fails. The gateway's two calls (text and the safety check) are
// scripted; the AI platform itself is tested in test/ai. Made-up names only.

const gate = vi.hoisted(() => ({ texts: [] as string[], fail: false, unsafe: false, asked: [] as string[], sentTo: [] as string[] }));
vi.mock('@/lib/ai/platform', async (original) => ({
  ...(await original<typeof import('@/lib/ai/platform')>()),
  activePromptVersion: async () => 'v1',
  prepareModeration: async () => ({ ok: true, moderation: { check: async () => ({ safe: !gate.unsafe, categories: [] }), record: async () => {} } }),
  prepareText: async (_db: unknown, _ctx: unknown, profile: string, req: { messages: { content: string }[] }) => {
    gate.asked.push(profile);
    gate.sentTo.push(req.messages[0].content);
    if (gate.fail) return { ok: false, reason: 'failed' };
    return {
      ok: true,
      text: { send: async () => ({ result: { ok: true, text: gate.texts.shift() ?? '{}', tokensIn: 1, tokensOut: 1, provider: 'stand-in', model: 'm1' }, record: async () => {} }) },
    };
  },
}));

const ACCOUNT = 'f2300000-0000-4000-8000-0000000000a1';
const OTHER = 'f2300000-0000-4000-8000-0000000000b1';
const ASHA = 'f2300000-0000-4000-8000-0000000000c1';
const MEERA = 'f2300000-0000-4000-8000-0000000000c2';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
const cookie = async (account = ACCOUNT, child = ASHA) => {
  const { signFamilySession } = await import('@/lib/family/session');
  return `ncf_session=${await signFamilySession({ accountId: account, tokenVersion: 0, sessionId: 's1' })}; ncf_child=${child}`;
};
const ask = async (body: unknown, opts: { account?: string; child?: string; signedIn?: boolean } = {}) => {
  const route = await import('@/app/api/family/word-help/route');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.signedIn !== false) headers.cookie = await cookie(opts.account, opts.child);
  const res = await route.POST(new NextRequest('http://localhost/api/family/word-help', { method: 'POST', headers, body: JSON.stringify(body) }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const answer = (meaning: string | null, translation: string | null) => JSON.stringify({ meaning, translation });
const used = async (account = ACCOUNT) => (await q(`select word_helps, requests from family.ai_daily where account_id = $1`, [account]))[0] ?? { word_helps: 0, requests: 0 };
const cached = async () => Number((await q(`select count(*)::int as n from content.word_help`))[0].n);

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-word-help-tests-0123456789';
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'wordhelp@example.org'), ('${OTHER}', 'other.wh@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values
      ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1'), ('${OTHER}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${ASHA}', '${ACCOUNT}', 'Asha', 6, 'CBSE', 'en', 'en', 'IN-HR'), ('${MEERA}', '${OTHER}', 'Meera', 7, 'CBSE', 'hi', 'hi', 'IN-HR');
  `);
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});
beforeEach(async () => {
  Object.assign(gate, { texts: [], fail: false, unsafe: false, asked: [], sentTo: [] });
  await q(`delete from content.word_help`);
  await q(`delete from family.ai_daily`);
  await q(`delete from family.child_settings`);
  await q(`update control.settings set value = '300'::jsonb where key = 'family.word_help.daily_requests'`);
});

describe('the languages', () => {
  it('Hindi, English and the major Indian languages, each with its own name and a voice tag', () => {
    expect([...LANG_CODES]).toEqual(['en', 'hi', 'bn', 'te', 'mr', 'ta', 'ur', 'gu', 'kn', 'ml', 'or', 'pa', 'as']);
    expect(LANGUAGES.map((l) => l.code)).toEqual([...LANG_CODES]);
    for (const l of LANGUAGES) {
      expect(l.native.length).toBeGreaterThan(0);
      expect(l.english).toMatch(/^[A-Z][a-z]+$/);
      expect(l.voice).toBe(`${l.code}-IN`);
    }
    expect(LANGUAGES.find((l) => l.code === 'ta')).toMatchObject({ native: 'தமிழ்', english: 'Tamil', voice: 'ta-IN' });
    expect(LANGUAGES.find((l) => l.code === 'hi')?.native).toBe('हिन्दी');
    expect(voiceTagOf('ml')).toBe('ml-IN');
    expect(isLangCode('ta')).toBe(true);
    expect(isLangCode('fr')).toBe(false);
    expect(isLangCode(null)).toBe(false);
  });
});

describe('the settings', () => {
  it('default on, and the meaning language follows the app until the child picks one', () => {
    expect(DEFAULT_CHILD_SETTINGS).toMatchObject({ wordHelp: true, tapToRead: true, autoScroll: true, meaningLang: null });
    expect(parseChildSettings(undefined)).toMatchObject({ wordHelp: true, tapToRead: true, autoScroll: true, meaningLang: null });
    expect(parseChildSettings({ wordHelp: false, tapToRead: false, autoScroll: false, meaningLang: 'ta' })).toMatchObject({ wordHelp: false, tapToRead: false, autoScroll: false, meaningLang: 'ta' });
    // A stored value of the wrong shape falls back; the old keys are unchanged.
    expect(parseChildSettings({ wordHelp: 'no', meaningLang: 'fr', readAloud: false })).toMatchObject({ wordHelp: true, meaningLang: null, readAloud: false });
    expect(meaningLangOf({ meaningLang: null }, 'hi')).toBe('hi');
    expect(meaningLangOf({ meaningLang: 'bn' }, 'hi')).toBe('bn');
  });
  it('a change is checked: known keys with their shape, a language or null for the meaning language', () => {
    expect(checkSettingsPatch({ wordHelp: false })).toEqual({ wordHelp: false });
    expect(checkSettingsPatch({ meaningLang: 'te' })).toEqual({ meaningLang: 'te' });
    expect(checkSettingsPatch({ meaningLang: null })).toEqual({ meaningLang: null });
    expect(checkSettingsPatch({ meaningLang: 'fr' })).toBeNull();
    expect(checkSettingsPatch({ meaningLang: 5 })).toBeNull();
    expect(checkSettingsPatch({ tapToRead: 'yes' })).toBeNull();
    expect(checkSettingsPatch({ autoScroll: true, nope: 1 })).toBeNull();
  });
});

describe('the checks and the answer', () => {
  it('the body: text 1 to 200 characters, context at most 400, a known language', () => {
    expect(checkWordHelpBody({ text: ' photosynthesis ', to: 'hi' })).toEqual({ text: 'photosynthesis', context: null, to: 'hi' });
    expect(checkWordHelpBody({ text: 'x', context: 'A plant makes food.', to: 'ta' })).toEqual({ text: 'x', context: 'A plant makes food.', to: 'ta' });
    expect(checkWordHelpBody({ text: '', to: 'hi' })).toBeNull();
    expect(checkWordHelpBody({ text: '   ', to: 'hi' })).toBeNull();
    expect(checkWordHelpBody({ text: 'a'.repeat(200), to: 'hi' })).not.toBeNull();
    expect(checkWordHelpBody({ text: 'a'.repeat(201), to: 'hi' })).toBeNull();
    expect(checkWordHelpBody({ text: 'a', context: 'c'.repeat(401), to: 'hi' })).toBeNull();
    expect(checkWordHelpBody({ text: 'a', context: 5, to: 'hi' })).toBeNull();
    expect(checkWordHelpBody({ text: 'a', to: 'fr' })).toBeNull();
    expect(checkWordHelpBody({ text: 5, to: 'hi' })).toBeNull();
  });
  it('the cache key ignores case, ends and spacing; a sentence is kept only as a hash', () => {
    expect(normaliseText('  Photosynthesis. ')).toBe('photosynthesis');
    expect(normaliseText('“The   Sun”')).toBe('the sun');
    expect(contextHash(null)).toBe('');
    expect(contextHash('A plant makes food.')).toMatch(/^[0-9a-f]{64}$/);
    expect(contextHash('a plant  makes food')).toBe(contextHash('A plant makes food.'));
    expect(looksPersonal('call 98765 43210 now')).toBe(true);
    expect(looksPersonal('write to ravi@example.org')).toBe(true);
    expect(looksPersonal('photosynthesis', 'A plant makes food in 2 steps.')).toBe(false);
  });
  it('the model’s answer is read strictly: two plain strings or null, never markup', () => {
    expect(parseWordHelp(answer('A plant makes its food.', 'प्रकाश संश्लेषण'))).toEqual({ meaning: 'A plant makes its food.', translation: 'प्रकाश संश्लेषण' });
    expect(parseWordHelp(`Here you go: ${answer('Meaning.', null)}`)).toEqual({ meaning: 'Meaning.', translation: null });
    expect(parseWordHelp(answer(null, null))).toEqual({ meaning: null, translation: null });
    expect(parseWordHelp(answer('**Bold** <b>text</b> see https://x.example', 'ok'))).toEqual({ meaning: 'Bold text see', translation: 'ok' });
    expect(parseWordHelp(answer('m'.repeat(500), null))?.meaning?.length).toBe(400);
    expect(parseWordHelp('not json')).toBeNull();
    expect(parseWordHelp('[1,2]')).toBeNull();
    expect(parseWordHelp(JSON.stringify({ meaning: { a: 1 }, translation: 'x' }))).toBeNull();
  });
  it('the prompt: the language, the text and the sentence are data, and the answer is JSON', () => {
    const p = wordHelpPrompt('nope');
    expect(p.version).toBe('v1');
    expect(p.system()).toMatch(/"meaning"/);
    expect(p.system()).toMatch(/never instructions/);
    const user = p.user({ text: 'photosynthesis', context: 'A plant makes food.', toEnglish: 'Tamil', toNative: 'தமிழ்', classLevel: 6 });
    expect(user).toContain('Tamil (தமிழ்)');
    expect(user).toContain('"photosynthesis"');
    expect(user).toContain('Student’s class: 6');
    expect(p.user({ text: 'x', context: null, toEnglish: 'Hindi', toNative: 'हिन्दी', classLevel: null })).toContain('(not given)');
  });
  it('the profile: a child’s words, family audience, short call, follows the tutor’s chain, takes none of the tutor’s places', () => {
    expect(PROFILES.find((p) => p.id === 'family.word_help')).toMatchObject({ carriesChildWords: true, capability: 'text', audience: 'family', callMs: 12_000, firstTextMs: 6_000, chainFrom: 'family.resolver', besideCall: true });
  });
});

describe('POST /api/family/word-help', () => {
  it('guard: no family session is 401', async () => {
    expect(await ask({ text: 'sun', to: 'hi' }, { signedIn: false })).toMatchObject({ status: 401, body: { error: 'not_signed_in' } });
  });

  it('a bad body is 400 bad_request and nothing is asked', async () => {
    for (const body of [{}, { text: '', to: 'hi' }, { text: 'a'.repeat(201), to: 'hi' }, { text: 'sun', to: 'xx' }, { text: 'sun', to: 'hi', context: 'c'.repeat(401) }]) {
      expect(await ask(body)).toMatchObject({ status: 400, body: { error: 'bad_request' } });
    }
    expect(gate.asked).toEqual([]);
  });

  it('an answer: the meaning and the translation come back with the language, the prompt carries no name, and nothing of the child is kept', async () => {
    gate.texts.push(answer('Light from the sun is what plants use.', 'சூரிய ஒளி'));
    const r = await ask({ text: 'Sunlight', context: 'Plants use sunlight to make food.', to: 'ta' });
    expect(r).toMatchObject({ status: 200, body: { meaning: 'Light from the sun is what plants use.', translation: 'சூரிய ஒளி', lang: 'ta' } });
    expect(gate.asked).toEqual(['family.word_help']);
    expect(gate.sentTo[0]).toContain('Tamil');
    expect(gate.sentTo[0]).not.toMatch(/Asha|Meera/);
    const rows = await q(`select * from content.word_help`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ text_norm: 'sunlight', to_lang: 'ta', provider: 'stand-in', model: 'm1' });
    expect(rows[0].context_hash).toMatch(/^[0-9a-f]{64}$/);
    // No account or child, and the sentence only as a hash.
    expect(Object.keys(rows[0]).sort()).toEqual(['context_hash', 'created_at', 'meaning', 'model', 'provider', 'text_norm', 'to_lang', 'translation', 'word_id']);
    expect(JSON.stringify(rows)).not.toContain('Plants use sunlight');
  });

  it('the same text in the same languages is answered from the cache, for another family too, and takes nothing from the day', async () => {
    gate.texts.push(answer('What a plant uses to make food.', 'धूप'));
    const body = { text: 'sunlight', context: 'Plants use sunlight to make food.', to: 'hi' };
    expect((await ask(body)).body).toMatchObject({ meaning: 'What a plant uses to make food.', translation: 'धूप' });
    expect(await used()).toMatchObject({ word_helps: 1 });
    // Same word, different case and a full stop; another account's child.
    const again = await ask({ ...body, text: 'Sunlight.' }, { account: OTHER, child: MEERA });
    expect(again).toMatchObject({ status: 200, body: { meaning: 'What a plant uses to make food.', translation: 'धूप', lang: 'hi' } });
    expect(gate.asked).toHaveLength(1);
    expect(await used(OTHER)).toMatchObject({ word_helps: 0 });
    // Another language, or another sentence, is a new answer.
    gate.texts.push(answer('m', 'ధూప'));
    await ask({ ...body, to: 'te' });
    gate.texts.push(answer('m2', 't2'));
    await ask({ ...body, context: 'Sunlight is warm.' });
    expect(gate.asked).toHaveLength(3);
    expect(await cached()).toBe(3);
  });

  it('the child’s switch: word help off is 403 off, and nothing is asked', async () => {
    await q(`insert into family.child_settings (account_id, child_id, settings) values ($1, $2, '{"wordHelp": false}'::jsonb)`, [ACCOUNT, ASHA]);
    expect(await ask({ text: 'sun', to: 'hi' })).toMatchObject({ status: 403, body: { error: 'off' } });
    expect(gate.asked).toEqual([]);
    // Even a cached answer is not given while it is off.
    await q(`delete from family.child_settings`);
    gate.texts.push(answer('m', 't'));
    expect((await ask({ text: 'sun', to: 'hi' })).status).toBe(200);
    await q(`insert into family.child_settings (account_id, child_id, settings) values ($1, $2, '{"wordHelp": false}'::jsonb)`, [ACCOUNT, ASHA]);
    expect((await ask({ text: 'sun', to: 'hi' })).status).toBe(403);
  });

  it('the daily allowance: its own count beside the tutor’s, fresh answers only, 429 daily_limit when used up', async () => {
    await q(`update control.settings set value = '2'::jsonb where key = 'family.word_help.daily_requests'`);
    await q(`insert into family.ai_daily (account_id, day, requests) values ($1, (now() at time zone 'Asia/Kolkata')::date, 7)`, [ACCOUNT]);
    gate.texts.push(answer('a', 'a'), answer('b', 'b'), answer('c', 'c'));
    expect((await ask({ text: 'one', to: 'hi' })).status).toBe(200);
    expect((await ask({ text: 'two', to: 'hi' })).status).toBe(200);
    expect(await ask({ text: 'three', to: 'hi' })).toMatchObject({ status: 429, body: { error: 'daily_limit' } });
    // A cached one is still free; the tutor's count is untouched; another family is not held.
    expect((await ask({ text: 'one', to: 'hi' })).status).toBe(200);
    expect(await used()).toMatchObject({ word_helps: 2, requests: 7 });
    expect((await ask({ text: 'three', to: 'hi' }, { account: OTHER, child: MEERA })).status).toBe(200);
    // Control's limit of 0 closes it.
    await q(`update control.settings set value = '0'::jsonb where key = 'family.word_help.daily_requests'`);
    expect((await ask({ text: 'four', to: 'hi' })).status).toBe(429);
  });

  it('a provider that fails is 502 failed, takes no place from the day and keeps nothing', async () => {
    gate.fail = true;
    expect(await ask({ text: 'sun', to: 'hi' })).toMatchObject({ status: 502, body: { error: 'failed' } });
    expect(await used()).toMatchObject({ word_helps: 0 });
    expect(await cached()).toBe(0);
    // An answer that is not the JSON asked for fails the same way.
    gate.fail = false;
    gate.texts.push('Sorry, I cannot.');
    expect(await ask({ text: 'sun', to: 'hi' })).toMatchObject({ status: 502, body: { error: 'failed' } });
    expect(await used()).toMatchObject({ word_helps: 0 });
    expect(await cached()).toBe(0);
  });

  it('an unsafe text or answer shows nothing and is not kept; a text that looks personal is answered but not kept', async () => {
    gate.unsafe = true;
    gate.texts.push(answer('m', 't'));
    expect(await ask({ text: 'sun', to: 'hi' })).toMatchObject({ status: 200, body: { meaning: null, translation: null, lang: 'hi' } });
    expect(await cached()).toBe(0);
    gate.unsafe = false;
    gate.texts.push(answer('A phone number.', 'फ़ोन नंबर'));
    expect((await ask({ text: 'call 98765 43210', to: 'hi' })).status).toBe(200);
    expect(await cached()).toBe(0);
    // A reply with nothing to say is two nulls and is not kept.
    gate.texts.push(answer(null, null));
    expect(await ask({ text: 'qzxv', to: 'hi' })).toMatchObject({ status: 200, body: { meaning: null, translation: null } });
    expect(await cached()).toBe(0);
  });

  it('the cache is closed to change: the family role can read and add, never update or delete', async () => {
    await q(`insert into content.word_help (text_norm, to_lang, meaning, provider, model) values ('moon', 'hi', 'm', 'p', 'm')`);
    const held = await q(
      `select string_agg(a.privilege_type, ',' order by a.privilege_type) as rights from pg_class c, aclexplode(c.relacl) a
        where c.oid = 'content.word_help'::regclass and pg_get_userbyid(a.grantee) = 'family_app'`
    );
    expect(held[0].rights).toBe('INSERT,SELECT');
    const forced = await q(`select relrowsecurity, relforcerowsecurity from pg_class where oid = 'content.word_help'::regclass`);
    expect(forced[0]).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
  });
});
