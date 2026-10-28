import { writeAuditLog } from '@/lib/audit/log';
import { INDIAN_STATES } from '@/lib/contracts/indian-states';
import type { Sql } from '@/lib/jobs/types';
import { indiaDate, isIsoDate } from '@/lib/time/india';

// Control → Content → Hubs (W4-3, C387): the entries of the family app's three hubs (content.hub_entries). Staff add an
// entry with its source link and the day it was checked, edit it, publish it and withdraw it; nothing is deleted. An
// entry shows to families only while published and before its review day (the table's policy holds that, not this
// file). Every change is audited with who, when and the entry before and after.

type By = { userId: string };

export const HUB_IDS = ['careers', 'exams_portal', 'opportunities'] as const;
export type HubId = (typeof HUB_IDS)[number];
export type HubEntryStatus = 'draft' | 'published' | 'withdrawn';
export const CLASS_MIN = -2;
export const CLASS_MAX = 12;
const DEVANAGARI = /[ऀ-ॿ]/;
const MAX_REVIEW_DAYS = 730;

export type HubEntryRow = {
  entryId: string;
  hub: HubId;
  titleEn: string;
  titleHi: string | null;
  bodyEn: string;
  bodyHi: string | null;
  scope: 'national' | 'state';
  stateCode: string | null;
  classFrom: number;
  classTo: number;
  sourceUrl: string;
  verifiedOn: string;
  reviewOn: string;
  status: HubEntryStatus;
  expired: boolean;
};

export type HubEntryProblem =
  | 'hub'
  | 'title_en'
  | 'title_hi'
  | 'body_en'
  | 'body_hi'
  | 'scope'
  | 'state_code'
  | 'class_band'
  | 'source_url'
  | 'verified_on'
  | 'review_on'
  | 'not_found'
  | 'expired';

export type HubEntryInput = {
  hub: unknown;
  titleEn: unknown;
  titleHi: unknown;
  bodyEn: unknown;
  bodyHi: unknown;
  scope: unknown;
  stateCode: unknown;
  classFrom: unknown;
  classTo: unknown;
  sourceUrl: unknown;
  verifiedOn: unknown;
  reviewOn: unknown;
};

type Clean = Omit<HubEntryRow, 'entryId' | 'status' | 'expired'>;

const oneLine = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
// Body text keeps its line breaks (at most one blank line between paragraphs), and no other markup.
const text = (v: unknown) =>
  typeof v === 'string'
    ? v
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((l) => l.trim().replace(/[ \t]+/g, ' '))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : '';
const HTML = /[<>]/;

// A day that exists on the calendar (2026-02-30 does not), written YYYY-MM-DD.
function realDay(v: unknown): v is string {
  return isIsoDate(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
}

function days(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function sourceUrlOk(raw: string): boolean {
  if (raw.length > 500 || /[\s<>"]/.test(raw)) return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && u.hostname.includes('.') && !u.username && !u.password;
  } catch {
    return false;
  }
}

export function validateHubEntry(raw: HubEntryInput, today: string = indiaDate()): { ok: true; value: Clean } | { ok: false; reason: HubEntryProblem } {
  const hub = HUB_IDS.find((h) => h === raw.hub);
  if (!hub) return { ok: false, reason: 'hub' };
  const titleEn = oneLine(raw.titleEn);
  if (titleEn.length < 1 || titleEn.length > 160 || HTML.test(titleEn)) return { ok: false, reason: 'title_en' };
  const titleHi = oneLine(raw.titleHi);
  if (titleHi && (titleHi.length > 160 || HTML.test(titleHi) || !DEVANAGARI.test(titleHi))) return { ok: false, reason: 'title_hi' };
  const bodyEn = text(raw.bodyEn);
  if (bodyEn.length < 1 || bodyEn.length > 1200 || HTML.test(bodyEn)) return { ok: false, reason: 'body_en' };
  const bodyHi = text(raw.bodyHi);
  if (bodyHi && (bodyHi.length > 1200 || HTML.test(bodyHi) || !DEVANAGARI.test(bodyHi))) return { ok: false, reason: 'body_hi' };
  if (raw.scope !== 'national' && raw.scope !== 'state') return { ok: false, reason: 'scope' };
  const stateCode = oneLine(raw.stateCode);
  if (raw.scope === 'state' ? !INDIAN_STATES.some((s) => s.code === stateCode) : stateCode !== '') return { ok: false, reason: 'state_code' };
  const classFrom = Number(raw.classFrom);
  const classTo = Number(raw.classTo);
  if (!Number.isInteger(classFrom) || !Number.isInteger(classTo) || classFrom < CLASS_MIN || classTo > CLASS_MAX || classFrom > classTo) return { ok: false, reason: 'class_band' };
  const sourceUrl = oneLine(raw.sourceUrl);
  if (!sourceUrlOk(sourceUrl)) return { ok: false, reason: 'source_url' };
  // The day it was checked is a day that has come; the review day follows it, within two years.
  if (!realDay(raw.verifiedOn) || raw.verifiedOn > today) return { ok: false, reason: 'verified_on' };
  if (!realDay(raw.reviewOn) || raw.reviewOn <= raw.verifiedOn || days(raw.verifiedOn, raw.reviewOn) > MAX_REVIEW_DAYS) return { ok: false, reason: 'review_on' };
  return {
    ok: true,
    value: {
      hub,
      titleEn,
      titleHi: titleHi || null,
      bodyEn,
      bodyHi: bodyHi || null,
      scope: raw.scope,
      stateCode: raw.scope === 'state' ? stateCode : null,
      classFrom,
      classTo,
      sourceUrl,
      verifiedOn: raw.verifiedOn,
      reviewOn: raw.reviewOn,
    },
  };
}

const COLUMNS = `entry_id, hub, title_en, title_hi, body_en, body_hi, scope, state_code, class_from, class_to, source_url,
  to_char(verified_on, 'YYYY-MM-DD') as verified_on, to_char(review_on, 'YYYY-MM-DD') as review_on, status`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowOf(r: any, today: string): HubEntryRow {
  return {
    entryId: String(r.entry_id),
    hub: r.hub,
    titleEn: String(r.title_en),
    titleHi: r.title_hi ?? null,
    bodyEn: String(r.body_en),
    bodyHi: r.body_hi ?? null,
    scope: r.scope,
    stateCode: r.state_code ?? null,
    classFrom: Number(r.class_from),
    classTo: Number(r.class_to),
    sourceUrl: String(r.source_url),
    verifiedOn: String(r.verified_on),
    reviewOn: String(r.review_on),
    status: r.status,
    expired: String(r.review_on) < today,
  };
}

export async function listHubEntriesForControl(db: Sql, today: string = indiaDate()): Promise<HubEntryRow[]> {
  const { rows } = await db.query(`select ${COLUMNS} from content.hub_entries order by hub, (status = 'withdrawn'), review_on, created_at`);
  return rows.map((r) => rowOf(r, today));
}

// What the audit row holds: the entry's own fields (a title, a text and a public link: no personal data).
const snapshot = (e: Clean | HubEntryRow, status?: HubEntryStatus) => ({
  hub: e.hub,
  title_en: e.titleEn,
  title_hi: e.titleHi,
  body_en: e.bodyEn,
  body_hi: e.bodyHi,
  scope: e.scope,
  state_code: e.stateCode,
  class_from: e.classFrom,
  class_to: e.classTo,
  source_url: e.sourceUrl,
  verified_on: e.verifiedOn,
  review_on: e.reviewOn,
  ...(status ? { status } : {}),
});

const audit = (db: Sql, by: By, action: string, id: string, before: unknown, after: unknown) =>
  writeAuditLog(db, {
    schoolId: null,
    actorUserId: by.userId,
    actorRole: 'super_admin',
    eventAction: action,
    targetType: 'content.hub_entries',
    targetId: id,
    beforeState: before ?? undefined,
    afterState: after,
  });

export async function addHubEntry(db: Sql, by: By, raw: HubEntryInput): Promise<{ ok: true; entryId: string } | { ok: false; reason: HubEntryProblem }> {
  const v = validateHubEntry(raw);
  if (!v.ok) return v;
  const e = v.value;
  const { rows } = await db.query(
    `insert into content.hub_entries (hub, title_en, title_hi, body_en, body_hi, scope, state_code, class_from, class_to, source_url, verified_on, review_on, created_by, updated_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13) returning entry_id`,
    [e.hub, e.titleEn, e.titleHi, e.bodyEn, e.bodyHi, e.scope, e.stateCode, e.classFrom, e.classTo, e.sourceUrl, e.verifiedOn, e.reviewOn, by.userId]
  );
  const entryId = String(rows[0].entry_id);
  await audit(db, by, 'content.hub_entry_added', entryId, null, snapshot(e, 'draft'));
  return { ok: true, entryId };
}

async function current(db: Sql, entryId: unknown, today: string): Promise<HubEntryRow | null> {
  if (typeof entryId !== 'string' || !/^[0-9a-f-]{36}$/i.test(entryId)) return null;
  const r = (await db.query(`select ${COLUMNS} from content.hub_entries where entry_id = $1 for update`, [entryId])).rows[0];
  return r ? rowOf(r, today) : null;
}

export async function editHubEntry(db: Sql, by: By, entryId: unknown, raw: HubEntryInput): Promise<{ ok: true; changed: boolean } | { ok: false; reason: HubEntryProblem }> {
  const today = indiaDate();
  const before = await current(db, entryId, today);
  if (!before) return { ok: false, reason: 'not_found' };
  const v = validateHubEntry(raw, today);
  if (!v.ok) return v;
  const e = v.value;
  // A published entry cannot be left past its review day: move the day on, or withdraw it.
  if (before.status === 'published' && e.reviewOn < today) return { ok: false, reason: 'review_on' };
  if (JSON.stringify(snapshot(before)) === JSON.stringify(snapshot(e))) return { ok: true, changed: false };
  await db.query(
    `update content.hub_entries set hub = $2, title_en = $3, title_hi = $4, body_en = $5, body_hi = $6, scope = $7, state_code = $8, class_from = $9, class_to = $10,
       source_url = $11, verified_on = $12, review_on = $13, updated_by = $14, updated_at = now() where entry_id = $1`,
    [before.entryId, e.hub, e.titleEn, e.titleHi, e.bodyEn, e.bodyHi, e.scope, e.stateCode, e.classFrom, e.classTo, e.sourceUrl, e.verifiedOn, e.reviewOn, by.userId]
  );
  await audit(db, by, 'content.hub_entry_edited', before.entryId, snapshot(before, before.status), snapshot(e, before.status));
  return { ok: true, changed: true };
}

// publish: from a draft or a withdrawn entry, while its review day has not passed. withdraw: from a draft or a published one.
export async function setHubEntryStatus(db: Sql, by: By, entryId: unknown, to: 'published' | 'withdrawn'): Promise<{ ok: true; changed: boolean } | { ok: false; reason: HubEntryProblem }> {
  const today = indiaDate();
  const before = await current(db, entryId, today);
  if (!before) return { ok: false, reason: 'not_found' };
  if (before.status === to) return { ok: true, changed: false };
  if (to === 'published' && before.reviewOn < today) return { ok: false, reason: 'expired' };
  await db.query(`update content.hub_entries set status = $2, updated_by = $3, updated_at = now() where entry_id = $1`, [before.entryId, to, by.userId]);
  await audit(db, by, to === 'published' ? 'content.hub_entry_published' : 'content.hub_entry_withdrawn', before.entryId, snapshot(before, before.status), snapshot(before, to));
  return { ok: true, changed: true };
}
