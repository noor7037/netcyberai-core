import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// W9-D: the coverage manifest on the real migrations (PGlite): a unit with every chapter published, one with a draft
// only, one with nothing, a unit of another class; a parent's private upload and a retired version count for nothing;
// the open request is matched to its chapter; the totals and the share published; the filters; the CSV has the byte
// order mark and the Hindi title intact; and the export route lets in NetCyberAI staff only. Every name here is made up.

const h = vi.hoisted(() => ({ db: null as unknown as { pg: { transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>; query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }; stop: () => Promise<void> } }));

vi.mock('@/lib/auth/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/db')>();
  return {
    ...real,
    withTenantContext: (claims: { role: string; sub: string; schoolId: string | null }, fn: (db: unknown) => Promise<unknown>) =>
      h.db.pg.transaction(async (tx: any) => {
        await tx.query(`set local role ${claims.role === 'super_admin' ? 'nca_super' : 'app_user'}`);
        await tx.query(`select set_config('app.current_tenant_id', $1, true)`, [claims.schoolId ?? '00000000-0000-0000-0000-000000000000']);
        await tx.query(`select set_config('app.current_role', $1, true)`, [claims.role]);
        await tx.query(`select set_config('app.current_user_id', $1, true)`, [claims.sub]);
        return fn(tx);
      }),
  };
});

// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { COVERAGE_CSV_HEADER, coverage, coverageCsvRow, parseCoverageFilters, unitStatus } from '@/lib/content/coverage';
import { toCsv } from '@/lib/export/csv';
import { GET as exportRoute } from '@/app/api/control/content/coverage/export/route';
import type { Sql } from '@/lib/jobs/types';

const FOUNDER = 'c9d00000-0000-4000-8000-0000000000f1';
const PRINCIPAL = 'c9d00000-0000-4000-8000-0000000000a1';
const SCHOOL = 'c9d00000-0000-4000-8000-0000000000b1';
const ACCOUNT = 'c9d00000-0000-4000-8000-0000000000c1';
const CHILD = 'c9d00000-0000-4000-8000-0000000000c2';
const SRC = 'https://example.org/syllabus.pdf';
const q = async (sql: string, params: unknown[] = []) => (await h.db.pg.query(sql, params)).rows;
const asStaff = <T>(fn: (db: Sql) => Promise<T>): Promise<T> =>
  h.db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });

let founder = '';
let principal = '';

async function cookieFor(sub: string, role: string, schoolId: string | null) {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal: role === 'super_admin' ? 'aal2' : 'aal1', sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
const get = (cookie: string | null, search = '') =>
  exportRoute(new NextRequest(`https://www.netcyberai.test/api/control/content/coverage/export${search}`, { headers: cookie ? { cookie } : {} }));

async function chapter(versionId: string, unitId: string | null, key: string, position: number, title: string) {
  await q(`insert into content.chapters (version_id, unit_id, chapter_key, position, title_en, source_url, source_page, checked_on) values ($1, $2, $3, $4, $5, $6, '1', '2026-10-20')`, [versionId, unitId, key, position, title, SRC]);
}
async function content(key: string, status: 'draft' | 'reviewed' | 'published' | 'retired', over: { subject?: string; class?: number; owner?: boolean; version?: number; publishedAt?: string } = {}) {
  const by = status === 'draft' ? null : FOUNDER;
  const at = status === 'draft' ? null : over.publishedAt ?? '2026-10-25T10:00:00Z';
  await q(
    `insert into content.chapter_contents (chapter_key, version_no, subject, board_id, class_level, title_en, title_hi, blocks, status, source, owner_account_id, child_id, created_by, reviewed_by, reviewed_at, published_by, published_at, retired_at)
     values ($1, $2, $3, 'CBSE', $4, 'Made-up chapter', 'बनावटी अध्याय', '{"en": [], "hi": []}', $5, 'studio', $6, $7, $8, $9, $10, $11, $12, $13)`,
    [key, over.version ?? 1, over.subject ?? 'science', over.class ?? 7, status, over.owner ? ACCOUNT : null, over.owner ? CHILD : null, FOUNDER, by, at, status === 'published' || status === 'retired' ? by : null, status === 'published' || status === 'retired' ? at : null, status === 'retired' ? at : null]
  );
}

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-coverage-route-tests-0123456789';
  h.db = await startHarnessDb({ port: 0 });
  await q(`insert into schools (school_id, name, jurisdiction) values ($1, 'Made-up School', 'IN-HR')`, [SCHOOL]);
  await q(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Farid Founder'), ($2, $3, 'principal', 'Priya Principal')`, [FOUNDER, PRINCIPAL, SCHOOL]);

  const version = async (cls: number, subject: string, status = 'published') =>
    (
      await q(
        `insert into content.syllabus_versions (board_id, class_level, subject, academic_year, version_no, status, audience, import_source, approved_by)
         values ('CBSE', $1, $2, '2026-27', 1, $3, $4, 'repository', $5) returning version_id`,
        [cls, subject, status, status === 'published' ? 'everyone' : null, status === 'published' ? FOUNDER : null]
      )
    )[0].version_id as string;
  const unit = async (versionId: string, key: string, position: number, en: string, hi: string | null) =>
    (await q(`insert into content.units (version_id, unit_key, position, title_en, title_hi, source_url, source_page, checked_on) values ($1, $2, $3, $4, $5, $6, '1', '2026-10-20') returning unit_id`, [versionId, key, position, en, hi, SRC]))[0].unit_id as string;
  const topic = async (versionId: string, chapterKey: string, key: string, position: number, title: string) =>
    q(`insert into content.topics (version_id, chapter_id, topic_key, position, title_en, source_url, source_page, checked_on) select $1, chapter_id, $3, $4, $5, $6, '1', '2026-10-20' from content.chapters where version_id = $1 and chapter_key = $2`, [versionId, chapterKey, key, position, title, SRC]);

  // Class 7 Science: three units.
  const v7 = await version(7, 'science');
  const living = await unit(v7, 'cbse.c7.science.u1', 1, 'Living world', 'जीवित संसार');
  const matter = await unit(v7, 'cbse.c7.science.u2', 2, 'Matter', null);
  const energy = await unit(v7, 'cbse.c7.science.u3', 3, 'Energy', null);
  await chapter(v7, living, 'cbse.c7.science.u1.ch01', 1, 'Cells');
  await chapter(v7, living, 'cbse.c7.science.u1.ch02', 2, 'Plants');
  await chapter(v7, matter, 'cbse.c7.science.u2.ch01', 1, 'States of matter');
  await chapter(v7, energy, 'cbse.c7.science.u3.ch01', 1, 'Heat');
  await topic(v7, 'cbse.c7.science.u1.ch01', 'cbse.c7.science.u1.ch01.t1', 1, 'Cell parts');
  await topic(v7, 'cbse.c7.science.u1.ch01', 'cbse.c7.science.u1.ch01.t2', 2, 'Cell division');
  await topic(v7, 'cbse.c7.science.u1.ch02', 'cbse.c7.science.u1.ch02.t1', 1, 'Roots');
  // Class 8 Maths: one unit, nothing in the library. A draft syllabus is not counted at all.
  const v8 = await version(8, 'mathematics');
  await unit(v8, 'cbse.c8.maths.u1', 1, 'Numbers', null);
  const vd = await version(6, 'science', 'draft');
  await unit(vd, 'cbse.c6.science.u1', 1, 'Not yet released', null);

  // The library: u1 has both chapters published (the second also has a retired older version); u2 has a draft only;
  // u3 has a parent's private published upload and a retired version, so it counts for nothing.
  await content('cbse.c7.science.u1.ch01', 'published', { publishedAt: '2026-10-20T10:00:00Z' });
  await content('cbse.c7.science.u1.ch02', 'retired', { version: 1, publishedAt: '2026-10-10T10:00:00Z' });
  await content('cbse.c7.science.u1.ch02', 'published', { version: 2, publishedAt: '2026-10-27T10:00:00Z' });
  await content('cbse.c7.science.u2.ch01', 'draft');
  await q('set session_replication_role = replica');
  await content('cbse.c7.science.u3.ch01', 'published', { owner: true });
  await content('cbse.c7.science.u3.ch01', 'retired', { version: 2 });
  // An open request for "Heat" (by title), one for Plants (by its chapter key), and a finished one that does not count.
  const request = (title: string, status: string, key: string | null) =>
    q(
      `insert into content.chapter_requests (account_id, child_id, board_id, class_level, subject, title, source, status, chapter_key, claimed_by)
       values ($1, $2, 'CBSE', 7, 'science', $3, 'catalog', $4, $5, $6)`,
      [ACCOUNT, CHILD, title, status, key, key ? FOUNDER : null]
    );
  await request('heat', 'received', null);
  await request('Leaf study', 'digitizing', 'cbse.c7.science.u1.ch02');
  await request('Cells', 'ready', 'cbse.c7.science.u1.ch01');
  await q('set session_replication_role = origin');
  founder = await cookieFor(FOUNDER, 'super_admin', null);
  principal = await cookieFor(PRINCIPAL, 'principal', SCHOOL);
}, 120_000);
afterAll(async () => {
  await h.db?.stop();
});

describe('the manifest', () => {
  it('has one row per unit of a published syllabus, with the published, draft and missing counts and the status', async () => {
    const { units } = await asStaff((db) => coverage(db, {}));
    expect(units.map((u) => [u.unitKey, u.chapters, u.published, u.reviewed, u.draft, u.none, u.status])).toEqual([
      ['cbse.c7.science.u1', 2, 2, 0, 0, 0, 'published'],
      ['cbse.c7.science.u2', 1, 0, 0, 1, 0, 'partly'],
      ['cbse.c7.science.u3', 1, 0, 0, 0, 1, 'missing'],
      ['cbse.c8.maths.u1', 0, 0, 0, 0, 0, 'missing'],
    ]);
    expect(units.map((u) => u.unitKey)).not.toContain('cbse.c6.science.u1');
  });

  it('counts the topics, the open requests that name a chapter (by key or by title) and the last day one was published', async () => {
    const { units } = await asStaff((db) => coverage(db, {}));
    const byKey = Object.fromEntries(units.map((u) => [u.unitKey, u]));
    expect(byKey['cbse.c7.science.u1'].topics).toBe(3);
    expect(byKey['cbse.c7.science.u1'].openRequests).toBe(1);
    expect(byKey['cbse.c7.science.u1'].lastPublished).toBe('2026-10-27');
    expect(byKey['cbse.c7.science.u3'].openRequests).toBe(1);
    expect(byKey['cbse.c7.science.u2'].openRequests).toBe(0);
    expect(byKey['cbse.c7.science.u2'].lastPublished).toBeNull();
  });

  it('totals each board, class and subject with the share published, and reads a filter', async () => {
    const all = await asStaff((db) => coverage(db, {}));
    const t7 = all.totals.find((t) => t.classLevel === 7)!;
    expect(t7).toMatchObject({ boardId: 'CBSE', subject: 'science', units: 3, unitsPublished: 1, chapters: 4, published: 2, draft: 1, none: 1, openRequests: 2, publishedShare: 50 });
    expect(all.totals.find((t) => t.classLevel === 8)).toMatchObject({ units: 1, chapters: 0, publishedShare: null });
    expect(all.all).toEqual({ units: 4, chapters: 4, published: 2, publishedShare: 50 });
    const one = await asStaff((db) => coverage(db, { classLevel: 8 }));
    expect(one.units).toHaveLength(1);
    expect((await asStaff((db) => coverage(db, { subject: 'science' }))).units).toHaveLength(3);
    expect((await asStaff((db) => coverage(db, { boardId: 'ICSE' }))).units).toHaveLength(0);
  });

  it('reads the filter from an address and ignores a bad value', () => {
    expect(parseCoverageFilters(new URLSearchParams('board=CBSE&class=7&subject=science'))).toEqual({ boardId: 'CBSE', classLevel: 7, subject: 'science' });
    expect(parseCoverageFilters(new URLSearchParams('board=x;drop&class=99&subject=Sci'))).toEqual({ boardId: null, classLevel: null, subject: null });
    expect(unitStatus({ chapters: 0, published: 0, reviewed: 0, draft: 0 })).toBe('missing');
    expect(unitStatus({ chapters: 2, published: 1, reviewed: 1, draft: 0 })).toBe('partly');
  });
});

describe('the CSV export', () => {
  it('starts with the byte order mark and keeps the Hindi title', async () => {
    const { units } = await asStaff((db) => coverage(db, {}));
    const csv = toCsv(COVERAGE_CSV_HEADER, units.map(coverageCsvRow));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('जीवित संसार');
    expect(csv.split('\r\n')[0]).toContain('Board,Class,Subject');
  });

  it('the route gives staff the file with the filter applied, and writes one audit row', async () => {
    const res = await get(founder, '?class=7');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('जीवित संसार');
    expect(text).toContain('cbse.c7.science.u2');
    expect(text).not.toContain('cbse.c8.maths.u1');
    const audit = await q(`select event_action, after_state from audit_log where event_action = 'content.coverage_exported'`);
    expect(audit).toHaveLength(1);
    expect(audit[0].after_state).toMatchObject({ classLevel: 7, rows: 3 });
  });

  it('the route refuses no session (401) and a school principal (403)', async () => {
    expect((await get(null)).status).toBe(401);
    expect((await get(principal)).status).toBe(403);
    expect((await q(`select 1 from audit_log where event_action = 'content.coverage_exported'`)).length).toBe(1);
  });
});
