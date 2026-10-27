import { createHash, createHmac, randomBytes } from 'node:crypto';
import { appSessionSecret } from '@/lib/auth/env';
import { writeAuditLog } from '@/lib/audit/log';
import type { SchoolCheckedPaper } from '@/lib/contracts/school-link';
import { EXAM_RUNNERS } from '@/lib/exams/exams';
import type { Mark, MarkKind, PaperComponent } from '@/lib/exams/papers';
import { publicationInForce } from '@/lib/exams/publish';
import { childResult, type ResultPaper, type Shown } from '@/lib/exams/results';
import type { GradingScheme } from '@/lib/exams/scheme';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { Sql } from '@/lib/jobs/types';
import { siteUrl } from '@/lib/site-config';
import type { Actor } from './context';
import { checkedPaper, type ViewQuestion } from './family-view';

// The private report link for parents without the app (C351). The office makes one per child and publication in force:
// a key of 32 random bytes (base64url, 43 characters) that is given out once, inside the family's own WhatsApp message,
// and kept only as its SHA-256 (marking_report_links.key_hash, unique per child and publication). The public page
// (/results/<key>) and its page pictures read it through the platform role and the database's own definer functions
// (marking_report, marking_report_marks, marking_report_pages), which answer only while the publication is in force and
// for 30 days from when the link was made, and show the checked scripts only while the school lets families see them.
// A wrong key, an expired one, an ended one and a reopened publication all read the same: nothing.
//
// The principal or the school admin may end a family's link (a lost phone, a forwarded link; C230-AG): it opens
// nothing from that moment. The child then shows as not sent, and a new link (the next number, at most MAX_LINKS) is
// made only by the same Send, after the same preview (./result-send.ts). One live link per child and publication.

export const REPORT_PATH = '/results/';
export const REPORT_DAYS = 30;
// Links per child and publication, ended ones counted (the database holds it).
export const MAX_LINKS = 5;
export const END_REASONS = ['lost', 'forwarded', 'other'] as const;
export type EndReason = (typeof END_REASONS)[number];
// Who may end a link: the people who send them (TELL_ROLES of ./result-send.ts; the database's rule says the same).
export const END_ROLES: readonly Actor['role'][] = ['principal', 'school_admin'];
const KEY_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export const reportKeyHash = (key: string): string => createHash('sha256').update(key, 'utf8').digest('hex');

// A link's key is made from a random reference and the server's secret (review of AM-5): the message log keeps only the
// reference, sealed as `sealed:<ref>:<lang>` in the template's `link` value, and the send-gate opens it into the link
// at the moment it asks the provider (src/lib/whatsapp/sealed-params.ts). Whoever reads the log cannot open the child's
// result: that needs the server's secret. A new session secret (docs/18) turns links queued and not yet sent into
// links that open nothing; links already sent keep working (only their hash is kept).
export const REF_FORMAT = /^[A-Za-z0-9_-]{43}$/;
export const reportKeyFor = (ref: string): string => createHmac('sha256', appSessionSecret()).update(`marking-report-link.v1\u0000${ref}`).digest('base64url');
export const sealedLink = (ref: string, lang: 'en' | 'hi'): string => `sealed:${ref}:${lang}`;
export function openSealedLink(value: string): string | null {
  const m = /^sealed:([A-Za-z0-9_-]{43}):(en|hi)$/.exec(value);
  return m ? reportLinkUrl(reportKeyFor(m[1]), m[2] as 'en' | 'hi') : null;
}
export const reportLinkUrl = (key: string, lang: 'en' | 'hi' = 'en'): string => `${siteUrl}${REPORT_PATH}${key}${lang === 'hi' ? '?lang=hi' : ''}`;
export const pagePictureUrl = (key: string, pageId: string): string => `/api/public/results/${key}/pages/${pageId}`;

export type MakeLinkResult = { ok: true; key: string; ref: string; version: number; linkNo: number } | { ok: false; reason: 'not_allowed' | 'not_found' | 'not_published' | 'no_consent' | 'exists' | 'limit' };

// The school's consent for the child's records, as School Link applies it (the latest decision granted, or a test
// school's fictional children): without it nothing of the child reaches a family, by the app or by a link.
export async function recordsConsented(db: Sql, schoolId: string, studentId: string): Promise<boolean> {
  const r = (
    await db.query(
      `select coalesce((select is_test_fixture from schools where school_id = $1), false)
              or coalesce((select granted from consent_ledger where school_id = $1 and student_id = $2 and purpose = 'core_records' order by created_at desc limit 1), false) as ok`,
      [schoolId, studentId]
    )
  ).rows[0] as { ok: boolean } | undefined;
  return r?.ok === true;
}

// The office makes a child's link for the publication in force of the exam for the class. The key is returned once;
// a second live link for the same child and publication is refused (`exists`), so a family never holds two that open;
// after MAX_LINKS (ended ones counted) no more is made (`limit`). A child on the class's roll only, whose records the
// school holds consent for. The database numbers the link.
export async function makeReportLink(db: Sql, actor: Actor, examId: string, classId: string, studentId: string, newRef: () => string = () => randomBytes(32).toString('base64url')): Promise<MakeLinkResult> {
  if (!EXAM_RUNNERS.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (![examId, classId, studentId].every(isUuid)) return { ok: false, reason: 'not_found' };
  const child = (
    await db.query(`select 1 from students where school_id = $1 and student_id = $2 and class_id = $3 and status in ('active', 'pending_consent')`, [actor.schoolId, studentId, classId])
  ).rows[0];
  if (!child) return { ok: false, reason: 'not_found' };
  if (!(await recordsConsented(db, actor.schoolId, studentId))) return { ok: false, reason: 'no_consent' };
  const pub = await publicationInForce(db, actor.schoolId, examId, classId);
  if (!pub) return { ok: false, reason: 'not_published' };
  const made = Number(
    (await db.query(`select count(*)::int as n from marking_report_links where school_id = $1 and exam_id = $2 and class_id = $3 and student_id = $4 and publication_version = $5`, [actor.schoolId, examId, classId, studentId, pub.version])).rows[0]?.n ?? 0
  );
  const live = (await db.query(`select 1 from marking_report_links where school_id = $1 and exam_id = $2 and class_id = $3 and student_id = $4 and publication_version = $5 and ended_at is null`, [actor.schoolId, examId, classId, studentId, pub.version])).rows[0];
  if (live) return { ok: false, reason: 'exists' };
  if (made >= MAX_LINKS) return { ok: false, reason: 'limit' };
  const ref = newRef();
  if (!REF_FORMAT.test(ref)) throw new Error('makeReportLink: a reference is 43 base64url characters');
  const key = reportKeyFor(ref);
  if (!KEY_FORMAT.test(key)) throw new Error('makeReportLink: a key is 43 base64url characters');
  const row = (
    await db.query(
      `insert into marking_report_links (school_id, key_hash, exam_id, class_id, student_id, publication_version, made_by)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (school_id, exam_id, class_id, student_id, publication_version) where ended_at is null do nothing
       returning link_no`,
      [actor.schoolId, reportKeyHash(key), examId, classId, studentId, pub.version, actor.userId]
    )
  ).rows[0] as { link_no: number } | undefined;
  if (!row) return { ok: false, reason: 'exists' };
  const linkNo = Number(row.link_no);
  // Ids, the version and the link's number only: never the key, which opens the child's result.
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'marking.report_link_made', targetType: 'students', targetId: studentId, beforeState: undefined, afterState: { examId, classId, version: pub.version, linkNo } });
  return { ok: true, key, ref, version: pub.version, linkNo };
}

// Each child of a class with a link for the publication: the live link's number (null when every one was ended) and
// how many were made in all.
export type ChildLinks = { live: number | null; made: number };
export async function linksOf(db: Sql, schoolId: string, examId: string, classId: string, version: number): Promise<Map<string, ChildLinks>> {
  const { rows } = await db.query(
    `select student_id, max(link_no) filter (where ended_at is null) as live, count(*)::int as made
       from marking_report_links where school_id = $1 and exam_id = $2 and class_id = $3 and publication_version = $4 group by student_id`,
    [schoolId, examId, classId, version]
  );
  return new Map((rows as { student_id: string; live: unknown; made: unknown }[]).map((r) => [r.student_id, { live: r.live === null ? null : Number(r.live), made: Number(r.made) }]));
}

export type EndLinkResult = { ok: true; linkNo: number } | { ok: false; reason: 'not_allowed' | 'not_found' | 'not_published' | 'no_link' | 'why' };

// The office ends a child's live link for the publication in force: it opens nothing from now on. Who and when are
// the database's (the session's person, now); the reason is one of END_REASONS. The audit row has the ids, the link's
// number and the reason, never the key.
export async function endReportLink(db: Sql, actor: Actor, examId: string, classId: string, studentId: string, why: unknown): Promise<EndLinkResult> {
  if (!END_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (![examId, classId, studentId].every(isUuid)) return { ok: false, reason: 'not_found' };
  if (typeof why !== 'string' || !(END_REASONS as readonly string[]).includes(why)) return { ok: false, reason: 'why' };
  const pub = await publicationInForce(db, actor.schoolId, examId, classId);
  if (!pub) return { ok: false, reason: 'not_published' };
  const row = (
    await db.query(
      `update marking_report_links set ended_why = $6, ended_at = now(), ended_by = $7
        where school_id = $1 and exam_id = $2 and class_id = $3 and student_id = $4 and publication_version = $5 and ended_at is null
        returning link_no`,
      [actor.schoolId, examId, classId, studentId, pub.version, why, actor.userId]
    )
  ).rows[0] as { link_no: number } | undefined;
  if (!row) return { ok: false, reason: 'no_link' };
  const linkNo = Number(row.link_no);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'marking.report_link_ended', targetType: 'students', targetId: studentId, beforeState: undefined, afterState: { examId, classId, version: pub.version, linkNo, why } });
  return { ok: true, linkNo };
}

// ---- The public side (the platform role, through the three definer functions only) --------------------------------

export type ReportSubject = {
  paperId: string;
  name: string;
  parts: { name: string; mark: Mark | null; max: number }[];
  percent: number | null;
  grade: string | null;
};
export type ReportView = {
  schoolName: string;
  firstName: string;
  className: string;
  exam: string;
  publishedOn: string;
  subjects: ReportSubject[];
  overall: { percent: number | null; grade: string | null };
  papers: SchoolCheckedPaper[]; // the checked scripts, while the school lets families see them
};

// Every key, of any shape, costs the same one lookup: the hash of whatever was typed is always a well-formed hash, and
// marking_report answers nothing for one it does not hold. So a wrong key and an expired one take the same time.
const lookupHash = (key: string): string => reportKeyHash(String(key).slice(0, 200));
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const grade = (s: Shown) => (s.grade.kind === 'grade' ? s.grade.grade : null);
const dayOf = (v: unknown): string => {
  const d = v instanceof Date ? v : new Date(String(v));
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};

export async function readReport(db: Sql, key: string): Promise<ReportView | null> {
  const hash = lookupHash(key);
  const rows = (
    await db.query(
      `select school_id, school_name, student_name, class_name, exam_name, scheme, published_at, paper_id, subject_name, components, paper_marks,
              sheet_id, choice_counts, strengths, improve, practice
         from public.marking_report($1) order by subject_name, paper_id`,
      [hash]
    )
  ).rows;
  if (!rows.length || !KEY_FORMAT.test(key)) return null;
  const first = rows[0];
  const papers: ResultPaper[] = rows.map((r) => ({ paperId: r.paper_id, subjectName: r.subject_name ?? '', date: null, components: (r.components ?? []) as PaperComponent[] }));
  const perPaper = rows.map((r) =>
    Object.fromEntries(((r.paper_marks ?? []) as { component: string; kind: MarkKind; score: unknown }[]).map((m) => [m.component, { kind: m.kind, score: num(m.score) } satisfies Mark]))
  );
  const result = childResult(papers, perPaper, first.scheme as GradingScheme);
  const subjects: ReportSubject[] = rows.map((r, i) => ({
    paperId: r.paper_id,
    name: r.subject_name ?? '',
    parts: papers[i].components.map((c) => ({ name: c.name, mark: perPaper[i][c.key] ?? null, max: Number(c.max) })),
    percent: result.papers[i].rounded,
    grade: grade(result.papers[i]),
  }));
  const withScript = rows.filter((r) => r.sheet_id);
  let checked: SchoolCheckedPaper[] = [];
  if (withScript.length) {
    const marks = (
      await db.query(
        `select sheet_id, question_id, label, prompt, component, max_marks, choice_group, chapter, topic, marks, note, error_type, page_id, y_from, y_to
           from public.marking_report_marks($1) order by q_position, label`,
        [hash]
      )
    ).rows;
    const pages = (await db.query(`select sheet_id, page_id, width, height from public.marking_report_pages($1) order by sheet_position`, [hash])).rows;
    const practiceUnits = withScript.flatMap((r) => ((r.practice ?? []) as { unitId: string | null }[]).map((p) => p.unitId)).filter((u): u is string => !!u && isUuid(u));
    const units = new Map(
      ((practiceUnits.length ? (await db.query(`select unit_id, chapter, topic from syllabus_units where school_id = $1 and unit_id = any ($2::uuid[])`, [first.school_id, practiceUnits])).rows : []) as {
        unit_id: string;
        chapter: string;
        topic: string;
      }[]).map((u) => [u.unit_id, u])
    );
    checked = withScript.map((r) =>
      checkedPaper({
        paperId: r.paper_id,
        exam: r.exam_name,
        term: null,
        subject: r.subject_name ?? '',
        publishedOn: dayOf(r.published_at),
        parts: ((r.components ?? []) as PaperComponent[]).map((c) => ({ key: c.key, name: c.name, max: Number(c.max) })),
        choiceCounts: (r.choice_counts ?? {}) as Record<string, number>,
        questions: marks
          .filter((m) => m.sheet_id === r.sheet_id)
          .map(
            (m): ViewQuestion => ({
              questionId: m.question_id,
              label: m.label,
              prompt: m.prompt ?? null,
              component: m.component,
              maxMarks: Number(m.max_marks),
              choiceGroup: m.choice_group ?? null,
              chapter: m.chapter ?? null,
              topic: m.topic ?? null,
              marks: num(m.marks),
              note: m.note ?? null,
              errorType: m.error_type ?? null,
              pageId: m.page_id ?? null,
              yFrom: num(m.y_from),
              yTo: num(m.y_to),
            })
          ),
        strengths: r.strengths ?? null,
        improve: r.improve ?? null,
        practice: ((r.practice ?? []) as { unitId: string | null; text: string }[]).map((p) => ({ text: String(p.text ?? ''), chapter: (p.unitId && units.get(p.unitId)?.chapter) || null, topic: (p.unitId && units.get(p.unitId)?.topic) || null })),
        pages: pages.filter((g) => g.sheet_id === r.sheet_id).map((g) => ({ pageId: g.page_id, width: Number(g.width), height: Number(g.height) })),
      })
    );
  }
  return {
    schoolName: first.school_name,
    firstName: String(first.student_name ?? '').trim().split(/\s+/)[0] ?? '',
    className: first.class_name ?? '',
    exam: first.exam_name,
    publishedOn: dayOf(first.published_at),
    subjects,
    overall: { percent: result.overall.rounded, grade: grade(result.overall) },
    papers: checked,
  };
}

// The stored picture of one page the link opens, or null: only a page marking_report_pages names for this key.
export async function reportPageKey(db: Sql, key: string, pageId: string): Promise<string | null> {
  const hash = lookupHash(key);
  const row = (await db.query(`select storage_key from public.marking_report_pages($1) where page_id = $2::uuid`, [hash, isUuid(pageId) ? pageId : '00000000-0000-0000-0000-000000000000'])).rows[0] as
    | { storage_key: string }
    | undefined;
  return row && KEY_FORMAT.test(key) ? row.storage_key : null;
}
