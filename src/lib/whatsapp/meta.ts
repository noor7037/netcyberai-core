import { createHmac, timingSafeEqual } from 'crypto';
import { EXAMPLE_PDF_NAME, examplePdf } from './example-pdf';
import type { NoticeRead, WhatsAppChoiceParams, WhatsAppMediaParams, WhatsAppMediaResult, WhatsAppNotice, WhatsAppProvider, WhatsAppSendParams, WhatsAppSendResult, WhatsAppTextParams } from './provider';

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
//   A document header (C366, read 2026-10-27) A template made with a document header is sent with one more component,
//                     before the body: { type: "header", parameters: [{ type: "document", document: { id, filename } }] }.
//                     `id`: the media id of a file already given (below); `filename`: "Document filename, with
//                     extension", which the family's WhatsApp shows. (The header object's `document` is a media object:
//                     either `id` or `link`; we never send a link.)
//     https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages (HeaderObject, MediaObject)
//     https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/document-messages
//   Give a file       POST https://graph.facebook.com/{version}/{phone-number-id}/media, bearer token, multipart form with
//                     messaging_product=whatsapp, file (the bytes, with their type) and type (the MIME type,
//                     application/pdf; a PDF may be up to 100 MB). Answer: { id }. Meta keeps it 30 days.
//     https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
//   Send free text   The same address; body { messaging_product, recipient_type, to, type: "text", text: { preview_url, body } }, body up to 4096 characters.
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
//   A template with a document header (C366): one more component before the body, { type: "HEADER", format: "DOCUMENT",
//                     example: { header_handle: ["<handle>"] } }, the handle of an example file given to Meta with the
//                     Resumable Upload API (below): "You must upload all media with the Resumable Upload API."
//     https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components
//   The app's id      GET https://graph.facebook.com/{version}/debug_token?input_token={token}, the same token as bearer
//                     → { data: { app_id, is_valid, ... } }. The upload session below is opened on the app the saved
//                     token belongs to, so nothing more is asked of the founder.
//     https://developers.facebook.com/docs/graph-api/reference/debug_token
//   Resumable Upload  1. POST https://graph.facebook.com/{version}/{app-id}/uploads?file_name=&file_length=&file_type=
//                        (application/pdf is one of its types) → { id: "upload:<session-id>" }
//                     2. POST https://graph.facebook.com/{version}/upload:<session-id>, headers Authorization: OAuth
//                        {token} and file_offset: 0, the file's bytes as the body → { h: "<handle>" }
//                     The token goes in the Authorization header (Meta's examples put it in the query string; the
//                     header works for every Graph call). Only debug_token names it in its address, as the token it
//                     is asked about (input_token); no address or request is ever written to a log or an error.
//     https://developers.facebook.com/docs/graph-api/guides/upload
//
// No network call is made in any test: `fetch` is handed in, and the tests hand in recorded answers.

export const GRAPH_VERSION = 'v23.0';
export const GRAPH_HOST = 'https://graph.facebook.com';
export const META_SIGNATURE_HEADER = 'x-hub-signature-256';
// `wabaId`: the business account the number is on. Meta's notices about our templates name it, not the number.
export type MetaConfig = { accessToken: string; appSecret: string; verifyToken: string; phoneNumberId: string; wabaId?: string };
type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
// Giving Meta a file (C366) sends a form or the file's bytes. The same `fetch`; a test's recorder reads the body as such.
export type UploadFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string | FormData | Uint8Array; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
const TIMEOUT_MS = 10_000;
// Giving Meta a file takes longer than a message.
const UPLOAD_TIMEOUT_MS = 30_000;

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
// order (only a test's) keeps the order of its values. A template with a document header (C366) carries the file
// Meta already holds, by its media id, and the name the family sees.
export function templateSendBody(p: WhatsAppSendParams): Record<string, unknown> {
  const order = p.templateOrder ?? Object.keys(p.templateParams);
  const body = { type: 'body', parameters: order.map((name) => ({ type: 'text', text: p.templateParams[name] ?? '' })) };
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: p.toPhone,
    type: 'template',
    template: {
      name: p.templateName,
      language: { code: LANGUAGE_CODE[p.language ?? 'en'] },
      components: p.document ? [{ type: 'header', parameters: [{ type: 'document', document: { id: p.document.mediaId, filename: p.document.filename } }] }, body] : [body],
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
// What we ask Meta to review: the words numbered by position, and one made-up value for each, in the same order; for a
// template that carries a PDF (C366), its document header, with the handle of the example file once Meta holds it.
export type MetaTemplateDraft = { name: string; language: 'en' | 'hi'; text: string; example: string[]; header?: { format: 'DOCUMENT'; handle?: string } };
export type MetaTemplateMade = { ok: true; id: string; status: string; category: string | null } | { ok: false; message: string };
export const MAX_TEMPLATE_PAGES = 10;
const WABA_ID = /^[0-9]{5,30}$/;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const unreachable = (err: unknown) => `Meta could not be reached (${err instanceof Error ? err.name : 'error'})`;

// The body of a request to make a template, exactly as documented: always UTILITY, always positional. A template that
// carries a PDF (C366) has its document header first, with the handle of the example file Meta holds.
export function templateCreateBody(d: MetaTemplateDraft): Record<string, unknown> {
  const body = { type: 'body', text: d.text, ...(d.example.length ? { example: { body_text: [d.example] } } : {}) };
  const header = d.header ? [{ type: 'HEADER', format: 'DOCUMENT', example: { header_handle: [d.header.handle ?? ''] } }] : [];
  return { name: d.name, language: LANGUAGE_CODE[d.language], category: 'UTILITY', parameter_format: 'positional', components: [...header, body] };
}

const APP_ID = /^[0-9]{5,30}$/;
// Meta's upload session id: "upload:" and Meta's own characters. It is put after our own host's address, never followed.
const UPLOAD_SESSION = /^upload:[A-Za-z0-9_=:?&.%-]{1,1000}$/;
const HANDLE = /^[A-Za-z0-9_=:+/.-]{1,2000}$/;

// The id of the app the token belongs to (debug_token, as documented), or why it could not be read.
export async function metaAppId(account: Pick<MetaTemplateAccount, 'accessToken'>, fetcher: UploadFetch = fetch as unknown as UploadFetch): Promise<{ ok: true; appId: string } | { ok: false; message: string }> {
  try {
    const q = new URLSearchParams({ input_token: account.accessToken });
    const res = await fetcher(`${GRAPH_HOST}/${GRAPH_VERSION}/debug_token?${q}`, { method: 'GET', headers: { Authorization: `Bearer ${account.accessToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const answer = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, message: errorOf(answer, res.status) };
    const appId = obj(obj(answer).data).app_id;
    const id = typeof appId === 'number' ? String(appId) : str(appId, 40);
    return id && APP_ID.test(id) ? { ok: true, appId: id } : { ok: false, message: 'Meta did not say which app the saved token belongs to' };
  } catch (err) {
    return { ok: false, message: unreachable(err) };
  }
}

// The example file of a template's document header, given to Meta with the Resumable Upload API (as documented: open
// a session on the token's app, then send the bytes at offset 0). Its answer: the handle the template names.
export async function uploadHeaderExample(
  account: Pick<MetaTemplateAccount, 'accessToken'>,
  file: { bytes: Uint8Array; name: string; type: 'application/pdf' } = { bytes: examplePdf(), name: EXAMPLE_PDF_NAME, type: 'application/pdf' },
  fetcher: UploadFetch = fetch as unknown as UploadFetch
): Promise<{ ok: true; handle: string } | { ok: false; message: string }> {
  const app = await metaAppId(account, fetcher);
  if (!app.ok) return app;
  try {
    const q = new URLSearchParams({ file_name: file.name, file_length: String(file.bytes.length), file_type: file.type });
    const opened = await fetcher(`${GRAPH_HOST}/${GRAPH_VERSION}/${app.appId}/uploads?${q}`, { method: 'POST', headers: { Authorization: `OAuth ${account.accessToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const session = await opened.json().catch(() => null);
    const sessionId = str(obj(session).id, 1000);
    if (!opened.ok || !sessionId || !UPLOAD_SESSION.test(sessionId)) return { ok: false, message: opened.ok ? 'Meta opened no upload session' : errorOf(session, opened.status) };
    const sent = await fetcher(`${GRAPH_HOST}/${GRAPH_VERSION}/${sessionId}`, { method: 'POST', headers: { Authorization: `OAuth ${account.accessToken}`, file_offset: '0' }, body: file.bytes, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
    const answer = await sent.json().catch(() => null);
    const handle = str(obj(answer).h, 2000);
    if (!sent.ok || !handle || !HANDLE.test(handle)) return { ok: false, message: sent.ok ? 'Meta took the file and gave no handle' : errorOf(answer, sent.status) };
    return { ok: true, handle };
  } catch (err) {
    return { ok: false, message: unreachable(err) };
  }
}

// Ask Meta to review one template. Its answer: Meta's id for it, and its state and category so far. A template with a
// document header first gives Meta its example file (made in code, no child's data), for the handle.
export async function createMetaTemplate(account: MetaTemplateAccount, draftIn: MetaTemplateDraft, fetcher: Fetch = fetch as unknown as Fetch): Promise<MetaTemplateMade> {
  if (!WABA_ID.test(account.wabaId)) return { ok: false, message: 'the saved account has no business account id' };
  let draft = draftIn;
  if (draft.header && !draft.header.handle) {
    const example = await uploadHeaderExample(account, undefined, fetcher as unknown as UploadFetch);
    if (!example.ok) return { ok: false, message: `the example PDF was not taken: ${example.message}`.slice(0, 200) };
    draft = { ...draft, header: { ...draft.header, handle: example.handle } };
  }
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

  // A file for a template's document header (C366), given to the number's media address as documented: a multipart
  // form of messaging_product, the file with its type, and the type. Never for a test school (the second lock, as
  // post()). Its answer: Meta's media id.
  async uploadMedia(params: WhatsAppMediaParams): Promise<WhatsAppMediaResult> {
    if (params.testSchool !== false) return { ok: false, message: 'a test school never sends through a real account' };
    if (params.mimeType !== 'application/pdf' || params.bytes.length === 0 || params.bytes.length > 100 * 1024 * 1024 || !/^[A-Za-z0-9_-]{1,80}\.pdf$/.test(params.filename)) return { ok: false, message: 'the file is not a PDF WhatsApp takes' };
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', new Blob([params.bytes], { type: params.mimeType }), params.filename);
    form.append('type', params.mimeType);
    try {
      const res = await (this.fetcher as unknown as UploadFetch)(`${GRAPH_HOST}/${GRAPH_VERSION}/${this.config.phoneNumberId}/media`, { method: 'POST', headers: { Authorization: `Bearer ${this.config.accessToken}` }, body: form, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
      const answer = await res.json().catch(() => null);
      const id = str(obj(answer).id, 200);
      if (!res.ok || !id || !/^[A-Za-z0-9_.:-]{1,200}$/.test(id)) return { ok: false, message: res.ok ? 'Meta took the file and gave no media id' : errorOf(answer, res.status) };
      return { ok: true, mediaId: id };
    } catch (err) {
      return { ok: false, message: unreachable(err) };
    }
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
