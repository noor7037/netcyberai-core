import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import {
  canReply,
  canTransition,
  isTicketCategory,
  isTicketStatus,
  schoolMayMove,
  ticketRef,
  TICKET_CATEGORY_LABEL,
  TICKET_LIMITS,
  TICKET_SCREENSHOT_MAX_BYTES,
  TICKET_SCREENSHOTS_PER_TICKET,
  type TicketAttachment,
  type TicketDetail,
  type TicketMessage,
  type TicketSide,
  type TicketStatus,
  type TicketSummary,
} from '@/lib/contracts/tickets';
import { isModuleId } from '@/lib/contracts/modules';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { PermanentJobError, type JobHandler, type JobQueue, type Sql } from '@/lib/jobs/types';
import { siteUrl } from '@/lib/site-config';
import { sniffImageType, type FileStorage } from '@/lib/storage/file-storage';

// Raise Ticket (PR-4, C126). Every function runs inside the caller's
// transaction: a school session (app_user, row level security decides which
// tickets exist for it) or the founder's (nca_super, all schools). Every
// change writes an audit row with ids and statuses only, never the text
// (C41). A ticket that is not visible is "not found", never "forbidden".

export type TicketActor = { userId: string; role: StaffRole; side: TicketSide };
export type TicketResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 404 | 409 | 429; error: string };

const fail = (status: 400 | 404 | 409 | 429, error: string) => ({ ok: false as const, status, error });
const iso = (v: unknown) => new Date(v as string).toISOString();
const RAISE_LIMIT_PER_HOUR = 10;
const REPLY_LIMIT_PER_HOUR = 60;
const SIGNED_LINK_SECONDS = 5 * 60;

const SUMMARY_COLUMNS = `t.ticket_id, t.school_id, t.subject, t.category, t.module_id, t.status, t.raised_by, t.raised_role,
  t.created_at, t.last_activity_at, u.display_name as raised_by_name`;

function toSummary(r: Record<string, any>): TicketSummary {
  return {
    ticketId: r.ticket_id,
    ref: ticketRef(r.ticket_id),
    schoolId: r.school_id,
    ...(r.school_name !== undefined ? { schoolName: r.school_name } : {}),
    subject: r.subject,
    category: r.category,
    moduleId: r.module_id,
    status: r.status,
    raisedBy: r.raised_by,
    raisedByName: r.raised_by_name ?? null,
    raisedRole: r.raised_role,
    createdAt: iso(r.created_at),
    lastActivityAt: iso(r.last_activity_at),
  };
}

function text(v: unknown, [min, max]: readonly [number, number]): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  const n = [...t].length; // code points, as the table's char_length counts
  return n >= min && n <= max ? t : null;
}

// `queue`: when given, NetCyberAI is told by email (a ticket.notify job in
// the same transaction; `jobKey` lets the caller run it right after commit).
export async function createTicket(
  db: Sql,
  actor: TicketActor & { schoolId: string },
  input: Record<string, unknown>,
  queue?: JobQueue
): Promise<TicketResult<TicketSummary & { jobKey?: string }>> {
  const subject = text(input.subject, TICKET_LIMITS.subject);
  const body = text(input.body, TICKET_LIMITS.body);
  if (!subject) return fail(400, `a subject of ${TICKET_LIMITS.subject[0]} to ${TICKET_LIMITS.subject[1]} characters is required`);
  if (!body) return fail(400, `a description of ${TICKET_LIMITS.body[0]} to ${TICKET_LIMITS.body[1]} characters is required`);
  if (!isTicketCategory(input.category)) return fail(400, 'choose what the ticket is about');
  const moduleId = input.moduleId === undefined || input.moduleId === null || input.moduleId === '' ? null : input.moduleId;
  if (moduleId !== null && !isModuleId(moduleId)) return fail(400, 'unknown module');

  const { rows: recent } = await db.query(
    `select count(*)::int n from support_tickets where raised_by = $1 and created_at > now() - interval '1 hour'`,
    [actor.userId]
  );
  if (recent[0].n >= RAISE_LIMIT_PER_HOUR) return fail(429, 'too many tickets in the last hour; add to an open ticket instead');

  const { rows } = await db.query(
    `insert into support_tickets (school_id, raised_by, raised_role, category, module_id, subject, body)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning ticket_id, school_id, subject, category, module_id, status, raised_by, raised_role, created_at, last_activity_at`,
    [actor.schoolId, actor.userId, actor.role, input.category, moduleId, subject, body]
  );
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'ticket.created',
    targetType: 'support_tickets',
    targetId: rows[0].ticket_id,
    afterState: { status: 'open', category: input.category, module_id: moduleId },
  });
  if (!queue) return { ok: true, value: toSummary(rows[0]) };
  const jobKey = `ticket.notify:${rows[0].ticket_id}`;
  await queue.enqueue(db, { type: 'ticket.notify', idempotencyKey: jobKey, schoolId: actor.schoolId, payload: { ticketId: rows[0].ticket_id }, maxAttempts: 4 });
  return { ok: true, value: { ...toSummary(rows[0]), jobKey } };
}

// The tickets this session can see: for a school role, row level security
// has already narrowed them (own school; own tickets unless office).
export async function listTickets(db: Sql, opts: { status?: unknown; schoolId?: unknown; allSchools?: boolean; limit?: number } = {}): Promise<TicketResult<TicketSummary[]>> {
  const where: string[] = [];
  const params: unknown[] = [];
  const given = (v: unknown) => v !== undefined && v !== null && v !== '';
  if (given(opts.status)) {
    if (!isTicketStatus(opts.status)) return fail(400, 'unknown status');
    where.push(`t.status = $${params.push(opts.status)}`);
  }
  if (given(opts.schoolId)) {
    if (!isUuid(opts.schoolId)) return fail(400, 'unknown school');
    where.push(`t.school_id = $${params.push(opts.schoolId)}`);
  }
  params.push(Math.min(Math.max(opts.limit ?? 100, 1), 200));
  const { rows } = await db.query(
    `select ${SUMMARY_COLUMNS}${opts.allSchools ? ', s.name as school_name' : ''}
     from support_tickets t
     left join users u on u.user_id = t.raised_by
     ${opts.allSchools ? 'join schools s on s.school_id = t.school_id' : ''}
     ${where.length ? `where ${where.join(' and ')}` : ''}
     order by t.last_activity_at desc limit $${params.length}`,
    params
  );
  return { ok: true, value: rows.map(toSummary) };
}

export async function getTicket(db: Sql, ticketId: string, opts: { allSchools?: boolean } = {}): Promise<TicketDetail | null> {
  if (!isUuid(ticketId)) return null;
  const { rows } = await db.query(
    `select ${SUMMARY_COLUMNS}, t.body, t.resolved_at, t.closed_at${opts.allSchools ? ', s.name as school_name' : ''}
     from support_tickets t
     left join users u on u.user_id = t.raised_by
     ${opts.allSchools ? 'join schools s on s.school_id = t.school_id' : ''}
     where t.ticket_id = $1`,
    [ticketId]
  );
  if (!rows[0]) return null;
  const { rows: messages } = await db.query(
    `select m.message_id, m.author_side, m.body, m.created_at, u.display_name
     from support_ticket_messages m left join users u on u.user_id = m.author_user_id
     where m.ticket_id = $1 order by m.created_at, m.message_id`,
    [ticketId]
  );
  const { rows: files } = await db.query(
    `select attachment_id, file_name, mime_type, size_bytes, uploaded_side, created_at
     from support_ticket_attachments where ticket_id = $1 order by created_at, attachment_id`,
    [ticketId]
  );
  return {
    ...toSummary(rows[0]),
    body: rows[0].body,
    resolvedAt: rows[0].resolved_at ? iso(rows[0].resolved_at) : null,
    closedAt: rows[0].closed_at ? iso(rows[0].closed_at) : null,
    messages: messages.map((m): TicketMessage => ({
      messageId: m.message_id,
      side: m.author_side,
      // A school sees NetCyberAI's replies as "NetCyberAI support", not a person's name.
      authorName: m.author_side === 'platform' && !opts.allSchools ? null : (m.display_name ?? null),
      body: m.body,
      createdAt: iso(m.created_at),
    })),
    attachments: files.map((f): TicketAttachment => ({
      attachmentId: f.attachment_id,
      fileName: f.file_name,
      mimeType: f.mime_type,
      sizeBytes: f.size_bytes,
      uploadedSide: f.uploaded_side,
      createdAt: iso(f.created_at),
    })),
  };
}

// The ticket, locked for this transaction, if this session can see it.
async function lockTicket(db: Sql, ticketId: string): Promise<{ ticket_id: string; school_id: string; status: TicketStatus } | null> {
  if (!isUuid(ticketId)) return null;
  const { rows } = await db.query(`select ticket_id, school_id, status from support_tickets where ticket_id = $1 for update`, [ticketId]);
  return rows[0] ?? null;
}

async function moveTo(db: Sql, t: { ticket_id: string; school_id: string; status: TicketStatus }, to: TicketStatus, actor: TicketActor, via?: string) {
  await db.query(`update support_tickets set status = $2, last_activity_at = now() where ticket_id = $1`, [t.ticket_id, to]);
  await writeAuditLog(db, {
    schoolId: t.school_id,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'ticket.status_changed',
    targetType: 'support_tickets',
    targetId: t.ticket_id,
    beforeState: { status: t.status },
    afterState: { status: to, side: actor.side, ...(via ? { via } : {}) },
  });
}

export async function changeTicketStatus(db: Sql, ticketId: string, to: unknown, actor: TicketActor): Promise<TicketResult<{ status: TicketStatus }>> {
  if (!isTicketStatus(to)) return fail(400, 'unknown status');
  const t = await lockTicket(db, ticketId);
  if (!t) return fail(404, 'ticket not found');
  if (t.status === to) return { ok: true, value: { status: to } }; // a repeated request changes nothing
  if (actor.side === 'school' && t.status === 'waiting_on_school' && to === 'in_progress') return fail(409, 'reply to the ticket to answer it');
  if (!(actor.side === 'school' ? schoolMayMove(t.status, to) : canTransition(t.status, to, actor.side))) return fail(409, `a ticket that is ${t.status.replace(/_/g, ' ')} cannot be set to ${to.replace(/_/g, ' ')}`);
  await moveTo(db, t, to, actor);
  return { ok: true, value: { status: to } };
}

// A reply. From the school, on a ticket waiting on it, the ticket goes back
// to in progress. From NetCyberAI, `thenStatus` sets the status with the
// reply (for example "waiting on school" with a question).
export async function addTicketMessage(db: Sql, ticketId: string, input: Record<string, unknown>, actor: TicketActor): Promise<TicketResult<{ messageId: string; status: TicketStatus }>> {
  const body = text(input.body, TICKET_LIMITS.message);
  if (!body) return fail(400, `a reply of up to ${TICKET_LIMITS.message[1]} characters is required`);
  const then = actor.side === 'platform' && input.thenStatus !== undefined && input.thenStatus !== null ? input.thenStatus : null;
  if (then !== null && !isTicketStatus(then)) return fail(400, 'unknown status');
  const t = await lockTicket(db, ticketId);
  if (!t) return fail(404, 'ticket not found');
  if (!canReply(t.status)) return fail(409, 'reopen the ticket to reply');
  const { rows: recent } = await db.query(
    `select count(*)::int n from support_ticket_messages where author_user_id = $1 and created_at > now() - interval '1 hour'`,
    [actor.userId]
  );
  if (recent[0].n >= REPLY_LIMIT_PER_HOUR) return fail(429, 'too many replies in the last hour');
  if (then !== null && then !== t.status && !canTransition(t.status, then, 'platform')) return fail(409, `a ticket that is ${t.status.replace(/_/g, ' ')} cannot be set to ${then.replace(/_/g, ' ')}`);

  const { rows } = await db.query(
    `insert into support_ticket_messages (school_id, ticket_id, author_user_id, author_side, body) values ($1, $2, $3, $4, $5) returning message_id`,
    [t.school_id, t.ticket_id, actor.userId, actor.side, body]
  );
  await writeAuditLog(db, {
    schoolId: t.school_id,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'ticket.message_added',
    targetType: 'support_tickets',
    targetId: t.ticket_id,
    afterState: { message_id: rows[0].message_id, side: actor.side },
  });
  let status = t.status;
  if (actor.side === 'school' && t.status === 'waiting_on_school') status = 'in_progress';
  if (then !== null) status = then;
  if (status !== t.status) await moveTo(db, t, status, actor, 'reply');
  else await db.query(`update support_tickets set last_activity_at = now() where ticket_id = $1`, [t.ticket_id]);
  return { ok: true, value: { messageId: rows[0].message_id, status } };
}

const EXTENSION = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const;

export type ScreenshotPlan = { ticketId: string; schoolId: string; key: string; fileName: string; mimeType: keyof typeof EXTENSION; sizeBytes: number };

async function screenshotAllowed(db: Sql, ticketId: string): Promise<TicketResult<{ ticket_id: string; school_id: string }>> {
  const t = await lockTicket(db, ticketId);
  if (!t) return fail(404, 'ticket not found');
  if (!canReply(t.status)) return fail(409, 'reopen the ticket to add a screenshot');
  const { rows: count } = await db.query(`select count(*)::int n from support_ticket_attachments where ticket_id = $1`, [t.ticket_id]);
  if (count[0].n >= TICKET_SCREENSHOTS_PER_TICKET) return fail(409, `a ticket holds at most ${TICKET_SCREENSHOTS_PER_TICKET} screenshots`);
  return { ok: true, value: t };
}

// A screenshot is added in three steps, so no database connection or lock
// is held while the file travels: (1) plan: the checks, and the key under
// the school's own prefix; (2) the caller stores the file; (3) record: the
// row and its audit entry, with the checks repeated. If (3) fails the
// caller removes the file. The type comes from the file's own bytes.
export async function planTicketScreenshot(db: Sql, ticketId: string, file: { name: string; bytes: Uint8Array }): Promise<TicketResult<ScreenshotPlan>> {
  if (file.bytes.length === 0 || file.bytes.length > TICKET_SCREENSHOT_MAX_BYTES) return fail(400, 'a screenshot must be an image of at most 4 MB');
  const mimeType = sniffImageType(file.bytes);
  if (!mimeType) return fail(400, 'a screenshot must be a PNG, JPEG or WebP image');
  const ok = await screenshotAllowed(db, ticketId);
  if (!ok.ok) return ok;
  const t = ok.value;
  // The key never contains the client's file name; the name kept for
  // display loses anything that is not a letter, digit, dot, dash or space.
  const key = `${t.school_id}/tickets/${t.ticket_id}/${crypto.randomUUID()}.${EXTENSION[mimeType]}`;
  const fileName = [...file.name.replace(/[^\p{L}\p{M}\p{N}._\- ]+/gu, '_').trim()].slice(0, 120).join('') || `screenshot.${EXTENSION[mimeType]}`;
  return { ok: true, value: { ticketId: t.ticket_id, schoolId: t.school_id, key, fileName, mimeType, sizeBytes: file.bytes.length } };
}

export async function recordTicketScreenshot(db: Sql, plan: ScreenshotPlan, actor: TicketActor): Promise<TicketResult<TicketAttachment>> {
  const ok = await screenshotAllowed(db, plan.ticketId);
  if (!ok.ok) return ok;
  const { rows } = await db.query(
    `insert into support_ticket_attachments (school_id, ticket_id, storage_key, file_name, mime_type, size_bytes, uploaded_by, uploaded_side)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning attachment_id, file_name, mime_type, size_bytes, uploaded_side, created_at`,
    [ok.value.school_id, plan.ticketId, plan.key, plan.fileName, plan.mimeType, plan.sizeBytes, actor.userId, actor.side]
  );
  await db.query(`update support_tickets set last_activity_at = now() where ticket_id = $1`, [plan.ticketId]);
  await writeAuditLog(db, {
    schoolId: ok.value.school_id,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'ticket.screenshot_added',
    targetType: 'support_tickets',
    targetId: plan.ticketId,
    afterState: { attachment_id: rows[0].attachment_id, mime_type: plan.mimeType, size_bytes: plan.sizeBytes, side: actor.side },
  });
  const r = rows[0];
  return { ok: true, value: { attachmentId: r.attachment_id, fileName: r.file_name, mimeType: r.mime_type, sizeBytes: r.size_bytes, uploadedSide: r.uploaded_side, createdAt: iso(r.created_at) } };
}

// The three steps in order. `tx` runs one step in its own transaction.
export async function addTicketScreenshot(
  tx: <T>(fn: (db: Sql) => Promise<T>) => Promise<T>,
  storage: FileStorage,
  ticketId: string,
  file: { name: string; bytes: Uint8Array },
  actor: TicketActor
): Promise<TicketResult<TicketAttachment>> {
  const plan = await tx((db) => planTicketScreenshot(db, ticketId, file));
  if (!plan.ok) return plan;
  await storage.put(plan.value.key, file.bytes, plan.value.mimeType);
  try {
    const recorded = await tx((db) => recordTicketScreenshot(db, plan.value, actor));
    if (!recorded.ok) await storage.remove(plan.value.key).catch(() => undefined);
    return recorded;
  } catch (err) {
    await storage.remove(plan.value.key).catch(() => undefined);
    throw err;
  }
}

// A short-lived link to one screenshot, only if this session can read its
// row (row level security: own school, and a ticket it can see).
export async function ticketScreenshotUrl(db: Sql, storage: FileStorage, ticketId: string, attachmentId: string): Promise<string | null> {
  if (!isUuid(ticketId) || !isUuid(attachmentId)) return null;
  const { rows } = await db.query(`select storage_key from support_ticket_attachments where attachment_id = $1 and ticket_id = $2`, [attachmentId, ticketId]);
  return rows[0] ? storage.signedUrl(rows[0].storage_key, SIGNED_LINK_SECONDS) : null;
}

// ticket.notify (C127): the founder's email for a new ticket. Runs as the
// platform. The job was enqueued by a school session, so nothing in it is
// trusted beyond the ticket's id: the ticket is read here and must belong
// to the job's school. The email itself is a second job (email.send, to
// the founders: ONBOARDING_NOTIFY_EMAIL), keyed on the ticket, so however
// often this runs one email is sent. School name, category and a link
// only; never the ticket's words.
export function ticketNotifyHandler(deps: { platform: <T>(fn: (db: Sql) => Promise<T>) => Promise<T>; queue: JobQueue }): JobHandler {
  return async (job) => {
    const ticketId = (job.payload as Record<string, unknown>).ticketId;
    if (!isUuid(ticketId)) throw new PermanentJobError('ticket.notify payload is invalid');
    await deps.platform(async (db) => {
      const { rows } = await db.query(
        `select t.ticket_id, t.school_id, t.category, s.name as school_name
         from support_tickets t join schools s on s.school_id = t.school_id where t.ticket_id = $1`,
        [ticketId]
      );
      const t = rows[0];
      if (!t || t.school_id !== job.schoolId) throw new PermanentJobError('ticket not found for this school');
      await deps.queue.enqueue(db, {
        type: 'email.send',
        idempotencyKey: `email.send:ticket_raised:${t.ticket_id}`,
        schoolId: t.school_id,
        payload: {
          to: 'founders',
          template: 'ticket_raised',
          data: { schoolName: t.school_name, category: TICKET_CATEGORY_LABEL[t.category as keyof typeof TICKET_CATEGORY_LABEL] ?? 'Support', ticketUrl: `${siteUrl}/control/tickets/${t.ticket_id}` },
        },
        maxAttempts: 4,
      });
    });
  };
}
