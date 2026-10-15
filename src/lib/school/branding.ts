import { randomUUID } from 'crypto';
import { writeAuditLog } from '@/lib/audit/log';
import type { SessionRole } from '@/lib/auth/types';
import type { Sql } from '@/lib/jobs/types';
import { FileStorageUnavailableError, MemoryFileStorage, sniffImageType, type FileStorage } from '@/lib/storage/file-storage';
import { checkLogo, checkSchoolName, type LogoProblem, type LogoType } from './logo-file';

// THE SCHOOL'S PROFILE AND BRANDING (C235-B): its official name and its logo, shown at the top of every screen of the
// school app and the family app.
//
// Who changes them: the principal and the school admin of that school, and NetCyberAI's founder from Control (the
// platform role). Held three ways: here (the role, before anything is read or stored), by the database (the app's
// role may UPDATE only name, address and logo_path of schools, the restrictive policy admits only the principal and
// the school admin of that school, and a trigger refuses any other column: migration c235b), and by the routes,
// which pass the session's own school, never one a request names (Control's route takes the school from its address,
// for the platform role only).
//
// The logo is kept in the private bucket at "<schoolId>/branding/logo-<uuid>.<ext>" through FileStorage (the storage
// choke point), a new key each time: the new file is stored first, the row is changed, and only then is the old file
// removed, so a failure on the way leaves the old logo in place. Every change writes one audit row,
// 'school.branding_updated', with what changed and ids only: no picture and no name.

export type BrandingActor = { userId: string; role: SessionRole };
export type BrandingInput = { name?: unknown; logo?: Uint8Array; removeLogo?: boolean };
export type BrandingProblem = 'not_allowed' | 'not_found' | 'name_blank' | 'name_long' | 'name_invalid' | LogoProblem | 'storage_unavailable';
export type BrandingResult = { ok: true; name: string; logoVersion: string | null; changed: { name: boolean; logo: 'set' | 'removed' | 'kept' } } | { ok: false; reason: BrandingProblem };
export type SchoolBrand = { name: string; logoVersion: string | null };

const MAY_CHANGE: readonly SessionRole[] = ['principal', 'school_admin', 'super_admin'];
export const mayChangeBranding = (role: SessionRole | null | undefined): boolean => !!role && MAY_CHANGE.includes(role);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isSchoolId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

// The version a logo's address carries: when it last changed, in milliseconds.
const versionOf = (logoPath: unknown, updatedAt: unknown): string | null => (logoPath && updatedAt ? String(new Date(updatedAt as string).getTime()) : null);

// Where the browser asks for the logo. A school's own session: its own school. Control: the school named.
export function logoAddress(logoVersion: string | null, schoolId?: string): string | null {
  if (!logoVersion) return null;
  return schoolId ? `/api/branding/logo?school=${schoolId}&v=${logoVersion}` : `/api/branding/logo?v=${logoVersion}`;
}

export async function loadSchoolBrand(db: Sql, schoolId: string): Promise<SchoolBrand | null> {
  const row = (await db.query(`select name, logo_path, logo_updated_at from schools where school_id = $1`, [schoolId])).rows[0];
  return row ? { name: row.name as string, logoVersion: versionOf(row.logo_path, row.logo_updated_at) } : null;
}

export async function updateSchoolBranding(db: Sql, storage: FileStorage, actor: BrandingActor, schoolId: string, input: BrandingInput, newId: () => string = () => randomUUID()): Promise<BrandingResult> {
  if (!mayChangeBranding(actor.role) || !isSchoolId(schoolId)) return { ok: false, reason: 'not_allowed' };
  const name = input.name === undefined ? null : checkSchoolName(input.name);
  if (name && !name.ok) return { ok: false, reason: name.reason };
  const logo = input.logo ? checkLogo(input.logo) : null;
  if (logo && !logo.ok) return { ok: false, reason: logo.reason };

  const before = (await db.query(`select name, logo_path, logo_updated_at from schools where school_id = $1 for update`, [schoolId])).rows[0] as { name: string; logo_path: string | null; logo_updated_at: string | null } | undefined;
  if (!before) return { ok: false, reason: 'not_found' };
  const newName = name && name.ok ? name.name : null;
  const nameChanged = newName !== null && newName !== before.name;
  const logoChange: 'set' | 'removed' | 'kept' = logo ? 'set' : input.removeLogo && before.logo_path ? 'removed' : 'kept';
  if (!nameChanged && logoChange === 'kept') return { ok: true, name: before.name, logoVersion: versionOf(before.logo_path, before.logo_updated_at), changed: { name: false, logo: 'kept' } };

  // The new file first, under this school's own prefix.
  let key: string | null = null;
  if (logo && input.logo) {
    key = `${schoolId}/branding/logo-${newId()}.${logo.extension}`;
    try {
      await storage.put(key, input.logo, logo.type);
    } catch (err) {
      if (err instanceof FileStorageUnavailableError) return { ok: false, reason: 'storage_unavailable' };
      throw err;
    }
  }
  try {
    const sets: string[] = [];
    const params: unknown[] = [schoolId];
    if (nameChanged) sets.push(`name = $${params.push(newName)}`);
    if (logoChange !== 'kept') sets.push(`logo_path = $${params.push(key)}`);
    const after = (await db.query(`update schools set ${sets.join(', ')} where school_id = $1 returning name, logo_path, logo_updated_at`, params)).rows[0];
    // The database refused the row (another school's, or a role it does not admit): nothing changed.
    if (!after) {
      if (key) await storage.remove(key).catch(() => undefined);
      return { ok: false, reason: 'not_allowed' };
    }
    await writeAuditLog(db, {
      schoolId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      eventAction: 'school.branding_updated',
      targetType: 'schools',
      targetId: schoolId,
      afterState: { nameChanged, logo: logoChange, ...(logo && logo.ok && input.logo ? { logoType: logo.type, logoBytes: input.logo.length, width: logo.width, height: logo.height } : {}) },
    });
    if (logoChange !== 'kept' && before.logo_path && before.logo_path !== key) await storage.remove(before.logo_path).catch(() => undefined);
    return { ok: true, name: after.name as string, logoVersion: versionOf(after.logo_path, after.logo_updated_at), changed: { name: nameChanged, logo: logoChange } };
  } catch (err) {
    if (key) await storage.remove(key).catch(() => undefined);
    throw err;
  }
}

// The logo's bytes for the school asked (the caller passes the session's own school, or Control's), or null when the
// school has none or the storage cannot give it now. Read through a short-lived signed link on the server only; the
// browser is given the app's own address, which it keeps for a day.
export type StoredLogo = { bytes: Uint8Array; type: LogoType };
export async function readSchoolLogo(db: Sql, storage: FileStorage, schoolId: string): Promise<StoredLogo | null> {
  const row = (await db.query(`select logo_path from schools where school_id = $1`, [schoolId])).rows[0];
  const key = row?.logo_path as string | null | undefined;
  if (!key || !key.startsWith(`${schoolId}/branding/`)) return null;
  let bytes: Uint8Array | null = null;
  try {
    if (storage instanceof MemoryFileStorage) bytes = storage.files.get(key)?.bytes ?? null;
    else {
      const res = await fetch(await storage.signedUrl(key, 60), { cache: 'no-store' });
      bytes = res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    }
  } catch {
    return null;
  }
  const type = bytes ? sniffImageType(bytes) : null;
  return bytes && type ? { bytes, type } : null;
}
