import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// W18-P3: `tutor.sketch: true` on the understand route. With exactly one PNG or JPEG it reaches the resolver's ask as
// `sketch: true`; with no file, two files, a PDF or a WebP it is refused, and Check my work cannot be combined with it.
// On the real migrations (PGlite) and the real route; the AI platform's calls and the private bucket are stood in for.
// The ask is read where the prompt version builds its text (the prompt module is wrapped to record each ask).

const ai = vi.hoisted(() => ({ asked: [] as { profile: string; images: number }[], asks: [] as { sketch?: boolean; question: string | null }[] }));
vi.mock('@/lib/ai/prompts/family.resolver', async (original) => {
  const m = await original<typeof import('@/lib/ai/prompts/family.resolver')>();
  return {
    ...m,
    resolverPrompt: (...args: Parameters<typeof m.resolverPrompt>) => {
      const p = m.resolverPrompt(...args);
      return { ...p, system: (a: Parameters<typeof p.system>[0]) => (ai.asks.push({ sketch: a.sketch, question: a.question }), p.system(a)) };
    },
  };
});
vi.mock('@/lib/ai/platform', async (original) => ({
  ...(await original<typeof import('@/lib/ai/platform')>()),
  activePromptVersion: async (_db: unknown, profile: string) => (profile === 'family.homework' ? 'v2' : profile === 'family.resolver' ? 'v9' : 'v1'),
  prepareText: async (_db: unknown, _ctx: unknown, profile: string, request: { messages: { content: string; images?: unknown[] }[] }) => {
    const m = request.messages[request.messages.length - 1];
    ai.asked.push({ profile, images: m.images?.length ?? 0 });
    const lines = profile === 'family.homework' ? ['A drawing of a plant cell: a box with a round nucleus and no labels.'] : profile === 'family.resolver' ? [JSON.stringify({ type: 'subject', subject: 'science' })] : ['{}'];
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
const store = vi.hoisted(() => ({ files: new Map<string, Uint8Array>() }));
vi.mock('@/lib/family/tutor', async (original) => ({
  ...(await original<typeof import('@/lib/family/tutor')>()),
  tutorStorage: { get: async (key: string) => store.files.get(key) ?? null },
}));

const ACCOUNT = 'f4300000-0000-4000-8000-0000000000a1';
const CHILD = 'f4300000-0000-4000-8000-0000000000c1';
const CONV = 'f4300000-0000-4000-8000-0000000000d1';
const id = (n: number) => `f4300000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const PDF = new TextEncoder().encode('%PDF-1.4\n%%EOF');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let R: any;
let cookie = '';
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-w18-p3-sketch-route-0123456789';
  await db.pg.exec(`
    update control.settings set value = '[]'::jsonb where key in ('family.open_subjects', 'family.reviewed_only_subjects');
    update control.settings set value = '50'::jsonb where key = 'family.photo_questions_per_day';
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'sketch@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values
      ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'fam-notice-3'), ('${ACCOUNT}', 'photo_input', true, 'parent_tap', 'fam-notice-3');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code, free_subject) values
      ('${CHILD}', '${ACCOUNT}', 'Riya', 7, 'CBSE', 'en', 'en', 'IN-UP', 'science');
    insert into family.tutor_conversations (conversation_id, account_id, child_id, subject) values ('${CONV}', '${ACCOUNT}', '${CHILD}', 'science');
  `);
  const file = async (n: number, bytes: Uint8Array, mime: string, ext: string) => {
    const key = `${ACCOUNT}/${CHILD}/${id(n)}.${ext}`;
    await q(`insert into family.tutor_attachments (attachment_id, conversation_id, account_id, child_id, status, mime, size_bytes, storage_key) values ($1, $2, $3, $4, 'ready', $5, $6, $7)`, [id(n), CONV, ACCOUNT, CHILD, mime, bytes.length, key]);
    store.files.set(key, bytes);
  };
  await file(1, PNG, 'image/png', 'png');
  await file(2, PNG, 'image/png', 'png');
  await file(3, JPEG, 'image/jpeg', 'jpg');
  await file(4, PDF, 'application/pdf', 'pdf');
  await file(5, WEBP, 'image/webp', 'webp');
  await file(6, PNG, 'image/png', 'png');
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
  ai.asks = [];
});

const ask = async (files: string[], tutor: Record<string, unknown> = { sketch: true }, text = 'Here is my drawing.') => {
  const res = await R.understand.POST(
    new NextRequest('http://localhost/api/family/understand', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ kind: 'question', text, tutor: { subject: 'science', files, ...tutor } }) })
  );
  if (res.headers.get('content-type')?.startsWith('application/json')) return { status: res.status, events: [{ json: await res.json() }] as any[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, events: (await res.text()).trim().split('\n').map((l: string) => JSON.parse(l)) as any[] };
};
const resolverAsk = () => ai.asks.at(-1);

describe('tutor.sketch on the understand route', () => {
  it('one PNG: the resolver is asked with sketch: true, and the drawing was read through the vision profile', async () => {
    const { status, events } = await ask([id(1)]);
    expect(status).toBe(200);
    expect(events.some((e) => e.t === 'refused')).toBe(false);
    expect(resolverAsk()?.sketch).toBe(true);
    expect(ai.asked.find((a) => a.profile === 'family.homework')?.images).toBe(1);
    expect(resolverAsk()?.question).toContain('A drawing of a plant cell');
  });

  it('one JPEG is taken too', async () => {
    await ask([id(3)]);
    expect(resolverAsk()?.sketch).toBe(true);
  });

  it('the same photo without the flag is an ordinary question: the ask carries no sketch', async () => {
    const { status } = await ask([id(2)], {});
    expect(status).toBe(200);
    expect(resolverAsk()).toBeDefined();
    expect(resolverAsk()?.sketch).toBeUndefined();
  });

  it('no file, or two files, is a bad request before anything is read or asked', async () => {
    for (const files of [[], [id(1), id(2)]]) {
      const { status, events } = await ask(files);
      expect(status).toBe(400);
      expect(events[0].json).toEqual({ error: 'bad_request' });
    }
    expect(ai.asked).toEqual([]);
  });

  it('a PDF or a WebP is refused in words, with nothing sent to a provider', async () => {
    for (const file of [id(4), id(5)]) {
      const { events } = await ask([file]);
      expect(events.find((e) => e.t === 'refused')?.message).toBe('A drawing is sent as one picture (PNG or JPEG).');
    }
    expect(ai.asked).toEqual([]);
    expect(ai.asks).toEqual([]);
  });

  it('cannot be combined with Check my work', async () => {
    const { status } = await ask([id(6)], { sketch: true, mode: 'check' });
    expect(status).toBe(400);
    expect(ai.asks).toEqual([]);
  });
});
