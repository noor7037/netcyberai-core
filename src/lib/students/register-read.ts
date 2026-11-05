import type { PoolClient } from 'pg';
import { activePromptVersion, prepareText, type AiRefusal, type ChatImage, type PreparedText } from '@/lib/ai/platform';
import { registerOcrPrompt } from '@/lib/ai/prompts/students.register_ocr';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { loadEntitlements } from '@/lib/frameworks/entitlements';
import { jpegSize, stripMetadata } from '@/lib/marking/upload';
import { readPdf } from '@/lib/privacy/pdf-text';
import { sniffImageType } from '@/lib/storage/file-storage';
import { indiaDate } from '@/lib/time/india';
import { CONFIDENCE_FLOOR, parseRegister, type RegisterRow } from './register-ocr';

// The server side of reading a register page (W21-M5): the pictures checked, the AI asked through the platform's
// students.register_ocr profile (its chain, the minors check on every provider, the metering and the ledger), and one
// audit row of counts. Nothing of the register is stored and none of its words reach a log: the rows go back to the
// office's review screen, and are written only when the office imports them (src/app/api/app/students/import).

// The host refuses a body over 4.5 MB; a page the review screen sends is a JPEG it made, under 1.5 MB.
export const REGISTER_MAX_BYTES = 4_000_000;
export const REGISTER_MAX_PAGES = 3;
// Reads a school may ask for in an India day: a cost guard, as the marking pages limit is for answer sheets.
export const REGISTER_DAILY_READS = 30;
export const REGISTER_EVENT = 'students.register_ocr';
const MIN_EDGE = 200;

export type RegisterFile = { bytes: Uint8Array };
export type PageProblem = 'no_file' | 'too_large' | 'too_many' | 'not_a_page' | 'too_small' | 'pdf_no_scan';

const isPdf = (b: Uint8Array) => b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d;
const base64 = (b: Uint8Array) => Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString('base64');
const pngSize = (b: Uint8Array) => (b.length >= 24 ? { width: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0, height: ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0 } : null);

function jpegPage(bytes: Uint8Array): ChatImage | PageProblem {
  // What a camera adds (the place, the phone) is left out before the picture goes anywhere.
  const clean = stripMetadata(bytes);
  const size = clean ? jpegSize(clean) : null;
  if (!clean || !size) return 'not_a_page';
  if (size.width < MIN_EDGE || size.height < MIN_EDGE) return 'too_small';
  return { mediaType: 'image/jpeg', base64: base64(clean) };
}

// The files as page pictures for the model: a JPEG or a PNG photo (by its own first bytes, never its name or the type
// the browser claims), or a PDF scan's pictures (a PDF of drawn text alone has none to read). WebP and anything else
// are refused, as is more than REGISTER_MAX_PAGES pages or REGISTER_MAX_BYTES together.
export function registerPages(files: readonly RegisterFile[]): { ok: true; images: ChatImage[] } | { ok: false; reason: PageProblem } {
  if (files.length === 0 || files.some((f) => f.bytes.length === 0)) return { ok: false, reason: 'no_file' };
  if (files.reduce((n, f) => n + f.bytes.length, 0) > REGISTER_MAX_BYTES) return { ok: false, reason: 'too_large' };
  const images: ChatImage[] = [];
  for (const { bytes } of files) {
    const type = sniffImageType(bytes);
    let found: (ChatImage | PageProblem)[];
    if (type === 'image/jpeg') found = [jpegPage(bytes)];
    else if (type === 'image/png') {
      const size = pngSize(bytes);
      found = [!size || size.width === 0 ? 'not_a_page' : size.width < MIN_EDGE || size.height < MIN_EDGE ? 'too_small' : { mediaType: 'image/png', base64: base64(bytes) }];
    } else if (isPdf(bytes)) {
      const pdf = readPdf(bytes);
      if (pdf.encrypted || pdf.jpegs.length === 0) return { ok: false, reason: 'pdf_no_scan' };
      found = pdf.jpegs.map(jpegPage);
    } else return { ok: false, reason: 'not_a_page' };
    for (const f of found) {
      if (typeof f === 'string') return { ok: false, reason: f };
      images.push(f);
    }
  }
  if (images.length > REGISTER_MAX_PAGES) return { ok: false, reason: 'too_many' };
  return { ok: true, images };
}

type Actor = { schoolId: string; userId: string; role: StaffRole };
export type RegisterAsk = { ok: true; text: PreparedText; day: string } | { ok: false; reason: 'read_only' | 'daily_limit' | AiRefusal };

// Reads the school asked for since the start of today in India (the audit rows, which carry counts only).
async function readsToday(db: PoolClient, schoolId: string): Promise<number> {
  const { rows } = await db.query(
    `select count(*)::int as n from audit_log
      where school_id = $1 and event_action = $2 and occurred_at >= (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')`,
    [schoolId, REGISTER_EVENT]
  );
  return Number(rows[0]?.n ?? 0);
}

// 1. In the school's transaction: may it read now, and the request through the platform's checks. The request carries
// the pictures and their count only: no name, no school, no list of classes.
export async function prepareRegisterRead(db: PoolClient, actor: Actor, images: readonly ChatImage[]): Promise<RegisterAsk> {
  const entitlements = await loadEntitlements(db, actor.schoolId);
  if (entitlements.accessMode !== 'full' && entitlements.accessMode !== 'grace') return { ok: false, reason: 'read_only' };
  if ((await readsToday(db, actor.schoolId)) >= REGISTER_DAILY_READS) return { ok: false, reason: 'daily_limit' };
  const day = indiaDate();
  const prompt = registerOcrPrompt(await activePromptVersion(db, 'students.register_ocr'));
  const ask = { pages: images.length };
  const p = await prepareText(db, { accountId: actor.schoolId, childFirstNames: [], day }, 'students.register_ocr', {
    system: prompt.system(ask),
    messages: [{ role: 'user', content: prompt.user(ask), images: [...images] }],
    responseFormat: 'json',
    maxTokens: 4000,
    temperature: 0,
  });
  return p.ok ? { ok: true, text: p.text, day } : { ok: false, reason: p.reason };
}

export type RegisterAnswer = { ok: true; rows: RegisterRow[]; floor: number } | { ok: false; reason: 'failed' | 'not_json' };

// 2. With no connection held: the model reads the pages; the answer is cleaned. 3. Back in a transaction: the metering
// and the ledger (the platform's record) and one audit row of counts, never the words read.
export async function sendRegisterRead(text: PreparedText, record: (save: (db: PoolClient) => Promise<void>) => Promise<void>, actor: Actor, pages: number): Promise<RegisterAnswer> {
  const sent = await text.send();
  const parsed = sent.result.ok ? parseRegister(sent.result.text) : null;
  const answer: RegisterAnswer = !sent.result.ok ? { ok: false, reason: 'failed' } : parsed?.ok ? { ok: true, rows: parsed.rows, floor: CONFIDENCE_FLOOR } : { ok: false, reason: 'not_json' };
  await record(async (db) => {
    await sent.record(db);
    await writeAuditLog(db, {
      schoolId: actor.schoolId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      eventAction: REGISTER_EVENT,
      targetType: 'register_page',
      afterState: {
        pages,
        outcome: answer.ok ? 'read' : answer.reason,
        rows: answer.ok ? answer.rows.length : 0,
        provider: sent.result.ok ? sent.result.provider : null,
        model: sent.result.ok ? sent.result.model : null,
      },
    });
  });
  return answer;
}
