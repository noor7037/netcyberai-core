import { randomUUID } from 'crypto';
import { redactFields, redactText } from './redact';

// Error reporting behind an interface (16 §3 rule 2; Decision Log C111).
// Today's adapter speaks Sentry's HTTP envelope API with fetch: no vendor
// SDK in the app, and moving to another service is a new adapter. Until
// SENTRY_DSN exists the reporter is a no-op. Reports carry the error's
// type, a redacted message, a stack and a request id; never a request
// body, header, cookie or form value.

export type ErrorContext = { requestId?: string; route?: string; tags?: Record<string, string>; extra?: Record<string, unknown> };

export interface ErrorReporter {
  captureException(error: unknown, context?: ErrorContext): void;
}

export const noopReporter: ErrorReporter = { captureException() {} };

type Dsn = { publicKey: string; host: string; projectId: string; protocol: string };

// https://<publicKey>@<host>/<projectId>
export function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\/+/, '');
    if (!u.username || !/^\d+$/.test(projectId) || (u.protocol !== 'https:' && u.protocol !== 'http:')) return null;
    return { publicKey: u.username, host: u.host, projectId, protocol: u.protocol };
  } catch {
    return null;
  }
}

type Frame = { function?: string; filename?: string; lineno?: number; colno?: number; in_app?: boolean };

// V8 stack lines: "    at fn (/path/file.js:10:5)" or "    at /path/file.js:10:5". Sentry wants the oldest frame first.
export function stackFrames(stack: string | undefined): Frame[] {
  if (!stack) return [];
  const frames: Frame[] = [];
  for (const line of stack.split('\n').slice(1, 40)) {
    const m = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
    if (!m) continue;
    const filename = m[2];
    frames.push({ function: m[1] ?? '<anonymous>', filename, lineno: Number(m[3]), colno: Number(m[4]), in_app: !filename.includes('node_modules') && !filename.startsWith('node:') });
  }
  return frames.reverse();
}

export function buildSentryEvent(error: unknown, context: ErrorContext, env: { environment: string; release?: string }) {
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'non-Error thrown');
  return {
    event_id: randomUUID().replace(/-/g, ''),
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: 'error',
    environment: env.environment,
    ...(env.release ? { release: env.release } : {}),
    exception: { values: [{ type: err.name || 'Error', value: redactText(err.message ?? ''), stacktrace: { frames: stackFrames(err.stack) } }] },
    tags: { ...(context.tags ?? {}), ...(context.requestId ? { request_id: context.requestId } : {}), ...(context.route ? { route: context.route } : {}) },
    extra: context.extra ? redactFields(context.extra) : {},
  };
}

export class SentryHttpReporter implements ErrorReporter {
  private sentInWindow = 0;
  private windowStart = Date.now();

  constructor(
    private readonly dsn: Dsn,
    private readonly env: { environment: string; release?: string },
    private readonly fetchImpl: typeof fetch = fetch,
    // A crash loop must not become a flood: at most this many reports a minute.
    private readonly maxPerMinute = 30
  ) {}

  captureException(error: unknown, context: ErrorContext = {}): void {
    const now = Date.now();
    if (now - this.windowStart > 60_000) {
      this.windowStart = now;
      this.sentInWindow = 0;
    }
    if (this.sentInWindow >= this.maxPerMinute) return;
    this.sentInWindow += 1;
    const event = buildSentryEvent(error, context, this.env);
    const header = JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() });
    const body = `${header}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}\n`;
    const url = `${this.dsn.protocol}//${this.dsn.host}/api/${this.dsn.projectId}/envelope/?sentry_key=${encodeURIComponent(this.dsn.publicKey)}&sentry_version=7`;
    // Best effort, never awaited by the caller, never throws.
    void this.fetchImpl(url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-sentry-envelope' }, signal: AbortSignal.timeout(3000) }).catch(() => {});
  }
}

let current: ErrorReporter | null = null;

export function errorReporter(): ErrorReporter {
  if (current) return current;
  const dsn = parseDsn(process.env.SENTRY_DSN);
  current = dsn
    ? new SentryHttpReporter(dsn, { environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development', release: process.env.VERCEL_GIT_COMMIT_SHA })
    : noopReporter;
  return current;
}
