// NO AADHAAR NUMBER, EVER (docs/28 section 3 rule 1): the ONE rule (C223-A answer 6, C225, C520). Its twin in the
// database is public.no_aadhaar_number(text) (supabase/migrations/20261114120000_c520_aadhaar_verhoeff.sql); both are
// run on the one shared list of cases in test/fixtures/aadhaar-cases.ts. Pure: no imports, so the website's free tools
// and the app's client screens import it as they are.
//
// How a text is read:
//   - Devanagari digits are digits.
//   - A NUMBER is a run of digits with spaces, tabs or hyphens allowed between its groups of digits, on ONE line:
//     "2345 6789 0124", "2345-6789-0124" and "2345  6789  0124" are each one number of three groups. A line break ends a
//     number (C520: a textbook column "1000 / 2000 / 3000" or a list of years one under the other is not one number;
//     an Aadhaar card prints its number on one line). Anything else (a letter, a slash, a point, a comma) ends it too.
//
// A CANDIDATE is twelve digits written the way Aadhaar is written:
//   (a) a group of exactly twelve digits ("234567890124"), even inside a longer number, except in a number written
//       with a "+" straight before it of at most fifteen digits (a phone with its country code, E.164: "+919876543210");
//   (b) exactly three groups of four digits in a row ("2345 6789 0124"), with no fourth group of four next to them
//       (a run of four or more groups of four is a table row or a list of years, "2021 2022 2023 2024"). A group of
//       another length next to them does not excuse them: "Aadhaar 2345 6789 0124 2 copies" is a candidate.
// A candidate is an Aadhaar number, and the text is refused, when
//   (1) its first digit is 2 to 9 (UIDAI never begins a number with 0 or 1),
//   (2) its last digit is the Verhoeff check digit of the first eleven, as every Aadhaar number's is, and
//   (3) its three blocks of four are not a counting sequence (the same step from the first to the second as from the
//       second to the third: "2024 2025 2026", "2000 4000 6000", "4444 4444 4444").
// Groupings that are not Aadhaar's ("125 250 375 500", "123456 789012", "12 34 56 78 90 12") are not candidates.
//
// C520 made the rule looser, never stricter: every text the C225 rule passed is still passed (test/privacy/aadhaar.test.ts
// checks this on a large random set). The checksum alone would still refuse about one twelve-digit textbook number in
// ten, so the candidates are narrowed first and the checksum is the last step, not the only one.

// The digits read as 0 to 9.
const DEVANAGARI_DIGITS = '०१२३४५६७८९';
// What may stand between two groups of one number: spaces (space, tab, the no-break and thin spaces) and hyphens (the
// hyphen-minus, the Unicode hyphens and dashes, the minus sign). Not a line break (C520). The database's twin lists the
// same.
export const NUMBER_SEPARATORS = ' \t   -‐‑‒–—−';

// Verhoeff's tables (the dihedral group D5 and its position permutation), as UIDAI uses for the last digit.
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

// True when the string of ASCII digits ends in its own Verhoeff check digit.
export function verhoeffValid(digits: string): boolean {
  let c = 0;
  for (let i = 0; i < digits.length; i++) c = VERHOEFF_D[c][VERHOEFF_P[i % 8][digits.charCodeAt(digits.length - 1 - i) - 48]];
  return c === 0;
}

// The Verhoeff check digit for a string of ASCII digits (for making up test numbers; never for reading a real one).
export function verhoeffDigit(digits: string): string {
  for (let d = 0; d <= 9; d++) if (verhoeffValid(digits + d)) return String(d);
  throw new Error('unreachable');
}

// Twelve ASCII digits: is it an Aadhaar number by (1), (2) and (3) above?
export function isAadhaarShaped(twelve: string): boolean {
  if (!/^[2-9][0-9]{11}$/.test(twelve)) return false;
  const a = Number(twelve.slice(0, 4));
  const b = Number(twelve.slice(4, 8));
  const c = Number(twelve.slice(8, 12));
  if (b - a === c - b) return false;
  return verhoeffValid(twelve);
}

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

function refusedNumber(plus: boolean, groups: string[]): boolean {
  const total = groups.reduce((n, g) => n + g.length, 0);
  const phone = plus && total <= 15;
  // (a) a group of exactly twelve digits.
  if (!phone && groups.some((g) => g.length === 12 && isAadhaarShaped(g))) return true;
  // (b) a run of exactly three groups of four.
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].length !== 4 || (i > 0 && groups[i - 1].length === 4)) continue;
    let j = i;
    while (j < groups.length && groups[j].length === 4) j++;
    if (j - i === 3 && isAadhaarShaped(groups[i] + groups[i + 1] + groups[i + 2])) return true;
  }
  return false;
}

function numbersOf(text: string): Found[] {
  const out: Found[] = [];
  for (const m of normalise(text).matchAll(NUMBER)) {
    const refused = refusedNumber(m[1] === '+', m[2].split(/ +/));
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
// the whole number, its separators included, so "2345  6789  0124" leaves nothing behind.
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
