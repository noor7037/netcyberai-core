import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit/log';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { asLiveStaff } from '@/lib/control/billing-route';
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, importLeads } from '@/lib/control/leads';
import { parseCsvChecked, rowsToRecords } from '@/lib/import/csv';

// POST: Control → Leads → Import CSV (W7-L). NetCyberAI staff only. The body is the CSV itself (text/csv) or a form
// with the file in "file". Columns: school_name, contact_name, phone, email, city, country_code, notes, and source
// (optional). Every row goes in one transaction: a row is stored as source 'import' (or the valid source it names),
// with its number in international form; a lead that already exists by number or email is stored as 'duplicate'; a
// row with no school, name or phone, or a number or email that cannot be one, is left out with its line and reason.
//   → 200 { inserted, duplicates, rejected: [{ line, reason }] }; 400 empty, unreadable or more than 2,000 rows; 413 too big
export const dynamic = 'force-dynamic';

async function readCsv(req: NextRequest): Promise<{ text: string | null } | { tooBig: true }> {
  const type = req.headers.get('content-type') ?? '';
  if (type.startsWith('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!file || typeof file === 'string') return { text: null };
    if (file.size > MAX_IMPORT_BYTES) return { tooBig: true };
    return { text: await file.text() };
  }
  const text = await req.text().catch(() => null);
  if (text !== null && text.length > MAX_IMPORT_BYTES) return { tooBig: true };
  return { text };
}

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const read = await readCsv(req);
  if ('tooBig' in read) return NextResponse.json({ error: 'too_big' }, { status: 413 });
  const text = read.text;
  if (!text || !text.trim()) return NextResponse.json({ error: 'empty' }, { status: 400 });
  const parsed = parseCsvChecked(text);
  if (parsed.unclosedQuote) return NextResponse.json({ error: 'unreadable' }, { status: 400 });
  const records = rowsToRecords(parsed.rows);
  if (records.length === 0) return NextResponse.json({ error: 'empty' }, { status: 400 });
  if (records.length > MAX_IMPORT_ROWS) return NextResponse.json({ error: 'too_many' }, { status: 400 });

  const run = await asLiveStaff(guard.claims, async (db) => {
    const out = await importLeads(db, records);
    await writeAuditLog(db, { schoolId: null, actorUserId: guard.claims.sub, actorRole: 'super_admin', eventAction: 'leads.imported', targetType: 'lead', afterState: { rows: records.length, inserted: out.inserted, duplicates: out.duplicates, rejected: out.rejected.length } });
    return out;
  });
  if ('refused' in run) return run.refused;
  return NextResponse.json(run.value);
}
