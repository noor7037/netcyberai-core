import { randomBytes, createHash } from 'crypto';

// Refresh tokens are high-entropy random opaque values, not passwords --
// a fast, unsalted sha256 of the token itself is the standard, correct
// primitive here (cf. bcrypt, which is for low-entropy human input).
export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
