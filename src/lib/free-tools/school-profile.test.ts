import { describe, expect, it } from 'vitest';
import { withSchool, type ToolReport } from './report';
import { EMPTY_PROFILE, MAX_LOGO_CHARS, PROFILE_KEY, cleanProfile, clearProfile, hasProfile, readProfile, saveProfile, schoolHeaderLines, type KeyValueStore } from './school-profile';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const LOGO = 'data:image/png;base64,iVBORw0KGgo=';

describe('school profile saved in the browser', () => {
  it('keeps only known string fields, each trimmed to its limit', () => {
    const p = cleanProfile({ schoolName: 'x'.repeat(200), board: 'CBSE', studentName: 'Aarav', phone: 42, logo: 'javascript:alert(1)', logoAspect: 2 });
    expect(p.schoolName).toHaveLength(90);
    expect(p.board).toBe('CBSE');
    expect(p.phone).toBe('');
    expect(p.logo).toBe('');
    expect(Object.keys(p)).not.toContain('studentName');
  });

  it('accepts a small image logo with a sane aspect, and nothing else', () => {
    expect(cleanProfile({ logo: LOGO, logoAspect: 1.5 }).logo).toBe(LOGO);
    expect(cleanProfile({ logo: LOGO, logoAspect: 50 }).logo).toBe('');
    expect(cleanProfile({ logo: 'data:image/svg+xml;base64,PHN2Zz4=', logoAspect: 1 }).logo).toBe('');
    expect(cleanProfile({ logo: `data:image/png;base64,${'A'.repeat(MAX_LOGO_CHARS)}`, logoAspect: 1 }).logo).toBe('');
  });

  it('round-trips through storage and fails soft on bad data', () => {
    const store = memoryStore();
    expect(saveProfile({ ...EMPTY_PROFILE, schoolName: 'Sunrise Public School', place: 'Jaipur' }, store)).toBe(true);
    const back = readProfile(store);
    expect(back.schoolName).toBe('Sunrise Public School');
    expect(hasProfile(back)).toBe(true);
    store.data.set(PROFILE_KEY, '{not json');
    expect(readProfile(store)).toEqual(EMPTY_PROFILE);
    clearProfile(store);
    expect(store.data.has(PROFILE_KEY)).toBe(false);
    expect(readProfile(null)).toEqual(EMPTY_PROFILE);
    expect(saveProfile(back, null)).toBe(false);
  });

  it('reports a full storage as not saved', () => {
    const full: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
    };
    expect(saveProfile({ ...EMPTY_PROFILE, schoolName: 'A' }, full)).toBe(false);
  });

  it('prints only the parts that are filled in', () => {
    expect(schoolHeaderLines({ ...EMPTY_PROFILE, schoolName: 'A', address: 'Main Road', udise: '08120100101', phone: '0141 000000' })).toEqual([
      'Main Road',
      'UDISE+ 08120100101',
      '0141 000000',
    ]);
    expect(schoolHeaderLines({ ...EMPTY_PROFILE, schoolName: 'A' })).toEqual([]);
  });

  it('puts the saved school on a report, and leaves it alone when none is saved', () => {
    const r: ToolReport = { title: 'T', sections: [], assumptions: [], disclaimer: 'd' };
    expect(withSchool(r, EMPTY_PROFILE)).toBe(r);
    const w = withSchool(r, { ...EMPTY_PROFILE, schoolName: ' Sunrise ', board: 'CBSE' });
    expect(w.school).toEqual({ name: 'Sunrise', lines: ['CBSE'] });
  });
});
