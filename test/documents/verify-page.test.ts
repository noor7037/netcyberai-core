import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// The public QR page (C228), review of C228: a lookup that fails is not a certificate that does not exist. The page
// says to try again rather than "no certificate matches", so a genuine certificate is never shown as unknown.
const state: { fail: boolean; view: unknown } = { fail: false, view: null };
vi.mock('@/lib/auth/db', () => ({
  withPlatformService: async (fn: (db: unknown) => Promise<unknown>) => {
    if (state.fail) throw new Error('the database could not be reached');
    return fn({});
  },
}));
vi.mock('@/lib/documents/certificates', () => ({ verifyCertificate: async () => state.view }));

import VerifyCertificatePage from '@/app/verify/[token]/page';

const render = async () => renderToStaticMarkup(await VerifyCertificatePage({ params: { token: 'A'.repeat(32) } }));

describe('the public verification page', () => {
  it('a lookup that fails says to try again, never that no certificate matches', async () => {
    state.fail = true;
    const html = await render();
    expect(html).toContain('data-verify-state="unavailable"');
    expect(html).not.toContain('data-verify-state="unknown"');
    expect(html).toContain('try again in a few minutes');
  });

  it('a token that matches nothing says so; a certificate shows its state and facts', async () => {
    state.fail = false;
    state.view = null;
    expect(await render()).toContain('data-verify-state="unknown"');
    state.view = { state: 'valid', type: 'transfer', schoolName: 'School A', number: 'TC/0001', issuedOn: '2026-10-15', nameShown: 'Asha K.' };
    const html = await render();
    expect(html).toContain('data-verify-state="valid"');
    expect(html).toContain('TC/0001');
    expect(html).toContain('Asha K.');
  });
});
