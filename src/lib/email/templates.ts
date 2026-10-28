import { t, type Lang } from '@/lib/i18n';
import { PermanentJobError } from '@/lib/jobs/types';

// Emails the app sends itself (C97). Every value that came from a form is
// HTML-escaped: a school name is data, never markup.

export type EmailTemplate = 'application_code' | 'application_verified' | 'added_to_school' | 'ticket_raised' | 'upi_waiting' | 'fee_reminder' | 'focus_notice' | 'ai_spend_alert';
export const EMAIL_TEMPLATES: readonly EmailTemplate[] = ['application_code', 'application_verified', 'added_to_school', 'ticket_raised', 'upi_waiting', 'fee_reminder', 'focus_notice', 'ai_spend_alert'];

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

type Rendered = { subject: string; html: string; text: string };

const wrap = (inner: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1e293b">` +
  `<p style="font-size:20px;font-weight:800;color:#0b1f4d;margin:0 0 16px">NetCyberAI</p>${inner}` +
  `<p style="font-size:12px;color:#64748b;margin-top:32px">NetCyberAI · Gurugram, Haryana, India</p></div>`;

function str(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  if (typeof v !== 'string' || !v) throw new PermanentJobError(`email data is missing ${key}`);
  return v;
}

export function renderEmail(template: string, data: Record<string, unknown>, secret: Record<string, unknown> = {}): Rendered {
  switch (template) {
    case 'application_code': {
      const code = str(secret, 'code');
      const school = str(data, 'schoolName');
      return {
        subject: `${code} is your NetCyberAI code`,
        html: wrap(
          `<p>Use this 6-digit code to confirm your email for <strong>${escapeHtml(school)}</strong>'s registration:</p>` +
            `<p style="font-size:32px;font-weight:800;letter-spacing:6px;margin:16px 0">${escapeHtml(code)}</p>` +
            `<p>It works for 15 minutes. If you did not register a school on NetCyberAI, ignore this email.</p>`
        ),
        text: `Your NetCyberAI code for ${school}'s registration: ${code}\nIt works for 15 minutes. If you did not register a school, ignore this email.`,
      };
    }
    case 'application_verified': {
      const school = str(data, 'schoolName');
      const city = str(data, 'city');
      const link = str(data, 'reviewUrl');
      return {
        subject: `New school application: ${school}, ${city}`,
        html: wrap(
          `<p>A school application was submitted and its email confirmed:</p>` +
            `<p><strong>${escapeHtml(school)}</strong>, ${escapeHtml(city)}</p>` +
            `<p><a href="${escapeHtml(link)}" style="color:#1d4ed8">Review it in the Control Plane</a></p>`
        ),
        text: `New school application (email confirmed): ${school}, ${city}\nReview: ${link}`,
      };
    }
    case 'added_to_school': {
      const school = str(data, 'schoolName');
      const link = str(data, 'loginUrl');
      return {
        subject: `You have been added to ${school} on NetCyberAI`,
        html: wrap(
          `<p>You now have access to <strong>${escapeHtml(school)}</strong> with your existing NetCyberAI account.</p>` +
            `<p><a href="${escapeHtml(link)}" style="color:#1d4ed8">Sign in</a> and choose the school.</p>`
        ),
        text: `You now have access to ${school} on NetCyberAI with your existing account. Sign in: ${link}`,
      };
    }
    // To the founder (C127): which school, what kind, and the link. Never
    // the ticket's own words: those stay in the app.
    // UPI payments waiting for the school to verify (C175). It says how many and how much: no child, no parent, no UTR.
    case 'upi_waiting': {
      const school = str(data, 'schoolName');
      const count = str(data, 'count');
      const amount = str(data, 'amount');
      const link = str(data, 'url');
      const one = count === '1';
      const lead =
        data.kind === 'alert'
          ? `${count} UPI payment${one ? ' has' : 's have'} waited two working days to be verified at ${school}.`
          : data.kind === 'reminder'
            ? `${count} UPI payment${one ? ' is' : 's are'} still waiting to be verified at ${school}.`
            : `${count} UPI payment${one ? ' is' : 's are'} waiting to be verified at ${school}.`;
      const why = 'A parent has paid by UPI and entered the UTR. They get their receipt only when someone at the school finds the payment in the school’s bank account and presses “Found in bank”. Nothing is confirmed by itself.';
      return {
        subject: `${data.kind === 'alert' ? 'Waiting two days: ' : data.kind === 'reminder' ? 'Reminder: ' : ''}${count} UPI payment${one ? '' : 's'} to verify (₹${amount})`,
        html: wrap(`<p><strong>${escapeHtml(lead)}</strong></p><p>Total reported: ₹${escapeHtml(amount)}</p><p>${escapeHtml(why)}</p><p><a href="${escapeHtml(link)}" style="color:#1d4ed8">Open Fees</a></p>`),
        text: `${lead}\nTotal reported: ₹${amount}\n${why}\nOpen Fees: ${link}`,
      };
    }
    // To a guardian (C179): the school, the amount, the date and the payment link. No child's name.
    case 'fee_reminder': {
      const school = str(data, 'schoolName');
      const amount = str(data, 'amount');
      const due = str(data, 'dueDate').split('-').reverse().join('-');
      const payUrl = typeof data.payUrl === 'string' ? data.payUrl : '';
      const lead = data.kind === 'after_7' ? `School fees of ₹${amount} were due on ${due} at ${school} and are still unpaid.` : data.kind === 'due_day' ? `School fees of ₹${amount} are due today (${due}) at ${school}.` : `School fees of ₹${amount} are due on ${due} at ${school}.`;
      const total = typeof data.total === 'string' && data.total ? ` With other fees due soon, ₹${data.total} in all.` : '';
      const how = payUrl ? 'You can pay with any UPI app from the link below. Your receipt is issued once the school has seen the payment in its bank account.' : 'Please pay at the school office.';
      const after = 'If you have already paid, or need more time, please tell the school office. This is an automatic reminder sent by NetCyberAI for the school.';
      return {
        subject: `${data.kind === 'after_7' ? 'Fees overdue' : 'Fee reminder'}: ₹${amount}, ${school}`,
        html: wrap(`<p><strong>${escapeHtml(lead)}</strong>${escapeHtml(total)}</p><p>${escapeHtml(how)}</p>${payUrl ? `<p><a href="${escapeHtml(payUrl)}" style="color:#1d4ed8">See what is due and pay</a></p>` : ''}<p>${escapeHtml(after)}</p>`),
        text: `${lead}${total}\n${how}${payUrl ? `\nSee what is due and pay: ${payUrl}` : ''}\n${after}`,
      };
    }
    // To the founders (W5-7, C394), from the AI upkeep job: the day's known AI cost reached the amount set in Control →
    // AI. Once a day. Answers with no price set have no cost, and are counted apart.
    case 'ai_spend_alert': {
      const day = str(data, 'day');
      const spent = str(data, 'spentUsd');
      const limit = str(data, 'limitUsd');
      const unpriced = str(data, 'unpriced');
      const link = str(data, 'url');
      const lead = `The AI services have cost US$${spent} so far today (${day}, India), at or over the alert of US$${limit} set in Control → AI.`;
      const more = unpriced !== '0' ? ` ${unpriced} answers today had no price set, so their cost is not in that figure.` : '';
      return {
        subject: `AI spend alert: US$${spent} today`,
        html: wrap(`<p><strong>${escapeHtml(lead)}</strong>${escapeHtml(more)}</p><p>Nothing has been switched off. To change the alert or the daily cap, open Control → AI.</p><p><a href="${escapeHtml(link)}" style="color:#1d4ed8">Open Control → AI</a></p>`),
        text: `${lead}${more}\nNothing has been switched off. To change the alert or the daily cap, open Control → AI.\nOpen: ${link}`,
      };
    }
    case 'ticket_raised': {
      const school = str(data, 'schoolName');
      const category = str(data, 'category');
      const link = str(data, 'ticketUrl');
      return {
        subject: `New support ticket: ${school}`,
        html: wrap(
          `<p>A support ticket was raised:</p>` +
            `<p><strong>${escapeHtml(school)}</strong><br>${escapeHtml(category)}</p>` +
            `<p><a href="${escapeHtml(link)}" style="color:#1d4ed8">Open it in the Control Plane</a></p>`
        ),
        text: `New support ticket from ${school}: ${category}\nOpen: ${link}`,
      };
    }
    // To a Family app parent (M2b-1, C305), queued by family.focus_sweep(): what happened to the Focus Lock on one of the
    // family's phones, and when, in the parent's language. No child's name, no app, no phone: the parent area says which.
    case 'focus_notice': {
      const kind = str(data, 'kind');
      if (kind !== 'stopped' && kind !== 'permissions' && kind !== 'clock') throw new PermanentJobError(`email data has an unknown kind ${kind}`);
      const at = new Date(str(data, 'at'));
      if (Number.isNaN(at.getTime())) throw new PermanentJobError('email data has no time');
      const lang: Lang = data.lang === 'hi' ? 'hi' : 'en';
      const time = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(at);
      const lead = t(lang, `fam.email.focus.${kind}`, { time });
      const more = t(lang, 'fam.email.focus.more');
      return { subject: t(lang, 'fam.email.focus.subject'), html: wrap(`<p><strong>${escapeHtml(lead)}</strong></p><p>${escapeHtml(more)}</p>`), text: `${lead}\n${more}` };
    }
    default:
      throw new PermanentJobError(`unknown email template ${template}`);
  }
}
