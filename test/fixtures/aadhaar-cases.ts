// The ONE list of cases for the Aadhaar-number rule (C223-A answer 6, C225). The same list is run against the app's
// hasAadhaarNumber and hideAadhaarNumbers (test/privacy/aadhaar.test.ts, with no database) and against the database's
// public.no_aadhaar_number (the same file, on the whole schema), so the two can never say different things.
// `refused`: what both answer. `masked`: what hideAadhaarNumbers leaves with '[hidden]' (only for a refused text).
// Every number here is made up.

export type AadhaarCase = { input: string; refused: boolean; masked?: string; why: string };

export const AADHAAR_CASES: readonly AadhaarCase[] = [
  // Refused: twelve digits standing alone, however they are written.
  { input: '123456789012', refused: true, masked: '[hidden]', why: 'twelve digits together' },
  { input: '1234 5678 9012', refused: true, masked: '[hidden]', why: 'Aadhaar’s printed form' },
  { input: '1234-5678-9012', refused: true, masked: '[hidden]', why: 'groups joined by hyphens' },
  { input: '1234  5678  9012', refused: true, masked: '[hidden]', why: 'several spaces between the groups' },
  { input: '1234 - 5678 - 9012', refused: true, masked: '[hidden]', why: 'spaces and hyphens between the groups' },
  { input: '१२३४ ५६७८ ९०१२', refused: true, masked: '[hidden]', why: 'Devanagari digits' },
  { input: '१२३४५६७८९०१२', refused: true, masked: '[hidden]', why: 'Devanagari digits together' },
  { input: 'Parent gave Aadhaar 1234 5678 9012 at the desk', refused: true, masked: 'Parent gave Aadhaar [hidden] at the desk', why: 'inside a sentence' },
  { input: 'Aadhaar123456789012', refused: true, masked: 'Aadhaar[hidden]', why: 'a letter ends a number, it does not lengthen it' },
  { input: 'IMPS 123456789012', refused: true, masked: 'IMPS [hidden]', why: 'a twelve-digit IMPS or UPI reference is refused too' },
  { input: '1234 5678–9012', refused: true, masked: '[hidden]', why: 'a no-break space and an en dash are separators' },
  { input: '1234\n5678\n9012', refused: true, masked: '[hidden]', why: 'line breaks are separators' },
  { input: '123 456 789 012', refused: true, masked: '[hidden]', why: 'twelve digits in all, in groups of three' },
  { input: '123456 789012', refused: true, masked: '[hidden]', why: 'twelve digits in all, in two groups of six' },
  { input: '+91 98765 43210 123456789012', refused: true, masked: '+[hidden]', why: 'a “+” number longer than a phone: a group of twelve is refused (review of C225)' },
  { input: '+919876543210 123456789012', refused: true, masked: '+[hidden]', why: 'the same, the phone written together (review of C225)' },
  { input: '1234 5678 9012 3456', refused: true, masked: '[hidden]', why: 'the printed form inside a longer number is still refused' },
  { input: 'Aadhaar 1234 5678 9012 2 copies', refused: true, masked: 'Aadhaar [hidden] copies', why: 'a following number does not hide the printed form' },
  { input: 'Ref 45 1234 5678 9012', refused: true, masked: 'Ref [hidden]', why: 'nor does a number before it' },
  { input: '123456789012 5', refused: true, masked: '[hidden]', why: 'a group of twelve digits is refused inside a longer number' },
  { input: '+1234 5678 9012', refused: true, masked: '+[hidden]', why: 'a “+” does not excuse the printed form' },
  { input: 'Two: 1111 2222 3333 and 4444-5555-6666.', refused: true, masked: 'Two: [hidden] and [hidden].', why: 'each one is hidden' },
  { input: 'RTE claim 2026-27: 1234 5678 9012', refused: true, masked: 'RTE claim 2026-27: [hidden]', why: 'a year range then a refused number: only the number goes' },

  // Passed: not an Aadhaar number.
  { input: '1234567890123456', refused: false, why: 'a longer number, such as a bank’s UTR' },
  { input: 'UTR 1234567890123456 of 3 October', refused: false, why: 'a longer UTR in a sentence' },
  { input: 'SBINR52026101400001234', refused: false, why: 'an RTGS reference' },
  { input: '1234567890123', refused: false, why: 'thirteen digits' },
  { input: '12345678901', refused: false, why: 'eleven digits' },
  { input: '01-04-2026 - 31-03-2027', refused: false, why: 'a date range: sixteen digits in one number' },
  { input: '1-4-2026 to 31-3-2027', refused: false, why: 'a date range in words' },
  { input: 'Fees for 2025-26 and 2026-27', refused: false, why: 'school years' },
  { input: 'PFMS 2025-26 - 2026-27', refused: false, why: 'two school years joined by a spaced dash (review of C225)' },
  { input: 'Claims for 2025-26 2026-27', refused: false, why: 'two school years side by side (review of C225)' },
  { input: 'Notification for 01-04-25 - 31-03-26', refused: false, why: 'a short date range (review of C225)' },
  { input: '12 34 56 78 90 12', refused: false, why: 'groups of two read as dates, not Aadhaar’s shapes (review of C225)' },
  { input: '98765 43210 12', refused: false, why: 'a phone number and a small number (review of C225)' },
  { input: '91 98765 43210', refused: false, why: 'a phone with its country code, without “+” (review of C225)' },
  { input: '+91 98765 43210', refused: false, why: 'a phone number with “+” and its country code' },
  { input: '+919876543210', refused: false, why: 'the same, written together' },
  { input: 'Phone 98765 43210', refused: false, why: 'a ten-digit phone number' },
  { input: 'Lottery 2026/14, list 3, number 14', refused: false, why: 'a slash and a comma end a number' },
  { input: '1234.5678.9012', refused: false, why: 'a point is not a separator' },
  { input: 'SBIN0001234 order', refused: false, why: 'an IFSC-like code' },
  { input: 'PFMS/HR/2026/0042', refused: false, why: 'a sanction order number' },
  { input: 'XXXX XXXX 9012', refused: false, why: 'a masked Aadhaar shows four digits only' },
  { input: 'Haryana RTE notification for 2026-27, Annexure A', refused: false, why: 'a source sentence' },
  { input: '', refused: false, why: 'nothing' },
];
