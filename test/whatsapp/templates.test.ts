import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { ALL_CONSENT_PURPOSES } from '@/lib/consent/gate';
import { languageFor, sendWhatsAppMessage } from '@/lib/whatsapp/gate';
import { StandInWhatsAppProvider, type WhatsAppProvider } from '@/lib/whatsapp/provider';
import { SCHOOL_PREFIX, TEMPLATE_LANGUAGES, TEMPLATE_REGISTRY, decideTemplate, definitionProblem, listTemplates, markWordingReviewed, recordMetaDecision, renderTemplate, syncTemplates, templateToSend, variablesIn } from '@/lib/whatsapp/templates';

// Templates with versions and two approvals (docs/25 slice 7c, C184).

describe('the templates written in the code', () => {
  it('EVERY template’s first line names the school, in every language: one number serves every school (C183)', () => {
    expect(TEMPLATE_REGISTRY.length).toBeGreaterThan(0);
    for (const d of TEMPLATE_REGISTRY)
      for (const lang of TEMPLATE_LANGUAGES) {
        expect(d.body[lang].startsWith('{{school}}: '), `${d.name} v${d.version} ${lang}`).toBe(true);
        expect(d.body[lang].split('\n')[0]).toContain('{{school}}');
        expect(renderTemplate(d.body[lang], { ...Object.fromEntries(d.variables.map((v) => [v, 'x'])), school: 'Asha Public School' }).startsWith('Asha Public School: '), `${d.name} ${lang}`).toBe(true);
      }
    expect(SCHOOL_PREFIX).toBe('{{school}}: ');
  });

  it('every definition is whole: its variables are exactly those its words use, in both languages; a known purpose; Hindi is Hindi', () => {
    for (const d of TEMPLATE_REGISTRY) {
      expect(definitionProblem(d), `${d.name} v${d.version}`).toBeNull();
      expect(ALL_CONSENT_PURPOSES).toContain(d.purpose);
      expect(d.staleAfterMinutes).toBeGreaterThan(0);
      expect(d.body.hi).toMatch(/[ऀ-ॿ]/);
      expect(d.body.hi).not.toBe(d.body.en);
    }
    const keys = TEMPLATE_REGISTRY.map((d) => `${d.name}:${d.version}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('a definition that does not name the school first, or whose words and variables disagree, is refused', () => {
    const good = TEMPLATE_REGISTRY[0];
    expect(definitionProblem({ ...good, body: { ...good.body, en: 'Dear parent, {{school}} says {{child}} was absent on {{date}}.' } })).toMatch(/does not begin with the school/);
    expect(definitionProblem({ ...good, body: { ...good.body, hi: good.body.hi.replace('{{date}}', '') } })).toMatch(/hi body uses/);
    expect(definitionProblem({ ...good, variables: ['child', 'date'] })).toMatch(/school is not among/);
    expect(definitionProblem({ ...good, body: { ...good.body, en: `${good.body.en} {{oops` } })).toMatch(/malformed/);
  });

  it('a value can never bring in a variable of its own', () => {
    expect(renderTemplate('{{school}}: {{child}} was absent.', { school: 'A School', child: '{{school}} {{pay_link}}' })).toBe('A School: school pay_link was absent.');
    expect(variablesIn('{{school}}: {{a}} {{a}} {{b_2}}')).toEqual(['school', 'a', 'b_2']);
  });
});

const LIVE = 'c3000000-0000-4000-8000-000000000001';
const OTHER = 'c3000000-0000-4000-8000-000000000002';
const FOUNDER = 'c3000000-0000-4000-8000-0000000000f1';
const STUDENT = 'c3500000-0000-4000-8000-000000000001';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asSchool = <T>(fn: (client: any) => Promise<T>, school = LIVE): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    await tx.query(`select set_config('app.current_tenant_id', '${school}', true)`);
    await tx.query(`select set_config('app.current_role', 'principal', true)`);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const counting = (name: 'stand-in' | 'meta') => {
  const sent: { params: Record<string, string>; version?: number; language?: string }[] = [];
  const provider: WhatsAppProvider = {
    name,
    send: async (p) => (sent.push({ params: p.templateParams, version: p.templateVersion, language: p.language }), { success: true, providerMessageId: `${name}-${sent.length}-${Math.random().toString(36).slice(2)}`, errorMessage: null, raw: null }),
    sendText: async () => ({ success: false, providerMessageId: null, errorMessage: 'not used in this test', raw: null }),
    sendChoice: async () => ({ success: false, providerMessageId: null, errorMessage: 'not used in this test', raw: null }),
    testConnection: async () => ({ ok: true, message: 'made up' }),
    readNotice: () => ({ ok: false, reason: 'no_secret' }),
  };
  return { provider, sent };
};
let n = 0;
const send = (over: { params?: Record<string, string>; language?: 'en' | 'hi'; provider?: WhatsAppProvider; template?: string } = {}) =>
  asSchool((c) => sendWhatsAppMessage(c, { schoolId: LIVE, studentId: STUDENT, purpose: 'operational_communication', toPhone: '+910000000011', templateName: over.template ?? 'attendance_absence_notification', templateParams: over.params ?? { child: 'Asha', date: '01-04-2099' }, dedupeKey: `tpl-${++n}`, language: over.language }, { platformDefaultProvider: over.provider ?? new StandInWhatsAppProvider({ secret: '' }) }));
const logged = async (logId: string) => (await db.pg.query(`select status::text as status, reason, template_version as version, language, template_params as params from communication_log where log_id = $1`, [logId])).rows[0];
const idOf = async (name: string, language: string, version = 1) => (await db.pg.query(`select id from whatsapp_templates where school_id is null and template_name = $1 and language = $2 and version = $3`, [name, language, version])).rows[0].id as string;
const refused = (run: () => Promise<unknown>) => run().then(() => 'allowed', (e: Error) => e.message);

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end) values
        ('${LIVE}', 'Asha Public School', 'IN-HR', false, false, true, 100000, '00:00', '00:00'), ('${OTHER}', 'Another School', 'IN-HR', false, false, true, 100000, '00:00', '00:00');
      insert into users (user_id, school_id, email, role, display_name) values ('${FOUNDER}', null, 'founder@netcyberai.example', 'super_admin', 'The Founder');
      insert into students (student_id, school_id, admission_no, name, status) values ('${STUDENT}', '${LIVE}', 'A-1', 'Asha Example', 'active');
      insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select '${LIVE}', '${STUDENT}', 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1';
      insert into message_rate_table (channel, billing_category, rate_paise, gst_percent, verified_source, verified_at, effective_from) values ('whatsapp', 'utility', 1000, 18, 'TEST VALUE, not a real rate', now(), current_date - 30);
    `);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('the row from before versions has no words; bringing in the code’s versions gives it its words once and adds the rest, waiting for approval', async () => {
    const before = await platform((c) => listTemplates(c));
    expect(before).toEqual([expect.objectContaining({ name: 'attendance_absence_notification', version: 1, language: 'en', body: null, status: 'approved' })]);
    const first = await platform((c) => syncTemplates(c));
    expect(first).toEqual({ added: TEMPLATE_REGISTRY.length * 2 - 1, filled: 1 });
    expect(await platform((c) => syncTemplates(c))).toEqual({ added: 0, filled: 0 });
    const rows = await platform((c) => listTemplates(c));
    expect(rows).toHaveLength(TEMPLATE_REGISTRY.length * 2);
    expect(rows.every((r) => r.inCode && r.body?.startsWith('{{school}}: '))).toBe(true);
    // The old approval was of a name, not of words: every version now waits for a person, and nothing sends.
    expect(rows.every((r) => r.status === 'pending' && r.metaStatus === 'not_submitted' && !r.sendsNow)).toBe(true);
    expect((await send()).status).toBe('blocked_no_template');
    const english = await idOf('attendance_absence_notification', 'en');
    expect(await platform((c) => decideTemplate(c, { userId: FOUNDER }, english, true))).toEqual({ ok: true });
    expect((await send()).status).toBe('sent');
  });

  it('a send carries the school’s own name first, whatever the caller passes, and the log keeps the version, the language and the values', async () => {
    const standIn = counting('stand-in');
    const out = await send({ provider: standIn.provider, params: { child: 'Asha', date: '01-04-2099', school: 'Some Other School' } });
    expect(out.status).toBe('sent');
    expect(standIn.sent).toEqual([{ params: { school: 'Asha Public School', child: 'Asha', date: '01-04-2099' }, version: 1, language: 'en' }]);
    expect(await logged(out.logId)).toEqual({ status: 'sent', reason: null, version: 1, language: 'en', params: { school: 'Asha Public School', child: 'Asha', date: '01-04-2099' } });
  });

  it('a missing variable refuses the send before the provider is called', async () => {
    const standIn = counting('stand-in');
    const out = await send({ provider: standIn.provider, params: { child: 'Asha' } });
    expect(out).toMatchObject({ status: 'blocked_no_template', reason: 'template "attendance_absence_notification" needs a value for: date' });
    expect((await send({ provider: standIn.provider, params: { child: '  ', date: '01-04-2099' } })).status).toBe('blocked_no_template');
    expect(standIn.sent).toEqual([]);
  });

  it('a version does not send until a person approves its words; Hindi falls back to English until Hindi is approved', async () => {
    const standIn = counting('stand-in');
    expect((await send({ provider: standIn.provider, template: 'fee_receipt', params: { amount: '500.00', receipt_no: 'RCP-1' } })).status).toBe('blocked_no_template');
    expect((await send({ provider: standIn.provider, language: 'hi' })).status).toBe('sent');
    expect(standIn.sent.at(-1)).toMatchObject({ language: 'en' });
    const hindi = await idOf('attendance_absence_notification', 'hi');
    expect(await platform((c) => decideTemplate(c, { userId: FOUNDER }, hindi, true))).toEqual({ ok: true });
    // Approved, but nobody who reads Hindi has reviewed the words: still English (C190).
    expect((await send({ provider: standIn.provider, language: 'hi' })).status).toBe('sent');
    expect(standIn.sent.at(-1)).toMatchObject({ language: 'en' });
    expect(await platform((c) => markWordingReviewed(c, { userId: FOUNDER }, hindi, '  '))).toEqual({ ok: false, reason: 'note' });
    const english = await idOf('attendance_absence_notification', 'en');
    expect(await platform((c) => markWordingReviewed(c, { userId: FOUNDER }, english, 'x'))).toEqual({ ok: false, reason: 'english' });
    expect(await platform((c) => markWordingReviewed(c, { userId: FOUNDER }, hindi, 'Read by a Hindi teacher at the pilot school, 14 October'))).toEqual({ ok: true });
    expect((await send({ provider: standIn.provider, language: 'hi' })).status).toBe('sent');
    expect(standIn.sent.at(-1)).toMatchObject({ language: 'hi', version: 1 });
    // The guardian's own language, then the school's default, then English.
    await db.pg.query(`insert into parents (parent_id, school_id, name, phone, preferred_language) values ('c3700000-0000-4000-8000-000000000001', $1, 'A Guardian', '+910000000011', 'hi'), ('c3700000-0000-4000-8000-000000000002', $1, 'Another', '+910000000012', null)`, [LIVE]);
    expect(await asSchool((c) => languageFor(c, LIVE, 'c3700000-0000-4000-8000-000000000001'))).toBe('hi');
    expect(await asSchool((c) => languageFor(c, LIVE, 'c3700000-0000-4000-8000-000000000002'))).toBe('en');
    await db.pg.query(`insert into school_settings (school_id, module_id, setting_values, schema_version, updated_by) values ($1, 'setup', '{"parent_language": "hi"}', 2, $2)`, [LIVE, FOUNDER]);
    expect(await asSchool((c) => languageFor(c, LIVE, 'c3700000-0000-4000-8000-000000000002'))).toBe('hi');
    expect(await asSchool((c) => languageFor(c, LIVE, null))).toBe('hi');
    await db.pg.query(`update parents set preferred_language = 'en' where parent_id = 'c3700000-0000-4000-8000-000000000002'`);
    expect(await asSchool((c) => languageFor(c, LIVE, 'c3700000-0000-4000-8000-000000000002'))).toBe('en');
    await db.pg.query(`delete from school_settings where school_id = $1 and module_id = 'setup'`, [LIVE]);
    const hi = (await platform((c) => listTemplates(c))).find((r) => r.name === 'attendance_absence_notification' && r.language === 'hi');
    expect(hi).toMatchObject({ status: 'approved', approvedByName: 'The Founder', sendsNow: true, wordingReviewed: true, wordingReviewedNote: 'Read by a Hindi teacher at the pilot school, 14 October' });
  });

  it('a real account sends only a version Meta has approved too; the stand-in needs only ours', async () => {
    const real = counting('meta');
    expect(await send({ provider: real.provider })).toMatchObject({ status: 'blocked_no_template', reason: expect.stringContaining('no version approved by Meta') });
    expect(real.sent).toEqual([]);
    const id = await idOf('attendance_absence_notification', 'en');
    expect(await platform((c) => recordMetaDecision(c, id, { metaStatus: 'approved', metaTemplateId: '' }))).toEqual({ ok: false, reason: 'meta_id' });
    expect(await platform((c) => recordMetaDecision(c, id, { metaStatus: 'maybe', metaTemplateId: 'x' }))).toEqual({ ok: false, reason: 'meta_status' });
    expect(await platform((c) => recordMetaDecision(c, id, { metaStatus: 'pending', metaTemplateId: 'made-up-meta-id' }))).toEqual({ ok: true });
    expect((await send({ provider: real.provider })).status).toBe('blocked_no_template');
    expect(await platform((c) => recordMetaDecision(c, id, { metaStatus: 'approved', metaTemplateId: 'made-up-meta-id' }))).toEqual({ ok: true });
    expect((await send({ provider: real.provider })).status).toBe('sent');
    expect(real.sent).toHaveLength(1);
    // Meta pauses it: the real account stops, at once.
    await platform((c) => recordMetaDecision(c, id, { metaStatus: 'paused', metaTemplateId: 'made-up-meta-id' }));
    expect((await send({ provider: real.provider })).status).toBe('blocked_no_template');
  });

  it('a send uses the newest version approved; a newer one waits until it is approved, and a rejected one never sends', async () => {
    const standIn = counting('stand-in');
    await db.pg.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status) values (null, 'attendance_absence_notification', 2, 'en', '{{school}}: {{child}} was not at school on {{date}}.', '{school,child,date}', 'utility', 600, 'pending')`);
    await send({ provider: standIn.provider });
    expect(standIn.sent.at(-1)).toMatchObject({ version: 1 });
    // Words that are not the code's cannot be approved from Control.
    const v2 = await idOf('attendance_absence_notification', 'en', 2);
    expect(await platform((c) => decideTemplate(c, { userId: FOUNDER }, v2, true))).toEqual({ ok: false, reason: 'not_in_code' });
    await db.pg.query(`update whatsapp_templates set status = 'approved' where id = $1`, [v2]);
    await send({ provider: standIn.provider });
    expect(standIn.sent.at(-1)).toMatchObject({ version: 2 });
    expect(await platform((c) => decideTemplate(c, { userId: FOUNDER }, v2, false))).toEqual({ ok: true });
    await send({ provider: standIn.provider });
    expect(standIn.sent.at(-1)).toMatchObject({ version: 1 });
    expect((await asSchool((c) => templateToSend(c, LIVE, 'attendance_absence_notification', 'en', false)))?.version).toBe(1);
  });

  it('the database: words never change, every body names the school first, and a version is unique', async () => {
    const id = await idOf('fee_receipt', 'en');
    expect(await refused(() => platform((c) => c.query(`update whatsapp_templates set body = '{{school}}: other words {{amount}} {{receipt_no}}' where id = $1`, [id])))).toMatch(/never change/);
    expect(await refused(() => platform((c) => c.query(`update whatsapp_templates set variables = '{school}' where id = $1`, [id])))).toMatch(/never change/);
    expect(await refused(() => platform((c) => c.query(`update whatsapp_templates set version = 9 where id = $1`, [id])))).toMatch(/write a new version/);
    const insert = (body: string, variables: string, version = 7) => refused(() => platform((c) => c.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables) values (null, 'made_up', $3, 'en', $1, $2)`, [body, variables, version])));
    expect(await insert('Dear parent, your fees are due at {{school}}.', '{school}')).toMatch(/first_line_names_school/);
    expect(await insert('{{school}}: fees are due.', '{}')).toMatch(/first_line_names_school/);
    expect(await insert('{{school}}: fees are due.', '{school}')).toBe('allowed');
    expect(await insert('{{school}}: fees are due, again.', '{school}')).toMatch(/duplicate key/);
    // A school cannot write a platform template, nor one for another school.
    expect(await refused(() => asSchool((c) => c.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, status) values (null, 'theirs', 1, 'en', '{{school}}: hello', '{school}', 'approved')`)))).toMatch(/row-level security/);
    expect(await refused(() => asSchool((c) => c.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, status) values ('${OTHER}', 'theirs', 1, 'en', '{{school}}: hello', '{school}', 'approved')`)))).toMatch(/row-level security/);
    // What a message said is fixed with the message, even for the platform (a school's own session changes no message row, C210).
    const out = await send();
    expect(await refused(() => platform((c) => c.query(`update communication_log set template_params = '{"school": "x"}' where log_id = $1`, [out.logId])))).toMatch(/never changes/);
    expect(await refused(() => platform((c) => c.query(`update communication_log set template_version = 3 where log_id = $1`, [out.logId])))).toMatch(/never changes/);
  });
});
