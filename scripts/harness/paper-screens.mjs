// Question papers from what was taught for the screenshot harness (AQ-2, C362, C363): "Make the paper" on a fresh
// half-yearly paper of 5-A Mathematics (its plan from a made-up taught log: which rule chose the chapters, each
// chapter's periods and marks, the blueprint's sections), a unit test paper as if just made (the questions with their
// options, right keys and difficulty, the keep-and-print panel), keeping it, and "Make every paper" on the exam
// screen. Illustrative only: no real school, teacher, child or question; the harness never calls a model (the made
// paper's questions are written here, as the job would write them). Loaded only by run.mjs, into a throwaway database.
//
//   paperScreens(ctx)   the screens as run.mjs's list wants them: [who, name, route, prepare(page), after(page)]
import { createRequire } from 'node:module';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const id = (n) => `00000000-0000-4000-8000-0000000a${String(n).padStart(4, '0')}`;
const C5A = '00000000-0000-4000-8000-0000000c0051';
const MATHS = '00000000-0000-4000-8000-0000000d0001';
const TEACHER_ROW = '00000000-0000-4000-8000-0000000a2003';
export const PP = { half: id(7001), halfPaper: id(7002), unit: id(7003), unitPaper: id(7004), generation: id(7005) };

// The unit test as the job would have made it: ten choice questions of a mark and five short ones of three.
const CHOICE = [
  ['Which fraction shows one half of a pizza cut into 4 equal parts?', ['1/4', '2/4', '3/4', '4/4'], 'B'],
  ['Which is bigger: 1/3 or 1/5?', ['1/3', '1/5', 'They are equal', 'Cannot say'], 'A'],
  ['Where is 1/2 on a number line from 0 to 1?', ['At 0', 'Halfway', 'At 1', 'Past 1'], 'B'],
  ['How many quarters make a whole?', ['2', '3', '4', '5'], 'C'],
  ['Which fraction is equal to 2/4?', ['1/2', '1/4', '3/4', '2/2'], 'A'],
  ['Which decimal is seven tenths?', ['0.07', '0.7', '7.0', '70'], 'B'],
  ['Which is the largest?', ['0.3', '0.25', '0.5', '0.45'], 'C'],
  ['How is 0.09 read?', ['Nine tenths', 'Nine hundredths', 'Ninety', 'Nine'], 'B'],
  ['Which fraction is 0.5?', ['1/5', '5/1', '1/2', '2/5'], 'C'],
  ['How many hundredths are in one tenth?', ['1', '10', '100', '1000'], 'B'],
];
const SHORT = [
  ['Draw a circle, split it into quarters and shade three of them. Write the fraction shaded.', 'Four equal parts, three shaded: 3/4.', 'Fractions', 'Halves and quarters'],
  ['Compare 2/3 and 3/4. Show how you decided.', 'Common denominator 12: 8/12 and 9/12, so 3/4 is bigger.', 'Fractions', 'Comparing two fractions'],
  ['Mark 1/4 and 3/4 on a number line from 0 to 1.', 'Four equal parts; marks at the first and third.', 'Fractions', 'Fractions on the number line'],
  ['Write 0.6 as a fraction and in words.', '6/10; six tenths.', 'Decimals', 'Tenths'],
  ['Arrange 0.45, 0.4 and 0.54 from smallest to largest.', '0.4, 0.45, 0.54', 'Decimals', 'Hundredths'],
];

export function paperScreens({ db, SCHOOL, PEOPLE, base, speak, backToEnglish }) {
  const teacher = PEOPLE.teacher.sub;
  const principal = PEOPLE.principal.sub;
  let before = null;
  let seen = {};
  let axeFound = [];

  const units = async () =>
    (await db.pg.query(`select unit_id, chapter, topic, position from syllabus_units where school_id = $1 and class_id = $2 and subject_id = $3 order by position`, [SCHOOL, C5A, MATHS])).rows;

  const clear = async () => {
    await db.pg.exec(`set session_replication_role = replica;
      delete from jobs where type = 'papers.make' and school_id = '${SCHOOL}';
      delete from paper_generations where school_id = '${SCHOOL}' and paper_id in ('${PP.halfPaper}', '${PP.unitPaper}');
      delete from marking_questions where school_id = '${SCHOOL}' and paper_id in ('${PP.halfPaper}', '${PP.unitPaper}');
      delete from marking_setups where school_id = '${SCHOOL}' and paper_id in ('${PP.halfPaper}', '${PP.unitPaper}');
      delete from question_bank where school_id = '${SCHOOL}';
      delete from syllabus_progress where school_id = '${SCHOOL}' and note = 'paper-screens';
      delete from exam_papers where school_id = '${SCHOOL}' and paper_id in ('${PP.halfPaper}', '${PP.unitPaper}');
      delete from exams where school_id = '${SCHOOL}' and exam_id in ('${PP.half}', '${PP.unit}');
      delete from audit_log where school_id = '${SCHOOL}' and event_action like 'marking.paper%';
      set session_replication_role = origin;`);
  };
  const seed = async () => {
    if (!before) {
      before = {
        entitlement: (await db.pg.query(`select enabled, source, limits from school_module_entitlements where school_id = $1 and module_id = 'exams'`, [SCHOOL])).rows[0] ?? null,
        provider: (await db.pg.query(`select 1 from control.ai_providers where provider_id = 'stand-in'`)).rows.length > 0,
        profile: (await db.pg.query(`select provider_id, model, enabled from control.ai_profiles where profile_id = 'exams.write_questions'`)).rows[0],
      };
    }
    seen = {};
    await clear();
    await db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source, limits) values ($1, 'exams', true, 'plan', '{}') on conflict (school_id, module_id) do update set enabled = true`, [SCHOOL]);
    await db.pg.query(
      `insert into control.ai_providers (provider_id, enabled) values ('stand-in', true) on conflict (provider_id) do update set enabled = true`
    );
    await db.pg.query(`update control.ai_profiles set provider_id = 'stand-in', model = 'harness', enabled = true where profile_id = 'exams.write_questions'`);
    const scheme = (await db.pg.query(`select 1 from grading_schemes where school_id = $1`, [SCHOOL])).rows[0];
    if (!scheme) {
      await db.pg.query(`insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 1, $2::jsonb, $3)`, [
        SCHOOL,
        JSON.stringify({
          bands: [{ from: 75, to: 100, grade: 'A', meaning: null }, { from: 0, to: 74, grade: 'B', meaning: null }],
          decimals: 0,
          passMark: 33,
          components: [{ key: 'written', kind: 'theory', name: 'Written', share: 80, passMark: null, parts: [] }, { key: 'oral', kind: 'other', name: 'Oral', share: 20, passMark: null, parts: [] }],
          terms: [{ name: 'Term 1' }],
          layout: { components: true, total: true, percent: true, grade: true, attendance: true, remarks: true, coScholastic: false },
          coScholastic: null,
        }),
        principal,
      ]);
    }
    const map = await units();
    // The taught log: Fractions five periods, Decimals three, in the last three weeks.
    const taught = [[1, 20], [1, 19], [2, 16], [3, 15], [3, 12], [4, 9], [4, 8], [5, 5]];
    for (const [pos, ago] of taught) {
      const u = map.find((x) => Number(x.position) === pos);
      await db.pg.query(
        `insert into syllabus_progress (school_id, teacher_id, class_id, subject_id, topic, status, date, unit_id, note)
         values ($1, $2, $3, $4, $5, 'taught', (now() at time zone 'Asia/Kolkata')::date - $6::int, $7, 'paper-screens')`,
        [SCHOOL, TEACHER_ROW, C5A, MATHS, u.topic, ago, u.unit_id]
      );
    }
    const exam = async (examId, name, type) =>
      db.pg.query(
        `insert into exams (exam_id, school_id, name, term, created_by, session_id, exam_type) values ($1, $2, $3, 'Term 1', $4, (select session_id from academic_sessions where school_id = $2 and is_current), $5)`,
        [examId, SCHOOL, name, principal, type]
      );
    const paper = async (paperId, examId, parts) =>
      db.pg.query(
        `insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, paper_date, unit_ids, components, created_by)
         values ($1, $2, $3, $4, $5, (now() at time zone 'Asia/Kolkata')::date + 5, '{}', $6::jsonb, $7)`,
        [paperId, SCHOOL, examId, C5A, MATHS, JSON.stringify(parts), principal]
      );
    await exam(PP.half, 'Half-yearly (question paper, harness)', 'half_yearly');
    await paper(PP.halfPaper, PP.half, [{ key: 'written', name: 'Written', max: 80, share: 80 }, { key: 'oral', name: 'Oral', max: 20, share: 20 }]);
    await exam(PP.unit, 'Unit test 2 (question paper, harness)', 'unit');
    await paper(PP.unitPaper, PP.unit, [{ key: 'written', name: 'Written', max: 25, share: null }]);
  };
  // The unit test as papers.make leaves it: AI drafts in the bank in the teacher's name, the paper's questions, a done
  // making. The paper is not kept yet.
  const seedMade = async () => {
    const map = await units();
    const unitOf = (chapter, topic) => map.find((u) => u.chapter === chapter && u.topic === topic) ?? map.find((u) => u.chapter === chapter);
    const levels = ['easy', 'medium', 'easy', 'medium', 'hard'];
    await db.pg.query(`select set_config('app.current_user_id', $1, false), set_config('app.current_role', 'teacher', false)`, [teacher]);
    try {
      let n = 0;
      const put = async (q) => {
        n += 1;
        const bank = (
          await db.pg.query(
            `insert into question_bank (school_id, grade, subject_id, chapter, topic, kind, max_marks, prompt, options, correct, answer_key, steps, difficulty, language, source, state, created_by)
             values ($1, '5', $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11::jsonb, $12, 'en', 'ai', 'draft', $13) returning bank_id`,
            [SCHOOL, MATHS, q.unit.chapter, q.unit.topic, q.kind, q.marks, q.prompt, JSON.stringify(q.options), q.correct ? JSON.stringify(q.correct) : null, q.key, JSON.stringify(q.steps), q.level, teacher]
          )
        ).rows[0].bank_id;
        await db.pg.query(
          `insert into marking_questions (school_id, paper_id, position, label, component, max_marks, unit_id, kind, prompt, answer_key, steps, options, correct, difficulty, section, bank_id, updated_by)
           values ($1, $2, $3, $4, 'written', $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15, $16)`,
          [SCHOOL, PP.unitPaper, n, String(n), q.marks, q.unit.unit_id, q.kind, q.prompt, q.key, JSON.stringify(q.steps), JSON.stringify(q.options), q.correct ? JSON.stringify(q.correct) : null, q.level, q.section, bank, teacher]
        );
      };
      for (const [i, [prompt, opts, key]] of CHOICE.entries()) {
        const unit = i < 5 ? unitOf('Fractions', ['Halves and quarters', 'Comparing two fractions', 'Fractions on the number line'][i % 3]) : unitOf('Decimals', i % 2 ? 'Tenths' : 'Hundredths');
        await put({ unit, kind: 'objective', marks: 1, prompt, options: opts.map((text, k) => ({ key: 'ABCD'[k], text })), correct: { keys: [key] }, key: `${key}: ${opts['ABCD'.indexOf(key)]}`, steps: [{ step: 'Right option', marks: 1 }], level: levels[i % 5], section: 'A' });
      }
      for (const [i, [prompt, key, chapter, topic]] of SHORT.entries()) {
        await put({ unit: unitOf(chapter, topic), kind: 'short', marks: 3, prompt, options: [], correct: null, key, steps: [{ step: 'Method', marks: 2 }, { step: 'Answer', marks: 1 }], level: levels[(i + 2) % 5], section: 'B' });
      }
      await db.pg.query(`insert into marking_setups (school_id, paper_id, language, choice_counts, updated_by) values ($1, $2, 'en', '{}', $3)`, [SCHOOL, PP.unitPaper, teacher]);
      await db.pg.query(
        `insert into paper_generations (school_id, generation_id, paper_id, kind, state, blueprint, plan, result, attempts, ai_provider, ai_model, prompt_version, requested_by, started_at, finished_at)
         values ($1, $2, $3, 'paper', 'done', '{"minutes": 60}', '{}', '{"bank": 0, "ai": 15, "empty": 0, "aiOff": false}', 1, 'stand-in', 'harness', 'v1', $4, now() - interval '3 minutes', now() - interval '1 minute')`,
        [SCHOOL, PP.generation, PP.unitPaper, teacher]
      );
    } finally {
      await db.pg.query(`select set_config('app.current_user_id', '', false), set_config('app.current_role', '', false)`);
    }
  };
  const putBack = async () => {
    await clear();
    if (!before) return;
    await db.pg.query(`update control.ai_profiles set provider_id = $1, model = $2, enabled = $3 where profile_id = 'exams.write_questions'`, [before.profile?.provider_id ?? null, before.profile?.model ?? null, before.profile?.enabled ?? true]);
    if (!before.provider) await db.pg.query(`delete from control.ai_providers where provider_id = 'stand-in'`).catch(() => undefined);
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

  // ---- "Make the paper" on a fresh half-yearly paper ------------------------------------------------------------------
  const makeRoute = `/app/exams/papers/${PP.halfPaper}/marking`;
  const openMake = (lang) => async (page) => {
    await seed();
    await page.reload({ waitUntil: 'networkidle' });
    if (lang === 'hi') {
      await speak('हिन्दी')(page);
      await page.waitForTimeout(500);
    }
    await page.locator('[data-plan-chapters] > li').first().waitFor({ timeout: 30000 });
    seen.scope = await page.locator('[data-scope]').getAttribute('data-scope');
    seen.chapters = await page.locator('[data-plan-chapters] > li').count();
    seen.sections = await page.locator('[data-plan-sections] > li').count();
    seen.total = await text(page, '[data-plan-total]');
    seen.problems = await page.locator('[data-plan-problems]').count();
    seen.make = await page.locator('[data-make-paper]').count();
    await axe(page, `make ${lang}`);
  };
  const makeChecks = (lang) => async () => {
    if (seen.scope !== 'session:log') throw new Error(`the scope: ${seen.scope}`);
    if (seen.chapters !== 2 || seen.sections !== 5) throw new Error(`the plan: ${seen.chapters} chapters, ${seen.sections} sections`);
    if (seen.problems !== 0 || seen.make !== 1) throw new Error(`the plan has problems (${seen.problems}) or no "Make the paper" (${seen.make})`);
    if (lang === 'en' && !/Sections: 80 marks · the paper’s Written: 80 marks/.test(seen.total)) throw new Error(`the totals: ${seen.total}`);
  };

  // ---- a unit test just made: the questions with their answer fields, and keeping it ----------------------------------
  const madeRoute = `/app/exams/papers/${PP.unitPaper}/marking`;
  const openMade = async (page) => {
    await seed();
    await seedMade();
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-keep-print]').waitFor({ timeout: 30000 });
    await page.locator('[data-questions-open]').click();
    await page.locator('[data-questions-editor] [data-choice-options]').first().waitFor({ timeout: 30000 });
    seen.made = await text(page, '[data-made]');
    seen.options = await page.locator('[data-choice-options]').count();
    seen.printDisabled = await page.locator('[data-print-paper]').isDisabled();
    seen.keep = await page.locator('[data-keep-paper]').count();
    await page.evaluate(() => window.scrollTo(0, 0));
    await axe(page, 'made');
  };
  const madeChecks = async () => {
    if (!/0 from the bank, 15 written by the AI, 0 left for you/.test(seen.made)) throw new Error(`the making: ${seen.made}`);
    if (seen.options !== 10) throw new Error(`choice questions with options: ${seen.options}`);
    if (!seen.printDisabled || seen.keep !== 1) throw new Error('an unkept paper offers printing');
  };
  const keepIt = async (page) => {
    await seed();
    await seedMade();
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-keep-paper]').click();
    await page.locator('[data-maker-note="ok"]').waitFor({ timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector('[data-print-paper]')?.hasAttribute('disabled'), null, { timeout: 20000 });
    seen.note = await text(page, '[data-maker-note]');
  };
  const keepChecks = async () => {
    const kept = (await db.pg.query(`select kept_by from marking_setups where paper_id = $1`, [PP.unitPaper])).rows[0];
    if (kept?.kept_by !== teacher) throw new Error(`the paper is not kept by the teacher: ${JSON.stringify(kept)}`);
    const bank = (await db.pg.query(`select state, source, count(*)::int as n from question_bank where school_id = $1 group by 1, 2`, [SCHOOL])).rows;
    if (JSON.stringify(bank) !== JSON.stringify([{ state: 'kept', source: 'paper', n: 15 }])) throw new Error(`the bank after keeping: ${JSON.stringify(bank)}`);
  };

  // ---- "Make every paper" on the exam ------------------------------------------------------------------------------------
  const makeAll = async (page) => {
    await seed();
    await page.reload({ waitUntil: 'networkidle' });
    const card = page.locator(`[data-exam="${PP.half}"]`);
    await card.locator('[data-make-all]').click();
    await card.locator('[data-make-all-sure]').click();
    await card.locator('[data-make-all-result]').waitFor({ timeout: 30000 });
    seen.result = await text(page, `[data-exam="${PP.half}"] [data-make-all-result]`);
    await card.scrollIntoViewIfNeeded();
    await axe(page, 'make every paper');
  };
  const makeAllChecks = async () => {
    const rows = (await db.pg.query(`select paper_id, state, requested_by from paper_generations where school_id = $1`, [SCHOOL])).rows;
    if (rows.length !== 1 || rows[0].paper_id !== PP.halfPaper || rows[0].requested_by !== principal) throw new Error(`the makings asked for: ${JSON.stringify(rows)}`);
    const jobs = Number((await db.pg.query(`select count(*)::int as n from jobs where type = 'papers.make' and school_id = $1`, [SCHOOL])).rows[0].n);
    if (jobs !== 1) throw new Error(`papers.make jobs queued: ${jobs}`);
    if (!/Papers being made: 1/.test(seen.result)) throw new Error(`the result: ${seen.result}`);
  };

  return [
    ['teacher', 'app-papers-make', makeRoute, openMake('en'), finish(makeChecks('en'))],
    ['teacher', 'app-papers-make-hindi', makeRoute, openMake('hi'), finish(makeChecks('hi'), { hindi: true })],
    ['teacher', 'app-papers-made', madeRoute, openMade, finish(madeChecks)],
    ['teacher', 'app-papers-kept', madeRoute, keepIt, finish(keepChecks)],
    ['principal', 'app-papers-make-every', '/app/exams', makeAll, finish(makeAllChecks)],
  ];
}
