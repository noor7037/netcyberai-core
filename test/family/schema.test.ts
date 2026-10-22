import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// M1-1 (C247): the family, content and control schemas on the real migrations (PGlite), as each role the app uses.
// Two family accounts never see each other's rows; a child-keyed row can only name a child of its own account; staff
// roles and the public roles reach nothing in family.*; sign-in codes are reachable only through their functions;
// families read only what is published to everyone; the two-person rule and the minors check hold in the database.
// Made-up addresses only.

const A = 'f1000000-0000-4000-8000-0000000000a1';
const B = 'f1000000-0000-4000-8000-0000000000b1';
const CHILD_A = 'f1000000-0000-4000-8000-0000000000a2';
const CHILD_B = 'f1000000-0000-4000-8000-0000000000b2';
const FOUNDER = 'f1000000-0000-4000-8000-0000000000f1';
const EDITOR = 'f1000000-0000-4000-8000-0000000000e1';
const hex = (c: string) => c.repeat(64);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; affectedRows?: number }>; exec: (sql: string) => Promise<unknown> };

// As the family_app role with this account (null: the sign-in gate, no account), as the app's db.ts sets it.
const asFamily = <T>(account: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', $1, true)`, [account ?? '']);
    return fn(tx);
  });
const asRole = <T>(role: string, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query(`set local role ${role}`);
    return fn(tx);
  });
const refused = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error('expected the database to refuse');
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${A}', 'parent.a@example.org'), ('${B}', 'parent.b@example.org');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code)
    values ('${CHILD_A}', '${A}', 'Asha', 7, 'CBSE', 'hi', 'hinglish', 'IN-UP'),
           ('${CHILD_B}', '${B}', 'Ravi', 9, 'CBSE', 'en', 'en', 'IN-HR');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${A}', 'study_core', true, 'parent_tap', 'v1'), ('${B}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.attempts (account_id, child_id, subject, topic_key, item_key, kind, answer, correct, answered_on)
    values ('${A}', '${CHILD_A}', 'science', 'cbse.c7.sci.ch01.t01', 'q1', 'check', 'b', true, '2026-10-20'),
           ('${B}', '${CHILD_B}', 'mathematics', 'cbse.c9.mat.ch01.t01', 'q1', 'check', 'a', false, '2026-10-20');
    insert into family.topic_progress (account_id, child_id, topic_key, subject, answered, correct) values
      ('${A}', '${CHILD_A}', 'cbse.c7.sci.ch01.t01', 'science', 1, 1), ('${B}', '${CHILD_B}', 'cbse.c9.mat.ch01.t01', 'mathematics', 1, 0);
  `);
}, 60_000);
afterAll(async () => {
  await db?.stop();
});

describe('family rows: own account only', () => {
  it('each account sees only its own rows in every family table', async () => {
    for (const [me, other] of [
      [A, B],
      [B, A],
    ]) {
      await asFamily(me, async (tx) => {
        for (const table of ['accounts', 'children', 'consents', 'attempts', 'topic_progress']) {
          const { rows } = await tx.query(`select account_id from family.${table}`);
          expect(rows.length, table).toBeGreaterThan(0);
          expect(rows.every((r) => r.account_id === me), table).toBe(true);
          expect(rows.some((r) => r.account_id === other), table).toBe(false);
        }
      });
    }
  });

  it('with no account (the sign-in gate) no family row is visible', async () => {
    await asFamily(null, async (tx) => {
      for (const table of ['accounts', 'children', 'consents', 'attempts', 'topic_progress', 'ai_daily']) {
        expect((await tx.query(`select 1 from family.${table}`)).rows, table).toHaveLength(0);
      }
    });
  });

  it('a row can never be written for another account', async () => {
    const msg = await refused(() =>
      asFamily(A, (tx) => tx.query(`insert into family.children (account_id, first_name, class_level, board_id, language, style, state_code) values ($1, 'Mira', 6, 'CBSE', 'en', 'en', 'IN-DL')`, [B]))
    );
    expect(msg).toMatch(/row-level security/);
    const upd = await asFamily(A, (tx) => tx.query(`update family.children set class_level = 8 where child_id = $1`, [CHILD_B]));
    expect(upd.affectedRows ?? 0).toBe(0);
    const del = await asFamily(A, (tx) => tx.query(`delete from family.accounts where account_id = $1`, [B]));
    expect(del.affectedRows ?? 0).toBe(0);
  });

  it('progress and answers must name a child of the same account (the composite key)', async () => {
    const progress = await refused(() =>
      asFamily(A, (tx) => tx.query(`insert into family.topic_progress (account_id, child_id, topic_key, subject) values ($1, $2, 'cbse.c9.mat.ch02.t01', 'mathematics')`, [A, CHILD_B]))
    );
    expect(progress).toMatch(/foreign key/);
    const attempt = await refused(() =>
      asFamily(A, (tx) => tx.query(`insert into family.attempts (account_id, child_id, subject, topic_key, item_key, kind, answer, correct, answered_on) values ($1, $2, 'science', 'cbse.c7.sci.ch01.t01', 'q2', 'check', 'a', true, '2026-10-21')`, [A, CHILD_B]))
    );
    expect(attempt).toMatch(/foreign key/);
  });

  it('the consent ledger is append-only for the app', async () => {
    expect(await refused(() => asFamily(A, (tx) => tx.query(`update family.consents set granted = false`)))).toMatch(/permission denied/);
    expect(await refused(() => asFamily(A, (tx) => tx.query(`delete from family.consents`)))).toMatch(/permission denied/);
    await asFamily(A, (tx) => tx.query(`insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ($1, 'study_core', false, 'parent_tap', 'v1')`, [A]));
    expect(await refused(() => asFamily(A, (tx) => tx.query(`insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ($1, 'study_core', true, 'server', 'v1')`, [A])))).toMatch(/check constraint/);
  });

  it('a child is a first name only, a class from Nursery to 12, a known board, and a state chosen by the parent (C263)', async () => {
    const add = (name: string, cls: number, state: string | null, board = 'CBSE') =>
      asFamily(A, (tx) => tx.query(`insert into family.children (account_id, first_name, class_level, board_id, language, style, state_code) values ($1, $2, $3, $4, 'en', 'en', $5)`, [A, name, cls, board, state]));
    expect(await refused(() => add('Asha Verma', 7, 'IN-UP'))).toMatch(/check constraint/);
    for (const cls of [-3, 13]) expect(await refused(() => add('Asha', cls, 'IN-UP')), String(cls)).toMatch(/check constraint/);
    expect(await refused(() => add('Asha', 7, null))).toMatch(/null value/);
    expect(await refused(() => add('Asha', 7, 'IN-UP', 'NOPE'))).toMatch(/foreign key/);
    for (const bad of ['A1', '<b>', 'a@b', 'राम१']) expect(await refused(() => add(bad, 7, 'IN-UP')), bad).toMatch(/check constraint/);
    await add('राधा', 7, 'IN-UP');
    for (const [cls, board] of [[-2, 'CBSE'], [0, 'STATE'], [1, 'CISCE'], [12, 'NIOS'], [5, 'IB'], [11, 'CAIE']] as const) await add('Meera', cls, 'IN-MH', board);
  });

  it('the PIN columns are writable, the email and id are not', async () => {
    await asFamily(A, (tx) => tx.query(`update family.accounts set pin_failures = 1 where account_id = $1`, [A]));
    expect(await refused(() => asFamily(A, (tx) => tx.query(`update family.accounts set email = 'x@example.org' where account_id = $1`, [A])))).toMatch(/permission denied/);
  });
});

describe('no other role reaches family data', () => {
  it('school staff, Control and the public roles are refused on every family table', async () => {
    for (const role of ['app_user', 'nca_super', 'anon', 'authenticated']) {
      for (const table of ['accounts', 'children', 'consents', 'attempts', 'topic_progress', 'sign_in_codes']) {
        expect(await refused(() => asRole(role, (tx) => tx.query(`select 1 from family.${table}`))), `${role} ${table}`).toMatch(/permission denied/);
      }
    }
  });

  it('family_app reaches no school table', async () => {
    for (const table of ['students', 'users', 'schools', 'attendance', 'audit_log']) {
      expect(await refused(() => asFamily(A, (tx) => tx.query(`select 1 from public.${table}`))), table).toMatch(/permission denied/);
    }
  });

  it('Control reads family data only as counts', async () => {
    const counts = await asRole('nca_super', async (tx) => (await tx.query(`select family.control_counts() as c`)).rows[0].c);
    expect(counts.accounts).toBeGreaterThanOrEqual(2);
    expect(counts.children).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(counts)).not.toMatch(/Asha|Ravi|example\.org/);
    expect(await refused(() => asFamily(A, (tx) => tx.query(`select family.control_counts()`)))).toMatch(/permission denied/);
    expect(await refused(() => asRole('app_user', (tx) => tx.query(`select family.control_counts()`)))).toMatch(/permission denied/);
  });

  it('no foreign key leaves the family and content schemas for public', async () => {
    const { rows } = await db.pg.query(`
      select c.conname from pg_constraint c
        join pg_class t on t.oid = c.conrelid join pg_namespace tn on tn.oid = t.relnamespace
        join pg_class r on r.oid = c.confrelid join pg_namespace rn on rn.oid = r.relnamespace
       where c.contype = 'f' and tn.nspname in ('family', 'content', 'control') and rn.nspname not in ('family', 'content', 'control')`);
    expect(rows).toEqual([]);
  });
});

describe('sign-in codes', () => {
  const code = (fn: string, ...args: (string | null)[]) => asFamily(null, async (tx) => (await tx.query(`select family.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);

  it('the table is closed: only the functions reach it', async () => {
    expect(await refused(() => asFamily(null, (tx) => tx.query(`insert into family.sign_in_codes (purpose, email_key, code_key, expires_at) values ('sign_in', $1, $1, now())`, [hex('1')])))).toMatch(/permission denied/);
  });

  it('five wrong tries lock the code; the right one signs in once', async () => {
    expect(await code('issue_code', 'sign_in', hex('2'), hex('a'), hex('9'))).toBe('ok');
    for (let i = 1; i <= 4; i++) expect(await code('redeem_code', 'sign_in', hex('2'), hex('b'))).toBe('wrong');
    expect(await code('redeem_code', 'sign_in', hex('2'), hex('b'))).toBe('locked');
    expect(await code('redeem_code', 'sign_in', hex('2'), hex('a'))).toBe('locked');

    expect(await code('issue_code', 'sign_in', hex('3'), hex('c'), hex('9'))).toBe('ok');
    const first = await asFamily(null, async (tx) => (await tx.query(`select * from family.sign_in('new.parent@example.org', $1, $2)`, [hex('3'), hex('c')])).rows[0]);
    expect(first.outcome).toBe('ok');
    expect(first.is_new).toBe(true);
    expect(first.account_id).toMatch(/^[0-9a-f-]{36}$/);
    const again = await asFamily(null, async (tx) => (await tx.query(`select * from family.sign_in('new.parent@example.org', $1, $2)`, [hex('3'), hex('c')])).rows[0]);
    expect(again.outcome).toBe('none');
  });

  it('a code expires after 10 minutes, and a new one ends the old', async () => {
    expect(await code('issue_code', 'sign_in', hex('4'), hex('d'), null)).toBe('ok');
    expect(await code('issue_code', 'sign_in', hex('4'), hex('e'), null)).toBe('ok');
    expect(await code('redeem_code', 'sign_in', hex('4'), hex('d'))).toBe('wrong');
    await db.pg.query(`update family.sign_in_codes set expires_at = now() - interval '1 second' where email_key = $1`, [hex('4')]);
    expect(await code('redeem_code', 'sign_in', hex('4'), hex('e'))).toBe('expired');
  });

  it('is rate-limited by email and by network', async () => {
    expect(await code('issue_code', 'sign_in', hex('5'), hex('1'), null)).toBe('ok');
    expect(await code('issue_code', 'sign_in', hex('5'), hex('1'), null)).toBe('ok');
    expect(await code('issue_code', 'sign_in', hex('5'), hex('1'), null)).toBe('ok');
    expect(await code('issue_code', 'sign_in', hex('5'), hex('1'), null)).toBe('rate_limited');
    const ip = hex('7');
    let last = '';
    for (let i = 0; i < 21; i++) last = await code('issue_code', 'pin_reset', (i + 256).toString(16).padStart(64, '0'), hex('1'), ip);
    expect(last).toBe('rate_limited');
  });
});

describe('content: families read only what is published to everyone', () => {
  const V_LIVE = 'f1000000-0000-4000-8000-00000000c001';
  const V_PREVIEW = 'f1000000-0000-4000-8000-00000000c002';
  const V_REVIEW = 'f1000000-0000-4000-8000-00000000c003';
  beforeAll(async () => {
    await asRole('nca_super', (tx) =>
      tx.exec(`
        insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, audience, import_source, import_ref, imported_by, approved_by, approved_at)
        values ('${V_LIVE}', 'CBSE', 7, 'science', '2026-27', 1, 'published', 'everyone', 'repository', 'PR test', null, '${FOUNDER}', now()),
               ('${V_PREVIEW}', 'CBSE', 7, 'science', '2026-27', 2, 'published', 'staff_preview', 'control', null, '${EDITOR}', '${FOUNDER}', now()),
               ('${V_REVIEW}', 'CBSE', 8, 'science', '2026-27', 1, 'in_review', null, 'control', null, '${EDITOR}', null, null);
        insert into content.chapters (version_id, chapter_key, position, title_en, source_url, source_page, checked_on)
        values ('${V_LIVE}', 'cbse.c7.sci.ch01', 1, 'Live chapter', 'https://cbseacademic.nic.in/', '1', '2026-10-21'),
               ('${V_PREVIEW}', 'cbse.c7.sci.ch01', 1, 'Preview chapter', 'https://cbseacademic.nic.in/', '1', '2026-10-21'),
               ('${V_REVIEW}', 'cbse.c8.sci.ch01', 1, 'Draft chapter', 'https://cbseacademic.nic.in/', '1', '2026-10-21');`)
    );
  });

  it('a family sees the live version and its lines, never preview or review', async () => {
    await asFamily(A, async (tx) => {
      expect((await tx.query(`select version_id from content.syllabus_versions`)).rows.map((r) => r.version_id)).toEqual([V_LIVE]);
      expect((await tx.query(`select title_en from content.chapters`)).rows.map((r) => r.title_en)).toEqual(['Live chapter']);
    });
  });

  it('a family cannot write the catalog, and adds responses only as AI-made', async () => {
    expect(await refused(() => asFamily(A, (tx) => tx.query(`update content.syllabus_versions set status = 'withdrawn'`)))).toMatch(/permission denied/);
    const add = (status: string, by: string | null) =>
      asFamily(A, (tx) =>
        tx.query(`insert into content.responses (board_id, class_level, subject, topic_key, language, style, prompt_version, schema_version, blocks, status, provider, model, checked_by)
                  values ('CBSE', 7, 'science', 'cbse.c7.sci.ch01.t01', 'hi', 'hinglish', 'v1', 1, '[]', $1, 'anthropic', 'm', $2)`, [status, by])
      );
    await add('ai_made', null);
    expect(await refused(() => add('checked', FOUNDER))).toMatch(/row-level security/);
  });

  it('whoever imported a version can never approve it', async () => {
    expect(await refused(() => asRole('nca_super', (tx) => tx.query(`update content.syllabus_versions set approved_by = imported_by, approved_at = now() where version_id = $1`, [V_REVIEW])))).toMatch(/check constraint/);
    await asRole('nca_super', (tx) => tx.query(`update content.syllabus_versions set status = 'published', audience = 'staff_preview', approved_by = $2, approved_at = now() where version_id = $1`, [V_REVIEW, FOUNDER]));
  });

  it('only one version of a syllabus is published to each audience', async () => {
    expect(await refused(() => asRole('nca_super', (tx) => tx.query(`update content.syllabus_versions set audience = 'everyone' where version_id = $1`, [V_PREVIEW])))).toMatch(/duplicate key/);
  });
});

describe('control', () => {
  it('a family reads the family switches only, and changes none', async () => {
    await db.pg.query(`insert into control.app_flags (app, module, enabled) values ('teacher', 'copilot', true)`);
    await asFamily(A, async (tx) => {
      const { rows } = await tx.query(`select app from control.app_flags`);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.app === 'family')).toBe(true);
    });
    expect(await refused(() => asFamily(A, (tx) => tx.query(`update control.app_flags set enabled = false`)))).toMatch(/permission denied/);
    expect(await refused(() => asFamily(A, (tx) => tx.query(`update control.settings set value = '999'`)))).toMatch(/permission denied/);
  });

  it('a credential is never readable by a family, only its sealed form through the function', async () => {
    await asRole('nca_super', (tx) => tx.query(`insert into control.ai_credentials (provider_id, ciphertext, iv, tag, key_version, key_last4, set_by) values ('anthropic', 'c', 'i', 't', 1, 'abcd', $1)`, [FOUNDER]));
    expect(await refused(() => asFamily(A, (tx) => tx.query(`select * from control.ai_credentials`)))).toMatch(/permission denied/);
    const sealed = await asFamily(A, async (tx) => (await tx.query(`select * from control.ai_sealed_credential('anthropic')`)).rows);
    expect(sealed).toEqual([{ ciphertext: 'c', iv: 'i', tag: 't', key_version: 1 }]);
    // School staff get the same sealed form since M2-10 (C284: Copilot and Parent AI on the platform), never the table;
    // the key that opens it is only in the server's environment.
    expect(await asRole('app_user', async (tx) => (await tx.query(`select * from control.ai_sealed_credential('anthropic')`)).rows)).toEqual(sealed);
    expect(await refused(() => asRole('app_user', (tx) => tx.query(`select * from control.ai_credentials`)))).toMatch(/permission denied/);
  });

  it('a profile that carries a child’s words cannot be moved to a provider not cleared for minors', async () => {
    expect(await refused(() => asRole('nca_super', (tx) => tx.query(`update control.ai_profiles set provider_id = 'openai' where profile_id = 'family.resolver'`)))).toMatch(/not cleared for minors/);
    await asRole('nca_super', (tx) =>
      tx.query(`update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.org/terms', cleared_at = now(), cleared_by = $1 where provider_id = 'openai'`, [FOUNDER])
    );
    await asRole('nca_super', (tx) => tx.query(`update control.ai_profiles set provider_id = 'openai' where profile_id = 'family.resolver'`));
    expect(await refused(() => asRole('nca_super', (tx) => tx.query(`insert into control.ai_profiles (profile_id, provider_id, carries_child_words) values ('family.other', 'anthropic', true)`)))).toMatch(/not cleared for minors/);
    // The clearance cannot be withdrawn while that profile uses the provider.
    expect(await refused(() => asRole('nca_super', (tx) => tx.query(`update control.ai_providers set cleared_for_minors = false where provider_id = 'openai'`)))).toMatch(/carries a child/);
  });

  it('a family only adds to the AI counts, through the function', async () => {
    expect(await refused(() => asFamily(A, (tx) => tx.query(`select * from control.ai_usage`)))).toMatch(/permission denied/);
    expect(await refused(() => asFamily(A, (tx) => tx.query(`update control.ai_usage set requests = 0`)))).toMatch(/permission denied/);
    for (let i = 0; i < 2; i++) await asFamily(A, (tx) => tx.query(`select control.count_ai_usage('2026-10-21', 'family.resolver', 'openai', 'm', 1, 0, 0, 10, 20)`));
    const { rows } = await db.pg.query(`select requests, tokens_out from control.ai_usage where day = '2026-10-21'`);
    expect(rows.map((r: { requests: number; tokens_out: unknown }) => [r.requests, Number(r.tokens_out)])).toEqual([[2, 40]]);
  });
});

describe('erasure', () => {
  it('deleting an account erases every family row of it and nothing of the other', async () => {
    await asFamily(A, (tx) => tx.query(`insert into family.ai_daily (account_id, day, requests) values ($1, '2026-10-21', 3)`, [A]));
    const del = await asFamily(A, (tx) => tx.query(`delete from family.accounts where account_id = $1`, [A]));
    expect(del.affectedRows).toBe(1);
    for (const table of ['accounts', 'children', 'consents', 'attempts', 'topic_progress', 'ai_daily']) {
      expect((await db.pg.query(`select count(*)::int n from family.${table} where account_id = $1`, [A])).rows[0].n, table).toBe(0);
      expect((await db.pg.query(`select count(*)::int n from family.${table} where account_id = $1`, [B])).rows[0].n, table).toBeGreaterThan(table === 'ai_daily' ? -1 : 0);
    }
  });
});
