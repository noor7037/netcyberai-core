import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { DAILY_REQUESTS_SETTING, dailyLimit, takeDailyRequest } from '@/lib/ai/daily-cap';

// Z1 (docs/37 §4 Wave 3; Decision Log C384): hardening across the waves, read from the database's own catalog so a
// table added later is held to the same rules without anyone remembering to list it (scripts/check_rls_policies.py
// lists names by hand). On the real migrations (PGlite). Every name is made up.
//   Tenant:   no school role and no public role holds a right on any family table; families hold none on the
//             gateway's ledger, revisions, health or the Quality Lab.
//   Sibling:  every family table is own-account only, and every one keyed by a child narrows to the current child on
//             that child's own phone (app.current_child_id), unless no family session can touch it at all.
//   Lab:      nothing in a family or content table points at an evaluation row, so a Lab result can never reach a
//             learner's history or the shared cache.
//   Spend:    the daily cap gives each place once, refuses at 0 and when Control has no number.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
const q = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const asFamily = <T>(account: string, child: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', $1, true)`, [account]);
    await tx.query(`select set_config('app.current_child_id', $1, true)`, [child ?? '']);
    return fn(tx);
  });

const ACCOUNT = 'f2100000-0000-4000-8000-000000000001';
const [ASHA, KABIR] = ['f2100000-0000-4000-8000-0000000000c1', 'f2100000-0000-4000-8000-0000000000c2'];

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'z1.parent@example.org');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${ASHA}', '${ACCOUNT}', 'Asha', 7, 'CBSE', 'en', 'en', 'IN-UP'), ('${KABIR}', '${ACCOUNT}', 'Kabir', 9, 'CBSE', 'en', 'en', 'IN-UP');
    insert into family.chapter_reading (account_id, child_id, chapter_key, block_id, sentence) values
      ('${ACCOUNT}', '${ASHA}', 'cbse.c7.science.ch01', 'b1', 2), ('${ACCOUNT}', '${KABIR}', 'cbse.c9.science.ch01', 'b3', 0);
    insert into family.child_subject_source (account_id, child_id, subject, mode) values
      ('${ACCOUNT}', '${ASHA}', 'science', 'catalog'), ('${ACCOUNT}', '${KABIR}', 'science', 'parent');
  `);
}, 120_000);
afterAll(async () => db?.stop());

type Table = { name: string; rls: boolean; force: boolean; hasChild: boolean; policies: { name: string; permissive: boolean; roles: string[]; qual: string }[] };
async function familyTables(): Promise<Table[]> {
  const rows = await q(`
    select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as force,
           exists (select 1 from information_schema.columns k where k.table_schema = 'family' and k.table_name = c.relname and k.column_name = 'child_id') as has_child,
           coalesce((select json_agg(json_build_object('name', p.polname, 'permissive', p.polpermissive,
                       'roles', (select coalesce(array_agg(r.rolname), '{}') from pg_roles r where r.oid = any(p.polroles)),
                       'qual', coalesce(pg_get_expr(p.polqual, p.polrelid), '')))
                     from pg_policy p where p.polrelid = c.oid), '[]'::json) as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'family' and c.relkind = 'r' order by 1`);
  return rows.map((r: any) => ({ name: r.name, rls: r.rls, force: r.force, hasChild: r.has_child, policies: typeof r.policies === 'string' ? JSON.parse(r.policies) : r.policies }));
}

describe('sibling and account isolation, from the catalog', () => {
  it('every family table has row security on and forced', async () => {
    const tables = await familyTables();
    expect(tables.length).toBeGreaterThan(30);
    expect(tables.filter((t) => !t.rls || !t.force).map((t) => t.name)).toEqual([]);
  });

  it('every family table a family session can reach is own-account only twice: a permissive and a restrictive rule', async () => {
    const gaps = (await familyTables())
      .filter((t) => t.policies.some((p) => p.roles.includes('family_app')))
      .filter((t) => !t.policies.some((p) => !p.permissive && p.roles.includes('family_app')))
      .map((t) => t.name);
    expect(gaps).toEqual([]);
  });

  it('every one keyed by a child narrows to the current child on that child’s phone (or no family session reaches it)', async () => {
    const gaps = (await familyTables())
      .filter((t) => t.hasChild && t.policies.some((p) => p.roles.includes('family_app')))
      .filter((t) => !t.policies.some((p) => !p.permissive && p.roles.includes('family_app') && p.qual.includes('app.current_child_id')))
      .map((t) => t.name);
    expect(gaps).toEqual([]);
  });

  it('on Asha’s phone her brother’s reading place and study source are neither seen nor written (the two Z1 closed)', async () => {
    const seen = await asFamily(ACCOUNT, ASHA, async (tx) => ({
      reading: (await tx.query(`select child_id from family.chapter_reading order by child_id`)).rows.map((r) => r.child_id),
      source: (await tx.query(`select child_id from family.child_subject_source order by child_id`)).rows.map((r) => r.child_id),
    }));
    expect(seen).toEqual({ reading: [ASHA], source: [ASHA] });
    await expect(asFamily(ACCOUNT, ASHA, (tx) => tx.query(`insert into family.chapter_reading (account_id, child_id, chapter_key, block_id, sentence) values ($1, $2, 'cbse.c9.science.ch02', 'b1', 0)`, [ACCOUNT, KABIR]))).rejects.toThrow(/row-level security/);
    const changed = await asFamily(ACCOUNT, ASHA, async (tx) => (await tx.query(`update family.child_subject_source set mode = 'catalog' where child_id = $1 returning child_id`, [KABIR])).rows);
    expect(changed).toEqual([]);
    // The parent's own session (no current child) still sees and sets both children.
    const parent = await asFamily(ACCOUNT, null, async (tx) => (await tx.query(`select child_id from family.child_subject_source order by child_id`)).rows.map((r) => r.child_id));
    expect(parent).toEqual([ASHA, KABIR].sort());
  });
});

describe('tenant isolation, from the grants', () => {
  it('no school role and no public role holds any right on a family table', async () => {
    const rows = await q(`
      select table_name, grantee, privilege_type from information_schema.role_table_grants
       where table_schema = 'family' and grantee in ('app_user', 'anon', 'authenticated', 'PUBLIC', 'service_role')`);
    expect(rows).toEqual([]);
  });

  it('families and schools hold no right on the gateway’s revisions, health, ledger, prices, model lists or the Quality Lab', async () => {
    const rows = await q(`
      select table_name, grantee from information_schema.role_table_grants
       where table_schema = 'control' and (table_name like 'ai_eval%' or table_name in ('ai_route_revisions', 'ai_provider_health', 'ai_usage_ledger', 'ai_reply_checks', 'ai_model_prices', 'ai_model_lists'))
         and grantee in ('family_app', 'app_user', 'anon', 'authenticated', 'PUBLIC', 'service_role')`);
    expect(rows).toEqual([]);
  });
});

describe('the Quality Lab stays apart', () => {
  it('no family or content table points at an evaluation row, by key or by column name', async () => {
    const keys = await q(`
      select c.conrelid::regclass::text as from_table from pg_constraint c
       where c.contype = 'f' and c.confrelid::regclass::text like 'control.ai_eval%'
         and c.conrelid::regclass::text not like 'control.%'`);
    expect(keys).toEqual([]);
    const columns = await q(`select table_schema, table_name, column_name from information_schema.columns where table_schema in ('family', 'content') and column_name like '%eval%'`);
    expect(columns).toEqual([]);
  });
});

describe('spend: the daily cap', () => {
  const DAY = '2026-10-28';
  it('gives each place once, even when asked at the same moment', async () => {
    const got = await Promise.all(Array.from({ length: 5 }, () => takeDailyRequest(db.pg, ACCOUNT, DAY, 3)));
    expect(got.filter(Boolean)).toHaveLength(3);
    expect(await q(`select requests from family.ai_daily where account_id = $1 and day = $2`, [ACCOUNT, DAY])).toEqual([{ requests: 3 }]);
    expect(await takeDailyRequest(db.pg, ACCOUNT, DAY, 3)).toBe(false);
  });

  it('a limit of 0 lets nothing through, and no number in Control means no limit to give', async () => {
    expect(await takeDailyRequest(db.pg, ACCOUNT, '2026-10-29', 0)).toBe(false);
    expect(await dailyLimit(db.pg)).toBe(20);
    await q(`update control.settings set value = '"many"'::jsonb where key = $1`, [DAILY_REQUESTS_SETTING]);
    expect(await dailyLimit(db.pg)).toBeNull();
    await q(`delete from control.settings where key = $1`, [DAILY_REQUESTS_SETTING]);
    expect(await dailyLimit(db.pg)).toBeNull();
  });
});
