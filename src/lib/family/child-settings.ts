// W19-C: the child's own settings, one small object per child (family.child_settings), changed on /family/settings
// behind the family session only. Parent-only things stay in the parent area. Pure parts (the shape, the defaults, the
// merge) run anywhere; the server parts take a family-context db; `readChildSettings` is the client helper the other
// screens read (the read-aloud, the tutor's face, the voice screens). The language is not here: it stays on the child
// and changes through the existing language switch.

import { isLangCode, type LangCode } from './languages';

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

export type VoiceSpeed = 'slow' | 'normal';
export type ChildSettings = {
  readAloud: boolean; // the tutor's answers and the lesson read aloud
  tutorFace: boolean; // the tutor's face beside its answers
  motion: boolean; // the app's motion (off is the same as the phone's reduced motion)
  handsFree: boolean; // listening again after the tutor speaks, without a tap
  voiceSpeed: VoiceSpeed; // how fast the tutor's voice speaks
  // w23-b begin
  wordHelp: boolean; // the tap menu's meaning and translation of a word or sentence
  tapToRead: boolean; // a tapped word or sentence is spoken
  autoScroll: boolean; // the reader scrolls to follow the voice
  meaningLang: LangCode | null; // the language meanings and translations are shown in; null follows the app's language
  // w23-b end
};
export const CHILD_SETTING_KEYS = ['readAloud', 'tutorFace', 'motion', 'handsFree', 'voiceSpeed', 'wordHelp', 'tapToRead', 'autoScroll', 'meaningLang'] as const;
export type ChildSettingKey = (typeof CHILD_SETTING_KEYS)[number];
export const DEFAULT_CHILD_SETTINGS: ChildSettings = { readAloud: true, tutorFace: true, motion: true, handsFree: false, voiceSpeed: 'normal', wordHelp: true, tapToRead: true, autoScroll: true, meaningLang: null };

const SWITCHES = ['readAloud', 'tutorFace', 'motion', 'handsFree', 'wordHelp', 'tapToRead', 'autoScroll'] as const;
type SwitchKey = (typeof SWITCHES)[number];
const SPEEDS: readonly VoiceSpeed[] = ['slow', 'normal'];

// A stored or sent object read into whole settings: every known key kept only when it has its shape, the rest default.
export function parseChildSettings(v: unknown): ChildSettings {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const out: ChildSettings = { ...DEFAULT_CHILD_SETTINGS };
  for (const k of SWITCHES) if (typeof o[k] === 'boolean') out[k] = o[k] as boolean;
  if (SPEEDS.includes(o.voiceSpeed as VoiceSpeed)) out.voiceSpeed = o.voiceSpeed as VoiceSpeed;
  if (isLangCode(o.meaningLang)) out.meaningLang = o.meaningLang;
  return out;
}

// The language meanings are shown in: the child's choice, else the app's language.
export const meaningLangOf = (s: Pick<ChildSettings, 'meaningLang'>, appLang: LangCode): LangCode => s.meaningLang ?? appLang;

// A change from the phone: only known keys with their shape; anything else (or nothing) is refused.
export function checkSettingsPatch(v: unknown): Partial<ChildSettings> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length === 0 || keys.some((k) => !(CHILD_SETTING_KEYS as readonly string[]).includes(k))) return null;
  const out: Partial<ChildSettings> = {};
  for (const k of keys) {
    if (k === 'voiceSpeed') {
      if (!SPEEDS.includes(o.voiceSpeed as VoiceSpeed)) return null;
      out.voiceSpeed = o.voiceSpeed as VoiceSpeed;
    } else if (k === 'meaningLang') {
      // null puts it back to following the app's language.
      if (o.meaningLang !== null && !isLangCode(o.meaningLang)) return null;
      out.meaningLang = o.meaningLang as LangCode | null;
    } else {
      if (typeof o[k] !== 'boolean') return null;
      out[k as SwitchKey] = o[k] as boolean;
    }
  }
  return out;
}

// ---- server ---------------------------------------------------------------------------------------------------------

export async function loadChildSettings(db: Db, accountId: string, childId: string): Promise<ChildSettings> {
  const { rows } = await db.query(`select settings from family.child_settings where account_id = $1 and child_id = $2`, [accountId, childId]);
  return parseChildSettings(rows[0]?.settings);
}

// Writes a checked change on one of this account's children; 'not_found' for a child the account does not have.
export async function saveChildSettings(db: Db, accountId: string, childId: string, patch: Partial<ChildSettings>): Promise<ChildSettings | 'not_found'> {
  const own = await db.query(`select 1 from family.children where account_id = $1 and child_id = $2`, [accountId, childId]);
  if (!own.rows.length) return 'not_found';
  const next = { ...(await loadChildSettings(db, accountId, childId)), ...patch };
  await db.query(
    `insert into family.child_settings (account_id, child_id, settings) values ($1, $2, $3::jsonb)
     on conflict (child_id) do update set settings = excluded.settings, updated_at = now() where family.child_settings.account_id = excluded.account_id`,
    [accountId, childId, JSON.stringify(next)]
  );
  return next;
}

// ---- client ---------------------------------------------------------------------------------------------------------

let cached: Promise<ChildSettings> | null = null;
// The settings as last read on this page (null until the first read finishes): the follow-the-voice scrolls check
// `autoScroll` synchronously (W23).
let last: ChildSettings | null = null;
export const lastChildSettings = (): ChildSettings | null => last;

// The active child's settings for a client screen: read once per page load from /api/family/settings (the defaults
// when it cannot be read, so a screen never waits on it). `fresh` reads again.
export function readChildSettings(fresh = false): Promise<ChildSettings> {
  if (!cached || fresh) {
    cached = fetch('/api/family/settings', { credentials: 'same-origin' })
      .then(async (r) => (r.ok ? parseChildSettings(((await r.json()) as { settings?: unknown }).settings) : { ...DEFAULT_CHILD_SETTINGS }))
      .catch(() => ({ ...DEFAULT_CHILD_SETTINGS }))
      .then((s) => (last = s));
  }
  return cached;
}

// Called by the Settings screen after a save, so the next read on this page sees it.
export function primeChildSettings(s: ChildSettings) {
  last = s;
  cached = Promise.resolve(s);
}
