import { describe, expect, it } from 'vitest';
import { inviteFailure } from './invite-failure';

describe('why an invite was refused', () => {
  it('names a wrong service key, whatever words Supabase uses', () => {
    expect(inviteFailure({ message: 'Invalid API key', status: 401 })).toBe('service_key');
    expect(inviteFailure({ message: 'invalid JWT: unable to parse or verify signature' })).toBe('service_key');
    expect(inviteFailure({ message: 'Unauthorized', status: 401 })).toBe('service_key');
  });

  it('tells an existing login and a bad address apart from the rest', () => {
    expect(inviteFailure({ message: 'A user with this email address has already been registered', status: 422, code: 'email_exists' })).toBe('already_registered');
    expect(inviteFailure({ message: 'User already registered' })).toBe('already_registered');
    expect(inviteFailure({ message: 'Unable to validate email address: invalid format', status: 400, code: 'validation_failed' })).toBe('email');
    expect(inviteFailure({ message: 'Error sending invite email', status: 500 })).toBe('other');
    expect(inviteFailure(null)).toBe('other');
  });
});
