import { randomBytes } from 'crypto';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { readSettings } from '@/lib/frameworks/settings-store';
import type { JobQueue, Sql } from '@/lib/jobs/types';
import { newReferenceCode } from '@/lib/payments/upi';
import { siteUrl } from '@/lib/site-config';
import { whatsappIsLive } from '@/lib/whatsapp/gate';
import { allocateOldestFirst } from './payments';
import { tellFeeReminder } from './whatsapp';

// Fee reminders by email (docs/23 6g, §3 rule 9, C179). Run each night with the other fee work.
//
// Three reminders for a due line: 3 days before its date, on it, and 7 days
// after. Nothing is sent unless EVERY one of these holds:
//   - the school has switched reminders on (off unless it has), and is not
//     a test school (its guardians' addresses are not real people's to write to);
//   - the family has no promise to pay whose date is still to come, and no
//     hardship open;
//   - a guardian of a child in the family has an email address, and that
//     child's consent for operational communication is granted;
//   - the family has not been sent a reminder today: one a day, whatever
//     the number of dues.
// A reminder that is held is recorded with why. Either way the line's
// reminder is done: it is not tried again another night.
//
// The email carries the family's payment link when the school takes UPI to
// its own account: the open link if there is one, or a new one for all that
// is owed. It names the school, the amount and the date: no child.

export type ReminderRun = { sent: number; held: number; linksMade: number; byWhatsApp: number };
export const REMINDER_KINDS = [['before_3', 3], ['due_day', 0], ['after_7', -7]] as const;
const LINK_DAYS = 7;
const rupees = (minor: number) => (minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function remindersOn(db: Sql, schoolId: string): Promise<boolean> {
  const fees = SETTINGS_SCHEMAS.find((x) => x.moduleId === 'fees');
  if (!fees || (await readSettings(db as never, schoolId, fees)).effective.reminders_enabled !== true) return false;
  return (await db.query(`select is_test_fixture from schools where school_id = $1`, [schoolId])).rows[0]?.is_test_fixture === false;
}

// The family's open link, or a new one for everything it owes, when the school takes UPI to its own account.
async function linkFor(db: Sql, schoolId: string, payerId: string): Promise<{ linkId: string; token: string; made: boolean } | null> {
  if (!(await db.query(`select 1 from payment_methods where school_id = $1 and method = 'direct_upi' and enabled`, [schoolId])).rows[0]) return null;
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`paylink:${schoolId}:${payerId}`]);
  await db.query(`update payment_links set status = 'expired', closed_at = now() where school_id = $1 and coalesce(family_id, student_id) = $2 and status = 'open' and expires_at <= now()`, [schoolId, payerId]);
  const open = (await db.query(`select link_id, token from payment_links where school_id = $1 and coalesce(family_id, student_id) = $2 and status = 'open'`, [schoolId, payerId])).rows[0];
  if (open) return { linkId: open.link_id, token: open.token, made: false };
  const dues = (await db.query(
    `select l.fee_id, st.student_id, st.family_id, (l.amount_minor - coalesce((select sum(p.amount_minor) from payments p where p.fee_id = l.fee_id), 0))::bigint as balance
       from fees_ledger l join students st on st.school_id = l.school_id and st.student_id = l.student_id
      where l.school_id = $1 and coalesce(st.family_id, st.student_id) = $2 and st.status::text in ('active', 'pending_consent')
      order by l.due_date, l.created_at, l.fee_id`,
    [schoolId, payerId]
  )).rows.map((d) => ({ fee_id: d.fee_id as string, student_id: d.student_id as string, family_id: d.family_id as string | null, balance_minor: Number(d.balance) })).filter((d) => d.balance_minor > 0);
  const owed = dues.reduce((t, d) => t + d.balance_minor, 0);
  if (owed === 0) return null;
  const token = randomBytes(32).toString('base64url');
  let linkId: string | undefined;
  for (let attempt = 0; attempt < 5 && !linkId; attempt += 1) {
    linkId = (await db.query(
      `insert into payment_links (school_id, family_id, student_id, token, amount_minor, created_by, origin, expires_at, reference_code) values ($1, $2, $3, $4, $5, null, 'reminder_job', now() + make_interval(days => $6), $7)
       on conflict (school_id, reference_code) where reference_code is not null do nothing returning link_id`,
      [schoolId, dues[0].family_id, dues[0].student_id, token, owed, LINK_DAYS, newReferenceCode()]
    )).rows[0]?.link_id as string | undefined;
  }
  if (!linkId) throw new Error('a payment link could not be given a reference code');
  const lines = allocateOldestFirst(owed, dues);
  await db.query(`insert into payment_link_lines (school_id, link_id, fee_id, amount_minor) select $1, $2, n.fee_id, n.amount from unnest($3::uuid[], $4::bigint[]) as n(fee_id, amount)`, [schoolId, linkId, lines.map((l) => l.feeId), lines.map((l) => l.amountMinor)]);
  return { linkId, token, made: true };
}

// One school, one night, as the platform role, inside the caller's transaction.
export async function runFeeReminders(db: Sql, queue: JobQueue, schoolId: string, today: string, env: Record<string, string | undefined> = process.env): Promise<ReminderRun> {
  const run: ReminderRun = { sent: 0, held: 0, linksMade: 0, byWhatsApp: 0 };
  if (!(await remindersOn(db, schoolId))) return run;
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`fees.reminders:${schoolId}`]);
  const due = (await db.query(
    `select l.fee_id, l.due_date::text as due_date, coalesce(st.family_id, st.student_id) as payer_id, k.which,
            (l.amount_minor - coalesce((select sum(p.amount_minor) from payments p where p.fee_id = l.fee_id), 0))::bigint as balance
       from fees_ledger l
       join students st on st.school_id = l.school_id and st.student_id = l.student_id and st.status::text in ('active', 'pending_consent')
       join (values ('before_3', 3), ('due_day', 0), ('after_7', -7)) as k(which, ahead) on l.due_date = $2::date + k.ahead
      where l.school_id = $1 and l.late_fee_for is null
        and not exists (select 1 from fee_reminders r where r.school_id = l.school_id and r.fee_id = l.fee_id and r.which = k.which)
      order by l.due_date, l.fee_id`,
    [schoolId, today]
  )).rows.map((r) => ({ ...r, balance: Number(r.balance) })).filter((r) => r.balance > 0) as { fee_id: string; due_date: string; payer_id: string; which: string; balance: number }[];
  const school = (await db.query(`select name from schools where school_id = $1`, [schoolId])).rows[0]?.name as string;
  // WhatsApp is the channel only where a message would really reach a phone (C188); otherwise email, as before.
  const whatsapp = due.length > 0 && (await whatsappIsLive(db, schoolId, env));

  for (const payerId of [...new Set(due.map((d) => d.payer_id))]) {
    const lines = due.filter((d) => d.payer_id === payerId);
    const note = (outcome: 'sent' | 'held', reason: string | null, linkId: string | null, channel: 'email' | 'whatsapp' | null = null) =>
      db.query(
        `insert into fee_reminders (school_id, fee_id, which, payer_id, outcome, held_reason, link_id, run_date, channel) select $1, n.fee_id, n.which, $2, $3, $4, $5, $6, $9 from unnest($7::uuid[], $8::text[]) as n(fee_id, which) on conflict (school_id, fee_id, which) do nothing`,
        [schoolId, payerId, outcome, reason, linkId, today, lines.map((l) => l.fee_id), lines.map((l) => l.which), channel]
      );
    const hold = (await db.query(`select kind from fee_followups where school_id = $1 and coalesce(family_id, student_id) = $2 and status = 'open' and (kind = 'hardship' or promise_date >= $3::date) order by kind limit 1`, [schoolId, payerId, today])).rows[0]?.kind as 'hardship' | 'promise' | undefined;
    // Guardians of the family's children: an address, and that child's consent for operational communication as it stands now.
    const guardians = (await db.query(
      `select distinct lower(btrim(p.email)) as email,
              coalesce((select c.granted from consent_ledger c where c.school_id = st.school_id and c.student_id = st.student_id and c.purpose::text = 'operational_communication' order by c.created_at desc limit 1), false) as consented
         from students st join parent_student_map m on m.school_id = st.school_id and m.student_id = st.student_id
         join parents p on p.school_id = m.school_id and p.parent_id = m.parent_id
        where st.school_id = $1 and coalesce(st.family_id, st.student_id) = $2 and p.email is not null and btrim(p.email) <> ''`,
      [schoolId, payerId]
    )).rows as { email: string; consented: boolean }[];
    const to = [...new Set(guardians.filter((g) => g.consented && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email)).map((g) => g.email))].slice(0, 4);
    const already = !!(await db.query(`select 1 from fee_reminders where school_id = $1 and payer_id = $2 and run_date = $3 and outcome = 'sent'`, [schoolId, payerId, today])).rows[0];
    // A promise or hardship holds every channel; so does "one a day".
    const stopped = hold ?? (already ? 'one_a_day' : null);
    if (stopped) {
      await note('held', stopped, null);
      run.held += lines.length;
      continue;
    }
    // A link is made only for a family that can be reminded some way.
    const noEmail = guardians.length === 0 ? 'no_email' : to.length === 0 ? 'no_consent' : null;
    if (noEmail && !whatsapp) {
      await note('held', noEmail, null);
      run.held += lines.length;
      continue;
    }
    const link = await linkFor(db, schoolId, payerId);
    if (link?.made) run.linksMade += 1;
    // The headline is the most urgent kind among today's lines (overdue, then due today, then due soon), with
    // exactly those lines' amount and their earliest date. Anything else reminded today is stated as the total.
    const total = lines.reduce((t, l) => t + l.balance, 0);
    const kind = (['after_7', 'due_day', 'before_3'] as const).find((k) => lines.some((l) => l.which === k)) as string;
    const head = lines.filter((l) => l.which === kind);
    const headMinor = head.reduce((t, l) => t + l.balance, 0);
    const payUrl = link ? `${siteUrl}/pay/${link.token}` : '';
    // ONE channel a day (C188). WhatsApp first, where it is live and the gate lets a message to this family
    // through (consent, STOP, approved words, a link to give); if none is queued, email, as before.
    if (whatsapp) {
      const anchor = (await db.query(`select student_id, family_id from students where school_id = $1 and coalesce(family_id, student_id) = $2 order by name, student_id limit 1`, [schoolId, payerId])).rows[0];
      const told = anchor ? await tellFeeReminder(db, queue, schoolId, { familyId: anchor.family_id, studentId: anchor.student_id, payerId }, { kind, amountMinor: headMinor, dueDate: head[0].due_date, payUrl, today }) : null;
      if (told && told.queued > 0) {
        await note('sent', null, link?.linkId ?? null, 'whatsapp');
        run.sent += lines.length;
        run.byWhatsApp += lines.length;
        continue;
      }
    }
    if (noEmail) {
      await note('held', noEmail, null);
      run.held += lines.length;
      continue;
    }
    await queue.enqueue(db, {
      type: 'email.send',
      idempotencyKey: `fee-reminder:${schoolId}:${payerId}:${today}`,
      schoolId,
      maxAttempts: 4,
      payload: { to, template: 'fee_reminder', data: { schoolName: school, amount: rupees(headMinor), dueDate: head[0].due_date, kind, total: total > headMinor ? rupees(total) : '', payUrl } },
    });
    await note('sent', null, link?.linkId ?? null, 'email');
    run.sent += lines.length;
  }
  return run;
}
