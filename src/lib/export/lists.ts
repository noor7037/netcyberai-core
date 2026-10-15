import { NextRequest, NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import { jsonError, ruleError, type AppClaims } from '@/lib/frameworks/route';
import { DEFAULT_LANG, LANG_COOKIE, readLangCookie, t, type Lang, type MessageKey } from '@/lib/i18n';
import { csvResponse, toCsv } from './csv';
import { toXlsx, xlsxResponse, type XlsxValue } from './xlsx';

// The office's list exports (C235-D): students, staff and classes, as Excel (.xlsx) or CSV, from their list screens.
//
//   - The principal and the school admin only: the two roles whose screens list the whole school's students, staff
//     and classes. Every other role is refused (a teacher's screens show only their own classes, and none of them
//     offers a list to take away). The rows are read in the caller's own tenant transaction, so row level security
//     decides them, as it decides the screen.
//   - The file has what the list screen has, in the person's language: the same rows, in the same order.
//   - Every export writes an audit row: who, which list, which format and how many rows; never the rows themselves.
//   - At most EXPORT_MAX_ROWS rows; a larger list is refused rather than cut short.

export const EXPORT_LISTS = ['students', 'staff', 'classes'] as const;
export type ExportList = (typeof EXPORT_LISTS)[number];
export const EXPORT_FORMATS = ['xlsx', 'csv'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export const EXPORT_MAX_ROWS = 20000;

const STUDENT_STATUSES = ['pending_consent', 'active', 'inactive', 'transferred'] as const;
const GENDERS = ['not_given', 'female', 'male', 'transgender'] as const;
const ROLES = ['principal', 'school_admin', 'teacher', 'accountant', 'academic_coordinator'] as const;

export const mayExportLists = (role: string): boolean => role === 'principal' || role === 'school_admin';

type Table = { title: MessageKey; header: MessageKey[]; rows: XlsxValue[][] };

// A roll number of plain digits is a number in the spreadsheet (it sorts as one); anything else stays as written.
const rollNumber = (v: string | null): XlsxValue => (v && /^[1-9][0-9]{0,5}$/.test(v) ? Number(v) : v);
const day = (v: Date | string | null): string | null => (v ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(v)) : null);

async function readList(db: PoolClient, schoolId: string, list: ExportList, lang: Lang, status: string | null): Promise<Table> {
  const limit = EXPORT_MAX_ROWS + 1;
  if (list === 'students') {
    const { rows } = await db.query(
      `select s.name, s.admission_no, c.name as class_name, s.roll_no, s.dob::text as dob, s.gender, s.status
         from students s
         left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
        where s.school_id = $1 and ($2::text is null or s.status::text = $2)
        order by s.name asc
        limit $3`,
      [schoolId, status, limit]
    );
    return {
      title: 'xport.list.students',
      header: ['xport.col.name', 'xport.col.admissionNo', 'xport.col.class', 'xport.col.rollNo', 'xport.col.dob', 'xport.col.gender', 'xport.col.status'],
      rows: rows.map((r) => [
        r.name,
        r.admission_no,
        r.class_name,
        rollNumber(r.roll_no),
        r.dob,
        t(lang, `sdc.gender.${GENDERS.find((g) => g === r.gender) ?? 'not_given'}` as MessageKey),
        STUDENT_STATUSES.some((s) => s === r.status) ? t(lang, `xport.status.${r.status}` as MessageKey) : r.status,
      ]),
    };
  }
  if (list === 'staff') {
    // The staff list screen's accounts (src/lib/auth/staff-accounts.ts): this school's members, platform admins never.
    const { rows } = await db.query(
      `select u.display_name, m.role, u.email, u.phone, (m.is_active and u.is_active) as is_active, m.created_at
         from memberships m
         join users u on u.user_id = m.user_id
        where m.school_id = $1 and u.role <> 'super_admin' and m.role::text <> 'parent'
        order by m.role, u.display_name
        limit $2`,
      [schoolId, limit]
    );
    return {
      title: 'xport.list.staff',
      header: ['xport.col.name', 'xport.col.role', 'xport.col.email', 'xport.col.mobile', 'xport.col.account', 'xport.col.since'],
      rows: rows.map((r) => [
        r.display_name,
        ROLES.some((x) => x === r.role) ? t(lang, `role.${r.role}` as MessageKey) : r.role,
        r.email,
        r.phone,
        t(lang, r.is_active ? 'xport.account.active' : 'xport.account.off'),
        day(r.created_at),
      ]),
    };
  }
  const { rows } = await db.query(
    `select c.name, c.grade, c.section, u.display_name as class_teacher,
            (select count(*)::int from students s where s.school_id = c.school_id and s.class_id = c.class_id) as students
       from classes c
       left join users u on u.school_id = c.school_id and u.user_id = c.class_teacher_id
      where c.school_id = $1
      order by c.name asc
      limit $2`,
    [schoolId, limit]
  );
  return {
    title: 'xport.list.classes',
    header: ['xport.col.class', 'xport.col.grade', 'xport.col.section', 'xport.col.classTeacher', 'xport.col.students'],
    rows: rows.map((r) => [r.name, r.grade === null || r.grade === undefined ? null : String(r.grade), r.section, r.class_teacher, Number(r.students)]),
  };
}

// GET /api/app/<list>/export?format=xlsx|csv[&status=…, students only], inside the route's own appRoute transaction.
export async function listExport({ claims, db }: { claims: AppClaims; db: PoolClient }, req: NextRequest, list: ExportList): Promise<NextResponse> {
  if (!mayExportLists(claims.role)) return ruleError(403, 'not_allowed');
  const format = req.nextUrl.searchParams.get('format') ?? 'xlsx';
  if (!EXPORT_FORMATS.some((f) => f === format)) return ruleError(400, 'not_sent_properly');
  const status = list === 'students' ? req.nextUrl.searchParams.get('status') : null;
  if (status !== null && !STUDENT_STATUSES.some((s) => s === status)) return ruleError(400, 'not_sent_properly');
  const lang = readLangCookie(req.cookies.get(LANG_COOKIE)?.value, claims.sub) ?? DEFAULT_LANG;
  const table = await readList(db, claims.schoolId, list, lang, status);
  if (table.rows.length > EXPORT_MAX_ROWS) return jsonError(413, 'the list is too long to export in one file', { code: 'too_many_rows', max: EXPORT_MAX_ROWS });
  await writeAuditLog(db, {
    schoolId: claims.schoolId,
    actorUserId: claims.sub,
    actorRole: claims.role,
    eventAction: 'list_export.downloaded',
    targetType: 'list',
    targetId: list,
    afterState: { list, format, rows: table.rows.length, ...(status ? { status } : {}), language: lang },
  });
  const header = table.header.map((k) => t(lang, k));
  const name = `${list}-${day(new Date())}`;
  return format === 'csv' ? csvResponse(name, toCsv(header, table.rows)) : xlsxResponse(name, toXlsx(t(lang, table.title), header, table.rows));
}
