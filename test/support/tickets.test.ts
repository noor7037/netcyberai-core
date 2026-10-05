import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDb, type TestDb } from '../db/pglite-harness';
import { canReply, canTransition, nextStatuses, ticketRef, TICKET_STATUSES, type TicketStatus } from '@/lib/contracts/tickets';
import { MemoryFileStorage, sniffImageType } from '@/lib/storage/file-storage';
import { addTicketMessage, addTicketScreenshot, changeTicketStatus, createTicket, getTicket, listTickets, ticketScreenshotUrl, type TicketActor } from '@/lib/support/tickets';

// Raise Ticket (C126) on real Postgres (PGlite): the status machine, who
// sees which ticket, the audit trail and screenshots. School-side calls run
// as app_user with the school's tenant and the person's role, as a request does.

let db: TestDb;
const A = randomUUID();
const B = randomUUID();
const founder = randomUUID();
const ids = { principal: randomUUID(), teacher: randomUUID(), teacher2: randomUUID(), accountant: randomUUID(), principalB: randomUUID() };
const claims = (role: string, sub: string, schoolId = A) => ({ role: role as any, sub, schoolId });
const school = (role: string, sub: string): TicketActor => ({ userId: sub, role: role as any, side: 'school' });
const platform: TicketActor = { userId: founder, role: 'super_admin', side: 'platform' };
const teacher = claims('teacher', ids.teacher);
const principal = claims('principal', ids.principal);
const NEW = { subject: 'Attendance will not save', body: 'Saving attendance for class 5A shows an error.', category: 'not_working', moduleId: 'attendance' };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const storage = new MemoryFileStorage();

const raise = async (c = teacher, input: Record<string, unknown> = NEW) => {
  const r = await db.tenant(c, (q) => createTicket(q, { ...school(c.role, c.sub), schoolId: c.schoolId }, input));
  if (!r.ok) throw new Error(r.error);
  return r.value.ticketId;
};
const move = (id: string, to: string, by: 'platform' | typeof teacher = 'platform') =>
  by === 'platform' ? db.platform((q) => changeTicketStatus(q, id, to, platform)) : db.tenant(by, (q) => changeTicketStatus(q, id, to, school(by.role, by.sub)));
const statusOf = async (id: string) => (await db.query(`select status from support_tickets where ticket_id = $1`, [id])).rows[0].status as TicketStatus;
const audit = async (id: string) => (await db.query(`select event_action, before_state, after_state, actor_user_id from audit_log where target_id = $1 order by audit_id`, [id])).rows;

beforeAll(async () => {
  db = await createTestDb();
  await db.platform(async (q) => {
    await q.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'A School', 'IN-HR'), ($2, 'B School', 'IN-DL')`, [A, B]);
    await q.query(
      `insert into users (user_id, school_id, role, display_name) values
         ($1, null, 'super_admin', 'Noor'), ($2, $7, 'principal', 'Priya'), ($3, $7, 'teacher', 'Tara'),
         ($4, $7, 'teacher', 'Tanvi'), ($5, $7, 'accountant', 'Arun'), ($6, $8, 'principal', 'Bela')`,
      [founder, ids.principal, ids.teacher, ids.teacher2, ids.accountant, ids.principalB, A, B]
    );
  });
}, 60000);

describe('the status machine', () => {
  it('allows exactly the moves of the table, each for the right side', () => {
    const allowed = (side: 'school' | 'platform') => TICKET_STATUSES.flatMap((from) => TICKET_STATUSES.filter((to) => canTransition(from, to, side)).map((to) => `${from}>${to}`));
    expect(allowed('platform')).toEqual([
      'open>in_progress', 'open>waiting_on_school', 'open>resolved',
      'in_progress>waiting_on_school', 'in_progress>resolved',
      'waiting_on_school>in_progress', 'waiting_on_school>resolved',
      'resolved>open', 'resolved>closed',
      'closed>open',
    ]);
    expect(allowed('school')).toEqual(['waiting_on_school>in_progress', 'resolved>open', 'resolved>closed', 'closed>open']);
    expect(nextStatuses('resolved', 'school')).toEqual(['closed', 'open']);
    expect(TICKET_STATUSES.filter(canReply)).toEqual(['open', 'in_progress', 'waiting_on_school']);
    expect(ticketRef('1a2b3c4d-0000-4000-8000-000000000000')).toBe('T-1A2B3C4D');
  });

  it('the database refuses every move the table does not allow, for the founder and for a school', async () => {
    // Put a ticket in each status as the owner, then try every move by raw SQL.
    for (const from of TICKET_STATUSES) {
      for (const to of TICKET_STATUSES) {
        if (from === to) continue;
        for (const side of ['platform', 'school'] as const) {
          const id = randomUUID();
          await db.query(`insert into support_tickets (ticket_id, school_id, raised_by, raised_role, category, subject, body, status) values ($1, $2, $3, 'teacher', 'other', 'subject', 'a long enough body', $4)`, [id, A, ids.teacher, from]);
          const sql = (q: any) => q.query(`update support_tickets set status = $2 where ticket_id = $1`, [id, to]);
          const attempt = side === 'platform' ? db.platform(sql) : db.tenant(teacher, sql);
          if (canTransition(from, to, side)) await expect(attempt, `${side} ${from}>${to}`).resolves.toBeTruthy();
          else await expect(attempt, `${side} ${from}>${to}`).rejects.toThrow(/ticket/);
        }
      }
    }
    await db.query(`delete from support_tickets where subject = 'subject'`);
  }, 60000);

  it('walks open → in progress → waiting on school → resolved → closed → reopened, every step audited', async () => {
    const id = await raise();
    expect((await move(id, 'in_progress')).ok).toBe(true);
    expect((await move(id, 'waiting_on_school')).ok).toBe(true);
    expect((await move(id, 'resolved')).ok).toBe(true);
    const resolved = (await db.query(`select resolved_at, closed_at from support_tickets where ticket_id = $1`, [id])).rows[0];
    expect(resolved.resolved_at).not.toBeNull();
    expect((await move(id, 'closed', teacher)).ok).toBe(true); // the school confirms
    expect((await db.query(`select closed_at from support_tickets where ticket_id = $1`, [id])).rows[0].closed_at).not.toBeNull();
    expect((await move(id, 'open', teacher)).ok).toBe(true); // reopen
    expect((await db.query(`select resolved_at, closed_at from support_tickets where ticket_id = $1`, [id])).rows[0]).toEqual({ resolved_at: null, closed_at: null });

    const rows = await audit(id);
    expect(rows.map((r) => [r.event_action, r.before_state?.status ?? null, r.after_state.status, r.after_state.side ?? null])).toEqual([
      ['ticket.created', null, 'open', null],
      ['ticket.status_changed', 'open', 'in_progress', 'platform'],
      ['ticket.status_changed', 'in_progress', 'waiting_on_school', 'platform'],
      ['ticket.status_changed', 'waiting_on_school', 'resolved', 'platform'],
      ['ticket.status_changed', 'resolved', 'closed', 'school'],
      ['ticket.status_changed', 'closed', 'open', 'school'],
    ]);
    expect(rows.slice(1, 4).every((r) => r.actor_user_id === founder)).toBe(true);
    // Ids and statuses only: the ticket's words are never in the audit log.
    expect(JSON.stringify(rows)).not.toMatch(/Attendance will not save|class 5A/);
  });

  it('refuses a move outside the table, and a move that is not the school’s, with nothing changed or audited', async () => {
    const id = await raise();
    expect(await move(id, 'closed')).toMatchObject({ ok: false, status: 409 });
    expect(await move(id, 'resolved', teacher)).toMatchObject({ ok: false, status: 409 });
    expect(await move(id, 'in_progress', teacher)).toMatchObject({ ok: false, status: 409 });
    expect(await move(id, 'done')).toMatchObject({ ok: false, status: 400 });
    expect(await statusOf(id)).toBe('open');
    expect((await audit(id)).map((r) => r.event_action)).toEqual(['ticket.created']);
    // The same move twice is one change.
    await move(id, 'in_progress');
    expect((await move(id, 'in_progress')).ok).toBe(true);
    expect((await audit(id)).length).toBe(2);
  });

  it('a school’s reply to a ticket waiting on it moves it to in progress; a resolved ticket is reopened before a reply', async () => {
    const id = await raise();
    const ask = await db.platform((q) => addTicketMessage(q, id, { body: 'Which class and date?', thenStatus: 'waiting_on_school' }, platform));
    expect(ask).toMatchObject({ ok: true, value: { status: 'waiting_on_school' } });
    const reply = await db.tenant(teacher, (q) => addTicketMessage(q, id, { body: '5A, today.' }, school('teacher', ids.teacher)));
    expect(reply).toMatchObject({ ok: true, value: { status: 'in_progress' } });
    await move(id, 'resolved');
    expect(await db.tenant(teacher, (q) => addTicketMessage(q, id, { body: 'Still broken' }, school('teacher', ids.teacher)))).toMatchObject({ ok: false, status: 409 });
    // A school cannot set a status with its reply.
    await move(id, 'open', teacher);
    await db.tenant(teacher, (q) => addTicketMessage(q, id, { body: 'Still broken', thenStatus: 'resolved' }, school('teacher', ids.teacher)));
    expect(await statusOf(id)).toBe('open');
    expect((await audit(id)).map((r) => [r.event_action, r.after_state.via ?? null])).toEqual([
      ['ticket.created', null],
      ['ticket.message_added', null],
      ['ticket.status_changed', 'reply'],
      ['ticket.message_added', null],
      ['ticket.status_changed', 'reply'],
      ['ticket.status_changed', null],
      ['ticket.status_changed', null],
      ['ticket.message_added', null],
    ]);
    const seen = await db.tenant(teacher, (q) => getTicket(q, id));
    expect(seen!.messages.map((m) => [m.side, m.authorName, m.body])).toEqual([
      ['platform', null, 'Which class and date?'],
      ['school', 'Tara', '5A, today.'],
      ['school', 'Tara', 'Still broken'],
    ]);
    expect((await db.platform((q) => getTicket(q, id, { allSchools: true })))!.messages[0].authorName).toBe('Noor');
  });
});

describe('who sees which ticket', () => {
  let mine: string, colleagues: string, office: string, other: string;
  beforeAll(async () => {
    mine = await raise(teacher, { ...NEW, subject: 'Teacher Tara ticket' });
    colleagues = await raise(claims('teacher', ids.teacher2), { ...NEW, subject: 'Teacher Tanvi ticket' });
    office = await raise(principal, { ...NEW, subject: 'Principal ticket', category: 'billing', moduleId: null });
    other = await raise(claims('principal', ids.principalB, B), { ...NEW, subject: 'Other school ticket' });
  });
  const subjects = async (c: any) => (await db.tenant(c, (q) => listTickets(q))).map((t) => t.subject).filter((s) => / ticket$/.test(s)).sort();

  it('a teacher or accountant sees only the tickets they raised; the office sees the whole school’s; never another school’s', async () => {
    expect(await subjects(teacher)).toEqual(['Teacher Tara ticket']);
    expect(await subjects(claims('accountant', ids.accountant))).toEqual([]);
    expect(await subjects(principal)).toEqual(['Principal ticket', 'Teacher Tanvi ticket', 'Teacher Tara ticket']);
    expect(await subjects(claims('school_admin', randomUUID()))).toEqual(['Principal ticket', 'Teacher Tanvi ticket', 'Teacher Tara ticket']);
    expect(await subjects(claims('principal', ids.principalB, B))).toEqual(['Other school ticket']);
    for (const id of [colleagues, office, other]) {
      expect(await db.tenant(teacher, (q) => getTicket(q, id))).toBeNull();
      expect(await db.tenant(teacher, (q) => changeTicketStatus(q, id, 'open', school('teacher', ids.teacher)))).toMatchObject({ ok: false, status: 404 });
      expect(await db.tenant(teacher, (q) => addTicketMessage(q, id, { body: 'hello' }, school('teacher', ids.teacher)))).toMatchObject({ ok: false, status: 404 });
    }
    expect(await db.tenant(principal, (q) => getTicket(q, other))).toBeNull();
  });

  it('the founder sees every school’s tickets, with the school’s name, and can narrow by school or status', async () => {
    const all = await db.platform((q) => listTickets(q, { allSchools: true }));
    expect(all.filter((t) => / ticket$/.test(t.subject)).map((t) => t.schoolName).sort()).toEqual(['A School', 'A School', 'A School', 'B School']);
    expect((await db.platform((q) => listTickets(q, { allSchools: true, schoolId: B }))).map((t) => t.subject)).toEqual(['Other school ticket']);
    await move(other, 'in_progress');
    expect((await db.platform((q) => listTickets(q, { allSchools: true, status: 'in_progress', schoolId: B }))).length).toBe(1);
    expect((await db.platform((q) => getTicket(q, mine, { allSchools: true })))).toMatchObject({ raisedByName: 'Tara', schoolName: 'A School', ref: expect.stringMatching(/^T-[0-9A-F]{8}$/) });
  });

  it('row level security holds against raw SQL: another school, a colleague’s ticket, another name, the platform side', async () => {
    const t = { tenant: A, role: 'teacher', user: ids.teacher };
    const count = async (sql: string) => (await db.asRole('app_user', t, (q) => q.query(sql))).rows[0].n;
    expect(await count(`select count(*)::int n from support_tickets where subject like '% ticket'`)).toBe(1);
    await db.platform((q) => addTicketMessage(q, colleagues, { body: 'for Tanvi only' }, platform));
    expect(await count(`select count(*)::int n from support_ticket_messages where body = 'for Tanvi only'`)).toBe(0);
    const ins = (sql: string, params: unknown[]) => db.asRole('app_user', t, (q) => q.query(sql, params));
    const rls = /row-level security/;
    const ticket = `insert into support_tickets (school_id, raised_by, raised_role, category, subject, body, status) values ($1, $2, $3, 'other', 'raw sql', 'a long enough body', $4)`;
    await expect(ins(ticket, [B, ids.teacher, 'teacher', 'open'])).rejects.toThrow(rls); // another school
    await expect(ins(ticket, [A, ids.teacher2, 'teacher', 'open'])).rejects.toThrow(rls); // in a colleague's name
    await expect(ins(ticket, [A, ids.teacher, 'principal', 'open'])).rejects.toThrow(rls); // with another role
    await expect(ins(ticket, [A, ids.teacher, 'teacher', 'resolved'])).rejects.toThrow(rls); // not open
    const msg = `insert into support_ticket_messages (school_id, ticket_id, author_user_id, author_side, body) values ($1, $2, $3, $4, 'x')`;
    await expect(ins(msg, [A, colleagues, ids.teacher, 'school'])).rejects.toThrow(rls); // a ticket they cannot see
    await expect(ins(msg, [A, mine, ids.teacher, 'platform'])).rejects.toThrow(rls); // as NetCyberAI
    await expect(ins(msg, [A, mine, ids.teacher2, 'school'])).rejects.toThrow(rls); // in a colleague's name
    await expect(ins(msg, [A, mine, ids.teacher, 'school'])).resolves.toBeTruthy();
    // The ticket's words, school and raiser cannot be changed; nothing can be deleted.
    const denied = /permission denied/;
    await expect(ins(`update support_tickets set subject = 'x' where ticket_id = $1`, [mine])).rejects.toThrow(denied);
    await expect(ins(`update support_tickets set school_id = $2 where ticket_id = $1`, [mine, B])).rejects.toThrow(denied);
    await expect(ins(`delete from support_tickets where ticket_id = $1`, [mine])).rejects.toThrow(denied);
    await expect(ins(`update support_ticket_messages set body = 'x'`, [])).rejects.toThrow(denied);
    await expect(ins(`delete from support_ticket_messages`, [])).rejects.toThrow(denied);
    await expect(db.platform((q) => q.query(`delete from support_ticket_messages`))).rejects.toThrow(denied);
    for (const role of ['anon', 'authenticated', 'app_backend'] as const) {
      await expect(db.asRole(role, t, (q) => q.query(`select count(*) from support_tickets`))).rejects.toThrow(denied);
    }
  });

  it('validates a new ticket and limits how many one person raises in an hour', async () => {
    const bad = (input: Record<string, unknown>) => db.tenant(teacher, (q) => createTicket(q, { ...school('teacher', ids.teacher), schoolId: A }, input));
    expect(await bad({ ...NEW, subject: 'x' })).toMatchObject({ ok: false, status: 400 });
    expect(await bad({ ...NEW, body: 'short' })).toMatchObject({ ok: false, status: 400 });
    expect(await bad({ ...NEW, category: 'gossip' })).toMatchObject({ ok: false, status: 400 });
    expect(await bad({ ...NEW, moduleId: 'not-a-module' })).toMatchObject({ ok: false, status: 400 });
    const c = claims('accountant', ids.accountant);
    for (let i = 0; i < 10; i++) await raise(c);
    expect(await db.tenant(c, (q) => createTicket(q, { ...school('accountant', ids.accountant), schoolId: A }, NEW))).toMatchObject({ ok: false, status: 429 });
  });
});

describe('screenshots', () => {
  it('recognises an image by its bytes, not its name', () => {
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(new TextEncoder().encode('RIFF0000WEBPVP8 '))).toBe('image/webp');
    expect(sniffImageType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
  });

  it('stores a screenshot under the school’s own prefix and hands it out only to those who see the ticket', async () => {
    const id = await raise(teacher, { ...NEW, subject: 'With a screenshot' });
    const actor = school('teacher', ids.teacher);
    const up = await db.tenant(teacher, (q) => addTicketScreenshot(q, storage, id, { name: '../../etc/passwd<script>.png', bytes: PNG }, actor));
    expect(up).toMatchObject({ ok: true, value: { mimeType: 'image/png', sizeBytes: PNG.length, uploadedSide: 'school', fileName: '.._.._etc_passwd_script_.png' } });
    const [key] = [...storage.files.keys()];
    expect(key).toMatch(new RegExp(`^${A}/tickets/${id}/[0-9a-f-]{36}\\.png$`));
    const attachmentId = (up as any).value.attachmentId;

    expect(await db.tenant(teacher, (q) => ticketScreenshotUrl(q, storage, id, attachmentId))).toBe(`memory://${key}?ttl=300`);
    expect(await db.tenant(principal, (q) => ticketScreenshotUrl(q, storage, id, attachmentId))).toContain(key);
    expect(await db.platform((q) => ticketScreenshotUrl(q, storage, id, attachmentId))).toContain(key);
    // A colleague, another role, another school: no link.
    expect(await db.tenant(claims('teacher', ids.teacher2), (q) => ticketScreenshotUrl(q, storage, id, attachmentId))).toBeNull();
    expect(await db.tenant(claims('principal', ids.principalB, B), (q) => ticketScreenshotUrl(q, storage, id, attachmentId))).toBeNull();
    expect(await db.tenant(claims('teacher', ids.teacher2), (q) => addTicketScreenshot(q, storage, id, { name: 'a.png', bytes: PNG }, school('teacher', ids.teacher2)))).toMatchObject({ ok: false, status: 404 });
    expect((await db.tenant(teacher, (q) => getTicket(q, id)))!.attachments.length).toBe(1);
    expect((await audit(id)).map((r) => r.event_action)).toEqual(['ticket.created', 'ticket.screenshot_added']);
  });

  it('refuses a file that is not an image, is too large, or is one too many; a failed store leaves no row', async () => {
    const id = await raise(teacher, { ...NEW, subject: 'Limits' });
    const actor = school('teacher', ids.teacher);
    const add = (bytes: Uint8Array, s = storage) => db.tenant(teacher, (q) => addTicketScreenshot(q, s, id, { name: 'a.png', bytes }, actor));
    expect(await add(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toMatchObject({ ok: false, status: 400 });
    expect(await add(new Uint8Array(0))).toMatchObject({ ok: false, status: 400 });
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG);
    expect(await add(big)).toMatchObject({ ok: false, status: 400 });
    const broken = new MemoryFileStorage();
    broken.put = async () => { throw new Error('store is down'); };
    await expect(add(PNG, broken)).rejects.toThrow('store is down');
    expect((await db.query(`select count(*)::int n from support_ticket_attachments where ticket_id = $1`, [id])).rows[0].n).toBe(0);
    for (let i = 0; i < 5; i++) expect((await add(PNG)).ok).toBe(true);
    expect(await add(PNG)).toMatchObject({ ok: false, status: 409 });
    // A row whose file would sit under another school's prefix is refused by the table itself.
    await expect(
      db.tenant(teacher, (q) => q.query(`insert into support_ticket_attachments (school_id, ticket_id, storage_key, file_name, mime_type, size_bytes, uploaded_by, uploaded_side) values ($1, $2, $3, 'a.png', 'image/png', 10, $4, 'school')`, [A, id, `${B}/tickets/${id}/x.png`, ids.teacher]))
    ).rejects.toThrow(/check constraint/);
  });
});
