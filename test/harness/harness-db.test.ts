// The screenshot harness's database (scripts/harness/db.mjs, C133): the real
// migrations replayed on PGlite plus src/demo-fixture/harness-seed.sql. This
// keeps the seed loading as the schema moves, and proves the harness shows
// screens through the same row-level security as the live app.
import { readFileSync, readdirSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

const LIVE = 'a0000000-0000-4000-8000-000000000001';
const seedSql = readFileSync(path.join(__dirname, '../../src/demo-fixture/harness-seed.sql'), 'utf8');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0, seedSql });
}, 120_000);

afterAll(async () => {
  await db?.stop();
});

async function asSchool(schoolId: string, sql: string) {
  return db.pg.transaction(async (tx: { query: (q: string) => Promise<{ rows: Record<string, unknown>[] }> }) => {
    await tx.query('set local role app_user');
    await tx.query(`select set_config('app.current_tenant_id', '${schoolId}', true)`);
    await tx.query(`select set_config('app.current_role', 'principal', true)`);
    await tx.query(`select set_config('app.current_user_id', '00000000-0000-4000-8000-00000000a001', true)`);
    return (await tx.query(sql)).rows;
  });
}

describe('screenshot harness database', () => {
  it('replays the migrations and loads the seed', async () => {
    const files = readdirSync(path.join(__dirname, '../../supabase/migrations')).filter((f) => f.endsWith('.sql'));
    // Every migration is either applied or one of the three scheduler
    // migrations that need extensions PGlite lacks: none goes missing.
    expect(db.skipped).toHaveLength(3);
    expect(db.applied.length + db.skipped.length).toBe(files.length);
    const { rows } = await db.pg.query('select count(*)::int as n from students');
    expect(rows[0].n).toBe(34);
  });

  it('answers on 127.0.0.1 and on no other address of this machine', async () => {
    const client = new Client({ connectionString: db.url });
    await client.connect();
    expect((await client.query('select 1 as one')).rows[0].one).toBe(1);
    await client.end();

    const others = Object.values(os.networkInterfaces())
      .flat()
      .filter((a) => a && a.family === 'IPv4' && !a.internal)
      .map((a) => a!.address);
    for (const host of others) {
      const reached = await new Promise<boolean>((resolve) => {
        const s = net.connect({ host, port: db.port, timeout: 1500 });
        s.once('connect', () => (s.destroy(), resolve(true)));
        s.once('error', () => resolve(false));
        s.once('timeout', () => (s.destroy(), resolve(false)));
      });
      expect(reached, `the harness database must not answer on ${host}`).toBe(false);
    }
  });

  it('shows a school only its own rows, as the live app does', async () => {
    const own = await asSchool(LIVE, 'select count(*)::int as n, count(distinct school_id)::int as schools from students');
    expect(own[0]).toEqual({ n: 26, schools: 1 });
    const tickets = await asSchool(LIVE, 'select count(distinct school_id)::int as schools from support_tickets');
    expect(tickets[0].schools).toBe(1);
  });

  it('shows nothing without a school set', async () => {
    const outcome = await db.pg
      .transaction(async (tx: { query: (q: string) => Promise<{ rows: Record<string, unknown>[] }> }) => {
        await tx.query('set local role app_user');
        return (await tx.query('select count(*)::int as n from students')).rows[0].n as number;
      })
      .catch((err: Error) => err.message);
    // No rows, or the query refused because there is no school to compare with.
    expect([0, 'invalid input syntax for type uuid: ""']).toContain(outcome);
  });
});

// The bug the harness found (C133): a date column reaches the app as a Date
// object, which a screen cannot show and which JSON turns into a timestamp.
describe('date of birth reaches the screen as a plain date', () => {
  it('is a Date object unless read as text, through the same driver the app uses', async () => {
    const client = new Client({ connectionString: db.url });
    await client.connect();
    const { rows } = await client.query("select dob, dob::text as dob_text from students where student_id = '00000000-0000-4000-8000-000000500001'");
    await client.end();
    expect(rows[0].dob).toBeInstanceOf(Date);
    expect(rows[0].dob_text).toBe('2015-04-18');
  });

  it('every query that sends a student to a screen reads it as text', () => {
    const root = path.join(__dirname, '../../src/app');
    const files = ['(school)/app/students/[studentId]/page.tsx', 'api/app/students/route.ts', 'api/app/students/[studentId]/route.ts'];
    for (const f of files) {
      const text = readFileSync(path.join(root, f), 'utf8');
      // Statements that return rows to the screen: a select with created_at/updated_at, or a returning clause.
      const returned = text.split('\n').filter((l) => /\bdob\b/.test(l) && /(returning|s\.roll_no,|s\.dob)/.test(l));
      expect(returned.length, f).toBeGreaterThan(0);
      for (const line of returned) expect(line, f).toContain('dob::text as dob');
    }
  });
});
