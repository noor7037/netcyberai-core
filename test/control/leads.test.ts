import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Leads (W7-L) on real Postgres (PGlite): the leads migrations applied verbatim, then the website intake route and
// Control's list, change, export and import routes. Only the connection is replaced: each helper runs on the test
// database as the same role (app_backend for the public route, the platform role for its email job, the staff role
// for Control). Every school, person, number and address here is made up.

const h = vi.hoisted(() => ({ db: null as unknown as import('../db/pglite-harness').TestDb, kicked: [] as string[] }));

vi.mock('@/lib/auth/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/db')>();
  return {
    ...real,
    withTenantContext: (claims: never, fn: (db: unknown) => Promise<unknown>) => h.db.tenant(claims, fn as never),
    withBackendConnection: (fn: (db: unknown) => Promise<unknown>) => h.db.asRole('app_backend', {}, fn as never),
    withPlatformService: (fn: (db: unknown) => Promise<unknown>) => h.db.platform(fn as never),
  };
});
vi.mock('@/lib/jobs/handlers', () => ({ kickJobs: async (keys: string[]) => void h.kicked.push(...keys) }));

import { createTestDb } from '../db/pglite-harness';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { POST as submit } from '@/app/api/public/leads/route';
import { GET as listRoute, PATCH as patchRoute } from '@/app/api/control/leads/route';
import { GET as exportRoute } from '@/app/api/control/leads/export/route';
import { POST as importRoute } from '@/app/api/control/leads/import/route';
import { renderEmail } from '@/lib/email/templates';
import { toE164 } from '@/lib/leads/contact';
import { indiaDate } from '@/lib/time/india';

const ROOT = path.resolve(__dirname, '../..');
const LEADS_MIGRATIONS = [
  '20260925061202_leads_table.sql',
  '20260925090000_leads_sources_contact_callback_pilot.sql',
  '20260927100000_leads_quote_source_preferred_contact.sql',
  '20260927200000_leads_free_tools_source.sql',
];
const W7L = '20261028134900_leads_contact_notes_import.sql';
const FOUNDER = randomUUID();
const PRINCIPAL = randomUUID();
const SCHOOL = randomUUID();
let founder = '';
let principal = '';

function req(pathname: string, init: { method?: string; body?: string; type?: string; cookie?: string } = {}): NextRequest {
  return new NextRequest(`https://www.netcyberai.test${pathname}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    body: init.body,
    headers: { 'content-type': init.type ?? 'application/json', ...(init.cookie ? { cookie: init.cookie } : {}) },
  });
}
async function cookieFor(sub: string, role: string, schoolId: string | null) {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal: role === 'super_admin' ? 'aal2' : 'aal1', sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
const q = async (sql: string, params: unknown[] = []) => (await h.db.platform((db) => db.query(sql, params))).rows;
const lead = (over: Record<string, unknown> = {}) => ({
  source: 'get_started',
  schoolName: 'Made-up Public School',
  contactName: 'Asha Example',
  contactPhone: '98765 43210',
  contactEmail: 'Asha@Example.test ',
  countryCode: '+91',
  ...over,
});
const post = (body: unknown) => submit(req('/api/public/leads', { body: JSON.stringify(body) }));

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-leads-route-tests-0123456789';
  h.db = await createTestDb();
  for (const f of LEADS_MIGRATIONS) await h.db.pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
  // Rows from before W7-L, to see the backfill: Indian, Saudi local (no country known) and typed with its code.
  await h.db.pg.exec(`insert into leads (source, school_name, contact_name, contact_phone) values
    ('contact', 'Old Indian School', 'Old One', '98100 00001'),
    ('contact', 'Old Riyadh School', 'Old Two', '0503071760'),
    ('contact', 'Old Dubai School', 'Old Three', '+971 50 123 4567')`);
  await h.db.pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', W7L), 'utf8'));
  await h.db.platform(async (db) => {
    await db.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'Made-up School', 'IN-HR')`, [SCHOOL]);
    await db.query(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Farid Founder'), ($2, $3, 'principal', 'Priya Principal')`, [FOUNDER, PRINCIPAL, SCHOOL]);
  });
  founder = await cookieFor(FOUNDER, 'super_admin', null);
  principal = await cookieFor(PRINCIPAL, 'principal', SCHOOL);
}, 60000);

describe('the migration', () => {
  it('backfills the international number: +91 for 10 digits, none for a local 0… number, + for a number typed with its code', async () => {
    const rows = await q(`select school_name, country_code, phone_e164 from leads where school_name like 'Old %' order by school_name`);
    expect(rows).toEqual([
      { school_name: 'Old Dubai School', country_code: '+91', phone_e164: '+971501234567' },
      { school_name: 'Old Indian School', country_code: '+91', phone_e164: '+919810000001' },
      { school_name: 'Old Riyadh School', country_code: '+91', phone_e164: null },
    ]);
  });
});

describe('the international number', () => {
  it('India, Saudi Arabia, a code typed again, a full number and numbers that cannot be one', () => {
    expect(toE164('+91', '98765 43210')).toBe('+919876543210');
    expect(toE164('+91', '919876543210')).toBe('+919876543210');
    expect(toE164('+966', '0503071760')).toBe('+966503071760');
    expect(toE164('966', '0503071760')).toBe('+966503071760');
    expect(toE164('+91', '+966 50 307 1760')).toBe('+966503071760');
    expect(toE164('+91', '12345')).toBeNull();
    expect(toE164('+44', '123')).toBeNull();
    expect(toE164('+0', '9876543210')).toBeNull();
  });
});

describe('the website form route', () => {
  it('refuses a missing or a wrong email, and stores nothing', async () => {
    const before = (await q(`select count(*)::int as n from leads`))[0].n;
    const missing = await post(lead({ contactEmail: undefined }));
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toMatch(/email/i);
    expect((await post(lead({ contactEmail: 'not-an-address' }))).status).toBe(400);
    expect((await q(`select count(*)::int as n from leads`))[0].n).toBe(before);
  });

  it('stores the country code, the number as typed and in international form, and the email lower-cased; queues one confirmation email', async () => {
    const res = await post(lead({ schoolName: 'Riyadh Made-up School', contactPhone: '0503071760', countryCode: '+966', contactEmail: ' Head@Riyadh-School.Test ' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.isDuplicate).toBe(false);
    const [row] = await q(`select country_code, contact_phone, phone_e164, contact_email, status from leads where lead_id = $1`, [body.leadId]);
    expect(row).toEqual({ country_code: '+966', contact_phone: '0503071760', phone_e164: '+966503071760', contact_email: 'head@riyadh-school.test', status: 'new' });
    const key = `email.send:lead_received:${body.leadId}`;
    const jobs = await q(`select type, payload from jobs where idempotency_key = $1`, [key]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].type).toBe('email.send');
    expect(jobs[0].payload).toEqual({ to: ['head@riyadh-school.test'], template: 'lead_received', data: { schoolName: 'Riyadh Made-up School', contactName: 'Asha Example' } });
    expect(h.kicked).toContain(key);

    const india = await post(lead({ schoolName: 'Indian Made-up School', contactEmail: 'office@indian-school.test' }));
    const [r2] = await q(`select phone_e164 from leads where lead_id = $1`, [(await india.json()).leadId]);
    expect(r2.phone_e164).toBe('+919876543210');
  });

  it('marks a repeat request by the same email (another phone) as a duplicate, and sends it no second email', async () => {
    const first = await (await post(lead({ contactPhone: '9000000011', contactEmail: 'repeat@school.test' }))).json();
    const again = await post(lead({ contactPhone: '9000000022', contactEmail: 'REPEAT@school.test' }));
    const body = await again.json();
    expect(body.isDuplicate).toBe(true);
    const [row] = await q(`select status, duplicate_of_lead_id from leads where lead_id = $1`, [body.leadId]);
    expect(row).toEqual({ status: 'duplicate', duplicate_of_lead_id: first.leadId });
    expect(await q(`select 1 from jobs where idempotency_key = $1`, [`email.send:lead_received:${body.leadId}`])).toHaveLength(0);
  });

  it('refuses a number that does not fit the country code', async () => {
    expect((await post(lead({ contactPhone: '12345', contactEmail: 'short@school.test' }))).status).toBe(400);
  });

  it('the confirmation email says it plainly, with the names escaped', () => {
    const mail = renderEmail('lead_received', { schoolName: 'A <b> School', contactName: 'Asha' });
    expect(mail.subject).toBe('We received your request');
    expect(mail.html).toContain('A &lt;b&gt; School');
    expect(mail.text).toContain('within one working day');
  });
});

describe('Control → Leads', () => {
  it('nobody without a session, and nobody from a school, on any route', async () => {
    const calls = (cookie?: string) => [
      listRoute(req('/api/control/leads', { cookie })),
      patchRoute(req('/api/control/leads', { method: 'PATCH', body: JSON.stringify({ leadId: randomUUID(), status: 'contacted' }), cookie })),
      exportRoute(req('/api/control/leads/export', { cookie })),
      importRoute(req('/api/control/leads/import', { body: 'school_name,contact_name,phone\nA,B,9876543210', type: 'text/csv', cookie })),
    ];
    for (const res of await Promise.all(calls())) expect(res.status).toBe(401);
    for (const res of await Promise.all(calls(principal))) expect(res.status).toBe(403);
  });

  it('lists newest first with filters and a search over school, name, phone and email', async () => {
    const all = await (await listRoute(req('/api/control/leads', { cookie: founder }))).json();
    expect(all.total).toBeGreaterThan(3);
    expect(all.pageSize).toBe(50);
    const times = all.leads.map((l: { createdAt: string }) => l.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
    const dup = await (await listRoute(req('/api/control/leads?status=duplicate', { cookie: founder }))).json();
    expect(dup.leads.every((l: { status: string }) => l.status === 'duplicate')).toBe(true);
    const found = await (await listRoute(req('/api/control/leads?q=riyadh-school', { cookie: founder }))).json();
    expect(found.leads.map((l: { schoolName: string }) => l.schoolName)).toEqual(['Riyadh Made-up School']);
    const wild = await (await listRoute(req('/api/control/leads?q=%25', { cookie: founder }))).json();
    expect(wild.total).toBe(0);
  });

  it('a change of status stamps status_changed_at; notes alone do not; a country code makes the old Saudi number dialable', async () => {
    const [{ lead_id: id }] = await q(`select lead_id from leads where school_name = 'Old Riyadh School'`);
    const res = await patchRoute(req('/api/control/leads', { method: 'PATCH', body: JSON.stringify({ leadId: id, status: 'contacted', notes: 'Called, call again Sunday', countryCode: '+966' }), cookie: founder }));
    expect(res.status).toBe(200);
    expect((await res.json()).lead.phoneE164).toBe('+966503071760');
    const [a] = await q(`select status, notes, status_changed_at, country_code, phone_e164 from leads where lead_id = $1`, [id]);
    expect(a.status).toBe('contacted');
    expect(a.notes).toBe('Called, call again Sunday');
    expect(a.status_changed_at).not.toBeNull();
    expect(a.country_code).toBe('+966');

    await patchRoute(req('/api/control/leads', { method: 'PATCH', body: JSON.stringify({ leadId: id, status: 'contacted', notes: 'Second note' }), cookie: founder }));
    const [b] = await q(`select notes, status_changed_at from leads where lead_id = $1`, [id]);
    expect(b.notes).toBe('Second note');
    expect(new Date(b.status_changed_at).getTime()).toBe(new Date(a.status_changed_at).getTime());

    expect((await patchRoute(req('/api/control/leads', { method: 'PATCH', body: JSON.stringify({ leadId: id, status: 'maybe' }), cookie: founder }))).status).toBe(400);
    expect((await patchRoute(req('/api/control/leads', { method: 'PATCH', body: JSON.stringify({ leadId: randomUUID(), status: 'new' }), cookie: founder }))).status).toBe(404);
    const audit = await q(`select event_action, before_state, after_state from audit_log where target_id = $1 order by occurred_at`, [id]);
    expect(audit[0]).toMatchObject({ event_action: 'lead.updated', before_state: { status: 'new' }, after_state: { status: 'contacted' } });
  });

  it('exports the filtered rows as UTF-8 with a byte order mark, an Arabic name intact and a formula written as text', async () => {
    await q(`insert into leads (source, school_name, contact_name, contact_phone, phone_e164, contact_email, status) values ('import', 'مدرسة الأمل', '=HYPERLINK("x")', '0501112233', '+966501112233', 'amal@school.test', 'qualified')`);
    const res = await exportRoute(req('/api/control/leads/export?status=qualified', { cookie: founder }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="netcyberai-leads-${indiaDate()}.csv"`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('﻿lead_id,created_at,source,status,school_name,contact_name,country_code,phone,phone_e164,email,city,org_type,student_count_band,current_erp,required_modules,requirements,preferred_date,preferred_time,preferred_contact,notes,status_changed_at,duplicate_of_lead_id,updated_at');
    expect(lines).toHaveLength(3); // the header, one qualified lead, the closing line break
    expect(text).toContain('مدرسة الأمل');
    expect(text).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('imports a CSV: new rows, a duplicate by number, and rows left out with their reasons', async () => {
    const csv = [
      'school_name,contact_name,phone,email,city,country_code,notes,source',
      'Imported One School,Ravi,9811122233,ravi@one.test,Jaipur,,From the fair,',
      'Imported Gulf School,Sara,0551234567,,Doha,+974,,callback',
      'Imported Again School,Asha,+91 98765 43210,,,,,', // the same number as an earlier website lead
      'No Phone School,Mohan,,,,,,',
      'Bad Email School,Kiran,9811100000,not-an-address,,,,',
      ',Nobody,9811100001,,,,,',
    ].join('\n');
    const res = await importRoute(req('/api/control/leads/import', { body: csv, type: 'text/csv', cookie: founder }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      inserted: 2,
      duplicates: 1,
      rejected: [
        { line: 5, reason: 'phone' },
        { line: 6, reason: 'email' },
        { line: 7, reason: 'school_name' },
      ],
    });
    const rows = await q(`select school_name, source, status, phone_e164, country_code, notes, duplicate_of_lead_id is not null as dup from leads where school_name like 'Imported %' order by school_name`);
    expect(rows).toEqual([
      { school_name: 'Imported Again School', source: 'import', status: 'duplicate', phone_e164: '+919876543210', country_code: '+91', notes: null, dup: true },
      { school_name: 'Imported Gulf School', source: 'callback', status: 'new', phone_e164: '+974551234567', country_code: '+974', notes: null, dup: false },
      { school_name: 'Imported One School', source: 'import', status: 'new', phone_e164: '+919811122233', country_code: '+91', notes: 'From the fair', dup: false },
    ]);
    expect((await importRoute(req('/api/control/leads/import', { body: 'school_name,contact_name,phone\n', type: 'text/csv', cookie: founder }))).status).toBe(400);
  });
});
