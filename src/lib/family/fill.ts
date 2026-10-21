// Safe for the phone: no message file is imported here (src/lib/family/words.ts picks the words on the server).
export type Words = Record<string, string>;

// `{name}` in a picked message, filled on the phone.
export function fill(text: string | undefined, params: Record<string, string | number> = {}): string {
  return (text ?? '').replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}
