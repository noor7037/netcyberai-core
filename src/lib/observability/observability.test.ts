import { describe, expect, it } from 'vitest';
import { redactFields, redactText } from './redact';
import { buildSentryEvent, noopReporter, parseDsn, SentryHttpReporter, stackFrames, type ErrorReporter } from './error-reporter';
import { forwardConsoleErrors } from './server-errors';
import { requestIdFrom } from './request-id';

describe('redaction', () => {
  it('masks emails, phones, tokens and bearer values in text', () => {
    expect(redactText('failed for priya@school.test at 9876543210 with eyJhbGciOiJIUzI1NiJ9.abc and Bearer abc.def')).toBe(
      'failed for <email> at <phone> with <secret> and Bearer <secret>'
    );
    expect(redactText('+91 98765 43210 called')).toBe('<phone> called');
    expect(redactText('order 12345 of 2026-09-30')).toBe('order 12345 of 2026-09-30');
  });

  it('drops secret and personal fields by name, keeps status codes and ids', () => {
    expect(
      redactFields({ password: 'x', accessToken: 't', code: '123456', statusCode: 500, sessionId: 's1', email: 'a@b.test', phone: null, note: 'mail a@b.test', nested: { apiKey: 'k', count: 2 } })
    ).toEqual({ password: '<redacted>', accessToken: '<redacted>', code: '<redacted>', statusCode: 500, sessionId: 's1', email: '<redacted>', phone: null, note: 'mail <email>', nested: { apiKey: '<redacted>', count: 2 } });
    expect(redactFields(JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}'))).toEqual({ ok: 1 });
  });
});

describe('Sentry adapter', () => {
  const DSN = 'https://abc123@o42.ingest.sentry.io/4507';

  it('parses a DSN and refuses a malformed one', () => {
    expect(parseDsn(DSN)).toEqual({ publicKey: 'abc123', host: 'o42.ingest.sentry.io', projectId: '4507', protocol: 'https:' });
    expect(parseDsn(undefined)).toBeNull();
    expect(parseDsn('not a url')).toBeNull();
    expect(parseDsn('https://o42.ingest.sentry.io/4507')).toBeNull();
  });

  it('reads V8 stack frames, oldest first', () => {
    const frames = stackFrames('Error: x\n    at inner (/app/src/a.ts:10:5)\n    at /app/node_modules/pg/b.js:3:1');
    expect(frames).toEqual([
      { function: '<anonymous>', filename: '/app/node_modules/pg/b.js', lineno: 3, colno: 1, in_app: false },
      { function: 'inner', filename: '/app/src/a.ts', lineno: 10, colno: 5, in_app: true },
    ]);
  });

  it('builds an event with a redacted message and the request id, and no body or headers', () => {
    const e = buildSentryEvent(new TypeError('no user for a@b.test'), { requestId: 'req-12345678', route: '/api/x', extra: { token: 't', count: 1 } }, { environment: 'production', release: 'abc' });
    expect(e.exception.values[0]).toMatchObject({ type: 'TypeError', value: 'no user for <email>' });
    expect(e.tags).toEqual({ request_id: 'req-12345678', route: '/api/x' });
    expect(e.extra).toEqual({ token: '<redacted>', count: 1 });
    expect(Object.keys(e)).not.toContain('request');
    expect(e.event_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('posts an envelope to the project, and stops at the per-minute cap', async () => {
    const calls: { url: string; body: string }[] = [];
    const stubFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) });
      return new Response('{}');
    }) as unknown as typeof fetch;
    const reporter = new SentryHttpReporter(parseDsn(DSN)!, { environment: 'test' }, stubFetch, 2);
    for (let i = 0; i < 5; i++) reporter.captureException(new Error(`boom ${i}`));
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe('https://o42.ingest.sentry.io/api/4507/envelope/?sentry_key=abc123&sentry_version=7');
    const [header, item, event] = calls[0].body.trim().split('\n').map((l) => JSON.parse(l));
    expect(item).toEqual({ type: 'event' });
    expect(header.event_id).toBe(event.event_id);
    expect(event.exception.values[0].value).toBe('boom 0');
  });

  it('a reporting failure never throws', () => {
    const failing = (async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    expect(() => new SentryHttpReporter(parseDsn(DSN)!, { environment: 'test' }, failing).captureException(new Error('x'))).not.toThrow();
  });
});

describe('server error forwarding', () => {
  it('forwards Errors logged with console.error, still logs them, and restores', () => {
    const seen: unknown[] = [];
    const logged: unknown[][] = [];
    const target = { error: (...args: unknown[]) => void logged.push(args) };
    const reporter: ErrorReporter = { captureException: (e) => void seen.push(e) };
    const restore = forwardConsoleErrors(target, reporter);
    const err = new Error('route failed');
    target.error(' ⨯', err);
    target.error('plain text only');
    expect(seen).toEqual([err]);
    expect(logged).toHaveLength(2);
    restore();
    target.error(new Error('after restore'));
    expect(seen).toHaveLength(1);
  });

  it('a reporter that throws does not break logging', () => {
    const logged: unknown[][] = [];
    const target = { error: (...args: unknown[]) => void logged.push(args) };
    forwardConsoleErrors(target, { captureException: () => { throw new Error('reporter down'); } });
    expect(() => target.error(new Error('x'))).not.toThrow();
    expect(logged).toHaveLength(1);
  });

  it('the no-op reporter does nothing', () => {
    expect(() => noopReporter.captureException(new Error('x'))).not.toThrow();
  });
});

describe('request ids', () => {
  it('keeps a well-formed incoming id, reuses Vercel’s, replaces anything else', () => {
    expect(requestIdFrom(new Headers({ 'x-request-id': 'abc-12345678' }))).toBe('abc-12345678');
    expect(requestIdFrom(new Headers({ 'x-vercel-id': 'bom1::iad1::abcd1234-1700000000000' }))).toBe('bom1::iad1::abcd1234-1700000000000');
    const replaced = requestIdFrom(new Headers({ 'x-request-id': 'bad id <script>' }));
    expect(replaced).toMatch(/^[0-9a-f-]{36}$/);
  });
});
