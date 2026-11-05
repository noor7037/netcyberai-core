// The words that mark a key as personal data in an audit row's before or after state (C56, C224): a name, a phone, a
// date of birth, an address, or free text a person typed. test/audit/audit-pii.test.ts fails a writer whose state
// carries such a key; Control → Audit Logs (W21-M6) hides the value of such a key wherever it shows or exports a row.
export const PERSONAL_WORDS: ReadonlySet<string> = new Set(['name', 'names', 'phone', 'phones', 'mobile', 'email', 'dob', 'birth', 'address', 'note', 'notes', 'reason', 'reasons', 'why', 'text', 'message', 'body', 'details', 'title', 'reference', 'comment', 'description', 'summary', 'remark', 'remarks', 'outcome', 'narration', 'utr', 'aadhaar']);

export const keyWords = (id: string) =>
  id
    .replace(/([a-z0-9])([A-Z])/g, (_, lower: string, upper: string) => `${lower} ${upper}`)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());

export const isPersonalKey = (id: string) => keyWords(id).some((w) => PERSONAL_WORDS.has(w));
