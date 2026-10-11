import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NextResponse } from 'next/server';
import { explainError, isErrorRule } from '@/lib/errors/catalogue';
import { accessDenied, ruleError } from '@/lib/frameworks/route';

// The APIs moved onto the error catalogue in P1c-3b-3 (C136): consent, data
// requests, documents, guardians and their verification, settings. A refusal
// there is a rule of the catalogue, never a sentence written in the route.

const API = path.join(__dirname, '../../src/app/api/app');
const MOVED = ['dsr', 'documents', 'guardians', 'settings', 'whatsapp-config', 'students/[studentId]/guardians', 'students/[studentId]/consent', 'students/[studentId]/documents', 'students/[studentId]/dsr'];

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? routes(p) : name === 'route.ts' ? [p] : [];
  });
}

describe('the moved APIs say refusals through the catalogue', () => {
  const files = MOVED.flatMap((d) => routes(path.join(API, d)));

  it('covers the routes it claims to', () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  it('no route writes its own refusal sentence', () => {
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      // A sentence written in the route, or a thrown error's own words passed on.
      const own = text.match(/\{\s*error:\s*['"`][^'"`]*['"`]|jsonError\(\s*\d+\s*,\s*['"`]|error:\s*err\.message/g) ?? [];
      expect(own, path.relative(API, f)).toEqual([]);
    }
  });

  it('every rule a route names exists in the catalogue', () => {
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/ruleError\(\s*\d+\s*,\s*'([a-z_]+)'/g)) expect(isErrorRule(m[1]), `${path.relative(API, f)}: ${m[1]}`).toBe(true);
    }
  });
});

describe('what a screen shows for these refusals', () => {
  const said = async (res: NextResponse, lang: 'en' | 'hi' = 'en') => explainError(await res.json(), 'fallback', lang, res.status);

  it('a rule with its values, in English and Hindi', async () => {
    expect(await said(ruleError(404, 'not_found', { field: 'guardian' }))).toBe('We could not find this guardian. It may have been removed. Go back and open it again.');
    expect(await said(ruleError(404, 'not_found', { field: 'guardian' }), 'hi')).toContain('अभिभावक');
    expect(await said(ruleError(400, 'required', { field: 'who_asked' }))).toContain('who asked and how');
    expect(await said(ruleError(400, 'choose_one', { field: 'verification_method' }))).toBe('Choose the way the guardian was verified from the list.');
    expect(await said(ruleError(409, 'two_step_delete'))).toContain('two steps');
  });

  it('the body keeps a plain English sentence for anything that reads only `error`', async () => {
    const body = await ruleError(403, 'not_allowed').json();
    expect(body).toMatchObject({ code: 'not_allowed', error: 'Your role cannot do this. Ask your principal or school admin.' });
  });

  it('what the entitlement check refused is said plainly, with its status kept', async () => {
    const off = accessDenied({ status: 403, error: 'module_not_enabled' });
    expect(off.status).toBe(403);
    expect(await said(off)).toContain('does not have this part switched on');
    expect(await said(accessDenied({ status: 403, error: 'read_only' }))).toContain('can be read but not changed');
    expect(await said(accessDenied({ status: 403, error: 'role_not_allowed' }))).toBe('Your role cannot do this. Ask your principal or school admin.');
  });
});
