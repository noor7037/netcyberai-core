import type { CsvValue } from '@/lib/export/csv';
import type { Sql } from '@/lib/jobs/types';
import { DEFAULT_COUNTRY_CODE, normaliseCountryCode, normaliseEmail, toE164 } from '@/lib/leads/contact';

// Control → Leads (W7-L): every lead the website (and an import) brought in, for NetCyberAI staff only. The routes
// under /api/control/leads call these inside the staff transaction (withTenantContext as super_admin); nothing here
// trusts the request beyond the values it checks.

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'rejected', 'duplicate'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_SOURCES = ['get_started', 'book_demo', 'contact', 'callback', 'start_pilot', 'quote', 'free_tools', 'import'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const PAGE_SIZE = 50;
export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 2_000_000;
export const MAX_NOTES = 4000;
const MAX_SHORT = 200;

const isStatus = (v: unknown): v is LeadStatus => typeof v === 'string' && (LEAD_STATUSES as readonly string[]).includes(v);
const isSource = (v: unknown): v is LeadSource => typeof v === 'string' && (LEAD_SOURCES as readonly string[]).includes(v);

export type Lead = {
  leadId: string;
  createdAt: string;
  source: string;
  status: string;
  orgType: string | null;
  schoolName: string;
  contactName: string;
  contactPhone: string;
  countryCode: string;
  phoneE164: string | null;
  contactEmail: string | null;
  city: string | null;
  studentCountBand: string | null;
  currentErp: string | null;
  requiredModules: string[];
  requirements: string | null;
  preferredDate: string | null;
  preferredTime: string | null;
  preferredContact: string | null;
  notes: string | null;
  statusChangedAt: string | null;
  duplicateOfLeadId: string | null;
  updatedAt: string;
};

const COLUMNS = `lead_id, created_at, source, status, org_type, school_name, contact_name, contact_phone, country_code, phone_e164,
  contact_email, city, student_count_band, current_erp, required_modules, requirements, preferred_date::text as preferred_date,
  preferred_time, preferred_contact, notes, status_changed_at, duplicate_of_lead_id, updated_at`;

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

function toLead(r: Record<string, unknown>): Lead {
  return {
    leadId: r.lead_id as string,
    createdAt: iso(r.created_at) as string,
    source: r.source as string,
    status: r.status as string,
    orgType: (r.org_type as string | null) ?? null,
    schoolName: r.school_name as string,
    contactName: r.contact_name as string,
    contactPhone: r.contact_phone as string,
    countryCode: r.country_code as string,
    phoneE164: (r.phone_e164 as string | null) ?? null,
    contactEmail: (r.contact_email as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    studentCountBand: (r.student_count_band as string | null) ?? null,
    currentErp: (r.current_erp as string | null) ?? null,
    requiredModules: Array.isArray(r.required_modules) ? (r.required_modules as string[]) : [],
    requirements: (r.requirements as string | null) ?? null,
    preferredDate: (r.preferred_date as string | null) ?? null,
    preferredTime: (r.preferred_time as string | null) ?? null,
    preferredContact: (r.preferred_contact as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    statusChangedAt: iso(r.status_changed_at),
    duplicateOfLeadId: (r.duplicate_of_lead_id as string | null) ?? null,
    updatedAt: iso(r.updated_at) as string,
  };
}

// ---- the list and its filters ---------------------------------------------------------------------------------------

export type LeadFilters = { status: LeadStatus | null; source: LeadSource | null; q: string | null };

export function parseFilters(params: URLSearchParams): LeadFilters {
  const status = params.get('status');
  const source = params.get('source');
  const q = (params.get('q') ?? '').trim().slice(0, 100);
  return { status: isStatus(status) ? status : null, source: isSource(source) ? source : null, q: q || null };
}

// A search word is matched as text: % and _ in it are not wildcards.
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function where(f: LeadFilters): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const parts: string[] = [];
  if (f.status) {
    params.push(f.status);
    parts.push(`status = $${params.length}`);
  }
  if (f.source) {
    params.push(f.source);
    parts.push(`source = $${params.length}`);
  }
  if (f.q) {
    params.push(likePattern(f.q));
    const n = params.length;
    parts.push(
      `(school_name ilike $${n} or contact_name ilike $${n} or contact_phone ilike $${n} or coalesce(phone_e164, '') ilike $${n} or coalesce(contact_email, '') ilike $${n})`
    );
  }
  return { sql: parts.length ? `where ${parts.join(' and ')}` : '', params };
}

export async function listLeads(db: Sql, f: LeadFilters, page: number): Promise<{ leads: Lead[]; total: number; page: number; pageSize: number }> {
  const w = where(f);
  const { rows: count } = await db.query(`select count(*)::int as n from leads ${w.sql}`, w.params);
  const total = Number(count[0]?.n ?? 0);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), lastPage);
  const { rows } = await db.query(
    `select ${COLUMNS} from leads ${w.sql} order by created_at desc, lead_id limit ${PAGE_SIZE} offset ${(p - 1) * PAGE_SIZE}`,
    w.params
  );
  return { leads: rows.map(toLead), total, page: p, pageSize: PAGE_SIZE };
}

export async function loadLeadsForExport(db: Sql, f: LeadFilters): Promise<Lead[]> {
  const w = where(f);
  const { rows } = await db.query(`select ${COLUMNS} from leads ${w.sql} order by created_at desc, lead_id limit 20000`, w.params);
  return rows.map(toLead);
}

// ---- export ---------------------------------------------------------------------------------------------------------

// Column names a later import reads back (school_name, contact_name, phone, email, city, country_code, notes, source).
export const LEAD_CSV_HEADER = [
  'lead_id', 'created_at', 'source', 'status', 'school_name', 'contact_name', 'country_code', 'phone', 'phone_e164', 'email',
  'city', 'org_type', 'student_count_band', 'current_erp', 'required_modules', 'requirements', 'preferred_date', 'preferred_time',
  'preferred_contact', 'notes', 'status_changed_at', 'duplicate_of_lead_id', 'updated_at',
] as const;

export function leadCsvRow(l: Lead): CsvValue[] {
  return [
    l.leadId, l.createdAt, l.source, l.status, l.schoolName, l.contactName, l.countryCode, l.contactPhone, l.phoneE164, l.contactEmail,
    l.city, l.orgType, l.studentCountBand, l.currentErp, l.requiredModules.join(' | '), l.requirements, l.preferredDate, l.preferredTime,
    l.preferredContact, l.notes, l.statusChangedAt, l.duplicateOfLeadId, l.updatedAt,
  ];
}

// ---- one lead: status, notes, country code ---------------------------------------------------------------------------

export type LeadUpdate = { leadId: string; status: LeadStatus; notes: string | null; countryCode: string | null };

export function parseLeadUpdate(body: unknown): LeadUpdate | null {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.leadId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.leadId)) return null;
  if (!isStatus(b.status)) return null;
  if (b.notes !== undefined && b.notes !== null && typeof b.notes !== 'string') return null;
  const notes = typeof b.notes === 'string' ? b.notes.trim().slice(0, MAX_NOTES) || null : null;
  let countryCode: string | null = null;
  if (b.countryCode !== undefined && b.countryCode !== null && b.countryCode !== '') {
    countryCode = normaliseCountryCode(b.countryCode);
    if (!countryCode) return null;
  }
  return { leadId: b.leadId, status: b.status, notes, countryCode };
}

// Saves status and notes; stamps status_changed_at only when the status changed. A new country code re-derives the
// international number from the phone as typed (a local number left without a country can be fixed here).
export async function updateLead(db: Sql, u: LeadUpdate): Promise<{ before: { status: string }; lead: Lead } | { error: 'not_found' | 'phone' }> {
  const { rows: found } = await db.query(`select status, contact_phone, country_code from leads where lead_id = $1 for update`, [u.leadId]);
  if (!found[0]) return { error: 'not_found' };
  const code = u.countryCode ?? (found[0].country_code as string);
  let e164: string | null | undefined;
  if (u.countryCode) {
    e164 = toE164(code, found[0].contact_phone as string);
    if (!e164) return { error: 'phone' };
  }
  const { rows } = await db.query(
    `update leads
        set status = $2,
            notes = $3,
            status_changed_at = case when status is distinct from $2 then now() else status_changed_at end,
            country_code = $4,
            phone_e164 = case when $5::boolean then $6 else phone_e164 end,
            updated_at = now()
      where lead_id = $1
      returning ${COLUMNS}`,
    [u.leadId, u.status, u.notes, code, e164 !== undefined, e164 ?? null]
  );
  return { before: { status: found[0].status as string }, lead: toLead(rows[0]) };
}

// ---- import ---------------------------------------------------------------------------------------------------------

export type ImportReason = 'school_name' | 'contact_name' | 'phone' | 'email' | 'country_code';
export type ImportOutcome = { inserted: number; duplicates: number; rejected: { line: number; reason: ImportReason }[] };

const cell = (rec: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) {
    const v = (rec[k] ?? '').trim();
    if (v) return v.slice(0, MAX_SHORT);
  }
  return '';
};

// One row per lead, header names as LEAD_CSV_HEADER (contact_phone/contact_email are read too). A row is stored as
// 'duplicate' when an earlier lead (or an earlier row of this file) has the same international number or email.
export async function importLeads(db: Sql, records: Record<string, string>[]): Promise<ImportOutcome> {
  const out: ImportOutcome = { inserted: 0, duplicates: 0, rejected: [] };
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const line = i + 2; // the header is line 1
    const schoolName = cell(rec, 'school_name', 'school');
    const contactName = cell(rec, 'contact_name', 'name');
    const phone = cell(rec, 'phone', 'contact_phone').slice(0, 32);
    const emailRaw = cell(rec, 'email', 'contact_email');
    const codeRaw = cell(rec, 'country_code');
    if (!schoolName) { out.rejected.push({ line, reason: 'school_name' }); continue; }
    if (!contactName) { out.rejected.push({ line, reason: 'contact_name' }); continue; }
    if (!phone) { out.rejected.push({ line, reason: 'phone' }); continue; }
    const countryCode = codeRaw ? normaliseCountryCode(codeRaw) : DEFAULT_COUNTRY_CODE;
    if (!countryCode) { out.rejected.push({ line, reason: 'country_code' }); continue; }
    const phoneE164 = toE164(countryCode, phone);
    if (!phoneE164) { out.rejected.push({ line, reason: 'phone' }); continue; }
    const email = emailRaw ? normaliseEmail(emailRaw) : null;
    if (emailRaw && !email) { out.rejected.push({ line, reason: 'email' }); continue; }
    const sourceRaw = cell(rec, 'source');
    const source: LeadSource = isSource(sourceRaw) ? sourceRaw : 'import';
    const notes = (rec.notes ?? '').trim().slice(0, MAX_NOTES) || null;
    const city = cell(rec, 'city') || null;

    const { rows: existing } = await db.query(
      `select lead_id from leads where phone_e164 = $1 or ($2::text is not null and lower(contact_email) = $2) order by created_at, lead_id limit 1`,
      [phoneE164, email]
    );
    const duplicateOf = (existing[0]?.lead_id as string | undefined) ?? null;
    await db.query(
      `insert into leads (source, school_name, contact_name, contact_phone, contact_email, city, country_code, phone_e164, notes, status, duplicate_of_lead_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [source, schoolName, contactName, phone, email, city, countryCode, phoneE164, notes, duplicateOf ? 'duplicate' : 'new', duplicateOf]
    );
    if (duplicateOf) out.duplicates++;
    else out.inserted++;
  }
  return out;
}
