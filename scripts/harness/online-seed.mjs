// Online tests (AQ-4, C365) for the screenshot harness: one illustrative exam with a 5-A Mathematics paper sat online,
// its questions (choice, number and written), its test opened to the class, and the class's attempts in every state a
// teacher meets (submitted, sitting now, time ran out, not started), with one submitted script made and marked as the
// marking job makes it. Aarav (the linked family's child) has not started, so the Family app can sit it. Illustrative
// only: not a real school, child, answer or mark. Loaded only by scripts/harness/ into a throwaway local database; the
// harness has no AI key, so nothing here is read by a model.
//
//   seedOnline(db, { school, principal, teacher })   makes it
//   clearOnline(db, school)                          takes it away again (and any attempt a screen made)
//   ON                                               the fixed ids, for links straight to a screen

const id = (n) => `00000000-0000-4000-8000-0000000b${String(n).padStart(4, '0')}`;
const C5A = '00000000-0000-4000-8000-0000000c0051';
const MATHS = '00000000-0000-4000-8000-0000000d0001';
const kid = (g) => `00000000-0000-4000-8000-0000005${String(g).padStart(5, '0')}`;

export const ON = { exam: id(1), paper: id(2), test: id(3), sheet: id(4), questions: {}, attempts: {} };

const QUESTIONS = [
  { label: '1', section: 'A', max: 1, kind: 'objective', prompt: 'Which fraction is the same as one half?', options: [['A', '2/4'], ['B', '1/3'], ['C', '3/4'], ['D', '2/3']], correct: { keys: ['A'] } },
  { label: '2', section: 'A', max: 2, kind: 'objective', prompt: 'Choose every fraction that is bigger than 1/2.', options: [['A', '3/4'], ['B', '1/4'], ['C', '2/3']], correct: { keys: ['A', 'C'] } },
  { label: '3', section: 'B', max: 2, kind: 'numerical', prompt: 'Write seven tenths as a decimal.', correct: { value: 0.7, tolerance: 0 } },
  { label: '4', section: 'B', max: 3, kind: 'short', prompt: 'Explain why 3/5 is bigger than 2/5.', key: 'The same size of parts; three of them is more than two.', steps: [{ step: 'Same denominator', marks: 1 }, { step: 'Reason', marks: 2 }] },
  { label: '5', section: 'C', max: 2, kind: 'long', prompt: 'Rohan has 75 paise of a rupee. Write it as tenths and hundredths of a rupee, and show your working.', key: '7 tenths and 5 hundredths', steps: [{ step: 'Tenths', marks: 1 }, { step: 'Hundredths', marks: 1 }] },
];

// The class's attempts: [child, state, minutes ago it started, times the screen was left, answers by label].
const ATTEMPTS = [
  [4, 'submitted', 30, 0, { 1: { keys: ['A'] }, 2: { keys: ['A', 'C'] }, 3: { value: 0.7 }, 4: { text: 'Both have fifths, so the parts are the same size, and three parts are more than two.' }, 5: { text: '75 paise is 0.75 rupee, that is 7 tenths and 5 hundredths.' } }],
  [7, 'open', 12, 2, { 1: { keys: ['B'] }, 3: { value: 0.07 } }],
  [10, 'timed_out', 55, 1, { 1: { keys: ['A'] }, 2: { keys: ['A'] } }],
  [13, 'submitted', 25, 0, { 1: { keys: ['A'] }, 2: { keys: ['C'] }, 3: { value: 0.7 }, 4: { text: '3/5 is more because 3 is more than 2 and the bottom is the same.' }, 5: { text: '0.75 = 7 tenths + 5 hundredths' } }],
];

export async function clearOnline(db, school) {
  await db.pg.exec(`set session_replication_role = replica;
    delete from jobs where type in ('online.mark', 'online.sweep');
    delete from online_answers where school_id = '${school}';
    delete from online_attempts where school_id = '${school}';
    delete from online_tests where school_id = '${school}';
    delete from marking_marks where school_id = '${school}' and paper_id = '${ON.paper}';
    delete from marking_sheets where school_id = '${school}' and paper_id = '${ON.paper}';
    delete from marking_questions where school_id = '${school}' and paper_id = '${ON.paper}';
    delete from marking_setups where school_id = '${school}' and paper_id = '${ON.paper}';
    delete from marks where school_id = '${school}' and exam_id = '${ON.exam}';
    delete from exam_papers where school_id = '${school}' and exam_id = '${ON.exam}';
    delete from exams where school_id = '${school}' and exam_id = '${ON.exam}';
    delete from audit_log where school_id = '${school}' and event_action like 'marking.online%';
    set session_replication_role = origin;`);
}

// Only Aarav's attempt (the Family app's screens make it), so the next picture starts afresh.
export async function clearAaravAttempt(db, school) {
  await db.pg.exec(`set session_replication_role = replica;
    delete from jobs where type = 'online.mark';
    delete from online_answers where school_id = '${school}' and attempt_id in (select attempt_id from online_attempts where student_id = '${kid(1)}');
    delete from online_attempts where school_id = '${school}' and student_id = '${kid(1)}';
    set session_replication_role = origin;`);
}

export async function seedOnline(db, { school, principal, teacher }) {
  await clearOnline(db, school);
  // The school's Exams module on (the harness school has it off), as the marking seed does.
  await db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source, limits) values ($1, 'exams', true, 'plan', '{"ai_marking_pages": 2000}')
                     on conflict (school_id, module_id) do update set enabled = true, limits = coalesce(school_module_entitlements.limits, '{}'::jsonb) || '{"ai_marking_pages": 2000}'::jsonb`, [school]);
  await db.pg.query(
    `insert into exams (exam_id, school_id, name, term, created_by, session_id) values ($1, $2, 'Unit test 4 (online, harness)', 'Term 1', $3, (select session_id from academic_sessions where school_id = $2 and is_current))`,
    [ON.exam, school, principal]
  );
  await db.pg.query(
    `insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, paper_date, unit_ids, components, created_by, sitting)
     values ($1, $2, $3, $4, $5, (now() at time zone 'Asia/Kolkata')::date, '{}', '[{"key":"written","name":"Written","max":10,"share":null}]'::jsonb, $6, 'online')`,
    [ON.paper, school, ON.exam, C5A, MATHS, principal]
  );
  await db.pg.query(`insert into marking_setups (school_id, paper_id, language, guidance, choice_counts, wrong_marks, updated_by) values ($1, $2, 'en', 'Give credit for a clear reason in plain words.', '{}', 0.5, $3)`, [school, ON.paper, teacher]);
  for (const [i, q] of QUESTIONS.entries()) {
    ON.questions[q.label] = id(100 + i);
    await db.pg.query(
      `insert into marking_questions (school_id, question_id, paper_id, position, label, component, max_marks, kind, prompt, answer_key, steps, options, correct, section, updated_by)
       values ($1, $2, $3, $4, $5, 'written', $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14)`,
      [school, ON.questions[q.label], ON.paper, i + 1, q.label, q.max, q.kind, q.prompt, q.key ?? '', JSON.stringify(q.steps ?? []), JSON.stringify((q.options ?? []).map(([key, text]) => ({ key, text }))), q.correct ? JSON.stringify(q.correct) : null, q.section, teacher]
    );
  }
  await db.pg.query(
    `insert into online_tests (school_id, test_id, paper_id, opens_at, closes_at, minutes, shuffle, opened_by, opened_at, updated_by)
     values ($1, $2, $3, now() - interval '1 hour', now() + interval '3 hours', 40, false, $4, now() - interval '65 minutes', $4)`,
    [school, ON.test, ON.paper, teacher]
  );
  const order = QUESTIONS.map((q) => ON.questions[q.label]);
  const options = Object.fromEntries(QUESTIONS.filter((q) => q.options).map((q) => [ON.questions[q.label], q.options.map(([k]) => k)]));
  for (const [g, state, ago, left, answers] of ATTEMPTS) {
    const attempt = id(200 + g);
    ON.attempts[g] = attempt;
    await db.pg.query(`insert into online_attempts (school_id, attempt_id, test_id, paper_id, student_id, deadline_at, question_order, option_orders) values ($1, $2, $3, $4, $5, now(), $6, $7::jsonb)`, [
      school,
      attempt,
      ON.test,
      ON.paper,
      kid(g),
      order,
      JSON.stringify(options),
    ]);
    // Moved to when it started, as the database would have set it then.
    await db.pg.query(
      `update online_attempts set started_at = now() - make_interval(mins => $3), deadline_at = now() - make_interval(mins => $3) + interval '40 minutes',
              state = $4, left_count = $5, submitted_at = case $4 when 'submitted' then now() - make_interval(mins => $3) + interval '22 minutes' when 'timed_out' then now() - make_interval(mins => $3) + interval '40 minutes' end
        where attempt_id = $2 and school_id = $1`,
      [school, attempt, ago, state, left]
    );
    for (const [label, answer] of Object.entries(answers)) {
      await db.pg.query(`insert into online_answers (school_id, attempt_id, paper_id, question_id, answer, flagged, seq, saved_at) values ($1, $2, $3, $4, $5::jsonb, $6, 1, now() - make_interval(mins => $7))`, [
        school,
        attempt,
        ON.paper,
        ON.questions[label],
        JSON.stringify(answer),
        g === 7 && label === '3',
        ago - 5,
      ]);
    }
  }
  // Neel's script, made and marked as the job makes it: the choice and number answers by rules (0.5 off a wrong
  // choice), the written ones by the marking AI (illustrative marks; no model was asked).
  await db.pg.query(
    `insert into marking_sheets (school_id, sheet_id, paper_id, upload_id, source, student_id, matched_by, state, flags, ai_provider, ai_model, prompt_version, marked_at, ai_confidence, strengths, improve, practice, attempts)
     values ($1, $2, $3, null, 'online', $4, 'online', 'marked', '{}', 'stand-in', 'harness', 'typed-v1', now() - interval '20 minutes', 0.84, $5, $6, '[]'::jsonb, 1)`,
    [school, ON.sheet, ON.paper, kid(13), 'Compares fractions with the same denominator.', 'Say why the parts are the same size.']
  );
  const mark = (label, attempted, m, error, note, reason, confidence) =>
    db.pg.query(
      `insert into marking_marks (school_id, sheet_id, paper_id, question_id, attempted, ai_marks, ai_steps, ai_note, ai_reason, error_type, confidence) values ($1, $2, $3, $4, $5, $6, '[]'::jsonb, $7, $8, $9, $10)`,
      [school, ON.sheet, ON.paper, ON.questions[label], attempted, m, note, reason, error, confidence]
    );
  await mark('1', true, 1, 'none', null, null, null);
  await mark('2', true, -0.5, null, null, null, null);
  await mark('3', true, 2, 'none', null, null, null);
  await mark('4', true, 2, 'incomplete', 'Say that the parts are the same size.', 'Correct comparison; the reason names the numerators only.', 0.82);
  await mark('5', true, 2, 'none', 'Well done.', 'Both tenths and hundredths given.', 0.9);
  await db.pg.query(`update online_attempts set sheet_id = $2 where attempt_id = $1`, [ON.attempts[13], ON.sheet]);
  return ON;
}
