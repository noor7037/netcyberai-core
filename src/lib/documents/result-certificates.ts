import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { Actor } from '@/lib/exams/exams';
import { publicationInForce } from '@/lib/exams/publish';
import { reportCards } from '@/lib/exams/report-card';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { settingsSchemaFor } from '@/lib/frameworks/settings-schemas';
import { readSettings } from '@/lib/frameworks/settings-store';
import type { Sql } from '@/lib/jobs/types';
import { CERT_OFFICE, type CertActor } from './certificates';
import { composeResultCertificate, readRules, recipientsOf, RESULT_CERT_TYPES, type ResultCertRules, type ResultCertType, type ResultChild } from './result-certificate-rules';

// Merit and participation certificates from a published result (C230-AJ part 5, slice E). The principal and the school
// admin (the register's own people, CERT_OFFICE) make them for a class whose result is PUBLISHED, by the rules the school
// set in its Documents settings (result-certificate-rules.ts). Each is a certificate of the school's register
// (certificates_issued): the school's own number, the seal, the signature of the person who made it, the QR check and the
// principal's withdrawal, all as the other certificates have them. The studio draws it (the achievement certificate).
//
//   - One of each kind per child and publication: exam_certificates links the certificate to the publication, so a second
//     press makes none, and a reopened class (a new publication) is made again. Preview first: who will get which.
//   - Only children on the roll. Merit needs the child to have sat (a score in at least one paper). Nobody is ranked.
//   - Nothing about a mark, a grade or a percent is printed; the audit rows hold ids and counts.
//   - The fee clearance is never asked (the database's certificate_needs_clearance says so for these two kinds).

export type ResultCertProblem = 'not_allowed' | 'not_found' | 'not_published';
export type ResultCertChild = { studentId: string; name: string; rollNo: string | null; merit: 'will' | 'made' | null; participation: 'will' | 'made' | null; certificateIds: string[] };
export type ResultCertPlan = {
  examId: string;
  classId: string;
  version: number;
  rules: ResultCertRules;
  noSuchGrade: boolean; // the merit rule names a grade the kept scheme does not have
  children: ResultCertChild[];
  will: { merit: number; participation: number };
  made: { merit: number; participation: number };
};

// A child's result as the rules read it: their overall grade and percent as the report card prints them, and whether they
// sat. Built from the same cards the report cards are, by the scheme kept with the publication.
async function plan(db: Sql, actor: CertActor, examId: string, classId: string): Promise<(ResultCertPlan & { examName: string; term: string | null; session: string | null; className: string; schoolName: string; address: string | null; publicationId: string }) | ResultCertProblem> {
  if (!CERT_OFFICE.includes(actor.role)) return 'not_allowed';
  if (!isUuid(examId) || !isUuid(classId)) return 'not_found';
  const pub = await publicationInForce(db, actor.schoolId, examId, classId);
  // The register's people are the principal and the school admin: school roles all (CERT_OFFICE was checked above).
  const cards = await reportCards(db, actor as Actor, examId, classId, null);
  if (!cards.ok) return cards.reason === 'not_published' ? 'not_published' : 'not_found';
  if (!pub) return 'not_published';
  const schema = settingsSchemaFor('documents');
  const rules = readRules(schema ? (await readSettings(db, actor.schoolId, schema)).effective : {});
  const results: ResultChild[] = cards.set.cards.map((c) => ({
    studentId: c.studentId,
    sat: c.subjects.some((s) => Object.values(s.marks).some((m) => m.kind === 'score')),
    grade: c.overall.grade.kind === 'grade' ? c.overall.grade.grade : null,
    percent: c.overall.rounded,
  }));
  const who = recipientsOf(rules, pub.scheme.bands ?? [], results);
  const have = (await db.query(`select student_id, kind, certificate_id from exam_certificates where school_id = $1 and publication_id = $2`, [actor.schoolId, pub.publicationId])).rows as {
    student_id: string;
    kind: ResultCertType;
    certificate_id: string;
  }[];
  const state = (studentId: string, kind: ResultCertType, wants: readonly string[]): 'will' | 'made' | null => (have.some((h) => h.student_id === studentId && h.kind === kind) ? 'made' : wants.includes(studentId) ? 'will' : null);
  const children: ResultCertChild[] = cards.set.cards.map((c) => ({
    studentId: c.studentId,
    name: c.name,
    rollNo: c.rollNo,
    merit: state(c.studentId, 'merit', who.merit),
    participation: state(c.studentId, 'participation', who.participation),
    certificateIds: have.filter((h) => h.student_id === c.studentId).map((h) => h.certificate_id),
  }));
  const count = (kind: 'merit' | 'participation', s: 'will' | 'made') => children.filter((c) => c[kind] === s).length;
  const session = cards.set.exam.session;
  const school = (await db.query(`select address from schools where school_id = $1`, [actor.schoolId])).rows[0] as { address: string | null } | undefined;
  return {
    examId,
    classId,
    version: pub.version,
    rules,
    noSuchGrade: who.noSuchGrade,
    children,
    will: { merit: count('merit', 'will'), participation: count('participation', 'will') },
    made: { merit: count('merit', 'made'), participation: count('participation', 'made') },
    examName: cards.set.exam.name,
    term: cards.set.exam.term,
    session,
    className: cards.set.className,
    schoolName: cards.set.schoolName,
    address: school?.address ?? null,
    publicationId: pub.publicationId,
  };
}

// Who will get which certificate, and who already has one from this publication. Records nothing.
export async function resultCertificatesPreview(db: Sql, actor: CertActor, examId: string, classId: string): Promise<ResultCertPlan | ResultCertProblem> {
  const p = await plan(db, actor, examId, classId);
  if (typeof p === 'string') return p;
  const { examName: _e, term: _t, session: _s, className: _c, schoolName: _n, address: _a, publicationId: _p, ...shown } = p;
  return shown;
}

export type MakeResult =
  | { ok: true; merit: number; participation: number; skipped: number; certificateIds: string[] }
  | { ok: false; reason: ResultCertProblem };

// Makes the certificates the preview promised and not yet made. Each child's certificate is its own savepoint, so one
// refusal never undoes the others; a child already given one for this publication is skipped, not made again.
export async function makeResultCertificates(db: PoolClient, actor: CertActor, examId: string, classId: string): Promise<MakeResult> {
  const p = await plan(db, actor, examId, classId);
  if (typeof p === 'string') return { ok: false, reason: p };
  let skipped = 0;
  const made: Record<ResultCertType, number> = { merit: 0, participation: 0 };
  const ids: string[] = [];
  for (const child of p.children) {
    for (const kind of RESULT_CERT_TYPES) {
      if (child[kind] !== 'will') continue;
      const composed = composeResultCertificate({ kind, child: child.name, className: p.className, exam: p.examName, term: p.term, session: p.session, school: p.schoolName, address: p.address });
      if (!composed.ok) {
        skipped += 1;
        continue;
      }
      await db.query('savepoint result_certificate');
      try {
        const row = (
          await db.query(
            // The number, the day, the token and who signs are the database's (certificates_issued_insert).
            `insert into certificates_issued (school_id, cert_type, student_id, issued_by, purpose, printed) values ($1, $2, $3, $4, $5, $6)
             returning certificate_id, number, clearance, owed_minor`,
            [actor.schoolId, kind, child.studentId, actor.userId, composed.purpose, JSON.stringify(composed.printed)]
          )
        ).rows[0];
        await db.query(`insert into exam_certificates (school_id, publication_id, student_id, kind, certificate_id, made_by) values ($1, $2, $3, $4, $5, $6)`, [
          actor.schoolId,
          p.publicationId,
          child.studentId,
          kind,
          row.certificate_id,
          actor.userId,
        ]);
        await writeAuditLog(db, {
          schoolId: actor.schoolId,
          actorUserId: actor.userId,
          actorRole: actor.role,
          eventAction: 'certificate.issued',
          targetType: 'certificates_issued',
          targetId: row.certificate_id,
          beforeState: undefined,
          afterState: { studentId: child.studentId, type: kind, number: row.number, clearance: row.clearance, owedMinor: Number(row.owed_minor), reasonGiven: false, examId },
        });
        await db.query('release savepoint result_certificate');
        made[kind] += 1;
        ids.push(row.certificate_id);
      } catch (err) {
        await db.query('rollback to savepoint result_certificate');
        // Made at the same moment by another press: the one already made stands.
        if ((err as { code?: string }).code === '23505') {
          skipped += 1;
          continue;
        }
        throw err;
      }
    }
  }
  if (ids.length) {
    await writeAuditLog(db, {
      schoolId: actor.schoolId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      eventAction: 'exam.certificates_made',
      targetType: 'exam_publications',
      targetId: p.publicationId,
      afterState: { exam_id: examId, class_id: classId, version: p.version, merit: made.merit, participation: made.participation, skipped },
    });
  }
  return { ok: true, merit: made.merit, participation: made.participation, skipped, certificateIds: ids };
}
