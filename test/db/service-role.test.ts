import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// service_role holds nothing in schema public (C167). The app uses the
// server's secret key for two things only: Supabase Auth's admin calls and
// file storage. These tests hold that: (1) every invite, account and file
// function works against a client that offers ONLY `auth.admin` and
// `storage`, so none of them reads or writes a table through that key;
// (2) no file in src/ makes a table or function call through supabase-js at
// all; (3) on the database, the role is refused everything in public.

// A client with nothing but the two APIs. Reaching for anything else throws.
const calls: string[] = [];
const ok = <T>(data: T) => Promise.resolve({ data, error: null });
const bucket = (name: string) => ({
  upload: (key: string) => (calls.push(`storage.upload ${name}/${key}`), ok({ path: key })),
  createSignedUrl: (key: string, ttl: number) => (calls.push(`storage.sign ${name}/${key} ${ttl}`), ok({ signedUrl: `https://files.invalid/${key}?t=1` })),
  remove: (keys: string[]) => (calls.push(`storage.remove ${name}/${keys.join(',')}`), ok([])),
});
const onlyAuthAdminAndStorage = () =>
  new Proxy(
    {
      storage: { from: bucket },
      auth: {
        admin: {
          inviteUserByEmail: (email: string) => (calls.push(`auth.invite ${email}`), ok({ user: { id: 'u-1' } })),
          generateLink: (a: { type: string; email: string }) => (calls.push(`auth.link ${a.type} ${a.email}`), ok({ properties: { hashed_token: 'hashed-token-for-the-test', email_otp: '123456' } })),
          updateUserById: (id: string) => (calls.push(`auth.update ${id}`), ok({ user: { id } })),
          mfa: {
            listFactors: (a: { userId: string }) => (calls.push(`auth.factors ${a.userId}`), ok({ factors: [{ id: 'f-1', factor_type: 'totp', status: 'verified' }] })),
            deleteFactor: (a: { id: string }) => (calls.push(`auth.factor.delete ${a.id}`), ok({ id: a.id })),
          },
        },
      },
    } as Record<string, unknown>,
    {
      get(target, prop: string) {
        if (prop in target) return target[prop];
        throw new Error(`the service key was used for .${prop}: only auth.admin and storage are allowed`);
      },
    }
  );
vi.mock('@/lib/auth/supabase', () => ({ newAuthAdminClient: () => onlyAuthAdminAndStorage(), newAuthClient: () => { throw new Error('not used here'); } }));
vi.mock('@/lib/auth/env', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/env')>()), hasServiceRoleKey: () => true }));

describe('everything the app does with the service key, on a client that has only auth.admin and storage', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('files: put, signed link and remove', async () => {
    const { supabaseFileStorage } = await import('@/lib/storage/supabase-file-storage');
    await supabaseFileStorage.put('school-1/homework/a.pdf', new Uint8Array([1, 2, 3]), 'application/pdf');
    expect(await supabaseFileStorage.signedUrl('school-1/homework/a.pdf', 300)).toBe('https://files.invalid/school-1/homework/a.pdf?t=1');
    await supabaseFileStorage.remove('school-1/homework/a.pdf');
    expect(calls).toEqual(['storage.upload documents/school-1/homework/a.pdf', 'storage.sign documents/school-1/homework/a.pdf 300', 'storage.remove documents/school-1/homework/a.pdf']);
  });

  it('captured documents: upload, signed link and delete', async () => {
    const { uploadDocument, signedDocumentUrl, deleteDocument } = await import('@/lib/capture/storage');
    await uploadDocument('school-1/documents/s/tc/x.pdf', Buffer.from([1]), 'application/pdf');
    expect(await signedDocumentUrl('school-1/documents/s/tc/x.pdf')).toContain('https://files.invalid/');
    await deleteDocument('school-1/documents/s/tc/x.pdf');
    expect(calls.map((c) => c.split(' ')[0])).toEqual(['storage.upload', 'storage.sign', 'storage.remove']);
  });

  it('invites and the founder’s account tools', async () => {
    const actions = await import('@/lib/auth/admin-actions');
    expect(await actions.inviteUserToSchool('new.admin@school.invalid', 'https://app.invalid/welcome', 'New Admin')).toEqual({ userId: 'u-1' });
    expect(await actions.createOneTimeLink('p@school.invalid', 'signin', 'https://app.invalid')).toMatchObject({ link: expect.any(String) });
    expect(await actions.hasConfirmedAuthenticator('u-1')).toBe(true);
    // (Setting a temporary password and removing an authenticator make the same kind of auth.admin call, then sign the
    // person out through the app's own database path, which needs a database; the file check below covers their calls.)
    expect(calls.every((c) => c.startsWith('auth.'))).toBe(true);
    expect(calls).toContain('auth.invite new.admin@school.invalid');
  });

  it('the stand-in really refuses anything else, so the tests above mean something', () => {
    const client = onlyAuthAdminAndStorage() as { from?: unknown; rpc?: unknown };
    expect(() => client.from).toThrow(/only auth.admin and storage/);
    expect(() => client.rpc).toThrow(/only auth.admin and storage/);
  });
});

describe('no table or function is reached through supabase-js anywhere in src/', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(full);
    }
  };
  walk(path.resolve(__dirname, '../../src'));

  it('no .rpc(), no .schema(), and .from(\'…\') only on .storage', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      text.split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line)) return;
        const tableCall = /\.from\(\s*['"`A-Z]/.test(line) && !/\.storage\s*\.from\(/.test(line) && !/(Array|Buffer|Object|Uint8Array|Date)\.from\(/.test(line);
        if (tableCall || /\.(rpc|schema)\(\s*['"`]/.test(line)) offenders.push(`${path.relative(path.resolve(__dirname, '../..'), f)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('the files that hold the service key use it as .auth.admin or .storage and nothing else', () => {
    const holders = files.filter((f) => /newAuthAdminClient\(\)/.test(readFileSync(f, 'utf8')) && !f.endsWith(path.join('auth', 'supabase.ts')));
    expect(holders.length).toBe(4);
    for (const f of holders) {
      const uses = [...readFileSync(f, 'utf8').replace(/^\s*(\/\/|\*).*$/gm, '').matchAll(/(?<![.\w])(?:admin\(\)|client\(\)|client|admin|newAuthAdminClient\(\))\s*\.\s*([a-zA-Z]+)\b/g)].map((m) => m[1]).filter((u) => u !== 'query');
      expect(uses.length, f).toBeGreaterThan(0);
      expect(uses.filter((u) => u !== 'auth' && u !== 'storage'), f).toEqual([]);
    }
  });
});

describe('on the database, as service_role', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asServiceRole = (fn: (c: any) => Promise<any>): Promise<any> =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.pg.transaction(async (c: any) => {
      await c.query('set local role service_role');
      return fn(c);
    });
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  it('every table in public is refused: read, write, delete and truncate', async () => {
    const tables = (await db.pg.query(`select relname from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p') order by 1`)).rows.map((r: { relname: string }) => r.relname);
    expect(tables.length).toBeGreaterThan(80);
    for (const t of tables) {
      for (const sql of [`select 1 from ${t} limit 1`, `delete from ${t}`, `truncate ${t} cascade`]) await expect(asServiceRole((c) => c.query(sql)), `${sql}`).rejects.toThrow(/permission denied/);
    }
  });

  it('no function and no sequence in public can be used', async () => {
    await expect(asServiceRole((c) => c.query(`select fee_billing_students()`))).rejects.toThrow(/permission denied/);
    await expect(asServiceRole((c) => c.query(`select fees_nightly_enqueue()`))).rejects.toThrow(/permission denied/);
    const sequences = (await db.pg.query(`select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'S'`)).rows.map((r: { relname: string }) => r.relname);
    for (const s of sequences) await expect(asServiceRole((c) => c.query(`select nextval('${s}')`)), s).rejects.toThrow(/permission denied/);
  });

  it('the migration touches schema public only', () => {
    const dir = path.resolve(__dirname, '../../supabase/migrations');
    const sql = readFileSync(path.join(dir, readdirSync(dir).find((f) => f.endsWith('_service_role_lockdown.sql'))!), 'utf8').replace(/--.*$/gm, '');
    expect(sql).not.toMatch(/\b(auth|storage|vault|extensions)\s*\./);
    expect(sql.match(/in schema (\w+)/g)?.every((m) => m === 'in schema public')).toBe(true);
  });
});
