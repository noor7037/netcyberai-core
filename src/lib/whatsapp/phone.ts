// Phone numbers as WhatsApp wants them (C187): a plus sign, the country code, the number, nothing else.
// A ten-digit number with no country code is taken as Indian, since every school here is in India; that is a
// rule about how numbers are written, not a guess about whose number it is.

export function normalizePhone(raw: string): string | null {
  const plus = raw.trim().startsWith('+');
  const digits = raw.replace(/[^0-9]/g, '');
  if (plus) return /^[1-9][0-9]{7,14}$/.test(digits) ? `+${digits}` : null;
  if (/^[6-9][0-9]{9}$/.test(digits)) return `+91${digits}`;
  if (/^0[6-9][0-9]{9}$/.test(digits)) return `+91${digits.slice(1)}`;
  if (/^91[6-9][0-9]{9}$/.test(digits)) return `+${digits}`;
  return null;
}

// Every way a school may have written the same number down, as bare digits, for finding a guardian by it.
export function writtenForms(e164: string): string[] {
  const digits = e164.replace(/[^0-9]/g, '');
  return /^91[6-9][0-9]{9}$/.test(digits) ? [digits, digits.slice(2), `0${digits.slice(2)}`] : [digits];
}
