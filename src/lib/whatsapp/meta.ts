import { createHmac, timingSafeEqual } from 'crypto';
import type { NoticeRead, WhatsAppNotice, WhatsAppProvider, WhatsAppSendParams, WhatsAppSendResult, WhatsAppTextParams } from './provider';

// Meta's WhatsApp Cloud API (docs/25 slice 7e, C186). Built from Meta's own
// documentation as it read on 2026-10-13, and DORMANT: it is used only when
// the platform's credentials are saved, tested and switched on in Control.
// Nothing here is called from anywhere but the send-gate and the webhook.
//
// The formats, and where each is documented:
//   Send a template   POST https://graph.facebook.com/{version}/{phone-number-id}/messages, bearer token; body
//                     { messaging_product, recipient_type, to, type: "template", template: { name, language:
//                     { code }, components: [{ type: "body", parameters: [{ type: "text", parameter_name, text }] }] } }
//                     Answer: { messaging_product, contacts: [{ input, wa_id }], messages: [{ id, message_status }] }
//     https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
//     https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview
//   Send free text    The same address; body { messaging_product, recipient_type, to, type: "text", text: { preview_url, body } }, body up to 4096 characters.
//     https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/text-messages
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
//
// No network call is made in any test: `fetch` is handed in, and the tests hand in recorded answers.

export const GRAPH_VERSION = 'v23.0';
export const GRAPH_HOST = 'https://graph.facebook.com';
export const META_SIGNATURE_HEADER = 'x-hub-signature-256';
export type MetaConfig = { accessToken: string; appSecret: string; verifyToken: string; phoneNumberId: string };
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
export function templateSendBody(p: WhatsAppSendParams): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: p.toPhone,
    type: 'template',
    template: {
      name: p.templateName,
      language: { code: LANGUAGE_CODE[p.language ?? 'en'] },
      components: [{ type: 'body', parameters: Object.entries(p.templateParams).map(([name, text]) => ({ type: 'text', parameter_name: name, text })) }],
    },
  };
}

// The body of a free-text send, exactly as documented.
export function textSendBody(p: WhatsAppTextParams): Record<string, unknown> {
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to: p.toPhone, type: 'text', text: { preview_url: false, body: p.text } };
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
        // Only what is about OUR number. Anything else in the same body is left alone.
        if (obj(change).field !== 'messages' || obj(value.metadata).phone_number_id !== this.config.phoneNumberId) continue;
        for (const s of arr(value.statuses).map(obj)) {
          const id = str(s.id);
          const when = at(s.timestamp);
          if (!id || !when || (s.status !== 'sent' && s.status !== 'delivered' && s.status !== 'read' && s.status !== 'failed')) continue; // "played" and anything new: not ours to act on
          const code = obj(arr(s.errors)[0]).code;
          notices.push({ kind: 'status', providerMessageId: id, status: s.status, at: when, ...(s.status === 'failed' && (typeof code === 'number' || typeof code === 'string') ? { failureCode: String(code).slice(0, 60) } : {}) });
        }
        for (const m of arr(value.messages).map(obj)) {
          const id = str(m.id);
          const when = at(m.timestamp);
          const from = typeof m.from === 'string' && /^[1-9][0-9]{7,14}$/.test(m.from) ? `+${m.from}` : null;
          const text = m.type === 'text' ? str(obj(m.text).body, 4096) : null;
          if (id && when && from && text) notices.push({ kind: 'inbound', providerMessageId: id, fromPhone: from, text, at: when });
        }
      }
    return { ok: true, notices };
  }
}
