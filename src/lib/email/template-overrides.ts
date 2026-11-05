import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import { PermanentJobError } from '@/lib/jobs/types';
import { EMAIL_TEMPLATES, escapeHtml, renderEmail, wrap } from './templates';

// Control → Templates → Email (W21-M6): the founder's own subject and words for the emails whose words are plain
// values (a school's name, a link), kept in control.settings as `email.template.<name>`. The others build their words
// from a kind, a language or a one-time code, and stay as the code writes them. A value is written into the words
// where its {name} stands, HTML-escaped, a link as a link. No override: the code's own words, as before. Every save
// and every return to the code's words needs a reason and writes one platform audit row.

type Sql = Pick<PoolClient, 'query'>;
export const EDITABLE_EMAILS: Readonly<Record<string, readonly string[]>> = {
  lead_received: ['schoolName', 'contactName'],
  application_verified: ['schoolName', 'city', 'reviewUrl'],
  added_to_school: ['schoolName', 'loginUrl'],
  ticket_raised: ['schoolName', 'category', 'ticketUrl'],
  ai_spend_alert: ['day', 'spentUsd', 'limitUsd', 'unpriced', 'url'],
};
export const SUBJECT_MAX = 150;
export const WORDS_MAX = 3000;
const REASON_MIN = 3;
const REASON_MAX = 200;
const settingKey = (template: string) => `email.template.${template}`;
const isLink = (name: string) => /url$/i.test(name);
const PLACEHOLDER = /\{([A-Za-z]+)\}/g;

export type EmailOverride = { subject: string; body: string };
export type EmailTemplateRow = { template: string; editable: boolean; placeholders: string[]; defaultSubject: string | null; defaultBody: string | null; override: (EmailOverride & { updatedAt: string }) | null };

// The code's own words with each value as its {name}: what the form starts from.
export function defaultWords(template: string): EmailOverride | null {
  const names = EDITABLE_EMAILS[template];
  if (!names) return null;
  const r = renderEmail(template, Object.fromEntries(names.map((n) => [n, `{${n}}`])));
  return { subject: r.subject, body: r.text.split('\n').filter(Boolean).join('\n\n') };
}

// The founder's words with the values written in. A value the job does not carry stops the email, as the code's own
// templates do (a permanent failure, never an email with a hole in it).
export function renderOverride(template: string, o: EmailOverride, data: Record<string, unknown>): { subject: string; html: string; text: string } {
  const value = (name: string) => {
    const v = data[name];
    if (typeof v !== 'string' || !v) throw new PermanentJobError(`email data is missing ${name}`);
    return v;
  };
  const plain = (s: string) => s.replace(PLACEHOLDER, (_, n: string) => value(n));
  const html = o.body
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(PLACEHOLDER, (_, n: string) => (isLink(n) ? `<a href="${escapeHtml(value(n))}" style="color:#1d4ed8">${escapeHtml(value(n))}</a>` : escapeHtml(value(n)))).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return { subject: plain(o.subject).replace(/[\r\n]+/g, ' '), html: wrap(html), text: plain(o.body) };
}

// What the founder sees before saving: the words with each value shown as [its name].
export function previewOverride(template: string, o: EmailOverride) {
  const names = EDITABLE_EMAILS[template] ?? [];
  return renderOverride(template, o, Object.fromEntries(names.map((n) => [n, `[${n}]`])));
}

export function checkOverride(template: string, raw: { subject?: unknown; body?: unknown }): { ok: true; words: EmailOverride } | { ok: false; code: 'not_editable' | 'bad_words' | 'unknown_value' } {
  const names = EDITABLE_EMAILS[template];
  if (!names) return { ok: false, code: 'not_editable' };
  const subject = typeof raw.subject === 'string' ? raw.subject.trim() : '';
  const body = typeof raw.body === 'string' ? raw.body.replace(/\r\n/g, '\n').trim() : '';
  if (!subject || subject.length > SUBJECT_MAX || /[\r\n]/.test(subject) || !body || body.length > WORDS_MAX) return { ok: false, code: 'bad_words' };
  for (const m of `${subject}\n${body}`.matchAll(PLACEHOLDER)) if (!names.includes(m[1])) return { ok: false, code: 'unknown_value' };
  return { ok: true, words: { subject, body } };
}

export async function readOverride(db: Sql, template: string): Promise<EmailOverride | null> {
  if (!EDITABLE_EMAILS[template]) return null;
  const v = (await db.query(`select value from control.settings where key = $1`, [settingKey(template)])).rows[0]?.value as Partial<EmailOverride> | undefined;
  return v && typeof v.subject === 'string' && typeof v.body === 'string' ? { subject: v.subject, body: v.body } : null;
}

export async function listEmailTemplates(db: Sql): Promise<EmailTemplateRow[]> {
  const { rows } = await db.query(`select key, value, updated_at from control.settings where key like 'email.template.%'`);
  const saved = new Map(rows.map((r: Record<string, unknown>) => [String(r.key), r]));
  return EMAIL_TEMPLATES.map((template) => {
    const names = EDITABLE_EMAILS[template];
    const d = defaultWords(template);
    const s = saved.get(settingKey(template)) as { value: Partial<EmailOverride>; updated_at: string | Date } | undefined;
    const override = names && s && typeof s.value?.subject === 'string' && typeof s.value?.body === 'string' ? { subject: s.value.subject, body: s.value.body, updatedAt: new Date(s.updated_at).toISOString() } : null;
    return { template, editable: Boolean(names), placeholders: [...(names ?? [])], defaultSubject: d?.subject ?? null, defaultBody: d?.body ?? null, override };
  });
}

export type SaveEmailResult = { ok: true } | { ok: false; code: 'not_editable' | 'bad_words' | 'unknown_value' | 'reason_required' };
const reasonOf = (v: unknown) => {
  const r = typeof v === 'string' ? v.trim() : '';
  return r.length >= REASON_MIN && r.length <= REASON_MAX ? r : null;
};
const shape = (o: EmailOverride | null) => (o ? { subject: o.subject, body_chars: o.body.length } : null);

// Save the founder's words (or, with reset, go back to the code's own), with a reason; one platform audit row.
export async function saveEmailTemplate(db: Sql, by: { userId: string }, raw: { template?: unknown; subject?: unknown; body?: unknown; reset?: unknown; reason?: unknown }): Promise<SaveEmailResult> {
  const template = typeof raw.template === 'string' ? raw.template : '';
  if (!EDITABLE_EMAILS[template]) return { ok: false, code: 'not_editable' };
  const reason = reasonOf(raw.reason);
  if (!reason) return { ok: false, code: 'reason_required' };
  const before = await readOverride(db, template);
  if (raw.reset === true) {
    // Settings rows are never deleted (the platform role may not): a null value means the code's own words.
    await db.query(
      `insert into control.settings (key, value, updated_by) values ($1, 'null'::jsonb, $2) on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
      [settingKey(template), by.userId]
    );
    await writeAuditLog(db, { schoolId: null, actorUserId: by.userId, actorRole: 'super_admin', eventAction: 'email.template_reset', targetType: 'control.settings', targetId: settingKey(template), beforeState: { template, words: shape(before) }, afterState: { template, words: null, change_reason: reason } });
    return { ok: true };
  }
  const checked = checkOverride(template, raw);
  if (!checked.ok) return checked;
  await db.query(
    `insert into control.settings (key, value, updated_by) values ($1, $2::jsonb, $3) on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [settingKey(template), JSON.stringify(checked.words), by.userId]
  );
  await writeAuditLog(db, { schoolId: null, actorUserId: by.userId, actorRole: 'super_admin', eventAction: 'email.template_changed', targetType: 'control.settings', targetId: settingKey(template), beforeState: { template, words: shape(before) }, afterState: { template, words: shape(checked.words), change_reason: reason } });
  return { ok: true };
}
