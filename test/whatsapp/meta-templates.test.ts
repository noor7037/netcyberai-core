import { createHmac } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { applyNotices } from '@/lib/whatsapp/delivery';
import { GRAPH_VERSION, MAX_WORDS_ASKED, MetaWhatsAppProvider, createMetaTemplate, listMetaTemplates, metaTemplateWords, templateCreateBody, wordsForApprovals, type MetaTemplate } from '@/lib/whatsapp/meta';
import { StandInWhatsAppProvider } from '@/lib/whatsapp/provider';
import { templateExample } from '@/lib/whatsapp/template-examples';
import { TEMPLATE_LANGUAGES, TEMPLATE_REGISTRY, applyTemplateStatus, decideTemplate, markWordingReviewed, metaStatusOf, placeholderOrder, raisesToApproved, reconcileWithMeta, recordMetaDecision, recordSubmission, submissionFor, syncTemplates, templateToSend } from '@/lib/whatsapp/templates';

// Our templates at Meta (C345): "Submit to Meta", "Refresh from Meta", and Meta's webhook on a template's review.
// NO NETWORK CALL IS MADE: every answer "from Meta" is in Meta's documented shape, handed in as `fetch`. Every token,
// secret and id is made up for this file, except Meta's id for the attendance template, which is the real one
// (2274559680068398) because the brief requires that template to be matched by it.

const ACCOUNT = { accessToken: 'MADEUPTOKEN_0123456789abcdefghijklmnopqrstuvwxyz_LAST', wabaId: '102290129340398' };
const CONFIG = { accessToken: ACCOUNT.accessToken, appSecret: 'madeupappsecret0123456789abcdef', verifyToken: 'made-up-verify-token-0123456789', phoneNumberId: '106540352242922', wabaId: ACCOUNT.wabaId };
const ATTENDANCE_ID = '2274559680068398';
const ATTENDANCE_AT_META = 'From {{1}}: {{2}} was marked absent on {{3}}. If this is a mistake, or your child is unwell, please tell the school office.';
type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
const recorded = (...answers: ({ ok: boolean; status: number; body: unknown } | Error)[]) => {
  const calls: Call[] = [];
  const fetcher = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null });
    const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (answer instanceof Error) throw answer;
    return { ok: answer.ok, status: answer.status, json: async () => answer.body };
  };
  return { calls, fetcher };
};
const sign = (rawBody: string) => `sha256=${createHmac('sha256', CONFIG.appSecret).update(rawBody).digest('hex')}`;
// Meta's documented webhook for a template's review (webhooks/reference/message_template_status_update).
const reviewed = (id: number | string, event: string, category = 'UTILITY', account = ACCOUNT.wabaId, time = 1751247548) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: account, time, changes: [{ value: { event, message_template_id: id, message_template_name: 'attendance_absence_notification', message_template_language: 'en', reason: 'NONE', message_template_category: category }, field: 'message_template_status_update' }] }],
});
// Meta's notice that a template's words were changed (webhooks/reference/message_template_components_update).
const rewritten = (id: number) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: ACCOUNT.wabaId, time: 1751247548, changes: [{ value: { message_template_id: id, message_template_name: 'attendance_absence_notification', message_template_language: 'en', message_template_element: 'Other words {{1}} here.' }, field: 'message_template_components_update' }] }],
});
const DRAFT = { name: 'attendance_absence_notification', language: 'en' as const, text: ATTENDANCE_AT_META, example: ['Sunrise Public School', 'Aarav', '14-11-2026'] };

describe('Meta’s formats, against Meta’s documented examples', () => {
  it('“Submit to Meta” is the documented request: UTILITY, positional, one example per value, to the business account’s address', async () => {
    expect(templateCreateBody(DRAFT)).toEqual({
      name: 'attendance_absence_notification',
      language: 'en',
      category: 'UTILITY',
      parameter_format: 'positional',
      components: [{ type: 'body', text: ATTENDANCE_AT_META, example: { body_text: [['Sunrise Public School', 'Aarav', '14-11-2026']] } }],
    });
    const meta = recorded({ ok: true, status: 200, body: { id: '594425479261596', status: 'PENDING', category: 'UTILITY' } });
    expect(await createMetaTemplate(ACCOUNT, DRAFT, meta.fetcher)).toEqual({ ok: true, id: '594425479261596', status: 'PENDING', category: 'UTILITY' });
    expect(meta.calls).toEqual([{ url: `https://graph.facebook.com/${GRAPH_VERSION}/${ACCOUNT.wabaId}/message_templates`, method: 'POST', headers: { Authorization: `Bearer ${ACCOUNT.accessToken}`, 'Content-Type': 'application/json' }, body: templateCreateBody(DRAFT) }]);
    expect(JSON.stringify(meta.calls[0].body)).not.toContain(ACCOUNT.accessToken);
  });

  it('Meta’s refusal is said shortly with its code; a dead line, an answer with no id, an account with no business id: nothing recorded, no token said', async () => {
    const refused = recorded({ ok: false, status: 400, body: { error: { message: 'Content in this language already exists', code: 100, error_subcode: 2388024 } } });
    expect(await createMetaTemplate(ACCOUNT, DRAFT, refused.fetcher)).toEqual({ ok: false, message: 'Meta answered 400 (code 100): Content in this language already exists' });
    const down = await createMetaTemplate(ACCOUNT, DRAFT, recorded(new Error(`connect failed with ${ACCOUNT.accessToken}`)).fetcher);
    expect(down).toEqual({ ok: false, message: 'Meta could not be reached (Error)' });
    expect(await createMetaTemplate(ACCOUNT, DRAFT, recorded({ ok: true, status: 200, body: { status: 'PENDING' } }).fetcher)).toEqual({ ok: false, message: 'Meta accepted the request and gave no template id' });
    const none = recorded({ ok: true, status: 200, body: {} });
    expect(await createMetaTemplate({ ...ACCOUNT, wabaId: '' }, DRAFT, none.fetcher)).toEqual({ ok: false, message: 'the saved account has no business account id' });
    expect(await createMetaTemplate({ ...ACCOUNT, wabaId: '../me/accounts' }, DRAFT, none.fetcher)).toMatchObject({ ok: false });
    expect(none.calls).toEqual([]);
  });

  it('“Refresh from Meta” reads every page by Meta’s cursor at our own address, never by an address Meta hands back', async () => {
    const page1 = { data: [{ name: 'attendance_absence_notification', components: [{ type: 'BODY', text: ATTENDANCE_AT_META }], language: 'en', status: 'APPROVED', category: 'UTILITY', id: ATTENDANCE_ID }, { name: 'broken', language: 'en' }], paging: { cursors: { before: 'MAZDZD', after: 'MjQZD' }, next: 'https://elsewhere.example/steal' } };
    const page2 = { data: [{ name: 'hello_world', components: [{ type: 'HEADER', format: 'TEXT', text: 'Hello World' }, { type: 'BODY', text: 'Welcome and congratulations!!' }], language: 'en_US', status: 'APPROVED', category: 'UTILITY', id: '1826444048387598' }], paging: { cursors: { before: 'QVFI', after: 'QVFJ' } } };
    const meta = recorded({ ok: true, status: 200, body: page1 }, { ok: true, status: 200, body: page2 });
    const out = await listMetaTemplates(ACCOUNT, meta.fetcher);
    expect(out).toEqual({
      ok: true,
      templates: [
        { id: ATTENDANCE_ID, name: 'attendance_absence_notification', language: 'en', status: 'APPROVED', category: 'UTILITY', body: ATTENDANCE_AT_META },
        { id: '1826444048387598', name: 'hello_world', language: 'en_US', status: 'APPROVED', category: 'UTILITY', body: 'Welcome and congratulations!!' },
      ],
    });
    const base = `https://graph.facebook.com/${GRAPH_VERSION}/${ACCOUNT.wabaId}/message_templates?fields=id%2Cname%2Clanguage%2Cstatus%2Ccategory%2Ccomponents&limit=100`;
    expect(meta.calls.map((c) => [c.method, c.url])).toEqual([['GET', base], ['GET', `${base}&after=MjQZD`]]);
    expect(meta.calls[0].headers).toEqual({ Authorization: `Bearer ${ACCOUNT.accessToken}`, 'Content-Type': 'application/json' });
    expect(await listMetaTemplates(ACCOUNT, recorded({ ok: false, status: 401, body: { error: { message: 'Invalid OAuth access token.', code: 190 } } }).fetcher)).toEqual({ ok: false, message: 'Meta answered 401 (code 190): Invalid OAuth access token.' });
    // Meta that never stops paging is not followed for ever.
    const endless = recorded({ ok: true, status: 200, body: { data: [], paging: { cursors: { after: 'AGAIN' }, next: 'x' } } });
    expect(await listMetaTemplates(ACCOUNT, endless.fetcher)).toEqual({ ok: false, message: 'Meta holds more than 1000 templates; only that many were read' });
    expect(endless.calls).toHaveLength(10);
  });

  it('Meta’s notice of a template’s review is read only for OUR business account, and only from a signed body', () => {
    const provider = new MetaWhatsAppProvider(CONFIG);
    const ours = JSON.stringify(reviewed(Number(ATTENDANCE_ID), 'APPROVED'));
    expect(provider.readNotice(ours, sign(ours))).toEqual({ ok: true, notices: [{ kind: 'template_status', metaTemplateId: ATTENDANCE_ID, event: 'APPROVED', category: 'UTILITY' }] });
    expect(provider.readNotice(ours, sign(`${ours} `))).toEqual({ ok: false, reason: 'bad_signature' });
    const theirs = JSON.stringify(reviewed(Number(ATTENDANCE_ID), 'APPROVED', 'UTILITY', '999999999999999'));
    expect(provider.readNotice(theirs, sign(theirs))).toEqual({ ok: true, notices: [] });
    // An account saved without its business id hears no template notice at all.
    expect(new MetaWhatsAppProvider({ ...CONFIG, wabaId: undefined }).readNotice(ours, sign(ours))).toEqual({ ok: true, notices: [] });
    const odd = JSON.stringify(reviewed('12ab', 'APPROVED'));
    expect(provider.readNotice(odd, sign(odd))).toEqual({ ok: true, notices: [] });
    // Its words changed at Meta: read as a review that sends it back to pending.
    const changed = JSON.stringify(rewritten(Number(ATTENDANCE_ID)));
    expect(provider.readNotice(changed, sign(changed))).toEqual({ ok: true, notices: [{ kind: 'template_status', metaTemplateId: ATTENDANCE_ID, event: 'COMPONENTS_UPDATE', category: null }] });
    expect(metaStatusOf('COMPONENTS_UPDATE', null, 'utility')).toBe('pending');
  });

  it('before a notice that a template is approved is applied, Meta’s own words for it are read by its id, a few a body, outside any transaction', async () => {
    const meta = recorded({ ok: true, status: 200, body: { components: [{ type: 'HEADER', format: 'TEXT', text: 'x' }, { type: 'BODY', text: ATTENDANCE_AT_META }], id: ATTENDANCE_ID } });
    expect(await metaTemplateWords(ACCOUNT, ATTENDANCE_ID, meta.fetcher)).toBe(ATTENDANCE_AT_META);
    expect(meta.calls).toEqual([{ url: `https://graph.facebook.com/${GRAPH_VERSION}/${ATTENDANCE_ID}?fields=components`, method: 'GET', headers: { Authorization: `Bearer ${ACCOUNT.accessToken}`, 'Content-Type': 'application/json' }, body: null }]);
    const none = recorded({ ok: true, status: 200, body: {} });
    expect(await metaTemplateWords(ACCOUNT, '../me', none.fetcher)).toBeNull();
    expect(none.calls).toEqual([]);
    expect(await metaTemplateWords(ACCOUNT, ATTENDANCE_ID, recorded({ ok: false, status: 400, body: { error: { code: 100 } } }).fetcher)).toBeNull();
    expect(await metaTemplateWords(ACCOUNT, ATTENDANCE_ID, recorded(new Error('down')).fetcher)).toBeNull();
    // Only for a notice that raises a template to approved; moving down needs no words.
    const asked = recorded({ ok: true, status: 200, body: { components: [{ type: 'BODY', text: 'w' }] } });
    const notices = [
      { kind: 'template_status' as const, metaTemplateId: '1', event: 'PAUSED', category: null },
      { kind: 'template_status' as const, metaTemplateId: '2', event: 'APPROVED', category: 'UTILITY' },
      { kind: 'template_status' as const, metaTemplateId: '2', event: 'REINSTATED', category: null },
      ...Array.from({ length: 8 }, (_, i) => ({ kind: 'template_status' as const, metaTemplateId: String(10 + i), event: 'APPROVED', category: 'UTILITY' })),
    ];
    const words = await wordsForApprovals(ACCOUNT, notices, raisesToApproved, asked.fetcher);
    expect([...words.keys()]).toEqual(['2', '10', '11', '12', '13']);
    expect(words.size).toBe(MAX_WORDS_ASKED);
    expect(asked.calls).toHaveLength(MAX_WORDS_ASKED);
  });

  it('Meta’s words for a review, as ours; a template Meta files in another category does not send', () => {
    const cases: [string, string | null, string | null][] = [
      ['APPROVED', 'UTILITY', 'approved'],
      ['REINSTATED', null, 'approved'],
      ['PENDING', 'UTILITY', 'pending'],
      ['IN_APPEAL', 'UTILITY', 'pending'],
      ['REJECTED', 'UTILITY', 'rejected'],
      ['DISABLED', null, 'rejected'],
      ['PENDING_DELETION', null, 'rejected'],
      ['DELETED', null, 'rejected'],
      ['ARCHIVED', null, 'rejected'],
      ['PAUSED', 'UTILITY', 'paused'],
      ['FLAGGED', 'UTILITY', null],
      ['LOCKED', 'UTILITY', null],
      ['LIMIT_EXCEEDED', null, null],
      ['SOMETHING_NEW', null, null],
      ['APPROVED', 'MARKETING', 'rejected'],
      ['PENDING', 'MARKETING', 'pending'],
    ];
    for (const [state, category, ours] of cases) expect(metaStatusOf(state, category, 'utility'), `${state} ${category}`).toBe(ours);
  });

  it('every value of every template has a made-up example for Meta’s reviewers, in its own language', () => {
    for (const d of TEMPLATE_REGISTRY)
      for (const lang of TEMPLATE_LANGUAGES)
        for (const v of placeholderOrder(d.body[lang])) {
          const example = templateExample(d.name, v, lang);
          expect(example, `${d.name} ${lang} ${v}`).toBeTruthy();
          expect(example!.length).toBeLessThanOrEqual(200);
        }
    expect(templateExample('data_check_request', 'details', 'en')).not.toBe(templateExample('event_invitation', 'details', 'en'));
  });
});

const FOUNDER = 'c7000000-0000-4000-8000-0000000000f1';
const A_SCHOOL = 'c7000000-0000-4000-8000-000000000001';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const idOf = async (name: string, language: string, version = 2) =>
  (await db.pg.query(`select id from whatsapp_templates where school_id is null and template_name = $1 and language = $2 and version = $3`, [name, language, version])).rows[0].id as string;
const metaOf = async (name: string, language: string, version = 2) =>
  (await db.pg.query(`select meta_status, meta_template_id, meta_decided_at is not null as decided from whatsapp_templates where school_id is null and template_name = $1 and language = $2 and version = $3`, [name, language, version])).rows[0];
const atMeta = (name: string, language: string, body: string | null, status = 'APPROVED', id = '700000000000001', category: string | null = 'UTILITY'): MetaTemplate => ({ id, name, language, status, category, body });

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`insert into users (user_id, school_id, email, role, display_name) values ('${FOUNDER}', null, 'founder@netcyberai.example', 'super_admin', 'The Founder');`);
    await platform((c) => syncTemplates(c));
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  it('only a version a person approved here, with the code’s words, goes to Meta, once; the words go numbered, with an example for each value', async () => {
    const en = await idOf('fee_receipt', 'en');
    const hi = await idOf('fee_receipt', 'hi');
    expect(await platform((c) => submissionFor(c, en))).toEqual({ ok: false, reason: 'not_approved' });
    expect(await platform((c) => submissionFor(c, 'c7000000-0000-4000-8000-00000000dead'))).toEqual({ ok: false, reason: 'not_found' });
    expect(await platform((c) => decideTemplate(c, { userId: FOUNDER }, en, true))).toEqual({ ok: true });
    expect(await platform((c) => submissionFor(c, en))).toEqual({
      ok: true,
      draft: { name: 'fee_receipt', language: 'en', text: 'From {{1}}: We have received your payment of ₹{{2}}. Your receipt number is {{3}}. Thank you. Please keep this message for your records.', example: ['Sunrise Public School', '4500', 'R-2026-0142'] },
    });
    // Hindi goes only once a reader of Hindi has read it.
    expect(await platform((c) => decideTemplate(c, { userId: FOUNDER }, hi, true))).toEqual({ ok: true });
    expect(await platform((c) => submissionFor(c, hi))).toEqual({ ok: false, reason: 'not_reviewed' });
    expect(await platform((c) => markWordingReviewed(c, { userId: FOUNDER }, hi, 'Read by a Hindi teacher'))).toEqual({ ok: true });
    expect(await platform((c) => submissionFor(c, hi))).toMatchObject({ ok: true, draft: { language: 'hi', text: expect.stringMatching(/^स्कूल \{\{1\}\} की ओर से: /) } });
    // Meta took it: its id and its state so far are recorded, and it cannot go a second time.
    expect(await platform((c) => recordSubmission(c, en, { id: '594425479261596', status: 'PENDING', category: 'UTILITY' }))).toBe('pending');
    expect(await metaOf('fee_receipt', 'en')).toEqual({ meta_status: 'pending', meta_template_id: '594425479261596', decided: true });
    expect(await platform((c) => submissionFor(c, en))).toEqual({ ok: false, reason: 'already' });
    // A second answer for the same version changes nothing: the first id stays.
    await platform((c) => recordSubmission(c, en, { id: '594425479261597', status: 'APPROVED', category: 'UTILITY' }));
    expect((await metaOf('fee_receipt', 'en')).meta_template_id).toBe('594425479261596');
  });

  it('Meta keeps one template per name and language: with another version at Meta, none is sent; a rejected version never goes', async () => {
    const v2 = await idOf('attendance_absence_notification', 'en');
    const v1 = await idOf('attendance_absence_notification', 'en', 1);
    expect(await platform((c) => decideTemplate(c, { userId: FOUNDER }, v2, true))).toEqual({ ok: true });
    expect(await platform((c) => recordMetaDecision(c, v1, { metaStatus: 'pending', metaTemplateId: '700000000000009' }))).toEqual({ ok: true });
    expect(await platform((c) => submissionFor(c, v2))).toEqual({ ok: false, reason: 'other_version' });
    await platform((c) => recordMetaDecision(c, v1, { metaStatus: 'not_submitted', metaTemplateId: '' }));
    expect(await platform((c) => submissionFor(c, v2))).toMatchObject({ ok: true, draft: { text: ATTENDANCE_AT_META, example: ['Sunrise Public School', 'Aarav', '14-11-2026'] } });
    const rejected = await idOf('ptm_booked', 'en');
    expect(await platform((c) => decideTemplate(c, { userId: FOUNDER }, rejected, false))).toEqual({ ok: true });
    expect(await platform((c) => submissionFor(c, rejected))).toEqual({ ok: false, reason: 'not_approved' });
  });

  it('“Refresh from Meta” marks attendance (en) version 2 approved by Meta’s words and id; other words at Meta make nothing approved; another category does not send', async () => {
    // Before: version 1 of attendance is recorded as approved by Meta (by hand), and fee_receipt is with Meta.
    const v1 = await idOf('attendance_absence_notification', 'en', 1);
    await platform((c) => recordMetaDecision(c, v1, { metaStatus: 'approved', metaTemplateId: 'typed-by-hand' }));
    const pulse = await idOf('daily_pulse', 'en');
    const pulseWords = (await db.pg.query(`select body from whatsapp_templates where id = $1`, [pulse])).rows[0].body as string;
    const listed = [
      atMeta('attendance_absence_notification', 'en', ATTENDANCE_AT_META, 'APPROVED', ATTENDANCE_ID),
      atMeta('hello_world', 'en_US', 'Welcome and congratulations!!', 'APPROVED', '1826444048387598'),
      atMeta('fee_receipt', 'en', 'From {{1}}: paid {{2}}, receipt {{3}}, thanks.', 'APPROVED', '594425479261596'),
      atMeta('daily_pulse', 'en', pulseWords.replace('{{school}}', '{{1}}').replace('{{update}}', '{{2}}'), 'APPROVED', '700000000000002', 'MARKETING'),
      atMeta('not_ours_at_all', 'en', 'Something else {{1}} here.'),
    ];
    const out = await platform((c) => reconcileWithMeta(c, listed));
    expect(out).toEqual({ found: 2, changed: 4, otherWords: ['fee_receipt (en)'] });
    expect(await metaOf('attendance_absence_notification', 'en')).toEqual({ meta_status: 'approved', meta_template_id: ATTENDANCE_ID, decided: true });
    // Meta would send version 1 with version 2's words: version 1 no longer counts as approved by Meta.
    expect(await metaOf('attendance_absence_notification', 'en', 1)).toMatchObject({ meta_status: 'not_submitted', meta_template_id: null });
    // Meta holds words for fee_receipt that are not ours: no version of it counts as approved by Meta.
    expect(await metaOf('fee_receipt', 'en')).toMatchObject({ meta_status: 'not_submitted', meta_template_id: null });
    // Meta filed the Pulse as marketing: it does not send as utility.
    expect(await metaOf('daily_pulse', 'en')).toMatchObject({ meta_status: 'rejected', meta_template_id: '700000000000002' });
    // The real account now sends attendance version 2, the one with Meta's words.
    expect((await platform((c) => templateToSend(c, A_SCHOOL, 'attendance_absence_notification', 'en', true)))?.version).toBe(2);
    expect(await platform((c) => templateToSend(c, A_SCHOOL, 'fee_receipt', 'en', true))).toBeNull();
    // The same answer again changes nothing.
    expect(await platform((c) => reconcileWithMeta(c, listed))).toEqual({ found: 2, changed: 0, otherWords: ['fee_receipt (en)'] });
  });

  it('Meta’s webhook moves a template’s review by Meta’s id: down as said; up to approved only when Meta’s words are ours; an id none of ours holds, and the stand-in, change nothing', async () => {
    const provider = new MetaWhatsAppProvider(CONFIG);
    const say = async (body: unknown, words?: Map<string, string | null>) => {
      const raw = JSON.stringify(body);
      return platform((c) => applyNotices(c, provider, raw, sign(raw), undefined, words));
    };
    const ours = new Map([[ATTENDANCE_ID, ATTENDANCE_AT_META]]);
    expect(await say(reviewed(Number(ATTENDANCE_ID), 'PAUSED'))).toMatchObject({ status: 200, applied: 1 });
    expect((await metaOf('attendance_absence_notification', 'en')).meta_status).toBe('paused');
    expect(await platform((c) => templateToSend(c, A_SCHOOL, 'attendance_absence_notification', 'en', true))).toBeNull();
    expect(await say(reviewed(Number(ATTENDANCE_ID), 'FLAGGED'))).toMatchObject({ status: 200, applied: 0, stale: 1 });
    // Reinstated, but Meta's words could not be read: it stays paused.
    expect(await say(reviewed(Number(ATTENDANCE_ID), 'REINSTATED'))).toMatchObject({ status: 200, applied: 0, stale: 1 });
    expect((await metaOf('attendance_absence_notification', 'en')).meta_status).toBe('paused');
    expect(await say(reviewed(Number(ATTENDANCE_ID), 'REINSTATED', 'UTILITY', ACCOUNT.wabaId, 1751247549), new Map([[ATTENDANCE_ID, null]]))).toMatchObject({ applied: 0, stale: 1 });
    // With Meta's words, and they are ours: approved again.
    expect(await say(reviewed(Number(ATTENDANCE_ID), 'REINSTATED', 'UTILITY', ACCOUNT.wabaId, 1751247550), ours)).toMatchObject({ status: 200, applied: 1 });
    expect((await metaOf('attendance_absence_notification', 'en')).meta_status).toBe('approved');
    // Someone changes its words at Meta: it waits as pending; Meta approves the OTHER words under the same id: this
    // version no longer holds Meta's id, and the real account does not send it.
    expect(await say(rewritten(Number(ATTENDANCE_ID)))).toMatchObject({ status: 200, applied: 1 });
    expect((await metaOf('attendance_absence_notification', 'en')).meta_status).toBe('pending');
    expect(await say(reviewed(Number(ATTENDANCE_ID), 'APPROVED', 'UTILITY'), new Map([[ATTENDANCE_ID, 'From {{1}}: {{2}} was absent on {{3}}. Click https://elsewhere.example now.']]))).toMatchObject({ status: 200, applied: 1 });
    expect(await metaOf('attendance_absence_notification', 'en')).toMatchObject({ meta_status: 'not_submitted', meta_template_id: null });
    expect(await platform((c) => templateToSend(c, A_SCHOOL, 'attendance_absence_notification', 'en', true))).toBeNull();
    // "Refresh from Meta" puts it back only when Meta's words are ours again.
    await platform((c) => reconcileWithMeta(c, [atMeta('attendance_absence_notification', 'en', ATTENDANCE_AT_META, 'APPROVED', ATTENDANCE_ID)]));
    expect((await metaOf('attendance_absence_notification', 'en')).meta_status).toBe('approved');
    expect(await say(reviewed(123456789, 'APPROVED'), new Map([['123456789', ATTENDANCE_AT_META]]))).toMatchObject({ status: 200, applied: 0, unknown: 1 });
    // The notice is kept as what it did, once: the same body again changes nothing.
    expect(await say(reviewed(123456789, 'APPROVED'))).toMatchObject({ status: 200, duplicate: true });
    const kept = (await db.pg.query(`select payload from webhook_events where signature_ok and payload::text like '%template_status%' order by created_at`)).rows.map((r: { payload: { notices: unknown[] } }) => r.payload.notices[0]);
    expect(kept[0]).toEqual({ kind: 'template_status', id: ATTENDANCE_ID, event: 'PAUSED', category: 'UTILITY' });
    // Only Meta's own notices speak of Meta's review: the stand-in's reading never yields one, and applying one from it is ignored.
    expect(await platform((c) => applyTemplateStatus(c, { metaTemplateId: '999', event: 'APPROVED', category: 'UTILITY' }))).toBe('unknown');
    const standIn = new StandInWhatsAppProvider({ secret: 'a-secret-for-this-test-only-0123456789abcdef' });
    const raw = JSON.stringify(reviewed(Number(ATTENDANCE_ID), 'PAUSED'));
    expect(await platform((c) => applyNotices(c, standIn, raw, null))).toMatchObject({ status: 401 });
    expect((await metaOf('attendance_absence_notification', 'en')).meta_status).toBe('approved');
  });
});
