import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { STANDARD_CLASSES } from '@/lib/classes/standard-classes';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';

// 10,000 students through the real student import (C235-A): the route, the CSV parser, the row rules and the insert,
// on the whole schema as the app's own database role. A valid file of 10,000 lands whole, within a time a person
// waits for; the same file with one bad row writes nothing and names the row. Malformed files, values out of range
// and duplicate records are refused the same way. Every name, number and phone below is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, tenant: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));
vi.mock('@/lib/frameworks/page-access', () => ({ moduleOffReason: async () => null }));

import { POST as importStudents } from '@/app/api/app/students/import/route';

const A = 'c9000000-0000-4000-8000-000000000001';
const PRINCIPAL = 'c9000000-0000-4000-8000-000000000011';
const TARA = 'c9000000-0000-4000-8000-000000000012';
const N = 10_000;
// Vercel refuses a request body over 4.5 MB (a function's payload limit).
const VERCEL_BODY_LIMIT = 4.5 * 1024 * 1024;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const tara: Who = { role: 'teacher', user: TARA };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const claims = (who: Who) => ({ sub: who.user, role: who.role, schoolId: A, membershipId: PRINCIPAL, tokenVersion: 0, aal: 'aal1', sessionId: PRINCIPAL });
const send = async (who: Who, csv: string, preview: boolean) => {
  state.claims = claims(who);
  const form = new FormData();
  form.set('file', new File([csv], 'students.csv', { type: 'text/csv' }));
  const started = performance.now();
  const res = await importStudents(new NextRequest(`http://localhost/api/app/students/import${preview ? '?preview=1' : ''}`, { method: 'POST', body: form }));
  const body = await res.json();
  return { status: res.status, body, ms: Math.round(performance.now() - started) };
};
const count = async (sql: string, params: unknown[] = []): Promise<number> => (await db.pg.query(sql, params)).rows[0].n;

const FIRST = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Vihaan', 'Anaya', 'Reyansh', 'Ira', 'Arjun', 'Saanvi', 'Ishaan', 'Myra', 'Advik', 'Kiara', 'Dhruv', 'Avni', 'Rohan', 'Tara', 'Neel', 'Pihu'];
const LAST = ['Example', 'Sample', 'Specimen', 'Placeholder', 'Testwala', 'Demoji', 'Fictional', 'Madeup'];
const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const HEADER = 'name,admission_no,class_name,roll_no,dob,gender,guardian_phone';
// Row i (1-based) of a valid file: a class from the standard set, a real date of birth in the past.
const line = (i: number, prefix: string) => {
  const cls = STANDARD_CLASSES[i % STANDARD_CLASSES.length];
  const name = `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}`;
  const dob = `${2008 + (i % 15)}-${pad(1 + (i % 12))}-${pad(1 + (i % 28))}`;
  const gender = ['female', 'male', '', 'Female', 'MALE'][i % 5];
  return `${name},${prefix}-${pad(i, 5)},${cls.name},${Math.floor(i / STANDARD_CLASSES.length) + 1},${dob},${gender},+91 90000 ${pad(i, 5)}`;
};
const file = (prefix: string, change: (i: number, l: string) => string = (_i, l) => l) => [HEADER, ...Array.from({ length: N }, (_, k) => change(k + 1, line(k + 1, prefix)))].join('\r\n') + '\r\n';
const timings: Record<string, number> = {};

describe('10,000 students through the real student import', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR');
      insert into users (user_id, school_id, email, role, display_name, is_active) values
        ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal', true), ('${TARA}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Teacher', true);
      insert into school_module_entitlements (school_id, module_id, enabled, source)
        select '${A}', m, true, 'plan' from unnest(array[${MODULE_REGISTRY.map((m) => `'${m.id}'`).join(', ')}]) m on conflict (school_id, module_id) do update set enabled = true;
      insert into classes (school_id, name, grade, section)
        select '${A}', n.name, n.grade, n.section from unnest(array[${STANDARD_CLASSES.map((c) => `'${c.name}'`).join(', ')}], array[${STANDARD_CLASSES.map((c) => `'${c.grade}'`).join(', ')}], array[${STANDARD_CLASSES.map((c) => `'${c.section}'`).join(', ')}]) as n(name, grade, section);
    `);
    state.tenant = (c: { role: string; sub: string }, fn: (client: unknown) => Promise<unknown>) => as({ role: c.role, user: c.sub }, fn);
  }, 120_000);
  afterAll(async () => {
    console.log(`[C235-A] 10,000-row student import: ${JSON.stringify(timings)}`);
    await db?.stop();
  });

  it('a valid file of 10,000: “Check file” writes nothing, “Import” lands all 10,000 in one go, and it fits a Vercel request', async () => {
    const csv = file('ADM');
    const bytes = Buffer.byteLength(csv);
    timings.fileBytes = bytes;
    expect(bytes).toBeLessThan(VERCEL_BODY_LIMIT);

    const checked = await send(principal, csv, true);
    timings.previewMs = checked.ms;
    expect(checked.status).toBe(200);
    expect(checked.body).toMatchObject({ preview: true, refused: false, rowCount: N, importedCount: 0, skippedCount: 0, errors: [] });
    expect(await count(`select count(*)::int as n from students`)).toBe(0);

    const done = await send(principal, csv, false);
    timings.importMs = done.ms;
    expect(done.status).toBe(201);
    expect(done.body).toMatchObject({ preview: false, refused: false, rowCount: N, importedCount: N, skippedCount: 0, errors: [] });
    expect(await count(`select count(*)::int as n from students where school_id = $1 and status = 'pending_consent'`, [A])).toBe(N);
    // Every child is in the class the file named, with the record the file gave.
    expect(await count(`select count(distinct class_id)::int as n from students`)).toBe(42);
    expect((await db.pg.query(`select s.name, s.admission_no, c.name as class_name, s.roll_no, s.dob::text as dob, s.gender from students s join classes c on c.class_id = s.class_id where s.admission_no = 'ADM-07777'`)).rows).toEqual([
      { name: 'Tara Testwala', admission_no: 'ADM-07777', class_name: '1-B', roll_no: '186', dob: '2015-02-22', gender: 'not_given' },
    ]);
    // A person waits for this: the whole import, preview and write, in well under a minute even on the in-memory
    // database the tests use (the numbers are printed at the end of the file).
    expect(checked.ms + done.ms).toBeLessThan(60_000);

    // The same file again is the same import: nobody is added twice.
    expect(await send(principal, csv, false)).toMatchObject({ status: 200, body: { alreadyImported: true, importedCount: N } });
    expect(await count(`select count(*)::int as n from students`)).toBe(N);
  }, 180_000);

  it('the same file with one bad row among 10,000 writes nothing and names the row', async () => {
    const csv = file('BAD', (i, l) => (i === 7777 ? l.replace(`,${STANDARD_CLASSES[7777 % 42].name},`, ',Prep-A,') : l));
    const checked = await send(principal, csv, true);
    expect(checked.body).toMatchObject({ preview: true, rowCount: N, skippedCount: 1, errors: [{ row: 7777, errors: ['class "Prep-A" does not exist at this school'] }] });
    timings.refusedPreviewMs = checked.ms;
    const refused = await send(principal, csv, false);
    timings.refusedMs = refused.ms;
    expect(refused.status).toBe(422);
    // Right after 10,000 rows were written the database's planner statistics are stale (the test database has no
    // autovacuum; Supabase's refreshes them within a minute): most of the time above is query planning. With them
    // refreshed, as autovacuum does, the same refusal is timed again.
    await db.pg.exec('analyze');
    const again = await send(principal, csv, false);
    timings.refusedAfterAnalyzeMs = again.ms;
    expect(again.body).toMatchObject({ refused: true, skippedCount: 1, errors: [{ row: 7777 }] });
    expect(refused.body).toMatchObject({ refused: true, importedCount: 0, skippedCount: 1, errors: [{ row: 7777, name: 'Tara Testwala', admissionNo: 'BAD-07777' }] });
    expect(await count(`select count(*)::int as n from students where admission_no like 'BAD-%'`)).toBe(0);
    expect(await count(`select count(*)::int as n from csv_imports`)).toBe(1);
  }, 180_000);

  it('values out of range and duplicate records are row errors, and the file writes nothing', async () => {
    const csv = [
      HEADER,
      'Ira Example,NEW-1,1-A,1,2030-01-01,,', // a date of birth after today
      'Neel Example,NEW-2,1-A,2,2016-02-30,,', // not a real date
      'Pihu Example,NEW-3,13-A,3,2016-02-01,,', // no class 13
      'Avni Example,NEW-4,1-A,4,01/02/2016,,', // not YYYY-MM-DD
      'Dhruv Example,NEW-5,1-A,5,2016-02-01,X,', // not a gender Aadhaar prints
      ',NEW-6,1-A,6,2016-02-01,,', // no name
      'Rohan Example,new-1,1-A,7,2016-02-01,,', // the admission number of row 1, in other letters
      'Kiara Example,ADM-00001,1-A,8,2016-02-01,,', // an admission number the school has already
      'Advik Example,NEW-9,1-A,9,2016-02-01,,', // a good row
    ].join('\n');
    const done = await send(principal, csv, false);
    expect(done.status).toBe(422);
    expect(done.body.refused).toBe(true);
    expect(done.body.errors.map((e: { row: number; errors: string[] }) => [e.row, e.errors])).toEqual([
      [1, ['dob is after today']],
      [2, ['dob is not a real calendar date']],
      [3, ['class "13-A" does not exist at this school']],
      [4, ['dob must be in YYYY-MM-DD format']],
      [5, ['gender must be male, female or transgender, as Aadhaar prints it, or left empty']],
      [6, ['name is required']],
      [7, ['admission number "new-1" is also on row 1 of this file']],
      [8, ['admission number "ADM-00001" already belongs to a student of this school']],
    ]);
    expect(await count(`select count(*)::int as n from students where admission_no ilike 'NEW-%'`)).toBe(0);
  });

  it('a malformed file is refused as a whole or by its row; a teacher may not import', async () => {
    // A quote opened and never closed swallows the rest of the file: refused, not guessed at.
    expect(await send(principal, `${HEADER}\n"Ira Example,NEW-1,1-A,1,2016-02-01,,\nNeel Example,NEW-2,1-A,2,2016-02-01,,\n`, true)).toMatchObject({ status: 400, body: { error: expect.stringContaining('never closed') } });
    // No "name" column.
    expect(await send(principal, 'student,class\nIra Example,1-A\n', true)).toMatchObject({ status: 400, body: { error: expect.stringContaining('"name" column') } });
    // A header only.
    expect(await send(principal, `${HEADER}\n`, true)).toMatchObject({ status: 400, body: { error: expect.stringContaining('no data rows') } });
    // A row with more values than the header: that row is named, and nothing is written.
    const wide = await send(principal, `${HEADER}\nIra Example,NEW-1,1-A,1,2016-02-01,,,surplus\nNeel Example,NEW-2,1-A,2,2016-02-01,,\n`, false);
    expect(wide).toMatchObject({ status: 422, body: { refused: true, errors: [{ row: 1, errors: ['this row has more values than the first row has column names'] }] } });
    // A file saved by Excel as "CSV UTF-8" starts with a byte order mark: the name column is still found.
    expect(await send(principal, `﻿${HEADER}\nIra Example,NEW-1,1-A,1,2016-02-01,,\n`, true)).toMatchObject({ status: 200, body: { errors: [], rowCount: 1 } });
    expect(await send(tara, `${HEADER}\nIra Example,NEW-1,1-A,1,2016-02-01,,\n`, false)).toMatchObject({ status: 403 });
    expect(await count(`select count(*)::int as n from students where admission_no ilike 'NEW-%'`)).toBe(0);
  });
});
