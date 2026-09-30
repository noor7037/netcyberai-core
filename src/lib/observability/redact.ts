// What may leave the app in a log line or an error report (C111): no
// email address, phone number, token or secret-looking value, and no field
// whose name says it holds one. Pure, so it is unit-tested.

const SENSITIVE_KEY_RE = /pass(word)?|secret|token|authorization|cookie|api[_-]?key|\botp\b|signature|\bdsn\b/i;
// A one-time code, but not a status or error code.
const CODE_KEY_RE = /^code$|(otp|verify|verification|auth|mfa|totp)_?code$/i;
const PII_KEY_RE = /e-?mail|phone|mobile/i;

export function redactText(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/\b(?:(?:re|sk|pk)_|eyJ)[A-Za-z0-9_\-.]{12,}/g, '<secret>')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <secret>')
    .replace(/(?<![\w.-])(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?![\w-])/g, '<phone>');
}

export function redactFields(fields: Record<string, unknown>, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (SENSITIVE_KEY_RE.test(key) || CODE_KEY_RE.test(key)) out[key] = '<redacted>';
    else if (PII_KEY_RE.test(key)) out[key] = value == null ? value : '<redacted>';
    else if (typeof value === 'string') out[key] = redactText(value);
    else if (value && typeof value === 'object' && !Array.isArray(value) && depth < 3) out[key] = redactFields(value as Record<string, unknown>, depth + 1);
    else out[key] = value;
  }
  return out;
}
