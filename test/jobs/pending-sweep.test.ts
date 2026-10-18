import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// The hourly sweep of record documents sent and never confirmed (C237), on the whole schema (every migration
// replayed on PGlite) with the file store in memory. The acceptance test: a 16-minute-old pending file goes; a
// 5-minute-old one stays; a kept file is never touched; a second run changes nothing. Proven through the database's
// own enqueue function and the deployed runner (runDueJobs) with its production handlers; only the platform
// connection and the file store are replaced. Every id is made up.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const files = vi.hoisted(() => ({ store: null as unknown }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withPlatformService: (fn: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.pg.transaction(async (tx: any) => {
      await tx.query('set local role nca_super');
      return fn(tx);
    }),
}));
// File storage's health (C236) answers ok, as a deployment with a working key would; one test turns it off.
const health = vi.hoisted(() => ({ state: 'ok' }));
vi.mock('@/lib/observability/storage-health', () => ({ storageHealth: async () => health.state }));
vi.mock('@/lib/storage/supabase-file-storage', async () => {
  const { MemoryFileStorage: Memory } = await import('@/lib/storage/file-storage');
  files.store = new Memory();
  return { supabaseFileStorage: files.store, probeFileStorage: async () => undefined };
});

import { PENDING_DEAD_SECONDS } from '@/lib/contracts/record-documents';
import { withPlatformService } from '@/lib/auth/db';
import { recordPendingFolder } from '@/lib/documents/record-documents';
import { productionHandlers, runDueJobs } from '@/lib/jobs/handlers';
import { PENDING_SWEEP_JOB, pendingSweepHandler } from '@/lib/jobs/pending-sweep';
import type { ClaimedJob, Sql } from '@/lib/jobs/types';
import { MemoryFileStorage } from '@/lib/storage/file-storage';

const u = (n: number) => `c2370000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const MIN = 60_000;
const store = () => files.store as MemoryFileStorage;
const platform = withPlatformService as unknown as <T>(fn: (c: Sql) => Promise<T>) => Promise<T>;

// A file stored `ago` milliseconds before now.
const putAged = async (s: MemoryFileStorage, key: string, ago: number) => {
  await s.put(key, new Uint8Array([0x25, 0x50, 0x44, 0x46]), 'application/pdf');
  s.storedAt.set(key, Date.now() - ago);
};
const pending = (school: string, name: string) => `${recordPendingFolder(school)}${name}.pdf`;
const kept = (school: string, name: string) => `${school}/record-documents/staff/${u(50)}/${u(60)}/${name}.pdf`;
const sweepRows = async () =>
  (await db.pg.query(`select school_id, actor_user_id, actor_role, target_id, before_state, after_state from audit_log where event_action = 'record_document.pending_swept' order by school_id`)).rows as { school_id: string; actor_user_id: string | null; actor_role: string | null; target_id: string | null; before_state: unknown; after_state: Record<string, unknown> }[];
const jobs = async () => (await db.pg.query(`select idempotency_key, payload, status, max_attempts from jobs where type = $1`, [PENDING_SWEEP_JOB])).rows as { idempotency_key: string; payload: { hour: string }; status: string; max_attempts: number }[];
const enqueue = () => db.pg.exec(`select public.record_documents_pending_sweep_enqueue();`);
const job: ClaimedJob = { jobId: u(99), type: PENDING_SWEEP_JOB, payload: {}, attempts: 1, maxAttempts: 3, schoolId: null, idempotencyKey: 'by-hand' };

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    set session_replication_role = replica;
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'Asha Vidyalaya', 'IN-HR'), ('${B}', 'Bela Public School', 'IN-HR');
    set session_replication_role = origin;
  `);
}, 120_000);
afterAll(async () => db?.stop());

describe('the hourly sweep of papers sent and never confirmed (C237)', () => {
  it('is queued only once the deployed runner can run it, then once an hour', async () => {
    await enqueue();
    expect(await jobs()).toEqual([]);
    // The runner writes down the job types it handles on its round (C210); the sweep is one of them.
    expect(Object.keys(productionHandlers())).toContain(PENDING_SWEEP_JOB);
    await runDueJobs();
    await enqueue();
    await enqueue();
    const queued = await jobs();
    expect(queued).toHaveLength(1);
    const hour = new Date().toISOString().slice(0, 13);
    expect(queued[0]).toMatchObject({ idempotency_key: `${PENDING_SWEEP_JOB}:${hour}`, payload: { hour }, status: 'pending', max_attempts: 3 });
  });

  it('removes each school’s pending files over 15 minutes old; a 5-minute-old one stays; a kept file is never touched', async () => {
    expect(PENDING_DEAD_SECONDS).toBe(15 * 60);
    const s = store();
    await putAged(s, pending(A, 'old'), 16 * MIN);
    await putAged(s, pending(A, 'new'), 5 * MIN);
    await putAged(s, kept(A, 'kept'), 30 * 24 * 60 * MIN);
    // A file in a folder under pending/ is not one the ask made: it is left alone too.
    await putAged(s, `${recordPendingFolder(A)}deeper/old.pdf`, 16 * MIN);
    await putAged(s, pending(B, 'old-1'), 16 * MIN);
    await putAged(s, pending(B, 'old-2'), 3 * 60 * MIN);
    await putAged(s, kept(B, 'kept'), 16 * MIN);

    const summary = await runDueJobs();
    expect(summary).toMatchObject({ claimed: 1 });
    expect((await jobs())[0].status).toBe('succeeded');

    expect([...s.files.keys()].sort()).toEqual([pending(A, 'new'), `${recordPendingFolder(A)}deeper/old.pdf`, kept(A, 'kept'), kept(B, 'kept')].sort());
    // One audit row a school where something went: the count, by the job, by no person; no name, no key.
    const rows = await sweepRows();
    expect(rows).toEqual([
      { school_id: A, actor_user_id: null, actor_role: null, target_id: null, before_state: null, after_state: { removed: 1, by: PENDING_SWEEP_JOB } },
      { school_id: B, actor_user_id: null, actor_role: null, target_id: null, before_state: null, after_state: { removed: 2, by: PENDING_SWEEP_JOB } },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/record-documents|\.pdf|old|kept/);
  });

  it('a second run changes nothing: no file, no audit row', async () => {
    const before = [...store().files.keys()].sort();
    await pendingSweepHandler({ platform, storage: store() })(job);
    expect([...store().files.keys()].sort()).toEqual(before);
    expect(await sweepRows()).toHaveLength(2);
  });

  it('the 5-minute-old file goes once it is past 15 minutes', async () => {
    await pendingSweepHandler({ platform, storage: store(), now: () => Date.now() + 11 * MIN })(job);
    expect(store().files.has(pending(A, 'new'))).toBe(false);
    expect(store().files.has(kept(A, 'kept'))).toBe(true);
    expect((await sweepRows()).filter((r) => r.school_id === A).map((r) => r.after_state.removed)).toEqual([1, 1]);
  });

  it('while file storage does not work (C236), the deployed job does nothing and succeeds; the next run catches up', async () => {
    const s = store();
    await putAged(s, pending(B, 'while-down'), 40 * MIN);
    const audited = (await sweepRows()).length;
    health.state = 'other_project';
    try {
      await productionHandlers()[PENDING_SWEEP_JOB](job);
      expect(s.files.has(pending(B, 'while-down'))).toBe(true);
      expect(await sweepRows()).toHaveLength(audited);
    } finally {
      health.state = 'ok';
    }
    await productionHandlers()[PENDING_SWEEP_JOB](job);
    expect(s.files.has(pending(B, 'while-down'))).toBe(false);
    expect(await sweepRows()).toHaveLength(audited + 1);
  });

  it('files removed are recorded even when the audit insert fails: tried twice, then the count goes to the log', async () => {
    const s = new MemoryFileStorage();
    await putAged(s, pending(A, 'x'), 20 * MIN);
    await putAged(s, pending(A, 'y'), 20 * MIN);
    let tries = 0;
    const noAudit = (async (fn: (c: Sql) => Promise<unknown>) =>
      platform((c) =>
        fn({ query: (text: string, params?: unknown[]) => (/insert into audit_log/.test(text) ? (tries++, Promise.reject(new Error('audit down'))) : c.query(text, params)) } as Sql)
      )) as typeof platform;
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((line: unknown) => void lines.push(String(line)));
    try {
      await expect(pendingSweepHandler({ platform: noAudit, storage: s })(job)).rejects.toThrow(`${PENDING_SWEEP_JOB}: 1 school(s) not done`);
    } finally {
      spy.mockRestore();
    }
    expect(s.files.size).toBe(0);
    expect(tries).toBe(2);
    const said = lines.find((l) => l.includes('record_documents.pending_sweep.not_audited'));
    expect(JSON.parse(said!)).toMatchObject({ level: 'error', schoolId: A, removed: 2 });
    expect(said).not.toMatch(/pending\/|\.pdf/);
  });

  it('one school the store fails for does not stop the others, and the job is retried', async () => {
    const s = new MemoryFileStorage();
    await putAged(s, pending(A, 'a'), 20 * MIN);
    await putAged(s, pending(B, 'b'), 20 * MIN);
    const flaky = Object.assign(Object.create(s), {
      removeOlderThan: (prefix: string, at: Date) => (prefix.startsWith(A) ? Promise.reject(new Error('store down')) : s.removeOlderThan(prefix, at)),
    }) as MemoryFileStorage;
    await expect(pendingSweepHandler({ platform, storage: flaky })(job)).rejects.toThrow(`${PENDING_SWEEP_JOB}: 1 school(s) not done`);
    expect(s.files.has(pending(A, 'a'))).toBe(true);
    expect(s.files.has(pending(B, 'b'))).toBe(false);
  });
});
