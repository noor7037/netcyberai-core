export type AuthErrorCode =
  | 'invalid_credentials'
  | 'account_disabled'
  | 'mfa_invalid_code'
  | 'mfa_not_enrolled'
  | 'membership_invalid'
  | 'session_revoked'
  | 'session_expired'
  | 'pending_token_invalid';

export class AuthError extends Error {
  code: AuthErrorCode;
  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}
