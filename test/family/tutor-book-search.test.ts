import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// C505: a question a Class 10 CBSE child types with no chapter open is answered from their own published book when the
// library (content.chapter_contents) has nothing for it; when the library has a passage, the library's is used and the
// book is not searched. On the real migrations (PGlite), the real route and the real resolver; the AI platform's calls
// are stood in for. Made-up names only.

const ai = vi.hoisted(() => ({ asked: [] as { profile: string; system: string }[] }));
vi.mock('@/lib/ai/platform', async (original) => ({
  ...(await original<typeof import('@/lib/ai/platform')>()),
  activePromptVersion: async (_db: unknown, profile: string) => (profile === 'family.resolver' ? 'v9' : 'v1'),
  prepareText: async (_db: unknown, _ctx: unknown, profile: string, request: { system: string }) => {
    ai.asked.push({ profile, system: request.system });
    const lines = profile === 'family.resolver' ? [JSON.stringify({ type: 'subject', subject: 'science' })] : ['{}'];
    return {
      ok: true,
      text: {
        send: async (onDelta?: (t: string) => void) => {
          for (const l of lines) onDelta?.(`${l}\n`);
          return { result: { ok: true, text: lines.join('\n'), tokensIn: 1, tokensOut: 1, provider: 'stand-in', model: 'm' }, record: async () => {} };
        },
      },
    };
  },
  dailyRequestsLeft: async () => 100,
  prepareModeration: async () => ({ ok: true, moderation: { check: async () => ({ safe: true, categories: [] }), record: async () => {} } }),
}));

const ACCOUNT = 'f5050000-0000-4000-8000-0000000000a1';
const CHILD = 'f5050000-0000-4000-8000-0000000000c1';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let R: any;
let cookie = '';

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-c505-tutor-book-search-0123456789';
  await db.pg.exec(`
    update control.settings set value = '[]'::jsonb where key in ('family.open_subjects', 'family.reviewed_only_subjects');
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'book-search@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'fam-notice-3');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code, free_subject) values
      ('${CHILD}', '${ACCOUNT}', 'Riya', 10, 'CBSE', 'en', 'en', 'IN-UP', 'science');
  `);
  const { signFamilySession } = await import('@/lib/family/session');
  cookie = `ncf_session=${await signFamilySession({ accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' })}; ncf_child=${CHILD}`;
  R = { understand: await import('@/app/api/family/understand/route') };
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});
beforeEach(() => {
  ai.asked = [];
});

const ask = async (text: string) => {
  const res = await R.understand.POST(
    new NextRequest('http://localhost/api/family/understand', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ kind: 'question', text, tutor: { subject: 'science' } }) })
  );
  await res.text();
  return ai.asked.find((a) => a.profile === 'family.resolver')?.system ?? '';
};

describe('a typed question with no chapter open (C505)', () => {
  it('is taught from the child’s own book when the library has nothing, named by chapter and topic', async () => {
    const system = await ask('Why is the sky blue?');
    expect(system).toContain('[1] Chapter 10, The Human Eye and the Colourful World, topic: Scattering of light: the Tyndall effect and the blue sky: ');
    expect(system).toContain('air molecules scatter blue more than red');
    expect(system).toContain('Write exactly ONE sources block naming the chapter');
  });

  it('is a general answer when neither the library nor the book has it', async () => {
    const system = await ask('Who won the cricket world cup in 2011?');
    expect(system).not.toContain('[1] ');
    expect(system).toContain('Write no sources block');
  });

  it('uses the library’s passage, not the book, when the library has one', async () => {
    await db.pg.query(
      `insert into content.chapter_contents (chapter_key, version_no, subject, board_id, class_level, title_en, title_hi, blocks, status, source, created_by, reviewed_by, reviewed_at, published_by, published_at)
       values ('cbse.c10.science.sky-colour', 1, 'science', 'CBSE', 10, 'Colour of the Sky', 'आकाश का रंग', $1::jsonb, 'published', 'studio', $2, $2, now(), $2, now())`,
      [
        JSON.stringify({ en: [{ type: 'explanation', title: 'Blue sky', idea: 'The sky is blue because the air scatters blue light the most.', paragraphs: [], example: 'A clear afternoon sky.', steps: [], terms: [] }], hi: [] }),
        'f5050000-0000-4000-8000-0000000000f1',
      ]
    );
    const system = await ask('Why is the sky blue?');
    expect(system).toContain('[1] Colour of the Sky');
    expect(system).not.toContain('Chapter 10, The Human Eye');
  });
});
