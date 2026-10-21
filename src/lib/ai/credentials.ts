import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { encryptionKey } from '@/lib/payments/credentials';

// AI providers' keys (docs/family-app/10 §3), sealed as the payment keys are (src/lib/payments/credentials.ts):
// AES-256-GCM in the app, with the server's existing credentials key (PAYMENT_CREDENTIALS_KEY; never created, printed
// or derived here). The provider id is authenticated with the ciphertext ('ai:<provider>'), so a row copied onto
// another provider does not open. Opened only inside the server call that uses the key (platform.ts); nothing here
// returns a key to a screen, a log line or an audit row.

export type AiKey = NonNullable<ReturnType<typeof encryptionKey>>;
export type SealedRow = { ciphertext: string; iv: string; tag: string; key_version: number };

export function aiEncryptionKey(env: Record<string, string | undefined> = process.env): AiKey | null {
  return encryptionKey(env);
}

const place = (provider: string) => Buffer.from(`ai:${provider}`);

export function sealAiKey(k: AiKey, provider: string, apiKey: string): { ciphertext: string; iv: string; tag: string; keyVersion: number } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k.key, iv);
  cipher.setAAD(place(provider));
  const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), keyVersion: k.version };
}

// Throws when the server's key is not the one the row was sealed with, or the row was moved or changed.
export function unsealAiKey(k: AiKey, provider: string, row: SealedRow): string {
  if (Number(row.key_version) !== k.version) throw new Error('the AI key was saved with another key version');
  const decipher = createDecipheriv('aes-256-gcm', k.key, Buffer.from(row.iv, 'base64'));
  decipher.setAAD(place(provider));
  decipher.setAuthTag(Buffer.from(row.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(row.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
