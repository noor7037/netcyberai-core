import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { SessionRole } from '@/lib/auth/types';

// Control → Family → People (C230-V): the people who use the Family app, so NetCyberAI can serve them and, where a
// parent agreed, tell them about offers. Read through family.control_accounts(), Control's one door to the people (as
// family.control_counts() is to the numbers; the platform role holds no right on a family table). The founder only,
// with the authenticator (the page checks aal2); every read is audited with what was asked and which accounts were
// shown. This reader keeps only the fields named here, each of the right type, so nothing else the function might one
// day return can reach the screen. Never an answer, a photo, a recording, a PIN or a session.

type Sql = Pick<PoolClient, 'query'>;

export const PEOPLE_PAGE_SIZE = 50;
export const PEOPLE_VIEWED_ACTION = 'family.people_viewed';

export type FamilyPersonChild = { firstName: string; classLevel: number; board: string; language: string; freeSubject: string | null };
export type FamilyPerson = {
  accountId: string;
  email: string;
  language: string;
  joinedAt: string;
  lastSignInAt: string | null;
  hasPin: boolean;
  children: FamilyPersonChild[];
  // The latest answer per consent purpose; a purpose never answered is absent (not given).
  consents: Record<string, boolean>;
  answers7d: number;
  lastAnsweredOn: string | null;
  preview: boolean;
};
export type FamilyPeople = { total: number; rows: FamilyPerson[] };
export type PeopleQuery = { query: string; offersOnly: boolean; page: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};
const when = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const day = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function readChild(raw: unknown): FamilyPersonChild | null {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const firstName = str(c.first_name, 80);
  const classLevel = Number(c.class_level);
  if (!firstName || !Number.isInteger(classLevel) || classLevel < -2 || classLevel > 14) return null;
  return { firstName, classLevel, board: str(c.board_id, 40) ?? '', language: str(c.language, 8) ?? '', freeSubject: str(c.free_subject, 40) };
}

function readPerson(raw: unknown): FamilyPerson | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const accountId = str(r.account_id, 36);
  const email = str(r.email, 320);
  const joinedAt = when(r.created_at);
  if (!accountId || !UUID.test(accountId) || !email || !joinedAt) return null;
  const consents: Record<string, boolean> = {};
  if (r.consents && typeof r.consents === 'object') {
    for (const [k, v] of Object.entries(r.consents as Record<string, unknown>)) if (/^[a-z_]{2,40}$/.test(k) && typeof v === 'boolean') consents[k] = v;
  }
  return {
    accountId,
    email,
    language: str(r.ui_language, 8) ?? '',
    joinedAt,
    lastSignInAt: when(r.last_sign_in_at),
    hasPin: r.has_pin === true,
    children: (Array.isArray(r.children) ? r.children : []).map(readChild).filter((c): c is FamilyPersonChild => c !== null),
    consents,
    answers7d: num(r.answers_7d),
    lastAnsweredOn: day(r.last_answered_on),
    preview: r.preview === true,
  };
}

export function readFamilyPeople(raw: unknown): FamilyPeople {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { total: num(r.total), rows: (Array.isArray(r.rows) ? r.rows : []).map(readPerson).filter((p): p is FamilyPerson => p !== null) };
}

// The page's query string, cleaned: a search of at most 100 characters, "offers only", and a page from 1.
export function parsePeopleQuery(params: { q?: string | string[]; offers?: string | string[]; page?: string | string[] }): PeopleQuery {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const page = Math.floor(Number(one(params.page)));
  return { query: one(params.q).trim().slice(0, 100), offersOnly: one(params.offers) === '1', page: Number.isFinite(page) && page >= 1 && page <= 10_000 ? page : 1 };
}

// One page of people, read and audited in the caller's transaction (the founder's session, as the platform role). The
// audit row says what was asked and which accounts were shown (ids only), so any look at a family's details is on record.
export async function loadFamilyPeople(db: Sql, actor: { userId: string; role: SessionRole }, q: PeopleQuery): Promise<FamilyPeople> {
  const { rows } = await db.query(`select family.control_accounts($1, $2, $3, $4) as people`, [q.query || null, q.offersOnly, PEOPLE_PAGE_SIZE, (q.page - 1) * PEOPLE_PAGE_SIZE]);
  const people = readFamilyPeople(rows[0]?.people);
  await writeAuditLog(db, {
    schoolId: null,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: PEOPLE_VIEWED_ACTION,
    targetType: 'family.accounts',
    afterState: { query: q.query || null, offers_only: q.offersOnly, page: q.page, total: people.total, shown: people.rows.map((p) => p.accountId) },
  });
  return people;
}
