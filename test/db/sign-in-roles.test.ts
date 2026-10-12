import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// Sign-in, the session, sign-out, the audit trail and a stored file's row,
// after the rights of the public roles were taken away (C161). Supabase
// Auth and Storage keep their own schemas and roles, which the hardening
// migration does not touch; what the app does in schema public for a
// sign-in is done by the server's own role (app_backend), and that is what
// is run here: the same statements as src/lib/auth (resolve.ts, refresh.ts,
// logout), as that role, on every migration replayed.

const A = 'b1000000-0000-4000-8000-000000000001';
const USER = 'b1000000-0000-4000-8000-0000000000a1';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asRole = <T = any>(role: string, fn: (c: any) => Promise<T>, settings: Record<string, string> = {}): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query(`set local role ${role}`);
    for (const [k, v] of Object.entries(settings)) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const tenant = { 'app.current_tenant_id': A, 'app.current_role': 'principal', 'app.current_user_id': USER };

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR');
    insert into users (user_id, school_id, email, role, display_name) values ('${USER}', '${A}', 'p@a.invalid', 'principal', 'Principal A');
    insert into memberships (user_id, school_id, role) values ('${USER}', '${A}', 'principal');
  `);
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe('after the hardening, the server’s own roles still do what a sign-in needs', () => {
  it('sign-in writes the session, a refresh reads it, sign-out revokes it: as app_backend', async () => {
    const made = await asRole('app_backend', (c) =>
      c.query(`insert into sessions (user_id, refresh_token_hash, selected_school_id, token_version_snapshot, aal, expires_at) values ($1, $2, $3, 0, 'aal2', now() + interval '1 day') returning session_id`, [USER, 'hash-1', A])
    );
    const sessionId = made.rows[0].session_id;
    const read = await asRole('app_backend', (c) => c.query(`select session_id, user_id, selected_school_id, token_version_snapshot, aal from sessions where refresh_token_hash = $1 and revoked_at is null and expires_at > now()`, ['hash-1']));
    expect(read.rows).toMatchObject([{ session_id: sessionId, user_id: USER, selected_school_id: A }]);
    await asRole('app_backend', (c) => c.query(`update sessions set revoked_at = now() where session_id = $1`, [sessionId]));
    expect((await asRole('app_backend', (c) => c.query(`select 1 from sessions where refresh_token_hash = $1 and revoked_at is null`, ['hash-1']))).rows).toEqual([]);
    // The server's role can still become the app's role and the platform's role, and nothing else.
    expect((await db.pg.query(`select pg_has_role('app_backend', 'app_user', 'member') as app, pg_has_role('app_backend', 'nca_super', 'member') as platform`)).rows).toEqual([{ app: true, platform: true }]);
  });

  it('a signed-in person’s requests still read their school, their account and their memberships, and write the audit trail: as app_user', async () => {
    const seen = await asRole('app_user', async (c) => ({
      school: (await c.query(`select name from schools where school_id = $1`, [A])).rows,
      user: (await c.query(`select role::text as role, token_version, is_active from users where user_id = $1`, [USER])).rows,
      memberships: (await c.query(`select role::text as role from memberships where user_id = $1`, [USER])).rows,
    }), tenant);
    expect(seen).toEqual({ school: [{ name: 'School A' }], user: [{ role: 'principal', token_version: 0, is_active: true }], memberships: [{ role: 'principal' }] });
    await asRole('app_user', (c) => c.query(`insert into audit_log (school_id, actor_user_id, actor_role, event_action, target_type, target_id) values ($1, $2::uuid, 'principal', 'auth.signed_in', 'users', $3)`, [A, USER, USER]), tenant);
    expect((await db.pg.query(`select event_action, row_hash is not null as chained from audit_log where school_id = $1`, [A])).rows).toEqual([{ event_action: 'auth.signed_in', chained: true }]);
    // The session table is not the app role's, before or after.
    await expect(asRole('app_user', (c) => c.query(`select 1 from sessions`), tenant)).rejects.toThrow(/permission denied/);
  });

  it('the public Supabase roles can read nothing a sign-in touches, and cannot empty a table', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const sql of [`select 1 from users`, `select 1 from sessions`, `select 1 from schools`, `truncate audit_log`, `truncate students`, `delete from payments`]) {
        // With a whole school's context set, as an attacker would: still nothing.
        await expect(asRole(role, (c) => c.query(sql), tenant), `${role}: ${sql}`).rejects.toThrow(/permission denied/);
      }
    }
  });

  it('a stored file’s record is still written and read by the app’s role (the file itself lives in Supabase Storage, in its own schema)', async () => {
    const ticket = await asRole('app_user', (c) => c.query(`insert into support_tickets (school_id, raised_by, raised_role, category, subject, body) values ($1, $2, 'principal', 'not_working', 'A file test', 'Body of the ticket for the file test.') returning ticket_id`, [A, USER]), tenant);
    const id = ticket.rows[0].ticket_id;
    await asRole('app_user', (c) => c.query(`insert into support_ticket_attachments (school_id, ticket_id, storage_key, file_name, mime_type, size_bytes, uploaded_by, uploaded_side) values ($1, $2, $3, 'shot.png', 'image/png', 10, $4, 'school')`, [A, id, `${A}/tickets/${id}/shot.png`, USER]), tenant);
    expect((await asRole('app_user', (c) => c.query(`select storage_key from support_ticket_attachments where ticket_id = $1`, [id]), tenant)).rows).toEqual([{ storage_key: `${A}/tickets/${id}/shot.png` }]);
    // The migration touches schema public only: the stand-in storage and auth schemas are as they were.
    expect((await db.pg.query(`select count(*)::int as n from information_schema.tables where table_schema in ('storage', 'auth')`)).rows[0].n).toBeGreaterThan(0);
  });
});
