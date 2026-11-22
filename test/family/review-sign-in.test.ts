import { describe, expect, it } from 'vitest';
import { codeKey, requestCode, reviewCodeFor } from '@/lib/family/sign-in';

// C542: Google Play's reviewers sign in with a fixed code for one review address set in the server's environment.
// Nothing changes for any other address, for a PIN reset, or when the environment does not set both values.
describe('the Play review sign-in (C542)', () => {
  const env = { FAMILY_REVIEW_EMAIL: 'Play.Review@Example.org', FAMILY_REVIEW_CODE: '482915' } as unknown as NodeJS.ProcessEnv;

  it('applies only to the review address, only for sign-in, only with six digits', () => {
    expect(reviewCodeFor('play.review@example.org', 'sign_in', env)).toBe('482915');
    expect(reviewCodeFor('someone@example.org', 'sign_in', env)).toBeNull();
    expect(reviewCodeFor('play.review@example.org', 'pin_reset', env)).toBeNull();
    expect(reviewCodeFor('play.review@example.org', 'sign_in', { ...env, FAMILY_REVIEW_CODE: '12345' })).toBeNull();
    expect(reviewCodeFor('play.review@example.org', 'sign_in', { FAMILY_REVIEW_CODE: '482915' } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });

  it('stores the fixed code as its hash and sends no email; other addresses are unchanged', async () => {
    const saved = { ...process.env };
    process.env.FAMILY_REVIEW_EMAIL = 'play.review@example.org';
    process.env.FAMILY_REVIEW_CODE = '482915';
    process.env.APP_SESSION_SECRET ??= 'test-only-secret-for-review-sign-in-0123456789';
    try {
      const params: unknown[][] = [];
      const run = (async (fn: (db: { query: (sql: string, p: unknown[]) => Promise<{ rows: { r: string }[] }> }) => Promise<unknown>) =>
        fn({ query: async (_sql, p) => { params.push(p); return { rows: [{ r: 'ok' }] }; } })) as never;
      const sent: unknown[] = [];
      const sender = { send: async (m: unknown) => { sent.push(m); return { id: 'x' }; } } as never;
      expect(await requestCode({ email: 'play.review@example.org', purpose: 'sign_in', ip: null, lang: 'en' }, { sender, run })).toEqual({ status: 'sent' });
      expect(params[0][2]).toBe(codeKey('play.review@example.org', 'sign_in', '482915'));
      expect(sent).toEqual([]);
      expect(await requestCode({ email: 'parent@example.org', purpose: 'sign_in', ip: null, lang: 'en' }, { sender, run, code: () => '111111' })).toEqual({ status: 'sent' });
      expect(params[1][2]).toBe(codeKey('parent@example.org', 'sign_in', '111111'));
      expect(sent).toHaveLength(1);
    } finally {
      process.env = saved;
    }
  });
});
