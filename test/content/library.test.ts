import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
// @ts-expect-error -- a plain .mjs script, no types
import { catalogSql } from '../../scripts/content/catalog-sql.mjs';
import { CATALOG_COLUMNS } from '@/lib/content/catalog-csv';
import { approveVersion, diffVersions, importCatalog, listVersions, previewVersion, rejectVersion, releaseVersion, rollBackVersion } from '@/lib/content/library';
import type { Sql } from '@/lib/jobs/types';
import { readFamilyCatalog } from '@/lib/family/catalog';

// M1-4: Control → Content on the real migrations (PGlite), as the roles the app uses: the platform role (nca_super) for
// Control, family_app for a family. Import is all or nothing; the importing account can never approve its own import
// (here and in the database); a staff preview is invisible to families until it is released to everyone; release and
// one-step roll back; the diff; the family's read sees only the version released to everyone; the committed catalog
// loads through scripts/content/catalog-sql.mjs once, however often it is run. Made-up accounts; the class 7 lines are
// made up for the test, with example.org sources.

const FOUNDER = 'c4000000-0000-4000-8000-0000000000f1';
const SECOND = 'c4000000-0000-4000-8000-0000000000f2';
const TODAY = '2026-10-21';
const SRC = 'https://example.org/curriculum.pdf';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Tx = Sql & { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

const asStaff = <T>(user: string, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query('set local role nca_super');
    await tx.query(`select set_config('app.current_tenant_id', '00000000-0000-0000-0000-000000000000', true)`);
    await tx.query(`select set_config('app.current_role', 'super_admin', true)`);
    await tx.query(`select set_config('app.current_user_id', $1, true)`, [user]);
    return fn(tx);
  });
const asFamily = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', '', true)`);
    return fn(tx);
  });
const owner = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;

const line = (o: Record<string, string>) =>
  CATALOG_COLUMNS.map((c) => o[c] ?? ({ board: 'CBSE', class: '7', subject: 'science', academic_year: '2026-27', parent_key: '', position: '1', title_hi: '', source_url: SRC, source_page: '2', checked_on: '2026-10-20', status: 'in_review' } as Record<string, string>)[c] ?? '').join(',');
const U = (key: string, pos: string, title: string) => line({ level: 'unit', key, position: pos, title_en: title });
const C = (key: string, parent: string, pos: string, title: string, hi = '') => line({ level: 'chapter', key, parent_key: parent, position: pos, title_en: title, title_hi: hi });
const T = (key: string, parent: string, pos: string, title: string) => line({ level: 'topic', key, parent_key: parent, position: pos, title_en: title });
const file = (...lines: string[]) => [CATALOG_COLUMNS.join(','), ...lines].join('\n');

const V1 = file(
  U('cbse.c7.science.u1', '1', 'Living world'),
  C('cbse.c7.science.u1.ch01', 'cbse.c7.science.u1', '1', 'Cells', 'कोशिका'),
  T('cbse.c7.science.u1.ch01.t01', 'cbse.c7.science.u1.ch01', '1', 'Cell parts'),
  T('cbse.c7.science.u1.ch01.t02', 'cbse.c7.science.u1.ch01', '2', 'Cell division'),
  C('cbse.c7.science.u1.ch02', 'cbse.c7.science.u1', '2', 'Plants')
);
const V2 = file(
  U('cbse.c7.science.u1', '1', 'Living world'),
  C('cbse.c7.science.u1.ch01', 'cbse.c7.science.u1', '2', 'Cells and tissues', 'कोशिका'),
  T('cbse.c7.science.u1.ch01.t01', 'cbse.c7.science.u1.ch01', '1', 'Cell parts'),
  C('cbse.c7.science.u1.ch03', 'cbse.c7.science.u1', '1', 'Animals')
);

const counts = async () => (await owner(`select status, audience, import_source from content.syllabus_versions where class_level = 7 order by version_no`)) as { status: string; audience: string | null }[];
const familyRows = () =>
  asFamily(async (tx) => ({
    versions: (await tx.query(`select 1 from content.syllabus_versions where class_level = 7`)).rows.length,
    units: (await tx.query(`select 1 from content.units u join content.syllabus_versions v using (version_id) where v.class_level = 7`)).rows.length,
    chapters: (await tx.query(`select 1 from content.chapters c join content.syllabus_versions v using (version_id) where v.class_level = 7`)).rows.length,
    topics: (await tx.query(`select 1 from content.topics t join content.syllabus_versions v using (version_id) where v.class_level = 7`)).rows.length,
  }));
const familyCatalog = (lang: 'en' | 'hi' = 'en', today = TODAY) => asFamily((tx) => readFamilyCatalog(tx, { board: 'CBSE', classLevel: 7, subject: 'science', lang, today }));
const auditActions = async () => (await owner(`select event_action, school_id, target_id, after_state from audit_log where event_action like 'content.%' order by created_at, audit_id`)) as { event_action: string; school_id: string | null; target_id: string; after_state: Record<string, unknown> }[];

let v1 = '';
let v2 = '';

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.query(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Made-up Founder'), ($2, null, 'super_admin', 'Made-up Reviewer')`, [FOUNDER, SECOND]);
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe('import: check, then all or nothing', () => {
  it('"Check file" lists problems and writes nothing; a file with one bad line imports nothing', async () => {
    const good = await asStaff(FOUNDER, (tx) => importCatalog(tx, { userId: FOUNDER }, V1, { preview: true, today: TODAY }));
    expect(good).toMatchObject({ preview: true, committed: false, rowCount: 5, problems: [] });
    const bad = file(U('cbse.c7.science.u1', '1', 'Living world'), line({ class: '8', level: 'unit', key: 'cbse.c8.science.u1', title_en: 'Fine' }), T('cbse.c7.science.t9', 'cbse.c7.science.nowhere', '1', 'Lost'));
    const r = await asStaff(FOUNDER, (tx) => importCatalog(tx, { userId: FOUNDER }, bad, { preview: false, today: TODAY }));
    expect(r.committed).toBe(false);
    expect(r.problems).toEqual([{ line: 4, code: 'parent_unknown', value: 'cbse.c7.science.nowhere' }]);
    const unknownBoard = await asStaff(FOUNDER, (tx) => importCatalog(tx, { userId: FOUNDER }, file(line({ board: 'NOPE', level: 'unit', key: 'nope.c7.u1', title_en: 'X' })), { preview: false, today: TODAY }));
    expect(unknownBoard.problems).toEqual([{ line: 2, code: 'board_unknown', value: 'NOPE' }]);
    expect(await owner(`select 1 from content.syllabus_versions`)).toHaveLength(0);
    expect(await owner(`select 1 from content.units`)).toHaveLength(0);
    expect(await auditActions()).toHaveLength(0);
  });

  it('a good file: one version in review per syllabus, imported by this account, with an audit row of ids and counts', async () => {
    const r = await asStaff(FOUNDER, (tx) => importCatalog(tx, { userId: FOUNDER }, V1, { preview: false, today: TODAY }));
    expect(r).toMatchObject({ committed: true, problems: [] });
    expect(r.versions).toHaveLength(1);
    expect(r.versions[0]).toMatchObject({ board: 'CBSE', classLevel: 7, subject: 'science', academicYear: '2026-27', versionNo: 1, units: 1, chapters: 2, topics: 2 });
    v1 = r.versions[0].versionId;
    expect(await owner(`select status, audience, import_source, imported_by from content.syllabus_versions where version_id = $1`, [v1])).toEqual([{ status: 'in_review', audience: null, import_source: 'control', imported_by: FOUNDER }]);
    const audit = await auditActions();
    expect(audit).toEqual([{ event_action: 'content.syllabus.imported', school_id: null, target_id: v1, after_state: { versionNo: 1, units: 1, chapters: 2, topics: 2 } }]);
  });
});

describe('two-person review', () => {
  it('the importing account cannot approve its own import: refused here, and by the database', async () => {
    expect(await asStaff(FOUNDER, (tx) => approveVersion(tx, { userId: FOUNDER }, v1))).toEqual({ ok: false, reason: 'own_import' });
    await expect(
      asStaff(FOUNDER, (tx) => tx.query(`update content.syllabus_versions set status = 'published', audience = 'staff_preview', approved_by = $2, approved_at = now() where version_id = $1`, [v1, FOUNDER]))
    ).rejects.toThrow(/check constraint/);
    expect((await counts())[0]).toMatchObject({ status: 'in_review', audience: null });
  });

  it('another super_admin approves it to staff preview; no family sees any of it', async () => {
    expect(await asStaff(SECOND, (tx) => approveVersion(tx, { userId: SECOND }, v1))).toEqual({ ok: true, versionId: v1 });
    expect((await counts())[0]).toMatchObject({ status: 'published', audience: 'staff_preview' });
    expect(await familyRows()).toEqual({ versions: 0, units: 0, chapters: 0, topics: 0 });
    expect(await familyCatalog()).toBeNull();
    // Approving twice is refused.
    expect(await asStaff(SECOND, (tx) => approveVersion(tx, { userId: SECOND }, v1))).toEqual({ ok: false, reason: 'not_in_review' });
  });

  it('the staff preview shows exactly the structure, with both titles', async () => {
    const p = await asStaff(SECOND, (tx) => previewVersion(tx, { userId: SECOND }, v1));
    expect(p!.version).toMatchObject({ status: 'published', audience: 'staff_preview', importedByMe: false, approved: true, units: 1, chapters: 2, topics: 2 });
    expect(p!.units).toEqual([
      {
        key: 'cbse.c7.science.u1',
        titleEn: 'Living world',
        titleHi: null,
        chapters: [
          {
            key: 'cbse.c7.science.u1.ch01',
            titleEn: 'Cells',
            titleHi: 'कोशिका',
            topics: [
              { key: 'cbse.c7.science.u1.ch01.t01', titleEn: 'Cell parts', titleHi: null },
              { key: 'cbse.c7.science.u1.ch01.t02', titleEn: 'Cell division', titleHi: null },
            ],
          },
          { key: 'cbse.c7.science.u1.ch02', titleEn: 'Plants', titleHi: null, topics: [] },
        ],
      },
    ]);
  });
});

describe('release, the family read, the diff and one-step roll back', () => {
  it('released to everyone, a family reads it in its language, English where no Hindi title was printed', async () => {
    expect(await asStaff(SECOND, (tx) => releaseVersion(tx, { userId: SECOND }, v1))).toEqual({ ok: true, versionId: v1 });
    expect(await familyRows()).toEqual({ versions: 1, units: 1, chapters: 2, topics: 2 });
    const en = await familyCatalog('en');
    expect(en).toMatchObject({ versionId: v1, academicYear: '2026-27', versionNo: 1 });
    expect(en!.chapters.map((c) => [c.title, c.unitTitle, c.topics.map((t) => t.title)])).toEqual([
      ['Cells', 'Living world', ['Cell parts', 'Cell division']],
      ['Plants', 'Living world', []],
    ]);
    const hi = await familyCatalog('hi');
    expect(hi!.chapters.map((c) => c.title)).toEqual(['कोशिका', 'Plants']);
    // Another academic year has nothing released.
    expect(await familyCatalog('en', '2027-04-01')).toBeNull();
    // A family cannot write content.
    await expect(asFamily((tx) => tx.query(`update content.syllabus_versions set audience = 'everyone' where class_level = 7`))).rejects.toThrow(/permission denied/);
  });

  it('a second version: reviewed and in staff preview while families keep the first; compared line by line', async () => {
    const r = await asStaff(SECOND, (tx) => importCatalog(tx, { userId: SECOND }, V2, { preview: false, today: TODAY }));
    v2 = r.versions[0].versionId;
    expect(r.versions[0].versionNo).toBe(2);
    expect(await asStaff(SECOND, (tx) => approveVersion(tx, { userId: SECOND }, v2))).toEqual({ ok: false, reason: 'own_import' });
    expect(await asStaff(FOUNDER, (tx) => approveVersion(tx, { userId: FOUNDER }, v2))).toMatchObject({ ok: true });
    expect((await familyCatalog())!.versionId).toBe(v1);
    const d = await asStaff(FOUNDER, (tx) => diffVersions(tx, { userId: FOUNDER }, v1, v2));
    if (!d.ok) throw new Error(d.reason);
    expect(d.diff.added.map((l) => l.key)).toEqual(['cbse.c7.science.u1.ch03']);
    expect(d.diff.removed.map((l) => l.key).sort()).toEqual(['cbse.c7.science.u1.ch01.t02', 'cbse.c7.science.u1.ch02']);
    expect(d.diff.renamed.map((l) => [l.key, l.from.titleEn, l.to.titleEn])).toEqual([['cbse.c7.science.u1.ch01', 'Cells', 'Cells and tissues']]);
    expect(d.diff.moved.map((l) => [l.key, l.from.position, l.to.position])).toEqual([['cbse.c7.science.u1.ch01', 1, 2]]);
    const list = await asStaff(FOUNDER, (tx) => listVersions(tx, { userId: FOUNDER }));
    expect(list.find((v) => v.versionId === v2)).toMatchObject({ previousVersionId: v1, audience: 'staff_preview', canRollBack: false });
  });

  it('release replaces the first; roll back withdraws the second and gives everyone the first again, in one step', async () => {
    expect(await asStaff(FOUNDER, (tx) => releaseVersion(tx, { userId: FOUNDER }, v2))).toMatchObject({ ok: true });
    expect((await familyCatalog())!.versionId).toBe(v2);
    expect((await counts()).map((c) => `${c.status}/${c.audience}`)).toEqual(['superseded/null', 'published/everyone']);
    const list = await asStaff(FOUNDER, (tx) => listVersions(tx, { userId: FOUNDER }));
    expect(list.find((v) => v.versionId === v2)!.canRollBack).toBe(true);

    expect(await asStaff(FOUNDER, (tx) => rollBackVersion(tx, { userId: FOUNDER }, v1))).toEqual({ ok: false, reason: 'not_current' });
    expect(await asStaff(FOUNDER, (tx) => rollBackVersion(tx, { userId: FOUNDER }, v2))).toEqual({ ok: true, versionId: v2, restoredVersionId: v1 });
    expect((await counts()).map((c) => `${c.status}/${c.audience}`)).toEqual(['published/everyone', 'withdrawn/null']);
    expect((await familyCatalog())!.versionId).toBe(v1);
    // Nothing older to go back to now.
    expect(await asStaff(FOUNDER, (tx) => rollBackVersion(tx, { userId: FOUNDER }, v1))).toEqual({ ok: false, reason: 'no_previous' });
    const audit = await auditActions();
    expect(audit.map((a) => a.event_action)).toEqual([
      'content.syllabus.imported',
      'content.syllabus.approved',
      'content.syllabus.released',
      'content.syllabus.imported',
      'content.syllabus.approved',
      'content.syllabus.released',
      'content.syllabus.rolled_back',
    ]);
    expect(audit.every((a) => a.school_id === null)).toBe(true);
    expect(audit.at(-1)).toMatchObject({ target_id: v2, after_state: { restoredVersionId: v1 } });
  });

  it('reject needs a note; a rejected version cannot be approved', async () => {
    const r = await asStaff(FOUNDER, (tx) => importCatalog(tx, { userId: FOUNDER }, V2, { preview: false, today: TODAY }));
    const v3 = r.versions[0].versionId;
    expect(await asStaff(SECOND, (tx) => rejectVersion(tx, { userId: SECOND }, v3, '  '))).toEqual({ ok: false, reason: 'note_needed' });
    expect(await asStaff(SECOND, (tx) => rejectVersion(tx, { userId: SECOND }, v3, 'Chapter 2 is missing from the document.'))).toEqual({ ok: true, versionId: v3 });
    expect(await owner(`select status, review_note from content.syllabus_versions where version_id = $1`, [v3])).toEqual([{ status: 'rejected', review_note: 'Chapter 2 is missing from the document.' }]);
    expect(await asStaff(SECOND, (tx) => approveVersion(tx, { userId: SECOND }, v3))).toEqual({ ok: false, reason: 'not_in_review' });
    expect((await auditActions()).at(-1)).toMatchObject({ event_action: 'content.syllabus.rejected', after_state: { note: true } });
  });
});

describe('the committed catalog, loaded from the repository', () => {
  const text = readFileSync(path.resolve(__dirname, '../../data/catalog/cbse-2026-27-maths-science.csv'), 'utf8');
  const REF = 'netcyberai-core#m1-4';

  it('loads once however often it runs, in review, with no importing account; any super_admin may approve it', async () => {
    const sql = catalogSql(text, REF);
    await db.pg.exec(sql);
    await db.pg.exec(sql);
    const versions = (await owner(
      `select version_id, class_level, subject, version_no, status, import_source, import_ref, imported_by,
              (select count(*)::int from content.units u where u.version_id = v.version_id) as units,
              (select count(*)::int from content.chapters c where c.version_id = v.version_id) as chapters,
              (select count(*)::int from content.topics t where t.version_id = v.version_id) as topics
         from content.syllabus_versions v where import_source = 'repository' order by class_level, subject`
    )) as { version_id: string; class_level: number; subject: string; version_no: number; status: string; import_ref: string; imported_by: string | null; units: number; chapters: number; topics: number }[];
    const fileCount = (cls: number, subject: string, level: string) => text.split('\n').filter((l) => l.startsWith(`CBSE,${cls},${subject},2026-27,${level},`)).length;
    expect(versions.map((v) => [v.class_level, v.subject, v.version_no, v.status, v.import_ref, v.imported_by])).toEqual([
      [9, 'mathematics', 1, 'in_review', REF, null],
      [9, 'science', 1, 'in_review', REF, null],
      [10, 'mathematics', 1, 'in_review', REF, null],
      [10, 'science', 1, 'in_review', REF, null],
    ]);
    for (const v of versions) {
      expect([v.units, v.chapters, v.topics]).toEqual([fileCount(v.class_level, v.subject, 'unit'), fileCount(v.class_level, v.subject, 'chapter'), fileCount(v.class_level, v.subject, 'topic')]);
    }
    expect(await asStaff(FOUNDER, (tx) => approveVersion(tx, { userId: FOUNDER }, versions[0].version_id))).toMatchObject({ ok: true });
    // Still nothing for families until it is released.
    expect(await asFamily((tx) => readFamilyCatalog(tx, { board: 'CBSE', classLevel: 9, subject: 'mathematics', lang: 'en', today: TODAY }))).toBeNull();
    expect(await asStaff(FOUNDER, (tx) => releaseVersion(tx, { userId: FOUNDER }, versions[0].version_id))).toMatchObject({ ok: true });
    const m9 = await asFamily((tx) => readFamilyCatalog(tx, { board: 'CBSE', classLevel: 9, subject: 'mathematics', lang: 'hi', today: TODAY }));
    expect(m9!.chapters).toHaveLength(versions[0].chapters);
    expect(m9!.chapters[0]).toMatchObject({ title: 'Number System', unitTitle: 'Number System' });
    expect(m9!.chapters[0].topics[0].title).toBe('Introduction to rational numbers');
  });

  it('the script refuses a load without the pull request named', () => {
    expect(() => catalogSql(text, '')).toThrow(/--ref/);
  });

  it('quotes in a title are escaped, never pasted in', async () => {
    const tricky = file(line({ class: '6', subject: 'mathematics', level: 'unit', key: 'cbse.c6.mathematics.u1', title_en: `"It's ""x""); drop table content.units; --"` }));
    await db.pg.exec(catalogSql(tricky, 'netcyberai-core#quote'));
    expect(await owner(`select title_en from content.units u join content.syllabus_versions v using (version_id) where v.class_level = 6`)).toEqual([{ title_en: `It's "x"); drop table content.units; --` }]);
  });
});
