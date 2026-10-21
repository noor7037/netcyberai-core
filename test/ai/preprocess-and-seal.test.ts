import { randomBytes } from 'crypto';
import { describe, expect, it } from 'vitest';
import { scrubText } from '@/lib/ai/preprocess';
import { aiEncryptionKey, sealAiKey, unsealAiKey } from '@/lib/ai/credentials';

// M1-3 (C249): the pre-processor's rules one by one, and the sealing of AI keys. Made-up names and numbers only.

describe('scrubText', () => {
  const ctx = { childFirstNames: ['Asha', 'Ravi', 'आशा'], parentEmail: 'parent.a@example.org' };

  it('names: whole words in any case, Latin and Devanagari, never inside another word', () => {
    expect(scrubText('Asha and RAVI and ravi.', ctx)).toBe('the student and the student and the student.');
    expect(scrubText('Ashaben, Ravindra, Prashant', ctx)).toBe('Ashaben, Ravindra, Prashant');
    expect(scrubText('आशा ने पूछा, आशाजी नहीं', ctx)).toBe('the student ने पूछा, आशाजी नहीं');
  });

  it('emails, phone numbers and 12-digit numbers', () => {
    expect(scrubText('mail me at Someone.Else+x@mail.example.co.in', ctx)).toBe('mail me at an email address');
    expect(scrubText('call +91-98765-43210 / 0091 9876543210 / 98765 43210', ctx)).toBe('call a phone number / a phone number / a phone number');
    expect(scrubText('id 1234-5678-9012', ctx)).toBe('id an ID number');
    expect(scrubText('फ़ोन ९८७६५४३२१०', ctx)).toBe('फ़ोन a phone number');
  });

  it('leaves school work alone', () => {
    const work = 'Find 3/4 of 120. Area = 12.5 × 8 cm². Year 1947. 2x + 5 = 15. Pin 110001.';
    expect(scrubText(work, ctx)).toBe(work);
  });

  it('a name with characters that mean something in a pattern is matched as written', () => {
    expect(scrubText('Hi A.B and AxB', { childFirstNames: ['A.B'] })).toBe('Hi the student and AxB');
  });
});

describe('sealed AI keys', () => {
  const env = { PAYMENT_CREDENTIALS_KEY: randomBytes(32).toString('base64'), PAYMENT_CREDENTIALS_KEY_VERSION: '1' };
  const k = aiEncryptionKey(env)!;
  const key = `sk-ant-${'z'.repeat(32)}`;

  it('opens only for its own provider, with the same server key', () => {
    const s = sealAiKey(k, 'anthropic', key);
    expect(s.ciphertext).not.toContain('sk-ant');
    const row = { ciphertext: s.ciphertext, iv: s.iv, tag: s.tag, key_version: s.keyVersion };
    expect(unsealAiKey(k, 'anthropic', row)).toBe(key);
    expect(() => unsealAiKey(k, 'openai', row)).toThrow();
    const other = aiEncryptionKey({ PAYMENT_CREDENTIALS_KEY: randomBytes(32).toString('base64') })!;
    expect(() => unsealAiKey(other, 'anthropic', row)).toThrow();
  });

  it('no server key, no sealing', () => {
    expect(aiEncryptionKey({})).toBeNull();
  });
});
