import { hasAadhaarNumber } from '@/lib/privacy/aadhaar';
import { imageSize } from '@/lib/school/logo-file';
import { sniffImageType } from '@/lib/storage/file-storage';

// A member of staff's profile (C238): the fields the office keeps, their limits, and what a photo may be. Pure: no
// database, no storage; the edit form and the server read the same limits, and the database holds the same rules
// (migration c238_staff_profiles). Skills, experience, Aadhaar, PAN and bank details are not kept (Aadhaar never;
// payroll is blocked, C230; skills and experience wait for the founder's list of fields).

// The profile's tabs, in order (?tab=<id> opens one).
export const STAFF_PROFILE_TABS = ['overview', 'contact', 'employment', 'attendance', 'teaching', 'qualifications', 'documents', 'id-card', 'biodata'] as const;
export type StaffProfileTab = (typeof STAFF_PROFILE_TABS)[number];

export const EMPLOYMENT_TYPES = ['permanent', 'contract', 'part_time', 'visiting', 'probation'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const PROFILE_FIELDS = ['staff_code', 'designation', 'employment_type', 'joining_date', 'date_of_birth', 'address', 'emergency_contact'] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type ProfileValues = Record<ProfileField, string | null>;

export const STAFF_CODE_MAX = 20;
export const DESIGNATION_MAX = 60;
export const ADDRESS_MAX = 300;
export const EMERGENCY_MAX = 120;
const STAFF_CODE = /^[A-Za-z0-9][A-Za-z0-9 ./_-]{0,19}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
// eslint-disable-next-line no-control-regex
const CONTROL_BUT_LINES = /[\u0000-\u0009\u000b-\u001f\u007f]/;

export type ProfileProblem = { field: ProfileField; reason: 'invalid' | 'too_long' | 'aadhaar' | 'date' };
export type ProfileCheck = { ok: true; values: ProfileValues } | { ok: false; problem: ProfileProblem };

const isDay = (v: string) => DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// The form's values as they are kept: spaces at the ends dropped, an empty field kept as nothing (null). `today`: India's.
export function checkProfileInput(raw: Record<string, unknown>, today: string): ProfileCheck {
  const values = {} as ProfileValues;
  for (const field of PROFILE_FIELDS) {
    const v = raw[field];
    if (v !== undefined && v !== null && typeof v !== 'string') return { ok: false, problem: { field, reason: 'invalid' } };
    let text = typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim() : '';
    if (field === 'address') text = text.split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
    else text = text.replace(/\s+/g, ' ');
    values[field] = text === '' ? null : text;
  }
  const bad = (field: ProfileField, reason: ProfileProblem['reason']): ProfileCheck => ({ ok: false, problem: { field, reason } });
  for (const field of PROFILE_FIELDS) {
    const v = values[field];
    if (v === null) continue;
    if ((field === 'address' ? CONTROL_BUT_LINES : CONTROL).test(v)) return bad(field, 'invalid');
    if (hasAadhaarNumber(v)) return bad(field, 'aadhaar');
  }
  const { staff_code: code, designation, employment_type: kind, joining_date: joining, date_of_birth: born, address, emergency_contact: emergency } = values;
  if (code !== null && code.length > STAFF_CODE_MAX) return bad('staff_code', 'too_long');
  if (code !== null && !STAFF_CODE.test(code)) return bad('staff_code', 'invalid');
  if (designation !== null && designation.length > DESIGNATION_MAX) return bad('designation', 'too_long');
  if (kind !== null && !(EMPLOYMENT_TYPES as readonly string[]).includes(kind)) return bad('employment_type', 'invalid');
  if (joining !== null && (!isDay(joining) || joining < '1950-01-01' || joining > addDays(today, 366))) return bad('joining_date', 'date');
  if (born !== null && (!isDay(born) || born < '1930-01-01' || born > today)) return bad('date_of_birth', 'date');
  if (address !== null && address.length > ADDRESS_MAX) return bad('address', 'too_long');
  if (emergency !== null && emergency.length > EMERGENCY_MAX) return bad('emergency_contact', 'too_long');
  return { ok: true, values };
}

// The photo. The browser takes a JPEG, PNG or WebP of up to 5 MB and draws it at most PHOTO_EDGE_PX on its long side
// (src/lib/staff/photo-draw.ts); the server takes a PNG, JPEG or WebP by its first bytes, up to 5 MB, of a size a
// photo can be, and nothing else.
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_EDGE_PX = 512;
export const PHOTO_MIN_SIDE_PX = 16;
export const PHOTO_MAX_SIDE_PX = 1024;
export const PHOTO_MAX_ASPECT = 4;
export const PHOTO_PICKER_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';
export type PhotoType = 'image/png' | 'image/jpeg' | 'image/webp';
export const PHOTO_EXTENSION: Record<PhotoType, 'png' | 'jpg' | 'webp'> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
export type PhotoProblem = 'photo_empty' | 'photo_too_large' | 'photo_not_image' | 'photo_dimensions';
export type PhotoCheck = { ok: true; type: PhotoType; extension: 'png' | 'jpg' | 'webp'; width: number; height: number } | { ok: false; reason: PhotoProblem };

export function checkStaffPhoto(bytes: Uint8Array): PhotoCheck {
  if (bytes.length === 0) return { ok: false, reason: 'photo_empty' };
  if (bytes.length > PHOTO_MAX_BYTES) return { ok: false, reason: 'photo_too_large' };
  const type = sniffImageType(bytes);
  const size = type ? imageSize(bytes, type) : null;
  if (!type || !size) return { ok: false, reason: 'photo_not_image' };
  const { width, height } = size;
  const sideOk = (n: number) => n >= PHOTO_MIN_SIDE_PX && n <= PHOTO_MAX_SIDE_PX;
  if (!sideOk(width) || !sideOk(height) || width / height > PHOTO_MAX_ASPECT || height / width > PHOTO_MAX_ASPECT) return { ok: false, reason: 'photo_dimensions' };
  return { ok: true, type, extension: PHOTO_EXTENSION[type], width, height };
}

// Where the browser asks for the photo: the app's own address, never a storage link, with a version that changes only
// when the photo does (src/lib/staff/profile.ts photoVersionOf), so the browser keeps the picture until then.
export const photoAddress = (userId: string, version: string | null): string | null => (version ? `/api/app/staff/${userId}/photo?v=${version}` : null);

// The initials a person without a photo is shown by.
export function staffInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
