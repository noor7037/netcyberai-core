// S3 (C376): the content studio's harness pictures. Two requests of the 'full' family's second child (Class 9): one
// Received (with a made-up PDF key, nothing is stored), one Digitizing, whose draft holds NetCyberAI's own water-cycle
// blocks (the showcase chapter, read from the repository) marked reviewed, so the screen shows Publish. Throwaway
// database only; clearStudio() removes it all.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FAMILY_ACCOUNT = 'f0000000-0000-4000-8000-0000000f0004';
const CHILD = 'f0000000-0000-4000-8000-0000000fc002';
export const STUDIO_RECEIVED = '00000000-0000-4000-8000-00000000a3b1';
export const STUDIO_DIGITIZING = '00000000-0000-4000-8000-00000000a3b2';
export const STUDIO_KEY = `nc.req.${STUDIO_DIGITIZING}`;

export async function seedStudio(db, founder) {
  const water = JSON.parse(readFileSync(path.join(ROOT, 'src/lib/family/showcase/water-cycle.json'), 'utf8'));
  await db.pg.query(
    `insert into content.chapter_requests (request_id, account_id, child_id, board_id, class_level, subject, title, source, upload_key, status)
     values ($1, $2, $3, 'CBSE', 9, 'mathematics', 'Polynomials, from our own book', 'parent_upload', $4, 'received') on conflict (request_id) do nothing`,
    [STUDIO_RECEIVED, FAMILY_ACCOUNT, CHILD, `family/${FAMILY_ACCOUNT}/chapter-requests/${STUDIO_RECEIVED}.pdf`]
  );
  await db.pg.query(
    `insert into content.chapter_requests (request_id, account_id, child_id, board_id, class_level, subject, title, source, status, chapter_key, claimed_by)
     values ($1, $2, $3, 'CBSE', 9, 'science', 'How water moves, from our own book', 'catalog', 'digitizing', $4, $5) on conflict (request_id) do nothing`,
    [STUDIO_DIGITIZING, FAMILY_ACCOUNT, CHILD, STUDIO_KEY, founder]
  );
  // The first child (Class 7) has two of her own, for the parent area's list.
  const ASHA = 'f0000000-0000-4000-8000-0000000fc001';
  await db.pg.query(
    `insert into content.chapter_requests (request_id, account_id, child_id, board_id, class_level, subject, title, source, upload_key, status, chapter_key, claimed_by) values
       ('00000000-0000-4000-8000-00000000a3b3', $1, $2, 'CBSE', 7, 'science', 'Light and shadows', 'catalog', null, 'received', null, null),
       ('00000000-0000-4000-8000-00000000a3b4', $1, $2, 'CBSE', 7, 'mathematics', 'Fractions, from our own book', 'parent_upload', null, 'digitizing', 'nc.req.00000000-0000-4000-8000-00000000a3b4', $3)
     on conflict (request_id) do nothing`,
    [FAMILY_ACCOUNT, ASHA, founder]
  );
  await db.pg.query(
    `insert into content.chapter_contents (chapter_key, version_no, subject, board_id, class_level, title_en, title_hi, blocks, status, source, request_id, owner_account_id, child_id, created_by, reviewed_by, reviewed_at)
     values ($1, 1, 'science', 'CBSE', 9, $2, $3, $4::jsonb, 'reviewed', 'catalog', $5, $6, $7, $8, $8, now()) on conflict (chapter_key, version_no) do nothing`,
    [STUDIO_KEY, water.title.en, water.title.hi, JSON.stringify(water.blocks), STUDIO_DIGITIZING, FAMILY_ACCOUNT, CHILD, founder]
  );
}

export async function clearStudio(db) {
  await db.pg.query(`delete from content.chapter_contents where chapter_key = $1`, [STUDIO_KEY]);
  await db.pg.query(`delete from content.chapter_requests where account_id = $1`, [FAMILY_ACCOUNT]);
}
