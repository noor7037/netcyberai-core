import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

// The WhatsApp provider interface (docs/25 slice 7a, C182), shaped as
// PaymentProvider is: the app talks to this, never to a vendor. Two
// providers stand behind it:
//   - the stand-in: reaches no phone and no network. It answers as the real
//     one will (an id for each send; signed notices of delivery, reading,
//     failure and replies), so every loop is proven without Meta. It is what
//     every school resolves to today, and what a TEST SCHOOL resolves to
//     always, whatever credentials exist.
//   - Meta's Cloud API adapter (./meta.ts): built and dormant behind
//     encrypted platform credentials, switched on in Control.
// Nothing calls send() except src/lib/whatsapp/gate.ts
// (scripts/check_whatsapp_send_gate.py holds that in CI).

export type ProviderName = 'stand-in' | 'meta';

export interface WhatsAppSendParams {
  toPhone: string;
  templateName: string;
  templateParams: Record<string, string>;
  // Which version and language of the template (C184), and Meta's own id for it when it has one.
  language?: 'en' | 'hi';
  templateVersion?: number;
  metaTemplateId?: string | null;
  // The order the template's own words name its values in: Meta numbers them {{1}}, {{2}}, ... in this order (C345).
  templateOrder?: readonly string[];
  // Whether the school is a test school. A real provider refuses unless this is exactly false (docs/25 rule 2).
  testSchool?: boolean;
}

export interface WhatsAppTextParams {
  toPhone: string;
  text: string;
  testSchool?: boolean;
}

export interface WhatsAppChoiceParams extends WhatsAppTextParams {
  choices: { id: string; title: string }[];
}

export interface WhatsAppSendResult {
  success: boolean;
  providerMessageId: string | null;
  errorMessage: string | null;
  raw: unknown;
}

// What a provider tells us afterwards: where a message got to, or what a parent wrote back.
export type WhatsAppNotice =
  // `recipient`: the number the message went to, when the provider says it (C190: an uncertain send is found by it).
  | { kind: 'status'; providerMessageId: string; status: 'sent' | 'delivered' | 'read' | 'failed'; at: string; failureCode?: string; recipient?: string }
  // `choiceId`: the id of the quick reply the parent tapped, when the message is an answer to one.
  | { kind: 'inbound'; providerMessageId: string; fromPhone: string; text: string; at: string; choiceId?: string }
  // Meta's review of one of our templates moved (C345): its own id, its word for the state, and the category it filed it in.
  | { kind: 'template_status'; metaTemplateId: string; event: string; category: string | null };
export type NoticeRead = { ok: true; notices: WhatsAppNotice[] } | { ok: false; reason: 'no_secret' | 'bad_signature' | 'not_understood' };

export interface WhatsAppProvider {
  readonly name: ProviderName;
  send(params: WhatsAppSendParams): Promise<WhatsAppSendResult>;
  // Free text (C187): only ever a reply inside the 24 hours a parent's own message opens. The gate decides that.
  sendText(params: WhatsAppTextParams): Promise<WhatsAppSendResult>;
  // A question with up to three quick replies (C190), inside the same 24 hours.
  sendChoice(params: WhatsAppChoiceParams): Promise<WhatsAppSendResult>;
  // Whether the account behind this provider can be reached, said plainly. Makes no send.
  testConnection(): Promise<{ ok: boolean; message: string }>;
  // A webhook body and its signature header, checked and read. A body that cannot be trusted reads as nothing.
  readNotice(rawBody: string, signature: string | null): NoticeRead;
}
// The older name, kept for the gate's callers.
export type WhatsAppProviderSPI = WhatsAppProvider;

// The header the stand-in's webhook carries its signature in.
export const STAND_IN_SIGNATURE_HEADER = 'x-standin-signature';
export const signStandInNotice = (secret: string, rawBody: string): string => createHmac('sha256', secret).update(rawBody).digest('hex');
const STATUSES = ['sent', 'delivered', 'read', 'failed'];
const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));

export type StandInCall = WhatsAppSendParams & { providerMessageId: string | null; at: Date };

export class StandInWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'stand-in' as const;
  // What it was asked to send, for tests. Nothing here leaves the process.
  public readonly calls: StandInCall[] = [];
  private readonly secret: string;
  private readonly forceFailure: boolean;

  // The secret signs the stand-in's own notices. Without one it still "sends", and trusts no notice at all.
  constructor(options: { secret?: string; forceFailure?: boolean } = {}, secret: string = process.env.WHATSAPP_STANDIN_SECRET ?? '') {
    this.secret = options.secret ?? secret;
    this.forceFailure = options.forceFailure ?? false;
  }

  async send(params: WhatsAppSendParams): Promise<WhatsAppSendResult> {
    const providerMessageId = this.forceFailure ? null : `standin-${randomUUID()}`;
    this.calls.push({ ...params, providerMessageId, at: new Date() });
    if (this.forceFailure) return { success: false, providerMessageId: null, errorMessage: 'the stand-in was told to fail', raw: { standIn: true } };
    return { success: true, providerMessageId, errorMessage: null, raw: { standIn: true } };
  }

  async sendText(params: WhatsAppTextParams): Promise<WhatsAppSendResult> {
    return this.send({ toPhone: params.toPhone, templateName: '(free text)', templateParams: { text: params.text } });
  }

  async sendChoice(params: WhatsAppChoiceParams): Promise<WhatsAppSendResult> {
    return this.send({ toPhone: params.toPhone, templateName: '(question)', templateParams: { text: params.text, choices: params.choices.map((c) => c.title).join(' | ') } });
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: 'The stand-in is in use: no message reaches a phone.' };
  }

  // The body of a notice as the stand-in would post it, and its signature: for tests and the screen harness.
  notice(notices: WhatsAppNotice[]): { rawBody: string; signature: string } {
    const rawBody = JSON.stringify({ provider: 'stand-in', notices });
    return { rawBody, signature: signStandInNotice(this.secret, rawBody) };
  }

  readNotice(rawBody: string, signature: string | null): NoticeRead {
    if (this.secret.length < 32) return { ok: false, reason: 'no_secret' };
    const expected = Buffer.from(signStandInNotice(this.secret, rawBody), 'hex');
    const given = Buffer.from(/^[0-9a-f]{64}$/.test(signature ?? '') ? (signature as string) : '', 'hex');
    if (given.length !== expected.length || !timingSafeEqual(expected, given)) return { ok: false, reason: 'bad_signature' };
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: 'not_understood' };
    }
    const list = (body as { provider?: unknown; notices?: unknown }).provider === 'stand-in' ? (body as { notices?: unknown }).notices : null;
    if (!Array.isArray(list) || list.length > 100) return { ok: false, reason: 'not_understood' };
    const notices: WhatsAppNotice[] = [];
    for (const n of list as Record<string, unknown>[]) {
      const id = typeof n?.providerMessageId === 'string' && n.providerMessageId.length <= 200 ? n.providerMessageId : null;
      if (!id || !isIso(n.at)) return { ok: false, reason: 'not_understood' };
      if (n.kind === 'status' && typeof n.status === 'string' && STATUSES.includes(n.status)) {
        notices.push({ kind: 'status', providerMessageId: id, status: n.status as 'sent', at: n.at, ...(typeof n.failureCode === 'string' ? { failureCode: n.failureCode.slice(0, 60) } : {}), ...(typeof n.recipient === 'string' && /^\+[0-9]{8,15}$/.test(n.recipient) ? { recipient: n.recipient } : {}) });
      } else if (n.kind === 'inbound' && typeof n.fromPhone === 'string' && /^\+[0-9]{8,15}$/.test(n.fromPhone) && typeof n.text === 'string') {
        notices.push({ kind: 'inbound', providerMessageId: id, fromPhone: n.fromPhone, text: n.text.slice(0, 4096), at: n.at, ...(typeof n.choiceId === 'string' && n.choiceId.length <= 256 ? { choiceId: n.choiceId } : {}) });
      } else return { ok: false, reason: 'not_understood' };
    }
    return { ok: true, notices };
  }
}

// Meta's Cloud API adapter is in ./meta.ts (slice 7e): dormant until the platform's credentials are saved,
// tested and switched on in Control.
