import { describe, expect, it, vi } from 'vitest';

const STUDENT = '11111111-1111-4111-8111-111111111111';
const CHILD = '22222222-2222-4222-8222-222222222222';
const LINK = '33333333-3333-4333-8333-333333333333';

const state = { shown: [] as { studentId: string }[], setChildLinks: vi.fn(async () => ({ ok: true as const })) };

vi.mock('@/lib/family/db', () => ({ familyClaims: () => ({}) }));
vi.mock('@/lib/family/request', () => ({
  requireParent: async () => ({ session: { accountId: 'acc' } }),
  jsonBody: async (req: Request) => req.json(),
  familyRun: async (_s: unknown, fn: (db: unknown) => Promise<Response>) => fn({}),
}));
vi.mock('@/lib/family/school', () => ({
  linkedSchool: async () => ({ children: state.shown }),
  setChildLinks: (...a: unknown[]) => (state.setChildLinks as unknown as (...x: unknown[]) => unknown)(...a),
}));

import { POST } from '@/app/api/family/school/children/route';

const post = (pairs: unknown) => POST(new Request('http://x/api/family/school/children', { method: 'POST', body: JSON.stringify({ linkId: LINK, pairs }) }) as never);

describe('POST /api/family/school/children', () => {
  it('answers consent_needed when the school child is not shown (consent not recorded)', async () => {
    state.shown = [];
    const r = await post([{ studentId: STUDENT, childId: CHILD }]);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('consent_needed');
    expect(state.setChildLinks).not.toHaveBeenCalled();
  });
  it('matches when the school child is shown', async () => {
    state.shown = [{ studentId: STUDENT }];
    const r = await post([{ studentId: STUDENT, childId: CHILD }]);
    expect(r.status).toBe(200);
  });
});
