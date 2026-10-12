import { createHmac, timingSafeEqual } from 'crypto';

// PaymentProvider (docs/23 6f, C169): the one door to a payment gateway, as
// FileStorage is to files and AIProvider to a model. Business code depends
// on this interface only. A provider does two things: it opens a checkout
// for a payment link, and it tells us, in a signed notice, what happened to
// the money. Nothing is ever marked paid by a browser coming back from a
// checkout page: only a notice whose signature holds does that.
//
// Razorpay is added behind this same interface when the founder's test keys
// exist: createCheckout makes a Razorpay order for the link's amount, and
// readNotice checks X-Razorpay-Signature and maps payment.captured and
// payment.failed onto ProviderEvent.

export type ProviderEvent = {
  eventId: string; // the provider's id for this notice: the same notice sent again carries the same id
  type: 'captured' | 'failed';
  providerRef: string; // the provider's reference for the checkout (its order id)
  paymentId: string; // the provider's id for this one payment attempt
  amountMinor: number; // what was captured, in paise
};

export interface PaymentProvider {
  readonly name: string;
  createCheckout(link: { linkId: string; token: string; amountMinor: number }): Promise<{ providerRef: string; checkoutUrl: string }>;
  // The notice, if its signature holds and it is well formed; null otherwise.
  readNotice(rawBody: string, signature: string | null): ProviderEvent | null;
}

export const STAND_IN_SIGNATURE_HEADER = 'x-standin-signature';
export const signStandIn = (secret: string, rawBody: string): string => createHmac('sha256', secret).update(rawBody).digest('hex');

// The stand-in: a provider with no bank behind it. Its checkout is our own
// page, and its notices are signed with a shared secret exactly as a real
// provider's are, so the whole path (link, checkout, signed notice, applied
// once, receipt) is built and tested before any key exists.
export function standInPaymentProvider(secret: string): PaymentProvider {
  return {
    name: 'stand-in',
    async createCheckout(link) {
      return { providerRef: `standin_order_${link.linkId}`, checkoutUrl: `/pay/${link.token}` };
    },
    readNotice(rawBody, signature) {
      if (!signature || !/^[0-9a-f]{64}$/.test(signature)) return null;
      const expected = Buffer.from(signStandIn(secret, rawBody), 'hex');
      if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return null;
      let body: unknown;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return null;
      }
      const b = body as Record<string, unknown>;
      const type = b?.type === 'payment.captured' ? 'captured' : b?.type === 'payment.failed' ? 'failed' : null;
      const text = (v: unknown) => (typeof v === 'string' && v.length >= 1 && v.length <= 120 ? v : null);
      const eventId = text(b?.id);
      const providerRef = text(b?.order);
      const paymentId = text(b?.payment);
      if (!type || !eventId || !providerRef || !paymentId || typeof b.amount !== 'number' || !Number.isSafeInteger(b.amount) || b.amount < 0) return null;
      return { eventId, type, providerRef, paymentId, amountMinor: b.amount };
    },
  };
}

// Which provider takes online payments. None is configured for production
// yet. The stand-in answers only outside production builds, only when asked
// for, and only with a secret of its own.
export function configuredPaymentProvider(env: Record<string, string | undefined> = process.env, standInKey: string = process.env.PAYMENT_STANDIN_SECRET ?? ''): PaymentProvider | null {
  if (env.NODE_ENV !== 'production' && env.PAYMENT_PROVIDER === 'stand-in' && standInKey.length >= 32) return standInPaymentProvider(standInKey);
  return null;
}
