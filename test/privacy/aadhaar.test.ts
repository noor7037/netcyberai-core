import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { looksLikeAadhaarNumber } from '@/lib/free-tools/student-data-check';
import { hasAadhaarNumber, hideAadhaarNumbers } from '@/lib/privacy/aadhaar';
import { hasAadhaarNumber as dataCheckHas, hideAadhaarNumbers as dataCheckHide } from '@/lib/students/data-check-rules';
import { AADHAAR_CASES } from '../fixtures/aadhaar-cases';

// The ONE Aadhaar-number rule (C223-A answer 6, C225): the app's hasAadhaarNumber and the database's
// public.no_aadhaar_number say the same thing on the one shared list of cases, and hideAadhaarNumbers hides exactly
// what the rule refuses.

describe('the rule in code, on the shared list', () => {
  for (const c of AADHAAR_CASES) {
    it(`${c.refused ? 'refuses' : 'passes'} ${JSON.stringify(c.input)}: ${c.why}`, () => {
      expect(hasAadhaarNumber(c.input)).toBe(c.refused);
      // The data check's names and the free tool's answer are the same rule.
      expect(dataCheckHas(c.input)).toBe(c.refused);
      expect(looksLikeAadhaarNumber(c.input)).toBe(c.refused);
    });
  }

  it('hides what it refuses, the whole number with its separators, and nothing else', () => {
    for (const c of AADHAAR_CASES) {
      const shown = hideAadhaarNumbers(c.input, '[hidden]');
      expect(shown, c.input).toBe(c.refused ? c.masked : c.input);
      // What is left is never refused again.
      expect(hasAadhaarNumber(shown), c.input).toBe(false);
      expect(dataCheckHide(c.input, '[hidden]'), c.input).toBe(shown);
    }
  });

  it('Admissions has no Aadhaar pattern of its own: it asks the one rule (C224)', () => {
    const text = readFileSync(path.join(__dirname, '../../src/lib/admissions/admissions.ts'), 'utf8');
    expect(text).toMatch(/import \{ hasAadhaarNumber \} from '@\/lib\/students\/data-check-rules'/);
    expect(text).not.toMatch(/\[0-9\]\{4\}|\\d\{4\}|AADHAAR_LIKE|looksLikeItHoldsAadhaar/);
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;

describe('the rule in the database, on the same list', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
  }, 120_000);
  afterAll(async () => db?.stop());

  it('public.no_aadhaar_number answers every case as the code does, as the app’s role', async () => {
    const answers: boolean[] = await db.pg.transaction(async (tx: { query: (sql: string, v?: unknown[]) => Promise<{ rows: { ok: boolean }[] }> }) => {
      await tx.query('set local role app_user');
      const out: boolean[] = [];
      for (const c of AADHAAR_CASES) out.push((await tx.query(`select public.no_aadhaar_number($1) as ok`, [c.input])).rows[0].ok);
      return out;
    });
    expect(answers).toEqual(AADHAAR_CASES.map((c) => !c.refused));
    expect((await db.pg.query(`select public.no_aadhaar_number(null) as ok`)).rows[0].ok).toBe(true);
  });

  it('the function is the same everywhere it is used: immutable, a pinned search path, and only the app’s role may call it', async () => {
    const { rows } = await db.pg.query(`select p.provolatile, p.proconfig, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('app_user', p.oid, 'execute') as app from pg_proc p where p.proname = 'no_aadhaar_number'`);
    expect(rows).toEqual([{ provolatile: 'i', proconfig: ['search_path=public, pg_temp'], anon: false, app: true }]);
  });
});
