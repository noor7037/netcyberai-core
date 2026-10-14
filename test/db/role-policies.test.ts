import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { FACTS, factContext, rangeFor, type FactId, type FactNumbers } from '@/lib/insights';
import { prepareDraft } from '@/lib/pulse/drafts';
import { COUNTED_AGAINST_LIMIT } from '@/lib/whatsapp/cost';
import { queueThreadReply, queueWhatsAppMessage } from '@/lib/whatsapp/gate';
import { A, B, C5A, C6B, COORDINATOR, FARAH, G_ASHA, G_FARAH, PRINCIPAL, TARA, TARUN, TODAY, accountant, admin, asWho, coordinator, principal, startSchool, tara, type Db, type Who } from '../insights/seed';

// Role policies on attendance, pulse_messages, pulse_response_log and communication_log (P5 close-out, C210).
// The acceptance sentence, first part: "For each of attendance, pulse_messages, pulse_response_log and
// communication_log, each role reads and writes in the database exactly what the app lets it, tested as app_user
// per role." On the whole schema, as the app's own database role, in each person's own session, with nothing in
// front of the database: the school of test/insights/seed.ts (every name and number in it is made up). Every
// session is rolled back, so no test changes what the next one sees.

const u = (n: number) => `ad000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// The seed's own ids: Asha and Bela of 5-A (Tara's class), Gopal of 6-B (Tarun's); the Daily Pulse messages.
const [ASHA, BELA, GOPAL] = [u(101), u(102), u(107)];
const [PULSE_5A_SENT, PULSE_6B_SENT, PULSE_5A_DRAFT, PULSE_5A_OLD] = [u(601), u(602), u(603), u(604)];
const MATHS = u(60);
const tarun: Who = { role: 'teacher', user: TARUN };
const ROLES = [principal, admin, coordinator, tara, accountant] as const;

let db: Db;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;
const n = async (c: Tx, sql: string, params: unknown[] = []) => Number((await c.query(sql, params)).rows[0].n);
const count = (w: Who, sql: string, params: unknown[] = []) => asWho(db, w, (c) => n(c, sql, params));
// What the database says to a statement: done (with how many rows it changed, through a data-modifying CTE), or the
// error it refused it with. A savepoint keeps the session usable after a refusal.
const attempt = (w: Who, sql: string, params: unknown[] = []) =>
  asWho(db, w, async (c) => {
    await c.query('savepoint try');
    try {
      return `changed ${await n(c, `with changed as (${sql} returning 1) select count(*)::int as n from changed`, params)}`;
    } catch (err) {
      await c.query('rollback to savepoint try');
      return (err as Error).message;
    }
  });
const superCount = async (sql: string, params: unknown[] = []) => Number((await db.pg.query(sql, params)).rows[0].n);
const stub = { enqueue: async () => undefined };

describe('role policies on the four tables, as the app’s role, each role', () => {
  beforeAll(async () => {
    db = await startSchool();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }, 180_000);
  afterAll(async () => db?.stop());

  describe('attendance', () => {
    it('the principal, the school admin and the coordinator read every mark of the school; a teacher their own classes’; an accountant none', async () => {
      const all = await superCount(`select count(*) as n from attendance where school_id = $1`, [A]);
      const of5A = await superCount(`select count(*) as n from attendance where school_id = $1 and class_id = $2`, [A, C5A]);
      expect(all).toBeGreaterThan(of5A);
      expect(of5A).toBeGreaterThan(0);
      for (const w of [principal, admin, coordinator]) expect(await count(w, `select count(*) as n from attendance`), w.role).toBe(all);
      expect(await count(tara, `select count(*) as n from attendance`)).toBe(of5A);
      expect(await count(tara, `select count(*) as n from attendance where class_id = $1`, [C6B])).toBe(0);
      expect(await count(accountant, `select count(*) as n from attendance`)).toBe(0);
    });

    it('marking and correcting: the four teaching roles (a teacher, their own classes); an accountant is refused; nobody deletes a mark', async () => {
      const mark = (student: string, cls: string) => `insert into attendance (school_id, student_id, class_id, date, status, marked_by) values ('${A}', '${student}', '${cls}', '${TODAY}', 'absent', nullif(current_setting('app.current_user_id', true), '')::uuid)`;
      // Esha of 5-A and Gopal of 6-B have no mark today.
      const ESHA = u(105);
      for (const w of [principal, admin, coordinator, tara]) expect(await attempt(w, mark(ESHA, C5A)), w.role).toBe('changed 1');
      expect(await attempt(tara, mark(GOPAL, C6B))).toMatch(/row-level security/);
      expect(await attempt(accountant, mark(ESHA, C5A))).toMatch(/row-level security/);
      const correct = `update attendance set status = 'present' where school_id = '${A}' and student_id = '${ASHA}' and date = '${TODAY}'`;
      for (const w of [principal, admin, coordinator, tara]) expect(await attempt(w, correct), w.role).toBe('changed 1');
      expect(await attempt(tarun, correct)).toBe('changed 0'); // not his class
      expect(await attempt(accountant, correct)).toBe('changed 0');
      for (const w of ROLES) expect(await attempt(w, `delete from attendance where school_id = '${A}' and student_id = '${ASHA}'`), w.role).toBe('changed 0');
    });
  });

  describe('pulse_messages', () => {
    it('the three Daily Pulse roles read the messages (a teacher, their own classes’); the coordinator only drafts not yet sent; an accountant none', async () => {
      const all = await superCount(`select count(*) as n from pulse_messages where school_id = $1`, [A]);
      for (const w of [principal, admin]) expect(await count(w, `select count(*) as n from pulse_messages`), w.role).toBe(all);
      const ids = (w: Who) => asWho(db, w, async (c) => (await c.query(`select pulse_id from pulse_messages order by pulse_id`)).rows.map((r: { pulse_id: string }) => r.pulse_id));
      expect(await ids(tara)).toEqual([PULSE_5A_SENT, PULSE_5A_DRAFT, PULSE_5A_OLD]);
      expect(await ids(tarun)).toEqual([PULSE_6B_SENT]);
      expect(await ids(coordinator)).toEqual([PULSE_5A_DRAFT]);
      expect(await ids(accountant)).toEqual([]);
    });

    it('a draft is made in one’s own name by the four roles that record “taught today”; the coordinator keeps a draft a draft and never touches a sent one; nobody deletes a sent one', async () => {
      const draft = (status = 'draft', by = `nullif(current_setting('app.current_user_id', true), '')::uuid`) =>
        `insert into pulse_messages (school_id, class_id, topic, body_en, body_hi, body_hinglish, sent_on, status, created_by) values ('${A}', '${C5A}', 'Area', 'Today: area.', 'आज: क्षेत्रफल।', 'Aaj: area.', '${TODAY}', '${status}', ${by})`;
      for (const w of [principal, admin, coordinator, tara]) expect(await attempt(w, draft()), w.role).toBe('changed 1');
      expect(await attempt(accountant, draft())).toMatch(/row-level security/);
      expect(await attempt(coordinator, draft('sent'))).toMatch(/row-level security/);
      expect(await attempt(tara, draft('draft', `'${TARUN}'`))).toMatch(/row-level security/); // not in her own name
      // Changing a draft's words: the coordinator, and it stays a draft; marking it ready is the Daily Pulse roles' alone.
      const words = `update pulse_messages set body_en = 'Today: angles.' where pulse_id = '${PULSE_5A_DRAFT}'`;
      for (const w of [principal, admin, coordinator, tara]) expect(await attempt(w, words), w.role).toBe('changed 1');
      expect(await attempt(accountant, words)).toBe('changed 0');
      const ready = `update pulse_messages set status = 'ready', body_en = 'Today: angles.', body_hi = 'आज: कोण।', body_hinglish = 'Aaj: angles.' where pulse_id = '${PULSE_5A_DRAFT}'`;
      expect(await attempt(coordinator, ready)).toMatch(/row-level security/);
      expect(await attempt(tara, ready)).toBe('changed 1');
      expect(await attempt(coordinator, `update pulse_messages set body_en = 'x' where pulse_id = '${PULSE_5A_SENT}'`)).toBe('changed 0');
      // A sent message is history: nobody deletes it; a draft, the four roles may.
      for (const w of ROLES) expect(await attempt(w, `delete from pulse_messages where pulse_id = '${PULSE_5A_SENT}'`), w.role).toBe('changed 0');
      for (const w of [principal, admin, coordinator, tara]) expect(await attempt(w, `delete from pulse_messages where pulse_id = '${PULSE_5A_DRAFT}'`), w.role).toBe('changed 1');
      expect(await attempt(accountant, `delete from pulse_messages where pulse_id = '${PULSE_5A_DRAFT}'`)).toBe('changed 0');
    });

    it('“taught today” as the coordinator: a new lesson gets its draft in her name; a lesson whose message is already sent is left as it is, with no refusal', async () => {
      // Two lessons today: one of 5-A whose message went this morning, one of 6-B with none yet.
      const [SENT_LESSON, NEW_LESSON, SENT_PULSE] = [u(620), u(621), u(622)];
      try {
        await db.pg.exec(`
          set session_replication_role = replica;
          insert into syllabus_progress (progress_id, school_id, teacher_id, class_id, subject_id, topic, status, date) values
            ('${SENT_LESSON}', '${A}', '${u(629)}', '${C5A}', '${MATHS}', 'Area', 'taught', '${TODAY}'), ('${NEW_LESSON}', '${A}', '${u(629)}', '${C6B}', '${MATHS}', 'Volume', 'taught', '${TODAY}');
          insert into pulse_messages (pulse_id, school_id, class_id, subject_id, topic, exception_state, body_en, body_hi, body_hinglish, sent_on, status, sent_by, sent_at, source_progress_id) values
            ('${SENT_PULSE}', '${A}', '${C5A}', '${MATHS}', 'Area', 'taught', 'Today: area.', 'आज: क्षेत्रफल।', 'Aaj: area.', '${TODAY}', 'sent', '${TARA}', now(), '${SENT_LESSON}');
          set session_replication_role = origin;`);
        const me = { schoolId: A, userId: COORDINATOR };
        const made = await asWho(db, coordinator, async (c) => {
          const fresh = await prepareDraft(c, me, NEW_LESSON);
          const again = await prepareDraft(c, me, SENT_LESSON);
          await c.query('reset role'); // what the coordinator's statements did, read past row level security
          const rows = (await c.query(`select pulse_id, status, created_by, body_en from pulse_messages where source_progress_id in ($1, $2) order by topic`, [SENT_LESSON, NEW_LESSON])).rows;
          return { fresh, again, rows };
        });
        expect(made.again).toBeNull();
        expect(made.rows).toEqual([
          { pulse_id: SENT_PULSE, status: 'sent', created_by: null, body_en: 'Today: area.' },
          { pulse_id: made.fresh, status: 'draft', created_by: COORDINATOR, body_en: expect.stringContaining('Volume') },
        ]);
        // A Daily Pulse role is answered with the sent message, as before.
        expect(await asWho(db, principal, (c) => prepareDraft(c, { schoolId: A, userId: PRINCIPAL }, SENT_LESSON))).toBe(SENT_PULSE);
      } finally {
        await db.pg.exec(`set session_replication_role = replica; delete from pulse_messages where pulse_id = '${SENT_PULSE}'; delete from syllabus_progress where progress_id in ('${SENT_LESSON}', '${NEW_LESSON}'); set session_replication_role = origin;`);
      }
    });
  });

  describe('pulse_response_log', () => {
    it('the principal and the school admin read every answer; a teacher the answers to their own classes’ messages; the coordinator and an accountant none', async () => {
      const all = await superCount(`select count(*) as n from pulse_response_log where school_id = $1`, [A]);
      for (const w of [principal, admin]) expect(await count(w, `select count(*) as n from pulse_response_log`), w.role).toBe(all);
      const to = (w: Who) => asWho(db, w, async (c) => (await c.query(`select pulse_id, count(*)::int as n from pulse_response_log group by 1 order by 1`)).rows);
      expect(await to(tara)).toEqual([{ pulse_id: PULSE_5A_SENT, n: 2 }, { pulse_id: PULSE_5A_OLD, n: 1 }]);
      expect(await to(tarun)).toEqual([{ pulse_id: PULSE_6B_SENT, n: 2 }]);
      for (const w of [coordinator, accountant]) expect(await to(w), w.role).toEqual([]);
    });

    it('a parent’s answer is written by the platform alone: no school role inserts, changes or deletes one', async () => {
      for (const w of ROLES) {
        expect(await attempt(w, `insert into pulse_response_log (school_id, pulse_id, student_id, parent_id, tier) values ('${A}', '${PULSE_5A_SENT}', '${ASHA}', '${G_ASHA}', 1)`), w.role).toMatch(/row-level security/);
        expect(await attempt(w, `update pulse_response_log set tier = 2 where pulse_id = '${PULSE_5A_SENT}'`), w.role).toBe('changed 0');
        expect(await attempt(w, `delete from pulse_response_log where pulse_id = '${PULSE_5A_SENT}'`), w.role).toBe('changed 0');
      }
    });
  });

  describe('communication_log', () => {
    it('the principal and the school admin read every message; a teacher those about their own classes; the coordinator and an accountant none', async () => {
      const all = await superCount(`select count(*) as n from communication_log where school_id = $1`, [A]);
      for (const w of [principal, admin]) expect(await count(w, `select count(*) as n from communication_log`), w.role).toBe(all);
      // Tara (5-A): the two Daily Pulse messages of 5-A (Asha's, Bela's) and the alert that failed for Asha's guardian.
      const about = (w: Who) => asWho(db, w, async (c) => (await c.query(`select student_id, parent_id from communication_log order by created_at, log_id`)).rows.map((r: { student_id: string | null }) => r.student_id));
      expect((await about(tara)).sort()).toEqual([ASHA, ASHA, BELA].sort());
      expect(await about(tarun)).toEqual([FARAH, FARAH]); // Farah of 6-B: the Daily Pulse of 6-B and an alert
      for (const w of [coordinator, accountant]) expect(await about(w), w.role).toEqual([]);
    });

    it('the bridge for the code deployed before C210: open only where it was set, and closed once the new runner records its job types', async () => {
      const all = await superCount(`select count(*) as n from communication_log where school_id = $1`, [A]);
      const handlers = (await db.pg.query(`select value from platform_settings where key = 'jobs.handlers'`)).rows[0]?.value ?? null;
      // A fresh database (every test, production today) never opens it.
      expect(await count(accountant, `select count(*) as n from communication_log`)).toBe(0);
      try {
        // Set on a database that already held messages, before the new code runs: every school role reads, as before C210.
        await db.pg.query(`insert into platform_settings (key, value) values ('rollout.message_log_bridge', 'true'::jsonb) on conflict (key) do update set value = excluded.value`);
        await db.pg.query(`insert into platform_settings (key, value) values ('jobs.handlers', '[]'::jsonb) on conflict (key) do update set value = excluded.value`);
        for (const w of [coordinator, accountant]) expect(await count(w, `select count(*) as n from communication_log`), w.role).toBe(all);
        // The new runner records its job types: the bridge closes by itself.
        await db.pg.query(`update platform_settings set value = '["early_warning.nightly", "auditor.weekly"]'::jsonb where key = 'jobs.handlers'`);
        for (const w of [coordinator, accountant]) expect(await count(w, `select count(*) as n from communication_log`), w.role).toBe(0);
        expect(await count(principal, `select count(*) as n from communication_log`)).toBe(all);
      } finally {
        await db.pg.query(`delete from platform_settings where key = 'rollout.message_log_bridge'`);
        if (handlers === null) await db.pg.query(`delete from platform_settings where key = 'jobs.handlers'`);
        else await db.pg.query(`update platform_settings set value = $1::jsonb where key = 'jobs.handlers'`, [JSON.stringify(handlers)]);
      }
    });

    it('a message is written by every role whose work sets one off (through the send-gate); a reply only in one’s own name; no school role changes a message', async () => {
      const write = (w: Who, sql: string) => asWho(db, w, (c) => c.query(sql).then(() => 'written', (e: Error) => e.message));
      for (const w of ROLES) expect(await write(w, `insert into communication_log (school_id, channel, status, student_id, parent_id) values ('${A}', 'whatsapp', 'queued', '${FARAH}', '${G_FARAH}')`), w.role).toBe('written');
      const asPrincipal = `insert into communication_log (school_id, channel, status, parent_id, sent_by) values ('${A}', 'whatsapp', 'queued', '${G_ASHA}', '${PRINCIPAL}')`;
      expect(await write(principal, asPrincipal)).toBe('written');
      for (const w of [admin, coordinator, tara, accountant]) expect(await write(w, asPrincipal), w.role).toMatch(/row-level security/);
      for (const w of ROLES) expect(await attempt(w, `update communication_log set reason = 'x' where school_id = '${A}'`), w.role).toBe('changed 0');
    });

    it('a reply is written only by the roles that answer parents, in their own name, into a conversation they may see, to its number', async () => {
      // Two conversations: Asha's guardian (5-A, Tara's class) and Farah's (6-B, Tarun's).
      const [ASHAS, FARAHS] = [u(991), u(992)];
      const [ASHA_PHONE, FARAH_PHONE] = ['+919000000001', '+919000000006'];
      try {
        await db.pg.query(`insert into message_threads (thread_id, school_id, phone, parent_id, last_inbound_at) values ($1, $3, $4, $5, now()), ($2, $3, $6, $7, now())`, [ASHAS, FARAHS, A, ASHA_PHONE, G_ASHA, FARAH_PHONE, G_FARAH]);
        const reply = (w: Who, thread: string, phone: string, by: string | null = w.user) =>
          asWho(db, w, (c) =>
            c.query(`insert into communication_log (school_id, channel, status, parent_id, purpose, thread_id, body, sent_by, to_phone) values ($1, 'whatsapp', 'queued', $2, 'operational_communication', $3, 'Thank you, we will look into it.', $4, $5)`, [A, thread === ASHAS ? G_ASHA : G_FARAH, thread, by, phone]).then(() => 'written', (e: Error) => e.message)
          );
        for (const w of [principal, admin]) for (const [t, p] of [[ASHAS, ASHA_PHONE], [FARAHS, FARAH_PHONE]]) expect(await reply(w, t, p), w.role).toBe('written');
        expect(await reply(tara, ASHAS, ASHA_PHONE)).toBe('written');
        expect(await reply(tara, FARAHS, FARAH_PHONE)).toMatch(/row-level security/); // not a guardian of her classes
        expect(await reply(tara, ASHAS, FARAH_PHONE)).toMatch(/row-level security/); // not that conversation's number
        expect(await reply(tara, ASHAS, ASHA_PHONE, PRINCIPAL)).toMatch(/row-level security/); // not in her own name
        expect(await reply(tara, ASHAS, ASHA_PHONE, null)).toMatch(/row-level security/); // in nobody's name
        for (const w of [coordinator, accountant]) expect(await reply(w, ASHAS, ASHA_PHONE), w.role).toMatch(/row-level security/);
      } finally {
        await db.pg.query(`delete from message_threads where thread_id in ($1, $2)`, [ASHAS, FARAHS]);
      }
    });

    it('the gate works the same for a role that reads no message: an accountant’s receipt is queued once, and a teacher’s message about a child of another class is written', async () => {
      const receipt = (c: Tx) => queueWhatsAppMessage(c, stub, { schoolId: A, studentId: FARAH, parentId: G_FARAH, purpose: 'operational_communication', toPhone: '+919000000006', templateName: 'fee_receipt', templateParams: { amount: '1,000.00', receipt_no: 'RCP-9' }, dedupeKey: 'fee-receipt:c210-test' });
      const twice = await asWho(db, accountant, async (c) => {
        const first = await receipt(c);
        const second = await receipt(c);
        return { first, second, readable: await n(c, `select count(*) as n from communication_log where dedupe_key = 'fee-receipt:c210-test'`) };
      });
      expect(twice.first.idempotent).toBe(false);
      expect(twice.second).toMatchObject({ logId: twice.first.logId, status: twice.first.status, idempotent: true });
      expect(twice.readable).toBe(0); // written, found again by the gate, and still not the accountant's to read
      // A complaint about Farah (6-B) that the office gave Tara: its message is written in her session.
      const told = await asWho(db, tara, (c) => queueWhatsAppMessage(c, stub, { schoolId: A, studentId: FARAH, parentId: G_FARAH, purpose: 'operational_communication', toPhone: '+919000000006', templateName: 'complaint_closed', templateParams: { ref: 'C-1' }, dedupeKey: 'complaint:c210-test:closed' }));
      expect(told.logId).toMatch(/^[0-9a-f-]{36}$/);
      // A reply is in the writer's own name, and the writer reads it back.
      const thread = u(990);
      await db.pg.query(`insert into message_threads (thread_id, school_id, phone, parent_id, last_inbound_at) values ($1, $2, '+919000000001', $3, now())`, [thread, A, G_ASHA]);
      try {
        const reply = await asWho(db, tara, async (c) => {
          const r = await queueThreadReply(c, stub, { schoolId: A, userId: TARA }, thread, 'Thank you, we will look into it.');
          return { r, mine: r.ok ? await n(c, `select count(*) as n from communication_log where log_id = $1 and sent_by = $2`, [r.logId, TARA]) : -1 };
        });
        expect(reply).toMatchObject({ r: { ok: true }, mine: 1 });
      } finally {
        await db.pg.query(`delete from message_threads where thread_id = $1`, [thread]);
      }
    });

    it('the budget holds every role the same: the month’s priced messages of the whole school are counted, whoever queues', async () => {
      // Consent for Asha, no quiet hours, and a limit today's priced Daily Pulse (Asha's, delivered) has already passed.
      await db.pg.query(`update schools set monthly_budget_paise = 1, quiet_hours_start = '00:00', quiet_hours_end = '00:00' where school_id = $1`, [A]);
      await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1'`, [A, ASHA]);
      try {
        const queue = (w: Who) => asWho(db, w, (c) => queueWhatsAppMessage(c, stub, { schoolId: A, studentId: ASHA, parentId: G_ASHA, purpose: 'operational_communication', toPhone: '+919000000001', templateName: 'fee_receipt', templateParams: { amount: '1.00', receipt_no: 'RCP-10' }, dedupeKey: `budget:${w.role}` }));
        for (const w of [principal, coordinator, tara, accountant]) expect((await queue(w)).status, w.role).toBe('blocked_budget');
        // The coordinator and the accountant read none of the priced messages: the gate's sum is the school's month.
        for (const w of [coordinator, accountant]) expect(await count(w, `select count(*) as n from communication_log where cost_basis = 'rate_table'`), w.role).toBe(0);
      } finally {
        await db.pg.query(`update schools set monthly_budget_paise = 50000, quiet_hours_start = '21:00', quiet_hours_end = '07:00' where school_id = $1`, [A]);
        await db.pg.exec(`set session_replication_role = replica; delete from consent_ledger where school_id = '${A}' and student_id = '${ASHA}'; set session_replication_role = origin;`);
      }
    });

    it('the gate’s two functions answer a school session for its own school only, with no person, number or words', async () => {
      const key = (await db.pg.query(`select dedupe_key from communication_log where school_id = $1 and dedupe_key is not null limit 1`, [A])).rows[0].dedupe_key as string;
      expect(await count(accountant, `select count(*) as n from public.communication_log_dedupe($1, $2)`, [A, key])).toBe(1);
      expect(await count({ ...accountant, school: B }, `select count(*) as n from public.communication_log_dedupe($1, $2)`, [A, key])).toBe(0);
      expect(await count(tara, `select count(*) as n from public.whatsapp_priced_this_month($1, 'Asia/Kolkata')`, [A])).toBeGreaterThan(0);
      expect(await count({ ...tara, school: B }, `select count(*) as n from public.whatsapp_priced_this_month($1, 'Asia/Kolkata')`, [A])).toBe(0);
      const columns = async (fn: string) => (await db.pg.query(`select string_agg(a, ',' order by o) as c from pg_proc p, unnest(p.proargnames, p.proargmodes) with ordinality as x(a, m, o) where p.proname = $1 and x.m = 't'`, [fn])).rows[0].c;
      expect(await columns('communication_log_dedupe')).toBe('log_id,status');
      expect(await columns('whatsapp_priced_this_month')).toBe('status,billable,cost_basis,est_cost_paise,gst_paise');
      // One rule, one place: the gate adds these rows up with cost.ts's own fragment, and the function's filter is its first condition.
      expect(COUNTED_AGAINST_LIMIT.startsWith(`l.cost_basis = 'rate_table'`)).toBe(true);
      const dir = path.resolve(__dirname, '../../supabase/migrations');
      const migration = readFileSync(path.join(dir, readdirSync(dir).find((f) => f.endsWith('_c210_role_policies.sql'))!), 'utf8');
      expect(migration).toContain(`and l.cost_basis = 'rate_table'`);
    });
  });

  describe('the dashboard’s facts that the registry held by its role list alone', () => {
    // The 26 role-and-fact pairs test/insights/access.test.ts named before C210: each fact's own query, in the
    // role's own session, with no check in code in front of it.
    const ATTENDANCE: FactId[] = ['attendance.classes_marked', 'attendance.classes_unmarked', 'attendance.students_marked', 'attendance.present', 'attendance.absent', 'attendance.late', 'attendance.leave', 'attendance.present_rate'];
    const PULSE: FactId[] = ['pulse.sent', 'pulse.understood', 'pulse.needs_help'];
    const MESSAGES: FactId[] = ['messages.total', 'messages.failed', 'messages.held', 'whatsapp.spend'];
    const PAIRS: [Who, FactId[]][] = [
      [accountant, [...ATTENDANCE, ...PULSE, ...MESSAGES]],
      [tara, MESSAGES],
      [coordinator, [...PULSE, ...MESSAGES]],
    ];
    const load = (w: Who, id: FactId) =>
      asWho(db, w, async (c): Promise<FactNumbers | null> => {
        await c.query('savepoint direct');
        try {
          return await FACTS.find((f) => f.id === id)!.load(c, factContext({ schoolId: A, userId: w.user, role: w.role as never }, TODAY, rangeFor(TODAY, '30d')));
        } catch {
          await c.query('rollback to savepoint direct');
          return null;
        }
      });
    const nothing = (got: FactNumbers | null) => got === null || (got.state ?? 'ok') !== 'ok' || got.value === 0;

    it('26 pairs: the database now gives nothing for 21; the other five read no row the role may not read', async () => {
      expect(PAIRS.reduce((a, [, ids]) => a + ids.length, 0)).toBe(26);
      const answered: string[] = [];
      for (const [w, ids] of PAIRS) for (const id of ids) if (!nothing(await load(w, id))) answered.push(`${w.role} ${id}`);
      expect(answered).toEqual(['accountant attendance.classes_unmarked', ...MESSAGES.map((id) => `teacher ${id}`)]);
      // The accountant's "not marked": every class with a student on its roll, because no mark is read at all.
      const onRoll = await superCount(`select count(distinct class_id) as n from students where school_id = $1 and class_id is not null and status in ('active', 'pending_consent')`, [A]);
      expect(await load(accountant, 'attendance.classes_unmarked')).toMatchObject({ value: onRoll, total: onRoll });
      expect(await load(accountant, 'attendance.students_marked')).toMatchObject({ value: 0 });
      // A teacher's message numbers are their own classes' messages, never the school's.
      const school = await load(principal, 'messages.total');
      const hers = await load(tara, 'messages.total');
      expect(hers!.value).toBe(3);
      expect(school!.value).toBeGreaterThan(hers!.value as number);
      expect((await load(tara, 'whatsapp.spend'))!.value).toBeLessThanOrEqual((await load(principal, 'whatsapp.spend'))!.value as number);
    });
  });
});
