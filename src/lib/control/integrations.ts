import { loadAiOverview } from '@/lib/ai/control';
import { metaAccountMeta } from '@/lib/whatsapp/credentials';
import type { Sql } from '@/lib/jobs/types';

// Control → Integrations (W21-M6): every outside service the platform talks to, in one table, each with where it is
// set and, where a test exists, the test. Read only here: the keys are saved on their own screens. No secret leaves
// the server: a key shows as its last four characters, as Control → AI shows it.
//
// What exists: the platform's WhatsApp account (Control → WhatsApp, its own connection test), each school's own
// WhatsApp account (no test here: the platform's number is the one in use), the email sender (set on the server; no
// test exists, so none is offered), each AI provider and YouTube (Control → AI, "Test the key"), and Razorpay, which
// is not started (docs/16 P3).

export type IntegrationState = 'on' | 'saved' | 'off' | 'not_set' | 'failed' | 'not_started';
export type Integration = {
  id: string;
  kind: 'whatsapp' | 'whatsapp_school' | 'email' | 'ai' | 'video' | 'voice' | 'payments';
  name: string;
  state: IntegrationState;
  keyLast4: string | null;
  testedAt: string | null;
  testOk: boolean | null;
  // The Control screen where it is set; null: set on the server, outside Control.
  where: string | null;
  // The existing test this row's button calls; null: no test exists.
  test: { url: string; body: Record<string, string> } | null;
};

export async function loadIntegrations(db: Sql, env: NodeJS.ProcessEnv = process.env): Promise<Integration[]> {
  const out: Integration[] = [];
  const wa = await metaAccountMeta(db, env);
  out.push({
    id: 'whatsapp:platform',
    kind: 'whatsapp',
    name: 'meta',
    state: !wa ? 'not_set' : wa.testOk === false ? 'failed' : wa.enabled ? 'on' : 'saved',
    keyLast4: wa?.tokenLast4 ?? null,
    testedAt: wa?.testedAt ?? null,
    testOk: wa?.testOk ?? null,
    where: '/control/whatsapp',
    test: wa ? { url: '/api/control/whatsapp', body: { action: 'test' } } : null,
  });
  const schools = (await db.query(`select s.school_id, s.name, w.status::text as status from school_whatsapp_configs w join schools s on s.school_id = w.school_id order by s.name`)).rows;
  for (const r of schools as { school_id: string; name: string; status: string }[]) {
    out.push({ id: `whatsapp:${r.school_id}`, kind: 'whatsapp_school', name: r.name, state: r.status === 'active' ? 'on' : r.status === 'not_configured' ? 'not_set' : 'off', keyLast4: null, testedAt: null, testOk: null, where: '/control/whatsapp', test: null });
  }
  const emailReady = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
  out.push({ id: 'email', kind: 'email', name: env.EMAIL_FROM && emailReady ? env.EMAIL_FROM : 'resend', state: emailReady ? 'on' : 'not_set', keyLast4: null, testedAt: null, testOk: null, where: null, test: null });
  const ai = await loadAiOverview(db);
  for (const p of ai.providers) {
    const c = p.credential;
    const kind = p.capability === 'video' ? 'video' : p.capability === 'text_to_speech' ? 'voice' : 'ai';
    const state: IntegrationState = p.needsKey && !c ? 'not_set' : c?.testOk === false ? 'failed' : p.enabled ? 'on' : 'off';
    out.push({ id: `ai:${p.providerId}`, kind, name: p.providerId, state, keyLast4: c?.keyLast4 ?? null, testedAt: c?.testedAt ?? null, testOk: c?.testOk ?? null, where: '/control/ai', test: p.testable && c ? { url: '/api/control/ai', body: { action: 'test', providerId: p.providerId } } : null });
  }
  out.push({ id: 'payments:razorpay', kind: 'payments', name: 'razorpay', state: 'not_started', keyLast4: null, testedAt: null, testOk: null, where: null, test: null });
  return out;
}
