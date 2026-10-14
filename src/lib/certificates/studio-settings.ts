import { browserStore, cleanProfile, type KeyValueStore, type SchoolProfile } from '@/lib/free-tools/school-profile';
import { CERT_DEFS, type CertImage, type CertType, type CertValues, type TemplateId } from './definitions';

// What the certificate studio remembers in this browser, and how it fills
// in the school details saved for every free tool (school-profile.ts).
//
//   - Studio settings: the chosen design, the next certificate number for
//     each document and the academic year. None of it is about a person.
//   - Never: a student's details, a signature or a stamp. Those stay in
//     the studio's memory and are gone when the tab closes.

export const STUDIO_KEY = 'nca-free-tool:certificate-studio';

export interface StudioSettings {
  templates: Partial<Record<CertType, TemplateId>>;
  next: Partial<Record<CertType, string>>; // the next certificate number to issue
  year: string; // academic year, such as 2026-27
}

export const EMPTY_SETTINGS: StudioSettings = { templates: {}, next: {}, year: '' };

// Only known documents, their own templates and short strings; anything
// else in storage is dropped.
export function cleanSettings(input: unknown): StudioSettings {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const obj = (x: unknown) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});
  const out: StudioSettings = { templates: {}, next: {}, year: typeof src.year === 'string' ? src.year.slice(0, 20) : '' };
  for (const d of CERT_DEFS) {
    const t = obj(src.templates)[d.type];
    if (typeof t === 'string' && (d.templates as string[]).includes(t)) out.templates[d.type] = t as TemplateId;
    const n = obj(src.next)[d.type];
    if (typeof n === 'string' && n.trim() && d.numberField !== 'rollNo') out.next[d.type] = n.slice(0, 30);
  }
  return out;
}

export function readSettings(store: KeyValueStore | null = browserStore()): StudioSettings {
  if (!store) return { ...EMPTY_SETTINGS };
  try {
    const raw = store.getItem(STUDIO_KEY);
    return raw ? cleanSettings(JSON.parse(raw)) : { ...EMPTY_SETTINGS };
  } catch {
    return { ...EMPTY_SETTINGS };
  }
}

export function writeSettings(s: StudioSettings, store: KeyValueStore | null = browserStore()): boolean {
  if (!store) return false;
  try {
    store.setItem(STUDIO_KEY, JSON.stringify(cleanSettings(s)));
    return true;
  } catch {
    return false;
  }
}

// Studio fields that the saved school profile also holds, by the same id.
export const PROFILE_SCHOOL_IDS = ['schoolName', 'affiliation', 'schoolCode', 'address', 'phone', 'email', 'place', 'signName', 'signTitle'] as const;

// Fills the studio's school fields from the saved profile. A field the
// visitor has edited in this session keeps what they typed; any other
// field takes the saved value. An empty saved value never blanks a field.
export function fillFromProfile(current: CertValues, p: SchoolProfile, edited: ReadonlySet<string>): CertValues {
  const out = { ...current };
  for (const id of PROFILE_SCHOOL_IDS) {
    if (edited.has(id)) continue;
    const saved = p[id].trim();
    if (saved) out[id] = p[id];
  }
  return out;
}

export function profileLogo(p: SchoolProfile): CertImage | undefined {
  return p.logo && p.logoAspect > 0 ? { src: p.logo, aspect: p.logoAspect } : undefined;
}

// The saved profile with the studio's school fields written over it.
// Fields the studio does not have (UDISE+, board, principal) are kept.
// `logo` is the already-shrunk logo to save; `undefined` keeps the saved
// one and `null` removes it.
export function mergeIntoProfile(p: SchoolProfile, school: CertValues, logo?: CertImage | null): SchoolProfile {
  const next: SchoolProfile = { ...p };
  for (const id of PROFILE_SCHOOL_IDS) next[id] = (school[id] ?? '').trim();
  if (logo === null) {
    next.logo = '';
    next.logoAspect = 0;
  } else if (logo) {
    next.logo = logo.src;
    next.logoAspect = logo.aspect;
  }
  return cleanProfile(next);
}
