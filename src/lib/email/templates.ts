import { PermanentJobError } from '@/lib/jobs/types';

// Emails the app sends itself (C97). Every value that came from a form is
// HTML-escaped: a school name is data, never markup.

export type EmailTemplate = 'application_code' | 'application_verified' | 'added_to_school' | 'ticket_raised';
export const EMAIL_TEMPLATES: readonly EmailTemplate[] = ['application_code', 'application_verified', 'added_to_school', 'ticket_raised'];

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
    default:
      throw new PermanentJobError(`unknown email template ${template}`);
  }
}
