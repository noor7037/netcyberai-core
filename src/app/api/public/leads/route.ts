import { NextRequest, NextResponse } from 'next/server';
import { withBackendConnection } from '@/lib/auth/db';

// Public, unauthenticated intake for every website lead flow: Get
// Started, Book a Demo, Start a Pilot, Contact Sales and Request a
// Callback (supabase/migrations/20260925090000_leads_sources_contact_callback_pilot.sql
// widened the source check to match this list).
// Reached only via withBackendConnection (no SET ROLE -- there is no
// session, and no school_id yet, so withTenantContext does not apply
// here at all). RLS on `leads` scopes both the insert and the
// duplicate-check read to the `app_backend` role specifically
// (supabase/migrations/20260925061202_leads_table.sql).
const SOURCES = ['get_started', 'book_demo', 'contact', 'callback', 'start_pilot', 'quote'] as const;
const CONTACT_METHODS = ['phone', 'whatsapp', 'email'] as const;
// Burst limit: more than this many submissions from one phone number in
// the window is refused with 429. Keyed on the phone the form already
// collects, so no IP address (extra PII) is stored.
const BURST_LIMIT = 3;
const BURST_WINDOW_MINUTES = 10;
type Source = (typeof SOURCES)[number];

const MAX_SHORT = 200;
const MAX_LONG = 2000;
const DUPLICATE_LOOKBACK_DAYS = 30;

function str(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function strArray(value: unknown, maxItems: number, maxItemLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .slice(0, maxItems)
    .map((v) => v.trim().slice(0, maxItemLength));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  // Honeypot: a field real visitors never see or fill. A filled one is an
  // automated submission, refused visibly rather than stored.
  if (typeof body?.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ error: 'Submission rejected.' }, { status: 400 });
  }

  const source = typeof body?.source === 'string' && SOURCES.includes(body.source as Source) ? (body.source as Source) : null;
  const schoolName = str(body?.schoolName, MAX_SHORT);
  const contactName = str(body?.contactName, MAX_SHORT);
  const contactPhone = str(body?.contactPhone, 32);

  if (!source || !schoolName || !contactName || !contactPhone) {
    return NextResponse.json(
      { error: 'source, schoolName, contactName, and contactPhone are required' },
      { status: 400 }
    );
  }

  // Indian mobile numbers are 10 digits (12 with the 91 prefix); allow up
  // to 15 for international numbers. Anything shorter cannot be called
  // back, so reject it visibly instead of storing a dead lead.
  const phoneDigits = contactPhone.replace(/\D/g, '').length;
  if (phoneDigits < 10 || phoneDigits > 15) {
    return NextResponse.json({ error: 'Please enter a valid phone number with at least 10 digits.' }, { status: 400 });
  }

  const orgType = str(body?.orgType, MAX_SHORT);
  const contactEmail = str(body?.contactEmail, MAX_SHORT);
  const city = str(body?.city, MAX_SHORT);
  const studentCountBand = str(body?.studentCountBand, MAX_SHORT);
  const currentErp = str(body?.currentErp, MAX_SHORT);
  const requiredModules = strArray(body?.requiredModules, 20, MAX_SHORT);
  const requirements = str(body?.requirements, MAX_LONG);
  const preferredDate = str(body?.preferredDate, 10); // 'YYYY-MM-DD'
  const preferredTime = str(body?.preferredTime, 16);
  const preferredContactRaw = str(body?.preferredContact, 16);
  const preferredContact =
    preferredContactRaw && (CONTACT_METHODS as readonly string[]).includes(preferredContactRaw) ? preferredContactRaw : null;
  if (preferredContactRaw && !preferredContact) {
    return NextResponse.json({ error: 'Please choose phone, WhatsApp or email as the contact method.' }, { status: 400 });
  }

  let result: { throttled: true } | { throttled: false; lead: { lead_id: string; status: string }; isDuplicate: boolean };
  try {
    result = await withBackendConnection(async (client) => {
      const { rows: recent } = await client.query(
        `select count(*)::int as n from leads
         where contact_phone = $1 and created_at > now() - interval '${BURST_WINDOW_MINUTES} minutes'`,
        [contactPhone]
      );
      if ((recent[0]?.n ?? 0) >= BURST_LIMIT) return { throttled: true as const };

      // Duplicate check: same phone number, any source, within the
      // lookback window -- flagged, not rejected, so a genuine repeat
      // inquiry still reaches the Control Plane pipeline (the founder's
      // own flow lists "duplicate validation" as a step before the lead
      // record, not a hard stop).
      const { rows: existing } = await client.query(
        `select lead_id from leads
         where contact_phone = $1 and created_at > now() - interval '${DUPLICATE_LOOKBACK_DAYS} days'
         order by created_at desc limit 1`,
        [contactPhone]
      );
      const duplicateOfLeadId = existing[0]?.lead_id ?? null;

      const { rows } = await client.query(
        `insert into leads (
           source, org_type, school_name, contact_name, contact_phone, contact_email,
           city, student_count_band, current_erp, required_modules, requirements,
           preferred_date, preferred_time, status, duplicate_of_lead_id, preferred_contact
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         returning lead_id, status`,
        [
          source,
          orgType,
          schoolName,
          contactName,
          contactPhone,
          contactEmail,
          city,
          studentCountBand,
          currentErp,
          requiredModules,
          requirements,
          preferredDate,
          preferredTime,
          duplicateOfLeadId ? 'duplicate' : 'new',
          duplicateOfLeadId,
          preferredContact,
        ]
      );
      return { throttled: false as const, lead: rows[0], isDuplicate: Boolean(duplicateOfLeadId) };
    });
  } catch (err) {
    // Never let the browser guess: a failed insert is reported as a
    // failure with a JSON reason, so the form shows an error and the
    // direct contact fallbacks instead of a success message.
    console.error('[leads] insert failed', err);
    return NextResponse.json(
      { error: 'We could not save your request right now. Please try again, or reach us on WhatsApp or email.' },
      { status: 503 }
    );
  }

  if (result.throttled) {
    return NextResponse.json(
      { error: 'We already received several requests from this number in the last few minutes. Our team will be in touch.' },
      { status: 429 }
    );
  }

  return NextResponse.json(
    { leadId: result.lead.lead_id, status: result.lead.status, isDuplicate: result.isDuplicate },
    { status: 201 }
  );
}
