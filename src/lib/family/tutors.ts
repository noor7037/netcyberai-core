import type { PoolClient } from 'pg';
import type { LessonTint } from '@/lib/design-tokens';
import type { Lang } from '@/lib/i18n';
import { isSubject, type Subject } from './subjects';
import { activeLinks, schoolTutorsFor } from './school';
import type { FamilyClaims } from './db';
import type { Persona, PersonaLanguage } from './persona';

// The Tutor Hall's data (W16-A3): the platform's tutors (content.tutors, read as the family role), and the tutors of the
// schools the family is linked to (src/lib/family/school.ts: read as the guardian, only after School Link pairing and
// with a consented child). A tutor is keyed `<platform key>` or `school:<school tutor id>`; the key travels in the URL
// (?tutor=) and is kept on the chat (family.tutor_conversations.tutor_key). Nothing here holds a child's data.

type Db = Pick<PoolClient, 'query'>;

export type TutorCard = {
  key: string;
  subject: Subject | null; // null: all subjects
  name: string; // in the reader's language
  style: string;
  language: PersonaLanguage;
  tint: LessonTint;
  avatar: string; // the platform tutor's avatar key; a school's tutor wears its subject
  persona: Persona; // what the system prompt is told (English words for a platform tutor)
};
export type TutorGroup = { school: string | null; tutors: TutorCard[] };

const TINTS: readonly LessonTint[] = ['mint', 'butter', 'lilac', 'blush', 'sky'];
const tintOf = (v: unknown): LessonTint => (TINTS as readonly unknown[]).includes(v) ? (v as LessonTint) : 'mint';
const languageOf = (v: unknown): PersonaLanguage => (v === 'en' || v === 'hi' ? v : 'both');
const KEY = /^([a-z][a-z0-9_]{1,39}|school:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export const isTutorKey = (v: unknown): v is string => typeof v === 'string' && KEY.test(v);

// The platform's enabled tutors, in their order.
export async function readPlatformTutors(db: Db, lang: Lang): Promise<TutorCard[]> {
  const { rows } = await db.query(`select key, subject, name_en, name_hi, style_en, style_hi, language, tint, avatar_key from content.tutors where enabled order by sort, key`);
  return (rows as Record<string, unknown>[]).map((r) => ({
    key: String(r.key),
    subject: isSubject(r.subject) ? r.subject : null,
    name: String(lang === 'hi' ? r.name_hi : r.name_en),
    style: String(lang === 'hi' ? r.style_hi : r.style_en),
    language: languageOf(r.language),
    tint: tintOf(r.tint),
    avatar: String(r.avatar_key),
    persona: { name: String(r.name_en), style: String(r.style_en), language: languageOf(r.language) },
  }));
}

type Read = <T>(fn: (db: PoolClient) => Promise<T>) => Promise<T>;

// The whole Hall for a family: the platform's tutors (less those a linked school switched off), then one group a linked
// school that has tutors of its own. `read` runs a callback in the family's transaction (a page's familyPageRead, a route's
// withFamilyContext); the school's part is read after it, one connection at a time.
export async function loadHall(claims: FamilyClaims, read: Read, accountId: string, lang: Lang): Promise<TutorGroup[]> {
  const [platform, links] = await read((db) => Promise.all([readPlatformTutors(db, lang), activeLinks(db, accountId)]));
  const schools = links.length ? await schoolTutorsFor(claims, links) : [];
  const hidden = new Set(schools.flatMap((s) => s.hiddenPlatform));
  const groups: TutorGroup[] = [{ school: null, tutors: platform.filter((t) => !hidden.has(t.key)) }];
  for (const s of schools) {
    if (!s.tutors.length) continue;
    groups.push({
      school: s.schoolName,
      tutors: s.tutors.map((t) => ({
        key: `school:${t.id}`,
        subject: isSubject(t.subject) ? t.subject : null,
        name: t.name,
        style: t.style,
        language: t.language,
        tint: tintOf(t.tint),
        avatar: 'school',
        persona: { name: t.name, style: t.style, language: t.language },
      })),
    });
  }
  return groups.filter((g) => g.tutors.length > 0);
}

export const findTutor = (hall: readonly TutorGroup[], key: unknown): TutorCard | null => (isTutorKey(key) ? (hall.flatMap((g) => g.tutors).find((t) => t.key === key) ?? null) : null);

// The persona of one tutor key, for a question being asked (the Understand route): a platform tutor from the library alone,
// a school's tutor through the Hall (only a linked, consented family sees one). null when the tutor is gone, switched off
// for the family, or never was: the question is answered without a persona.
export async function resolvePersona(claims: FamilyClaims, read: Read, accountId: string, key: unknown): Promise<Persona | null> {
  if (!isTutorKey(key)) return null;
  if (!key.startsWith('school:')) return (await read((db) => readPlatformTutors(db, 'en'))).find((t) => t.key === key)?.persona ?? null;
  return findTutor(await loadHall(claims, read, accountId, 'en'), key)?.persona ?? null;
}
