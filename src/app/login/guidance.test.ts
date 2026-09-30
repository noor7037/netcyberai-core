import { describe, expect, it } from 'vitest';
import { ERROR_TEXT, authenticatorCodeLabel, emailCodeLabel, guidanceFor, newestCodeLine, type StepKind } from './guidance';

// C96: every code on the sign-in page is named by where it comes from.
describe('sign-in wording', () => {
  it('names each code by its source, both in labels and in wrong-code messages', () => {
    expect(authenticatorCodeLabel()).toBe('6-digit code from your authenticator app (Google Authenticator)');
    expect(emailCodeLabel('n•••8@gmail.com')).toBe('6-digit code from the email we just sent to n•••8@gmail.com');
    expect(ERROR_TEXT.code_invalid).toMatch(/email code/);
    expect(ERROR_TEXT.code_invalid).toMatch(/not your authenticator code/);
    expect(ERROR_TEXT.mfa_invalid_code).toMatch(/authenticator code/);
    expect(ERROR_TEXT.mfa_invalid_code).toMatch(/not the code from our email/);
  });

  it('has no hedges about whether the email carries a code', () => {
    const all = JSON.stringify(ERROR_TEXT) + JSON.stringify(
      (['credentials', 'email_step', 'code_verify', 'reset_verify', 'mfa'] as StepKind[]).map((k) => guidanceFor(k, { emailTarget: 'x' }))
    );
    expect(all).not.toMatch(/if (your|the) email shows|if it shows|may contain|might/i);
  });

  it('counts the steps of each path', () => {
    expect(guidanceFor('credentials').position).toBe('Step 1 of 2');
    expect(guidanceFor('mfa').position).toBe('Step 2 of 2');
    expect(guidanceFor('email_step').position).toBe('Step 2 of 2');
    expect(guidanceFor('email_step', { setupNext: true }).position).toBe('Step 2 of 3');
    expect(guidanceFor('mfa_setup').position).toBe('Step 3 of 3');
    expect(guidanceFor('select_school').position).toBe('Last step');
  });

  it('the email step says where the code went, that it is not the authenticator code, and when the newest was sent', () => {
    const g = guidanceFor('email_step', { emailTarget: 'n•••8@gmail.com', codeSentAt: new Date(2026, 8, 30, 9, 5) });
    expect(g.doNow).toContain('n•••8@gmail.com');
    expect(g.doNow).toContain('This is not your authenticator code.');
    expect(g.stuck[0]).toBe('New code sent at 09:05. Only the newest code works.');
    expect(newestCodeLine(new Date(2026, 0, 1, 14, 30))).toBe('New code sent at 14:30. Only the newest code works.');
  });
});
