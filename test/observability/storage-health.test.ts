import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// File storage's health (C236): from 7 Oct production's server key belonged to the other Supabase project, every
// upload and login invite failed, and no screen said so. The four answers -- ok, missing, other_project, refused --
// through the real key check (src/lib/auth/env.ts), the real listing (src/lib/storage/supabase-file-storage.ts) and
// the real endpoint, with only Supabase's client stubbed. No part of a key reaches an answer, a log line or an error.

const stub = vi.hoisted(() => ({
  listed: 0,
  // What the store answers to the listing: a list, an error (quoting the key, as an error might), or nothing at all.
  answer: 'ok' as 'ok' | 'error' | 'never' | 'throws',
  key: '',
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        list: async (_folder: string, opts: { limit: number }) => {
          stub.listed += 1;
          expect(opts.limit).toBe(1);
          if (stub.answer === 'never') return new Promise(() => undefined);
          if (stub.answer === 'throws') throw new Error(`fetch failed for ${stub.key}`);
          if (stub.answer === 'error') return { data: null, error: { message: `Invalid Compact JWS: ${stub.key}` } };
          return { data: [], error: null };
        },
      }),
    },
  }),
}));
// The endpoint's other two checks answer fine; only storage is under test here.
vi.mock('@/lib/auth/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/db')>()),
  withBackendConnection: async () => undefined,
  withPlatformService: async () => 'ok',
}));

import { GET } from '@/app/api/health/route';
import { serviceRoleKeyShape, supabaseProjectRef } from '@/lib/auth/env';
import { probeFileStorage } from '@/lib/storage/supabase-file-storage';
import { checkStorage, forgetStorageHealth, storageHealth, STORAGE_CHECK_KEEP_MS } from '@/lib/observability/storage-health';
import { showsStorageAlert, StorageAlert } from '@/components/app-shell/StorageAlert';

const THIS = 'thisprojectref000000';
const OTHER = 'otherprojectref00000';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const SIGNATURE = 'c236SignatureThatMustNeverBeShown0123456789';
const jwt = (claims: Record<string, unknown>) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', iat: 1, exp: 2, ...claims })}.${SIGNATURE}`;
const SERVICE_THIS = jwt({ ref: THIS, role: 'service_role' });
const SERVICE_OTHER = jwt({ ref: OTHER, role: 'service_role' });
const ANON_THIS = jwt({ ref: THIS, role: 'anon' });
const SECRET_NEW = 'sb_secret_c236NewStyleSecretThatMustNeverBeShown';

const lines: string[] = [];
const setKey = (key: string | undefined) => {
  stub.key = key ?? '';
  if (key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = key;
};
const health = async () => {
  forgetStorageHealth();
  const res = await GET(new NextRequest('https://www.netcyberai.test/api/health'));
  return { status: res.status, text: await res.text() };
};
// Everything a key could leak into: its whole text, each of its parts, and the project it names.
const pieces = (key: string) => [key, ...key.split('.').filter((p) => p.length > 8), OTHER];

const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${THIS}.supabase.co`;
  stub.listed = 0;
  stub.answer = 'ok';
  forgetStorageHealth();
  lines.length = 0;
  for (const m of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(' ')));
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
  setKey(saved.key);
});

describe('the four answers', () => {
  it('missing: no key, and the store is not asked', async () => {
    setKey(undefined);
    expect(serviceRoleKeyShape()).toBe('missing');
    expect(await storageHealth()).toBe('missing');
    setKey('   ');
    forgetStorageHealth();
    expect(await storageHealth()).toBe('missing');
    expect(stub.listed).toBe(0);
  });

  it('other_project: a key whose ref is another project, read from the key alone (the store is not asked)', async () => {
    setKey(SERVICE_OTHER);
    expect(serviceRoleKeyShape()).toBe('other_project');
    expect(await storageHealth()).toBe('other_project');
    expect(stub.listed).toBe(0);
  });

  it('refused: the store refuses the listing, throws, or does not answer in time; or the key is not a server key', async () => {
    setKey(SERVICE_THIS);
    stub.answer = 'error';
    expect(await storageHealth()).toBe('refused');
    stub.answer = 'throws';
    forgetStorageHealth();
    expect(await storageHealth()).toBe('refused');
    stub.answer = 'never';
    const probe = { keyShape: serviceRoleKeyShape, list: probeFileStorage, now: () => 0, timeoutMs: 30 };
    expect(await checkStorage(probe)).toBe('refused');
    expect(stub.listed).toBe(3);
    // A visitor's key in the server key's place: the store would show it nothing, so it is refused without asking.
    stub.listed = 0;
    for (const key of [ANON_THIS, 'sb_publishable_c236VisitorKey']) {
      setKey(key);
      forgetStorageHealth();
      expect(await storageHealth(), key.slice(0, 8)).toBe('refused');
    }
    expect(stub.listed).toBe(0);
  });

  it('ok: a server key for this project that the store takes; a newer sb_secret_ key is tried against the store', async () => {
    setKey(SERVICE_THIS);
    expect(serviceRoleKeyShape()).toBe('to_try');
    expect(await storageHealth()).toBe('ok');
    setKey(SECRET_NEW);
    forgetStorageHealth();
    expect(serviceRoleKeyShape()).toBe('to_try');
    expect(await storageHealth()).toBe('ok');
    expect(stub.listed).toBe(2);
  });

  it('a project the address does not name (a custom domain, a local store) leaves the answer to the store', () => {
    expect(supabaseProjectRef(`https://${THIS}.supabase.co`)).toBe(THIS);
    expect(supabaseProjectRef('http://127.0.0.1:54321')).toBeNull();
    expect(supabaseProjectRef('not an address')).toBeNull();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.school.example';
    setKey(SERVICE_OTHER);
    expect(serviceRoleKeyShape()).toBe('to_try');
  });
});

describe('asked once in 5 minutes', () => {
  it('keeps one answer for 5 minutes, then asks again; callers at the same moment share one listing', async () => {
    setKey(SERVICE_THIS);
    let now = 1_000_000;
    const probe = { keyShape: serviceRoleKeyShape, list: probeFileStorage, now: () => now };
    const [a, b] = await Promise.all([storageHealth(probe), storageHealth(probe)]);
    expect([a, b]).toEqual(['ok', 'ok']);
    expect(stub.listed).toBe(1);
    now += STORAGE_CHECK_KEEP_MS - 1;
    stub.answer = 'error';
    expect(await storageHealth(probe)).toBe('ok');
    expect(stub.listed).toBe(1);
    now += 1;
    expect(await storageHealth(probe)).toBe('refused');
    expect(stub.listed).toBe(2);
    // Another probe is never given this one's kept answer: it asks for itself.
    const other = { keyShape: () => 'missing' as const, list: probeFileStorage, now: () => now };
    expect(await storageHealth(other)).toBe('missing');
  });
});

describe('no key material anywhere', () => {
  it('in the endpoint’s answer and its log lines, for every state, even when the store quotes the key back', async () => {
    const cases: [string | undefined, typeof stub.answer, string][] = [
      [undefined, 'ok', 'missing'],
      [SERVICE_OTHER, 'ok', 'other_project'],
      [SERVICE_THIS, 'error', 'refused'],
      [SERVICE_THIS, 'throws', 'refused'],
      [ANON_THIS, 'ok', 'refused'],
      [SECRET_NEW, 'error', 'refused'],
      [SERVICE_THIS, 'ok', 'ok'],
      [SECRET_NEW, 'ok', 'ok'],
    ];
    for (const [key, answer, state] of cases) {
      setKey(key);
      stub.answer = answer;
      lines.length = 0;
      const r = await health();
      expect(r.status, state).toBe(200);
      const body = JSON.parse(r.text);
      expect(body.checks.storage, state).toBe(state);
      expect(body.status, state).toBe(state === 'ok' ? 'ok' : 'degraded');
      for (const said of [r.text, ...lines]) for (const piece of key ? pieces(key) : []) expect(said, `${state}: ${said}`).not.toContain(piece);
      if (state !== 'ok') expect(lines.join('\n'), state).toContain(`"storage":"${state}"`);
    }
  });

  it('in an error the listing throws, whether the store answered with one or its client threw one', async () => {
    setKey(SERVICE_THIS);
    for (const answer of ['error', 'throws'] as const) {
      stub.answer = answer;
      const err = await probeFileStorage().then(() => null, (e: Error) => e);
      expect(err, answer).toBeInstanceOf(Error);
      for (const piece of pieces(SERVICE_THIS)) expect(`${err!.message} ${err!.stack}`, answer).not.toContain(piece);
    }
  });

  it('in the red line, which names the setting and what is wrong, never its value', () => {
    setKey(SERVICE_OTHER);
    for (const scope of ['control', 'school'] as const) {
      for (const state of ['missing', 'other_project', 'refused'] as const) {
        for (const lang of ['en', 'hi'] as const) {
          const html = renderToStaticMarkup(createElement(StorageAlert, { state, scope, lang }));
          expect(html).toContain('role="alert"');
          expect(html).toContain(`data-storage-state="${state}"`);
          expect(html).toContain('SUPABASE_SERVICE_ROLE_KEY');
          for (const piece of pieces(SERVICE_OTHER)) expect(html).not.toContain(piece);
        }
      }
    }
  });
});

describe('who sees the red line in a school', () => {
  it('the principal and the school admin; no other role', () => {
    for (const role of ['principal', 'school_admin']) expect(showsStorageAlert(role), role).toBe(true);
    for (const role of ['teacher', 'accountant', 'academic_coordinator', 'parent', 'student', 'super_admin']) expect(showsStorageAlert(role), role).toBe(false);
  });
});
