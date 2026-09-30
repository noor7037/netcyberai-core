// Lists the "Register your school" form shows (C98). No server-only
// imports: the form, a client component, uses them too.

// ISO 3166-2:IN codes: schools.jurisdiction takes the same format.
export const INDIAN_STATES: readonly { code: string; name: string }[] = [
  { code: 'IN-AN', name: 'Andaman and Nicobar Islands' },
  { code: 'IN-AP', name: 'Andhra Pradesh' },
  { code: 'IN-AR', name: 'Arunachal Pradesh' },
  { code: 'IN-AS', name: 'Assam' },
  { code: 'IN-BR', name: 'Bihar' },
  { code: 'IN-CH', name: 'Chandigarh' },
  { code: 'IN-CT', name: 'Chhattisgarh' },
  { code: 'IN-DH', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: 'IN-DL', name: 'Delhi' },
  { code: 'IN-GA', name: 'Goa' },
  { code: 'IN-GJ', name: 'Gujarat' },
  { code: 'IN-HR', name: 'Haryana' },
  { code: 'IN-HP', name: 'Himachal Pradesh' },
  { code: 'IN-JK', name: 'Jammu and Kashmir' },
  { code: 'IN-JH', name: 'Jharkhand' },
  { code: 'IN-KA', name: 'Karnataka' },
  { code: 'IN-KL', name: 'Kerala' },
  { code: 'IN-LA', name: 'Ladakh' },
  { code: 'IN-LD', name: 'Lakshadweep' },
  { code: 'IN-MP', name: 'Madhya Pradesh' },
  { code: 'IN-MH', name: 'Maharashtra' },
  { code: 'IN-MN', name: 'Manipur' },
  { code: 'IN-ML', name: 'Meghalaya' },
  { code: 'IN-MZ', name: 'Mizoram' },
  { code: 'IN-NL', name: 'Nagaland' },
  { code: 'IN-OR', name: 'Odisha' },
  { code: 'IN-PY', name: 'Puducherry' },
  { code: 'IN-PB', name: 'Punjab' },
  { code: 'IN-RJ', name: 'Rajasthan' },
  { code: 'IN-SK', name: 'Sikkim' },
  { code: 'IN-TN', name: 'Tamil Nadu' },
  { code: 'IN-TG', name: 'Telangana' },
  { code: 'IN-TR', name: 'Tripura' },
  { code: 'IN-UP', name: 'Uttar Pradesh' },
  { code: 'IN-UT', name: 'Uttarakhand' },
  { code: 'IN-WB', name: 'West Bengal' },
];

export const BOARDS = ['CBSE', 'ICSE', 'STATE', 'IB', 'OTHER'] as const;
export type Board = (typeof BOARDS)[number];
export const BOARD_LABELS: Record<Board, string> = { CBSE: 'CBSE', ICSE: 'ICSE / ISC', STATE: 'State board', IB: 'IB', OTHER: 'Other' };

