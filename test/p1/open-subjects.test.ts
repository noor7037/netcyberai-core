import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { changeFreeSubject, claimSubject, openSubjects } from '@/lib/family/learning';
import { subjectAccess } from '@/lib/family/modules';
import { readSubjectList, setSubjectList } from '@/lib/control/family-settings';

// P1 slice 2 (C298; C230-S): a subject Control opens to every child is open whatever the child opened first, and
// opening it never uses up the free subject. The setting no code read (family.free_subjects_per_child) is gone.

const A = 'fb000000-0000-4000-8000-0000000000a1';
const CHILD = 'fb000000-0000-4000-8000-0000000000a2';
const FOUNDER = 'fb000000-0000-4000-8000-0000000000f1';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asFamily = <T>(fn: (tx: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', $1, true)`, [A]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asPlatform = <T>(fn: (tx: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const free = async () => (await db.pg.query(`select free_subject from family.children where child_id = $1`, [CHILD])).rows[0].free_subject;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into users (user_id, school_id, role, display_name) values ('${FOUNDER}', null, 'super_admin', 'Made-up Founder');
    insert into family.accounts (account_id, email) values ('${A}', 'open@example.org');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ('${CHILD}', '${A}', 'Rani', 5, 'CBSE', 'hi', 'hi', 'IN-UP');
  `);
}, 90_000);
afterAll(async () => {
  await db?.stop();
});

describe('subjects open to every child', () => {
  it('the rule: an open subject is open whatever the free subject is, and is never the free one', () => {
    expect(subjectAccess({ freeSubject: 'mathematics' }, 'evs', ['evs'])).toEqual({ subject: 'evs', open: true, isFree: false });
    expect(subjectAccess({ freeSubject: 'mathematics' }, 'evs')).toMatchObject({ open: false });
    expect(subjectAccess({ freeSubject: 'mathematics' }, 'hindi', ['evs'])).toMatchObject({ open: false });
  });

  it("starts with the demo pilot's Science (C313, replacing the first pilot's EVS), and the setting no code read is gone", async () => {
    expect(await asFamily((tx) => openSubjects(tx))).toEqual(['science']);
    expect((await db.pg.query(`select 1 from control.settings where key = 'family.free_subjects_per_child'`)).rows).toHaveLength(0);
  });

  it('Control sets it, audited; unknown subjects are refused', async () => {
    expect(await asPlatform((tx) => setSubjectList(tx, { userId: FOUNDER }, 'open', ['evs', 'not-a-subject']))).toEqual({ ok: false, code: 'bad_subjects' });
    expect(await asPlatform((tx) => setSubjectList(tx, { userId: FOUNDER }, 'open', []))).toEqual({ ok: true, subjects: [] });
    expect(await asPlatform((tx) => setSubjectList(tx, { userId: FOUNDER }, 'open', ['evs']))).toEqual({ ok: true, subjects: ['evs'] });
    expect(await asPlatform((tx) => readSubjectList(tx, 'open'))).toEqual(['evs']);
    const audit = (await db.pg.query(`select before_state, after_state from audit_log where event_action = 'family.open_subjects_set' order by created_at`)).rows;
    expect(audit).toEqual([
      { before_state: { subjects: ['science'] }, after_state: { subjects: [] } },
      { before_state: { subjects: [] }, after_state: { subjects: ['evs'] } },
    ]);
  });

  it('a child who opens EVS keeps the free subject; one who then opens Mathematics still has EVS', async () => {
    expect(await asFamily((tx) => claimSubject(tx, A, CHILD, 'evs'))).toBe(true);
    expect(await free()).toBeNull();
    expect(await asFamily((tx) => claimSubject(tx, A, CHILD, 'mathematics'))).toBe(true);
    expect(await free()).toBe('mathematics');
    expect(await asFamily((tx) => claimSubject(tx, A, CHILD, 'evs'))).toBe(true);
    expect(await asFamily((tx) => claimSubject(tx, A, CHILD, 'hindi'))).toBe(false);
    const open = await asFamily((tx) => openSubjects(tx));
    expect(subjectAccess({ freeSubject: 'mathematics' }, 'evs', open).open).toBe(true);
  });

  it('the parent cannot make an open subject the free one', async () => {
    expect(await asFamily((tx) => changeFreeSubject(tx, A, CHILD, 'evs'))).toBe('open_to_all');
    expect(await free()).toBe('mathematics');
  });
});
