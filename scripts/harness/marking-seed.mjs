// AI answer-sheet marking (C347) for the screenshot harness: one illustrative exam with a 5-A Mathematics paper, its
// questions, one upload of nine children's scripts in every state a teacher meets (approved, ready, unsure, a missing
// page, matched to no one, failed, no script), and drawn answer pages answered in the browser in place of real scans.
// Illustrative only: not a real school, child, script or mark. Loaded only by scripts/harness/ into a throwaway local
// database; the harness has no file store and no AI key, so nothing here is read by a model or stored anywhere.
//
//   seedMarking(db, { school, principal, teacher, publish })  makes it (publish: the class's result is published, every
//                                                              child entered, so families and the report link see it)
//   clearMarking(db, school)                                   takes it away again (and anything a screen added)
//   routeScriptPictures(target)                                answers the page pictures' addresses (a Playwright page
//                                                              or browser context) with a drawn page
//   MK                                                         the fixed ids, for links straight to a screen

import { createHash } from 'node:crypto';

const id = (n) => `00000000-0000-4000-8000-0000000a${String(n).padStart(4, '0')}`;
const C5A = '00000000-0000-4000-8000-0000000c0051';
const MATHS = '00000000-0000-4000-8000-0000000d0001';
const kid = (g) => `00000000-0000-4000-8000-0000005${String(g).padStart(5, '0')}`;

export const MK = {
  exam: id(9001),
  paper: id(9002),
  upload: id(9003),
  questions: {},
  sheets: {},
  pages: {},
};

// The questions: Written 40 (Q6 is "attempt either (a) or (b)"); Oral is typed by hand, as before.
const QUESTIONS = [
  { label: '1', max: 2, kind: 'objective', unit: 1, prompt: 'Which is bigger: 1/2 or 1/4?', key: '1/2', steps: [] },
  { label: '2', max: 3, kind: 'short', unit: 2, prompt: 'Compare 3/5 and 2/5 and give a reason.', key: '3/5 is bigger: the same parts, more of them.', steps: [{ step: 'Correct comparison', marks: 1 }, { step: 'Reason', marks: 2 }] },
  { label: '3', max: 5, kind: 'numerical', unit: 3, prompt: 'Mark 3/4 on a number line from 0 to 1.', key: 'Four equal parts; the third mark.', steps: [{ step: 'Four equal parts', marks: 2 }, { step: 'Third mark labelled', marks: 3 }] },
  { label: '4', max: 5, kind: 'numerical', unit: 4, prompt: 'Write 7 tenths as a decimal and as a fraction.', key: '0.7 and 7/10', steps: [{ step: 'Decimal', marks: 2 }, { step: 'Fraction', marks: 3 }] },
  { label: '5', max: 5, kind: 'short', unit: 5, prompt: 'Write 0.45 in words and as hundredths.', key: 'forty-five hundredths; 45/100', steps: [{ step: 'Words', marks: 2 }, { step: 'Hundredths', marks: 3 }] },
  { label: '6(a)', max: 10, kind: 'long', unit: 1, group: 'A', prompt: 'A cake is cut into halves and quarters. Explain with a drawing.', key: 'Two halves; four quarters; two quarters make a half.', steps: [{ step: 'Drawing', marks: 4 }, { step: 'Halves', marks: 3 }, { step: 'Quarters', marks: 3 }] },
  { label: '6(b)', max: 10, kind: 'long', unit: 4, group: 'A', prompt: 'Rohan has ₹0.75. How many tenths and hundredths is that?', key: '7 tenths and 5 hundredths', steps: [{ step: 'Tenths', marks: 5 }, { step: 'Hundredths', marks: 5 }] },
  { label: '7', max: 10, kind: 'long', unit: 2, prompt: 'Order 1/3, 2/3 and 1/6 from smallest to largest, showing your working.', key: '1/6, 1/3, 2/3', steps: [{ step: 'Common denominator', marks: 4 }, { step: 'Order', marks: 4 }, { step: 'Working shown', marks: 2 }] },
];
// Where each answer sits: page 1 holds Q1 to Q4, page 2 Q5 to Q7 (the drawn pages put them at the same heights).
const PLACE = { '1': [1, 0.16, 0.26], '2': [1, 0.3, 0.46], '3': [1, 0.5, 0.7], '4': [1, 0.74, 0.92], '5': [2, 0.08, 0.24], '6(a)': [2, 0.28, 0.58], '6(b)': [2, 0.28, 0.58], '7': [2, 0.62, 0.92] };

// The nine children of 5-A in the harness seed (roll 1 to 9), and what their scripts are.
const KIDS = [
  { g: 1, name: 'Aarav Example A', roll: '1', state: 'approved', scale: 0.85 },
  { g: 4, name: 'Meera Example A', roll: '2', state: 'approved', scale: 0.7 },
  { g: 7, name: 'Vihaan Example A', roll: '3', state: 'marked', flags: ['unsure'], scale: 0.55, unsure: '7' },
  { g: 10, name: 'Anaya Example A', roll: '4', state: 'marked', scale: 0.9 },
  { g: 13, name: 'Neel Example A', roll: '5', state: 'marked', flags: ['missing_page'], scale: 0.5, printed: [1, 3] },
  { g: 16, name: 'Kabir Example B', roll: null, state: 'marked', flags: ['identity'], scale: 0.65, unmatched: true },
  { g: 19, name: 'Sana Example B', roll: '7', state: 'marked', scale: 0.75 },
  { g: 22, name: 'Ishaan Example B', roll: '8', state: 'failed', failure: 'bad_answer' },
  // Kiara (roll 9) has no script.
];
const ERRORS = ['none', 'calculation', 'incomplete', 'concept', 'presentation'];

// A mark for a question: the child's own share of it, on half-mark steps, never above the question's marks.
const markFor = (q, k, i) => Math.min(q.max, Math.round(q.max * Math.min(1, Math.max(0, k.scale + (((i * 7 + k.g) % 5) - 2) * 0.08)) * 2) / 2);

async function asPerson(db, user, role, fn) {
  // The database stamps a teacher's change and an approval with the person in the session (C347): the harness sets
  // the same values the app's own session does, on its one connection, and clears them after.
  await db.pg.query(`select set_config('app.current_user_id', $1, false), set_config('app.current_role', $2, false)`, [user, role]);
  try {
    return await fn();
  } finally {
    await db.pg.query(`select set_config('app.current_user_id', '', false), set_config('app.current_role', '', false)`);
  }
}

export async function clearMarking(db, school) {
  await db.pg.exec(`set session_replication_role = replica;
    delete from marking_report_links where school_id = '${school}';
    delete from marking_marks where school_id = '${school}';
    delete from marking_pages where school_id = '${school}';
    delete from marking_sheets where school_id = '${school}';
    delete from marking_uploads where school_id = '${school}';
    delete from marking_questions where school_id = '${school}';
    delete from marking_setups where school_id = '${school}';
    delete from exam_seat_numbers where school_id = '${school}';
    delete from exam_withdrawals where school_id = '${school}';
    delete from exam_publications where school_id = '${school}' and exam_id = '${MK.exam}';
    delete from marks where school_id = '${school}' and exam_id = '${MK.exam}';
    delete from exam_papers where school_id = '${school}' and exam_id = '${MK.exam}';
    delete from exams where school_id = '${school}' and exam_id = '${MK.exam}';
    delete from audit_log where school_id = '${school}' and split_part(event_action, '.', 1) = 'marking';
    set session_replication_role = origin;`);
}

export async function seedMarking(db, { school, principal, teacher, publish = false }) {
  await clearMarking(db, school);
  await db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source, limits) values ($1, 'exams', true, 'plan', '{"ai_marking_pages": 2000}')
                     on conflict (school_id, module_id) do update set enabled = true, limits = coalesce(school_module_entitlements.limits, '{}'::jsonb) || '{"ai_marking_pages": 2000}'::jsonb`, [school]);
  // Both AI tasks as Control would set them (the harness never calls a model: nothing is queued).
  await db.pg.query(
    `insert into control.ai_providers (provider_id, enabled, cleared_for_minors, cleared_terms_url, cleared_at, cleared_by) values ('stand-in', true, true, 'https://example.invalid/terms', now(), $1)
     on conflict (provider_id) do update set enabled = true, cleared_for_minors = true, cleared_terms_url = excluded.cleared_terms_url, cleared_at = excluded.cleared_at, cleared_by = excluded.cleared_by`,
    [principal]
  );
  await db.pg.query(`update control.ai_profiles set provider_id = 'stand-in', model = 'harness', enabled = true where profile_id in ('exams.read_pages', 'exams.mark')`);
  const scheme = (await db.pg.query(`select 1 from grading_schemes where school_id = $1`, [school])).rows[0];
  if (!scheme) {
    await db.pg.query(`insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 1, $2::jsonb, $3)`, [
      school,
      JSON.stringify({
        bands: [{ from: 75, to: 100, grade: 'A', meaning: null }, { from: 50, to: 74, grade: 'B', meaning: null }, { from: 33, to: 49, grade: 'C', meaning: null }, { from: 0, to: 32, grade: 'D', meaning: null }],
        decimals: 0,
        passMark: 33,
        components: [{ key: 'written', kind: 'theory', name: 'Written', share: 80, passMark: null, parts: [] }, { key: 'oral', kind: 'other', name: 'Oral', share: 20, passMark: null, parts: [] }],
        terms: [{ name: 'Term 1' }, { name: 'Term 2' }],
        layout: { components: true, total: true, percent: true, grade: true, attendance: true, remarks: true, coScholastic: false },
        coScholastic: null,
      }),
      principal,
    ]);
  }
  const units = (await db.pg.query(`select unit_id, position from syllabus_units where school_id = $1 and class_id = $2 and subject_id = $3 order by position`, [school, C5A, MATHS])).rows;
  const unitAt = (n) => units.find((u) => Number(u.position) === n)?.unit_id ?? null;
  await db.pg.query(
    `insert into exams (exam_id, school_id, name, term, created_by, session_id, numbering, seat_prefix)
     values ($1, $2, 'Half-yearly (AI marking, harness)', 'Term 1', $3, (select session_id from academic_sessions where school_id = $2 and is_current), 'seat', 'HY')`,
    [MK.exam, school, principal]
  );
  await db.pg.query(
    `insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, paper_date, unit_ids, components, created_by)
     values ($1, $2, $3, $4, $5, (now() at time zone 'Asia/Kolkata')::date - 3, $6::uuid[], $7::jsonb, $8)`,
    [MK.paper, school, MK.exam, C5A, MATHS, units.map((u) => u.unit_id), JSON.stringify([{ key: 'written', name: 'Written', max: 40, share: 80 }, { key: 'oral', name: 'Oral', max: 10, share: 20 }]), principal]
  );
  await asPerson(db, teacher, 'teacher', async () => {
    await db.pg.query(`insert into marking_setups (school_id, paper_id, language, guidance, choice_counts, updated_by) values ($1, $2, 'en', 'Give method marks for correct working even when the final answer is wrong.', '{"A": 1}', $3)`, [school, MK.paper, teacher]);
    for (const [i, q] of QUESTIONS.entries()) {
      MK.questions[q.label] = id(9100 + i);
      await db.pg.query(
        `insert into marking_questions (school_id, question_id, paper_id, position, label, component, max_marks, choice_group, unit_id, kind, prompt, answer_key, steps, updated_by)
         values ($1, $2, $3, $4, $5, 'written', $6, $7, $8, $9, $10, $11, $12::jsonb, $13)`,
        [school, MK.questions[q.label], MK.paper, i + 1, q.label, q.max, q.group ?? null, unitAt(q.unit), q.kind, q.prompt, q.key, JSON.stringify(q.steps), teacher]
      );
    }
    await db.pg.query(`insert into marking_uploads (school_id, upload_id, paper_id, mode, created_by, created_at, closed_at) values ($1, $2, $3, 'per_file', $4, now() - interval '2 hours', now() - interval '2 hours')`, [school, MK.upload, MK.paper, teacher]);
  });

  let n = 0;
  for (const [f, k] of KIDS.entries()) {
    const sheet = id(9200 + f);
    MK.sheets[k.name.split(' ')[0].toLowerCase()] = sheet;
    const printed = k.printed ?? [1, 2];
    await db.pg.query(
      `insert into marking_sheets (school_id, sheet_id, paper_id, upload_id, student_id, matched_by, match_note, state, flags, failure, ai_provider, ai_model, prompt_version, marked_at, ai_confidence, strengths, improve, practice, created_at)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, 'v1', $13, $14, $15, $16, $17::jsonb, now() - interval '2 hours' + make_interval(secs => $18))`,
      [
        school,
        sheet,
        MK.paper,
        MK.upload,
        k.unmatched ? null : kid(k.g),
        k.unmatched ? 'none' : k.roll === '1' ? 'seat' : 'roll',
        JSON.stringify({ read: { name: k.unmatched ? 'Kabir' : k.name, rollNo: k.roll, seatNo: k.roll === '1' ? 'HY0001' : null }, candidates: k.unmatched ? [kid(16)] : [] }),
        k.state === 'approved' ? 'marked' : k.state,
        k.flags ?? [],
        k.failure ?? null,
        k.state === 'failed' ? null : 'stand-in',
        k.state === 'failed' ? null : 'harness',
        k.state === 'failed' ? null : new Date(Date.now() - 90 * 60_000).toISOString(),
        k.state === 'failed' ? null : k.unsure ? 0.62 : 0.88,
        k.state === 'failed' ? null : 'Neat working; fractions compared with a reason.',
        k.state === 'failed' ? null : 'Show every step when ordering fractions; check the last line.',
        JSON.stringify(k.state === 'failed' ? [] : [{ unitId: unitAt(2), text: 'Five questions comparing fractions with the same denominator.' }, { unitId: unitAt(4), text: 'Write five amounts of money as tenths and hundredths.' }]),
        f,
      ]
    );
    for (let p = 1; p <= 2; p++) {
      const page = id(9300 + n++);
      MK.pages[page] = { name: k.unmatched ? 'Kabir' : k.name, roll: k.roll, page: printed[p - 1], sheetPage: p };
      await db.pg.query(
        `insert into marking_pages (school_id, page_id, upload_id, paper_id, file_no, page_no, storage_key, sha256, bytes, width, height, state, reading, sheet_id, sheet_position)
         values ($1, $2, $3, $4, $5, $6, $7, $10, 380000, 1414, 2000, 'read', $8::jsonb, $9, $6)`,
        [school, page, MK.upload, MK.paper, f + 1, p, `${school}/marking/${MK.paper}/${page}.jpg`,
          JSON.stringify({ firstPage: p === 1, name: p === 1 ? (k.unmatched ? 'Kabir' : k.name) : null, rollNo: p === 1 ? k.roll : null, seatNo: null, classSection: '5-A', pageNumber: printed[p - 1], blank: false, legible: true, answerPage: true, idDocument: false }), sheet,
          createHash('sha256').update(page).digest('hex')]
      );
    }
    if (k.state === 'failed') continue;
    const pageOf = (s) => Object.keys(MK.pages).find((pid) => MK.pages[pid].name === (k.unmatched ? 'Kabir' : k.name) && MK.pages[pid].sheetPage === s);
    for (const [i, q] of QUESTIONS.entries()) {
      // Each child answers one of 6(a) and 6(b): the other is not attempted.
      const skipped = (q.label === '6(a)' && k.g % 2 === 0) || (q.label === '6(b)' && k.g % 2 === 1);
      const marks = skipped ? 0 : markFor(q, k, i);
      const [pg, y0, y1] = PLACE[q.label];
      const error = skipped ? 'not_attempted' : marks === q.max ? 'none' : ERRORS[1 + ((i + k.g) % 4)];
      const steps = q.steps.map((s, j) => ({ step: s.step, awarded: skipped ? 0 : Math.min(s.marks, Math.max(0, marks - q.steps.slice(0, j).reduce((a, b) => a + b.marks, 0))), note: null }));
      await db.pg.query(
        `insert into marking_marks (school_id, sheet_id, paper_id, question_id, attempted, ai_marks, ai_steps, ai_note, ai_reason, error_type, confidence, page_id, y_from, y_to)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14)`,
        [school, sheet, MK.paper, MK.questions[q.label], !skipped, marks, JSON.stringify(steps),
          skipped ? null : marks === q.max ? 'All correct.' : 'Look again at the last step of your working.',
          skipped ? 'Not attempted: the other part of Q6 was answered.' : marks === q.max ? 'Matches the key at every step.' : 'Method right; the final line does not follow from the step before.',
          error, k.unsure === q.label ? 0.48 : 0.86 + ((i + k.g) % 3) * 0.04, skipped ? null : pageOf(pg), skipped ? null : y0, skipped ? null : y1]
      );
    }
  }

  // Approval as Tara would press it: the scripts' Written part into the paper's marks (Q6 counts its better half).
  const written = async (sheet) => {
    const rows = (await db.pg.query(`select q.label, q.choice_group, coalesce(m.marks, m.ai_marks)::float8 as v from marking_marks m join marking_questions q using (school_id, question_id) where m.sheet_id = $1`, [sheet])).rows;
    const six = rows.filter((r) => r.choice_group === 'A').reduce((a, r) => Math.max(a, r.v), 0);
    return Math.min(40, rows.filter((r) => !r.choice_group).reduce((a, r) => a + r.v, 0) + six);
  };
  const putMark = (g, component, kind, score) =>
    db.pg.query(
      `insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score, entered_by) values ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9)
       on conflict (school_id, paper_id, component, student_id) do update set kind = excluded.kind, score = excluded.score`,
      [school, MK.exam, MATHS, MK.paper, component, kid(g), kind, score, teacher]
    );
  const approve = async (k) => {
    await putMark(k.g, 'written', 'score', await written(MK.sheets[k.name.split(' ')[0].toLowerCase()]));
    await asPerson(db, teacher, 'teacher', () => db.pg.query(`update marking_sheets set state = 'approved', approved_at = now() where sheet_id = $1`, [MK.sheets[k.name.split(' ')[0].toLowerCase()]]));
  };
  for (const k of KIDS.filter((x) => x.state === 'approved')) await approve(k);

  if (publish) {
    // Everything settled: the unsure and the missing-page scripts approved, Kabir's script given to him, Ishaan's
    // marks typed by hand, Kiara absent; Oral typed for all. Then the principal publishes 5-A.
    await asPerson(db, teacher, 'teacher', () => db.pg.query(`update marking_sheets set student_id = $2, matched_by = 'teacher', flags = '{}' where sheet_id = $1`, [MK.sheets.kabir, kid(16)]));
    for (const k of KIDS.filter((x) => x.state === 'marked')) await approve(k);
    await putMark(22, 'written', 'score', 24);
    await putMark(25, 'written', 'absent', null);
    for (const g of [1, 4, 7, 10, 13, 16, 19, 22]) await putMark(g, 'oral', 'score', 6 + (g % 4));
    await putMark(25, 'oral', 'absent', null);
    await db.pg.query(`update exam_papers set entered_by = $2 where paper_id = $1`, [MK.paper, teacher]);
    const s = (await db.pg.query(`select version, scheme from grading_schemes where school_id = $1 order by version desc limit 1`, [school])).rows[0];
    await db.pg.query(`insert into exam_publications (school_id, exam_id, class_id, version, scheme_version, scheme, recognition, published_by) values ($1, $2, $3, 1, $4, $5::jsonb, '{}'::jsonb, $6)`, [school, MK.exam, C5A, s.version, JSON.stringify(s.scheme), principal]);
  }
  return MK;
}

// A drawn answer page for any page picture's address the app serves (the teacher's, the family's and the report
// link's): ruled paper, the child's header on page 1, and handwriting-like answers at the heights the marks point to.
export async function routeScriptPictures(target) {
  const draw = (pageId) => {
    const p = MK.pages[pageId] ?? { name: 'Illustrative child', roll: '1', page: 1, sheetPage: 1 };
    // A card scanned with the answer sheets (C230-AG): drawn as a plain made-up card, with no number on it.
    if (p.card)
      return `<svg xmlns="http://www.w3.org/2000/svg" width="1414" height="2000" viewBox="0 0 1414 2000"><rect width="1414" height="2000" fill="#f4f4f4"/><rect x="257" y="700" width="900" height="560" rx="40" fill="#fff" stroke="#8a8a8a" stroke-width="6"/><rect x="317" y="790" width="240" height="300" fill="#d9d9d9"/><text x="610" y="850" font-family="Arial" font-size="40" fill="#333">ILLUSTRATIVE CARD</text><text x="610" y="920" font-family="Arial" font-size="32" fill="#555">Not a real document</text><text x="610" y="990" font-family="Arial" font-size="32" fill="#555">Name: Illustrative</text></svg>`;
    const lines = [];
    for (let y = 120; y < 1980; y += 46) lines.push(`<line x1="70" x2="1360" y1="${y}" y2="${y}" stroke="#c9d6e8" stroke-width="2"/>`);
    // The drawn writing is XML: a "<" in it (Q7 compares fractions) must be written &lt; or the picture does not draw.
    const hand = (y, text) => `<text x="150" y="${y}" font-family="Comic Sans MS, Segoe Print, cursive" font-size="40" fill="#1f2a5a">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`;
    const qs = p.sheetPage === 1
      ? [[0.16, 'Q1. 1/2 is bigger'], [0.3, 'Q2. 3/5 > 2/5 because more parts'], [0.5, 'Q3. 0 — 1/4 — 2/4 — 3/4 — 1'], [0.74, 'Q4. 0.7 = 7/10']]
      : [[0.08, 'Q5. forty five hundredths = 45/100'], [0.28, 'Q6. 0.75 = 7 tenths and 5 hundredths'], [0.62, 'Q7. 1/6 < 1/3 < 2/3 (6ths: 1, 2, 4)']];
    const body = qs.map(([f, t]) => hand(Math.round(f * 2000) + 50, t) + hand(Math.round(f * 2000) + 110, '… working shown here …')).join('');
    const head = p.sheetPage === 1 ? `<text x="90" y="80" font-family="Arial" font-size="34" fill="#333">Name: ${p.name}   Roll no: ${p.roll ?? '—'}   Class: 5-A   Mathematics</text>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1414" height="2000" viewBox="0 0 1414 2000"><rect width="1414" height="2000" fill="#fbf8ef"/>${lines.join('')}<line x1="130" x2="130" y1="100" y2="1990" stroke="#e7a3a3" stroke-width="3"/>${head}${body}<text x="1300" y="1975" font-family="Arial" font-size="30" fill="#555">${p.page}</text></svg>`;
  };
  const answer = (route) => {
    const m = /pages\/([0-9a-f-]{36})/.exec(route.request().url());
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', headers: { 'Cache-Control': 'no-store' }, body: draw(m ? m[1] : '') });
  };
  await target.route('**/marking/pages/**', answer);
  await target.route('**/results/*/pages/**', answer);
}
