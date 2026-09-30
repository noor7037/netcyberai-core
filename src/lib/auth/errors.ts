export type AuthErrorCode =
  | 'invalid_credentials'
  | 'account_disabled'
  | 'mfa_invalid_code'
  | 'mfa_not_enrolled'
  | 'membership_invalid'
  | 'session_revoked'
  | 'session_expired'
  | 'pending_token_invalid'
  | 'code_invalid'
  | 'mfa_required'
  | 'password_invalid'
  | 'password_rejected'
  | 'rate_limited'
  | 'email_send_failed'
  | 'email_limit'
  | 'link_invalid'
  | 'setup_required'
  | 'mfa_already_enrolled'
  | 'mfa_enroll_failed'
  | 'admin_reset_needs_founder';

export class AuthError extends Error {
  code: AuthErrorCode;
  // For rate_limited: seconds until the email service accepts another request.
  retryAfter?: number;
  constructor(code: AuthErrorCode, message: string, retryAfter?: number) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.retryAfter = retryAfter;
  }
}
