import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { appSessionSecret } from '@/lib/auth/env';
import { writeAuditLog } from '@/lib/audit/log';
import { classRank, compareClasses, PRE_PRIMARY_GRADES } from '@/lib/classes/class-order';
import { ENQUIRY_MAX } from '@/lib/free-tools/admissions-tracker';
import { allowAndRecord, rateKey } from '@/lib/onboarding/intake';
import { siteUrl } from '@/lib/site-config';
import { hasAadhaarNumber } from '@/lib/students/data-check-rules';
import { normalizePhone } from '@/lib/whatsapp/phone';

// The online enquiry form (W21-M1): a school's own link, which the office shares (on its website, a WhatsApp status,
// a poster's caption). A family opens it with no account and sends the child's first name, the class sought, a
// guardian's name and a phone; it lands in the office's pipeline as an open enquiry with source 'online', given to the
// office and due for a follow-up today.
//
//   - THE LINK: /enquire/<key>, where the key is the school's id and a seal made with the server's secret, so only a
//     link the app made opens a form (a school id seen elsewhere does not). A new session secret (docs/18) closes the
//     old links; the office copies the new one from the Admissions screen.
//   - THE ONE UNAUTHENTICATED WRITE. The route checks a honeypot field, the sizes, the phone (normalised as WhatsApp
//     wants it) and the rate limits (per address and school, and per school) before anything is written; the
//     database's definer function (public.admission_enquiry_online) writes the enquiry and refuses a school whose
//     Admissions is off. The same child, class and phone sent again the same day is the same enquiry.
//   - NOTHING PERSONAL IS LOGGED: the rate limits keep only a keyed hash; the audit row 'admissions.enquiry_online'
//     holds the enquiry's id, the class's id and the source.

type Sql = Pick<PoolClient, 'query'>;

export const FORM_PATH = '/enquire/';
export const FIRST_NAME_MAX = 40;
export const BODY_MAX_BYTES = 2_000;
// The limits are intake's own buckets (RATE_LIMITS of src/lib/onboarding/intake.ts): 'enquiry_ip', 3 an hour from one
// address to one school (a family, or a few behind one mobile network's address), and 'enquiry_school', 60 a day to
// one school from anywhere (a flood stops there, and the office is not buried).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const seal = (schoolId: string) => createHmac('sha256', appSessionSecret()).update(`admissions-online-form.v1\u0000${schoolId}`).digest().subarray(0, 16);
const idBytes = (schoolId: string) => Buffer.from(schoolId.replace(/-/g, ''), 'hex');
const idFrom = (b: Buffer) => b.toString('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

export function formKeyFor(schoolId: string): string {
  return `${idBytes(schoolId).toString('base64url')}${seal(schoolId).toString('base64url')}`;
}
export const formUrlFor = (schoolId: string) => `${siteUrl}${FORM_PATH}${formKeyFor(schoolId)}`;

// The school a key opens, or null for anything the app did not make.
export function schoolForKey(key: unknown): string | null {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{44}$/.test(key)) return null;
  const id = idFrom(Buffer.from(key.slice(0, 22), 'base64url'));
  if (!UUID.test(id)) return null;
  const given = Buffer.from(key.slice(22), 'base64url');
  const want = seal(id);
  return given.length === want.length && timingSafeEqual(given, want) ? id : null;
}

// ---- What the form shows -----------------------------------------------------------------------------------------

// One choice per grade (Nursery, LKG, UKG, 1 to 12): a family asks for a class, not a section. The grade's first
// section stands for it; the office moves the child to another section when it admits. A class named in the school's
// own way is offered by its name.
export type FormClass = { classId: string; grade: string | null; name: string };
export type OnlineForm = { schoolName: string; classes: FormClass[] };

export async function onlineForm(db: Sql, schoolId: string): Promise<OnlineForm | null> {
  const rows = (await db.query(`select * from public.admission_online_form($1)`, [schoolId])).rows as { school_name: string; class_id: string; class_name: string; grade: string | null; section: string | null }[];
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => compareClasses({ name: a.class_name, grade: a.grade, section: a.section }, { name: b.class_name, grade: b.grade, section: b.section }) || a.class_id.localeCompare(b.class_id));
  const seen = new Set<string>();
  const classes: FormClass[] = [];
  for (const r of sorted) {
    const rank = classRank(r.grade, r.class_name);
    const grade = rank < 3 ? PRE_PRIMARY_GRADES[rank] : rank <= 14 ? String(rank - 2) : null;
    const key = grade ?? `name:${r.class_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    classes.push({ classId: r.class_id, grade, name: r.class_name });
  }
  return { schoolName: rows[0].school_name, classes };
}

// ---- What a family sends -----------------------------------------------------------------------------------------

export type OnlineProblem = 'child_name' | 'guardian_name' | 'phone' | 'class' | 'aadhaar';
export type OnlineInput = { childName: string; guardianName: string; phone: string; classId: string };

const oneLine = (v: string) => v.replace(/\s+/g, ' ').trim();
function named(v: unknown, max: number, problem: OnlineProblem): { ok: true; value: string } | { ok: false; reason: OnlineProblem } {
  if (typeof v !== 'string') return { ok: false, reason: problem };
  const t = oneLine(v);
  if (!t || t.length > max || /[<>{}]/.test(t)) return { ok: false, reason: problem };
  if (hasAadhaarNumber(t)) return { ok: false, reason: 'aadhaar' };
  return { ok: true, value: t };
}

export function checkOnline(body: Record<string, unknown>): { ok: true; value: OnlineInput } | { ok: false; reason: OnlineProblem } {
  const child = named(body.childName, FIRST_NAME_MAX, 'child_name');
  if (!child.ok) return child;
  const guardian = named(body.guardianName, ENQUIRY_MAX.parentName, 'guardian_name');
  if (!guardian.ok) return guardian;
  const phone = typeof body.phone === 'string' && body.phone.length <= ENQUIRY_MAX.phone ? normalizePhone(body.phone) : null;
  if (!phone) return { ok: false, reason: 'phone' };
  if (typeof body.classId !== 'string' || !UUID.test(body.classId)) return { ok: false, reason: 'class' };
  return { ok: true, value: { childName: child.value, guardianName: guardian.value, phone, classId: body.classId } };
}

export type OnlineResult = { kind: 'received'; enquiryId: string } | { kind: 'already_received' } | { kind: 'rate_limited' } | { kind: 'closed' };

// Run as the platform role (withPlatformService), in its one transaction: the limits first, then the definer
// function, then the audit row.
export async function sendOnlineEnquiry(db: Sql, schoolId: string, ip: string, input: OnlineInput): Promise<OnlineResult> {
  if (!(await allowAndRecord(db, 'enquiry_ip', rateKey('ip', `${schoolId}|${ip}`)))) return { kind: 'rate_limited' };
  if (!(await allowAndRecord(db, 'enquiry_school', rateKey('school', schoolId)))) return { kind: 'rate_limited' };
  const made = (await db.query(`select enquiry_id, fresh from public.admission_enquiry_online($1, $2, $3, $4, $5)`, [schoolId, input.childName, input.classId, input.guardianName, input.phone])).rows[0] as { enquiry_id: string; fresh: boolean } | undefined;
  if (!made) return { kind: 'closed' };
  if (!made.fresh) return { kind: 'already_received' };
  await writeAuditLog(db, { schoolId, actorUserId: null, actorRole: null, eventAction: 'admissions.enquiry_online', targetType: 'admission_enquiries', targetId: made.enquiry_id, afterState: { classId: input.classId, source: 'online' } });
  return { kind: 'received', enquiryId: made.enquiry_id };
}
