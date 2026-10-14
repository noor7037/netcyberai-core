// The school's own details for the free tools, saved in this browser only
// (founder, 2026-10-14, Decision Log C198-B). Typed once, then filled into
// every free tool: certificates, receipts, reports, trackers and checks.
//
// What is kept here, and what never is:
//   - kept: the SCHOOL's details (name, codes, address, contact, board,
//     signatory, logo). They are the same on every document and belong to
//     the institution, not to a child.
//   - never: any student's, parent's or teacher's personal details. Those
//     stay in the tool's memory for one session (or in a tracker's own
//     on-device list, which says so on screen) and are not written here.
//
// Nothing here is sent to NetCyberAI. Storage can be missing or full
// (private windows, a locked-down office computer): every call fails soft.

export interface SchoolProfile {
  schoolName: string;
  affiliation: string;
  schoolCode: string;
  udise: string;
  board: string;
  address: string;
  place: string;
  phone: string;
  email: string;
  principalName: string;
  signName: string;
  signTitle: string;
  // A small image as a data: URL. Capped so storage never fills up.
  logo: string;
  // Width divided by height of the logo, so it is drawn without stretching.
  logoAspect: number;
}

export type ProfileFieldId = Exclude<keyof SchoolProfile, 'logo' | 'logoAspect'>;

export const PROFILE_FIELDS: { id: ProfileFieldId; label: string; max: number }[] = [
  { id: 'schoolName', label: 'School name', max: 90 },
  { id: 'affiliation', label: 'Affiliation number', max: 40 },
  { id: 'schoolCode', label: 'School code', max: 40 },
  { id: 'udise', label: 'UDISE+ code', max: 20 },
  { id: 'board', label: 'Board', max: 60 },
  { id: 'address', label: 'Address', max: 140 },
  { id: 'place', label: 'Place (printed beside the date)', max: 40 },
  { id: 'phone', label: 'Phone', max: 40 },
  { id: 'email', label: 'Email', max: 80 },
  { id: 'principalName', label: 'Principal’s name', max: 60 },
  { id: 'signName', label: 'Signatory name', max: 60 },
  { id: 'signTitle', label: 'Signatory designation', max: 40 },
];

export const PROFILE_KEY = 'nca-school-profile:v1';
// A data: URL this long is roughly a 300 KB image: plenty for a logo.
export const MAX_LOGO_CHARS = 400_000;

export const EMPTY_PROFILE: SchoolProfile = {
  schoolName: '',
  affiliation: '',
  schoolCode: '',
  udise: '',
  board: '',
  address: '',
  place: '',
  phone: '',
  email: '',
  principalName: '',
  signName: '',
  signTitle: '',
  logo: '',
  logoAspect: 0,
};

// The minimal storage surface, so the rules can be tested without a browser.
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function browserStore(): KeyValueStore | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

// Only known fields, only strings, each trimmed to its limit. Anything else
// in storage (an old version, a hand edit) is dropped, never trusted.
export function cleanProfile(input: unknown): SchoolProfile {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: SchoolProfile = { ...EMPTY_PROFILE };
  for (const f of PROFILE_FIELDS) {
    const v = src[f.id];
    if (typeof v === 'string') out[f.id] = v.slice(0, f.max);
  }
  const logo = src.logo;
  const aspect = src.logoAspect;
  if (
    typeof logo === 'string' &&
    logo.length <= MAX_LOGO_CHARS &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo) &&
    typeof aspect === 'number' &&
    aspect >= 0.1 &&
    aspect <= 10
  ) {
    out.logo = logo;
    out.logoAspect = aspect;
  }
  return out;
}

export function hasProfile(p: SchoolProfile): boolean {
  return p.schoolName.trim().length > 0;
}

// The lines printed under the school's name at the top of a report, a
// letter or a register: address, then codes and contact. Empty parts are
// left out, so a half-filled profile still prints cleanly.
export function schoolHeaderLines(p: SchoolProfile): string[] {
  const codes = [
    p.board.trim(),
    p.affiliation.trim() && `Affiliation No. ${p.affiliation.trim()}`,
    p.schoolCode.trim() && `School Code ${p.schoolCode.trim()}`,
    p.udise.trim() && `UDISE+ ${p.udise.trim()}`,
  ].filter(Boolean);
  const contact = [p.phone.trim(), p.email.trim()].filter(Boolean);
  return [p.address.trim(), codes.join(' · '), contact.join(' · ')].filter(Boolean);
}

export function readProfile(store: KeyValueStore | null = browserStore()): SchoolProfile {
  if (!store) return { ...EMPTY_PROFILE };
  try {
    const raw = store.getItem(PROFILE_KEY);
    return raw ? cleanProfile(JSON.parse(raw)) : { ...EMPTY_PROFILE };
  } catch {
    return { ...EMPTY_PROFILE };
  }
}

// Returns false when the browser refused (storage off or full); the tool
// keeps working with what is on screen.
export function saveProfile(p: SchoolProfile, store: KeyValueStore | null = browserStore()): boolean {
  if (!store) return false;
  try {
    store.setItem(PROFILE_KEY, JSON.stringify(cleanProfile(p)));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PROFILE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function clearProfile(store: KeyValueStore | null = browserStore()): void {
  try {
    store?.removeItem(PROFILE_KEY);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PROFILE_EVENT));
  } catch {
    // Nothing to clear.
  }
}

// Fired in this tab when the profile changes, so every open tool refills.
export const PROFILE_EVENT = 'nca-school-profile-changed';
