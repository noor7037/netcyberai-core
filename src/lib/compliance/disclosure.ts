import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import type { CsvValue } from '@/lib/export/csv';
import { t, type Lang } from '@/lib/i18n';
import { hasAadhaarNumber } from '@/lib/privacy/aadhaar';
import { indiaDate } from '@/lib/time/india';
import { DESK_ROLES } from './register-rules';

// The mandatory public disclosure data (docs/28 row 10d, C227): what the school's board requires it to disclose,
// typed by the school, each item a heading, what the school discloses, and where it comes from. NOTHING IS
// OVERWRITTEN: every change is a new entry of the item (disclosure_entries is select and insert only), so who changed
// it and when is kept for every version; the latest entry of an item is what is in force, and an item is removed by an
// entry that says so. The printable page and the CSV show exactly what is kept. Nothing is published on the website.
// The office only (row level security holds it too). The audit rows hold the item's id and booleans, never the words.

type Actor = { schoolId: string; userId: string; role: StaffRole };
type Db = Pick<PoolClient, 'query'>;

export const HEADING_MAX = 160;
export const VALUE_MAX = 2000;
export const SOURCE_MAX = 300;
export const ITEMS_MAX = 200;

export type DisclosureVersion = { heading: string; value: string | null; source: string | null; removed: boolean; changed_by: string | null; changed_at: string };
export type DisclosureItem = { item_id: string; heading: string; value: string; source: string; changed_by: string | null; changed_at: string; first_at: string; earlier: DisclosureVersion[] };

// Every item in force, in the order the school added them, each with its earlier versions (newest first).
export async function loadDisclosure(db: Db, actor: Actor): Promise<DisclosureItem[] | null> {
  if (!DESK_ROLES.includes(actor.role)) return null;
  const { rows } = await db.query(
    `select e.item_id, e.heading, e.value, e.source, e.removed, u.display_name as changed_by, e.changed_at
       from disclosure_entries e left join users u on u.school_id = e.school_id and u.user_id = e.changed_by
      where e.school_id = $1
      order by e.item_id, e.changed_at desc`,
    [actor.schoolId]
  );
  const byItem = new Map<string, DisclosureVersion[]>();
  for (const r of rows) {
    const v: DisclosureVersion = { heading: r.heading, value: r.value, source: r.source, removed: r.removed, changed_by: r.changed_by, changed_at: new Date(r.changed_at).toISOString() };
    byItem.set(r.item_id, [...(byItem.get(r.item_id) ?? []), v]);
  }
  const items: DisclosureItem[] = [];
  for (const [itemId, versions] of byItem) {
    const [now, ...earlier] = versions;
    if (now.removed) continue;
    items.push({ item_id: itemId, heading: now.heading, value: now.value ?? '', source: now.source ?? '', changed_by: now.changed_by, changed_at: now.changed_at, first_at: versions[versions.length - 1].changed_at, earlier });
  }
  return items.sort((a, b) => a.first_at.localeCompare(b.first_at) || a.item_id.localeCompare(b.item_id));
}

export type DisclosureProblem = 'heading' | 'value' | 'source' | 'aadhaar' | 'unchanged' | 'too_many';
export type DisclosureResult = { ok: true; itemId: string } | { ok: false; reason: 'not_allowed' | 'not_found' | DisclosureProblem; field?: string };

const typed = (v: unknown, max: number) => (typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= max ? v.trim() : null);

async function current(db: Db, schoolId: string, itemId: string) {
  return (await db.query(`select heading, value, source, removed from disclosure_entries where school_id = $1 and item_id = $2 order by changed_at desc limit 1`, [schoolId, itemId])).rows[0] as { heading: string; value: string | null; source: string | null; removed: boolean } | undefined;
}

// A new item (itemId null), or a new version of an item in force.
export async function saveDisclosure(db: Db, actor: Actor, input: { itemId: string | null; heading: unknown; value: unknown; source: unknown }): Promise<DisclosureResult> {
  if (!DESK_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const heading = typed(input.heading, HEADING_MAX);
  const value = typed(input.value, VALUE_MAX);
  const source = typed(input.source, SOURCE_MAX);
  if (!heading) return { ok: false, reason: 'heading', field: 'heading' };
  if (!value) return { ok: false, reason: 'value', field: 'value' };
  if (!source) return { ok: false, reason: 'source', field: 'source' };
  for (const [field, text] of [['heading', heading], ['value', value], ['source', source]] as const) if (hasAadhaarNumber(text)) return { ok: false, reason: 'aadhaar', field };
  if (input.itemId) {
    const now = await current(db, actor.schoolId, input.itemId);
    if (!now || now.removed) return { ok: false, reason: 'not_found' };
    if (now.heading === heading && now.value === value && now.source === source) return { ok: false, reason: 'unchanged' };
  } else {
    const { rows } = await db.query(`select count(distinct item_id)::int as n from disclosure_entries e where e.school_id = $1 and not exists (select 1 from disclosure_entries r where r.school_id = e.school_id and r.item_id = e.item_id and r.removed)`, [actor.schoolId]);
    if (rows[0].n >= ITEMS_MAX) return { ok: false, reason: 'too_many' };
  }
  const made = await db.query(
    `insert into disclosure_entries (school_id, item_id, heading, value, source, changed_by) values ($1, coalesce($2::uuid, gen_random_uuid()), $3, $4, $5, $6) returning item_id`,
    [actor.schoolId, input.itemId, heading, value, source, actor.userId]
  );
  const itemId = made.rows[0].item_id as string;
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'compliance_desk.disclosure_saved', targetType: 'disclosure_entries', targetId: itemId, beforeState: undefined, afterState: { itemId, first: !input.itemId } });
  return { ok: true, itemId };
}

export async function removeDisclosure(db: Db, actor: Actor, itemId: string): Promise<DisclosureResult> {
  if (!DESK_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const now = await current(db, actor.schoolId, itemId);
  if (!now || now.removed) return { ok: false, reason: 'not_found' };
  await db.query(`insert into disclosure_entries (school_id, item_id, heading, removed, changed_by) values ($1, $2, $3, true, $4)`, [actor.schoolId, itemId, now.heading, actor.userId]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'compliance_desk.disclosure_removed', targetType: 'disclosure_entries', targetId: itemId, beforeState: undefined, afterState: { itemId, removed: true } });
  return { ok: true, itemId };
}

// The items in force as a spreadsheet, in the person's language: exactly what is kept, in the page's order. The day
// of the last change is India's day.
export function disclosureCsv(lang: Lang, items: readonly DisclosureItem[]): { header: string[]; rows: CsvValue[][] } {
  const header = [t(lang, 'cdk.dis.csv.no'), t(lang, 'cdk.dis.csv.heading'), t(lang, 'cdk.dis.csv.value'), t(lang, 'cdk.dis.csv.source'), t(lang, 'cdk.dis.csv.changedBy'), t(lang, 'cdk.dis.csv.changedOn')];
  return { header, rows: items.map((i, n) => [n + 1, i.heading, i.value, i.source, i.changed_by ?? '', indiaDate(new Date(i.changed_at))]) };
}
