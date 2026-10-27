// Bubble (OMR) sheets (AQ-3, C364) for the screenshot harness: a made-up 5-A Mathematics unit test of twelve choice
// questions, sat with a bubble sheet, its sheets printed for the class, a few sheets already read (one clean, one with a
// smudged bubble and a double mark, one blank sheet with the roll number shaded, one with no number read), and the
// screens a teacher meets: the paper's marking screen with the bubble panel, printing (the PDF is made in the browser and
// checked), sending a photographed printed sheet as a file and through the phone's camera (read in the browser's scan
// worker, the reading checked), and the review of the flagged sheet. Illustrative only: no real school, child, sheet or
// mark. Loaded only by run.mjs, into a throwaway local database; the harness has no file store, so the pictures are drawn
// here and the bubble pages' route is answered here (the real route is tested on the whole schema in test/bubbles).
//
//   bubbleScreens(ctx)   the screens as run.mjs's list wants them: [who, name, route, prepare(page), after(page)]

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const id = (n) => `00000000-0000-4000-8000-0000000b${String(n).padStart(4, '0')}`;
const C5A = '00000000-0000-4000-8000-0000000c0051';
const MATHS = '00000000-0000-4000-8000-0000000d0001';
export const BB = { exam: id(9501), paper: id(9502), upload: id(9503), sheets: {}, pages: {}, questions: {} };
// Where the printed sheet's first page and what was read from it are left for the PR (outside the repository).
export const BUBBLE_OUT = path.join(os.tmpdir(), 'nca-harness-bubbles');

// ---- the layout, as src/lib/bubbles/layout.ts places it (the harness cannot load the app's TypeScript) -----------------
const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];
const QUESTIONS = Array.from({ length: 12 }, (_, i) => ({ label: String(i + 1), options: 4, correct: KEYS[(i * 3 + 1) % 4] }));
function fnv32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
const LAYOUT_KEY = `v1-${QUESTIONS.length}-${fnv32(QUESTIONS.map((q) => `${q.label}:${q.options}`).join('|'))}`;
const ROWS = Math.min(25, Math.max(10, Math.ceil(QUESTIONS.length / 4)));
const bubbleAt = (i, k) => ({ x: 12 + Math.floor(i / ROWS) * 46.5 + 13 + k * 5.4, y: 108 + (i % ROWS) * 6.6 });
const digitAt = (x0, c, d) => ({ x: x0 + c * 5.6, y: 36 + d * 5.8 });
const checkDigit = (d) => (10 - (d.reduce((s, v, i) => s + v * (i % 2 === 0 ? 3 : 1), 0) % 10)) % 10;
const sheetDigits = (n) => {
  const d = String(n).padStart(4, '0').split('').map(Number);
  return [...d, checkDigit(d)];
};

// ---- a sheet drawn as the reader keeps it (straightened, 5 px a millimetre) ---------------------------------------------
function sheetSvg(p) {
  const s = 5;
  const parts = [`<rect width="1050" height="1485" fill="#fbfbf8"/>`];
  for (const c of [[12, 12], [198, 12], [198, 285], [12, 285]]) parts.push(`<rect x="${(c[0] - 3.5) * s}" y="${(c[1] - 3.5) * s}" width="${7 * s}" height="${7 * s}" fill="#000"/>`);
  parts.push(`<rect x="${19 * s}" y="${10 * s}" width="${4 * s}" height="${4 * s}" fill="#000"/>`);
  const text = (x, y, size, t, weight = 400, fill = '#000') => parts.push(`<text x="${x * s}" y="${y * s}" font-family="Arial" font-size="${size}" font-weight="${weight}" fill="${fill}">${t}</text>`);
  text(26, 20, 30, 'Illustrative Public School', 700);
  text(14, 27, 22, 'Unit test 2 · 5-A · Mathematics', 700);
  parts.push(`<rect x="${14 * s}" y="${40 * s}" width="${100 * s}" height="${30 * s}" fill="none" stroke="#000" stroke-width="1.5"/>`);
  text(17, 47, 20, 'Name', 400, '#4a4a4a');
  text(17, 55.5, 20, 'Roll no.', 400, '#4a4a4a');
  text(40, 47, 26, p.name ?? '______________________', 700);
  text(40, 55.5, 24, p.roll ?? '____', 700);
  const ring = (b) => parts.push(`<circle cx="${b.x * s}" cy="${b.y * s}" r="${2.1 * s}" fill="none" stroke="#3a3a3a" stroke-width="1.4"/>`);
  const fill = (b, color, r = 2.1) => parts.push(`<circle cx="${b.x * s}" cy="${b.y * s}" r="${r * s}" fill="${color}"/>`);
  sheetDigits(p.sheetNo ?? 0).forEach((d, c) => {
    for (let k = 0; k < 10; k++) ring(digitAt(124.5, c, k));
    if (p.sheetNo) fill(digitAt(124.5, c, d), '#000', 2.2);
  });
  for (let c = 0; c < 4; c++) for (let k = 0; k < 10; k++) ring(digitAt(160.5, c, k));
  if (p.shadedRoll) p.shadedRoll.split('').forEach((d, c) => fill(digitAt(160.5, c, Number(d)), '#3d3d3d', 2));
  QUESTIONS.forEach((q, i) => {
    text(12 + Math.floor(i / ROWS) * 46.5 + 4.5, 108 + (i % ROWS) * 6.6 + 1.2, 22, q.label, 700);
    for (let k = 0; k < q.options; k++) {
      ring(bubbleAt(i, k));
      text(bubbleAt(i, k).x - 0.8, bubbleAt(i, k).y + 1, 14, KEYS[k], 400, '#a8a8a8');
    }
  });
  for (const [label, keys] of Object.entries(p.fills ?? {})) for (const k of keys) fill(bubbleAt(Number(label) - 1, KEYS.indexOf(k)), '#3d3d3d', 1.95);
  for (const [label, keys] of Object.entries(p.smudges ?? {})) for (const k of keys) fill(bubbleAt(Number(label) - 1, KEYS.indexOf(k)), '#b4b4b4', 1.8);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1050" height="1485" viewBox="0 0 1050 1485">${parts.join('')}</svg>`;
}

// ---- the seed --------------------------------------------------------------------------------------------------------------
async function asPerson(db, school, user, role, fn) {
  await db.pg.query(`select set_config('app.current_user_id', $1, false), set_config('app.current_role', $2, false), set_config('app.current_tenant_id', $3, false)`, [user, role, school]);
  try {
    return await fn();
  } finally {
    await db.pg.query(`select set_config('app.current_user_id', '', false), set_config('app.current_role', '', false), set_config('app.current_tenant_id', '', false)`);
  }
}

export async function clearBubbles(db, school) {
  await db.pg.exec(`set session_replication_role = replica;
    delete from bubble_reads where school_id = '${school}';
    delete from bubble_sheets where school_id = '${school}';
    delete from marking_marks where school_id = '${school}' and paper_id = '${BB.paper}';
    delete from marking_pages where school_id = '${school}' and paper_id = '${BB.paper}';
    delete from marking_sheets where school_id = '${school}' and paper_id = '${BB.paper}';
    delete from marking_uploads where school_id = '${school}' and paper_id = '${BB.paper}';
    delete from marking_questions where school_id = '${school}' and paper_id = '${BB.paper}';
    delete from marking_setups where school_id = '${school}' and paper_id = '${BB.paper}';
    delete from marks where school_id = '${school}' and exam_id = '${BB.exam}';
    delete from exam_papers where school_id = '${school}' and exam_id = '${BB.exam}';
    delete from exams where school_id = '${school}' and exam_id = '${BB.exam}';
    set session_replication_role = origin;`);
}

// What each read sheet shows: Meera's has a smudged bubble (3) and two marks (7); Kiara used a blank sheet and shaded
// roll 9; one sheet's number could not be read.
const READS = [
  { roll: '1', fills: Object.fromEntries(QUESTIONS.map((q, i) => [q.label, [i === 4 || i === 9 ? KEYS[(KEYS.indexOf(q.correct) + 1) % 4] : q.correct]])) },
  { roll: '2', fills: { ...Object.fromEntries(QUESTIONS.map((q) => [q.label, [q.correct]])), 3: [], 7: ['A', 'C'] }, smudges: { 3: ['B'] }, unclear: ['3'], multiple: ['7'] },
  { roll: '3', fills: { ...Object.fromEntries(QUESTIONS.map((q) => [q.label, [q.correct]])), 11: [] } },
  { blank: true, shadedRoll: '0009', fills: Object.fromEntries(QUESTIONS.slice(0, 8).map((q) => [q.label, [q.correct]])) },
  { noNumber: true, fills: { 1: ['A'], 2: ['B'] } },
];

export async function seedBubbles(db, { school, principal, teacher }) {
  await clearBubbles(db, school);
  BB.sheets = {};
  BB.pages = {};
  await db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source, limits) values ($1, 'exams', true, 'plan', '{}') on conflict (school_id, module_id) do update set enabled = true`, [school]);
  await db.pg.query(
    `insert into exams (exam_id, school_id, name, term, created_by, session_id) values ($1, $2, 'Unit test 2 (bubble sheet, harness)', 'Term 1', $3, (select session_id from academic_sessions where school_id = $2 and is_current))`,
    [BB.exam, school, principal]
  );
  await db.pg.query(
    `insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, paper_date, unit_ids, components, created_by, sitting)
     values ($1, $2, $3, $4, $5, (now() at time zone 'Asia/Kolkata')::date - 1, '{}', $6::jsonb, $7, 'bubble')`,
    [BB.paper, school, BB.exam, C5A, MATHS, JSON.stringify([{ key: 'written', name: 'Written', max: 12, share: 80 }, { key: 'oral', name: 'Oral', max: 10, share: 20 }]), principal]
  );
  const kids = (
    await db.pg.query(
      `select student_id, name, roll_no from students s where school_id = $1 and class_id = $2 and status in ('active', 'pending_consent')
        order by case when s.roll_no ~ '^[0-9]{1,9}$' then s.roll_no::int end nulls last, s.roll_no nulls last, s.name, s.student_id`,
      [school, C5A]
    )
  ).rows;
  await asPerson(db, school, teacher, 'teacher', async () => {
    await db.pg.query(`insert into marking_setups (school_id, paper_id, language, guidance, choice_counts, wrong_marks, updated_by) values ($1, $2, 'en', '', '{}', 0.5, $3)`, [school, BB.paper, teacher]);
    for (const [i, q] of QUESTIONS.entries()) {
      BB.questions[q.label] = id(9600 + i);
      await db.pg.query(
        `insert into marking_questions (school_id, question_id, paper_id, position, label, component, max_marks, kind, prompt, options, correct, updated_by)
         values ($1, $2, $3, $4, $5, 'written', 1, 'objective', $6, $7::jsonb, $8::jsonb, $9)`,
        [school, BB.questions[q.label], BB.paper, i + 1, q.label, `Choice question ${q.label} on fractions.`, JSON.stringify(KEYS.slice(0, q.options).map((k) => ({ key: k, text: `Option ${k}` }))), JSON.stringify({ keys: [q.correct] }), teacher]
      );
    }
    // Printed as Tara would: the class in roll order, and two blank sheets.
    await db.pg.query(`select * from public.issue_bubble_sheets($1, $2, 2)`, [BB.paper, LAYOUT_KEY]);
    await db.pg.query(`insert into marking_uploads (school_id, upload_id, paper_id, mode, kind, created_by, created_at, closed_at) values ($1, $2, $3, 'combined', 'bubble', $4, now() - interval '1 hour', now() - interval '1 hour')`, [school, BB.upload, BB.paper, teacher]);
  });
  const sheets = (await db.pg.query(`select sheet_no, student_id from bubble_sheets where paper_id = $1 order by sheet_no`, [BB.paper])).rows;
  const byRoll = new Map(kids.map((k) => [k.roll_no, k]));
  const blankNo = sheets.find((s) => !s.student_id).sheet_no;
  for (const [n, r] of READS.entries()) {
    const kid = r.blank ? byRoll.get('9') : r.noNumber ? null : byRoll.get(r.roll);
    const sheetNo = r.noNumber ? null : r.blank ? blankNo : sheets.find((s) => s.student_id === kid.student_id).sheet_no;
    const page = id(9700 + n);
    const sheet = id(9800 + n);
    const read = id(9900 + n);
    BB.pages[page] = { sheetNo, name: r.blank || r.noNumber ? null : kid.name, roll: r.blank || r.noNumber ? null : kid.roll_no, shadedRoll: r.shadedRoll, fills: r.fills, smudges: r.smudges };
    if (kid && !r.blank) BB.sheets[kid.roll_no] = sheet;
    const answers = Object.fromEntries(Object.entries(r.fills).filter(([l, k]) => k.length && !(r.unclear ?? []).includes(l)));
    const student = r.noNumber ? null : kid.student_id;
    const by = r.noNumber ? 'none' : r.blank ? 'roll' : 'bubble';
    await asPerson(db, school, teacher, 'teacher', async () => {
      await db.pg.query(
        `insert into marking_pages (school_id, page_id, upload_id, paper_id, file_no, page_no, storage_key, sha256, bytes, width, height, state)
         values ($1, $2, $3, $4, 1, $5, $6, $7, 150000, 1050, 1485, 'read')`,
        [school, page, BB.upload, BB.paper, n + 1, `${school}/marking/${BB.paper}/${page}.jpg`, createHash('sha256').update(page).digest('hex')]
      );
      await db.pg.query(
        `insert into marking_sheets (school_id, sheet_id, paper_id, upload_id, source, student_id, matched_by, match_note, state, flags, marked_at, ai_confidence, created_at)
         values ($1, $2, $3, $4, 'bubble', $5, $6, $7::jsonb, 'marked', $8, now() - interval '50 minutes', 0.97, now() - interval '50 minutes' + make_interval(secs => $9))`,
        [school, sheet, BB.paper, BB.upload, student, by, JSON.stringify({ read: { name: null, rollNo: r.shadedRoll ?? null, seatNo: null }, candidates: [] }),
          r.noNumber ? ['identity'] : r.blank ? ['check_child'] : r.unclear ? ['not_all_read', 'unsure'] : [], n]
      );
      await db.pg.query(`update marking_pages set sheet_id = $2, sheet_position = 1 where page_id = $1`, [page, sheet]);
      await db.pg.query(
        `insert into bubble_reads (school_id, read_id, paper_id, page_id, layout, sheet_no, roll_no, student_id, matched_by, sheet_id, answers, unclear, multiple, confidence, read_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, 0.97, $14)`,
        [school, read, BB.paper, page, LAYOUT_KEY, sheetNo, r.shadedRoll ?? null, student, by, sheet, JSON.stringify(answers), r.unclear ?? [], r.multiple ?? [], teacher]
      );
      for (const [i, q] of QUESTIONS.entries()) {
        const keys = answers[q.label] ?? [];
        const flagged = (r.unclear ?? []).includes(q.label) || keys.length > 1;
        const right = keys.length === 1 && keys[0] === q.correct;
        await db.pg.query(
          `insert into marking_marks (school_id, sheet_id, paper_id, question_id, attempted, ai_marks, error_type, confidence) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [school, sheet, BB.paper, BB.questions[q.label], flagged || keys.length > 0, flagged ? null : !keys.length ? 0 : right ? 1 : -0.5, flagged ? null : !keys.length ? 'not_attempted' : right ? 'none' : null, flagged ? 0 : 0.97]
        );
        void i;
      }
    });
  }
  return BB;
}

export async function routeSheetPictures(target) {
  await target.route(/\/api\/app\/marking\/pages\/0{8}-0{4}-4000-8000-0000000b9\d{3}$/, (route) => {
    const m = /pages\/([0-9a-f-]{36})/.exec(route.request().url());
    const p = BB.pages[m?.[1] ?? ''] ?? { sheetNo: 0 };
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', headers: { 'Cache-Control': 'no-store' }, body: sheetSvg(p) });
  });
}

// ---- the PDF the browser made: its pages' pictures (the PDF holds each page as a JPEG, as src/lib/pdf writes it) --------
function pdfPages(pdf) {
  const out = [];
  const s = pdf.toString('latin1');
  let at = 0;
  for (;;) {
    const head = s.indexOf('/Filter /DCTDecode /Length ', at);
    if (head < 0) break;
    const length = Number(/\/Length (\d+)/.exec(s.slice(head, head + 60))[1]);
    const start = s.indexOf('stream\n', head) + 'stream\n'.length;
    out.push(pdf.subarray(start, start + length));
    at = start + length;
  }
  return out;
}

export function bubbleScreens({ db, SCHOOL, PEOPLE, base, secret, cookieFor, speak, backToEnglish }) {
  const hub = `/app/exams/papers/${BB.paper}/marking`;
  const scanRoute = `${hub}/scan?sheets=bubble`;
  let before = null;
  let seen = {};
  let axeFound = [];
  let printed = null; // the printed PDF's first page (Aarav's sheet), as a JPEG
  let sent = [];

  const seed = async (page, { reload = true } = {}) => {
    if (!before) before = { entitlement: (await db.pg.query(`select enabled, source, limits from school_module_entitlements where school_id = $1 and module_id = 'exams'`, [SCHOOL])).rows[0] ?? null };
    seen = {};
    sent = [];
    await seedBubbles(db, { school: SCHOOL, principal: PEOPLE.principal.sub, teacher: PEOPLE.teacher.sub });
    await routeSheetPictures(page);
    if (reload) await page.reload({ waitUntil: 'networkidle' });
  };
  const putBack = async () => {
    await clearBubbles(db, SCHOOL);
    if (!before) return;
    if (before.entitlement === null) await db.pg.query(`delete from school_module_entitlements where school_id = $1 and module_id = 'exams'`, [SCHOOL]);
    else await db.pg.query(`update school_module_entitlements set enabled = $2, source = $3, limits = $4::jsonb where school_id = $1 and module_id = 'exams'`, [SCHOOL, before.entitlement.enabled, before.entitlement.source, JSON.stringify(before.entitlement.limits ?? {})]);
    before = null;
  };
  const axe = async (page, name) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.addScriptTag({ path: AXE });
    const found = await page.evaluate(async () => {
      const r = await window.axe.run(document.querySelector('[data-module-page]') ?? document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
    });
    for (const f of found) axeFound.push(`${name}: ${f}`);
  };
  const finish = (check, { hindi = false } = {}) => async (page) => {
    const problems = [];
    try {
      if (hindi) await backToEnglish(page);
      if (check) await check(page).catch((e) => problems.push(e.message));
    } finally {
      await page.goto('about:blank').catch(() => undefined);
      await putBack();
    }
    if (axeFound.length) problems.push(`axe found ${axeFound.join('; ')}`);
    axeFound = [];
    if (problems.length) throw new Error(problems.join(' | '));
  };
  const text = async (page, sel) => ((await page.locator(sel).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const hindi = async (page) => {
    await speak('हिन्दी')(page);
    await page.waitForTimeout(500);
  };
  void secret;
  void cookieFor;
  void base;

  // The bubble pages' route, answered here (the harness has no file store): what the browser read is kept for the checks.
  const answerSheets = async (page) => {
    await page.route(/\/api\/app\/marking\/uploads\/[^/]+\/bubbles$/, async (route) => {
      const body = route.request().postDataBuffer() ?? Buffer.alloc(0);
      const type = route.request().headers()['content-type'] ?? '';
      const boundary = /boundary=(.+)$/.exec(type)?.[1];
      const fields = {};
      if (boundary) {
        for (const part of body.toString('latin1').split(`--${boundary}`)) {
          const name = /name="([^"]+)"/.exec(part)?.[1];
          if (!name || name === 'page') continue;
          (fields[name] ??= []).push(part.slice(part.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''));
        }
      }
      const pages = (fields.pageNo ?? []).map((n, i) => {
        const reading = JSON.parse(Buffer.from(fields.reading[i], 'latin1').toString('utf8'));
        sent.push(reading);
        return { fileNo: Number(fields.fileNo[i]), pageNo: Number(n), pageId: id(9990 + sent.length), outcome: 'script', sheetNo: reading.sheetNo, child: reading.sheetNo === 1 ? { studentId: 'x', name: 'Aarav Example A', rollNo: '1' } : null, flagged: reading.unclear.length + reading.multiple.length > 0 };
      });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pages }) });
    });
  };

  // Prints the class's sheets from the bubble panel and keeps the PDF's first page (Aarav's sheet).
  const print = async (page) => {
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('[data-bubble-print]').click()]);
    const file = path.join(os.tmpdir(), `nca-bubbles-${Date.now()}.pdf`);
    await download.saveAs(file);
    const pdf = await import('node:fs').then((fs) => fs.readFileSync(file));
    const pages = pdfPages(pdf);
    seen.pdf = { magic: pdf.subarray(0, 5).toString('latin1'), count: Number(/\/Count (\d+)/.exec(pdf.toString('latin1'))?.[1] ?? 0), pages: pages.length };
    printed = pages[0];
    mkdirSync(BUBBLE_OUT, { recursive: true });
    writeFileSync(path.join(BUBBLE_OUT, 'printed-sheet-1.jpg'), printed);
  };
  // A photo of the printed sheet: shaded in pencil grey at the layout's places, turned 3 degrees and seen at a slight
  // angle on a dark desk, with uneven light. Made in the page's own canvas; the answers shaded are given back.
  const SHADED = { 1: 'B', 2: 'A', 3: 'D', 5: 'C', 8: 'B', 12: 'D' };
  const photograph = (page, w, h) =>
    page.evaluate(
      async ({ jpeg, shaded, rows, w, h }) => {
        const img = new Image();
        img.src = `data:image/jpeg;base64,${jpeg}`;
        await img.decode();
        const mm = img.width / 210;
        const sheet = document.createElement('canvas');
        sheet.width = img.width;
        sheet.height = img.height;
        const s = sheet.getContext('2d');
        s.drawImage(img, 0, 0);
        s.fillStyle = 'rgba(55,55,55,0.92)';
        for (const [label, key] of Object.entries(shaded)) {
          const i = Number(label) - 1;
          const x = 12 + Math.floor(i / rows) * 46.5 + 13 + 'ABCDEF'.indexOf(key) * 5.4;
          const y = 108 + (i % rows) * 6.6;
          s.beginPath();
          s.arc(x * mm, y * mm, 1.95 * mm, 0, Math.PI * 2);
          s.fill();
        }
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#3b2f25';
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate((3 * Math.PI) / 180);
        ctx.transform(1, 0.015, -0.02, 1, 0, 0);
        const k = (h * 0.86) / sheet.height;
        ctx.drawImage(sheet, (-sheet.width * k) / 2, (-sheet.height * k) / 2, sheet.width * k, sheet.height * k);
        ctx.restore();
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.28)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        return c.toDataURL('image/jpeg', 0.9).split(',')[1];
      },
      { jpeg: printed.toString('base64'), shaded: SHADED, rows: ROWS, w, h }
    );
  const readingChecks = () => {
    const r = sent[0];
    if (!r) throw new Error('no sheet was sent');
    if (r.sheetNo !== 1 || r.layout !== LAYOUT_KEY) throw new Error(`the printed sheet read back as ${JSON.stringify(r)}`);
    const want = Object.fromEntries(Object.entries(SHADED).map(([l, k]) => [l, [k]]));
    if (JSON.stringify(r.answers) !== JSON.stringify(want) || r.unclear.length || r.multiple.length) throw new Error(`the shaded answers read back as ${JSON.stringify(r)}`);
    writeFileSync(path.join(BUBBLE_OUT, 'read-back.json'), JSON.stringify(r, null, 2));
  };

  // ---- the paper's marking screen, with the bubble panel; printing --------------------------------------------------------
  const openHub = (lang) => async (page) => {
    await seed(page);
    await page.locator('[data-bubble-panel="bubble"]').waitFor({ timeout: 30000 });
    seen.printed = await text(page, '[data-bubble-printed]');
    seen.reads = await text(page, '[data-bubble-reads]');
    seen.kind = await page.locator('[data-bubble-kind]').getAttribute('data-bubble-kind');
    seen.files = await page.locator('[data-bubble-files]').count();
    seen.books = await page.locator('[data-scripts-uploader]').count();
    seen.rows = await page.locator('[data-review-rows] > li').count();
    if (lang === 'en') await print(page);
    if (lang === 'hi') await hindi(page);
    await axe(page, `bubbles hub ${lang}`);
  };
  const hubChecks = async () => {
    if (!/9 children.*2 blank/.test(seen.printed)) throw new Error(`the sheets printed: ${seen.printed}`);
    if (!/5 sheets, 4 matched to a child, 1 with a bubble to check/.test(seen.reads)) throw new Error(`the sheets read: ${seen.reads}`);
    if (seen.kind !== 'only' || seen.files !== 1 || seen.books !== 0) throw new Error(`the uploader: ${JSON.stringify(seen)}`);
    if (seen.rows !== 5) throw new Error(`the review list: ${seen.rows}`);
    if (seen.pdf && (seen.pdf.magic !== '%PDF-' || seen.pdf.count !== 9 || seen.pdf.pages !== 9)) throw new Error(`the printed PDF: ${JSON.stringify(seen.pdf)}`);
  };

  // ---- the printed sheet, photographed and sent as a file ------------------------------------------------------------------
  const openFiles = async (page) => {
    await seed(page);
    await page.locator('[data-bubble-print]').waitFor({ timeout: 30000 });
    await print(page);
    await answerSheets(page);
    const photo = Buffer.from(await photograph(page, 1700, 2300), 'base64');
    await page.locator('#bub-upload-files').setInputFiles([{ name: 'IMG_0101.jpg', mimeType: 'image/jpeg', buffer: photo }]);
    await page.locator('[data-bubble-start]').click();
    await page.locator('[data-bubble-result]').waitFor({ timeout: 90000 });
    // Every file through and the sending closed (the screen closes it by itself), before anything is put back.
    await page.waitForFunction(() => !document.querySelector('[data-bubble-finish]') && !document.querySelector('[data-bubble-progress] [data-status="sending"], [data-bubble-progress] [data-status="reading"]'), null, { timeout: 60000 });
    await page.waitForLoadState('networkidle');
    seen.closed = (await db.pg.query(`select count(*)::int as n from marking_uploads where paper_id = $1 and kind = 'bubble' and upload_id <> $2 and closed_at is not null`, [BB.paper, BB.upload])).rows[0].n;
    seen.result = await text(page, '[data-bubble-result]');
    await axe(page, 'bubbles files');
  };
  const filesChecks = async () => {
    readingChecks();
    if (!/1 sheets? read/.test(seen.result) || seen.closed !== 1) throw new Error(`the files' result: ${JSON.stringify(seen)}`);
  };

  // ---- the phone's camera on the printed sheet -------------------------------------------------------------------------------
  const camera = ({ jpeg }) => {
    const c = document.createElement('canvas');
    c.width = 1500;
    c.height = 2000;
    const ctx = c.getContext('2d');
    const img = new Image();
    img.src = `data:image/jpeg;base64,${jpeg}`;
    const draw = () => img.complete && ctx.drawImage(img, 0, 0, 1500, 2000);
    img.onload = draw;
    setInterval(draw, 100);
    const devices = navigator.mediaDevices ?? {};
    devices.getUserMedia = async () => c.captureStream(10);
    if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: devices });
  };
  const openScan = async (page) => {
    await seed(page, { reload: false });
    await page.goto(`${(await page.evaluate(() => location.origin))}${hub}`, { waitUntil: 'networkidle' });
    await page.locator('[data-bubble-print]').waitFor({ timeout: 30000 });
    await print(page);
    const photo = await photograph(page, 1500, 2000);
    await page.addInitScript(camera, { jpeg: photo });
    await answerSheets(page);
    await page.goto(`${(await page.evaluate(() => location.origin))}${scanRoute}`, { waitUntil: 'load' });
    await page.locator('[data-bubble-scan]').waitFor({ timeout: 30000 });
    // Taken by itself once held still, or by hand.
    await page.locator('[data-bubble-item][data-state="sent"]').waitFor({ timeout: 25000 }).catch(async () => {
      await page.locator('[data-bubble-take]').click();
      await page.locator('[data-bubble-item][data-state="sent"]').waitFor({ timeout: 45000 });
    });
    seen.items = await page.locator('[data-bubble-item]').count();
    seen.counts = await text(page, '[data-bubble-counts]');
    await axe(page, 'bubbles scan');
  };
  const scanChecks = async () => {
    readingChecks();
    if (seen.items !== 1 || !/1 sent, 0 waiting/.test(seen.counts)) throw new Error(`the phone's list: ${JSON.stringify(seen)}`);
  };

  // ---- the review of Meera's sheet: a smudge and a double mark, flagged on the picture --------------------------------------
  const openReview = (lang) => async (page) => {
    await seed(page);
    await page.locator('[data-bubble-sheet]').waitFor({ timeout: 30000 });
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 });
    seen.rings = await page.locator('[data-bubble-ring]').evaluateAll((els) => els.map((e) => e.getAttribute('data-bubble-ring')));
    seen.lines = await page.locator('[data-bubble-read]').count();
    seen.q3 = await text(page, '[data-bubble-read="3"]');
    seen.approveOff = await page.locator('[data-approve]').isDisabled();
    seen.pages = await page.locator('[data-pages-pane]').count();
    seen.rule = await page.locator('[data-rule-gave]').count();
    seen.aiWords = await page.locator('[data-ai-gave]').count();
    if (lang === 'hi') await hindi(page);
    await axe(page, `bubbles review ${lang}`);
  };
  const reviewChecks = async () => {
    if (JSON.stringify(seen.rings) !== JSON.stringify(['3', '7'])) throw new Error(`the flagged rows: ${JSON.stringify(seen.rings)}`);
    if (seen.lines !== 12 || seen.pages !== 0 || seen.rule !== 12 || seen.aiWords !== 0) throw new Error(`the questions' lines: ${JSON.stringify(seen)}`);
    if (!/Nothing shaded.*Correct: D.*A bubble is unclear/.test(seen.q3) || seen.approveOff !== true) throw new Error(`question 3: ${JSON.stringify(seen)}`);
  };

  const review = `${hub}/${id(9801)}`;
  return [
    ['teacher', 'app-bubbles-hub', hub, openHub('en'), finish(hubChecks)],
    ['teacher', 'app-bubbles-hub-hindi', hub, openHub('hi'), finish(hubChecks, { hindi: true })],
    ['teacher', 'app-bubbles-files', hub, openFiles, finish(filesChecks)],
    ['teacher', 'app-bubbles-scan', `${hub}/scan`, openScan, finish(scanChecks)],
    ['teacher', 'app-bubbles-review', review, openReview('en'), finish(reviewChecks)],
    ['teacher', 'app-bubbles-review-hindi', review, openReview('hi'), finish(reviewChecks, { hindi: true })],
  ];
}
