// The teacher's AI-marking screens for the screenshot harness (AM-3, C347, C348): a paper's four steps, one script beside
// its pages, the exam's candidates and exam numbers. Each screen is seeded with scripts/harness/marking-seed.mjs (a
// made-up 5-A Mathematics paper, nine children, scripts in every state, pages drawn in the browser in place of scans),
// is checked against the database after, and puts everything back, so the screens that follow see the same school.
// Illustrative only: no real school, child, script or mark. Loaded only by run.mjs, into a throwaway local database.
//
//   markingScreens(ctx)   the screens as run.mjs's list wants them: [who, name, route, prepare(page), after(page)]
//
// ctx hands in what run.mjs holds (the database, the people, the app's address, the language switch).
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import { clearMarking, MK, routeScriptPictures, seedMarking } from './marking-seed.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const kid = (g) => `00000000-0000-4000-8000-0000005${String(g).padStart(5, '0')}`;
// The seed's script ids: its nine children in order, from 9200 (Aarav, Meera, Vihaan, Anaya, Neel, Kabir, Sana, Ishaan).
const sheetId = (n) => `00000000-0000-4000-8000-0000000a${String(9200 + n).padStart(4, '0')}`;
const SHEET = { aarav: sheetId(0), meera: sheetId(1), vihaan: sheetId(2), anaya: sheetId(3), neel: sheetId(4), kabir: sheetId(5), sana: sheetId(6), ishaan: sheetId(7) };
const KID = { aarav: kid(1), meera: kid(4), vihaan: kid(7), anaya: kid(10), neel: kid(13), kabir: kid(16), sana: kid(19), ishaan: kid(22), kiara: kid(25) };


// ---- files made here for the upload screen: a PDF of nine pages (eight A4, one a 300 dpi scan's size) and a phone-sized photo
// A hand-written PDF: a catalog, a page tree and a page each with a line of text, with its cross-reference table.
function makePdf(sizes) {
  const objs = [];
  const add = (body) => objs.push(body) && objs.length;
  const catalog = add('<< /Type /Catalog /Pages 2 0 R >>');
  add(''); // the page tree, filled below
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids = [];
  sizes.forEach(([w, h], i) => {
    const stream = `BT /F1 ${Math.round(w / 12)} Tf ${Math.round(w / 10)} ${Math.round(h / 2)} Td (Illustrative page ${i + 1}) Tj ET`;
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  });
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n';
  const at = [];
  objs.forEach((b, i) => {
    at.push(out.length);
    out += `${i + 1} 0 obj\n${b}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
// A photo-sized PNG: a ruled page with a few marks (RGB, no interlace).
function makePng(w, h) {
  const rowLen = 1 + w * 3;
  const raw = Buffer.alloc(h * rowLen);
  for (let y = 0; y < h; y++) {
    const o = y * rowLen;
    for (let x = 0; x < w; x++) {
      const ruled = y % 60 < 3;
      const ink = x > 200 && x < 900 && y % 180 > 90 && y % 180 < 100;
      const v = ink ? [30, 40, 120] : ruled ? [180, 200, 230] : [250, 247, 236];
      raw[o + 1 + x * 3] = v[0];
      raw[o + 2 + x * 3] = v[1];
      raw[o + 3 + x * 3] = v[2];
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head[8] = 8;
  head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))]);
}
// The size of a JPEG, from its start-of-frame marker.
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}
// The pictures in one multipart request, in the order they were sent: file number, page number and the JPEG.
function pagesOfRequest(body, contentType) {
  const boundary = /boundary=(.+)$/.exec(contentType)?.[1];
  const parts = [];
  let at = 0;
  const marker = Buffer.from(`--${boundary}`);
  while (true) {
    const start = body.indexOf(marker, at);
    if (start < 0) break;
    const next = body.indexOf(marker, start + marker.length);
    if (next < 0) break;
    const part = body.subarray(start + marker.length + 2, next - 2);
    const split = part.indexOf('\r\n\r\n');
    parts.push({ head: part.subarray(0, split).toString('latin1'), data: part.subarray(split + 4) });
    at = next;
  }
  const fields = (name) => parts.filter((p) => new RegExp(`name="${name}"`).test(p.head)).map((p) => p.data);
  return { fileNo: fields('fileNo').map((d) => Number(d.toString())), pageNo: fields('pageNo').map((d) => Number(d.toString())), jpegs: fields('page') };
}

export function markingScreens({ db, SCHOOL, PEOPLE, CLASS_5A, base, secret, cookieFor, speak, backToEnglish }) {
  const hub = `/app/exams/papers/${MK.paper}/marking`;
  const review = (who) => `${hub}/${SHEET[who]}`;
  let before = null;
  let seen = {};
  let axeFound = [];

  // ---- seeding and putting back -------------------------------------------------------------------------------------
  const seed = async (page, { reload = true } = {}) => {
    if (!before) {
      before = {
        entitlement: (await db.pg.query(`select enabled, source, limits from school_module_entitlements where school_id = $1 and module_id = 'exams'`, [SCHOOL])).rows[0] ?? null,
        provider: (await db.pg.query(`select 1 from control.ai_providers where provider_id = 'stand-in'`)).rows.length > 0,
        profiles: (await db.pg.query(`select profile_id, provider_id, model, enabled from control.ai_profiles where profile_id in ('exams.read_pages', 'exams.mark')`)).rows,
      };
    }
    seen = {};
    await seedMarking(db, { school: SCHOOL, principal: PEOPLE.principal.sub, teacher: PEOPLE.teacher.sub });
    await routeScriptPictures(page);
    if (reload) await page.reload({ waitUntil: 'networkidle' });
  };
  const putBack = async () => {
    await clearMarking(db, SCHOOL);
    if (!before) return;
    for (const p of before.profiles) await db.pg.query(`update control.ai_profiles set provider_id = $2, model = $3, enabled = $4 where profile_id = $1`, [p.profile_id, p.provider_id, p.model, p.enabled]);
    if (!before.provider) await db.pg.query(`delete from control.ai_providers where provider_id = 'stand-in'`);
    if (before.entitlement === null) await db.pg.query(`delete from school_module_entitlements where school_id = $1 and module_id = 'exams'`, [SCHOOL]);
    else await db.pg.query(`update school_module_entitlements set enabled = $2, source = $3, limits = $4::jsonb where school_id = $1 and module_id = 'exams'`, [SCHOOL, before.entitlement.enabled, before.entitlement.source, JSON.stringify(before.entitlement.limits ?? {})]);
    before = null;
  };

  // ---- axe on the screen's own content: a serious or critical finding fails the screen -------------------------------
  const axe = async (page, name) => {
    // Back to the top, so the picture is of the screen as it opens (a sticky bar is not left mid-page).
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.addScriptTag({ path: AXE });
    const found = await page.evaluate(async () => {
      const r = await window.axe.run(document.querySelector('[data-module-page]') ?? document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
    });
    for (const f of found) axeFound.push(`${name}: ${f}`);
  };
  // What a screen proves is read from the database before everything is put back (the checks), and axe's findings come with it.
  const finish = (check, { hindi = false } = {}) => async (page) => {
    const problems = [];
    try {
      if (hindi) await backToEnglish(page);
      if (check) await check(page).catch((e) => problems.push(e.message));
    } finally {
      await putBack();
    }
    if (axeFound.length) problems.push(`axe found ${axeFound.join('; ')}`);
    axeFound = [];
    if (problems.length) throw new Error(problems.join(' | '));
  };
  const as = async (person, method, route, body) => {
    const res = await fetch(`${base()}${route}`, { method, headers: { 'Content-Type': 'application/json', cookie: `nca_access=${await cookieFor(person, secret())}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const text = async (page, sel) => ((await page.locator(sel).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const imagesLoaded = (page) => page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 });
  const hindi = async (page) => {
    await speak('हिन्दी')(page);
    await page.waitForTimeout(500);
  };
  const notRanked = async (page) => !/\brank(ed)?\b|\btopper\b|\bposition\b/i.test(((await page.locator('main').first().innerText()) ?? '').replace(/No child is ranked or compared with another\./g, '').replace(/किसी बच्चे की रैंक नहीं बनती[^।]*।/g, ''));

  // ---- the hub ------------------------------------------------------------------------------------------------------
  const openHub = (lang) => async (page) => {
    await seed(page);
    await page.locator('[data-review-rows] > li').first().waitFor({ timeout: 30000 });
    seen.rows = await page.locator('[data-review-rows] > li').evaluateAll((els) => els.map((e) => e.getAttribute('data-sheet')));
    seen.buckets = await page.locator('[data-review-rows] > li').evaluateAll((els) => els.map((e) => e.getAttribute('data-bucket')));
    seen.ready = await text(page, '[data-ready-count]');
    seen.steps = await page.locator('[data-step]').evaluateAll((els) => els.map((e) => e.getAttribute('data-step')));
    seen.allowance = await text(page, '[data-ai-allowance]');
    seen.insights = await page.locator('[data-insights-link]').getAttribute('href');
    seen.noRank = await notRanked(page);
    seen.pages = await page.locator('[data-pages]').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.getAttribute('data-pages'), e.querySelector('span')?.textContent])));
    if (lang === 'hi') await hindi(page);
    await axe(page, `hub ${lang}`);
  };
  const hubChecks = async () => {
    // Roll order, then the script of no one: Aarav, Meera, Vihaan, Anaya, Neel, Sana, Ishaan, Kabir.
    const want = ['aarav', 'meera', 'vihaan', 'anaya', 'neel', 'sana', 'ishaan', 'kabir'].map((n) => SHEET[n]);
    if (JSON.stringify(seen.rows) !== JSON.stringify(want)) throw new Error(`the review list is not in roll order: ${JSON.stringify(seen.rows)}`);
    if (JSON.stringify(seen.buckets) !== JSON.stringify(['approved', 'approved', 'needs', 'ready', 'needs', 'ready', 'needs', 'needs'])) throw new Error(`the scripts' lists: ${JSON.stringify(seen.buckets)}`);
    if (!/^2 scripts are ready/.test(seen.ready)) throw new Error(`the ready count: ${seen.ready}`);
    if (JSON.stringify(seen.steps) !== JSON.stringify(['questions', 'scripts', 'progress', 'review'])) throw new Error(`the steps: ${JSON.stringify(seen.steps)}`);
    if (!/2,000/.test(seen.allowance)) throw new Error(`the pages allowance: ${seen.allowance}`);
    if (seen.insights !== `/app/exams/papers/${MK.paper}/insights`) throw new Error(`the insights link: ${seen.insights}`);
    if (seen.noRank !== true) throw new Error('the hub says rank, position or topper');
    if (JSON.stringify(seen.pages) !== JSON.stringify({ read: '16', new: '0', blank: '0', unreadable: '0', duplicate: '0' })) throw new Error(`the pages read: ${JSON.stringify(seen.pages)}`);
  };

  // ---- the questions ------------------------------------------------------------------------------------------------
  // The seeded paper has two approved scripts, so its questions are locked: the picture says so. A second screen takes the
  // approvals away first, changes Q5 from 5 marks to 6 and shows the paper no longer adding up, in plain words.
  const openQuestions = async (page) => {
    await seed(page);
    await page.locator('[data-questions-open]').click();
    await page.locator('[data-questions-editor]').waitFor({ timeout: 20000 });
    seen.locked = await page.locator('[data-questions-locked]').count();
    seen.disabled = await page.locator('#mk-q-0-marks').isDisabled();
    seen.byHand = await text(page, '[data-typed-by-hand]');
    seen.choice = await page.locator('[data-choice-groups]').count();
    await axe(page, 'questions');
  };
  const questionsChecks = async () => {
    if (seen.locked !== 1 || seen.disabled !== true) throw new Error(`the locked questions: ${JSON.stringify(seen)}`);
    if (!/Oral: no questions here/.test(seen.byHand) || seen.choice !== 1) throw new Error(`the questions' notes: ${JSON.stringify(seen)}`);
  };
  const editQuestions = async (page) => {
    await seed(page, { reload: false });
    await db.pg.exec(`set session_replication_role = replica; update marking_sheets set state = 'marked', approved_at = null, approved_by = null where state = 'approved'; set session_replication_role = origin;`);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-questions-open]').click();
    await page.locator('[data-questions-editor]').waitFor({ timeout: 20000 });
    seen.unlocked = await page.locator('[data-questions-locked]').count();
    // Question 5 is 5 marks; make it 6.
    await page.locator('#mk-q-4-marks').fill('6');
    await page.locator('[data-structure-problems]').waitFor({ timeout: 10000 });
    seen.problem = await text(page, '[data-structure-problems]');
    seen.saveEnabled = await page.locator('[data-questions-save]').isEnabled();
    await axe(page, 'questions edit');
  };
  const editChecks = async () => {
    if (seen.unlocked !== 0) throw new Error('the questions are locked with no script approved');
    if (!/Written adds up to 41; it must be 40\./.test(seen.problem) || seen.saveEnabled !== true) throw new Error(`the structure problem: ${JSON.stringify(seen)}`);
  };

  // ---- one script ---------------------------------------------------------------------------------------------------
  const openReview = (who, lang) => async (page) => {
    await seed(page);
    await page.locator('[data-script-review]').waitFor({ timeout: 30000 });
    await page.locator('[data-question]').first().waitFor({ timeout: 30000 });
    await imagesLoaded(page);
    seen.state = await page.locator('[data-script-review]').getAttribute('data-sheet-state');
    seen.identity = await text(page, '[data-identity-line]');
    seen.flags = await text(page, '[data-sheet-flags]');
    seen.badges = await page.locator('[data-badge]').count();
    seen.kinds = await page.locator('[data-badge]').evaluateAll((els) => els.map((e) => e.getAttribute('data-badge-kind')));
    seen.sureness = await page.locator('[data-sureness]').evaluateAll((els) => els.map((e) => e.getAttribute('data-sureness')));
    seen.parts = await page.locator('[data-part]').evaluateAll((els) => els.map((e) => e.getAttribute('data-part')));
    seen.approve = await text(page, '[data-approve]');
    seen.approveOff = await page.locator('[data-approve]').isDisabled();
    seen.counted = await page.locator('[data-question][data-counted="no"]').count();
    seen.ranked = !(await notRanked(page));
    if (lang === 'hi') await hindi(page);
    await axe(page, `review ${who} ${lang}`);
  };
  const vihaanChecks = async () => {
    if (seen.state !== 'marked' || !/Matched to Vihaan Example A, roll 3/.test(seen.identity)) throw new Error(`Vihaan's script: ${JSON.stringify(seen)}`);
    if (!/The AI was not sure/.test(seen.flags) || !seen.sureness.includes('check')) throw new Error(`Vihaan's flag: ${JSON.stringify(seen)}`);
    if (seen.badges < 6 || seen.parts[0] !== 'written' || seen.ranked) throw new Error(`Vihaan's pages: ${JSON.stringify(seen)}`);
    if (seen.approveOff !== false) throw new Error('a flagged script cannot be approved by its own owner');
  };
  const aaravChecks = async () => {
    if (seen.state !== 'approved' || seen.approve !== 'Approved' || seen.approveOff !== true) throw new Error(`Aarav's script: ${JSON.stringify(seen)}`);
    if (!/by exam number/.test(seen.identity)) throw new Error(`Aarav is matched by exam number: ${seen.identity}`);
  };

  // Tara approves Anaya's clean script: the paper's marks show it (the acceptance test of docs/35).
  const approveOne = async (page) => {
    await seed(page);
    await page.locator('[data-approve]').waitFor({ timeout: 30000 });
    await imagesLoaded(page);
    // One tap of − on question 2 first: the teacher's mark is kept, and approval takes it (not the AI's).
    const q2 = page.locator('[data-question="2"]');
    seen.before = await q2.locator('[data-marks-input]').inputValue();
    await q2.locator('[data-marks-minus]').click();
    seen.typed = await q2.locator('[data-marks-input]').inputValue();
    await page.locator('[data-approve]').click();
    await page.locator('[data-sheet-note="ok"]').waitFor({ timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('[data-script-review]')?.getAttribute('data-sheet-state') === 'approved', null, { timeout: 20000 });
    seen.after = await text(page, '[data-approve]');
    await axe(page, 'approve one');
  };
  const approveOneChecks = async () => {
    const { rows } = await db.pg.query(
      `select s.state, s.approved_at is not null as stamped,
              (select score::float8 from marks where paper_id = $1 and student_id = $2 and component = 'written') as written,
              (select kind from marks where paper_id = $1 and student_id = $2 and component = 'written') as kind,
              (select entered_by from marks where paper_id = $1 and student_id = $2 and component = 'written') as entered_by,
              (select coalesce(sum(coalesce(m.marks, m.ai_marks)), 0)::float8 from marking_marks m join marking_questions q using (school_id, question_id) where m.sheet_id = s.sheet_id and q.choice_group is null)
              + (select coalesce(max(coalesce(m.marks, m.ai_marks)), 0)::float8 from marking_marks m join marking_questions q using (school_id, question_id) where m.sheet_id = s.sheet_id and q.choice_group = 'A') as rolled,
              (select count(*)::int from audit_log where event_action = 'marking.approved' and target_id = $1::text and actor_user_id = $3) as audits,
              (select m.marks::float8 from marking_marks m where m.sheet_id = s.sheet_id and m.question_id = $5) as q2_teacher
         from marking_sheets s where s.sheet_id = $4`,
      [MK.paper, KID.anaya, PEOPLE.teacher.sub, SHEET.anaya, MK.questions['2']]
    );
    const r = rows[0];
    if (!r || r.state !== 'approved' || !r.stamped || r.kind !== 'score' || r.entered_by !== PEOPLE.teacher.sub || r.written !== r.rolled || !(r.written > 0) || r.audits !== 1) throw new Error(`the approved script in the database: ${JSON.stringify(r)}`);
    if (seen.after !== 'Approved') throw new Error(`the approve button after approving: ${seen.after}`);
    // The mark the teacher gave is the one in the roll-up: half a mark off what was shown, or the same if it was nothing.
    if (!(Number(seen.typed) === Math.max(0, Math.round((Number(seen.before) - 0.5) * 2) / 2)) || r.q2_teacher !== Number(seen.typed)) throw new Error(`the teacher's change to question 2: ${JSON.stringify({ ...seen, teacher: r.q2_teacher })}`);
  };

  // "Approve all ready": only the marked scripts of a child with nothing to check (Anaya and Sana); the unsure, the
  // missing-page, the unmatched and the failed are left for a person. The count is said before it is pressed.
  const approveAll = async (page) => {
    await seed(page);
    await page.locator('[data-approve-all]').waitFor({ timeout: 30000 });
    seen.label = await text(page, '[data-approve-all]');
    await page.locator('[data-approve-all]').click();
    await page.locator('[data-approve-confirm]').waitFor({ timeout: 10000 });
    seen.confirm = await text(page, '[data-approve-confirm]');
    await page.locator('[data-approve-yes]').click();
    await page.locator('[data-review-note="ok"]').waitFor({ timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('[data-review-rows] > li[data-bucket="ready"]').length === 0, null, { timeout: 20000 });
    seen.note = await text(page, '[data-review-note]');
    await axe(page, 'approve all');
  };
  const approveAllChecks = async () => {
    const { rows } = await db.pg.query(
      `select s.sheet_id, s.state from marking_sheets s where s.paper_id = $1 order by s.sheet_id`,
      [MK.paper]
    );
    const marks = (await db.pg.query(`select student_id from marks where paper_id = $1 and component = 'written' and kind = 'score' order by student_id`, [MK.paper])).rows.map((r) => r.student_id);
    const audits = (await db.pg.query(`select after_state from audit_log where event_action = 'marking.approved' and target_id = $1::text`, [MK.paper])).rows;
    const states = Object.fromEntries(rows.map((r) => [r.sheet_id, r.state]));
    const want = { aarav: 'approved', meera: 'approved', vihaan: 'marked', anaya: 'approved', neel: 'marked', kabir: 'marked', sana: 'approved', ishaan: 'failed' };
    for (const [name, state] of Object.entries(want)) if (states[SHEET[name]] !== state) throw new Error(`${name} is ${states[SHEET[name]]}, expected ${state}`);
    if (JSON.stringify(marks) !== JSON.stringify([KID.aarav, KID.meera, KID.anaya, KID.sana].sort())) throw new Error(`the paper's marks after approving all: ${JSON.stringify(marks)}`);
    if (audits.length !== 1 || audits[0].after_state?.scripts !== 2 || audits[0].after_state?.all_unflagged !== true) throw new Error(`the audit of approving all: ${JSON.stringify(audits)}`);
    if (seen.label !== 'Approve all 2 ready' || !/^Approve all 2 ready\?/.test(seen.confirm) || !/Scripts approved: 2/.test(seen.note)) throw new Error(`the words around approving all: ${JSON.stringify(seen)}`);
  };

  // ---- an exam's candidates and exam numbers ------------------------------------------------------------------------
  const openCandidates = (lang) => async (page) => {
    await seed(page, { reload: false });
    if (lang === 'hi') {
      // The office has already withdrawn Kiara from this exam.
      await db.pg.query(`insert into exam_withdrawals (school_id, exam_id, student_id, reason, withdrawn_by) values ($1, $2, $3, 'Left the school this term', $4)`, [SCHOOL, MK.exam, KID.kiara, PEOPLE.principal.sub]);
    }
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator(`[data-candidates="${MK.exam}"] summary`).click();
    await page.locator(`[data-candidates="${MK.exam}"] [data-candidate-classes]`).waitFor({ timeout: 30000 });
    seen.link = await page.locator(`[data-exam="${MK.exam}"] [data-mark-with-ai]`).count();
    if (lang !== 'hi') {
      // Withdraw Kiara through the screen.
      await page.locator(`#mk-w-class-${MK.exam}`).selectOption({ label: '5-A' });
      await page.waitForFunction((id) => document.querySelectorAll(`#mk-w-child-${id} option`).length > 1, MK.exam, { timeout: 20000 });
      await page.locator(`#mk-w-child-${MK.exam}`).selectOption({ index: 9 });
      await page.locator(`#mk-w-reason-${MK.exam}`).fill('Left the school this term');
      await page.locator('[data-withdraw-save]').click();
      await page.locator('[data-candidates-note="ok"]').waitFor({ timeout: 20000 });
    }
    seen.counts = await page.locator(`[data-candidate-class] dl`).first().evaluate((dl) => [...dl.querySelectorAll('dd')].map((d) => d.textContent));
    seen.withdrawals = await page.locator('[data-withdrawal]').count();
    seen.numberingOn = await page.locator(`#mk-numbering-${MK.exam}`).isChecked();
    if (lang === 'hi') await hindi(page);
    await axe(page, `candidates ${lang}`);
  };
  const candidatesChecks = (lang) => async () => {
    const { rows } = await db.pg.query(`select reason, withdrawn_by from exam_withdrawals where exam_id = $1`, [MK.exam]);
    const counts = (await db.pg.query(`select on_roll, withdrawn, candidates, numbered from public.exam_candidate_counts($1) where class_id = $2`, [MK.exam, CLASS_5A])).rows[0];
    const teacher = await as(PEOPLE.teacher, 'GET', `/api/app/exams/${MK.exam}/candidates`);
    const teacherChange = await as(PEOPLE.teacher, 'POST', `/api/app/exams/${MK.exam}/candidates`, { action: 'numbering', numbering: 'roll' });
    if (rows.length !== 1 || rows[0].reason !== 'Left the school this term' || rows[0].withdrawn_by !== PEOPLE.principal.sub) throw new Error(`the withdrawal in the database: ${JSON.stringify(rows)}`);
    if (Number(counts.on_roll) !== 9 || Number(counts.withdrawn) !== 1 || Number(counts.candidates) !== 8) throw new Error(`the candidates counted: ${JSON.stringify(counts)}`);
    if (seen.link < 1 || seen.withdrawals !== 1 || seen.numberingOn !== true) throw new Error(`the candidates on the screen: ${JSON.stringify(seen)}`);
    if (JSON.stringify(seen.counts.slice(0, 3)) !== JSON.stringify(['9', '1', '8'])) throw new Error(`the class counts on the screen: ${JSON.stringify(seen.counts)}`);
    if (teacher.status !== 200 || teacher.body?.mayChange !== false || teacherChange.status !== 403) throw new Error(`a teacher reads but does not change: ${teacher.status} ${teacherChange.status}`);
    void lang;
  };
  const openNumbers = (lang) => async (page) => {
    await seed(page);
    await page.locator('[data-numbers-table]').waitFor({ timeout: 30000 });
    seen.rows = await page.locator('[data-number-row]').evaluateAll((els) => els.map((e) => [...e.querySelectorAll('td')].map((td) => td.textContent)));
    seen.title = await text(page, '[data-numbers-list] h2');
    if (lang === 'hi') await hindi(page);
    await axe(page, `numbers ${lang}`);
  };
  const numbersChecks = async () => {
    if (seen.rows.length !== 9) throw new Error(`the exam numbers list has ${seen.rows.length} rows`);
    // Roll order, and an exam number for each: the prefix, then the number in class and roll order.
    seen.rows.forEach((r, i) => {
      if (r[1] !== String(i + 1) || !/^HY\d{4}$/.test(r[0])) throw new Error(`row ${i + 1} of the exam numbers: ${JSON.stringify(r)}`);
    });
    if (seen.rows.map((r) => r[0]).join() !== [...seen.rows.map((r) => r[0])].sort().join()) throw new Error('the exam numbers are not in order');
    if (!/Half-yearly \(AI marking, harness\) · 5-A/.test(seen.title)) throw new Error(`the list's title: ${seen.title}`);
  };


  // ---- sending the class's scripts: real files through the real browser code (PDF.js and canvas), the server stood in for
  // The upload routes are another slice's (AM-2); here they are answered by the harness, which records what arrives: the
  // pictures must be JPEGs of at most 2000 px and 1.5 MB, sent in requests of at most six pages under the host's body
  // limit, in order; a request that fails once is sent again.
  let sent = null;
  const openUpload = async (page) => {
    await seed(page, { reload: false });
    sent = { starts: [], requests: [], failures: 0, closes: 0 };
    const said = [];
    page.on('console', (m) => m.type() === 'error' && said.push(m.text().slice(0, 300)));
    page.on('pageerror', (e) => said.push(`pageerror: ${e.message.slice(0, 300)}`));
    seen.said = said;
    await page.route(/\/api\/app\/marking\/papers\/[^/]+\/uploads$/, async (route) => {
      sent.starts.push(route.request().postDataJSON());
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ uploadId: '00000000-0000-4000-8000-0000000a9999' }) });
    });
    await page.route(/\/api\/app\/marking\/uploads\/[^/]+\/pages$/, async (route) => {
      // The second request fails once, as a flaky network does.
      if (sent.requests.length === 1 && sent.failures === 0) {
        sent.failures += 1;
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"try again"}' });
      }
      const body = route.request().postDataBuffer();
      const got = pagesOfRequest(body, route.request().headers()['content-type']);
      sent.requests.push({ bytes: body.length, fileNo: got.fileNo, pageNo: got.pageNo, sizes: got.jpegs.map((j) => ({ bytes: j.length, ...jpegSize(j) })) });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pages: got.pageNo.map((n, i) => ({ fileNo: got.fileNo[i], pageNo: n, pageId: `p-${got.fileNo[i]}-${n}`, duplicate: false })) }) });
    });
    await page.route(/\/api\/app\/marking\/uploads\/[^/]+\/close$/, async (route) => {
      sent.closes += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-scripts-uploader]').waitFor({ timeout: 30000 });
    await page.getByText('One scan with many children, in order').click();
    const pdf = makePdf([...Array(8).fill([595, 842]), [2480, 3508]]);
    await page.locator('#mk-upload-files').setInputFiles([
      { name: 'class-scan.pdf', mimeType: 'application/pdf', buffer: pdf },
      { name: 'IMG_0002.png', mimeType: 'image/png', buffer: makePng(2400, 3200) },
      { name: 'notes.docx', mimeType: 'application/msword', buffer: Buffer.from('not a scan') },
    ]);
    seen.skipped = await text(page, '[data-upload-note]');
    seen.picked = await page.locator('[data-picked-files] > li').evaluateAll((els) => els.map((e) => e.textContent?.trim().slice(0, 30)));
    await page.locator('[data-upload-start]').click();
    await page.locator('[data-upload-file="1"][data-status="done"], [data-upload-file="1"][data-status="failed"]').waitFor({ timeout: 90000 });
    if ((await page.locator('[data-upload-file="1"]').getAttribute('data-status')) === 'failed') throw new Error(`the PDF failed in the browser: ${JSON.stringify(seen.said)}`);
    await page.locator('[data-upload-file="2"][data-status="done"]').waitFor({ timeout: 90000 });
    await page.locator('[data-upload-close]').waitFor({ timeout: 10000 });
    seen.progress = await page.locator('[data-upload-file]').evaluateAll((els) => els.map((e) => e.textContent?.replace(/\s+/g, ' ').trim()));
    await axe(page, 'upload');
  };
  const uploadChecks = async (page) => {
    // Pressing "Mark these" closes the upload once.
    await page.locator('[data-upload-close]').click();
    await page.locator('[data-upload-note="ok"]').waitFor({ timeout: 10000 });
    const note = await text(page, '[data-upload-note]');
    const requests = sent.requests;
    const pages = requests.flatMap((r) => r.fileNo.map((f, i) => `${f}-${r.pageNo[i]}`));
    const want = [...Array(9).keys()].map((i) => `1-${i + 1}`).concat('2-1');
    if (JSON.stringify(pages) !== JSON.stringify(want)) throw new Error(`the pages that arrived: ${JSON.stringify(pages)}`);
    if (JSON.stringify(requests.map((r) => r.pageNo.length)) !== JSON.stringify([6, 3, 1])) throw new Error(`the requests were not six pages, three and one: ${JSON.stringify(requests.map((r) => r.pageNo.length))}`);
    if (sent.failures !== 1) throw new Error(`the failed request was not sent again (${sent.failures} failures)`);
    for (const r of requests) {
      if (r.bytes > 4_000_000) throw new Error(`a request of ${r.bytes} bytes is over the host's limit`);
      for (const j of r.sizes) {
        if (!j.width || Math.max(j.width, j.height) > 2000 || j.bytes > 1_500_000) throw new Error(`a picture that is not a JPEG within the limits: ${JSON.stringify(j)}`);
      }
    }
    const sizes = requests.flatMap((r) => r.sizes);
    // An A4 page is drawn at 2000 px on its long side, a 300 dpi page of 2480 x 3508 is brought down to it, and a phone photo of 2400 x 3200 as well.
    if (sizes[0].height !== 2000 || sizes[0].width < 1400 || sizes[0].width > 1420) throw new Error(`an A4 page picture: ${JSON.stringify(sizes[0])}`);
    if (sizes[8].height !== 2000 || sizes[9].height !== 2000 || sizes[9].width !== 1500) throw new Error(`the large page and the photo: ${JSON.stringify([sizes[8], sizes[9]])}`);
    if (JSON.stringify(sent.starts) !== JSON.stringify([{ mode: 'combined', files: 2 }])) throw new Error(`the upload's start: ${JSON.stringify(sent.starts)}`);
    if (sent.closes !== 1 || !/Marking has started/.test(note)) throw new Error(`closing the upload: ${sent.closes} ${note}`);
    if (!/Left out because they are not PDFs or photos: 1/.test(seen.skipped) || seen.picked.length !== 2) throw new Error(`the files picked: ${JSON.stringify([seen.skipped, seen.picked])}`);
    if (!seen.progress.every((p) => /Pages sent: \d+/.test(p))) throw new Error(`the progress shown: ${JSON.stringify(seen.progress)}`);
  };

  const examsRoute = '/app/exams';
  const numbersRoute = `/app/exams/${MK.exam}/classes/${CLASS_5A}/numbers`;
  return [
    ['teacher', 'app-marking-hub', hub, openHub('en'), finish(hubChecks)],
    ['teacher', 'app-marking-hub-hindi', hub, openHub('hi'), finish(hubChecks, { hindi: true })],
    ['teacher', 'app-marking-questions', hub, openQuestions, finish(questionsChecks)],
    ['teacher', 'app-marking-questions-edit', hub, editQuestions, finish(editChecks)],
    ['teacher', 'app-marking-upload', hub, openUpload, finish(uploadChecks)],
    ['teacher', 'app-marking-review-vihaan', review('vihaan'), openReview('vihaan', 'en'), finish(vihaanChecks)],
    ['teacher', 'app-marking-review-hindi', review('vihaan'), openReview('vihaan', 'hi'), finish(vihaanChecks, { hindi: true })],
    ['teacher', 'app-marking-review-aarav', review('aarav'), openReview('aarav', 'en'), finish(aaravChecks)],
    ['teacher', 'app-marking-approve', review('anaya'), approveOne, finish(approveOneChecks)],
    ['teacher', 'app-marking-approve-all', hub, approveAll, finish(approveAllChecks)],
    ['principal', 'app-exams-candidates', examsRoute, openCandidates('en'), finish(candidatesChecks('en'))],
    ['principal', 'app-exams-candidates-hindi', examsRoute, openCandidates('hi'), finish(candidatesChecks('hi'), { hindi: true })],
    ['principal', 'app-exams-numbers', numbersRoute, openNumbers('en'), finish(numbersChecks)],
    ['principal', 'app-exams-numbers-hindi', numbersRoute, openNumbers('hi'), finish(numbersChecks, { hindi: true })],
  ];
}
