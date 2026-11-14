// The ONE list of cases for the Aadhaar-number rule (C223-A answer 6, C225, C520). The same list is run against the
// app's hasAadhaarNumber and hideAadhaarNumbers (test/privacy/aadhaar.test.ts, with no database) and against the
// database's public.no_aadhaar_number (the same file, on the whole schema), so the two can never say different things.
// `refused`: what both answer. `masked`: what hideAadhaarNumbers leaves with '[hidden]' (only for a refused text).
//
// Every number here is made up. The refused ones are SYNTHETIC: twelve digits with a Verhoeff check digit computed for
// the test (verhoeffDigit in src/lib/privacy/aadhaar.ts), never a real person's number:
//   2345 6789 0124, 3456 7890 1238, 4567 8901 2341, 5271 8306 4926, 9876 5432 1096, 6123 4567 8904.

export type AadhaarCase = { input: string; refused: boolean; masked?: string; why: string };

export const AADHAAR_CASES: readonly AadhaarCase[] = [
  // Refused: an Aadhaar-shaped number (first digit 2 to 9, the Verhoeff check digit), however it is written.
  { input: '234567890124', refused: true, masked: '[hidden]', why: 'twelve digits together' },
  { input: '2345 6789 0124', refused: true, masked: '[hidden]', why: 'Aadhaar’s printed form' },
  { input: '2345-6789-0124', refused: true, masked: '[hidden]', why: 'groups joined by hyphens' },
  { input: '2345  6789  0124', refused: true, masked: '[hidden]', why: 'several spaces between the groups' },
  { input: '2345 - 6789 - 0124', refused: true, masked: '[hidden]', why: 'spaces and hyphens between the groups' },
  { input: '2345\t6789\t0124', refused: true, masked: '[hidden]', why: 'a tab is a space on the same line' },
  { input: '२३४५ ६७८९ ०१२४', refused: true, masked: '[hidden]', why: 'Devanagari digits' },
  { input: '२३४५६७८९०१२४', refused: true, masked: '[hidden]', why: 'Devanagari digits together' },
  { input: 'Parent gave Aadhaar 2345 6789 0124 at the desk', refused: true, masked: 'Parent gave Aadhaar [hidden] at the desk', why: 'inside a sentence' },
  { input: 'आधार संख्या: 3456 7890 1238', refused: true, masked: 'आधार संख्या: [hidden]', why: 'with the Hindi label' },
  { input: 'Aadhaar No. 5271 8306 4926', refused: true, masked: 'Aadhaar No. [hidden]', why: 'with the English label' },
  { input: 'Aadhaar234567890124', refused: true, masked: 'Aadhaar[hidden]', why: 'a letter ends a number, it does not lengthen it' },
  { input: 'IMPS 987654321096', refused: true, masked: 'IMPS [hidden]', why: 'a twelve-digit reference that has Aadhaar’s check digit is refused too' },
  { input: '2345 6789–0124', refused: true, masked: '[hidden]', why: 'a no-break space and an en dash are separators' },
  { input: 'Name: Asha\nAadhaar: 4567 8901 2341\nClass 5', refused: true, masked: 'Name: Asha\nAadhaar: [hidden]\nClass 5', why: 'on one line among other lines' },
  { input: 'Page 12\n2345 6789 0124\n3 x 4 = 12', refused: true, masked: 'Page 12\n[hidden]\n3 x 4 = 12', why: 'a line of its own among textbook lines' },
  { input: '+91 98765 43210 234567890124', refused: true, masked: '+[hidden]', why: 'a “+” number longer than a phone: a group of twelve is refused (review of C225)' },
  { input: '+919876543210 234567890124', refused: true, masked: '+[hidden]', why: 'the same, the phone written together (review of C225)' },
  { input: 'Aadhaar 2345 6789 0124 2 copies', refused: true, masked: 'Aadhaar [hidden] copies', why: 'a following small number does not hide the printed form' },
  { input: 'Ref 45 2345 6789 0124', refused: true, masked: 'Ref [hidden]', why: 'nor does a number before it' },
  { input: '234567890124 5', refused: true, masked: '[hidden]', why: 'a group of twelve digits is refused inside a longer number' },
  { input: '+2345 6789 0124', refused: true, masked: '+[hidden]', why: 'a “+” does not excuse the printed form' },
  { input: 'Two: 3456 7890 1238 and 4567-8901-2341.', refused: true, masked: 'Two: [hidden] and [hidden].', why: 'each one is hidden' },
  { input: 'RTE claim 2026-27: 6123 4567 8904', refused: true, masked: 'RTE claim 2026-27: [hidden]', why: 'a year range then a refused number: only the number goes' },

  // Passed: not an Aadhaar number.
  { input: '1234567890123456', refused: false, why: 'a longer number, such as a bank’s UTR' },
  { input: 'UTR 1234567890123456 of 3 October', refused: false, why: 'a longer UTR in a sentence' },
  { input: 'SBINR52026101400001234', refused: false, why: 'an RTGS reference' },
  { input: '2345678901245', refused: false, why: 'thirteen digits' },
  { input: '23456789012', refused: false, why: 'eleven digits' },
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
  { input: '+919876543216', refused: false, why: 'the same, written together, even when the twelve digits have the check digit' },
  { input: 'Phone 98765 43210', refused: false, why: 'a ten-digit phone number' },
  { input: 'Lottery 2026/14, list 3, number 14', refused: false, why: 'a slash and a comma end a number' },
  { input: '2345.6789.0124', refused: false, why: 'a point is not a separator' },
  { input: '2345 / 6789 / 0124', refused: false, why: 'a slash ends a number' },
  { input: '2345, 6789, 0124', refused: false, why: 'a comma ends a number' },
  { input: 'SBIN0001234 order', refused: false, why: 'an IFSC-like code' },
  { input: 'PFMS/HR/2026/0042', refused: false, why: 'a sanction order number' },
  { input: 'XXXX XXXX 0124', refused: false, why: 'a masked Aadhaar shows four digits only' },
  { input: 'Haryana RTE notification for 2026-27, Annexure A', refused: false, why: 'a source sentence' },
  { input: '', refused: false, why: 'nothing' },

  // Passed since C520: twelve digits that are not Aadhaar's (the check digit, the first digit, the shape).
  { input: '234567890123', refused: false, why: 'twelve digits without Aadhaar’s check digit (C520)' },
  { input: '2345 6789 0123', refused: false, why: 'the printed form without the check digit (C520)' },
  { input: '123456789010', refused: false, why: 'the check digit, but Aadhaar never begins with 1 (C520)' },
  { input: '1234 5678 9010', refused: false, why: 'the printed form beginning with 1 (C520)' },
  { input: '012345678906', refused: false, why: 'nor with 0 (C520)' },
  { input: '2345\n6789\n0124', refused: false, why: 'a line break ends a number: three numbers, one under the other (C520)' },
  { input: '2345\r\n6789\r\n0124', refused: false, why: 'the same with Windows line breaks (C520)' },
  { input: '123 456 789 012', refused: false, why: 'groups of three are not Aadhaar’s grouping (C520)' },
  { input: '234567 890124', refused: false, why: 'two groups of six are not Aadhaar’s grouping (C520)' },
  { input: '2345 6789 0124 3456', refused: false, why: 'four groups of four: a card number or a table row, not Aadhaar’s printed form (C520)' },
  { input: 'VID 9123 4567 8901 2345', refused: false, why: 'a sixteen-digit VID is not the Aadhaar number (C520)' },
];

// Textbook and homework pages (C520): what a maths or EVS photo reads as. Every one MUST pass. Several are chosen
// because their twelve digits DO have a valid Verhoeff check digit, so they pass only because of the narrowed
// candidates (the grouping, the line breaks, the counting sequence), not by luck.
export const TEXTBOOK_PASS_CASES: readonly AadhaarCase[] = [
  // The four lines the founder's photos were refused for.
  { input: '100 200 300 400', refused: false, why: 'a number line in hundreds' },
  { input: '125 250 375 500', refused: false, why: 'a number line in steps of 125' },
  { input: '2024 2025 2026', refused: false, why: 'three years on one line' },
  { input: '1000 /\n2000 /\n3000', refused: false, why: 'thousands one under the other, with slashes' },
  // Valid Verhoeff by chance, passed by the narrowed candidates.
  { input: '2023 2024 2025', refused: false, why: 'three years whose twelve digits have a check digit: a counting sequence' },
  { input: '2022 2023 2024 2025', refused: false, why: 'four years on one line: a run of four groups of four' },
  { input: '210 420 630 840', refused: false, why: 'a times-table row in groups of three (check digit by chance)' },
  { input: '2001 4002 6003', refused: false, why: 'a times-table row of four-digit numbers: a counting sequence (check digit by chance)' },
  { input: '2008 4016 6024', refused: false, why: 'the same in steps of 2008' },
  { input: 'Mumbai 400007 Delhi 110001', refused: false, why: 'two pin codes (check digit by chance as one run)' },
  { input: '400007 110001', refused: false, why: 'two pin codes side by side' },
  { input: '2592\n6789\n0124', refused: false, why: 'an addition column, one number per line (check digit by chance)' },
  // Times tables, number lines and place value.
  { input: '7 x 1 = 7\n7 x 2 = 14\n7 x 3 = 21\n7 x 4 = 28\n7 x 5 = 35\n7 x 6 = 42', refused: false, why: 'a times table' },
  { input: '12 x 12 = 144   13 x 13 = 169   14 x 14 = 196', refused: false, why: 'squares on one line' },
  { input: '0  10  20  30  40  50  60  70  80  90  100', refused: false, why: 'a number line in tens' },
  { input: '1000 2000 3000 4000 5000 6000', refused: false, why: 'a number line in thousands' },
  { input: '5000 5500 6000 6500', refused: false, why: 'a number line in steps of 500' },
  { input: 'Th  H  T  O\n4   3  2  1\n7   0  5  6', refused: false, why: 'a place-value table' },
  { input: 'Lakh Ten-thousand Thousand Hundred Ten One\n3 4 5 6 7 8\n9 8 7 6 5 4', refused: false, why: 'an Indian place-value table' },
  { input: '3,45,67,890  and  23,45,67,890', refused: false, why: 'numbers written with Indian commas' },
  { input: '2345 6789 0124 5678 9012', refused: false, why: 'a row of five four-digit numbers to add' },
  { input: '1947 1950 1952 1965 1971', refused: false, why: 'a list of years in history' },
  { input: '2019\n2020\n2021\n2022\n2023\n2024', refused: false, why: 'a list of years one under the other' },
  { input: 'Call 9876543210 or 9123456780', refused: false, why: 'ten-digit phone numbers' },
  { input: '98765 43210, 91234 56780', refused: false, why: 'phone numbers in two groups' },
  // Long multiplication and division layouts.
  { input: '   4 5 6 7\n x 2 3 8 9\n ---------\n  4 1 1 0 3\n 3 6 5 3 6 0\n1 3 7 0 1 0 0\n9 1 3 4 0 0 0', refused: false, why: 'long multiplication written digit by digit' },
  { input: '  45678\nx 23891\n-------\n  45678\n4111020\n36542400\n137034000\n913560000\n---------\n1091293098', refused: false, why: 'long multiplication with the products one per line' },
  { input: '2345 - 1234 = 1111\n6789 - 4567 = 2222', refused: false, why: 'subtraction sums: an “=” ends a number' },
  { input: '8642 ÷ 2 = 4321', refused: false, why: 'a division sum' },
  // An EVS page.
  { input: 'My address\nHouse 12, Sector 4\nGurugram, Haryana 122001\nPin code 122001\nSchool: Govt. School, Delhi 110092\nPhone: 0124-2345678', refused: false, why: 'an EVS page with pin codes and a landline' },
  { input: 'Distance from Delhi to Mumbai: 1400 km. Population 2011: 1,10,34,555. Area 1484 sq km.', refused: false, why: 'an EVS fact box' },
  { input: 'Rainfall (mm): Jan 20  Feb 25  Mar 18  Apr 12  May 30  Jun 210', refused: false, why: 'a rainfall table' },
  { input: 'Year: 2001 2011 2021\nPopulation: 1028 1210 1390 (millions)', refused: false, why: 'a census table with four-digit columns' },
];
