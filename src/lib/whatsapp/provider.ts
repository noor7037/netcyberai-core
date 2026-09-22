// Task 2b: the provider-agnostic surface every WhatsApp send eventually
// goes through. Never called from anywhere except src/lib/whatsapp/gate.ts
// -- that module is the single choke point (scripts/check_whatsapp_send_gate.py
// enforces this mechanically), mirroring the SET ROLE choke point in db.ts.
export interface WhatsAppSendParams {
  toPhone: string;
  templateName: string;
  templateParams: Record<string, string>;
}

export interface WhatsAppSendResult {
  success: boolean;
  providerMessageId: string | null;
  errorMessage: string | null;
  raw: unknown;
}

export interface WhatsAppProviderSPI {
  send(params: WhatsAppSendParams): Promise<WhatsAppSendResult>;
}

export interface MockCallRecord {
  toPhone: string;
  templateName: string;
  templateParams: Record<string, string>;
  timestamp: Date;
}

// Records every call, makes no real network call, returns a
// controllable synthetic outcome. This is what every school resolves
// to today (platform default and, until a school completes its own
// WABA onboarding, tenant-scoped too) since no real WhatsApp Business
// API credentials exist anywhere in this project yet (Task 0).
export class MockWhatsAppProvider implements WhatsAppProviderSPI {
  public readonly calls: MockCallRecord[] = [];
  private forceFailure: boolean;

  constructor(options: { forceFailure?: boolean } = {}) {
    this.forceFailure = options.forceFailure ?? false;
  }

  async send(params: WhatsAppSendParams): Promise<WhatsAppSendResult> {
    this.calls.push({ ...params, timestamp: new Date() });
    if (this.forceFailure) {
      return { success: false, providerMessageId: null, errorMessage: 'mock forced failure', raw: { mock: true } };
    }
    return {
      success: true,
      providerMessageId: `mock-${this.calls.length}-${Date.now()}`,
      errorMessage: null,
      raw: { mock: true, params },
    };
  }
}

// The real adapter (graph.facebook.com) -- deliberately, honestly
// unimplemented. Task 0 confirmed two hard blockers, neither fixable
// from this session: (1) this sandbox's own egress policy rejects
// graph.facebook.com outright (403 at the proxy's CONNECT step,
// confirmed via /__agentproxy/status, not assumed); (2) zero real
// WhatsApp Business API credentials exist anywhere in this Vercel
// project (checked every env var, every target). Faking this into
// "working" would be indistinguishable from a real integration until
// the first real send silently failed against Meta's actual API.
// TODO(WhatsApp credential gap -- Prompt H/L): implement once (a) this
// sandbox or its Vercel deployment target can reach graph.facebook.com
// (re-test via the C38 diagnostic-route pattern), and (b) real
// platform-level or tenant-level credentials exist to send with.
export class MetaWhatsAppProvider implements WhatsAppProviderSPI {
  async send(): Promise<WhatsAppSendResult> {
    throw new Error(
      'MetaWhatsAppProvider is not implemented: no real WhatsApp Business API credentials exist yet, ' +
        'and this sandbox\'s egress policy blocks graph.facebook.com. See the TODO on this class.'
    );
  }
}
