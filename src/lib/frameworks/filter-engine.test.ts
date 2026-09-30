import { describe, expect, it } from 'vitest';
import { decodeListQuery, encodeListQuery, type ListQuery } from '@/lib/contracts/filters';
import { compileListQuery, decodeCursor, encodeCursor, listFields } from './filter-engine';
import { listSpec } from './lists';

const spec = listSpec('students')!;
const school = '11111111-1111-1111-1111-111111111111';
const field = { fieldId: '22222222-2222-2222-2222-222222222222', entity: 'student' as const, key: 'house', label: 'House', type: 'list' as const, options: ['Red', 'Blue'], required: false, archived: false };
const compile = (q: unknown) => compileListQuery(spec, q, { schoolId: school, customFields: [field] });

describe('filter engine', () => {
  it('compiles fields, operators and AND/OR groups to bind parameters only', () => {
    const r = compile({
      filter: {
        combinator: 'and',
        conditions: [
          { field: 'status', op: 'in', value: ['active'] },
          { combinator: 'or', conditions: [{ field: 'name', op: 'contains', value: "o'brien%" }, { field: 'dob', op: 'last_n_days', value: 30 }] },
          { field: 'cf:22222222-2222-2222-2222-222222222222', op: 'in', value: ['Red'] },
        ],
      },
      search: 'aar',
      sort: [{ field: 'class', dir: 'desc' }],
    });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const { where, orderBy, params } = r.compiled;
    expect(where).not.toMatch(/o'brien|aar|Red/); // every value is a parameter
    expect(params).toEqual([school, ['active'], "o'brien\\%", 30, field.fieldId, ['Red'], 'aar']);
    expect(where).toContain('s.school_id = $1');
    expect(where).toContain(' or ');
    expect(orderBy).toBe('lower(c.name) desc nulls last, s.student_id asc');
  });

  it('refuses unknown fields, wrong operators, bad values and unknown keys', () => {
    const bad = [
      { filter: { combinator: 'and', conditions: [{ field: 's.name; drop table students', op: 'eq', value: 'x' }] } },
      { filter: { combinator: 'and', conditions: [{ field: 'name', op: 'gt', value: 'x' }] } },
      { filter: { combinator: 'and', conditions: [{ field: 'status', op: 'in', value: ['alumni'] }] } },
      { filter: { combinator: 'xor', conditions: [] } },
      { filter: { combinator: 'and', conditions: [{ field: 'dob', op: 'between', value: { from: '2026-02-30', to: '2026-03-01' } }] } },
      { sort: [{ field: 'status', dir: 'asc' }] }, // not sortable
      { sort: [{ field: 'name', dir: 'sideways' }] },
      { pageSize: 500 },
      { cursor: 'nope' },
      { columns: ['password_hash'] },
      { __proto__: 1, extra: true },
    ];
    for (const q of bad) expect(compile(q).ok).toBe(false);
  });

  it('limits depth and condition count', () => {
    const deep = { combinator: 'and', conditions: [{ combinator: 'and', conditions: [{ combinator: 'and', conditions: [{ combinator: 'and', conditions: [] }] }] }] };
    expect(compile({ filter: deep }).ok).toBe(false);
    const many = { combinator: 'or', conditions: Array.from({ length: 31 }, () => ({ field: 'name', op: 'eq', value: 'a' })) };
    expect(compile({ filter: many }).ok).toBe(false);
  });

  it('serves custom fields as filter fields, archived ones left out', () => {
    const keys = listFields(spec, [field, { ...field, fieldId: '33333333-3333-3333-3333-333333333333', archived: true }]).map((f) => f.key);
    expect(keys).toContain('cf:22222222-2222-2222-2222-222222222222');
    expect(keys).not.toContain('cf:33333333-3333-3333-3333-333333333333');
  });

  it('the q parameter and cursors round-trip', () => {
    const q: ListQuery = { search: 'Anaya ✓', filter: { combinator: 'and', conditions: [{ field: 'status', op: 'in', value: ['active'] }] } };
    expect(decodeListQuery(encodeListQuery(q))).toEqual(q);
    expect(decodeListQuery('not base64!')).toBeNull();
    expect(decodeCursor(encodeCursor(150))).toBe(150);
    expect(decodeCursor(Buffer.from('{"o":-1}').toString('base64url'))).toBeNull();
  });
});
