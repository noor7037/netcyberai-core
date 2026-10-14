import { describe, expect, it } from 'vitest';
import { EMPTY_PROFILE, type KeyValueStore } from '@/lib/free-tools/school-profile';
import { STUDIO_KEY, cleanSettings, fillFromProfile, mergeIntoProfile, profileLogo, readSettings, writeSettings } from './studio-settings';

const LOGO = 'data:image/png;base64,iVBORw0KGgo=';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe('studio settings', () => {
  it('keeps only known documents, their own templates and short strings', () => {
    const s = cleanSettings({
      templates: { transfer: 'celebration', achievement: 'celebration', nope: 'classic' },
      next: { bonafide: 'SPS/BC/2026/113', marksheet: '14', transfer: 42 },
      year: '2026-27',
      studentName: 'never kept',
    });
    expect(s).toEqual({ templates: { achievement: 'celebration' }, next: { bonafide: 'SPS/BC/2026/113' }, year: '2026-27' });
    expect(cleanSettings(null)).toEqual({ templates: {}, next: {}, year: '' });
  });
  it('reads and writes fail-soft', () => {
    const store = memoryStore();
    expect(writeSettings({ templates: { bonafide: 'modern' }, next: { study: 'SC/9' }, year: '2026-27' }, store)).toBe(true);
    expect(readSettings(store).next.study).toBe('SC/9');
    store.data.set(STUDIO_KEY, '{not json');
    expect(readSettings(store)).toEqual({ templates: {}, next: {}, year: '' });
    expect(readSettings(null)).toEqual({ templates: {}, next: {}, year: '' });
    const full: KeyValueStore = { getItem: () => null, removeItem: () => undefined, setItem: () => { throw new Error('full'); } };
    expect(writeSettings({ templates: {}, next: {}, year: '' }, full)).toBe(false);
  });
});

describe('school profile in the studio', () => {
  const saved = { ...EMPTY_PROFILE, schoolName: 'Sunrise Public School', place: 'Panipat', udise: '0000', signName: 'Dr. K. Malhotra', logo: LOGO, logoAspect: 2 };

  it('fills every field the visitor has not edited, and never blanks one', () => {
    const out = fillFromProfile({ schoolName: '', phone: '0180 000', place: 'Typed' }, saved, new Set(['place']));
    expect(out.schoolName).toBe('Sunrise Public School');
    expect(out.signName).toBe('Dr. K. Malhotra');
    expect(out.place).toBe('Typed');
    expect(out.phone).toBe('0180 000');
    expect(out).not.toHaveProperty('udise');
  });

  it('gives the saved logo as a certificate image', () => {
    expect(profileLogo(saved)).toEqual({ src: LOGO, aspect: 2 });
    expect(profileLogo(EMPTY_PROFILE)).toBeUndefined();
  });

  it('merges the studio into the saved profile, keeping what the studio lacks', () => {
    const merged = mergeIntoProfile(saved, { schoolName: ' New Name ', place: '', signTitle: 'Principal', studentName: 'never' });
    expect(merged.schoolName).toBe('New Name');
    expect(merged.place).toBe('');
    expect(merged.signTitle).toBe('Principal');
    expect(merged.udise).toBe('0000');
    expect(merged.logo).toBe(LOGO);
    expect(merged).not.toHaveProperty('studentName');
    expect(mergeIntoProfile(saved, {}, null).logo).toBe('');
    expect(mergeIntoProfile(EMPTY_PROFILE, { schoolName: 'A' }, { src: LOGO, aspect: 1.5 })).toMatchObject({ logo: LOGO, logoAspect: 1.5 });
  });
});
