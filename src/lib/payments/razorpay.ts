import { createHmac, timingSafeEqual } from 'crypto';
import type { ProviderKeys } from './credentials';
import type { PaymentProvider, ProviderEvent } from './provider';

// Razorpay, behind PaymentProvider (docs/24 §3.8, C172). Built and dormant:
// it does nothing until a school's own keys are saved, "Test connection"
// has passed and the method is switched on. Formats are Razorpay's own,
// checked against its documentation on 2026-10-12:
//   Payment Links, create:  https://razorpay.com/docs/api/payments/payment-links/create-standard/
//   Webhook signature, duplicates and order: https://razorpay.com/docs/webhooks/validate-test/
//   payment_link.paid payload: https://razorpay.com/docs/webhooks/payloads/payment-links/
//   payment.captured / payment.failed payloads: https://razorpay.com/docs/webhooks/payloads/payments/
//   Fetch a payment: https://razorpay.com/docs/api/payments/fetch-with-id/
//
// - Checkout: a Payment Link (Razorpay's hosted page; no third-party script
//   on our pages). Amount in paise. Our link id goes in `reference_id` and in
//   `notes`, so a payment's own notice can be tied back to the link.
// - Notice: `X-Razorpay-Signature` is the hex HMAC-SHA256 of the raw body
//   with the webhook secret, compared in constant time. `x-razorpay-event-id`
//   is unique per event and is what makes a repeat a repeat.
// - Before any credit the payment is fetched from Razorpay and must be
//   captured, in INR, for the amount the notice said.
//
// The keys never leave this module except in the Authorization header to
// Razorpay. No error it throws and nothing it returns contains them, or
// anything Razorpay answered beyond a status code.

const API = 'https://api.razorpay.com/v1';
const TIMEOUT_MS = 10_000;
const NOTE_KEY = 'nca_link';
type Fetch = typeof fetch;
type Entity = Record<string, unknown>;
const entity = (payload: unknown, name: string): Entity | null => {
  const e = (payload as Record<string, { entity?: unknown }> | undefined)?.[name]?.entity;
  return e && typeof e === 'object' ? (e as Entity) : null;
};
const id = (v: unknown, prefix: string): string | null => (typeof v === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9]{6,40}$`).test(v) ? v : null);
const paise = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);
const ourLink = (notes: unknown): string | undefined => {
  const v = notes && typeof notes === 'object' && !Array.isArray(notes) ? (notes as Record<string, unknown>)[NOTE_KEY] : undefined;
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined;
};

export function razorpayProvider(keys: ProviderKeys, fetchImpl: Fetch = fetch): PaymentProvider & Required<Pick<PaymentProvider, 'confirmCapture' | 'testConnection'>> {
  const auth = `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString('base64')}`;
  // One call to Razorpay. Returns the status and the parsed body; throws only when Razorpay cannot be reached.
  const call = async (method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; json: Entity | null }> => {
    const res = await fetchImpl(`${API}${path}`, { method, headers: { Authorization: auth, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' }).catch(() => null);
    if (!res) throw new Error('razorpay could not be reached');
    const json = (await res.json().catch(() => null)) as Entity | null;
    return { status: res.status, json: json && typeof json === 'object' ? json : null };
  };

  return {
    name: 'razorpay',

    async createCheckout(link) {
      const expireBy = link.expiresAt ? Math.floor(link.expiresAt.getTime() / 1000) : undefined;
      const { status, json } = await call('POST', '/payment_links', {
        amount: link.amountMinor,
        currency: 'INR',
        accept_partial: false,
        reference_id: link.linkId,
        description: 'School fees',
        notes: { [NOTE_KEY]: link.linkId },
        notify: { sms: false, email: false },
        reminder_enable: false,
        ...(expireBy ? { expire_by: expireBy } : {}),
      });
      const providerRef = id(json?.id, 'plink');
      const url = typeof json?.short_url === 'string' && /^https:\/\/[^\s]{1,400}$/.test(json.short_url) ? json.short_url : null;
      if (status < 200 || status > 299 || !providerRef || !url || json?.amount !== link.amountMinor) throw new Error(`razorpay did not open a payment link (status ${status})`);
      return { providerRef, checkoutUrl: url };
    },

    readNotice(rawBody, header) {
      const signature = header('x-razorpay-signature');
      if (!signature || !/^[0-9a-f]{64}$/.test(signature)) return null;
      const expected = createHmac('sha256', keys.webhookSecret).update(rawBody).digest();
      if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return null;
      let body: Entity;
      try {
        body = JSON.parse(rawBody) as Entity;
      } catch {
        return null;
      }
      const name = typeof body?.event === 'string' ? body.event : '';
      const eventId = header('x-razorpay-event-id');
      if (!eventId || !/^[A-Za-z0-9_-]{6,100}$/.test(eventId)) return null;
      if (name !== 'payment_link.paid' && name !== 'payment.captured' && name !== 'payment.failed') return { ignored: `event:${name.slice(0, 60)}` };
      const payment = entity(body.payload, 'payment');
      const paymentId = id(payment?.id, 'pay');
      const amountMinor = paise(payment?.amount);
      if (!payment || !paymentId || amountMinor === null || payment.currency !== 'INR') return null;
      const base = { eventId, paymentId, amountMinor, ourLinkId: ourLink(payment.notes) };
      if (name === 'payment_link.paid') {
        const plink = entity(body.payload, 'payment_link');
        const providerRef = id(plink?.id, 'plink');
        if (!providerRef || payment.status !== 'captured') return null;
        return { ...base, type: 'captured', providerRef, ourLinkId: base.ourLinkId ?? ourLink(plink?.notes) } satisfies ProviderEvent;
      }
      // A payment's own notice does not name the payment link: it is tied back by the note we attached, or not at all.
      if (!base.ourLinkId) return { ignored: `${name}:not_one_of_our_links` };
      if (name === 'payment.captured' && payment.status !== 'captured') return null;
      return { ...base, type: name === 'payment.captured' ? 'captured' : 'failed', providerRef: '' } satisfies ProviderEvent;
    },

    async confirmCapture(event) {
      const { status, json } = await call('GET', `/payments/${encodeURIComponent(event.paymentId)}`);
      if (status >= 500) throw new Error(`razorpay could not answer about the payment (status ${status})`);
      if (status !== 200 || !json) return { ok: false, reason: `fetch_status_${status}` };
      if (json.id !== event.paymentId) return { ok: false, reason: 'another_payment' };
      if (json.status !== 'captured') return { ok: false, reason: `status_${String(json.status).slice(0, 20)}` };
      if (json.currency !== 'INR') return { ok: false, reason: 'currency' };
      if (json.amount !== event.amountMinor) return { ok: false, reason: 'amount' };
      if (event.ourLinkId && ourLink(json.notes) !== undefined && ourLink(json.notes) !== event.ourLinkId) return { ok: false, reason: 'another_link' };
      return { ok: true };
    },

    async testConnection() {
      try {
        const { status } = await call('GET', '/payments?count=1');
        if (status === 200) return { ok: true, message: 'Razorpay accepted the keys.' };
        if (status === 401) return { ok: false, message: 'Razorpay did not accept these keys. Check the key id and the key secret.' };
        return { ok: false, message: `Razorpay answered with status ${status}.` };
      } catch {
        return { ok: false, message: 'Razorpay could not be reached. Try again in a minute.' };
      }
    },
  };
}
