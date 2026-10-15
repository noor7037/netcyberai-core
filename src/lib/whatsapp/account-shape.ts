// The shape of each piece of the platform's WhatsApp account: one rule, read by the Control screen while the
// founder types (so a slip is named before "Save" is pressed) and by the server when it refuses a save. No
// node module is imported here, so a client component can use it. The rules are what Meta's own ids and
// tokens look like: digits for the two ids; letters, digits and a few signs for the token, the app secret and
// the verify token. A space or a line break, the usual paste slip, is named on its own.

export const ACCOUNT_FIELDS = ['phoneNumberId', 'wabaId', 'accessToken', 'appSecret', 'verifyToken'] as const;
export type AccountField = (typeof ACCOUNT_FIELDS)[number];
export type AccountProblem = 'phone_number_id' | 'waba_id' | 'access_token' | 'app_secret' | 'verify_token';
export type AccountShape = { min: number; max: number; chars: RegExp; problem: AccountProblem };

export const ACCOUNT_SHAPE: Record<AccountField, AccountShape> = {
  phoneNumberId: { min: 5, max: 30, chars: /^[0-9]*$/, problem: 'phone_number_id' },
  wabaId: { min: 5, max: 30, chars: /^[0-9]*$/, problem: 'waba_id' },
  accessToken: { min: 20, max: 600, chars: /^[A-Za-z0-9_\-|.]*$/, problem: 'access_token' },
  appSecret: { min: 16, max: 128, chars: /^[A-Za-z0-9]*$/, problem: 'app_secret' },
  // Ours to choose: what Meta sends back when it first checks the webhook address.
  verifyToken: { min: 16, max: 128, chars: /^[A-Za-z0-9_\-]*$/, problem: 'verify_token' },
};

export const PROBLEM_FIELD: Record<AccountProblem, AccountField> = { phone_number_id: 'phoneNumberId', waba_id: 'wabaId', access_token: 'accessToken', app_secret: 'appSecret', verify_token: 'verifyToken' };

// Why a value is refused, in the order a person can fix it: nothing typed, a space or line break, a character
// that cannot be in it, too short, too long. Null when it looks right.
export type FieldFault = 'empty' | 'space' | 'chars' | 'short' | 'long';
export function fieldFault(field: AccountField, value: string): FieldFault | null {
  const s = ACCOUNT_SHAPE[field];
  if (value === '') return 'empty';
  if (/\s/.test(value)) return 'space';
  if (!s.chars.test(value)) return 'chars';
  if (value.length < s.min) return 'short';
  if (value.length > s.max) return 'long';
  return null;
}

// The server's refusal: the first field that is not right, as the code the screen already knows.
export function accountProblem(a: Record<AccountField, string>): AccountProblem | null {
  for (const field of ACCOUNT_FIELDS) if (fieldFault(field, a[field]) !== null) return ACCOUNT_SHAPE[field].problem;
  return null;
}

// A verify token made for the founder: 32 letters, digits, dashes and underscores from the given random bytes
// (the browser's crypto.getRandomValues). Each byte picks one of 64 signs, so no sign is favoured.
const TOKEN_SIGNS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export const VERIFY_TOKEN_LENGTH = 32;
export function makeVerifyToken(randomBytes: Uint8Array): string {
  if (randomBytes.length < VERIFY_TOKEN_LENGTH) throw new Error(`makeVerifyToken needs ${VERIFY_TOKEN_LENGTH} random bytes`);
  let out = '';
  for (let i = 0; i < VERIFY_TOKEN_LENGTH; i++) out += TOKEN_SIGNS[randomBytes[i] & 63];
  return out;
}
