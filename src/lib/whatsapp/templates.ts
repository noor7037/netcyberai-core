import type { PoolClient } from 'pg';
import type { ConsentPurpose } from '@/lib/consent/gate';
import type { Sql } from '@/lib/jobs/types';

// WhatsApp templates (docs/25 slice 7c, C184).
//
// A template is its exact words, and the words live HERE, in code, where a
// change is reviewed. Each entry is one version: its body in English and
// Hindi, the variables it needs, Meta's category, the consent purpose it is
// sent under, and how long it stays worth sending. The database holds one
// row per version and language with two separate approvals: ours (a person
// at NetCyberAI read the words) and Meta's (recorded from Business Manager).
//
//   - New words are a NEW VERSION. A version's words never change.
//   - EVERY template's first line names the school: the body begins
//     "{{school}}: ". One platform number serves every school, so a parent
//     must see at once which school is writing (C183). The gate fills
//     {{school}} itself from the school's own name; no caller can leave it
//     out or put another name in.
//   - No template carries more about a child than its purpose needs.

export const TEMPLATE_LANGUAGES = ['en', 'hi'] as const;
export type TemplateLanguage = (typeof TEMPLATE_LANGUAGES)[number];
export type BillingCategory = 'marketing' | 'utility' | 'authentication' | 'service';
export type TemplateDefinition = {
  name: string;
  version: number;
  category: BillingCategory;
  purpose: ConsentPurpose;
  staleAfterMinutes: number;
  variables: readonly string[];
  body: Record<TemplateLanguage, string>;
};
export const SCHOOL_PREFIX = '{{school}}: ';

export const TEMPLATE_REGISTRY: readonly TemplateDefinition[] = [
  {
    name: 'attendance_absence_notification',
    version: 1,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 600,
    variables: ['school', 'child', 'date'],
    body: {
      en: '{{school}}: {{child}} was marked absent on {{date}}. If this is a mistake, or {{child}} is unwell, please tell the school office.',
      hi: '{{school}}: {{child}} को {{date}} को अनुपस्थित दर्ज किया गया है। अगर यह ग़लती है, या {{child}} अस्वस्थ हैं, तो कृपया स्कूल दफ़्तर को बताएँ।',
    },
  },
  {
    name: 'fee_reminder',
    version: 1,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 1440,
    variables: ['school', 'amount', 'due_date', 'pay_link'],
    body: {
      en: '{{school}}: School fees of ₹{{amount}} are due on {{due_date}}. See what is due and pay here: {{pay_link}} If you have already paid, please ignore this message.',
      hi: '{{school}}: ₹{{amount}} की स्कूल फ़ीस {{due_date}} को देय है। क्या देय है यह देखें और यहाँ भुगतान करें: {{pay_link}} अगर आप भुगतान कर चुके हैं, तो कृपया इस संदेश को अनदेखा करें।',
    },
  },
  {
    name: 'fee_overdue',
    version: 1,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 1440,
    variables: ['school', 'amount', 'due_date', 'pay_link'],
    body: {
      en: '{{school}}: School fees of ₹{{amount}} were due on {{due_date}} and are still unpaid. See what is due and pay here: {{pay_link}} If you need more time, please tell the school office.',
      hi: '{{school}}: ₹{{amount}} की स्कूल फ़ीस {{due_date}} को देय थी और अभी बाक़ी है। क्या देय है यह देखें और यहाँ भुगतान करें: {{pay_link}} अगर आपको और समय चाहिए, तो कृपया स्कूल दफ़्तर को बताएँ।',
    },
  },
  {
    name: 'fee_payment_initiated',
    version: 1,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 720,
    variables: ['school', 'amount', 'utr_last4'],
    body: {
      en: '{{school}}: We have noted your UPI payment of ₹{{amount}} (UTR ending {{utr_last4}}). The school will check it in its bank account and then send your receipt. Nothing more is needed from you now.',
      hi: '{{school}}: हमने आपका ₹{{amount}} का UPI भुगतान (UTR के आख़िरी अंक {{utr_last4}}) दर्ज कर लिया है। स्कूल इसे अपने बैंक खाते में जाँचकर आपकी रसीद भेजेगा। अभी आपको और कुछ नहीं करना है।',
    },
  },
  {
    name: 'fee_receipt',
    version: 1,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 2880,
    variables: ['school', 'amount', 'receipt_no'],
    body: {
      en: '{{school}}: Received ₹{{amount}}. Your receipt number is {{receipt_no}}. Thank you.',
      hi: '{{school}}: ₹{{amount}} प्राप्त हुए। आपकी रसीद संख्या {{receipt_no}} है। धन्यवाद।',
    },
  },
  {
    // The day's update for a class, in the school's own words for that day, marked ready and sent by a person.
    name: 'daily_pulse',
    version: 1,
    category: 'utility',
    purpose: 'daily_pulse',
    staleAfterMinutes: 600,
    variables: ['school', 'update'],
    body: {
      en: '{{school}}: {{update}} Reply 1 if your child understood today’s lesson, or 2 if your child needs help.',
      hi: '{{school}}: {{update}} अगर आपके बच्चे को आज का पाठ समझ आया तो 1 लिखें, और अगर मदद चाहिए तो 2 लिखें।',
    },
  },
  {
    name: 'messages_stopped',
    version: 1,
    category: 'utility',
    purpose: 'core_records',
    staleAfterMinutes: 60,
    variables: ['school'],
    body: {
      en: '{{school}}: You will not get WhatsApp messages from the school any more. To start them again, please tell the school office.',
      hi: '{{school}}: अब आपको स्कूल से WhatsApp संदेश नहीं मिलेंगे। इन्हें फिर शुरू करने के लिए कृपया स्कूल दफ़्तर को बताएँ।',
    },
  },
];

const VARIABLE = /\{\{([a-z0-9_]+)\}\}/g;
export const variablesIn = (body: string): string[] => [...new Set([...body.matchAll(VARIABLE)].map((m) => m[1]))];
// What is wrong with a definition, in words; null when nothing is. The tests run it over the whole registry.
export function definitionProblem(d: TemplateDefinition): string | null {
  if (!/^[a-z][a-z0-9_]{2,60}$/.test(d.name)) return 'the name is lower case letters, digits and underscores';
  if (!Number.isInteger(d.version) || d.version < 1) return 'the version is a whole number from 1';
  if (!d.variables.includes('school')) return 'the school is not among the variables';
  for (const lang of TEMPLATE_LANGUAGES) {
    const body = d.body[lang];
    if (typeof body !== 'string' || !body.startsWith(SCHOOL_PREFIX)) return `the ${lang} body does not begin with the school's name`;
    if (body.length > 1024) return `the ${lang} body is too long`;
    const used = variablesIn(body).sort().join();
    if (used !== [...d.variables].sort().join()) return `the ${lang} body uses ${used || 'no variables'}, not exactly ${[...d.variables].sort().join()}`;
    if (/\{\{|\}\}/.test(body.replace(VARIABLE, ''))) return `the ${lang} body has a malformed variable`;
  }
  return null;
}

// The words with their values put in. A value can never bring in a variable of its own.
export function renderTemplate(body: string, params: Record<string, string>): string {
  return body.replace(VARIABLE, (_, name: string) => (params[name] ?? '').replace(/[{}]/g, ''));
}

export type TemplateToSend = { id: string; name: string; version: number; language: TemplateLanguage; body: string | null; variables: string[]; category: BillingCategory; staleAfterMinutes: number | null; metaStatus: string; metaTemplateId: string | null };

// The version to send: the newest one WE approved, in the language asked for (English if there is none in it),
// a school's own row before the platform's; and, for a real account, only one Meta has approved too.
export async function templateToSend(client: Pick<PoolClient, 'query'>, schoolId: string, templateName: string, language: TemplateLanguage, needsMeta: boolean): Promise<TemplateToSend | null> {
  const { rows } = await client.query(
    `select id, template_name, version, language, body, variables, billing_category, stale_after_minutes, meta_status, meta_template_id
       from whatsapp_templates
      where template_name = $2 and (school_id = $1 or school_id is null) and status = 'approved' and language in ($3, 'en') and ($4 = false or meta_status = 'approved')
      order by (language = $3) desc, school_id nulls last, version desc
      limit 1`,
    [schoolId, templateName, language, needsMeta]
  );
  const r = rows[0];
  return r ? { id: r.id, name: r.template_name, version: r.version, language: r.language, body: r.body, variables: r.variables ?? [], category: r.billing_category, staleAfterMinutes: r.stale_after_minutes, metaStatus: r.meta_status, metaTemplateId: r.meta_template_id } : null;
}

// Kept for callers that only ask "may this be sent at all" (our own approval).
export async function isTemplateApproved(client: PoolClient, schoolId: string, templateName: string): Promise<boolean> {
  return (await templateToSend(client, schoolId, templateName, 'en', false)) !== null;
}

// The variables a send is missing, after the school's own name has been put in.
export function missingVariables(template: Pick<TemplateToSend, 'variables'>, params: Record<string, string>): string[] {
  return template.variables.filter((v) => typeof params[v] !== 'string' || params[v].trim() === '');
}

// --- Control: the founder's side ---------------------------------------------------------------------------

export type TemplateRow = { id: string; name: string; version: number; language: TemplateLanguage; body: string | null; variables: string[]; category: string; staleAfterMinutes: number | null; status: 'approved' | 'pending' | 'rejected'; approvedByName: string | null; approvedAt: string | null; metaStatus: string; metaTemplateId: string | null; metaDecidedAt: string | null; inCode: boolean; sendsNow: boolean };
export const META_STATUSES = ['not_submitted', 'pending', 'approved', 'rejected', 'paused'] as const;

// Every version in the code that the database does not yet hold is written, waiting for approval. A row from
// before versions (no words) is given its words once, and waits for approval like the rest. Nothing already written is changed. Returns how many were added.
export async function syncTemplates(db: Sql): Promise<{ added: number; filled: number }> {
  let added = 0;
  let filled = 0;
  for (const d of TEMPLATE_REGISTRY) {
    const problem = definitionProblem(d);
    if (problem) throw new Error(`template ${d.name} v${d.version}: ${problem}`);
    for (const language of TEMPLATE_LANGUAGES) {
      const have = (await db.query(`select id, body from whatsapp_templates where school_id is null and template_name = $1 and language = $2 and version = $3`, [d.name, language, d.version])).rows[0];
      if (!have) {
        await db.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status) values (null, $1, $2, $3, $4, $5, $6, $7, 'pending')`, [d.name, d.version, language, d.body[language], [...d.variables], d.category, d.staleAfterMinutes]);
        added += 1;
      } else if (have.body === null) {
        // Its old approval was of a name, not of these words: it waits for a person to read them.
        await db.query(`update whatsapp_templates set body = $2, variables = $3, stale_after_minutes = $4, status = 'pending' where id = $1`, [have.id, d.body[language], [...d.variables], d.staleAfterMinutes]);
        filled += 1;
      }
    }
  }
  return { added, filled };
}

export async function listTemplates(db: Sql): Promise<TemplateRow[]> {
  const { rows } = await db.query(
    `select t.id, t.template_name, t.version, t.language, t.body, t.variables, t.billing_category, t.stale_after_minutes, t.status::text as status, u.display_name as approved_by_name, t.approved_at, t.meta_status, t.meta_template_id, t.meta_decided_at,
            t.version = (select max(n.version) from whatsapp_templates n where n.school_id is null and n.template_name = t.template_name and n.language = t.language and n.status = 'approved') as sends_now
       from whatsapp_templates t left join users u on u.user_id = t.approved_by
      where t.school_id is null order by t.template_name, t.language, t.version desc`
  );
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return rows.map((r) => ({ id: r.id, name: r.template_name, version: r.version, language: r.language, body: r.body, variables: r.variables ?? [], category: r.billing_category, staleAfterMinutes: r.stale_after_minutes, status: r.status, approvedByName: r.approved_by_name ?? null, approvedAt: iso(r.approved_at), metaStatus: r.meta_status, metaTemplateId: r.meta_template_id, metaDecidedAt: iso(r.meta_decided_at), inCode: TEMPLATE_REGISTRY.some((d) => d.name === r.template_name && d.version === r.version && d.body[r.language as TemplateLanguage] === r.body), sendsNow: r.sends_now === true }));
}

export type TemplateActionResult = { ok: true } | { ok: false; reason: 'not_found' | 'no_words' | 'not_in_code' | 'meta_status' | 'meta_id' };

// Our own approval: a person at NetCyberAI has read these exact words. Only words that are still the code's.
export async function decideTemplate(db: Sql, by: { userId: string }, id: string, approve: boolean): Promise<TemplateActionResult> {
  const row = (await db.query(`select template_name, version, language, body from whatsapp_templates where id = $1 and school_id is null for update`, [id])).rows[0];
  if (!row) return { ok: false, reason: 'not_found' };
  if (approve) {
    if (row.body === null) return { ok: false, reason: 'no_words' };
    if (!TEMPLATE_REGISTRY.some((d) => d.name === row.template_name && d.version === row.version && d.body[row.language as TemplateLanguage] === row.body)) return { ok: false, reason: 'not_in_code' };
  }
  await db.query(`update whatsapp_templates set status = $2::whatsapp_template_status, approved_by = $3, approved_at = now() where id = $1`, [id, approve ? 'approved' : 'rejected', by.userId]);
  return { ok: true };
}

// Meta's decision, as read in Business Manager, and Meta's own id for the template.
export async function recordMetaDecision(db: Sql, id: string, input: { metaStatus: string; metaTemplateId: string }): Promise<TemplateActionResult> {
  if (!(META_STATUSES as readonly string[]).includes(input.metaStatus)) return { ok: false, reason: 'meta_status' };
  const metaId = input.metaTemplateId.trim();
  if (metaId.length > 100 || (input.metaStatus !== 'not_submitted' && metaId === '')) return { ok: false, reason: 'meta_id' };
  const done = await db.query(`update whatsapp_templates set meta_status = $2, meta_template_id = nullif($3, ''), meta_decided_at = now() where id = $1 and school_id is null`, [id, input.metaStatus, metaId]);
  return done.rowCount === 1 ? { ok: true } : { ok: false, reason: 'not_found' };
}
