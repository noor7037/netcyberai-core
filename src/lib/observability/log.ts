import { redactFields } from './redact';
import { REQUEST_ID_HEADER } from './request-id';

// Structured logs (C111): one JSON line per event on stdout/stderr, which
// Vercel keeps and searches. Fields are redacted (redact.ts) before they
// are written: no email, phone, token, code or secret.
export type LogLevel = 'info' | 'warn' | 'error';

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...redactFields(fields) });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

export function requestIdOf(req: { headers: Headers }): string {
  return req.headers.get(REQUEST_ID_HEADER) ?? 'none';
}
