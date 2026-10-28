import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { attachedText, pdfText, TUTOR_PDF_PAGES, TUTOR_READ_TOTAL_CHARS } from '@/lib/family/tutor-read';
import { TUTOR_READS_FILES } from '@/lib/family/tutor-shape';

// W4-1 (C230-AR; Decision Log C385): the tutor reads what is attached. On the real migrations (PGlite), the real route
// and the real resolver; the AI platform's two calls are stood in for (the photo read through the vision profile, and
// the answer), and the tutor's private bucket is a store in memory. Made-up names only.
//   1. A PDF's text layer is read on the server (page-limited); a scan with no text is said so, not guessed.
//   2. A photo goes to the vision profile (family.homework) and takes a photo place of the child's day.
//   3. What the files say joins the question, so the safety check reads it before anything is sent.
//   4. A file that cannot be read is said so in the answer: none is dropped in silence.
//   5. Another child's file, or one already withdrawn by consent, is never read.

const ai = vi.hoisted(() => ({ asked: [] as { profile: string; system: string; content: string; images: number }[], photoText: 'What is 7 x 8?', photoOff: false, safetyOff: false, left: 100, checked: [] as string[] }));
vi.mock('@/lib/ai/platform', async (original) => ({
  ...(await original<typeof import('@/lib/ai/platform')>()),
  activePromptVersion: async () => 'v1',
  prepareText: async (_db: unknown, _ctx: unknown, profile: string, request: { system: string; messages: { content: string; images?: unknown[] }[] }) => {
    if (profile === 'family.homework' && ai.photoOff) return { ok: false, reason: 'not_switched_on' };
    const m = request.messages[request.messages.length - 1];
    ai.asked.push({ profile, system: request.system, content: m.content, images: m.images?.length ?? 0 });
    const lines = profile === 'family.homework' ? [ai.photoText] : [JSON.stringify({ type: 'subject', subject: 'mathematics' }), JSON.stringify({ type: 'explanation', title: 'Times tables', idea: 'Multiplying is adding the same number again.', example: 'Seven times eight is eight sevens.', steps: ['Count by sevens', 'Stop at the eighth'], terms: [{ en: 'product', local: 'gunanphal' }] })];
    return {
      ok: true,
      text: {
        send: async (onDelta?: (t: string) => void) => {
          for (const l of lines) onDelta?.(`${l}\n`);
          return { result: { ok: true, text: lines.join('\n'), tokensIn: 1, tokensOut: 1, provider: 'stand-in', model: 'm' }, record: async () => {} };
        },
      },
    };
  },
  dailyRequestsLeft: async () => ai.left,
  prepareModeration: async () => ai.safetyOff ? { ok: false, reason: 'not_switched_on' } : ({ ok: true, moderation: { check: async (t: { user: string }) => (ai.checked.push(t.user), { safe: true, categories: [] }), record: async () => {} } }),
}));
const store = vi.hoisted(() => ({ files: new Map<string, Uint8Array>() }));
vi.mock('@/lib/family/tutor', async (original) => ({
  ...(await original<typeof import('@/lib/family/tutor')>()),
  tutorStorage: { get: async (key: string) => store.files.get(key) ?? null },
}));

const ACCOUNT = 'f4100000-0000-4000-8000-0000000000a1';
const OTHER = 'f4100000-0000-4000-8000-0000000000b1';
const CHILD = 'f4100000-0000-4000-8000-0000000000c1';
const OTHER_CHILD = 'f4100000-0000-4000-8000-0000000000c2';
const CONV = 'f4100000-0000-4000-8000-0000000000d1';
const OTHER_CONV = 'f4100000-0000-4000-8000-0000000000d2';
const id = (n: number) => `f4100000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const keyOf = (account: string, child: string, n: number, ext: string) => `${account}/${child}/${id(n)}.${ext}`;

// A PDF with one page of text per entry (Helvetica, no embedded fonts), and one with a page and no text at all (a scan).
function pdfOf(pages: string[]): Uint8Array {
  const objs: string[] = [];
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  objs.push('<</Type/Catalog/Pages 2 0 R>>', `<</Type/Pages/Kids[${kids}]/Count ${pages.length}>>`, '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>');
  pages.forEach((text, i) => {
    const stream = text ? `BT /F1 12 Tf 20 100 Td (${text}) Tj ET` : '';
    objs.push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents ${5 + i * 2} 0 R/Resources<</Font<</F1 3 0 R>>>>>>`, `<</Length ${stream.length}>>stream\n${stream}\nendstream`);
  });
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj${o}endobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let R: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
let cookie = '';

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-w4-tutor-read-0123456789';
  await db.pg.exec(`
    update control.settings set value = '[]'::jsonb where key in ('family.open_subjects', 'family.reviewed_only_subjects');
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'read@example.org'), ('${OTHER}', 'other-read@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values
      ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'fam-notice-3'), ('${ACCOUNT}', 'photo_input', true, 'parent_tap', 'fam-notice-3');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code, free_subject) values
      ('${CHILD}', '${ACCOUNT}', 'Riya', 6, 'CBSE', 'en', 'en', 'IN-UP', 'mathematics'), ('${OTHER_CHILD}', '${OTHER}', 'Dev', 6, 'CBSE', 'en', 'en', 'IN-UP', 'mathematics');
    insert into family.tutor_conversations (conversation_id, account_id, child_id, subject) values ('${CONV}', '${ACCOUNT}', '${CHILD}', 'mathematics'), ('${OTHER_CONV}', '${OTHER}', '${OTHER_CHILD}', 'mathematics');
    update control.settings set value = '2'::jsonb where key = 'family.photo_questions_per_day';
  `);
  const file = async (n: number, account: string, child: string, conv: string, mime: string, ext: string, bytes: Uint8Array) => {
    await q(`insert into family.tutor_attachments (attachment_id, conversation_id, account_id, child_id, status, mime, size_bytes, storage_key) values ($1, $2, $3, $4, 'ready', $5, $6, $7)`, [id(n), conv, account, child, mime, bytes.length, keyOf(account, child, n, ext)]);
    store.files.set(keyOf(account, child, n, ext), bytes);
  };
  await file(1, ACCOUNT, CHILD, CONV, 'application/pdf', 'pdf', pdfOf(['Find the area of a square of side 4 cm']));
  await file(2, ACCOUNT, CHILD, CONV, 'application/pdf', 'pdf', pdfOf(['']));
  await file(3, ACCOUNT, CHILD, CONV, 'image/png', 'png', PNG);
  await file(4, OTHER, OTHER_CHILD, OTHER_CONV, 'application/pdf', 'pdf', pdfOf(['Dev private worksheet']));
  for (const n of [5, 6]) await file(n, ACCOUNT, CHILD, CONV, 'image/png', 'png', PNG);
  await file(7, ACCOUNT, CHILD, CONV, 'application/pdf', 'pdf', pdfOf(['Find the perimeter of a square of side 5 cm']));
  await file(8, ACCOUNT, CHILD, CONV, 'application/pdf', 'pdf', pdfOf(['A question kept for the consent check']));
  const { signFamilySession } = await import('@/lib/family/session');
  cookie = `ncf_session=${await signFamilySession({ accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' })}; ncf_child=${CHILD}`;
  R = { understand: await import('@/app/api/family/understand/route'), auth: await import('@/lib/auth/db') };
}, 120_000);
afterAll(async () => {
  await R?.auth.endPool();
  await db?.stop();
});
beforeEach(() => {
  ai.asked = [];
  ai.checked = [];
  ai.photoOff = false;
  ai.safetyOff = false;
  ai.left = 100;
});

const ask = async (files: string[], text = 'Please help with this') => {
  const res = await R.understand.POST(new NextRequest('http://localhost/api/family/understand', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ kind: 'question', text, tutor: { subject: 'mathematics', files } }) }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await res.text()).trim().split('\n').map((l: string) => JSON.parse(l)) as any[];
};
const answerAsk = () => ai.asked.find((a) => a.profile !== 'family.homework');

describe('the path is on (C230-AR: never a control that does nothing)', () => {
  it('Attach file shows and the server takes a file only because the tutor now reads it', () => {
    expect(TUTOR_READS_FILES).toBe(true);
  });
});

describe('a PDF, read on the server', () => {
  it('its text layer, at most the first pages', async () => {
    expect(await pdfText(pdfOf(['Hello 42']))).toBe('Hello 42');
    const many = await pdfText(pdfOf(Array.from({ length: TUTOR_PDF_PAGES + 2 }, (_, i) => `Page ${i + 1}`)));
    expect(many).toContain(`Page ${TUTOR_PDF_PAGES}`);
    expect(many).not.toContain(`Page ${TUTOR_PDF_PAGES + 1}`);
  });

  it('a scan with no text layer, or bytes that are not a PDF: nothing is guessed', async () => {
    expect(await pdfText(pdfOf(['']))).toBeNull();
    expect(await pdfText(new TextEncoder().encode('not a pdf at all'))).toBeNull();
  });

  it('joins the question, so the safety check reads it before the answer is asked for', async () => {
    const ev = await ask([id(1)]);
    expect(ev.find((e) => e.t === 'files')?.message).toBe('The tutor read 1 of 1 attached files.');
    expect(ai.checked[0]).toContain('Find the area of a square of side 4 cm');
    expect(answerAsk()?.content).toContain('Find the area of a square of side 4 cm');
    expect(ev.some((e) => e.t === 'block')).toBe(true);
  });
});

describe('a photo, through the vision profile', () => {
  it('is read by family.homework with the picture and no question answered, and its words join the question', async () => {
    const before = (await q(`select coalesce(sum(photo_questions), 0)::int as n from family.day_counts where child_id = $1`, [CHILD]))[0].n;
    const ev = await ask([id(3)]);
    const read = ai.asked.find((a) => a.profile === 'family.homework');
    expect(read).toMatchObject({ images: 1 });
    expect(read!.system).toContain('Do not answer or explain anything');
    expect(answerAsk()?.content).toContain('What is 7 x 8?');
    expect(ev.find((e) => e.t === 'files')?.message).toBe('The tutor read 1 of 1 attached files.');
    expect((await q(`select coalesce(sum(photo_questions), 0)::int as n from family.day_counts where child_id = $1`, [CHILD]))[0].n).toBe(before + 1);
  });

  it('with no vision service set up, the photo is said unread and its day place is given back', async () => {
    ai.photoOff = true;
    const before = (await q(`select coalesce(sum(photo_questions), 0)::int as n from family.day_counts where child_id = $1`, [CHILD]))[0].n;
    const ev = await ask([id(5)]);
    expect(ev.find((e) => e.t === 'files')?.message).toBe('The tutor read 0 of 1 attached files. Reading photos is not set up yet, so a photo was not read.');
    expect((await q(`select coalesce(sum(photo_questions), 0)::int as n from family.day_counts where child_id = $1`, [CHILD]))[0].n).toBe(before);
    expect(answerAsk()?.content).not.toContain('attached files');
  });

  it('past the day’s photo questions, a photo is said unread; a PDF beside it is still read', async () => {
    await q(`update family.day_counts set photo_questions = 2 where child_id = $1`, [CHILD]);
    const ev = await ask([id(6), id(7)]);
    expect(ai.asked.filter((a) => a.profile === 'family.homework')).toHaveLength(0);
    expect(ev.find((e) => e.t === 'files')?.message).toBe("The tutor read 1 of 2 attached files. Today's photo questions are used up, so a photo was not read.");
  });
});

describe('said, never dropped; never another child’s', () => {
  it('a scanned PDF is said so in the answer', async () => {
    const ev = await ask([id(2)]);
    expect(ev.find((e) => e.t === 'files')?.message).toContain('has no text the tutor can read');
    expect(ev.some((e) => e.t === 'block')).toBe(true);
  });

  it('another child’s file is refused before anything is read or sent', async () => {
    const ev = await ask([id(4)]);
    expect(ev).toEqual([expect.objectContaining({ t: 'refused' })]);
    expect(ai.asked).toEqual([]);
    expect(JSON.stringify(ev)).not.toContain('Dev private worksheet');
  });

  it('a question that will be refused never sends a photo (W4-1 review): safety check off, or no room in the day', async () => {
    await q(`insert into family.tutor_attachments (attachment_id, conversation_id, account_id, child_id, status, mime, size_bytes, storage_key) values ($1, $2, $3, $4, 'ready', 'image/png', 12, $5)`, [id(9), CONV, ACCOUNT, CHILD, keyOf(ACCOUNT, CHILD, 9, 'png')]);
    store.files.set(keyOf(ACCOUNT, CHILD, 9, 'png'), PNG);
    const places = async () => (await q(`select coalesce(sum(photo_questions), 0)::int as n from family.day_counts where child_id = $1`, [CHILD]))[0].n;
    const before = await places();
    ai.safetyOff = true;
    expect(await ask([id(9)])).toEqual([expect.objectContaining({ t: 'refused', message: expect.stringContaining('safety check') })]);
    ai.safetyOff = false;
    ai.left = 1;
    expect(await ask([id(9)])).toEqual([expect.objectContaining({ t: 'refused' })]);
    expect(ai.asked).toEqual([]);
    expect(await places()).toBe(before);
  });

  it('the photo consent withdrawn since the upload: nothing is read', async () => {
    await q(`insert into family.consents (account_id, purpose, granted, verification_method, notice_version, created_at) values ($1, 'photo_input', false, 'parent_tap', 'fam-notice-3', now() + interval '1 minute')`, [ACCOUNT]);
    const ev = await ask([id(8)]);
    expect(ev).toEqual([expect.objectContaining({ t: 'refused', message: expect.stringContaining('photos and files') })]);
    expect(ai.asked).toEqual([]);
    await q(`insert into family.consents (account_id, purpose, granted, verification_method, notice_version, created_at) values ($1, 'photo_input', true, 'parent_tap', 'fam-notice-3', now() + interval '2 minutes')`, [ACCOUNT]);
  });

  it('the homework helper switched off: the tutor reads no file and takes none (C389, one set of photo rules)', async () => {
    await q(`insert into control.app_flags (app, module, enabled, reason) values ('family', 'homework', false, 'test') on conflict (app, module) do update set enabled = false`);
    const ev = await ask([id(8)]);
    expect(ev).toEqual([expect.objectContaining({ t: 'refused', message: 'Photos and files can be sent once the homework helper is switched on.' })]);
    expect(ai.asked).toEqual([]);
    const { POST } = await import('@/app/api/family/tutor/files/route');
    const res = await POST(new NextRequest('http://localhost/api/family/tutor/files', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ subject: 'mathematics', mime: 'image/png', size: 100, name: 'a.png' }) }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'homework_off' });
    await q(`update control.app_flags set enabled = true where app = 'family' and module = 'homework'`);
    expect((await ask([id(8)])).some((e) => e.t === 'files')).toBe(true);
  });

  it('what the files say is labelled per file and capped', () => {
    const long = 'x'.repeat(5000);
    const out = attachedText([
      { attachmentId: id(1), mime: 'application/pdf', text: long },
      { attachmentId: id(2), mime: 'image/png', unreadable: 'no_text' },
      { attachmentId: id(3), mime: 'image/png', text: long },
    ]);
    expect(out.read).toBe(2);
    expect(out.unreadable).toEqual(['no_text']);
    expect(out.attached!.length).toBeLessThanOrEqual(TUTOR_READ_TOTAL_CHARS);
    expect(out.attached).toMatch(/^\[File 1, PDF\]/);
  });
});
