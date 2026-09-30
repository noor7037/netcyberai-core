import { afterEach, describe, expect, it } from 'vitest';
import { clientIp, codeHash, codeMatches, newVerificationCode, rateKey, schoolNameKey, turnstileEnabled, turnstilePasses, validateApplication } from './intake';

process.env.APP_SESSION_SECRET = 'unit-test-secret-for-intake-0123456789abcdef';
const VALID = {
  schoolName: '  St. Mary’s   School ',
  city: 'Palwal',
  stateCode: 'IN-HR',
  board: 'CBSE',
  approxStudents: '850',
  principalName: 'Priya Sharma',
  email: ' Priya@School.Test ',
  mobile: '+91 98765-43210',
};

describe('validateApplication', () => {
  it('normalises a valid application', () => {
    const r = validateApplication(VALID);
    expect(r).toEqual({
      ok: true,
      value: { schoolName: 'St. Mary’s School', city: 'Palwal', stateCode: 'IN-HR', board: 'CBSE', approxStudents: 850, principalName: 'Priya Sharma', email: 'priya@school.test', mobile: '9876543210' },
    });
  });

  it('names every bad field', () => {
    const r = validateApplication({ ...VALID, schoolName: 'x', stateCode: 'IN-XX', board: 'NONE', approxStudents: '-3', email: 'nope', mobile: '12345' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['approxStudents', 'board', 'email', 'mobile', 'schoolName', 'stateCode']);
  });

  it('student count is optional', () => {
    const r = validateApplication({ ...VALID, approxStudents: '' });
    expect(r.ok && r.value.approxStudents).toBe(null);
  });
});

describe('dedupe key', () => {
  it('ignores case, spacing, punctuation and apostrophes', () => {
    expect(schoolNameKey('St. Mary’s  Convent School')).toBe('st marys convent school');
    expect(schoolNameKey("st marys convent-school")).toBe('st marys convent school');
    expect(schoolNameKey('सरस्वती विद्या मंदिर')).not.toBe('');
  });
});

describe('codes and keys', () => {
  it('codes are 6 digits and checked by keyed hash, bound to the application', () => {
    const code = newVerificationCode();
    expect(code).toMatch(/^\d{6}$/);
    const hash = codeHash('app-1', code);
    expect(codeMatches('app-1', code, hash)).toBe(true);
    expect(codeMatches('app-2', code, hash)).toBe(false);
    expect(codeMatches('app-1', '12345', hash)).toBe(false);
    expect(codeMatches('app-1', code, null)).toBe(false);
  });

  it('rate keys are hashes, never the address', () => {
    expect(rateKey('ip', '203.0.113.7')).toMatch(/^[0-9a-f]{64}$/);
    expect(rateKey('email', 'A@b.test')).toBe(rateKey('email', 'a@b.test'));
  });

  it('client IP is the first x-forwarded-for entry', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});

describe('Turnstile flag', () => {
  afterEach(() => {
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  });

  it('is off without both keys, and then lets every submission through', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret-only';
    expect(turnstileEnabled()).toBe(false);
    expect(await turnstilePasses(undefined, '1.2.3.4')).toBe(true);
  });

  it('when on, asks Cloudflare and needs a token', async () => {
    process.env.TURNSTILE_SECRET_KEY = 's';
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'k';
    const answers: string[] = [];
    const stubFetch = (async (_url: string, init: RequestInit) => {
      answers.push(String(init.body));
      return new Response(JSON.stringify({ success: String(init.body).includes('response=good') }));
    }) as unknown as typeof fetch;
    expect(await turnstilePasses('', '1.2.3.4', stubFetch)).toBe(false);
    expect(await turnstilePasses('good', '1.2.3.4', stubFetch)).toBe(true);
    expect(await turnstilePasses('bad', '1.2.3.4', stubFetch)).toBe(false);
    expect(answers[0]).toContain('remoteip=1.2.3.4');
  });
});
