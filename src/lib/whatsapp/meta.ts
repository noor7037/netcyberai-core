import { createHmac, timingSafeEqual } from 'crypto';
import type { NoticeRead, WhatsAppChoiceParams, WhatsAppNotice, WhatsAppProvider, WhatsAppSendParams, WhatsAppSendResult, WhatsAppTextParams } from './provider';

// Meta's WhatsApp Cloud API (docs/25 slice 7e, C186). Built from Meta's own
// documentation as it read on 2026-10-13, and DORMANT: it is used only when
// the platform's credentials are saved, tested and switched on in Control.
// Nothing here is called from anywhere but the send-gate and the webhook.
//
// The formats, and where each is documented:
//   Send a template   POST https://graph.facebook.com/{version}/{phone-number-id}/messages, bearer token; body
//                     { messaging_product, recipient_type, to, type: "template", template: { name, language:
//                     { code }, components: [{ type: "body", parameters: [{ type: "text", text }, ...] }] } }
//                     Our templates are POSITIONAL (C345): the values go in the order the words name them, {{1}} first.
//                     Answer: { messaging_product, contacts: [{ input, wa_id }], messages: [{ id, message_status }] }
//     https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
//     https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview
//   Send free text    The same address; body { messaging_product, recipient_type, to, type: "text", text: { preview_url, body } }, body up to 4096 characters.
//     https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/text-messages
//   Quick replies     The same address; { type: "interactive", interactive: { type: "button", body: { text }, action: { buttons: [{ type: "reply",
//                     reply: { id, title } }] } } }: at most 3 buttons, a title of at most 20 characters. The answer arrives as
//                     messages[]: { type: "interactive", interactive: { type: "button_reply", button_reply: { id, title } } }
//     https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-reply-buttons-messages
//   The webhook       First check: GET with hub.mode=subscribe, hub.verify_token, hub.challenge; answer the challenge.
//                     Every notice: header X-Hub-Signature-256 = "sha256=" + HMAC-SHA256 of the raw body with the App Secret.
//     https://developers.facebook.com/docs/graph-api/webhooks/getting-started
//   Status notices    entry[].changes[].value.statuses[]: { id, status: sent|delivered|read|failed|played, timestamp
//                     (Unix seconds), recipient_id, errors: [{ code, title, message, error_data: { details } }] }
//     https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/status
//   A parent's text   entry[].changes[].value.messages[]: { from, id, timestamp, type: "text", text: { body } }
//     https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/text
//   The number        GET https://graph.facebook.com/{version}/{phone-number-id} → { verified_name, display_phone_number, quality_rating, id }
//     https://developers.facebook.com/docs/whatsapp/cloud-api/reference/phone-numbers
//   Make a template   POST https://graph.facebook.com/{version}/{waba-id}/message_templates, bearer token; body { name, language,
//                     category, parameter_format: "positional", components: [{ type: "body", text, example: { body_text: [[...]] } }] }
//                     Answer: { id, status, category }
//   The templates     GET the same address ?fields=id,name,language,status,category,components&limit=100[&after=cursor]
//                     Answer: { data: [{ id, name, language, status, category, components: [{ type: "BODY", text }] }], paging: { cursors: { after }, next } }
//     https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/message_templates/
//     https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
//   A review moved    entry[].id is the business account; entry[].changes[] with field "message_template_status_update",
//                     value { event, message_template_id (a number), message_template_name, message_template_language,
//                     reason, message_template_category }
//     https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/message_template_status_update
//   Words changed     the same, with field "message_template_components_update", value { message_template_id, ... }
//   One template      GET https://graph.facebook.com/{version}/{template-id}?fields=components → { components: [{ type: "BODY", text }], id }
//
// No network call is made in any test: `fetch` is handed in, and the tests hand in recorded answers.

export const GRAPH_VERSION = 'v23.0';
export const GRAPH_HOST = 'https://graph.facebook.com';
export const META_SIGNATURE_HEADER = 'x-hub-signature-256';
// `wabaId`: the business account the number is on. Meta's notices about our templates name it, not the number.
export type MetaConfig = { accessToken: string; appSecret: string; verifyToken: string; phoneNumberId: string; wabaId?: string };
type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
const TIMEOUT_MS = 10_000;

// Meta's language codes for the two languages we write in.
const LANGUAGE_CODE = { en: 'en', hi: 'hi' } as const;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, max = 300): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
// Meta's own error, said shortly: its code and message. Never the request, which carries the token.
const errorOf = (body: unknown, status: number): string => {
  const e = obj(obj(body).error);
  return `Meta answered ${status}${typeof e.code === 'number' ? ` (code ${e.code})` : ''}${str(e.message, 200) ? `: ${str(e.message, 200)}` : ''}`.slice(0, 200);
};

// The body of a template send, exactly as documented. Exported so the tests can hold it against Meta's example.
// The values go by position, in the order the template's words name them (C345); a send that does not say the
// order (only a test's) keeps the order of its values.
export function templateSendBody(p: WhatsAppSendParams): Record<string, unknown> {
  const order = p.templateOrder ?? Object.keys(p.templateParams);
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: p.toPhone,
    type: 'template',
    template: {
      name: p.templateName,
      language: { code: LANGUAGE_CODE[p.language ?? 'en'] },
      components: [{ type: 'body', parameters: order.map((name) => ({ type: 'text', text: p.templateParams[name] ?? '' })) }],
    },
  };
}

// The body of a free-text send, exactly as documented.
export function textSendBody(p: WhatsAppTextParams): Record<string, unknown> {
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to: p.toPhone, type: 'text', text: { preview_url: false, body: p.text } };
}

// A question with quick replies, exactly as documented: at most three, each title at most 20 characters.
export function choiceSendBody(p: WhatsAppChoiceParams): Record<string, unknown> {
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to: p.toPhone, type: 'interactive', interactive: { type: 'button', body: { text: p.text }, action: { buttons: p.choices.map((c) => ({ type: 'reply', reply: { id: c.id, title: c.title } })) } } };
}

// --- Our templates at Meta (C345): made from Control, and read back --------------------------------------------------

export type MetaTemplateAccount = { accessToken: string; wabaId: string };
// One template as Meta holds it. `body`: the words of its body, numbered as Meta numbers them.
export type MetaTemplate = { id: string; name: string; language: string; status: string; category: string | null; body: string | null };
// What we ask Meta to review: the words numbered by position, and one made-up value for each, in the same order.
export type MetaTemplateDraft = { name: string; language: 'en' | 'hi'; text: string; example: string[] };
export type MetaTemplateMade = { ok: true; id: string; status: string; category: string | null } | { ok: false; message: string };
export const MAX_TEMPLATE_PAGES = 10;
const WABA_ID = /^[0-9]{5,30}$/;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const unreachable = (err: unknown) => `Meta could not be reached (${err instanceof Error ? err.name : 'error'})`;

// The body of a request to make a template, exactly as documented: always UTILITY, always positional.
export function templateCreateBody(d: MetaTemplateDraft): Record<string, unknown> {
  return { name: d.name, language: LANGUAGE_CODE[d.language], category: 'UTILITY', parameter_format: 'positional', components: [{ type: 'body', text: d.text, ...(d.example.length ? { example: { body_text: [d.example] } } : {}) }] };
}

// Ask Meta to review one template. Its answer: Meta's id for it, and its state and category so far.
export async function createMetaTemplate(account: MetaTemplateAccount, draft: MetaTemplateDraft, fetcher: Fetch = fetch as unknown as Fetch): Promise<MetaTemplateMade> {
  if (!WABA_ID.test(account.wabaId)) return { ok: false, message: 'the saved account has no business account id' };
  try {
    const res = await fetcher(`${GRAPH_HOST}/${GRAPH_VERSION}/${account.wabaId}/message_templates`, { method: 'POST', headers: bearer(account.accessToken), body: JSON.stringify(templateCreateBody(draft)), signal: AbortSignal.timeout(TIMEOUT_MS) });
    const answer = await res.json().catch(() => null);
    const id = str(obj(answer).id, 40);
    if (!res.ok || !id || !/^[0-9]+$/.test(id)) return { ok: false, message: res.ok ? 'Meta accepted the request and gave no template id' : errorOf(answer, res.status) };
    return { ok: true, id, status: str(obj(answer).status, 40) ?? 'PENDING', category: str(obj(answer).category, 40) };
  } catch (err) {
    return { ok: false, message: unreachable(err) };
  }
}

// Every template on the account, page by page (at most MAX_TEMPLATE_PAGES pages of 100). The next page is asked for
// by Meta's cursor at our own address, never by following an address from the answer.
export async function listMetaTemplates(account: MetaTemplateAccount, fetcher: Fetch = fetch as unknown as Fetch): Promise<{ ok: true; templates: MetaTemplate[] } | { ok: false; message: string }> {
  if (!WABA_ID.test(account.wabaId)) return { ok: false, message: 'the saved account has no business account id' };
  const templates: MetaTemplate[] = [];
  let after: string | null = null;
  try {
    for (let page = 0; page < MAX_TEMPLATE_PAGES; page++) {
      const q = new URLSearchParams({ fields: 'id,name,language,status,category,components', limit: '100', ...(after ? { after } : {}) });
      const res = await fetcher(`${GRAPH_HOST}/${GRAPH_VERSION}/${account.wabaId}/message_templates?${q}`, { method: 'GET', headers: bearer(account.accessToken), signal: AbortSignal.timeout(TIMEOUT_MS) });
      const answer = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, message: errorOf(answer, res.status) };
      for (const t of arr(obj(answer).data).map(obj)) {
        const id = str(t.id, 40);
        const name = str(t.name, 512);
        const language = str(t.language, 20);
        const status = str(t.status, 40);
        if (!id || !/^[0-9]+$/.test(id) || !name || !language || !status) continue;
        const body = arr(t.components).map(obj).find((c) => typeof c.type === 'string' && c.type.toUpperCase() === 'BODY');
        templates.push({ id, name, language, status, category: str(t.category, 40), body: body ? str(body.text, 1024) : null });
      }
      const paging = obj(obj(answer).paging);
      after = paging.next ? str(obj(paging.cursors).after, 500) : null;
      if (!after) return { ok: true, templates };
    }
  } catch (err) {
    return { ok: false, message: unreachable(err) };
  }
  return { ok: false, message: `Meta holds more than ${MAX_TEMPLATE_PAGES * 100} templates; only that many were read` };
}

// One template's words at Meta, by Meta's id: the body as Meta numbers it; null when Meta does not say (C345, review).
// Meta keeps a template's id when its words are changed, so a notice that it is approved is believed only with these.
export async function metaTemplateWords(account: Pick<MetaTemplateAccount, 'accessToken'>, id: string, fetcher: Fetch = fetch as unknown as Fetch): Promise<string | null> {
  if (!/^[0-9]{1,30}$/.test(id)) return null;
  try {
    const res = await fetcher(`${GRAPH_HOST}/${GRAPH_VERSION}/${id}?fields=components`, { method: 'GET', headers: bearer(account.accessToken), signal: AbortSignal.timeout(TIMEOUT_MS) });
    const answer = obj(await res.json().catch(() => null));
    if (!res.ok) return null;
    const body = arr(answer.components).map(obj).find((c) => typeof c.type === 'string' && c.type.toUpperCase() === 'BODY');
    return body ? str(body.text, 1024) : null;
  } catch {
    return null;
  }
}

export const MAX_WORDS_ASKED = 5;
// Before a webhook body is applied, and outside any transaction: Meta's words for each template it says is approved
// (at most MAX_WORDS_ASKED a body). A template it says anything else of needs no words: moving down is always safe.
export async function wordsForApprovals(account: Pick<MetaTemplateAccount, 'accessToken'>, notices: readonly WhatsAppNotice[], raises: (event: string) => boolean, fetcher: Fetch = fetch as unknown as Fetch): Promise<Map<string, string | null>> {
  const words = new Map<string, string | null>();
  for (const n of notices) {
    if (n.kind !== 'template_status' || !raises(n.event) || words.has(n.metaTemplateId) || words.size >= MAX_WORDS_ASKED) continue;
    words.set(n.metaTemplateId, await metaTemplateWords(account, n.metaTemplateId, fetcher));
  }
  return words;
}

// The webhook's first check: Meta asks with the token we chose and expects its challenge back. Null: refuse.
export function answerChallenge(config: Pick<MetaConfig, 'verifyToken'>, query: { mode: string | null; token: string | null; challenge: string | null }): string | null {
  if (query.mode !== 'subscribe' || !query.token || !query.challenge || query.challenge.length > 200) return null;
  const a = Buffer.from(query.token);
  const b = Buffer.from(config.verifyToken);
  return a.length === b.length && timingSafeEqual(a, b) ? query.challenge : null;
}

export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'meta' as const;
  constructor(
    private readonly config: MetaConfig,
    private readonly fetcher: Fetch = fetch as unknown as Fetch
  ) {}

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.config.accessToken}`, 'Content-Type': 'application/json' };
  }

  // One request to the messages address, answered as documented: an id, or Meta's refusal said shortly.
  private async post(testSchool: boolean | undefined, toPhone: string, body: Record<string, unknown>): Promise<WhatsAppSendResult> {
    // The gate never hands a test school's message to a real account; this is the second lock (docs/25 rule 2).
    if (testSchool !== false) return { success: false, providerMessageId: null, errorMessage: 'a test school never sends through a real account', raw: null };
    if (!/^\+[1-9][0-9]{7,14}$/.test(toPhone)) return { success: false, providerMessageId: null, errorMessage: 'the number is not a full international number', raw: null };
    try {
      const res = await this.fetcher(`${GRAPH_HOST}/${GRAPH_VERSION}/${this.config.phoneNumberId}/messages`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
      const answer = await res.json().catch(() => null);
      const id = str(obj(arr(obj(answer).messages)[0]).id);
      if (!res.ok || !id) return { success: false, providerMessageId: null, errorMessage: res.ok ? 'Meta accepted the request and gave no message id' : errorOf(answer, res.status), raw: null };
      return { success: true, providerMessageId: id, errorMessage: null, raw: null };
    } catch (err) {
      return { success: false, providerMessageId: null, errorMessage: `Meta could not be reached (${err instanceof Error ? err.name : 'error'})`, raw: null };
    }
  }

  async send(params: WhatsAppSendParams): Promise<WhatsAppSendResult> {
    return this.post(params.testSchool, params.toPhone, templateSendBody(params));
  }

  async sendText(params: WhatsAppTextParams): Promise<WhatsAppSendResult> {
    if (params.text.length === 0 || params.text.length > 4096) return { success: false, providerMessageId: null, errorMessage: 'the text is empty or longer than 4096 characters', raw: null };
    return this.post(params.testSchool, params.toPhone, textSendBody(params));
  }

  async sendChoice(params: WhatsAppChoiceParams): Promise<WhatsAppSendResult> {
    if (params.text.length === 0 || params.text.length > 1024 || params.choices.length < 1 || params.choices.length > 3 || params.choices.some((c) => !c.title || c.title.length > 20 || !c.id || c.id.length > 256)) return { success: false, providerMessageId: null, errorMessage: 'the question or its quick replies are outside what WhatsApp allows', raw: null };
    return this.post(params.testSchool, params.toPhone, choiceSendBody(params));
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await this.fetcher(`${GRAPH_HOST}/${GRAPH_VERSION}/${this.config.phoneNumberId}?fields=verified_name,display_phone_number,quality_rating`, { method: 'GET', headers: this.headers(), signal: AbortSignal.timeout(TIMEOUT_MS) });
      const body = obj(await res.json().catch(() => null));
      if (!res.ok) return { ok: false, message: errorOf(body, res.status) };
      if (str(body.id) !== this.config.phoneNumberId) return { ok: false, message: 'Meta answered for another phone number.' };
      return { ok: true, message: `Connected: ${str(body.verified_name, 80) ?? 'no name'} (${str(body.display_phone_number, 30) ?? 'no number'}), quality ${str(body.quality_rating, 20) ?? 'not given'}.`.slice(0, 200) };
    } catch (err) {
      return { ok: false, message: `Meta could not be reached (${err instanceof Error ? err.name : 'error'}).` };
    }
  }

  readNotice(rawBody: string, signature: string | null): NoticeRead {
    if (this.config.appSecret.length < 16) return { ok: false, reason: 'no_secret' };
    const given = /^sha256=([0-9a-f]{64})$/.exec(signature ?? '')?.[1] ?? '';
    const expected = createHmac('sha256', this.config.appSecret).update(rawBody).digest();
    const got = Buffer.from(given, 'hex');
    if (got.length !== expected.length || !timingSafeEqual(expected, got)) return { ok: false, reason: 'bad_signature' };
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: 'not_understood' };
    }
    if (obj(body).object !== 'whatsapp_business_account') return { ok: false, reason: 'not_understood' };
    const notices: WhatsAppNotice[] = [];
    const at = (unix: unknown): string | null => (typeof unix === 'string' && /^[0-9]{9,11}$/.test(unix) ? new Date(Number(unix) * 1000).toISOString() : null);
    for (const entry of arr(obj(body).entry))
      for (const change of arr(obj(entry).changes)) {
        const value = obj(obj(change).value);
        // A template's review moved (C345). Only for OUR business account: the entry is the account, not the number.
        // Its words changed at Meta: it waits, as pending, until Meta's words are read again (review of C345).
        const field = obj(change).field;
        if (field === 'message_template_status_update' || field === 'message_template_components_update') {
          if (!this.config.wabaId || str(obj(entry).id, 40) !== this.config.wabaId) continue;
          const tid = typeof value.message_template_id === 'number' || typeof value.message_template_id === 'string' ? String(value.message_template_id) : '';
          const event = field === 'message_template_components_update' ? 'COMPONENTS_UPDATE' : str(value.event, 40);
          if (/^[0-9]{1,30}$/.test(tid) && event) notices.push({ kind: 'template_status', metaTemplateId: tid, event, category: str(value.message_template_category, 40) });
          continue;
        }
        // Only what is about OUR number. Anything else in the same body is left alone.
        if (obj(change).field !== 'messages' || obj(value.metadata).phone_number_id !== this.config.phoneNumberId) continue;
        for (const s of arr(value.statuses).map(obj)) {
          const id = str(s.id);
          const when = at(s.timestamp);
          if (!id || !when || (s.status !== 'sent' && s.status !== 'delivered' && s.status !== 'read' && s.status !== 'failed')) continue; // "played" and anything new: not ours to act on
          const code = obj(arr(s.errors)[0]).code;
          const recipient = typeof s.recipient_id === 'string' && /^[1-9][0-9]{7,14}$/.test(s.recipient_id) ? `+${s.recipient_id}` : null;
          notices.push({ kind: 'status', providerMessageId: id, status: s.status, at: when, ...(s.status === 'failed' && (typeof code === 'number' || typeof code === 'string') ? { failureCode: String(code).slice(0, 60) } : {}), ...(recipient ? { recipient } : {}) });
        }
        for (const m of arr(value.messages).map(obj)) {
          const id = str(m.id);
          const when = at(m.timestamp);
          const from = typeof m.from === 'string' && /^[1-9][0-9]{7,14}$/.test(m.from) ? `+${m.from}` : null;
          const tapped = m.type === 'interactive' && obj(m.interactive).type === 'button_reply' ? obj(obj(m.interactive).button_reply) : null;
          const text = m.type === 'text' ? str(obj(m.text).body, 4096) : tapped ? str(tapped.title, 100) : null;
          const choiceId = tapped ? str(tapped.id, 256) : null;
          if (id && when && from && text) notices.push({ kind: 'inbound', providerMessageId: id, fromPhone: from, text, at: when, ...(choiceId ? { choiceId } : {}) });
        }
      }
    return { ok: true, notices };
  }
}
