import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { FileStorageUnavailableError, sniffImageType, type FileStorage } from '@/lib/storage/file-storage';
import { indiaDate } from '@/lib/time/india';
import { checkProfileInput, checkStaffPhoto, PROFILE_FIELDS, type PhotoProblem, type PhotoType, type ProfileField, type ProfileProblem } from './profile-rules';

// Changing a member of staff's profile (C238): its fields, and its photo. The principal and the school admin of the
// school only, in their own name; held three ways: here (the role, before anything is read or stored), by the
// database (the restrictive policies and the trigger of migration c238_staff_profiles) and by the routes, which pass
// the session's own school, never one a request names.
//
// Every change writes ONE audit row with ids and the NAMES of what changed, never a value: 'staff_profile.saved'
// (created or not, and the fields changed), 'staff_profile.photo_set' (the picture's type, size in bytes and pixels)
// and 'staff_profile.photo_removed'.
//
// The photo is kept through FileStorage (the storage choke point) at "<school>/staff-photos/<person>-<uuid>.<ext>", a
// new key each time: the new file is stored first, the row is changed, and only then is the old file removed, so a
// failure on the way leaves the old photo in place. It is read back only through readStaffPhoto, for the app's own
// address; no storage link is ever handed to a browser.

type Sql = Pick<PoolClient, 'query'>;
export type ProfileActor = { schoolId: string; userId: string; role: StaffRole };
export const mayEditStaffProfile = (role: string): boolean => role === 'principal' || role === 'school_admin';
const STAFF_ROLES = ['principal', 'school_admin', 'teacher', 'accountant', 'academic_coordinator'];

// A member of the school's own staff list: a users row of the school, of a staff role, with a staff membership here
// (the people the database keeps a profile for).
async function isStaffHere(db: Sql, schoolId: string, userId: string): Promise<boolean> {
  const { rows } = await db.query(
    `select 1 from users u
      where u.school_id = $1 and u.user_id = $2 and u.role::text = any ($3::text[])
        and exists (select 1 from memberships m where m.school_id = u.school_id and m.user_id = u.user_id and m.role::text <> 'parent')`,
    [schoolId, userId, STAFF_ROLES]
  );
  return rows.length > 0;
}

const versionOf = (updatedAt: unknown): string => String(new Date(updatedAt as string).getTime());

export type SaveResult =
  | { ok: true; created: boolean; changed: ProfileField[] }
  | { ok: false; reason: 'not_allowed' | 'not_found' | 'code_taken' }
  | { ok: false; reason: 'field'; problem: ProfileProblem };

export async function saveStaffProfile(db: Sql, actor: ProfileActor, staffId: string, raw: Record<string, unknown>): Promise<SaveResult> {
  if (!mayEditStaffProfile(actor.role)) return { ok: false, reason: 'not_allowed' };
  const checked = checkProfileInput(raw, indiaDate());
  if (!checked.ok) return { ok: false, reason: 'field', problem: checked.problem };
  if (!(await isStaffHere(db, actor.schoolId, staffId))) return { ok: false, reason: 'not_found' };
  const before = (
    await db.query(
      `select staff_code, designation, employment_type, joining_date::text as joining_date, date_of_birth::text as date_of_birth, address, emergency_contact
         from staff_profiles where school_id = $1 and user_id = $2 for update`,
      [actor.schoolId, staffId]
    )
  ).rows[0] as Record<ProfileField, string | null> | undefined;
  const after = checked.values;
  const changed = PROFILE_FIELDS.filter((f) => (before?.[f] ?? null) !== after[f]);
  if (changed.length === 0) return { ok: true, created: false, changed };
  // The staff code is unique in the school: the database decides, behind a savepoint, so a code already taken is
  // said plainly and the transaction goes on.
  await db.query('savepoint staff_profile_save');
  try {
    await db.query(
      `insert into staff_profiles (school_id, user_id, staff_code, designation, employment_type, joining_date, date_of_birth, address, emergency_contact, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (school_id, user_id) do update
          set staff_code = excluded.staff_code, designation = excluded.designation, employment_type = excluded.employment_type,
              joining_date = excluded.joining_date, date_of_birth = excluded.date_of_birth, address = excluded.address,
              emergency_contact = excluded.emergency_contact, updated_by = excluded.updated_by`,
      [actor.schoolId, staffId, after.staff_code, after.designation, after.employment_type, after.joining_date, after.date_of_birth, after.address, after.emergency_contact, actor.userId]
    );
    await db.query('release savepoint staff_profile_save');
  } catch (err) {
    await db.query('rollback to savepoint staff_profile_save');
    const e = err as { code?: string; constraint?: string; message?: string };
    if (e.code === '23505' && `${e.constraint ?? ''} ${e.message ?? ''}`.includes('staff_profiles_code_per_school')) return { ok: false, reason: 'code_taken' };
    throw err;
  }
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'staff_profile.saved',
    targetType: 'users',
    targetId: staffId,
    afterState: { created: !before, fields: changed },
  });
  return { ok: true, created: !before, changed };
}

export type PhotoResult = { ok: true; photoVersion: string | null } | { ok: false; reason: 'not_allowed' | 'not_found' | 'storage_unavailable' | PhotoProblem };

export async function setStaffPhoto(db: Sql, storage: FileStorage, actor: ProfileActor, personId: string, bytes: Uint8Array, newId: () => string = () => randomUUID()): Promise<PhotoResult> {
  if (!mayEditStaffProfile(actor.role)) return { ok: false, reason: 'not_allowed' };
  // The key is written with the id as the database writes it (lower case), which its check holds.
  const staffId = personId.toLowerCase();
  const photo = checkStaffPhoto(bytes);
  if (!photo.ok) return { ok: false, reason: photo.reason };
  if (!(await isStaffHere(db, actor.schoolId, staffId))) return { ok: false, reason: 'not_found' };
  const before = (await db.query(`select photo_path from staff_profiles where school_id = $1 and user_id = $2 for update`, [actor.schoolId, staffId])).rows[0] as { photo_path: string | null } | undefined;
  // The new file first, under this school's prefix and this person's id.
  const key = `${actor.schoolId}/staff-photos/${staffId}-${newId()}.${photo.extension}`;
  try {
    await storage.put(key, bytes, photo.type);
  } catch (err) {
    if (err instanceof FileStorageUnavailableError) return { ok: false, reason: 'storage_unavailable' };
    throw err;
  }
  try {
    const row = (
      await db.query(
        `insert into staff_profiles (school_id, user_id, photo_path, updated_by) values ($1, $2, $3, $4)
         on conflict (school_id, user_id) do update set photo_path = excluded.photo_path, updated_by = excluded.updated_by
         returning updated_at`,
        [actor.schoolId, staffId, key, actor.userId]
      )
    ).rows[0];
    await writeAuditLog(db, {
      schoolId: actor.schoolId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      eventAction: 'staff_profile.photo_set',
      targetType: 'users',
      targetId: staffId,
      afterState: { created: !before, replaced: Boolean(before?.photo_path), photoType: photo.type, photoBytes: bytes.length, width: photo.width, height: photo.height },
    });
    if (before?.photo_path && before.photo_path !== key) await storage.remove(before.photo_path).catch(() => undefined);
    return { ok: true, photoVersion: versionOf(row.updated_at) };
  } catch (err) {
    await storage.remove(key).catch(() => undefined);
    throw err;
  }
}

export async function removeStaffPhoto(db: Sql, storage: FileStorage, actor: ProfileActor, staffId: string): Promise<PhotoResult> {
  if (!mayEditStaffProfile(actor.role)) return { ok: false, reason: 'not_allowed' };
  const before = (await db.query(`select photo_path from staff_profiles where school_id = $1 and user_id = $2 for update`, [actor.schoolId, staffId])).rows[0] as { photo_path: string | null } | undefined;
  if (!before?.photo_path) return { ok: true, photoVersion: null };
  await db.query(`update staff_profiles set photo_path = null, updated_by = $3 where school_id = $1 and user_id = $2`, [actor.schoolId, staffId, actor.userId]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'staff_profile.photo_removed', targetType: 'users', targetId: staffId, afterState: { removed: true } });
  await storage.remove(before.photo_path).catch(() => undefined);
  return { ok: true, photoVersion: null };
}

// The photo's bytes, for a person whose profile the caller may read (row level security decides: the office, or the
// person themself), or null when there is none or the store cannot give it now. Only a key of this school and this
// person is read; the type is the bytes' own.
export type StoredPhoto = { bytes: Uint8Array; type: PhotoType };
export async function readStaffPhoto(db: Sql, storage: FileStorage & { get(key: string): Promise<Uint8Array | null> }, schoolId: string, personId: string): Promise<StoredPhoto | null> {
  const staffId = personId.toLowerCase();
  const key = (await db.query(`select photo_path from staff_profiles where school_id = $1 and user_id = $2`, [schoolId, staffId])).rows[0]?.photo_path as string | null | undefined;
  if (!key || !key.startsWith(`${schoolId}/staff-photos/${staffId}-`)) return null;
  let bytes: Uint8Array | null = null;
  try {
    bytes = await storage.get(key);
  } catch {
    return null;
  }
  const type = bytes ? sniffImageType(bytes) : null;
  return bytes && type ? { bytes, type } : null;
}
