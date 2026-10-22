import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// W2 (C314): every live answer for a child passes the safety check. A typed question is checked before it is sent,
// each block before it is shown; switched off or unable to check, nothing is answered. The AI and the check are
// replaced here, so what they were given is captured. Made-up people and words only.

const ai = vi.hoisted(() => ({
  lines: [] as string[],
  sent: 0,
  mode: 'safe' as 'safe' | 'off' | 'failed',
  // Words that make the check say "unsafe" when it sees them.
  unsafeWhen: null as string | null,
  checked: [] as { user: string; assistant?: string }[],
}));
vi.mock('@/lib/ai/platform', async (original) => ({
  ...(await original<typeof import('@/lib/ai/platform')>()),
  activePromptVersion: async () => 'v1',
  prepareText: async () => {
    const lines = [...ai.lines];
    return {
      ok: true,
      text: {
        send: async (onDelta: (t: string) => void) => {
          ai.sent += 1;
          for (const l of lines) onDelta(`${l}\n`);
          return { result: { ok: true, text: lines.join('\n'), tokensIn: 10, tokensOut: 20, provider: 'workers-ai', model: 'test-model' }, record: async () => {} };
        },
      },
    };
  },
  prepareModeration: async () =>
    ai.mode === 'off'
      ? { ok: false, reason: 'not_switched_on' }
      : {
          ok: true,
          moderation: {
            check: async (turns: { user: string; assistant?: string }) => {
              ai.checked.push(turns);
              if (ai.mode === 'failed') return null;
              const words = `${turns.user}\n${turns.assistant ?? ''}`;
              return ai.unsafeWhen && words.includes(ai.unsafeWhen) ? { safe: false, categories: ['S1'] } : { safe: true, categories: [] };
            },
            record: async () => {},
          },
        },
}));

const item = (id: string) => ({ id, question: `Question ${id}?`, options: ['10', '12', '14', '16'], answer: 1, hint: 'Think of pairs.', why: 'Because 6 + 6 = 12.', wrong: ['a', '', 'b', 'c'] });
const BLOCKS = [
  { type: 'explanation', title: 'Magnets', idea: 'A magnet pulls iron.', example: 'A fridge magnet holds a note.', steps: ['Bring it close', 'Watch'], terms: [{ en: 'pole', local: 'dhruv' }] },
  { type: 'check', items: [item('c1'), item('c2')] },
  { type: 'practice', items: [item('p1')] },
].map((b) => JSON.stringify(b));
const named = (subject: string) => JSON.stringify({ type: 'subject', subject });

const ACCOUNT = 'fd000000-0000-4000-8000-0000000000a1';
const CHILD = 'fd000000-0000-4000-8000-0000000000a2';
const VERSION = 'fd000000-0000-4000-8000-0000000000b1';
const TOPIC = 'w2t.c6.science.ch04.t01';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let R: any;
let jar: Record<string, string>;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-w2-moderation-tests-0123456789';
  await db.pg.exec(`
    -- Live answers are under test here, so no subject shows checked explanations only.
    update control.settings set value = '[]'::jsonb where key in ('family.open_subjects', 'family.reviewed_only_subjects');
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'safety@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ('${CHILD}', '${ACCOUNT}', 'Meena', 6, 'CBSE', 'en', 'en', 'IN-UP');
    insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, audience, import_source, import_ref, approved_by, approved_at)
      values ('${VERSION}', 'CBSE', 6, 'science', '2099-00', 1, 'published', 'everyone', 'repository', 'test', 'fd000000-0000-4000-8000-0000000000f1', now());
    insert into content.chapters (chapter_id, version_id, chapter_key, position, title_en, source_url, source_page, checked_on)
      values ('fd000000-0000-4000-8000-0000000000d1', '${VERSION}', 'w2t.c6.science.ch04', 1, 'Exploring Magnets', 'https://ncert.nic.in/', '1', '2026-10-22');
    insert into content.topics (version_id, chapter_id, topic_key, position, title_en, source_url, source_page, checked_on)
      values ('${VERSION}', 'fd000000-0000-4000-8000-0000000000d1', '${TOPIC}', 1, 'Magnetic and non-magnetic materials', 'https://ncert.nic.in/', '1', '2026-10-22');
  `);
  const { signFamilySession } = await import('@/lib/family/session');
  jar = { ncf_session: await signFamilySession({ accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' }), ncf_child: CHILD };
  R = { understand: await import('@/app/api/family/understand/route'), auth: await import('@/lib/auth/db') };
}, 90_000);
afterAll(async () => {
  await R?.auth.endPool();
  await db?.stop();
});
beforeEach(async () => {
  ai.sent = 0;
  ai.mode = 'safe';
  ai.unsafeWhen = null;
  ai.checked = [];
  await db.pg.query(`delete from content.responses`);
});

const ask = async (body: unknown) => {
  const res = await R.understand.POST(new NextRequest('http://localhost/api/family/understand', { method: 'POST', headers: { 'content-type': 'application/json', cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: JSON.stringify(body) }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await res.text()).trim().split('\n').map((l: string) => JSON.parse(l)) as any[];
};
const kept = async () => (await db.pg.query(`select count(*)::int n from content.responses`)).rows[0].n;

describe('the safety check on live answers (C314)', () => {
  it('a safe answer: the question is checked before it is sent, and every block before it is shown', async () => {
    ai.lines = [named('science'), ...BLOCKS];
    const ev = await ask({ kind: 'question', text: 'Meena asks: why does a magnet pull a pin?', subject: null });
    expect(ev.filter((e) => e.t === 'block')).toHaveLength(3);
    expect(ai.checked[0]).toEqual({ user: 'Meena asks: why does a magnet pull a pin?' });
    expect(ai.checked.slice(1).map((c) => c.user)).toEqual(Array(3).fill('Meena asks: why does a magnet pull a pin?'));
    expect(ai.checked[1].assistant).toContain('A magnet pulls iron.');
  });

  it('a question found unsafe is never sent to the model, and the child is pointed to a trusted adult', async () => {
    ai.lines = [named('science'), ...BLOCKS];
    ai.unsafeWhen = 'hurt';
    const ev = await ask({ kind: 'question', text: 'How do I hurt someone with a magnet?', subject: null });
    expect(ev).toEqual([{ t: 'refused', reason: 'unsafe', message: 'This cannot be answered here. If something is worrying you, talk to a parent or a teacher.' }]);
    expect(ai.sent).toBe(0);
  });

  it('a block found unsafe stops the answer there: what passed stays, nothing more is shown, nothing is kept', async () => {
    ai.lines = BLOCKS;
    ai.unsafeWhen = 'Question c1?';
    const ev = await ask({ kind: 'topic', key: TOPIC });
    expect(ev.filter((e) => e.t === 'block').map((e) => e.block.type)).toEqual(['explanation']);
    expect(ev.at(-1)).toMatchObject({ t: 'refused', reason: 'unsafe' });
    expect(ai.checked[0].user).toBe('Explain "Magnetic and non-magnetic materials" to a Class 6 student.');
    expect(await kept()).toBe(0);
  });

  it('switched off: nothing is asked of the model, and the child is told why', async () => {
    ai.lines = BLOCKS;
    ai.mode = 'off';
    expect(await ask({ kind: 'topic', key: TOPIC })).toEqual([{ t: 'refused', reason: 'not_switched_on', message: 'Answers made by AI are paused until our safety check is switched on. Try again later.' }]);
    expect(ai.sent).toBe(0);
  });

  it('a check that cannot be made shows nothing', async () => {
    ai.lines = BLOCKS;
    ai.mode = 'failed';
    const ev = await ask({ kind: 'topic', key: TOPIC });
    expect(ev.filter((e) => e.t === 'block')).toEqual([]);
    expect(ev.at(-1)).toMatchObject({ t: 'refused', reason: 'failed', message: 'We could not check this answer for safety just now, so it is not shown. Try again in a moment.' });
    expect(await kept()).toBe(0);
  });

  it('a library response, checked when it was made, is served without a new check', async () => {
    ai.lines = BLOCKS;
    await ask({ kind: 'topic', key: TOPIC });
    expect(await kept()).toBe(1);
    ai.checked = [];
    ai.mode = 'off';
    const ev = await ask({ kind: 'topic', key: TOPIC });
    expect(ev[0]).toMatchObject({ t: 'meta', cached: true });
    expect(ai.checked).toEqual([]);
  });
});
