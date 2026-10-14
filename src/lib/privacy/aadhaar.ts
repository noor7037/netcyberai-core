// NO AADHAAR NUMBER, EVER (docs/28 section 3 rule 1): the ONE rule (C223-A answer 6, C225). Its twin in the
// database is public.no_aadhaar_number(text) (supabase/migrations/*_c225_rte_closeout.sql); both are run on the one
// shared list of cases in test/fixtures/aadhaar-cases.ts. Pure: no imports, so the website's free tools and the
// app's client screens import it as they are.
//
// How a text is read:
//   - Devanagari digits are digits.
//   - A NUMBER is a run of digits with spaces or hyphens allowed between its groups of digits: "1234 5678 9012",
//     "1234-5678-9012" and "1234  5678  9012" are each one number of three groups. Any run of the separators below
//     joins two groups; anything else (a letter, a slash, a point, a comma) ends the number.
//
// A text is refused when one of its numbers
//   (1) has twelve digits in all, in groups of at least three digits each, or
//   (2) has a group of exactly twelve digits, or
//   (3) has three groups of exactly four digits in a row (the way Aadhaar prints its number).
// (1) leaves out a number with a group of one or two digits: dates and school years ("2025-26 - 2026-27",
// "01-04-25 - 31-03-26") and a phone with its country code ("91 98765 43210") are not Aadhaar's shapes (review of C225).
// A number written with a "+" straight before it, of at most fifteen digits (the most a phone number has, E.164), is a
// phone number with its country code ("+91 98765 43210", "+919876543210"): (1) and (2) do not apply to it, (3) still
// does. A longer "+" number is not a phone alone, and every rule applies ("+91 98765 43210 123456789012" is refused).
//
// So a longer number passes ("1234567890123456", a bank's UTR), and a twelve-digit number standing alone is refused
// wherever it stands in a sentence. A separator next to a further digit group JOINS that group to the number:
// "01-04-2026 - 31-03-2027" is one number of sixteen digits and passes. The printed
// form (3) and a twelve-digit group (2) are refused even inside a longer number, so "1234 5678 9012 3456" and
// "Aadhaar 1234 5678 9012 2 copies" are refused: rule 1 is never to keep an Aadhaar number, and a number that holds
// Aadhaar's printed shape is refused rather than let through. A twelve-digit IMPS or UPI reference is refused too.

// The digits read as 0 to 9.
const DEVANAGARI_DIGITS = '०१२३४५६७८९';
// What may stand between two groups of one number: spaces (space, tab, line breaks, the no-break and thin spaces)
// and hyphens (the hyphen-minus, the Unicode hyphens and dashes, the minus sign). The database's twin lists the same.
export const NUMBER_SEPARATORS = ' \t\n\r   -‐‑‒–—−';

// The text with each Devanagari digit as its ASCII digit and each separator as one space. Every character keeps its
// place (each is one UTF-16 unit, and every other character is copied as it is), so a place found here is the same
// place in the text.
function normalise(text: string): string {
  let out = '';
  for (const ch of text) {
    const digit = DEVANAGARI_DIGITS.indexOf(ch);
    out += digit >= 0 ? String(digit) : NUMBER_SEPARATORS.includes(ch) ? ' ' : ch;
  }
  return out;
}

// Each number of the text: where it starts and ends, whether a "+" stands straight before it, and its groups.
const NUMBER = /(\+?)([0-9]+(?: +[0-9]+)*)/g;
type Found = { start: number; end: number; refused: boolean };

function numbersOf(text: string): Found[] {
  const out: Found[] = [];
  for (const m of normalise(text).matchAll(NUMBER)) {
    const plus = m[1] === '+';
    const groups = m[2].split(/ +/).map((g) => g.length);
    const total = groups.reduce((a, b) => a + b, 0);
    let printed = false;
    for (let i = 0; i + 2 < groups.length; i++) if (groups[i] === 4 && groups[i + 1] === 4 && groups[i + 2] === 4) printed = true;
    const phone = plus && total <= 15;
    const refused = printed || (!phone && (groups.includes(12) || (total === 12 && groups.every((g) => g >= 3))));
    const start = (m.index ?? 0) + m[1].length;
    out.push({ start, end: start + m[2].length, refused });
  }
  return out;
}

// True when the text holds what the rule refuses: the app refuses it before the database does.
export function hasAadhaarNumber(text: string): boolean {
  return numbersOf(text).some((n) => n.refused);
}

// The text with every number the rule refuses replaced by `hidden` (a parent's WhatsApp reply is shown this way):
// the whole number, its separators included, so "1234  5678  9012" leaves nothing behind.
export function hideAadhaarNumbers(text: string, hidden: string): string {
  let out = '';
  let at = 0;
  for (const n of numbersOf(text)) {
    if (!n.refused) continue;
    out += text.slice(at, n.start) + hidden;
    at = n.end;
  }
  return out + text.slice(at);
}
