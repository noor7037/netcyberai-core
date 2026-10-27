// What the AJ-5 screens (C230-AJ part 5: a child's progress report, "publish and notify", merit and participation
// certificates) need beyond the AI-marking seed: that seed's published "Half-yearly" for 5-A is given its exam type, and
// an earlier published Unit test (English, the same nine children) is added, so a child's progress report has two exam
// types to group. Illustrative only: no real school, child or mark. Loaded only by the harness, into a throwaway local
// database.
//
//   seedOutputs(db, { school, principal, teacher, made })   gives the types and adds the Unit test (made: the outputs of
//                                                            both published classes are made, so the Family app shows them)
//   clearOutputs(db, school)                                 takes away everything this made (the Unit test, outputs, certificates)
import { MK } from './marking-seed.mjs';

export const OUT = {
  exam: '00000000-0000-4000-8000-0000000a9951',
  paper: '00000000-0000-4000-8000-0000000a9952',
};
const C5A = '00000000-0000-4000-8000-0000000c0051';
const ENGLISH = '00000000-0000-4000-8000-0000000d0002';
const kid = (g) => `00000000-0000-4000-8000-0000005${String(g).padStart(5, '0')}`;
const CHILDREN = [1, 4, 7, 10, 13, 16, 19, 22];

export async function seedOutputs(db, { school, principal, teacher, made = false }) {
  await clearOutputs(db, school);
  await db.pg.query(`update exams set exam_type = 'half_yearly' where exam_id = $1`, [MK.exam]);
  await db.pg.query(
    `insert into exams (exam_id, school_id, name, term, created_by, session_id, exam_type, created_at)
     values ($1, $2, 'Unit test 2 (outputs, harness)', 'Term 1', $3, (select session_id from academic_sessions where school_id = $2 and is_current), 'unit', now() - interval '40 days')`,
    [OUT.exam, school, principal]
  );
  await db.pg.query(
    `insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, paper_date, unit_ids, components, created_by)
     values ($1, $2, $3, $4, $5, (now() at time zone 'Asia/Kolkata')::date - 40, '{}', $6::jsonb, $7)`,
    [OUT.paper, school, OUT.exam, C5A, ENGLISH, JSON.stringify([{ key: 'written', name: 'Written', max: 40, share: 80 }, { key: 'oral', name: 'Oral', max: 10, share: 20 }]), principal]
  );
  for (const g of CHILDREN) {
    for (const [component, score] of [['written', 18 + ((g * 5) % 20)], ['oral', 5 + (g % 4)]]) {
      await db.pg.query(
        `insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score, entered_by) values ($1, $2, $3, $4, $5, $6, 'score', $7, 0, $8)`,
        [school, OUT.exam, ENGLISH, OUT.paper, component, kid(g), score, teacher]
      );
    }
  }
  await db.pg.query(`update exam_papers set entered_by = $2 where paper_id = $1`, [OUT.paper, teacher]);
  const s = (await db.pg.query(`select version, scheme from grading_schemes where school_id = $1 order by version desc limit 1`, [school])).rows[0];
  await db.pg.query(`insert into exam_publications (school_id, exam_id, class_id, version, scheme_version, scheme, recognition, published_by) values ($1, $2, $3, 1, $4, $5::jsonb, '{}'::jsonb, $6)`, [
    school,
    OUT.exam,
    C5A,
    s.version,
    JSON.stringify(s.scheme),
    principal,
  ]);
  if (made) {
    await db.pg.query(
      `insert into exam_outputs (school_id, publication_id, made_by) select school_id, publication_id, published_by from exam_publications where school_id = $1 and exam_id = any ($2::uuid[]) and reopened_at is null`,
      [school, [MK.exam, OUT.exam]]
    );
  }
}

export async function clearOutputs(db, school) {
  await db.pg.exec(`set session_replication_role = replica;
    delete from exam_certificates where school_id = '${school}';
    delete from certificates_issued where school_id = '${school}' and cert_type in ('merit', 'participation');
    delete from exam_outputs where school_id = '${school}';
    delete from exam_publications where school_id = '${school}' and exam_id = '${OUT.exam}';
    delete from marks where school_id = '${school}' and exam_id = '${OUT.exam}';
    delete from exam_papers where school_id = '${school}' and exam_id = '${OUT.exam}';
    delete from exams where school_id = '${school}' and exam_id = '${OUT.exam}';
    delete from audit_log where school_id = '${school}' and event_action in ('exam.outputs_made', 'exam.certificates_made') ;
    set session_replication_role = origin;`);
}
