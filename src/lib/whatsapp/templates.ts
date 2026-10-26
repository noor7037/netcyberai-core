import type { PoolClient } from 'pg';
import type { ConsentPurpose } from '@/lib/consent/gate';
import type { Sql } from '@/lib/jobs/types';
import type { MetaTemplate, MetaTemplateDraft } from './meta';
import { templateExample } from './template-examples';

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
//   - EVERY template names the school first: the body begins "From
//     {{school}}: " (Hindi: "स्कूल {{school}} की ओर से: "). One platform
//     number serves every school, so a parent must see at once which school
//     is writing (C183). The gate fills {{school}} itself from the school's
//     own name; no caller can leave it out or put another name in.
//   - Every body is in Meta's shape (C344; the supervisor's brief of
//     2026-10-26): it neither begins nor ends with a placeholder, no
//     placeholder appears twice or right next to another, there are at least
//     three words for each placeholder, at most 1024 characters and at most
//     one blank line between paragraphs. Meta refuses a template otherwise.
//     metaShapeProblem() holds every version to it, and the tests run it.
//   - Meta numbers the placeholders {{1}}, {{2}}, ... in the order they
//     appear in each body (a Hindi sentence may put them in another order
//     than the English one), and a send gives the values in that same order:
//     positionalBody() and placeholderOrder(). attendance_absence_notification
//     v2 (en) is word for word the body Meta approved (From {{1}}: {{2}} was
//     marked absent on {{3}}. ...).
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
// How every body begins: the school's name, after words of its own (Meta refuses a body that begins with a placeholder).
export const SCHOOL_PREFIX: Record<TemplateLanguage, string> = { en: 'From {{school}}: ', hi: 'स्कूल {{school}} की ओर से: ' };

export const TEMPLATE_REGISTRY: readonly TemplateDefinition[] = [
  {
    name: 'attendance_absence_notification',
    version: 2,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 600,
    variables: ['school', 'child', 'date'],
    body: {
      en: 'From {{school}}: {{child}} was marked absent on {{date}}. If this is a mistake, or your child is unwell, please tell the school office.',
      hi: 'स्कूल {{school}} की ओर से: {{child}} को {{date}} को अनुपस्थित दर्ज किया गया है। अगर यह ग़लती है, या आपका बच्चा अस्वस्थ है, तो कृपया स्कूल दफ़्तर को बताएँ।',
    },
  },
  {
    name: 'fee_reminder',
    version: 2,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 1440,
    variables: ['school', 'amount', 'due_date', 'pay_link'],
    body: {
      en: 'From {{school}}: School fees of ₹{{amount}} are due on {{due_date}}. See what is due and pay here: {{pay_link}} If you have already paid, please ignore this message.',
      hi: 'स्कूल {{school}} की ओर से: ₹{{amount}} की स्कूल फ़ीस {{due_date}} को देय है। क्या देय है यह देखें और यहाँ भुगतान करें: {{pay_link}} अगर आप भुगतान कर चुके हैं, तो कृपया इस संदेश को अनदेखा करें।',
    },
  },
  {
    name: 'fee_overdue',
    version: 2,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 1440,
    variables: ['school', 'amount', 'due_date', 'pay_link'],
    body: {
      en: 'From {{school}}: School fees of ₹{{amount}} were due on {{due_date}} and are still unpaid. See what is due and pay here: {{pay_link}} If you need more time, please tell the school office.',
      hi: 'स्कूल {{school}} की ओर से: ₹{{amount}} की स्कूल फ़ीस {{due_date}} को देय थी और अभी बाक़ी है। क्या देय है यह देखें और यहाँ भुगतान करें: {{pay_link}} अगर आपको और समय चाहिए, तो कृपया स्कूल दफ़्तर को बताएँ।',
    },
  },
  {
    name: 'fee_payment_initiated',
    version: 2,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 720,
    variables: ['school', 'amount', 'utr_last4'],
    body: {
      en: 'From {{school}}: We have noted your UPI payment of ₹{{amount}} (UTR ending {{utr_last4}}). The school will check it in its bank account and then send your receipt. Nothing more is needed from you now.',
      hi: 'स्कूल {{school}} की ओर से: हमने आपका ₹{{amount}} का UPI भुगतान (UTR के आख़िरी अंक {{utr_last4}}) दर्ज कर लिया है। स्कूल इसे अपने बैंक खाते में जाँचकर आपकी रसीद भेजेगा। अभी आपको और कुछ नहीं करना है।',
    },
  },
  {
    name: 'fee_receipt',
    version: 2,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 2880,
    variables: ['school', 'amount', 'receipt_no'],
    body: {
      en: 'From {{school}}: We have received your payment of ₹{{amount}}. Your receipt number is {{receipt_no}}. Thank you. Please keep this message for your records.',
      hi: 'स्कूल {{school}} की ओर से: आपका ₹{{amount}} का भुगतान मिल गया है। आपकी रसीद संख्या {{receipt_no}} है। धन्यवाद। कृपया यह संदेश अपने रिकॉर्ड के लिए रखें।',
    },
  },
  {
    // The day's update for a class, in the school's own words for that day, marked ready and sent by a person.
    name: 'daily_pulse',
    version: 2,
    category: 'utility',
    purpose: 'daily_pulse',
    staleAfterMinutes: 600,
    variables: ['school', 'update'],
    body: {
      en: 'From {{school}}: {{update}} Reply 1 if your child understood today’s lesson, or 2 if your child needs help.',
      hi: 'स्कूल {{school}} की ओर से: {{update}} अगर आपके बच्चे को आज का पाठ समझ आया तो 1 लिखें, और अगर मदद चाहिए तो 2 लिखें।',
    },
  },
  {
    // A notice written by staff and approved by the principal, for one class or for every class.
    name: 'class_notice',
    version: 2,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 1440,
    variables: ['school', 'class', 'notice'],
    body: {
      en: 'From {{school}}: Notice for {{class}}. {{notice}} For any question, please contact the school office.',
      hi: 'स्कूल {{school}} की ओर से: {{class}} के लिए सूचना। {{notice}} कोई सवाल हो तो कृपया स्कूल दफ़्तर से संपर्क करें।',
    },
  },
  {
    // Parent-teacher meetings (C193): one a guardian and teacher; the parent books by replying with a time.
    name: 'ptm_invitation',
    version: 2,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 2880,
    variables: ['school', 'date', 'teacher', 'children', 'from', 'to'],
    body: {
      en: 'From {{school}}: Parent-teacher meeting on {{date}}. {{teacher}} would like to meet you about {{children}}, between {{from}} and {{to}}. Reply with the time that suits you, for example 10:30, to book it.',
      hi: 'स्कूल {{school}} की ओर से: {{date}} को अभिभावक-शिक्षक बैठक है। {{teacher}} आपसे {{children}} के बारे में {{from}} से {{to}} के बीच मिलना चाहते हैं। जो समय आपको ठीक लगे वह लिखकर भेजें, जैसे 10:30, और वह आपके लिए तय हो जाएगा।',
    },
  },
  {
    name: 'ptm_booked',
    version: 2,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 1440,
    variables: ['school', 'date', 'time', 'teacher'],
    body: {
      en: 'From {{school}}: Your meeting with {{teacher}} is booked for {{time}} on {{date}}. To change it, reply with another time.',
      hi: 'स्कूल {{school}} की ओर से: {{teacher}} के साथ आपकी बैठक {{date}} को {{time}} पर तय है। बदलने के लिए दूसरा समय लिखकर भेजें।',
    },
  },
  {
    name: 'ptm_time_not_free',
    version: 2,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 720,
    variables: ['school', 'teacher', 'times'],
    body: {
      en: 'From {{school}}: That time is not free with {{teacher}}. The free times are {{times}}. Reply with one of them to book it.',
      hi: 'स्कूल {{school}} की ओर से: {{teacher}} के साथ वह समय ख़ाली नहीं है। ख़ाली समय ये हैं: {{times}}। इनमें से एक लिखकर भेजें।',
    },
  },
  {
    name: 'ptm_reminder',
    version: 2,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 900,
    variables: ['school', 'date', 'time', 'teacher'],
    body: {
      en: 'From {{school}}: A reminder that your meeting with {{teacher}} is at {{time}} on {{date}}. Please be on time.',
      hi: 'स्कूल {{school}} की ओर से: याद दिला दें कि {{teacher}} के साथ आपकी बैठक {{date}} को {{time}} पर है। कृपया समय पर आएँ।',
    },
  },
  {
    name: 'ptm_cancelled',
    version: 2,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 1440,
    variables: ['school', 'date', 'teacher'],
    body: {
      en: 'From {{school}}: The parent-teacher meeting on {{date}} has been cancelled, so your meeting with {{teacher}} will not take place. We are sorry for the change.',
      hi: 'स्कूल {{school}} की ओर से: {{date}} की अभिभावक-शिक्षक बैठक रद्द हो गई है, इसलिए {{teacher}} के साथ आपकी बैठक नहीं होगी। बदलाव के लिए खेद है।',
    },
  },
  {
    // School events (C194): to the guardians of the invited classes only; YES and NO are counted.
    name: 'event_invitation',
    version: 2,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 2880,
    variables: ['school', 'title', 'when', 'details'],
    body: {
      en: 'From {{school}}: You are invited to {{title}} on {{when}}. {{details}} Reply YES if you will come, or NO if you cannot.',
      hi: 'स्कूल {{school}} की ओर से: आपको {{when}} को {{title}} में बुलाया गया है। {{details}} आएँगे तो YES लिखकर भेजें, नहीं आ सकेंगे तो NO।',
    },
  },
  {
    name: 'event_reminder',
    version: 2,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 900,
    variables: ['school', 'title', 'when'],
    body: {
      en: 'From {{school}}: A reminder that {{title}} is on {{when}}. We look forward to seeing you.',
      hi: 'स्कूल {{school}} की ओर से: याद दिला दें कि {{when}} को {{title}} है। हमें आपका इंतज़ार रहेगा।',
    },
  },
  {
    name: 'event_cancelled',
    version: 2,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 1440,
    variables: ['school', 'title', 'when'],
    body: {
      en: 'From {{school}}: {{title}} on {{when}} has been cancelled. We are sorry for the change.',
      hi: 'स्कूल {{school}} की ओर से: {{when}} का {{title}} रद्द हो गया है। बदलाव के लिए खेद है।',
    },
  },
  {
    // Complaints (C195): the parent is told at each step: noted, passed to the principal, closed with what was done.
    name: 'complaint_received',
    version: 2,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 1440,
    variables: ['school', 'ref', 'owner', 'due'],
    body: {
      en: 'From {{school}}: We have noted your concern (reference {{ref}}). {{owner}} will look into it and reply to you by {{due}}. Thank you for telling us.',
      hi: 'स्कूल {{school}} की ओर से: हमने आपकी बात दर्ज कर ली है (संदर्भ {{ref}})। {{owner}} इसे देखेंगे और {{due}} तक आपको जवाब देंगे। हमें बताने के लिए धन्यवाद।',
    },
  },
  {
    name: 'complaint_escalated',
    version: 2,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 1440,
    variables: ['school', 'ref'],
    body: {
      en: 'From {{school}}: Your concern (reference {{ref}}) has not been settled in time, so it has been passed to the principal, who will look into it.',
      hi: 'स्कूल {{school}} की ओर से: आपकी बात (संदर्भ {{ref}}) समय पर नहीं सुलझी, इसलिए इसे प्रिंसिपल को सौंप दिया गया है, जो इसे देखेंगे।',
    },
  },
  {
    // Overdue, and about the principal: it passes to the school admin, so the words do not name the principal (C200).
    name: 'complaint_escalated_office',
    version: 2,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 1440,
    variables: ['school', 'ref'],
    body: {
      en: 'From {{school}}: Your concern (reference {{ref}}) has not been settled in time, so it has been passed to the school office, who will look into it.',
      hi: 'स्कूल {{school}} की ओर से: आपकी बात (संदर्भ {{ref}}) समय पर नहीं सुलझी, इसलिए इसे स्कूल कार्यालय को सौंप दिया गया है, जो इसे देखेगा।',
    },
  },
  {
    name: 'complaint_closed',
    version: 2,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 1440,
    variables: ['school', 'ref', 'note'],
    body: {
      en: 'From {{school}}: About your concern (reference {{ref}}): {{note}} If this does not settle it, reply to this message.',
      hi: 'स्कूल {{school}} की ओर से: आपकी बात (संदर्भ {{ref}}) के बारे में: {{note}} अगर इससे बात न सुलझे, तो इस संदेश का जवाब दें।',
    },
  },
  {
    // Parent AI v1 (C196): an answer to "what can I do at home?", read and approved by a person before it goes.
    name: 'home_help',
    version: 2,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 1440,
    variables: ['school', 'child', 'answer'],
    body: {
      en: 'From {{school}}: What you can do at home for {{child}}. {{answer}} If you have a question, please ask the school office.',
      hi: 'स्कूल {{school}} की ओर से: {{child}} के लिए आप घर पर क्या कर सकते हैं। {{answer}} कोई सवाल हो तो कृपया स्कूल दफ़्तर से पूछें।',
    },
  },
  {
    name: 'messages_stopped',
    version: 2,
    category: 'utility',
    purpose: 'core_records',
    staleAfterMinutes: 60,
    variables: ['school'],
    body: {
      en: 'From {{school}}: You will not get WhatsApp messages from the school any more. To start them again, please tell the school office.',
      hi: 'स्कूल {{school}} की ओर से: अब आपको स्कूल से WhatsApp संदेश नहीं मिलेंगे। इन्हें फिर शुरू करने के लिए कृपया स्कूल दफ़्तर को बताएँ।',
    },
  },
  {
    // The student data check (C222): the details where the school record and Aadhaar as printed differ, drafted by
    // the office and sent by a person. The parent's reply in this conversation is kept with the request. The
    // details are a name, a date of birth or a gender only: never an Aadhaar number (the app and the database refuse one).
    name: 'data_check_request',
    version: 2,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 2880,
    variables: ['school', 'child', 'details'],
    body: {
      en: 'From {{school}}: For UDISE+ and APAAR, {{child}}’s details in the school record must match Aadhaar. These differ: {{details}}. Please reply here with the correct details, or tell the school office. Please do not send the Aadhaar number.',
      hi: 'स्कूल {{school}} की ओर से: UDISE+ और APAAR के लिए {{child}} का स्कूल रिकॉर्ड आधार से मेल खाना चाहिए। ये अलग हैं: {{details}}। कृपया यहीं सही जानकारी लिखकर भेजें, या स्कूल दफ़्तर को बताएँ। कृपया आधार नंबर न भेजें।',
    },
  },
  {
    // Certificates (C228): a certificate issued from the record, sent to the family by a person. The link opens the
    // PDF for 30 days while the certificate stands; nothing about the child is in the words beyond the name and number.
    name: 'certificate_issued',
    version: 2,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 2880,
    variables: ['school', 'child', 'certificate', 'number', 'link'],
    body: {
      en: 'From {{school}}: {{child}}’s {{certificate}} (No. {{number}}) is ready. Download the PDF here: {{link}} The signed paper can be collected from the school office.',
      hi: 'स्कूल {{school}} की ओर से: {{child}} का {{certificate}} (संख्या {{number}}) तैयार है। PDF यहाँ से डाउनलोड करें: {{link}} हस्ताक्षर वाला काग़ज़ स्कूल दफ़्तर से लिया जा सकता है।',
    },
  },
  {
    // AI answer-sheet marking (C351): a published result, sent to a family by a person in the office after seeing who
    // will get it, one message per child and guardian per publication. The link opens the child's own published result
    // (and, while the school lets families see them, the checked pages) for 30 days, and stops once the class is
    // reopened. No mark, grade or remark is in the words: only the school, the child, the exam and the link. Sent under
    // the same purpose as a certificate's link to its PDF, and worth sending for two days.
    name: 'exam_result_ready',
    version: 1,
    category: 'utility',
    purpose: 'operational_communication',
    staleAfterMinutes: 2880,
    variables: ['school', 'child', 'exam', 'link'],
    body: {
      en: 'From {{school}}: {{child}}’s result for {{exam}} is ready. See it here: {{link}} The link is private to your family and works for 30 days.',
      hi: 'स्कूल {{school}} की ओर से: {{child}} के {{exam}} का परिणाम तैयार है। यहाँ देखें: {{link}} यह लिंक सिर्फ़ आपके परिवार के लिए है और 30 दिन तक चलेगा।',
    },
  },
];

const VARIABLE = /\{\{([a-z0-9_]+)\}\}/g;
export const variablesIn = (body: string): string[] => [...new Set([...body.matchAll(VARIABLE)].map((m) => m[1]))];

// Meta's rules for a template's body, in words; null when it keeps them all (C344).
export const WORDS_PER_PLACEHOLDER = 3;
export function metaShapeProblem(body: string): string | null {
  const found = [...body.matchAll(VARIABLE)];
  if (body.length > 1024) return 'is longer than 1024 characters';
  if (/\n\s*\n\s*\n/.test(body)) return 'has more than one blank line between paragraphs';
  if (!found.length) return null;
  const word = /\p{L}/u;
  if (!word.test(body.slice(0, found[0].index))) return 'begins with a placeholder';
  const last = found[found.length - 1];
  if (!word.test(body.slice((last.index ?? 0) + last[0].length))) return 'ends with a placeholder';
  const names = found.map((m) => m[1]);
  if (new Set(names).size !== names.length) return 'uses a placeholder more than once';
  for (let i = 1; i < found.length; i++) {
    const between = body.slice((found[i - 1].index ?? 0) + found[i - 1][0].length, found[i].index);
    if (between.trim() === '') return `has {{${found[i - 1][1]}}} and {{${found[i][1]}}} next to each other`;
  }
  const words = body.replace(VARIABLE, ' ').split(/\s+/).filter((w) => word.test(w)).length;
  if (words < WORDS_PER_PLACEHOLDER * found.length) return `has ${found.length} placeholders for ${words} words (at least ${WORDS_PER_PLACEHOLDER} words each)`;
  return null;
}

// Meta's numbered form of a body: each placeholder becomes its place in the body ({{school}} → {{1}}, ...), so the
// numbers always run in order. A send gives its values in placeholderOrder(body), the same order.
export const placeholderOrder = variablesIn;
export function positionalBody(body: string): string {
  const order = placeholderOrder(body);
  return body.replace(VARIABLE, (_, name: string) => `{{${order.indexOf(name) + 1}}}`);
}
// What is wrong with a definition, in words; null when nothing is. The tests run it over the whole registry.
export function definitionProblem(d: TemplateDefinition): string | null {
  if (!/^[a-z][a-z0-9_]{2,60}$/.test(d.name)) return 'the name is lower case letters, digits and underscores';
  if (!Number.isInteger(d.version) || d.version < 1) return 'the version is a whole number from 1';
  if (!d.variables.includes('school')) return 'the school is not among the variables';
  for (const lang of TEMPLATE_LANGUAGES) {
    const body = d.body[lang];
    if (typeof body !== 'string' || !body.startsWith(SCHOOL_PREFIX[lang])) return `the ${lang} body does not begin with the school's name`;
    const shape = metaShapeProblem(body);
    if (shape) return `the ${lang} body ${shape}`;
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
      where template_name = $2 and (school_id = $1 or school_id is null) and status = 'approved' and body is not null and language in ($3, 'en') and ($4 = false or meta_status = 'approved')
        -- Words in a language other than English go out only once a reader of that language has reviewed them (C190).
        and (language = 'en' or wording_reviewed)
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

export type TemplateRow = { id: string; name: string; version: number; language: TemplateLanguage; body: string | null; variables: string[]; category: string; staleAfterMinutes: number | null; status: 'approved' | 'pending' | 'rejected'; approvedByName: string | null; approvedAt: string | null; metaStatus: string; metaTemplateId: string | null; metaDecidedAt: string | null; inCode: boolean; sendsNow: boolean; wordingReviewed: boolean; wordingReviewedNote: string | null };
export const META_STATUSES = ['not_submitted', 'pending', 'approved', 'rejected', 'paused'] as const;

// Every version in the code that the database does not yet hold is written, waiting for approval. A row of a code
// version with no words is given its words once, and waits for approval like the rest. Nothing already written is
// changed. A row from before versions keeps no words and never sends (templateToSend). Returns how many were added.
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
    `select t.id, t.template_name, t.version, t.language, t.body, t.variables, t.billing_category, t.stale_after_minutes, t.status::text as status, u.display_name as approved_by_name, t.approved_at, t.meta_status, t.meta_template_id, t.meta_decided_at, t.wording_reviewed, t.wording_reviewed_note,
            t.version = (select max(n.version) from whatsapp_templates n where n.school_id is null and n.template_name = t.template_name and n.language = t.language and n.status = 'approved' and n.body is not null and (n.language = 'en' or n.wording_reviewed)) as sends_now
       from whatsapp_templates t left join users u on u.user_id = t.approved_by
      where t.school_id is null order by t.template_name, t.language, t.version desc`
  );
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return rows.map((r) => ({ id: r.id, name: r.template_name, version: r.version, language: r.language, body: r.body, variables: r.variables ?? [], category: r.billing_category, staleAfterMinutes: r.stale_after_minutes, status: r.status, approvedByName: r.approved_by_name ?? null, approvedAt: iso(r.approved_at), metaStatus: r.meta_status, metaTemplateId: r.meta_template_id, metaDecidedAt: iso(r.meta_decided_at), inCode: TEMPLATE_REGISTRY.some((d) => d.name === r.template_name && d.version === r.version && d.body[r.language as TemplateLanguage] === r.body), sendsNow: r.sends_now === true, wordingReviewed: r.wording_reviewed === true, wordingReviewedNote: r.wording_reviewed_note ?? null }));
}

export type TemplateActionResult = { ok: true } | { ok: false; reason: 'not_found' | 'no_words' | 'not_in_code' | 'meta_status' | 'meta_id' | 'note' | 'english' };

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

// --- Meta's review, from Control and from Meta itself (C345) ------------------------------------------------------
// Meta keeps ONE template per name and language, and sends by name: whichever version we pick, Meta sends the words
// it holds. So a version is "approved by Meta" only when Meta's words are its words.

export type MetaStatus = (typeof META_STATUSES)[number];
const META_STATE: Record<string, MetaStatus> = {
  APPROVED: 'approved',
  REINSTATED: 'approved',
  PENDING: 'pending',
  IN_APPEAL: 'pending',
  REJECTED: 'rejected',
  DISABLED: 'rejected',
  DELETED: 'rejected',
  PENDING_DELETION: 'rejected',
  ARCHIVED: 'rejected',
  PAUSED: 'paused',
  // Meta's notice that a template's words were changed: it waits until Meta's words are read again.
  COMPONENTS_UPDATE: 'pending',
};

// Meta's word for a template's state, as ours; null when there is nothing for us to change (a quality warning, a
// lock, a limit). A template Meta files in another category than ours never sends: it would be priced, and need
// consent, as that category.
export function metaStatusOf(state: string, metaCategory: string | null, ourCategory: string): MetaStatus | null {
  const ours = META_STATE[state.toUpperCase()] ?? null;
  return ours === 'approved' && metaCategory && metaCategory.toLowerCase() !== ourCategory ? 'rejected' : ours;
}

export type SubmitProblem = 'not_found' | 'no_words' | 'not_in_code' | 'not_approved' | 'not_reviewed' | 'category' | 'already' | 'other_version' | 'no_example';
const inCode = (r: { template_name: string; version: number; language: string; body: string | null }) =>
  TEMPLATE_REGISTRY.some((d) => d.name === r.template_name && d.version === r.version && d.body[r.language as TemplateLanguage] === r.body);

// What Control may send to Meta for review: a utility version whose words a person here approved and are still the
// code's (Hindi read by a reader of Hindi), never sent before, while no other version of its name and language is
// with Meta (a change of words at Meta is not built). The words are numbered as Meta numbers them, with an example.
export async function submissionFor(db: Sql, id: string): Promise<{ ok: true; draft: MetaTemplateDraft } | { ok: false; reason: SubmitProblem }> {
  const row = (await db.query(`select id, template_name, version, language, body, billing_category, status::text as status, meta_status, meta_template_id, wording_reviewed from whatsapp_templates where id = $1 and school_id is null`, [id])).rows[0];
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.body === null) return { ok: false, reason: 'no_words' };
  if (!inCode(row)) return { ok: false, reason: 'not_in_code' };
  if (row.status !== 'approved') return { ok: false, reason: 'not_approved' };
  if (row.language !== 'en' && !row.wording_reviewed) return { ok: false, reason: 'not_reviewed' };
  if (row.billing_category !== 'utility') return { ok: false, reason: 'category' };
  if (row.meta_status !== 'not_submitted' || row.meta_template_id) return { ok: false, reason: 'already' };
  const other = await db.query(`select 1 from whatsapp_templates where school_id is null and template_name = $1 and language = $2 and id <> $3 and (meta_template_id is not null or meta_status <> 'not_submitted') limit 1`, [row.template_name, row.language, id]);
  if (other.rows.length) return { ok: false, reason: 'other_version' };
  const language = row.language as TemplateLanguage;
  const example = placeholderOrder(row.body).map((v) => templateExample(row.template_name, v, language));
  if (example.some((e) => e === null)) return { ok: false, reason: 'no_example' };
  return { ok: true, draft: { name: row.template_name, language, text: positionalBody(row.body), example: example as string[] } };
}

// Meta took the template: its id, and its state so far. Recorded only on a version that has no Meta id yet.
export async function recordSubmission(db: Sql, id: string, made: { id: string; status: string; category: string | null }): Promise<MetaStatus> {
  const row = (await db.query(`select billing_category from whatsapp_templates where id = $1 and school_id is null`, [id])).rows[0];
  const status = metaStatusOf(made.status, made.category, row?.billing_category ?? 'utility') ?? 'pending';
  await db.query(`update whatsapp_templates set meta_status = $2, meta_template_id = $3, meta_decided_at = now() where id = $1 and school_id is null and meta_template_id is null`, [id, status, made.id]);
  return status;
}

export type MetaReconciled = { found: number; changed: number; otherWords: string[] };

// "Refresh from Meta": each of Meta's templates in our two languages is matched, by name and language, to the
// version of ours whose numbered words are Meta's words, which takes Meta's id and state. Every other version of
// that name and language stops counting as approved by Meta (Meta would send them with the matched words). Where
// Meta holds words that are none of ours, no version of that name and language counts as approved by Meta.
export async function reconcileWithMeta(db: Sql, templates: readonly MetaTemplate[]): Promise<MetaReconciled> {
  const rows = (await db.query(`select id, template_name, version, language, body, billing_category, meta_status, meta_template_id from whatsapp_templates where school_id is null and body is not null`)).rows;
  const out: MetaReconciled = { found: 0, changed: 0, otherWords: [] };
  for (const t of templates) {
    const language = t.language === 'en' || t.language === 'hi' ? t.language : null;
    const ours = rows.filter((r) => r.template_name === t.name && r.language === language);
    if (!language || !ours.length) continue;
    const same = t.body === null ? undefined : ours.find((r) => positionalBody(r.body) === t.body);
    const others = await db.query(
      `update whatsapp_templates set meta_status = 'not_submitted', meta_template_id = null, meta_decided_at = now()
        where school_id is null and template_name = $1 and language = $2 and id is distinct from $3 and (meta_status <> 'not_submitted' or meta_template_id is not null)`,
      [t.name, language, same?.id ?? null]
    );
    out.changed += others.rowCount ?? 0;
    if (!same) {
      out.otherWords.push(`${t.name} (${language})`);
      continue;
    }
    out.found += 1;
    const status = metaStatusOf(t.status, t.category, same.billing_category) ?? (same.meta_template_id === t.id ? same.meta_status : 'pending');
    if (status === same.meta_status && same.meta_template_id === t.id) continue;
    await db.query(`update whatsapp_templates set meta_status = $2, meta_template_id = $3, meta_decided_at = now() where id = $1`, [same.id, status, t.id]);
    out.changed += 1;
  }
  return out;
}

// Whether Meta's word for a review makes a template approved (so the webhook must read Meta's words first).
export const raisesToApproved = (event: string) => META_STATE[event.toUpperCase()] === 'approved';

// Meta's webhook says a template's review moved: the version holding that Meta id takes the new state. An id none of
// ours holds changes nothing ("Refresh from Meta" matches by words). Moving down (pending, paused, rejected) is taken
// as said. Moving UP to approved needs Meta's words, read before the transaction (`metaWords`): Meta keeps a
// template's id when its words are changed, so an approval of other words must not approve ours (review of C345).
// Words that are ours: approved. Other words: this version no longer holds Meta's id. No words: nothing changes.
export async function applyTemplateStatus(db: Sql, n: { metaTemplateId: string; event: string; category: string | null }, metaWords?: ReadonlyMap<string, string | null>): Promise<'applied' | 'stale' | 'unknown'> {
  const rows = (await db.query(`select id, body, billing_category, meta_status from whatsapp_templates where school_id is null and meta_template_id = $1 for update`, [n.metaTemplateId])).rows;
  if (!rows.length) return 'unknown';
  let applied = false;
  for (const r of rows) {
    const status = metaStatusOf(n.event, n.category, r.billing_category);
    if (status === null || status === r.meta_status) continue;
    if (status === 'approved') {
      const words = metaWords?.get(n.metaTemplateId);
      if (words === undefined || words === null) continue;
      if (r.body === null || positionalBody(r.body) !== words) {
        await db.query(`update whatsapp_templates set meta_status = 'not_submitted', meta_template_id = null, meta_decided_at = now() where id = $1`, [r.id]);
        applied = true;
        continue;
      }
    }
    await db.query(`update whatsapp_templates set meta_status = $2, meta_decided_at = now() where id = $1`, [r.id, status]);
    applied = true;
  }
  return applied ? 'applied' : 'stale';
}

// A reader of the language has read this version's words (C190): who, as the founder writes it down, and when.
// Only for a language other than English; it cannot be taken back, because a version's words never change.
export async function markWordingReviewed(db: Sql, by: { userId: string }, id: string, noteRaw: string): Promise<TemplateActionResult> {
  const note = noteRaw.trim().replace(/\s+/g, ' ').slice(0, 200);
  if (!note) return { ok: false, reason: 'note' };
  const row = (await db.query(`select language, body from whatsapp_templates where id = $1 and school_id is null for update`, [id])).rows[0];
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.language === 'en') return { ok: false, reason: 'english' };
  if (row.body === null) return { ok: false, reason: 'no_words' };
  await db.query(`update whatsapp_templates set wording_reviewed = true, wording_reviewed_by = $2, wording_reviewed_at = now(), wording_reviewed_note = $3 where id = $1 and wording_reviewed = false`, [id, by.userId, note]);
  return { ok: true };
}
