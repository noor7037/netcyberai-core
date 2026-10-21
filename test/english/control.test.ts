import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import {
  approveEnglishVersion,
  listEnglishVersions,
  previewEnglishVersion,
  rejectEnglishVersion,
  releaseEnglishVersion,
  rollBackEnglishVersion,
} from '@/lib/content/english-library';
import type { Sql } from '@/lib/jobs/types';

// E-7 (C274): Control → Content for the English course, on the real migrations (PGlite), as the platform role
// (nca_super): a version loaded from the repository goes to staff preview, then to everyone; the next one supersedes
// it; one step rolls back; a rejection needs a note; families only ever read what is released to everyone.

const REVIEWER = 'e7000000-0000-4000-8000-0000000000f1';
const V1 = 'e7000000-0000-4000-8000-0000000000c1';
const V2 = 'e7000000-0000-4000-8000-0000000000c2';
const V3 = 'e7000000-0000-4000-8000-0000000000c3';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = Sql & { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
const asStaff = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query('set local role nca_super');
    await tx.query(`select set_config('app.current_tenant_id', '00000000-0000-0000-0000-000000000000', true)`);
    await tx.query(`select set_config('app.current_role', 'super_admin', true)`);
    await tx.query(`select set_config('app.current_user_id', $1, true)`, [REVIEWER]);
    return fn(tx);
  });
const familySees = async () =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', '', true)`);
    return (await tx.query(`select version_id from content.english_versions`)).rows.map((r: { version_id: string }) => r.version_id);
  });
const actor = { userId: REVIEWER };

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.query(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Made-up Reviewer')`, [REVIEWER]);
  const unit = (v: string) => `insert into content.english_units (version_id, unit_key, position, title_en, title_hi, can_do_en, can_do_hi, pic) values ('${v}', 'c.u01', 1, 'Meet me', 'मुझसे मिलो', 'I can introduce myself.', 'मैं अपना परिचय दे सकता हूँ।', '🙋');
    insert into content.english_lessons (version_id, lesson_key, unit_key, position, kind, title_en, title_hi, minutes, body) values ('${v}', 'c.u01.l1', 'c.u01', 1, 'words', 'Words', 'शब्द', 6, '{"key":"c.u01.l1","title":{"en":"Words"},"steps":[{"type":"tip","text":{"en":"Hello","hi":"नमस्ते"}}],"check":[]}'::jsonb);`;
  await db.pg.exec(`
    insert into content.english_versions (version_id, track, version_no, status, import_source, import_ref) values
      ('${V1}', 'c', 1, 'in_review', 'repository', 'PR #1'), ('${V2}', 'c', 2, 'in_review', 'repository', 'PR #2'), ('${V3}', 'c', 3, 'in_review', 'repository', 'PR #3');
    ${unit(V1)} ${unit(V2)} ${unit(V3)}
  `);
}, 90_000);
afterAll(async () => {
  await db?.stop();
});

describe('English course versions in Control', () => {
  it('lists every version with its counts; the preview holds each lesson as the file does', async () => {
    const list = await asStaff((tx) => listEnglishVersions(tx));
    expect(list.map((v) => [v.versionNo, v.status, v.units, v.lessons])).toEqual([
      [3, 'in_review', 1, 1],
      [2, 'in_review', 1, 1],
      [1, 'in_review', 1, 1],
    ]);
    const p = await asStaff((tx) => previewEnglishVersion(tx, V1));
    expect(p?.[0]).toMatchObject({ key: 'c.u01', titleHi: 'मुझसे मिलो', lessons: [{ key: 'c.u01.l1' }] });
    expect(await familySees()).toEqual([]);
  });

  it('approve → staff preview (families still see nothing); release → everyone', async () => {
    expect(await asStaff((tx) => approveEnglishVersion(tx, actor, V1))).toEqual({ ok: true, versionId: V1 });
    expect(await familySees()).toEqual([]);
    expect(await asStaff((tx) => releaseEnglishVersion(tx, actor, V1))).toEqual({ ok: true, versionId: V1 });
    expect(await familySees()).toEqual([V1]);
    expect(await asStaff((tx) => releaseEnglishVersion(tx, actor, V1))).toEqual({ ok: false, reason: 'not_in_preview' });
  });

  it('the next release supersedes the one before; one step rolls back to it', async () => {
    await asStaff((tx) => approveEnglishVersion(tx, actor, V2));
    await asStaff((tx) => releaseEnglishVersion(tx, actor, V2));
    expect(await familySees()).toEqual([V2]);
    expect((await asStaff((tx) => listEnglishVersions(tx))).find((v) => v.versionId === V2)?.canRollBack).toBe(true);
    expect(await asStaff((tx) => rollBackEnglishVersion(tx, actor, V2))).toEqual({ ok: true, versionId: V2, restoredVersionId: V1 });
    expect(await familySees()).toEqual([V1]);
  });

  it('a rejection needs a note; every step leaves an audit row', async () => {
    expect(await asStaff((tx) => rejectEnglishVersion(tx, actor, V3, ' '))).toEqual({ ok: false, reason: 'note_needed' });
    expect(await asStaff((tx) => rejectEnglishVersion(tx, actor, V3, 'Unit 1 needs a Hindi review.'))).toEqual({ ok: true, versionId: V3 });
    const audit = (await db.pg.query(`select event_action from audit_log where target_type = 'content_english_version' order by created_at`)).rows.map((r: { event_action: string }) => r.event_action);
    expect(audit).toEqual(['content.english.approved', 'content.english.released', 'content.english.approved', 'content.english.released', 'content.english.rolled_back', 'content.english.rejected']);
  });
});
