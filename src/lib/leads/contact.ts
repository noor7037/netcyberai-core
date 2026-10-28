// A lead's contact details, checked the same way on the website forms, the public intake route and Control's CSV
// import (W7-L). A phone number is kept as typed (contact_phone) and in international form (phone_e164: '+', the
// country code and the national number without its leading 0), so a number from Saudi Arabia typed as 0503071760
// with +966 chosen is stored as +966503071760 and can be dialled from anywhere.

export const COUNTRY_CODES = [
  { code: '+91', country: 'India' },
  { code: '+966', country: 'Saudi Arabia' },
  { code: '+971', country: 'UAE' },
  { code: '+974', country: 'Qatar' },
  { code: '+965', country: 'Kuwait' },
  { code: '+968', country: 'Oman' },
  { code: '+973', country: 'Bahrain' },
  { code: '+60', country: 'Malaysia' },
  { code: '+44', country: 'UK' },
  { code: '+1', country: 'US/Canada' },
] as const;

export const DEFAULT_COUNTRY_CODE = '+91';
// The select's value for "Other": a small text field takes the code.
export const OTHER_COUNTRY = 'other';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// '+' and 1 to 4 digits, the first not 0. "966", "+966" and "00966" all read as +966.
export function normaliseCountryCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.trim().replace(/^\+/, '').replace(/^00/, '');
  if (!/^[1-9][0-9]{0,3}$/.test(digits)) return null;
  return `+${digits}`;
}

// A trimmed, lower-cased address, or null when it is not one.
export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 200 || !EMAIL_RE.test(email)) return null;
  return email;
}

// The number in international form, or null when it cannot be one.
//   - Typed with its own '+' or '00' in front: taken as a full international number (8 to 15 digits).
//   - Otherwise the national part: its leading 0s go; the country code typed again in front of it goes too
//     (919876543210 with +91); India needs 10 digits, every other country 6 to 14, and the whole number at most 15.
export function toE164(countryCode: string, phone: string): string | null {
  const code = normaliseCountryCode(countryCode);
  if (!code) return null;
  const typed = phone.trim();
  if (/^(\+|00)/.test(typed)) {
    const digits = typed.replace(/^00/, '').replace(/\D/g, '');
    return /^[1-9][0-9]{7,14}$/.test(digits) ? `+${digits}` : null;
  }
  const codeDigits = code.slice(1);
  let national = typed.replace(/\D/g, '').replace(/^0+/, '');
  if (national.length >= 11 && national.startsWith(codeDigits) && national.length - codeDigits.length >= 6) {
    national = national.slice(codeDigits.length).replace(/^0+/, '');
  }
  const ok = code === '+91' ? national.length === 10 : national.length >= 6 && national.length <= 14;
  if (!ok || codeDigits.length + national.length > 15) return null;
  return `+${codeDigits}${national}`;
}
