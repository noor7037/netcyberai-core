import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { looksLikeAadhaarNumber } from '@/lib/free-tools/student-data-check';
import { hasAadhaarNumber, hideAadhaarNumbers, isAadhaarShaped, verhoeffDigit, verhoeffValid } from '@/lib/privacy/aadhaar';
import { hasAadhaarNumber as dataCheckHas, hideAadhaarNumbers as dataCheckHide } from '@/lib/students/data-check-rules';
import { AADHAAR_CASES, TEXTBOOK_PASS_CASES } from '../fixtures/aadhaar-cases';

const ALL_CASES = [...AADHAAR_CASES, ...TEXTBOOK_PASS_CASES];

// Random texts made of number pieces, separators and line breaks (a fixed seed, so a failure is the same every run).
function randomTexts(seed: number, count: number): string[] {
  const rnd = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const pieces = ['2345 6789 0124', '234567890124', '2345', '6789', '0124', '12', '123', '2024', ' ', ' ', '  ', '-', ' - ', '\n', '\t', '+', '+91 ', 'a', '/', ',', '.', '७', '0', '5', '\u00a0', '–'];
  const out: string[] = [];
  for (let k = 0; k < count; k++) {
    let text = '';
    const len = 1 + rnd(8);
    for (let i = 0; i < len; i++) text += pieces[rnd(pieces.length)];
    out.push(text);
  }
  return out;
}

// C225's rule exactly as it was (for the proof below that C520 only ever passes more, never refuses more).
function c225Refuses(text: string): boolean {
  let t = '';
  for (const ch of text) {
    const d = '०१२३४५६७८९'.indexOf(ch);
    t += d >= 0 ? String(d) : ' \t\n\r\u00a0\u2009\u202f-\u2010\u2011\u2012\u2013\u2014\u2212'.includes(ch) ? ' ' : ch;
  }
  for (const m of t.matchAll(/(\+?)([0-9]+(?: +[0-9]+)*)/g)) {
    const groups = m[2].split(/ +/).map((g) => g.length);
    const total = groups.reduce((a, b) => a + b, 0);
    let printed = false;
    for (let i = 0; i + 2 < groups.length; i++) if (groups[i] === 4 && groups[i + 1] === 4 && groups[i + 2] === 4) printed = true;
    const phone = m[1] === '+' && total <= 15;
    if (printed || (!phone && (groups.includes(12) || (total === 12 && groups.every((g) => g >= 3))))) return true;
  }
  return false;
}

// The ONE Aadhaar-number rule (C223-A answer 6, C225): the app's hasAadhaarNumber and the database's
// public.no_aadhaar_number say the same thing on the one shared list of cases, and hideAadhaarNumbers hides exactly
// what the rule refuses.

describe('the rule in code, on the shared list', () => {
  for (const c of ALL_CASES) {
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

  it('every refused fixture is a synthetic number with Aadhaar’s check digit; textbook pages pass in TS (C520)', () => {
    for (const c of TEXTBOOK_PASS_CASES) expect(c.refused, c.input).toBe(false);
    expect(TEXTBOOK_PASS_CASES.length).toBeGreaterThanOrEqual(30);
    // Some textbook lines are chosen with a valid check digit: they pass only by the narrowed candidates.
    for (const s of ['202320242025', '210420630840', '200140026003', '400007110001', '259267890124']) expect(verhoeffValid(s), s).toBe(true);
  });

  it('Verhoeff: known values, a check digit for every prefix, and one wrong digit or swap always caught', () => {
    expect(verhoeffValid('2363')).toBe(true);
    expect(verhoeffDigit('236')).toBe('3');
    expect(verhoeffValid('2364')).toBe(false);
    const base = '23456789012';
    const good = base + verhoeffDigit(base);
    expect(isAadhaarShaped(good)).toBe(true);
    for (let i = 0; i < 12; i++) {
      for (let d = 0; d <= 9; d++) {
        if (String(d) === good[i]) continue;
        expect(verhoeffValid(good.slice(0, i) + d + good.slice(i + 1)), `digit ${i} -> ${d}`).toBe(false);
      }
      if (i < 11 && good[i] !== good[i + 1]) expect(verhoeffValid(good.slice(0, i) + good[i + 1] + good[i] + good.slice(i + 2)), `swap ${i}`).toBe(false);
    }
    expect(isAadhaarShaped('1' + good.slice(1, 11) + verhoeffDigit('1' + good.slice(1, 11)))).toBe(false);
    expect(isAadhaarShaped('202320242025')).toBe(false); // a counting sequence, though its check digit is valid
  });

  it('C520 is looser than C225, never stricter: what C225 passed still passes (random texts)', () => {
    let refusedNow = 0;
    for (const text of randomTexts(520, 20000)) {
      // The one known exception (said in the migration): a "+" phone on one line and an Aadhaar number on the next.
      if (/\+[0-9 -]*\n/.test(text)) continue;
      if (hasAadhaarNumber(text)) {
        refusedNow++;
        expect(c225Refuses(text), JSON.stringify(text)).toBe(true);
      }
    }
    expect(refusedNow).toBeGreaterThan(500);
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
      for (const c of ALL_CASES) out.push((await tx.query(`select public.no_aadhaar_number($1) as ok`, [c.input])).rows[0].ok);
      return out;
    });
    expect(answers).toEqual(ALL_CASES.map((c) => !c.refused));
    expect((await db.pg.query(`select public.no_aadhaar_number(null) as ok`)).rows[0].ok).toBe(true);
  });

  it('answers 3,000 random texts exactly as the code does (C520)', async () => {
    const texts = randomTexts(1114, 3000);
    const { rows } = await db.pg.query(`select public.no_aadhaar_number(t) as ok from unnest($1::text[]) with ordinality as x(t, i) order by i`, [texts]);
    const wrong = texts.filter((t, i) => rows[i].ok !== !hasAadhaarNumber(t));
    expect(wrong).toEqual([]);
    expect(texts.filter((t) => hasAadhaarNumber(t)).length).toBeGreaterThan(100);
  });

  it('the function is the same everywhere it is used: immutable, a pinned search path, and only the app’s role may call it', async () => {
    const { rows } = await db.pg.query(`select p.provolatile, p.proconfig, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('app_user', p.oid, 'execute') as app from pg_proc p where p.proname = 'no_aadhaar_number'`);
    expect(rows).toEqual([{ provolatile: 'i', proconfig: ['search_path=public, pg_temp'], anon: false, app: true }]);
  });
});

describe('the C520 migration and rows already kept', () => {
  it('stops, naming the check, when a kept row is one the new rule would refuse (a "+" phone, then a number on the next line)', async () => {
    const before = {
      migration: '_c520_aadhaar_verhoeff.sql',
      sql: `create table public.c520_probe (v text check (public.no_aadhaar_number(v)));
            insert into public.c520_probe values ('+91 ' || chr(10) || '234567890124'), ('Class 5, 2026-27');`,
    };
    await expect(startHarnessDb({ port: 0, before })).rejects.toThrow(/C520: existing rows the new Aadhaar rule refuses: c520_probe\.c520_probe_v_check \(1 rows\)/);
  }, 180_000);
});
