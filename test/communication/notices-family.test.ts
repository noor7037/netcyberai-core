import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { decideNotice, listNotices, writeNotice } from '@/lib/communication/notices';
import { buildNotifications } from '@/lib/family/notifications';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { renderEmail } from '@/lib/email/templates';

// W14-J: a notice the principal approves reaches every linked family in the Family app, and by email where the guardian has
// an address and WhatsApp is not set up; never a family whose consent is withdrawn, never a child whose family has not
// linked the app. Each delivery is a line in the notice's own delivery log. Every name and number is made up.

const A = 'ca000000-0000-4000-8000-000000000001';
const u = (n: number) => `ca000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, TEACHER, CLASS_6A] = [u(11), u(12), u(51)];
const [ASHA, BELA, CHIRAG, DEV] = [u(31), u(32), u(33), u(34)];
const [ANITA, BINA, CHITRA, DINA] = [u(41), u(42), u(43), u(44)];
const [ACCOUNT, ACCOUNT_2, CHILD, CHILD_2] = ['fa000000-0000-4000-8000-0000000000a1', 'fa000000-0000-4000-8000-0000000000a2', 'fa000000-0000-4000-8000-0000000000c1', 'fa000000-0000-4000-8000-0000000000c2'];
const WORDS = 'The parent meeting is on Saturday at 10 am.';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const queue = createPgJobQueue(platform);
const actor = (who: Who) => ({ schoolId: A, userId: who.user, role: who.role as never });
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
const written = async (body: string) => {
  const r = await as(principal, (c) => writeNotice(c, actor(principal), { classId: CLASS_6A, body }));
  if (!r.ok) throw new Error(`not written: ${r.reason}`);
  return r.noticeId;
};
const approve = (noticeId: string, whatsappLive = false) => as(principal, (c) => decideNotice(c, queue, actor(principal), noticeId, { approve: true }, { whatsappLive }));
const logOf = (noticeId: string) => q(`select s.name as child, l.channel::text as channel, l.status::text as status, l.to_phone as phone from communication_log l join students s on s.student_id = l.student_id where l.dedupe_key like $1 order by l.channel::text, s.name`, [`notice:${noticeId}:%`]);
type Mail = { to: string[]; template: string; data: Record<string, string> };
const emails = async (): Promise<Mail[]> => (await q(`select payload from jobs where type = 'email.send' order by created_at, job_id`)).map((r: { payload: Mail }) => r.payload);

// 6-A. Asha: the family linked the Family app, consent in force, a guardian with an address.
//       Bela: no Family app, a guardian with no address.            -> nothing, in the app or by email
//       Chirag: the family linked the app, a guardian with an address, but consent is withdrawn. -> nothing
//       Dev: no Family app, a guardian with an address, consent in force. -> email only
describe('a notice reaches linked families in the Family app and by email', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    process.env.DATABASE_URL = db.url;
    process.env.DB_POOL_MAX = '1';
    process.env.APP_SESSION_SECRET = 'test-only-secret-for-notices-family-tests-0123456789';
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false);
      insert into users (user_id, school_id, email, role, display_name) values ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'), ('${TEACHER}', '${A}', 't@school-a.example', 'teacher', 'Tara Teacher');
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${CLASS_6A}', '${A}', '6-A', '${TEACHER}');
      insert into students (student_id, school_id, admission_no, name, status, class_id) values ('${ASHA}', '${A}', 'A-1', 'Asha', 'active', '${CLASS_6A}'), ('${BELA}', '${A}', 'A-2', 'Bela', 'active', '${CLASS_6A}'),
        ('${CHIRAG}', '${A}', 'A-3', 'Chirag', 'active', '${CLASS_6A}'), ('${DEV}', '${A}', 'A-4', 'Dev', 'active', '${CLASS_6A}');
      insert into parents (parent_id, school_id, name, phone, email) values ('${ANITA}', '${A}', 'Guardian of Asha', '9000000001', 'Anita.Guardian@example.org'), ('${BINA}', '${A}', 'Guardian of Bela', '9000000002', null),
        ('${CHITRA}', '${A}', 'Guardian of Chirag', '9000000003', 'chitra@example.org'), ('${DINA}', '${A}', 'Guardian of Dev', '9000000004', 'dina@example.org');
      insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${ANITA}', '${ASHA}'), ('${A}', '${BINA}', '${BELA}'), ('${A}', '${CHITRA}', '${CHIRAG}'), ('${A}', '${DINA}', '${DEV}');
      insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version)
        select '${A}', s, p::consent_purpose, true, 'school_attested', 'v1' from unnest(array['${ASHA}'::uuid, '${BELA}'::uuid, '${CHIRAG}'::uuid, '${DEV}'::uuid]) s, unnest(array['core_records', 'operational_communication']) p;
      insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'asha-family@example.org'), ('${ACCOUNT_2}', 'chirag-family@example.org');
      insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
        ('${CHILD}', '${ACCOUNT}', 'Asha', 6, 'CBSE', 'en', 'en', 'IN-HR'), ('${CHILD_2}', '${ACCOUNT_2}', 'Chirag', 6, 'CBSE', 'en', 'en', 'IN-HR');
      insert into family.school_links (account_id, school_id, parent_id) values ('${ACCOUNT}', '${A}', '${ANITA}'), ('${ACCOUNT_2}', '${A}', '${CHITRA}');
      insert into family.child_links (child_id, link_id, account_id, student_id)
        select '${CHILD}'::uuid, link_id, account_id, '${ASHA}'::uuid from family.school_links where account_id = '${ACCOUNT}'
        union all select '${CHILD_2}'::uuid, link_id, account_id, '${CHIRAG}'::uuid from family.school_links where account_id = '${ACCOUNT_2}';
    `);
    // Chirag's family withdraws consent, as a later decision on the school's ledger.
    await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, p::consent_purpose, false, 'school_attested', 'v1' from unnest(array['core_records', 'operational_communication']) p`, [A, CHIRAG]);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }, 120_000);
  afterAll(async () => {
    await (await import('@/lib/auth/db')).endPool();
    await db?.stop();
  });

  it('a linked, consented family gets the app delivery and the email; an unlinked child and a withdrawn consent get nothing', async () => {
    const noticeId = await written(WORDS);
    expect(await approve(noticeId)).toMatchObject({ ok: true, inApp: 1, byEmail: 2 });
    const log = await logOf(noticeId);
    // In the Family app: Asha only. By email: Asha's guardian and Dev's. Chirag and Bela: nothing on either way.
    expect(log.filter((l: { channel: string }) => l.channel === 'family_app')).toEqual([{ child: 'Asha', channel: 'family_app', status: 'delivered', phone: null }]);
    expect(log.filter((l: { channel: string }) => l.channel === 'email').map((l: { child: string }) => l.child)).toEqual(['Asha', 'Dev']);
    expect(log.some((l: { child: string; channel: string }) => ['Bela', 'Chirag'].includes(l.child) && l.channel !== 'whatsapp')).toBe(false);
    // The email jobs: the school_notice template, the notice's words, signed by the school; addresses as written, in lower case.
    const sent = await emails();
    expect(sent.map((e) => e.to).sort()).toEqual([['anita.guardian@example.org'], ['dina@example.org']]);
    expect(sent.every((e) => e.template === 'school_notice' && e.data.schoolName === 'School A' && e.data.body === WORDS && e.data.className === '6-A')).toBe(true);
    const mail = renderEmail('school_notice', sent[0].data);
    expect(mail.subject).toBe('Notice for 6-A from School A');
    expect(mail.text).toContain(WORDS);
    expect(mail.text).toContain('School A');
    // The school's screen counts them: Family app 1, email 2; WhatsApp counts hold only WhatsApp lines (held by the gate here).
    const [row] = await as(principal, (c) => listNotices(c, A));
    expect(row).toMatchObject({ notice_id: noticeId, status: 'sent', in_app: 1, by_email: 2, delivered: 0 });
  });

  it('where WhatsApp is set up and the message is queued for the guardian, no email goes as well', async () => {
    // Turn the school's WhatsApp on for real sends: not a pilot, a budget, and a template the gate can use.
    await db.pg.query(`update schools set is_pilot = false, pilot_allow_outbound = true, monthly_budget_paise = 100000, quiet_hours_start = '00:00', quiet_hours_end = '00:00' where school_id = $1`, [A]);
    const before = (await emails()).length;
    const noticeId = await written('Second notice.');
    const out = await approve(noticeId, true);
    expect(out).toMatchObject({ ok: true, inApp: 1 });
    // Whatever the gate did with WhatsApp (queued, or held for want of a template here), a guardian whose WhatsApp was queued gets no email.
    const log = await logOf(noticeId);
    const queuedFor = new Set(log.filter((l: { channel: string; status: string }) => l.channel === 'whatsapp' && l.status === 'queued').map((l: { child: string }) => l.child));
    const mailedFor = log.filter((l: { channel: string }) => l.channel === 'email').map((l: { child: string }) => l.child);
    expect(mailedFor.some((c: string) => queuedFor.has(c))).toBe(false);
    expect((await emails()).length - before).toBe(out.ok ? out.byEmail : -1);
  });

  it('after consent is withdrawn, a family gets nothing more: not the app line, not the email, and the app shows no notice', async () => {
    await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, p::consent_purpose, false, 'school_attested', 'v1' from unnest(array['core_records', 'operational_communication']) p`, [A, ASHA]);
    const before = (await emails()).length;
    const noticeId = await written('Third notice.');
    expect(await approve(noticeId)).toMatchObject({ ok: true, inApp: 0, byEmail: 1 });
    expect((await logOf(noticeId)).filter((l: { channel: string; child: string }) => l.channel !== 'whatsapp').map((l: { child: string; channel: string }) => `${l.child}:${l.channel}`)).toEqual(['Dev:email']);
    expect((await emails()).length - before).toBe(1);
    const { activeLinks, schoolNoticesFor } = await import('@/lib/family/school');
    const { withFamilyContext } = await import('@/lib/auth/db');
    const claims = { accountId: ACCOUNT, tokenVersion: 0 };
    const links = await withFamilyContext(claims, (c) => activeLinks(c, ACCOUNT));
    expect(await schoolNoticesFor(claims, links, [])).toEqual([]);
  });

  it('the Family app shows a linked family the school’s name and the notice’s words, and nothing once the parent turns notices off', async () => {
    const { activeLinks, schoolNoticesFor } = await import('@/lib/family/school');
    const { withFamilyContext } = await import('@/lib/auth/db');
    // Dina’s and Asha’s families are not the one that withdrew: a second family (Chirag's) withdrew from the start and sees none.
    const claims2 = { accountId: ACCOUNT_2, tokenVersion: 0 };
    const links2 = await withFamilyContext(claims2, (c) => activeLinks(c, ACCOUNT_2));
    expect(await schoolNoticesFor(claims2, links2, [])).toEqual([]);
    // Asha’s consent is given again: the earlier notices appear, newest first, from "School A", in the notice's own words.
    await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, p::consent_purpose, true, 'school_attested', 'v1' from unnest(array['core_records', 'operational_communication']) p`, [A, ASHA]);
    const claims = { accountId: ACCOUNT, tokenVersion: 0 };
    const links = await withFamilyContext(claims, (c) => activeLinks(c, ACCOUNT));
    const shown = await schoolNoticesFor(claims, links, []);
    expect(shown.map((n) => [n.schoolName, n.body])).toEqual([['School A', 'Third notice.'], ['School A', 'Second notice.'], ['School A', WORDS]]);
    expect(await schoolNoticesFor(claims, links, ['notices'])).toEqual([]);
    // They are items of the notifications centre, school first.
    const items = buildNotifications({ news: null, notices: shown, tonight: [], requests: [] });
    expect(items.map((i) => i.kind)).toEqual(['notice', 'notice', 'notice']);
    expect(items[0]).toMatchObject({ school: 'School A', body: 'Third notice.' });
  });
});
