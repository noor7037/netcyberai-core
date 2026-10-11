import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// GET and POST /api/auth/language (C134), with the session and the two
// account functions stood in: what is saved, what the cookie says, and
// what happens when it cannot be saved.

const USER = '00000000-0000-4000-8000-00000000a001';
const state = vi.hoisted(() => ({
  claims: null as null | { sub: string; impersonation?: { impersonationId: string; actorUserId: string } | null },
  saved: null as string | null,
  writes: 0,
  dbDown: false,
}));

vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/db', () => ({
  ownLanguage: async () => {
    if (state.dbDown) throw new Error('db');
    return state.saved;
  },
  setOwnLanguage: async (_user: string, lang: string) => {
    if (state.dbDown) throw new Error('db');
    state.writes += 1;
    state.saved = lang;
  },
}));

import { GET, POST } from '@/app/api/auth/language/route';
import { POST as logout } from '@/app/api/auth/logout/route';

const get = () => GET(new NextRequest('http://localhost/api/auth/language'));
const post = (body: unknown) => POST(new NextRequest('http://localhost/api/auth/language', { method: 'POST', body: JSON.stringify(body) }));
const cookie = (res: Response) => res.headers.get('set-cookie') ?? '';

beforeEach(() => {
  state.claims = { sub: USER };
  state.saved = null;
  state.writes = 0;
  state.dbDown = false;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('asking the account (GET)', () => {
  it('signed out: refused, no cookie', async () => {
    state.claims = null;
    const res = await get();
    expect(res.status).toBe(401);
    expect(cookie(res)).toBe('');
  });

  it('never chose: English, remembered for this person only, never cached', async () => {
    const res = await get();
    expect(await res.json()).toEqual({ lang: 'en' });
    expect(cookie(res)).toContain(`nca_lang=${USER}.en`);
    expect(cookie(res)).toMatch(/HttpOnly/i);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('chose Hindi on another device: Hindi here too', async () => {
    state.saved = 'hi';
    const res = await get();
    expect(await res.json()).toEqual({ lang: 'hi' });
    expect(cookie(res)).toContain(`nca_lang=${USER}.hi`);
  });

  it('the database cannot say: English for now, and nothing is remembered', async () => {
    state.dbDown = true;
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lang: 'en' });
    expect(cookie(res)).toBe('');
  });
});

describe('the switch (POST)', () => {
  it('saves the choice on the account and in the cookie', async () => {
    const res = await post({ lang: 'hi' });
    expect(res.status).toBe(200);
    expect(state.saved).toBe('hi');
    expect(cookie(res)).toContain(`nca_lang=${USER}.hi`);
  });

  it('refuses a language it does not have, in plain words, and saves nothing', async () => {
    for (const body of [{ lang: 'fr' }, { lang: 5 }, {}, null, 'hi']) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: 'choose_one', error: 'Choose the language from the list.' });
      expect(cookie(res)).toBe('');
    }
    expect(state.writes).toBe(0);
  });

  it('signed out: refused', async () => {
    state.claims = null;
    expect((await post({ lang: 'hi' })).status).toBe(401);
    expect(state.writes).toBe(0);
  });

  it('during an impersonation the person’s own setting is not touched; only this browser changes', async () => {
    state.claims = { sub: USER, impersonation: { impersonationId: 'i', actorUserId: 'founder' } };
    const res = await post({ lang: 'hi' });
    expect(res.status).toBe(200);
    expect(state.writes).toBe(0);
    expect(state.saved).toBeNull();
    expect(cookie(res)).toContain(`nca_lang=${USER}.hi`);
  });

  it('cannot be saved: says so with the catalogue’s rule, and the cookie does not claim it was', async () => {
    state.dbDown = true;
    const res = await post({ lang: 'hi' });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'not_saved' });
    expect(cookie(res)).toBe('');
  });
});

describe('signing out', () => {
  it('takes the language cookie with it', async () => {
    state.claims = null;
    const res = await logout(new NextRequest('http://localhost/api/auth/logout', { method: 'POST' }));
    expect(cookie(res)).toMatch(/nca_lang=;/);
  });
});
