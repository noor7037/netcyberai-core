import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATALOG } from '@/lib/agent/catalog.generated';
import { resolveRefs, routeUrl } from '@/lib/agent/call';
import { canonical, diffHash, mayApprove, planTier } from '@/lib/agent/engine';
import { asSteps, parseModel } from '@/lib/agent/loop';
import { hideKnownNames, newNameBook, redact, restoreNames } from '@/lib/agent/redact';

// The school agent's rules that are code, not words (C546).

describe('what the agent may call', () => {
  it('never lists money moving, accounts, consent, attendance or marking writes, exports or its own routes', () => {
    const never = [/^POST fees\/payments/, /^POST attendance/, /^PATCH attendance/, /marking/, /^POST users/, /consent/, /dsr/, /export/, / agent/, / bulk/, /qr-token/, /whatsapp-config/, /fees\/(bank|receipts|concessions|recovery|payment-setup)/];
    for (const e of CATALOG) for (const re of never) expect(`${e.id}`).not.toMatch(re);
  });
  it('reads are tier 0, every change tier 1 or 2, every delete tier 2', () => {
    for (const e of CATALOG) {
      if (e.method === 'GET') expect(e.tier).toBe(0);
      else expect([1, 2]).toContain(e.tier);
      if (e.method === 'DELETE') expect(e.tier).toBe(2);
    }
    expect(CATALOG.find((e) => e.id === 'POST communication/notices')?.tier).toBe(2);
    expect(CATALOG.find((e) => e.id === 'POST classes')?.tier).toBe(1);
  });
  it('covers the school app broadly', () => {
    expect(new Set(CATALOG.map((e) => e.module)).size).toBeGreaterThanOrEqual(30);
  });
  it('a plan takes its highest tier; an unknown route makes no plan', () => {
    expect(planTier([{ endpoint: 'POST classes' }, { endpoint: 'POST communication/notices' }])).toBe(2);
    expect(planTier([{ endpoint: 'POST nowhere' }])).toBeNull();
  });
  it('the principal approves tier 2; the asker approves their own tier 1', () => {
    expect(mayApprove(2, { role: 'school_admin', userId: 'a' }, 'a')).toBe(false);
    expect(mayApprove(2, { role: 'principal', userId: 'p' }, 'a')).toBe(true);
    expect(mayApprove(1, { role: 'teacher', userId: 'a' }, 'a')).toBe(true);
    expect(mayApprove(1, { role: 'teacher', userId: 'b' }, 'a')).toBe(false);
    // Tier 1 is the author's own: not even the principal makes someone else's tier 1 live.
    expect(mayApprove(1, { role: 'principal', userId: 'p' }, 'a')).toBe(false);
  });
});

describe('steps', () => {
  it('a later step uses an earlier answer', () => {
    expect(resolveRefs({ classId: '$1.class.class_id', n: ['$2.0'] }, [{ class: { class_id: 'c1' } }, ['x']])).toEqual({ classId: 'c1', n: ['x'] });
    expect(resolveRefs('$9.a', [])).toBeUndefined();
  });
  it('a path value must be plain; query keys must be the route’s own', () => {
    const e = CATALOG.find((x) => x.id === 'PATCH classes/:classId')!;
    expect(routeUrl(e, { classId: '../users' }, {}, 'http://x')).toBeNull();
    expect(routeUrl(e, { classId: 'abc-1' }, {}, 'http://x')).toBe('http://x/api/app/classes/abc-1');
  });
  it('reads the model’s JSON, and keeps only well-formed steps', () => {
    expect(parseModel('noise {"say":"hi"} tail')).toEqual({ say: 'hi' });
    expect(parseModel('no json')).toBeNull();
    expect(asSteps([{ endpoint: 'POST classes', body: { name: '6-C' } }, { nope: 1 }, 'x'])).toEqual([{ endpoint: 'POST classes', body: { name: '6-C' } }]);
  });
});

describe('what the model sees', () => {
  it('drops contact details and identity numbers, and turns students into tokens', () => {
    const book = newNameBook();
    const out = redact({ students: [{ student_id: 's1', name: 'Meera Sharma', phone: '9999999999', dob: '2015-01-01', class_name: '6-A' }], guardian_email: 'x@y.z' }, book) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toMatch(/Meera|9999|2015|x@y/);
    expect(JSON.stringify(out)).toContain('[S1]');
    expect(JSON.stringify(out)).toContain('6-A');
    expect(restoreNames('Moved [S1] to 6-B', book)).toBe('Moved Meera Sharma to 6-B');
    expect(hideKnownNames('Move Meera Sharma to 6-B', book)).toBe('Move [S1] to 6-B');
    // Names under displayName, rows under a students key, free text and contact fields.
    const more = JSON.stringify(redact({ students: [{ id: 'x', displayName: 'Zoya Khan' }], note: 'Called Meera Sharma today', contactNumber: '98' }, book));
    expect(more).not.toMatch(/Zoya|Meera|98/);
    expect(more).toContain('[S2]');
  });
});

describe('the review hash', () => {
  it('is the same for the same plan whatever the key order, and new ids', () => {
    const steps = [{ endpoint: 'POST classes', body: { name: '6-C', grade: '6' } }];
    const a = diffHash(steps, [{ action: 'class.create', target: 'classes', targetId: '11111111-1111-4111-8111-111111111111', before: null, after: { created_at: 'now', name: '6-C' } }], new Set());
    const b = diffHash([{ body: { grade: '6', name: '6-C' }, endpoint: 'POST classes' }], [{ action: 'class.create', target: 'classes', targetId: '22222222-2222-4222-8222-222222222222', before: null, after: { name: '6-C', created_at: 'later' } }], new Set());
    expect(a).toBe(b);
    const c = diffHash(steps, [{ action: 'class.create', target: 'classes', targetId: null, before: null, after: { name: '6-D' } }], new Set());
    expect(c).not.toBe(a);
    // The same plan that would now act on another student (an id filled in from a read) hashes differently.
    const onA = diffHash([{ endpoint: 'POST x', sent: { params: { studentId: '33333333-3333-4333-8333-333333333333' } } }], [], new Set(['33333333-3333-4333-8333-333333333333']));
    const onB = diffHash([{ endpoint: 'POST x', sent: { params: { studentId: '44444444-4444-4444-8444-444444444444' } } }], [], new Set(['44444444-4444-4444-8444-444444444444']));
    expect(onA).not.toBe(onB);
    expect(canonical({ b: 1, a: [2, { d: 1, c: 0 }] })).toBe('{"a":[2,{"c":0,"d":1}],"b":1}');
  });
});

describe('the transaction cannot be left', () => {
  it('withTenantContext joins the agent transaction, and every other context refuses inside it', () => {
    const src = readFileSync('src/lib/auth/db.ts', 'utf8');
    expect(src).toMatch(/const joined = agentTx\.getStore\(\);[\s\S]{0,300}inSavepoint\(joined, fn\)/);
    for (const fn of ['withBackendConnection', 'withRoleProbe', 'withSuperAdminBypass', 'withSelfContext', 'withSchoolJobContext', 'withPlatformService', 'withFamilyContext', 'withGuardianContext', 'withFamilyGate']) {
      expect(src).toContain(`assertNoAgentTx('${fn}')`);
    }
  });
});
